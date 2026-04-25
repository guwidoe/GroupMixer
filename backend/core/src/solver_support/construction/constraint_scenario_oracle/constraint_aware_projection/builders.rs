use std::collections::BTreeMap;

use crate::models::PairMeetingMode;
use crate::solver3::compiled_problem::{CompiledProblem, PackedSchedule};

use super::super::types::OracleTemplateCandidate;
use super::atoms::{
    AttributeBalanceProjectionAtom, CapacityProjectionAtom, CliqueProjectionAtom,
    HardApartProjectionAtom, ImmovableTripleProjectionAtom, PairMeetingProjectionAtom,
    ProjectionAtom, ProjectionAtomSet, SoftPairProjectionAtom,
};
use super::oracle_index::{
    oracle_group_by_session_person, oracle_pair_meeting_count, oracle_sessions_where_pair_is_apart,
};

const MAX_PAIR_ATOMS_PER_CONSTRAINT: usize = 256;
const MAX_IMMOVABLE_ATOMS_PER_CONSTRAINT: usize = 256;

pub(super) fn build_projection_atoms(
    compiled: &CompiledProblem,
    candidate: &OracleTemplateCandidate,
    oracle_schedule: &PackedSchedule,
) -> ProjectionAtomSet {
    let oracle_group_by_session_person = oracle_group_by_session_person(candidate, oracle_schedule);
    let mut atoms = Vec::new();
    atoms.extend(build_clique_atoms(compiled, candidate, oracle_schedule));
    atoms.extend(build_hard_apart_atoms(
        compiled,
        candidate,
        &oracle_group_by_session_person,
    ));
    atoms.extend(build_attribute_balance_atoms(
        compiled,
        candidate,
        oracle_schedule,
    ));
    atoms.extend(build_immovable_atoms(compiled, candidate, oracle_schedule));
    atoms.extend(build_pair_meeting_atoms(
        compiled,
        candidate,
        &oracle_group_by_session_person,
    ));
    atoms.extend(build_soft_pair_atoms(
        compiled,
        candidate,
        &oracle_group_by_session_person,
    ));
    atoms.extend(build_capacity_atoms(compiled, candidate, oracle_schedule));
    ProjectionAtomSet { atoms }
}

fn build_clique_atoms(
    compiled: &CompiledProblem,
    candidate: &OracleTemplateCandidate,
    oracle_schedule: &PackedSchedule,
) -> Vec<ProjectionAtom> {
    let mut atoms = Vec::new();
    for (clique_idx, clique) in compiled.cliques.iter().enumerate() {
        let real_sessions = active_sessions_in_candidate(
            clique.sessions.as_deref(),
            compiled.num_sessions,
            &candidate.sessions,
        );
        if real_sessions.is_empty() || clique.members.len() < 2 {
            continue;
        }
        for (oracle_session_pos, session) in oracle_schedule
            .iter()
            .enumerate()
            .take(candidate.num_sessions())
        {
            for (oracle_group_idx, oracle_group) in
                session.iter().enumerate().take(candidate.num_groups)
            {
                if oracle_group.len() < clique.members.len() {
                    continue;
                }
                atoms.push(ProjectionAtom::Clique(CliqueProjectionAtom {
                    clique_idx,
                    real_people: clique.members.clone(),
                    real_sessions: real_sessions.clone(),
                    oracle_session_pos,
                    oracle_group_idx,
                    oracle_people_pool: oracle_group.clone(),
                    required_people_count: clique.members.len(),
                }));
            }
        }
    }
    atoms
}

fn build_hard_apart_atoms(
    compiled: &CompiledProblem,
    candidate: &OracleTemplateCandidate,
    oracle_group_by_session_person: &[Vec<usize>],
) -> Vec<ProjectionAtom> {
    let mut atoms = Vec::new();
    for (constraint_idx, pair) in compiled.hard_apart_pairs.iter().enumerate() {
        let real_sessions = active_sessions_in_candidate(
            pair.sessions.as_deref(),
            compiled.num_sessions,
            &candidate.sessions,
        );
        if real_sessions.is_empty() {
            continue;
        }
        let mut emitted = 0usize;
        for left in 0..candidate.oracle_capacity {
            for right in (left + 1)..candidate.oracle_capacity {
                let separated_sessions = oracle_sessions_where_pair_is_apart(
                    oracle_group_by_session_person,
                    left,
                    right,
                );
                if separated_sessions.len() < real_sessions.len() {
                    continue;
                }
                atoms.push(ProjectionAtom::HardApart(HardApartProjectionAtom {
                    constraint_idx,
                    real_people: [pair.people.0, pair.people.1],
                    real_sessions: real_sessions.clone(),
                    oracle_people: [left, right],
                    oracle_session_positions: separated_sessions,
                }));
                emitted += 1;
                if emitted >= MAX_PAIR_ATOMS_PER_CONSTRAINT {
                    break;
                }
            }
            if emitted >= MAX_PAIR_ATOMS_PER_CONSTRAINT {
                break;
            }
        }
    }
    atoms
}

fn build_attribute_balance_atoms(
    compiled: &CompiledProblem,
    candidate: &OracleTemplateCandidate,
    oracle_schedule: &PackedSchedule,
) -> Vec<ProjectionAtom> {
    let mut atoms = Vec::new();
    for (constraint_idx, constraint) in compiled.attribute_balance_constraints.iter().enumerate() {
        for real_session in active_sessions_in_candidate(
            constraint.sessions.as_deref(),
            compiled.num_sessions,
            &candidate.sessions,
        ) {
            for &real_group in &constraint.target_group_indices {
                for (oracle_session_pos, session) in oracle_schedule
                    .iter()
                    .enumerate()
                    .take(candidate.num_sessions())
                {
                    for (oracle_group_idx, oracle_people) in
                        session.iter().enumerate().take(candidate.num_groups)
                    {
                        if oracle_people.len() < desired_people_count(&constraint.desired_counts) {
                            continue;
                        }
                        atoms.push(ProjectionAtom::AttributeBalance(
                            AttributeBalanceProjectionAtom {
                                constraint_idx,
                                real_session,
                                real_group,
                                oracle_session_pos,
                                oracle_group_idx,
                                oracle_people: oracle_people.clone(),
                                attr_idx: constraint.attr_idx,
                                desired_counts: constraint.desired_counts.clone(),
                                penalty_weight: constraint.penalty_weight,
                            },
                        ));
                    }
                }
            }
        }
    }
    atoms
}

fn build_immovable_atoms(
    compiled: &CompiledProblem,
    candidate: &OracleTemplateCandidate,
    oracle_schedule: &PackedSchedule,
) -> Vec<ProjectionAtom> {
    let mut atoms = Vec::new();
    for (constraint_idx, assignment) in compiled.immovable_assignments.iter().enumerate() {
        if !candidate.sessions.contains(&assignment.session_idx)
            || !compiled.person_participation[assignment.person_idx][assignment.session_idx]
        {
            continue;
        }
        let mut emitted = 0usize;
        for (oracle_session_pos, session) in oracle_schedule
            .iter()
            .enumerate()
            .take(candidate.num_sessions())
        {
            for (oracle_group_idx, oracle_group) in
                session.iter().enumerate().take(candidate.num_groups)
            {
                for &oracle_person in oracle_group {
                    atoms.push(ProjectionAtom::ImmovableTriple(
                        ImmovableTripleProjectionAtom {
                            constraint_idx,
                            real_person: assignment.person_idx,
                            real_session: assignment.session_idx,
                            real_group: assignment.group_idx,
                            oracle_person,
                            oracle_session_pos,
                            oracle_group_idx,
                        },
                    ));
                    emitted += 1;
                    if emitted >= MAX_IMMOVABLE_ATOMS_PER_CONSTRAINT {
                        break;
                    }
                }
                if emitted >= MAX_IMMOVABLE_ATOMS_PER_CONSTRAINT {
                    break;
                }
            }
            if emitted >= MAX_IMMOVABLE_ATOMS_PER_CONSTRAINT {
                break;
            }
        }
    }
    atoms
}

fn build_pair_meeting_atoms(
    compiled: &CompiledProblem,
    candidate: &OracleTemplateCandidate,
    oracle_group_by_session_person: &[Vec<usize>],
) -> Vec<ProjectionAtom> {
    let mut atoms = Vec::new();
    for (constraint_idx, constraint) in compiled.pair_meeting_constraints.iter().enumerate() {
        let real_sessions = constraint
            .sessions
            .iter()
            .copied()
            .filter(|session_idx| candidate.sessions.contains(session_idx))
            .collect::<Vec<_>>();
        if real_sessions.is_empty() {
            continue;
        }
        let oracle_session_scope =
            representative_oracle_session_scope(candidate, real_sessions.len());
        let mut emitted = 0usize;
        for left in 0..candidate.oracle_capacity {
            for right in (left + 1)..candidate.oracle_capacity {
                let total_oracle_meetings = oracle_pair_meeting_count(
                    oracle_group_by_session_person,
                    left,
                    right,
                    0..candidate.num_sessions(),
                );
                let oracle_meetings = best_scoped_pair_meeting_count(
                    total_oracle_meetings,
                    real_sessions.len(),
                    candidate.num_sessions(),
                    constraint.mode,
                    constraint.target_meetings,
                );
                let projected_penalty = pair_meeting_penalty(
                    constraint.mode,
                    constraint.target_meetings,
                    oracle_meetings,
                    constraint.penalty_weight,
                );
                atoms.push(ProjectionAtom::PairMeeting(PairMeetingProjectionAtom {
                    constraint_idx,
                    real_people: [constraint.people.0, constraint.people.1],
                    real_sessions: real_sessions.clone(),
                    oracle_people: [left, right],
                    oracle_session_positions: oracle_session_scope.clone(),
                    target_meetings: constraint.target_meetings,
                    oracle_meetings,
                    mode: constraint.mode,
                    penalty_weight: constraint.penalty_weight,
                    projected_penalty,
                }));
                emitted += 1;
                if emitted >= MAX_PAIR_ATOMS_PER_CONSTRAINT {
                    break;
                }
            }
            if emitted >= MAX_PAIR_ATOMS_PER_CONSTRAINT {
                break;
            }
        }
    }
    atoms
}

fn build_soft_pair_atoms(
    compiled: &CompiledProblem,
    candidate: &OracleTemplateCandidate,
    oracle_group_by_session_person: &[Vec<usize>],
) -> Vec<ProjectionAtom> {
    let mut atoms = Vec::new();
    for (constraint_idx, constraint) in compiled.soft_apart_pairs.iter().enumerate() {
        let real_sessions = active_sessions_in_candidate(
            constraint.sessions.as_deref(),
            compiled.num_sessions,
            &candidate.sessions,
        );
        if real_sessions.is_empty() {
            continue;
        }
        atoms.extend(build_soft_pair_atoms_for_constraint(
            constraint_idx,
            constraint.people,
            real_sessions,
            constraint.penalty_weight,
            false,
            candidate,
            oracle_group_by_session_person,
        ));
    }
    for (constraint_idx, constraint) in compiled.should_together_pairs.iter().enumerate() {
        let real_sessions = active_sessions_in_candidate(
            constraint.sessions.as_deref(),
            compiled.num_sessions,
            &candidate.sessions,
        );
        if real_sessions.is_empty() {
            continue;
        }
        atoms.extend(build_soft_pair_atoms_for_constraint(
            constraint_idx,
            constraint.people,
            real_sessions,
            constraint.penalty_weight,
            true,
            candidate,
            oracle_group_by_session_person,
        ));
    }
    atoms
}

fn build_soft_pair_atoms_for_constraint(
    constraint_idx: usize,
    real_people: (usize, usize),
    real_sessions: Vec<usize>,
    penalty_weight: f64,
    prefers_together: bool,
    candidate: &OracleTemplateCandidate,
    oracle_group_by_session_person: &[Vec<usize>],
) -> Vec<ProjectionAtom> {
    let mut atoms = Vec::new();
    let oracle_session_scope = representative_oracle_session_scope(candidate, real_sessions.len());
    let mut emitted = 0usize;
    for left in 0..candidate.oracle_capacity {
        for right in (left + 1)..candidate.oracle_capacity {
            let total_oracle_meetings = oracle_pair_meeting_count(
                oracle_group_by_session_person,
                left,
                right,
                0..candidate.num_sessions(),
            );
            let (min_scoped_meetings, max_scoped_meetings) = scoped_meeting_range(
                total_oracle_meetings,
                real_sessions.len(),
                candidate.num_sessions(),
            );
            let oracle_meetings = if prefers_together {
                max_scoped_meetings
            } else {
                min_scoped_meetings
            };
            let atom = SoftPairProjectionAtom {
                constraint_idx,
                real_people: [real_people.0, real_people.1],
                real_sessions: real_sessions.clone(),
                oracle_people: [left, right],
                oracle_session_positions: oracle_session_scope.clone(),
                penalty_weight,
                oracle_meetings,
                prefers_together,
            };
            atoms.push(if prefers_together {
                ProjectionAtom::ShouldTogether(atom)
            } else {
                ProjectionAtom::SoftApart(atom)
            });
            emitted += 1;
            if emitted >= MAX_PAIR_ATOMS_PER_CONSTRAINT {
                break;
            }
        }
        if emitted >= MAX_PAIR_ATOMS_PER_CONSTRAINT {
            break;
        }
    }
    atoms
}

fn build_capacity_atoms(
    compiled: &CompiledProblem,
    candidate: &OracleTemplateCandidate,
    oracle_schedule: &PackedSchedule,
) -> Vec<ProjectionAtom> {
    let symmetry_breaking_slots = capacity_symmetry_breaking_slots(compiled, candidate);
    if symmetry_breaking_slots.is_empty() {
        return Vec::new();
    }

    let mut atoms = Vec::new();
    for (real_session, real_group, real_capacity) in symmetry_breaking_slots {
        for (oracle_session_pos, session) in oracle_schedule
            .iter()
            .enumerate()
            .take(candidate.num_sessions())
        {
            for (oracle_group_idx, oracle_group) in
                session.iter().enumerate().take(candidate.num_groups)
            {
                if oracle_group.len() <= real_capacity {
                    atoms.push(ProjectionAtom::Capacity(CapacityProjectionAtom {
                        real_session,
                        real_group,
                        oracle_session_pos,
                        oracle_group_idx,
                        real_capacity,
                        oracle_group_size: oracle_group.len(),
                    }));
                }
            }
        }
    }
    atoms
}

fn best_scoped_pair_meeting_count(
    total_oracle_meetings: u32,
    real_scope_len: usize,
    oracle_session_count: usize,
    mode: PairMeetingMode,
    target_meetings: u32,
) -> u32 {
    let (min_meetings, max_meetings) =
        scoped_meeting_range(total_oracle_meetings, real_scope_len, oracle_session_count);
    (min_meetings..=max_meetings)
        .min_by_key(|&actual| {
            let target = target_meetings as i32;
            let actual = actual as i32;
            match mode {
                PairMeetingMode::AtLeast => (target - actual).max(0),
                PairMeetingMode::Exact => (actual - target).abs(),
                PairMeetingMode::AtMost => (actual - target).max(0),
            }
        })
        .unwrap_or(min_meetings)
}

fn scoped_meeting_range(
    total_oracle_meetings: u32,
    real_scope_len: usize,
    oracle_session_count: usize,
) -> (u32, u32) {
    let scope_len = real_scope_len.min(oracle_session_count) as u32;
    let outside_scope_len = oracle_session_count.saturating_sub(real_scope_len) as u32;
    let min_meetings = total_oracle_meetings.saturating_sub(outside_scope_len);
    let max_meetings = total_oracle_meetings.min(scope_len);
    (min_meetings, max_meetings.max(min_meetings))
}

fn representative_oracle_session_scope(
    candidate: &OracleTemplateCandidate,
    real_scope_len: usize,
) -> Vec<usize> {
    (0..real_scope_len.min(candidate.num_sessions())).collect()
}

fn pair_meeting_penalty(
    mode: PairMeetingMode,
    target_meetings: u32,
    actual_meetings: u32,
    penalty_weight: f64,
) -> f64 {
    let target = target_meetings as i32;
    let actual = actual_meetings as i32;
    let raw = match mode {
        PairMeetingMode::AtLeast => (target - actual).max(0),
        PairMeetingMode::Exact => (actual - target).abs(),
        PairMeetingMode::AtMost => (actual - target).max(0),
    };
    raw as f64 * penalty_weight
}

fn active_sessions_in_candidate(
    sessions: Option<&[usize]>,
    num_sessions: usize,
    candidate_sessions: &[usize],
) -> Vec<usize> {
    let active_sessions = sessions
        .map(|sessions| sessions.to_vec())
        .unwrap_or_else(|| (0..num_sessions).collect::<Vec<_>>());
    active_sessions
        .into_iter()
        .filter(|session_idx| candidate_sessions.contains(session_idx))
        .collect()
}

fn desired_people_count(desired_counts: &[(usize, u32)]) -> usize {
    desired_counts
        .iter()
        .map(|&(_, count)| count as usize)
        .sum()
}

fn capacity_symmetry_breaking_slots(
    compiled: &CompiledProblem,
    candidate: &OracleTemplateCandidate,
) -> Vec<(usize, usize, usize)> {
    let mut capacity_frequency = BTreeMap::<usize, usize>::new();
    for &capacity in &compiled.effective_group_capacities {
        *capacity_frequency.entry(capacity).or_default() += 1;
    }
    if capacity_frequency.len() <= 1 {
        return Vec::new();
    }

    let dominant_frequency = capacity_frequency.values().copied().max().unwrap_or(0);
    let dominant_capacity_count = capacity_frequency
        .values()
        .filter(|&&frequency| frequency == dominant_frequency)
        .count();

    let include_capacity = |capacity: usize| {
        let frequency = capacity_frequency.get(&capacity).copied().unwrap_or(0);
        dominant_capacity_count > 1 || frequency < dominant_frequency
    };

    let mut slots = Vec::new();
    for &real_session in &candidate.sessions {
        for real_group in 0..compiled.num_groups {
            let real_capacity = compiled.group_capacity(real_session, real_group);
            if include_capacity(real_capacity) {
                slots.push((real_session, real_group, real_capacity));
            }
        }
    }
    slots
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{ApiInput, Group, Objective, Person, ProblemDefinition, SolverKind};
    use std::collections::HashMap;

    fn capacity_test_candidate() -> OracleTemplateCandidate {
        OracleTemplateCandidate {
            sessions: vec![0, 1],
            groups_by_session: vec![vec![0, 1], vec![0, 1]],
            num_groups: 2,
            group_size: 2,
            oracle_capacity: 4,
            stable_people_count: 4,
            high_attendance_people_count: 4,
            dummy_oracle_people: 0,
            omitted_high_attendance_people: 0,
            omitted_group_count: 0,
            scaffold_disruption_risk: 0.0,
            estimated_score: 0.0,
        }
    }

    fn capacity_test_oracle_schedule() -> PackedSchedule {
        vec![vec![vec![0, 1], vec![2, 3]], vec![vec![0, 2], vec![1, 3]]]
    }

    fn capacity_test_input() -> ApiInput {
        ApiInput {
            problem: ProblemDefinition {
                people: (0..4)
                    .map(|idx| Person {
                        id: format!("p{idx}"),
                        attributes: HashMap::new(),
                        sessions: None,
                    })
                    .collect(),
                groups: vec![
                    Group {
                        id: "g0".into(),
                        size: 2,
                        session_sizes: None,
                    },
                    Group {
                        id: "g1".into(),
                        size: 2,
                        session_sizes: Some(vec![3, 2]),
                    },
                ],
                num_sessions: 2,
            },
            initial_schedule: None,
            construction_seed_schedule: None,
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".into(),
                weight: 1.0,
            }],
            constraints: Vec::new(),
            solver: crate::default_solver_configuration_for(SolverKind::Solver3),
        }
    }

    #[test]
    fn capacity_atoms_only_use_capacity_classes_that_break_symmetry() {
        let input = capacity_test_input();
        let compiled = CompiledProblem::compile(&input).expect("compile");
        let candidate = capacity_test_candidate();
        let oracle_schedule = capacity_test_oracle_schedule();

        let atoms = build_capacity_atoms(&compiled, &candidate, &oracle_schedule);

        assert_eq!(atoms.len(), 4);
        for atom in atoms {
            let ProjectionAtom::Capacity(atom) = atom else {
                panic!("expected capacity atom");
            };
            assert_eq!(atom.real_session, 0);
            assert_eq!(atom.real_group, 1);
            assert_eq!(atom.real_capacity, 3);
        }
    }
}
