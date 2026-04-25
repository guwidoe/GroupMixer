use std::collections::BTreeMap;

use crate::solver3::compiled_problem::CompiledProblem;
use crate::solver_support::SolverError;

use super::sessions::active_sessions;
use super::types::{
    EffectiveImmovableAssignment, EffectiveImmovableSource, PresolvedCliqueComponent,
};

pub(super) fn build_effective_immovable_assignments(
    compiled: &CompiledProblem,
    components: &[PresolvedCliqueComponent],
) -> Result<Vec<EffectiveImmovableAssignment>, SolverError> {
    let mut assignments = BTreeMap::<(usize, usize), EffectiveImmovableAssignment>::new();

    for assignment in &compiled.immovable_assignments {
        assignments.insert(
            (assignment.person_idx, assignment.session_idx),
            EffectiveImmovableAssignment {
                person_idx: assignment.person_idx,
                session_idx: assignment.session_idx,
                group_idx: assignment.group_idx,
                source: EffectiveImmovableSource::Explicit,
            },
        );
    }

    for component in components {
        for session_idx in active_sessions(component.sessions.as_deref(), compiled.num_sessions) {
            let Some(group_idx) = component.anchored_group_by_session[session_idx] else {
                continue;
            };
            let anchor_person_idx = component
                .members
                .iter()
                .copied()
                .find(|&member| compiled.immovable_group(session_idx, member) == Some(group_idx))
                .ok_or_else(|| {
                    SolverError::ValidationError(format!(
                        "presolve could not find immovable anchor for clique component {} in session {}",
                        component.component_idx, session_idx
                    ))
                })?;
            for &member in &component.members {
                if !compiled.person_participation[member][session_idx] {
                    continue;
                }
                let key = (member, session_idx);
                match assignments.get(&key) {
                    Some(existing) if existing.group_idx != group_idx => {
                        return Err(SolverError::ValidationError(format!(
                            "presolve derived conflicting immovable group for person '{}' in session {}",
                            compiled.display_person(member),
                            session_idx
                        )));
                    }
                    Some(_) => {}
                    None => {
                        assignments.insert(
                            key,
                            EffectiveImmovableAssignment {
                                person_idx: member,
                                session_idx,
                                group_idx,
                                source: EffectiveImmovableSource::CliqueComponent {
                                    component_idx: component.component_idx,
                                    anchor_person_idx,
                                },
                            },
                        );
                    }
                }
            }
        }
    }

    Ok(assignments.into_values().collect())
}
