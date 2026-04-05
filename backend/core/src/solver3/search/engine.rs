use std::time::Instant;

use rand::{rng, RngExt, SeedableRng};
use rand_chacha::ChaCha12Rng;

use crate::models::{
    BenchmarkEvent, BenchmarkObserver, BenchmarkRunStarted, MoveFamily,
    MoveFamilyBenchmarkTelemetry, MoveFamilyBenchmarkTelemetrySummary, MovePolicy,
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
use super::acceptance::{
    temperature_for_iteration, AcceptanceInputs, SimulatedAnnealingAcceptance,
};
use super::candidate_sampling::{CandidateSampler, SearchMovePreview};
use super::context::{SearchProgressState, SearchRunContext};
use super::family_selection::MoveFamilySelector;

#[cfg(feature = "solver3-oracle-checks")]
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
        let run_context =
            SearchRunContext::from_solver(&self.configuration, state, effective_seed)?;
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

                    maybe_run_sampled_oracle_check(
                        &search.current_state,
                        family,
                        family_metrics(&search.move_metrics, family).accepted,
                        &preview,
                    )?;

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
                let progress = search.to_progress_update(
                    &run_context,
                    iteration,
                    temperature,
                    search_started_at.elapsed().as_secs_f64(),
                    None,
                );

                if !(callback)(&progress) {
                    stop_reason = StopReason::ProgressCallbackRequestedStop;
                    let final_progress = search.to_progress_update(
                        &run_context,
                        iteration,
                        temperature,
                        search_started_at.elapsed().as_secs_f64(),
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
                let final_progress = search.to_progress_update(
                    &run_context,
                    final_iteration,
                    temperature_for_iteration(final_iteration, run_context.max_iterations),
                    search_started_at.elapsed().as_secs_f64(),
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
fn reached_time_limit(started_at: Instant, time_limit_seconds: Option<u64>) -> bool {
    time_limit_seconds.is_some_and(|limit| started_at.elapsed().as_secs() >= limit)
}

fn maybe_run_sampled_oracle_check(
    state: &RuntimeState,
    family: MoveFamily,
    accepted_move_count: u64,
    preview: &SearchMovePreview,
) -> Result<(), SolverError> {
    #[cfg(feature = "solver3-oracle-checks")]
    {
        if should_sample_oracle_check(accepted_move_count) {
            let preview_description = preview.describe();
            maybe_cross_check_runtime_state(
                state,
                &format!(
                    "search sampled {:?} accepted move {}",
                    family, preview_description
                ),
            )?;
        }
    }

    #[cfg(not(feature = "solver3-oracle-checks"))]
    {
        let _ = (state, family, accepted_move_count, preview);
    }

    Ok(())
}

#[cfg(feature = "solver3-oracle-checks")]
fn should_sample_oracle_check(accepted_move_count: u64) -> bool {
    accepted_move_count > 0 && accepted_move_count % ORACLE_DRIFT_SAMPLE_INTERVAL == 0
}
