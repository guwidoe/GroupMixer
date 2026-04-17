use rand::SeedableRng;
use rand_chacha::ChaCha12Rng;

use crate::models::{
    BenchmarkEvent, BenchmarkObserver, MultiRootBalancedSessionInheritanceBenchmarkTelemetry,
    MultiRootBalancedSessionInheritanceEventTelemetry, ProgressCallback, SolverResult, StopReason,
};
use crate::solver_support::SolverError;

use super::super::super::runtime_state::RuntimeState;
use super::super::archive::{
    CrossRootParentChoice, CrossRootParentSelectionPolicy, EliteArchiveConfig, MultiRootElitePool,
    MultiRootElitePoolConfig, SearchRootId,
};
use super::super::context::{SearchProgressState, SearchRunContext};
use super::super::single_state::{build_solver_result, polish_state, LocalImproverBudget};
use super::alignment::{align_sessions_by_pairing_distance, SessionAlignment};
use super::certification::certify_swap_local_optimum;
use super::driver::build_random_macro_mutation_candidates;
use super::retention::AdaptiveRawChildRetentionState;
use super::telemetry::merge_local_improver_run;
use super::{get_current_time, get_elapsed_seconds, time_limit_exceeded};
use crate::solver3::search::archive;

const MULTI_ROOT_SEED_STRIDE: u64 = 0x9E37_79B9_7F4A_7C15;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum BalancedInheritanceParentRole {
    ParentA,
    ParentB,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct BalancedInheritanceSessionChoice {
    pub(super) target_session_idx: usize,
    pub(super) source_parent: BalancedInheritanceParentRole,
    pub(super) source_session_idx: usize,
    pub(super) aligned_partner_session_idx: usize,
    pub(super) structural_distance: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct BalancedInheritancePlan {
    pub(super) session_choices: Vec<BalancedInheritanceSessionChoice>,
    pub(super) differing_session_count: usize,
    pub(super) parent_a_session_count: usize,
    pub(super) parent_b_session_count: usize,
    pub(super) parent_a_receives_extra_session: bool,
}

#[derive(Debug, Clone)]
struct CanonicalCrossRootParentPair {
    parent_a_root_id: SearchRootId,
    parent_a: archive::ArchivedElite,
    parent_b_root_id: SearchRootId,
    parent_b: archive::ArchivedElite,
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

pub(super) fn build_balanced_inheritance_plan(
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

pub(super) fn build_balanced_inheritance_child(
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
