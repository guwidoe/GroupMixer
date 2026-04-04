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
use crate::solver_support::SolverError;

use super::compiled_problem::CompiledProblem;
use super::scoring::recompute::recompute_oracle_score;

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
    /// 3. Places cliques, immovable people, and remaining participants deterministically.
    /// 4. Builds flat derived arrays.
    /// 5. Runs the oracle to set initial score aggregates.
    pub fn from_input(input: &ApiInput) -> Result<Self, SolverError> {
        let compiled = Arc::new(CompiledProblem::compile(input)?);
        Self::from_compiled(compiled)
    }

    /// Builds a `RuntimeState` from a pre-compiled problem.
    pub fn from_compiled(compiled: Arc<CompiledProblem>) -> Result<Self, SolverError> {
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

        state.initialize_from_schedule()?;
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
    // Capacity helpers
    // ------------------------------------------------------------------

    #[inline]
    fn available_capacity(&self, session_idx: usize, group_idx: usize) -> usize {
        let cap = self.compiled.group_capacity(session_idx, group_idx);
        cap.saturating_sub(self.group_sizes[self.group_slot(session_idx, group_idx)])
    }

    fn first_group_with_capacity(&self, session_idx: usize, required: usize) -> Option<usize> {
        (0..self.compiled.num_groups).find(|&g| self.available_capacity(session_idx, g) >= required)
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

    fn initialize_from_schedule(&mut self) -> Result<(), SolverError> {
        // Seed from initial_schedule if provided.
        if let Some(sched) = self.compiled.compiled_initial_schedule.clone() {
            for (sidx, groups) in sched.iter().enumerate() {
                for (gidx, members) in groups.iter().enumerate() {
                    for &pidx in members {
                        self.place_person(sidx, gidx, pidx)?;
                    }
                }
            }
        }

        // Fill remaining slots deterministically.
        for sidx in 0..self.compiled.num_sessions {
            self.place_cliques_for_session(sidx)?;
            self.place_immovable_for_session(sidx)?;
            self.place_remaining_for_session(sidx)?;
        }

        Ok(())
    }

    fn place_cliques_for_session(&mut self, session_idx: usize) -> Result<(), SolverError> {
        let cliques = self.compiled.cliques.clone();
        for clique in &cliques {
            let active = match &clique.sessions {
                Some(sessions) => sessions.contains(&session_idx),
                None => true,
            };
            if !active {
                continue;
            }

            let participating = clique
                .members
                .iter()
                .copied()
                .filter(|&m| self.compiled.person_participation[m][session_idx])
                .collect::<Vec<_>>();
            if participating.len() < 2 {
                continue;
            }

            // Find groups already assigned to any member.
            let mut assigned_groups = participating
                .iter()
                .filter_map(|&m| self.person_location[self.people_slot(session_idx, m)])
                .collect::<Vec<_>>();
            assigned_groups.sort_unstable();
            assigned_groups.dedup();

            let unplaced: Vec<usize> = participating
                .iter()
                .copied()
                .filter(|&m| self.person_location[self.people_slot(session_idx, m)].is_none())
                .collect();

            if unplaced.is_empty() {
                continue;
            }

            let target_group = if assigned_groups.len() == 1 {
                // Existing members are in one group — place the rest there.
                assigned_groups[0]
            } else if assigned_groups.len() > 1 {
                // Split across multiple groups — skip; validation will catch this.
                continue;
            } else {
                // No member placed yet — find a suitable group.
                let required = unplaced.len();

                // Prefer a group that has an immovable assignment for any member.
                let immovable_group = participating.iter().find_map(|&m| {
                    self.compiled
                        .immovable_lookup
                        .get(&(m, session_idx))
                        .copied()
                });

                if let Some(gidx) = immovable_group {
                    let avail = self.available_capacity(session_idx, gidx);
                    if avail < required {
                        return Err(SolverError::ValidationError(format!(
                            "cannot place clique of {} into required group '{}' in session {} (capacity {})",
                            required,
                            self.compiled.display_group(gidx),
                            session_idx,
                            avail
                        )));
                    }
                    gidx
                } else {
                    self.first_group_with_capacity(session_idx, required)
                        .ok_or_else(|| {
                            SolverError::ValidationError(format!(
                                "no group has room for a clique of {} in session {}",
                                required, session_idx
                            ))
                        })?
                }
            };

            if self.available_capacity(session_idx, target_group) < unplaced.len() {
                continue;
            }

            for pidx in unplaced {
                self.place_person(session_idx, target_group, pidx)?;
            }
        }

        Ok(())
    }

    fn place_immovable_for_session(&mut self, session_idx: usize) -> Result<(), SolverError> {
        let assignments = self
            .compiled
            .immovable_assignments
            .iter()
            .filter(|a| a.session_idx == session_idx)
            .cloned()
            .collect::<Vec<_>>();

        for a in assignments {
            if !self.compiled.person_participation[a.person_idx][session_idx] {
                continue;
            }
            let ps = self.people_slot(session_idx, a.person_idx);
            if self.person_location[ps].is_some() {
                continue;
            }
            self.place_person(session_idx, a.group_idx, a.person_idx)?;
        }

        Ok(())
    }

    fn place_remaining_for_session(&mut self, session_idx: usize) -> Result<(), SolverError> {
        for pidx in 0..self.compiled.num_people {
            if !self.compiled.person_participation[pidx][session_idx] {
                continue;
            }
            let ps = self.people_slot(session_idx, pidx);
            if self.person_location[ps].is_some() {
                continue;
            }
            let gidx = self
                .first_group_with_capacity(session_idx, 1)
                .ok_or_else(|| {
                    SolverError::ValidationError(format!(
                        "no capacity remaining for person '{}' in session {}",
                        self.compiled.display_person(pidx),
                        session_idx
                    ))
                })?;
            self.place_person(session_idx, gidx, pidx)?;
        }

        Ok(())
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
