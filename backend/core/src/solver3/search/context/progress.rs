use std::collections::VecDeque;

use crate::models::{
    BestScoreTimelinePoint, DonorSessionTransplantBenchmarkTelemetry, MemeticBenchmarkTelemetry,
    MoveFamily, MoveFamilyBenchmarkTelemetry, MoveFamilyBenchmarkTelemetrySummary,
    MultiRootBalancedSessionInheritanceBenchmarkTelemetry, ProgressUpdate,
    RepeatGuidedSwapBenchmarkTelemetry, SessionAlignedPathRelinkingBenchmarkTelemetry,
    SgpWeekPairTabuBenchmarkTelemetry, SolverBenchmarkTelemetry, StopReason,
};
use crate::runtime_target::displayed_total_iterations;

use super::super::super::runtime_state::RuntimeState;
use super::super::acceptance;
use super::{SearchPolicyMemory, SearchRunContext};

const RECENT_WINDOW: usize = 100;

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
    pub(crate) donor_session_transplant_telemetry: Option<DonorSessionTransplantBenchmarkTelemetry>,
    pub(crate) session_aligned_path_relinking_telemetry:
        Option<SessionAlignedPathRelinkingBenchmarkTelemetry>,
    pub(crate) multi_root_balanced_session_inheritance_telemetry:
        Option<MultiRootBalancedSessionInheritanceBenchmarkTelemetry>,
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
            donor_session_transplant_telemetry: None,
            session_aligned_path_relinking_telemetry: None,
            multi_root_balanced_session_inheritance_telemetry: None,
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
            cooling_progress: acceptance::cooling_progress(
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
            donor_session_transplant: self.donor_session_transplant_telemetry.clone(),
            session_aligned_path_relinking: self.session_aligned_path_relinking_telemetry.clone(),
            multi_root_balanced_session_inheritance: self
                .multi_root_balanced_session_inheritance_telemetry
                .clone(),
            solver4_paper_trace: None,
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
