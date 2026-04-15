use std::collections::VecDeque;

use rand::{rng, seq::SliceRandom, RngExt, SeedableRng};
use rand_chacha::ChaCha12Rng;

use crate::models::{
    BenchmarkEvent, BenchmarkObserver, BenchmarkRunStarted, BestScoreTimelinePoint, MoveFamily,
    MoveFamilyBenchmarkTelemetry, MoveFamilyBenchmarkTelemetrySummary, MovePolicy,
    MoveSelectionMode, ProgressCallback, ProgressUpdate, SolverBenchmarkTelemetry,
    SolverConfiguration, SolverResult, StopReason,
};
use crate::solver_support::SolverError;

use super::super::move_types::CandidateMove;
use super::super::moves::clique_swap::{
    apply_clique_swap_runtime_preview, preview_clique_swap_runtime_lightweight, CliqueSwapMove,
    CliqueSwapRuntimePreview,
};
use super::super::moves::swap::{
    apply_swap_runtime_preview, preview_swap_runtime_lightweight, SwapMove, SwapRuntimePreview,
};
use super::super::moves::transfer::{
    apply_transfer_runtime_preview, preview_transfer_runtime_lightweight, TransferMove,
    TransferRuntimePreview,
};
use super::super::runtime_state::RuntimeSolutionState;
use super::super::validation::invariants::validate_state_invariants;
use super::super::SolutionState;

const DEFAULT_MAX_ITERATIONS: u64 = 10_000;
const DEFAULT_INITIAL_TEMPERATURE: f64 = 2.0;
const DEFAULT_FINAL_TEMPERATURE: f64 = 0.05;
const RECENT_WINDOW: usize = 100;
const MAX_RANDOM_CANDIDATE_ATTEMPTS: usize = 24;
const MAX_RANDOM_TARGET_ATTEMPTS: usize = 24;

#[derive(Debug, Clone, PartialEq)]
enum SearchMovePreview {
    Swap(SwapRuntimePreview),
    Transfer(TransferRuntimePreview),
    CliqueSwap(CliqueSwapRuntimePreview),
}

impl SearchMovePreview {
    fn delta_cost(&self) -> f64 {
        match self {
            Self::Swap(preview) => preview.delta_cost,
            Self::Transfer(preview) => preview.delta_cost,
            Self::CliqueSwap(preview) => preview.delta_cost,
        }
    }

    fn candidate(&self) -> CandidateMove {
        match self {
            Self::Swap(preview) => CandidateMove::Swap(preview.analysis.swap.clone()),
            Self::Transfer(preview) => CandidateMove::Transfer(preview.analysis.transfer.clone()),
            Self::CliqueSwap(preview) => {
                CandidateMove::CliqueSwap(preview.analysis.clique_swap.clone())
            }
        }
    }
}

/// Minimal runnable search-engine entry point for `solver2`.
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
        state: &mut SolutionState,
        progress_callback: Option<&ProgressCallback>,
        benchmark_observer: Option<&BenchmarkObserver>,
    ) -> Result<SolverResult, SolverError> {
        let run_started_at = now_seconds();
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
        let stop_on_optimal_score = self.configuration.stop_conditions.stop_on_optimal_score;
        let allowed_sessions = self.allowed_sessions(state).into_iter().collect::<Vec<_>>();

        let mut current_state = RuntimeSolutionState::from_oracle_state(state);
        let mut best_state = current_state.clone();
        let initial_score = current_state.current_score.total_score;
        let mut best_score = initial_score;
        let mut no_improvement_count = 0u64;
        let mut max_no_improvement_streak = 0u64;
        let mut iterations_completed = 0u64;
        let mut local_optima_escapes = 0u64;
        let mut accepted_uphill_moves = 0u64;
        let mut accepted_downhill_moves = 0u64;
        let mut accepted_neutral_moves = 0u64;
        let mut attempted_delta_sum = 0.0;
        let mut accepted_delta_sum = 0.0;
        let mut biggest_attempted_increase: f64 = 0.0;
        let mut biggest_accepted_increase: f64 = 0.0;
        let mut recent_acceptance = VecDeque::with_capacity(RECENT_WINDOW);
        let mut best_score_timeline = vec![BestScoreTimelinePoint {
            iteration: 0,
            elapsed_seconds: 0.0,
            best_score: initial_score,
        }];
        let mut move_metrics = MoveFamilyBenchmarkTelemetrySummary::default();

        if let Some(observer) = benchmark_observer {
            observer(&BenchmarkEvent::RunStarted(BenchmarkRunStarted {
                effective_seed,
                move_policy: move_policy.clone(),
                initial_score,
            }));
        }

        let search_started_at = now_seconds();
        let mut stop_reason = StopReason::MaxIterationsReached;
        let mut final_progress_emitted = false;

        if stop_on_optimal_score && best_score <= crate::models::OPTIMAL_SCORE_TOLERANCE {
            stop_reason = StopReason::OptimalScoreReached;
        }

        if stop_reason != StopReason::OptimalScoreReached {
            for iteration in 0..max_iterations {
                if reached_time_limit(run_started_at, time_limit_seconds) {
                    stop_reason = StopReason::TimeLimitReached;
                    break;
                }

                let temperature = temperature_for_iteration(iteration, max_iterations);

                if let Some((family, candidate)) = self.select_candidate_move(
                    &current_state,
                    &move_policy,
                    &allowed_sessions,
                    &mut rng,
                ) {
                    let family_metrics = family_metrics_mut(&mut move_metrics, family);
                    family_metrics.attempts += 1;

                    let preview_started_at = now_seconds();
                    let preview = preview_candidate(&current_state, &candidate);
                    let preview_seconds = now_seconds() - preview_started_at;
                    family_metrics.preview_seconds += preview_seconds;
                    if move_family_preview_uses_full_recompute(family) {
                        family_metrics.full_recalculation_count += 1;
                        family_metrics.full_recalculation_seconds += preview_seconds;
                    }

                    match preview {
                        Ok(preview) => {
                            let delta_cost = preview.delta_cost();
                            let preview_candidate = preview.candidate();
                            attempted_delta_sum += delta_cost;
                            biggest_attempted_increase =
                                biggest_attempted_increase.max(delta_cost.max(0.0));

                            let accepted = delta_cost <= 0.0
                                || (temperature > 0.0
                                    && rng.random::<f64>()
                                        < (-delta_cost / temperature).exp().clamp(0.0, 1.0));

                            if accepted {
                                let apply_started_at = now_seconds();
                                apply_previewed_candidate(&mut current_state, &preview)?;
                                let apply_seconds = now_seconds() - apply_started_at;
                                family_metrics.accepted += 1;
                                if delta_cost < 0.0 {
                                    family_metrics.improving_accepts += 1;
                                    accepted_downhill_moves += 1;
                                } else if delta_cost > 0.0 {
                                    accepted_uphill_moves += 1;
                                } else {
                                    accepted_neutral_moves += 1;
                                }
                                family_metrics.apply_seconds += apply_seconds;
                                accepted_delta_sum += delta_cost;

                                if should_sample_runtime_oracle_check(family_metrics.accepted) {
                                    current_state.validate_against_oracle().map_err(|error| {
                                    SolverError::ValidationError(format!(
                                        "solver2 runtime {:?} drift check failed after accepted move {:?}: {}",
                                        family, preview_candidate, error
                                    ))
                                })?;
                                }

                                if delta_cost > 0.0 {
                                    local_optima_escapes += 1;
                                    biggest_accepted_increase =
                                        biggest_accepted_increase.max(delta_cost);
                                }

                                if self.configuration.logging.debug_validate_invariants {
                                    validate_state_invariants(&current_state).map_err(|error| {
                                    if self.configuration.logging.debug_dump_invariant_context {
                                        SolverError::ValidationError(format!(
                                            "solver2 invariant validation failed after accepted {:?}: {}",
                                            preview_candidate, error
                                        ))
                                    } else {
                                        error
                                    }
                                })?;
                                }

                                if current_state.current_score.total_score < best_score {
                                    best_score = current_state.current_score.total_score;
                                    best_state = current_state.clone();
                                    no_improvement_count = 0;
                                    best_score_timeline.push(BestScoreTimelinePoint {
                                        iteration: iteration + 1,
                                        elapsed_seconds: now_seconds() - search_started_at,
                                        best_score,
                                    });
                                } else {
                                    increment_no_improvement_streak(
                                        &mut no_improvement_count,
                                        &mut max_no_improvement_streak,
                                    );
                                }
                                push_recent_acceptance(&mut recent_acceptance, true);
                            } else {
                                family_metrics.rejected += 1;
                                increment_no_improvement_streak(
                                    &mut no_improvement_count,
                                    &mut max_no_improvement_streak,
                                );
                                push_recent_acceptance(&mut recent_acceptance, false);
                            }
                        }
                        Err(_) => {
                            family_metrics.rejected += 1;
                            increment_no_improvement_streak(
                                &mut no_improvement_count,
                                &mut max_no_improvement_streak,
                            );
                            push_recent_acceptance(&mut recent_acceptance, false);
                        }
                    }
                } else {
                    increment_no_improvement_streak(
                        &mut no_improvement_count,
                        &mut max_no_improvement_streak,
                    );
                }

                iterations_completed = iteration + 1;

                if let Some(callback) = progress_callback {
                    let progress = build_progress_update(
                        iteration,
                        max_iterations,
                        temperature,
                        search_started_at,
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
                        &self.configuration,
                        None,
                    );

                    if !(callback)(&progress) {
                        stop_reason = StopReason::ProgressCallbackRequestedStop;
                        let final_progress = build_progress_update(
                            iteration,
                            max_iterations,
                            temperature,
                            search_started_at,
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
                            &self.configuration,
                            Some(stop_reason),
                        );
                        let _ = (callback)(&final_progress);
                        final_progress_emitted = true;
                        break;
                    }
                }

                if stop_on_optimal_score
                    && best_state.current_score.total_score
                        <= crate::models::OPTIMAL_SCORE_TOLERANCE
                {
                    stop_reason = StopReason::OptimalScoreReached;
                    break;
                }

                if let Some(limit) = no_improvement_limit {
                    if no_improvement_count >= limit {
                        stop_reason = StopReason::NoImprovementLimitReached;
                        break;
                    }
                }
            }
        }

        if !final_progress_emitted {
            if reached_time_limit(run_started_at, time_limit_seconds) && iterations_completed == 0 {
                stop_reason = StopReason::TimeLimitReached;
            }

            if let Some(callback) = progress_callback {
                let final_iteration = iterations_completed.saturating_sub(1);
                let final_progress = build_progress_update(
                    final_iteration,
                    max_iterations,
                    temperature_for_iteration(final_iteration, max_iterations),
                    search_started_at,
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
                    &self.configuration,
                    Some(stop_reason),
                );
                let _ = (callback)(&final_progress);
            }
        }

        let search_finished_at = now_seconds();
        let telemetry = SolverBenchmarkTelemetry {
            effective_seed,
            move_policy: move_policy.clone(),
            stop_reason,
            iterations_completed,
            no_improvement_count,
            max_no_improvement_streak,
            reheats_performed: 0,
            accepted_uphill_moves,
            accepted_downhill_moves,
            accepted_neutral_moves,
            restart_count: None,
            perturbation_count: None,
            initial_score,
            best_score: best_state.current_score.total_score,
            final_score: best_state.current_score.total_score,
            initialization_seconds: search_started_at - run_started_at,
            search_seconds: search_finished_at - search_started_at,
            finalization_seconds: 0.0,
            total_seconds: search_finished_at - run_started_at,
            iterations_per_second: if search_finished_at > search_started_at {
                iterations_completed as f64 / (search_finished_at - search_started_at)
            } else {
                0.0
            },
            best_score_timeline,
            repeat_guided_swaps: crate::models::RepeatGuidedSwapBenchmarkTelemetry::default(),
            sgp_week_pair_tabu: None,
            memetic: None,
            donor_session_transplant: None,
            session_aligned_path_relinking: None,
            multi_root_balanced_session_inheritance: None,
            solver4_paper_trace: None,
            moves: move_metrics.clone(),
        };

        if let Some(observer) = benchmark_observer {
            observer(&BenchmarkEvent::RunCompleted(telemetry.clone()));
        }

        *state = best_state.clone().into_oracle_state();
        Ok(build_solver_result(
            &best_state,
            no_improvement_count,
            effective_seed,
            move_policy,
            stop_reason,
            telemetry,
        ))
    }

    fn allowed_sessions(&self, state: &SolutionState) -> Vec<usize> {
        state
            .compiled_problem
            .allowed_sessions
            .clone()
            .unwrap_or_else(|| (0..state.compiled_problem.num_sessions).collect())
    }

    fn select_candidate_move(
        &self,
        state: &RuntimeSolutionState,
        move_policy: &MovePolicy,
        allowed_sessions: &[usize],
        rng: &mut ChaCha12Rng,
    ) -> Option<(MoveFamily, CandidateMove)> {
        let ordered_families = ordered_move_families(move_policy, rng);
        for family in ordered_families {
            let candidate = match family {
                MoveFamily::Swap => {
                    sample_swap_move(state, allowed_sessions, rng).map(CandidateMove::Swap)
                }
                MoveFamily::Transfer => {
                    sample_transfer_move(state, allowed_sessions, rng).map(CandidateMove::Transfer)
                }
                MoveFamily::CliqueSwap => sample_clique_swap_move(state, allowed_sessions, rng)
                    .map(CandidateMove::CliqueSwap),
            };
            if let Some(candidate) = candidate {
                return Some((family, candidate));
            }
        }

        None
    }
}

fn ordered_move_families(move_policy: &MovePolicy, rng: &mut ChaCha12Rng) -> Vec<MoveFamily> {
    if let Some(forced_family) = move_policy.forced_family {
        return vec![forced_family];
    }

    let mut families = move_policy.allowed_families();
    if families.len() <= 1 {
        return families;
    }

    match move_policy.mode {
        MoveSelectionMode::Adaptive => {
            families.shuffle(rng);
            families
        }
        MoveSelectionMode::Weighted => {
            let weights = move_policy
                .weights
                .as_ref()
                .expect("weighted move policy should be normalized before use");
            let Some(first) = choose_weighted_family(&families, weights, rng) else {
                families.shuffle(rng);
                return families;
            };
            let mut ordered = vec![first];
            families.retain(|family| *family != first);
            families.shuffle(rng);
            ordered.extend(families);
            ordered
        }
    }
}

fn move_family_preview_uses_full_recompute(_family: MoveFamily) -> bool {
    false
}

fn should_sample_runtime_oracle_check(accepted_count: u64) -> bool {
    accepted_count > 0 && accepted_count % 16 == 0
}

fn choose_weighted_family(
    families: &[MoveFamily],
    weights: &crate::models::MoveFamilyWeights,
    rng: &mut ChaCha12Rng,
) -> Option<MoveFamily> {
    let total_weight = families
        .iter()
        .map(|family| weights.weight_for(*family))
        .sum::<f64>();
    if total_weight <= 0.0 {
        return None;
    }

    let mut slot = rng.random::<f64>() * total_weight;
    for family in families {
        slot -= weights.weight_for(*family);
        if slot <= 0.0 {
            return Some(*family);
        }
    }

    families.last().copied()
}

fn sample_swap_move(
    state: &SolutionState,
    allowed_sessions: &[usize],
    rng: &mut ChaCha12Rng,
) -> Option<SwapMove> {
    let mut candidates = Vec::new();
    for &session_idx in allowed_sessions {
        let movable_people = (0..state.compiled_problem.num_people)
            .filter(|&person_idx| is_runtime_swappable_person(state, session_idx, person_idx))
            .collect::<Vec<_>>();

        for left_idx in 0..movable_people.len() {
            for right_idx in (left_idx + 1)..movable_people.len() {
                let left_person_idx = movable_people[left_idx];
                let right_person_idx = movable_people[right_idx];
                let left_group_idx = state.locations[session_idx][left_person_idx]?.0;
                let right_group_idx = state.locations[session_idx][right_person_idx]?.0;
                if left_group_idx != right_group_idx {
                    candidates.push(SwapMove::new(
                        session_idx,
                        left_person_idx,
                        right_person_idx,
                    ));
                }
            }
        }
    }

    choose_owned(candidates, rng)
}

fn sample_transfer_move(
    state: &SolutionState,
    allowed_sessions: &[usize],
    rng: &mut ChaCha12Rng,
) -> Option<TransferMove> {
    if allowed_sessions.is_empty() || state.compiled_problem.num_people == 0 {
        return None;
    }

    let eligible_sessions = allowed_sessions
        .iter()
        .copied()
        .filter(|&session_idx| runtime_session_can_transfer(state, session_idx))
        .collect::<Vec<_>>();
    if eligible_sessions.is_empty() {
        return None;
    }

    for _ in 0..MAX_RANDOM_CANDIDATE_ATTEMPTS {
        let session_idx = eligible_sessions[rng.random_range(0..eligible_sessions.len())];
        let person_idx = rng.random_range(0..state.compiled_problem.num_people);
        let Some(source_group_idx) = runtime_transfer_source_group(state, session_idx, person_idx)
        else {
            continue;
        };

        for _ in 0..MAX_RANDOM_TARGET_ATTEMPTS {
            let target_group_idx = rng.random_range(0..state.compiled_problem.num_groups);
            if target_group_idx == source_group_idx
                || !runtime_transfer_target_has_capacity(state, session_idx, target_group_idx)
            {
                continue;
            }

            return Some(TransferMove::new(
                session_idx,
                person_idx,
                source_group_idx,
                target_group_idx,
            ));
        }
    }

    let session_start = rng.random_range(0..eligible_sessions.len());
    let person_start = rng.random_range(0..state.compiled_problem.num_people);
    let target_start = rng.random_range(0..state.compiled_problem.num_groups);

    for session_offset in 0..eligible_sessions.len() {
        let session_idx =
            eligible_sessions[(session_start + session_offset) % eligible_sessions.len()];
        for person_offset in 0..state.compiled_problem.num_people {
            let person_idx = (person_start + person_offset) % state.compiled_problem.num_people;
            let Some(source_group_idx) =
                runtime_transfer_source_group(state, session_idx, person_idx)
            else {
                continue;
            };

            for target_offset in 0..state.compiled_problem.num_groups {
                let target_group_idx =
                    (target_start + target_offset) % state.compiled_problem.num_groups;
                if target_group_idx == source_group_idx
                    || !runtime_transfer_target_has_capacity(state, session_idx, target_group_idx)
                {
                    continue;
                }

                return Some(TransferMove::new(
                    session_idx,
                    person_idx,
                    source_group_idx,
                    target_group_idx,
                ));
            }
        }
    }

    None
}

fn sample_clique_swap_move(
    state: &SolutionState,
    allowed_sessions: &[usize],
    rng: &mut ChaCha12Rng,
) -> Option<CliqueSwapMove> {
    if allowed_sessions.is_empty() || state.compiled_problem.cliques.is_empty() {
        return None;
    }

    for _ in 0..MAX_RANDOM_CANDIDATE_ATTEMPTS {
        let session_idx = allowed_sessions[rng.random_range(0..allowed_sessions.len())];
        let clique_idx = rng.random_range(0..state.compiled_problem.cliques.len());
        let Some((active_members, source_group_idx)) =
            runtime_active_clique_in_single_group(state, session_idx, clique_idx)
        else {
            continue;
        };

        for _ in 0..MAX_RANDOM_TARGET_ATTEMPTS {
            let target_group_idx = rng.random_range(0..state.compiled_problem.num_groups);
            if target_group_idx == source_group_idx {
                continue;
            }
            if let Some(target_people) = runtime_pick_clique_targets(
                state,
                session_idx,
                &active_members,
                target_group_idx,
                rng,
            ) {
                return Some(CliqueSwapMove::new(
                    session_idx,
                    clique_idx,
                    source_group_idx,
                    target_group_idx,
                    target_people,
                ));
            }
        }
    }

    let session_start = rng.random_range(0..allowed_sessions.len());
    let clique_start = rng.random_range(0..state.compiled_problem.cliques.len());
    let target_start = rng.random_range(0..state.compiled_problem.num_groups);

    for session_offset in 0..allowed_sessions.len() {
        let session_idx =
            allowed_sessions[(session_start + session_offset) % allowed_sessions.len()];
        for clique_offset in 0..state.compiled_problem.cliques.len() {
            let clique_idx = (clique_start + clique_offset) % state.compiled_problem.cliques.len();
            let Some((active_members, source_group_idx)) =
                runtime_active_clique_in_single_group(state, session_idx, clique_idx)
            else {
                continue;
            };

            for target_offset in 0..state.compiled_problem.num_groups {
                let target_group_idx =
                    (target_start + target_offset) % state.compiled_problem.num_groups;
                if target_group_idx == source_group_idx {
                    continue;
                }
                if let Some(target_people) = runtime_pick_clique_targets(
                    state,
                    session_idx,
                    &active_members,
                    target_group_idx,
                    rng,
                ) {
                    return Some(CliqueSwapMove::new(
                        session_idx,
                        clique_idx,
                        source_group_idx,
                        target_group_idx,
                        target_people,
                    ));
                }
            }
        }
    }

    None
}

fn participating_clique_members(
    state: &SolutionState,
    session_idx: usize,
    clique_idx: usize,
) -> Vec<usize> {
    state.compiled_problem.cliques[clique_idx]
        .members
        .iter()
        .copied()
        .filter(|&member| state.compiled_problem.person_participation[member][session_idx])
        .collect()
}

fn is_runtime_swappable_person(
    state: &SolutionState,
    session_idx: usize,
    person_idx: usize,
) -> bool {
    state.compiled_problem.person_participation[person_idx][session_idx]
        && state.locations[session_idx][person_idx].is_some()
        && !state
            .compiled_problem
            .immovable_lookup
            .contains_key(&(person_idx, session_idx))
        && state.compiled_problem.person_to_clique_id[session_idx][person_idx].is_none()
}

fn runtime_session_can_transfer(state: &SolutionState, session_idx: usize) -> bool {
    let has_capacity_target = (0..state.compiled_problem.num_groups)
        .any(|group_idx| runtime_transfer_target_has_capacity(state, session_idx, group_idx));
    let has_nonempty_source = (0..state.compiled_problem.num_groups)
        .any(|group_idx| state.schedule[session_idx][group_idx].len() > 1);
    has_capacity_target && has_nonempty_source
}

fn runtime_transfer_source_group(
    state: &SolutionState,
    session_idx: usize,
    person_idx: usize,
) -> Option<usize> {
    if !is_runtime_swappable_person(state, session_idx, person_idx) {
        return None;
    }

    let source_group_idx = state.locations[session_idx][person_idx]?.0;
    if state.schedule[session_idx][source_group_idx].len() <= 1 {
        return None;
    }

    Some(source_group_idx)
}

fn runtime_transfer_target_has_capacity(
    state: &SolutionState,
    session_idx: usize,
    target_group_idx: usize,
) -> bool {
    state.schedule[session_idx][target_group_idx].len()
        < state
            .compiled_problem
            .group_capacity(session_idx, target_group_idx)
}

fn runtime_active_clique_in_single_group(
    state: &SolutionState,
    session_idx: usize,
    clique_idx: usize,
) -> Option<(Vec<usize>, usize)> {
    let active_members = participating_clique_members(state, session_idx, clique_idx);
    if active_members.is_empty() {
        return None;
    }

    let source_group_idx = active_members
        .iter()
        .filter_map(|&member| state.locations[session_idx][member].map(|entry| entry.0))
        .next()?;

    if active_members.iter().any(|&member| {
        state.locations[session_idx][member].map(|entry| entry.0) != Some(source_group_idx)
    }) {
        return None;
    }

    if active_members.iter().any(|&member| {
        state
            .compiled_problem
            .immovable_lookup
            .contains_key(&(member, session_idx))
    }) {
        return None;
    }

    Some((active_members, source_group_idx))
}

fn runtime_pick_clique_targets(
    state: &SolutionState,
    session_idx: usize,
    active_members: &[usize],
    target_group_idx: usize,
    rng: &mut ChaCha12Rng,
) -> Option<Vec<usize>> {
    let mut eligible_targets = state.schedule[session_idx][target_group_idx]
        .iter()
        .copied()
        .filter(|person_idx| {
            !active_members.contains(person_idx)
                && state.compiled_problem.person_participation[*person_idx][session_idx]
                && state.compiled_problem.person_to_clique_id[session_idx][*person_idx].is_none()
                && !state
                    .compiled_problem
                    .immovable_lookup
                    .contains_key(&(*person_idx, session_idx))
        })
        .collect::<Vec<_>>();

    if eligible_targets.len() < active_members.len() {
        return None;
    }

    eligible_targets.shuffle(rng);
    eligible_targets.truncate(active_members.len());
    Some(eligible_targets)
}

fn preview_candidate(
    state: &RuntimeSolutionState,
    candidate: &CandidateMove,
) -> Result<SearchMovePreview, SolverError> {
    match candidate {
        CandidateMove::Swap(swap) => {
            preview_swap_runtime_lightweight(state, swap).map(SearchMovePreview::Swap)
        }
        CandidateMove::Transfer(transfer) => {
            preview_transfer_runtime_lightweight(state, transfer).map(SearchMovePreview::Transfer)
        }
        CandidateMove::CliqueSwap(clique_swap) => {
            preview_clique_swap_runtime_lightweight(state, clique_swap)
                .map(SearchMovePreview::CliqueSwap)
        }
    }
}

fn apply_previewed_candidate(
    state: &mut RuntimeSolutionState,
    preview: &SearchMovePreview,
) -> Result<(), SolverError> {
    match preview {
        SearchMovePreview::Swap(preview) => apply_swap_runtime_preview(state, preview),
        SearchMovePreview::Transfer(preview) => apply_transfer_runtime_preview(state, preview),
        SearchMovePreview::CliqueSwap(preview) => apply_clique_swap_runtime_preview(state, preview),
    }
}

fn build_solver_result(
    state: &SolutionState,
    no_improvement_count: u64,
    effective_seed: u64,
    move_policy: MovePolicy,
    stop_reason: StopReason,
    benchmark_telemetry: SolverBenchmarkTelemetry,
) -> SolverResult {
    SolverResult {
        final_score: state.current_score.total_score,
        schedule: state.to_api_schedule(),
        unique_contacts: state.current_score.unique_contacts,
        repetition_penalty: state.current_score.repetition_penalty,
        attribute_balance_penalty: state.current_score.attribute_balance_penalty as i32,
        constraint_penalty: state.current_score.constraint_penalty,
        no_improvement_count,
        weighted_repetition_penalty: state.current_score.weighted_repetition_penalty,
        weighted_constraint_penalty: state.current_score.weighted_constraint_penalty,
        effective_seed: Some(effective_seed),
        move_policy: Some(move_policy),
        stop_reason: Some(stop_reason),
        benchmark_telemetry: Some(benchmark_telemetry),
    }
}

#[allow(clippy::too_many_arguments)]
fn build_progress_update(
    iteration: u64,
    max_iterations: u64,
    temperature: f64,
    search_started_at: f64,
    current_state: &SolutionState,
    best_state: &SolutionState,
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
    configuration: &SolverConfiguration,
    stop_reason: Option<StopReason>,
) -> ProgressUpdate {
    let attempts = move_metrics.swap.attempts
        + move_metrics.transfer.attempts
        + move_metrics.clique_swap.attempts;
    let accepted = move_metrics.swap.accepted
        + move_metrics.transfer.accepted
        + move_metrics.clique_swap.accepted;
    let elapsed_seconds = now_seconds() - search_started_at;
    let iteration_count = (iteration + 1).max(1);
    let recent_acceptance_rate = if recent_acceptance.is_empty() {
        0.0
    } else {
        recent_acceptance
            .iter()
            .filter(|accepted| **accepted)
            .count() as f64
            / recent_acceptance.len() as f64
    };

    let best_schedule = if configuration.telemetry.emit_best_schedule
        && should_emit_best_schedule(configuration, iteration)
    {
        Some(best_state.to_api_schedule())
    } else {
        None
    };

    ProgressUpdate {
        iteration,
        max_iterations,
        temperature,
        current_score: current_state.current_score.total_score,
        best_score: best_state.current_score.total_score,
        current_contacts: current_state.current_score.unique_contacts,
        best_contacts: best_state.current_score.unique_contacts,
        repetition_penalty: current_state.current_score.repetition_penalty,
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
        overall_acceptance_rate: ratio(accepted, attempts),
        recent_acceptance_rate,
        avg_attempted_move_delta: ratio_f64(attempted_delta_sum, attempts),
        avg_accepted_move_delta: ratio_f64(accepted_delta_sum, accepted),
        biggest_accepted_increase,
        biggest_attempted_increase,
        current_repetition_penalty: current_state.current_score.weighted_repetition_penalty,
        current_balance_penalty: current_state.current_score.attribute_balance_penalty,
        current_constraint_penalty: current_state.current_score.weighted_constraint_penalty,
        best_repetition_penalty: best_state.current_score.weighted_repetition_penalty,
        best_balance_penalty: best_state.current_score.attribute_balance_penalty,
        best_constraint_penalty: best_state.current_score.weighted_constraint_penalty,
        reheats_performed: 0,
        iterations_since_last_reheat: iteration,
        local_optima_escapes,
        avg_time_per_iteration_ms: if iteration_count > 0 {
            elapsed_seconds * 1000.0 / iteration_count as f64
        } else {
            0.0
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
            (best_state.current_score.total_score - current_state.current_score.total_score).abs()
                / elapsed_seconds
        } else {
            0.0
        },
        best_schedule,
        effective_seed: Some(effective_seed),
        move_policy: Some(move_policy.clone()),
        stop_reason,
    }
}

fn should_emit_best_schedule(configuration: &SolverConfiguration, iteration: u64) -> bool {
    let every_n = configuration
        .telemetry
        .best_schedule_every_n_callbacks
        .max(1);
    (iteration + 1).is_multiple_of(every_n)
}

fn push_recent_acceptance(recent_acceptance: &mut VecDeque<bool>, accepted: bool) {
    if recent_acceptance.len() == RECENT_WINDOW {
        recent_acceptance.pop_front();
    }
    recent_acceptance.push_back(accepted);
}

fn increment_no_improvement_streak(
    no_improvement_count: &mut u64,
    max_no_improvement_streak: &mut u64,
) {
    *no_improvement_count += 1;
    *max_no_improvement_streak = (*max_no_improvement_streak).max(*no_improvement_count);
}

fn family_metrics_mut(
    summary: &mut MoveFamilyBenchmarkTelemetrySummary,
    family: MoveFamily,
) -> &mut MoveFamilyBenchmarkTelemetry {
    match family {
        MoveFamily::Swap => &mut summary.swap,
        MoveFamily::Transfer => &mut summary.transfer,
        MoveFamily::CliqueSwap => &mut summary.clique_swap,
    }
}

fn temperature_for_iteration(iteration: u64, max_iterations: u64) -> f64 {
    if max_iterations <= 1 {
        return DEFAULT_FINAL_TEMPERATURE;
    }

    let progress = iteration as f64 / (max_iterations - 1) as f64;
    DEFAULT_INITIAL_TEMPERATURE
        * (DEFAULT_FINAL_TEMPERATURE / DEFAULT_INITIAL_TEMPERATURE).powf(progress)
}

fn reached_time_limit(started_at: f64, time_limit_seconds: Option<u64>) -> bool {
    let Some(limit) = time_limit_seconds else {
        return false;
    };

    now_seconds() - started_at >= limit as f64
}

fn ratio(numerator: u64, denominator: u64) -> f64 {
    if denominator == 0 {
        0.0
    } else {
        numerator as f64 / denominator as f64
    }
}

fn ratio_f64(numerator: f64, denominator: u64) -> f64 {
    if denominator == 0 {
        0.0
    } else {
        numerator / denominator as f64
    }
}

fn choose_owned<T>(mut values: Vec<T>, rng: &mut ChaCha12Rng) -> Option<T> {
    if values.is_empty() {
        return None;
    }

    let idx = rng.random_range(0..values.len());
    Some(values.swap_remove(idx))
}

#[cfg(not(target_arch = "wasm32"))]
fn now_seconds() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("system time should be after unix epoch")
        .as_secs_f64()
}

#[cfg(target_arch = "wasm32")]
fn now_seconds() -> f64 {
    js_sys::Date::now() / 1000.0
}
