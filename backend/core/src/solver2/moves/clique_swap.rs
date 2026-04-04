use std::collections::HashSet;
use std::fmt;

use crate::models::{AttributeBalanceMode, PairMeetingMode};
use crate::solver_support::SolverError;

use super::super::affected_region::AffectedRegion;
use super::super::compiled_problem::{
    CompiledAttributeBalanceConstraint, CompiledPairMeetingConstraint, CompiledProblem,
};
use super::super::move_types::{CandidateMove, MovePreview};
use super::super::scoring::{recompute_full_score, FullScoreSnapshot};
use super::super::validation::invariants::validate_state_invariants;
use super::super::{RuntimeSolutionState, SolutionState};

/// Typed clique-swap move for `solver2`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CliqueSwapMove {
    pub session_idx: usize,
    pub clique_idx: usize,
    pub source_group_idx: usize,
    pub target_group_idx: usize,
    pub target_person_indices: Vec<usize>,
}

impl CliqueSwapMove {
    pub fn new(
        session_idx: usize,
        clique_idx: usize,
        source_group_idx: usize,
        target_group_idx: usize,
        target_person_indices: Vec<usize>,
    ) -> Self {
        Self {
            session_idx,
            clique_idx,
            source_group_idx,
            target_group_idx,
            target_person_indices,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CliqueSwapFeasibility {
    Feasible,
    SameGroupNoop,
    InactiveClique {
        clique_idx: usize,
    },
    CliqueNotInSourceGroup {
        clique_idx: usize,
        source_group_idx: usize,
    },
    ActiveCliqueMemberImmovable {
        person_idx: usize,
        required_group_idx: usize,
    },
    TargetCountMismatch {
        expected: usize,
        actual: usize,
    },
    DuplicateTargetPerson {
        person_idx: usize,
    },
    TargetPersonIsCliqueMember {
        person_idx: usize,
    },
    TargetPersonNotParticipating {
        person_idx: usize,
    },
    TargetPersonWrongGroup {
        person_idx: usize,
        expected_group_idx: usize,
    },
    TargetPersonMissingLocation {
        person_idx: usize,
    },
    TargetPersonInAnotherClique {
        person_idx: usize,
        clique_idx: usize,
    },
    TargetPersonImmovable {
        person_idx: usize,
        required_group_idx: usize,
    },
}

impl fmt::Display for CliqueSwapFeasibility {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Feasible => f.write_str("feasible"),
            Self::SameGroupNoop => f.write_str("same-group no-op"),
            Self::InactiveClique { clique_idx } => {
                write!(f, "clique {clique_idx} is not active in this session")
            }
            Self::CliqueNotInSourceGroup {
                clique_idx,
                source_group_idx,
            } => write!(
                f,
                "clique {clique_idx} is not fully active in source group {source_group_idx}"
            ),
            Self::ActiveCliqueMemberImmovable {
                person_idx,
                required_group_idx,
            } => write!(
                f,
                "clique member {person_idx} is immovable and must stay in group {required_group_idx}"
            ),
            Self::TargetCountMismatch { expected, actual } => write!(
                f,
                "clique swap requires {expected} target people but received {actual}"
            ),
            Self::DuplicateTargetPerson { person_idx } => {
                write!(f, "target person {person_idx} is listed multiple times")
            }
            Self::TargetPersonIsCliqueMember { person_idx } => write!(
                f,
                "target person {person_idx} is already part of the source clique"
            ),
            Self::TargetPersonNotParticipating { person_idx } => write!(
                f,
                "target person {person_idx} is not participating in this session"
            ),
            Self::TargetPersonWrongGroup {
                person_idx,
                expected_group_idx,
            } => write!(
                f,
                "target person {person_idx} is not in target group {expected_group_idx}"
            ),
            Self::TargetPersonMissingLocation { person_idx } => write!(
                f,
                "target person {person_idx} is missing a location in this session"
            ),
            Self::TargetPersonInAnotherClique {
                person_idx,
                clique_idx,
            } => write!(
                f,
                "target person {person_idx} is part of active clique {clique_idx} in this session"
            ),
            Self::TargetPersonImmovable {
                person_idx,
                required_group_idx,
            } => write!(
                f,
                "target person {person_idx} is immovable and must stay in group {required_group_idx}"
            ),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CliqueSwapAnalysis {
    pub clique_swap: CliqueSwapMove,
    pub affected_region: AffectedRegion,
    pub feasibility: CliqueSwapFeasibility,
    pub active_members: Vec<usize>,
    pub ordered_target_people: Vec<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ContactCountUpdate {
    pub left_person_idx: usize,
    pub right_person_idx: usize,
    pub new_count: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct IndexedI32Update {
    pub index: usize,
    pub new_value: i32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct IndexedU32Update {
    pub index: usize,
    pub new_value: u32,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub(crate) struct CliqueSwapRuntimePatch {
    pub contact_updates: Vec<ContactCountUpdate>,
    pub forbidden_pair_updates: Vec<IndexedI32Update>,
    pub should_together_updates: Vec<IndexedI32Update>,
    pub pair_meeting_updates: Vec<IndexedU32Update>,
    pub unique_contacts_delta: i32,
    pub repetition_penalty_delta: i32,
    pub weighted_repetition_penalty_delta: f64,
    pub attribute_balance_penalty_delta: f64,
    pub weighted_constraint_penalty_delta: f64,
    pub constraint_penalty_delta: i32,
    pub total_score_delta: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CliqueSwapRuntimePreview {
    pub(crate) analysis: CliqueSwapAnalysis,
    pub(crate) patch: CliqueSwapRuntimePatch,
    pub delta_cost: f64,
}

pub fn analyze_clique_swap(
    state: &SolutionState,
    clique_swap: &CliqueSwapMove,
) -> Result<CliqueSwapAnalysis, SolverError> {
    let problem = &state.compiled_problem;
    if clique_swap.session_idx >= problem.num_sessions {
        return Err(SolverError::ValidationError(format!(
            "clique swap references invalid session {} (max: {})",
            clique_swap.session_idx,
            problem.num_sessions.saturating_sub(1)
        )));
    }
    if clique_swap.clique_idx >= problem.cliques.len() {
        return Err(SolverError::ValidationError(format!(
            "clique swap references invalid clique {} (max: {})",
            clique_swap.clique_idx,
            problem.cliques.len().saturating_sub(1)
        )));
    }
    if clique_swap.source_group_idx >= problem.num_groups
        || clique_swap.target_group_idx >= problem.num_groups
    {
        return Err(SolverError::ValidationError(format!(
            "clique swap references invalid group indices ({}, {}) (max: {})",
            clique_swap.source_group_idx,
            clique_swap.target_group_idx,
            problem.num_groups.saturating_sub(1)
        )));
    }
    for &person_idx in &clique_swap.target_person_indices {
        if person_idx >= problem.num_people {
            return Err(SolverError::ValidationError(format!(
                "clique swap references invalid target person index {} (max: {})",
                person_idx,
                problem.num_people.saturating_sub(1)
            )));
        }
    }

    let active_members = active_clique_members_in_source_group(state, clique_swap);
    let ordered_target_people = ordered_target_people_in_group(state, clique_swap);
    let touched_people = touched_people_for_clique_swap(state, clique_swap, &active_members);
    let affected_region = AffectedRegion::from_groups_and_people(
        problem,
        clique_swap.session_idx,
        &[clique_swap.source_group_idx, clique_swap.target_group_idx],
        &touched_people,
    );

    let feasibility = if clique_swap.source_group_idx == clique_swap.target_group_idx {
        CliqueSwapFeasibility::SameGroupNoop
    } else if !clique_is_active_in_session(problem, clique_swap.clique_idx, clique_swap.session_idx)
    {
        CliqueSwapFeasibility::InactiveClique {
            clique_idx: clique_swap.clique_idx,
        }
    } else if active_members.len() != participating_clique_members(problem, clique_swap).len()
        || active_members.is_empty()
    {
        CliqueSwapFeasibility::CliqueNotInSourceGroup {
            clique_idx: clique_swap.clique_idx,
            source_group_idx: clique_swap.source_group_idx,
        }
    } else if let Some((person_idx, required_group_idx)) =
        active_members.iter().find_map(|&member| {
            problem
                .immovable_lookup
                .get(&(member, clique_swap.session_idx))
                .map(|&group_idx| (member, group_idx))
        })
    {
        if required_group_idx != clique_swap.target_group_idx {
            CliqueSwapFeasibility::ActiveCliqueMemberImmovable {
                person_idx,
                required_group_idx,
            }
        } else {
            CliqueSwapFeasibility::Feasible
        }
    } else if active_members.len() != clique_swap.target_person_indices.len() {
        CliqueSwapFeasibility::TargetCountMismatch {
            expected: active_members.len(),
            actual: clique_swap.target_person_indices.len(),
        }
    } else {
        validate_target_people(state, clique_swap, &active_members)
    };

    Ok(CliqueSwapAnalysis {
        clique_swap: clique_swap.clone(),
        affected_region,
        feasibility,
        active_members,
        ordered_target_people,
    })
}

pub fn preview_clique_swap(
    state: &SolutionState,
    clique_swap: &CliqueSwapMove,
) -> Result<MovePreview, SolverError> {
    let analysis = analyze_clique_swap(state, clique_swap)?;
    let before_score = state.current_score.clone();
    let after_score = match analysis.feasibility {
        CliqueSwapFeasibility::Feasible => {
            let mut preview_state = state.clone();
            apply_clique_swap_unchecked(&mut preview_state, &analysis)?;
            recompute_full_score(&preview_state)?
        }
        CliqueSwapFeasibility::SameGroupNoop => before_score.clone(),
        ref infeasible => {
            return Err(SolverError::ValidationError(format!(
                "solver2 clique swap is not feasible: {infeasible}"
            )));
        }
    };

    Ok(MovePreview {
        candidate: CandidateMove::CliqueSwap(clique_swap.clone()),
        affected_region: analysis.affected_region,
        delta_cost: after_score.total_score - before_score.total_score,
        before_score,
        after_score,
    })
}

pub fn preview_clique_swap_runtime(
    state: &RuntimeSolutionState,
    clique_swap: &CliqueSwapMove,
) -> Result<MovePreview, SolverError> {
    let runtime_preview = preview_clique_swap_runtime_lightweight(state, clique_swap)?;
    let before_score = state.current_score.clone();
    let after_score = materialize_score_after_patch(
        state.compiled_problem(),
        &state.current_score,
        &runtime_preview.patch,
    );

    Ok(MovePreview {
        candidate: CandidateMove::CliqueSwap(clique_swap.clone()),
        affected_region: runtime_preview.analysis.affected_region,
        delta_cost: runtime_preview.delta_cost,
        before_score,
        after_score,
    })
}

pub fn preview_clique_swap_runtime_lightweight(
    state: &RuntimeSolutionState,
    clique_swap: &CliqueSwapMove,
) -> Result<CliqueSwapRuntimePreview, SolverError> {
    let analysis = analyze_clique_swap(state.as_oracle_state(), clique_swap)?;
    let patch = match analysis.feasibility {
        CliqueSwapFeasibility::Feasible => {
            build_runtime_clique_swap_patch(state.as_oracle_state(), &analysis)?
        }
        CliqueSwapFeasibility::SameGroupNoop => CliqueSwapRuntimePatch::default(),
        ref infeasible => {
            return Err(SolverError::ValidationError(format!(
                "solver2 clique swap is not feasible: {infeasible}"
            )));
        }
    };

    Ok(CliqueSwapRuntimePreview {
        delta_cost: patch.total_score_delta,
        analysis,
        patch,
    })
}

pub fn apply_clique_swap(
    state: &mut SolutionState,
    clique_swap: &CliqueSwapMove,
) -> Result<(), SolverError> {
    apply_clique_swap_with_score(state, clique_swap, None)
}

pub(crate) fn apply_clique_swap_with_score(
    state: &mut SolutionState,
    clique_swap: &CliqueSwapMove,
    score_after_apply: Option<&FullScoreSnapshot>,
) -> Result<(), SolverError> {
    let analysis = analyze_clique_swap(state, clique_swap)?;
    match analysis.feasibility {
        CliqueSwapFeasibility::Feasible => {
            apply_clique_swap_unchecked(state, &analysis)?;
            state.current_score = match score_after_apply {
                Some(score) => score.clone(),
                None => recompute_full_score(state)?,
            };
            debug_validate_applied_clique_swap(state);
            Ok(())
        }
        CliqueSwapFeasibility::SameGroupNoop => Ok(()),
        ref infeasible => Err(SolverError::ValidationError(format!(
            "solver2 clique swap is not feasible: {infeasible}"
        ))),
    }
}

pub fn apply_clique_swap_runtime_preview(
    state: &mut RuntimeSolutionState,
    preview: &CliqueSwapRuntimePreview,
) -> Result<(), SolverError> {
    match preview.analysis.feasibility {
        CliqueSwapFeasibility::Feasible => {
            let compiled_problem = state.compiled_problem_arc().clone();
            apply_clique_swap_unchecked(state.as_oracle_state_mut(), &preview.analysis)?;
            apply_runtime_clique_swap_patch_to_snapshot(
                compiled_problem.as_ref(),
                &mut state.current_score,
                &preview.patch,
            );
            debug_assert!(validate_state_invariants(state.as_oracle_state()).is_ok());
            Ok(())
        }
        CliqueSwapFeasibility::SameGroupNoop => Ok(()),
        ref infeasible => Err(SolverError::ValidationError(format!(
            "solver2 clique swap is not feasible: {infeasible}"
        ))),
    }
}

fn build_runtime_clique_swap_patch(
    state: &SolutionState,
    analysis: &CliqueSwapAnalysis,
) -> Result<CliqueSwapRuntimePatch, SolverError> {
    let problem = state.compiled_problem();
    let clique_swap = &analysis.clique_swap;
    let session_idx = clique_swap.session_idx;
    let mut patch = CliqueSwapRuntimePatch::default();

    let source_remaining = state.schedule[session_idx][clique_swap.source_group_idx]
        .iter()
        .copied()
        .filter(|person_idx| !analysis.active_members.contains(person_idx))
        .collect::<Vec<_>>();
    let target_remaining = state.schedule[session_idx][clique_swap.target_group_idx]
        .iter()
        .copied()
        .filter(|person_idx| !analysis.ordered_target_people.contains(person_idx))
        .collect::<Vec<_>>();

    for &member in &analysis.active_members {
        for &other in &source_remaining {
            record_contact_update(&mut patch, &state.current_score, problem, member, other, -1)?;
        }
        for &other in &target_remaining {
            record_contact_update(&mut patch, &state.current_score, problem, member, other, 1)?;
        }
    }

    for &member in &analysis.ordered_target_people {
        for &other in &target_remaining {
            record_contact_update(&mut patch, &state.current_score, problem, member, other, -1)?;
        }
        for &other in &source_remaining {
            record_contact_update(&mut patch, &state.current_score, problem, member, other, 1)?;
        }
    }

    record_forbidden_pair_updates_for_clique_swap(state, analysis, &mut patch);
    record_should_together_updates_for_clique_swap(state, analysis, &mut patch);
    record_pair_meeting_updates_for_clique_swap(state, analysis, &mut patch);
    record_attribute_balance_delta_for_clique_swap(state, analysis, &mut patch);

    patch.total_score_delta = patch.weighted_repetition_penalty_delta
        + patch.attribute_balance_penalty_delta
        + patch.weighted_constraint_penalty_delta
        - (patch.unique_contacts_delta as f64 * problem.maximize_unique_contacts_weight);

    Ok(patch)
}

fn materialize_score_after_patch(
    problem: &CompiledProblem,
    before_score: &FullScoreSnapshot,
    patch: &CliqueSwapRuntimePatch,
) -> FullScoreSnapshot {
    let mut after_score = before_score.clone();
    apply_runtime_clique_swap_patch_to_snapshot(problem, &mut after_score, patch);
    after_score
}

fn apply_runtime_clique_swap_patch_to_snapshot(
    problem: &CompiledProblem,
    snapshot: &mut FullScoreSnapshot,
    patch: &CliqueSwapRuntimePatch,
) {
    for update in &patch.contact_updates {
        snapshot.contact_matrix[update.left_person_idx][update.right_person_idx] = update.new_count;
        snapshot.contact_matrix[update.right_person_idx][update.left_person_idx] = update.new_count;
    }
    for update in &patch.forbidden_pair_updates {
        snapshot.forbidden_pair_violations[update.index] = update.new_value;
    }
    for update in &patch.should_together_updates {
        snapshot.should_together_violations[update.index] = update.new_value;
    }
    for update in &patch.pair_meeting_updates {
        snapshot.pair_meeting_counts[update.index] = update.new_value;
    }

    snapshot.unique_contacts += patch.unique_contacts_delta;
    snapshot.repetition_penalty += patch.repetition_penalty_delta;
    snapshot.weighted_repetition_penalty += patch.weighted_repetition_penalty_delta;
    snapshot.attribute_balance_penalty += patch.attribute_balance_penalty_delta;
    snapshot.weighted_constraint_penalty += patch.weighted_constraint_penalty_delta;
    snapshot.constraint_penalty += patch.constraint_penalty_delta;
    snapshot.total_score = snapshot.weighted_repetition_penalty
        + snapshot.attribute_balance_penalty
        + snapshot.weighted_constraint_penalty
        - (snapshot.unique_contacts as f64 * problem.maximize_unique_contacts_weight)
        + snapshot.baseline_score;
}

fn clique_is_active_in_session(
    problem: &CompiledProblem,
    clique_idx: usize,
    session_idx: usize,
) -> bool {
    match &problem.cliques[clique_idx].sessions {
        Some(sessions) => sessions.contains(&session_idx),
        None => true,
    }
}

fn record_forbidden_pair_updates_for_clique_swap(
    state: &SolutionState,
    analysis: &CliqueSwapAnalysis,
    patch: &mut CliqueSwapRuntimePatch,
) {
    let problem = state.compiled_problem();
    for constraint_idx in affected_constraint_indices(
        moved_people(analysis),
        |problem, person_idx| &problem.forbidden_pairs_by_person[person_idx],
        problem,
    ) {
        let constraint = &problem.forbidden_pairs[constraint_idx];
        let new_violations = count_pair_constraint_violations_after_clique_swap(
            state,
            analysis,
            constraint.people,
            constraint.sessions.as_deref(),
            true,
        );
        let old_violations = state.current_score.forbidden_pair_violations[constraint_idx];
        if new_violations != old_violations {
            patch.forbidden_pair_updates.push(IndexedI32Update {
                index: constraint_idx,
                new_value: new_violations,
            });
            patch.weighted_constraint_penalty_delta +=
                (new_violations - old_violations) as f64 * constraint.penalty_weight;
            patch.constraint_penalty_delta += new_violations - old_violations;
        }
    }
}

fn record_should_together_updates_for_clique_swap(
    state: &SolutionState,
    analysis: &CliqueSwapAnalysis,
    patch: &mut CliqueSwapRuntimePatch,
) {
    let problem = state.compiled_problem();
    for constraint_idx in affected_constraint_indices(
        moved_people(analysis),
        |problem, person_idx| &problem.should_together_pairs_by_person[person_idx],
        problem,
    ) {
        let constraint = &problem.should_together_pairs[constraint_idx];
        let new_violations = count_pair_constraint_violations_after_clique_swap(
            state,
            analysis,
            constraint.people,
            constraint.sessions.as_deref(),
            false,
        );
        let old_violations = state.current_score.should_together_violations[constraint_idx];
        if new_violations != old_violations {
            patch.should_together_updates.push(IndexedI32Update {
                index: constraint_idx,
                new_value: new_violations,
            });
            patch.weighted_constraint_penalty_delta +=
                (new_violations - old_violations) as f64 * constraint.penalty_weight;
            patch.constraint_penalty_delta += new_violations - old_violations;
        }
    }
}

fn record_pair_meeting_updates_for_clique_swap(
    state: &SolutionState,
    analysis: &CliqueSwapAnalysis,
    patch: &mut CliqueSwapRuntimePatch,
) {
    let problem = state.compiled_problem();
    for constraint_idx in affected_constraint_indices(
        moved_people(analysis),
        |problem, person_idx| &problem.pair_meeting_constraints_by_person[person_idx],
        problem,
    ) {
        let constraint = &problem.pair_meeting_constraints[constraint_idx];
        let new_meetings = count_pair_meetings_after_clique_swap(state, analysis, constraint);
        let old_meetings = state.current_score.pair_meeting_counts[constraint_idx];
        if new_meetings != old_meetings {
            patch.pair_meeting_updates.push(IndexedU32Update {
                index: constraint_idx,
                new_value: new_meetings,
            });
        }
        let old_penalty = pair_meeting_penalty(constraint, old_meetings);
        let new_penalty = pair_meeting_penalty(constraint, new_meetings);
        patch.weighted_constraint_penalty_delta += new_penalty - old_penalty;
        patch.constraint_penalty_delta +=
            pair_meeting_violation_indicator(constraint, new_meetings)
                - pair_meeting_violation_indicator(constraint, old_meetings);
    }
}

fn record_attribute_balance_delta_for_clique_swap(
    state: &SolutionState,
    analysis: &CliqueSwapAnalysis,
    patch: &mut CliqueSwapRuntimePatch,
) {
    let problem = state.compiled_problem();
    let clique_swap = &analysis.clique_swap;
    for group_idx in [clique_swap.source_group_idx, clique_swap.target_group_idx] {
        let slot = problem.flat_group_session_slot(clique_swap.session_idx, group_idx);
        let before_members = &state.schedule[clique_swap.session_idx][group_idx];
        let after_members = clique_swap_group_members(state, analysis, group_idx);

        for &constraint_idx in &problem.attribute_balance_constraints_by_group_session[slot] {
            let constraint = &problem.attribute_balance_constraints[constraint_idx];
            let before_penalty =
                attribute_balance_penalty_for_members(problem, before_members, constraint);
            let after_penalty =
                attribute_balance_penalty_for_members(problem, &after_members, constraint);
            patch.attribute_balance_penalty_delta += after_penalty - before_penalty;
        }
    }
}

fn clique_swap_group_members(
    state: &SolutionState,
    analysis: &CliqueSwapAnalysis,
    group_idx: usize,
) -> Vec<usize> {
    let clique_swap = &analysis.clique_swap;
    if group_idx == clique_swap.source_group_idx {
        let source_member_set = analysis
            .active_members
            .iter()
            .copied()
            .collect::<HashSet<_>>();
        let mut members = state.schedule[clique_swap.session_idx][group_idx]
            .iter()
            .copied()
            .filter(|person_idx| !source_member_set.contains(person_idx))
            .collect::<Vec<_>>();
        members.extend_from_slice(&analysis.ordered_target_people);
        members
    } else {
        let target_member_set = analysis
            .ordered_target_people
            .iter()
            .copied()
            .collect::<HashSet<_>>();
        let mut members = state.schedule[clique_swap.session_idx][group_idx]
            .iter()
            .copied()
            .filter(|person_idx| !target_member_set.contains(person_idx))
            .collect::<Vec<_>>();
        members.extend_from_slice(&analysis.active_members);
        members
    }
}

fn attribute_balance_penalty_for_members(
    problem: &CompiledProblem,
    group_members: &[usize],
    constraint: &CompiledAttributeBalanceConstraint,
) -> f64 {
    let value_count = problem
        .attr_idx_to_val
        .get(constraint.attr_idx)
        .map_or(0, Vec::len);
    let mut counts = vec![0u32; value_count];
    for &person_idx in group_members {
        if let Some(value_idx) =
            problem.person_attribute_value_indices[person_idx][constraint.attr_idx]
        {
            counts[value_idx] += 1;
        }
    }

    constraint
        .desired_counts
        .iter()
        .map(|&(value_idx, desired_count)| {
            let actual = counts.get(value_idx).copied().unwrap_or(0);
            let diff = match constraint.mode {
                AttributeBalanceMode::Exact => (actual as i32 - desired_count as i32).abs(),
                AttributeBalanceMode::AtLeast => (desired_count as i32 - actual as i32).max(0),
            };
            (diff.pow(2) as f64) * constraint.penalty_weight
        })
        .sum()
}

fn moved_people(analysis: &CliqueSwapAnalysis) -> impl Iterator<Item = usize> + '_ {
    analysis
        .active_members
        .iter()
        .chain(analysis.ordered_target_people.iter())
        .copied()
}

fn affected_constraint_indices(
    moved_people: impl Iterator<Item = usize>,
    lookup: impl Fn(&CompiledProblem, usize) -> &[usize],
    problem: &CompiledProblem,
) -> Vec<usize> {
    let mut indices = moved_people
        .flat_map(|person_idx| lookup(problem, person_idx).iter().copied())
        .collect::<Vec<_>>();
    indices.sort_unstable();
    indices.dedup();
    indices
}

fn count_pair_constraint_violations_after_clique_swap(
    state: &SolutionState,
    analysis: &CliqueSwapAnalysis,
    people: (usize, usize),
    sessions: Option<&[usize]>,
    forbidden_when_together: bool,
) -> i32 {
    let problem = state.compiled_problem();
    let (left_person, right_person) = people;
    let mut violations = 0;

    match sessions {
        Some(active_sessions) => {
            for &session_idx in active_sessions {
                if pair_constraint_violated_in_session(
                    state,
                    analysis,
                    left_person,
                    right_person,
                    session_idx,
                    forbidden_when_together,
                ) {
                    violations += 1;
                }
            }
        }
        None => {
            for session_idx in 0..problem.num_sessions {
                if pair_constraint_violated_in_session(
                    state,
                    analysis,
                    left_person,
                    right_person,
                    session_idx,
                    forbidden_when_together,
                ) {
                    violations += 1;
                }
            }
        }
    }

    violations
}

fn pair_constraint_violated_in_session(
    state: &SolutionState,
    analysis: &CliqueSwapAnalysis,
    left_person: usize,
    right_person: usize,
    session_idx: usize,
    forbidden_when_together: bool,
) -> bool {
    let problem = state.compiled_problem();
    if !problem.person_participation[left_person][session_idx]
        || !problem.person_participation[right_person][session_idx]
    {
        return false;
    }
    let left_group = group_for_person_after_clique_swap(state, analysis, session_idx, left_person);
    let right_group =
        group_for_person_after_clique_swap(state, analysis, session_idx, right_person);
    if forbidden_when_together {
        left_group.is_some() && left_group == right_group
    } else {
        left_group != right_group
    }
}

fn count_pair_meetings_after_clique_swap(
    state: &SolutionState,
    analysis: &CliqueSwapAnalysis,
    constraint: &CompiledPairMeetingConstraint,
) -> u32 {
    let (left_person, right_person) = constraint.people;
    let mut meetings = 0u32;
    for &session_idx in &constraint.sessions {
        let problem = state.compiled_problem();
        if !problem.person_participation[left_person][session_idx]
            || !problem.person_participation[right_person][session_idx]
        {
            continue;
        }
        let left_group =
            group_for_person_after_clique_swap(state, analysis, session_idx, left_person);
        let right_group =
            group_for_person_after_clique_swap(state, analysis, session_idx, right_person);
        if left_group.is_some() && left_group == right_group {
            meetings += 1;
        }
    }
    meetings
}

fn group_for_person_after_clique_swap(
    state: &SolutionState,
    analysis: &CliqueSwapAnalysis,
    session_idx: usize,
    person_idx: usize,
) -> Option<usize> {
    if session_idx != analysis.clique_swap.session_idx {
        return state.locations[session_idx][person_idx].map(|location| location.0);
    }
    if analysis.active_members.contains(&person_idx) {
        return Some(analysis.clique_swap.target_group_idx);
    }
    if analysis.ordered_target_people.contains(&person_idx) {
        return Some(analysis.clique_swap.source_group_idx);
    }
    state.locations[session_idx][person_idx].map(|location| location.0)
}

fn pair_meeting_penalty(constraint: &CompiledPairMeetingConstraint, meetings: u32) -> f64 {
    let target = constraint.target_meetings as i32;
    let have = meetings as i32;
    let raw_penalty = match constraint.mode {
        PairMeetingMode::AtLeast => (target - have).max(0) as f64,
        PairMeetingMode::Exact => (have - target).abs() as f64,
        PairMeetingMode::AtMost => (have - target).max(0) as f64,
    };
    raw_penalty * constraint.penalty_weight
}

fn pair_meeting_violation_indicator(
    constraint: &CompiledPairMeetingConstraint,
    meetings: u32,
) -> i32 {
    let target = constraint.target_meetings as i32;
    let have = meetings as i32;
    let raw_violation = match constraint.mode {
        PairMeetingMode::AtLeast => (target - have).max(0),
        PairMeetingMode::Exact => (have - target).abs(),
        PairMeetingMode::AtMost => (have - target).max(0),
    };
    if raw_violation > 0 && constraint.penalty_weight > 0.0 {
        1
    } else {
        0
    }
}

fn record_contact_update(
    patch: &mut CliqueSwapRuntimePatch,
    current_score: &FullScoreSnapshot,
    problem: &CompiledProblem,
    left_person_idx: usize,
    right_person_idx: usize,
    delta: i32,
) -> Result<(), SolverError> {
    let current = current_score.contact_matrix[left_person_idx][right_person_idx];
    let updated = current as i32 + delta;
    if updated < 0 {
        return Err(SolverError::ValidationError(format!(
            "solver2 clique swap runtime preview would make contact count negative for ({}, {})",
            problem.display_person_idx(left_person_idx),
            problem.display_person_idx(right_person_idx)
        )));
    }
    let updated = updated as u32;

    if current == 0 && updated > 0 {
        patch.unique_contacts_delta += 1;
    } else if current > 0 && updated == 0 {
        patch.unique_contacts_delta -= 1;
    }

    if let Some(repeat) = &problem.repeat_encounter {
        let old_penalty = repeat
            .penalty_function
            .penalty_for_excess(current.saturating_sub(repeat.max_allowed_encounters));
        let new_penalty = repeat
            .penalty_function
            .penalty_for_excess(updated.saturating_sub(repeat.max_allowed_encounters));
        let delta_penalty = new_penalty - old_penalty;
        patch.repetition_penalty_delta += delta_penalty;
        patch.weighted_repetition_penalty_delta += delta_penalty as f64 * repeat.penalty_weight;
    }

    patch.contact_updates.push(ContactCountUpdate {
        left_person_idx,
        right_person_idx,
        new_count: updated,
    });
    Ok(())
}

fn debug_validate_applied_clique_swap(state: &SolutionState) {
    debug_assert!(validate_state_invariants(state).is_ok());
    #[cfg(debug_assertions)]
    {
        let recomputed_score =
            recompute_full_score(state).expect("clique swap recomputation should work");
        debug_assert_eq!(recomputed_score, state.current_score);
    }
}

fn participating_clique_members(
    problem: &CompiledProblem,
    clique_swap: &CliqueSwapMove,
) -> Vec<usize> {
    problem.cliques[clique_swap.clique_idx]
        .members
        .iter()
        .copied()
        .filter(|&member| problem.person_participation[member][clique_swap.session_idx])
        .collect()
}

fn active_clique_members_in_source_group(
    state: &SolutionState,
    clique_swap: &CliqueSwapMove,
) -> Vec<usize> {
    state.schedule[clique_swap.session_idx][clique_swap.source_group_idx]
        .iter()
        .copied()
        .filter(|&person_idx| {
            state.compiled_problem.person_to_clique_id[clique_swap.session_idx][person_idx]
                == Some(clique_swap.clique_idx)
        })
        .collect()
}

fn ordered_target_people_in_group(
    state: &SolutionState,
    clique_swap: &CliqueSwapMove,
) -> Vec<usize> {
    let selected = clique_swap
        .target_person_indices
        .iter()
        .copied()
        .collect::<HashSet<_>>();
    state.schedule[clique_swap.session_idx][clique_swap.target_group_idx]
        .iter()
        .copied()
        .filter(|person_idx| selected.contains(person_idx))
        .collect()
}

fn validate_target_people(
    state: &SolutionState,
    clique_swap: &CliqueSwapMove,
    active_members: &[usize],
) -> CliqueSwapFeasibility {
    let problem = &state.compiled_problem;
    let mut seen = HashSet::new();
    for &person_idx in &clique_swap.target_person_indices {
        if !seen.insert(person_idx) {
            return CliqueSwapFeasibility::DuplicateTargetPerson { person_idx };
        }
        if active_members.contains(&person_idx) {
            return CliqueSwapFeasibility::TargetPersonIsCliqueMember { person_idx };
        }
        if !problem.person_participation[person_idx][clique_swap.session_idx] {
            return CliqueSwapFeasibility::TargetPersonNotParticipating { person_idx };
        }
        let Some((actual_group_idx, _)) = state.locations[clique_swap.session_idx][person_idx]
        else {
            return CliqueSwapFeasibility::TargetPersonMissingLocation { person_idx };
        };
        if actual_group_idx != clique_swap.target_group_idx {
            return CliqueSwapFeasibility::TargetPersonWrongGroup {
                person_idx,
                expected_group_idx: clique_swap.target_group_idx,
            };
        }
        if let Some(clique_idx) = problem.person_to_clique_id[clique_swap.session_idx][person_idx] {
            return CliqueSwapFeasibility::TargetPersonInAnotherClique {
                person_idx,
                clique_idx,
            };
        }
        if let Some(&required_group_idx) = problem
            .immovable_lookup
            .get(&(person_idx, clique_swap.session_idx))
        {
            if required_group_idx != clique_swap.source_group_idx {
                return CliqueSwapFeasibility::TargetPersonImmovable {
                    person_idx,
                    required_group_idx,
                };
            }
        }
    }

    CliqueSwapFeasibility::Feasible
}

fn touched_people_for_clique_swap(
    state: &SolutionState,
    clique_swap: &CliqueSwapMove,
    active_members: &[usize],
) -> Vec<usize> {
    let mut touched = state.schedule[clique_swap.session_idx][clique_swap.source_group_idx].clone();
    touched
        .extend_from_slice(&state.schedule[clique_swap.session_idx][clique_swap.target_group_idx]);
    touched.extend_from_slice(active_members);
    touched.extend_from_slice(&clique_swap.target_person_indices);
    touched.sort_unstable();
    touched.dedup();
    touched
}

fn apply_clique_swap_unchecked(
    state: &mut SolutionState,
    analysis: &CliqueSwapAnalysis,
) -> Result<(), SolverError> {
    let clique_swap = &analysis.clique_swap;
    let session_idx = clique_swap.session_idx;
    let source_group_idx = clique_swap.source_group_idx;
    let target_group_idx = clique_swap.target_group_idx;

    let source_group = state.schedule[session_idx][source_group_idx].clone();
    let target_group = state.schedule[session_idx][target_group_idx].clone();
    let source_member_set = analysis
        .active_members
        .iter()
        .copied()
        .collect::<HashSet<_>>();
    let target_member_set = analysis
        .ordered_target_people
        .iter()
        .copied()
        .collect::<HashSet<_>>();

    let mut new_source_group = source_group
        .iter()
        .copied()
        .filter(|person_idx| !source_member_set.contains(person_idx))
        .collect::<Vec<_>>();
    new_source_group.extend_from_slice(&analysis.ordered_target_people);

    let mut new_target_group = target_group
        .iter()
        .copied()
        .filter(|person_idx| !target_member_set.contains(person_idx))
        .collect::<Vec<_>>();
    new_target_group.extend_from_slice(&analysis.active_members);

    if new_source_group.len()
        > state
            .compiled_problem
            .group_capacity(session_idx, source_group_idx)
        || new_target_group.len()
            > state
                .compiled_problem
                .group_capacity(session_idx, target_group_idx)
    {
        return Err(SolverError::ValidationError(format!(
            "clique swap would exceed group capacity in session {}",
            session_idx
        )));
    }

    state.schedule[session_idx][source_group_idx] = new_source_group;
    state.schedule[session_idx][target_group_idx] = new_target_group;

    rebuild_group_locations(state, session_idx, source_group_idx);
    rebuild_group_locations(state, session_idx, target_group_idx);

    Ok(())
}

fn rebuild_group_locations(state: &mut SolutionState, session_idx: usize, group_idx: usize) {
    for (position_idx, &member) in state.schedule[session_idx][group_idx].iter().enumerate() {
        state.locations[session_idx][member] = Some((group_idx, position_idx));
    }
}
