use std::fmt;

use crate::models::{AttributeBalanceMode, PairMeetingMode};
use crate::solver3::compiled_problem::{
    CompiledAttributeBalanceConstraint, CompiledPairMeetingConstraint, RepeatPenaltyFunction,
};
use crate::solver3::runtime_state::RuntimeState;
use crate::solver3::scoring::recompute_oracle_score;
use crate::solver_support::SolverError;

use super::patch::{
    apply_runtime_patch, GroupMembersPatchOp, PairContactUpdate, PersonLocationUpdate, RuntimePatch,
};

/// Typed clique-swap move for `solver3`.
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
            Self::TargetPersonNotParticipating { person_idx } => {
                write!(f, "target person {person_idx} is not participating in this session")
            }
            Self::TargetPersonWrongGroup {
                person_idx,
                expected_group_idx,
            } => write!(
                f,
                "target person {person_idx} is not in target group {expected_group_idx}"
            ),
            Self::TargetPersonMissingLocation { person_idx } => {
                write!(f, "target person {person_idx} is missing a location in this session")
            }
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
    pub feasibility: CliqueSwapFeasibility,
    pub active_members: Vec<usize>,
    pub ordered_target_people: Vec<usize>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CliqueSwapRuntimePreview {
    pub analysis: CliqueSwapAnalysis,
    pub patch: RuntimePatch,
    pub delta_score: f64,
}

pub fn analyze_clique_swap(
    state: &RuntimeState,
    clique_swap: &CliqueSwapMove,
) -> Result<CliqueSwapAnalysis, SolverError> {
    let cp = &state.compiled;
    if clique_swap.session_idx >= cp.num_sessions {
        return Err(SolverError::ValidationError(format!(
            "clique swap references invalid session {} (max: {})",
            clique_swap.session_idx,
            cp.num_sessions.saturating_sub(1)
        )));
    }
    if clique_swap.clique_idx >= cp.cliques.len() {
        return Err(SolverError::ValidationError(format!(
            "clique swap references invalid clique {} (max: {})",
            clique_swap.clique_idx,
            cp.cliques.len().saturating_sub(1)
        )));
    }
    if clique_swap.source_group_idx >= cp.num_groups
        || clique_swap.target_group_idx >= cp.num_groups
    {
        return Err(SolverError::ValidationError(format!(
            "clique swap references invalid group indices ({}, {}) (max: {})",
            clique_swap.source_group_idx,
            clique_swap.target_group_idx,
            cp.num_groups.saturating_sub(1)
        )));
    }
    for &person_idx in &clique_swap.target_person_indices {
        if person_idx >= cp.num_people {
            return Err(SolverError::ValidationError(format!(
                "clique swap references invalid target person index {} (max: {})",
                person_idx,
                cp.num_people.saturating_sub(1)
            )));
        }
    }

    let active_members = active_clique_members_in_source_group(state, clique_swap);
    let participating_member_count = participating_clique_member_count(cp, clique_swap);

    let feasibility = if clique_swap.source_group_idx == clique_swap.target_group_idx {
        CliqueSwapFeasibility::SameGroupNoop
    } else if !clique_is_active_in_session(cp, clique_swap.clique_idx, clique_swap.session_idx) {
        CliqueSwapFeasibility::InactiveClique {
            clique_idx: clique_swap.clique_idx,
        }
    } else if active_members.len() != participating_member_count || active_members.is_empty() {
        CliqueSwapFeasibility::CliqueNotInSourceGroup {
            clique_idx: clique_swap.clique_idx,
            source_group_idx: clique_swap.source_group_idx,
        }
    } else if let Some((person_idx, required_group_idx)) =
        active_members.iter().find_map(|&member| {
            cp.immovable_group(clique_swap.session_idx, member)
                .map(|group_idx| (member, group_idx))
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
        feasibility,
        active_members,
        ordered_target_people: clique_swap.target_person_indices.clone(),
    })
}

pub fn preview_clique_swap_runtime_lightweight(
    state: &RuntimeState,
    clique_swap: &CliqueSwapMove,
) -> Result<CliqueSwapRuntimePreview, SolverError> {
    let analysis = analyze_clique_swap(state, clique_swap)?;
    let patch = match analysis.feasibility {
        CliqueSwapFeasibility::Feasible => build_clique_swap_runtime_patch(state, &analysis)?,
        CliqueSwapFeasibility::SameGroupNoop => RuntimePatch::default(),
        ref infeasible => {
            return Err(SolverError::ValidationError(format!(
                "solver3 clique swap is not feasible: {infeasible}"
            )));
        }
    };

    Ok(CliqueSwapRuntimePreview {
        delta_score: patch.score_delta.total_score_delta,
        analysis,
        patch,
    })
}

pub fn preview_clique_swap_oracle_recompute(
    state: &RuntimeState,
    clique_swap: &CliqueSwapMove,
) -> Result<f64, SolverError> {
    let analysis = analyze_clique_swap(state, clique_swap)?;
    match analysis.feasibility {
        CliqueSwapFeasibility::SameGroupNoop => Ok(0.0),
        CliqueSwapFeasibility::Feasible => {
            let before = recompute_oracle_score(state)?.total_score;
            let mut after = state.clone();
            apply_clique_swap_direct_membership(&mut after, &analysis)?;
            after.rebuild_pair_contacts();
            let after_score = recompute_oracle_score(&after)?.total_score;
            Ok(after_score - before)
        }
        ref infeasible => Err(SolverError::ValidationError(format!(
            "solver3 clique swap is not feasible: {infeasible}"
        ))),
    }
}

pub fn apply_clique_swap_runtime_preview(
    state: &mut RuntimeState,
    preview: &CliqueSwapRuntimePreview,
) -> Result<(), SolverError> {
    match preview.analysis.feasibility {
        CliqueSwapFeasibility::Feasible => apply_runtime_patch(state, &preview.patch),
        CliqueSwapFeasibility::SameGroupNoop => Ok(()),
        ref infeasible => Err(SolverError::ValidationError(format!(
            "solver3 clique swap is not feasible: {infeasible}"
        ))),
    }
}

pub fn apply_clique_swap(
    state: &mut RuntimeState,
    clique_swap: &CliqueSwapMove,
) -> Result<(), SolverError> {
    let preview = preview_clique_swap_runtime_lightweight(state, clique_swap)?;
    apply_clique_swap_runtime_preview(state, &preview)
}

fn build_clique_swap_runtime_patch(
    state: &RuntimeState,
    analysis: &CliqueSwapAnalysis,
) -> Result<RuntimePatch, SolverError> {
    let cp = &state.compiled;
    let clique_swap = &analysis.clique_swap;
    let session_idx = clique_swap.session_idx;
    let source_group_idx = clique_swap.source_group_idx;
    let target_group_idx = clique_swap.target_group_idx;

    let source_slot = state.group_slot(session_idx, source_group_idx);
    let target_slot = state.group_slot(session_idx, target_group_idx);

    let source_remaining = state.group_members[source_slot]
        .iter()
        .copied()
        .filter(|person_idx| !analysis.active_members.contains(person_idx))
        .collect::<Vec<_>>();
    let target_remaining = state.group_members[target_slot]
        .iter()
        .copied()
        .filter(|person_idx| !analysis.ordered_target_people.contains(person_idx))
        .collect::<Vec<_>>();

    let mut source_after =
        Vec::with_capacity(source_remaining.len() + analysis.ordered_target_people.len());
    source_after.extend_from_slice(&source_remaining);
    source_after.extend_from_slice(&analysis.ordered_target_people);

    let mut target_after =
        Vec::with_capacity(target_remaining.len() + analysis.active_members.len());
    target_after.extend_from_slice(&target_remaining);
    target_after.extend_from_slice(&analysis.active_members);

    let mut patch = RuntimePatch {
        person_location_updates: Vec::with_capacity(
            analysis.active_members.len() + analysis.ordered_target_people.len(),
        ),
        group_member_ops: vec![
            GroupMembersPatchOp::Reset {
                session_idx,
                group_idx: source_group_idx,
                new_members: source_after,
            },
            GroupMembersPatchOp::Reset {
                session_idx,
                group_idx: target_group_idx,
                new_members: target_after,
            },
        ],
        pair_contact_updates: Vec::with_capacity(
            analysis.active_members.len() * (source_remaining.len() + target_remaining.len())
                + analysis.ordered_target_people.len()
                    * (source_remaining.len() + target_remaining.len()),
        ),
        ..RuntimePatch::default()
    };

    for &member in &analysis.active_members {
        patch.person_location_updates.push(PersonLocationUpdate {
            session_idx,
            person_idx: member,
            new_group_idx: Some(target_group_idx),
        });
    }

    for &person_idx in &analysis.ordered_target_people {
        patch.person_location_updates.push(PersonLocationUpdate {
            session_idx,
            person_idx,
            new_group_idx: Some(source_group_idx),
        });
    }

    for &member in &analysis.active_members {
        for &other in &source_remaining {
            let pair_idx = cp.pair_idx(member, other);
            record_pair_contact_delta(&mut patch, cp, state, pair_idx, -1)?;
        }
        for &other in &target_remaining {
            let pair_idx = cp.pair_idx(member, other);
            record_pair_contact_delta(&mut patch, cp, state, pair_idx, 1)?;
        }
    }

    for &member in &analysis.ordered_target_people {
        for &other in &target_remaining {
            let pair_idx = cp.pair_idx(member, other);
            record_pair_contact_delta(&mut patch, cp, state, pair_idx, -1)?;
        }
        for &other in &source_remaining {
            let pair_idx = cp.pair_idx(member, other);
            record_pair_contact_delta(&mut patch, cp, state, pair_idx, 1)?;
        }
    }

    if let Some(repeat) = cp.repeat_encounter.as_ref() {
        patch.score_delta.weighted_repetition_penalty_delta =
            patch.score_delta.repetition_penalty_raw_delta as f64 * repeat.penalty_weight;
    }

    let moved_people = moved_people(analysis);

    patch.score_delta.constraint_penalty_weighted_delta +=
        forbidden_pair_penalty_delta_for_clique_swap(state, analysis, &moved_people);
    patch.score_delta.constraint_penalty_weighted_delta +=
        should_together_penalty_delta_for_clique_swap(state, analysis, &moved_people);
    patch.score_delta.constraint_penalty_weighted_delta +=
        pair_meeting_penalty_delta_for_clique_swap(state, analysis, &moved_people);
    patch.score_delta.attribute_balance_penalty_delta +=
        attribute_balance_penalty_delta_for_clique_swap(state, analysis);

    patch.score_delta.total_score_delta = patch.score_delta.weighted_repetition_penalty_delta
        + patch.score_delta.attribute_balance_penalty_delta
        + patch.score_delta.constraint_penalty_weighted_delta
        - (patch.score_delta.unique_contacts_delta as f64 * cp.maximize_unique_contacts_weight);

    Ok(patch)
}

fn forbidden_pair_penalty_delta_for_clique_swap(
    state: &RuntimeState,
    analysis: &CliqueSwapAnalysis,
    moved_people: &[usize],
) -> f64 {
    let cp = &state.compiled;
    let session_idx = analysis.clique_swap.session_idx;
    let indices = merged_indices_for_people(moved_people, &cp.forbidden_pairs_by_person);

    let mut delta = 0.0;
    for idx in indices {
        let constraint = &cp.forbidden_pairs[idx];
        if !is_active_in_session(constraint.sessions.as_deref(), session_idx) {
            continue;
        }

        let (left, right) = constraint.people;
        if !cp.person_participation[left][session_idx]
            || !cp.person_participation[right][session_idx]
        {
            continue;
        }

        let before = same_group_in_session(state, session_idx, left, right);
        let after = same_group_after_clique_swap(state, analysis, session_idx, left, right);
        match (before, after) {
            (false, true) => delta += constraint.penalty_weight,
            (true, false) => delta -= constraint.penalty_weight,
            _ => {}
        }
    }

    delta
}

fn should_together_penalty_delta_for_clique_swap(
    state: &RuntimeState,
    analysis: &CliqueSwapAnalysis,
    moved_people: &[usize],
) -> f64 {
    let cp = &state.compiled;
    let session_idx = analysis.clique_swap.session_idx;
    let indices = merged_indices_for_people(moved_people, &cp.should_together_pairs_by_person);

    let mut delta = 0.0;
    for idx in indices {
        let constraint = &cp.should_together_pairs[idx];
        if !is_active_in_session(constraint.sessions.as_deref(), session_idx) {
            continue;
        }

        let (left, right) = constraint.people;
        if !cp.person_participation[left][session_idx]
            || !cp.person_participation[right][session_idx]
        {
            continue;
        }

        let before_violation = !same_group_in_session(state, session_idx, left, right);
        let after_violation =
            !same_group_after_clique_swap(state, analysis, session_idx, left, right);
        match (before_violation, after_violation) {
            (false, true) => delta += constraint.penalty_weight,
            (true, false) => delta -= constraint.penalty_weight,
            _ => {}
        }
    }

    delta
}

fn pair_meeting_penalty_delta_for_clique_swap(
    state: &RuntimeState,
    analysis: &CliqueSwapAnalysis,
    moved_people: &[usize],
) -> f64 {
    let cp = &state.compiled;
    let session_idx = analysis.clique_swap.session_idx;
    let indices = merged_indices_for_people(moved_people, &cp.pair_meeting_constraints_by_person);

    let mut delta = 0.0;
    for idx in indices {
        let constraint = &cp.pair_meeting_constraints[idx];
        if !constraint.sessions.contains(&session_idx) {
            continue;
        }

        let old_meetings = count_pair_meetings_for_constraint(state, constraint);
        let before_meeting =
            same_group_in_session(state, session_idx, constraint.people.0, constraint.people.1);
        let after_meeting = same_group_after_clique_swap(
            state,
            analysis,
            session_idx,
            constraint.people.0,
            constraint.people.1,
        );

        let new_meetings = match (before_meeting, after_meeting) {
            (true, false) => old_meetings.saturating_sub(1),
            (false, true) => old_meetings.saturating_add(1),
            _ => old_meetings,
        };

        delta += pair_meeting_penalty(constraint, new_meetings)
            - pair_meeting_penalty(constraint, old_meetings);
    }

    delta
}

fn attribute_balance_penalty_delta_for_clique_swap(
    state: &RuntimeState,
    analysis: &CliqueSwapAnalysis,
) -> f64 {
    let cp = &state.compiled;
    let clique_swap = &analysis.clique_swap;
    let session_idx = clique_swap.session_idx;

    let mut delta = 0.0;
    for group_idx in [clique_swap.source_group_idx, clique_swap.target_group_idx] {
        let slot = cp.group_session_slot(session_idx, group_idx);
        for &cidx in &cp.attribute_balance_constraints_by_group_session[slot] {
            let constraint = &cp.attribute_balance_constraints[cidx];
            let before_members = &state.group_members[state.group_slot(session_idx, group_idx)];
            let mut counts = attribute_balance_counts_for_members(cp, constraint, before_members);
            let before_penalty = attribute_balance_penalty_for_counts(constraint, &counts);

            if group_idx == clique_swap.source_group_idx {
                adjust_attribute_balance_counts_for_people(
                    cp,
                    &mut counts,
                    constraint.attr_idx,
                    &analysis.active_members,
                    -1,
                );
                adjust_attribute_balance_counts_for_people(
                    cp,
                    &mut counts,
                    constraint.attr_idx,
                    &analysis.ordered_target_people,
                    1,
                );
            } else {
                adjust_attribute_balance_counts_for_people(
                    cp,
                    &mut counts,
                    constraint.attr_idx,
                    &analysis.ordered_target_people,
                    -1,
                );
                adjust_attribute_balance_counts_for_people(
                    cp,
                    &mut counts,
                    constraint.attr_idx,
                    &analysis.active_members,
                    1,
                );
            }

            delta += attribute_balance_penalty_for_counts(constraint, &counts) - before_penalty;
        }
    }

    delta
}

fn attribute_balance_counts_for_members(
    cp: &crate::solver3::CompiledProblem,
    constraint: &CompiledAttributeBalanceConstraint,
    members: &[usize],
) -> Vec<u32> {
    let value_count = cp
        .attr_idx_to_val
        .get(constraint.attr_idx)
        .map_or(0, Vec::len);
    let mut counts = vec![0u32; value_count];

    for &person_idx in members {
        if let Some(value_idx) = cp.person_attribute_value_indices[person_idx][constraint.attr_idx]
        {
            counts[value_idx] += 1;
        }
    }

    counts
}

fn adjust_attribute_balance_counts_for_people(
    cp: &crate::solver3::CompiledProblem,
    counts: &mut [u32],
    attr_idx: usize,
    people: &[usize],
    delta: i32,
) {
    for &person_idx in people {
        let Some(value_idx) = cp.person_attribute_value_indices[person_idx][attr_idx] else {
            continue;
        };

        if delta > 0 {
            counts[value_idx] += delta as u32;
        } else {
            counts[value_idx] = counts[value_idx].saturating_sub(delta.unsigned_abs());
        }
    }
}

fn attribute_balance_penalty_for_counts(
    constraint: &CompiledAttributeBalanceConstraint,
    counts: &[u32],
) -> f64 {
    let mut penalty = 0.0;
    for &(value_idx, desired) in &constraint.desired_counts {
        let actual = counts.get(value_idx).copied().unwrap_or(0);
        let diff = match constraint.mode {
            AttributeBalanceMode::Exact => (actual as i32 - desired as i32).abs(),
            AttributeBalanceMode::AtLeast => (desired as i32 - actual as i32).max(0),
        };
        penalty += (diff.pow(2) as f64) * constraint.penalty_weight;
    }

    penalty
}

fn pair_meeting_penalty(constraint: &CompiledPairMeetingConstraint, meetings: u32) -> f64 {
    let target = constraint.target_meetings as i32;
    let have = meetings as i32;
    let raw = match constraint.mode {
        PairMeetingMode::AtLeast => (target - have).max(0),
        PairMeetingMode::Exact => (have - target).abs(),
        PairMeetingMode::AtMost => (have - target).max(0),
    };
    raw as f64 * constraint.penalty_weight
}

fn count_pair_meetings_for_constraint(
    state: &RuntimeState,
    constraint: &CompiledPairMeetingConstraint,
) -> u32 {
    let cp = &state.compiled;
    let (left, right) = constraint.people;
    let mut meetings = 0u32;

    for &session_idx in &constraint.sessions {
        if !cp.person_participation[left][session_idx]
            || !cp.person_participation[right][session_idx]
        {
            continue;
        }
        if same_group_in_session(state, session_idx, left, right) {
            meetings += 1;
        }
    }

    meetings
}

fn same_group_after_clique_swap(
    state: &RuntimeState,
    analysis: &CliqueSwapAnalysis,
    session_idx: usize,
    left_person_idx: usize,
    right_person_idx: usize,
) -> bool {
    let left_group = group_after_clique_swap(state, analysis, session_idx, left_person_idx);
    let right_group = group_after_clique_swap(state, analysis, session_idx, right_person_idx);
    left_group.is_some() && left_group == right_group
}

fn same_group_in_session(
    state: &RuntimeState,
    session_idx: usize,
    left_person_idx: usize,
    right_person_idx: usize,
) -> bool {
    let left = state.person_location[state.people_slot(session_idx, left_person_idx)];
    let right = state.person_location[state.people_slot(session_idx, right_person_idx)];
    left.is_some() && left == right
}

fn group_after_clique_swap(
    state: &RuntimeState,
    analysis: &CliqueSwapAnalysis,
    session_idx: usize,
    person_idx: usize,
) -> Option<usize> {
    if session_idx != analysis.clique_swap.session_idx {
        return state.person_location[state.people_slot(session_idx, person_idx)];
    }

    if analysis.active_members.contains(&person_idx) {
        return Some(analysis.clique_swap.target_group_idx);
    }
    if analysis.ordered_target_people.contains(&person_idx) {
        return Some(analysis.clique_swap.source_group_idx);
    }

    state.person_location[state.people_slot(session_idx, person_idx)]
}

fn is_active_in_session(sessions: Option<&[usize]>, session_idx: usize) -> bool {
    sessions
        .map(|list| list.contains(&session_idx))
        .unwrap_or(true)
}

fn merged_indices_for_people(people: &[usize], adjacency: &[Vec<usize>]) -> Vec<usize> {
    let mut merged = Vec::new();
    for &person_idx in people {
        merged.extend_from_slice(&adjacency[person_idx]);
    }
    merged.sort_unstable();
    merged.dedup();
    merged
}

fn moved_people(analysis: &CliqueSwapAnalysis) -> Vec<usize> {
    let mut moved = analysis.active_members.clone();
    moved.extend_from_slice(&analysis.ordered_target_people);
    moved.sort_unstable();
    moved.dedup();
    moved
}

fn repeat_pair_penalty(
    penalty_function: RepeatPenaltyFunction,
    count: u16,
    max_allowed_encounters: u32,
) -> i32 {
    let excess = count.saturating_sub(max_allowed_encounters as u16) as u32;
    if excess == 0 {
        0
    } else {
        penalty_function.penalty_for_excess(excess)
    }
}

fn clique_is_active_in_session(
    cp: &crate::solver3::CompiledProblem,
    clique_idx: usize,
    session_idx: usize,
) -> bool {
    match &cp.cliques[clique_idx].sessions {
        Some(sessions) => sessions.contains(&session_idx),
        None => true,
    }
}

fn participating_clique_member_count(
    cp: &crate::solver3::CompiledProblem,
    clique_swap: &CliqueSwapMove,
) -> usize {
    cp.cliques[clique_swap.clique_idx]
        .members
        .iter()
        .filter(|&&member| cp.person_participation[member][clique_swap.session_idx])
        .count()
}

fn active_clique_members_in_source_group(
    state: &RuntimeState,
    clique_swap: &CliqueSwapMove,
) -> Vec<usize> {
    let source_slot = state.group_slot(clique_swap.session_idx, clique_swap.source_group_idx);
    state.group_members[source_slot]
        .iter()
        .copied()
        .filter(|&person_idx| {
            state.compiled.person_to_clique_id[clique_swap.session_idx][person_idx]
                == Some(clique_swap.clique_idx)
        })
        .collect()
}

fn validate_target_people(
    state: &RuntimeState,
    clique_swap: &CliqueSwapMove,
    active_members: &[usize],
) -> CliqueSwapFeasibility {
    let cp = &state.compiled;

    for (idx, &person_idx) in clique_swap.target_person_indices.iter().enumerate() {
        if clique_swap.target_person_indices[..idx].contains(&person_idx) {
            return CliqueSwapFeasibility::DuplicateTargetPerson { person_idx };
        }
        if active_members.contains(&person_idx) {
            return CliqueSwapFeasibility::TargetPersonIsCliqueMember { person_idx };
        }
        if !cp.person_participation[person_idx][clique_swap.session_idx] {
            return CliqueSwapFeasibility::TargetPersonNotParticipating { person_idx };
        }

        let Some(actual_group_idx) =
            state.person_location[state.people_slot(clique_swap.session_idx, person_idx)]
        else {
            return CliqueSwapFeasibility::TargetPersonMissingLocation { person_idx };
        };
        if actual_group_idx != clique_swap.target_group_idx {
            return CliqueSwapFeasibility::TargetPersonWrongGroup {
                person_idx,
                expected_group_idx: clique_swap.target_group_idx,
            };
        }

        if let Some(clique_idx) = cp.person_to_clique_id[clique_swap.session_idx][person_idx] {
            return CliqueSwapFeasibility::TargetPersonInAnotherClique {
                person_idx,
                clique_idx,
            };
        }

        if let Some(required_group_idx) = cp.immovable_group(clique_swap.session_idx, person_idx) {
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

fn apply_clique_swap_direct_membership(
    state: &mut RuntimeState,
    analysis: &CliqueSwapAnalysis,
) -> Result<(), SolverError> {
    let clique_swap = &analysis.clique_swap;
    let session_idx = clique_swap.session_idx;
    let source_slot = state.group_slot(session_idx, clique_swap.source_group_idx);
    let target_slot = state.group_slot(session_idx, clique_swap.target_group_idx);

    let source_before = state.group_members[source_slot].len();
    state.group_members[source_slot].retain(|member| !analysis.active_members.contains(member));
    let removed_source = source_before - state.group_members[source_slot].len();
    if removed_source != analysis.active_members.len() {
        return Err(SolverError::ValidationError(
            "solver3 oracle clique swap could not remove all active clique members from source group"
                .into(),
        ));
    }

    let target_before = state.group_members[target_slot].len();
    state.group_members[target_slot]
        .retain(|member| !analysis.ordered_target_people.contains(member));
    let removed_target = target_before - state.group_members[target_slot].len();
    if removed_target != analysis.ordered_target_people.len() {
        return Err(SolverError::ValidationError(
            "solver3 oracle clique swap could not remove all target people from target group"
                .into(),
        ));
    }

    state.group_members[source_slot].extend_from_slice(&analysis.ordered_target_people);
    state.group_members[target_slot].extend_from_slice(&analysis.active_members);
    state.group_sizes[source_slot] = state.group_members[source_slot].len();
    state.group_sizes[target_slot] = state.group_members[target_slot].len();

    for &person_idx in &analysis.active_members {
        let ps = state.people_slot(session_idx, person_idx);
        state.person_location[ps] = Some(clique_swap.target_group_idx);
    }
    for &person_idx in &analysis.ordered_target_people {
        let ps = state.people_slot(session_idx, person_idx);
        state.person_location[ps] = Some(clique_swap.source_group_idx);
    }

    Ok(())
}

fn record_pair_contact_delta(
    patch: &mut RuntimePatch,
    cp: &crate::solver3::CompiledProblem,
    state: &RuntimeState,
    pair_idx: usize,
    delta: i32,
) -> Result<(), SolverError> {
    let old_count = state.pair_contacts[pair_idx] as i32;
    let new_count = old_count + delta;
    if !(0..=u16::MAX as i32).contains(&new_count) {
        return Err(SolverError::ValidationError(format!(
            "solver3 clique swap pair contact update out of range for pair {}: {} + {}",
            pair_idx, old_count, delta
        )));
    }

    patch.pair_contact_updates.push(PairContactUpdate {
        pair_idx,
        new_count: new_count as u16,
    });

    if old_count == 0 && new_count > 0 {
        patch.score_delta.unique_contacts_delta += 1;
    } else if old_count > 0 && new_count == 0 {
        patch.score_delta.unique_contacts_delta -= 1;
    }

    if let Some(repeat) = cp.repeat_encounter.as_ref() {
        let old_pen = repeat_pair_penalty(
            repeat.penalty_function,
            old_count as u16,
            repeat.max_allowed_encounters,
        );
        let new_pen = repeat_pair_penalty(
            repeat.penalty_function,
            new_count as u16,
            repeat.max_allowed_encounters,
        );
        patch.score_delta.repetition_penalty_raw_delta += new_pen - old_pen;
    }

    Ok(())
}
