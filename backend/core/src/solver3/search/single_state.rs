#[cfg(not(target_arch = "wasm32"))]
use std::time::Instant;

#[cfg(target_arch = "wasm32")]
use js_sys;

use rand::SeedableRng;
use rand_chacha::ChaCha12Rng;

use crate::models::{
    BenchmarkEvent, BenchmarkObserver, BenchmarkRunStarted, MoveFamily, MovePolicy,
    ProgressCallback, Solver3LocalImproverMode, SolverBenchmarkTelemetry, SolverResult, StopReason,
};
use crate::solver_support::SolverError;

use super::super::moves::{
    apply_clique_swap_runtime_preview, apply_swap_runtime_preview, apply_transfer_runtime_preview,
};
#[cfg(feature = "solver3-oracle-checks")]
use super::super::oracle::maybe_cross_check_runtime_state;
use super::super::oracle::oracle_score;
use super::super::runtime_state::RuntimeState;
#[cfg(feature = "solver3-oracle-checks")]
use super::super::validation::invariants::validate_invariants;
use super::acceptance::{
    cooling_progress, record_to_record_threshold_for_progress, RecordToRecordAcceptance,
    RecordToRecordInputs,
};
use super::candidate_sampling::{CandidateSampler, SearchMovePreview, SwapSamplingOptions};
use super::context::{SearchProgressState, SearchRunContext};
use super::family_selection::MoveFamilySelector;
use super::repeat_guidance::RepeatGuidanceState;
use super::sgp_conflicts::SgpConflictState;
use super::tabu::SgpWeekPairTabuState;

const DIVERSIFICATION_BURST_STAGNATION_THRESHOLD: u64 = 25_000;
const DIVERSIFICATION_TOTAL_DONOR_POLISH_SECONDS: f64 = 2.0;
const DIVERSIFICATION_DONOR_COUNT: usize = 2;
const DIVERSIFICATION_MIN_REMAINING_TIME_SECONDS: f64 = 4.0;
const DIVERSIFICATION_PER_DONOR_ITERATION_DIVISOR: u64 = 10;
const DIVERSIFICATION_MIN_REMAINING_ITERATIONS: u64 = 50_000;
const PROGRESS_CALLBACK_INTERVAL_SECONDS: f64 = 0.1;
const TIME_REFRESH_INTERVAL: u64 = 64;

#[cfg(not(target_arch = "wasm32"))]
fn get_current_time() -> Instant {
    Instant::now()
}

#[cfg(target_arch = "wasm32")]
fn get_current_time() -> f64 {
    js_sys::Date::now()
}

#[cfg(not(target_arch = "wasm32"))]
fn get_elapsed_seconds(start: Instant) -> f64 {
    start.elapsed().as_secs_f64()
}

#[cfg(target_arch = "wasm32")]
fn get_elapsed_seconds(start: f64) -> f64 {
    (js_sys::Date::now() - start) / 1000.0
}

#[cfg(not(target_arch = "wasm32"))]
fn get_elapsed_seconds_between(start: Instant, end: Instant) -> f64 {
    end.duration_since(start).as_secs_f64()
}

#[cfg(target_arch = "wasm32")]
fn get_elapsed_seconds_between(start: f64, end: f64) -> f64 {
    (end - start) / 1000.0
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct LocalImproverBudget {
    pub(crate) effective_seed: u64,
    pub(crate) max_iterations: u64,
    pub(crate) no_improvement_limit: Option<u64>,
    pub(crate) time_limit_seconds: Option<f64>,
    pub(crate) stop_on_optimal_score: bool,
}

#[derive(Debug, Clone)]
pub(crate) struct LocalImproverRunResult {
    pub(crate) search: SearchProgressState,
    pub(crate) stop_reason: StopReason,
    pub(crate) search_seconds: f64,
}

#[derive(Clone, Copy)]
struct LocalImproverHooks<'a> {
    progress_callback: Option<&'a ProgressCallback>,
    benchmark_observer: Option<&'a BenchmarkObserver>,
}

pub(crate) fn run(
    state: &mut RuntimeState,
    run_context: SearchRunContext,
    progress_callback: Option<&ProgressCallback>,
    benchmark_observer: Option<&BenchmarkObserver>,
) -> Result<SolverResult, SolverError> {
    let outcome = run_local_improver(
        state.clone(),
        &run_context,
        LocalImproverBudget {
            effective_seed: run_context.effective_seed,
            max_iterations: run_context.max_iterations,
            no_improvement_limit: run_context.no_improvement_limit,
            time_limit_seconds: run_context.time_limit_seconds.map(|limit| limit as f64),
            stop_on_optimal_score: run_context.stop_on_optimal_score,
        },
        LocalImproverHooks {
            progress_callback,
            benchmark_observer,
        },
        true,
    )?;

    let telemetry = outcome.search.to_benchmark_telemetry(
        &run_context,
        outcome.stop_reason,
        outcome.search_seconds,
    );

    if let Some(observer) = benchmark_observer {
        observer(&BenchmarkEvent::RunCompleted(telemetry.clone()));
    }

    *state = outcome.search.best_state.clone();
    build_solver_result(
        &outcome.search.best_state,
        outcome.search.no_improvement_count,
        run_context.effective_seed,
        run_context.move_policy,
        outcome.stop_reason,
        telemetry,
    )
}

pub(crate) fn polish_state(
    initial_state: RuntimeState,
    run_context: &SearchRunContext,
    budget: LocalImproverBudget,
) -> Result<LocalImproverRunResult, SolverError> {
    run_local_improver(
        initial_state,
        run_context,
        budget,
        LocalImproverHooks {
            progress_callback: None,
            benchmark_observer: None,
        },
        false,
    )
}

fn run_local_improver(
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
                let burst_outcome = try_diversification_burst(
                    &search.best_state,
                    run_context,
                    budget,
                    iteration,
                )?;
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
                                .get_or_insert(super::context::IteratedLocalSearchMemory {
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

            let candidate_selection = candidate_sampler.select_previewed_move(
                &search.current_state,
                &family_selector,
                &run_context.allowed_sessions,
                SwapSamplingOptions {
                    repeat_guidance: repeat_guidance.as_ref(),
                    sgp_conflicts: sgp_conflicts.as_ref(),
                    repeat_guided_swap_probability: run_context.repeat_guided_swap_probability,
                    repeat_guided_swap_candidate_preview_budget: run_context
                        .repeat_guided_swap_candidate_preview_budget,
                    tabu: tabu_state.as_ref(),
                    tabu_retry_cap: run_context
                        .sgp_week_pair_tabu
                        .map_or(0, |config| config.retry_cap),
                    tabu_allow_aspiration_preview: run_context.local_improver_mode
                        == Solver3LocalImproverMode::SgpWeekPairTabu
                        && run_context
                            .sgp_week_pair_tabu
                            .is_some_and(|config| config.aspiration_enabled),
                    current_iteration: iteration,
                },
                &mut rng,
            );
            search.record_repeat_guided_swap_sampling(
                candidate_selection
                    .repeat_guided_swap_sampling
                    .guided_attempts,
                candidate_selection
                    .repeat_guided_swap_sampling
                    .guided_successes,
                candidate_selection
                    .repeat_guided_swap_sampling
                    .guided_fallback_to_random,
                candidate_selection
                    .repeat_guided_swap_sampling
                    .guided_previewed_candidates,
            );
            search.record_tabu_sampling(
                candidate_selection.tabu_swap_sampling.raw_tabu_hits,
                candidate_selection.tabu_swap_sampling.prefilter_skips,
                candidate_selection.tabu_swap_sampling.retry_exhaustions,
                candidate_selection.tabu_swap_sampling.hard_blocks,
                candidate_selection
                    .tabu_swap_sampling
                    .aspiration_preview_surfaces,
            );

            if let Some((family, preview, preview_seconds)) = candidate_selection.selection {
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

                        if let Some(guidance) = repeat_guidance.as_mut() {
                            guidance.apply_pair_contact_updates(
                                &search.current_state.compiled,
                                preview.pair_contact_updates(),
                            );
                        }

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
                    } else {
                        search.record_rejected_move(family);
                    }
                } else {
                    search.record_rejected_move(family);
                }
            } else {
                search.record_no_candidate();
            }

            search.finish_iteration(iteration);
            iteration = iteration.saturating_add(1);

            if let Some(callback) = hooks.progress_callback {
                let current_time = get_current_time();
                let elapsed_since_last_callback =
                    get_elapsed_seconds_between(last_progress_callback_at, current_time);

                if should_emit_progress_callback(iteration, elapsed_since_last_callback) {
                    let callback_elapsed_seconds = get_elapsed_seconds(search_started_at);
                    let progress = search.to_progress_update(
                        run_context,
                        iteration,
                        temperature,
                        callback_elapsed_seconds,
                        None,
                    );

                    if !(callback)(&progress) {
                        stop_reason = StopReason::ProgressCallbackRequestedStop;
                        let final_progress = search.to_progress_update(
                            run_context,
                            iteration,
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

pub(crate) fn build_solver_result(
    state: &RuntimeState,
    no_improvement_count: u64,
    effective_seed: u64,
    move_policy: MovePolicy,
    stop_reason: StopReason,
    benchmark_telemetry: SolverBenchmarkTelemetry,
) -> Result<SolverResult, SolverError> {
    let oracle = oracle_score(state)?;
    Ok(SolverResult {
        final_score: state.total_score,
        schedule: state.to_api_schedule(),
        unique_contacts: state.unique_contacts as i32,
        repetition_penalty: state.repetition_penalty_raw,
        attribute_balance_penalty: state.attribute_balance_penalty as i32,
        constraint_penalty: oracle.constraint_penalty_raw,
        no_improvement_count,
        weighted_repetition_penalty: state.weighted_repetition_penalty,
        weighted_constraint_penalty: state.constraint_penalty_weighted,
        effective_seed: Some(effective_seed),
        move_policy: Some(move_policy),
        stop_reason: Some(stop_reason),
        benchmark_telemetry: Some(benchmark_telemetry),
    })
}

pub(crate) fn apply_previewed_move(
    state: &mut RuntimeState,
    preview: &SearchMovePreview,
) -> Result<(), SolverError> {
    match preview {
        SearchMovePreview::Swap(preview) => apply_swap_runtime_preview(state, preview),
        SearchMovePreview::Transfer(preview) => apply_transfer_runtime_preview(state, preview),
        SearchMovePreview::CliqueSwap(preview) => apply_clique_swap_runtime_preview(state, preview),
    }
}

struct DiversificationBurstOutcome {
    best_offspring: Option<RuntimeState>,
    iterations_consumed: u64,
}

fn try_diversification_burst(
    recipient_state: &RuntimeState,
    run_context: &SearchRunContext,
    budget: LocalImproverBudget,
    iteration: u64,
) -> Result<DiversificationBurstOutcome, SolverError> {
    let mut best_offspring = None;
    let mut best_score = f64::INFINITY;
    let mut donor_best_states = Vec::with_capacity(DIVERSIFICATION_DONOR_COUNT);
    let mut iterations_consumed: u64 = 0;
    let remaining_iterations = budget.max_iterations.saturating_sub(iteration);

    for donor_ordinal in 0..DIVERSIFICATION_DONOR_COUNT {
        let donor_seed = diversify_seed(
            budget.effective_seed,
            iteration
                .saturating_add(1)
                .saturating_add(donor_ordinal as u64),
        );
        let Ok(donor_state) = RuntimeState::from_compiled_with_seed(
            recipient_state.compiled.clone(),
            donor_seed,
        ) else {
            continue;
        };
        let Ok(donor_outcome) = run_local_improver(
            donor_state,
            run_context,
            LocalImproverBudget {
                effective_seed: donor_seed,
                max_iterations: diversification_per_donor_iteration_budget(remaining_iterations),
                no_improvement_limit: None,
                time_limit_seconds: Some(diversification_per_donor_polish_seconds()),
                stop_on_optimal_score: budget.stop_on_optimal_score,
            },
            LocalImproverHooks {
                progress_callback: None,
                benchmark_observer: None,
            },
            false,
        ) else {
            continue;
        };
        iterations_consumed = iterations_consumed
            .saturating_add(donor_outcome.search.iterations_completed);
        donor_best_states.push(donor_outcome.search.best_state.clone());

        if let Some(offspring) = select_best_offspring_session(
            recipient_state,
            donor_best_states.last().expect("pushed donor state"),
            &run_context.allowed_sessions,
        )? {
            if offspring.total_score < best_score {
                best_score = offspring.total_score;
                best_offspring = Some(offspring);
            }
        }
    }

    if let Some(offspring) = select_best_cross_donor_bundle(
        recipient_state,
        &donor_best_states,
        &run_context.allowed_sessions,
    )? {
        if offspring.total_score < best_score {
            best_offspring = Some(offspring);
        }
    }

    Ok(DiversificationBurstOutcome {
        best_offspring,
        iterations_consumed,
    })
}

#[inline]
fn time_limit_exceeded(elapsed_seconds: f64, time_limit_seconds: Option<f64>) -> bool {
    time_limit_seconds.is_some_and(|limit| elapsed_seconds >= limit)
}

#[inline]
fn should_attempt_diversification_burst(
    no_improvement_count: u64,
    time_limit_seconds: Option<f64>,
    elapsed_seconds: f64,
    remaining_iterations: u64,
) -> bool {
    if no_improvement_count < DIVERSIFICATION_BURST_STAGNATION_THRESHOLD {
        return false;
    }

    if remaining_iterations < DIVERSIFICATION_MIN_REMAINING_ITERATIONS {
        return false;
    }

    time_limit_seconds.is_some_and(|limit| {
        elapsed_seconds + DIVERSIFICATION_TOTAL_DONOR_POLISH_SECONDS + 0.5
            < limit - DIVERSIFICATION_MIN_REMAINING_TIME_SECONDS
    })
}

#[inline]
fn diversification_per_donor_polish_seconds() -> f64 {
    (DIVERSIFICATION_TOTAL_DONOR_POLISH_SECONDS / DIVERSIFICATION_DONOR_COUNT as f64).max(0.1)
}

#[inline]
fn diversification_per_donor_iteration_budget(remaining_iterations: u64) -> u64 {
    (remaining_iterations / DIVERSIFICATION_PER_DONOR_ITERATION_DIVISOR).max(1)
}

#[inline]
pub(crate) fn should_emit_progress_callback(
    iteration: u64,
    elapsed_since_last_callback: f64,
) -> bool {
    iteration == 0 || elapsed_since_last_callback >= PROGRESS_CALLBACK_INTERVAL_SECONDS
}

fn select_best_offspring_session(
    recipient_state: &RuntimeState,
    donor_state: &RuntimeState,
    allowed_sessions: &[usize],
) -> Result<Option<RuntimeState>, SolverError> {
    let mut best_offspring = None;
    let mut best_score = f64::INFINITY;

    for &session_idx in allowed_sessions {
        let mut offspring = recipient_state.clone();
        offspring.overwrite_session_from(donor_state, session_idx)?;
        offspring.rebuild_pair_contacts();
        offspring.sync_score_from_oracle()?;
        if offspring.total_score < best_score {
            best_score = offspring.total_score;
            best_offspring = Some(offspring);
        }
    }

    Ok(best_offspring)
}

fn select_best_cross_donor_bundle(
    recipient_state: &RuntimeState,
    donors: &[RuntimeState],
    allowed_sessions: &[usize],
) -> Result<Option<RuntimeState>, SolverError> {
    if donors.len() < 2 {
        return Ok(None);
    }

    let mut best_offspring = None;
    let mut best_score = f64::INFINITY;

    for left_donor_idx in 0..donors.len() {
        for right_donor_idx in (left_donor_idx + 1)..donors.len() {
            for (left_session_pos, &left_session_idx) in allowed_sessions.iter().enumerate() {
                for &right_session_idx in allowed_sessions.iter().skip(left_session_pos + 1) {
                    let offspring = transplant_mixed_donor_sessions(
                        recipient_state,
                        &donors[left_donor_idx],
                        left_session_idx,
                        &donors[right_donor_idx],
                        right_session_idx,
                    )?;
                    if offspring.total_score < best_score {
                        best_score = offspring.total_score;
                        best_offspring = Some(offspring);
                    }
                }
            }
        }
    }

    Ok(best_offspring)
}

fn transplant_mixed_donor_sessions(
    recipient_state: &RuntimeState,
    left_donor: &RuntimeState,
    left_session_idx: usize,
    right_donor: &RuntimeState,
    right_session_idx: usize,
) -> Result<RuntimeState, SolverError> {
    let mut offspring = recipient_state.clone();
    offspring.overwrite_session_from(left_donor, left_session_idx)?;
    offspring.overwrite_session_from(right_donor, right_session_idx)?;
    offspring.rebuild_pair_contacts();
    offspring.sync_score_from_oracle()?;
    Ok(offspring)
}

#[inline]
fn diversify_seed(base_seed: u64, salt: u64) -> u64 {
    base_seed ^ 0x9e37_79b9_7f4a_7c15u64.wrapping_mul(salt.saturating_add(1))
}

#[inline]
fn extend_no_improvement_streak(search: &mut SearchProgressState, steps: u64) {
    if steps == 0 {
        return;
    }
    search.no_improvement_count = search.no_improvement_count.saturating_add(steps);
    search.max_no_improvement_streak = search
        .max_no_improvement_streak
        .max(search.no_improvement_count);
}

pub(crate) fn maybe_run_sampled_correctness_check(
    run_context: &SearchRunContext,
    state: &RuntimeState,
    accepted_move_count: u64,
    family: MoveFamily,
    preview: &SearchMovePreview,
) -> Result<(), SolverError> {
    if !run_context.correctness_lane_enabled {
        return Ok(());
    }

    #[cfg(feature = "solver3-oracle-checks")]
    {
        if should_sample_correctness_check(
            accepted_move_count,
            run_context.correctness_sample_every_accepted_moves,
        ) {
            let preview_description = preview.describe();
            maybe_cross_check_runtime_state(
                state,
                &format!(
                    "search sampled {:?} accepted move {}",
                    family, preview_description
                ),
            )?;
            validate_invariants(state).map_err(|error| {
                SolverError::ValidationError(format!(
                    "solver3 sampled invariant check failed after accepted {:?} move {}: {}",
                    family, preview_description, error
                ))
            })?;
        }
    }

    #[cfg(not(feature = "solver3-oracle-checks"))]
    {
        let _ = (
            run_context.correctness_sample_every_accepted_moves,
            run_context.correctness_lane_enabled,
            state,
            accepted_move_count,
            family,
            preview,
        );
    }

    Ok(())
}

#[cfg(feature = "solver3-oracle-checks")]
fn should_sample_correctness_check(
    accepted_move_count: u64,
    sample_every_accepted_moves: u64,
) -> bool {
    accepted_move_count > 0 && accepted_move_count % sample_every_accepted_moves == 0
}
