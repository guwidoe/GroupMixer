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

#[cfg(target_arch = "wasm32")]
use js_sys;

#[cfg(not(target_arch = "wasm32"))]
use std::time::Instant as ConstructionInstant;

#[cfg(target_arch = "wasm32")]
type ConstructionInstant = f64;

use super::compiled_problem::{CompiledProblem, PackedSchedule};
use super::oracle::maybe_cross_check_runtime_state;
use super::scoring::recompute::recompute_oracle_score;
use super::search::SearchEngine as Solver3SearchEngine;
use super::validation::validate_invariants;
use crate::models::{
    ApiInput, AutoConstructorOutcome, Solver3ConstructionMode, Solver3Params, SolverConfiguration,
    SolverKind, SolverParams, StopConditions,
};
use crate::solver_support::construction::constraint_scenario_oracle::{
    build_constraint_scenario_scaffold_mask, extract_constraint_scenario_signals_from_scaffold,
    generate_oracle_template_candidates, merge_projected_oracle_template_into_scaffold,
    project_oracle_schedule_to_template, repeat_pressure_is_relevant,
    ConstraintScenarioOracleConstructionResult, ConstraintScenarioOracleOutcomeKind,
    ConstraintScenarioOracleTelemetry, OracleTemplateCandidate, PureStructureOracle,
    PureStructureOracleRequest, Solver6PureStructureOracle,
};
use crate::solver_support::construction::{
    apply_baseline_construction_heuristic, apply_freedom_aware_construction_heuristic,
    BaselineConstructionContext, FreedomAwareConstructionParams,
};
use crate::solver_support::validation::{
    validate_schedule_as_incumbent, validate_schedule_input_mode,
};
use crate::solver_support::SolverError;

const DEFAULT_BASELINE_CONSTRUCTION_SEED: u64 = 42;

#[cfg(not(target_arch = "wasm32"))]
fn construction_now() -> ConstructionInstant {
    ConstructionInstant::now()
}

#[cfg(target_arch = "wasm32")]
fn construction_now() -> ConstructionInstant {
    js_sys::Date::now()
}

#[cfg(not(target_arch = "wasm32"))]
fn construction_elapsed_seconds(started_at: ConstructionInstant) -> f64 {
    started_at.elapsed().as_secs_f64()
}

#[cfg(target_arch = "wasm32")]
fn construction_elapsed_seconds(started_at: ConstructionInstant) -> f64 {
    ((js_sys::Date::now() - started_at) / 1000.0).max(0.0)
}

fn construction_elapsed_millis(started_at: ConstructionInstant) -> u128 {
    (construction_elapsed_seconds(started_at) * 1000.0).max(0.0) as u128
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct AutoConstructionPolicy {
    pub(crate) oracle_construction_budget_seconds: f64,
    pub(crate) scaffold_budget_seconds: f64,
    pub(crate) oracle_recombination_budget_seconds: f64,
}

#[derive(Debug, Clone)]
pub(crate) struct AutoConstructionResult {
    pub(crate) state: RuntimeState,
    pub(crate) attempt_label: &'static str,
    pub(crate) outcome: AutoConstructorOutcome,
    pub(crate) fallback_used: bool,
    pub(crate) failure: Option<String>,
    pub(crate) constructor_wall_seconds: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct ConstraintScenarioConstructionBudget {
    total_budget_seconds: Option<f64>,
    scaffold_budget_seconds: Option<f64>,
    oracle_budget_seconds: Option<f64>,
}

#[derive(Debug, Clone, Copy)]
enum ConstructionHeuristicSelection {
    BaselineLegacy,
    FreedomAwareRandomized(FreedomAwareConstructionParams),
    ConstraintScenarioOracleGuided,
}

impl ConstructionHeuristicSelection {
    fn label(self) -> &'static str {
        match self {
            Self::BaselineLegacy => "baseline legacy",
            Self::FreedomAwareRandomized(_) => "freedom-aware randomized",
            Self::ConstraintScenarioOracleGuided => "constraint-scenario oracle-guided",
        }
    }
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
        Self::from_compiled_with_seed_and_construction(
            compiled,
            effective_seed,
            construction,
            input.solver.stop_conditions.time_limit_seconds,
        )
    }

    pub(crate) fn from_input_with_auto_construction(
        input: &ApiInput,
        policy: AutoConstructionPolicy,
    ) -> Result<AutoConstructionResult, SolverError> {
        validate_schedule_input_mode(input)?;
        let compiled = Arc::new(CompiledProblem::compile(input)?);
        let effective_seed = input
            .solver
            .seed
            .unwrap_or(DEFAULT_BASELINE_CONSTRUCTION_SEED);

        if let Some(initial_schedule) = &input.initial_schedule {
            let started_at = construction_now();
            let validated = validate_schedule_as_incumbent(input, initial_schedule)?;
            let state = Self::from_compiled_schedule(compiled, validated.schedule)?;
            return Ok(AutoConstructionResult {
                state,
                attempt_label: "initial_schedule",
                outcome: AutoConstructorOutcome::InitialSchedule,
                fallback_used: false,
                failure: None,
                constructor_wall_seconds: construction_elapsed_seconds(started_at),
            });
        }

        let construction_started_at = construction_now();
        let empty = Self::empty_for_compiled(Arc::clone(&compiled));
        let budget = ConstraintScenarioConstructionBudget {
            total_budget_seconds: Some(policy.oracle_construction_budget_seconds),
            scaffold_budget_seconds: Some(policy.scaffold_budget_seconds),
            oracle_budget_seconds: Some(policy.oracle_recombination_budget_seconds),
        };

        let attempt = empty
            .build_constraint_scenario_oracle_guided_schedule_with_budget(effective_seed, budget)
            .and_then(|result| {
                empty.validate_constructed_schedule(
                    &result.schedule,
                    ConstructionHeuristicSelection::ConstraintScenarioOracleGuided.label(),
                )?;
                Ok(result.schedule)
            });

        match attempt {
            Ok(schedule)
                if construction_elapsed_seconds(construction_started_at)
                    <= policy.oracle_construction_budget_seconds =>
            {
                let state = Self::from_compiled_schedule(compiled, schedule)?;
                Ok(AutoConstructionResult {
                    state,
                    attempt_label: "constraint_scenario_oracle_guided",
                    outcome: AutoConstructorOutcome::Success,
                    fallback_used: false,
                    failure: None,
                    constructor_wall_seconds: construction_elapsed_seconds(construction_started_at),
                })
            }
            Ok(_) => {
                let failure = format!(
                    "constraint-scenario oracle-guided construction exceeded budget: {:.3}s elapsed > {:.3}s budget",
                    construction_elapsed_seconds(construction_started_at),
                    policy.oracle_construction_budget_seconds
                );
                Self::auto_baseline_fallback(
                    compiled,
                    effective_seed,
                    construction_started_at,
                    AutoConstructorOutcome::Timeout,
                    failure,
                )
            }
            Err(error) => {
                let failure = error.to_string();
                let outcome = classify_auto_constructor_failure(&failure);
                Self::auto_baseline_fallback(
                    compiled,
                    effective_seed,
                    construction_started_at,
                    outcome,
                    failure,
                )
            }
        }
    }

    fn empty_for_compiled(compiled: Arc<CompiledProblem>) -> Self {
        let np = compiled.num_people;
        let ng = compiled.num_groups;
        let ns = compiled.num_sessions;
        Self {
            compiled,
            person_location: vec![None::<usize>; ns * np],
            group_members: vec![Vec::new(); ns * ng],
            group_sizes: vec![0usize; ns * ng],
            pair_contacts: vec![0u16; np.saturating_mul(np.saturating_sub(1)) / 2],
            unique_contacts: 0,
            repetition_penalty_raw: 0,
            weighted_repetition_penalty: 0.0,
            attribute_balance_penalty: 0.0,
            constraint_penalty_weighted: 0.0,
            total_score: 0.0,
        }
    }

    fn auto_baseline_fallback(
        compiled: Arc<CompiledProblem>,
        effective_seed: u64,
        started_at: ConstructionInstant,
        outcome: AutoConstructorOutcome,
        failure: String,
    ) -> Result<AutoConstructionResult, SolverError> {
        let empty = Self::empty_for_compiled(Arc::clone(&compiled));
        let schedule = empty.build_constructed_schedule(
            effective_seed,
            ConstructionHeuristicSelection::BaselineLegacy,
            None,
        )?;
        let state = Self::from_compiled_schedule(compiled, schedule)?;
        Ok(AutoConstructionResult {
            state,
            attempt_label: "constraint_scenario_oracle_guided",
            outcome,
            fallback_used: true,
            failure: Some(failure),
            constructor_wall_seconds: construction_elapsed_seconds(started_at),
        })
    }

    /// Builds a `RuntimeState` from a pre-compiled problem.
    pub fn from_compiled(compiled: Arc<CompiledProblem>) -> Result<Self, SolverError> {
        Self::from_compiled_with_seed_and_construction(
            compiled,
            DEFAULT_BASELINE_CONSTRUCTION_SEED,
            ConstructionHeuristicSelection::BaselineLegacy,
            None,
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
            None,
        )
    }

    fn from_compiled_with_seed_and_construction(
        compiled: Arc<CompiledProblem>,
        effective_seed: u64,
        construction: ConstructionHeuristicSelection,
        construction_total_time_limit_seconds: Option<u64>,
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

        state.initialize_from_schedule(
            effective_seed,
            construction,
            construction_total_time_limit_seconds,
        )?;
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
        construction_total_time_limit_seconds: Option<u64>,
    ) -> Result<(), SolverError> {
        let schedule = self.build_constructed_schedule(
            effective_seed,
            construction,
            construction_total_time_limit_seconds,
        )?;

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
        construction_total_time_limit_seconds: Option<u64>,
    ) -> Result<PackedSchedule, SolverError> {
        // Construction owns hard-constraint feasibility. BaselineLegacy and
        // FreedomAwareRandomized receive immovable, MustStayTogether, and MustStayApart
        // metadata through `BaselineConstructionContext`; ConstraintScenarioOracleGuided
        // must preserve those constraints through scaffold selection, projection, and merge.
        // Runtime validation below is only a fail-fast guardrail, not a repair fallback.
        if matches!(
            construction,
            ConstructionHeuristicSelection::ConstraintScenarioOracleGuided
        ) {
            let schedule = self
                .build_constraint_scenario_oracle_guided_schedule(
                    effective_seed,
                    construction_total_time_limit_seconds,
                )?
                .schedule;
            self.validate_constructed_schedule(&schedule, construction.label())?;
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
        let hard_apart_partners_by_person_session =
            self.build_hard_apart_partners_by_person_session();
        let mut construction_context = BaselineConstructionContext {
            effective_seed,
            group_idx_to_id: &self.compiled.group_idx_to_id,
            person_idx_to_id: &self.compiled.person_idx_to_id,
            effective_group_capacities: &self.compiled.effective_group_capacities,
            person_participation: &self.compiled.person_participation,
            immovable_people: &self.compiled.immovable_lookup,
            cliques: &cliques,
            clique_sessions: &clique_sessions,
            hard_apart_partners_by_person_session: &hard_apart_partners_by_person_session,
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
        self.validate_constructed_schedule(&schedule, construction.label())?;
        Ok(schedule)
    }

    fn build_hard_apart_partners_by_person_session(&self) -> Vec<Vec<usize>> {
        let mut partners = vec![Vec::new(); self.compiled.num_sessions * self.compiled.num_people];
        for constraint in &self.compiled.hard_apart_pairs {
            let (left, right) = constraint.people;
            let sessions = constraint
                .sessions
                .clone()
                .unwrap_or_else(|| (0..self.compiled.num_sessions).collect());
            for session_idx in sessions {
                partners[self.compiled.person_session_slot(session_idx, left)].push(right);
                partners[self.compiled.person_session_slot(session_idx, right)].push(left);
            }
        }
        for partner_list in &mut partners {
            partner_list.sort_unstable();
            partner_list.dedup();
        }
        partners
    }

    fn build_constraint_scenario_oracle_guided_schedule(
        &self,
        effective_seed: u64,
        construction_total_time_limit_seconds: Option<u64>,
    ) -> Result<ConstraintScenarioOracleConstructionResult, SolverError> {
        let budget =
            ConstraintScenarioConstructionBudget::legacy(construction_total_time_limit_seconds);
        self.build_constraint_scenario_oracle_guided_schedule_with_budget(effective_seed, budget)
    }

    fn build_constraint_scenario_oracle_guided_schedule_with_budget(
        &self,
        effective_seed: u64,
        budget: ConstraintScenarioConstructionBudget,
    ) -> Result<ConstraintScenarioOracleConstructionResult, SolverError> {
        let started_at = construction_now();
        if !repeat_pressure_is_relevant(&self.compiled) {
            let schedule = self.build_constructed_schedule(
                effective_seed,
                ConstructionHeuristicSelection::BaselineLegacy,
                None,
            )?;
            return Ok(ConstraintScenarioOracleConstructionResult {
                schedule,
                telemetry: ConstraintScenarioOracleTelemetry {
                    outcome: ConstraintScenarioOracleOutcomeKind::RepeatIrrelevant,
                    repeat_relevant: false,
                    constructor_wall_ms: construction_elapsed_millis(started_at),
                    ..ConstraintScenarioOracleTelemetry::default()
                },
            });
        }

        ensure_constructor_budget_remaining(started_at, budget.total_budget_seconds)?;
        let scaffold = self.build_constraint_scenario_warmup_scaffold(
            effective_seed,
            budget.scaffold_budget_seconds,
        )?;
        ensure_constructor_budget_remaining(started_at, budget.total_budget_seconds)?;
        if scaffold.score <= f64::EPSILON {
            return Ok(ConstraintScenarioOracleConstructionResult {
                schedule: scaffold.schedule,
                telemetry: ConstraintScenarioOracleTelemetry {
                    outcome: ConstraintScenarioOracleOutcomeKind::ConstraintScenarioOnly,
                    repeat_relevant: true,
                    cs_run_count: 1,
                    cs_best_score: Some(scaffold.score),
                    cs_diversity: Some(0.0),
                    constructor_wall_ms: construction_elapsed_millis(started_at),
                    ..ConstraintScenarioOracleTelemetry::default()
                },
            });
        }
        ensure_constructor_budget_remaining(started_at, budget.total_budget_seconds)?;
        let signals =
            extract_constraint_scenario_signals_from_scaffold(&self.compiled, &scaffold.schedule);
        let scaffold_mask =
            build_constraint_scenario_scaffold_mask(&self.compiled, &scaffold.schedule, &signals);
        let Some(candidate) = generate_oracle_template_candidates(
            &self.compiled,
            &scaffold.schedule,
            &signals,
            &scaffold_mask,
        )
        .into_iter()
        .next() else {
            return Ok(ConstraintScenarioOracleConstructionResult {
                schedule: scaffold.schedule,
                telemetry: ConstraintScenarioOracleTelemetry {
                    outcome: ConstraintScenarioOracleOutcomeKind::ConstraintScenarioOnly,
                    repeat_relevant: true,
                    cs_run_count: 1,
                    cs_best_score: Some(scaffold.score),
                    cs_diversity: Some(0.0),
                    rigid_placement_count: scaffold_mask.rigid_placement_count,
                    flexible_placement_count: scaffold_mask.flexible_placement_count,
                    constructor_wall_ms: construction_elapsed_millis(started_at),
                    ..ConstraintScenarioOracleTelemetry::default()
                },
            });
        };
        if !oracle_template_can_change_scaffold_under_merge_policy(
            &self.compiled,
            &scaffold.schedule,
            &candidate,
        ) {
            return Ok(ConstraintScenarioOracleConstructionResult {
                schedule: scaffold.schedule,
                telemetry: ConstraintScenarioOracleTelemetry {
                    outcome: ConstraintScenarioOracleOutcomeKind::ConstraintScenarioOnly,
                    repeat_relevant: true,
                    cs_run_count: 1,
                    cs_best_score: Some(scaffold.score),
                    cs_diversity: Some(0.0),
                    rigid_placement_count: scaffold_mask.rigid_placement_count,
                    flexible_placement_count: scaffold_mask.flexible_placement_count,
                    oracle_template_sessions: candidate.num_sessions(),
                    oracle_template_groups: candidate.num_groups,
                    constructor_wall_ms: construction_elapsed_millis(started_at),
                    ..ConstraintScenarioOracleTelemetry::default()
                },
            });
        }
        ensure_constructor_budget_remaining(started_at, budget.total_budget_seconds)?;
        let oracle_phase_started_at = construction_now();
        let oracle_schedule = Solver6PureStructureOracle.solve(&PureStructureOracleRequest {
            num_groups: candidate.num_groups,
            group_size: candidate.group_size,
            num_sessions: candidate.num_sessions(),
            seed: effective_seed ^ 0x5eed_600d_u64,
        })?;
        ensure_constructor_budget_remaining(started_at, budget.total_budget_seconds)?;
        ensure_constructor_budget_remaining(oracle_phase_started_at, budget.oracle_budget_seconds)?;
        let projection = project_oracle_schedule_to_template(
            &self.compiled,
            &signals,
            &scaffold_mask,
            &candidate,
            &oracle_schedule,
        )?;
        ensure_constructor_budget_remaining(oracle_phase_started_at, budget.oracle_budget_seconds)?;
        let oracle_projection_score = Some(projection.score);
        let merge = merge_projected_oracle_template_into_scaffold(
            &self.compiled,
            &scaffold.schedule,
            &signals,
            &scaffold_mask,
            &candidate,
            &oracle_schedule,
            &projection,
        )
        .map_err(|err| {
            SolverError::ValidationError(format!(
                "constraint-scenario oracle-guided construction could not merge oracle template while preserving hard constraints: {err}"
            ))
        })?;
        ensure_constructor_budget_remaining(started_at, budget.total_budget_seconds)?;
        ensure_constructor_budget_remaining(oracle_phase_started_at, budget.oracle_budget_seconds)?;
        let snapshot = self.score_constructed_schedule(&merge.schedule)?;
        let selected_schedule = merge.schedule;
        let merged_score = snapshot.total_score;
        let merge_improvement_over_cs = Some(scaffold.score - merged_score);
        let outcome = ConstraintScenarioOracleOutcomeKind::OracleMerged;
        let oracle_merge_attempted = true;
        let oracle_merge_accepted = true;
        let oracle_merge_failed = false;
        Ok(ConstraintScenarioOracleConstructionResult {
            schedule: selected_schedule,
            telemetry: ConstraintScenarioOracleTelemetry {
                outcome,
                repeat_relevant: true,
                cs_run_count: 1,
                cs_best_score: Some(scaffold.score),
                cs_diversity: Some(0.0),
                rigid_placement_count: scaffold_mask.rigid_placement_count,
                flexible_placement_count: scaffold_mask.flexible_placement_count,
                oracle_template_mapped_people: projection.mapped_real_people,
                oracle_template_sessions: candidate.num_sessions(),
                oracle_template_groups: candidate.num_groups,
                oracle_projection_score,
                merge_improvement_over_cs,
                oracle_merge_attempted,
                oracle_merge_accepted,
                oracle_merge_failed,
                constructor_wall_ms: construction_elapsed_millis(started_at),
                ..ConstraintScenarioOracleTelemetry::default()
            },
        })
    }

    fn build_constraint_scenario_warmup_scaffold(
        &self,
        effective_seed: u64,
        budget_seconds: Option<f64>,
    ) -> Result<ConstraintScenarioWarmupScaffold, SolverError> {
        let budget_seconds = budget_seconds.unwrap_or(1.0).max(0.0);
        let baseline_schedule = self.build_constructed_schedule(
            effective_seed ^ 0x0c5c_aff0_1d5c_aff0_u64,
            ConstructionHeuristicSelection::BaselineLegacy,
            None,
        )?;
        if budget_seconds <= f64::EPSILON {
            let snapshot = self.score_constructed_schedule(&baseline_schedule)?;
            return Ok(ConstraintScenarioWarmupScaffold {
                schedule: baseline_schedule,
                score: snapshot.total_score,
            });
        }

        let mut warmup_state =
            Self::from_compiled_schedule(Arc::clone(&self.compiled), baseline_schedule)?;
        let warmup_config = constraint_scenario_warmup_solver_configuration(
            effective_seed ^ 0x57a9_1e5c_affe_f00d_u64,
            budget_seconds,
        );
        Solver3SearchEngine::new(&warmup_config).solve_with_time_limit_override(
            &mut warmup_state,
            None,
            None,
            Some(budget_seconds),
        )?;
        let schedule = warmup_state.to_packed_schedule();
        let snapshot = self.score_constructed_schedule(&schedule)?;
        Ok(ConstraintScenarioWarmupScaffold {
            schedule,
            score: snapshot.total_score,
        })
    }

    fn score_constructed_schedule(
        &self,
        schedule: &PackedSchedule,
    ) -> Result<super::scoring::OracleSnapshot, SolverError> {
        let state = Self::from_compiled_schedule(Arc::clone(&self.compiled), schedule.clone())?;
        recompute_oracle_score(&state)
    }

    fn validate_constructed_schedule(
        &self,
        schedule: &PackedSchedule,
        constructor_label: &str,
    ) -> Result<(), SolverError> {
        let prefix = || format!("{constructor_label} constructor produced invalid schedule");
        if schedule.len() != self.compiled.num_sessions {
            return Err(SolverError::ValidationError(format!(
                "{}: expected {} sessions, got {}",
                prefix(),
                self.compiled.num_sessions,
                schedule.len()
            )));
        }

        for (session_idx, groups) in schedule.iter().enumerate() {
            if groups.len() != self.compiled.num_groups {
                return Err(SolverError::ValidationError(format!(
                    "{}: session {} expected {} groups, got {}",
                    prefix(),
                    session_idx,
                    self.compiled.num_groups,
                    groups.len()
                )));
            }

            let mut person_group = vec![None; self.compiled.num_people];
            for (group_idx, members) in groups.iter().enumerate() {
                let capacity = self.compiled.group_capacity(session_idx, group_idx);
                if members.len() > capacity {
                    return Err(SolverError::ValidationError(format!(
                        "{}: group '{}' has {} members but capacity {} in session {}",
                        prefix(),
                        self.compiled.display_group(group_idx),
                        members.len(),
                        capacity,
                        session_idx
                    )));
                }
                for &person_idx in members {
                    if person_idx >= self.compiled.num_people {
                        return Err(SolverError::ValidationError(format!(
                            "{}: group '{}' contains out-of-range person index {} in session {}",
                            prefix(),
                            self.compiled.display_group(group_idx),
                            person_idx,
                            session_idx
                        )));
                    }
                    if !self.compiled.person_participation[person_idx][session_idx] {
                        return Err(SolverError::ValidationError(format!(
                            "{}: non-participating person '{}' is assigned in session {}",
                            prefix(),
                            self.compiled.display_person(person_idx),
                            session_idx
                        )));
                    }
                    if let Some(previous_group_idx) = person_group[person_idx] {
                        return Err(SolverError::ValidationError(format!(
                            "{}: person '{}' is assigned to both '{}' and '{}' in session {}",
                            prefix(),
                            self.compiled.display_person(person_idx),
                            self.compiled.display_group(previous_group_idx),
                            self.compiled.display_group(group_idx),
                            session_idx
                        )));
                    }
                    person_group[person_idx] = Some(group_idx);
                }
            }

            for (person_idx, participates_by_session) in
                self.compiled.person_participation.iter().enumerate()
            {
                if participates_by_session[session_idx] != person_group[person_idx].is_some() {
                    return Err(SolverError::ValidationError(format!(
                        "{}: person '{}' participation/assignment mismatch in session {}",
                        prefix(),
                        self.compiled.display_person(person_idx),
                        session_idx
                    )));
                }
            }

            self.validate_constructed_schedule_cliques(
                &person_group,
                session_idx,
                constructor_label,
            )?;
            self.validate_constructed_schedule_immovable(
                &person_group,
                session_idx,
                constructor_label,
            )?;
            self.validate_constructed_schedule_hard_apart(
                &person_group,
                session_idx,
                constructor_label,
            )?;
        }

        Ok(())
    }

    fn validate_constructed_schedule_cliques(
        &self,
        person_group: &[Option<usize>],
        session_idx: usize,
        constructor_label: &str,
    ) -> Result<(), SolverError> {
        for clique in &self.compiled.cliques {
            if let Some(sessions) = &clique.sessions {
                if !sessions.contains(&session_idx) {
                    continue;
                }
            }

            let active_members = clique
                .members
                .iter()
                .copied()
                .filter(|&member| self.compiled.person_participation[member][session_idx])
                .collect::<Vec<_>>();
            if active_members.len() < 2 {
                continue;
            }
            let first_group = person_group[active_members[0]];
            if active_members
                .iter()
                .any(|&member| person_group[member] != first_group)
            {
                let members = active_members
                    .iter()
                    .map(|&member| self.compiled.display_person(member))
                    .collect::<Vec<_>>();
                return Err(SolverError::ValidationError(format!(
                    "{constructor_label} constructor produced invalid schedule: MustStayTogether clique {:?} is split in session {}",
                    members, session_idx
                )));
            }
        }
        Ok(())
    }

    fn validate_constructed_schedule_immovable(
        &self,
        person_group: &[Option<usize>],
        session_idx: usize,
        constructor_label: &str,
    ) -> Result<(), SolverError> {
        for assignment in self
            .compiled
            .immovable_assignments
            .iter()
            .filter(|assignment| assignment.session_idx == session_idx)
        {
            if !self.compiled.person_participation[assignment.person_idx][session_idx] {
                continue;
            }
            if person_group[assignment.person_idx] != Some(assignment.group_idx) {
                return Err(SolverError::ValidationError(format!(
                    "{constructor_label} constructor produced invalid schedule: immovable person '{}' is not in group '{}' for session {}",
                    self.compiled.display_person(assignment.person_idx),
                    self.compiled.display_group(assignment.group_idx),
                    session_idx
                )));
            }
        }
        Ok(())
    }

    fn validate_constructed_schedule_hard_apart(
        &self,
        person_group: &[Option<usize>],
        session_idx: usize,
        constructor_label: &str,
    ) -> Result<(), SolverError> {
        for pair in &self.compiled.hard_apart_pairs {
            if let Some(sessions) = &pair.sessions {
                if !sessions.contains(&session_idx) {
                    continue;
                }
            }
            let (left, right) = pair.people;
            if !self.compiled.person_participation[left][session_idx]
                || !self.compiled.person_participation[right][session_idx]
            {
                continue;
            }
            if person_group[left].is_some() && person_group[left] == person_group[right] {
                return Err(SolverError::ValidationError(format!(
                    "{constructor_label} constructor produced invalid schedule: MustStayApart pair ['{}', '{}'] is together in group '{}' for session {}",
                    self.compiled.display_person(left),
                    self.compiled.display_person(right),
                    self.compiled.display_group(person_group[left].expect("checked above")),
                    session_idx
                )));
            }
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

    /// Converts the flat runtime state back into the internal packed schedule shape.
    fn to_packed_schedule(&self) -> PackedSchedule {
        let mut schedule =
            vec![vec![Vec::new(); self.compiled.num_groups]; self.compiled.num_sessions];
        for (session_idx, session_groups) in schedule.iter_mut().enumerate() {
            for (group_idx, members) in session_groups.iter_mut().enumerate() {
                let slot = self.group_slot(session_idx, group_idx);
                *members = self.group_members[slot].clone();
            }
        }
        schedule
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

#[derive(Debug, Clone, PartialEq)]
struct ConstraintScenarioWarmupScaffold {
    schedule: PackedSchedule,
    score: f64,
}

impl ConstraintScenarioConstructionBudget {
    fn legacy(total_time_limit_seconds: Option<u64>) -> Self {
        Self {
            total_budget_seconds: None,
            scaffold_budget_seconds: Some(match total_time_limit_seconds {
                Some(0) => 0.0,
                Some(_) | None => 1.0,
            }),
            oracle_budget_seconds: None,
        }
    }
}

fn classify_auto_constructor_failure(failure: &str) -> AutoConstructorOutcome {
    let normalized = failure.to_ascii_lowercase();
    if normalized.contains("exceeded") && normalized.contains("budget") {
        AutoConstructorOutcome::Timeout
    } else if normalized.contains("repeat pressure is not relevant")
        || normalized.contains("repeat/contact pressure is absent")
        || normalized.contains("not applicable")
        || normalized.contains("unsupported")
    {
        AutoConstructorOutcome::Unsupported
    } else if normalized.contains("validation") || normalized.contains("invalid") {
        AutoConstructorOutcome::ValidationError
    } else {
        AutoConstructorOutcome::FallbackBaseline
    }
}

pub(crate) fn oracle_template_can_change_scaffold_under_merge_policy(
    compiled: &CompiledProblem,
    scaffold: &PackedSchedule,
    candidate: &OracleTemplateCandidate,
) -> bool {
    for (session_pos, &session_idx) in candidate.sessions.iter().enumerate() {
        if !session_has_active_hard_apart_for_oracle_merge(compiled, session_idx) {
            return true;
        }
        if candidate.groups_by_session[session_pos]
            .iter()
            .any(|&group_idx| {
                scaffold[session_idx][group_idx].len()
                    < compiled.group_capacity(session_idx, group_idx)
            })
        {
            return true;
        }
    }
    false
}

fn session_has_active_hard_apart_for_oracle_merge(
    compiled: &CompiledProblem,
    session_idx: usize,
) -> bool {
    compiled.hard_apart_pairs.iter().any(|pair| {
        let (left, right) = pair.people;
        compiled.person_participation[left][session_idx]
            && compiled.person_participation[right][session_idx]
            && compiled.hard_apart_active(session_idx, left, right)
    })
}

fn ensure_constructor_budget_remaining(
    started_at: ConstructionInstant,
    total_budget_seconds: Option<f64>,
) -> Result<(), SolverError> {
    let Some(total_budget_seconds) = total_budget_seconds else {
        return Ok(());
    };
    if construction_elapsed_seconds(started_at) > total_budget_seconds {
        return Err(SolverError::ValidationError(format!(
            "constraint-scenario oracle-guided construction exceeded its {:.3}s budget",
            total_budget_seconds
        )));
    }
    Ok(())
}

fn constraint_scenario_warmup_solver_configuration(
    effective_seed: u64,
    budget_seconds: f64,
) -> SolverConfiguration {
    SolverConfiguration {
        solver_type: SolverKind::Solver3.canonical_id().into(),
        stop_conditions: StopConditions {
            max_iterations: Some(1_000_000),
            time_limit_seconds: Some(budget_seconds.ceil().max(1.0) as u64),
            no_improvement_iterations: None,
            stop_on_optimal_score: true,
        },
        solver_params: SolverParams::Solver3(Solver3Params::default()),
        logging: Default::default(),
        telemetry: Default::default(),
        seed: Some(effective_seed),
        move_policy: None,
        allowed_sessions: None,
    }
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
