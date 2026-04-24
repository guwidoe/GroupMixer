use std::cmp::Ordering;
use std::collections::VecDeque;

#[cfg(not(target_arch = "wasm32"))]
use std::time::Instant;

#[cfg(target_arch = "wasm32")]
use js_sys;

use rand::seq::SliceRandom;
use rand::{RngExt, SeedableRng};
use rand_chacha::ChaCha12Rng;

use crate::models::{
    BenchmarkEvent, BenchmarkObserver, BestScoreTimelinePoint, MoveFamilyBenchmarkTelemetry,
    MoveFamilyBenchmarkTelemetrySummary, MultiRootBalancedSessionInheritanceBenchmarkTelemetry,
    MultiRootBalancedSessionInheritanceEventTelemetry, ProgressCallback,
    RepeatGuidedSwapBenchmarkTelemetry, SessionAlignedPathRelinkingBenchmarkTelemetry,
    SessionAlignedPathRelinkingEventTelemetry, SessionAlignedPathRelinkingStepTelemetry,
    SgpWeekPairTabuBenchmarkTelemetry, Solver3PathRelinkingOperatorVariant, SolverResult,
    StopReason,
};
use crate::solver_support::SolverError;

use super::super::moves::{
    analyze_swap, apply_swap_runtime_preview, preview_swap_runtime_lightweight, SwapFeasibility,
    SwapMove, SwapRuntimePreview,
};
use super::super::runtime_state::RuntimeState;
use super::archive::{
    CrossRootParentChoice, CrossRootParentSelectionPolicy, EliteArchive, EliteArchiveConfig,
    MultiRootElitePool, MultiRootElitePoolConfig, SearchRootId,
};
use super::candidate_sampling::{CandidateSampler, SwapSamplingOptions, TabuSwapSamplingDelta};
use super::context::{
    AdaptiveRawChildRetentionConfig, SearchProgressState, SearchRunContext,
    SessionAlignedPathRelinkingConfig,
};
use super::single_state::{
    build_solver_result, polish_state, should_emit_progress_callback, LocalImproverBudget,
    LocalImproverRunResult,
};

pub(crate) const MAX_EXACT_ALIGNMENT_SESSIONS: usize = 20;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct AlignedSessionPair {
    pub(crate) base_session_idx: usize,
    pub(crate) donor_session_idx: usize,
    pub(crate) structural_distance: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SessionAlignment {
    pub(crate) matched_session_pairs: Vec<AlignedSessionPair>,
    pub(crate) total_alignment_cost: u32,
}

impl SessionAlignment {
    pub(crate) fn differing_pairs(&self) -> Vec<AlignedSessionPair> {
        self.matched_session_pairs
            .iter()
            .filter(|pair| pair.structural_distance > 0)
            .cloned()
            .collect()
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct AdaptiveRawChildRetentionDecision {
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
        let retain = self
            .current_threshold()
            .map(|threshold| raw_child_delta <= threshold)
            .unwrap_or(true);
        self.record(raw_child_delta);
        AdaptiveRawChildRetentionDecision {
            retained_for_polish: retain,
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
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct PathRelinkingTriggerState {
    path_events_fired: u64,
    iterations_since_last_path_event: u64,
    swap_local_optimum_certified: bool,
}

impl Default for PathRelinkingTriggerState {
    fn default() -> Self {
        Self {
            path_events_fired: 0,
            iterations_since_last_path_event: u64::MAX,
            swap_local_optimum_certified: false,
        }
    }
}

impl PathRelinkingTriggerState {
    fn new() -> Self {
        Self::default()
    }

    fn is_armed(
        &self,
        config: SessionAlignedPathRelinkingConfig,
        no_improvement_count: u64,
    ) -> bool {
        if config
            .max_path_events_per_run
            .is_some_and(|cap| self.path_events_fired >= cap)
        {
            return false;
        }

        no_improvement_count >= config.recombination_no_improvement_window
            && self.iterations_since_last_path_event >= config.recombination_cooldown_window
    }

    fn finish_iterations(&mut self, iterations: u64) {
        self.iterations_since_last_path_event = self
            .iterations_since_last_path_event
            .saturating_add(iterations);
    }

    fn record_path_event(&mut self) {
        self.path_events_fired += 1;
        self.iterations_since_last_path_event = 0;
    }

    fn record_incumbent_improvement(&mut self) {
        self.swap_local_optimum_certified = false;
    }

    fn mark_swap_local_optimum_certified(&mut self) {
        self.swap_local_optimum_certified = true;
    }
}

const MULTI_ROOT_SEED_STRIDE: u64 = 0x9E37_79B9_7F4A_7C15;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BalancedInheritanceParentRole {
    ParentA,
    ParentB,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct BalancedInheritanceSessionChoice {
    target_session_idx: usize,
    source_parent: BalancedInheritanceParentRole,
    source_session_idx: usize,
    aligned_partner_session_idx: usize,
    structural_distance: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct BalancedInheritancePlan {
    session_choices: Vec<BalancedInheritanceSessionChoice>,
    differing_session_count: usize,
    parent_a_session_count: usize,
    parent_b_session_count: usize,
    parent_a_receives_extra_session: bool,
}

#[derive(Debug, Clone)]
struct CanonicalCrossRootParentPair {
    parent_a_root_id: SearchRootId,
    parent_a: super::archive::ArchivedElite,
    parent_b_root_id: SearchRootId,
    parent_b: super::archive::ArchivedElite,
}

#[derive(Debug, Clone, PartialEq)]
struct PathGuideCandidate {
    donor_archive_idx: usize,
    alignment: SessionAlignment,
    differing_pairs: Vec<AlignedSessionPair>,
    donor_score: f64,
}

#[derive(Debug, Clone)]
struct RandomMacroMutationCandidate {
    raw_child: RuntimeState,
    swaps_applied: u32,
}

#[derive(Debug, Clone)]
enum PathStepCandidateInput {
    DonorSessionImport(AlignedSessionPair),
    RandomMacroMutation(RandomMacroMutationCandidate),
}

#[derive(Debug, Clone)]
struct PathStepEvaluation {
    aligned_pair: Option<AlignedSessionPair>,
    raw_child_score: f64,
    raw_child_delta: f64,
    candidate_priority: i64,
    polish_outcome: LocalImproverRunResult,
}

#[derive(Debug, Clone, PartialEq)]
struct SwapLocalOptimumCertificationResult {
    best_improving_swap: Option<SwapRuntimePreview>,
    swap_previews_evaluated: u64,
    scan_seconds: f64,
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

pub(crate) fn build_session_pairing_signature(
    state: &RuntimeState,
    session_idx: usize,
) -> Vec<usize> {
    let mut pair_indices = Vec::new();
    for group_idx in 0..state.compiled.num_groups {
        let members = &state.group_members[state.group_slot(session_idx, group_idx)];
        for left_idx in 0..members.len() {
            for right_idx in (left_idx + 1)..members.len() {
                pair_indices.push(
                    state
                        .compiled
                        .pair_idx(members[left_idx], members[right_idx]),
                );
            }
        }
    }
    pair_indices.sort_unstable();
    pair_indices
}

pub(crate) fn session_pairing_distance(
    base_state: &RuntimeState,
    base_session_idx: usize,
    donor_state: &RuntimeState,
    donor_session_idx: usize,
) -> Result<u32, SolverError> {
    validate_alignment_dimensions(base_state, donor_state)?;
    let base_signature = build_session_pairing_signature(base_state, base_session_idx);
    let donor_signature = build_session_pairing_signature(donor_state, donor_session_idx);
    Ok(sorted_symmetric_difference_count(
        &base_signature,
        &donor_signature,
    ))
}

pub(crate) fn align_sessions_by_pairing_distance(
    base_state: &RuntimeState,
    donor_state: &RuntimeState,
) -> Result<SessionAlignment, SolverError> {
    validate_alignment_dimensions(base_state, donor_state)?;
    let session_count = base_state.compiled.num_sessions;
    if session_count > MAX_EXACT_ALIGNMENT_SESSIONS {
        return Err(SolverError::ValidationError(format!(
            "solver3 session-aligned path relinking currently supports at most {MAX_EXACT_ALIGNMENT_SESSIONS} sessions for exact alignment"
        )));
    }

    let base_signatures = (0..session_count)
        .map(|session_idx| build_session_pairing_signature(base_state, session_idx))
        .collect::<Vec<_>>();
    let donor_signatures = (0..session_count)
        .map(|session_idx| build_session_pairing_signature(donor_state, session_idx))
        .collect::<Vec<_>>();
    let distance_matrix = build_distance_matrix(&base_signatures, &donor_signatures);
    let assignment = solve_minimum_cost_assignment(&distance_matrix)?;
    let matched_session_pairs = assignment
        .into_iter()
        .enumerate()
        .map(|(base_session_idx, donor_session_idx)| AlignedSessionPair {
            base_session_idx,
            donor_session_idx,
            structural_distance: distance_matrix[base_session_idx][donor_session_idx],
        })
        .collect::<Vec<_>>();
    let total_alignment_cost = matched_session_pairs
        .iter()
        .map(|pair| pair.structural_distance)
        .sum();

    Ok(SessionAlignment {
        matched_session_pairs,
        total_alignment_cost,
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
    let config = run_context
        .session_aligned_path_relinking
        .expect("session-aligned path relinking config should be normalized");
    let mut trigger_state = PathRelinkingTriggerState::new();
    let mut archive = EliteArchive::new(archive_config_for_path_relinking_mode(config));
    let mut raw_child_retention =
        AdaptiveRawChildRetentionState::new(config.adaptive_raw_child_retention);
    let mut current_incumbent = state.clone();
    let mut aggregate = SearchProgressState::new(current_incumbent.clone());
    aggregate.session_aligned_path_relinking_telemetry =
        Some(SessionAlignedPathRelinkingBenchmarkTelemetry {
            operator_variant: config.operator_variant,
            archive_size: config.archive_size as u32,
            child_polish_local_improver_mode: Some(run_context.local_improver_mode),
            raw_child_keep_ratio: config.adaptive_raw_child_retention.keep_ratio,
            raw_child_warmup_samples: config.adaptive_raw_child_retention.warmup_samples as u32,
            raw_child_history_limit: config.adaptive_raw_child_retention.history_limit as u32,
            child_polish_iterations_per_stagnation_window: config
                .child_polish_iterations_per_stagnation_window,
            child_polish_no_improvement_iterations_per_stagnation_window: config
                .child_polish_no_improvement_iterations_per_stagnation_window,
            child_polish_max_stagnation_windows: config.child_polish_max_stagnation_windows,
            swap_local_optimum_certification_enabled: config
                .swap_local_optimum_certification_enabled,
            ..Default::default()
        });
    let _ = archive.consider_state(current_incumbent.clone());

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
        'outer: while total_iterations_completed < run_context.max_iterations {
            let elapsed_before_chunk = get_elapsed_seconds(total_started_at);
            if time_limit_exceeded(
                elapsed_before_chunk,
                run_context.time_limit_seconds.map(|limit| limit as f64),
            ) {
                stop_reason = StopReason::TimeLimitReached;
                break;
            }

            let remaining_iterations = run_context.max_iterations - total_iterations_completed;
            let chunk_iterations =
                remaining_iterations.min(config.recombination_no_improvement_window.max(1));
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
                let _ = archive.consider_state(current_incumbent.clone());
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

            if !trigger_state.is_armed(config, global_no_improvement_count) {
                continue;
            }

            if config.swap_local_optimum_certification_enabled
                && !trigger_state.swap_local_optimum_certified
            {
                let certification =
                    certify_swap_local_optimum(&current_incumbent, &run_context.allowed_sessions)?;
                if let Some(best_improving_swap) = certification.best_improving_swap {
                    apply_swap_runtime_preview(&mut current_incumbent, &best_improving_swap)?;
                    let _ = archive.consider_state(current_incumbent.clone());
                    global_no_improvement_count = 0;
                    aggregate.current_state = current_incumbent.clone();
                    if current_incumbent.total_score < aggregate.best_score {
                        aggregate.best_state = current_incumbent.clone();
                        aggregate.best_score = current_incumbent.total_score;
                        aggregate
                            .best_score_timeline
                            .push(crate::models::BestScoreTimelinePoint {
                                iteration: total_iterations_completed,
                                elapsed_seconds: get_elapsed_seconds(total_started_at),
                                best_score: current_incumbent.total_score,
                            });
                    }
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
                let _ = certification.scan_seconds;
                let _ = certification.swap_previews_evaluated;
                trigger_state.mark_swap_local_optimum_certified();
            }

            let Some(guide) = select_path_guide(&current_incumbent, &archive, config)? else {
                aggregate
                    .session_aligned_path_relinking_telemetry
                    .get_or_insert_with(Default::default)
                    .guide_selection_failures += 1;
                continue;
            };
            let donor = &archive.entries()[guide.donor_archive_idx];
            trigger_state.record_path_event();
            {
                let telemetry = aggregate
                    .session_aligned_path_relinking_telemetry
                    .get_or_insert_with(Default::default);
                telemetry.path_events_fired += 1;
                telemetry.alignment_cost_sum += u64::from(guide.alignment.total_alignment_cost);
                telemetry.differing_session_count_sum += guide.differing_pairs.len() as u64;
            }

            let pre_event_incumbent_score = current_incumbent.total_score;
            let mut event_telemetry = SessionAlignedPathRelinkingEventTelemetry {
                donor_archive_idx: guide.donor_archive_idx as u32,
                donor_score: donor.score,
                base_incumbent_score: pre_event_incumbent_score,
                alignment_total_cost: guide.alignment.total_alignment_cost,
                differing_session_count: guide.differing_pairs.len() as u32,
                ..Default::default()
            };
            let mut current_path_state = current_incumbent.clone();
            let macro_mutation_candidate_count = guide.differing_pairs.len().max(1);
            let mut remaining_pairs = guide.differing_pairs;
            remaining_pairs.sort_by(|left, right| {
                right
                    .structural_distance
                    .cmp(&left.structural_distance)
                    .then_with(|| left.base_session_idx.cmp(&right.base_session_idx))
                    .then_with(|| left.donor_session_idx.cmp(&right.donor_session_idx))
            });
            let mut remaining_base_sessions = remaining_pairs
                .iter()
                .map(|pair| pair.base_session_idx)
                .collect::<Vec<_>>();
            let mut remaining_donor_sessions = remaining_pairs
                .iter()
                .map(|pair| pair.donor_session_idx)
                .collect::<Vec<_>>();
            let mut best_event_state = None;
            let mut best_event_score = pre_event_incumbent_score;
            let mut event_iterations_consumed = 0u64;
            let mut no_improvement_steps = 0usize;

            for _ in 0..config.max_session_imports_per_event {
                let step_candidates = match config.operator_variant {
                    Solver3PathRelinkingOperatorVariant::SessionAlignedPathRelinking => {
                        if remaining_pairs.is_empty() {
                            break;
                        }
                        remaining_pairs
                            .clone()
                            .into_iter()
                            .map(PathStepCandidateInput::DonorSessionImport)
                            .collect::<Vec<_>>()
                    }
                    Solver3PathRelinkingOperatorVariant::RandomDonorSessionControl => {
                        let candidates = build_random_donor_session_candidates(
                            &current_path_state,
                            donor,
                            &remaining_base_sessions,
                            &remaining_donor_sessions,
                            config.min_aligned_session_distance_for_relinking,
                            &mut rng,
                        )?;
                        if candidates.is_empty() {
                            break;
                        }
                        candidates
                            .into_iter()
                            .map(PathStepCandidateInput::DonorSessionImport)
                            .collect::<Vec<_>>()
                    }
                    Solver3PathRelinkingOperatorVariant::RandomMacroMutationControl => {
                        let candidates = build_random_macro_mutation_candidates(
                            &current_path_state,
                            &run_context,
                            macro_mutation_candidate_count,
                            config.max_session_imports_per_event,
                            &mut rng,
                        )?;
                        if candidates.is_empty() {
                            break;
                        }
                        candidates
                            .into_iter()
                            .map(PathStepCandidateInput::RandomMacroMutation)
                            .collect::<Vec<_>>()
                    }
                };
                if step_candidates.is_empty() {
                    break;
                }
                let remaining_iterations = run_context.max_iterations - total_iterations_completed;
                if remaining_iterations == 0 {
                    break 'outer;
                }
                let elapsed_before_step = get_elapsed_seconds(total_started_at);
                if time_limit_exceeded(
                    elapsed_before_step,
                    run_context.time_limit_seconds.map(|limit| limit as f64),
                ) {
                    stop_reason = StopReason::TimeLimitReached;
                    break 'outer;
                }

                let (
                    _stagnation_windows_at_trigger,
                    polish_budget_iterations,
                    polish_budget_no_improvement_iterations,
                ) = child_polish_budget_for_stagnation(
                    config,
                    global_no_improvement_count,
                    remaining_iterations,
                );
                let mut best_step = None;
                let mut forced_stop_reason = None;

                for step_candidate in step_candidates {
                    event_telemetry.steps_attempted += 1;
                    aggregate
                        .session_aligned_path_relinking_telemetry
                        .get_or_insert_with(Default::default)
                        .steps_attempted += 1;
                    let (aligned_pair, macro_mutation_swaps_applied, raw_child, candidate_priority) =
                        match step_candidate {
                            PathStepCandidateInput::DonorSessionImport(aligned_pair) => {
                                let raw_child = transplant_aligned_session(
                                    &current_path_state,
                                    donor,
                                    &aligned_pair,
                                )?;
                                let candidate_priority =
                                    i64::from(aligned_pair.structural_distance);
                                (Some(aligned_pair), None, raw_child, candidate_priority)
                            }
                            PathStepCandidateInput::RandomMacroMutation(candidate) => (
                                None,
                                Some(candidate.swaps_applied),
                                candidate.raw_child,
                                i64::from(candidate.swaps_applied),
                            ),
                        };
                    let raw_child_score = raw_child.total_score;
                    let raw_child_delta = raw_child_score - current_path_state.total_score;
                    if !raw_child_retention
                        .evaluate(raw_child_delta)
                        .retained_for_polish
                    {
                        event_telemetry.raw_steps_discarded_before_polish += 1;
                        aggregate
                            .session_aligned_path_relinking_telemetry
                            .get_or_insert_with(Default::default)
                            .raw_steps_discarded_before_polish += 1;
                        continue;
                    }

                    let elapsed_before_polish = get_elapsed_seconds(total_started_at);
                    if time_limit_exceeded(
                        elapsed_before_polish,
                        run_context.time_limit_seconds.map(|limit| limit as f64),
                    ) {
                        stop_reason = StopReason::TimeLimitReached;
                        break 'outer;
                    }

                    let remaining_iterations =
                        run_context.max_iterations - total_iterations_completed;
                    if remaining_iterations == 0 {
                        break 'outer;
                    }
                    let polish_iterations = polish_budget_iterations.min(remaining_iterations);
                    let polish_outcome = polish_state(
                        raw_child,
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
                    absorb_search_metrics_only(&mut aggregate, &polish_outcome.search);
                    total_iterations_completed += polish_outcome.search.iterations_completed;
                    event_iterations_consumed += polish_outcome.search.iterations_completed;
                    trigger_state.finish_iterations(polish_outcome.search.iterations_completed);

                    event_telemetry.polished_steps += 1;
                    event_telemetry.child_polish_iterations +=
                        polish_outcome.search.iterations_completed;
                    event_telemetry.child_polish_seconds += polish_outcome.search_seconds;
                    let post_polish_best_score = polish_outcome.search.best_state.total_score;
                    event_telemetry.best_post_polish_event_score = Some(
                        event_telemetry
                            .best_post_polish_event_score
                            .map_or(post_polish_best_score, |current| {
                                current.min(post_polish_best_score)
                            }),
                    );
                    {
                        let telemetry = aggregate
                            .session_aligned_path_relinking_telemetry
                            .get_or_insert_with(Default::default);
                        telemetry.polished_steps += 1;
                        telemetry.child_polish_iterations +=
                            polish_outcome.search.iterations_completed;
                        telemetry.child_polish_seconds += polish_outcome.search_seconds;
                        telemetry.best_post_polish_score = Some(
                            telemetry
                                .best_post_polish_score
                                .map_or(post_polish_best_score, |current| {
                                    current.min(post_polish_best_score)
                                }),
                        );
                    }

                    let became_event_best = post_polish_best_score < best_event_score;
                    event_telemetry
                        .steps
                        .push(SessionAlignedPathRelinkingStepTelemetry {
                            base_session_idx: aligned_pair
                                .as_ref()
                                .map(|pair| pair.base_session_idx as u32),
                            donor_session_idx: aligned_pair
                                .as_ref()
                                .map(|pair| pair.donor_session_idx as u32),
                            structural_distance: aligned_pair
                                .as_ref()
                                .map(|pair| pair.structural_distance),
                            macro_mutation_swaps_applied,
                            raw_child_score,
                            raw_child_delta,
                            post_polish_best_score: Some(post_polish_best_score),
                            raw_to_polished_delta: Some(post_polish_best_score - raw_child_score),
                            incumbent_to_post_polish_delta: Some(
                                post_polish_best_score - pre_event_incumbent_score,
                            ),
                            polish_stop_reason: Some(polish_outcome.stop_reason),
                            polish_iterations_completed: Some(
                                polish_outcome.search.iterations_completed,
                            ),
                            became_event_best: Some(became_event_best),
                        });

                    let candidate = PathStepEvaluation {
                        aligned_pair,
                        raw_child_score,
                        raw_child_delta,
                        candidate_priority,
                        polish_outcome,
                    };
                    let replace = best_step.as_ref().is_none_or(|best: &PathStepEvaluation| {
                        compare_path_step_candidate(&candidate, best) == Ordering::Less
                    });
                    if replace {
                        best_step = Some(candidate);
                    }

                    match best_step
                        .as_ref()
                        .map(|step| step.polish_outcome.stop_reason)
                        .unwrap_or(StopReason::MaxIterationsReached)
                    {
                        StopReason::TimeLimitReached => {
                            forced_stop_reason = Some(StopReason::TimeLimitReached)
                        }
                        StopReason::OptimalScoreReached => {
                            forced_stop_reason = Some(StopReason::OptimalScoreReached)
                        }
                        _ => {}
                    }

                    if forced_stop_reason.is_some() {
                        break;
                    }
                }

                let Some(best_step) = best_step else {
                    break;
                };
                match config.operator_variant {
                    Solver3PathRelinkingOperatorVariant::SessionAlignedPathRelinking => {
                        remove_aligned_pair(
                            &mut remaining_pairs,
                            best_step
                                .aligned_pair
                                .as_ref()
                                .expect("aligned operator should keep an aligned pair"),
                        );
                    }
                    Solver3PathRelinkingOperatorVariant::RandomDonorSessionControl => {
                        remove_session_idx(
                            &mut remaining_base_sessions,
                            best_step
                                .aligned_pair
                                .as_ref()
                                .expect("random donor control should keep an aligned pair")
                                .base_session_idx,
                        );
                        remove_session_idx(
                            &mut remaining_donor_sessions,
                            best_step
                                .aligned_pair
                                .as_ref()
                                .expect("random donor control should keep an aligned pair")
                                .donor_session_idx,
                        );
                    }
                    Solver3PathRelinkingOperatorVariant::RandomMacroMutationControl => {}
                }
                current_path_state = best_step.polish_outcome.search.best_state.clone();

                if current_path_state.total_score < best_event_score {
                    best_event_score = current_path_state.total_score;
                    best_event_state = Some(current_path_state.clone());
                    no_improvement_steps = 0;
                } else {
                    no_improvement_steps += 1;
                }

                if let Some(reason) = forced_stop_reason {
                    stop_reason = reason;
                    break 'outer;
                }

                if no_improvement_steps >= config.path_step_no_improvement_limit {
                    break;
                }

                if matches!(
                    config.operator_variant,
                    Solver3PathRelinkingOperatorVariant::RandomMacroMutationControl
                ) {
                    break;
                }
            }

            if let Some(best_event_state) = best_event_state {
                if best_event_state.total_score < pre_event_incumbent_score {
                    current_incumbent = best_event_state;
                    let _ = archive.consider_state(current_incumbent.clone());
                    global_no_improvement_count = 0;
                    aggregate.current_state = current_incumbent.clone();
                    if current_incumbent.total_score < aggregate.best_score {
                        aggregate.best_state = current_incumbent.clone();
                        aggregate.best_score = current_incumbent.total_score;
                        aggregate
                            .best_score_timeline
                            .push(crate::models::BestScoreTimelinePoint {
                                iteration: total_iterations_completed,
                                elapsed_seconds: get_elapsed_seconds(total_started_at),
                                best_score: current_incumbent.total_score,
                            });
                    }
                    trigger_state.record_incumbent_improvement();
                    event_telemetry.became_new_incumbent = true;
                    aggregate
                        .session_aligned_path_relinking_telemetry
                        .get_or_insert_with(Default::default)
                        .path_events_kept += 1;
                } else {
                    global_no_improvement_count =
                        global_no_improvement_count.saturating_add(event_iterations_consumed);
                }
            } else {
                global_no_improvement_count =
                    global_no_improvement_count.saturating_add(event_iterations_consumed.max(1));
            }

            aggregate
                .session_aligned_path_relinking_telemetry
                .get_or_insert_with(Default::default)
                .event_summaries
                .push(event_telemetry);

            aggregate.current_state = current_incumbent.clone();
            aggregate.iterations_completed = total_iterations_completed;
            aggregate.no_improvement_count = global_no_improvement_count;
            aggregate.max_no_improvement_streak = aggregate
                .max_no_improvement_streak
                .max(global_no_improvement_count);

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

            if run_context.stop_on_optimal_score
                && current_incumbent.total_score <= crate::models::OPTIMAL_SCORE_TOLERANCE
            {
                stop_reason = StopReason::OptimalScoreReached;
                break;
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

pub(crate) fn run_multi_root_balanced_session_inheritance(
    state: &mut RuntimeState,
    run_context: SearchRunContext,
    _progress_callback: Option<&ProgressCallback>,
    benchmark_observer: Option<&BenchmarkObserver>,
) -> Result<SolverResult, SolverError> {
    let total_started_at = get_current_time();
    let config = run_context
        .multi_root_balanced_session_inheritance
        .expect("multi-root balanced session inheritance config should be normalized");
    let mut diversification_rng =
        ChaCha12Rng::seed_from_u64(run_context.effective_seed ^ MULTI_ROOT_SEED_STRIDE);
    let mut aggregate = SearchProgressState::new(state.clone());
    aggregate.multi_root_balanced_session_inheritance_telemetry =
        Some(MultiRootBalancedSessionInheritanceBenchmarkTelemetry {
            root_count: config.root_count as u32,
            archive_size_per_root: config.archive_size_per_root as u32,
            child_polish_local_improver_mode: Some(run_context.local_improver_mode),
            raw_child_keep_ratio: config.adaptive_raw_child_retention.keep_ratio,
            raw_child_warmup_samples: config.adaptive_raw_child_retention.warmup_samples as u32,
            raw_child_history_limit: config.adaptive_raw_child_retention.history_limit as u32,
            max_parent_score_delta_from_best: config.max_parent_score_delta_from_best,
            min_cross_root_session_disagreement: config.min_cross_root_session_disagreement as u32,
            parent_a_differing_session_share: config.parent_a_differing_session_share,
            child_polish_iterations_per_stagnation_window: config
                .child_polish_iterations_per_stagnation_window,
            child_polish_no_improvement_iterations_per_stagnation_window: config
                .child_polish_no_improvement_iterations_per_stagnation_window,
            child_polish_max_stagnation_windows: config.child_polish_max_stagnation_windows,
            swap_local_optimum_certification_enabled: config
                .swap_local_optimum_certification_enabled,
            ..Default::default()
        });
    let mut raw_child_retention =
        AdaptiveRawChildRetentionState::new(config.adaptive_raw_child_retention);
    let mut pool = MultiRootElitePool::new(MultiRootElitePoolConfig {
        max_roots: config.root_count,
        per_root_archive: EliteArchiveConfig {
            capacity: config.archive_size_per_root,
            near_duplicate_session_threshold: 1,
        },
    });
    let mut best_root_id = run_context.effective_seed;
    let mut current_incumbent = state.clone();
    let mut total_iterations_completed = 0u64;
    let mut total_search_seconds = 0.0;
    let mut stop_reason = StopReason::MaxIterationsReached;
    let root_incubation_iterations = (run_context.max_iterations / (config.root_count as u64 + 2))
        .max(1)
        .min(config.recombination_no_improvement_window.max(1));
    let child_polish_iterations = config
        .child_polish_iterations_per_stagnation_window
        .saturating_mul(config.child_polish_max_stagnation_windows)
        .max(1);
    let child_polish_no_improvement_iterations = config
        .child_polish_no_improvement_iterations_per_stagnation_window
        .saturating_mul(config.child_polish_max_stagnation_windows)
        .max(1);

    if let Some(observer) = benchmark_observer {
        observer(&BenchmarkEvent::RunStarted(
            crate::models::BenchmarkRunStarted {
                effective_seed: run_context.effective_seed,
                move_policy: run_context.move_policy.clone(),
                initial_score: aggregate.initial_score,
            },
        ));
    }

    for root_idx in 0..config.root_count {
        if total_iterations_completed >= run_context.max_iterations {
            break;
        }
        if time_limit_exceeded(
            get_elapsed_seconds(total_started_at),
            run_context.time_limit_seconds.map(|limit| limit as f64),
        ) {
            stop_reason = StopReason::TimeLimitReached;
            break;
        }

        let root_id = run_context
            .effective_seed
            .wrapping_add(((root_idx + 1) as u64).wrapping_mul(MULTI_ROOT_SEED_STRIDE));
        let mut root_state = state.clone();
        let swaps_per_candidate = 1 + (root_idx % 3);
        if let Some(mutated) = build_random_macro_mutation_candidates(
            &root_state,
            &run_context,
            1,
            swaps_per_candidate,
            &mut diversification_rng,
        )?
        .into_iter()
        .next()
        {
            root_state = mutated.raw_child;
            root_state.rebuild_pair_contacts();
            root_state.sync_score_from_oracle()?;
        }

        let remaining_iterations = run_context
            .max_iterations
            .saturating_sub(total_iterations_completed);
        let budget_iterations = remaining_iterations.min(root_incubation_iterations).max(1);
        let outcome = polish_state(
            root_state,
            &run_context,
            LocalImproverBudget {
                effective_seed: root_id,
                max_iterations: budget_iterations,
                no_improvement_limit: run_context
                    .no_improvement_limit
                    .map(|limit| limit.min(budget_iterations)),
                time_limit_seconds: run_context.time_limit_seconds.map(|limit| {
                    let remaining = (limit as f64 - get_elapsed_seconds(total_started_at)).max(0.0);
                    remaining.min((limit as f64) / (config.root_count as f64 + 2.0))
                }),
                stop_on_optimal_score: run_context.stop_on_optimal_score,
                runtime_scaled_no_improvement_stop: run_context.runtime_scaled_no_improvement_stop,
            },
        )?;
        merge_local_improver_run(
            &mut aggregate,
            &outcome,
            total_iterations_completed,
            total_search_seconds,
        );
        total_iterations_completed += outcome.search.iterations_completed;
        total_search_seconds += outcome.search_seconds;
        if let Some(telemetry) = aggregate
            .multi_root_balanced_session_inheritance_telemetry
            .as_mut()
        {
            telemetry.roots_incubated += 1;
        }
        let _ = pool.consider_state(root_id, outcome.search.best_state.clone());
        if outcome.search.best_state.total_score < current_incumbent.total_score {
            current_incumbent = outcome.search.best_state.clone();
            best_root_id = root_id;
        }
        if run_context.stop_on_optimal_score
            && aggregate.best_score <= crate::models::OPTIMAL_SCORE_TOLERANCE
        {
            stop_reason = StopReason::OptimalScoreReached;
            break;
        }
    }

    if stop_reason != StopReason::OptimalScoreReached
        && total_iterations_completed < run_context.max_iterations
        && !time_limit_exceeded(
            get_elapsed_seconds(total_started_at),
            run_context.time_limit_seconds.map(|limit| limit as f64),
        )
    {
        let max_events = config.max_recombination_events_per_run.unwrap_or(u64::MAX);
        let mut events_fired = 0u64;
        while events_fired < max_events
            && total_iterations_completed < run_context.max_iterations
            && !time_limit_exceeded(
                get_elapsed_seconds(total_started_at),
                run_context.time_limit_seconds.map(|limit| limit as f64),
            )
        {
            let choice = match pool.select_cross_root_parent_pair(CrossRootParentSelectionPolicy {
                max_score_delta_from_best: config.max_parent_score_delta_from_best,
                min_session_disagreement: config.min_cross_root_session_disagreement,
            }) {
                Ok(choice) => choice,
                Err(_) => {
                    if let Some(telemetry) = aggregate
                        .multi_root_balanced_session_inheritance_telemetry
                        .as_mut()
                    {
                        telemetry.parent_pair_selection_failures += 1;
                    }
                    break;
                }
            };
            events_fired += 1;

            let parents = canonicalize_cross_root_parent_pair(&pool, choice)?;
            let alignment = align_sessions_by_pairing_distance(
                &parents.parent_a.state,
                &parents.parent_b.state,
            )?;
            let plan = build_balanced_inheritance_plan(
                &alignment,
                parents.parent_a_root_id,
                parents.parent_b_root_id,
                config.parent_a_differing_session_share,
            );
            let raw_child = build_balanced_inheritance_child(
                &parents.parent_a.state,
                &parents.parent_b.state,
                &plan,
            )?;
            let agreed_session_count = alignment
                .matched_session_pairs
                .len()
                .saturating_sub(plan.differing_session_count)
                as u32;
            let mut event_summary = MultiRootBalancedSessionInheritanceEventTelemetry {
                parent_a_root_id: parents.parent_a_root_id,
                parent_b_root_id: parents.parent_b_root_id,
                parent_a_score: parents.parent_a.score,
                parent_b_score: parents.parent_b.score,
                alignment_total_cost: alignment.total_alignment_cost,
                agreed_session_count,
                differing_session_count: plan.differing_session_count as u32,
                inherited_from_parent_a_sessions: plan.parent_a_session_count as u32,
                inherited_from_parent_b_sessions: plan.parent_b_session_count as u32,
                raw_child_score: raw_child.total_score,
                ..Default::default()
            };
            if let Some(telemetry) = aggregate
                .multi_root_balanced_session_inheritance_telemetry
                .as_mut()
            {
                telemetry.inheritance_events_fired += 1;
                telemetry.alignment_cost_sum += u64::from(alignment.total_alignment_cost);
                telemetry.agreed_session_count_sum += u64::from(agreed_session_count);
                telemetry.differing_session_count_sum += plan.differing_session_count as u64;
                telemetry.inherited_from_parent_a_sessions_sum +=
                    plan.parent_a_session_count as u64;
                telemetry.inherited_from_parent_b_sessions_sum +=
                    plan.parent_b_session_count as u64;
            }
            let raw_child_delta = raw_child.total_score - current_incumbent.total_score;
            let retain_for_polish = raw_child.total_score < current_incumbent.total_score
                || raw_child_retention
                    .evaluate(raw_child_delta)
                    .retained_for_polish;

            if retain_for_polish {
                let remaining_iterations = run_context
                    .max_iterations
                    .saturating_sub(total_iterations_completed);
                if remaining_iterations > 0 {
                    let child_root_id = parents
                        .parent_a_root_id
                        .wrapping_mul(31)
                        .wrapping_add(parents.parent_b_root_id.wrapping_mul(17))
                        .wrapping_add(run_context.effective_seed)
                        .wrapping_add(events_fired);
                    let budget_iterations =
                        remaining_iterations.min(child_polish_iterations).max(1);
                    let outcome = polish_state(
                        raw_child,
                        &run_context,
                        LocalImproverBudget {
                            effective_seed: child_root_id,
                            max_iterations: budget_iterations,
                            no_improvement_limit: Some(
                                budget_iterations.min(child_polish_no_improvement_iterations),
                            ),
                            time_limit_seconds: run_context.time_limit_seconds.map(|limit| {
                                (limit as f64 - get_elapsed_seconds(total_started_at)).max(0.0)
                            }),
                            stop_on_optimal_score: run_context.stop_on_optimal_score,
                            runtime_scaled_no_improvement_stop: run_context
                                .runtime_scaled_no_improvement_stop,
                        },
                    )?;
                    merge_local_improver_run(
                        &mut aggregate,
                        &outcome,
                        total_iterations_completed,
                        total_search_seconds,
                    );
                    total_iterations_completed += outcome.search.iterations_completed;
                    total_search_seconds += outcome.search_seconds;
                    let _ = pool.consider_state(child_root_id, outcome.search.best_state.clone());
                    let child_score = outcome.search.best_state.total_score;
                    event_summary.post_polish_best_score = Some(child_score);
                    event_summary.child_polish_iterations = outcome.search.iterations_completed;
                    event_summary.child_polish_seconds = outcome.search_seconds;
                    event_summary.child_beats_parent_a = Some(child_score < parents.parent_a.score);
                    event_summary.child_beats_parent_b = Some(child_score < parents.parent_b.score);
                    event_summary.child_beats_both_parents = Some(
                        child_score < parents.parent_a.score
                            && child_score < parents.parent_b.score,
                    );
                    if let Some(telemetry) = aggregate
                        .multi_root_balanced_session_inheritance_telemetry
                        .as_mut()
                    {
                        telemetry.child_polish_iterations += outcome.search.iterations_completed;
                        telemetry.child_polish_seconds += outcome.search_seconds;
                        telemetry.best_post_polish_score = Some(
                            telemetry
                                .best_post_polish_score
                                .map_or(child_score, |current| current.min(child_score)),
                        );
                        if child_score < parents.parent_a.score {
                            telemetry.children_beating_parent_a += 1;
                        }
                        if child_score < parents.parent_b.score {
                            telemetry.children_beating_parent_b += 1;
                        }
                        if child_score < parents.parent_a.score
                            && child_score < parents.parent_b.score
                        {
                            telemetry.children_beating_both_parents += 1;
                        }
                    }
                    if child_score < current_incumbent.total_score {
                        current_incumbent = outcome.search.best_state.clone();
                        best_root_id = child_root_id;
                        event_summary.became_new_incumbent = true;
                        if let Some(telemetry) = aggregate
                            .multi_root_balanced_session_inheritance_telemetry
                            .as_mut()
                        {
                            telemetry.inheritance_events_kept += 1;
                        }
                    }
                }
            } else {
                let raw_beats_parent_a = raw_child.total_score < parents.parent_a.score;
                let raw_beats_parent_b = raw_child.total_score < parents.parent_b.score;
                event_summary.child_beats_parent_a = Some(raw_beats_parent_a);
                event_summary.child_beats_parent_b = Some(raw_beats_parent_b);
                event_summary.child_beats_both_parents =
                    Some(raw_beats_parent_a && raw_beats_parent_b);
                if let Some(telemetry) = aggregate
                    .multi_root_balanced_session_inheritance_telemetry
                    .as_mut()
                {
                    if raw_beats_parent_a {
                        telemetry.children_beating_parent_a += 1;
                    }
                    if raw_beats_parent_b {
                        telemetry.children_beating_parent_b += 1;
                    }
                    if raw_beats_parent_a && raw_beats_parent_b {
                        telemetry.children_beating_both_parents += 1;
                    }
                }
            }

            if let Some(telemetry) = aggregate
                .multi_root_balanced_session_inheritance_telemetry
                .as_mut()
            {
                telemetry.event_summaries.push(event_summary);
            }
        }
    }

    if stop_reason != StopReason::OptimalScoreReached
        && total_iterations_completed < run_context.max_iterations
        && !time_limit_exceeded(
            get_elapsed_seconds(total_started_at),
            run_context.time_limit_seconds.map(|limit| limit as f64),
        )
    {
        let remaining_iterations = run_context
            .max_iterations
            .saturating_sub(total_iterations_completed);
        if remaining_iterations > 0 {
            let outcome = polish_state(
                current_incumbent.clone(),
                &run_context,
                LocalImproverBudget {
                    effective_seed: best_root_id,
                    max_iterations: remaining_iterations,
                    no_improvement_limit: run_context.no_improvement_limit,
                    time_limit_seconds: run_context.time_limit_seconds.map(|limit| {
                        (limit as f64 - get_elapsed_seconds(total_started_at)).max(0.0)
                    }),
                    stop_on_optimal_score: run_context.stop_on_optimal_score,
                    runtime_scaled_no_improvement_stop: run_context
                        .runtime_scaled_no_improvement_stop,
                },
            )?;
            merge_local_improver_run(
                &mut aggregate,
                &outcome,
                total_iterations_completed,
                total_search_seconds,
            );
            total_iterations_completed += outcome.search.iterations_completed;
            current_incumbent = outcome.search.best_state.clone();
        }
    }

    let total_seconds = get_elapsed_seconds(total_started_at);
    if time_limit_exceeded(
        total_seconds,
        run_context.time_limit_seconds.map(|limit| limit as f64),
    ) {
        stop_reason = StopReason::TimeLimitReached;
    } else if run_context.stop_on_optimal_score
        && aggregate.best_score <= crate::models::OPTIMAL_SCORE_TOLERANCE
    {
        stop_reason = StopReason::OptimalScoreReached;
    }

    aggregate.current_state = current_incumbent.clone();
    aggregate.best_state = current_incumbent.clone();
    aggregate.best_score = current_incumbent.total_score;
    aggregate.iterations_completed = total_iterations_completed;
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
        aggregate.no_improvement_count,
        run_context.effective_seed,
        run_context.move_policy,
        stop_reason,
        telemetry,
    )
}

fn merge_local_improver_run(
    aggregate: &mut SearchProgressState,
    outcome: &LocalImproverRunResult,
    iteration_offset: u64,
    elapsed_offset: f64,
) {
    aggregate.current_state = outcome.search.current_state.clone();
    if outcome.search.best_score < aggregate.best_score {
        aggregate.best_state = outcome.search.best_state.clone();
        aggregate.best_score = outcome.search.best_score;
    }
    aggregate.no_improvement_count = outcome.search.no_improvement_count;
    aggregate.max_no_improvement_streak = aggregate
        .max_no_improvement_streak
        .max(outcome.search.max_no_improvement_streak);
    aggregate.iterations_completed += outcome.search.iterations_completed;
    aggregate.local_optima_escapes += outcome.search.local_optima_escapes;
    aggregate.accepted_uphill_moves += outcome.search.accepted_uphill_moves;
    aggregate.accepted_downhill_moves += outcome.search.accepted_downhill_moves;
    aggregate.accepted_neutral_moves += outcome.search.accepted_neutral_moves;
    aggregate.attempted_delta_sum += outcome.search.attempted_delta_sum;
    aggregate.accepted_delta_sum += outcome.search.accepted_delta_sum;
    aggregate.biggest_attempted_increase = aggregate
        .biggest_attempted_increase
        .max(outcome.search.biggest_attempted_increase);
    aggregate.biggest_accepted_increase = aggregate
        .biggest_accepted_increase
        .max(outcome.search.biggest_accepted_increase);
    aggregate.recent_acceptance = outcome.search.recent_acceptance.clone();
    aggregate
        .best_score_timeline
        .extend(
            outcome
                .search
                .best_score_timeline
                .iter()
                .skip(1)
                .map(|point| BestScoreTimelinePoint {
                    iteration: point.iteration + iteration_offset,
                    elapsed_seconds: point.elapsed_seconds + elapsed_offset,
                    best_score: point.best_score,
                }),
        );
    merge_repeat_guided_swap_telemetry(
        &mut aggregate.repeat_guided_swap_telemetry,
        &outcome.search.repeat_guided_swap_telemetry,
    );
    merge_optional_tabu_telemetry(
        &mut aggregate.sgp_week_pair_tabu_telemetry,
        &outcome.search.sgp_week_pair_tabu_telemetry,
    );
    merge_move_family_summary(&mut aggregate.move_metrics, &outcome.search.move_metrics);
}

fn merge_repeat_guided_swap_telemetry(
    dest: &mut RepeatGuidedSwapBenchmarkTelemetry,
    src: &RepeatGuidedSwapBenchmarkTelemetry,
) {
    dest.guided_attempts += src.guided_attempts;
    dest.guided_successes += src.guided_successes;
    dest.guided_fallback_to_random += src.guided_fallback_to_random;
    dest.guided_previewed_candidates += src.guided_previewed_candidates;
}

fn merge_optional_tabu_telemetry(
    dest: &mut Option<SgpWeekPairTabuBenchmarkTelemetry>,
    src: &Option<SgpWeekPairTabuBenchmarkTelemetry>,
) {
    let Some(src) = src else {
        return;
    };
    let dest = dest.get_or_insert_with(SgpWeekPairTabuBenchmarkTelemetry::default);
    dest.raw_tabu_hits += src.raw_tabu_hits;
    dest.prefilter_skips += src.prefilter_skips;
    dest.retry_exhaustions += src.retry_exhaustions;
    dest.hard_blocks += src.hard_blocks;
    dest.aspiration_preview_surfaces += src.aspiration_preview_surfaces;
    dest.aspiration_overrides += src.aspiration_overrides;
    dest.recorded_swaps += src.recorded_swaps;
    dest.realized_tenure_sum += src.realized_tenure_sum;
    dest.realized_tenure_min = match (dest.realized_tenure_min, src.realized_tenure_min) {
        (Some(left), Some(right)) => Some(left.min(right)),
        (None, value) | (value, None) => value,
    };
    dest.realized_tenure_max = match (dest.realized_tenure_max, src.realized_tenure_max) {
        (Some(left), Some(right)) => Some(left.max(right)),
        (None, value) | (value, None) => value,
    };
}

fn merge_move_family_summary(
    dest: &mut MoveFamilyBenchmarkTelemetrySummary,
    src: &MoveFamilyBenchmarkTelemetrySummary,
) {
    merge_move_family_metrics(&mut dest.swap, &src.swap);
    merge_move_family_metrics(&mut dest.transfer, &src.transfer);
    merge_move_family_metrics(&mut dest.clique_swap, &src.clique_swap);
}

fn merge_move_family_metrics(
    dest: &mut MoveFamilyBenchmarkTelemetry,
    src: &MoveFamilyBenchmarkTelemetry,
) {
    dest.attempts += src.attempts;
    dest.accepted += src.accepted;
    dest.improving_accepts += src.improving_accepts;
    dest.rejected += src.rejected;
    dest.preview_seconds += src.preview_seconds;
    dest.apply_seconds += src.apply_seconds;
    dest.full_recalculation_count += src.full_recalculation_count;
    dest.full_recalculation_seconds += src.full_recalculation_seconds;
}

fn canonicalize_cross_root_parent_pair(
    pool: &MultiRootElitePool,
    choice: CrossRootParentChoice,
) -> Result<CanonicalCrossRootParentPair, SolverError> {
    let left_root = pool.root(choice.left_root_id).ok_or_else(|| {
        SolverError::ValidationError(
            "multi-root parent selection returned missing left root".into(),
        )
    })?;
    let right_root = pool.root(choice.right_root_id).ok_or_else(|| {
        SolverError::ValidationError(
            "multi-root parent selection returned missing right root".into(),
        )
    })?;
    let left_parent = left_root
        .entries()
        .get(choice.left_archive_idx)
        .ok_or_else(|| {
            SolverError::ValidationError(
                "multi-root parent selection returned missing left archive entry".into(),
            )
        })?
        .clone();
    let right_parent = right_root
        .entries()
        .get(choice.right_archive_idx)
        .ok_or_else(|| {
            SolverError::ValidationError(
                "multi-root parent selection returned missing right archive entry".into(),
            )
        })?
        .clone();

    if choice.left_root_id <= choice.right_root_id {
        Ok(CanonicalCrossRootParentPair {
            parent_a_root_id: choice.left_root_id,
            parent_a: left_parent,
            parent_b_root_id: choice.right_root_id,
            parent_b: right_parent,
        })
    } else {
        Ok(CanonicalCrossRootParentPair {
            parent_a_root_id: choice.right_root_id,
            parent_a: right_parent,
            parent_b_root_id: choice.left_root_id,
            parent_b: left_parent,
        })
    }
}

fn build_balanced_inheritance_plan(
    alignment: &SessionAlignment,
    parent_a_root_id: SearchRootId,
    parent_b_root_id: SearchRootId,
    parent_a_differing_session_share: f64,
) -> BalancedInheritancePlan {
    debug_assert!((parent_a_differing_session_share - 0.5).abs() <= f64::EPSILON);

    let mut differing_pairs = alignment.differing_pairs();
    differing_pairs.sort_by(|left, right| {
        right
            .structural_distance
            .cmp(&left.structural_distance)
            .then_with(|| left.base_session_idx.cmp(&right.base_session_idx))
            .then_with(|| left.donor_session_idx.cmp(&right.donor_session_idx))
    });

    let differing_count = differing_pairs.len();
    let parent_a_receives_extra_session = differing_count % 2 == 1
        && ((alignment.total_alignment_cost as u64 + parent_a_root_id + parent_b_root_id) % 2 == 0);
    let parent_a_target_count = if differing_count % 2 == 0 {
        differing_count / 2
    } else if parent_a_receives_extra_session {
        differing_count / 2 + 1
    } else {
        differing_count / 2
    };
    let parent_a_target_sessions = differing_pairs
        .iter()
        .take(parent_a_target_count)
        .map(|pair| pair.base_session_idx)
        .collect::<Vec<_>>();

    let mut matched_pairs = alignment.matched_session_pairs.clone();
    matched_pairs.sort_by(|left, right| left.base_session_idx.cmp(&right.base_session_idx));

    let mut session_choices = Vec::with_capacity(matched_pairs.len());
    let mut parent_a_assigned = 0usize;
    let mut parent_b_assigned = 0usize;
    for pair in matched_pairs {
        if pair.structural_distance == 0
            || parent_a_target_sessions.contains(&pair.base_session_idx)
        {
            if pair.structural_distance > 0 {
                parent_a_assigned += 1;
            }
            session_choices.push(BalancedInheritanceSessionChoice {
                target_session_idx: pair.base_session_idx,
                source_parent: BalancedInheritanceParentRole::ParentA,
                source_session_idx: pair.base_session_idx,
                aligned_partner_session_idx: pair.donor_session_idx,
                structural_distance: pair.structural_distance,
            });
        } else {
            parent_b_assigned += 1;
            session_choices.push(BalancedInheritanceSessionChoice {
                target_session_idx: pair.base_session_idx,
                source_parent: BalancedInheritanceParentRole::ParentB,
                source_session_idx: pair.donor_session_idx,
                aligned_partner_session_idx: pair.base_session_idx,
                structural_distance: pair.structural_distance,
            });
        }
    }

    BalancedInheritancePlan {
        session_choices,
        differing_session_count: differing_count,
        parent_a_session_count: parent_a_assigned,
        parent_b_session_count: parent_b_assigned,
        parent_a_receives_extra_session,
    }
}

fn build_balanced_inheritance_child(
    parent_a_state: &RuntimeState,
    parent_b_state: &RuntimeState,
    plan: &BalancedInheritancePlan,
) -> Result<RuntimeState, SolverError> {
    let mut child = parent_a_state.clone();
    for session_choice in &plan.session_choices {
        match session_choice.source_parent {
            BalancedInheritanceParentRole::ParentA => child.overwrite_session_from_to(
                parent_a_state,
                session_choice.target_session_idx,
                session_choice.source_session_idx,
            )?,
            BalancedInheritanceParentRole::ParentB => child.overwrite_session_from_to(
                parent_b_state,
                session_choice.target_session_idx,
                session_choice.source_session_idx,
            )?,
        }
    }
    child.rebuild_pair_contacts();
    child.sync_score_from_oracle()?;
    Ok(child)
}

fn archive_config_for_path_relinking_mode(
    config: SessionAlignedPathRelinkingConfig,
) -> EliteArchiveConfig {
    EliteArchiveConfig {
        capacity: config.archive_size,
        near_duplicate_session_threshold: 1,
    }
}

fn child_polish_budget_for_stagnation(
    config: SessionAlignedPathRelinkingConfig,
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

fn select_path_guide(
    base_state: &RuntimeState,
    archive: &EliteArchive,
    config: SessionAlignedPathRelinkingConfig,
) -> Result<Option<PathGuideCandidate>, SolverError> {
    if archive.entries().is_empty() {
        return Ok(None);
    }

    let mut ranked_archive_indices = (0..archive.entries().len()).collect::<Vec<_>>();
    ranked_archive_indices.sort_by(|left, right| {
        archive.entries()[*left]
            .score
            .total_cmp(&archive.entries()[*right].score)
            .then_with(|| left.cmp(right))
    });
    let competitive_count = ranked_archive_indices.len().div_ceil(2);
    for candidate_indices in [
        ranked_archive_indices
            .iter()
            .copied()
            .take(competitive_count)
            .collect::<Vec<_>>(),
        ranked_archive_indices.clone(),
    ] {
        let mut best = None;
        for archive_idx in candidate_indices {
            let donor = &archive.entries()[archive_idx];
            let alignment = align_sessions_by_pairing_distance(base_state, &donor.state)?;
            let differing_pairs = alignment
                .differing_pairs()
                .into_iter()
                .filter(|pair| {
                    pair.structural_distance >= config.min_aligned_session_distance_for_relinking
                })
                .collect::<Vec<_>>();
            if differing_pairs.len() <= archive.near_duplicate_session_threshold() {
                continue;
            }

            let candidate = PathGuideCandidate {
                donor_archive_idx: archive_idx,
                alignment,
                differing_pairs,
                donor_score: donor.score,
            };
            let replace = best.as_ref().is_none_or(|current: &PathGuideCandidate| {
                compare_path_guides(&candidate, current) == Ordering::Greater
            });
            if replace {
                best = Some(candidate);
            }
        }
        if best.is_some() {
            return Ok(best);
        }
    }

    Ok(None)
}

fn compare_path_guides(left: &PathGuideCandidate, right: &PathGuideCandidate) -> Ordering {
    left.alignment
        .total_alignment_cost
        .cmp(&right.alignment.total_alignment_cost)
        .then_with(|| left.differing_pairs.len().cmp(&right.differing_pairs.len()))
        .then_with(|| right.donor_score.total_cmp(&left.donor_score))
}

fn compare_path_step_candidate(left: &PathStepEvaluation, right: &PathStepEvaluation) -> Ordering {
    left.polish_outcome
        .search
        .best_state
        .total_score
        .total_cmp(&right.polish_outcome.search.best_state.total_score)
        .then_with(|| left.raw_child_score.total_cmp(&right.raw_child_score))
        .then_with(|| left.raw_child_delta.total_cmp(&right.raw_child_delta))
        .then_with(|| right.candidate_priority.cmp(&left.candidate_priority))
}

fn transplant_aligned_session(
    base_state: &RuntimeState,
    donor: &super::archive::ArchivedElite,
    aligned_pair: &AlignedSessionPair,
) -> Result<RuntimeState, SolverError> {
    let mut child = base_state.clone();
    child.overwrite_session_from_to(
        &donor.state,
        aligned_pair.base_session_idx,
        aligned_pair.donor_session_idx,
    )?;
    child.rebuild_pair_contacts();
    child.sync_score_from_oracle()?;
    Ok(child)
}

fn build_random_donor_session_candidates(
    current_path_state: &RuntimeState,
    donor: &super::archive::ArchivedElite,
    remaining_base_sessions: &[usize],
    remaining_donor_sessions: &[usize],
    min_distance: u32,
    rng: &mut ChaCha12Rng,
) -> Result<Vec<AlignedSessionPair>, SolverError> {
    let mut shuffled_base_sessions = remaining_base_sessions.to_vec();
    let mut shuffled_donor_sessions = remaining_donor_sessions.to_vec();
    shuffled_base_sessions.shuffle(rng);
    shuffled_donor_sessions.shuffle(rng);

    let mut candidates = Vec::new();
    for (base_session_idx, donor_session_idx) in shuffled_base_sessions
        .into_iter()
        .zip(shuffled_donor_sessions.into_iter())
    {
        let structural_distance = session_pairing_distance(
            current_path_state,
            base_session_idx,
            &donor.state,
            donor_session_idx,
        )?;
        if structural_distance < min_distance {
            continue;
        }
        candidates.push(AlignedSessionPair {
            base_session_idx,
            donor_session_idx,
            structural_distance,
        });
    }
    Ok(candidates)
}

fn build_random_macro_mutation_candidates(
    current_path_state: &RuntimeState,
    run_context: &SearchRunContext,
    candidate_count: usize,
    swaps_per_candidate: usize,
    rng: &mut ChaCha12Rng,
) -> Result<Vec<RandomMacroMutationCandidate>, SolverError> {
    if candidate_count == 0 || swaps_per_candidate == 0 || run_context.allowed_sessions.is_empty() {
        return Ok(Vec::new());
    }

    let candidate_sampler = CandidateSampler;
    let mut candidates = Vec::new();
    for _ in 0..candidate_count {
        let mut child = current_path_state.clone();
        let mut applied_swaps = 0u32;
        let max_attempts = swaps_per_candidate.saturating_mul(4).max(1);

        for _ in 0..max_attempts {
            if applied_swaps as usize >= swaps_per_candidate {
                break;
            }
            let session_idx = run_context.allowed_sessions
                [rng.random_range(0..run_context.allowed_sessions.len())];
            let mut noop_tabu = TabuSwapSamplingDelta::default();
            let preview = candidate_sampler.sample_random_swap_preview_in_session(
                &child,
                session_idx,
                SwapSamplingOptions::default(),
                &mut noop_tabu,
                rng,
            );
            let Some(preview) = preview else {
                continue;
            };
            apply_swap_runtime_preview(&mut child, &preview)?;
            applied_swaps += 1;
        }

        if applied_swaps > 0 {
            candidates.push(RandomMacroMutationCandidate {
                raw_child: child,
                swaps_applied: applied_swaps,
            });
        }
    }

    Ok(candidates)
}

fn remove_aligned_pair(remaining_pairs: &mut Vec<AlignedSessionPair>, chosen: &AlignedSessionPair) {
    if let Some(position) = remaining_pairs.iter().position(|pair| pair == chosen) {
        remaining_pairs.remove(position);
    }
}

fn remove_session_idx(remaining_sessions: &mut Vec<usize>, chosen: usize) {
    if let Some(position) = remaining_sessions.iter().position(|idx| *idx == chosen) {
        remaining_sessions.remove(position);
    }
}

fn validate_alignment_dimensions(
    base_state: &RuntimeState,
    donor_state: &RuntimeState,
) -> Result<(), SolverError> {
    if base_state.compiled.num_people != donor_state.compiled.num_people
        || base_state.compiled.num_groups != donor_state.compiled.num_groups
        || base_state.compiled.num_sessions != donor_state.compiled.num_sessions
    {
        return Err(SolverError::ValidationError(
            "solver3 session alignment requires matching compiled dimensions".into(),
        ));
    }
    Ok(())
}

fn build_distance_matrix(
    base_signatures: &[Vec<usize>],
    donor_signatures: &[Vec<usize>],
) -> Vec<Vec<u32>> {
    base_signatures
        .iter()
        .map(|base_signature| {
            donor_signatures
                .iter()
                .map(|donor_signature| {
                    sorted_symmetric_difference_count(base_signature, donor_signature)
                })
                .collect()
        })
        .collect()
}

fn sorted_symmetric_difference_count(left: &[usize], right: &[usize]) -> u32 {
    let mut left_idx = 0;
    let mut right_idx = 0;
    let mut count = 0u32;

    while left_idx < left.len() && right_idx < right.len() {
        match left[left_idx].cmp(&right[right_idx]) {
            Ordering::Less => {
                count += 1;
                left_idx += 1;
            }
            Ordering::Greater => {
                count += 1;
                right_idx += 1;
            }
            Ordering::Equal => {
                left_idx += 1;
                right_idx += 1;
            }
        }
    }

    count + (left.len() - left_idx) as u32 + (right.len() - right_idx) as u32
}

fn solve_minimum_cost_assignment(distance_matrix: &[Vec<u32>]) -> Result<Vec<usize>, SolverError> {
    let size = distance_matrix.len();
    if size == 0 {
        return Ok(Vec::new());
    }
    if distance_matrix.iter().any(|row| row.len() != size) {
        return Err(SolverError::ValidationError(
            "solver3 session alignment distance matrix must be square".into(),
        ));
    }
    if size > MAX_EXACT_ALIGNMENT_SESSIONS {
        return Err(SolverError::ValidationError(format!(
            "solver3 exact session alignment currently supports at most {MAX_EXACT_ALIGNMENT_SESSIONS} sessions"
        )));
    }

    let memo_len = 1usize << size;
    let mut memo = vec![None; memo_len];
    let mut choice = vec![None; memo_len];

    fn solve(
        mask: usize,
        size: usize,
        distance_matrix: &[Vec<u32>],
        memo: &mut [Option<u32>],
        choice: &mut [Option<usize>],
    ) -> u32 {
        if let Some(cached) = memo[mask] {
            return cached;
        }
        let row = mask.count_ones() as usize;
        if row == size {
            memo[mask] = Some(0);
            return 0;
        }

        let mut best_cost = u32::MAX;
        let mut best_col = None;
        for col in 0..size {
            if mask & (1usize << col) != 0 {
                continue;
            }
            let next_mask = mask | (1usize << col);
            let tail_cost = solve(next_mask, size, distance_matrix, memo, choice);
            let cost = distance_matrix[row][col].saturating_add(tail_cost);
            if cost < best_cost {
                best_cost = cost;
                best_col = Some(col);
            }
        }

        memo[mask] = Some(best_cost);
        choice[mask] = best_col;
        best_cost
    }

    solve(0, size, distance_matrix, &mut memo, &mut choice);

    let mut assignment = Vec::with_capacity(size);
    let mut mask = 0usize;
    for _row in 0..size {
        let col = choice[mask].ok_or_else(|| {
            SolverError::ValidationError(
                "solver3 session alignment assignment reconstruction failed".into(),
            )
        })?;
        assignment.push(col);
        mask |= 1usize << col;
    }

    Ok(assignment)
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
    absorb_search_metrics_only(aggregate, local);

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

fn absorb_search_metrics_only(aggregate: &mut SearchProgressState, local: &SearchProgressState) {
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

    use crate::default_solver_configuration_for;
    use crate::models::{
        ApiInput, Constraint, Group, Objective, Person, ProblemDefinition, RepeatEncounterParams,
        Solver3PathRelinkingOperatorVariant, SolverKind,
    };
    use crate::solver3::runtime_state::RuntimeState;
    use rand::SeedableRng;
    use rand_chacha::ChaCha12Rng;

    use super::{
        align_sessions_by_pairing_distance, build_balanced_inheritance_child,
        build_balanced_inheritance_plan, build_random_donor_session_candidates,
        build_random_macro_mutation_candidates, build_session_pairing_signature,
        compare_path_guides, remove_aligned_pair, remove_session_idx, select_path_guide,
        session_pairing_distance, sorted_symmetric_difference_count, transplant_aligned_session,
        AdaptiveRawChildRetentionConfig, AdaptiveRawChildRetentionState, AlignedSessionPair,
        BalancedInheritanceParentRole, EliteArchive, PathGuideCandidate, SearchRunContext,
        SessionAlignedPathRelinkingConfig, MAX_EXACT_ALIGNMENT_SESSIONS,
    };

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

    fn state_from_schedule(sessions: Vec<Vec<Vec<&str>>>) -> RuntimeState {
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
            constraints: vec![Constraint::RepeatEncounter(RepeatEncounterParams {
                max_allowed_encounters: 1,
                penalty_function: "linear".into(),
                penalty_weight: 100.0,
            })],
            solver: default_solver_configuration_for(SolverKind::Solver3),
        };
        RuntimeState::from_input(&input).expect("schedule should build runtime state")
    }

    fn config() -> SessionAlignedPathRelinkingConfig {
        SessionAlignedPathRelinkingConfig {
            operator_variant: Solver3PathRelinkingOperatorVariant::SessionAlignedPathRelinking,
            archive_size: 4,
            recombination_no_improvement_window: 20,
            recombination_cooldown_window: 10,
            max_path_events_per_run: Some(2),
            max_session_imports_per_event: 3,
            path_step_no_improvement_limit: 2,
            min_aligned_session_distance_for_relinking: 1,
            adaptive_raw_child_retention: AdaptiveRawChildRetentionConfig {
                keep_ratio: 0.5,
                warmup_samples: 2,
                history_limit: 8,
            },
            swap_local_optimum_certification_enabled: false,
            child_polish_iterations_per_stagnation_window: 16,
            child_polish_no_improvement_iterations_per_stagnation_window: 8,
            child_polish_max_stagnation_windows: 2,
        }
    }

    #[test]
    fn session_pairing_signature_is_invariant_to_group_order() {
        let left = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
        ]);
        let right = state_from_schedule(vec![
            vec![vec!["p2", "p3"], vec!["p0", "p1"]],
            vec![vec!["p1", "p3"], vec!["p0", "p2"]],
        ]);

        assert_eq!(
            build_session_pairing_signature(&left, 0),
            build_session_pairing_signature(&right, 0)
        );
        assert_eq!(
            build_session_pairing_signature(&left, 1),
            build_session_pairing_signature(&right, 1)
        );
    }

    #[test]
    fn identical_sessions_have_zero_pairing_distance() {
        let base = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
        ]);
        let donor = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
        ]);

        assert_eq!(session_pairing_distance(&base, 0, &donor, 0).unwrap(), 0);
        assert_eq!(session_pairing_distance(&base, 1, &donor, 1).unwrap(), 0);
    }

    #[test]
    fn session_alignment_finds_the_minimum_cost_matching() {
        let base = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
        ]);
        let donor = state_from_schedule(vec![
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
        ]);

        let alignment = align_sessions_by_pairing_distance(&base, &donor).unwrap();
        assert_eq!(alignment.total_alignment_cost, 0);
        assert_eq!(
            alignment.matched_session_pairs,
            vec![
                AlignedSessionPair {
                    base_session_idx: 0,
                    donor_session_idx: 1,
                    structural_distance: 0,
                },
                AlignedSessionPair {
                    base_session_idx: 1,
                    donor_session_idx: 2,
                    structural_distance: 0,
                },
                AlignedSessionPair {
                    base_session_idx: 2,
                    donor_session_idx: 0,
                    structural_distance: 0,
                },
            ]
        );
    }

    #[test]
    fn differing_session_pairs_can_be_ranked_by_structural_distance() {
        let base = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
        ]);
        let donor = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
        ]);

        let alignment = align_sessions_by_pairing_distance(&base, &donor).unwrap();
        let mut differing = alignment.differing_pairs();
        differing.sort_by(|left, right| {
            right
                .structural_distance
                .cmp(&left.structural_distance)
                .then_with(|| left.base_session_idx.cmp(&right.base_session_idx))
        });

        assert!(!differing.is_empty());
        assert!(differing.iter().all(|pair| pair.structural_distance > 0));
        for window in differing.windows(2) {
            assert!(window[0].structural_distance >= window[1].structural_distance);
        }
    }

    #[test]
    fn balanced_inheritance_plan_preserves_agreement_core_and_even_split() {
        let base = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
        ]);
        let donor = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
        ]);

        let alignment = align_sessions_by_pairing_distance(&base, &donor).unwrap();
        let plan = build_balanced_inheritance_plan(&alignment, 10, 20, 0.5);

        assert_eq!(plan.differing_session_count, 2);
        assert_eq!(plan.parent_a_session_count, 1);
        assert_eq!(plan.parent_b_session_count, 1);
        for pair in &alignment.matched_session_pairs {
            if pair.structural_distance == 0 {
                let choice = plan
                    .session_choices
                    .iter()
                    .find(|choice| choice.target_session_idx == pair.base_session_idx)
                    .unwrap();
                assert_eq!(choice.source_parent, BalancedInheritanceParentRole::ParentA);
            }
        }
    }

    #[test]
    fn balanced_inheritance_plan_handles_odd_differing_session_counts_explicitly() {
        let base = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
        ]);
        let donor = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
        ]);

        let alignment = align_sessions_by_pairing_distance(&base, &donor).unwrap();
        let plan = build_balanced_inheritance_plan(&alignment, 10, 20, 0.5);

        assert_eq!(plan.differing_session_count, 3);
        assert_eq!(plan.parent_a_session_count + plan.parent_b_session_count, 3);
        assert_eq!(
            plan.parent_a_session_count
                .abs_diff(plan.parent_b_session_count),
            1
        );
        if plan.parent_a_receives_extra_session {
            assert_eq!(plan.parent_a_session_count, 2);
        } else {
            assert_eq!(plan.parent_b_session_count, 2);
        }
    }

    #[test]
    fn balanced_inheritance_child_uses_exact_parent_split_on_differing_sessions() {
        let base = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
        ]);
        let donor = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
        ]);

        let alignment = align_sessions_by_pairing_distance(&base, &donor).unwrap();
        let plan = build_balanced_inheritance_plan(&alignment, 10, 20, 0.5);
        let child = build_balanced_inheritance_child(&base, &donor, &plan).unwrap();

        for choice in plan
            .session_choices
            .iter()
            .filter(|choice| choice.structural_distance > 0)
        {
            let child_slot = child.group_slot(choice.target_session_idx, 0);
            match choice.source_parent {
                BalancedInheritanceParentRole::ParentA => assert_eq!(
                    child.group_members[child_slot],
                    base.group_members[base.group_slot(choice.source_session_idx, 0)]
                ),
                BalancedInheritanceParentRole::ParentB => assert_eq!(
                    child.group_members[child_slot],
                    donor.group_members[donor.group_slot(choice.source_session_idx, 0)]
                ),
            }
        }
    }

    #[test]
    fn balanced_inheritance_child_does_not_collapse_into_caller_order_bias() {
        let base = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
        ]);
        let donor = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
        ]);

        let alignment_ab = align_sessions_by_pairing_distance(&base, &donor).unwrap();
        let plan_ab = build_balanced_inheritance_plan(&alignment_ab, 10, 20, 0.5);
        let child_ab = build_balanced_inheritance_child(&base, &donor, &plan_ab).unwrap();

        let alignment_ba = align_sessions_by_pairing_distance(&donor, &base).unwrap();
        let plan_ba = build_balanced_inheritance_plan(&alignment_ba, 20, 10, 0.5);
        let child_ba = build_balanced_inheritance_child(&donor, &base, &plan_ba).unwrap();

        assert!(plan_ab.parent_a_session_count > 0);
        assert!(plan_ab.parent_b_session_count > 0);
        assert!(plan_ba.parent_a_session_count > 0);
        assert!(plan_ba.parent_b_session_count > 0);
        assert_ne!(child_ab.to_api_schedule(), base.to_api_schedule());
        assert_ne!(child_ba.to_api_schedule(), donor.to_api_schedule());
    }

    #[test]
    fn select_path_guide_prefers_high_alignment_cost_competitive_donor() {
        let base = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
        ]);
        let better_score_less_diverse = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
        ]);
        let diverse_competitive = state_from_schedule(vec![
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
        ]);
        let mut archive = EliteArchive::new(crate::solver3::search::archive::EliteArchiveConfig {
            capacity: 4,
            near_duplicate_session_threshold: 0,
        });
        archive.consider_state(better_score_less_diverse);
        archive.consider_state(diverse_competitive.clone());

        let guide = select_path_guide(&base, &archive, config())
            .unwrap()
            .expect("expected a viable path guide");
        assert_eq!(guide.donor_archive_idx, 1);
        assert!(guide.alignment.total_alignment_cost > 0);
        assert!(!guide.differing_pairs.is_empty());
    }

    #[test]
    fn transplant_aligned_session_can_import_from_different_donor_session_index() {
        let base = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
        ]);
        let donor = state_from_schedule(vec![
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
        ]);
        let donor = crate::solver3::search::archive::ArchivedElite::from_state(donor.clone());

        let child = transplant_aligned_session(
            &base,
            &donor,
            &AlignedSessionPair {
                base_session_idx: 0,
                donor_session_idx: 1,
                structural_distance: 2,
            },
        )
        .expect("aligned transplant should succeed");

        assert_eq!(
            child.group_members[child.group_slot(0, 0)],
            donor.state.group_members[donor.state.group_slot(1, 0)]
        );
        assert_eq!(
            child.group_members[child.group_slot(1, 0)],
            base.group_members[base.group_slot(1, 0)]
        );
    }

    #[test]
    fn remove_aligned_pair_only_removes_the_selected_step() {
        let mut pairs = vec![
            AlignedSessionPair {
                base_session_idx: 0,
                donor_session_idx: 1,
                structural_distance: 4,
            },
            AlignedSessionPair {
                base_session_idx: 1,
                donor_session_idx: 0,
                structural_distance: 2,
            },
        ];
        let chosen = pairs[0].clone();
        remove_aligned_pair(&mut pairs, &chosen);
        assert_eq!(pairs.len(), 1);
        assert_eq!(pairs[0].base_session_idx, 1);
    }

    #[test]
    fn random_donor_session_candidates_use_unique_base_and_donor_sessions() {
        let base = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
        ]);
        let donor_state = state_from_schedule(vec![
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
        ]);
        let donor = crate::solver3::search::archive::ArchivedElite::from_state(donor_state);
        let mut rng = ChaCha12Rng::seed_from_u64(7);

        let candidates = build_random_donor_session_candidates(
            &base,
            &donor,
            &[0, 1, 2],
            &[0, 1, 2],
            0,
            &mut rng,
        )
        .expect("random donor-session candidates should build");

        assert_eq!(candidates.len(), 3);
        let mut base_sessions = candidates
            .iter()
            .map(|candidate| candidate.base_session_idx)
            .collect::<Vec<_>>();
        base_sessions.sort_unstable();
        base_sessions.dedup();
        assert_eq!(base_sessions, vec![0, 1, 2]);

        let mut donor_sessions = candidates
            .iter()
            .map(|candidate| candidate.donor_session_idx)
            .collect::<Vec<_>>();
        donor_sessions.sort_unstable();
        donor_sessions.dedup();
        assert_eq!(donor_sessions, vec![0, 1, 2]);
    }

    #[test]
    fn remove_session_idx_only_removes_the_selected_session() {
        let mut sessions = vec![0, 1, 2];
        remove_session_idx(&mut sessions, 1);
        assert_eq!(sessions, vec![0, 2]);
    }

    #[test]
    fn random_macro_mutation_candidates_apply_random_swaps() {
        let state = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
        ]);
        let run_context = SearchRunContext {
            effective_seed: 7,
            move_policy: crate::models::MovePolicy::default(),
            search_driver_mode: crate::models::Solver3SearchDriverMode::SessionAlignedPathRelinking,
            local_improver_mode: crate::models::Solver3LocalImproverMode::RecordToRecord,
            max_iterations: 100,
            no_improvement_limit: None,
            time_limit_seconds: None,
            stop_on_optimal_score: false,
            allowed_sessions: vec![0, 1, 2],
            correctness_lane_enabled: false,
            correctness_sample_every_accepted_moves: 100,
            repeat_guided_swaps_enabled: false,
            repeat_guided_swap_probability: 0.0,
            repeat_guided_swap_candidate_preview_budget: 0,
            sgp_week_pair_tabu: None,
            steady_state_memetic: None,
            donor_session_transplant: None,
            session_aligned_path_relinking: Some(config()),
            multi_root_balanced_session_inheritance: None,
        };
        let mut rng = ChaCha12Rng::seed_from_u64(11);

        let candidates =
            build_random_macro_mutation_candidates(&state, &run_context, 3, 2, &mut rng)
                .expect("random macro mutation candidates should build");

        assert_eq!(candidates.len(), 3);
        assert!(candidates
            .iter()
            .all(|candidate| candidate.swaps_applied >= 1 && candidate.swaps_applied <= 2));
    }

    #[test]
    fn adaptive_raw_child_retention_warms_up_then_filters() {
        let mut retention = AdaptiveRawChildRetentionState::new(AdaptiveRawChildRetentionConfig {
            keep_ratio: 0.5,
            warmup_samples: 2,
            history_limit: 4,
        });

        assert!(retention.evaluate(10.0).retained_for_polish);
        assert!(retention.evaluate(5.0).retained_for_polish);
        assert!(!retention.evaluate(9.0).retained_for_polish);
        assert!(retention.evaluate(4.0).retained_for_polish);
    }

    #[test]
    fn compare_path_guides_prefers_more_structural_disagreement_then_better_score() {
        let left = PathGuideCandidate {
            donor_archive_idx: 0,
            alignment: super::SessionAlignment {
                matched_session_pairs: Vec::new(),
                total_alignment_cost: 6,
            },
            differing_pairs: vec![AlignedSessionPair {
                base_session_idx: 0,
                donor_session_idx: 0,
                structural_distance: 6,
            }],
            donor_score: 10.0,
        };
        let right = PathGuideCandidate {
            donor_archive_idx: 1,
            alignment: super::SessionAlignment {
                matched_session_pairs: Vec::new(),
                total_alignment_cost: 4,
            },
            differing_pairs: vec![AlignedSessionPair {
                base_session_idx: 0,
                donor_session_idx: 0,
                structural_distance: 4,
            }],
            donor_score: 8.0,
        };
        assert_eq!(
            compare_path_guides(&left, &right),
            std::cmp::Ordering::Greater
        );
    }

    #[test]
    fn sorted_symmetric_difference_counts_only_disagreement() {
        assert_eq!(sorted_symmetric_difference_count(&[1, 2, 3], &[1, 2, 3]), 0);
        assert_eq!(sorted_symmetric_difference_count(&[1, 2, 3], &[1, 4, 5]), 4);
    }

    #[test]
    fn exact_alignment_session_limit_stays_small_and_explicit() {
        assert!(MAX_EXACT_ALIGNMENT_SESSIONS >= 3);
    }
}
