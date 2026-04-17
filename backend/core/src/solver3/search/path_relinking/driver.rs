use std::cmp::Ordering;

use rand::seq::SliceRandom;
use rand::{RngExt, SeedableRng};
use rand_chacha::ChaCha12Rng;

use crate::models::{
    BenchmarkEvent, BenchmarkObserver, ProgressCallback,
    SessionAlignedPathRelinkingBenchmarkTelemetry, SessionAlignedPathRelinkingEventTelemetry,
    SessionAlignedPathRelinkingStepTelemetry, SolverResult, StopReason,
};
use crate::solver_support::SolverError;

use super::super::archive::{EliteArchive, EliteArchiveConfig};
use super::super::candidate_sampling::{
    CandidateSampler, SwapSamplingOptions, TabuSwapSamplingDelta,
};
use super::super::context::{
    SearchProgressState, SearchRunContext, SessionAlignedPathRelinkingConfig,
};
use super::super::moves::apply_swap_runtime_preview;
use super::super::runtime_state::RuntimeState;
use super::super::single_state::{
    build_solver_result, polish_state, LocalImproverBudget, LocalImproverRunResult,
};
use super::alignment::{
    align_sessions_by_pairing_distance, session_pairing_distance, AlignedSessionPair,
    SessionAlignment,
};
use super::certification::certify_swap_local_optimum;
use super::retention::AdaptiveRawChildRetentionState;
use super::telemetry::{absorb_local_search_chunk, maybe_emit_progress};
use super::trigger::PathRelinkingTriggerState;
use super::{get_current_time, get_elapsed_seconds, time_limit_exceeded};

#[derive(Debug, Clone, PartialEq)]
pub(super) struct PathGuideCandidate {
    pub(super) donor_archive_idx: usize,
    pub(super) alignment: SessionAlignment,
    pub(super) differing_pairs: Vec<AlignedSessionPair>,
    pub(super) donor_score: f64,
}

#[derive(Debug, Clone)]
pub(super) struct RandomMacroMutationCandidate {
    pub(super) raw_child: RuntimeState,
    pub(super) swaps_applied: u32,
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

pub(super) fn select_path_guide(
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

pub(super) fn compare_path_guides(
    left: &PathGuideCandidate,
    right: &PathGuideCandidate,
) -> Ordering {
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

pub(super) fn transplant_aligned_session(
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

pub(super) fn build_random_donor_session_candidates(
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

pub(super) fn build_random_macro_mutation_candidates(
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

pub(super) fn remove_aligned_pair(
    remaining_pairs: &mut Vec<AlignedSessionPair>,
    chosen: &AlignedSessionPair,
) {
    if let Some(position) = remaining_pairs.iter().position(|pair| pair == chosen) {
        remaining_pairs.remove(position);
    }
}

pub(super) fn remove_session_idx(remaining_sessions: &mut Vec<usize>, chosen: usize) {
    if let Some(position) = remaining_sessions.iter().position(|idx| *idx == chosen) {
        remaining_sessions.remove(position);
    }
}
