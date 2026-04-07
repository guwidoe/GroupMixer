use std::time::Instant;

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
use super::context::{SearchProgressState, SearchRunContext};
use super::family_selection::MoveFamilySelector;

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
        let effective_seed = self
            .configuration
            .seed
            .unwrap_or_else(|| rng().random::<u64>());
        let mut rng = ChaCha12Rng::seed_from_u64(effective_seed);
        let run_context =
            SearchRunContext::from_solver(&self.configuration, state, effective_seed)?;
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

        let search_started_at = Instant::now();
        let mut stop_reason = StopReason::MaxIterationsReached;
        let mut final_progress_emitted = false;

        // Refresh elapsed time every TIME_REFRESH_INTERVAL iterations so that
        // `Instant::elapsed()` (a cheap vDSO call, ~15–30 ns) is not called on
        // every single iteration, which would add up at high iteration rates.
        // At 30 µs/iter this gives ~2 ms time resolution — plenty for cooling
        // accuracy and the time-limit check.
        const TIME_REFRESH_INTERVAL: u64 = 64;
        let mut cached_elapsed_seconds: f64 = 0.0;

        for iteration in 0..run_context.max_iterations {
            // Refresh the elapsed-time cache every N iterations.
            if iteration % TIME_REFRESH_INTERVAL == 0 {
                cached_elapsed_seconds = search_started_at.elapsed().as_secs_f64();
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

                let acceptance = acceptance_policy.decide(
                    RecordToRecordInputs {
                        current_score,
                        best_score: search.best_score,
                        candidate_score,
                        progress,
                    },
                );

                if acceptance.accepted {
                    let apply_started_at = Instant::now();
                    apply_previewed_move(&mut search.current_state, &preview)?;
                    let apply_seconds = apply_started_at.elapsed().as_secs_f64();
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

                    search.refresh_best_from_current(
                        iteration,
                        cached_elapsed_seconds,
                    );
                    search.record_acceptance_result(true);
                } else {
                    search.record_rejected_move(family);
                }
            } else {
                search.record_no_candidate();
            }

            search.finish_iteration(iteration);

            if let Some(callback) = progress_callback {
                let progress = search.to_progress_update(
                    &run_context,
                    iteration,
                    temperature,
                    cached_elapsed_seconds,
                    None,
                );

                if !(callback)(&progress) {
                    stop_reason = StopReason::ProgressCallbackRequestedStop;
                    let final_progress = search.to_progress_update(
                        &run_context,
                        iteration,
                        temperature,
                        cached_elapsed_seconds,
                        Some(stop_reason),
                    );
                    let _ = (callback)(&final_progress);
                    final_progress_emitted = true;
                    break;
                }
            }

            if let Some(limit) = run_context.no_improvement_limit {
                if search.no_improvement_count >= limit {
                    stop_reason = StopReason::NoImprovementLimitReached;
                    break;
                }
            }
        }

        if let Some(callback) = progress_callback {
            if !final_progress_emitted {
                let final_iteration = search.iterations_completed.saturating_sub(1);
                let final_elapsed = search_started_at.elapsed().as_secs_f64();
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

        let search_seconds = search_started_at.elapsed().as_secs_f64();
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

/// Returns true when the cached elapsed time has met or exceeded the time limit.
/// Uses the caller-maintained cached value to avoid an `Instant::elapsed()` call
/// on every single iteration (debounced at `TIME_REFRESH_INTERVAL`).
#[inline]
fn time_limit_exceeded(elapsed_seconds: f64, time_limit_seconds: Option<u64>) -> bool {
    time_limit_seconds.is_some_and(|limit| elapsed_seconds >= limit as f64)
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
