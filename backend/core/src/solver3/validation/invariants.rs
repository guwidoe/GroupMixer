//! Structural invariant validation for `solver3` runtime state.
//!
//! These checks verify that the flat data structures are internally consistent:
//!
//! - `person_location` and `group_members` agree on where every person is.
//! - No person is assigned twice in the same session.
//! - Every participating person is assigned exactly once.
//! - No group exceeds its capacity.
//! - Non-participating people have no location.
//! - Cliques are intact (all active members in the same group).
//! - Immovable people are in their required groups.
//!
//! These invariants should hold after any correct initialization or move application.
//! They are not hot-path; they are called from tests and sampled runtime validation.

use crate::solver_support::SolverError;

use super::super::compiled_problem::CompiledProblem;
use super::super::runtime_state::RuntimeState;

/// Validates all structural invariants of `state`.
///
/// Returns the first invariant violation found, or `Ok(())`.
pub fn validate_invariants(state: &RuntimeState) -> Result<(), SolverError> {
    let cp = &state.compiled;

    check_shape(cp, state)?;
    check_capacity(cp, state)?;
    check_participation_and_uniqueness(cp, state)?;
    check_location_membership_consistency(cp, state)?;
    check_cliques(cp, state)?;
    check_immovable(cp, state)?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

fn check_shape(cp: &CompiledProblem, state: &RuntimeState) -> Result<(), SolverError> {
    let expected_people_slots = cp.num_sessions * cp.num_people;
    let expected_group_slots = cp.num_sessions * cp.num_groups;

    if state.person_location.len() != expected_people_slots {
        return Err(SolverError::ValidationError(format!(
            "person_location length {} != {} (sessions × people)",
            state.person_location.len(),
            expected_people_slots
        )));
    }
    if state.group_members.len() != expected_group_slots {
        return Err(SolverError::ValidationError(format!(
            "group_members length {} != {} (sessions × groups)",
            state.group_members.len(),
            expected_group_slots
        )));
    }
    if state.group_sizes.len() != expected_group_slots {
        return Err(SolverError::ValidationError(format!(
            "group_sizes length {} != {} (sessions × groups)",
            state.group_sizes.len(),
            expected_group_slots
        )));
    }
    if state.pair_contacts.len() != cp.num_pairs {
        return Err(SolverError::ValidationError(format!(
            "pair_contacts length {} != {} (num_pairs)",
            state.pair_contacts.len(),
            cp.num_pairs
        )));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Capacity
// ---------------------------------------------------------------------------

fn check_capacity(cp: &CompiledProblem, state: &RuntimeState) -> Result<(), SolverError> {
    for sidx in 0..cp.num_sessions {
        for gidx in 0..cp.num_groups {
            let cap = cp.group_capacity(sidx, gidx);
            let gs = sidx * cp.num_groups + gidx;
            let size = state.group_sizes[gs];
            let actual_members = state.group_members[gs].len();

            if size != actual_members {
                return Err(SolverError::ValidationError(format!(
                    "group_sizes[{}] = {} but group_members[{}].len() = {} in session {}",
                    gs, size, gs, actual_members, sidx
                )));
            }
            if size > cap {
                return Err(SolverError::ValidationError(format!(
                    "group '{}' has {} members but capacity {} in session {}",
                    cp.display_group(gidx),
                    size,
                    cap,
                    sidx
                )));
            }
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Participation and uniqueness
// ---------------------------------------------------------------------------

fn check_participation_and_uniqueness(
    cp: &CompiledProblem,
    state: &RuntimeState,
) -> Result<(), SolverError> {
    for sidx in 0..cp.num_sessions {
        let mut assignment_count = vec![0u32; cp.num_people];

        // Count assignments via group_members.
        for gidx in 0..cp.num_groups {
            let gs = sidx * cp.num_groups + gidx;
            for &pidx in &state.group_members[gs] {
                if pidx >= cp.num_people {
                    return Err(SolverError::ValidationError(format!(
                        "group_members contains out-of-range person index {} in session {}",
                        pidx, sidx
                    )));
                }
                assignment_count[pidx] += 1;
            }
        }

        for (pidx, &count) in assignment_count.iter().enumerate() {
            let participates = cp.person_participation[pidx][sidx];
            match (participates, count) {
                (true, 1) => {}
                (true, 0) => {
                    return Err(SolverError::ValidationError(format!(
                        "participating person '{}' is unassigned in session {}",
                        cp.display_person(pidx),
                        sidx
                    )));
                }
                (true, n) => {
                    return Err(SolverError::ValidationError(format!(
                        "person '{}' is assigned {} times in session {}",
                        cp.display_person(pidx),
                        n,
                        sidx
                    )));
                }
                (false, 0) => {}
                (false, n) => {
                    return Err(SolverError::ValidationError(format!(
                        "non-participating person '{}' is assigned {} times in session {}",
                        cp.display_person(pidx),
                        n,
                        sidx
                    )));
                }
            }
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Location / membership consistency
// ---------------------------------------------------------------------------

fn check_location_membership_consistency(
    cp: &CompiledProblem,
    state: &RuntimeState,
) -> Result<(), SolverError> {
    for sidx in 0..cp.num_sessions {
        // Build an independent location map from group_members.
        let mut expected_location = vec![None::<usize>; cp.num_people];
        for gidx in 0..cp.num_groups {
            let gs = sidx * cp.num_groups + gidx;
            for &pidx in &state.group_members[gs] {
                expected_location[pidx] = Some(gidx);
            }
        }

        for (pidx, &derived) in expected_location.iter().enumerate() {
            let ps = sidx * cp.num_people + pidx;
            let recorded = state.person_location[ps];
            if recorded != derived {
                return Err(SolverError::ValidationError(format!(
                    "location mismatch for person '{}' in session {}: person_location={:?}, derived from group_members={:?}",
                    cp.display_person(pidx),
                    sidx,
                    recorded,
                    derived
                )));
            }
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Clique integrity
// ---------------------------------------------------------------------------

fn check_cliques(cp: &CompiledProblem, state: &RuntimeState) -> Result<(), SolverError> {
    for clique in &cp.cliques {
        for sidx in 0..cp.num_sessions {
            let active = match &clique.sessions {
                Some(sessions) => sessions.contains(&sidx),
                None => true,
            };
            if !active {
                continue;
            }

            let participating: Vec<usize> = clique
                .members
                .iter()
                .copied()
                .filter(|&m| cp.person_participation[m][sidx])
                .collect();
            if participating.len() < 2 {
                continue;
            }

            let mut groups: Vec<usize> = participating
                .iter()
                .filter_map(|&m| state.person_location[sidx * cp.num_people + m])
                .collect();
            groups.sort_unstable();
            groups.dedup();

            if groups.len() > 1 {
                let member_ids: Vec<String> = participating
                    .iter()
                    .map(|&m| cp.display_person(m))
                    .collect();
                return Err(SolverError::ValidationError(format!(
                    "MustStayTogether clique {:?} is split across {} groups in session {}",
                    member_ids,
                    groups.len(),
                    sidx
                )));
            }
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Immovable assignments
// ---------------------------------------------------------------------------

fn check_immovable(cp: &CompiledProblem, state: &RuntimeState) -> Result<(), SolverError> {
    for a in &cp.immovable_assignments {
        if !cp.person_participation[a.person_idx][a.session_idx] {
            continue;
        }
        let ps = a.session_idx * cp.num_people + a.person_idx;
        let actual = state.person_location[ps];
        if actual != Some(a.group_idx) {
            return Err(SolverError::ValidationError(format!(
                "immovable person '{}' is in group {:?} but must be in group '{}' for session {}",
                cp.display_person(a.person_idx),
                actual.map(|g| cp.display_group(g)),
                cp.display_group(a.group_idx),
                a.session_idx
            )));
        }
    }
    Ok(())
}
