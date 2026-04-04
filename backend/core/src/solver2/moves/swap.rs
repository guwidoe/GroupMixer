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

/// Typed swap move for `solver2`.
#[derive(Debug, Clone, PartialEq, Eq)]
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
pub struct SwapAnalysis {
    pub swap: SwapMove,
    pub affected_region: AffectedRegion,
    pub feasibility: SwapFeasibility,
    pub left_group_idx: usize,
    pub right_group_idx: usize,
}

pub fn analyze_swap(state: &SolutionState, swap: &SwapMove) -> Result<SwapAnalysis, SolverError> {
    let problem = state.compiled_problem();
    if swap.session_idx >= problem.num_sessions {
        return Err(SolverError::ValidationError(format!(
            "swap references invalid session {} (max: {})",
            swap.session_idx,
            problem.num_sessions.saturating_sub(1)
        )));
    }
    if swap.left_person_idx >= problem.num_people || swap.right_person_idx >= problem.num_people {
        return Err(SolverError::ValidationError(format!(
            "swap references invalid person indices ({}, {}) (max: {})",
            swap.left_person_idx,
            swap.right_person_idx,
            problem.num_people.saturating_sub(1)
        )));
    }

    let left_location = state.locations[swap.session_idx][swap.left_person_idx];
    let right_location = state.locations[swap.session_idx][swap.right_person_idx];
    let left_group_idx = left_location.map(|location| location.0).unwrap_or(0);
    let right_group_idx = right_location.map(|location| location.0).unwrap_or(0);

    let feasibility = if !problem.person_participation[swap.left_person_idx][swap.session_idx] {
        SwapFeasibility::NonParticipatingPerson {
            person_idx: swap.left_person_idx,
        }
    } else if !problem.person_participation[swap.right_person_idx][swap.session_idx] {
        SwapFeasibility::NonParticipatingPerson {
            person_idx: swap.right_person_idx,
        }
    } else if left_location.is_none() {
        SwapFeasibility::MissingLocation {
            person_idx: swap.left_person_idx,
        }
    } else if right_location.is_none() {
        SwapFeasibility::MissingLocation {
            person_idx: swap.right_person_idx,
        }
    } else if left_group_idx == right_group_idx {
        SwapFeasibility::SameGroupNoop
    } else if let Some(&required_group_idx) = problem
        .immovable_lookup
        .get(&(swap.left_person_idx, swap.session_idx))
    {
        SwapFeasibility::ImmovablePerson {
            person_idx: swap.left_person_idx,
            required_group_idx,
        }
    } else if let Some(&required_group_idx) = problem
        .immovable_lookup
        .get(&(swap.right_person_idx, swap.session_idx))
    {
        SwapFeasibility::ImmovablePerson {
            person_idx: swap.right_person_idx,
            required_group_idx,
        }
    } else if let Some(clique_idx) =
        problem.person_to_clique_id[swap.session_idx][swap.left_person_idx]
    {
        SwapFeasibility::ActiveCliqueMember {
            person_idx: swap.left_person_idx,
            clique_idx,
        }
    } else if let Some(clique_idx) =
        problem.person_to_clique_id[swap.session_idx][swap.right_person_idx]
    {
        SwapFeasibility::ActiveCliqueMember {
            person_idx: swap.right_person_idx,
            clique_idx,
        }
    } else {
        SwapFeasibility::Feasible
    };

    Ok(SwapAnalysis {
        swap: swap.clone(),
        affected_region: build_affected_region(state, swap, left_group_idx, right_group_idx),
        feasibility,
        left_group_idx,
        right_group_idx,
    })
}

pub fn preview_swap(state: &SolutionState, swap: &SwapMove) -> Result<MovePreview, SolverError> {
    let analysis = analyze_swap(state, swap)?;
    let before_score = state.current_score.clone();

    let after_score = match analysis.feasibility {
        SwapFeasibility::Feasible => {
            let mut preview_state = state.clone();
            apply_swap_unchecked(&mut preview_state, &analysis)?;
            recompute_full_score(&preview_state)?
        }
        SwapFeasibility::SameGroupNoop => before_score.clone(),
        ref infeasible => {
            return Err(SolverError::ValidationError(format!(
                "solver2 swap is not feasible: {infeasible}"
            )));
        }
    };

    Ok(MovePreview {
        candidate: CandidateMove::Swap(swap.clone()),
        affected_region: analysis.affected_region,
        delta_cost: after_score.total_score - before_score.total_score,
        before_score,
        after_score,
    })
}

pub fn preview_swap_runtime(
    state: &RuntimeSolutionState,
    swap: &SwapMove,
) -> Result<MovePreview, SolverError> {
    let analysis = analyze_swap(state.as_oracle_state(), swap)?;
    let before_score = state.current_score.clone();

    let after_score = match analysis.feasibility {
        SwapFeasibility::Feasible => preview_swap_incremental(state.as_oracle_state(), &analysis)?,
        SwapFeasibility::SameGroupNoop => before_score.clone(),
        ref infeasible => {
            return Err(SolverError::ValidationError(format!(
                "solver2 swap is not feasible: {infeasible}"
            )));
        }
    };

    Ok(MovePreview {
        candidate: CandidateMove::Swap(swap.clone()),
        affected_region: analysis.affected_region,
        delta_cost: after_score.total_score - before_score.total_score,
        before_score,
        after_score,
    })
}

pub fn apply_swap(state: &mut SolutionState, swap: &SwapMove) -> Result<(), SolverError> {
    apply_swap_with_score(state, swap, None)
}

pub(crate) fn apply_swap_with_score(
    state: &mut SolutionState,
    swap: &SwapMove,
    score_after_apply: Option<&FullScoreSnapshot>,
) -> Result<(), SolverError> {
    let analysis = analyze_swap(state, swap)?;
    match analysis.feasibility {
        SwapFeasibility::Feasible => {
            apply_swap_unchecked(state, &analysis)?;
            state.current_score = match score_after_apply {
                Some(score) => score.clone(),
                None => recompute_full_score(state)?,
            };
            debug_validate_applied_swap(state);
            Ok(())
        }
        SwapFeasibility::SameGroupNoop => Ok(()),
        ref infeasible => Err(SolverError::ValidationError(format!(
            "solver2 swap is not feasible: {infeasible}"
        ))),
    }
}

pub fn apply_swap_runtime_with_score(
    state: &mut RuntimeSolutionState,
    swap: &SwapMove,
    score_after_apply: &FullScoreSnapshot,
) -> Result<(), SolverError> {
    let analysis = analyze_swap(state.as_oracle_state(), swap)?;
    match analysis.feasibility {
        SwapFeasibility::Feasible => {
            apply_swap_unchecked(state.as_oracle_state_mut(), &analysis)?;
            state.current_score = score_after_apply.clone();
            debug_assert!(validate_state_invariants(state.as_oracle_state()).is_ok());
            Ok(())
        }
        SwapFeasibility::SameGroupNoop => Ok(()),
        ref infeasible => Err(SolverError::ValidationError(format!(
            "solver2 swap is not feasible: {infeasible}"
        ))),
    }
}

fn preview_swap_incremental(
    state: &SolutionState,
    analysis: &SwapAnalysis,
) -> Result<FullScoreSnapshot, SolverError> {
    let problem = state.compiled_problem();
    let session_idx = analysis.swap.session_idx;
    let left_person_idx = analysis.swap.left_person_idx;
    let right_person_idx = analysis.swap.right_person_idx;

    let mut after_score = state.current_score.clone();

    for &member in &state.schedule[session_idx][analysis.left_group_idx] {
        if member == left_person_idx {
            continue;
        }
        apply_contact_delta(&mut after_score, problem, left_person_idx, member, -1)?;
        apply_contact_delta(&mut after_score, problem, right_person_idx, member, 1)?;
    }

    for &member in &state.schedule[session_idx][analysis.right_group_idx] {
        if member == right_person_idx {
            continue;
        }
        apply_contact_delta(&mut after_score, problem, right_person_idx, member, -1)?;
        apply_contact_delta(&mut after_score, problem, left_person_idx, member, 1)?;
    }

    update_forbidden_pair_violations_for_swap(state, analysis, &mut after_score);
    update_should_together_violations_for_swap(state, analysis, &mut after_score);
    update_pair_meeting_counts_for_swap(state, analysis, &mut after_score);
    update_attribute_balance_penalty_for_swap(state, analysis, &mut after_score);
    refresh_aggregate_scores(problem, &mut after_score);

    Ok(after_score)
}

fn update_forbidden_pair_violations_for_swap(
    state: &SolutionState,
    analysis: &SwapAnalysis,
    snapshot: &mut FullScoreSnapshot,
) {
    let problem = state.compiled_problem();
    for constraint_idx in affected_constraint_indices(
        &problem.forbidden_pairs_by_person[analysis.swap.left_person_idx],
        &problem.forbidden_pairs_by_person[analysis.swap.right_person_idx],
    ) {
        let constraint = &problem.forbidden_pairs[constraint_idx];
        let new_violations = count_pair_constraint_violations_after_swap(
            state,
            analysis,
            constraint.people,
            constraint.sessions.as_deref(),
            true,
        );
        let old_violations = snapshot.forbidden_pair_violations[constraint_idx];
        snapshot.forbidden_pair_violations[constraint_idx] = new_violations;
        snapshot.weighted_constraint_penalty +=
            (new_violations - old_violations) as f64 * constraint.penalty_weight;
    }
}

fn update_should_together_violations_for_swap(
    state: &SolutionState,
    analysis: &SwapAnalysis,
    snapshot: &mut FullScoreSnapshot,
) {
    let problem = state.compiled_problem();
    for constraint_idx in affected_constraint_indices(
        &problem.should_together_pairs_by_person[analysis.swap.left_person_idx],
        &problem.should_together_pairs_by_person[analysis.swap.right_person_idx],
    ) {
        let constraint = &problem.should_together_pairs[constraint_idx];
        let new_violations = count_pair_constraint_violations_after_swap(
            state,
            analysis,
            constraint.people,
            constraint.sessions.as_deref(),
            false,
        );
        let old_violations = snapshot.should_together_violations[constraint_idx];
        snapshot.should_together_violations[constraint_idx] = new_violations;
        snapshot.weighted_constraint_penalty +=
            (new_violations - old_violations) as f64 * constraint.penalty_weight;
    }
}

fn update_pair_meeting_counts_for_swap(
    state: &SolutionState,
    analysis: &SwapAnalysis,
    snapshot: &mut FullScoreSnapshot,
) {
    let problem = state.compiled_problem();
    for constraint_idx in affected_constraint_indices(
        &problem.pair_meeting_constraints_by_person[analysis.swap.left_person_idx],
        &problem.pair_meeting_constraints_by_person[analysis.swap.right_person_idx],
    ) {
        let constraint = &problem.pair_meeting_constraints[constraint_idx];
        let new_meetings = count_pair_meetings_after_swap(state, analysis, constraint);
        let old_meetings = snapshot.pair_meeting_counts[constraint_idx];
        let old_penalty = pair_meeting_penalty(constraint, old_meetings);
        let new_penalty = pair_meeting_penalty(constraint, new_meetings);
        snapshot.pair_meeting_counts[constraint_idx] = new_meetings;
        snapshot.weighted_constraint_penalty += new_penalty - old_penalty;
    }
}

fn update_attribute_balance_penalty_for_swap(
    state: &SolutionState,
    analysis: &SwapAnalysis,
    snapshot: &mut FullScoreSnapshot,
) {
    let problem = state.compiled_problem();
    let session_idx = analysis.swap.session_idx;

    for group_idx in [analysis.left_group_idx, analysis.right_group_idx] {
        let slot = problem.flat_group_session_slot(session_idx, group_idx);
        let before_members = &state.schedule[session_idx][group_idx];
        let after_members = swapped_group_members(state, analysis, group_idx);

        for &constraint_idx in &problem.attribute_balance_constraints_by_group_session[slot] {
            let constraint = &problem.attribute_balance_constraints[constraint_idx];
            let before_penalty =
                attribute_balance_penalty_for_members(problem, before_members, constraint);
            let after_penalty =
                attribute_balance_penalty_for_members(problem, &after_members, constraint);
            snapshot.attribute_balance_penalty += after_penalty - before_penalty;
        }
    }
}

fn swapped_group_members(
    state: &SolutionState,
    analysis: &SwapAnalysis,
    group_idx: usize,
) -> Vec<usize> {
    let mut members = state.schedule[analysis.swap.session_idx][group_idx].clone();
    if group_idx == analysis.left_group_idx {
        for member in &mut members {
            if *member == analysis.swap.left_person_idx {
                *member = analysis.swap.right_person_idx;
                break;
            }
        }
    } else {
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

fn count_pair_constraint_violations_after_swap(
    state: &SolutionState,
    analysis: &SwapAnalysis,
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
    analysis: &SwapAnalysis,
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

    let left_group = group_for_person_after_swap(state, analysis, session_idx, left_person);
    let right_group = group_for_person_after_swap(state, analysis, session_idx, right_person);
    if forbidden_when_together {
        left_group.is_some() && left_group == right_group
    } else {
        left_group != right_group
    }
}

fn count_pair_meetings_after_swap(
    state: &SolutionState,
    analysis: &SwapAnalysis,
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

        let left_group = group_for_person_after_swap(state, analysis, session_idx, left_person);
        let right_group = group_for_person_after_swap(state, analysis, session_idx, right_person);
        if left_group.is_some() && left_group == right_group {
            meetings += 1;
        }
    }

    meetings
}

fn group_for_person_after_swap(
    state: &SolutionState,
    analysis: &SwapAnalysis,
    session_idx: usize,
    person_idx: usize,
) -> Option<usize> {
    if session_idx != analysis.swap.session_idx {
        return state.locations[session_idx][person_idx].map(|location| location.0);
    }
    if person_idx == analysis.swap.left_person_idx {
        return Some(analysis.right_group_idx);
    }
    if person_idx == analysis.swap.right_person_idx {
        return Some(analysis.left_group_idx);
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

fn affected_constraint_indices(left: &[usize], right: &[usize]) -> Vec<usize> {
    let mut indices = left.to_vec();
    indices.extend_from_slice(right);
    indices.sort_unstable();
    indices.dedup();
    indices
}

fn apply_contact_delta(
    snapshot: &mut FullScoreSnapshot,
    problem: &CompiledProblem,
    left_person_idx: usize,
    right_person_idx: usize,
    delta: i32,
) -> Result<(), SolverError> {
    let current = snapshot.contact_matrix[left_person_idx][right_person_idx];
    let updated = current as i32 + delta;
    if updated < 0 {
        return Err(SolverError::ValidationError(format!(
            "solver2 swap runtime preview would make contact count negative for ({}, {})",
            problem.display_person_idx(left_person_idx),
            problem.display_person_idx(right_person_idx)
        )));
    }
    let updated = updated as u32;

    if current == 0 && updated > 0 {
        snapshot.unique_contacts += 1;
    } else if current > 0 && updated == 0 {
        snapshot.unique_contacts -= 1;
    }

    if let Some(repeat) = &problem.repeat_encounter {
        let old_penalty = repeat
            .penalty_function
            .penalty_for_excess(current.saturating_sub(repeat.max_allowed_encounters));
        let new_penalty = repeat
            .penalty_function
            .penalty_for_excess(updated.saturating_sub(repeat.max_allowed_encounters));
        let delta_penalty = new_penalty - old_penalty;
        snapshot.repetition_penalty += delta_penalty;
        snapshot.weighted_repetition_penalty += delta_penalty as f64 * repeat.penalty_weight;
    }

    snapshot.contact_matrix[left_person_idx][right_person_idx] = updated;
    snapshot.contact_matrix[right_person_idx][left_person_idx] = updated;

    Ok(())
}

fn refresh_aggregate_scores(problem: &CompiledProblem, snapshot: &mut FullScoreSnapshot) {
    snapshot.constraint_penalty = snapshot.forbidden_pair_violations.iter().sum::<i32>()
        + snapshot.should_together_violations.iter().sum::<i32>()
        + snapshot.clique_violations.iter().sum::<i32>()
        + snapshot.immovable_violations
        + pair_meeting_violation_count(problem, snapshot);
    snapshot.total_score = snapshot.weighted_repetition_penalty
        + snapshot.attribute_balance_penalty
        + snapshot.weighted_constraint_penalty
        - (snapshot.unique_contacts as f64 * problem.maximize_unique_contacts_weight)
        + problem.baseline_score;
}

fn pair_meeting_violation_count(problem: &CompiledProblem, snapshot: &FullScoreSnapshot) -> i32 {
    let mut count = 0;
    for (constraint_idx, constraint) in problem.pair_meeting_constraints.iter().enumerate() {
        let target = constraint.target_meetings as i32;
        let have = snapshot.pair_meeting_counts[constraint_idx] as i32;
        let raw_violation = match constraint.mode {
            PairMeetingMode::AtLeast => (target - have).max(0),
            PairMeetingMode::Exact => (have - target).abs(),
            PairMeetingMode::AtMost => (have - target).max(0),
        };
        if raw_violation > 0 && constraint.penalty_weight > 0.0 {
            count += 1;
        }
    }
    count
}

fn build_affected_region(
    state: &SolutionState,
    swap: &SwapMove,
    left_group_idx: usize,
    right_group_idx: usize,
) -> AffectedRegion {
    AffectedRegion::from_groups_and_people(
        state.compiled_problem(),
        swap.session_idx,
        &[left_group_idx, right_group_idx],
        &[swap.left_person_idx, swap.right_person_idx],
    )
}

fn debug_validate_applied_swap(state: &SolutionState) {
    debug_assert!(validate_state_invariants(state).is_ok());
    #[cfg(debug_assertions)]
    {
        let recomputed_score = recompute_full_score(state).expect("swap recomputation should work");
        debug_assert_eq!(recomputed_score, state.current_score);
    }
}

fn apply_swap_unchecked(
    state: &mut SolutionState,
    analysis: &SwapAnalysis,
) -> Result<(), SolverError> {
    let session_idx = analysis.swap.session_idx;
    let left_person_idx = analysis.swap.left_person_idx;
    let right_person_idx = analysis.swap.right_person_idx;

    let Some((left_group_idx, left_position_idx)) = state.locations[session_idx][left_person_idx]
    else {
        return Err(SolverError::ValidationError(format!(
            "swap cannot apply because person {} is missing a location in session {}",
            state.compiled_problem.display_person_idx(left_person_idx),
            session_idx
        )));
    };
    let Some((right_group_idx, right_position_idx)) =
        state.locations[session_idx][right_person_idx]
    else {
        return Err(SolverError::ValidationError(format!(
            "swap cannot apply because person {} is missing a location in session {}",
            state.compiled_problem.display_person_idx(right_person_idx),
            session_idx
        )));
    };

    state.schedule[session_idx][left_group_idx][left_position_idx] = right_person_idx;
    state.schedule[session_idx][right_group_idx][right_position_idx] = left_person_idx;
    state.locations[session_idx][left_person_idx] = Some((right_group_idx, right_position_idx));
    state.locations[session_idx][right_person_idx] = Some((left_group_idx, left_position_idx));

    Ok(())
}
