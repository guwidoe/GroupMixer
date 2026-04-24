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

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use crate::models::ApiInput;
use crate::models::Solver3ConstructionMode;
use crate::solver_support::construction::{
    apply_baseline_construction_heuristic, apply_freedom_aware_construction_heuristic,
    BaselineConstructionContext, FreedomAwareConstructionParams,
};
use crate::solver_support::validation::{
    validate_schedule_as_incumbent, validate_schedule_input_mode,
};
use crate::solver_support::SolverError;
use rand::seq::SliceRandom;
use rand::SeedableRng;
use rand_chacha::ChaCha12Rng;

use super::compiled_problem::{CompiledProblem, PackedSchedule};
use super::construction::constraint_scenario_oracle::{
    build_constraint_scenario_ensemble, build_constraint_scenario_scaffold_mask,
    constraint_scenario_score, extract_constraint_scenario_signals,
    merge_relabelled_oracle_into_scaffold, relabel_oracle_schedule_to_block,
    repeat_pressure_is_relevant, select_oracleizable_flexible_block, ConstraintScenarioCandidate,
    ConstraintScenarioCandidateSource, ConstraintScenarioOracleConstructionResult,
    ConstraintScenarioOracleOutcomeKind, ConstraintScenarioOracleTelemetry, PureStructureOracle,
    PureStructureOracleRequest, Solver6PureStructureOracle, DEFAULT_CONSTRAINT_SCENARIO_RUNS,
};
use super::oracle::maybe_cross_check_runtime_state;
use super::scoring::recompute::recompute_oracle_score;
use super::validation::validate_invariants;

const DEFAULT_BASELINE_CONSTRUCTION_SEED: u64 = 42;

#[derive(Debug, Clone, Copy)]
enum ConstructionHeuristicSelection {
    BaselineLegacy,
    FreedomAwareRandomized(FreedomAwareConstructionParams),
    ConstraintScenarioOracleGuided,
}

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
    /// 2. Loads `initial_schedule` directly if present, otherwise starts from `construction_seed_schedule` if present.
    /// 3. Applies the selected shared construction heuristic (seeded) to fill remaining slots.
    /// 4. Builds flat derived arrays.
    /// 5. Runs the oracle to set initial score aggregates.
    ///
    pub fn from_input(input: &ApiInput) -> Result<Self, SolverError> {
        validate_schedule_input_mode(input)?;
        let compiled = Arc::new(CompiledProblem::compile(input)?);
        let effective_seed = input
            .solver
            .seed
            .unwrap_or(DEFAULT_BASELINE_CONSTRUCTION_SEED);
        if let Some(initial_schedule) = &input.initial_schedule {
            let validated = validate_schedule_as_incumbent(input, initial_schedule)?;
            return Self::from_compiled_schedule(compiled, validated.schedule);
        }
        let construction = resolve_construction_selection(input)?;
        Self::from_compiled_with_seed_and_construction(compiled, effective_seed, construction)
    }

    /// Builds a `RuntimeState` from a pre-compiled problem.
    pub fn from_compiled(compiled: Arc<CompiledProblem>) -> Result<Self, SolverError> {
        Self::from_compiled_with_seed_and_construction(
            compiled,
            DEFAULT_BASELINE_CONSTRUCTION_SEED,
            ConstructionHeuristicSelection::BaselineLegacy,
        )
    }

    pub(crate) fn from_compiled_with_seed(
        compiled: Arc<CompiledProblem>,
        effective_seed: u64,
    ) -> Result<Self, SolverError> {
        Self::from_compiled_with_seed_and_construction(
            compiled,
            effective_seed,
            ConstructionHeuristicSelection::BaselineLegacy,
        )
    }

    fn from_compiled_with_seed_and_construction(
        compiled: Arc<CompiledProblem>,
        effective_seed: u64,
        construction: ConstructionHeuristicSelection,
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

        state.initialize_from_schedule(effective_seed, construction)?;
        validate_invariants(&state)?;
        state.rebuild_pair_contacts();
        state.sync_score_from_oracle()?;
        Ok(state)
    }

    fn from_compiled_schedule(
        compiled: Arc<CompiledProblem>,
        schedule: PackedSchedule,
    ) -> Result<Self, SolverError> {
        let np = compiled.num_people;
        let ng = compiled.num_groups;
        let ns = compiled.num_sessions;

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

        state.load_exact_schedule(&schedule)?;
        validate_invariants(&state)?;
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

    fn initialize_from_schedule(
        &mut self,
        effective_seed: u64,
        construction: ConstructionHeuristicSelection,
    ) -> Result<(), SolverError> {
        let schedule = self.build_constructed_schedule(effective_seed, construction)?;

        self.load_exact_schedule(&schedule)?;

        Ok(())
    }

    fn load_exact_schedule(&mut self, schedule: &PackedSchedule) -> Result<(), SolverError> {
        for (sidx, groups) in schedule.iter().enumerate() {
            for (gidx, members) in groups.iter().enumerate() {
                for &pidx in members {
                    self.place_person(sidx, gidx, pidx)?;
                }
            }
        }

        Ok(())
    }

    fn build_constructed_schedule(
        &self,
        effective_seed: u64,
        construction: ConstructionHeuristicSelection,
    ) -> Result<PackedSchedule, SolverError> {
        if matches!(
            construction,
            ConstructionHeuristicSelection::ConstraintScenarioOracleGuided
        ) {
            let mut schedule = self
                .build_constraint_scenario_oracle_guided_schedule(effective_seed)?
                .schedule;
            self.repair_hard_constraints_in_schedule(&mut schedule, effective_seed)?;
            return Ok(schedule);
        }

        let mut schedule = self
            .compiled
            .compiled_construction_seed_schedule
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
        let mut construction_context = BaselineConstructionContext {
            effective_seed,
            group_idx_to_id: &self.compiled.group_idx_to_id,
            person_idx_to_id: &self.compiled.person_idx_to_id,
            effective_group_capacities: &self.compiled.effective_group_capacities,
            person_participation: &self.compiled.person_participation,
            immovable_people: &self.compiled.immovable_lookup,
            cliques: &cliques,
            clique_sessions: &clique_sessions,
            schedule: &mut schedule,
        };

        match construction {
            ConstructionHeuristicSelection::BaselineLegacy => {
                apply_baseline_construction_heuristic(&mut construction_context)?;
            }
            ConstructionHeuristicSelection::FreedomAwareRandomized(params) => {
                apply_freedom_aware_construction_heuristic(&mut construction_context, &params)?;
            }
            ConstructionHeuristicSelection::ConstraintScenarioOracleGuided => unreachable!(
                "constraint-scenario oracle-guided construction returns before shared constructor context setup"
            ),
        }
        self.repair_hard_constraints_in_schedule(&mut schedule, effective_seed)?;
        Ok(schedule)
    }

    fn build_constraint_scenario_oracle_guided_schedule(
        &self,
        effective_seed: u64,
    ) -> Result<ConstraintScenarioOracleConstructionResult, SolverError> {
        let started_at = Instant::now();
        if !repeat_pressure_is_relevant(&self.compiled) {
            let schedule = self.build_constructed_schedule(
                effective_seed,
                ConstructionHeuristicSelection::BaselineLegacy,
            )?;
            return Ok(ConstraintScenarioOracleConstructionResult {
                schedule,
                telemetry: ConstraintScenarioOracleTelemetry {
                    outcome: ConstraintScenarioOracleOutcomeKind::RepeatIrrelevant,
                    repeat_relevant: false,
                    constructor_wall_ms: started_at.elapsed().as_millis(),
                    ..ConstraintScenarioOracleTelemetry::default()
                },
            });
        }

        let ensemble = self.build_constraint_scenario_ensemble(effective_seed)?;
        let signals = extract_constraint_scenario_signals(&self.compiled, &ensemble);
        let best = ensemble.best();
        let scaffold_mask =
            build_constraint_scenario_scaffold_mask(&self.compiled, &best.schedule, &signals);
        let oracle_block = select_oracleizable_flexible_block(
            &self.compiled,
            &best.schedule,
            &signals,
            &scaffold_mask,
        );
        let block = oracle_block.as_ref().ok_or_else(|| {
            SolverError::ValidationError(
                "solver3 constraint-scenario oracle-guided construction could not select an oracleizable block".into(),
            )
        })?;
        let oracle_schedule = Solver6PureStructureOracle.solve(&PureStructureOracleRequest {
            num_groups: block.num_groups,
            group_size: block.group_size,
            num_sessions: block.num_sessions(),
            seed: effective_seed ^ 0x5eed_600d_u64,
        })?;
        let relabeling =
            relabel_oracle_schedule_to_block(&self.compiled, &signals, block, &oracle_schedule)?;
        let oracle_relabel_score = Some(relabeling.score);
        let (selected_schedule, merged_score) = merge_relabelled_oracle_into_scaffold(
            &self.compiled,
            &best.schedule,
            &signals,
            &scaffold_mask,
            block,
            &oracle_schedule,
            &relabeling,
        )
        .and_then(|merge| {
            let mut repaired_schedule = merge.schedule;
            self.repair_hard_constraints_in_schedule(
                &mut repaired_schedule,
                effective_seed ^ 0x4f72_6163_6c65_u64,
            )?;
            let snapshot = self.score_constructed_schedule(&repaired_schedule)?;
            Ok((repaired_schedule, snapshot.total_score))
        })?;
        let merge_improvement_over_cs = Some(best.real_score - merged_score);
        let outcome = ConstraintScenarioOracleOutcomeKind::OracleMerged;
        let oracle_merge_attempted = true;
        let oracle_merge_accepted = true;
        let oracle_merge_failed = false;
        Ok(ConstraintScenarioOracleConstructionResult {
            schedule: selected_schedule,
            telemetry: ConstraintScenarioOracleTelemetry {
                outcome,
                repeat_relevant: true,
                cs_run_count: ensemble.candidates.len(),
                cs_best_score: Some(best.cs_score),
                cs_diversity: Some(ensemble.diversity),
                rigid_placement_count: scaffold_mask.rigid_placement_count,
                flexible_placement_count: scaffold_mask.flexible_placement_count,
                oracle_block_people: oracle_block
                    .as_ref()
                    .map(|block| block.num_people())
                    .unwrap_or(0),
                oracle_block_sessions: oracle_block
                    .as_ref()
                    .map(|block| block.num_sessions())
                    .unwrap_or(0),
                oracle_block_groups: oracle_block
                    .as_ref()
                    .map(|block| block.num_groups)
                    .unwrap_or(0),
                oracle_relabel_score,
                merge_improvement_over_cs,
                oracle_merge_attempted,
                oracle_merge_accepted,
                oracle_merge_failed,
                constructor_wall_ms: started_at.elapsed().as_millis(),
                ..ConstraintScenarioOracleTelemetry::default()
            },
        })
    }

    fn build_constraint_scenario_ensemble(
        &self,
        effective_seed: u64,
    ) -> Result<
        super::construction::constraint_scenario_oracle::ConstraintScenarioEnsemble,
        SolverError,
    > {
        let mut candidates = Vec::with_capacity(DEFAULT_CONSTRAINT_SCENARIO_RUNS);
        for run_idx in 0..DEFAULT_CONSTRAINT_SCENARIO_RUNS {
            let (source, construction) = constraint_scenario_run_strategy(run_idx);
            let seed = derive_constraint_scenario_seed(effective_seed, run_idx, source);
            let schedule = match self.build_constructed_schedule(seed, construction) {
                Ok(schedule) => schedule,
                Err(_) => continue,
            };
            let snapshot = self.score_constructed_schedule(&schedule)?;
            candidates.push(ConstraintScenarioCandidate {
                schedule,
                source,
                seed,
                cs_score: constraint_scenario_score(&self.compiled, &snapshot),
                real_score: snapshot.total_score,
            });
        }

        build_constraint_scenario_ensemble(candidates)
    }

    fn score_constructed_schedule(
        &self,
        schedule: &PackedSchedule,
    ) -> Result<super::scoring::OracleSnapshot, SolverError> {
        let state = Self::from_compiled_schedule(Arc::clone(&self.compiled), schedule.clone())?;
        recompute_oracle_score(&state)
    }

    fn repair_hard_constraints_in_schedule(
        &self,
        schedule: &mut PackedSchedule,
        effective_seed: u64,
    ) -> Result<(), SolverError> {
        for session_idx in 0..self.compiled.num_sessions {
            if self.session_has_hard_constraint_violation(schedule, session_idx) {
                self.rebuild_session_with_clique_integrity(schedule, session_idx, effective_seed)?;
            }
        }
        Ok(())
    }

    fn session_has_hard_constraint_violation(
        &self,
        schedule: &PackedSchedule,
        session_idx: usize,
    ) -> bool {
        self.session_has_split_active_clique(schedule, session_idx)
            || self.session_has_immovable_violation(schedule, session_idx)
    }

    fn session_has_immovable_violation(
        &self,
        schedule: &PackedSchedule,
        session_idx: usize,
    ) -> bool {
        let mut person_group = vec![None; self.compiled.num_people];
        for (group_idx, members) in schedule[session_idx].iter().enumerate() {
            for &person_idx in members {
                person_group[person_idx] = Some(group_idx);
            }
        }

        self.compiled
            .immovable_assignments
            .iter()
            .filter(|assignment| assignment.session_idx == session_idx)
            .any(|assignment| {
                self.compiled.person_participation[assignment.person_idx][session_idx]
                    && person_group[assignment.person_idx] != Some(assignment.group_idx)
            })
    }

    fn session_has_split_active_clique(
        &self,
        schedule: &PackedSchedule,
        session_idx: usize,
    ) -> bool {
        let mut person_group = vec![None; self.compiled.num_people];
        for (group_idx, members) in schedule[session_idx].iter().enumerate() {
            for &person_idx in members {
                person_group[person_idx] = Some(group_idx);
            }
        }

        self.compiled.cliques.iter().any(|clique| {
            if let Some(sessions) = &clique.sessions {
                if !sessions.contains(&session_idx) {
                    return false;
                }
            }

            let active_members: Vec<usize> = clique
                .members
                .iter()
                .copied()
                .filter(|&member| self.compiled.person_participation[member][session_idx])
                .collect();
            if active_members.len() < 2 {
                return false;
            }

            let mut groups = active_members
                .iter()
                .filter_map(|&member| person_group[member])
                .collect::<Vec<_>>();
            groups.sort_unstable();
            groups.dedup();
            groups.len() > 1
        })
    }

    fn rebuild_session_with_clique_integrity(
        &self,
        schedule: &mut PackedSchedule,
        session_idx: usize,
        effective_seed: u64,
    ) -> Result<(), SolverError> {
        let num_people = self.compiled.num_people;
        let num_groups = self.compiled.num_groups;
        let preferred_groups = {
            let mut preferred = vec![None; num_people];
            for (group_idx, members) in schedule[session_idx].iter().enumerate() {
                for &person_idx in members {
                    preferred[person_idx] = Some(group_idx);
                }
            }
            preferred
        };

        let mut rebuilt_groups = vec![Vec::new(); num_groups];
        let mut assigned = vec![false; num_people];
        let mut group_sizes = vec![0usize; num_groups];
        let mut rng = ChaCha12Rng::seed_from_u64(
            effective_seed ^ ((session_idx as u64).wrapping_mul(0x9e3779b97f4a7c15)),
        );

        for clique in &self.compiled.cliques {
            if let Some(sessions) = &clique.sessions {
                if !sessions.contains(&session_idx) {
                    continue;
                }
            }

            let active_members: Vec<usize> = clique
                .members
                .iter()
                .copied()
                .filter(|&member| self.compiled.person_participation[member][session_idx])
                .collect();
            if active_members.len() < 2 {
                continue;
            }

            let mut required_group = None;
            for &member in &active_members {
                if let Some(group_idx) = self.compiled.immovable_group(session_idx, member) {
                    match required_group {
                        Some(existing) if existing != group_idx => {
                            return Err(SolverError::ValidationError(format!(
                                "conflicting immovable groups for clique in session {}",
                                session_idx
                            )));
                        }
                        Some(_) => {}
                        None => required_group = Some(group_idx),
                    }
                }
            }

            let target_group = if let Some(group_idx) = required_group {
                group_idx
            } else {
                let mut preferred_counts = vec![0usize; num_groups];
                for &member in &active_members {
                    if let Some(group_idx) = preferred_groups[member] {
                        preferred_counts[group_idx] += 1;
                    }
                }
                let mut candidates: Vec<usize> = (0..num_groups).collect();
                candidates.sort_by(|&left, &right| {
                    preferred_counts[right]
                        .cmp(&preferred_counts[left])
                        .then_with(|| left.cmp(&right))
                });
                candidates
                    .into_iter()
                    .find(|&group_idx| {
                        group_sizes[group_idx] + active_members.len()
                            <= self.compiled.group_capacity(session_idx, group_idx)
                    })
                    .ok_or_else(|| {
                        SolverError::ValidationError(format!(
                            "no group has room for clique of {} in session {} during solver3 normalization",
                            active_members.len(),
                            session_idx
                        ))
                    })?
            };

            if group_sizes[target_group] + active_members.len()
                > self.compiled.group_capacity(session_idx, target_group)
            {
                return Err(SolverError::ValidationError(format!(
                    "required group '{}' lacks capacity for clique of {} in session {} during solver3 normalization",
                    self.compiled.display_group(target_group),
                    active_members.len(),
                    session_idx
                )));
            }

            for member in active_members {
                if assigned[member] {
                    continue;
                }
                rebuilt_groups[target_group].push(member);
                group_sizes[target_group] += 1;
                assigned[member] = true;
            }
        }

        for assignment in self
            .compiled
            .immovable_assignments
            .iter()
            .filter(|assignment| assignment.session_idx == session_idx)
        {
            if !self.compiled.person_participation[assignment.person_idx][session_idx]
                || assigned[assignment.person_idx]
            {
                continue;
            }

            if group_sizes[assignment.group_idx]
                >= self
                    .compiled
                    .group_capacity(session_idx, assignment.group_idx)
            {
                return Err(SolverError::ValidationError(format!(
                    "group '{}' is full while placing immovable person '{}' in session {} during solver3 normalization",
                    self.compiled.display_group(assignment.group_idx),
                    self.compiled.display_person(assignment.person_idx),
                    session_idx
                )));
            }

            rebuilt_groups[assignment.group_idx].push(assignment.person_idx);
            group_sizes[assignment.group_idx] += 1;
            assigned[assignment.person_idx] = true;
        }

        let remaining_people: Vec<usize> = (0..num_people)
            .filter(|&person_idx| {
                self.compiled.person_participation[person_idx][session_idx] && !assigned[person_idx]
            })
            .collect();

        for person_idx in remaining_people {
            if let Some(preferred_group) = preferred_groups[person_idx] {
                if group_sizes[preferred_group]
                    < self.compiled.group_capacity(session_idx, preferred_group)
                {
                    rebuilt_groups[preferred_group].push(person_idx);
                    group_sizes[preferred_group] += 1;
                    assigned[person_idx] = true;
                    continue;
                }
            }

            let mut candidates: Vec<usize> = (0..num_groups).collect();
            candidates.shuffle(&mut rng);
            let target_group = candidates
                .into_iter()
                .find(|&group_idx| {
                    group_sizes[group_idx] < self.compiled.group_capacity(session_idx, group_idx)
                })
                .ok_or_else(|| {
                    SolverError::ValidationError(format!(
                        "could not place person '{}' in session {} during solver3 normalization",
                        self.compiled.display_person(person_idx),
                        session_idx
                    ))
                })?;
            rebuilt_groups[target_group].push(person_idx);
            group_sizes[target_group] += 1;
            assigned[person_idx] = true;
        }

        schedule[session_idx] = rebuilt_groups;
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

    pub(crate) fn overwrite_session_from(
        &mut self,
        source: &RuntimeState,
        session_idx: usize,
    ) -> Result<(), SolverError> {
        self.overwrite_session_from_to(source, session_idx, session_idx)
    }

    pub(crate) fn overwrite_session_from_to(
        &mut self,
        source: &RuntimeState,
        target_session_idx: usize,
        source_session_idx: usize,
    ) -> Result<(), SolverError> {
        if self.compiled.num_people != source.compiled.num_people
            || self.compiled.num_groups != source.compiled.num_groups
            || self.compiled.num_sessions != source.compiled.num_sessions
        {
            return Err(SolverError::ValidationError(
                "solver3 session overwrite requires matching compiled dimensions".into(),
            ));
        }

        for group_idx in 0..self.compiled.num_groups {
            let target_slot = self.group_slot(target_session_idx, group_idx);
            let source_slot = source.group_slot(source_session_idx, group_idx);
            self.group_members[target_slot] = source.group_members[source_slot].clone();
            self.group_sizes[target_slot] = self.group_members[target_slot].len();
        }

        for person_idx in 0..self.compiled.num_people {
            let target_slot = self.people_slot(target_session_idx, person_idx);
            let source_slot = source.people_slot(source_session_idx, person_idx);
            self.person_location[target_slot] = source.person_location[source_slot];
        }

        Ok(())
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

fn constraint_scenario_run_strategy(
    run_idx: usize,
) -> (
    ConstraintScenarioCandidateSource,
    ConstructionHeuristicSelection,
) {
    match run_idx % 3 {
        0 => (
            ConstraintScenarioCandidateSource::BaselineLegacy,
            ConstructionHeuristicSelection::BaselineLegacy,
        ),
        1 => (
            ConstraintScenarioCandidateSource::FreedomAwareDeterministic,
            ConstructionHeuristicSelection::FreedomAwareRandomized(
                FreedomAwareConstructionParams { gamma: 0.0 },
            ),
        ),
        _ => (
            ConstraintScenarioCandidateSource::FreedomAwareRandomized,
            ConstructionHeuristicSelection::FreedomAwareRandomized(
                FreedomAwareConstructionParams { gamma: 1.0 },
            ),
        ),
    }
}

fn derive_constraint_scenario_seed(
    base_seed: u64,
    run_idx: usize,
    source: ConstraintScenarioCandidateSource,
) -> u64 {
    let source_salt = match source {
        ConstraintScenarioCandidateSource::BaselineLegacy => 0x243f_6a88_85a3_08d3,
        ConstraintScenarioCandidateSource::FreedomAwareDeterministic => 0x1319_8a2e_0370_7344,
        ConstraintScenarioCandidateSource::FreedomAwareRandomized => 0xa409_3822_299f_31d0,
    };
    let mut z = base_seed ^ source_salt ^ ((run_idx as u64).wrapping_mul(0x9e37_79b9_7f4a_7c15));
    z = (z ^ (z >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    z ^ (z >> 31)
}

fn resolve_construction_selection(
    input: &ApiInput,
) -> Result<ConstructionHeuristicSelection, SolverError> {
    let solver3_params = input.solver.solver_params.solver3_params().ok_or_else(|| {
        SolverError::ValidationError(
            "solver3 runtime state received non-solver3 parameters in configuration".into(),
        )
    })?;
    match solver3_params.construction.mode {
        Solver3ConstructionMode::BaselineLegacy => {
            Ok(ConstructionHeuristicSelection::BaselineLegacy)
        }
        Solver3ConstructionMode::FreedomAwareRandomized => {
            let gamma = solver3_params.construction.freedom_aware.gamma;
            if !(0.0..=1.0).contains(&gamma) {
                return Err(SolverError::ValidationError(
                    "solver3 construction.freedom_aware.gamma must be within [0.0, 1.0]".into(),
                ));
            }
            Ok(ConstructionHeuristicSelection::FreedomAwareRandomized(
                FreedomAwareConstructionParams { gamma },
            ))
        }
        Solver3ConstructionMode::ConstraintScenarioOracleGuided => {
            Ok(ConstructionHeuristicSelection::ConstraintScenarioOracleGuided)
        }
    }
}
