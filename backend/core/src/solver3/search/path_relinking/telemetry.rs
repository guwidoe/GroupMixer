use crate::models::{
    BestScoreTimelinePoint, MoveFamilyBenchmarkTelemetry, MoveFamilyBenchmarkTelemetrySummary,
    ProgressCallback, RepeatGuidedSwapBenchmarkTelemetry, SgpWeekPairTabuBenchmarkTelemetry,
    StopReason,
};

use super::super::context::SearchProgressState;
use super::super::context::SearchRunContext;
use super::super::single_state::should_emit_progress_callback;
use super::super::single_state::LocalImproverRunResult;
use super::{get_current_time, get_elapsed_seconds, get_elapsed_seconds_between, TimePoint};

pub(super) fn merge_local_improver_run(
    aggregate: &mut SearchProgressState,
    outcome: &LocalImproverRunResult,
    iteration_offset: u64,
    elapsed_offset: f64,
) {
    aggregate.current_state = outcome.search.current_state.clone();
    if outcome.search.best_score < aggregate.best_score {
        aggregate.best_state = outcome.search.best_state.clone();
        aggregate.best_score = outcome.search.best_score;
    }
    aggregate.no_improvement_count = outcome.search.no_improvement_count;
    aggregate.max_no_improvement_streak = aggregate
        .max_no_improvement_streak
        .max(outcome.search.max_no_improvement_streak);
    aggregate.iterations_completed += outcome.search.iterations_completed;
    aggregate.local_optima_escapes += outcome.search.local_optima_escapes;
    aggregate.accepted_uphill_moves += outcome.search.accepted_uphill_moves;
    aggregate.accepted_downhill_moves += outcome.search.accepted_downhill_moves;
    aggregate.accepted_neutral_moves += outcome.search.accepted_neutral_moves;
    aggregate.attempted_delta_sum += outcome.search.attempted_delta_sum;
    aggregate.accepted_delta_sum += outcome.search.accepted_delta_sum;
    aggregate.biggest_attempted_increase = aggregate
        .biggest_attempted_increase
        .max(outcome.search.biggest_attempted_increase);
    aggregate.biggest_accepted_increase = aggregate
        .biggest_accepted_increase
        .max(outcome.search.biggest_accepted_increase);
    aggregate.recent_acceptance = outcome.search.recent_acceptance.clone();
    aggregate
        .best_score_timeline
        .extend(
            outcome
                .search
                .best_score_timeline
                .iter()
                .skip(1)
                .map(|point| BestScoreTimelinePoint {
                    iteration: point.iteration + iteration_offset,
                    elapsed_seconds: point.elapsed_seconds + elapsed_offset,
                    best_score: point.best_score,
                }),
        );
    merge_repeat_guided_swap_telemetry(
        &mut aggregate.repeat_guided_swap_telemetry,
        &outcome.search.repeat_guided_swap_telemetry,
    );
    merge_optional_tabu_telemetry(
        &mut aggregate.sgp_week_pair_tabu_telemetry,
        &outcome.search.sgp_week_pair_tabu_telemetry,
    );
    merge_move_family_summary(&mut aggregate.move_metrics, &outcome.search.move_metrics);
}

fn merge_repeat_guided_swap_telemetry(
    dest: &mut RepeatGuidedSwapBenchmarkTelemetry,
    src: &RepeatGuidedSwapBenchmarkTelemetry,
) {
    dest.guided_attempts += src.guided_attempts;
    dest.guided_successes += src.guided_successes;
    dest.guided_fallback_to_random += src.guided_fallback_to_random;
    dest.guided_previewed_candidates += src.guided_previewed_candidates;
}

fn merge_optional_tabu_telemetry(
    dest: &mut Option<SgpWeekPairTabuBenchmarkTelemetry>,
    src: &Option<SgpWeekPairTabuBenchmarkTelemetry>,
) {
    let Some(src) = src else {
        return;
    };
    let dest = dest.get_or_insert_with(SgpWeekPairTabuBenchmarkTelemetry::default);
    dest.raw_tabu_hits += src.raw_tabu_hits;
    dest.prefilter_skips += src.prefilter_skips;
    dest.retry_exhaustions += src.retry_exhaustions;
    dest.hard_blocks += src.hard_blocks;
    dest.aspiration_preview_surfaces += src.aspiration_preview_surfaces;
    dest.aspiration_overrides += src.aspiration_overrides;
    dest.recorded_swaps += src.recorded_swaps;
    dest.realized_tenure_sum += src.realized_tenure_sum;
    dest.realized_tenure_min = match (dest.realized_tenure_min, src.realized_tenure_min) {
        (Some(left), Some(right)) => Some(left.min(right)),
        (None, value) | (value, None) => value,
    };
    dest.realized_tenure_max = match (dest.realized_tenure_max, src.realized_tenure_max) {
        (Some(left), Some(right)) => Some(left.max(right)),
        (None, value) | (value, None) => value,
    };
}

fn merge_move_family_summary(
    dest: &mut MoveFamilyBenchmarkTelemetrySummary,
    src: &MoveFamilyBenchmarkTelemetrySummary,
) {
    merge_move_family_metrics(&mut dest.swap, &src.swap);
    merge_move_family_metrics(&mut dest.transfer, &src.transfer);
    merge_move_family_metrics(&mut dest.clique_swap, &src.clique_swap);
}

fn merge_move_family_metrics(
    dest: &mut MoveFamilyBenchmarkTelemetry,
    src: &MoveFamilyBenchmarkTelemetry,
) {
    dest.attempts += src.attempts;
    dest.accepted += src.accepted;
    dest.improving_accepts += src.improving_accepts;
    dest.rejected += src.rejected;
    dest.preview_seconds += src.preview_seconds;
    dest.apply_seconds += src.apply_seconds;
    dest.full_recalculation_count += src.full_recalculation_count;
    dest.full_recalculation_seconds += src.full_recalculation_seconds;
}

pub(super) fn maybe_emit_progress(
    aggregate: &SearchProgressState,
    run_context: &SearchRunContext,
    progress_callback: Option<&ProgressCallback>,
    total_started_at: TimePoint,
    last_progress_callback_at: &mut TimePoint,
) -> bool {
    let Some(callback) = progress_callback else {
        return false;
    };

    let current_time = get_current_time();
    let elapsed_since_last_callback =
        get_elapsed_seconds_between(*last_progress_callback_at, current_time);
    let iteration = aggregate.iterations_completed.saturating_sub(1);
    if !should_emit_progress_callback(iteration, elapsed_since_last_callback) {
        return false;
    }

    let elapsed_seconds = get_elapsed_seconds(total_started_at);
    let progress = aggregate.to_progress_update(run_context, iteration, 0.0, elapsed_seconds, None);
    if !(callback)(&progress) {
        let final_progress = aggregate.to_progress_update(
            run_context,
            iteration,
            0.0,
            elapsed_seconds,
            Some(StopReason::ProgressCallbackRequestedStop),
        );
        let _ = (callback)(&final_progress);
        return true;
    }

    *last_progress_callback_at = current_time;
    false
}

pub(super) fn absorb_local_search_chunk(
    aggregate: &mut SearchProgressState,
    local: &SearchProgressState,
    iteration_offset: u64,
    elapsed_offset: f64,
) {
    absorb_search_metrics_only(aggregate, local);

    for point in local.best_score_timeline.iter().skip(1) {
        if point.best_score < aggregate.best_score {
            aggregate
                .best_score_timeline
                .push(crate::models::BestScoreTimelinePoint {
                    iteration: iteration_offset + point.iteration,
                    elapsed_seconds: elapsed_offset + point.elapsed_seconds,
                    best_score: point.best_score,
                });
            aggregate.best_score = point.best_score;
            aggregate.best_state = local.best_state.clone();
        }
    }
}

pub(super) fn absorb_search_metrics_only(
    aggregate: &mut SearchProgressState,
    local: &SearchProgressState,
) {
    aggregate.accepted_uphill_moves += local.accepted_uphill_moves;
    aggregate.accepted_downhill_moves += local.accepted_downhill_moves;
    aggregate.accepted_neutral_moves += local.accepted_neutral_moves;
    aggregate.local_optima_escapes += local.local_optima_escapes;
    aggregate.attempted_delta_sum += local.attempted_delta_sum;
    aggregate.accepted_delta_sum += local.accepted_delta_sum;
    aggregate.biggest_attempted_increase = aggregate
        .biggest_attempted_increase
        .max(local.biggest_attempted_increase);
    aggregate.biggest_accepted_increase = aggregate
        .biggest_accepted_increase
        .max(local.biggest_accepted_increase);
    aggregate.recent_acceptance = local.recent_acceptance.clone();
    aggregate.record_repeat_guided_swap_sampling(
        local.repeat_guided_swap_telemetry.guided_attempts,
        local.repeat_guided_swap_telemetry.guided_successes,
        local.repeat_guided_swap_telemetry.guided_fallback_to_random,
        local
            .repeat_guided_swap_telemetry
            .guided_previewed_candidates,
    );
    absorb_family_metrics(&mut aggregate.move_metrics.swap, &local.move_metrics.swap);
    absorb_family_metrics(
        &mut aggregate.move_metrics.transfer,
        &local.move_metrics.transfer,
    );
    absorb_family_metrics(
        &mut aggregate.move_metrics.clique_swap,
        &local.move_metrics.clique_swap,
    );
    absorb_tabu_metrics(aggregate, local);
}

fn absorb_family_metrics(
    aggregate: &mut crate::models::MoveFamilyBenchmarkTelemetry,
    local: &crate::models::MoveFamilyBenchmarkTelemetry,
) {
    aggregate.attempts += local.attempts;
    aggregate.accepted += local.accepted;
    aggregate.improving_accepts += local.improving_accepts;
    aggregate.rejected += local.rejected;
    aggregate.preview_seconds += local.preview_seconds;
    aggregate.apply_seconds += local.apply_seconds;
    aggregate.full_recalculation_count += local.full_recalculation_count;
    aggregate.full_recalculation_seconds += local.full_recalculation_seconds;
}

fn absorb_tabu_metrics(aggregate: &mut SearchProgressState, local: &SearchProgressState) {
    let Some(local_tabu) = local.sgp_week_pair_tabu_telemetry.as_ref() else {
        return;
    };
    let aggregate_tabu = aggregate
        .sgp_week_pair_tabu_telemetry
        .get_or_insert_with(Default::default);
    aggregate_tabu.raw_tabu_hits += local_tabu.raw_tabu_hits;
    aggregate_tabu.prefilter_skips += local_tabu.prefilter_skips;
    aggregate_tabu.retry_exhaustions += local_tabu.retry_exhaustions;
    aggregate_tabu.hard_blocks += local_tabu.hard_blocks;
    aggregate_tabu.aspiration_preview_surfaces += local_tabu.aspiration_preview_surfaces;
    aggregate_tabu.aspiration_overrides += local_tabu.aspiration_overrides;
    aggregate_tabu.recorded_swaps += local_tabu.recorded_swaps;
    aggregate_tabu.realized_tenure_sum += local_tabu.realized_tenure_sum;
    aggregate_tabu.realized_tenure_min = match (
        aggregate_tabu.realized_tenure_min,
        local_tabu.realized_tenure_min,
    ) {
        (Some(left), Some(right)) => Some(left.min(right)),
        (Some(left), None) => Some(left),
        (None, Some(right)) => Some(right),
        (None, None) => None,
    };
    aggregate_tabu.realized_tenure_max = match (
        aggregate_tabu.realized_tenure_max,
        local_tabu.realized_tenure_max,
    ) {
        (Some(left), Some(right)) => Some(left.max(right)),
        (Some(left), None) => Some(left),
        (None, Some(right)) => Some(right),
        (None, None) => None,
    };
}
