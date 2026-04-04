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

/// Typed transfer move for `solver2`.
#[derive(Debug, Clone, PartialEq, Eq)]
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
            Self::SourceWouldBeEmpty { source_group_idx } => write!(
                f,
                "source group {source_group_idx} would become empty after the transfer"
            ),
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
    pub affected_region: AffectedRegion,
    pub feasibility: TransferFeasibility,
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
pub(crate) struct TransferRuntimePatch {
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
pub struct TransferRuntimePreview {
    pub(crate) analysis: TransferAnalysis,
    pub(crate) patch: TransferRuntimePatch,
    pub delta_cost: f64,
}

pub fn analyze_transfer(
    state: &SolutionState,
    transfer: &TransferMove,
) -> Result<TransferAnalysis, SolverError> {
    let problem = &state.compiled_problem;
    if transfer.session_idx >= problem.num_sessions {
        return Err(SolverError::ValidationError(format!(
            "transfer references invalid session {} (max: {})",
            transfer.session_idx,
            problem.num_sessions.saturating_sub(1)
        )));
    }
    if transfer.person_idx >= problem.num_people {
        return Err(SolverError::ValidationError(format!(
            "transfer references invalid person index {} (max: {})",
            transfer.person_idx,
            problem.num_people.saturating_sub(1)
        )));
    }
    if transfer.source_group_idx >= problem.num_groups
        || transfer.target_group_idx >= problem.num_groups
    {
        return Err(SolverError::ValidationError(format!(
            "transfer references invalid group indices ({}, {}) (max: {})",
            transfer.source_group_idx,
            transfer.target_group_idx,
            problem.num_groups.saturating_sub(1)
        )));
    }

    let location = state.locations[transfer.session_idx][transfer.person_idx];
    let touched_people = touched_people_for_transfer(state, transfer);
    let affected_region = AffectedRegion::from_groups_and_people(
        problem,
        transfer.session_idx,
        &[transfer.source_group_idx, transfer.target_group_idx],
        &touched_people,
    );

    let feasibility = if !problem.person_participation[transfer.person_idx][transfer.session_idx] {
        TransferFeasibility::NonParticipatingPerson {
            person_idx: transfer.person_idx,
        }
    } else if transfer.source_group_idx == transfer.target_group_idx {
        TransferFeasibility::SameGroupNoop
    } else if location.is_none() {
        TransferFeasibility::MissingLocation {
            person_idx: transfer.person_idx,
        }
    } else if location.map(|entry| entry.0) != Some(transfer.source_group_idx) {
        TransferFeasibility::WrongSourceGroup {
            person_idx: transfer.person_idx,
            actual_group_idx: location.expect("checked above").0,
        }
    } else if state.schedule[transfer.session_idx][transfer.source_group_idx].len() <= 1 {
        TransferFeasibility::SourceWouldBeEmpty {
            source_group_idx: transfer.source_group_idx,
        }
    } else if state.schedule[transfer.session_idx][transfer.target_group_idx].len()
        >= problem.group_capacity(transfer.session_idx, transfer.target_group_idx)
    {
        TransferFeasibility::TargetGroupFull {
            target_group_idx: transfer.target_group_idx,
            capacity: problem.group_capacity(transfer.session_idx, transfer.target_group_idx),
        }
    } else if let Some(&required_group_idx) = problem
        .immovable_lookup
        .get(&(transfer.person_idx, transfer.session_idx))
    {
        TransferFeasibility::ImmovablePerson {
            person_idx: transfer.person_idx,
            required_group_idx,
        }
    } else if let Some(clique_idx) =
        problem.person_to_clique_id[transfer.session_idx][transfer.person_idx]
    {
        TransferFeasibility::ActiveCliqueMember {
            person_idx: transfer.person_idx,
            clique_idx,
        }
    } else {
        TransferFeasibility::Feasible
    };

    Ok(TransferAnalysis {
        transfer: transfer.clone(),
        affected_region,
        feasibility,
    })
}

pub fn preview_transfer(
    state: &SolutionState,
    transfer: &TransferMove,
) -> Result<MovePreview, SolverError> {
    let analysis = analyze_transfer(state, transfer)?;
    let before_score = state.current_score.clone();
    let after_score = match analysis.feasibility {
        TransferFeasibility::Feasible => {
            let mut preview_state = state.clone();
            apply_transfer_unchecked(&mut preview_state, &analysis)?;
            recompute_full_score(&preview_state)?
        }
        TransferFeasibility::SameGroupNoop => before_score.clone(),
        ref infeasible => {
            return Err(SolverError::ValidationError(format!(
                "solver2 transfer is not feasible: {infeasible}"
            )));
        }
    };

    Ok(MovePreview {
        candidate: CandidateMove::Transfer(transfer.clone()),
        affected_region: analysis.affected_region,
        delta_cost: after_score.total_score - before_score.total_score,
        before_score,
        after_score,
    })
}

pub fn preview_transfer_runtime(
    state: &RuntimeSolutionState,
    transfer: &TransferMove,
) -> Result<MovePreview, SolverError> {
    let runtime_preview = preview_transfer_runtime_lightweight(state, transfer)?;
    let before_score = state.current_score.clone();
    let after_score = materialize_score_after_patch(
        state.compiled_problem(),
        &state.current_score,
        &runtime_preview.patch,
    );

    Ok(MovePreview {
        candidate: CandidateMove::Transfer(transfer.clone()),
        affected_region: runtime_preview.analysis.affected_region,
        delta_cost: runtime_preview.delta_cost,
        before_score,
        after_score,
    })
}

pub fn preview_transfer_runtime_lightweight(
    state: &RuntimeSolutionState,
    transfer: &TransferMove,
) -> Result<TransferRuntimePreview, SolverError> {
    let analysis = analyze_transfer(state.as_oracle_state(), transfer)?;
    let patch = match analysis.feasibility {
        TransferFeasibility::Feasible => {
            build_runtime_transfer_patch(state.as_oracle_state(), &analysis)?
        }
        TransferFeasibility::SameGroupNoop => TransferRuntimePatch::default(),
        ref infeasible => {
            return Err(SolverError::ValidationError(format!(
                "solver2 transfer is not feasible: {infeasible}"
            )));
        }
    };

    Ok(TransferRuntimePreview {
        delta_cost: patch.total_score_delta,
        analysis,
        patch,
    })
}

pub fn apply_transfer(
    state: &mut SolutionState,
    transfer: &TransferMove,
) -> Result<(), SolverError> {
    apply_transfer_with_score(state, transfer, None)
}

pub(crate) fn apply_transfer_with_score(
    state: &mut SolutionState,
    transfer: &TransferMove,
    score_after_apply: Option<&FullScoreSnapshot>,
) -> Result<(), SolverError> {
    let analysis = analyze_transfer(state, transfer)?;
    match analysis.feasibility {
        TransferFeasibility::Feasible => {
            apply_transfer_unchecked(state, &analysis)?;
            state.current_score = match score_after_apply {
                Some(score) => score.clone(),
                None => recompute_full_score(state)?,
            };
            debug_validate_applied_transfer(state);
            Ok(())
        }
        TransferFeasibility::SameGroupNoop => Ok(()),
        ref infeasible => Err(SolverError::ValidationError(format!(
            "solver2 transfer is not feasible: {infeasible}"
        ))),
    }
}

pub fn apply_transfer_runtime_preview(
    state: &mut RuntimeSolutionState,
    preview: &TransferRuntimePreview,
) -> Result<(), SolverError> {
    match preview.analysis.feasibility {
        TransferFeasibility::Feasible => {
            let compiled_problem = state.compiled_problem_arc().clone();
            apply_transfer_unchecked(state.as_oracle_state_mut(), &preview.analysis)?;
            apply_runtime_transfer_patch_to_snapshot(
                compiled_problem.as_ref(),
                &mut state.current_score,
                &preview.patch,
            );
            debug_assert!(validate_state_invariants(state.as_oracle_state()).is_ok());
            Ok(())
        }
        TransferFeasibility::SameGroupNoop => Ok(()),
        ref infeasible => Err(SolverError::ValidationError(format!(
            "solver2 transfer is not feasible: {infeasible}"
        ))),
    }
}

fn build_runtime_transfer_patch(
    state: &SolutionState,
    analysis: &TransferAnalysis,
) -> Result<TransferRuntimePatch, SolverError> {
    let problem = state.compiled_problem();
    let transfer = &analysis.transfer;
    let session_idx = transfer.session_idx;
    let person_idx = transfer.person_idx;
    let mut patch = TransferRuntimePatch::default();

    for &member in &state.schedule[session_idx][transfer.source_group_idx] {
        if member == person_idx {
            continue;
        }
        record_contact_update(
            &mut patch,
            &state.current_score,
            problem,
            person_idx,
            member,
            -1,
        )?;
    }
    for &member in &state.schedule[session_idx][transfer.target_group_idx] {
        record_contact_update(
            &mut patch,
            &state.current_score,
            problem,
            person_idx,
            member,
            1,
        )?;
    }

    record_forbidden_pair_updates_for_transfer(state, analysis, &mut patch);
    record_should_together_updates_for_transfer(state, analysis, &mut patch);
    record_pair_meeting_updates_for_transfer(state, analysis, &mut patch);
    record_attribute_balance_delta_for_transfer(state, analysis, &mut patch);

    patch.total_score_delta = patch.weighted_repetition_penalty_delta
        + patch.attribute_balance_penalty_delta
        + patch.weighted_constraint_penalty_delta
        - (patch.unique_contacts_delta as f64 * problem.maximize_unique_contacts_weight);

    Ok(patch)
}

fn materialize_score_after_patch(
    problem: &CompiledProblem,
    before_score: &FullScoreSnapshot,
    patch: &TransferRuntimePatch,
) -> FullScoreSnapshot {
    let mut after_score = before_score.clone();
    apply_runtime_transfer_patch_to_snapshot(problem, &mut after_score, patch);
    after_score
}

fn apply_runtime_transfer_patch_to_snapshot(
    problem: &CompiledProblem,
    snapshot: &mut FullScoreSnapshot,
    patch: &TransferRuntimePatch,
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

fn record_forbidden_pair_updates_for_transfer(
    state: &SolutionState,
    analysis: &TransferAnalysis,
    patch: &mut TransferRuntimePatch,
) {
    let problem = state.compiled_problem();
    let person_idx = analysis.transfer.person_idx;
    for &constraint_idx in &problem.forbidden_pairs_by_person[person_idx] {
        let constraint = &problem.forbidden_pairs[constraint_idx];
        let new_violations = count_pair_constraint_violations_after_transfer(
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

fn record_should_together_updates_for_transfer(
    state: &SolutionState,
    analysis: &TransferAnalysis,
    patch: &mut TransferRuntimePatch,
) {
    let problem = state.compiled_problem();
    let person_idx = analysis.transfer.person_idx;
    for &constraint_idx in &problem.should_together_pairs_by_person[person_idx] {
        let constraint = &problem.should_together_pairs[constraint_idx];
        let new_violations = count_pair_constraint_violations_after_transfer(
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

fn record_pair_meeting_updates_for_transfer(
    state: &SolutionState,
    analysis: &TransferAnalysis,
    patch: &mut TransferRuntimePatch,
) {
    let problem = state.compiled_problem();
    let person_idx = analysis.transfer.person_idx;
    for &constraint_idx in &problem.pair_meeting_constraints_by_person[person_idx] {
        let constraint = &problem.pair_meeting_constraints[constraint_idx];
        let new_meetings = count_pair_meetings_after_transfer(state, analysis, constraint);
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

fn record_attribute_balance_delta_for_transfer(
    state: &SolutionState,
    analysis: &TransferAnalysis,
    patch: &mut TransferRuntimePatch,
) {
    let problem = state.compiled_problem();
    let transfer = &analysis.transfer;
    for group_idx in [transfer.source_group_idx, transfer.target_group_idx] {
        let slot = problem.flat_group_session_slot(transfer.session_idx, group_idx);
        let before_members = &state.schedule[transfer.session_idx][group_idx];
        let after_members = transferred_group_members(state, analysis, group_idx);

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

fn transferred_group_members(
    state: &SolutionState,
    analysis: &TransferAnalysis,
    group_idx: usize,
) -> Vec<usize> {
    let transfer = &analysis.transfer;
    let mut members = state.schedule[transfer.session_idx][group_idx].clone();
    if group_idx == transfer.source_group_idx {
        members.retain(|member| *member != transfer.person_idx);
    } else if group_idx == transfer.target_group_idx {
        members.push(transfer.person_idx);
    }
    members
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

fn count_pair_constraint_violations_after_transfer(
    state: &SolutionState,
    analysis: &TransferAnalysis,
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
    analysis: &TransferAnalysis,
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

    let left_group = group_for_person_after_transfer(state, analysis, session_idx, left_person);
    let right_group = group_for_person_after_transfer(state, analysis, session_idx, right_person);
    if forbidden_when_together {
        left_group.is_some() && left_group == right_group
    } else {
        left_group != right_group
    }
}

fn count_pair_meetings_after_transfer(
    state: &SolutionState,
    analysis: &TransferAnalysis,
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
        let left_group = group_for_person_after_transfer(state, analysis, session_idx, left_person);
        let right_group =
            group_for_person_after_transfer(state, analysis, session_idx, right_person);
        if left_group.is_some() && left_group == right_group {
            meetings += 1;
        }
    }
    meetings
}

fn group_for_person_after_transfer(
    state: &SolutionState,
    analysis: &TransferAnalysis,
    session_idx: usize,
    person_idx: usize,
) -> Option<usize> {
    if session_idx != analysis.transfer.session_idx {
        return state.locations[session_idx][person_idx].map(|location| location.0);
    }
    if person_idx == analysis.transfer.person_idx {
        return Some(analysis.transfer.target_group_idx);
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
    patch: &mut TransferRuntimePatch,
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
            "solver2 transfer runtime preview would make contact count negative for ({}, {})",
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

fn touched_people_for_transfer(state: &SolutionState, transfer: &TransferMove) -> Vec<usize> {
    let mut touched = state.schedule[transfer.session_idx][transfer.source_group_idx].clone();
    touched.extend_from_slice(&state.schedule[transfer.session_idx][transfer.target_group_idx]);
    touched.push(transfer.person_idx);
    touched.sort_unstable();
    touched.dedup();
    touched
}

fn debug_validate_applied_transfer(state: &SolutionState) {
    debug_assert!(validate_state_invariants(state).is_ok());
    #[cfg(debug_assertions)]
    {
        let recomputed_score =
            recompute_full_score(state).expect("transfer recomputation should work");
        debug_assert_eq!(recomputed_score, state.current_score);
    }
}

fn apply_transfer_unchecked(
    state: &mut SolutionState,
    analysis: &TransferAnalysis,
) -> Result<(), SolverError> {
    let transfer = &analysis.transfer;
    let session_idx = transfer.session_idx;
    let person_idx = transfer.person_idx;
    let source_group_idx = transfer.source_group_idx;
    let target_group_idx = transfer.target_group_idx;

    let Some((actual_group_idx, source_position_idx)) = state.locations[session_idx][person_idx]
    else {
        return Err(SolverError::ValidationError(format!(
            "transfer cannot apply because person {} is missing a location in session {}",
            state.compiled_problem.display_person_idx(person_idx),
            session_idx
        )));
    };
    if actual_group_idx != source_group_idx {
        return Err(SolverError::ValidationError(format!(
            "transfer cannot apply because person {} is in group {} instead of source group {}",
            state.compiled_problem.display_person_idx(person_idx),
            state.compiled_problem.display_group_idx(actual_group_idx),
            state.compiled_problem.display_group_idx(source_group_idx),
        )));
    }

    state.schedule[session_idx][source_group_idx].remove(source_position_idx);
    let target_position_idx = state.schedule[session_idx][target_group_idx].len();
    state.schedule[session_idx][target_group_idx].push(person_idx);

    rebuild_group_locations(state, session_idx, source_group_idx);
    rebuild_group_locations(state, session_idx, target_group_idx);
    state.locations[session_idx][person_idx] = Some((target_group_idx, target_position_idx));

    Ok(())
}

fn rebuild_group_locations(state: &mut SolutionState, session_idx: usize, group_idx: usize) {
    for (position_idx, &member) in state.schedule[session_idx][group_idx].iter().enumerate() {
        state.locations[session_idx][member] = Some((group_idx, position_idx));
    }
}
