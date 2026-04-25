use crate::solver3::compiled_problem::CompiledProblem;
use crate::solver_support::SolverError;

use super::sessions::active_sessions;
use super::types::PresolvedCliqueComponent;

pub(super) fn build_clique_components(
    compiled: &CompiledProblem,
) -> Result<Vec<PresolvedCliqueComponent>, SolverError> {
    compiled
        .cliques
        .iter()
        .enumerate()
        .map(|(component_idx, clique)| {
            let mut anchored_group_by_session = vec![None; compiled.num_sessions];
            for session_idx in active_sessions(clique.sessions.as_deref(), compiled.num_sessions) {
                let mut required_group = None::<usize>;
                for &member in &clique.members {
                    if !compiled.person_participation[member][session_idx] {
                        continue;
                    }
                    if let Some(group_idx) = compiled.immovable_group(session_idx, member) {
                        match required_group {
                            Some(existing) if existing != group_idx => {
                                return Err(SolverError::ValidationError(format!(
                                    "presolve found conflicting immovable groups in clique component {component_idx} for session {session_idx}"
                                )));
                            }
                            None => required_group = Some(group_idx),
                            _ => {}
                        }
                    }
                }
                anchored_group_by_session[session_idx] = required_group;
            }
            Ok(PresolvedCliqueComponent {
                component_idx,
                members: clique.members.clone(),
                sessions: clique.sessions.clone(),
                anchored_group_by_session,
            })
        })
        .collect()
}

pub(super) fn build_clique_component_by_person_session(
    compiled: &CompiledProblem,
) -> Vec<Option<usize>> {
    let mut by_person_session = vec![None; compiled.num_sessions * compiled.num_people];
    for session_idx in 0..compiled.num_sessions {
        for person_idx in 0..compiled.num_people {
            by_person_session[compiled.person_session_slot(session_idx, person_idx)] =
                compiled.person_to_clique_id[session_idx][person_idx];
        }
    }
    by_person_session
}
