use rand::SeedableRng;
use rand_chacha::ChaCha12Rng;

use crate::models::{BenchmarkEvent, BenchmarkRunStarted, Solver3LocalImproverMode, StopReason};
use crate::solver_support::SolverError;

use super::super::super::runtime_state::RuntimeState;
use super::super::acceptance::{
    cooling_progress, record_to_record_threshold_for_progress, RecordToRecordAcceptance,
    RecordToRecordInputs,
};
use super::super::candidate_sampling::{CandidateSampler, SearchMovePreview, SwapSamplingOptions};
use super::super::context::{IteratedLocalSearchMemory, SearchProgressState, SearchRunContext};
use super::super::family_selection::{MoveFamilySelector, MoveFamilyUtilityMode};
#[cfg(feature = "solver3-experimental-repeat-guidance")]
use super::super::repeat_guidance::RepeatGuidanceState;
#[cfg(feature = "solver3-experimental-conflict-restricted-sampling")]
use super::super::sgp_conflicts::SgpConflictState;
use super::super::tabu::SgpWeekPairTabuState;
use super::{
    apply_previewed_move, extend_no_improvement_streak, get_current_time, get_elapsed_seconds,
    get_elapsed_seconds_between, maybe_run_sampled_correctness_check,
    should_attempt_diversification_burst, should_emit_progress_callback, time_limit_exceeded,
    try_diversification_burst, LocalImproverBudget, LocalImproverHooks, LocalImproverRunResult,
    TIME_REFRESH_INTERVAL,
};

pub(super) fn run_local_improver_general(
    initial_state: RuntimeState,
    run_context: &SearchRunContext,
    budget: LocalImproverBudget,
    hooks: LocalImproverHooks<'_>,
    allow_diversification_burst: bool,
) -> Result<LocalImproverRunResult, SolverError> {
    let mut rng = ChaCha12Rng::seed_from_u64(budget.effective_seed);
    let acceptance_policy = RecordToRecordAcceptance;
    let candidate_sampler = CandidateSampler;
    let family_selector = MoveFamilySelector::new(&run_context.move_policy);
    let mut search = SearchProgressState::new(initial_state);
    if run_context.local_improver_mode == Solver3LocalImproverMode::SgpWeekPairTabu {
        search.sgp_week_pair_tabu_telemetry = Some(Default::default());
    }
    #[cfg(feature = "solver3-experimental-repeat-guidance")]
    let mut repeat_guidance = if run_context.repeat_guided_swaps_enabled {
        RepeatGuidanceState::build_from_state(&search.current_state)
    } else {
        None
    };
    let mut tabu_state =
        if run_context.local_improver_mode == Solver3LocalImproverMode::SgpWeekPairTabu {
            run_context
                .sgp_week_pair_tabu
                .map(|config| SgpWeekPairTabuState::new(&search.current_state.compiled, config))
        } else {
            None
        };
    #[cfg(feature = "solver3-experimental-conflict-restricted-sampling")]
    let mut sgp_conflicts = if run_context.local_improver_mode
        == Solver3LocalImproverMode::SgpWeekPairTabu
        && run_context
            .sgp_week_pair_tabu
            .is_some_and(|config| config.conflict_restricted_swap_sampling_enabled)
    {
        SgpConflictState::build_from_state(&search.current_state, &run_context.allowed_sessions)
    } else {
        None
    };

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
    let tabu_retry_cap = run_context
        .sgp_week_pair_tabu
        .map_or(0, |config| config.retry_cap);
    let tabu_allow_aspiration_preview = run_context.local_improver_mode
        == Solver3LocalImproverMode::SgpWeekPairTabu
        && run_context
            .sgp_week_pair_tabu
            .is_some_and(|config| config.aspiration_enabled);

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
                && run_context.local_improver_mode == Solver3LocalImproverMode::RecordToRecord
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
                            #[cfg(feature = "solver3-experimental-repeat-guidance")]
                            if let Some(guidance) = repeat_guidance.as_mut() {
                                guidance.rebuild_from_state(&search.current_state);
                            }
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
            let (preview, repeat_guided_swap_sampling, tabu_swap_sampling) = candidate_sampler
                .sample_preview_for_family(
                    &search.current_state,
                    family,
                    &run_context.allowed_sessions,
                    SwapSamplingOptions {
                        #[cfg(feature = "solver3-experimental-repeat-guidance")]
                        repeat_guidance: repeat_guidance.as_ref(),
                        #[cfg(feature = "solver3-experimental-conflict-restricted-sampling")]
                        sgp_conflicts: sgp_conflicts.as_ref(),
                        #[cfg(feature = "solver3-experimental-repeat-guidance")]
                        repeat_guided_swap_probability: run_context.repeat_guided_swap_probability,
                        #[cfg(feature = "solver3-experimental-repeat-guidance")]
                        repeat_guided_swap_candidate_preview_budget: run_context
                            .repeat_guided_swap_candidate_preview_budget,
                        tabu: tabu_state.as_ref(),
                        tabu_retry_cap,
                        tabu_allow_aspiration_preview,
                        current_iteration: iteration,
                    },
                    &mut rng,
                );
            let preview_seconds =
                get_elapsed_seconds_between(preview_started_at, get_current_time());
            search.record_repeat_guided_swap_sampling(
                repeat_guided_swap_sampling.guided_attempts,
                repeat_guided_swap_sampling.guided_successes,
                repeat_guided_swap_sampling.guided_fallback_to_random,
                repeat_guided_swap_sampling.guided_previewed_candidates,
            );
            search.record_tabu_sampling(
                tabu_swap_sampling.raw_tabu_hits,
                tabu_swap_sampling.prefilter_skips,
                tabu_swap_sampling.retry_exhaustions,
                tabu_swap_sampling.hard_blocks,
                tabu_swap_sampling.aspiration_preview_surfaces,
            );

            if let Some(preview) = preview {
                let delta_cost = preview.delta_score();
                search.record_preview_attempt(family, preview_seconds, delta_cost);
                let current_score = search.current_state.total_score;
                let candidate_score = current_score + delta_cost;
                let swap_is_tabu = is_tabu_swap_preview(
                    tabu_state.as_ref(),
                    &search.current_state,
                    &preview,
                    iteration,
                );

                let acceptance = if swap_is_tabu && candidate_score >= search.best_score {
                    None
                } else {
                    if swap_is_tabu {
                        search.record_tabu_aspiration_override();
                    }
                    Some(acceptance_policy.decide(RecordToRecordInputs {
                        current_score,
                        best_score: search.best_score,
                        candidate_score,
                        progress,
                    }))
                };

                if let Some(acceptance) = acceptance {
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

                        #[cfg(feature = "solver3-experimental-repeat-guidance")]
                        if let Some(guidance) = repeat_guidance.as_mut() {
                            guidance.apply_pair_contact_updates(
                                &search.current_state.compiled,
                                preview.pair_contact_updates(),
                            );
                        }

                        #[cfg(feature = "solver3-experimental-conflict-restricted-sampling")]
                        if let Some(conflicts) = sgp_conflicts.as_mut() {
                            conflicts.refresh_after_move(
                                &search.current_state,
                                &run_context.allowed_sessions,
                                preview.session_idx(),
                                preview.pair_contact_updates(),
                            );
                        }

                        if let Some(tabu) = tabu_state.as_mut() {
                            if let SearchMovePreview::Swap(preview) = &preview {
                                let swap = preview.analysis.swap;
                                let expiry = tabu.record_swap(
                                    &search.current_state.compiled,
                                    swap.session_idx,
                                    swap.left_person_idx,
                                    swap.right_person_idx,
                                    iteration,
                                    search.no_improvement_count,
                                    &mut rng,
                                );
                                search
                                    .record_tabu_realized_tenure(expiry.saturating_sub(iteration));
                            }
                        }

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
                    search.record_rejected_move(family);
                    search.policy_memory.move_family_chooser.record_attempt(
                        family,
                        preview_seconds,
                        None,
                        true,
                    );
                }
            } else {
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

fn is_tabu_swap_preview(
    tabu_state: Option<&SgpWeekPairTabuState>,
    state: &RuntimeState,
    preview: &SearchMovePreview,
    iteration: u64,
) -> bool {
    let Some(tabu) = tabu_state else {
        return false;
    };
    let SearchMovePreview::Swap(preview) = preview else {
        return false;
    };
    let swap = preview.analysis.swap;
    tabu.is_tabu(
        &state.compiled,
        swap.session_idx,
        swap.left_person_idx,
        swap.right_person_idx,
        iteration,
    )
}
