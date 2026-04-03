use crate::solver_support::SolverError;

use super::super::SolutionState;

/// Validates explicit `solver2` structural and hard-constraint invariants.
pub fn validate_state_invariants(state: &SolutionState) -> Result<(), SolverError> {
    let problem = &state.compiled_problem;

    if state.schedule.len() != problem.num_sessions {
        return Err(SolverError::ValidationError(format!(
            "state schedule has {} sessions but compiled problem expects {}",
            state.schedule.len(),
            problem.num_sessions
        )));
    }
    if state.locations.len() != problem.num_sessions {
        return Err(SolverError::ValidationError(format!(
            "state locations has {} sessions but compiled problem expects {}",
            state.locations.len(),
            problem.num_sessions
        )));
    }

    for session_idx in 0..problem.num_sessions {
        if state.schedule[session_idx].len() != problem.num_groups {
            return Err(SolverError::ValidationError(format!(
                "session {} has {} groups but compiled problem expects {}",
                session_idx,
                state.schedule[session_idx].len(),
                problem.num_groups
            )));
        }
        if state.locations[session_idx].len() != problem.num_people {
            return Err(SolverError::ValidationError(format!(
                "session {} has {} person locations but compiled problem expects {}",
                session_idx,
                state.locations[session_idx].len(),
                problem.num_people
            )));
        }

        let mut seen_people = vec![0usize; problem.num_people];

        for group_idx in 0..problem.num_groups {
            let capacity = problem.group_capacity(session_idx, group_idx);
            let group = &state.schedule[session_idx][group_idx];
            if group.len() > capacity {
                return Err(SolverError::ValidationError(format!(
                    "group {} exceeds capacity {} in session {}",
                    problem.display_group_idx(group_idx),
                    capacity,
                    session_idx
                )));
            }

            for (position_idx, &person_idx) in group.iter().enumerate() {
                if person_idx >= problem.num_people {
                    return Err(SolverError::ValidationError(format!(
                        "session {} contains invalid person index {} in group {}",
                        session_idx,
                        person_idx,
                        problem.display_group_idx(group_idx)
                    )));
                }
                if !problem.person_participation[person_idx][session_idx] {
                    return Err(SolverError::ValidationError(format!(
                        "session {} assigns non-participating person {}",
                        session_idx,
                        problem.display_person_idx(person_idx)
                    )));
                }
                seen_people[person_idx] += 1;
                if seen_people[person_idx] > 1 {
                    return Err(SolverError::ValidationError(format!(
                        "person {} is assigned multiple times in session {}",
                        problem.display_person_idx(person_idx),
                        session_idx
                    )));
                }

                match state.locations[session_idx][person_idx] {
                    Some((recorded_group_idx, recorded_position_idx))
                        if recorded_group_idx == group_idx
                            && recorded_position_idx == position_idx => {}
                    Some((recorded_group_idx, recorded_position_idx)) => {
                        return Err(SolverError::ValidationError(format!(
                            "location mismatch for person {} in session {}: schedule says ({}, {}), locations say ({}, {})",
                            problem.display_person_idx(person_idx),
                            session_idx,
                            group_idx,
                            position_idx,
                            recorded_group_idx,
                            recorded_position_idx
                        )));
                    }
                    None => {
                        return Err(SolverError::ValidationError(format!(
                            "missing location for person {} in session {}",
                            problem.display_person_idx(person_idx),
                            session_idx
                        )));
                    }
                }
            }
        }

        for person_idx in 0..problem.num_people {
            let participates = problem.person_participation[person_idx][session_idx];
            let assignments = seen_people[person_idx];
            match (participates, assignments) {
                (true, 1) => {}
                (true, 0) => {
                    return Err(SolverError::ValidationError(format!(
                        "participating person {} is unassigned in session {}",
                        problem.display_person_idx(person_idx),
                        session_idx
                    )));
                }
                (true, _) => unreachable!("duplicate assignment should already have returned"),
                (false, 0) => {
                    if state.locations[session_idx][person_idx].is_some() {
                        return Err(SolverError::ValidationError(format!(
                            "non-participating person {} has a location in session {}",
                            problem.display_person_idx(person_idx),
                            session_idx
                        )));
                    }
                }
                (false, _) => {
                    return Err(SolverError::ValidationError(format!(
                        "non-participating person {} is assigned in session {}",
                        problem.display_person_idx(person_idx),
                        session_idx
                    )));
                }
            }
        }
    }

    for clique in &problem.cliques {
        for session_idx in 0..problem.num_sessions {
            let active = match &clique.sessions {
                Some(sessions) => sessions.contains(&session_idx),
                None => true,
            };
            if !active {
                continue;
            }

            let participating_members = clique
                .members
                .iter()
                .copied()
                .filter(|&member| problem.person_participation[member][session_idx])
                .collect::<Vec<_>>();
            if participating_members.len() < 2 {
                continue;
            }

            let mut groups = participating_members
                .iter()
                .filter_map(|&member| {
                    state.locations[session_idx][member].map(|(group_idx, _)| group_idx)
                })
                .collect::<Vec<_>>();
            groups.sort_unstable();
            groups.dedup();
            if groups.len() > 1 {
                let members = participating_members
                    .iter()
                    .map(|&member| problem.display_person_idx(member))
                    .collect::<Vec<_>>();
                return Err(SolverError::ValidationError(format!(
                    "clique {:?} is split across multiple groups in session {}",
                    members, session_idx
                )));
            }
        }
    }

    for assignment in &problem.immovable_assignments {
        if !problem.person_participation[assignment.person_idx][assignment.session_idx] {
            continue;
        }
        let actual_group = state.locations[assignment.session_idx][assignment.person_idx]
            .map(|location| location.0);
        if actual_group != Some(assignment.group_idx) {
            return Err(SolverError::ValidationError(format!(
                "immovable person {} is in group {} but must be in group {} for session {}",
                problem.display_person_idx(assignment.person_idx),
                actual_group
                    .map(|group_idx| problem.display_group_idx(group_idx))
                    .unwrap_or_else(|| "<unassigned>".to_string()),
                problem.display_group_idx(assignment.group_idx),
                assignment.session_idx
            )));
        }
    }

    Ok(())
}
