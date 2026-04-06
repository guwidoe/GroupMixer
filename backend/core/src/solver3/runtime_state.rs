//! Flat dense runtime state for the `solver3` family.
//!
//! The `RuntimeState` owns all mutable data needed by the search loop.
//! Every layout decision is made to keep hot-path access patterns contiguous:
//!
//! - `person_location`: flat `[session * num_people + person] -> Option<group_idx>`.
//!   No position-within-group tracking, which avoids maintaining ordered member lists.
//! - `group_members`: flat `[session * num_groups + group] -> Vec<person_idx>`.
//!   Per-slot `Vec` for iteration; swap_remove enables O(1) removal without
//!   preserving order.
//! - `group_sizes`: flat `[session * num_groups + group]` mirrors `group_members.len()`.
//!   Kept separately so size checks avoid iterating the member vector.
//! - `pair_contacts`: contiguous `[pair_idx(a,b)] -> u16`.
//!   One counter per pair across all sessions; updated by move kernels in Phase 3+.
//!
//! Score aggregates are set once during initialization by the oracle and will be
//! maintained incrementally by Phase 3 move kernels.

use std::sync::Arc;

use std::collections::HashMap;

use crate::models::ApiInput;
use crate::solver_support::construction::{
    apply_baseline_construction_heuristic, BaselineConstructionContext,
};
use crate::solver_support::SolverError;

use super::compiled_problem::{CompiledProblem, PackedSchedule};
use super::oracle::maybe_cross_check_runtime_state;
use super::scoring::recompute::recompute_oracle_score;

const DEFAULT_BASELINE_CONSTRUCTION_SEED: u64 = 42;

// ---------------------------------------------------------------------------
// RuntimeState
// ---------------------------------------------------------------------------

/// Flat, dense runtime state for `solver3`.
///
/// Owns an `Arc<CompiledProblem>` so multiple state snapshots can share the
/// immutable compiled data without duplication.
#[derive(Debug, Clone)]
pub struct RuntimeState {
    /// Shared immutable compiled problem.
    pub compiled: Arc<CompiledProblem>,

    // ------------------------------------------------------------------
    // Flat dense arrays
    // ------------------------------------------------------------------
    /// `[session_idx * num_people + person_idx] -> Option<group_idx>`.
    ///
    /// `None` for non-participating people in a session.
    pub person_location: Vec<Option<usize>>,

    /// `[session_idx * num_groups + group_idx] -> Vec<person_idx>`.
    ///
    /// Order within each slot is not semantically meaningful; swap_remove is safe.
    pub group_members: Vec<Vec<usize>>,

    /// `[session_idx * num_groups + group_idx]` — mirrors `group_members[slot].len()`.
    pub group_sizes: Vec<usize>,

    /// `[pair_idx(a, b)] -> total co-occurrence count across all sessions`.
    pub pair_contacts: Vec<u16>,

    // ------------------------------------------------------------------
    // Score aggregates (oracle-initialized; maintained by move kernels later)
    // ------------------------------------------------------------------
    pub unique_contacts: u32,
    pub repetition_penalty_raw: i32,
    pub weighted_repetition_penalty: f64,
    pub attribute_balance_penalty: f64,
    pub constraint_penalty_weighted: f64,
    pub total_score: f64,
}

impl RuntimeState {
    /// Builds a `RuntimeState` from an `ApiInput`.
    ///
    /// 1. Compiles the `CompiledProblem`.
    /// 2. Seeds the schedule from `initial_schedule` if present.
    /// 3. Applies the shared baseline construction heuristic (seeded) to fill remaining slots.
    /// 4. Builds flat derived arrays.
    /// 5. Runs the oracle to set initial score aggregates.
    ///
    pub fn from_input(input: &ApiInput) -> Result<Self, SolverError> {
        let compiled = Arc::new(CompiledProblem::compile(input)?);
        let effective_seed = input
            .solver
            .seed
            .unwrap_or(DEFAULT_BASELINE_CONSTRUCTION_SEED);
        Self::from_compiled_with_seed(compiled, effective_seed)
    }

    /// Builds a `RuntimeState` from a pre-compiled problem.
    pub fn from_compiled(compiled: Arc<CompiledProblem>) -> Result<Self, SolverError> {
        Self::from_compiled_with_seed(compiled, DEFAULT_BASELINE_CONSTRUCTION_SEED)
    }

    fn from_compiled_with_seed(
        compiled: Arc<CompiledProblem>,
        effective_seed: u64,
    ) -> Result<Self, SolverError> {
        let np = compiled.num_people;
        let ng = compiled.num_groups;
        let ns = compiled.num_sessions;

        // Allocate flat arrays.
        let person_location = vec![None::<usize>; ns * np];
        let group_members = vec![Vec::new(); ns * ng];
        let group_sizes = vec![0usize; ns * ng];
        let pair_contacts = vec![0u16; compiled.num_pairs];

        let mut state = Self {
            compiled,
            person_location,
            group_members,
            group_sizes,
            pair_contacts,
            unique_contacts: 0,
            repetition_penalty_raw: 0,
            weighted_repetition_penalty: 0.0,
            attribute_balance_penalty: 0.0,
            constraint_penalty_weighted: 0.0,
            total_score: 0.0,
        };

        state.initialize_from_schedule(effective_seed)?;
        state.rebuild_pair_contacts();
        state.sync_score_from_oracle()?;
        Ok(state)
    }

    // ------------------------------------------------------------------
    // Flat index helpers
    // ------------------------------------------------------------------

    /// `session_idx * num_people + person_idx`.
    #[inline]
    pub fn people_slot(&self, session_idx: usize, person_idx: usize) -> usize {
        session_idx * self.compiled.num_people + person_idx
    }

    /// `session_idx * num_groups + group_idx`.
    #[inline]
    pub fn group_slot(&self, session_idx: usize, group_idx: usize) -> usize {
        session_idx * self.compiled.num_groups + group_idx
    }

    // ------------------------------------------------------------------
    // Low-level placement
    // ------------------------------------------------------------------

    fn place_person(
        &mut self,
        session_idx: usize,
        group_idx: usize,
        person_idx: usize,
    ) -> Result<(), SolverError> {
        let ps = self.people_slot(session_idx, person_idx);
        if self.person_location[ps].is_some() {
            return Err(SolverError::ValidationError(format!(
                "person '{}' is already placed in session {}",
                self.compiled.display_person(person_idx),
                session_idx
            )));
        }
        if !self.compiled.person_participation[person_idx][session_idx] {
            return Err(SolverError::ValidationError(format!(
                "person '{}' does not participate in session {}",
                self.compiled.display_person(person_idx),
                session_idx
            )));
        }
        let cap = self.compiled.group_capacity(session_idx, group_idx);
        let gs = self.group_slot(session_idx, group_idx);
        if self.group_sizes[gs] >= cap {
            return Err(SolverError::ValidationError(format!(
                "group '{}' is at capacity in session {}",
                self.compiled.display_group(group_idx),
                session_idx
            )));
        }
        self.person_location[ps] = Some(group_idx);
        self.group_members[gs].push(person_idx);
        self.group_sizes[gs] += 1;
        Ok(())
    }

    // ------------------------------------------------------------------
    // Deterministic initialization
    // ------------------------------------------------------------------

    fn initialize_from_schedule(&mut self, effective_seed: u64) -> Result<(), SolverError> {
        let schedule = self.build_baseline_schedule(effective_seed)?;

        for (sidx, groups) in schedule.iter().enumerate() {
            for (gidx, members) in groups.iter().enumerate() {
                for &pidx in members {
                    self.place_person(sidx, gidx, pidx)?;
                }
            }
        }

        Ok(())
    }

    fn build_baseline_schedule(&self, effective_seed: u64) -> Result<PackedSchedule, SolverError> {
        let mut schedule = self
            .compiled
            .compiled_initial_schedule
            .clone()
            .unwrap_or_else(|| {
                vec![vec![Vec::new(); self.compiled.num_groups]; self.compiled.num_sessions]
            });

        let cliques = self
            .compiled
            .cliques
            .iter()
            .map(|clique| clique.members.clone())
            .collect::<Vec<_>>();
        let clique_sessions = self
            .compiled
            .cliques
            .iter()
            .map(|clique| clique.sessions.clone())
            .collect::<Vec<_>>();
        let person_attributes = self
            .compiled
            .person_attribute_value_indices
            .iter()
            .map(|attrs| {
                attrs
                    .iter()
                    .map(|value_idx| value_idx.unwrap_or(usize::MAX))
                    .collect::<Vec<_>>()
            })
            .collect::<Vec<_>>();

        let mut construction_context = BaselineConstructionContext {
            effective_seed,
            num_sessions: self.compiled.num_sessions,
            group_id_to_idx: &self.compiled.group_id_to_idx,
            group_idx_to_id: &self.compiled.group_idx_to_id,
            person_id_to_idx: &self.compiled.person_id_to_idx,
            person_idx_to_id: &self.compiled.person_idx_to_id,
            attr_key_to_idx: &self.compiled.attr_key_to_idx,
            person_attributes: &person_attributes,
            attr_idx_to_val: &self.compiled.attr_idx_to_val,
            effective_group_capacities: &self.compiled.effective_group_capacities,
            person_participation: &self.compiled.person_participation,
            immovable_people: &self.compiled.immovable_lookup,
            cliques: &cliques,
            clique_sessions: &clique_sessions,
            schedule: &mut schedule,
        };

        apply_baseline_construction_heuristic(&mut construction_context)?;
        Ok(schedule)
    }

    // ------------------------------------------------------------------
    // Derived state construction
    // ------------------------------------------------------------------

    /// Rebuilds `pair_contacts` from current `group_members` across all sessions.
    ///
    /// Called once after initialization; in Phase 3 move kernels will maintain it
    /// incrementally instead.
    pub fn rebuild_pair_contacts(&mut self) {
        if self.compiled.num_pairs == 0 {
            return;
        }
        // Reset.
        for c in &mut self.pair_contacts {
            *c = 0;
        }
        for sidx in 0..self.compiled.num_sessions {
            for gidx in 0..self.compiled.num_groups {
                let gs = self.group_slot(sidx, gidx);
                let members = &self.group_members[gs];
                for li in 0..members.len() {
                    for ri in (li + 1)..members.len() {
                        let a = members[li];
                        let b = members[ri];
                        // Only count pairs where both actually participate.
                        if self.compiled.person_participation[a][sidx]
                            && self.compiled.person_participation[b][sidx]
                        {
                            let pidx = self.compiled.pair_idx(a, b);
                            self.pair_contacts[pidx] = self.pair_contacts[pidx].saturating_add(1);
                        }
                    }
                }
            }
        }
    }

    /// Runs a full oracle recompute and copies all score aggregates into `self`.
    ///
    /// Used once during initialization. Phase 3 move kernels will maintain aggregates
    /// incrementally and call this only for drift-check samples.
    pub fn sync_score_from_oracle(&mut self) -> Result<(), SolverError> {
        let score = recompute_oracle_score(self)?;
        self.unique_contacts = score.unique_contacts;
        self.repetition_penalty_raw = score.repetition_penalty_raw;
        self.weighted_repetition_penalty = score.weighted_repetition_penalty;
        self.attribute_balance_penalty = score.attribute_balance_penalty;
        self.constraint_penalty_weighted = score.constraint_penalty_weighted;
        self.total_score = score.total_score;
        maybe_cross_check_runtime_state(self, "runtime state initialization")?;
        Ok(())
    }

    /// Converts the flat runtime state back into the API schedule shape.
    pub fn to_api_schedule(&self) -> HashMap<String, HashMap<String, Vec<String>>> {
        let mut schedule = HashMap::new();

        for session_idx in 0..self.compiled.num_sessions {
            let mut groups = HashMap::new();

            for group_idx in 0..self.compiled.num_groups {
                let slot = self.group_slot(session_idx, group_idx);
                let members = self.group_members[slot]
                    .iter()
                    .map(|&person_idx| self.compiled.person_idx_to_id[person_idx].clone())
                    .collect::<Vec<_>>();

                groups.insert(self.compiled.group_idx_to_id[group_idx].clone(), members);
            }

            schedule.insert(format!("session_{session_idx}"), groups);
        }

        schedule
    }
}
