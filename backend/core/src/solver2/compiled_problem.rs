use crate::models::{
    ApiInput, AttributeBalanceMode, Constraint, Objective, PairMeetingMode, ProblemDefinition,
    SolverKind,
};
use crate::solver_support::validation::{
    validate_schedule_as_construction_seed, validate_schedule_input_mode,
};
use crate::solver_support::SolverError;
use std::collections::{HashMap, HashSet};

pub(crate) type IndexedSchedule = Vec<Vec<Vec<usize>>>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RepeatPenaltyFunction {
    Linear,
    Squared,
}

impl RepeatPenaltyFunction {
    fn parse(value: &str) -> Result<Self, SolverError> {
        match value {
            "linear" => Ok(Self::Linear),
            "squared" => Ok(Self::Squared),
            other => Err(SolverError::ValidationError(format!(
                "Invalid RepeatEncounter penalty_function '{}'. Expected 'linear' or 'squared'",
                other
            ))),
        }
    }

    pub(crate) fn penalty_for_excess(self, excess_contacts: u32) -> i32 {
        let excess = excess_contacts as i32;
        match self {
            Self::Linear => excess,
            Self::Squared => excess * excess,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct CompiledClique {
    pub members: Vec<usize>,
    pub sessions: Option<Vec<usize>>,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct CompiledPairConstraint {
    pub people: (usize, usize),
    pub penalty_weight: f64,
    pub sessions: Option<Vec<usize>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct CompiledImmovableAssignment {
    pub person_idx: usize,
    pub session_idx: usize,
    pub group_idx: usize,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct CompiledPairMeetingConstraint {
    pub people: (usize, usize),
    pub sessions: Vec<usize>,
    pub target_meetings: u32,
    pub mode: PairMeetingMode,
    pub penalty_weight: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct CompiledAttributeBalanceConstraint {
    pub target_group_indices: Vec<usize>,
    pub attr_idx: usize,
    pub desired_counts: Vec<(usize, u32)>,
    pub penalty_weight: f64,
    pub mode: AttributeBalanceMode,
    pub sessions: Option<Vec<usize>>,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct CompiledRepeatEncounterConstraint {
    pub max_allowed_encounters: u32,
    pub penalty_weight: f64,
    pub penalty_function: RepeatPenaltyFunction,
}

/// Immutable compiled representation of the problem for the `solver2` family.
#[derive(Debug, Clone)]
pub struct CompiledProblem {
    pub problem: ProblemDefinition,
    pub objectives: Vec<Objective>,
    pub constraints: Vec<Constraint>,
    pub solver_kind: SolverKind,

    pub num_people: usize,
    pub num_groups: usize,
    pub num_sessions: usize,

    pub person_id_to_idx: HashMap<String, usize>,
    pub person_idx_to_id: Vec<String>,
    pub group_id_to_idx: HashMap<String, usize>,
    pub group_idx_to_id: Vec<String>,

    pub group_capacities: Vec<usize>,
    pub effective_group_capacities: Vec<usize>,
    pub session_total_capacities: Vec<usize>,
    pub session_max_group_capacities: Vec<usize>,
    pub allowed_sessions: Option<Vec<usize>>,

    pub attr_key_to_idx: HashMap<String, usize>,
    pub attr_idx_to_key: Vec<String>,
    pub attr_val_to_idx: Vec<HashMap<String, usize>>,
    pub attr_idx_to_val: Vec<Vec<String>>,
    pub person_attribute_value_indices: Vec<Vec<Option<usize>>>,

    pub person_participation: Vec<Vec<bool>>,
    pub compiled_construction_seed_schedule: Option<IndexedSchedule>,

    pub(crate) cliques: Vec<CompiledClique>,
    pub person_to_clique_id: Vec<Vec<Option<usize>>>,
    pub(crate) forbidden_pairs: Vec<CompiledPairConstraint>,
    pub forbidden_pairs_by_person: Vec<Vec<usize>>,
    pub(crate) should_together_pairs: Vec<CompiledPairConstraint>,
    pub should_together_pairs_by_person: Vec<Vec<usize>>,
    pub(crate) immovable_assignments: Vec<CompiledImmovableAssignment>,
    pub immovable_lookup: HashMap<(usize, usize), usize>,
    pub(crate) pair_meeting_constraints: Vec<CompiledPairMeetingConstraint>,
    pub pair_meeting_constraints_by_person: Vec<Vec<usize>>,
    pub(crate) attribute_balance_constraints: Vec<CompiledAttributeBalanceConstraint>,
    pub attribute_balance_constraints_by_group_session: Vec<Vec<usize>>,

    pub maximize_unique_contacts_weight: f64,
    pub(crate) repeat_encounter: Option<CompiledRepeatEncounterConstraint>,
    pub baseline_score: f64,
}

impl CompiledProblem {
    /// Builds the immutable `solver2` problem boundary from a normal API input.
    pub fn compile(input: &ApiInput) -> Result<Self, SolverError> {
        let solver_kind = input
            .solver
            .validate_solver_selection()
            .map_err(SolverError::ValidationError)?;

        if solver_kind != SolverKind::Solver2 {
            return Err(SolverError::ValidationError(format!(
                "solver2::CompiledProblem expected solver family 'solver2', got '{}'",
                solver_kind.canonical_id()
            )));
        }

        validate_schedule_input_mode(input)?;

        let num_people = input.problem.people.len();
        let num_groups = input.problem.groups.len();
        let num_sessions = input.problem.num_sessions as usize;

        let person_id_to_idx = build_person_index(input)?;
        let person_idx_to_id = input
            .problem
            .people
            .iter()
            .map(|person| person.id.clone())
            .collect::<Vec<_>>();

        let group_id_to_idx = build_group_index(input)?;
        let group_idx_to_id = input
            .problem
            .groups
            .iter()
            .map(|group| group.id.clone())
            .collect::<Vec<_>>();

        let person_participation = build_person_participation(input)?;
        let (
            group_capacities,
            effective_group_capacities,
            session_total_capacities,
            session_max_group_capacities,
        ) = build_effective_group_capacities(input)?;
        validate_session_capacities(&person_participation, &session_total_capacities)?;

        let allowed_sessions = normalize_allowed_sessions(input)?;

        let (
            attr_key_to_idx,
            attr_idx_to_key,
            attr_val_to_idx,
            attr_idx_to_val,
            person_attribute_value_indices,
        ) = build_attribute_indexes(input)?;

        let compiled_construction_seed_schedule = compile_construction_seed_schedule(input)?;

        let immovable_assignments = compile_immovable_assignments(
            input,
            &person_id_to_idx,
            &group_id_to_idx,
            num_sessions,
        )?;
        let immovable_lookup = immovable_assignments
            .iter()
            .map(|assignment| {
                (
                    (assignment.person_idx, assignment.session_idx),
                    assignment.group_idx,
                )
            })
            .collect::<HashMap<_, _>>();

        let (cliques, person_to_clique_id) =
            compile_cliques(input, &person_id_to_idx, num_sessions)?;
        validate_cliques_against_capacities(
            &cliques,
            &person_participation,
            &session_max_group_capacities,
        )?;
        validate_cliques_against_immovable_assignments(
            &cliques,
            &person_participation,
            &immovable_lookup,
        )?;

        let forbidden_pairs = compile_forbidden_pairs(
            input,
            &person_id_to_idx,
            &person_to_clique_id,
            &cliques,
            num_sessions,
        )?;
        let forbidden_pairs_by_person =
            build_pair_adjacency(num_people, &forbidden_pairs, |c| c.people);

        let should_together_pairs = compile_should_together_pairs(
            input,
            &person_id_to_idx,
            &forbidden_pairs,
            num_sessions,
        )?;
        let should_together_pairs_by_person =
            build_pair_adjacency(num_people, &should_together_pairs, |c| c.people);

        let pair_meeting_constraints =
            compile_pair_meeting_constraints(input, &person_id_to_idx, &person_participation)?;
        let pair_meeting_constraints_by_person =
            build_pair_adjacency(num_people, &pair_meeting_constraints, |c| c.people);

        let (attribute_balance_constraints, attribute_balance_constraints_by_group_session) =
            compile_attribute_balance_constraints(
                input,
                &group_id_to_idx,
                &attr_key_to_idx,
                &attr_val_to_idx,
                num_groups,
                num_sessions,
            )?;

        let maximize_unique_contacts_weight = input
            .objectives
            .iter()
            .find(|objective| objective.r#type == "maximize_unique_contacts")
            .map(|objective| objective.weight)
            .unwrap_or(0.0);

        let repeat_encounter = compile_repeat_encounter(input)?;

        let max_possible_unique_contacts = if num_people >= 2 {
            std::cmp::min(
                (num_people * (num_people - 1)) / 2,
                (num_people
                    * num_sessions
                    * (session_max_group_capacities
                        .iter()
                        .max()
                        .copied()
                        .unwrap_or(1)
                        - 1))
                    / 2,
            )
        } else {
            0
        };
        let baseline_score = max_possible_unique_contacts as f64 * maximize_unique_contacts_weight;

        Ok(Self {
            problem: input.problem.clone(),
            objectives: input.objectives.clone(),
            constraints: input.constraints.clone(),
            solver_kind,
            num_people,
            num_groups,
            num_sessions,
            person_id_to_idx,
            person_idx_to_id,
            group_id_to_idx,
            group_idx_to_id,
            group_capacities,
            effective_group_capacities,
            session_total_capacities,
            session_max_group_capacities,
            allowed_sessions,
            attr_key_to_idx,
            attr_idx_to_key,
            attr_val_to_idx,
            attr_idx_to_val,
            person_attribute_value_indices,
            person_participation,
            compiled_construction_seed_schedule,
            cliques,
            person_to_clique_id,
            forbidden_pairs,
            forbidden_pairs_by_person,
            should_together_pairs,
            should_together_pairs_by_person,
            immovable_assignments,
            immovable_lookup,
            pair_meeting_constraints,
            pair_meeting_constraints_by_person,
            attribute_balance_constraints,
            attribute_balance_constraints_by_group_session,
            maximize_unique_contacts_weight,
            repeat_encounter,
            baseline_score,
        })
    }

    #[inline]
    pub(crate) fn flat_group_session_slot(&self, session_idx: usize, group_idx: usize) -> usize {
        flat_group_session_slot(self.num_groups, session_idx, group_idx)
    }

    #[inline]
    pub(crate) fn group_capacity(&self, session_idx: usize, group_idx: usize) -> usize {
        self.effective_group_capacities[self.flat_group_session_slot(session_idx, group_idx)]
    }

    pub(crate) fn display_person_idx(&self, person_idx: usize) -> String {
        self.person_idx_to_id
            .get(person_idx)
            .cloned()
            .unwrap_or_else(|| format!("person#{person_idx}"))
    }

    pub(crate) fn display_group_idx(&self, group_idx: usize) -> String {
        self.group_idx_to_id
            .get(group_idx)
            .cloned()
            .unwrap_or_else(|| format!("group#{group_idx}"))
    }
}

fn build_person_index(input: &ApiInput) -> Result<HashMap<String, usize>, SolverError> {
    let mut seen_ids = HashSet::new();
    let mut result = HashMap::new();

    for (idx, person) in input.problem.people.iter().enumerate() {
        if !seen_ids.insert(person.id.clone()) {
            return Err(SolverError::ValidationError(format!(
                "Duplicate person ID: '{}'",
                person.id
            )));
        }
        result.insert(person.id.clone(), idx);
    }

    Ok(result)
}

fn build_group_index(input: &ApiInput) -> Result<HashMap<String, usize>, SolverError> {
    let mut seen_ids = HashSet::new();
    let mut result = HashMap::new();

    for (idx, group) in input.problem.groups.iter().enumerate() {
        if !seen_ids.insert(group.id.clone()) {
            return Err(SolverError::ValidationError(format!(
                "Duplicate group ID: '{}'",
                group.id
            )));
        }
        result.insert(group.id.clone(), idx);
    }

    Ok(result)
}

fn build_person_participation(input: &ApiInput) -> Result<Vec<Vec<bool>>, SolverError> {
    let num_sessions = input.problem.num_sessions as usize;
    let mut person_participation = vec![vec![false; num_sessions]; input.problem.people.len()];

    for (person_idx, person) in input.problem.people.iter().enumerate() {
        if let Some(sessions) = &person.sessions {
            for &session in sessions {
                let session_idx = session as usize;
                if session_idx >= num_sessions {
                    return Err(SolverError::ValidationError(format!(
                        "Person '{}' has invalid session index: {} (max: {})",
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

fn build_effective_group_capacities(
    input: &ApiInput,
) -> Result<(Vec<usize>, Vec<usize>, Vec<usize>, Vec<usize>), SolverError> {
    let num_sessions = input.problem.num_sessions as usize;
    let group_capacities = input
        .problem
        .groups
        .iter()
        .map(|group| group.size as usize)
        .collect::<Vec<_>>();

    let mut effective_group_capacities = vec![0; input.problem.groups.len() * num_sessions];
    let mut session_total_capacities = vec![0; num_sessions];
    let mut session_max_group_capacities = vec![0; num_sessions];

    for (group_idx, group) in input.problem.groups.iter().enumerate() {
        if let Some(session_sizes) = &group.session_sizes {
            if session_sizes.len() != num_sessions {
                return Err(SolverError::ValidationError(format!(
                    "Group '{}' has {} session_sizes entries but problem has {} sessions",
                    group.id,
                    session_sizes.len(),
                    num_sessions
                )));
            }
        }

        for session_idx in 0..num_sessions {
            let capacity = group
                .session_sizes
                .as_ref()
                .map(|sizes| sizes[session_idx] as usize)
                .unwrap_or(group.size as usize);
            let slot = flat_group_session_slot(input.problem.groups.len(), session_idx, group_idx);
            effective_group_capacities[slot] = capacity;
            session_total_capacities[session_idx] += capacity;
            session_max_group_capacities[session_idx] =
                session_max_group_capacities[session_idx].max(capacity);
        }
    }

    Ok((
        group_capacities,
        effective_group_capacities,
        session_total_capacities,
        session_max_group_capacities,
    ))
}

fn validate_session_capacities(
    person_participation: &[Vec<bool>],
    session_total_capacities: &[usize],
) -> Result<(), SolverError> {
    for session_idx in 0..session_total_capacities.len() {
        let people_in_session = person_participation
            .iter()
            .filter(|sessions| sessions[session_idx])
            .count();
        let capacity = session_total_capacities[session_idx];
        if people_in_session > capacity {
            return Err(SolverError::ValidationError(format!(
                "Not enough group capacity in session {}. People: {}, Capacity: {}",
                session_idx, people_in_session, capacity
            )));
        }
    }

    Ok(())
}

fn normalize_allowed_sessions(input: &ApiInput) -> Result<Option<Vec<usize>>, SolverError> {
    let Some(sessions) = &input.solver.allowed_sessions else {
        return Ok(None);
    };

    if sessions.is_empty() {
        return Err(SolverError::ValidationError(
            "allowed_sessions cannot be empty".to_string(),
        ));
    }

    let mut normalized = sessions
        .iter()
        .map(|session| *session as usize)
        .collect::<Vec<_>>();
    normalized.sort_unstable();
    normalized.dedup();

    for &session in &normalized {
        if session >= input.problem.num_sessions as usize {
            return Err(SolverError::ValidationError(format!(
                "allowed_sessions contains invalid session {} (max: {})",
                session,
                input.problem.num_sessions.saturating_sub(1)
            )));
        }
    }

    Ok(Some(normalized))
}

fn build_attribute_indexes(
    input: &ApiInput,
) -> Result<
    (
        HashMap<String, usize>,
        Vec<String>,
        Vec<HashMap<String, usize>>,
        Vec<Vec<String>>,
        Vec<Vec<Option<usize>>>,
    ),
    SolverError,
> {
    let mut attr_key_to_idx = HashMap::new();
    let mut attr_idx_to_key = Vec::new();
    let mut attr_val_to_idx = Vec::new();
    let mut attr_idx_to_val = Vec::new();

    for constraint in &input.constraints {
        if let Constraint::AttributeBalance(params) = constraint {
            if !attr_key_to_idx.contains_key(&params.attribute_key) {
                let idx = attr_idx_to_key.len();
                attr_key_to_idx.insert(params.attribute_key.clone(), idx);
                attr_idx_to_key.push(params.attribute_key.clone());
                attr_val_to_idx.push(HashMap::new());
                attr_idx_to_val.push(Vec::new());
            }
        }
    }

    for person in &input.problem.people {
        for key in person.attributes.keys() {
            if !attr_key_to_idx.contains_key(key) {
                let idx = attr_idx_to_key.len();
                attr_key_to_idx.insert(key.clone(), idx);
                attr_idx_to_key.push(key.clone());
                attr_val_to_idx.push(HashMap::new());
                attr_idx_to_val.push(Vec::new());
            }
        }
    }

    for person in &input.problem.people {
        for (key, value) in &person.attributes {
            let Some(&attr_idx) = attr_key_to_idx.get(key) else {
                continue;
            };
            let value_map = &mut attr_val_to_idx[attr_idx];
            if !value_map.contains_key(value) {
                let value_idx = value_map.len();
                value_map.insert(value.clone(), value_idx);
                attr_idx_to_val[attr_idx].push(value.clone());
            }
        }
    }

    let mut person_attribute_value_indices =
        vec![vec![None; attr_key_to_idx.len()]; input.problem.people.len()];
    for (person_idx, person) in input.problem.people.iter().enumerate() {
        for (key, value) in &person.attributes {
            let Some(&attr_idx) = attr_key_to_idx.get(key) else {
                continue;
            };
            let Some(&value_idx) = attr_val_to_idx[attr_idx].get(value) else {
                continue;
            };
            person_attribute_value_indices[person_idx][attr_idx] = Some(value_idx);
        }
    }

    Ok((
        attr_key_to_idx,
        attr_idx_to_key,
        attr_val_to_idx,
        attr_idx_to_val,
        person_attribute_value_indices,
    ))
}

fn compile_construction_seed_schedule(
    input: &ApiInput,
) -> Result<Option<IndexedSchedule>, SolverError> {
    let Some(construction_seed_schedule) = &input.construction_seed_schedule else {
        return Ok(None);
    };

    Ok(Some(
        validate_schedule_as_construction_seed(input, construction_seed_schedule)?.schedule,
    ))
}

fn compile_immovable_assignments(
    input: &ApiInput,
    person_id_to_idx: &HashMap<String, usize>,
    group_id_to_idx: &HashMap<String, usize>,
    num_sessions: usize,
) -> Result<Vec<CompiledImmovableAssignment>, SolverError> {
    let mut assignments = Vec::new();

    for constraint in &input.constraints {
        match constraint {
            Constraint::ImmovablePerson(params) => {
                let Some(&person_idx) = person_id_to_idx.get(&params.person_id) else {
                    return Err(SolverError::ValidationError(format!(
                        "Person {} not found.",
                        params.person_id
                    )));
                };
                let Some(&group_idx) = group_id_to_idx.get(&params.group_id) else {
                    return Err(SolverError::ValidationError(format!(
                        "Group '{}' not found.",
                        params.group_id
                    )));
                };

                let sessions = params
                    .sessions
                    .clone()
                    .unwrap_or_else(|| (0..num_sessions as u32).collect());
                for session in sessions {
                    let session_idx = session as usize;
                    if session_idx >= num_sessions {
                        return Err(SolverError::ValidationError(format!(
                            "Session index {} out of bounds for immovable person {}.",
                            session_idx, params.person_id
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
                let Some(&group_idx) = group_id_to_idx.get(&params.group_id) else {
                    return Err(SolverError::ValidationError(format!(
                        "Group '{}' not found.",
                        params.group_id
                    )));
                };

                let sessions = params
                    .sessions
                    .clone()
                    .unwrap_or_else(|| (0..num_sessions as u32).collect());
                for person_id in &params.people {
                    let Some(&person_idx) = person_id_to_idx.get(person_id) else {
                        return Err(SolverError::ValidationError(format!(
                            "Person {} not found.",
                            person_id
                        )));
                    };
                    for session in &sessions {
                        let session_idx = *session as usize;
                        if session_idx >= num_sessions {
                            return Err(SolverError::ValidationError(format!(
                                "Session index {} out of bounds for immovable person {}.",
                                session_idx, person_id
                            )));
                        }
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

    assignments.sort_by_key(|assignment| {
        (
            assignment.session_idx,
            assignment.person_idx,
            assignment.group_idx,
        )
    });
    assignments.dedup();

    Ok(assignments)
}

fn compile_cliques(
    input: &ApiInput,
    person_id_to_idx: &HashMap<String, usize>,
    num_sessions: usize,
) -> Result<(Vec<CompiledClique>, Vec<Vec<Option<usize>>>), SolverError> {
    let num_people = input.problem.people.len();
    let mut cliques = Vec::new();
    let mut clique_sessions = Vec::<Option<Vec<usize>>>::new();
    let mut members_to_id = HashMap::<Vec<usize>, usize>::new();
    let mut person_to_clique_id = vec![vec![None; num_people]; num_sessions];

    for session_idx in 0..num_sessions {
        let mut dsu = Dsu::new(num_people);

        for constraint in &input.constraints {
            if let Constraint::MustStayTogether { people, sessions } = constraint {
                let active = match sessions {
                    Some(list) => list.iter().any(|&session| session as usize == session_idx),
                    None => true,
                };
                if !active || people.len() < 2 {
                    continue;
                }

                for window in people.windows(2) {
                    let Some(&left) = person_id_to_idx.get(&window[0]) else {
                        return Err(SolverError::ValidationError(format!(
                            "MustStayTogether references unknown person {}",
                            window[0]
                        )));
                    };
                    let Some(&right) = person_id_to_idx.get(&window[1]) else {
                        return Err(SolverError::ValidationError(format!(
                            "MustStayTogether references unknown person {}",
                            window[1]
                        )));
                    };
                    dsu.union(left, right);
                }
            }
        }

        let mut root_to_members = HashMap::<usize, Vec<usize>>::new();
        for person_idx in 0..num_people {
            let root = dsu.find(person_idx);
            root_to_members.entry(root).or_default().push(person_idx);
        }

        let mut clique_members = root_to_members
            .into_values()
            .filter(|members| members.len() >= 2)
            .map(|mut members| {
                members.sort_unstable();
                members
            })
            .collect::<Vec<_>>();
        clique_members.sort_unstable();

        for members in clique_members {
            let clique_idx = match members_to_id.get(&members) {
                Some(&existing) => existing,
                None => {
                    let next_idx = cliques.len();
                    members_to_id.insert(members.clone(), next_idx);
                    cliques.push(CompiledClique {
                        members: members.clone(),
                        sessions: Some(Vec::new()),
                    });
                    clique_sessions.push(Some(Vec::new()));
                    next_idx
                }
            };

            if let Some(sessions) = &mut clique_sessions[clique_idx] {
                if !sessions.contains(&session_idx) {
                    sessions.push(session_idx);
                }
            }

            for &member in &members {
                if person_to_clique_id[session_idx][member].is_some() {
                    return Err(SolverError::ValidationError(format!(
                        "Person {} is part of multiple cliques in session {}.",
                        input.problem.people[member].id, session_idx
                    )));
                }
                person_to_clique_id[session_idx][member] = Some(clique_idx);
            }
        }
    }

    for (clique_idx, sessions) in clique_sessions.into_iter().enumerate() {
        cliques[clique_idx].sessions = match sessions {
            Some(mut sessions) => {
                sessions.sort_unstable();
                if sessions.len() == num_sessions {
                    None
                } else {
                    Some(sessions)
                }
            }
            None => None,
        };
    }

    Ok((cliques, person_to_clique_id))
}

fn validate_cliques_against_capacities(
    cliques: &[CompiledClique],
    person_participation: &[Vec<bool>],
    session_max_group_capacities: &[usize],
) -> Result<(), SolverError> {
    for clique in cliques {
        for session_idx in 0..session_max_group_capacities.len() {
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
                .filter(|&&member| person_participation[member][session_idx])
                .count();
            if participating_members > session_max_group_capacities[session_idx] {
                return Err(SolverError::ValidationError(format!(
                    "Clique of size {} cannot fit in any group for session {}",
                    participating_members, session_idx
                )));
            }
        }
    }

    Ok(())
}

fn validate_cliques_against_immovable_assignments(
    cliques: &[CompiledClique],
    person_participation: &[Vec<bool>],
    immovable_lookup: &HashMap<(usize, usize), usize>,
) -> Result<(), SolverError> {
    for clique in cliques {
        for session_idx in 0..person_participation.first().map_or(0, Vec::len) {
            let active = match &clique.sessions {
                Some(sessions) => sessions.contains(&session_idx),
                None => true,
            };
            if !active {
                continue;
            }

            let mut required_group = None;
            for &member in &clique.members {
                if !person_participation[member][session_idx] {
                    continue;
                }
                if let Some(&group_idx) = immovable_lookup.get(&(member, session_idx)) {
                    match required_group {
                        Some(existing) if existing != group_idx => {
                            return Err(SolverError::ValidationError(format!(
                                "MustStayTogether clique has conflicting immovable group assignments in session {}",
                                session_idx
                            )));
                        }
                        None => required_group = Some(group_idx),
                        _ => {}
                    }
                }
            }
        }
    }

    Ok(())
}

fn compile_forbidden_pairs(
    input: &ApiInput,
    person_id_to_idx: &HashMap<String, usize>,
    person_to_clique_id: &[Vec<Option<usize>>],
    cliques: &[CompiledClique],
    num_sessions: usize,
) -> Result<Vec<CompiledPairConstraint>, SolverError> {
    let mut forbidden_pairs = Vec::new();

    for constraint in &input.constraints {
        if let Constraint::ShouldNotBeTogether {
            people,
            penalty_weight,
            sessions,
        } = constraint
        {
            for left_idx in 0..people.len() {
                for right_idx in (left_idx + 1)..people.len() {
                    let Some(&left_person_idx) = person_id_to_idx.get(&people[left_idx]) else {
                        return Err(SolverError::ValidationError(format!(
                            "ShouldNotBeTogether references unknown person {}",
                            people[left_idx]
                        )));
                    };
                    let Some(&right_person_idx) = person_id_to_idx.get(&people[right_idx]) else {
                        return Err(SolverError::ValidationError(format!(
                            "ShouldNotBeTogether references unknown person {}",
                            people[right_idx]
                        )));
                    };

                    for session_idx in 0..num_sessions {
                        if let Some(active_sessions) = sessions {
                            if !active_sessions.contains(&(session_idx as u32)) {
                                continue;
                            }
                        }

                        if let (Some(left_clique), Some(right_clique)) = (
                            person_to_clique_id[session_idx][left_person_idx],
                            person_to_clique_id[session_idx][right_person_idx],
                        ) {
                            if left_clique == right_clique {
                                let clique_member_ids = cliques[left_clique]
                                    .members
                                    .iter()
                                    .map(|&member| input.problem.people[member].id.clone())
                                    .collect::<Vec<_>>();
                                return Err(SolverError::ValidationError(format!(
                                    "ShouldNotBeTogether constraint conflicts with MustStayTogether in session {}: people {:?} are in the same clique {:?}",
                                    session_idx, people, clique_member_ids
                                )));
                            }
                        }
                    }

                    let compiled_sessions = sessions.as_ref().map(|sessions| {
                        let mut normalized = sessions
                            .iter()
                            .map(|&session| session as usize)
                            .collect::<Vec<_>>();
                        normalized.sort_unstable();
                        normalized.dedup();
                        normalized
                    });
                    if let Some(compiled_sessions) = &compiled_sessions {
                        for &session_idx in compiled_sessions {
                            if session_idx >= num_sessions {
                                return Err(SolverError::ValidationError(format!(
                                    "ShouldNotBeTogether references invalid session {}",
                                    session_idx
                                )));
                            }
                        }
                    }

                    forbidden_pairs.push(CompiledPairConstraint {
                        people: (left_person_idx, right_person_idx),
                        penalty_weight: *penalty_weight,
                        sessions: compiled_sessions,
                    });
                }
            }
        }
    }

    Ok(forbidden_pairs)
}

fn compile_should_together_pairs(
    input: &ApiInput,
    person_id_to_idx: &HashMap<String, usize>,
    forbidden_pairs: &[CompiledPairConstraint],
    num_sessions: usize,
) -> Result<Vec<CompiledPairConstraint>, SolverError> {
    let mut should_together_pairs = Vec::new();

    for constraint in &input.constraints {
        if let Constraint::ShouldStayTogether {
            people,
            penalty_weight,
            sessions,
        } = constraint
        {
            for left_idx in 0..people.len() {
                for right_idx in (left_idx + 1)..people.len() {
                    let Some(&left_person_idx) = person_id_to_idx.get(&people[left_idx]) else {
                        return Err(SolverError::ValidationError(format!(
                            "ShouldStayTogether references unknown person {}",
                            people[left_idx]
                        )));
                    };
                    let Some(&right_person_idx) = person_id_to_idx.get(&people[right_idx]) else {
                        return Err(SolverError::ValidationError(format!(
                            "ShouldStayTogether references unknown person {}",
                            people[right_idx]
                        )));
                    };

                    let compiled_sessions = sessions.as_ref().map(|sessions| {
                        let mut normalized = sessions
                            .iter()
                            .map(|&session| session as usize)
                            .collect::<Vec<_>>();
                        normalized.sort_unstable();
                        normalized.dedup();
                        normalized
                    });
                    if let Some(compiled_sessions) = &compiled_sessions {
                        for &session_idx in compiled_sessions {
                            if session_idx >= num_sessions {
                                return Err(SolverError::ValidationError(format!(
                                    "ShouldStayTogether references invalid session {}",
                                    session_idx
                                )));
                            }
                        }
                    }

                    if forbidden_pairs.iter().any(|forbidden| {
                        same_pair(forbidden.people, (left_person_idx, right_person_idx))
                            && sessions_overlap(
                                forbidden.sessions.as_deref(),
                                compiled_sessions.as_deref(),
                            )
                    }) {
                        return Err(SolverError::ValidationError(
                            "ShouldStayTogether constraint conflicts with existing ShouldNotBeTogether for the same pair in overlapping sessions".to_string(),
                        ));
                    }

                    should_together_pairs.push(CompiledPairConstraint {
                        people: (left_person_idx, right_person_idx),
                        penalty_weight: *penalty_weight,
                        sessions: compiled_sessions,
                    });
                }
            }
        }
    }

    Ok(should_together_pairs)
}

fn compile_pair_meeting_constraints(
    input: &ApiInput,
    person_id_to_idx: &HashMap<String, usize>,
    person_participation: &[Vec<bool>],
) -> Result<Vec<CompiledPairMeetingConstraint>, SolverError> {
    let num_sessions = input.problem.num_sessions as usize;
    let mut pair_meeting_constraints = Vec::new();

    for constraint in &input.constraints {
        if let Constraint::PairMeetingCount(params) = constraint {
            if params.people.len() != 2 {
                return Err(SolverError::ValidationError(
                    "PairMeetingCount requires exactly two people".to_string(),
                ));
            }

            let Some(&left_person_idx) = person_id_to_idx.get(&params.people[0]) else {
                return Err(SolverError::ValidationError(format!(
                    "Unknown person '{}' in PairMeetingCount",
                    params.people[0]
                )));
            };
            let Some(&right_person_idx) = person_id_to_idx.get(&params.people[1]) else {
                return Err(SolverError::ValidationError(format!(
                    "Unknown person '{}' in PairMeetingCount",
                    params.people[1]
                )));
            };

            let mut sessions = if params.sessions.is_empty() {
                (0..num_sessions).collect::<Vec<_>>()
            } else {
                let mut normalized = Vec::with_capacity(params.sessions.len());
                for &session in &params.sessions {
                    let session_idx = session as usize;
                    if session_idx >= num_sessions {
                        return Err(SolverError::ValidationError(format!(
                            "PairMeetingCount references invalid session {}",
                            session
                        )));
                    }
                    normalized.push(session_idx);
                }
                normalized
            };
            sessions.sort_unstable();
            sessions.dedup();

            if params.target_meetings > sessions.len() as u32 {
                return Err(SolverError::ValidationError(format!(
                    "PairMeetingCount target_meetings={} exceeds number of sessions in subset {}",
                    params.target_meetings,
                    sessions.len()
                )));
            }

            let feasible_sessions = sessions
                .iter()
                .filter(|&&session_idx| {
                    person_participation[left_person_idx][session_idx]
                        && person_participation[right_person_idx][session_idx]
                })
                .count() as u32;
            if params.mode == PairMeetingMode::AtLeast && params.target_meetings > feasible_sessions
            {
                return Err(SolverError::ValidationError(format!(
                    "PairMeetingCount target_meetings={} exceeds feasible co-participation {} for the pair",
                    params.target_meetings, feasible_sessions
                )));
            }

            pair_meeting_constraints.push(CompiledPairMeetingConstraint {
                people: (left_person_idx, right_person_idx),
                sessions,
                target_meetings: params.target_meetings,
                mode: params.mode,
                penalty_weight: params.penalty_weight,
            });
        }
    }

    Ok(pair_meeting_constraints)
}

fn compile_attribute_balance_constraints(
    input: &ApiInput,
    group_id_to_idx: &HashMap<String, usize>,
    attr_key_to_idx: &HashMap<String, usize>,
    attr_val_to_idx: &[HashMap<String, usize>],
    num_groups: usize,
    num_sessions: usize,
) -> Result<(Vec<CompiledAttributeBalanceConstraint>, Vec<Vec<usize>>), SolverError> {
    let mut attribute_balance_constraints = Vec::new();
    let mut attribute_balance_constraints_by_group_session =
        vec![Vec::new(); num_groups * num_sessions];

    for constraint in &input.constraints {
        let Constraint::AttributeBalance(params) = constraint else {
            continue;
        };

        let target_group_indices = if params.group_id == "ALL" {
            (0..num_groups).collect::<Vec<_>>()
        } else {
            vec![*group_id_to_idx.get(&params.group_id).ok_or_else(|| {
                SolverError::ValidationError(format!(
                    "AttributeBalance references unknown group '{}'",
                    params.group_id
                ))
            })?]
        };

        let attr_idx = *attr_key_to_idx.get(&params.attribute_key).ok_or_else(|| {
            SolverError::ValidationError(format!(
                "AttributeBalance references unknown attribute key '{}'",
                params.attribute_key
            ))
        })?;

        let desired_counts = params
            .desired_values
            .iter()
            .filter_map(|(value, &desired_count)| {
                attr_val_to_idx[attr_idx]
                    .get(value)
                    .copied()
                    .map(|value_idx| (value_idx, desired_count))
            })
            .collect::<Vec<_>>();

        let sessions = params.sessions.as_ref().map(|sessions| {
            let mut normalized = sessions
                .iter()
                .map(|&session| session as usize)
                .collect::<Vec<_>>();
            normalized.sort_unstable();
            normalized.dedup();
            normalized
        });
        if let Some(sessions) = &sessions {
            for &session_idx in sessions {
                if session_idx >= num_sessions {
                    return Err(SolverError::ValidationError(format!(
                        "AttributeBalance references invalid session {} (max: {})",
                        session_idx,
                        num_sessions.saturating_sub(1)
                    )));
                }
            }
        }

        let constraint_idx = attribute_balance_constraints.len();
        attribute_balance_constraints.push(CompiledAttributeBalanceConstraint {
            target_group_indices: target_group_indices.clone(),
            attr_idx,
            desired_counts,
            penalty_weight: params.penalty_weight,
            mode: params.mode,
            sessions: sessions.clone(),
        });

        match &sessions {
            Some(sessions) => {
                for &session_idx in sessions {
                    for &group_idx in &target_group_indices {
                        let slot = flat_group_session_slot(num_groups, session_idx, group_idx);
                        attribute_balance_constraints_by_group_session[slot].push(constraint_idx);
                    }
                }
            }
            None => {
                for session_idx in 0..num_sessions {
                    for &group_idx in &target_group_indices {
                        let slot = flat_group_session_slot(num_groups, session_idx, group_idx);
                        attribute_balance_constraints_by_group_session[slot].push(constraint_idx);
                    }
                }
            }
        }
    }

    Ok((
        attribute_balance_constraints,
        attribute_balance_constraints_by_group_session,
    ))
}

fn compile_repeat_encounter(
    input: &ApiInput,
) -> Result<Option<CompiledRepeatEncounterConstraint>, SolverError> {
    let repeat_constraints = input
        .constraints
        .iter()
        .filter_map(|constraint| match constraint {
            Constraint::RepeatEncounter(params) => Some(params),
            _ => None,
        })
        .collect::<Vec<_>>();

    if repeat_constraints.len() > 1 {
        return Err(SolverError::ValidationError(
            "At most one RepeatEncounter constraint is supported".to_string(),
        ));
    }

    let Some(params) = repeat_constraints.first() else {
        return Ok(None);
    };

    Ok(Some(CompiledRepeatEncounterConstraint {
        max_allowed_encounters: params.max_allowed_encounters,
        penalty_weight: params.penalty_weight,
        penalty_function: RepeatPenaltyFunction::parse(&params.penalty_function)?,
    }))
}

fn build_pair_adjacency<T, F>(num_people: usize, constraints: &[T], people_of: F) -> Vec<Vec<usize>>
where
    F: Fn(&T) -> (usize, usize),
{
    let mut adjacency = vec![Vec::new(); num_people];
    for (constraint_idx, constraint) in constraints.iter().enumerate() {
        let (left, right) = people_of(constraint);
        adjacency[left].push(constraint_idx);
        adjacency[right].push(constraint_idx);
    }
    adjacency
}

fn sessions_overlap(left: Option<&[usize]>, right: Option<&[usize]>) -> bool {
    match (left, right) {
        (None, _) | (_, None) => true,
        (Some(left), Some(right)) => left.iter().any(|session| right.contains(session)),
    }
}

fn same_pair(left: (usize, usize), right: (usize, usize)) -> bool {
    (left.0 == right.0 && left.1 == right.1) || (left.0 == right.1 && left.1 == right.0)
}

#[inline]
pub(crate) fn flat_group_session_slot(width: usize, session_idx: usize, group_idx: usize) -> usize {
    session_idx * width + group_idx
}

#[derive(Debug, Clone)]
struct Dsu {
    parent: Vec<usize>,
    rank: Vec<usize>,
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
            let parent = self.parent[value];
            self.parent[value] = self.find(parent);
        }
        self.parent[value]
    }

    fn union(&mut self, left: usize, right: usize) {
        let left_root = self.find(left);
        let right_root = self.find(right);
        if left_root == right_root {
            return;
        }

        if self.rank[left_root] < self.rank[right_root] {
            self.parent[left_root] = right_root;
        } else if self.rank[left_root] > self.rank[right_root] {
            self.parent[right_root] = left_root;
        } else {
            self.parent[right_root] = left_root;
            self.rank[left_root] += 1;
        }
    }
}
