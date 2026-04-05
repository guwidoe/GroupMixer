use std::collections::VecDeque;
use std::time::Instant;

use rand::{rng, RngExt, SeedableRng};
use rand_chacha::ChaCha12Rng;

use crate::models::{
    BenchmarkEvent, BenchmarkObserver, BenchmarkRunStarted, MoveFamily,
    MoveFamilyBenchmarkTelemetry, MoveFamilyBenchmarkTelemetrySummary, MovePolicy,
    ProgressCallback, ProgressUpdate, SolverBenchmarkTelemetry, SolverConfiguration,
    SolverResult, StopReason,
};
use crate::solver_support::SolverError;

use super::acceptance::{AcceptanceInputs, SimulatedAnnealingAcceptance, temperature_for_iteration};
use super::candidate_sampling::{CandidateSampler, SearchMovePreview};
use super::context::{SearchProgressState, SearchRunContext};
use super::family_selection::MoveFamilySelector;
use super::super::moves::{
    apply_clique_swap_runtime_preview, apply_swap_runtime_preview, apply_transfer_runtime_preview,
};
use super::super::oracle::{check_drift, oracle_score};
use super::super::runtime_state::RuntimeState;

const ORACLE_DRIFT_SAMPLE_INTERVAL: u64 = 16;

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
        let run_context = SearchRunContext::from_solver(&self.configuration, state, effective_seed)?;
        let acceptance_policy = SimulatedAnnealingAcceptance;
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

        for iteration in 0..run_context.max_iterations {
            if reached_time_limit(search_started_at, run_context.time_limit_seconds) {
                stop_reason = StopReason::TimeLimitReached;
                break;
            }

            let temperature = temperature_for_iteration(iteration, run_context.max_iterations);

            if let Some((family, preview, preview_seconds)) =
                candidate_sampler.select_previewed_move(
                    &search.current_state,
                    &family_selector,
                    &run_context.allowed_sessions,
                    &mut rng,
                )
            {
                let delta_cost = preview.delta_score();
                search.record_preview_attempt(family, preview_seconds, delta_cost);

                let acceptance = acceptance_policy.decide(
                    AcceptanceInputs {
                        iteration,
                        max_iterations: run_context.max_iterations,
                        delta_score: delta_cost,
                    },
                    &mut rng,
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

                    if should_sample_oracle_check(family_metrics(&search.move_metrics, family).accepted)
                    {
                        let preview_description = preview.describe();
                        check_drift(&search.current_state).map_err(|error| {
                            SolverError::ValidationError(format!(
                                "solver3 runtime {:?} drift check failed after accepted move {}: {}",
                                family, preview_description, error
                            ))
                        })?;
                    }

                    search.refresh_best_from_current();
                    search.record_acceptance_result(true);
                } else {
                    search.record_rejected_move(family);
                }
            } else {
                search.record_no_candidate();
            }

            search.finish_iteration(iteration);

            if let Some(callback) = progress_callback {
                let progress = build_progress_update(
                    iteration,
                    run_context.max_iterations,
                    temperature,
                    search_started_at.elapsed().as_secs_f64(),
                    &search.current_state,
                    &search.best_state,
                    search.no_improvement_count,
                    &search.move_metrics,
                    search.attempted_delta_sum,
                    search.accepted_delta_sum,
                    search.biggest_attempted_increase,
                    search.biggest_accepted_increase,
                    search.local_optima_escapes,
                    &search.recent_acceptance,
                    run_context.effective_seed,
                    &run_context.move_policy,
                    None,
                );

                if !(callback)(&progress) {
                    stop_reason = StopReason::ProgressCallbackRequestedStop;
                    let final_progress = build_progress_update(
                        iteration,
                        run_context.max_iterations,
                        temperature,
                        search_started_at.elapsed().as_secs_f64(),
                        &search.current_state,
                        &search.best_state,
                        search.no_improvement_count,
                        &search.move_metrics,
                        search.attempted_delta_sum,
                        search.accepted_delta_sum,
                        search.biggest_attempted_increase,
                        search.biggest_accepted_increase,
                        search.local_optima_escapes,
                        &search.recent_acceptance,
                        run_context.effective_seed,
                        &run_context.move_policy,
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
                let final_progress = build_progress_update(
                    final_iteration,
                    run_context.max_iterations,
                    temperature_for_iteration(final_iteration, run_context.max_iterations),
                    search_started_at.elapsed().as_secs_f64(),
                    &search.current_state,
                    &search.best_state,
                    search.no_improvement_count,
                    &search.move_metrics,
                    search.attempted_delta_sum,
                    search.accepted_delta_sum,
                    search.biggest_attempted_increase,
                    search.biggest_accepted_increase,
                    search.local_optima_escapes,
                    &search.recent_acceptance,
                    run_context.effective_seed,
                    &run_context.move_policy,
                    Some(stop_reason),
                );
                let _ = (callback)(&final_progress);
            }
        }

        let search_seconds = search_started_at.elapsed().as_secs_f64();
        let telemetry = SolverBenchmarkTelemetry {
            effective_seed: run_context.effective_seed,
            move_policy: run_context.move_policy.clone(),
            stop_reason,
            iterations_completed: search.iterations_completed,
            no_improvement_count: search.no_improvement_count,
            reheats_performed: 0,
            initial_score: search.initial_score,
            best_score: search.best_state.total_score,
            final_score: search.best_state.total_score,
            initialization_seconds: 0.0,
            search_seconds,
            finalization_seconds: 0.0,
            total_seconds: search_seconds,
            moves: search.move_metrics.clone(),
        };

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

fn family_metrics(
    summary: &MoveFamilyBenchmarkTelemetrySummary,
    family: MoveFamily,
) -> &MoveFamilyBenchmarkTelemetry {
    match family {
        MoveFamily::Swap => &summary.swap,
        MoveFamily::Transfer => &summary.transfer,
        MoveFamily::CliqueSwap => &summary.clique_swap,
    }
}

#[allow(clippy::too_many_arguments)]
fn build_progress_update(
    iteration: u64,
    max_iterations: u64,
    temperature: f64,
    elapsed_seconds: f64,
    current_state: &RuntimeState,
    best_state: &RuntimeState,
    no_improvement_count: u64,
    move_metrics: &MoveFamilyBenchmarkTelemetrySummary,
    attempted_delta_sum: f64,
    accepted_delta_sum: f64,
    biggest_attempted_increase: f64,
    biggest_accepted_increase: f64,
    local_optima_escapes: u64,
    recent_acceptance: &VecDeque<bool>,
    effective_seed: u64,
    move_policy: &MovePolicy,
    stop_reason: Option<StopReason>,
) -> ProgressUpdate {
    let total_attempts = move_metrics.swap.attempts
        + move_metrics.transfer.attempts
        + move_metrics.clique_swap.attempts;
    let total_accepted = move_metrics.swap.accepted
        + move_metrics.transfer.accepted
        + move_metrics.clique_swap.accepted;
    let overall_acceptance_rate = ratio(total_accepted, total_attempts);
    let recent_acceptance_rate = if recent_acceptance.is_empty() {
        0.0
    } else {
        recent_acceptance
            .iter()
            .filter(|accepted| **accepted)
            .count() as f64
            / recent_acceptance.len() as f64
    };

    ProgressUpdate {
        iteration,
        max_iterations,
        temperature,
        current_score: current_state.total_score,
        best_score: best_state.total_score,
        current_contacts: current_state.unique_contacts as i32,
        best_contacts: best_state.unique_contacts as i32,
        repetition_penalty: current_state.repetition_penalty_raw,
        elapsed_seconds,
        no_improvement_count,
        clique_swaps_tried: move_metrics.clique_swap.attempts,
        clique_swaps_accepted: move_metrics.clique_swap.accepted,
        clique_swaps_rejected: move_metrics.clique_swap.rejected,
        transfers_tried: move_metrics.transfer.attempts,
        transfers_accepted: move_metrics.transfer.accepted,
        transfers_rejected: move_metrics.transfer.rejected,
        swaps_tried: move_metrics.swap.attempts,
        swaps_accepted: move_metrics.swap.accepted,
        swaps_rejected: move_metrics.swap.rejected,
        overall_acceptance_rate,
        recent_acceptance_rate,
        avg_attempted_move_delta: average_delta(attempted_delta_sum, total_attempts),
        avg_accepted_move_delta: average_delta(accepted_delta_sum, total_accepted),
        biggest_accepted_increase,
        biggest_attempted_increase,
        current_repetition_penalty: current_state.weighted_repetition_penalty,
        current_balance_penalty: current_state.attribute_balance_penalty,
        current_constraint_penalty: current_state.constraint_penalty_weighted,
        best_repetition_penalty: best_state.weighted_repetition_penalty,
        best_balance_penalty: best_state.attribute_balance_penalty,
        best_constraint_penalty: best_state.constraint_penalty_weighted,
        reheats_performed: 0,
        iterations_since_last_reheat: iteration,
        local_optima_escapes,
        avg_time_per_iteration_ms: if iteration == 0 {
            0.0
        } else {
            elapsed_seconds * 1000.0 / iteration as f64
        },
        cooling_progress: if max_iterations == 0 {
            1.0
        } else {
            ((iteration + 1) as f64 / max_iterations as f64).clamp(0.0, 1.0)
        },
        clique_swap_success_rate: ratio(
            move_metrics.clique_swap.accepted,
            move_metrics.clique_swap.attempts,
        ),
        transfer_success_rate: ratio(
            move_metrics.transfer.accepted,
            move_metrics.transfer.attempts,
        ),
        swap_success_rate: ratio(move_metrics.swap.accepted, move_metrics.swap.attempts),
        score_variance: 0.0,
        search_efficiency: if elapsed_seconds > 0.0 {
            (best_state.total_score - current_state.total_score).abs() / elapsed_seconds
        } else {
            0.0
        },
        best_schedule: None,
        effective_seed: Some(effective_seed),
        move_policy: Some(move_policy.clone()),
        stop_reason,
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

fn reached_time_limit(started_at: Instant, time_limit_seconds: Option<u64>) -> bool {
    time_limit_seconds.is_some_and(|limit| started_at.elapsed().as_secs() >= limit)
}

fn should_sample_oracle_check(accepted_move_count: u64) -> bool {
    accepted_move_count > 0 && accepted_move_count % ORACLE_DRIFT_SAMPLE_INTERVAL == 0
}
