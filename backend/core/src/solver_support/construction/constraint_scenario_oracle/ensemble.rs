use crate::solver3::compiled_problem::PackedSchedule;
use crate::solver_support::SolverError;

use super::types::{ConstraintScenarioCandidate, ConstraintScenarioEnsemble};

/// Builds the selected repeat-blind ensemble from already-feasible candidates.
#[cfg(test)]
pub(crate) fn build_constraint_scenario_ensemble(
    candidates: Vec<ConstraintScenarioCandidate>,
) -> Result<ConstraintScenarioEnsemble, SolverError> {
    if candidates.is_empty() {
        return Err(SolverError::ValidationError(
            "solver3 constraint-scenario oracle-guided construction could not produce any feasible repeat-blind scaffold candidates".into(),
        ));
    }

    let mut best_index = 0usize;
    for idx in 1..candidates.len() {
        let candidate = &candidates[idx];
        let incumbent = &candidates[best_index];
        if candidate.cs_score < incumbent.cs_score
            || (candidate.cs_score == incumbent.cs_score
                && candidate.real_score < incumbent.real_score)
        {
            best_index = idx;
        }
    }

    let diversity = average_pair_contact_l1_distance(&candidates);
    Ok(ConstraintScenarioEnsemble {
        candidates,
        best_index,
        diversity,
    })
}

fn average_pair_contact_l1_distance(candidates: &[ConstraintScenarioCandidate]) -> f64 {
    if candidates.len() < 2 {
        return 0.0;
    }
    let mut total = 0usize;
    let mut pairs = 0usize;
    for left_idx in 0..candidates.len() {
        for right_idx in (left_idx + 1)..candidates.len() {
            total += pair_contact_l1_distance(
                &candidates[left_idx].schedule,
                &candidates[right_idx].schedule,
            );
            pairs += 1;
        }
    }
    total as f64 / pairs as f64
}

fn pair_contact_l1_distance(left: &PackedSchedule, right: &PackedSchedule) -> usize {
    let mut distance = 0usize;
    let sessions = left.len().min(right.len());
    for session_idx in 0..sessions {
        let people = left[session_idx]
            .iter()
            .chain(right[session_idx].iter())
            .flat_map(|group| group.iter().copied())
            .max()
            .map(|idx| idx + 1)
            .unwrap_or(0);
        for left_person in 0..people {
            for right_person in (left_person + 1)..people {
                let left_contact =
                    same_group_in_session(&left[session_idx], left_person, right_person);
                let right_contact =
                    same_group_in_session(&right[session_idx], left_person, right_person);
                if left_contact != right_contact {
                    distance += 1;
                }
            }
        }
    }
    distance
}

fn same_group_in_session(groups: &[Vec<usize>], left: usize, right: usize) -> bool {
    groups
        .iter()
        .any(|group| group.contains(&left) && group.contains(&right))
}
