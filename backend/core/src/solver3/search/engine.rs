use std::collections::VecDeque;
use std::time::Instant;

use rand::{rng, RngExt, SeedableRng};
use rand_chacha::ChaCha12Rng;

use crate::models::{
    BenchmarkEvent, BenchmarkObserver, BenchmarkRunStarted, MoveFamily,
    MoveFamilyBenchmarkTelemetrySummary, MovePolicy, ProgressCallback, ProgressUpdate,
    SolverBenchmarkTelemetry, SolverConfiguration, SolverResult, StopReason,
};
use crate::solver_support::SolverError;

use super::super::moves::{
    apply_swap_runtime_preview, preview_swap_runtime_lightweight, SwapMove, SwapRuntimePreview,
};
use super::super::oracle::{check_drift, oracle_score};
use super::super::runtime_state::RuntimeState;

const DEFAULT_MAX_ITERATIONS: u64 = 10_000;
const DEFAULT_INITIAL_TEMPERATURE: f64 = 2.0;
const DEFAULT_FINAL_TEMPERATURE: f64 = 0.05;
const RECENT_WINDOW: usize = 100;
const MAX_RANDOM_CANDIDATE_ATTEMPTS: usize = 24;
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
        let move_policy = self
            .configuration
            .move_policy
            .clone()
            .unwrap_or_default()
            .normalized()
            .map_err(SolverError::ValidationError)?;
        let effective_seed = self
            .configuration
            .seed
            .unwrap_or_else(|| rng().random::<u64>());
        let mut rng = ChaCha12Rng::seed_from_u64(effective_seed);
        let max_iterations = self
            .configuration
            .stop_conditions
            .max_iterations
            .unwrap_or(DEFAULT_MAX_ITERATIONS);
        let no_improvement_limit = self.configuration.stop_conditions.no_improvement_iterations;
        let time_limit_seconds = self.configuration.stop_conditions.time_limit_seconds;
        let allowed_sessions = self.allowed_sessions(state);

        let mut current_state = state.clone();
        let mut best_state = current_state.clone();
        let initial_score = current_state.total_score;
        let mut best_score = initial_score;
        let mut no_improvement_count = 0u64;
        let mut iterations_completed = 0u64;
        let mut local_optima_escapes = 0u64;
        let mut attempted_delta_sum = 0.0;
        let mut accepted_delta_sum = 0.0;
        let mut biggest_attempted_increase: f64 = 0.0;
        let mut biggest_accepted_increase: f64 = 0.0;
        let mut recent_acceptance = VecDeque::with_capacity(RECENT_WINDOW);
        let mut move_metrics = MoveFamilyBenchmarkTelemetrySummary::default();

        if let Some(observer) = benchmark_observer {
            observer(&BenchmarkEvent::RunStarted(BenchmarkRunStarted {
                effective_seed,
                move_policy: move_policy.clone(),
                initial_score,
            }));
        }

        let search_started_at = Instant::now();
        let mut stop_reason = StopReason::MaxIterationsReached;
        let mut final_progress_emitted = false;

        for iteration in 0..max_iterations {
            if reached_time_limit(search_started_at, time_limit_seconds) {
                stop_reason = StopReason::TimeLimitReached;
                break;
            }

            let temperature = temperature_for_iteration(iteration, max_iterations);
            let family_metrics = &mut move_metrics.swap;

            let preview_started_at = Instant::now();
            let preview =
                sample_swap_preview(&current_state, &move_policy, &allowed_sessions, &mut rng);
            family_metrics.preview_seconds += preview_started_at.elapsed().as_secs_f64();

            match preview {
                Some(preview) => {
                    family_metrics.attempts += 1;
                    let delta_cost = preview.delta_score;
                    attempted_delta_sum += delta_cost;
                    biggest_attempted_increase =
                        biggest_attempted_increase.max(delta_cost.max(0.0));

                    let accepted = delta_cost <= 0.0
                        || (temperature > 0.0
                            && rng.random::<f64>()
                                < (-delta_cost / temperature).exp().clamp(0.0, 1.0));

                    if accepted {
                        let apply_started_at = Instant::now();
                        apply_swap_runtime_preview(&mut current_state, &preview)?;
                        family_metrics.apply_seconds += apply_started_at.elapsed().as_secs_f64();
                        family_metrics.accepted += 1;
                        accepted_delta_sum += delta_cost;

                        if should_sample_oracle_check(family_metrics.accepted) {
                            check_drift(&current_state).map_err(|error| {
                                SolverError::ValidationError(format!(
                                    "solver3 runtime swap drift check failed after accepted move {:?}: {}",
                                    preview.analysis.swap, error
                                ))
                            })?;
                        }

                        if delta_cost > 0.0 {
                            local_optima_escapes += 1;
                            biggest_accepted_increase = biggest_accepted_increase.max(delta_cost);
                        }

                        if current_state.total_score < best_score {
                            best_score = current_state.total_score;
                            best_state = current_state.clone();
                            no_improvement_count = 0;
                        } else {
                            no_improvement_count += 1;
                        }
                        push_recent_acceptance(&mut recent_acceptance, true);
                    } else {
                        family_metrics.rejected += 1;
                        no_improvement_count += 1;
                        push_recent_acceptance(&mut recent_acceptance, false);
                    }
                }
                None => {
                    no_improvement_count += 1;
                    push_recent_acceptance(&mut recent_acceptance, false);
                }
            }

            iterations_completed = iteration + 1;

            if let Some(callback) = progress_callback {
                let progress = build_progress_update(
                    iteration,
                    max_iterations,
                    temperature,
                    search_started_at.elapsed().as_secs_f64(),
                    &current_state,
                    &best_state,
                    no_improvement_count,
                    &move_metrics,
                    attempted_delta_sum,
                    accepted_delta_sum,
                    biggest_attempted_increase,
                    biggest_accepted_increase,
                    local_optima_escapes,
                    &recent_acceptance,
                    effective_seed,
                    &move_policy,
                    None,
                );

                if !(callback)(&progress) {
                    stop_reason = StopReason::ProgressCallbackRequestedStop;
                    let final_progress = build_progress_update(
                        iteration,
                        max_iterations,
                        temperature,
                        search_started_at.elapsed().as_secs_f64(),
                        &current_state,
                        &best_state,
                        no_improvement_count,
                        &move_metrics,
                        attempted_delta_sum,
                        accepted_delta_sum,
                        biggest_attempted_increase,
                        biggest_accepted_increase,
                        local_optima_escapes,
                        &recent_acceptance,
                        effective_seed,
                        &move_policy,
                        Some(stop_reason),
                    );
                    let _ = (callback)(&final_progress);
                    final_progress_emitted = true;
                    break;
                }
            }

            if let Some(limit) = no_improvement_limit {
                if no_improvement_count >= limit {
                    stop_reason = StopReason::NoImprovementLimitReached;
                    break;
                }
            }
        }

        if let Some(callback) = progress_callback {
            if !final_progress_emitted {
                let final_iteration = iterations_completed.saturating_sub(1);
                let final_progress = build_progress_update(
                    final_iteration,
                    max_iterations,
                    temperature_for_iteration(final_iteration, max_iterations),
                    search_started_at.elapsed().as_secs_f64(),
                    &current_state,
                    &best_state,
                    no_improvement_count,
                    &move_metrics,
                    attempted_delta_sum,
                    accepted_delta_sum,
                    biggest_attempted_increase,
                    biggest_accepted_increase,
                    local_optima_escapes,
                    &recent_acceptance,
                    effective_seed,
                    &move_policy,
                    Some(stop_reason),
                );
                let _ = (callback)(&final_progress);
            }
        }

        let search_seconds = search_started_at.elapsed().as_secs_f64();
        let telemetry = SolverBenchmarkTelemetry {
            effective_seed,
            move_policy: move_policy.clone(),
            stop_reason,
            iterations_completed,
            no_improvement_count,
            reheats_performed: 0,
            initial_score,
            best_score: best_state.total_score,
            final_score: best_state.total_score,
            initialization_seconds: 0.0,
            search_seconds,
            finalization_seconds: 0.0,
            total_seconds: search_seconds,
            moves: move_metrics.clone(),
        };

        if let Some(observer) = benchmark_observer {
            observer(&BenchmarkEvent::RunCompleted(telemetry.clone()));
        }

        *state = best_state.clone();
        build_solver_result(
            &best_state,
            no_improvement_count,
            effective_seed,
            move_policy,
            stop_reason,
            telemetry,
        )
    }

    fn allowed_sessions(&self, state: &RuntimeState) -> Vec<usize> {
        state
            .compiled
            .allowed_sessions
            .clone()
            .unwrap_or_else(|| (0..state.compiled.num_sessions).collect())
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

fn sample_swap_preview(
    state: &RuntimeState,
    move_policy: &MovePolicy,
    allowed_sessions: &[usize],
    rng: &mut ChaCha12Rng,
) -> Option<SwapRuntimePreview> {
    if move_policy
        .forced_family
        .is_some_and(|family| family != MoveFamily::Swap)
    {
        return None;
    }

    if let Some(allowed) = &move_policy.allowed_families {
        if !allowed.contains(&MoveFamily::Swap) {
            return None;
        }
    }

    if allowed_sessions.is_empty() || state.compiled.num_groups < 2 {
        return None;
    }

    for _ in 0..MAX_RANDOM_CANDIDATE_ATTEMPTS {
        let session_idx = allowed_sessions[rng.random_range(0..allowed_sessions.len())];
        let left_group_idx = rng.random_range(0..state.compiled.num_groups);
        let mut right_group_idx = rng.random_range(0..state.compiled.num_groups);
        if right_group_idx == left_group_idx {
            right_group_idx = (right_group_idx + 1) % state.compiled.num_groups;
        }

        let left_slot = state.group_slot(session_idx, left_group_idx);
        let right_slot = state.group_slot(session_idx, right_group_idx);
        let left_members = &state.group_members[left_slot];
        let right_members = &state.group_members[right_slot];
        if left_members.is_empty() || right_members.is_empty() {
            continue;
        }

        let left_person_idx = left_members[rng.random_range(0..left_members.len())];
        let right_person_idx = right_members[rng.random_range(0..right_members.len())];
        let swap = SwapMove::new(session_idx, left_person_idx, right_person_idx);
        if let Ok(preview) = preview_swap_runtime_lightweight(state, &swap) {
            return Some(preview);
        }
    }

    None
}

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

fn temperature_for_iteration(iteration: u64, max_iterations: u64) -> f64 {
    if max_iterations <= 1 {
        return DEFAULT_FINAL_TEMPERATURE;
    }
    let progress = (iteration as f64 / (max_iterations - 1) as f64).clamp(0.0, 1.0);
    DEFAULT_INITIAL_TEMPERATURE
        * (DEFAULT_FINAL_TEMPERATURE / DEFAULT_INITIAL_TEMPERATURE).powf(progress)
}

fn push_recent_acceptance(recent_acceptance: &mut VecDeque<bool>, accepted: bool) {
    if recent_acceptance.len() == RECENT_WINDOW {
        recent_acceptance.pop_front();
    }
    recent_acceptance.push_back(accepted);
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

fn should_sample_oracle_check(accepted_swap_count: u64) -> bool {
    accepted_swap_count > 0 && accepted_swap_count % ORACLE_DRIFT_SAMPLE_INTERVAL == 0
}
