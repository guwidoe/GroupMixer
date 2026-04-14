#[cfg(not(target_arch = "wasm32"))]
use std::time::Instant;

#[cfg(target_arch = "wasm32")]
use js_sys;

use rand::seq::index::sample;
use rand::{RngExt, SeedableRng};
use rand_chacha::ChaCha12Rng;

use crate::models::{
    BenchmarkEvent, BenchmarkObserver, BenchmarkRunStarted, MemeticBenchmarkTelemetry, MoveFamily,
    ProgressCallback, SolverResult, StopReason,
};
use crate::solver_support::SolverError;

use super::super::moves::apply_swap_runtime_preview;
use super::super::runtime_state::RuntimeState;
use super::candidate_sampling::{CandidateSampler, SwapSamplingOptions};
use super::context::{SearchProgressState, SearchRunContext};
use super::single_state::{
    self, build_solver_result, maybe_run_sampled_correctness_check, should_emit_progress_callback,
    LocalImproverBudget,
};

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
struct PopulationMember {
    state: RuntimeState,
}

#[derive(Debug, Clone, Copy, Default)]
struct MutationStats {
    attempted_swaps: u64,
    applied_swaps: u64,
}

#[derive(Debug, Clone, Copy, Default)]
struct LocalImproverStats {
    child_polish_iterations: u64,
    child_polish_improving_moves: u64,
    child_polish_seconds: f64,
}

impl PopulationMember {
    fn new(state: RuntimeState) -> Self {
        Self { state }
    }

    fn score(&self) -> f64 {
        self.state.total_score
    }
}

pub(crate) fn run(
    state: &mut RuntimeState,
    run_context: SearchRunContext,
    progress_callback: Option<&ProgressCallback>,
    benchmark_observer: Option<&BenchmarkObserver>,
) -> Result<SolverResult, SolverError> {
    let total_started_at = get_current_time();
    let mut rng = ChaCha12Rng::seed_from_u64(run_context.effective_seed);
    let memetic_config = run_context
        .steady_state_memetic
        .expect("steady-state memetic config should be normalized");
    let candidate_sampler = CandidateSampler;

    let mut population = initialize_population(
        state,
        memetic_config.population_size,
        run_context.effective_seed,
    )?;
    let best_initial_idx = population_best_index(&population);
    let mut search = SearchProgressState::new(population[best_initial_idx].state.clone());
    search.current_state = population[best_initial_idx].state.clone();
    search.memetic_telemetry = Some(MemeticBenchmarkTelemetry {
        population_size: memetic_config.population_size as u32,
        parent_tournament_size: memetic_config.parent_tournament_size as u32,
        child_polish_local_improver_mode: Some(run_context.local_improver_mode),
        child_polish_max_iterations: memetic_config.child_polish_max_iterations,
        child_polish_no_improvement_iterations: memetic_config
            .child_polish_no_improvement_iterations,
        ..Default::default()
    });

    let initialization_seconds = get_elapsed_seconds(total_started_at);

    if let Some(observer) = benchmark_observer {
        observer(&BenchmarkEvent::RunStarted(BenchmarkRunStarted {
            effective_seed: run_context.effective_seed,
            move_policy: run_context.move_policy.clone(),
            initial_score: search.initial_score,
        }));
    }

    let mut stop_reason = StopReason::MaxIterationsReached;
    let mut final_progress_emitted = false;
    let mut last_progress_callback_at = total_started_at;

    if run_context.stop_on_optimal_score
        && search.best_score <= crate::models::OPTIMAL_SCORE_TOLERANCE
    {
        stop_reason = StopReason::OptimalScoreReached;
    } else if time_limit_exceeded(
        get_elapsed_seconds(total_started_at),
        run_context.time_limit_seconds.map(|limit| limit as f64),
    ) {
        stop_reason = StopReason::TimeLimitReached;
    }

    if stop_reason != StopReason::OptimalScoreReached && stop_reason != StopReason::TimeLimitReached
    {
        for offspring_idx in 0..run_context.max_iterations {
            let elapsed_before_child = get_elapsed_seconds(total_started_at);
            if time_limit_exceeded(
                elapsed_before_child,
                run_context.time_limit_seconds.map(|limit| limit as f64),
            ) {
                stop_reason = StopReason::TimeLimitReached;
                break;
            }

            let parent_idx =
                select_parent_index(&population, memetic_config.parent_tournament_size, &mut rng);
            let mut child = population[parent_idx].state.clone();
            search
                .memetic_telemetry
                .as_mut()
                .expect("memetic telemetry should exist")
                .offspring_attempted += 1;
            let mutation_stats = mutate_child(
                &mut child,
                &run_context,
                &candidate_sampler,
                &mut search,
                &mut rng,
            )?;
            let memetic_telemetry = search
                .memetic_telemetry
                .as_mut()
                .expect("memetic telemetry should exist");
            memetic_telemetry.mutation_attempted_swaps += mutation_stats.attempted_swaps;
            memetic_telemetry.mutation_applied_swaps += mutation_stats.applied_swaps;
            memetic_telemetry.mutation_length_sum += mutation_stats.attempted_swaps;
            memetic_telemetry.mutation_length_min = Some(
                memetic_telemetry
                    .mutation_length_min
                    .map_or(mutation_stats.attempted_swaps, |current| {
                        current.min(mutation_stats.attempted_swaps)
                    }),
            );
            memetic_telemetry.mutation_length_max = Some(
                memetic_telemetry
                    .mutation_length_max
                    .map_or(mutation_stats.attempted_swaps, |current| {
                        current.max(mutation_stats.attempted_swaps)
                    }),
            );

            let remaining_time_seconds = run_context
                .time_limit_seconds
                .map(|limit| (limit as f64 - get_elapsed_seconds(total_started_at)).max(0.0));
            let polish_seed = rng.random::<u64>();
            let polish_outcome = single_state::polish_state(
                child,
                &run_context,
                LocalImproverBudget {
                    effective_seed: polish_seed,
                    max_iterations: memetic_config.child_polish_max_iterations,
                    no_improvement_limit: Some(
                        memetic_config.child_polish_no_improvement_iterations,
                    ),
                    time_limit_seconds: remaining_time_seconds,
                    stop_on_optimal_score: run_context.stop_on_optimal_score,
                },
            )?;
            let polished_child = polish_outcome.search.best_state.clone();
            let local_improver_stats = absorb_local_improver_metrics(
                &mut search,
                &polish_outcome.search,
                polish_outcome.search_seconds,
            );
            let memetic_telemetry = search
                .memetic_telemetry
                .as_mut()
                .expect("memetic telemetry should exist");
            memetic_telemetry.offspring_polished += 1;
            memetic_telemetry.child_polish_iterations +=
                local_improver_stats.child_polish_iterations;
            memetic_telemetry.child_polish_improving_moves +=
                local_improver_stats.child_polish_improving_moves;
            memetic_telemetry.child_polish_seconds += local_improver_stats.child_polish_seconds;
            search.current_state = polished_child.clone();

            if let Some(replacement_idx) =
                find_replacement_target(&population, polished_child.total_score)
            {
                population[replacement_idx] = PopulationMember::new(polished_child.clone());
                search
                    .memetic_telemetry
                    .as_mut()
                    .expect("memetic telemetry should exist")
                    .offspring_replaced += 1;
            } else {
                search
                    .memetic_telemetry
                    .as_mut()
                    .expect("memetic telemetry should exist")
                    .offspring_discarded += 1;
            }

            let elapsed_after_child = get_elapsed_seconds(total_started_at);
            search.refresh_best_from_current(offspring_idx, elapsed_after_child);
            search.finish_iteration(offspring_idx);

            if let Some(callback) = progress_callback {
                let current_time = get_current_time();
                let elapsed_since_last_callback =
                    get_elapsed_seconds_between(last_progress_callback_at, current_time);
                if should_emit_progress_callback(offspring_idx, elapsed_since_last_callback) {
                    let progress = search.to_progress_update(
                        &run_context,
                        offspring_idx,
                        0.0,
                        elapsed_after_child,
                        None,
                    );
                    if !(callback)(&progress) {
                        stop_reason = StopReason::ProgressCallbackRequestedStop;
                        let final_progress = search.to_progress_update(
                            &run_context,
                            offspring_idx,
                            0.0,
                            elapsed_after_child,
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

    if !final_progress_emitted {
        if let Some(callback) = progress_callback {
            let final_iteration = search.iterations_completed.saturating_sub(1);
            let final_elapsed = get_elapsed_seconds(total_started_at);
            let final_progress = search.to_progress_update(
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
    let search_seconds = (total_seconds - initialization_seconds).max(0.0);
    let mut telemetry = search.to_benchmark_telemetry(&run_context, stop_reason, search_seconds);
    telemetry.initialization_seconds = initialization_seconds;
    telemetry.search_seconds = search_seconds;
    telemetry.total_seconds = total_seconds;
    telemetry.iterations_per_second = if total_seconds > 0.0 {
        search.iterations_completed as f64 / total_seconds
    } else {
        0.0
    };
    telemetry.memetic = search.memetic_telemetry.clone();

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

fn initialize_population(
    state: &RuntimeState,
    population_size: usize,
    effective_seed: u64,
) -> Result<Vec<PopulationMember>, SolverError> {
    let mut population = Vec::with_capacity(population_size);
    population.push(PopulationMember::new(state.clone()));
    for idx in 1..population_size {
        let seed = effective_seed.wrapping_add(0x9E37_79B9_7F4A_7C15u64.wrapping_mul(idx as u64));
        let member_state = RuntimeState::from_compiled_with_seed(state.compiled.clone(), seed)?;
        population.push(PopulationMember::new(member_state));
    }
    Ok(population)
}

fn population_best_index(population: &[PopulationMember]) -> usize {
    population
        .iter()
        .enumerate()
        .min_by(|(_, left), (_, right)| left.score().total_cmp(&right.score()))
        .map(|(idx, _)| idx)
        .expect("population should be non-empty")
}

fn select_parent_index(
    population: &[PopulationMember],
    tournament_size: usize,
    rng: &mut ChaCha12Rng,
) -> usize {
    sample(rng, population.len(), tournament_size)
        .into_vec()
        .into_iter()
        .min_by(|left, right| {
            population[*left]
                .score()
                .total_cmp(&population[*right].score())
        })
        .expect("tournament should sample at least one parent")
}

fn find_replacement_target(population: &[PopulationMember], child_score: f64) -> Option<usize> {
    population
        .iter()
        .enumerate()
        .filter(|(_, member)| member.score() >= child_score)
        .max_by(|(_, left), (_, right)| left.score().total_cmp(&right.score()))
        .map(|(idx, _)| idx)
}

fn mutate_child(
    child: &mut RuntimeState,
    run_context: &SearchRunContext,
    candidate_sampler: &CandidateSampler,
    search: &mut SearchProgressState,
    rng: &mut ChaCha12Rng,
) -> Result<MutationStats, SolverError> {
    let config = run_context
        .steady_state_memetic
        .expect("memetic config should be normalized");
    let mutation_swaps = if config.mutation_swaps_min >= config.mutation_swaps_max {
        config.mutation_swaps_min
    } else {
        rng.random_range(config.mutation_swaps_min..=config.mutation_swaps_max)
    };
    let mut stats = MutationStats::default();

    for _ in 0..mutation_swaps {
        stats.attempted_swaps += 1;

        if run_context.allowed_sessions.is_empty() {
            continue;
        }

        let session_idx =
            run_context.allowed_sessions[rng.random_range(0..run_context.allowed_sessions.len())];
        let mut noop_tabu_telemetry = super::candidate_sampling::TabuSwapSamplingDelta::default();
        let preview_started_at = get_current_time();
        let preview = candidate_sampler.sample_random_swap_preview_in_session(
            child,
            session_idx,
            SwapSamplingOptions::default(),
            &mut noop_tabu_telemetry,
            rng,
        );
        let preview_seconds = get_elapsed_seconds_between(preview_started_at, get_current_time());

        let Some(preview) = preview else {
            continue;
        };

        let delta_score = preview.delta_score;
        search.record_preview_attempt(MoveFamily::Swap, preview_seconds, delta_score);
        let apply_started_at = get_current_time();
        apply_swap_runtime_preview(child, &preview)?;
        let apply_seconds = get_elapsed_seconds_between(apply_started_at, get_current_time());
        search.record_accepted_move(MoveFamily::Swap, apply_seconds, delta_score, false);
        search.record_acceptance_result(true);
        stats.applied_swaps += 1;
        maybe_run_sampled_correctness_check(
            run_context,
            child,
            search.total_accepted_moves(),
            MoveFamily::Swap,
            &super::candidate_sampling::SearchMovePreview::Swap(preview),
        )?;
    }

    Ok(stats)
}

fn absorb_local_improver_metrics(
    aggregate: &mut SearchProgressState,
    local: &SearchProgressState,
    local_search_seconds: f64,
) -> LocalImproverStats {
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

    LocalImproverStats {
        child_polish_iterations: local.iterations_completed,
        child_polish_improving_moves: local.move_metrics.swap.improving_accepts
            + local.move_metrics.transfer.improving_accepts
            + local.move_metrics.clique_swap.improving_accepts,
        child_polish_seconds: local_search_seconds,
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

#[inline]
fn time_limit_exceeded(elapsed_seconds: f64, time_limit_seconds: Option<f64>) -> bool {
    time_limit_seconds.is_some_and(|limit| elapsed_seconds >= limit)
}
