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

/// Typed swap move for `solver3`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SwapMove {
    pub session_idx: usize,
    pub left_person_idx: usize,
    pub right_person_idx: usize,
}

impl SwapMove {
    pub fn new(session_idx: usize, left_person_idx: usize, right_person_idx: usize) -> Self {
        Self {
            session_idx,
            left_person_idx,
            right_person_idx,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SwapFeasibility {
    Feasible,
    SamePersonNoop,
    SameGroupNoop,
    NonParticipatingPerson {
        person_idx: usize,
    },
    MissingLocation {
        person_idx: usize,
    },
    ImmovablePerson {
        person_idx: usize,
        required_group_idx: usize,
    },
    ActiveCliqueMember {
        person_idx: usize,
        clique_idx: usize,
    },
}

impl fmt::Display for SwapFeasibility {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Feasible => f.write_str("feasible"),
            Self::SamePersonNoop => f.write_str("same-person no-op"),
            Self::SameGroupNoop => f.write_str("same-group no-op"),
            Self::NonParticipatingPerson { person_idx } => {
                write!(
                    f,
                    "person {person_idx} is not participating in this session"
                )
            }
            Self::MissingLocation { person_idx } => {
                write!(
                    f,
                    "person {person_idx} is missing a location in this session"
                )
            }
            Self::ImmovablePerson {
                person_idx,
                required_group_idx,
            } => {
                write!(
                    f,
                    "person {person_idx} is immovable and must stay in group {required_group_idx}"
                )
            }
            Self::ActiveCliqueMember {
                person_idx,
                clique_idx,
            } => {
                write!(
                    f,
                    "person {person_idx} is part of active clique {clique_idx} in this session"
                )
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SwapAnalysis {
    pub swap: SwapMove,
    pub feasibility: SwapFeasibility,
    pub left_group_idx: Option<usize>,
    pub right_group_idx: Option<usize>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SwapRuntimePreview {
    pub analysis: SwapAnalysis,
    pub patch: RuntimePatch,
    pub delta_score: f64,
}

pub fn analyze_swap(state: &RuntimeState, swap: &SwapMove) -> Result<SwapAnalysis, SolverError> {
    let cp = &state.compiled;
    if swap.session_idx >= cp.num_sessions {
        return Err(SolverError::ValidationError(format!(
            "swap references invalid session {} (max: {})",
            swap.session_idx,
            cp.num_sessions.saturating_sub(1)
        )));
    }
    if swap.left_person_idx >= cp.num_people || swap.right_person_idx >= cp.num_people {
        return Err(SolverError::ValidationError(format!(
            "swap references invalid person indices ({}, {}) (max: {})",
            swap.left_person_idx,
            swap.right_person_idx,
            cp.num_people.saturating_sub(1)
        )));
    }

    let left_group_idx =
        state.person_location[state.people_slot(swap.session_idx, swap.left_person_idx)];
    let right_group_idx =
        state.person_location[state.people_slot(swap.session_idx, swap.right_person_idx)];

    let feasibility = if swap.left_person_idx == swap.right_person_idx {
        SwapFeasibility::SamePersonNoop
    } else if !cp.person_participation[swap.left_person_idx][swap.session_idx] {
        SwapFeasibility::NonParticipatingPerson {
            person_idx: swap.left_person_idx,
        }
    } else if !cp.person_participation[swap.right_person_idx][swap.session_idx] {
        SwapFeasibility::NonParticipatingPerson {
            person_idx: swap.right_person_idx,
        }
    } else if left_group_idx.is_none() {
        SwapFeasibility::MissingLocation {
            person_idx: swap.left_person_idx,
        }
    } else if right_group_idx.is_none() {
        SwapFeasibility::MissingLocation {
            person_idx: swap.right_person_idx,
        }
    } else if left_group_idx == right_group_idx {
        SwapFeasibility::SameGroupNoop
    } else if let Some(required_group_idx) =
        cp.immovable_group(swap.session_idx, swap.left_person_idx)
    {
        SwapFeasibility::ImmovablePerson {
            person_idx: swap.left_person_idx,
            required_group_idx,
        }
    } else if let Some(required_group_idx) =
        cp.immovable_group(swap.session_idx, swap.right_person_idx)
    {
        SwapFeasibility::ImmovablePerson {
            person_idx: swap.right_person_idx,
            required_group_idx,
        }
    } else if let Some(clique_idx) = cp.person_to_clique_id[swap.session_idx][swap.left_person_idx]
    {
        SwapFeasibility::ActiveCliqueMember {
            person_idx: swap.left_person_idx,
            clique_idx,
        }
    } else if let Some(clique_idx) = cp.person_to_clique_id[swap.session_idx][swap.right_person_idx]
    {
        SwapFeasibility::ActiveCliqueMember {
            person_idx: swap.right_person_idx,
            clique_idx,
        }
    } else {
        SwapFeasibility::Feasible
    };

    Ok(SwapAnalysis {
        swap: *swap,
        feasibility,
        left_group_idx,
        right_group_idx,
    })
}

pub fn preview_swap_runtime_lightweight(
    state: &RuntimeState,
    swap: &SwapMove,
) -> Result<SwapRuntimePreview, SolverError> {
    let analysis = analyze_swap(state, swap)?;
    let patch = match analysis.feasibility {
        SwapFeasibility::Feasible => build_swap_runtime_patch(state, &analysis)?,
        SwapFeasibility::SamePersonNoop | SwapFeasibility::SameGroupNoop => RuntimePatch::default(),
        ref infeasible => {
            return Err(SolverError::ValidationError(format!(
                "solver3 swap is not feasible: {infeasible}"
            )));
        }
    };

    Ok(SwapRuntimePreview {
        delta_score: patch.score_delta.total_score_delta,
        analysis,
        patch,
    })
}

pub fn preview_swap_oracle_recompute(
    state: &RuntimeState,
    swap: &SwapMove,
) -> Result<f64, SolverError> {
    let analysis = analyze_swap(state, swap)?;
    match analysis.feasibility {
        SwapFeasibility::SamePersonNoop | SwapFeasibility::SameGroupNoop => Ok(0.0),
        SwapFeasibility::Feasible => {
            let before = recompute_oracle_score(state)?.total_score;
            let mut after = state.clone();
            apply_swap_direct_membership(&mut after, &analysis)?;
            after.rebuild_pair_contacts();
            let after_score = recompute_oracle_score(&after)?.total_score;
            Ok(after_score - before)
        }
        ref infeasible => Err(SolverError::ValidationError(format!(
            "solver3 swap is not feasible: {infeasible}"
        ))),
    }
}

pub fn apply_swap_runtime_preview(
    state: &mut RuntimeState,
    preview: &SwapRuntimePreview,
) -> Result<(), SolverError> {
    match preview.analysis.feasibility {
        SwapFeasibility::Feasible => apply_runtime_patch(state, &preview.patch),
        SwapFeasibility::SamePersonNoop | SwapFeasibility::SameGroupNoop => Ok(()),
        ref infeasible => Err(SolverError::ValidationError(format!(
            "solver3 swap is not feasible: {infeasible}"
        ))),
    }
}

pub fn apply_swap(state: &mut RuntimeState, swap: &SwapMove) -> Result<(), SolverError> {
    let preview = preview_swap_runtime_lightweight(state, swap)?;
    apply_swap_runtime_preview(state, &preview)
}

fn build_swap_runtime_patch(
    state: &RuntimeState,
    analysis: &SwapAnalysis,
) -> Result<RuntimePatch, SolverError> {
    let cp = &state.compiled;
    let session_idx = analysis.swap.session_idx;
    let left_person_idx = analysis.swap.left_person_idx;
    let right_person_idx = analysis.swap.right_person_idx;
    let Some(left_group_idx) = analysis.left_group_idx else {
        return Err(SolverError::ValidationError(
            "solver3 swap missing left group during feasible patch build".into(),
        ));
    };
    let Some(right_group_idx) = analysis.right_group_idx else {
        return Err(SolverError::ValidationError(
            "solver3 swap missing right group during feasible patch build".into(),
        ));
    };

    let left_group_slot = state.group_slot(session_idx, left_group_idx);
    let right_group_slot = state.group_slot(session_idx, right_group_idx);

    let left_members = &state.group_members[left_group_slot];
    let right_members = &state.group_members[right_group_slot];
    let left_member_pos = left_members
        .iter()
        .position(|&member| member == left_person_idx)
        .ok_or_else(|| {
            SolverError::ValidationError(format!(
                "solver3 swap missing left person {} in group {} during patch build",
                left_person_idx, left_group_idx
            ))
        })?;
    let right_member_pos = right_members
        .iter()
        .position(|&member| member == right_person_idx)
        .ok_or_else(|| {
            SolverError::ValidationError(format!(
                "solver3 swap missing right person {} in group {} during patch build",
                right_person_idx, right_group_idx
            ))
        })?;

    let mut patch = RuntimePatch {
        person_location_updates: vec![
            PersonLocationUpdate {
                session_idx,
                person_idx: left_person_idx,
                new_group_idx: Some(right_group_idx),
            },
            PersonLocationUpdate {
                session_idx,
                person_idx: right_person_idx,
                new_group_idx: Some(left_group_idx),
            },
        ],
        group_member_ops: vec![
            GroupMembersPatchOp::ReplaceAt {
                session_idx,
                group_idx: left_group_idx,
                member_pos: left_member_pos,
                expected_old_person_idx: left_person_idx,
                new_person_idx: right_person_idx,
            },
            GroupMembersPatchOp::ReplaceAt {
                session_idx,
                group_idx: right_group_idx,
                member_pos: right_member_pos,
                expected_old_person_idx: right_person_idx,
                new_person_idx: left_person_idx,
            },
        ],
        pair_contact_updates: Vec::with_capacity(
            left_members.len().saturating_sub(1) + right_members.len().saturating_sub(1),
        ),
        ..RuntimePatch::default()
    };

    for &member in left_members {
        if member == left_person_idx {
            continue;
        }
        let left_pair_idx = cp.pair_idx(left_person_idx, member);
        let right_pair_idx = cp.pair_idx(right_person_idx, member);
        record_pair_contact_delta(&mut patch, cp, state, left_pair_idx, -1)?;
        record_pair_contact_delta(&mut patch, cp, state, right_pair_idx, 1)?;
    }

    for &member in right_members {
        if member == right_person_idx {
            continue;
        }
        let right_pair_idx = cp.pair_idx(right_person_idx, member);
        let left_pair_idx = cp.pair_idx(left_person_idx, member);
        record_pair_contact_delta(&mut patch, cp, state, right_pair_idx, -1)?;
        record_pair_contact_delta(&mut patch, cp, state, left_pair_idx, 1)?;
    }

    if let Some(repeat) = cp.repeat_encounter.as_ref() {
        patch.score_delta.weighted_repetition_penalty_delta =
            patch.score_delta.repetition_penalty_raw_delta as f64 * repeat.penalty_weight;
    }

    patch.score_delta.constraint_penalty_weighted_delta +=
        forbidden_pair_penalty_delta_for_swap(state, analysis);
    patch.score_delta.constraint_penalty_weighted_delta +=
        should_together_penalty_delta_for_swap(state, analysis);
    patch.score_delta.constraint_penalty_weighted_delta +=
        pair_meeting_penalty_delta_for_swap(state, analysis);
    patch.score_delta.attribute_balance_penalty_delta +=
        attribute_balance_penalty_delta_for_swap(state, analysis);

    patch.score_delta.total_score_delta = patch.score_delta.weighted_repetition_penalty_delta
        + patch.score_delta.attribute_balance_penalty_delta
        + patch.score_delta.constraint_penalty_weighted_delta
        - (patch.score_delta.unique_contacts_delta as f64 * cp.maximize_unique_contacts_weight);

    Ok(patch)
}

fn forbidden_pair_penalty_delta_for_swap(state: &RuntimeState, analysis: &SwapAnalysis) -> f64 {
    let cp = &state.compiled;
    let session_idx = analysis.swap.session_idx;
    let indices = merged_indices(
        &cp.forbidden_pairs_by_person[analysis.swap.left_person_idx],
        &cp.forbidden_pairs_by_person[analysis.swap.right_person_idx],
    );

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
        let after = same_group_after_swap(state, analysis, session_idx, left, right);
        match (before, after) {
            (false, true) => delta += constraint.penalty_weight,
            (true, false) => delta -= constraint.penalty_weight,
            _ => {}
        }
    }

    delta
}

fn should_together_penalty_delta_for_swap(state: &RuntimeState, analysis: &SwapAnalysis) -> f64 {
    let cp = &state.compiled;
    let session_idx = analysis.swap.session_idx;
    let indices = merged_indices(
        &cp.should_together_pairs_by_person[analysis.swap.left_person_idx],
        &cp.should_together_pairs_by_person[analysis.swap.right_person_idx],
    );

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
        let after_violation = !same_group_after_swap(state, analysis, session_idx, left, right);
        match (before_violation, after_violation) {
            (false, true) => delta += constraint.penalty_weight,
            (true, false) => delta -= constraint.penalty_weight,
            _ => {}
        }
    }

    delta
}

fn pair_meeting_penalty_delta_for_swap(state: &RuntimeState, analysis: &SwapAnalysis) -> f64 {
    let cp = &state.compiled;
    let session_idx = analysis.swap.session_idx;
    let indices = merged_indices(
        &cp.pair_meeting_constraints_by_person[analysis.swap.left_person_idx],
        &cp.pair_meeting_constraints_by_person[analysis.swap.right_person_idx],
    );

    let mut delta = 0.0;
    for idx in indices {
        let constraint = &cp.pair_meeting_constraints[idx];
        if !constraint.sessions.contains(&session_idx) {
            continue;
        }

        let old_meetings = count_pair_meetings_for_constraint(state, constraint);
        let before_meeting =
            same_group_in_session(state, session_idx, constraint.people.0, constraint.people.1);
        let after_meeting = same_group_after_swap(
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

fn attribute_balance_penalty_delta_for_swap(state: &RuntimeState, analysis: &SwapAnalysis) -> f64 {
    let Some(left_group_idx) = analysis.left_group_idx else {
        return 0.0;
    };
    let Some(right_group_idx) = analysis.right_group_idx else {
        return 0.0;
    };
    let cp = &state.compiled;
    let session_idx = analysis.swap.session_idx;

    let left_slot = cp.group_session_slot(session_idx, left_group_idx);
    let right_slot = cp.group_session_slot(session_idx, right_group_idx);

    let left_before = &state.group_members[state.group_slot(session_idx, left_group_idx)];
    let right_before = &state.group_members[state.group_slot(session_idx, right_group_idx)];

    let left_after = members_after_swap_for_group(state, analysis, left_group_idx);
    let right_after = members_after_swap_for_group(state, analysis, right_group_idx);

    let mut delta = 0.0;
    for &cidx in &cp.attribute_balance_constraints_by_group_session[left_slot] {
        let constraint = &cp.attribute_balance_constraints[cidx];
        delta += attribute_balance_penalty_for_members(cp, constraint, left_after.as_slice())
            - attribute_balance_penalty_for_members(cp, constraint, left_before);
    }
    for &cidx in &cp.attribute_balance_constraints_by_group_session[right_slot] {
        let constraint = &cp.attribute_balance_constraints[cidx];
        delta += attribute_balance_penalty_for_members(cp, constraint, right_after.as_slice())
            - attribute_balance_penalty_for_members(cp, constraint, right_before);
    }

    delta
}

fn members_after_swap_for_group(
    state: &RuntimeState,
    analysis: &SwapAnalysis,
    group_idx: usize,
) -> Vec<usize> {
    let session_idx = analysis.swap.session_idx;
    let mut members = state.group_members[state.group_slot(session_idx, group_idx)].clone();
    if Some(group_idx) == analysis.left_group_idx {
        for member in &mut members {
            if *member == analysis.swap.left_person_idx {
                *member = analysis.swap.right_person_idx;
                break;
            }
        }
    }
    if Some(group_idx) == analysis.right_group_idx {
        for member in &mut members {
            if *member == analysis.swap.right_person_idx {
                *member = analysis.swap.left_person_idx;
                break;
            }
        }
    }
    members
}

fn attribute_balance_penalty_for_members(
    cp: &crate::solver3::CompiledProblem,
    constraint: &CompiledAttributeBalanceConstraint,
    members: &[usize],
) -> f64 {
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

fn same_group_after_swap(
    state: &RuntimeState,
    analysis: &SwapAnalysis,
    session_idx: usize,
    left_person_idx: usize,
    right_person_idx: usize,
) -> bool {
    let left_group = group_after_swap(state, analysis, session_idx, left_person_idx);
    let right_group = group_after_swap(state, analysis, session_idx, right_person_idx);
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

fn group_after_swap(
    state: &RuntimeState,
    analysis: &SwapAnalysis,
    session_idx: usize,
    person_idx: usize,
) -> Option<usize> {
    if session_idx != analysis.swap.session_idx {
        return state.person_location[state.people_slot(session_idx, person_idx)];
    }

    if person_idx == analysis.swap.left_person_idx {
        return analysis.right_group_idx;
    }
    if person_idx == analysis.swap.right_person_idx {
        return analysis.left_group_idx;
    }
    state.person_location[state.people_slot(session_idx, person_idx)]
}

fn is_active_in_session(sessions: Option<&[usize]>, session_idx: usize) -> bool {
    sessions
        .map(|list| list.contains(&session_idx))
        .unwrap_or(true)
}

fn merged_indices(left: &[usize], right: &[usize]) -> Vec<usize> {
    let mut merged = Vec::with_capacity(left.len() + right.len());
    merged.extend_from_slice(left);
    merged.extend_from_slice(right);
    merged.sort_unstable();
    merged.dedup();
    merged
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
            "solver3 swap pair contact update out of range for pair {}: {} + {}",
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

fn apply_swap_direct_membership(
    state: &mut RuntimeState,
    analysis: &SwapAnalysis,
) -> Result<(), SolverError> {
    let session_idx = analysis.swap.session_idx;
    let left_person = analysis.swap.left_person_idx;
    let right_person = analysis.swap.right_person_idx;
    let Some(left_group_idx) = analysis.left_group_idx else {
        return Err(SolverError::ValidationError(
            "solver3 oracle swap apply missing left group".into(),
        ));
    };
    let Some(right_group_idx) = analysis.right_group_idx else {
        return Err(SolverError::ValidationError(
            "solver3 oracle swap apply missing right group".into(),
        ));
    };

    let left_slot = state.group_slot(session_idx, left_group_idx);
    let right_slot = state.group_slot(session_idx, right_group_idx);

    let Some(left_pos) = state.group_members[left_slot]
        .iter()
        .position(|&m| m == left_person)
    else {
        return Err(SolverError::ValidationError(format!(
            "solver3 oracle swap apply cannot find person {} in source group {}",
            left_person, left_group_idx
        )));
    };
    let Some(right_pos) = state.group_members[right_slot]
        .iter()
        .position(|&m| m == right_person)
    else {
        return Err(SolverError::ValidationError(format!(
            "solver3 oracle swap apply cannot find person {} in source group {}",
            right_person, right_group_idx
        )));
    };

    state.group_members[left_slot][left_pos] = right_person;
    state.group_members[right_slot][right_pos] = left_person;

    let left_person_slot = state.people_slot(session_idx, left_person);
    let right_person_slot = state.people_slot(session_idx, right_person);
    state.person_location[left_person_slot] = Some(right_group_idx);
    state.person_location[right_person_slot] = Some(left_group_idx);

    Ok(())
}
