use rand::{RngExt, SeedableRng};
use rand_chacha::ChaCha12Rng;

use crate::models::{
    BenchmarkEvent, BenchmarkObserver, DonorSessionTransplantBenchmarkTelemetry, ProgressCallback,
    SolverResult, StopReason,
};
use crate::solver_support::SolverError;

use super::super::moves::apply_swap_runtime_preview;
use super::super::runtime_state::RuntimeState;
use super::archive::EliteArchive;
use super::certification::certify_swap_local_optimum;
use super::context::{SearchProgressState, SearchRunContext};
use super::donor_selection::{
    archive_config_for_donor_session_mode, select_donor_session_from_summary,
};
use super::retention::{child_polish_budget_for_stagnation, AdaptiveRawChildRetentionState};
use super::single_state::{
    build_solver_result, polish_state, should_emit_progress_callback, LocalImproverBudget,
};
use super::telemetry::{
    absorb_local_search_chunk, record_archive_update, record_child_polish,
    record_child_polish_budget, record_raw_child_retention,
};
use super::trigger::{DonorSessionTriggerEligibility, DonorSessionTriggerState};
use super::types::{
    get_current_time, get_elapsed_seconds, get_elapsed_seconds_between, time_limit_exceeded,
    DonorSessionSelectionOutcome, TimePoint,
};

pub(crate) fn run(
    state: &mut RuntimeState,
    run_context: SearchRunContext,
    progress_callback: Option<&ProgressCallback>,
    benchmark_observer: Option<&BenchmarkObserver>,
) -> Result<SolverResult, SolverError> {
    let total_started_at = get_current_time();
    let mut rng = ChaCha12Rng::seed_from_u64(run_context.effective_seed);
    let transplant_config = run_context
        .donor_session_transplant
        .expect("donor-session transplant config should be normalized");
    let mut trigger_state = DonorSessionTriggerState::new();
    let mut archive = EliteArchive::new(archive_config_for_donor_session_mode(transplant_config));
    let mut raw_child_retention =
        AdaptiveRawChildRetentionState::new(transplant_config.adaptive_raw_child_retention);
    let mut current_incumbent = state.clone();
    let mut aggregate = SearchProgressState::new(current_incumbent.clone());
    aggregate.donor_session_transplant_telemetry = Some(DonorSessionTransplantBenchmarkTelemetry {
        archive_size: transplant_config.archive_size as u32,
        child_polish_local_improver_mode: Some(run_context.local_improver_mode),
        raw_child_keep_ratio: transplant_config.adaptive_raw_child_retention.keep_ratio,
        raw_child_warmup_samples: transplant_config
            .adaptive_raw_child_retention
            .warmup_samples as u32,
        raw_child_history_limit: transplant_config.adaptive_raw_child_retention.history_limit
            as u32,
        swap_local_optimum_certification_enabled: transplant_config
            .swap_local_optimum_certification_enabled,
        child_polish_iterations_per_stagnation_window: transplant_config
            .child_polish_iterations_per_stagnation_window,
        child_polish_no_improvement_iterations_per_stagnation_window: transplant_config
            .child_polish_no_improvement_iterations_per_stagnation_window,
        child_polish_max_stagnation_windows: transplant_config.child_polish_max_stagnation_windows,
        ..Default::default()
    });
    record_archive_update(
        &mut aggregate,
        archive.consider_state(current_incumbent.clone()).reason,
    );

    if let Some(observer) = benchmark_observer {
        observer(&BenchmarkEvent::RunStarted(
            crate::models::BenchmarkRunStarted {
                effective_seed: run_context.effective_seed,
                move_policy: run_context.move_policy.clone(),
                initial_score: aggregate.initial_score,
            },
        ));
    }

    let mut stop_reason = StopReason::MaxIterationsReached;
    let mut total_iterations_completed = 0u64;
    let mut global_no_improvement_count = 0u64;
    let mut final_progress_emitted = false;
    let mut last_progress_callback_at = total_started_at;

    if run_context.stop_on_optimal_score
        && aggregate.best_score <= crate::models::OPTIMAL_SCORE_TOLERANCE
    {
        stop_reason = StopReason::OptimalScoreReached;
    }

    if stop_reason != StopReason::OptimalScoreReached {
        while total_iterations_completed < run_context.max_iterations {
            let elapsed_before_chunk = get_elapsed_seconds(total_started_at);
            if time_limit_exceeded(
                elapsed_before_chunk,
                run_context.time_limit_seconds.map(|limit| limit as f64),
            ) {
                stop_reason = StopReason::TimeLimitReached;
                break;
            }

            let remaining_iterations = run_context.max_iterations - total_iterations_completed;
            let chunk_iterations = remaining_iterations
                .min(transplant_config.recombination_no_improvement_window.max(1));
            let chunk_outcome = polish_state(
                current_incumbent.clone(),
                &run_context,
                LocalImproverBudget {
                    effective_seed: rng.random::<u64>(),
                    max_iterations: chunk_iterations,
                    no_improvement_limit: None,
                    time_limit_seconds: run_context
                        .time_limit_seconds
                        .map(|limit| (limit as f64 - elapsed_before_chunk).max(0.0)),
                    stop_on_optimal_score: run_context.stop_on_optimal_score,
                },
            )?;

            absorb_local_search_chunk(
                &mut aggregate,
                &chunk_outcome.search,
                total_iterations_completed,
                elapsed_before_chunk,
            );
            total_iterations_completed += chunk_outcome.search.iterations_completed;
            trigger_state.finish_iterations(chunk_outcome.search.iterations_completed);

            let improved_incumbent =
                chunk_outcome.search.best_state.total_score < current_incumbent.total_score;
            if improved_incumbent {
                current_incumbent = chunk_outcome.search.best_state.clone();
                record_archive_update(
                    &mut aggregate,
                    archive.consider_state(current_incumbent.clone()).reason,
                );
                global_no_improvement_count = chunk_outcome.search.no_improvement_count;
                trigger_state.record_incumbent_improvement();
            } else {
                global_no_improvement_count = global_no_improvement_count
                    .saturating_add(chunk_outcome.search.iterations_completed);
            }
            aggregate.current_state = current_incumbent.clone();
            aggregate.iterations_completed = total_iterations_completed;
            aggregate.no_improvement_count = global_no_improvement_count;
            aggregate.max_no_improvement_streak = aggregate
                .max_no_improvement_streak
                .max(global_no_improvement_count);

            match chunk_outcome.stop_reason {
                StopReason::TimeLimitReached => {
                    stop_reason = StopReason::TimeLimitReached;
                    break;
                }
                StopReason::OptimalScoreReached => {
                    stop_reason = StopReason::OptimalScoreReached;
                    break;
                }
                _ => {}
            }

            if maybe_emit_progress(
                &aggregate,
                &run_context,
                progress_callback,
                total_started_at,
                &mut last_progress_callback_at,
            ) {
                stop_reason = StopReason::ProgressCallbackRequestedStop;
                final_progress_emitted = true;
                break;
            }

            if let Some(limit) = run_context.no_improvement_limit {
                if global_no_improvement_count >= limit {
                    stop_reason = StopReason::NoImprovementLimitReached;
                    break;
                }
            }

            match trigger_state.is_armed(transplant_config, global_no_improvement_count) {
                DonorSessionTriggerEligibility::Armed => {}
                DonorSessionTriggerEligibility::NotArmed => {
                    aggregate
                        .donor_session_transplant_telemetry
                        .get_or_insert_with(Default::default)
                        .trigger_blocked_not_armed += 1;
                    continue;
                }
                DonorSessionTriggerEligibility::EventCapReached => {
                    aggregate
                        .donor_session_transplant_telemetry
                        .get_or_insert_with(Default::default)
                        .trigger_blocked_event_cap += 1;
                    continue;
                }
            }

            if transplant_config.swap_local_optimum_certification_enabled
                && !trigger_state.swap_local_optimum_certified
            {
                aggregate
                    .donor_session_transplant_telemetry
                    .get_or_insert_with(Default::default)
                    .certification_scans_attempted += 1;
                let certification =
                    certify_swap_local_optimum(&current_incumbent, &run_context.allowed_sessions)?;
                {
                    let telemetry = aggregate
                        .donor_session_transplant_telemetry
                        .get_or_insert_with(Default::default);
                    telemetry.certification_scans_completed += 1;
                    telemetry.certification_scan_swap_previews +=
                        certification.swap_previews_evaluated;
                    telemetry.certification_scan_seconds += certification.scan_seconds;
                }

                if let Some(best_improving_swap) = certification.best_improving_swap {
                    aggregate
                        .donor_session_transplant_telemetry
                        .get_or_insert_with(Default::default)
                        .certification_found_improving_swap += 1;
                    apply_swap_runtime_preview(&mut current_incumbent, &best_improving_swap)?;
                    aggregate.current_state = current_incumbent.clone();
                    aggregate.best_state = current_incumbent.clone();
                    aggregate.best_score = current_incumbent.total_score;
                    aggregate
                        .best_score_timeline
                        .push(crate::models::BestScoreTimelinePoint {
                            iteration: total_iterations_completed,
                            elapsed_seconds: get_elapsed_seconds(total_started_at),
                            best_score: current_incumbent.total_score,
                        });
                    record_archive_update(
                        &mut aggregate,
                        archive.consider_state(current_incumbent.clone()).reason,
                    );
                    global_no_improvement_count = 0;
                    aggregate.no_improvement_count = 0;
                    trigger_state.record_incumbent_improvement();

                    if maybe_emit_progress(
                        &aggregate,
                        &run_context,
                        progress_callback,
                        total_started_at,
                        &mut last_progress_callback_at,
                    ) {
                        stop_reason = StopReason::ProgressCallbackRequestedStop;
                        final_progress_emitted = true;
                        break;
                    }
                    continue;
                }

                aggregate
                    .donor_session_transplant_telemetry
                    .get_or_insert_with(Default::default)
                    .certified_swap_local_optima += 1;
                trigger_state.mark_swap_local_optimum_certified();
            }

            let choice = match select_donor_session_from_summary(
                &build_session_fingerprints(&current_incumbent),
                &build_session_conflict_burden(&current_incumbent),
                &archive,
            ) {
                DonorSessionSelectionOutcome::Selected(choice) => choice,
                DonorSessionSelectionOutcome::NoViableDonor => {
                    aggregate
                        .donor_session_transplant_telemetry
                        .get_or_insert_with(Default::default)
                        .trigger_armed_no_viable_donor += 1;
                    continue;
                }
                DonorSessionSelectionOutcome::NoViableSession => {
                    aggregate
                        .donor_session_transplant_telemetry
                        .get_or_insert_with(Default::default)
                        .trigger_armed_no_viable_session += 1;
                    continue;
                }
            };

            trigger_state.record_recombination_event();
            aggregate
                .donor_session_transplant_telemetry
                .get_or_insert_with(Default::default)
                .recombination_events_fired += 1;
            let donor = &archive.entries()[choice.donor_archive_idx];
            let pre_recombination_incumbent_score = current_incumbent.total_score;
            let transplanted_child =
                transplant_donor_session(&current_incumbent, donor, choice.session_idx)?;

            let raw_child_delta = transplanted_child.total_score - current_incumbent.total_score;
            let raw_child_score = transplanted_child.total_score;
            let retention_decision = raw_child_retention.evaluate(raw_child_delta);
            let remaining_iterations_after_trigger =
                run_context.max_iterations - total_iterations_completed;
            let (
                stagnation_windows_at_trigger,
                polish_budget_iterations,
                polish_budget_no_improvement_iterations,
            ) = child_polish_budget_for_stagnation(
                transplant_config,
                global_no_improvement_count,
                remaining_iterations_after_trigger,
            );
            record_raw_child_retention(
                &mut aggregate,
                choice,
                pre_recombination_incumbent_score,
                donor.score,
                raw_child_score,
                raw_child_delta,
                retention_decision,
                stagnation_windows_at_trigger,
                raw_child_retention.latest_threshold(),
            );

            if !retention_decision.retained_for_polish {
                aggregate
                    .donor_session_transplant_telemetry
                    .get_or_insert_with(Default::default)
                    .immediate_discards += 1;
                continue;
            }

            let elapsed_before_polish = get_elapsed_seconds(total_started_at);
            if time_limit_exceeded(
                elapsed_before_polish,
                run_context.time_limit_seconds.map(|limit| limit as f64),
            ) {
                stop_reason = StopReason::TimeLimitReached;
                break;
            }

            let remaining_iterations = run_context.max_iterations - total_iterations_completed;
            if remaining_iterations == 0 {
                break;
            }
            let polish_iterations = polish_budget_iterations.min(remaining_iterations);
            record_child_polish_budget(
                &mut aggregate,
                polish_iterations,
                polish_budget_no_improvement_iterations.min(polish_iterations),
            );
            let polish_outcome = polish_state(
                transplanted_child,
                &run_context,
                LocalImproverBudget {
                    effective_seed: rng.random::<u64>(),
                    max_iterations: polish_iterations,
                    no_improvement_limit: Some(
                        polish_budget_no_improvement_iterations.min(polish_iterations),
                    ),
                    time_limit_seconds: run_context
                        .time_limit_seconds
                        .map(|limit| (limit as f64 - elapsed_before_polish).max(0.0)),
                    stop_on_optimal_score: run_context.stop_on_optimal_score,
                },
            )?;
            record_child_polish(
                &mut aggregate,
                &polish_outcome.search,
                polish_outcome.search_seconds,
                polish_outcome.stop_reason,
            );

            absorb_local_search_chunk(
                &mut aggregate,
                &polish_outcome.search,
                total_iterations_completed,
                elapsed_before_polish,
            );
            total_iterations_completed += polish_outcome.search.iterations_completed;
            trigger_state.finish_iterations(polish_outcome.search.iterations_completed);

            if polish_outcome.search.best_state.total_score < pre_recombination_incumbent_score {
                current_incumbent = polish_outcome.search.best_state.clone();
                aggregate
                    .donor_session_transplant_telemetry
                    .get_or_insert_with(Default::default)
                    .polished_children_kept += 1;
                record_archive_update(
                    &mut aggregate,
                    archive.consider_state(current_incumbent.clone()).reason,
                );
                global_no_improvement_count = polish_outcome.search.no_improvement_count;
                trigger_state.record_incumbent_improvement();
            } else {
                aggregate
                    .donor_session_transplant_telemetry
                    .get_or_insert_with(Default::default)
                    .polished_children_discarded += 1;
                global_no_improvement_count = global_no_improvement_count
                    .saturating_add(polish_outcome.search.iterations_completed);
            }
            aggregate.current_state = current_incumbent.clone();
            aggregate.iterations_completed = total_iterations_completed;
            aggregate.no_improvement_count = global_no_improvement_count;
            aggregate.max_no_improvement_streak = aggregate
                .max_no_improvement_streak
                .max(global_no_improvement_count);

            match polish_outcome.stop_reason {
                StopReason::TimeLimitReached => {
                    stop_reason = StopReason::TimeLimitReached;
                    break;
                }
                StopReason::OptimalScoreReached => {
                    stop_reason = StopReason::OptimalScoreReached;
                    break;
                }
                _ => {}
            }

            if maybe_emit_progress(
                &aggregate,
                &run_context,
                progress_callback,
                total_started_at,
                &mut last_progress_callback_at,
            ) {
                stop_reason = StopReason::ProgressCallbackRequestedStop;
                final_progress_emitted = true;
                break;
            }

            if let Some(limit) = run_context.no_improvement_limit {
                if global_no_improvement_count >= limit {
                    stop_reason = StopReason::NoImprovementLimitReached;
                    break;
                }
            }
        }
    }

    if !final_progress_emitted {
        if let Some(callback) = progress_callback {
            let final_elapsed = get_elapsed_seconds(total_started_at);
            let final_iteration = total_iterations_completed.saturating_sub(1);
            let final_progress = aggregate.to_progress_update(
                &run_context,
                final_iteration,
                0.0,
                final_elapsed,
                Some(stop_reason),
            );
            let _ = (callback)(&final_progress);
        }
    }

    let total_seconds = get_elapsed_seconds(total_started_at);
    aggregate.current_state = current_incumbent.clone();
    aggregate.best_state = current_incumbent.clone();
    aggregate.best_score = current_incumbent.total_score;
    aggregate.iterations_completed = total_iterations_completed;
    aggregate.no_improvement_count = global_no_improvement_count;
    let mut telemetry = aggregate.to_benchmark_telemetry(&run_context, stop_reason, total_seconds);
    telemetry.total_seconds = total_seconds;
    telemetry.search_seconds = total_seconds;
    telemetry.iterations_per_second = if total_seconds > 0.0 {
        total_iterations_completed as f64 / total_seconds
    } else {
        0.0
    };

    if let Some(observer) = benchmark_observer {
        observer(&BenchmarkEvent::RunCompleted(telemetry.clone()));
    }

    *state = current_incumbent;
    build_solver_result(
        state,
        global_no_improvement_count,
        run_context.effective_seed,
        run_context.move_policy,
        stop_reason,
        telemetry,
    )
}

pub(super) fn transplant_donor_session(
    base_state: &RuntimeState,
    donor: &super::archive::ArchivedElite,
    session_idx: usize,
) -> Result<RuntimeState, SolverError> {
    let mut child = base_state.clone();
    child.overwrite_session_from(&donor.state, session_idx)?;
    child.rebuild_pair_contacts();
    child.sync_score_from_oracle()?;
    Ok(child)
}

fn maybe_emit_progress(
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
