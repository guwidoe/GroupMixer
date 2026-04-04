use std::collections::BTreeMap;
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

/// Typed transfer move for `solver3`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TransferMove {
    pub session_idx: usize,
    pub person_idx: usize,
    pub source_group_idx: usize,
    pub target_group_idx: usize,
}

impl TransferMove {
    pub fn new(
        session_idx: usize,
        person_idx: usize,
        source_group_idx: usize,
        target_group_idx: usize,
    ) -> Self {
        Self {
            session_idx,
            person_idx,
            source_group_idx,
            target_group_idx,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TransferFeasibility {
    Feasible,
    SameGroupNoop,
    NonParticipatingPerson {
        person_idx: usize,
    },
    MissingLocation {
        person_idx: usize,
    },
    WrongSourceGroup {
        person_idx: usize,
        actual_group_idx: usize,
    },
    SourceWouldBeEmpty {
        source_group_idx: usize,
    },
    TargetGroupFull {
        target_group_idx: usize,
        capacity: usize,
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

impl fmt::Display for TransferFeasibility {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Feasible => f.write_str("feasible"),
            Self::SameGroupNoop => f.write_str("same-group no-op"),
            Self::NonParticipatingPerson { person_idx } => {
                write!(f, "person {person_idx} is not participating in this session")
            }
            Self::MissingLocation { person_idx } => {
                write!(f, "person {person_idx} is missing a location in this session")
            }
            Self::WrongSourceGroup {
                person_idx,
                actual_group_idx,
            } => write!(
                f,
                "person {person_idx} is not in the requested source group; actual group is {actual_group_idx}"
            ),
            Self::SourceWouldBeEmpty { source_group_idx } => {
                write!(f, "source group {source_group_idx} would become empty after the transfer")
            }
            Self::TargetGroupFull {
                target_group_idx,
                capacity,
            } => write!(
                f,
                "target group {target_group_idx} is full for this session (capacity {capacity})"
            ),
            Self::ImmovablePerson {
                person_idx,
                required_group_idx,
            } => write!(
                f,
                "person {person_idx} is immovable and must stay in group {required_group_idx}"
            ),
            Self::ActiveCliqueMember {
                person_idx,
                clique_idx,
            } => write!(
                f,
                "person {person_idx} is part of active clique {clique_idx} in this session"
            ),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TransferAnalysis {
    pub transfer: TransferMove,
    pub feasibility: TransferFeasibility,
    pub actual_group_idx: Option<usize>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TransferRuntimePreview {
    pub analysis: TransferAnalysis,
    pub patch: RuntimePatch,
    pub delta_score: f64,
}

pub fn analyze_transfer(
    state: &RuntimeState,
    transfer: &TransferMove,
) -> Result<TransferAnalysis, SolverError> {
    let cp = &state.compiled;

    if transfer.session_idx >= cp.num_sessions {
        return Err(SolverError::ValidationError(format!(
            "transfer references invalid session {} (max: {})",
            transfer.session_idx,
            cp.num_sessions.saturating_sub(1)
        )));
    }
    if transfer.person_idx >= cp.num_people {
        return Err(SolverError::ValidationError(format!(
            "transfer references invalid person index {} (max: {})",
            transfer.person_idx,
            cp.num_people.saturating_sub(1)
        )));
    }
    if transfer.source_group_idx >= cp.num_groups || transfer.target_group_idx >= cp.num_groups {
        return Err(SolverError::ValidationError(format!(
            "transfer references invalid group indices ({}, {}) (max: {})",
            transfer.source_group_idx,
            transfer.target_group_idx,
            cp.num_groups.saturating_sub(1)
        )));
    }

    let actual_group_idx =
        state.person_location[state.people_slot(transfer.session_idx, transfer.person_idx)];
    let source_size =
        state.group_sizes[state.group_slot(transfer.session_idx, transfer.source_group_idx)];
    let target_size =
        state.group_sizes[state.group_slot(transfer.session_idx, transfer.target_group_idx)];
    let target_capacity = cp.group_capacity(transfer.session_idx, transfer.target_group_idx);

    let feasibility = if !cp.person_participation[transfer.person_idx][transfer.session_idx] {
        TransferFeasibility::NonParticipatingPerson {
            person_idx: transfer.person_idx,
        }
    } else if transfer.source_group_idx == transfer.target_group_idx {
        TransferFeasibility::SameGroupNoop
    } else if actual_group_idx.is_none() {
        TransferFeasibility::MissingLocation {
            person_idx: transfer.person_idx,
        }
    } else if actual_group_idx != Some(transfer.source_group_idx) {
        TransferFeasibility::WrongSourceGroup {
            person_idx: transfer.person_idx,
            actual_group_idx: actual_group_idx.expect("checked above"),
        }
    } else if source_size <= 1 {
        TransferFeasibility::SourceWouldBeEmpty {
            source_group_idx: transfer.source_group_idx,
        }
    } else if target_size >= target_capacity {
        TransferFeasibility::TargetGroupFull {
            target_group_idx: transfer.target_group_idx,
            capacity: target_capacity,
        }
    } else if let Some(&required_group_idx) = cp
        .immovable_lookup
        .get(&(transfer.person_idx, transfer.session_idx))
    {
        TransferFeasibility::ImmovablePerson {
            person_idx: transfer.person_idx,
            required_group_idx,
        }
    } else if let Some(clique_idx) =
        cp.person_to_clique_id[transfer.session_idx][transfer.person_idx]
    {
        TransferFeasibility::ActiveCliqueMember {
            person_idx: transfer.person_idx,
            clique_idx,
        }
    } else {
        TransferFeasibility::Feasible
    };

    Ok(TransferAnalysis {
        transfer: *transfer,
        feasibility,
        actual_group_idx,
    })
}

pub fn preview_transfer_runtime_lightweight(
    state: &RuntimeState,
    transfer: &TransferMove,
) -> Result<TransferRuntimePreview, SolverError> {
    let analysis = analyze_transfer(state, transfer)?;
    let patch = match analysis.feasibility {
        TransferFeasibility::Feasible => build_transfer_runtime_patch(state, &analysis)?,
        TransferFeasibility::SameGroupNoop => RuntimePatch::default(),
        ref infeasible => {
            return Err(SolverError::ValidationError(format!(
                "solver3 transfer is not feasible: {infeasible}"
            )));
        }
    };

    Ok(TransferRuntimePreview {
        delta_score: patch.score_delta.total_score_delta,
        analysis,
        patch,
    })
}

pub fn preview_transfer_oracle_recompute(
    state: &RuntimeState,
    transfer: &TransferMove,
) -> Result<f64, SolverError> {
    let analysis = analyze_transfer(state, transfer)?;
    match analysis.feasibility {
        TransferFeasibility::SameGroupNoop => Ok(0.0),
        TransferFeasibility::Feasible => {
            let before = recompute_oracle_score(state)?.total_score;
            let mut after = state.clone();
            apply_transfer_direct_membership(&mut after, &analysis)?;
            after.rebuild_pair_contacts();
            let after_score = recompute_oracle_score(&after)?.total_score;
            Ok(after_score - before)
        }
        ref infeasible => Err(SolverError::ValidationError(format!(
            "solver3 transfer is not feasible: {infeasible}"
        ))),
    }
}

pub fn apply_transfer_runtime_preview(
    state: &mut RuntimeState,
    preview: &TransferRuntimePreview,
) -> Result<(), SolverError> {
    match preview.analysis.feasibility {
        TransferFeasibility::Feasible => apply_runtime_patch(state, &preview.patch),
        TransferFeasibility::SameGroupNoop => Ok(()),
        ref infeasible => Err(SolverError::ValidationError(format!(
            "solver3 transfer is not feasible: {infeasible}"
        ))),
    }
}

pub fn apply_transfer(
    state: &mut RuntimeState,
    transfer: &TransferMove,
) -> Result<(), SolverError> {
    let preview = preview_transfer_runtime_lightweight(state, transfer)?;
    apply_transfer_runtime_preview(state, &preview)
}

fn build_transfer_runtime_patch(
    state: &RuntimeState,
    analysis: &TransferAnalysis,
) -> Result<RuntimePatch, SolverError> {
    let cp = &state.compiled;
    let transfer = analysis.transfer;
    let session_idx = transfer.session_idx;
    let person_idx = transfer.person_idx;
    let source_group_idx = transfer.source_group_idx;
    let target_group_idx = transfer.target_group_idx;

    let mut patch = RuntimePatch {
        person_location_updates: vec![PersonLocationUpdate {
            session_idx,
            person_idx,
            new_group_idx: Some(target_group_idx),
        }],
        group_member_ops: vec![
            GroupMembersPatchOp::Remove {
                session_idx,
                group_idx: source_group_idx,
                person_idx,
            },
            GroupMembersPatchOp::Insert {
                session_idx,
                group_idx: target_group_idx,
                person_idx,
            },
        ],
        ..RuntimePatch::default()
    };

    let source_slot = state.group_slot(session_idx, source_group_idx);
    let target_slot = state.group_slot(session_idx, target_group_idx);
    let source_members = &state.group_members[source_slot];
    let target_members = &state.group_members[target_slot];

    let mut pair_deltas: BTreeMap<usize, i32> = BTreeMap::new();

    for &member in source_members {
        if member == person_idx {
            continue;
        }
        let pair_idx = cp.pair_idx(person_idx, member);
        *pair_deltas.entry(pair_idx).or_insert(0) -= 1;
    }

    for &member in target_members {
        let pair_idx = cp.pair_idx(person_idx, member);
        *pair_deltas.entry(pair_idx).or_insert(0) += 1;
    }

    for (pair_idx, delta) in pair_deltas {
        if delta == 0 {
            continue;
        }

        let old_count = state.pair_contacts[pair_idx] as i32;
        let new_count = old_count + delta;
        if !(0..=u16::MAX as i32).contains(&new_count) {
            return Err(SolverError::ValidationError(format!(
                "solver3 transfer pair contact update out of range for pair {}: {} + {}",
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
    }

    if let Some(repeat) = cp.repeat_encounter.as_ref() {
        patch.score_delta.weighted_repetition_penalty_delta =
            patch.score_delta.repetition_penalty_raw_delta as f64 * repeat.penalty_weight;
    }

    patch.score_delta.constraint_penalty_weighted_delta +=
        forbidden_pair_penalty_delta_for_transfer(state, analysis);
    patch.score_delta.constraint_penalty_weighted_delta +=
        should_together_penalty_delta_for_transfer(state, analysis);
    patch.score_delta.constraint_penalty_weighted_delta +=
        pair_meeting_penalty_delta_for_transfer(state, analysis);
    patch.score_delta.attribute_balance_penalty_delta +=
        attribute_balance_penalty_delta_for_transfer(state, analysis);

    patch.score_delta.total_score_delta = patch.score_delta.weighted_repetition_penalty_delta
        + patch.score_delta.attribute_balance_penalty_delta
        + patch.score_delta.constraint_penalty_weighted_delta
        - (patch.score_delta.unique_contacts_delta as f64 * cp.maximize_unique_contacts_weight);

    Ok(patch)
}

fn forbidden_pair_penalty_delta_for_transfer(
    state: &RuntimeState,
    analysis: &TransferAnalysis,
) -> f64 {
    let cp = &state.compiled;
    let transfer = analysis.transfer;
    let session_idx = transfer.session_idx;

    let mut delta = 0.0;
    for &idx in &cp.forbidden_pairs_by_person[transfer.person_idx] {
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
        let after = same_group_after_transfer(state, analysis, session_idx, left, right);
        match (before, after) {
            (false, true) => delta += constraint.penalty_weight,
            (true, false) => delta -= constraint.penalty_weight,
            _ => {}
        }
    }

    delta
}

fn should_together_penalty_delta_for_transfer(
    state: &RuntimeState,
    analysis: &TransferAnalysis,
) -> f64 {
    let cp = &state.compiled;
    let transfer = analysis.transfer;
    let session_idx = transfer.session_idx;

    let mut delta = 0.0;
    for &idx in &cp.should_together_pairs_by_person[transfer.person_idx] {
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
        let after_violation = !same_group_after_transfer(state, analysis, session_idx, left, right);
        match (before_violation, after_violation) {
            (false, true) => delta += constraint.penalty_weight,
            (true, false) => delta -= constraint.penalty_weight,
            _ => {}
        }
    }

    delta
}

fn pair_meeting_penalty_delta_for_transfer(
    state: &RuntimeState,
    analysis: &TransferAnalysis,
) -> f64 {
    let cp = &state.compiled;
    let transfer = analysis.transfer;
    let session_idx = transfer.session_idx;

    let mut delta = 0.0;
    for &idx in &cp.pair_meeting_constraints_by_person[transfer.person_idx] {
        let constraint = &cp.pair_meeting_constraints[idx];
        if !constraint.sessions.contains(&session_idx) {
            continue;
        }

        let old_meetings = count_pair_meetings_for_constraint(state, constraint);
        let before_meeting =
            same_group_in_session(state, session_idx, constraint.people.0, constraint.people.1);
        let after_meeting = same_group_after_transfer(
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

fn attribute_balance_penalty_delta_for_transfer(
    state: &RuntimeState,
    analysis: &TransferAnalysis,
) -> f64 {
    let cp = &state.compiled;
    let transfer = analysis.transfer;
    let session_idx = transfer.session_idx;

    let mut delta = 0.0;
    for group_idx in [transfer.source_group_idx, transfer.target_group_idx] {
        let slot = cp.group_session_slot(session_idx, group_idx);
        let before_members = &state.group_members[state.group_slot(session_idx, group_idx)];
        let after_members = members_after_transfer_for_group(state, analysis, group_idx);

        for &cidx in &cp.attribute_balance_constraints_by_group_session[slot] {
            let constraint = &cp.attribute_balance_constraints[cidx];
            delta +=
                attribute_balance_penalty_for_members(cp, constraint, after_members.as_slice())
                    - attribute_balance_penalty_for_members(cp, constraint, before_members);
        }
    }

    delta
}

fn members_after_transfer_for_group(
    state: &RuntimeState,
    analysis: &TransferAnalysis,
    group_idx: usize,
) -> Vec<usize> {
    let transfer = analysis.transfer;
    let session_idx = transfer.session_idx;
    let mut members = state.group_members[state.group_slot(session_idx, group_idx)].clone();

    if group_idx == transfer.source_group_idx {
        members.retain(|member| *member != transfer.person_idx);
    } else if group_idx == transfer.target_group_idx {
        members.push(transfer.person_idx);
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

fn same_group_after_transfer(
    state: &RuntimeState,
    analysis: &TransferAnalysis,
    session_idx: usize,
    left_person_idx: usize,
    right_person_idx: usize,
) -> bool {
    let left_group = group_after_transfer(state, analysis, session_idx, left_person_idx);
    let right_group = group_after_transfer(state, analysis, session_idx, right_person_idx);
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

fn group_after_transfer(
    state: &RuntimeState,
    analysis: &TransferAnalysis,
    session_idx: usize,
    person_idx: usize,
) -> Option<usize> {
    if session_idx != analysis.transfer.session_idx {
        return state.person_location[state.people_slot(session_idx, person_idx)];
    }

    if person_idx == analysis.transfer.person_idx {
        return Some(analysis.transfer.target_group_idx);
    }

    state.person_location[state.people_slot(session_idx, person_idx)]
}

fn is_active_in_session(sessions: Option<&[usize]>, session_idx: usize) -> bool {
    sessions
        .map(|list| list.contains(&session_idx))
        .unwrap_or(true)
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

fn apply_transfer_direct_membership(
    state: &mut RuntimeState,
    analysis: &TransferAnalysis,
) -> Result<(), SolverError> {
    let transfer = analysis.transfer;
    let session_idx = transfer.session_idx;
    let person_idx = transfer.person_idx;
    let source_group_idx = transfer.source_group_idx;
    let target_group_idx = transfer.target_group_idx;

    let person_slot = state.people_slot(session_idx, person_idx);
    let Some(actual_group_idx) = state.person_location[person_slot] else {
        return Err(SolverError::ValidationError(format!(
            "solver3 oracle transfer apply missing location for person {} in session {}",
            person_idx, session_idx
        )));
    };
    if actual_group_idx != source_group_idx {
        return Err(SolverError::ValidationError(format!(
            "solver3 oracle transfer apply expected person {} in group {}, found {}",
            person_idx, source_group_idx, actual_group_idx
        )));
    }

    let source_slot = state.group_slot(session_idx, source_group_idx);
    let target_slot = state.group_slot(session_idx, target_group_idx);

    let Some(source_pos) = state.group_members[source_slot]
        .iter()
        .position(|&member| member == person_idx)
    else {
        return Err(SolverError::ValidationError(format!(
            "solver3 oracle transfer apply cannot find person {} in source group {}",
            person_idx, source_group_idx
        )));
    };

    state.group_members[source_slot].swap_remove(source_pos);
    state.group_sizes[source_slot] = state.group_sizes[source_slot].saturating_sub(1);
    state.group_members[target_slot].push(person_idx);
    state.group_sizes[target_slot] += 1;
    state.person_location[person_slot] = Some(target_group_idx);

    Ok(())
}
