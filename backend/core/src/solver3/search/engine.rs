#[cfg(not(target_arch = "wasm32"))]
use std::time::Instant;

#[cfg(target_arch = "wasm32")]
use js_sys;

use rand::{rng, RngExt, SeedableRng};
use rand_chacha::ChaCha12Rng;

use crate::models::{
    BenchmarkEvent, BenchmarkObserver, BenchmarkRunStarted, MoveFamily, MovePolicy,
    ProgressCallback, SolverBenchmarkTelemetry, SolverConfiguration, SolverResult, StopReason,
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
use super::candidate_sampling::{CandidateSampler, SearchMovePreview};
use super::context::{IteratedLocalSearchMemory, SearchProgressState, SearchRunContext};
use super::family_selection::MoveFamilySelector;

const MEMETIC_BURST_STAGNATION_THRESHOLD: u64 = 25_000;
const MEMETIC_TOTAL_DONOR_POLISH_SECONDS: u64 = 2;
const MEMETIC_DONOR_COUNT: usize = 2;
const MEMETIC_MIN_REMAINING_TIME_SECONDS: u64 = 4;
const PROGRESS_CALLBACK_INTERVAL_SECONDS: f64 = 0.1;

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

#[derive(Debug, Clone)]
pub struct SearchEngine {
    configuration: SolverConfiguration,
}

impl SearchEngine {
    pub fn new(configuration: &SolverConfiguration) -> Self {
        Self {
            configuration: configuration.clone(),
        }
    }

    pub fn solve(
        &self,
        state: &mut RuntimeState,
        progress_callback: Option<&ProgressCallback>,
        benchmark_observer: Option<&BenchmarkObserver>,
    ) -> Result<SolverResult, SolverError> {
        self.solve_single_state_with_configuration(
            &self.configuration,
            state,
            progress_callback,
            benchmark_observer,
            true,
        )
    }

    fn solve_single_state_with_configuration(
        &self,
        configuration: &SolverConfiguration,
        state: &mut RuntimeState,
        progress_callback: Option<&ProgressCallback>,
        benchmark_observer: Option<&BenchmarkObserver>,
        allow_memetic_burst: bool,
    ) -> Result<SolverResult, SolverError> {
        let effective_seed = configuration.seed.unwrap_or_else(|| rng().random::<u64>());
        let mut rng = ChaCha12Rng::seed_from_u64(effective_seed);
        let run_context = SearchRunContext::from_solver(configuration, state, effective_seed)?;
        let acceptance_policy = RecordToRecordAcceptance;
        let candidate_sampler = CandidateSampler;
        let family_selector = MoveFamilySelector::new(&run_context.move_policy);
        let mut search = SearchProgressState::new(state.clone());

        if let Some(observer) = benchmark_observer {
            observer(&BenchmarkEvent::RunStarted(BenchmarkRunStarted {
                effective_seed: run_context.effective_seed,
                move_policy: run_context.move_policy.clone(),
                initial_score: search.initial_score,
            }));
        }

        let search_started_at = get_current_time();
        let mut stop_reason = StopReason::MaxIterationsReached;
        let mut final_progress_emitted = false;
        let mut memetic_burst_attempted = false;
        let mut last_progress_callback_at = search_started_at;

        const TIME_REFRESH_INTERVAL: u64 = 64;
        let mut cached_elapsed_seconds: f64 = 0.0;

        if run_context.stop_on_optimal_score
            && search.best_score <= crate::models::OPTIMAL_SCORE_TOLERANCE
        {
            stop_reason = StopReason::OptimalScoreReached;
        }

        if stop_reason != StopReason::OptimalScoreReached {
            for iteration in 0..run_context.max_iterations {
                if iteration % TIME_REFRESH_INTERVAL == 0 {
                    cached_elapsed_seconds = get_elapsed_seconds(search_started_at);
                }

                if time_limit_exceeded(cached_elapsed_seconds, run_context.time_limit_seconds) {
                    stop_reason = StopReason::TimeLimitReached;
                    break;
                }

                let progress = cooling_progress(
                    iteration,
                    run_context.max_iterations,
                    cached_elapsed_seconds,
                    run_context.time_limit_seconds,
                );
                let temperature = record_to_record_threshold_for_progress(progress);

                if allow_memetic_burst
                    && !memetic_burst_attempted
                    && should_attempt_memetic_burst(
                        search.no_improvement_count,
                        run_context.time_limit_seconds,
                        cached_elapsed_seconds,
                    )
                {
                    memetic_burst_attempted = true;
                    if let Some(offspring_state) = self.try_memetic_offspring_burst(
                        configuration,
                        &search.best_state,
                        &run_context,
                        iteration,
                        progress,
                        false,
                    )? {
                        let offspring_score = offspring_state.total_score;
                        if offspring_score <= search.best_score + temperature {
                            search.current_state = offspring_state;
                            cached_elapsed_seconds = get_elapsed_seconds(search_started_at);
                            search.refresh_best_from_current(iteration, cached_elapsed_seconds);
                            search.record_acceptance_result(true);
                            let ils_memory =
                                search
                                    .policy_memory
                                    .ils
                                    .get_or_insert(IteratedLocalSearchMemory {
                                        perturbation_round: 0,
                                    });
                            ils_memory.perturbation_round += 1;
                        }
                    }
                }

                if let Some((family, preview, preview_seconds)) = candidate_sampler
                    .select_previewed_move(
                        &search.current_state,
                        &family_selector,
                        &run_context.allowed_sessions,
                        &mut rng,
                    )
                {
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
                            &run_context,
                            &search.current_state,
                            search.total_accepted_moves(),
                            family,
                            &preview,
                        )?;

                        search.refresh_best_from_current(iteration, cached_elapsed_seconds);
                        search.record_acceptance_result(true);
                    } else {
                        search.record_rejected_move(family);
                    }
                } else {
                    search.record_no_candidate();
                }

                search.finish_iteration(iteration);

                if let Some(callback) = progress_callback {
                    let current_time = get_current_time();
                    let elapsed_since_last_callback =
                        get_elapsed_seconds_between(last_progress_callback_at, current_time);

                    if should_emit_progress_callback(iteration, elapsed_since_last_callback) {
                        let callback_elapsed_seconds = get_elapsed_seconds(search_started_at);
                        let progress = search.to_progress_update(
                            &run_context,
                            iteration,
                            temperature,
                            callback_elapsed_seconds,
                            None,
                        );

                        if !(callback)(&progress) {
                            stop_reason = StopReason::ProgressCallbackRequestedStop;
                            let final_progress = search.to_progress_update(
                                &run_context,
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

                if run_context.stop_on_optimal_score
                    && search.best_score <= crate::models::OPTIMAL_SCORE_TOLERANCE
                {
                    stop_reason = StopReason::OptimalScoreReached;
                    break;
                }

                if let Some(limit) = run_context.no_improvement_limit {
                    if search.no_improvement_count >= limit {
                        stop_reason = StopReason::NoImprovementLimitReached;
                        break;
                    }
                }
            }
        }

        if let Some(callback) = progress_callback {
            if !final_progress_emitted {
                let final_iteration = search.iterations_completed.saturating_sub(1);
                let final_elapsed = get_elapsed_seconds(search_started_at);
                let final_progress_val = cooling_progress(
                    final_iteration,
                    run_context.max_iterations,
                    final_elapsed,
                    run_context.time_limit_seconds,
                );
                let final_progress = search.to_progress_update(
                    &run_context,
                    final_iteration,
                    record_to_record_threshold_for_progress(final_progress_val),
                    final_elapsed,
                    Some(stop_reason),
                );
                let _ = (callback)(&final_progress);
            }
        }

        let search_seconds = get_elapsed_seconds(search_started_at);
        let telemetry = search.to_benchmark_telemetry(&run_context, stop_reason, search_seconds);

        if let Some(observer) = benchmark_observer {
            observer(&BenchmarkEvent::RunCompleted(telemetry.clone()));
        }

        *state = search.best_state.clone();
        build_solver_result(
            &search.best_state,
            search.no_improvement_count,
            run_context.effective_seed,
            run_context.move_policy,
            stop_reason,
            telemetry,
        )
    }

    fn try_memetic_offspring_burst(
        &self,
        configuration: &SolverConfiguration,
        recipient_state: &RuntimeState,
        run_context: &SearchRunContext,
        iteration: u64,
        progress: f64,
        _allow_progress: bool,
    ) -> Result<Option<RuntimeState>, SolverError> {
        let mut best_offspring = None;
        let mut best_score = f64::INFINITY;
        let mut polished_donors = Vec::new();

        for donor_ordinal in 0..MEMETIC_DONOR_COUNT {
            let donor_seed = diversify_seed(
                run_context.effective_seed,
                iteration
                    .saturating_add(1)
                    .saturating_add(donor_ordinal as u64),
            );
            let Ok(mut donor_state) =
                RuntimeState::from_compiled_with_seed(recipient_state.compiled.clone(), donor_seed)
            else {
                continue;
            };

            let mut donor_configuration = configuration.clone();
            donor_configuration.seed = Some(donor_seed);
            donor_configuration.stop_conditions.time_limit_seconds =
                Some(memetic_per_donor_polish_seconds());
            donor_configuration
                .stop_conditions
                .no_improvement_iterations = None;

            self.solve_single_state_with_configuration(
                &donor_configuration,
                &mut donor_state,
                None,
                None,
                false,
            )?;

            polished_donors.push(donor_state.clone());

            let Some(offspring) = select_best_offspring_session(
                recipient_state,
                &donor_state,
                &run_context.allowed_sessions,
            )?
            else {
                continue;
            };

            if offspring.total_score < best_score {
                best_score = offspring.total_score;
                best_offspring = Some(offspring);
            }
        }

        if let Some(offspring) = select_best_cross_donor_bundle(
            recipient_state,
            &polished_donors,
            &run_context.allowed_sessions,
        )? {
            if offspring.total_score < best_score {
                best_score = offspring.total_score;
                best_offspring = Some(offspring);
            }
        }

        let Some(offspring) = best_offspring else {
            return Ok(None);
        };

        let threshold = record_to_record_threshold_for_progress(progress);
        if offspring.total_score <= recipient_state.total_score
            || offspring.total_score <= recipient_state.total_score + threshold
        {
            return Ok(Some(offspring));
        }

        Ok(None)
    }
}

fn build_solver_result(
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

fn apply_previewed_move(
    state: &mut RuntimeState,
    preview: &SearchMovePreview,
) -> Result<(), SolverError> {
    match preview {
        SearchMovePreview::Swap(preview) => apply_swap_runtime_preview(state, preview),
        SearchMovePreview::Transfer(preview) => apply_transfer_runtime_preview(state, preview),
        SearchMovePreview::CliqueSwap(preview) => apply_clique_swap_runtime_preview(state, preview),
    }
}

#[inline]
fn time_limit_exceeded(elapsed_seconds: f64, time_limit_seconds: Option<u64>) -> bool {
    time_limit_seconds.is_some_and(|limit| elapsed_seconds >= limit as f64)
}

#[inline]
pub(crate) fn should_emit_progress_callback(
    iteration: u64,
    elapsed_since_last_callback: f64,
) -> bool {
    iteration == 0 || elapsed_since_last_callback >= PROGRESS_CALLBACK_INTERVAL_SECONDS
}

#[inline]
fn should_attempt_memetic_burst(
    no_improvement_count: u64,
    time_limit_seconds: Option<u64>,
    elapsed_seconds: f64,
) -> bool {
    if no_improvement_count < MEMETIC_BURST_STAGNATION_THRESHOLD {
        return false;
    }

    time_limit_seconds.is_some_and(|limit| {
        elapsed_seconds + MEMETIC_TOTAL_DONOR_POLISH_SECONDS as f64 + 0.5
            < limit as f64 - MEMETIC_MIN_REMAINING_TIME_SECONDS as f64
    })
}

#[inline]
fn memetic_per_donor_polish_seconds() -> u64 {
    (MEMETIC_TOTAL_DONOR_POLISH_SECONDS / MEMETIC_DONOR_COUNT as u64).max(1)
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

fn maybe_run_sampled_correctness_check(
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
