use std::collections::VecDeque;

use crate::models::{
    BestScoreTimelinePoint, MemeticBenchmarkTelemetry, MoveFamily, MoveFamilyBenchmarkTelemetry,
    MoveFamilyBenchmarkTelemetrySummary, MovePolicy, ProgressUpdate,
    RepeatGuidedSwapBenchmarkTelemetry, SgpWeekPairTabuBenchmarkTelemetry,
    Solver3LocalImproverMode, Solver3SearchDriverMode, SolverBenchmarkTelemetry,
    SolverConfiguration, StopReason,
};
use crate::runtime_target::displayed_total_iterations;
use crate::solver_support::SolverError;

use super::super::runtime_state::RuntimeState;
use super::tabu::SgpWeekPairTabuConfig;

const DEFAULT_MAX_ITERATIONS: u64 = 10_000;
const RECENT_WINDOW: usize = 100;

#[derive(Debug, Clone)]
pub(crate) struct SearchRunContext {
    pub(crate) effective_seed: u64,
    pub(crate) move_policy: MovePolicy,
    pub(crate) search_driver_mode: Solver3SearchDriverMode,
    pub(crate) local_improver_mode: Solver3LocalImproverMode,
    pub(crate) max_iterations: u64,
    pub(crate) no_improvement_limit: Option<u64>,
    pub(crate) time_limit_seconds: Option<u64>,
    pub(crate) stop_on_optimal_score: bool,
    pub(crate) allowed_sessions: Vec<usize>,
    pub(crate) correctness_lane_enabled: bool,
    pub(crate) correctness_sample_every_accepted_moves: u64,
    pub(crate) repeat_guided_swaps_enabled: bool,
    pub(crate) repeat_guided_swap_probability: f64,
    pub(crate) repeat_guided_swap_candidate_preview_budget: usize,
    pub(crate) sgp_week_pair_tabu: Option<SgpWeekPairTabuConfig>,
    pub(crate) steady_state_memetic: Option<SteadyStateMemeticConfig>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct SteadyStateMemeticConfig {
    pub(crate) population_size: usize,
    pub(crate) parent_tournament_size: usize,
    pub(crate) mutation_swaps_min: usize,
    pub(crate) mutation_swaps_max: usize,
    pub(crate) child_polish_max_iterations: u64,
    pub(crate) child_polish_no_improvement_iterations: u64,
}

impl SearchRunContext {
    pub(crate) fn from_solver(
        configuration: &SolverConfiguration,
        state: &RuntimeState,
        effective_seed: u64,
    ) -> Result<Self, SolverError> {
        let move_policy = configuration
            .move_policy
            .clone()
            .unwrap_or_default()
            .normalized()
            .map_err(SolverError::ValidationError)?;
        let solver3_params = configuration
            .solver_params
            .solver3_params()
            .ok_or_else(|| {
                SolverError::ValidationError(
                    "solver3 search received non-solver3 parameters in configuration".into(),
                )
            })?;
        let correctness_lane_enabled = solver3_params.correctness_lane.enabled;
        let search_driver_mode = solver3_params.search_driver.mode;
        let local_improver_mode = solver3_params.local_improver.mode;
        let sgp_week_pair_tabu = &solver3_params.local_improver.sgp_week_pair_tabu;
        let steady_state_memetic = &solver3_params.search_driver.steady_state_memetic;
        let correctness_sample_every_accepted_moves =
            solver3_params.correctness_lane.sample_every_accepted_moves;
        let repeat_guided_swap_probability = solver3_params
            .hotspot_guidance
            .repeat_guided_swaps
            .guided_proposal_probability;
        let repeat_guided_swap_candidate_preview_budget = solver3_params
            .hotspot_guidance
            .repeat_guided_swaps
            .candidate_preview_budget;

        if correctness_sample_every_accepted_moves == 0 {
            return Err(SolverError::ValidationError(
                "solver3 correctness_lane.sample_every_accepted_moves must be >= 1".into(),
            ));
        }

        if !(0.0..=1.0).contains(&repeat_guided_swap_probability) {
            return Err(SolverError::ValidationError(
                "solver3 hotspot_guidance.repeat_guided_swaps.guided_proposal_probability must be within [0.0, 1.0]".into(),
            ));
        }

        if solver3_params.hotspot_guidance.repeat_guided_swaps.enabled
            && repeat_guided_swap_candidate_preview_budget == 0
        {
            return Err(SolverError::ValidationError(
                "solver3 hotspot_guidance.repeat_guided_swaps.candidate_preview_budget must be >= 1 when enabled".into(),
            ));
        }

        if sgp_week_pair_tabu.tenure_min == 0 {
            return Err(SolverError::ValidationError(
                "solver3 local_improver.sgp_week_pair_tabu.tenure_min must be >= 1".into(),
            ));
        }

        if sgp_week_pair_tabu.tenure_max < sgp_week_pair_tabu.tenure_min {
            return Err(SolverError::ValidationError(
                "solver3 local_improver.sgp_week_pair_tabu.tenure_max must be >= tenure_min".into(),
            ));
        }

        if sgp_week_pair_tabu.retry_cap == 0 {
            return Err(SolverError::ValidationError(
                "solver3 local_improver.sgp_week_pair_tabu.retry_cap must be >= 1".into(),
            ));
        }

        if sgp_week_pair_tabu.session_scale_reference_participants == 0 {
            return Err(SolverError::ValidationError(
                "solver3 local_improver.sgp_week_pair_tabu.session_scale_reference_participants must be >= 1"
                    .into(),
            ));
        }

        if sgp_week_pair_tabu.reactive_no_improvement_window == 0 {
            return Err(SolverError::ValidationError(
                "solver3 local_improver.sgp_week_pair_tabu.reactive_no_improvement_window must be >= 1"
                    .into(),
            ));
        }

        if sgp_week_pair_tabu.reactive_max_multiplier == 0 {
            return Err(SolverError::ValidationError(
                "solver3 local_improver.sgp_week_pair_tabu.reactive_max_multiplier must be >= 1"
                    .into(),
            ));
        }

        if steady_state_memetic.population_size < 2 {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.steady_state_memetic.population_size must be >= 2".into(),
            ));
        }

        if steady_state_memetic.parent_tournament_size == 0 {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.steady_state_memetic.parent_tournament_size must be >= 1"
                    .into(),
            ));
        }

        if steady_state_memetic.parent_tournament_size > steady_state_memetic.population_size {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.steady_state_memetic.parent_tournament_size must be <= population_size"
                    .into(),
            ));
        }

        if steady_state_memetic.mutation_swaps_min == 0 {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.steady_state_memetic.mutation_swaps_min must be >= 1".into(),
            ));
        }

        if steady_state_memetic.mutation_swaps_max < steady_state_memetic.mutation_swaps_min {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.steady_state_memetic.mutation_swaps_max must be >= mutation_swaps_min"
                    .into(),
            ));
        }

        if steady_state_memetic.child_polish_max_iterations == 0 {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.steady_state_memetic.child_polish_max_iterations must be >= 1"
                    .into(),
            ));
        }

        if steady_state_memetic.child_polish_no_improvement_iterations == 0 {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.steady_state_memetic.child_polish_no_improvement_iterations must be >= 1"
                    .into(),
            ));
        }

        if steady_state_memetic.child_polish_no_improvement_iterations
            > steady_state_memetic.child_polish_max_iterations
        {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.steady_state_memetic.child_polish_no_improvement_iterations must be <= child_polish_max_iterations"
                    .into(),
            ));
        }

        #[cfg(not(feature = "solver3-oracle-checks"))]
        if correctness_lane_enabled {
            return Err(SolverError::ValidationError(
                "solver3 correctness lane requires compiling gm-core with feature `solver3-oracle-checks`"
                    .into(),
            ));
        }

        let allows_swap_family = move_policy.allowed_families().contains(&MoveFamily::Swap);

        if local_improver_mode == Solver3LocalImproverMode::SgpWeekPairTabu
            && state.compiled.repeat_encounter.is_none()
        {
            return Err(SolverError::ValidationError(
                "solver3 local_improver.mode=sgp_week_pair_tabu requires a repeat_encounter constraint"
                    .into(),
            ));
        }

        if local_improver_mode == Solver3LocalImproverMode::SgpWeekPairTabu && !allows_swap_family {
            return Err(SolverError::ValidationError(
                "solver3 local_improver.mode=sgp_week_pair_tabu requires move_policy to allow swap moves"
                    .into(),
            ));
        }

        if search_driver_mode == Solver3SearchDriverMode::SteadyStateMemetic && !allows_swap_family
        {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.mode=steady_state_memetic requires move_policy to allow swap moves"
                    .into(),
            ));
        }

        if search_driver_mode == Solver3SearchDriverMode::SteadyStateMemetic
            && !state.compiled.cliques.is_empty()
        {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.mode=steady_state_memetic does not yet support active cliques / must_stay_together constraints"
                    .into(),
            ));
        }

        match (search_driver_mode, local_improver_mode) {
            (Solver3SearchDriverMode::SingleState, Solver3LocalImproverMode::RecordToRecord)
            | (Solver3SearchDriverMode::SingleState, Solver3LocalImproverMode::SgpWeekPairTabu) => {
            }
            (
                Solver3SearchDriverMode::SteadyStateMemetic,
                Solver3LocalImproverMode::RecordToRecord,
            )
            | (
                Solver3SearchDriverMode::SteadyStateMemetic,
                Solver3LocalImproverMode::SgpWeekPairTabu,
            ) => {}
        }

        Ok(Self {
            effective_seed,
            move_policy,
            search_driver_mode,
            local_improver_mode,
            max_iterations: configuration
                .stop_conditions
                .max_iterations
                .unwrap_or(DEFAULT_MAX_ITERATIONS),
            no_improvement_limit: configuration.stop_conditions.no_improvement_iterations,
            time_limit_seconds: configuration.stop_conditions.time_limit_seconds,
            stop_on_optimal_score: configuration.stop_conditions.stop_on_optimal_score,
            allowed_sessions: state
                .compiled
                .allowed_sessions
                .clone()
                .unwrap_or_else(|| (0..state.compiled.num_sessions).collect()),
            correctness_lane_enabled,
            correctness_sample_every_accepted_moves,
            repeat_guided_swaps_enabled: solver3_params
                .hotspot_guidance
                .repeat_guided_swaps
                .enabled
                && state.compiled.repeat_encounter.is_some(),
            repeat_guided_swap_probability,
            repeat_guided_swap_candidate_preview_budget: repeat_guided_swap_candidate_preview_budget
                as usize,
            sgp_week_pair_tabu: Some(SgpWeekPairTabuConfig {
                tenure_mode: sgp_week_pair_tabu.tenure_mode,
                tenure_min: sgp_week_pair_tabu.tenure_min as u64,
                tenure_max: sgp_week_pair_tabu.tenure_max as u64,
                retry_cap: sgp_week_pair_tabu.retry_cap as usize,
                aspiration_enabled: sgp_week_pair_tabu.aspiration_enabled,
                session_scale_reference_participants: sgp_week_pair_tabu
                    .session_scale_reference_participants as u64,
                reactive_no_improvement_window: sgp_week_pair_tabu
                    .reactive_no_improvement_window as u64,
                reactive_max_multiplier: sgp_week_pair_tabu.reactive_max_multiplier as u64,
                conflict_restricted_swap_sampling_enabled: sgp_week_pair_tabu
                    .conflict_restricted_swap_sampling_enabled,
            }),
            steady_state_memetic: Some(SteadyStateMemeticConfig {
                population_size: steady_state_memetic.population_size as usize,
                parent_tournament_size: steady_state_memetic.parent_tournament_size as usize,
                mutation_swaps_min: steady_state_memetic.mutation_swaps_min as usize,
                mutation_swaps_max: steady_state_memetic.mutation_swaps_max as usize,
                child_polish_max_iterations: steady_state_memetic.child_polish_max_iterations
                    as u64,
                child_polish_no_improvement_iterations: steady_state_memetic
                    .child_polish_no_improvement_iterations
                    as u64,
            }),
        })
    }
}

#[derive(Debug, Clone, Default, PartialEq)]
#[allow(dead_code)]
pub(crate) struct SearchPolicyMemory {
    pub(crate) tabu: Option<TabuPolicyMemory>,
    pub(crate) threshold: Option<ThresholdAcceptanceMemory>,
    pub(crate) late_acceptance: Option<LateAcceptanceMemory>,
    pub(crate) ils: Option<IteratedLocalSearchMemory>,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct TabuPolicyMemory {
    pub(crate) tenure_hint: usize,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct ThresholdAcceptanceMemory {
    pub(crate) threshold_score: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct LateAcceptanceMemory {
    pub(crate) window_len: usize,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct IteratedLocalSearchMemory {
    pub(crate) perturbation_round: u64,
}

#[derive(Debug, Clone)]
pub(crate) struct SearchProgressState {
    pub(crate) current_state: RuntimeState,
    pub(crate) best_state: RuntimeState,
    pub(crate) initial_score: f64,
    pub(crate) best_score: f64,
    pub(crate) no_improvement_count: u64,
    pub(crate) max_no_improvement_streak: u64,
    pub(crate) iterations_completed: u64,
    pub(crate) local_optima_escapes: u64,
    pub(crate) accepted_uphill_moves: u64,
    pub(crate) accepted_downhill_moves: u64,
    pub(crate) accepted_neutral_moves: u64,
    pub(crate) attempted_delta_sum: f64,
    pub(crate) accepted_delta_sum: f64,
    pub(crate) biggest_attempted_increase: f64,
    pub(crate) biggest_accepted_increase: f64,
    pub(crate) recent_acceptance: VecDeque<bool>,
    pub(crate) best_score_timeline: Vec<BestScoreTimelinePoint>,
    pub(crate) repeat_guided_swap_telemetry: RepeatGuidedSwapBenchmarkTelemetry,
    pub(crate) sgp_week_pair_tabu_telemetry: Option<SgpWeekPairTabuBenchmarkTelemetry>,
    pub(crate) memetic_telemetry: Option<MemeticBenchmarkTelemetry>,
    pub(crate) move_metrics: MoveFamilyBenchmarkTelemetrySummary,
    #[allow(dead_code)]
    pub(crate) policy_memory: SearchPolicyMemory,
}

impl SearchProgressState {
    pub(crate) fn new(initial_state: RuntimeState) -> Self {
        let initial_score = initial_state.total_score;
        Self {
            current_state: initial_state.clone(),
            best_state: initial_state,
            initial_score,
            best_score: initial_score,
            no_improvement_count: 0,
            max_no_improvement_streak: 0,
            iterations_completed: 0,
            local_optima_escapes: 0,
            accepted_uphill_moves: 0,
            accepted_downhill_moves: 0,
            accepted_neutral_moves: 0,
            attempted_delta_sum: 0.0,
            accepted_delta_sum: 0.0,
            biggest_attempted_increase: 0.0,
            biggest_accepted_increase: 0.0,
            recent_acceptance: VecDeque::with_capacity(RECENT_WINDOW),
            best_score_timeline: vec![BestScoreTimelinePoint {
                iteration: 0,
                elapsed_seconds: 0.0,
                best_score: initial_score,
            }],
            repeat_guided_swap_telemetry: RepeatGuidedSwapBenchmarkTelemetry::default(),
            sgp_week_pair_tabu_telemetry: None,
            memetic_telemetry: None,
            move_metrics: MoveFamilyBenchmarkTelemetrySummary::default(),
            policy_memory: SearchPolicyMemory::default(),
        }
    }

    pub(crate) fn record_repeat_guided_swap_sampling(
        &mut self,
        guided_attempts: u64,
        guided_successes: u64,
        guided_fallback_to_random: u64,
        guided_previewed_candidates: u64,
    ) {
        self.repeat_guided_swap_telemetry.guided_attempts += guided_attempts;
        self.repeat_guided_swap_telemetry.guided_successes += guided_successes;
        self.repeat_guided_swap_telemetry.guided_fallback_to_random += guided_fallback_to_random;
        self.repeat_guided_swap_telemetry
            .guided_previewed_candidates += guided_previewed_candidates;
    }

    pub(crate) fn record_tabu_sampling(
        &mut self,
        raw_tabu_hits: u64,
        prefilter_skips: u64,
        retry_exhaustions: u64,
        hard_blocks: u64,
        aspiration_preview_surfaces: u64,
    ) {
        if raw_tabu_hits == 0
            && prefilter_skips == 0
            && retry_exhaustions == 0
            && hard_blocks == 0
            && aspiration_preview_surfaces == 0
        {
            return;
        }
        let telemetry = self
            .sgp_week_pair_tabu_telemetry
            .get_or_insert_with(SgpWeekPairTabuBenchmarkTelemetry::default);
        telemetry.raw_tabu_hits += raw_tabu_hits;
        telemetry.prefilter_skips += prefilter_skips;
        telemetry.retry_exhaustions += retry_exhaustions;
        telemetry.hard_blocks += hard_blocks;
        telemetry.aspiration_preview_surfaces += aspiration_preview_surfaces;
    }

    pub(crate) fn record_tabu_aspiration_override(&mut self) {
        let telemetry = self
            .sgp_week_pair_tabu_telemetry
            .get_or_insert_with(SgpWeekPairTabuBenchmarkTelemetry::default);
        telemetry.aspiration_overrides += 1;
    }

    pub(crate) fn record_tabu_realized_tenure(&mut self, tenure: u64) {
        let telemetry = self
            .sgp_week_pair_tabu_telemetry
            .get_or_insert_with(SgpWeekPairTabuBenchmarkTelemetry::default);
        telemetry.recorded_swaps += 1;
        telemetry.realized_tenure_sum += tenure;
        telemetry.realized_tenure_min = Some(
            telemetry
                .realized_tenure_min
                .map_or(tenure, |current| current.min(tenure)),
        );
        telemetry.realized_tenure_max = Some(
            telemetry
                .realized_tenure_max
                .map_or(tenure, |current| current.max(tenure)),
        );
    }

    pub(crate) fn record_preview_attempt(
        &mut self,
        family: MoveFamily,
        preview_seconds: f64,
        delta_score: f64,
    ) {
        let metrics = family_metrics_mut(&mut self.move_metrics, family);
        metrics.attempts += 1;
        metrics.preview_seconds += preview_seconds;
        self.attempted_delta_sum += delta_score;
        self.biggest_attempted_increase = self.biggest_attempted_increase.max(delta_score.max(0.0));
    }

    pub(crate) fn record_accepted_move(
        &mut self,
        family: MoveFamily,
        apply_seconds: f64,
        delta_score: f64,
        escaped_local_optimum: bool,
    ) {
        let metrics = family_metrics_mut(&mut self.move_metrics, family);
        metrics.accepted += 1;
        if delta_score < 0.0 {
            metrics.improving_accepts += 1;
            self.accepted_downhill_moves += 1;
        } else if delta_score > 0.0 {
            self.accepted_uphill_moves += 1;
        } else {
            self.accepted_neutral_moves += 1;
        }
        metrics.apply_seconds += apply_seconds;
        self.accepted_delta_sum += delta_score;
        if escaped_local_optimum {
            self.local_optima_escapes += 1;
            self.biggest_accepted_increase = self.biggest_accepted_increase.max(delta_score);
        }
    }

    pub(crate) fn record_rejected_move(&mut self, family: MoveFamily) {
        family_metrics_mut(&mut self.move_metrics, family).rejected += 1;
        self.record_no_improvement_step();
        self.push_recent_acceptance(false);
    }

    pub(crate) fn record_no_candidate(&mut self) {
        self.record_no_improvement_step();
        self.push_recent_acceptance(false);
    }

    pub(crate) fn refresh_best_from_current(
        &mut self,
        iteration: u64,
        elapsed_seconds: f64,
    ) -> bool {
        if self.current_state.total_score < self.best_score {
            self.best_score = self.current_state.total_score;
            self.best_state = self.current_state.clone();
            self.no_improvement_count = 0;
            self.best_score_timeline.push(BestScoreTimelinePoint {
                iteration: iteration + 1,
                elapsed_seconds,
                best_score: self.best_score,
            });
            true
        } else {
            self.record_no_improvement_step();
            false
        }
    }

    pub(crate) fn record_acceptance_result(&mut self, accepted: bool) {
        self.push_recent_acceptance(accepted);
    }

    pub(crate) fn total_accepted_moves(&self) -> u64 {
        self.move_metrics.swap.accepted
            + self.move_metrics.transfer.accepted
            + self.move_metrics.clique_swap.accepted
    }

    pub(crate) fn finish_iteration(&mut self, iteration: u64) {
        self.iterations_completed = iteration + 1;
    }

    #[allow(clippy::too_many_arguments)]
    pub(crate) fn to_progress_update(
        &self,
        run_context: &SearchRunContext,
        iteration: u64,
        temperature: f64,
        elapsed_seconds: f64,
        stop_reason: Option<StopReason>,
    ) -> ProgressUpdate {
        let completed_iterations = if self.iterations_completed == 0
            && matches!(stop_reason, Some(StopReason::OptimalScoreReached))
        {
            0
        } else {
            self.iterations_completed.max(iteration.saturating_add(1))
        };
        let total_attempts = self.move_metrics.swap.attempts
            + self.move_metrics.transfer.attempts
            + self.move_metrics.clique_swap.attempts;
        let total_accepted = self.move_metrics.swap.accepted
            + self.move_metrics.transfer.accepted
            + self.move_metrics.clique_swap.accepted;
        let overall_acceptance_rate = ratio(total_accepted, total_attempts);
        let recent_acceptance_rate = if self.recent_acceptance.is_empty() {
            0.0
        } else {
            self.recent_acceptance
                .iter()
                .filter(|accepted| **accepted)
                .count() as f64
                / self.recent_acceptance.len() as f64
        };

        ProgressUpdate {
            iteration: completed_iterations,
            max_iterations: displayed_total_iterations(
                completed_iterations,
                run_context.max_iterations,
                elapsed_seconds,
                run_context.time_limit_seconds,
                stop_reason,
            ),
            temperature,
            current_score: self.current_state.total_score,
            best_score: self.best_state.total_score,
            current_contacts: self.current_state.unique_contacts as i32,
            best_contacts: self.best_state.unique_contacts as i32,
            repetition_penalty: self.current_state.repetition_penalty_raw,
            elapsed_seconds,
            no_improvement_count: self.no_improvement_count,
            clique_swaps_tried: self.move_metrics.clique_swap.attempts,
            clique_swaps_accepted: self.move_metrics.clique_swap.accepted,
            clique_swaps_rejected: self.move_metrics.clique_swap.rejected,
            transfers_tried: self.move_metrics.transfer.attempts,
            transfers_accepted: self.move_metrics.transfer.accepted,
            transfers_rejected: self.move_metrics.transfer.rejected,
            swaps_tried: self.move_metrics.swap.attempts,
            swaps_accepted: self.move_metrics.swap.accepted,
            swaps_rejected: self.move_metrics.swap.rejected,
            overall_acceptance_rate,
            recent_acceptance_rate,
            avg_attempted_move_delta: average_delta(self.attempted_delta_sum, total_attempts),
            avg_accepted_move_delta: average_delta(self.accepted_delta_sum, total_accepted),
            biggest_accepted_increase: self.biggest_accepted_increase,
            biggest_attempted_increase: self.biggest_attempted_increase,
            current_repetition_penalty: self.current_state.weighted_repetition_penalty,
            current_balance_penalty: self.current_state.attribute_balance_penalty,
            current_constraint_penalty: self.current_state.constraint_penalty_weighted,
            best_repetition_penalty: self.best_state.weighted_repetition_penalty,
            best_balance_penalty: self.best_state.attribute_balance_penalty,
            best_constraint_penalty: self.best_state.constraint_penalty_weighted,
            reheats_performed: 0,
            iterations_since_last_reheat: completed_iterations,
            local_optima_escapes: self.local_optima_escapes,
            avg_time_per_iteration_ms: if completed_iterations == 0 {
                0.0
            } else {
                elapsed_seconds * 1000.0 / completed_iterations as f64
            },
            cooling_progress: super::acceptance::cooling_progress(
                iteration,
                run_context.max_iterations,
                elapsed_seconds,
                run_context.time_limit_seconds,
            ),
            clique_swap_success_rate: ratio(
                self.move_metrics.clique_swap.accepted,
                self.move_metrics.clique_swap.attempts,
            ),
            transfer_success_rate: ratio(
                self.move_metrics.transfer.accepted,
                self.move_metrics.transfer.attempts,
            ),
            swap_success_rate: ratio(
                self.move_metrics.swap.accepted,
                self.move_metrics.swap.attempts,
            ),
            score_variance: 0.0,
            search_efficiency: if elapsed_seconds > 0.0 {
                (self.best_state.total_score - self.current_state.total_score).abs()
                    / elapsed_seconds
            } else {
                0.0
            },
            best_schedule: None,
            effective_seed: Some(run_context.effective_seed),
            move_policy: Some(run_context.move_policy.clone()),
            stop_reason,
        }
    }

    pub(crate) fn to_benchmark_telemetry(
        &self,
        run_context: &SearchRunContext,
        stop_reason: StopReason,
        search_seconds: f64,
    ) -> SolverBenchmarkTelemetry {
        SolverBenchmarkTelemetry {
            effective_seed: run_context.effective_seed,
            move_policy: run_context.move_policy.clone(),
            stop_reason,
            iterations_completed: self.iterations_completed,
            no_improvement_count: self.no_improvement_count,
            max_no_improvement_streak: self.max_no_improvement_streak,
            reheats_performed: 0,
            accepted_uphill_moves: self.accepted_uphill_moves,
            accepted_downhill_moves: self.accepted_downhill_moves,
            accepted_neutral_moves: self.accepted_neutral_moves,
            restart_count: None,
            perturbation_count: self
                .policy_memory
                .ils
                .as_ref()
                .map(|memory| memory.perturbation_round),
            initial_score: self.initial_score,
            best_score: self.best_state.total_score,
            final_score: self.best_state.total_score,
            initialization_seconds: 0.0,
            search_seconds,
            finalization_seconds: 0.0,
            total_seconds: search_seconds,
            iterations_per_second: if search_seconds > 0.0 {
                self.iterations_completed as f64 / search_seconds
            } else {
                0.0
            },
            best_score_timeline: self.best_score_timeline.clone(),
            repeat_guided_swaps: self.repeat_guided_swap_telemetry.clone(),
            sgp_week_pair_tabu: self.sgp_week_pair_tabu_telemetry.clone(),
            memetic: self.memetic_telemetry.clone(),
            moves: self.move_metrics.clone(),
        }
    }

    fn record_no_improvement_step(&mut self) {
        self.no_improvement_count += 1;
        self.max_no_improvement_streak = self
            .max_no_improvement_streak
            .max(self.no_improvement_count);
    }

    fn push_recent_acceptance(&mut self, accepted: bool) {
        if self.recent_acceptance.len() == RECENT_WINDOW {
            self.recent_acceptance.pop_front();
        }
        self.recent_acceptance.push_back(accepted);
    }
}

fn family_metrics_mut(
    summary: &mut MoveFamilyBenchmarkTelemetrySummary,
    family: MoveFamily,
) -> &mut MoveFamilyBenchmarkTelemetry {
    match family {
        MoveFamily::Swap => &mut summary.swap,
        MoveFamily::Transfer => &mut summary.transfer,
        MoveFamily::CliqueSwap => &mut summary.clique_swap,
    }
}

fn average_delta(sum: f64, count: u64) -> f64 {
    if count == 0 {
        0.0
    } else {
        sum / count as f64
    }
}

fn ratio(numerator: u64, denominator: u64) -> f64 {
    if denominator == 0 {
        0.0
    } else {
        numerator as f64 / denominator as f64
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use crate::models::{
        ApiInput, Constraint, Group, Objective, Person, ProblemDefinition, RepeatEncounterParams,
        Solver3CorrectnessLaneParams, Solver3HotspotGuidanceParams, Solver3LocalImproverMode,
        Solver3LocalImproverParams, Solver3Params, Solver3RepeatGuidedSwapParams,
        Solver3SearchDriverMode, Solver3SearchDriverParams,
        Solver3SgpWeekPairTabuParams, Solver3SgpWeekPairTabuTenureMode,
        SolverConfiguration, SolverParams, StopConditions,
    };

    use super::{SearchProgressState, SearchRunContext};
    use crate::solver3::runtime_state::RuntimeState;

    fn solver3_config() -> SolverConfiguration {
        SolverConfiguration {
            solver_type: "solver3".to_string(),
            stop_conditions: StopConditions {
                max_iterations: Some(123),
                time_limit_seconds: Some(9),
                no_improvement_iterations: Some(17),
                stop_on_optimal_score: true,
            },
            solver_params: SolverParams::Solver3(Solver3Params::default()),
            logging: Default::default(),
            telemetry: Default::default(),
            seed: Some(7),
            move_policy: None,
            allowed_sessions: None,
        }
    }

    fn simple_state() -> RuntimeState {
        let input = ApiInput {
            problem: ProblemDefinition {
                people: (0..4)
                    .map(|i| Person {
                        id: format!("p{}", i),
                        attributes: HashMap::new(),
                        sessions: None,
                    })
                    .collect(),
                groups: vec![
                    Group {
                        id: "g0".into(),
                        size: 2,
                        session_sizes: None,
                    },
                    Group {
                        id: "g1".into(),
                        size: 2,
                        session_sizes: None,
                    },
                ],
                num_sessions: 2,
            },
            initial_schedule: None,
            construction_seed_schedule: None,
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".into(),
                weight: 1.0,
            }],
            constraints: vec![],
            solver: solver3_config(),
        };
        RuntimeState::from_input(&input).unwrap()
    }

    fn repeat_state() -> RuntimeState {
        let mut input = ApiInput {
            problem: ProblemDefinition {
                people: (0..4)
                    .map(|i| Person {
                        id: format!("p{}", i),
                        attributes: HashMap::new(),
                        sessions: None,
                    })
                    .collect(),
                groups: vec![
                    Group {
                        id: "g0".into(),
                        size: 2,
                        session_sizes: None,
                    },
                    Group {
                        id: "g1".into(),
                        size: 2,
                        session_sizes: None,
                    },
                ],
                num_sessions: 2,
            },
            initial_schedule: None,
            construction_seed_schedule: None,
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".into(),
                weight: 1.0,
            }],
            constraints: vec![],
            solver: solver3_config(),
        };
        input.constraints = vec![Constraint::RepeatEncounter(RepeatEncounterParams {
            max_allowed_encounters: 1,
            penalty_function: "linear".into(),
            penalty_weight: 100.0,
        })];
        RuntimeState::from_input(&input).unwrap()
    }

    #[test]
    fn run_context_captures_search_limits_and_allowed_sessions() {
        let state = simple_state();
        let context = SearchRunContext::from_solver(&solver3_config(), &state, 7).unwrap();
        assert_eq!(context.effective_seed, 7);
        assert_eq!(
            context.search_driver_mode,
            Solver3SearchDriverMode::SingleState
        );
        assert_eq!(
            context.local_improver_mode,
            Solver3LocalImproverMode::RecordToRecord
        );
        assert_eq!(context.max_iterations, 123);
        assert_eq!(context.no_improvement_limit, Some(17));
        assert_eq!(context.time_limit_seconds, Some(9));
        assert_eq!(context.allowed_sessions, vec![0, 1]);
        assert!(!context.correctness_lane_enabled);
        assert_eq!(context.correctness_sample_every_accepted_moves, 16);
        assert!(!context.repeat_guided_swaps_enabled);
        assert_eq!(context.repeat_guided_swap_probability, 0.5);
        assert_eq!(context.repeat_guided_swap_candidate_preview_budget, 8);
        assert_eq!(context.sgp_week_pair_tabu.as_ref().unwrap().tenure_min, 8);
        assert_eq!(context.sgp_week_pair_tabu.as_ref().unwrap().tenure_max, 32);
        assert_eq!(context.sgp_week_pair_tabu.as_ref().unwrap().retry_cap, 16);
        assert_eq!(
            context.sgp_week_pair_tabu.as_ref().unwrap().tenure_mode,
            Solver3SgpWeekPairTabuTenureMode::FixedInterval
        );
        assert_eq!(
            context
                .sgp_week_pair_tabu
                .as_ref()
                .unwrap()
                .session_scale_reference_participants,
            32
        );
        assert_eq!(
            context
                .sgp_week_pair_tabu
                .as_ref()
                .unwrap()
                .reactive_no_improvement_window,
            100_000
        );
        assert_eq!(
            context
                .sgp_week_pair_tabu
                .as_ref()
                .unwrap()
                .reactive_max_multiplier,
            4
        );
        assert_eq!(
            context
                .steady_state_memetic
                .as_ref()
                .unwrap()
                .population_size,
            6
        );
        assert_eq!(
            context
                .steady_state_memetic
                .as_ref()
                .unwrap()
                .child_polish_max_iterations,
            64
        );
        assert!(
            context
                .sgp_week_pair_tabu
                .as_ref()
                .unwrap()
                .aspiration_enabled
        );
    }

    #[test]
    fn run_context_rejects_zero_correctness_sample_interval() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            correctness_lane: Solver3CorrectnessLaneParams {
                enabled: false,
                sample_every_accepted_moves: 0,
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("correctness_lane.sample_every_accepted_moves"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn run_context_rejects_zero_tabu_tenure_min() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            local_improver: Solver3LocalImproverParams {
                sgp_week_pair_tabu: Solver3SgpWeekPairTabuParams {
                    tenure_min: 0,
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string().contains("sgp_week_pair_tabu.tenure_min"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn run_context_rejects_tabu_tenure_max_below_min() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            local_improver: Solver3LocalImproverParams {
                sgp_week_pair_tabu: Solver3SgpWeekPairTabuParams {
                    tenure_min: 9,
                    tenure_max: 8,
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string().contains("sgp_week_pair_tabu.tenure_max"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn run_context_rejects_zero_tabu_retry_cap() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            local_improver: Solver3LocalImproverParams {
                sgp_week_pair_tabu: Solver3SgpWeekPairTabuParams {
                    retry_cap: 0,
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string().contains("sgp_week_pair_tabu.retry_cap"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn run_context_rejects_zero_session_scale_reference_participants() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            local_improver: Solver3LocalImproverParams {
                sgp_week_pair_tabu: Solver3SgpWeekPairTabuParams {
                    session_scale_reference_participants: 0,
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("sgp_week_pair_tabu.session_scale_reference_participants"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn run_context_rejects_zero_reactive_tabu_window() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            local_improver: Solver3LocalImproverParams {
                sgp_week_pair_tabu: Solver3SgpWeekPairTabuParams {
                    reactive_no_improvement_window: 0,
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("sgp_week_pair_tabu.reactive_no_improvement_window"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn run_context_rejects_zero_reactive_tabu_max_multiplier() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            local_improver: Solver3LocalImproverParams {
                sgp_week_pair_tabu: Solver3SgpWeekPairTabuParams {
                    reactive_max_multiplier: 0,
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("sgp_week_pair_tabu.reactive_max_multiplier"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn run_context_accepts_memetic_driver_with_record_to_record() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                mode: Solver3SearchDriverMode::SteadyStateMemetic,
                ..Default::default()
            },
            ..Default::default()
        });

        let context = SearchRunContext::from_solver(&config, &state, 7).unwrap();
        assert_eq!(
            context.search_driver_mode,
            Solver3SearchDriverMode::SteadyStateMemetic
        );
    }

    #[test]
    fn run_context_accepts_sgp_week_pair_tabu_local_improver_mode() {
        let state = repeat_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            local_improver: Solver3LocalImproverParams {
                mode: Solver3LocalImproverMode::SgpWeekPairTabu,
                ..Default::default()
            },
            ..Default::default()
        });

        let context = SearchRunContext::from_solver(&config, &state, 7).unwrap();
        assert_eq!(
            context.local_improver_mode,
            Solver3LocalImproverMode::SgpWeekPairTabu
        );
        assert!(context.sgp_week_pair_tabu.is_some());
        assert!(
            !context
                .sgp_week_pair_tabu
                .unwrap()
                .conflict_restricted_swap_sampling_enabled
        );
    }

    #[test]
    fn run_context_captures_conflict_restricted_tabu_sampling_flag() {
        let state = repeat_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            local_improver: Solver3LocalImproverParams {
                mode: Solver3LocalImproverMode::SgpWeekPairTabu,
                sgp_week_pair_tabu: Solver3SgpWeekPairTabuParams {
                    conflict_restricted_swap_sampling_enabled: true,
                    ..Default::default()
                },
            },
            ..Default::default()
        });

        let context = SearchRunContext::from_solver(&config, &state, 7).unwrap();
        assert!(
            context
                .sgp_week_pair_tabu
                .unwrap()
                .conflict_restricted_swap_sampling_enabled
        );
    }

    #[test]
    fn run_context_captures_scaled_tenure_mode() {
        let state = repeat_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            local_improver: Solver3LocalImproverParams {
                mode: Solver3LocalImproverMode::SgpWeekPairTabu,
                sgp_week_pair_tabu: Solver3SgpWeekPairTabuParams {
                    tenure_mode: Solver3SgpWeekPairTabuTenureMode::SessionParticipantScaled,
                    session_scale_reference_participants: 24,
                    ..Default::default()
                },
            },
            ..Default::default()
        });

        let context = SearchRunContext::from_solver(&config, &state, 7).unwrap();
        assert_eq!(
            context.sgp_week_pair_tabu.unwrap().tenure_mode,
            Solver3SgpWeekPairTabuTenureMode::SessionParticipantScaled
        );
    }

    #[test]
    fn run_context_captures_reactive_tenure_mode() {
        let state = repeat_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            local_improver: Solver3LocalImproverParams {
                mode: Solver3LocalImproverMode::SgpWeekPairTabu,
                sgp_week_pair_tabu: Solver3SgpWeekPairTabuParams {
                    tenure_mode: Solver3SgpWeekPairTabuTenureMode::ReactiveNoImprovementScaled,
                    reactive_no_improvement_window: 50_000,
                    reactive_max_multiplier: 5,
                    ..Default::default()
                },
            },
            ..Default::default()
        });

        let context = SearchRunContext::from_solver(&config, &state, 7).unwrap();
        let tabu = context.sgp_week_pair_tabu.unwrap();
        assert_eq!(
            tabu.tenure_mode,
            Solver3SgpWeekPairTabuTenureMode::ReactiveNoImprovementScaled
        );
        assert_eq!(tabu.reactive_no_improvement_window, 50_000);
        assert_eq!(tabu.reactive_max_multiplier, 5);
    }

    #[test]
    fn run_context_rejects_tabu_local_improver_without_repeat_constraint() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            local_improver: Solver3LocalImproverParams {
                mode: Solver3LocalImproverMode::SgpWeekPairTabu,
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("requires a repeat_encounter constraint"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn run_context_rejects_memetic_driver_when_move_policy_disallows_swap() {
        let state = simple_state();
        let mut config = solver3_config();
        config.move_policy = Some(crate::models::MovePolicy {
            allowed_families: Some(vec![crate::models::MoveFamily::Transfer]),
            ..Default::default()
        });
        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                mode: Solver3SearchDriverMode::SteadyStateMemetic,
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("steady_state_memetic requires move_policy to allow swap"),
            "unexpected error: {err}"
        );
    }

    #[cfg(not(feature = "solver3-oracle-checks"))]
    #[test]
    fn run_context_rejects_correctness_lane_when_feature_is_disabled() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            correctness_lane: Solver3CorrectnessLaneParams {
                enabled: true,
                sample_every_accepted_moves: 2,
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string().contains("solver3-oracle-checks"),
            "unexpected error: {err}"
        );
    }

    #[cfg(feature = "solver3-oracle-checks")]
    #[test]
    fn run_context_accepts_correctness_lane_when_feature_is_enabled() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            correctness_lane: Solver3CorrectnessLaneParams {
                enabled: true,
                sample_every_accepted_moves: 3,
            },
            ..Default::default()
        });

        let context = SearchRunContext::from_solver(&config, &state, 7).unwrap();
        assert!(context.correctness_lane_enabled);
        assert_eq!(context.correctness_sample_every_accepted_moves, 3);
    }

    #[test]
    fn run_context_rejects_out_of_range_repeat_guidance_probability() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            hotspot_guidance: Solver3HotspotGuidanceParams {
                repeat_guided_swaps: Solver3RepeatGuidedSwapParams {
                    enabled: true,
                    guided_proposal_probability: 1.5,
                    candidate_preview_budget: 8,
                },
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("hotspot_guidance.repeat_guided_swaps.guided_proposal_probability"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn run_context_rejects_zero_repeat_guidance_budget_when_enabled() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            hotspot_guidance: Solver3HotspotGuidanceParams {
                repeat_guided_swaps: Solver3RepeatGuidedSwapParams {
                    enabled: true,
                    guided_proposal_probability: 0.5,
                    candidate_preview_budget: 0,
                },
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("hotspot_guidance.repeat_guided_swaps.candidate_preview_budget"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn run_context_auto_disables_repeat_guidance_without_repeat_constraint() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            hotspot_guidance: Solver3HotspotGuidanceParams {
                repeat_guided_swaps: Solver3RepeatGuidedSwapParams {
                    enabled: true,
                    guided_proposal_probability: 0.75,
                    candidate_preview_budget: 6,
                },
            },
            ..Default::default()
        });

        let context = SearchRunContext::from_solver(&config, &state, 7).unwrap();
        assert!(!context.repeat_guided_swaps_enabled);
        assert_eq!(context.repeat_guided_swap_probability, 0.75);
        assert_eq!(context.repeat_guided_swap_candidate_preview_budget, 6);
    }

    #[test]
    fn progress_state_tracks_acceptance_and_best_state() {
        let mut progress = SearchProgressState::new(simple_state());
        progress.record_preview_attempt(crate::models::MoveFamily::Swap, 0.25, 1.5);
        progress.record_accepted_move(crate::models::MoveFamily::Swap, 0.1, 1.5, true);
        progress.record_acceptance_result(true);
        progress.current_state.total_score -= 2.0;
        progress.refresh_best_from_current(4, 0.42);
        progress.finish_iteration(4);

        assert_eq!(progress.move_metrics.swap.attempts, 1);
        assert_eq!(progress.move_metrics.swap.accepted, 1);
        assert_eq!(progress.local_optima_escapes, 1);
        assert_eq!(progress.iterations_completed, 5);
        assert_eq!(progress.no_improvement_count, 0);
        assert_eq!(progress.recent_acceptance.back(), Some(&true));
        assert_eq!(
            progress.best_state.total_score,
            progress.current_state.total_score
        );
    }

    #[test]
    fn progress_update_reports_completed_iterations_for_ui() {
        let state = simple_state();
        let run_context = SearchRunContext::from_solver(&solver3_config(), &state, 7).unwrap();
        let mut progress = SearchProgressState::new(state);
        progress.finish_iteration(4);

        let update = progress.to_progress_update(&run_context, 4, 1.0, 0.5, None);

        assert_eq!(update.iteration, 5);
        assert_eq!(update.iterations_since_last_reheat, 5);
    }
}
