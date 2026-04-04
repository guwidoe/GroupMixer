use std::collections::VecDeque;
use std::time::Instant;

use rand::{rng, seq::SliceRandom, RngExt, SeedableRng};
use rand_chacha::ChaCha12Rng;

use crate::models::{
    BenchmarkEvent, BenchmarkObserver, BenchmarkRunStarted, MoveFamily,
    MoveFamilyBenchmarkTelemetry, MoveFamilyBenchmarkTelemetrySummary, MovePolicy,
    MoveSelectionMode, ProgressCallback, ProgressUpdate, SolverBenchmarkTelemetry,
    SolverConfiguration, SolverResult, StopReason,
};
use crate::solver_support::SolverError;

use super::super::moves::{
    apply_clique_swap_runtime_preview, apply_swap_runtime_preview, apply_transfer_runtime_preview,
    preview_clique_swap_runtime_lightweight, preview_swap_runtime_lightweight,
    preview_transfer_runtime_lightweight, CliqueSwapMove, CliqueSwapRuntimePreview, SwapMove,
    SwapRuntimePreview, TransferMove, TransferRuntimePreview,
};
use super::super::oracle::{check_drift, oracle_score};
use super::super::runtime_state::RuntimeState;

const DEFAULT_MAX_ITERATIONS: u64 = 10_000;
const DEFAULT_INITIAL_TEMPERATURE: f64 = 2.0;
const DEFAULT_FINAL_TEMPERATURE: f64 = 0.05;
const RECENT_WINDOW: usize = 100;
const MAX_RANDOM_CANDIDATE_ATTEMPTS: usize = 24;
const MAX_RANDOM_TARGET_ATTEMPTS: usize = 24;
const ORACLE_DRIFT_SAMPLE_INTERVAL: u64 = 16;

#[derive(Debug, Clone, PartialEq)]
enum SearchMovePreview {
    Swap(SwapRuntimePreview),
    Transfer(TransferRuntimePreview),
    CliqueSwap(CliqueSwapRuntimePreview),
}

impl SearchMovePreview {
    fn delta_score(&self) -> f64 {
        match self {
            Self::Swap(preview) => preview.delta_score,
            Self::Transfer(preview) => preview.delta_score,
            Self::CliqueSwap(preview) => preview.delta_score,
        }
    }

    fn describe(&self) -> String {
        match self {
            Self::Swap(preview) => format!("swap {:?}", preview.analysis.swap),
            Self::Transfer(preview) => format!("transfer {:?}", preview.analysis.transfer),
            Self::CliqueSwap(preview) => {
                format!("clique_swap {:?}", preview.analysis.clique_swap)
            }
        }
    }
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

            if let Some((family, preview, preview_seconds)) =
                select_previewed_move(&current_state, &move_policy, &allowed_sessions, &mut rng)
            {
                let family_metrics = family_metrics_mut(&mut move_metrics, family);
                family_metrics.preview_seconds += preview_seconds;
                family_metrics.attempts += 1;

                let delta_cost = preview.delta_score();
                attempted_delta_sum += delta_cost;
                biggest_attempted_increase = biggest_attempted_increase.max(delta_cost.max(0.0));

                let accepted = delta_cost <= 0.0
                    || (temperature > 0.0
                        && rng.random::<f64>() < (-delta_cost / temperature).exp().clamp(0.0, 1.0));

                if accepted {
                    let apply_started_at = Instant::now();
                    apply_previewed_move(&mut current_state, &preview)?;
                    family_metrics.apply_seconds += apply_started_at.elapsed().as_secs_f64();
                    family_metrics.accepted += 1;
                    accepted_delta_sum += delta_cost;

                    if should_sample_oracle_check(family_metrics.accepted) {
                        let preview_description = preview.describe();
                        check_drift(&current_state).map_err(|error| {
                            SolverError::ValidationError(format!(
                                "solver3 runtime {:?} drift check failed after accepted move {}: {}",
                                family, preview_description, error
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
            } else {
                no_improvement_count += 1;
                push_recent_acceptance(&mut recent_acceptance, false);
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

fn select_previewed_move(
    state: &RuntimeState,
    move_policy: &MovePolicy,
    allowed_sessions: &[usize],
    rng: &mut ChaCha12Rng,
) -> Option<(MoveFamily, SearchMovePreview, f64)> {
    let ordered_families = ordered_move_families(move_policy, rng);
    for family in ordered_families {
        let preview_started_at = Instant::now();
        let preview = sample_preview_for_family(state, family, allowed_sessions, rng);
        let preview_seconds = preview_started_at.elapsed().as_secs_f64();
        if let Some(preview) = preview {
            return Some((family, preview, preview_seconds));
        }
    }

    None
}

fn sample_preview_for_family(
    state: &RuntimeState,
    family: MoveFamily,
    allowed_sessions: &[usize],
    rng: &mut ChaCha12Rng,
) -> Option<SearchMovePreview> {
    match family {
        MoveFamily::Swap => {
            sample_swap_preview(state, allowed_sessions, rng).map(SearchMovePreview::Swap)
        }
        MoveFamily::Transfer => {
            sample_transfer_preview(state, allowed_sessions, rng).map(SearchMovePreview::Transfer)
        }
        MoveFamily::CliqueSwap => sample_clique_swap_preview(state, allowed_sessions, rng)
            .map(SearchMovePreview::CliqueSwap),
    }
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

fn sample_swap_preview(
    state: &RuntimeState,
    allowed_sessions: &[usize],
    rng: &mut ChaCha12Rng,
) -> Option<SwapRuntimePreview> {
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

fn sample_transfer_preview(
    state: &RuntimeState,
    allowed_sessions: &[usize],
    rng: &mut ChaCha12Rng,
) -> Option<TransferRuntimePreview> {
    if allowed_sessions.is_empty() || state.compiled.num_people == 0 {
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
        let person_idx = rng.random_range(0..state.compiled.num_people);
        let Some(source_group_idx) = runtime_transfer_source_group(state, session_idx, person_idx)
        else {
            continue;
        };

        for _ in 0..MAX_RANDOM_TARGET_ATTEMPTS {
            let target_group_idx = rng.random_range(0..state.compiled.num_groups);
            if target_group_idx == source_group_idx
                || !runtime_transfer_target_has_capacity(state, session_idx, target_group_idx)
            {
                continue;
            }

            let transfer =
                TransferMove::new(session_idx, person_idx, source_group_idx, target_group_idx);
            if let Ok(preview) = preview_transfer_runtime_lightweight(state, &transfer) {
                return Some(preview);
            }
        }
    }

    let session_start = rng.random_range(0..eligible_sessions.len());
    let person_start = rng.random_range(0..state.compiled.num_people);
    let target_start = rng.random_range(0..state.compiled.num_groups);

    for session_offset in 0..eligible_sessions.len() {
        let session_idx =
            eligible_sessions[(session_start + session_offset) % eligible_sessions.len()];
        for person_offset in 0..state.compiled.num_people {
            let person_idx = (person_start + person_offset) % state.compiled.num_people;
            let Some(source_group_idx) =
                runtime_transfer_source_group(state, session_idx, person_idx)
            else {
                continue;
            };

            for target_offset in 0..state.compiled.num_groups {
                let target_group_idx = (target_start + target_offset) % state.compiled.num_groups;
                if target_group_idx == source_group_idx
                    || !runtime_transfer_target_has_capacity(state, session_idx, target_group_idx)
                {
                    continue;
                }

                let transfer =
                    TransferMove::new(session_idx, person_idx, source_group_idx, target_group_idx);
                if let Ok(preview) = preview_transfer_runtime_lightweight(state, &transfer) {
                    return Some(preview);
                }
            }
        }
    }

    None
}

fn sample_clique_swap_preview(
    state: &RuntimeState,
    allowed_sessions: &[usize],
    rng: &mut ChaCha12Rng,
) -> Option<CliqueSwapRuntimePreview> {
    if allowed_sessions.is_empty() || state.compiled.cliques.is_empty() {
        return None;
    }

    let eligible_sessions = allowed_sessions
        .iter()
        .copied()
        .filter(|&session_idx| runtime_session_can_clique_swap(state, session_idx))
        .collect::<Vec<_>>();
    if eligible_sessions.is_empty() {
        return None;
    }

    for _ in 0..MAX_RANDOM_CANDIDATE_ATTEMPTS {
        let session_idx = eligible_sessions[rng.random_range(0..eligible_sessions.len())];
        let clique_idx = rng.random_range(0..state.compiled.cliques.len());
        let Some((active_members, source_group_idx)) =
            runtime_active_clique_in_single_group(state, session_idx, clique_idx)
        else {
            continue;
        };

        for _ in 0..MAX_RANDOM_TARGET_ATTEMPTS {
            let target_group_idx = rng.random_range(0..state.compiled.num_groups);
            if target_group_idx == source_group_idx {
                continue;
            }
            let Some(target_people) = runtime_pick_clique_targets(
                state,
                session_idx,
                &active_members,
                target_group_idx,
                rng,
            ) else {
                continue;
            };

            let clique_swap = CliqueSwapMove::new(
                session_idx,
                clique_idx,
                source_group_idx,
                target_group_idx,
                target_people,
            );
            if let Ok(preview) = preview_clique_swap_runtime_lightweight(state, &clique_swap) {
                return Some(preview);
            }
        }
    }

    let session_start = rng.random_range(0..eligible_sessions.len());
    let clique_start = rng.random_range(0..state.compiled.cliques.len());
    let target_start = rng.random_range(0..state.compiled.num_groups);

    for session_offset in 0..eligible_sessions.len() {
        let session_idx =
            eligible_sessions[(session_start + session_offset) % eligible_sessions.len()];

        for clique_offset in 0..state.compiled.cliques.len() {
            let clique_idx = (clique_start + clique_offset) % state.compiled.cliques.len();
            let Some((active_members, source_group_idx)) =
                runtime_active_clique_in_single_group(state, session_idx, clique_idx)
            else {
                continue;
            };

            for target_offset in 0..state.compiled.num_groups {
                let target_group_idx = (target_start + target_offset) % state.compiled.num_groups;
                if target_group_idx == source_group_idx {
                    continue;
                }

                let Some(target_people) = runtime_pick_clique_targets(
                    state,
                    session_idx,
                    &active_members,
                    target_group_idx,
                    rng,
                ) else {
                    continue;
                };

                let clique_swap = CliqueSwapMove::new(
                    session_idx,
                    clique_idx,
                    source_group_idx,
                    target_group_idx,
                    target_people,
                );
                if let Ok(preview) = preview_clique_swap_runtime_lightweight(state, &clique_swap) {
                    return Some(preview);
                }
            }
        }
    }

    None
}

fn participating_clique_members(
    state: &RuntimeState,
    session_idx: usize,
    clique_idx: usize,
) -> Vec<usize> {
    state.compiled.cliques[clique_idx]
        .members
        .iter()
        .copied()
        .filter(|&member| state.compiled.person_participation[member][session_idx])
        .collect()
}

fn runtime_session_can_clique_swap(state: &RuntimeState, session_idx: usize) -> bool {
    (0..state.compiled.cliques.len()).any(|clique_idx| {
        let Some((active_members, source_group_idx)) =
            runtime_active_clique_in_single_group(state, session_idx, clique_idx)
        else {
            return false;
        };

        (0..state.compiled.num_groups).any(|target_group_idx| {
            target_group_idx != source_group_idx
                && runtime_target_group_has_eligible_clique_swap_people(
                    state,
                    session_idx,
                    &active_members,
                    target_group_idx,
                )
        })
    })
}

fn runtime_active_clique_in_single_group(
    state: &RuntimeState,
    session_idx: usize,
    clique_idx: usize,
) -> Option<(Vec<usize>, usize)> {
    let active_members = participating_clique_members(state, session_idx, clique_idx);
    if active_members.is_empty() {
        return None;
    }

    let source_group_idx =
        state.person_location[state.people_slot(session_idx, active_members[0])]?;

    if active_members.iter().any(|&member| {
        state.person_location[state.people_slot(session_idx, member)] != Some(source_group_idx)
    }) {
        return None;
    }

    if active_members.iter().any(|&member| {
        state
            .compiled
            .immovable_lookup
            .contains_key(&(member, session_idx))
    }) {
        return None;
    }

    Some((active_members, source_group_idx))
}

fn runtime_pick_clique_targets(
    state: &RuntimeState,
    session_idx: usize,
    active_members: &[usize],
    target_group_idx: usize,
    rng: &mut ChaCha12Rng,
) -> Option<Vec<usize>> {
    let active_set = active_members
        .iter()
        .copied()
        .collect::<std::collections::BTreeSet<_>>();
    let target_slot = state.group_slot(session_idx, target_group_idx);
    let mut eligible_targets = state.group_members[target_slot]
        .iter()
        .copied()
        .filter(|person_idx| {
            !active_set.contains(person_idx)
                && state.compiled.person_participation[*person_idx][session_idx]
                && state.compiled.person_to_clique_id[session_idx][*person_idx].is_none()
                && !state
                    .compiled
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

fn runtime_target_group_has_eligible_clique_swap_people(
    state: &RuntimeState,
    session_idx: usize,
    active_members: &[usize],
    target_group_idx: usize,
) -> bool {
    let active_set = active_members
        .iter()
        .copied()
        .collect::<std::collections::BTreeSet<_>>();
    let target_slot = state.group_slot(session_idx, target_group_idx);
    let eligible = state.group_members[target_slot]
        .iter()
        .filter(|person_idx| {
            !active_set.contains(person_idx)
                && state.compiled.person_participation[**person_idx][session_idx]
                && state.compiled.person_to_clique_id[session_idx][**person_idx].is_none()
                && !state
                    .compiled
                    .immovable_lookup
                    .contains_key(&(**person_idx, session_idx))
        })
        .count();

    eligible >= active_members.len()
}

fn runtime_session_can_transfer(state: &RuntimeState, session_idx: usize) -> bool {
    let has_capacity_target = (0..state.compiled.num_groups)
        .any(|group_idx| runtime_transfer_target_has_capacity(state, session_idx, group_idx));
    let has_nonempty_source = (0..state.compiled.num_groups)
        .any(|group_idx| state.group_sizes[state.group_slot(session_idx, group_idx)] > 1);
    has_capacity_target && has_nonempty_source
}

fn runtime_transfer_source_group(
    state: &RuntimeState,
    session_idx: usize,
    person_idx: usize,
) -> Option<usize> {
    if !is_runtime_transferable_person(state, session_idx, person_idx) {
        return None;
    }

    let source_group_idx = state.person_location[state.people_slot(session_idx, person_idx)]?;
    if state.group_sizes[state.group_slot(session_idx, source_group_idx)] <= 1 {
        return None;
    }

    Some(source_group_idx)
}

fn runtime_transfer_target_has_capacity(
    state: &RuntimeState,
    session_idx: usize,
    target_group_idx: usize,
) -> bool {
    state.group_sizes[state.group_slot(session_idx, target_group_idx)]
        < state.compiled.group_capacity(session_idx, target_group_idx)
}

fn is_runtime_transferable_person(
    state: &RuntimeState,
    session_idx: usize,
    person_idx: usize,
) -> bool {
    state.compiled.person_participation[person_idx][session_idx]
        && state.person_location[state.people_slot(session_idx, person_idx)].is_some()
        && !state
            .compiled
            .immovable_lookup
            .contains_key(&(person_idx, session_idx))
        && state.compiled.person_to_clique_id[session_idx][person_idx].is_none()
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

fn should_sample_oracle_check(accepted_move_count: u64) -> bool {
    accepted_move_count > 0 && accepted_move_count % ORACLE_DRIFT_SAMPLE_INTERVAL == 0
}
