use crate::models::{AttributeBalanceMode, PairMeetingMode};
use crate::solver_support::SolverError;

use super::super::compiled_problem::CompiledProblem;
use super::super::SolutionState;

/// Correctness-first output for the full-recomputation scoring path.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct FullScoreSnapshot {
    pub total_score: f64,
    pub baseline_score: f64,
    pub unique_contacts: i32,
    pub repetition_penalty: i32,
    pub weighted_repetition_penalty: f64,
    pub attribute_balance_penalty: f64,
    pub constraint_penalty: i32,
    pub weighted_constraint_penalty: f64,
    pub clique_violations: Vec<i32>,
    pub forbidden_pair_violations: Vec<i32>,
    pub should_together_violations: Vec<i32>,
    pub immovable_violations: i32,
    pub pair_meeting_counts: Vec<u32>,
    pub contact_matrix: Vec<Vec<u32>>,
}

/// Recomputes the complete observable score surface from immutable compiled data + mutable state.
pub fn recompute_full_score(state: &SolutionState) -> Result<FullScoreSnapshot, SolverError> {
    let problem = &state.compiled_problem;
    validate_state_shape(problem, state)?;

    let mut snapshot = FullScoreSnapshot {
        baseline_score: problem.baseline_score,
        clique_violations: vec![0; problem.cliques.len()],
        forbidden_pair_violations: vec![0; problem.forbidden_pairs.len()],
        should_together_violations: vec![0; problem.should_together_pairs.len()],
        pair_meeting_counts: vec![0; problem.pair_meeting_constraints.len()],
        contact_matrix: vec![vec![0; problem.num_people]; problem.num_people],
        ..FullScoreSnapshot::default()
    };

    recompute_contacts(problem, state, &mut snapshot);
    recompute_repetition(problem, &mut snapshot);
    recompute_attribute_balance(problem, state, &mut snapshot);
    recompute_constraints(problem, state, &mut snapshot);

    snapshot.weighted_repetition_penalty = problem
        .repeat_encounter
        .as_ref()
        .map(|repeat| snapshot.repetition_penalty as f64 * repeat.penalty_weight)
        .unwrap_or(0.0);
    snapshot.total_score = snapshot.weighted_repetition_penalty
        + snapshot.attribute_balance_penalty
        + snapshot.weighted_constraint_penalty
        - (snapshot.unique_contacts as f64 * problem.maximize_unique_contacts_weight)
        + problem.baseline_score;

    Ok(snapshot)
}

fn validate_state_shape(
    problem: &CompiledProblem,
    state: &SolutionState,
) -> Result<(), SolverError> {
    if state.schedule.len() != problem.num_sessions {
        return Err(SolverError::ValidationError(format!(
            "solver2 state has {} sessions but compiled problem expects {}",
            state.schedule.len(),
            problem.num_sessions
        )));
    }
    if state.locations.len() != problem.num_sessions {
        return Err(SolverError::ValidationError(format!(
            "solver2 state has {} location rows but compiled problem expects {} sessions",
            state.locations.len(),
            problem.num_sessions
        )));
    }

    for session_idx in 0..problem.num_sessions {
        if state.schedule[session_idx].len() != problem.num_groups {
            return Err(SolverError::ValidationError(format!(
                "solver2 state session {} has {} groups but compiled problem expects {}",
                session_idx,
                state.schedule[session_idx].len(),
                problem.num_groups
            )));
        }
        if state.locations[session_idx].len() != problem.num_people {
            return Err(SolverError::ValidationError(format!(
                "solver2 state session {} has {} person locations but compiled problem expects {}",
                session_idx,
                state.locations[session_idx].len(),
                problem.num_people
            )));
        }
    }

    Ok(())
}

fn recompute_contacts(
    problem: &CompiledProblem,
    state: &SolutionState,
    snapshot: &mut FullScoreSnapshot,
) {
    for session_idx in 0..problem.num_sessions {
        for group in &state.schedule[session_idx] {
            for left_idx in 0..group.len() {
                for right_idx in (left_idx + 1)..group.len() {
                    let left_person = group[left_idx];
                    let right_person = group[right_idx];
                    if problem.person_participation[left_person][session_idx]
                        && problem.person_participation[right_person][session_idx]
                    {
                        snapshot.contact_matrix[left_person][right_person] += 1;
                        snapshot.contact_matrix[right_person][left_person] += 1;
                    }
                }
            }
        }
    }

    for left_person in 0..problem.num_people {
        for right_person in (left_person + 1)..problem.num_people {
            if snapshot.contact_matrix[left_person][right_person] > 0 {
                snapshot.unique_contacts += 1;
            }
        }
    }
}

fn recompute_repetition(problem: &CompiledProblem, snapshot: &mut FullScoreSnapshot) {
    let Some(repeat) = &problem.repeat_encounter else {
        return;
    };

    for left_person in 0..problem.num_people {
        for right_person in (left_person + 1)..problem.num_people {
            let count = snapshot.contact_matrix[left_person][right_person];
            let excess = count.saturating_sub(repeat.max_allowed_encounters);
            snapshot.repetition_penalty += repeat.penalty_function.penalty_for_excess(excess);
        }
    }
}

fn recompute_attribute_balance(
    problem: &CompiledProblem,
    state: &SolutionState,
    snapshot: &mut FullScoreSnapshot,
) {
    for session_idx in 0..problem.num_sessions {
        for group_idx in 0..problem.num_groups {
            let slot = problem.flat_group_session_slot(session_idx, group_idx);
            let group_members = &state.schedule[session_idx][group_idx];
            for &constraint_idx in &problem.attribute_balance_constraints_by_group_session[slot] {
                let constraint = &problem.attribute_balance_constraints[constraint_idx];
                let counts = count_attribute_values(problem, group_members, constraint.attr_idx);
                let penalty = constraint
                    .desired_counts
                    .iter()
                    .map(|&(value_idx, desired_count)| {
                        let actual = counts.get(value_idx).copied().unwrap_or(0);
                        let diff = match constraint.mode {
                            AttributeBalanceMode::Exact => {
                                (actual as i32 - desired_count as i32).abs()
                            }
                            AttributeBalanceMode::AtLeast => {
                                let shortfall = desired_count as i32 - actual as i32;
                                shortfall.max(0)
                            }
                        };
                        (diff.pow(2) as f64) * constraint.penalty_weight
                    })
                    .sum::<f64>();
                snapshot.attribute_balance_penalty += penalty;
            }
        }
    }
}

fn count_attribute_values(
    problem: &CompiledProblem,
    group_members: &[usize],
    attr_idx: usize,
) -> Vec<u32> {
    let value_count = problem.attr_idx_to_val.get(attr_idx).map_or(0, Vec::len);
    let mut counts = vec![0; value_count];
    for &person_idx in group_members {
        if let Some(value_idx) = problem.person_attribute_value_indices[person_idx][attr_idx] {
            counts[value_idx] += 1;
        }
    }
    counts
}

fn recompute_constraints(
    problem: &CompiledProblem,
    state: &SolutionState,
    snapshot: &mut FullScoreSnapshot,
) {
    recompute_forbidden_pairs(problem, state, snapshot);
    recompute_should_together(problem, state, snapshot);
    recompute_pair_meeting(problem, state, snapshot);
    recompute_cliques(problem, state, snapshot);
    recompute_immovable(problem, state, snapshot);

    snapshot.constraint_penalty = snapshot.forbidden_pair_violations.iter().sum::<i32>()
        + snapshot.should_together_violations.iter().sum::<i32>()
        + snapshot.clique_violations.iter().sum::<i32>()
        + snapshot.immovable_violations
        + pair_meeting_violation_count(problem, snapshot);
}

fn recompute_forbidden_pairs(
    problem: &CompiledProblem,
    state: &SolutionState,
    snapshot: &mut FullScoreSnapshot,
) {
    for (constraint_idx, constraint) in problem.forbidden_pairs.iter().enumerate() {
        let (left_person, right_person) = constraint.people;
        for session_idx in active_sessions(constraint.sessions.as_deref(), problem.num_sessions) {
            if !problem.person_participation[left_person][session_idx]
                || !problem.person_participation[right_person][session_idx]
            {
                continue;
            }

            let left_group = state.locations[session_idx][left_person].map(|location| location.0);
            let right_group = state.locations[session_idx][right_person].map(|location| location.0);
            if left_group.is_some() && left_group == right_group {
                snapshot.forbidden_pair_violations[constraint_idx] += 1;
                snapshot.weighted_constraint_penalty += constraint.penalty_weight;
            }
        }
    }
}

fn recompute_should_together(
    problem: &CompiledProblem,
    state: &SolutionState,
    snapshot: &mut FullScoreSnapshot,
) {
    for (constraint_idx, constraint) in problem.should_together_pairs.iter().enumerate() {
        let (left_person, right_person) = constraint.people;
        for session_idx in active_sessions(constraint.sessions.as_deref(), problem.num_sessions) {
            if !problem.person_participation[left_person][session_idx]
                || !problem.person_participation[right_person][session_idx]
            {
                continue;
            }

            let left_group = state.locations[session_idx][left_person].map(|location| location.0);
            let right_group = state.locations[session_idx][right_person].map(|location| location.0);
            if left_group != right_group {
                snapshot.should_together_violations[constraint_idx] += 1;
                snapshot.weighted_constraint_penalty += constraint.penalty_weight;
            }
        }
    }
}

fn recompute_pair_meeting(
    problem: &CompiledProblem,
    state: &SolutionState,
    snapshot: &mut FullScoreSnapshot,
) {
    for (constraint_idx, constraint) in problem.pair_meeting_constraints.iter().enumerate() {
        let (left_person, right_person) = constraint.people;
        let mut meetings = 0u32;
        for &session_idx in &constraint.sessions {
            if !problem.person_participation[left_person][session_idx]
                || !problem.person_participation[right_person][session_idx]
            {
                continue;
            }

            let left_group = state.locations[session_idx][left_person].map(|location| location.0);
            let right_group = state.locations[session_idx][right_person].map(|location| location.0);
            if left_group.is_some() && left_group == right_group {
                meetings += 1;
            }
        }
        snapshot.pair_meeting_counts[constraint_idx] = meetings;

        let target = constraint.target_meetings as i32;
        let have = meetings as i32;
        let penalty = match constraint.mode {
            PairMeetingMode::AtLeast => (target - have).max(0) as f64,
            PairMeetingMode::Exact => (have - target).abs() as f64,
            PairMeetingMode::AtMost => (have - target).max(0) as f64,
        } * constraint.penalty_weight;

        if penalty > 0.0 {
            snapshot.weighted_constraint_penalty += penalty;
        }
    }
}

fn recompute_cliques(
    problem: &CompiledProblem,
    state: &SolutionState,
    snapshot: &mut FullScoreSnapshot,
) {
    for (clique_idx, clique) in problem.cliques.iter().enumerate() {
        for session_idx in active_sessions(clique.sessions.as_deref(), problem.num_sessions) {
            let participating_members = clique
                .members
                .iter()
                .copied()
                .filter(|&member| problem.person_participation[member][session_idx])
                .collect::<Vec<_>>();
            if participating_members.len() < 2 {
                continue;
            }

            let mut group_counts = vec![0; problem.num_groups];
            for member in participating_members {
                if let Some((group_idx, _)) = state.locations[session_idx][member] {
                    group_counts[group_idx] += 1;
                }
            }
            let max_in_one_group = group_counts.into_iter().max().unwrap_or(0);
            let separated_members = clique
                .members
                .iter()
                .filter(|&&member| problem.person_participation[member][session_idx])
                .count() as i32
                - max_in_one_group;
            snapshot.clique_violations[clique_idx] += separated_members.max(0);
        }
    }
}

fn recompute_immovable(
    problem: &CompiledProblem,
    state: &SolutionState,
    snapshot: &mut FullScoreSnapshot,
) {
    for assignment in &problem.immovable_assignments {
        if !problem.person_participation[assignment.person_idx][assignment.session_idx] {
            continue;
        }
        let actual_group = state.locations[assignment.session_idx][assignment.person_idx]
            .map(|location| location.0);
        if actual_group != Some(assignment.group_idx) {
            snapshot.immovable_violations += 1;
            snapshot.weighted_constraint_penalty += 1000.0;
        }
    }
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

fn active_sessions<'a>(
    sessions: Option<&'a [usize]>,
    num_sessions: usize,
) -> Box<dyn Iterator<Item = usize> + 'a> {
    match sessions {
        Some(sessions) => Box::new(sessions.iter().copied()),
        None => Box::new(0..num_sessions),
    }
}
