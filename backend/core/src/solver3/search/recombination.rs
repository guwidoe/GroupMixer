use std::cmp::Ordering;
use std::collections::VecDeque;

#[cfg(not(target_arch = "wasm32"))]
use std::time::Instant;

#[cfg(target_arch = "wasm32")]
use js_sys;

use rand::{RngExt, SeedableRng};
use rand_chacha::ChaCha12Rng;

use crate::models::{
    BenchmarkEvent, BenchmarkObserver, DonorCandidatePoolTelemetry, DonorSessionChoiceTelemetry,
    DonorSessionTransplantBenchmarkTelemetry, DonorSessionViabilityTierTelemetry, ProgressCallback,
    SolverResult, StopReason,
};
use crate::solver_support::SolverError;

use super::super::moves::{
    analyze_swap, apply_swap_runtime_preview, preview_swap_runtime_lightweight, SwapFeasibility,
    SwapMove, SwapRuntimePreview,
};
use super::super::runtime_state::RuntimeState;
use super::archive::{
    build_session_conflict_burden, build_session_fingerprints, ArchiveUpdateReason, EliteArchive,
    EliteArchiveConfig,
};
use super::context::{
    AdaptiveRawChildRetentionConfig, DonorSessionTransplantConfig, SearchProgressState,
    SearchRunContext,
};
use super::single_state::{
    build_solver_result, polish_state, should_emit_progress_callback, LocalImproverBudget,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct DonorSessionChoice {
    pub(crate) donor_archive_idx: usize,
    pub(crate) session_idx: usize,
    pub(crate) session_disagreement_count: usize,
    pub(crate) candidate_pool: DonorCandidatePool,
    pub(crate) session_viability_tier: DonorSessionViabilityTier,
    pub(crate) conflict_burden_delta: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum DonorCandidatePool {
    CompetitiveHalf,
    FullArchive,
}

impl DonorCandidatePool {
    fn telemetry(self) -> DonorCandidatePoolTelemetry {
        match self {
            Self::CompetitiveHalf => DonorCandidatePoolTelemetry::CompetitiveHalf,
            Self::FullArchive => DonorCandidatePoolTelemetry::FullArchive,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum DonorSessionViabilityTier {
    StrictImproving,
    NonWorsening,
    AnyDiffering,
}

impl DonorSessionViabilityTier {
    fn telemetry(self) -> DonorSessionViabilityTierTelemetry {
        match self {
            Self::StrictImproving => DonorSessionViabilityTierTelemetry::StrictImproving,
            Self::NonWorsening => DonorSessionViabilityTierTelemetry::NonWorsening,
            Self::AnyDiffering => DonorSessionViabilityTierTelemetry::AnyDiffering,
        }
    }

    fn allows(self, conflict_burden_delta: i64) -> bool {
        match self {
            Self::StrictImproving => conflict_burden_delta > 0,
            Self::NonWorsening => conflict_burden_delta >= 0,
            Self::AnyDiffering => true,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DonorSessionSelectionOutcome {
    Selected(DonorSessionChoice),
    NoViableDonor,
    NoViableSession,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum DonorSessionTriggerEligibility {
    Armed,
    NotArmed,
    EventCapReached,
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct AdaptiveRawChildRetentionDecision {
    discard_threshold: Option<f64>,
    retained_for_polish: bool,
}

#[derive(Debug, Clone, PartialEq)]
struct AdaptiveRawChildRetentionState {
    keep_ratio: f64,
    warmup_samples: usize,
    history_limit: usize,
    recent_raw_deltas: VecDeque<f64>,
}

impl AdaptiveRawChildRetentionState {
    fn new(config: AdaptiveRawChildRetentionConfig) -> Self {
        Self {
            keep_ratio: config.keep_ratio,
            warmup_samples: config.warmup_samples,
            history_limit: config.history_limit,
            recent_raw_deltas: VecDeque::with_capacity(config.history_limit),
        }
    }

    fn evaluate(&mut self, raw_child_delta: f64) -> AdaptiveRawChildRetentionDecision {
        let discard_threshold = self.current_threshold();
        let retained_for_polish = discard_threshold
            .map(|threshold| raw_child_delta <= threshold)
            .unwrap_or(true);
        self.record(raw_child_delta);
        AdaptiveRawChildRetentionDecision {
            discard_threshold,
            retained_for_polish,
        }
    }

    fn current_threshold(&self) -> Option<f64> {
        if self.recent_raw_deltas.len() < self.warmup_samples {
            return None;
        }

        let mut sorted = self.recent_raw_deltas.iter().copied().collect::<Vec<_>>();
        sorted.sort_by(|left, right| left.total_cmp(right));
        let keep_count =
            ((sorted.len() as f64 * self.keep_ratio).ceil() as usize).clamp(1, sorted.len());
        Some(sorted[keep_count - 1])
    }

    fn record(&mut self, raw_child_delta: f64) {
        if self.recent_raw_deltas.len() == self.history_limit {
            self.recent_raw_deltas.pop_front();
        }
        self.recent_raw_deltas.push_back(raw_child_delta);
    }

    fn latest_threshold(&self) -> Option<f64> {
        self.current_threshold()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct DonorSessionTriggerState {
    pub(crate) recombination_events_fired: u64,
    pub(crate) iterations_since_last_recombination: u64,
    pub(crate) swap_local_optimum_certified: bool,
}

impl Default for DonorSessionTriggerState {
    fn default() -> Self {
        Self {
            recombination_events_fired: 0,
            iterations_since_last_recombination: u64::MAX,
            swap_local_optimum_certified: false,
        }
    }
}

impl DonorSessionTriggerState {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    pub(crate) fn is_armed(
        &self,
        config: DonorSessionTransplantConfig,
        no_improvement_count: u64,
    ) -> DonorSessionTriggerEligibility {
        if config
            .max_recombination_events_per_run
            .is_some_and(|cap| self.recombination_events_fired >= cap)
        {
            return DonorSessionTriggerEligibility::EventCapReached;
        }

        if no_improvement_count >= config.recombination_no_improvement_window
            && self.iterations_since_last_recombination >= config.recombination_cooldown_window
        {
            DonorSessionTriggerEligibility::Armed
        } else {
            DonorSessionTriggerEligibility::NotArmed
        }
    }

    pub(crate) fn finish_iteration(&mut self) {
        self.iterations_since_last_recombination =
            self.iterations_since_last_recombination.saturating_add(1);
    }

    pub(crate) fn finish_iterations(&mut self, iterations: u64) {
        self.iterations_since_last_recombination = self
            .iterations_since_last_recombination
            .saturating_add(iterations);
    }

    pub(crate) fn record_recombination_event(&mut self) {
        self.recombination_events_fired += 1;
        self.iterations_since_last_recombination = 0;
    }

    pub(crate) fn mark_swap_local_optimum_certified(&mut self) {
        self.swap_local_optimum_certified = true;
    }

    pub(crate) fn record_incumbent_improvement(&mut self) {
        self.swap_local_optimum_certified = false;
    }
}

pub(crate) fn archive_config_for_donor_session_mode(
    config: DonorSessionTransplantConfig,
) -> EliteArchiveConfig {
    EliteArchiveConfig {
        capacity: config.archive_size,
        near_duplicate_session_threshold: 1,
    }
}

pub(crate) fn select_donor_session(
    base_state: &RuntimeState,
    archive: &EliteArchive,
) -> Option<DonorSessionChoice> {
    let base_session_fingerprints = build_session_fingerprints(base_state);
    let base_session_conflict_burden = build_session_conflict_burden(base_state);
    match select_donor_session_from_summary(
        &base_session_fingerprints,
        &base_session_conflict_burden,
        archive,
    ) {
        DonorSessionSelectionOutcome::Selected(choice) => Some(choice),
        DonorSessionSelectionOutcome::NoViableDonor
        | DonorSessionSelectionOutcome::NoViableSession => None,
    }
}

fn select_donor_session_from_summary(
    base_session_fingerprints: &[u64],
    base_session_conflict_burden: &[u32],
    archive: &EliteArchive,
) -> DonorSessionSelectionOutcome {
    if archive.entries().is_empty() {
        return DonorSessionSelectionOutcome::NoViableDonor;
    }

    let mut ranked_archive_indices = (0..archive.entries().len()).collect::<Vec<_>>();
    ranked_archive_indices.sort_by(|left, right| {
        archive.entries()[*left]
            .score
            .total_cmp(&archive.entries()[*right].score)
            .then_with(|| left.cmp(right))
    });

    let competitive_count = ranked_archive_indices.len().div_ceil(2);
    let competitive_indices = ranked_archive_indices
        .iter()
        .copied()
        .take(competitive_count)
        .collect::<Vec<_>>();
    let mut found_viable_donor = false;

    for (candidate_pool, session_viability_tier, candidate_indices) in [
        (
            DonorCandidatePool::CompetitiveHalf,
            DonorSessionViabilityTier::StrictImproving,
            competitive_indices.as_slice(),
        ),
        (
            DonorCandidatePool::FullArchive,
            DonorSessionViabilityTier::StrictImproving,
            ranked_archive_indices.as_slice(),
        ),
        (
            DonorCandidatePool::CompetitiveHalf,
            DonorSessionViabilityTier::NonWorsening,
            competitive_indices.as_slice(),
        ),
        (
            DonorCandidatePool::FullArchive,
            DonorSessionViabilityTier::NonWorsening,
            ranked_archive_indices.as_slice(),
        ),
        (
            DonorCandidatePool::CompetitiveHalf,
            DonorSessionViabilityTier::AnyDiffering,
            competitive_indices.as_slice(),
        ),
        (
            DonorCandidatePool::FullArchive,
            DonorSessionViabilityTier::AnyDiffering,
            ranked_archive_indices.as_slice(),
        ),
    ] {
        let mut best_choice = None;
        for &archive_idx in candidate_indices {
            let donor = &archive.entries()[archive_idx];
            let session_disagreement_count = donor
                .session_fingerprints
                .iter()
                .zip(base_session_fingerprints.iter())
                .filter(|(left, right)| left != right)
                .count();

            if session_disagreement_count <= archive.near_duplicate_session_threshold() {
                continue;
            }
            found_viable_donor = true;

            let Some(choice) = best_session_choice_for_donor(
                archive_idx,
                donor,
                session_disagreement_count,
                candidate_pool,
                session_viability_tier,
                base_session_fingerprints,
                base_session_conflict_burden,
            ) else {
                continue;
            };

            let should_replace = best_choice
                .as_ref()
                .is_none_or(|best: &DonorSessionChoice| {
                    compare_donor_session_choice(&choice, best).then_with(|| {
                        archive.entries()[best.donor_archive_idx]
                            .score
                            .total_cmp(&archive.entries()[choice.donor_archive_idx].score)
                    }) == Ordering::Greater
                });
            if should_replace {
                best_choice = Some(choice);
            }
        }

        if let Some(choice) = best_choice {
            return DonorSessionSelectionOutcome::Selected(choice);
        }
    }

    match found_viable_donor {
        true => DonorSessionSelectionOutcome::NoViableSession,
        false => DonorSessionSelectionOutcome::NoViableDonor,
    }
}

fn best_session_choice_for_donor(
    archive_idx: usize,
    donor: &super::archive::ArchivedElite,
    session_disagreement_count: usize,
    candidate_pool: DonorCandidatePool,
    session_viability_tier: DonorSessionViabilityTier,
    base_session_fingerprints: &[u64],
    base_session_conflict_burden: &[u32],
) -> Option<DonorSessionChoice> {
    donor
        .session_fingerprints
        .iter()
        .zip(donor.session_conflict_burden.iter())
        .zip(
            base_session_fingerprints
                .iter()
                .zip(base_session_conflict_burden.iter()),
        )
        .enumerate()
        .filter_map(
            |(
                session_idx,
                (
                    (donor_fingerprint, donor_conflict_burden),
                    (base_fingerprint, base_conflict_burden),
                ),
            )| {
                if donor_fingerprint == base_fingerprint {
                    return None;
                }
                let conflict_burden_delta =
                    i64::from(*base_conflict_burden) - i64::from(*donor_conflict_burden);
                if !session_viability_tier.allows(conflict_burden_delta) {
                    return None;
                }
                Some(DonorSessionChoice {
                    donor_archive_idx: archive_idx,
                    session_idx,
                    session_disagreement_count,
                    candidate_pool,
                    session_viability_tier,
                    conflict_burden_delta,
                })
            },
        )
        .max_by(|left, right| {
            left.conflict_burden_delta
                .cmp(&right.conflict_burden_delta)
                .then_with(|| left.session_idx.cmp(&right.session_idx).reverse())
        })
}

fn compare_donor_session_choice(left: &DonorSessionChoice, right: &DonorSessionChoice) -> Ordering {
    left.session_disagreement_count
        .cmp(&right.session_disagreement_count)
        .then_with(|| left.conflict_burden_delta.cmp(&right.conflict_burden_delta))
        .then_with(|| right.donor_archive_idx.cmp(&left.donor_archive_idx))
}

#[cfg(not(target_arch = "wasm32"))]
type TimePoint = Instant;

#[cfg(target_arch = "wasm32")]
type TimePoint = f64;

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

#[inline]
fn time_limit_exceeded(elapsed_seconds: f64, time_limit_seconds: Option<f64>) -> bool {
    time_limit_seconds.is_some_and(|limit| elapsed_seconds >= limit)
}

fn child_polish_budget_for_stagnation(
    config: DonorSessionTransplantConfig,
    no_improvement_count: u64,
    remaining_iterations: u64,
) -> (u64, u64, u64) {
    let window = config.recombination_no_improvement_window.max(1);
    let stagnation_windows_at_trigger = (no_improvement_count / window)
        .max(1)
        .min(config.child_polish_max_stagnation_windows.max(1));
    let configured_iteration_budget = config
        .child_polish_iterations_per_stagnation_window
        .saturating_mul(stagnation_windows_at_trigger);
    let configured_no_improvement_budget = config
        .child_polish_no_improvement_iterations_per_stagnation_window
        .saturating_mul(stagnation_windows_at_trigger);
    let polish_budget_iterations = remaining_iterations.min(configured_iteration_budget);
    let polish_budget_no_improvement_iterations = configured_no_improvement_budget
        .min(polish_budget_iterations)
        .max(1);
    (
        stagnation_windows_at_trigger,
        polish_budget_iterations,
        polish_budget_no_improvement_iterations,
    )
}

#[derive(Debug, Clone, PartialEq)]
struct SwapLocalOptimumCertificationResult {
    best_improving_swap: Option<SwapRuntimePreview>,
    swap_previews_evaluated: u64,
    scan_seconds: f64,
}

fn certify_swap_local_optimum(
    state: &RuntimeState,
    allowed_sessions: &[usize],
) -> Result<SwapLocalOptimumCertificationResult, SolverError> {
    let started_at = get_current_time();
    let mut best_improving_swap = None;
    let mut swap_previews_evaluated = 0u64;

    for &session_idx in allowed_sessions {
        for left_group_idx in 0..state.compiled.num_groups {
            let left_members = &state.group_members[state.group_slot(session_idx, left_group_idx)];
            if left_members.is_empty() {
                continue;
            }

            for right_group_idx in (left_group_idx + 1)..state.compiled.num_groups {
                let right_members =
                    &state.group_members[state.group_slot(session_idx, right_group_idx)];
                if right_members.is_empty() {
                    continue;
                }

                for &left_person_idx in left_members {
                    for &right_person_idx in right_members {
                        let swap = SwapMove::new(session_idx, left_person_idx, right_person_idx);
                        let analysis = analyze_swap(state, &swap)?;
                        if !matches!(analysis.feasibility, SwapFeasibility::Feasible) {
                            continue;
                        }
                        let preview = preview_swap_runtime_lightweight(state, &swap)?;
                        swap_previews_evaluated += 1;
                        let should_replace_best = best_improving_swap
                            .as_ref()
                            .map(|best: &SwapRuntimePreview| preview.delta_score < best.delta_score)
                            .unwrap_or(true);
                        if preview.delta_score < 0.0 && should_replace_best {
                            best_improving_swap = Some(preview);
                        }
                    }
                }
            }
        }
    }

    Ok(SwapLocalOptimumCertificationResult {
        best_improving_swap,
        swap_previews_evaluated,
        scan_seconds: get_elapsed_seconds_between(started_at, get_current_time()),
    })
}

pub(crate) fn run(
    state: &mut RuntimeState,
    run_context: SearchRunContext,
    progress_callback: Option<&ProgressCallback>,
    benchmark_observer: Option<&BenchmarkObserver>,
) -> Result<SolverResult, SolverError> {
    let total_started_at = get_current_time();
    let mut rng = ChaCha12Rng::seed_from_u64(run_context.effective_seed);
    let transplant_config = run_context
        .donor_session_transplant
        .expect("donor-session transplant config should be normalized");
    let mut trigger_state = DonorSessionTriggerState::new();
    let mut archive = EliteArchive::new(archive_config_for_donor_session_mode(transplant_config));
    let mut raw_child_retention =
        AdaptiveRawChildRetentionState::new(transplant_config.adaptive_raw_child_retention);
    let mut current_incumbent = state.clone();
    let mut aggregate = SearchProgressState::new(current_incumbent.clone());
    aggregate.donor_session_transplant_telemetry = Some(DonorSessionTransplantBenchmarkTelemetry {
        archive_size: transplant_config.archive_size as u32,
        child_polish_local_improver_mode: Some(run_context.local_improver_mode),
        raw_child_keep_ratio: transplant_config.adaptive_raw_child_retention.keep_ratio,
        raw_child_warmup_samples: transplant_config
            .adaptive_raw_child_retention
            .warmup_samples as u32,
        raw_child_history_limit: transplant_config.adaptive_raw_child_retention.history_limit
            as u32,
        swap_local_optimum_certification_enabled: transplant_config
            .swap_local_optimum_certification_enabled,
        child_polish_iterations_per_stagnation_window: transplant_config
            .child_polish_iterations_per_stagnation_window,
        child_polish_no_improvement_iterations_per_stagnation_window: transplant_config
            .child_polish_no_improvement_iterations_per_stagnation_window,
        child_polish_max_stagnation_windows: transplant_config.child_polish_max_stagnation_windows,
        ..Default::default()
    });
    record_archive_update(
        &mut aggregate,
        archive.consider_state(current_incumbent.clone()).reason,
    );

    if let Some(observer) = benchmark_observer {
        observer(&BenchmarkEvent::RunStarted(
            crate::models::BenchmarkRunStarted {
                effective_seed: run_context.effective_seed,
                move_policy: run_context.move_policy.clone(),
                initial_score: aggregate.initial_score,
            },
        ));
    }

    let mut stop_reason = StopReason::MaxIterationsReached;
    let mut total_iterations_completed = 0u64;
    let mut global_no_improvement_count = 0u64;
    let mut final_progress_emitted = false;
    let mut last_progress_callback_at = total_started_at;

    if run_context.stop_on_optimal_score
        && aggregate.best_score <= crate::models::OPTIMAL_SCORE_TOLERANCE
    {
        stop_reason = StopReason::OptimalScoreReached;
    }

    if stop_reason != StopReason::OptimalScoreReached {
        while total_iterations_completed < run_context.max_iterations {
            let elapsed_before_chunk = get_elapsed_seconds(total_started_at);
            if time_limit_exceeded(
                elapsed_before_chunk,
                run_context.time_limit_seconds.map(|limit| limit as f64),
            ) {
                stop_reason = StopReason::TimeLimitReached;
                break;
            }

            let remaining_iterations = run_context.max_iterations - total_iterations_completed;
            let chunk_iterations = remaining_iterations
                .min(transplant_config.recombination_no_improvement_window.max(1));
            let chunk_outcome = polish_state(
                current_incumbent.clone(),
                &run_context,
                LocalImproverBudget {
                    effective_seed: rng.random::<u64>(),
                    max_iterations: chunk_iterations,
                    no_improvement_limit: None,
                    time_limit_seconds: run_context
                        .time_limit_seconds
                        .map(|limit| (limit as f64 - elapsed_before_chunk).max(0.0)),
                    stop_on_optimal_score: run_context.stop_on_optimal_score,
                    runtime_scaled_no_improvement_stop: run_context
                        .runtime_scaled_no_improvement_stop,
                },
            )?;

            absorb_local_search_chunk(
                &mut aggregate,
                &chunk_outcome.search,
                total_iterations_completed,
                elapsed_before_chunk,
            );
            total_iterations_completed += chunk_outcome.search.iterations_completed;
            trigger_state.finish_iterations(chunk_outcome.search.iterations_completed);

            let improved_incumbent =
                chunk_outcome.search.best_state.total_score < current_incumbent.total_score;
            if improved_incumbent {
                current_incumbent = chunk_outcome.search.best_state.clone();
                record_archive_update(
                    &mut aggregate,
                    archive.consider_state(current_incumbent.clone()).reason,
                );
                global_no_improvement_count = chunk_outcome.search.no_improvement_count;
                trigger_state.record_incumbent_improvement();
            } else {
                global_no_improvement_count = global_no_improvement_count
                    .saturating_add(chunk_outcome.search.iterations_completed);
            }
            aggregate.current_state = current_incumbent.clone();
            aggregate.iterations_completed = total_iterations_completed;
            aggregate.no_improvement_count = global_no_improvement_count;
            aggregate.max_no_improvement_streak = aggregate
                .max_no_improvement_streak
                .max(global_no_improvement_count);

            match chunk_outcome.stop_reason {
                StopReason::TimeLimitReached => {
                    stop_reason = StopReason::TimeLimitReached;
                    break;
                }
                StopReason::OptimalScoreReached => {
                    stop_reason = StopReason::OptimalScoreReached;
                    break;
                }
                _ => {}
            }

            if maybe_emit_progress(
                &aggregate,
                &run_context,
                progress_callback,
                total_started_at,
                &mut last_progress_callback_at,
            ) {
                stop_reason = StopReason::ProgressCallbackRequestedStop;
                final_progress_emitted = true;
                break;
            }

            if let Some(limit) = run_context.no_improvement_limit {
                if global_no_improvement_count >= limit {
                    stop_reason = StopReason::NoImprovementLimitReached;
                    break;
                }
            }

            match trigger_state.is_armed(transplant_config, global_no_improvement_count) {
                DonorSessionTriggerEligibility::Armed => {}
                DonorSessionTriggerEligibility::NotArmed => {
                    aggregate
                        .donor_session_transplant_telemetry
                        .get_or_insert_with(Default::default)
                        .trigger_blocked_not_armed += 1;
                    continue;
                }
                DonorSessionTriggerEligibility::EventCapReached => {
                    aggregate
                        .donor_session_transplant_telemetry
                        .get_or_insert_with(Default::default)
                        .trigger_blocked_event_cap += 1;
                    continue;
                }
            }

            if transplant_config.swap_local_optimum_certification_enabled
                && !trigger_state.swap_local_optimum_certified
            {
                aggregate
                    .donor_session_transplant_telemetry
                    .get_or_insert_with(Default::default)
                    .certification_scans_attempted += 1;
                let certification =
                    certify_swap_local_optimum(&current_incumbent, &run_context.allowed_sessions)?;
                {
                    let telemetry = aggregate
                        .donor_session_transplant_telemetry
                        .get_or_insert_with(Default::default);
                    telemetry.certification_scans_completed += 1;
                    telemetry.certification_scan_swap_previews +=
                        certification.swap_previews_evaluated;
                    telemetry.certification_scan_seconds += certification.scan_seconds;
                }

                if let Some(best_improving_swap) = certification.best_improving_swap {
                    aggregate
                        .donor_session_transplant_telemetry
                        .get_or_insert_with(Default::default)
                        .certification_found_improving_swap += 1;
                    apply_swap_runtime_preview(&mut current_incumbent, &best_improving_swap)?;
                    aggregate.current_state = current_incumbent.clone();
                    aggregate.best_state = current_incumbent.clone();
                    aggregate.best_score = current_incumbent.total_score;
                    aggregate
                        .best_score_timeline
                        .push(crate::models::BestScoreTimelinePoint {
                            iteration: total_iterations_completed,
                            elapsed_seconds: get_elapsed_seconds(total_started_at),
                            best_score: current_incumbent.total_score,
                        });
                    record_archive_update(
                        &mut aggregate,
                        archive.consider_state(current_incumbent.clone()).reason,
                    );
                    global_no_improvement_count = 0;
                    aggregate.no_improvement_count = 0;
                    trigger_state.record_incumbent_improvement();

                    if maybe_emit_progress(
                        &aggregate,
                        &run_context,
                        progress_callback,
                        total_started_at,
                        &mut last_progress_callback_at,
                    ) {
                        stop_reason = StopReason::ProgressCallbackRequestedStop;
                        final_progress_emitted = true;
                        break;
                    }
                    continue;
                }

                aggregate
                    .donor_session_transplant_telemetry
                    .get_or_insert_with(Default::default)
                    .certified_swap_local_optima += 1;
                trigger_state.mark_swap_local_optimum_certified();
            }

            let choice = match select_donor_session_from_summary(
                &build_session_fingerprints(&current_incumbent),
                &build_session_conflict_burden(&current_incumbent),
                &archive,
            ) {
                DonorSessionSelectionOutcome::Selected(choice) => choice,
                DonorSessionSelectionOutcome::NoViableDonor => {
                    aggregate
                        .donor_session_transplant_telemetry
                        .get_or_insert_with(Default::default)
                        .trigger_armed_no_viable_donor += 1;
                    continue;
                }
                DonorSessionSelectionOutcome::NoViableSession => {
                    aggregate
                        .donor_session_transplant_telemetry
                        .get_or_insert_with(Default::default)
                        .trigger_armed_no_viable_session += 1;
                    continue;
                }
            };

            trigger_state.record_recombination_event();
            aggregate
                .donor_session_transplant_telemetry
                .get_or_insert_with(Default::default)
                .recombination_events_fired += 1;
            let donor = &archive.entries()[choice.donor_archive_idx];
            let pre_recombination_incumbent_score = current_incumbent.total_score;
            let transplanted_child =
                transplant_donor_session(&current_incumbent, donor, choice.session_idx)?;

            let raw_child_delta = transplanted_child.total_score - current_incumbent.total_score;
            let raw_child_score = transplanted_child.total_score;
            let retention_decision = raw_child_retention.evaluate(raw_child_delta);
            let remaining_iterations_after_trigger =
                run_context.max_iterations - total_iterations_completed;
            let (
                stagnation_windows_at_trigger,
                polish_budget_iterations,
                polish_budget_no_improvement_iterations,
            ) = child_polish_budget_for_stagnation(
                transplant_config,
                global_no_improvement_count,
                remaining_iterations_after_trigger,
            );
            record_raw_child_retention(
                &mut aggregate,
                choice,
                pre_recombination_incumbent_score,
                donor.score,
                raw_child_score,
                raw_child_delta,
                retention_decision,
                stagnation_windows_at_trigger,
                raw_child_retention.latest_threshold(),
            );

            if !retention_decision.retained_for_polish {
                aggregate
                    .donor_session_transplant_telemetry
                    .get_or_insert_with(Default::default)
                    .immediate_discards += 1;
                continue;
            }

            let elapsed_before_polish = get_elapsed_seconds(total_started_at);
            if time_limit_exceeded(
                elapsed_before_polish,
                run_context.time_limit_seconds.map(|limit| limit as f64),
            ) {
                stop_reason = StopReason::TimeLimitReached;
                break;
            }

            let remaining_iterations = run_context.max_iterations - total_iterations_completed;
            if remaining_iterations == 0 {
                break;
            }
            let polish_iterations = polish_budget_iterations.min(remaining_iterations);
            record_child_polish_budget(
                &mut aggregate,
                polish_iterations,
                polish_budget_no_improvement_iterations.min(polish_iterations),
            );
            let polish_outcome = polish_state(
                transplanted_child,
                &run_context,
                LocalImproverBudget {
                    effective_seed: rng.random::<u64>(),
                    max_iterations: polish_iterations,
                    no_improvement_limit: Some(
                        polish_budget_no_improvement_iterations.min(polish_iterations),
                    ),
                    time_limit_seconds: run_context
                        .time_limit_seconds
                        .map(|limit| (limit as f64 - elapsed_before_polish).max(0.0)),
                    stop_on_optimal_score: run_context.stop_on_optimal_score,
                    runtime_scaled_no_improvement_stop: run_context
                        .runtime_scaled_no_improvement_stop,
                },
            )?;
            record_child_polish(
                &mut aggregate,
                &polish_outcome.search,
                polish_outcome.search_seconds,
                polish_outcome.stop_reason,
            );

            absorb_local_search_chunk(
                &mut aggregate,
                &polish_outcome.search,
                total_iterations_completed,
                elapsed_before_polish,
            );
            total_iterations_completed += polish_outcome.search.iterations_completed;
            trigger_state.finish_iterations(polish_outcome.search.iterations_completed);

            if polish_outcome.search.best_state.total_score < pre_recombination_incumbent_score {
                current_incumbent = polish_outcome.search.best_state.clone();
                aggregate
                    .donor_session_transplant_telemetry
                    .get_or_insert_with(Default::default)
                    .polished_children_kept += 1;
                record_archive_update(
                    &mut aggregate,
                    archive.consider_state(current_incumbent.clone()).reason,
                );
                global_no_improvement_count = polish_outcome.search.no_improvement_count;
                trigger_state.record_incumbent_improvement();
            } else {
                aggregate
                    .donor_session_transplant_telemetry
                    .get_or_insert_with(Default::default)
                    .polished_children_discarded += 1;
                global_no_improvement_count = global_no_improvement_count
                    .saturating_add(polish_outcome.search.iterations_completed);
            }
            aggregate.current_state = current_incumbent.clone();
            aggregate.iterations_completed = total_iterations_completed;
            aggregate.no_improvement_count = global_no_improvement_count;
            aggregate.max_no_improvement_streak = aggregate
                .max_no_improvement_streak
                .max(global_no_improvement_count);

            match polish_outcome.stop_reason {
                StopReason::TimeLimitReached => {
                    stop_reason = StopReason::TimeLimitReached;
                    break;
                }
                StopReason::OptimalScoreReached => {
                    stop_reason = StopReason::OptimalScoreReached;
                    break;
                }
                _ => {}
            }

            if maybe_emit_progress(
                &aggregate,
                &run_context,
                progress_callback,
                total_started_at,
                &mut last_progress_callback_at,
            ) {
                stop_reason = StopReason::ProgressCallbackRequestedStop;
                final_progress_emitted = true;
                break;
            }

            if let Some(limit) = run_context.no_improvement_limit {
                if global_no_improvement_count >= limit {
                    stop_reason = StopReason::NoImprovementLimitReached;
                    break;
                }
            }
        }
    }

    if !final_progress_emitted {
        if let Some(callback) = progress_callback {
            let final_elapsed = get_elapsed_seconds(total_started_at);
            let final_iteration = total_iterations_completed.saturating_sub(1);
            let final_progress = aggregate.to_progress_update(
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
    aggregate.current_state = current_incumbent.clone();
    aggregate.best_state = current_incumbent.clone();
    aggregate.best_score = current_incumbent.total_score;
    aggregate.iterations_completed = total_iterations_completed;
    aggregate.no_improvement_count = global_no_improvement_count;
    let mut telemetry = aggregate.to_benchmark_telemetry(&run_context, stop_reason, total_seconds);
    telemetry.total_seconds = total_seconds;
    telemetry.search_seconds = total_seconds;
    telemetry.iterations_per_second = if total_seconds > 0.0 {
        total_iterations_completed as f64 / total_seconds
    } else {
        0.0
    };

    if let Some(observer) = benchmark_observer {
        observer(&BenchmarkEvent::RunCompleted(telemetry.clone()));
    }

    *state = current_incumbent;
    build_solver_result(
        state,
        global_no_improvement_count,
        run_context.effective_seed,
        run_context.move_policy,
        stop_reason,
        telemetry,
    )
}

fn transplant_donor_session(
    base_state: &RuntimeState,
    donor: &super::archive::ArchivedElite,
    session_idx: usize,
) -> Result<RuntimeState, SolverError> {
    let mut child = base_state.clone();
    child.overwrite_session_from(&donor.state, session_idx)?;
    child.rebuild_pair_contacts();
    child.sync_score_from_oracle()?;
    Ok(child)
}

fn maybe_emit_progress(
    aggregate: &SearchProgressState,
    run_context: &SearchRunContext,
    progress_callback: Option<&ProgressCallback>,
    total_started_at: TimePoint,
    last_progress_callback_at: &mut TimePoint,
) -> bool {
    let Some(callback) = progress_callback else {
        return false;
    };

    let current_time = get_current_time();
    let elapsed_since_last_callback =
        get_elapsed_seconds_between(*last_progress_callback_at, current_time);
    let iteration = aggregate.iterations_completed.saturating_sub(1);
    if !should_emit_progress_callback(iteration, elapsed_since_last_callback) {
        return false;
    }

    let elapsed_seconds = get_elapsed_seconds(total_started_at);
    let progress = aggregate.to_progress_update(run_context, iteration, 0.0, elapsed_seconds, None);
    if !(callback)(&progress) {
        let final_progress = aggregate.to_progress_update(
            run_context,
            iteration,
            0.0,
            elapsed_seconds,
            Some(StopReason::ProgressCallbackRequestedStop),
        );
        let _ = (callback)(&final_progress);
        return true;
    }

    *last_progress_callback_at = current_time;
    false
}

fn absorb_local_search_chunk(
    aggregate: &mut SearchProgressState,
    local: &SearchProgressState,
    iteration_offset: u64,
    elapsed_offset: f64,
) {
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
    absorb_tabu_metrics(aggregate, local);

    for point in local.best_score_timeline.iter().skip(1) {
        if point.best_score < aggregate.best_score {
            aggregate
                .best_score_timeline
                .push(crate::models::BestScoreTimelinePoint {
                    iteration: iteration_offset + point.iteration,
                    elapsed_seconds: elapsed_offset + point.elapsed_seconds,
                    best_score: point.best_score,
                });
            aggregate.best_score = point.best_score;
            aggregate.best_state = local.best_state.clone();
        }
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

fn record_archive_update(search: &mut SearchProgressState, reason: ArchiveUpdateReason) {
    let telemetry = search
        .donor_session_transplant_telemetry
        .get_or_insert_with(Default::default);
    match reason {
        ArchiveUpdateReason::Added => telemetry.archive_additions += 1,
        ArchiveUpdateReason::ReplacedExactDuplicate => {
            telemetry.archive_exact_duplicate_replacements += 1
        }
        ArchiveUpdateReason::ReplacedNearDuplicate => {
            telemetry.archive_near_duplicate_replacements += 1
        }
        ArchiveUpdateReason::ReplacedRedundantMember => telemetry.archive_redundant_evictions += 1,
        ArchiveUpdateReason::RejectedExactDuplicate => {
            telemetry.archive_rejected_exact_duplicates += 1
        }
        ArchiveUpdateReason::RejectedNearDuplicate => {
            telemetry.archive_rejected_near_duplicates += 1
        }
        ArchiveUpdateReason::RejectedNotCompetitive => {
            telemetry.archive_rejected_not_competitive += 1
        }
    }
}

fn record_raw_child_retention(
    search: &mut SearchProgressState,
    choice: DonorSessionChoice,
    pre_recombination_incumbent_score: f64,
    donor_score: f64,
    raw_child_score: f64,
    raw_child_delta: f64,
    decision: AdaptiveRawChildRetentionDecision,
    stagnation_windows_at_trigger: u64,
    latest_threshold: Option<f64>,
) {
    let telemetry = search
        .donor_session_transplant_telemetry
        .get_or_insert_with(Default::default);
    telemetry.raw_children_evaluated += 1;
    telemetry.raw_child_delta_sum += raw_child_delta;
    telemetry.raw_child_delta_min = Some(
        telemetry
            .raw_child_delta_min
            .map_or(raw_child_delta, |current| current.min(raw_child_delta)),
    );
    telemetry.raw_child_delta_max = Some(
        telemetry
            .raw_child_delta_max
            .map_or(raw_child_delta, |current| current.max(raw_child_delta)),
    );
    telemetry.adaptive_discard_threshold = latest_threshold;
    telemetry.donor_choices.push(DonorSessionChoiceTelemetry {
        donor_archive_idx: choice.donor_archive_idx as u32,
        session_idx: choice.session_idx as u32,
        session_disagreement_count: choice.session_disagreement_count as u32,
        candidate_pool: choice.candidate_pool.telemetry(),
        session_viability_tier: choice.session_viability_tier.telemetry(),
        conflict_burden_delta: choice.conflict_burden_delta,
        pre_recombination_incumbent_score,
        donor_score,
        raw_child_score,
        raw_child_delta,
        adaptive_discard_threshold: decision.discard_threshold,
        retained_for_polish: decision.retained_for_polish,
        stagnation_windows_at_trigger,
        child_polish_budget_iterations: None,
        child_polish_budget_no_improvement_iterations: None,
        post_polish_best_score: None,
        raw_to_polished_delta: None,
        incumbent_to_polished_delta: None,
        became_new_incumbent: None,
        set_new_best_post_polish_score: None,
        polish_stop_reason: None,
        polish_iterations_completed: None,
    });
}

fn record_child_polish_budget(
    search: &mut SearchProgressState,
    polish_budget_iterations: u64,
    polish_budget_no_improvement_iterations: u64,
) {
    let telemetry = search
        .donor_session_transplant_telemetry
        .get_or_insert_with(Default::default);
    telemetry.child_polish_budget_iterations_sum += polish_budget_iterations;
    telemetry.child_polish_budget_no_improvement_iterations_sum +=
        polish_budget_no_improvement_iterations;
    if let Some(choice) = telemetry.donor_choices.last_mut() {
        choice.child_polish_budget_iterations = Some(polish_budget_iterations);
        choice.child_polish_budget_no_improvement_iterations =
            Some(polish_budget_no_improvement_iterations);
    }
}

fn record_child_polish(
    search: &mut SearchProgressState,
    local: &SearchProgressState,
    search_seconds: f64,
    polish_stop_reason: StopReason,
) {
    let telemetry = search
        .donor_session_transplant_telemetry
        .get_or_insert_with(Default::default);
    telemetry.polished_children += 1;
    telemetry.child_polish_iterations += local.iterations_completed;
    telemetry.child_polish_improving_moves += local.move_metrics.swap.improving_accepts
        + local.move_metrics.transfer.improving_accepts
        + local.move_metrics.clique_swap.improving_accepts;
    telemetry.child_polish_seconds += search_seconds;

    let post_polish_best_score = local.best_state.total_score;
    let previous_best_post_polish_score = telemetry.best_post_polish_score;
    let set_new_best_post_polish_score = previous_best_post_polish_score
        .map(|current| post_polish_best_score < current)
        .unwrap_or(true);
    telemetry.best_post_polish_score = Some(
        previous_best_post_polish_score.map_or(post_polish_best_score, |current| {
            current.min(post_polish_best_score)
        }),
    );
    telemetry.post_polish_score_sum += post_polish_best_score;
    telemetry.post_polish_score_min = Some(
        telemetry
            .post_polish_score_min
            .map_or(post_polish_best_score, |current| {
                current.min(post_polish_best_score)
            }),
    );
    telemetry.post_polish_score_max = Some(
        telemetry
            .post_polish_score_max
            .map_or(post_polish_best_score, |current| {
                current.max(post_polish_best_score)
            }),
    );

    if let Some((raw_child_score, pre_recombination_incumbent_score)) =
        telemetry.donor_choices.last().map(|choice| {
            (
                choice.raw_child_score,
                choice.pre_recombination_incumbent_score,
            )
        })
    {
        let raw_to_polished_delta = post_polish_best_score - raw_child_score;
        let incumbent_to_polished_delta =
            post_polish_best_score - pre_recombination_incumbent_score;
        let became_new_incumbent = incumbent_to_polished_delta < 0.0;

        telemetry.polished_child_vs_raw_delta_sum += raw_to_polished_delta;
        telemetry.polished_child_vs_raw_delta_min = Some(
            telemetry
                .polished_child_vs_raw_delta_min
                .map_or(raw_to_polished_delta, |current| {
                    current.min(raw_to_polished_delta)
                }),
        );
        telemetry.polished_child_vs_raw_delta_max = Some(
            telemetry
                .polished_child_vs_raw_delta_max
                .map_or(raw_to_polished_delta, |current| {
                    current.max(raw_to_polished_delta)
                }),
        );
        telemetry.polished_child_vs_incumbent_delta_sum += incumbent_to_polished_delta;
        telemetry.polished_child_vs_incumbent_delta_min = Some(
            telemetry
                .polished_child_vs_incumbent_delta_min
                .map_or(incumbent_to_polished_delta, |current| {
                    current.min(incumbent_to_polished_delta)
                }),
        );
        telemetry.polished_child_vs_incumbent_delta_max = Some(
            telemetry
                .polished_child_vs_incumbent_delta_max
                .map_or(incumbent_to_polished_delta, |current| {
                    current.max(incumbent_to_polished_delta)
                }),
        );

        let choice = telemetry
            .donor_choices
            .last_mut()
            .expect("donor choice should exist when recording child polish");
        choice.post_polish_best_score = Some(post_polish_best_score);
        choice.raw_to_polished_delta = Some(raw_to_polished_delta);
        choice.incumbent_to_polished_delta = Some(incumbent_to_polished_delta);
        choice.became_new_incumbent = Some(became_new_incumbent);
        choice.set_new_best_post_polish_score = Some(set_new_best_post_polish_score);
        choice.polish_stop_reason = Some(polish_stop_reason);
        choice.polish_iterations_completed = Some(local.iterations_completed);
    }
}

fn absorb_tabu_metrics(aggregate: &mut SearchProgressState, local: &SearchProgressState) {
    let Some(local_tabu) = local.sgp_week_pair_tabu_telemetry.as_ref() else {
        return;
    };
    let aggregate_tabu = aggregate
        .sgp_week_pair_tabu_telemetry
        .get_or_insert_with(Default::default);
    aggregate_tabu.raw_tabu_hits += local_tabu.raw_tabu_hits;
    aggregate_tabu.prefilter_skips += local_tabu.prefilter_skips;
    aggregate_tabu.retry_exhaustions += local_tabu.retry_exhaustions;
    aggregate_tabu.hard_blocks += local_tabu.hard_blocks;
    aggregate_tabu.aspiration_preview_surfaces += local_tabu.aspiration_preview_surfaces;
    aggregate_tabu.aspiration_overrides += local_tabu.aspiration_overrides;
    aggregate_tabu.recorded_swaps += local_tabu.recorded_swaps;
    aggregate_tabu.realized_tenure_sum += local_tabu.realized_tenure_sum;
    aggregate_tabu.realized_tenure_min = match (
        aggregate_tabu.realized_tenure_min,
        local_tabu.realized_tenure_min,
    ) {
        (Some(left), Some(right)) => Some(left.min(right)),
        (Some(left), None) => Some(left),
        (None, Some(right)) => Some(right),
        (None, None) => None,
    };
    aggregate_tabu.realized_tenure_max = match (
        aggregate_tabu.realized_tenure_max,
        local_tabu.realized_tenure_max,
    ) {
        (Some(left), Some(right)) => Some(left.max(right)),
        (Some(left), None) => Some(left),
        (None, Some(right)) => Some(right),
        (None, None) => None,
    };
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::{
        archive_config_for_donor_session_mode, certify_swap_local_optimum, record_child_polish,
        record_child_polish_budget, record_raw_child_retention, select_donor_session,
        select_donor_session_from_summary, transplant_donor_session,
        AdaptiveRawChildRetentionDecision, AdaptiveRawChildRetentionState, DonorCandidatePool,
        DonorSessionChoice, DonorSessionSelectionOutcome, DonorSessionTriggerEligibility,
        DonorSessionTriggerState, DonorSessionViabilityTier,
    };
    use crate::default_solver_configuration_for;
    use crate::models::{
        ApiInput, Constraint, Group, Objective, Person, ProblemDefinition, RepeatEncounterParams,
        SolverKind, StopReason,
    };
    use crate::solver3::runtime_state::RuntimeState;
    use crate::solver3::search::archive::{ArchivedElite, EliteArchive};
    use crate::solver3::search::context::{
        AdaptiveRawChildRetentionConfig, DonorSessionTransplantConfig, SearchProgressState,
    };

    fn config() -> DonorSessionTransplantConfig {
        DonorSessionTransplantConfig {
            archive_size: 4,
            recombination_no_improvement_window: 20,
            recombination_cooldown_window: 10,
            max_recombination_events_per_run: Some(2),
            adaptive_raw_child_retention: AdaptiveRawChildRetentionConfig {
                keep_ratio: 0.5,
                warmup_samples: 4,
                history_limit: 32,
            },
            swap_local_optimum_certification_enabled: false,
            child_polish_iterations_per_stagnation_window: 100_000,
            child_polish_no_improvement_iterations_per_stagnation_window: 100_000,
            child_polish_max_stagnation_windows: 4,
        }
    }

    fn person(id: &str) -> Person {
        Person {
            id: id.to_string(),
            attributes: HashMap::new(),
            sessions: None,
        }
    }

    fn schedule(
        groups: &[&str],
        sessions: Vec<Vec<Vec<&str>>>,
    ) -> HashMap<String, HashMap<String, Vec<String>>> {
        let mut schedule = HashMap::new();
        for (session_idx, session_groups) in sessions.into_iter().enumerate() {
            let mut session = HashMap::new();
            for (group_idx, members) in session_groups.into_iter().enumerate() {
                session.insert(
                    groups[group_idx].to_string(),
                    members
                        .into_iter()
                        .map(|member| member.to_string())
                        .collect(),
                );
            }
            schedule.insert(format!("session_{session_idx}"), session);
        }
        schedule
    }

    fn state_from_schedule(
        sessions: Vec<Vec<Vec<&str>>>,
        with_repeat_constraint: bool,
        score_override: f64,
    ) -> RuntimeState {
        let mut constraints = Vec::new();
        if with_repeat_constraint {
            constraints.push(Constraint::RepeatEncounter(RepeatEncounterParams {
                max_allowed_encounters: 1,
                penalty_function: "linear".into(),
                penalty_weight: 100.0,
            }));
        }
        let input = ApiInput {
            problem: ProblemDefinition {
                people: vec![person("p0"), person("p1"), person("p2"), person("p3")],
                groups: vec![
                    Group {
                        id: "g0".into(),
                        size: 2,
                        session_sizes: None,
                    },
                    Group {
                        id: "g1".into(),
                        size: 2,
                        session_sizes: None,
                    },
                ],
                num_sessions: sessions.len() as u32,
            },
            initial_schedule: Some(schedule(&["g0", "g1"], sessions)),
            construction_seed_schedule: None,
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".into(),
                weight: 1.0,
            }],
            constraints,
            solver: default_solver_configuration_for(SolverKind::Solver3),
        };
        let mut state =
            RuntimeState::from_input(&input).expect("schedule should build runtime state");
        state.total_score = score_override;
        state
    }

    #[test]
    fn trigger_waits_for_stagnation_and_donor_availability() {
        let state = DonorSessionTriggerState::new();
        assert_eq!(
            state.is_armed(config(), 19),
            DonorSessionTriggerEligibility::NotArmed
        );
        assert_eq!(
            state.is_armed(config(), 20),
            DonorSessionTriggerEligibility::Armed
        );
    }

    #[test]
    fn trigger_respects_cooldown_and_event_cap() {
        let mut state = DonorSessionTriggerState::new();
        state.record_recombination_event();
        assert_eq!(
            state.is_armed(config(), 100),
            DonorSessionTriggerEligibility::NotArmed
        );
        state.finish_iterations(10);
        assert_eq!(
            state.is_armed(config(), 100),
            DonorSessionTriggerEligibility::Armed
        );
        state.record_recombination_event();
        state.finish_iterations(10);
        assert_eq!(
            state.is_armed(config(), 100),
            DonorSessionTriggerEligibility::EventCapReached
        );
    }

    #[test]
    fn adaptive_raw_child_retention_warms_up_then_filters_by_percentile() {
        let mut retention = AdaptiveRawChildRetentionState::new(AdaptiveRawChildRetentionConfig {
            keep_ratio: 0.5,
            warmup_samples: 2,
            history_limit: 4,
        });

        let first = retention.evaluate(30.0);
        assert!(first.retained_for_polish);
        assert_eq!(first.discard_threshold, None);

        let second = retention.evaluate(10.0);
        assert!(second.retained_for_polish);
        assert_eq!(second.discard_threshold, None);

        let third = retention.evaluate(20.0);
        assert_eq!(third.discard_threshold, Some(10.0));
        assert!(!third.retained_for_polish);

        let fourth = retention.evaluate(15.0);
        assert_eq!(fourth.discard_threshold, Some(20.0));
        assert!(fourth.retained_for_polish);
    }

    #[test]
    fn swap_local_optimum_certification_finds_improving_swap_when_one_exists() {
        let state = state_from_schedule(
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            ],
            true,
            10.0,
        );

        let certification =
            certify_swap_local_optimum(&state, &[0, 1, 2]).expect("scan should succeed");
        assert!(certification.best_improving_swap.is_some());
        assert!(certification.swap_previews_evaluated > 0);
    }

    #[test]
    fn swap_local_optimum_certification_can_certify_local_optimum() {
        let state = state_from_schedule(
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                vec![vec!["p0", "p3"], vec!["p1", "p2"]],
            ],
            true,
            0.0,
        );

        let certification =
            certify_swap_local_optimum(&state, &[0, 1, 2]).expect("scan should succeed");
        assert!(certification.best_improving_swap.is_none());
        assert!(certification.swap_previews_evaluated > 0);
    }

    #[test]
    fn donor_selection_prefers_maximum_disagreement_within_score_competitive_half() {
        let base = state_from_schedule(
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            ],
            true,
            10.0,
        );
        let less_diverse_better_score = state_from_schedule(
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p3"], vec!["p1", "p2"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            ],
            true,
            8.0,
        );
        let more_diverse_competitive = state_from_schedule(
            vec![
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                vec![vec!["p0", "p3"], vec!["p1", "p2"]],
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            ],
            true,
            9.0,
        );
        let more_diverse_not_competitive = state_from_schedule(
            vec![
                vec![vec!["p0", "p3"], vec!["p1", "p2"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            ],
            true,
            20.0,
        );

        let mut archive = EliteArchive::new(archive_config_for_donor_session_mode(config()));
        archive.consider_state(less_diverse_better_score);
        archive.consider_state(more_diverse_competitive);
        archive.consider_state(more_diverse_not_competitive);

        let choice =
            select_donor_session(&base, &archive).expect("expected a viable donor session");
        assert_eq!(choice.donor_archive_idx, 1);
        assert_eq!(choice.session_idx, 0);
        assert_eq!(choice.session_disagreement_count, 3);
        assert_eq!(choice.candidate_pool, DonorCandidatePool::CompetitiveHalf);
        assert_eq!(
            choice.session_viability_tier,
            DonorSessionViabilityTier::StrictImproving
        );
        assert_eq!(choice.conflict_burden_delta, 2);
    }

    #[test]
    fn donor_selection_requires_more_than_near_duplicate_disagreement() {
        let base = state_from_schedule(
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            ],
            true,
            10.0,
        );
        let near_duplicate = state_from_schedule(
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            ],
            true,
            9.0,
        );

        let mut archive = EliteArchive::new(archive_config_for_donor_session_mode(config()));
        archive.consider_state(near_duplicate);

        assert!(select_donor_session(&base, &archive).is_none());
    }

    #[test]
    fn donor_selection_broadens_to_full_archive_when_competitive_half_stalls() {
        let mut archive = EliteArchive::new(archive_config_for_donor_session_mode(config()));
        archive.consider_elite(ArchivedElite {
            state: state_from_schedule(
                vec![
                    vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                    vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                    vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                ],
                true,
                10.0,
            ),
            score: 8.0,
            session_fingerprints: vec![10, 20, 30],
            session_conflict_burden: vec![6, 6, 6],
        });
        archive.consider_elite(ArchivedElite {
            state: state_from_schedule(
                vec![
                    vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                    vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                    vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                ],
                true,
                10.0,
            ),
            score: 9.0,
            session_fingerprints: vec![10, 2, 4],
            session_conflict_burden: vec![4, 5, 5],
        });

        let outcome = select_donor_session_from_summary(&[1, 2, 3], &[5, 5, 5], &archive);
        assert_eq!(
            outcome,
            DonorSessionSelectionOutcome::Selected(DonorSessionChoice {
                donor_archive_idx: 1,
                session_idx: 0,
                session_disagreement_count: 2,
                candidate_pool: DonorCandidatePool::FullArchive,
                session_viability_tier: DonorSessionViabilityTier::StrictImproving,
                conflict_burden_delta: 1,
            })
        );
    }

    #[test]
    fn donor_selection_falls_back_to_any_differing_when_needed() {
        let mut archive = EliteArchive::new(archive_config_for_donor_session_mode(config()));
        archive.consider_elite(ArchivedElite {
            state: state_from_schedule(
                vec![
                    vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                    vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                    vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                ],
                true,
                10.0,
            ),
            score: 9.0,
            session_fingerprints: vec![10, 20, 30],
            session_conflict_burden: vec![7, 6, 8],
        });

        let outcome = select_donor_session_from_summary(&[1, 2, 3], &[5, 5, 5], &archive);
        assert_eq!(
            outcome,
            DonorSessionSelectionOutcome::Selected(DonorSessionChoice {
                donor_archive_idx: 0,
                session_idx: 1,
                session_disagreement_count: 3,
                candidate_pool: DonorCandidatePool::CompetitiveHalf,
                session_viability_tier: DonorSessionViabilityTier::AnyDiffering,
                conflict_burden_delta: -1,
            })
        );
    }

    #[test]
    fn donor_selection_chooses_session_with_largest_conflict_burden_delta() {
        let base = state_from_schedule(
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            ],
            true,
            10.0,
        );
        let donor = state_from_schedule(
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                vec![vec!["p0", "p3"], vec!["p1", "p2"]],
            ],
            true,
            9.0,
        );

        let mut archive = EliteArchive::new(archive_config_for_donor_session_mode(config()));
        archive.consider_state(donor);

        let choice =
            select_donor_session(&base, &archive).expect("expected a viable donor session");
        assert_eq!(choice.session_idx, 1);
        assert_eq!(choice.conflict_burden_delta, 4);
    }

    #[test]
    fn transplant_donor_session_overwrites_only_the_selected_session() {
        let base = state_from_schedule(
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            ],
            true,
            10.0,
        );
        let donor = state_from_schedule(
            vec![
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                vec![vec!["p0", "p3"], vec!["p1", "p2"]],
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            ],
            true,
            9.0,
        );

        let child = transplant_donor_session(
            &base,
            &crate::solver3::search::archive::ArchivedElite::from_state(donor.clone()),
            1,
        )
        .expect("transplant should succeed");

        assert_eq!(
            child.group_members[child.group_slot(0, 0)],
            base.group_members[base.group_slot(0, 0)]
        );
        assert_eq!(
            child.group_members[child.group_slot(1, 0)],
            donor.group_members[donor.group_slot(1, 0)]
        );
        assert_eq!(
            child.group_members[child.group_slot(2, 0)],
            base.group_members[base.group_slot(2, 0)]
        );
        assert_eq!(
            child.pair_contacts,
            RuntimeState::from_input(&ApiInput {
                problem: ProblemDefinition {
                    people: vec![person("p0"), person("p1"), person("p2"), person("p3")],
                    groups: vec![
                        Group {
                            id: "g0".into(),
                            size: 2,
                            session_sizes: None
                        },
                        Group {
                            id: "g1".into(),
                            size: 2,
                            session_sizes: None
                        },
                    ],
                    num_sessions: 3,
                },
                initial_schedule: Some(schedule(
                    &["g0", "g1"],
                    vec![
                        vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                        vec![vec!["p0", "p3"], vec!["p1", "p2"]],
                        vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                    ],
                )),
                construction_seed_schedule: None,
                objectives: vec![Objective {
                    r#type: "maximize_unique_contacts".into(),
                    weight: 1.0,
                }],
                constraints: vec![Constraint::RepeatEncounter(RepeatEncounterParams {
                    max_allowed_encounters: 1,
                    penalty_function: "linear".into(),
                    penalty_weight: 100.0,
                })],
                solver: default_solver_configuration_for(SolverKind::Solver3),
            })
            .expect("expected child runtime state")
            .pair_contacts
        );
    }

    #[test]
    fn child_quality_telemetry_records_post_polish_basin_depth() {
        let base = state_from_schedule(
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            ],
            true,
            10.0,
        );
        let mut aggregate = SearchProgressState::new(base.clone());

        record_raw_child_retention(
            &mut aggregate,
            DonorSessionChoice {
                donor_archive_idx: 1,
                session_idx: 2,
                session_disagreement_count: 3,
                candidate_pool: DonorCandidatePool::CompetitiveHalf,
                session_viability_tier: DonorSessionViabilityTier::StrictImproving,
                conflict_burden_delta: 4,
            },
            10.0,
            9.0,
            12.0,
            2.0,
            AdaptiveRawChildRetentionDecision {
                discard_threshold: Some(3.0),
                retained_for_polish: true,
            },
            3,
            Some(3.0),
        );
        record_child_polish_budget(&mut aggregate, 100, 80);

        let mut polished = SearchProgressState::new(base);
        polished.best_state.total_score = 8.5;
        polished.iterations_completed = 42;
        record_child_polish(
            &mut aggregate,
            &polished,
            0.25,
            StopReason::NoImprovementLimitReached,
        );

        let telemetry = aggregate
            .donor_session_transplant_telemetry
            .expect("telemetry should exist");
        assert_eq!(telemetry.polished_children, 1);
        assert_eq!(telemetry.best_post_polish_score, Some(8.5));
        assert_eq!(telemetry.post_polish_score_sum, 8.5);
        assert_eq!(telemetry.post_polish_score_min, Some(8.5));
        assert_eq!(telemetry.post_polish_score_max, Some(8.5));
        assert_eq!(telemetry.polished_child_vs_raw_delta_sum, -3.5);
        assert_eq!(telemetry.polished_child_vs_raw_delta_min, Some(-3.5));
        assert_eq!(telemetry.polished_child_vs_raw_delta_max, Some(-3.5));
        assert_eq!(telemetry.polished_child_vs_incumbent_delta_sum, -1.5);
        assert_eq!(telemetry.polished_child_vs_incumbent_delta_min, Some(-1.5));
        assert_eq!(telemetry.polished_child_vs_incumbent_delta_max, Some(-1.5));

        let recorded_choice = telemetry
            .donor_choices
            .last()
            .expect("choice telemetry should exist");
        assert_eq!(recorded_choice.pre_recombination_incumbent_score, 10.0);
        assert_eq!(recorded_choice.donor_score, 9.0);
        assert_eq!(recorded_choice.raw_child_score, 12.0);
        assert_eq!(recorded_choice.post_polish_best_score, Some(8.5));
        assert_eq!(recorded_choice.raw_to_polished_delta, Some(-3.5));
        assert_eq!(recorded_choice.incumbent_to_polished_delta, Some(-1.5));
        assert_eq!(recorded_choice.became_new_incumbent, Some(true));
        assert_eq!(recorded_choice.set_new_best_post_polish_score, Some(true));
        assert_eq!(
            recorded_choice.polish_stop_reason,
            Some(StopReason::NoImprovementLimitReached)
        );
        assert_eq!(recorded_choice.polish_iterations_completed, Some(42));
    }

    #[test]
    fn child_quality_telemetry_marks_non_improving_basin_without_new_best_flag() {
        let base = state_from_schedule(
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                vec![vec!["p0", "p3"], vec!["p1", "p2"]],
            ],
            true,
            10.0,
        );
        let mut aggregate = SearchProgressState::new(base.clone());

        record_raw_child_retention(
            &mut aggregate,
            DonorSessionChoice {
                donor_archive_idx: 0,
                session_idx: 0,
                session_disagreement_count: 3,
                candidate_pool: DonorCandidatePool::CompetitiveHalf,
                session_viability_tier: DonorSessionViabilityTier::StrictImproving,
                conflict_burden_delta: 2,
            },
            10.0,
            9.5,
            11.0,
            1.0,
            AdaptiveRawChildRetentionDecision {
                discard_threshold: None,
                retained_for_polish: true,
            },
            2,
            None,
        );
        let mut first_polished = SearchProgressState::new(base.clone());
        first_polished.best_state.total_score = 8.0;
        record_child_polish(
            &mut aggregate,
            &first_polished,
            0.2,
            StopReason::NoImprovementLimitReached,
        );

        record_raw_child_retention(
            &mut aggregate,
            DonorSessionChoice {
                donor_archive_idx: 1,
                session_idx: 1,
                session_disagreement_count: 2,
                candidate_pool: DonorCandidatePool::FullArchive,
                session_viability_tier: DonorSessionViabilityTier::AnyDiffering,
                conflict_burden_delta: -1,
            },
            8.0,
            9.0,
            8.2,
            0.2,
            AdaptiveRawChildRetentionDecision {
                discard_threshold: Some(0.5),
                retained_for_polish: true,
            },
            4,
            Some(0.5),
        );
        let mut second_polished = SearchProgressState::new(base);
        second_polished.best_state.total_score = 8.1;
        second_polished.iterations_completed = 7;
        record_child_polish(
            &mut aggregate,
            &second_polished,
            0.1,
            StopReason::MaxIterationsReached,
        );

        let telemetry = aggregate
            .donor_session_transplant_telemetry
            .expect("telemetry should exist");
        assert_eq!(telemetry.best_post_polish_score, Some(8.0));
        assert_eq!(telemetry.post_polish_score_min, Some(8.0));
        assert_eq!(telemetry.post_polish_score_max, Some(8.1));

        let second_choice = telemetry
            .donor_choices
            .last()
            .expect("second choice should exist");
        assert_eq!(second_choice.post_polish_best_score, Some(8.1));
        assert_eq!(second_choice.became_new_incumbent, Some(false));
        assert_eq!(second_choice.set_new_best_post_polish_score, Some(false));
        assert_eq!(
            second_choice.polish_stop_reason,
            Some(StopReason::MaxIterationsReached)
        );
        assert_eq!(second_choice.polish_iterations_completed, Some(7));
    }
}
