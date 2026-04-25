use rand::SeedableRng;
use rand_chacha::ChaCha12Rng;

use crate::models::{BenchmarkEvent, BenchmarkRunStarted, Solver3LocalImproverMode, StopReason};
use crate::solver_support::SolverError;

use super::super::super::runtime_state::RuntimeState;
use super::super::acceptance::{
    cooling_progress, record_to_record_threshold_for_progress, RecordToRecordAcceptance,
    RecordToRecordInputs,
};
use super::super::candidate_sampling::CandidateSampler;
use super::super::context::{IteratedLocalSearchMemory, SearchProgressState, SearchRunContext};
use super::super::family_selection::{MoveFamilySelector, MoveFamilyUtilityMode};
use super::{
    apply_previewed_move, extend_no_improvement_streak, get_current_time, get_elapsed_seconds,
    get_elapsed_seconds_between, maybe_run_sampled_correctness_check,
    runtime_scaled_no_improvement_limit_reached, should_attempt_diversification_burst,
    should_emit_progress_callback, time_limit_exceeded, try_diversification_burst,
    LocalImproverBudget, LocalImproverHooks, LocalImproverRunResult, TIME_REFRESH_INTERVAL,
};

pub(super) fn run_local_improver_default(
    initial_state: RuntimeState,
    run_context: &SearchRunContext,
    budget: LocalImproverBudget,
    hooks: LocalImproverHooks<'_>,
    allow_diversification_burst: bool,
) -> Result<LocalImproverRunResult, SolverError> {
    debug_assert_eq!(
        run_context.local_improver_mode,
        Solver3LocalImproverMode::RecordToRecord
    );

    let mut rng = ChaCha12Rng::seed_from_u64(budget.effective_seed);
    let acceptance_policy = RecordToRecordAcceptance;
    let candidate_sampler = CandidateSampler;
    let family_selector = MoveFamilySelector::new(&run_context.move_policy);
    let mut search = SearchProgressState::new(initial_state);

    if let Some(observer) = hooks.benchmark_observer {
        observer(&BenchmarkEvent::RunStarted(BenchmarkRunStarted {
            effective_seed: budget.effective_seed,
            move_policy: run_context.move_policy.clone(),
            initial_score: search.initial_score,
        }));
    }

    let search_started_at = get_current_time();
    let mut stop_reason = StopReason::MaxIterationsReached;
    let mut final_progress_emitted = false;
    let mut last_progress_callback_at = search_started_at;
    let mut cached_elapsed_seconds: f64 = 0.0;
    let mut diversification_burst_attempted = false;
    let mut iteration: u64 = 0;

    if budget.stop_on_optimal_score && search.best_score <= crate::models::OPTIMAL_SCORE_TOLERANCE {
        stop_reason = StopReason::OptimalScoreReached;
    }

    if stop_reason != StopReason::OptimalScoreReached {
        while iteration < budget.max_iterations {
            if iteration % TIME_REFRESH_INTERVAL == 0 {
                cached_elapsed_seconds = get_elapsed_seconds(search_started_at);
            }

            if time_limit_exceeded(cached_elapsed_seconds, budget.time_limit_seconds) {
                stop_reason = StopReason::TimeLimitReached;
                break;
            }

            if runtime_scaled_no_improvement_limit_reached(&search, cached_elapsed_seconds, budget)
            {
                stop_reason = StopReason::NoImprovementTimeLimitReached;
                break;
            }

            let progress = cooling_progress(
                iteration,
                budget.max_iterations,
                cached_elapsed_seconds,
                budget
                    .time_limit_seconds
                    .map(|limit| limit.max(0.0).floor() as u64),
            );
            let temperature = record_to_record_threshold_for_progress(progress);

            if allow_diversification_burst
                && !diversification_burst_attempted
                && should_attempt_diversification_burst(
                    search.no_improvement_count,
                    budget.time_limit_seconds,
                    cached_elapsed_seconds,
                    budget.max_iterations.saturating_sub(iteration),
                )
            {
                diversification_burst_attempted = true;
                let burst_outcome =
                    try_diversification_burst(&search.best_state, run_context, budget, iteration)?;
                let burst_iterations = burst_outcome
                    .iterations_consumed
                    .min(budget.max_iterations.saturating_sub(iteration));
                if burst_iterations > 0 {
                    iteration = iteration.saturating_add(burst_iterations);
                    search.iterations_completed = iteration;
                    cached_elapsed_seconds = get_elapsed_seconds(search_started_at);

                    if let Some(offspring_state) = burst_outcome.best_offspring {
                        let offspring_score = offspring_state.total_score;
                        if offspring_score <= search.best_score + temperature {
                            search.current_state = offspring_state;
                            let improved = search.refresh_best_from_current(
                                iteration.saturating_sub(1),
                                cached_elapsed_seconds,
                            );
                            if !improved {
                                extend_no_improvement_streak(
                                    &mut search,
                                    burst_iterations.saturating_sub(1),
                                );
                            }
                            search.record_acceptance_result(true);
                            search
                                .policy_memory
                                .ils
                                .get_or_insert(IteratedLocalSearchMemory {
                                    perturbation_round: 0,
                                })
                                .perturbation_round += 1;
                        } else {
                            extend_no_improvement_streak(&mut search, burst_iterations);
                        }
                    } else {
                        extend_no_improvement_streak(&mut search, burst_iterations);
                    }

                    if time_limit_exceeded(cached_elapsed_seconds, budget.time_limit_seconds) {
                        stop_reason = StopReason::TimeLimitReached;
                        break;
                    }

                    if runtime_scaled_no_improvement_limit_reached(
                        &search,
                        cached_elapsed_seconds,
                        budget,
                    ) {
                        stop_reason = StopReason::NoImprovementTimeLimitReached;
                        break;
                    }

                    if budget.stop_on_optimal_score
                        && search.best_score <= crate::models::OPTIMAL_SCORE_TOLERANCE
                    {
                        stop_reason = StopReason::OptimalScoreReached;
                        break;
                    }

                    if let Some(limit) = budget.no_improvement_limit {
                        if search.no_improvement_count >= limit {
                            stop_reason = StopReason::NoImprovementLimitReached;
                            break;
                        }
                    }

                    if iteration >= budget.max_iterations {
                        stop_reason = StopReason::MaxIterationsReached;
                        break;
                    }
                }
            }

            let family = family_selector.choose_family(
                &search.policy_memory.move_family_chooser,
                if budget.time_limit_seconds.is_some() {
                    MoveFamilyUtilityMode::PerSecond
                } else {
                    MoveFamilyUtilityMode::PerAttempt
                },
                &mut rng,
            );
            let preview_started_at = get_current_time();
            if let Some(preview) = candidate_sampler.sample_preview_for_family_default(
                &search.current_state,
                family,
                &run_context.allowed_sessions,
                &mut rng,
            ) {
                let preview_seconds =
                    get_elapsed_seconds_between(preview_started_at, get_current_time());
                let delta_cost = preview.delta_score();
                search.record_preview_attempt(family, preview_seconds, delta_cost);
                let current_score = search.current_state.total_score;
                let candidate_score = current_score + delta_cost;

                let acceptance = acceptance_policy.decide(RecordToRecordInputs {
                    current_score,
                    best_score: search.best_score,
                    candidate_score,
                    progress,
                });

                if acceptance.accepted {
                    let apply_started_at = get_current_time();
                    apply_previewed_move(&mut search.current_state, &preview)?;
                    let apply_seconds =
                        get_elapsed_seconds_between(apply_started_at, get_current_time());
                    search.record_accepted_move(
                        family,
                        apply_seconds,
                        delta_cost,
                        acceptance.escaped_local_optimum,
                    );

                    maybe_run_sampled_correctness_check(
                        run_context,
                        &search.current_state,
                        search.total_accepted_moves(),
                        family,
                        &preview,
                    )?;

                    let improvement_elapsed_seconds = get_elapsed_seconds(search_started_at);
                    cached_elapsed_seconds =
                        cached_elapsed_seconds.max(improvement_elapsed_seconds);
                    search.refresh_best_from_current(iteration, improvement_elapsed_seconds);
                    search.record_acceptance_result(true);
                    search.policy_memory.move_family_chooser.record_attempt(
                        family,
                        preview_seconds + apply_seconds,
                        Some(delta_cost),
                        true,
                    );
                } else {
                    search.record_rejected_move(family);
                    search.policy_memory.move_family_chooser.record_attempt(
                        family,
                        preview_seconds,
                        None,
                        true,
                    );
                }
            } else {
                let preview_seconds =
                    get_elapsed_seconds_between(preview_started_at, get_current_time());
                search.record_no_candidate();
                search.policy_memory.move_family_chooser.record_attempt(
                    family,
                    preview_seconds,
                    None,
                    false,
                );
            }

            search.finish_iteration(iteration);
            iteration = iteration.saturating_add(1);

            if let Some(callback) = hooks.progress_callback {
                let current_time = get_current_time();
                let elapsed_since_last_callback =
                    get_elapsed_seconds_between(last_progress_callback_at, current_time);
                let completed_iteration = iteration.saturating_sub(1);

                if should_emit_progress_callback(completed_iteration, elapsed_since_last_callback) {
                    let callback_elapsed_seconds = get_elapsed_seconds(search_started_at);
                    let progress = search.to_progress_update(
                        run_context,
                        completed_iteration,
                        temperature,
                        callback_elapsed_seconds,
                        None,
                    );

                    if !(callback)(&progress) {
                        stop_reason = StopReason::ProgressCallbackRequestedStop;
                        let final_progress = search.to_progress_update(
                            run_context,
                            completed_iteration,
                            temperature,
                            callback_elapsed_seconds,
                            Some(stop_reason),
                        );
                        let _ = (callback)(&final_progress);
                        final_progress_emitted = true;
                        break;
                    }

                    last_progress_callback_at = current_time;
                }
            }

            if budget.stop_on_optimal_score
                && search.best_score <= crate::models::OPTIMAL_SCORE_TOLERANCE
            {
                stop_reason = StopReason::OptimalScoreReached;
                break;
            }

            if let Some(limit) = budget.no_improvement_limit {
                if search.no_improvement_count >= limit {
                    stop_reason = StopReason::NoImprovementLimitReached;
                    break;
                }
            }
        }
    }

    if !final_progress_emitted {
        if let Some(callback) = hooks.progress_callback {
            let final_iteration = search.iterations_completed.saturating_sub(1);
            let final_elapsed = get_elapsed_seconds(search_started_at);
            let final_progress_val = cooling_progress(
                final_iteration,
                budget.max_iterations,
                final_elapsed,
                budget
                    .time_limit_seconds
                    .map(|limit| limit.max(0.0).floor() as u64),
            );
            let final_progress = search.to_progress_update(
                run_context,
                final_iteration,
                record_to_record_threshold_for_progress(final_progress_val),
                final_elapsed,
                Some(stop_reason),
            );
            let _ = (callback)(&final_progress);
        }
    }

    Ok(LocalImproverRunResult {
        search,
        stop_reason,
        search_seconds: get_elapsed_seconds(search_started_at),
    })
}
