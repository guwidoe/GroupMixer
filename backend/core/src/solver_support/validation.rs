use crate::models::{ApiInput, ApiSchedule, Constraint};
use crate::solver_support::SolverError;
use std::collections::HashMap;

pub type IndexedSchedule = Vec<Vec<Vec<usize>>>;

enum ScheduleMode {
    Incumbent,
    ConstructionSeed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndexedScheduleValidation {
    pub schedule: IndexedSchedule,
}

pub fn validate_schedule_as_incumbent(
    input: &ApiInput,
    schedule: &ApiSchedule,
) -> Result<IndexedScheduleValidation, SolverError> {
    validate_schedule(input, schedule, ScheduleMode::Incumbent)
}

pub fn validate_schedule_as_construction_seed(
    input: &ApiInput,
    schedule: &ApiSchedule,
) -> Result<IndexedScheduleValidation, SolverError> {
    validate_schedule(input, schedule, ScheduleMode::ConstructionSeed)
}

fn validate_schedule(
    input: &ApiInput,
    schedule: &ApiSchedule,
    mode: ScheduleMode,
) -> Result<IndexedScheduleValidation, SolverError> {
    let num_sessions = input.problem.num_sessions as usize;
    let num_groups = input.problem.groups.len();
    let num_people = input.problem.people.len();

    let person_id_to_idx = input
        .problem
        .people
        .iter()
        .enumerate()
        .map(|(idx, person)| (person.id.clone(), idx))
        .collect::<HashMap<_, _>>();
    let group_id_to_idx = input
        .problem
        .groups
        .iter()
        .enumerate()
        .map(|(idx, group)| (group.id.clone(), idx))
        .collect::<HashMap<_, _>>();
    let person_idx_to_id = input
        .problem
        .people
        .iter()
        .map(|person| person.id.clone())
        .collect::<Vec<_>>();
    let group_idx_to_id = input
        .problem
        .groups
        .iter()
        .map(|group| group.id.clone())
        .collect::<Vec<_>>();

    let person_participation = build_person_participation(input)?;
    let effective_group_capacities = build_effective_group_capacities(input)?;
    let immovable_assignments = compile_immovable_assignments(input, &person_id_to_idx, &group_id_to_idx)?;
    let cliques = compile_cliques(input, &person_id_to_idx, num_sessions)?;

    let mut compiled = vec![vec![Vec::new(); num_groups]; num_sessions];
    let mut seen_people = vec![vec![false; num_people]; num_sessions];
    let require_complete = matches!(mode, ScheduleMode::Incumbent);

    if require_complete && schedule.len() != num_sessions {
        return Err(SolverError::ValidationError(format!(
            "warm start must define all {} sessions explicitly",
            num_sessions
        )));
    }

    for session_idx in 0..num_sessions {
        let session_key = format!("session_{session_idx}");
        let maybe_group_map = schedule.get(&session_key);
        if require_complete && maybe_group_map.is_none() {
            return Err(SolverError::ValidationError(format!(
                "warm start is missing required session '{}'",
                session_key
            )));
        }
        let Some(group_map) = maybe_group_map else {
            continue;
        };

        if require_complete && group_map.len() != num_groups {
            return Err(SolverError::ValidationError(format!(
                "warm start session '{}' must define all {} groups explicitly",
                session_key, num_groups
            )));
        }

        for group in &input.problem.groups {
            if require_complete && !group_map.contains_key(&group.id) {
                return Err(SolverError::ValidationError(format!(
                    "warm start session '{}' is missing required group '{}'",
                    session_key, group.id
                )));
            }
        }

        for (group_id, people_ids) in group_map {
            let Some(&group_idx) = group_id_to_idx.get(group_id) else {
                return Err(SolverError::ValidationError(format!(
                    "schedule references unknown group '{}' in {}",
                    group_id, session_key
                )));
            };
            let capacity = effective_group_capacities[session_idx * num_groups + group_idx];
            if people_ids.len() > capacity {
                return Err(SolverError::ValidationError(format!(
                    "schedule overfills group '{}' in {} (capacity {})",
                    group_id, session_key, capacity
                )));
            }

            for person_id in people_ids {
                let Some(&person_idx) = person_id_to_idx.get(person_id) else {
                    return Err(SolverError::ValidationError(format!(
                        "schedule references unknown person '{}' in {}",
                        person_id, session_key
                    )));
                };
                if !person_participation[person_idx][session_idx] {
                    return Err(SolverError::ValidationError(format!(
                        "schedule assigns non-participating person '{}' in {}",
                        person_id, session_key
                    )));
                }
                if seen_people[session_idx][person_idx] {
                    return Err(SolverError::ValidationError(format!(
                        "schedule assigns person '{}' multiple times in {}",
                        person_id, session_key
                    )));
                }
                seen_people[session_idx][person_idx] = true;
                compiled[session_idx][group_idx].push(person_idx);
            }
        }
    }

    if require_complete {
        for session_idx in 0..num_sessions {
            for person_idx in 0..num_people {
                if person_participation[person_idx][session_idx] && !seen_people[session_idx][person_idx] {
                    return Err(SolverError::ValidationError(format!(
                        "warm start leaves participating person '{}' unassigned in session {}",
                        person_idx_to_id[person_idx], session_idx
                    )));
                }
            }
        }

        validate_hard_constraints(
            &compiled,
            &person_participation,
            &cliques,
            &immovable_assignments,
            &person_idx_to_id,
            &group_idx_to_id,
        )?;
    }

    Ok(IndexedScheduleValidation { schedule: compiled })
}

fn build_person_participation(input: &ApiInput) -> Result<Vec<Vec<bool>>, SolverError> {
    let people_count = input.problem.people.len();
    let num_sessions = input.problem.num_sessions as usize;
    let mut person_participation = vec![vec![false; num_sessions]; people_count];

    for (person_idx, person) in input.problem.people.iter().enumerate() {
        if let Some(ref sessions) = person.sessions {
            for &session in sessions {
                let session_idx = session as usize;
                if session_idx >= num_sessions {
                    return Err(SolverError::ValidationError(format!(
                        "person '{}' has invalid session index: {} (max: {})",
                        person.id,
                        session,
                        num_sessions.saturating_sub(1)
                    )));
                }
                person_participation[person_idx][session_idx] = true;
            }
        } else {
            for participates in &mut person_participation[person_idx] {
                *participates = true;
            }
        }
    }

    Ok(person_participation)
}

fn build_effective_group_capacities(input: &ApiInput) -> Result<Vec<usize>, SolverError> {
    let num_sessions = input.problem.num_sessions as usize;
    let num_groups = input.problem.groups.len();
    let mut capacities = vec![0usize; num_sessions * num_groups];

    for (group_idx, group) in input.problem.groups.iter().enumerate() {
        if let Some(session_sizes) = &group.session_sizes {
            if session_sizes.len() != num_sessions {
                return Err(SolverError::ValidationError(format!(
                    "group '{}' has {} session_sizes entries but problem has {} sessions",
                    group.id,
                    session_sizes.len(),
                    num_sessions
                )));
            }
        }
        for session_idx in 0..num_sessions {
            capacities[session_idx * num_groups + group_idx] = group
                .session_sizes
                .as_ref()
                .map(|sizes| sizes[session_idx] as usize)
                .unwrap_or(group.size as usize);
        }
    }

    Ok(capacities)
}

#[derive(Debug, Clone)]
struct CompiledClique {
    members: Vec<usize>,
    sessions: Option<Vec<usize>>,
}

fn compile_cliques(
    input: &ApiInput,
    person_id_to_idx: &HashMap<String, usize>,
    num_sessions: usize,
) -> Result<Vec<CompiledClique>, SolverError> {
    let num_people = input.problem.people.len();
    let mut members_to_sessions: HashMap<Vec<usize>, Vec<usize>> = HashMap::new();

    for session_idx in 0..num_sessions {
        let mut dsu = Dsu::new(num_people);
        for constraint in &input.constraints {
            if let Constraint::MustStayTogether { people, sessions } = constraint {
                let active = match sessions {
                    Some(list) => list.iter().any(|&s| s as usize == session_idx),
                    None => true,
                };
                if !active || people.len() < 2 {
                    continue;
                }
                for window in people.windows(2) {
                    let a = *person_id_to_idx.get(&window[0]).ok_or_else(|| {
                        SolverError::ValidationError(format!(
                            "MustStayTogether references unknown person '{}'",
                            window[0]
                        ))
                    })?;
                    let b = *person_id_to_idx.get(&window[1]).ok_or_else(|| {
                        SolverError::ValidationError(format!(
                            "MustStayTogether references unknown person '{}'",
                            window[1]
                        ))
                    })?;
                    dsu.union(a, b);
                }
            }
        }

        let mut root_to_members: HashMap<usize, Vec<usize>> = HashMap::new();
        for person_idx in 0..num_people {
            let root = dsu.find(person_idx);
            root_to_members.entry(root).or_default().push(person_idx);
        }

        for mut members in root_to_members.into_values().filter(|members| members.len() >= 2) {
            members.sort_unstable();
            members_to_sessions
                .entry(members)
                .or_default()
                .push(session_idx);
        }
    }

    let mut cliques = members_to_sessions
        .into_iter()
        .map(|(members, mut sessions)| {
            sessions.sort_unstable();
            let all_sessions = sessions.len() == num_sessions
                && sessions.iter().copied().eq(0..num_sessions);
            CompiledClique {
                members,
                sessions: if all_sessions { None } else { Some(sessions) },
            }
        })
        .collect::<Vec<_>>();
    cliques.sort_by(|left, right| left.members.cmp(&right.members));
    Ok(cliques)
}

#[derive(Debug, Clone)]
struct CompiledImmovableAssignment {
    person_idx: usize,
    session_idx: usize,
    group_idx: usize,
}

fn compile_immovable_assignments(
    input: &ApiInput,
    person_id_to_idx: &HashMap<String, usize>,
    group_id_to_idx: &HashMap<String, usize>,
) -> Result<Vec<CompiledImmovableAssignment>, SolverError> {
    let num_sessions = input.problem.num_sessions as usize;
    let mut assignments = Vec::new();

    for constraint in &input.constraints {
        match constraint {
            Constraint::ImmovablePerson(params) => {
                let &person_idx = person_id_to_idx.get(&params.person_id).ok_or_else(|| {
                    SolverError::ValidationError(format!(
                        "ImmovablePerson references unknown person '{}'",
                        params.person_id
                    ))
                })?;
                let &group_idx = group_id_to_idx.get(&params.group_id).ok_or_else(|| {
                    SolverError::ValidationError(format!(
                        "ImmovablePerson references unknown group '{}'",
                        params.group_id
                    ))
                })?;
                for session in params
                    .sessions
                    .clone()
                    .unwrap_or_else(|| (0..num_sessions as u32).collect())
                {
                    let session_idx = session as usize;
                    if session_idx >= num_sessions {
                        return Err(SolverError::ValidationError(format!(
                            "ImmovablePerson references invalid session {} (max: {})",
                            session_idx,
                            num_sessions.saturating_sub(1)
                        )));
                    }
                    assignments.push(CompiledImmovableAssignment {
                        person_idx,
                        session_idx,
                        group_idx,
                    });
                }
            }
            Constraint::ImmovablePeople(params) => {
                let &group_idx = group_id_to_idx.get(&params.group_id).ok_or_else(|| {
                    SolverError::ValidationError(format!(
                        "ImmovablePeople references unknown group '{}'",
                        params.group_id
                    ))
                })?;
                for session in params
                    .sessions
                    .clone()
                    .unwrap_or_else(|| (0..num_sessions as u32).collect())
                {
                    let session_idx = session as usize;
                    if session_idx >= num_sessions {
                        return Err(SolverError::ValidationError(format!(
                            "ImmovablePeople references invalid session {} (max: {})",
                            session_idx,
                            num_sessions.saturating_sub(1)
                        )));
                    }
                    for person_id in &params.people {
                        let &person_idx = person_id_to_idx.get(person_id).ok_or_else(|| {
                            SolverError::ValidationError(format!(
                                "ImmovablePeople references unknown person '{}'",
                                person_id
                            ))
                        })?;
                        assignments.push(CompiledImmovableAssignment {
                            person_idx,
                            session_idx,
                            group_idx,
                        });
                    }
                }
            }
            _ => {}
        }
    }

    Ok(assignments)
}

fn validate_hard_constraints(
    schedule: &IndexedSchedule,
    person_participation: &[Vec<bool>],
    cliques: &[CompiledClique],
    immovable_assignments: &[CompiledImmovableAssignment],
    person_idx_to_id: &[String],
    group_idx_to_id: &[String],
) -> Result<(), SolverError> {
    let num_sessions = schedule.len();
    let num_people = person_idx_to_id.len();
    let mut person_groups = vec![vec![None; num_people]; num_sessions];

    for (session_idx, groups) in schedule.iter().enumerate() {
        for (group_idx, members) in groups.iter().enumerate() {
            for &person_idx in members {
                person_groups[session_idx][person_idx] = Some(group_idx);
            }
        }
    }

    for clique in cliques {
        for session_idx in 0..num_sessions {
            if let Some(sessions) = &clique.sessions {
                if !sessions.contains(&session_idx) {
                    continue;
                }
            }
            let active_members = clique
                .members
                .iter()
                .copied()
                .filter(|&person_idx| person_participation[person_idx][session_idx])
                .collect::<Vec<_>>();
            if active_members.len() < 2 {
                continue;
            }
            let mut groups = active_members
                .iter()
                .filter_map(|&person_idx| person_groups[session_idx][person_idx])
                .collect::<Vec<_>>();
            groups.sort_unstable();
            groups.dedup();
            if groups.len() > 1 {
                let members = active_members
                    .iter()
                    .map(|&person_idx| person_idx_to_id[person_idx].clone())
                    .collect::<Vec<_>>();
                return Err(SolverError::ValidationError(format!(
                    "warm start splits must-stay-together clique {:?} across multiple groups in session {}",
                    members, session_idx
                )));
            }
        }
    }

    for assignment in immovable_assignments {
        if !person_participation[assignment.person_idx][assignment.session_idx] {
            continue;
        }
        let actual_group = person_groups[assignment.session_idx][assignment.person_idx];
        if actual_group != Some(assignment.group_idx) {
            return Err(SolverError::ValidationError(format!(
                "warm start places immovable person '{}' in group '{}' instead of '{}' for session {}",
                person_idx_to_id[assignment.person_idx],
                actual_group
                    .map(|group_idx| group_idx_to_id[group_idx].clone())
                    .unwrap_or_else(|| "<unassigned>".to_string()),
                group_idx_to_id[assignment.group_idx],
                assignment.session_idx
            )));
        }
    }

    Ok(())
}

#[derive(Debug, Clone)]
struct Dsu {
    parent: Vec<usize>,
    rank: Vec<u8>,
}

impl Dsu {
    fn new(size: usize) -> Self {
        Self {
            parent: (0..size).collect(),
            rank: vec![0; size],
        }
    }

    fn find(&mut self, value: usize) -> usize {
        if self.parent[value] != value {
            let root = self.find(self.parent[value]);
            self.parent[value] = root;
        }
        self.parent[value]
    }

    fn union(&mut self, left: usize, right: usize) {
        let left_root = self.find(left);
        let right_root = self.find(right);
        if left_root == right_root {
            return;
        }
        match self.rank[left_root].cmp(&self.rank[right_root]) {
            std::cmp::Ordering::Less => self.parent[left_root] = right_root,
            std::cmp::Ordering::Greater => self.parent[right_root] = left_root,
            std::cmp::Ordering::Equal => {
                self.parent[right_root] = left_root;
                self.rank[left_root] += 1;
            }
        }
    }
}
