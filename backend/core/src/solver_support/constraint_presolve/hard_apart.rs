use std::collections::BTreeSet;

use crate::solver3::compiled_problem::CompiledProblem;
use crate::solver_support::SolverError;

use super::sessions::active_sessions;
use super::types::{PresolvedConstraintUnit, PresolvedHardApartUnitConstraint};

pub(super) fn build_hard_apart_units(
    compiled: &CompiledProblem,
    clique_component_by_person_session: &[Option<usize>],
) -> Result<Vec<PresolvedHardApartUnitConstraint>, SolverError> {
    let mut constraints = BTreeSet::<PresolvedHardApartUnitConstraint>::new();
    for pair in &compiled.hard_apart_pairs {
        let (left_person, right_person) = pair.people;
        for session_idx in active_sessions(pair.sessions.as_deref(), compiled.num_sessions) {
            if !compiled.person_participation[left_person][session_idx]
                || !compiled.person_participation[right_person][session_idx]
            {
                continue;
            }
            let left = presolved_unit_for_person(
                compiled,
                clique_component_by_person_session,
                session_idx,
                left_person,
            );
            let right = presolved_unit_for_person(
                compiled,
                clique_component_by_person_session,
                session_idx,
                right_person,
            );
            if left == right {
                return Err(SolverError::ValidationError(format!(
                    "presolve found MustStayApart inside the same clique component in session {}",
                    session_idx
                )));
            }
            let (left, right) = if left <= right {
                (left, right)
            } else {
                (right, left)
            };
            constraints.insert(PresolvedHardApartUnitConstraint {
                session_idx,
                left,
                right,
            });
        }
    }
    Ok(constraints.into_iter().collect())
}

fn presolved_unit_for_person(
    compiled: &CompiledProblem,
    clique_component_by_person_session: &[Option<usize>],
    session_idx: usize,
    person_idx: usize,
) -> PresolvedConstraintUnit {
    clique_component_by_person_session[compiled.person_session_slot(session_idx, person_idx)]
        .map(PresolvedConstraintUnit::CliqueComponent)
        .unwrap_or(PresolvedConstraintUnit::Person(person_idx))
}
