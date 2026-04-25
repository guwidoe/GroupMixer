use crate::models::{DonorSessionChoiceTelemetry, StopReason};

use super::super::archive::ArchiveUpdateReason;
use super::super::context::SearchProgressState;
use super::retention::AdaptiveRawChildRetentionDecision;
use super::types::DonorSessionChoice;

pub(super) fn absorb_local_search_chunk(
    aggregate: &mut SearchProgressState,
    local: &SearchProgressState,
    iteration_offset: u64,
    elapsed_offset: f64,
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

pub(super) fn record_archive_update(search: &mut SearchProgressState, reason: ArchiveUpdateReason) {
    let telemetry = search
        .donor_session_transplant_telemetry
        .get_or_insert_with(Default::default);
    match reason {
        ArchiveUpdateReason::Added => telemetry.archive_additions += 1,
        ArchiveUpdateReason::ReplacedExactDuplicate => {
            telemetry.archive_exact_duplicate_replacements += 1
        }
        ArchiveUpdateReason::ReplacedNearDuplicate => {
            telemetry.archive_near_duplicate_replacements += 1
        }
        ArchiveUpdateReason::ReplacedRedundantMember => telemetry.archive_redundant_evictions += 1,
        ArchiveUpdateReason::RejectedExactDuplicate => {
            telemetry.archive_rejected_exact_duplicates += 1
        }
        ArchiveUpdateReason::RejectedNearDuplicate => {
            telemetry.archive_rejected_near_duplicates += 1
        }
        ArchiveUpdateReason::RejectedNotCompetitive => {
            telemetry.archive_rejected_not_competitive += 1
        }
    }
}

pub(super) fn record_raw_child_retention(
    search: &mut SearchProgressState,
    choice: DonorSessionChoice,
    pre_recombination_incumbent_score: f64,
    donor_score: f64,
    raw_child_score: f64,
    raw_child_delta: f64,
    decision: AdaptiveRawChildRetentionDecision,
    stagnation_windows_at_trigger: u64,
    latest_threshold: Option<f64>,
) {
    let telemetry = search
        .donor_session_transplant_telemetry
        .get_or_insert_with(Default::default);
    telemetry.raw_children_evaluated += 1;
    telemetry.raw_child_delta_sum += raw_child_delta;
    telemetry.raw_child_delta_min = Some(
        telemetry
            .raw_child_delta_min
            .map_or(raw_child_delta, |current| current.min(raw_child_delta)),
    );
    telemetry.raw_child_delta_max = Some(
        telemetry
            .raw_child_delta_max
            .map_or(raw_child_delta, |current| current.max(raw_child_delta)),
    );
    telemetry.adaptive_discard_threshold = latest_threshold;
    telemetry.donor_choices.push(DonorSessionChoiceTelemetry {
        donor_archive_idx: choice.donor_archive_idx as u32,
        session_idx: choice.session_idx as u32,
        session_disagreement_count: choice.session_disagreement_count as u32,
        candidate_pool: choice.candidate_pool.telemetry(),
        session_viability_tier: choice.session_viability_tier.telemetry(),
        conflict_burden_delta: choice.conflict_burden_delta,
        pre_recombination_incumbent_score,
        donor_score,
        raw_child_score,
        raw_child_delta,
        adaptive_discard_threshold: decision.discard_threshold,
        retained_for_polish: decision.retained_for_polish,
        stagnation_windows_at_trigger,
        child_polish_budget_iterations: None,
        child_polish_budget_no_improvement_iterations: None,
        post_polish_best_score: None,
        raw_to_polished_delta: None,
        incumbent_to_polished_delta: None,
        became_new_incumbent: None,
        set_new_best_post_polish_score: None,
        polish_stop_reason: None,
        polish_iterations_completed: None,
    });
}

pub(super) fn record_child_polish_budget(
    search: &mut SearchProgressState,
    polish_budget_iterations: u64,
    polish_budget_no_improvement_iterations: u64,
) {
    let telemetry = search
        .donor_session_transplant_telemetry
        .get_or_insert_with(Default::default);
    telemetry.child_polish_budget_iterations_sum += polish_budget_iterations;
    telemetry.child_polish_budget_no_improvement_iterations_sum +=
        polish_budget_no_improvement_iterations;
    if let Some(choice) = telemetry.donor_choices.last_mut() {
        choice.child_polish_budget_iterations = Some(polish_budget_iterations);
        choice.child_polish_budget_no_improvement_iterations =
            Some(polish_budget_no_improvement_iterations);
    }
}

pub(super) fn record_child_polish(
    search: &mut SearchProgressState,
    local: &SearchProgressState,
    search_seconds: f64,
    polish_stop_reason: StopReason,
) {
    let telemetry = search
        .donor_session_transplant_telemetry
        .get_or_insert_with(Default::default);
    telemetry.polished_children += 1;
    telemetry.child_polish_iterations += local.iterations_completed;
    telemetry.child_polish_improving_moves += local.move_metrics.swap.improving_accepts
        + local.move_metrics.transfer.improving_accepts
        + local.move_metrics.clique_swap.improving_accepts;
    telemetry.child_polish_seconds += search_seconds;

    let post_polish_best_score = local.best_state.total_score;
    let previous_best_post_polish_score = telemetry.best_post_polish_score;
    let set_new_best_post_polish_score = previous_best_post_polish_score
        .map(|current| post_polish_best_score < current)
        .unwrap_or(true);
    telemetry.best_post_polish_score = Some(
        previous_best_post_polish_score.map_or(post_polish_best_score, |current| {
            current.min(post_polish_best_score)
        }),
    );
    telemetry.post_polish_score_sum += post_polish_best_score;
    telemetry.post_polish_score_min = Some(
        telemetry
            .post_polish_score_min
            .map_or(post_polish_best_score, |current| {
                current.min(post_polish_best_score)
            }),
    );
    telemetry.post_polish_score_max = Some(
        telemetry
            .post_polish_score_max
            .map_or(post_polish_best_score, |current| {
                current.max(post_polish_best_score)
            }),
    );

    if let Some((raw_child_score, pre_recombination_incumbent_score)) =
        telemetry.donor_choices.last().map(|choice| {
            (
                choice.raw_child_score,
                choice.pre_recombination_incumbent_score,
            )
        })
    {
        let raw_to_polished_delta = post_polish_best_score - raw_child_score;
        let incumbent_to_polished_delta =
            post_polish_best_score - pre_recombination_incumbent_score;
        let became_new_incumbent = incumbent_to_polished_delta < 0.0;

        telemetry.polished_child_vs_raw_delta_sum += raw_to_polished_delta;
        telemetry.polished_child_vs_raw_delta_min = Some(
            telemetry
                .polished_child_vs_raw_delta_min
                .map_or(raw_to_polished_delta, |current| {
                    current.min(raw_to_polished_delta)
                }),
        );
        telemetry.polished_child_vs_raw_delta_max = Some(
            telemetry
                .polished_child_vs_raw_delta_max
                .map_or(raw_to_polished_delta, |current| {
                    current.max(raw_to_polished_delta)
                }),
        );
        telemetry.polished_child_vs_incumbent_delta_sum += incumbent_to_polished_delta;
        telemetry.polished_child_vs_incumbent_delta_min = Some(
            telemetry
                .polished_child_vs_incumbent_delta_min
                .map_or(incumbent_to_polished_delta, |current| {
                    current.min(incumbent_to_polished_delta)
                }),
        );
        telemetry.polished_child_vs_incumbent_delta_max = Some(
            telemetry
                .polished_child_vs_incumbent_delta_max
                .map_or(incumbent_to_polished_delta, |current| {
                    current.max(incumbent_to_polished_delta)
                }),
        );

        let choice = telemetry
            .donor_choices
            .last_mut()
            .expect("donor choice should exist when recording child polish");
        choice.post_polish_best_score = Some(post_polish_best_score);
        choice.raw_to_polished_delta = Some(raw_to_polished_delta);
        choice.incumbent_to_polished_delta = Some(incumbent_to_polished_delta);
        choice.became_new_incumbent = Some(became_new_incumbent);
        choice.set_new_best_post_polish_score = Some(set_new_best_post_polish_score);
        choice.polish_stop_reason = Some(polish_stop_reason);
        choice.polish_iterations_completed = Some(local.iterations_completed);
    }
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
