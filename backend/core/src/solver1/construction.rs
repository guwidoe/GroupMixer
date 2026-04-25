//! State construction and constraint preprocessing.
//!
//! This module contains the `State::new` constructor and constraint
//! preprocessing logic that converts API input into the internal solver state.

use super::{
    constraint_index::{flat_slot, ResolvedAttributeBalanceConstraint},
    Dsu, RepeatPenaltyFunction, SolverError, State,
};
use crate::models::{ApiInput, Constraint, PairMeetingMode};
use crate::solver_support::construction::{
    apply_baseline_construction_heuristic, apply_construction_seed_schedule,
    BaselineConstructionContext,
};
use crate::solver_support::validation::{
    validate_schedule_as_incumbent, validate_schedule_input_mode,
};
use rand::{rng, RngExt};
use std::collections::{HashMap, HashSet};

type EffectiveGroupCapacitySummary = (Vec<usize>, Vec<usize>, Vec<usize>, Vec<usize>);

impl State {
    /// Creates a new solver state from the API input configuration.
    ///
    /// This constructor performs several important tasks:
    /// 1. **Validation**: Checks that the problem is solvable (sufficient per-session group capacity)
    /// 2. **Preprocessing**: Converts string IDs to integer indices for performance
    /// 3. **Constraint Processing**: Merges overlapping constraints and validates compatibility
    /// 4. **Initialization**: Creates initial random schedule and calculates baseline scores
    ///
    /// # Arguments
    ///
    /// * `input` - Complete API input specification with problem, constraints, and solver config
    ///
    /// # Returns
    ///
    /// * `Ok(State)` - Initialized state ready for optimization
    /// * `Err(SolverError)` - Validation error if the problem configuration is invalid
    ///
    /// # Errors
    ///
    /// This function will return an error if:
    /// - Per-session group capacity is insufficient for participating people
    /// - Person or group IDs are not unique
    /// - Referenced IDs in constraints don't exist
    /// - Cliques are too large to fit in any group
    /// - Contradictory constraints are specified
    ///
    /// # Performance Notes
    ///
    /// The constructor does significant preprocessing work to optimize later operations:
    /// - Creates bidirectional ID mappings for O(1) lookups
    /// - Merges overlapping "must-stay-together" constraints using Union-Find
    /// - Preprocesses attribute mappings for fast constraint evaluation
    /// - Initializes contact matrix and scoring data structures
    ///
    /// # Example
    ///
    /// ```no_run
    /// use gm_core::models::*;
    /// use gm_core::solver::State;
    /// use std::collections::HashMap;
    ///
    /// let input = ApiInput {
    ///     initial_schedule: None,
    ///     construction_seed_schedule: None,
    ///     problem: ProblemDefinition {
    ///         people: vec![
    ///             Person {
    ///                 id: "Alice".to_string(),
    ///                 attributes: HashMap::new(),
    ///                 sessions: None,
    ///             },
    ///             Person {
    ///                 id: "Bob".to_string(),
    ///                 attributes: HashMap::new(),
    ///                 sessions: None,
    ///             },
    ///         ],
    ///         groups: vec![
    ///             Group {
    ///                 id: "Team1".to_string(),
    ///                 size: 2,
    ///                 session_sizes: None,
    ///             }
    ///         ],
    ///         num_sessions: 2,
    ///     },
    ///     objectives: vec![],
    ///     constraints: vec![],
    ///     solver: SolverConfiguration {
    ///         solver_type: "SimulatedAnnealing".to_string(),
    ///         stop_conditions: StopConditions {
    ///             max_iterations: Some(1000),
    ///             time_limit_seconds: None,
    ///             no_improvement_iterations: None,
    ///             stop_on_optimal_score: true,
    ///         },
    ///         solver_params: SolverParams::SimulatedAnnealing(
    ///             SimulatedAnnealingParams {
    ///                 initial_temperature: 10.0,
    ///                 final_temperature: 0.1,
    ///                 cooling_schedule: "geometric".to_string(),
    ///                 reheat_after_no_improvement: Some(0),
    ///                 reheat_cycles: Some(0),
    ///             }
    ///         ),
    ///         logging: LoggingOptions::default(),
    ///         telemetry: Default::default(),
    ///         seed: None,
    ///         move_policy: None,
    ///         allowed_sessions: None,
    ///     },
    /// };
    ///
    /// match State::new(&input) {
    ///     Ok(state) => {
    ///         println!("State initialized successfully!");
    ///         println!("Number of people: {}", state.person_idx_to_id.len());
    ///     }
    ///     Err(e) => {
    ///         eprintln!("Failed to create state: {}", e);
    ///     }
    /// }
    /// ```
    pub fn new(input: &ApiInput) -> Result<Self, SolverError> {
        validate_schedule_input_mode(input)?;
        // --- Pre-validation ---
        let people_count = input.problem.people.len();
        let group_count = input.problem.groups.len();
        let num_sessions = input.problem.num_sessions as usize;

        let person_participation = Self::build_person_participation(input)?;
        let (
            group_capacities,
            effective_group_capacities,
            session_total_capacities,
            session_max_group_capacities,
        ) = Self::build_effective_group_capacities(input)?;

        for session_idx in 0..num_sessions {
            let people_in_session = person_participation
                .iter()
                .filter(|sessions| sessions[session_idx])
                .count();
            let session_capacity = session_total_capacities[session_idx];
            if people_in_session > session_capacity {
                return Err(SolverError::ValidationError(format!(
                    "Not enough group capacity in session {}. People: {}, Capacity: {}",
                    session_idx, people_in_session, session_capacity
                )));
            }
        }

        let effective_seed = input.solver.seed.unwrap_or_else(|| rng().random::<u64>());
        let move_policy = input
            .solver
            .move_policy
            .clone()
            .unwrap_or_default()
            .normalized()
            .map_err(SolverError::ValidationError)?;

        let mut seen_person_ids = std::collections::HashSet::new();
        for person in &input.problem.people {
            if !seen_person_ids.insert(person.id.as_str()) {
                return Err(SolverError::ValidationError(format!(
                    "Duplicate person ID: '{}'",
                    person.id
                )));
            }
        }

        let mut seen_group_ids = std::collections::HashSet::new();
        for group in &input.problem.groups {
            if !seen_group_ids.insert(group.id.as_str()) {
                return Err(SolverError::ValidationError(format!(
                    "Duplicate group ID: '{}'",
                    group.id
                )));
            }
        }

        let allowed_sessions = if let Some(sessions) = &input.solver.allowed_sessions {
            if sessions.is_empty() {
                return Err(SolverError::ValidationError(
                    "allowed_sessions cannot be empty".to_string(),
                ));
            }

            let mut normalized = sessions.clone();
            normalized.sort_unstable();
            normalized.dedup();

            for &session in &normalized {
                if session >= input.problem.num_sessions {
                    return Err(SolverError::ValidationError(format!(
                        "allowed_sessions contains invalid session {} (max: {})",
                        session,
                        input.problem.num_sessions.saturating_sub(1)
                    )));
                }
            }

            Some(normalized)
        } else {
            None
        };

        let person_id_to_idx: HashMap<String, usize> = input
            .problem
            .people
            .iter()
            .enumerate()
            .map(|(idx, p)| (p.id.clone(), idx))
            .collect();

        let person_idx_to_id: Vec<String> =
            input.problem.people.iter().map(|p| p.id.clone()).collect();

        let group_id_to_idx: HashMap<String, usize> = input
            .problem
            .groups
            .iter()
            .enumerate()
            .map(|(idx, g)| (g.id.clone(), idx))
            .collect();

        let group_idx_to_id: Vec<String> =
            input.problem.groups.iter().map(|g| g.id.clone()).collect();

        // --- Build Attribute Mappings ---
        let mut attr_key_to_idx = HashMap::new();
        let mut attr_val_to_idx: Vec<HashMap<String, usize>> = Vec::new();
        let mut attr_idx_to_val: Vec<Vec<String>> = Vec::new();

        let all_constraints = &input.constraints;
        for constraint in all_constraints {
            if let Constraint::AttributeBalance(params) = constraint {
                if !attr_key_to_idx.contains_key(&params.attribute_key) {
                    let attr_idx = attr_key_to_idx.len();
                    attr_key_to_idx.insert(params.attribute_key.clone(), attr_idx);
                    attr_val_to_idx.push(HashMap::new());
                    attr_idx_to_val.push(Vec::new());
                }
            }
        }
        for person in &input.problem.people {
            for key in person.attributes.keys() {
                if !attr_key_to_idx.contains_key(key) {
                    let attr_idx = attr_key_to_idx.len();
                    attr_key_to_idx.insert(key.clone(), attr_idx);
                    attr_val_to_idx.push(HashMap::new());
                    attr_idx_to_val.push(Vec::new());
                }
            }
        }
        for person in &input.problem.people {
            for (key, val) in &person.attributes {
                if let Some(&attr_idx) = attr_key_to_idx.get(key) {
                    let val_map = &mut attr_val_to_idx[attr_idx];
                    if !val_map.contains_key(val) {
                        let val_idx = val_map.len();
                        val_map.insert(val.clone(), val_idx);
                        attr_idx_to_val[attr_idx].push(val.clone());
                    }
                }
            }
        }

        // --- Convert Person Attributes to Integer-based format ---
        let mut person_attributes = vec![vec![usize::MAX; attr_key_to_idx.len()]; people_count];
        for (p_idx, person) in input.problem.people.iter().enumerate() {
            for (key, val) in &person.attributes {
                if let Some(&attr_idx) = attr_key_to_idx.get(key) {
                    if let Some(&val_idx) = attr_val_to_idx[attr_idx].get(val) {
                        person_attributes[p_idx][attr_idx] = val_idx;
                    }
                }
            }
        }

        let attribute_balance_constraints = input
            .constraints
            .iter()
            .filter_map(|c| match c {
                Constraint::AttributeBalance(params) => Some(params.clone()),
                _ => None,
            })
            .collect();
        let resolved_attribute_balance_constraints = Vec::new();
        let attribute_balance_constraints_by_group_session =
            vec![Vec::new(); num_sessions * group_count];

        // --- Extract weights from objectives and constraints ---
        let mut w_contacts = 0.0;
        if let Some(objective) = input
            .objectives
            .iter()
            .find(|o| o.r#type == "maximize_unique_contacts")
        {
            w_contacts = objective.weight;
        }

        let repeat_constraints: Vec<_> = input
            .constraints
            .iter()
            .filter_map(|constraint| match constraint {
                Constraint::RepeatEncounter(params) => Some(params),
                _ => None,
            })
            .collect();
        if repeat_constraints.len() > 1 {
            return Err(SolverError::ValidationError(
                "At most one RepeatEncounter constraint is supported".to_string(),
            ));
        }

        let mut w_repetition = 0.0;
        let mut repeat_encounter_limit = 1u32;
        let mut repeat_penalty_function = RepeatPenaltyFunction::Squared;
        if let Some(params) = repeat_constraints.first() {
            w_repetition = params.penalty_weight;
            repeat_encounter_limit = params.max_allowed_encounters;
            repeat_penalty_function = RepeatPenaltyFunction::parse(&params.penalty_function)
                .map_err(SolverError::ValidationError)?;
        }

        let schedule = vec![vec![vec![]; group_count]; num_sessions];
        let locations = vec![vec![(0, 0); people_count]; num_sessions];

        // Calculate baseline score to prevent negative scores from unique contacts metric
        // Maximum possible unique contacts = (n * (n-1)) / 2, multiplied by objective weight
        // or (num_sessions * (max_group_size - 1) * n) / 2, depending on which is smaller
        let max_possible_unique_contacts = if people_count >= 2 {
            std::cmp::min(
                (people_count * (people_count - 1)) / 2,
                (people_count
                    * input.problem.num_sessions as usize
                    * (session_max_group_capacities.iter().max().unwrap_or(&1) - 1))
                    / 2,
            )
        } else {
            0
        };
        let baseline_score = max_possible_unique_contacts as f64 * w_contacts;

        let mut state = Self {
            person_id_to_idx,
            person_idx_to_id,
            group_id_to_idx,
            group_idx_to_id,
            group_capacities,
            effective_group_capacities,
            session_total_capacities,
            session_max_group_capacities,
            attr_key_to_idx,
            attr_val_to_idx,
            attr_idx_to_val,
            logging: input.solver.logging.clone(),
            telemetry: input.solver.telemetry.clone(),
            effective_seed,
            move_policy,
            schedule,
            locations,
            person_attributes,
            attribute_balance_constraints,
            resolved_attribute_balance_constraints,
            attribute_balance_constraints_by_group_session,
            cliques: vec![], // To be populated by preprocessing
            person_to_clique_id: vec![
                vec![None; people_count];
                input.problem.num_sessions as usize
            ], // To be populated
            soft_apart_pairs: vec![], // To be populated
            hard_apart_pairs: vec![], // To be populated
            should_together_pairs: vec![], // To be populated
            immovable_people: HashMap::new(), // To be populated
            clique_sessions: vec![], // To be populated by preprocessing
            soft_apart_pair_sessions: vec![], // To be populated by preprocessing
            hard_apart_pair_sessions: vec![], // To be populated by preprocessing
            should_together_sessions: vec![], // To be populated by preprocessing
            hard_apart_partners_by_person_session: vec![], // To be populated by preprocessing
            person_participation,
            num_sessions: input.problem.num_sessions,
            allowed_sessions,
            contact_matrix: vec![vec![0; people_count]; people_count],
            unique_contacts: 0,
            repetition_penalty: 0,
            attribute_balance_penalty: 0.0,
            constraint_penalty: 0,
            weighted_constraint_penalty: 0.0,
            clique_violations: Vec::new(), // Will be resized after constraint preprocessing
            soft_apart_pair_violations: Vec::new(), // Will be resized after constraint preprocessing
            hard_apart_pair_violations: Vec::new(), // Will be resized after constraint preprocessing
            should_together_violations: Vec::new(), // Will be resized after constraint preprocessing
            immovable_violations: 0,
            w_contacts,
            w_repetition,
            repeat_encounter_limit,
            repeat_penalty_function,

            soft_apart_pair_weights: Vec::new(),
            should_together_weights: Vec::new(),
            pairmin_pairs: Vec::new(),
            pairmin_sessions: Vec::new(),
            pairmin_required: Vec::new(),
            pairmin_weights: Vec::new(),
            pairmin_counts: Vec::new(),
            pairmin_modes: Vec::new(),
            baseline_score,
            current_cost: 0.0,
        };

        state._preprocess_and_validate_constraints(input)?;
        state.build_attribute_balance_constraint_indexes()?;

        if let Some(initial_schedule) = &input.initial_schedule {
            state.schedule = validate_schedule_as_incumbent(input, initial_schedule)?.schedule;
        } else {
            let mut construction_context = BaselineConstructionContext {
                effective_seed: state.effective_seed,
                group_idx_to_id: &state.group_idx_to_id,
                person_idx_to_id: &state.person_idx_to_id,
                effective_group_capacities: &state.effective_group_capacities,
                person_participation: &state.person_participation,
                immovable_people: &state.immovable_people,
                cliques: &state.cliques,
                clique_sessions: &state.clique_sessions,
                hard_apart_partners_by_person_session: &state.hard_apart_partners_by_person_session,
                schedule: &mut state.schedule,
            };
            apply_construction_seed_schedule(&mut construction_context, input)?;
            apply_baseline_construction_heuristic(&mut construction_context)?;
        }

        state._recalculate_locations_from_schedule();
        state._recalculate_scores();
        #[cfg(feature = "debug-invariant-checks")]
        state.debug_validate_hard_constraints_if_enabled("State::new");
        #[cfg(feature = "cache-drift-assertions")]
        state.debug_assert_no_cache_drift_if_enabled("State::new");

        Ok(state)
    }

    fn build_person_participation(input: &ApiInput) -> Result<Vec<Vec<bool>>, SolverError> {
        let people_count = input.problem.people.len();
        let num_sessions = input.problem.num_sessions as usize;
        let mut person_participation = vec![vec![false; num_sessions]; people_count];

        for (person_idx, person) in input.problem.people.iter().enumerate() {
            if let Some(ref sessions) = person.sessions {
                for &session in sessions {
                    let session_idx = session as usize;
                    if session_idx < num_sessions {
                        person_participation[person_idx][session_idx] = true;
                    } else {
                        return Err(SolverError::ValidationError(format!(
                            "Person '{}' has invalid session index: {} (max: {})",
                            person.id,
                            session,
                            num_sessions.saturating_sub(1)
                        )));
                    }
                }
            } else {
                for participates in person_participation[person_idx]
                    .iter_mut()
                    .take(num_sessions)
                {
                    *participates = true;
                }
            }
        }

        Ok(person_participation)
    }

    fn build_effective_group_capacities(
        input: &ApiInput,
    ) -> Result<EffectiveGroupCapacitySummary, SolverError> {
        let num_sessions = input.problem.num_sessions as usize;
        let group_capacities: Vec<usize> = input
            .problem
            .groups
            .iter()
            .map(|group| group.size as usize)
            .collect();

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
                effective_group_capacities[session_idx * input.problem.groups.len() + group_idx] =
                    capacity;
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

    fn build_attribute_balance_constraint_indexes(&mut self) -> Result<(), SolverError> {
        let group_count = self.group_idx_to_id.len();
        let num_sessions = self.num_sessions as usize;

        self.resolved_attribute_balance_constraints.clear();
        self.attribute_balance_constraints_by_group_session =
            vec![Vec::new(); group_count * num_sessions];

        for params in &self.attribute_balance_constraints {
            let target_group_indices: Vec<usize> = if params.group_id == "ALL" {
                (0..group_count).collect()
            } else {
                vec![*self.group_id_to_idx.get(&params.group_id).ok_or_else(|| {
                    SolverError::ValidationError(format!(
                        "AttributeBalance references unknown group '{}'",
                        params.group_id
                    ))
                })?]
            };
            let attr_idx = *self
                .attr_key_to_idx
                .get(&params.attribute_key)
                .ok_or_else(|| {
                    SolverError::ValidationError(format!(
                        "AttributeBalance references unknown attribute key '{}'",
                        params.attribute_key
                    ))
                })?;

            let desired_counts = params
                .desired_values
                .iter()
                .filter_map(|(value, &desired_count)| {
                    self.attr_val_to_idx[attr_idx]
                        .get(value)
                        .copied()
                        .map(|value_idx| (value_idx, desired_count))
                })
                .collect();

            let constraint_idx = self.resolved_attribute_balance_constraints.len();
            self.resolved_attribute_balance_constraints
                .push(ResolvedAttributeBalanceConstraint {
                    attr_idx,
                    desired_counts,
                    penalty_weight: params.penalty_weight,
                    mode: params.mode,
                });

            match &params.sessions {
                Some(sessions) => {
                    for &session in sessions {
                        let day = session as usize;
                        if day >= num_sessions {
                            return Err(SolverError::ValidationError(format!(
                                "AttributeBalance references invalid session {} (max: {})",
                                session,
                                num_sessions.saturating_sub(1)
                            )));
                        }
                        for &group_idx in &target_group_indices {
                            let slot = flat_slot(group_count, day, group_idx);
                            self.attribute_balance_constraints_by_group_session[slot]
                                .push(constraint_idx);
                        }
                    }
                }
                None => {
                    for day in 0..num_sessions {
                        for &group_idx in &target_group_indices {
                            let slot = flat_slot(group_count, day, group_idx);
                            self.attribute_balance_constraints_by_group_session[slot]
                                .push(constraint_idx);
                        }
                    }
                }
            }
        }

        Ok(())
    }

    #[inline]
    fn canonical_pair(left: usize, right: usize) -> (usize, usize) {
        if left < right {
            (left, right)
        } else {
            (right, left)
        }
    }

    fn normalize_constraint_sessions(
        sessions: &Option<Vec<u32>>,
        num_sessions: usize,
        label: &str,
    ) -> Result<Option<Vec<usize>>, SolverError> {
        let Some(sessions) = sessions else {
            return Ok(None);
        };

        let mut normalized = sessions
            .iter()
            .map(|&session| session as usize)
            .collect::<Vec<_>>();
        normalized.sort_unstable();
        normalized.dedup();

        for &session_idx in &normalized {
            if session_idx >= num_sessions {
                return Err(SolverError::ValidationError(format!(
                    "{label} references invalid session {} (max: {})",
                    session_idx,
                    num_sessions.saturating_sub(1)
                )));
            }
        }

        Ok(Some(normalized))
    }

    #[inline]
    fn sessions_overlap(left: Option<&[usize]>, right: Option<&[usize]>) -> bool {
        match (left, right) {
            (None, _) | (_, None) => true,
            (Some(left), Some(right)) => left.iter().any(|session| right.contains(session)),
        }
    }

    fn _preprocess_and_validate_constraints(
        &mut self,
        input: &ApiInput,
    ) -> Result<(), SolverError> {
        let people_count = self.person_id_to_idx.len();
        let num_sessions = self.num_sessions as usize;

        // --- Initialize person participation matrix ---
        self.person_participation = Self::build_person_participation(input)?;

        // --- Process `MustStayTogether` (Cliques) and `ShouldNotBeTogether`/`ShouldStayTogether` (Pairs) ---
        // New session-aware preprocessing using per-session DSU ----------------------
        use std::collections::hash_map::{Entry, HashMap};

        self.cliques.clear();
        self.clique_sessions.clear();

        // Map from member list -> global clique id
        let mut members_to_id: HashMap<Vec<usize>, usize> = HashMap::new();

        // Reset mapping (session, person)
        self.person_to_clique_id = vec![vec![None; people_count]; num_sessions];

        for session_idx in 0..num_sessions {
            let mut dsu = Dsu::new(people_count);

            // Union people for constraints active this session
            for constraint in &input.constraints {
                if let Constraint::MustStayTogether {
                    people, sessions, ..
                } = constraint
                {
                    let active = match sessions {
                        Some(list) => list.iter().any(|&s| s as usize == session_idx),
                        None => true,
                    };
                    if !active || people.len() < 2 {
                        continue;
                    }

                    for w in people.windows(2) {
                        let a = self.person_id_to_idx[&w[0]];
                        let b = self.person_id_to_idx[&w[1]];
                        dsu.union(a, b);
                    }
                }
            }

            // collect buckets, then sort clique member lists explicitly so global clique ids are
            // deterministic across processes regardless of hash-map iteration order.
            let mut root_to_members: HashMap<usize, Vec<usize>> = HashMap::new();
            for p in 0..people_count {
                let r = dsu.find(p);
                root_to_members.entry(r).or_default().push(p);
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
                let key = members.clone();

                let cid = match members_to_id.entry(key.clone()) {
                    Entry::Occupied(e) => *e.get(),
                    Entry::Vacant(v) => {
                        let id = self.cliques.len();
                        v.insert(id);
                        self.cliques.push(key);
                        self.clique_sessions.push(Some(Vec::new()));
                        id
                    }
                };

                if let Some(ref mut vec) = self.clique_sessions[cid] {
                    if !vec.contains(&session_idx) {
                        vec.push(session_idx);
                    }
                }

                for &m in &members {
                    if self.person_to_clique_id[session_idx][m].is_some() {
                        return Err(SolverError::ValidationError(format!(
                            "Person {} is part of multiple cliques in session {}.",
                            self.display_person_by_idx(m),
                            session_idx
                        )));
                    }
                    self.person_to_clique_id[session_idx][m] = Some(cid);
                }
            }
        }

        // convert session vectors so that a clique active in all sessions becomes None
        let clique_sessions = std::mem::take(&mut self.clique_sessions);
        self.clique_sessions = clique_sessions
            .into_iter()
            .map(|opt| match opt {
                Some(mut v) => {
                    v.sort_unstable();
                    if v.len() == num_sessions {
                        None
                    } else {
                        Some(v)
                    }
                }
                None => None,
            })
            .collect();

        // --- Process `ShouldNotBeTogether` (Soft-Apart Pairs) ---
        self.hard_apart_pairs.clear();
        self.hard_apart_pair_sessions.clear();
        self.hard_apart_partners_by_person_session = vec![Vec::new(); num_sessions * people_count];

        let mut seen_hard_apart = HashSet::new();
        for constraint in &input.constraints {
            if let Constraint::MustStayApart { people, sessions } = constraint {
                let compiled_sessions =
                    Self::normalize_constraint_sessions(sessions, num_sessions, "MustStayApart")?;
                for i in 0..people.len() {
                    for j in (i + 1)..people.len() {
                        let left_idx = *self.person_id_to_idx.get(&people[i]).ok_or_else(|| {
                            SolverError::ValidationError(format!(
                                "MustStayApart references unknown person '{}'",
                                people[i]
                            ))
                        })?;
                        let right_idx =
                            *self.person_id_to_idx.get(&people[j]).ok_or_else(|| {
                                SolverError::ValidationError(format!(
                                    "MustStayApart references unknown person '{}'",
                                    people[j]
                                ))
                            })?;

                        for session_idx in 0..num_sessions {
                            if let Some(active_sessions) = compiled_sessions.as_ref() {
                                if !active_sessions.contains(&session_idx) {
                                    continue;
                                }
                            }

                            if let (Some(left_clique), Some(right_clique)) = (
                                self.person_to_clique_id[session_idx][left_idx],
                                self.person_to_clique_id[session_idx][right_idx],
                            ) {
                                if left_clique == right_clique {
                                    let clique_member_ids: Vec<String> = self.cliques[left_clique]
                                        .iter()
                                        .map(|&idx| self.display_person_by_idx(idx))
                                        .collect();
                                    return Err(SolverError::ValidationError(format!(
                                        "MustStayApart conflicts with MustStayTogether in session {}: people {:?} share clique {:?}",
                                        session_idx, people, clique_member_ids
                                    )));
                                }
                            }
                        }

                        let pair = Self::canonical_pair(left_idx, right_idx);
                        let dedupe_key = (pair, compiled_sessions.clone());
                        if seen_hard_apart.insert(dedupe_key) {
                            self.hard_apart_pairs.push(pair);
                            self.hard_apart_pair_sessions
                                .push(compiled_sessions.clone());
                        }
                    }
                }
            }
        }

        for (pair_idx, &(left_idx, right_idx)) in self.hard_apart_pairs.iter().enumerate() {
            match self.hard_apart_pair_sessions[pair_idx].as_ref() {
                Some(active_sessions) => {
                    for &session_idx in active_sessions {
                        let left_slot = session_idx * people_count + left_idx;
                        let right_slot = session_idx * people_count + right_idx;
                        self.hard_apart_partners_by_person_session[left_slot].push(right_idx);
                        self.hard_apart_partners_by_person_session[right_slot].push(left_idx);
                    }
                }
                None => {
                    for session_idx in 0..num_sessions {
                        let left_slot = session_idx * people_count + left_idx;
                        let right_slot = session_idx * people_count + right_idx;
                        self.hard_apart_partners_by_person_session[left_slot].push(right_idx);
                        self.hard_apart_partners_by_person_session[right_slot].push(left_idx);
                    }
                }
            }
        }

        for partners in &mut self.hard_apart_partners_by_person_session {
            partners.sort_unstable();
            partners.dedup();
        }

        for constraint in &input.constraints {
            if let Constraint::ShouldNotBeTogether {
                people,
                penalty_weight,
                sessions: constraint_sessions,
            } = constraint
            {
                for i in 0..people.len() {
                    for j in (i + 1)..people.len() {
                        let compiled_sessions = Self::normalize_constraint_sessions(
                            constraint_sessions,
                            num_sessions,
                            "ShouldNotBeTogether",
                        )?;
                        let p1_idx = *self.person_id_to_idx.get(&people[i]).ok_or_else(|| {
                            SolverError::ValidationError(format!(
                                "ShouldNotBeTogether references unknown person {}",
                                self.display_person_id(&people[i])
                            ))
                        })?;
                        let p2_idx = *self.person_id_to_idx.get(&people[j]).ok_or_else(|| {
                            SolverError::ValidationError(format!(
                                "ShouldNotBeTogether references unknown person {}",
                                self.display_person_id(&people[j])
                            ))
                        })?;

                        // Check for conflict with cliques
                        if let (Some(c1), Some(c2)) = (
                            self.person_to_clique_id[0][p1_idx],
                            self.person_to_clique_id[0][p2_idx],
                        ) {
                            if c1 == c2 {
                                let clique_member_ids: Vec<String> = self.cliques[c1]
                                    .iter()
                                    .map(|&idx| self.display_person_by_idx(idx))
                                    .collect();
                                return Err(SolverError::ValidationError(format!(
                                    "ShouldNotBeTogether constraint conflicts with MustStayTogether: people {:?} are in the same clique {:?}",
                                    people, clique_member_ids
                                )));
                            }
                        }

                        // Conflict check: if the two people are in the same hard clique for any session where both the clique and the ShouldNotBeTogether apply
                        for session_idx in 0..num_sessions {
                            // Skip session if this ShouldNotBeTogether does not apply
                            if let Some(cs) = constraint_sessions {
                                if !cs.contains(&(session_idx as u32)) {
                                    continue;
                                }
                            }

                            if let (Some(c1), Some(c2)) = (
                                self.person_to_clique_id[session_idx][p1_idx],
                                self.person_to_clique_id[session_idx][p2_idx],
                            ) {
                                if c1 == c2 {
                                    let clique_member_ids: Vec<String> = self.cliques[c1]
                                        .iter()
                                        .map(|&idx| self.display_person_by_idx(idx))
                                        .collect();
                                    return Err(SolverError::ValidationError(format!(
                                        "ShouldNotBeTogether constraint conflicts with MustStayTogether in session {}: people {:?} are in the same clique {:?}",
                                        session_idx, people, clique_member_ids
                                    )));
                                }
                            }
                        }

                        self.soft_apart_pairs.push((p1_idx, p2_idx));
                        self.soft_apart_pair_weights.push(*penalty_weight);
                        self.soft_apart_pair_sessions.push(compiled_sessions);
                    }
                }
            }
        }

        // --- Process `ShouldStayTogether` (Soft Together Pairs) ---
        for constraint in &input.constraints {
            if let Constraint::ShouldStayTogether {
                people,
                penalty_weight,
                sessions: constraint_sessions,
            } = constraint
            {
                for i in 0..people.len() {
                    for j in (i + 1)..people.len() {
                        let compiled_sessions = Self::normalize_constraint_sessions(
                            constraint_sessions,
                            num_sessions,
                            "ShouldStayTogether",
                        )?;
                        let p1_idx = *self.person_id_to_idx.get(&people[i]).ok_or_else(|| {
                            SolverError::ValidationError(format!(
                                "ShouldStayTogether references unknown person {}",
                                self.display_person_id(&people[i])
                            ))
                        })?;
                        let p2_idx = *self.person_id_to_idx.get(&people[j]).ok_or_else(|| {
                            SolverError::ValidationError(format!(
                                "ShouldStayTogether references unknown person {}",
                                self.display_person_id(&people[j])
                            ))
                        })?;

                        let pair = Self::canonical_pair(p1_idx, p2_idx);

                        if self
                            .hard_apart_pairs
                            .iter()
                            .enumerate()
                            .any(|(pair_idx, &hard_pair)| {
                                hard_pair == pair
                                    && Self::sessions_overlap(
                                        self.hard_apart_pair_sessions[pair_idx].as_deref(),
                                        compiled_sessions.as_deref(),
                                    )
                            })
                        {
                            return Err(SolverError::ValidationError(
                                "ShouldStayTogether conflicts with MustStayApart for the same pair in overlapping sessions".to_string(),
                            ));
                        }

                        // Conflict check with existing ShouldNotBeTogether pairs
                        if let Some((fp_idx, _)) = self
                            .soft_apart_pairs
                            .iter()
                            .enumerate()
                            .find(|(_, &(a, b))| Self::canonical_pair(a, b) == pair)
                        {
                            if Self::sessions_overlap(
                                self.soft_apart_pair_sessions[fp_idx].as_deref(),
                                compiled_sessions.as_deref(),
                            ) {
                                return Err(SolverError::ValidationError(
                                    "ShouldStayTogether constraint conflicts with existing ShouldNotBeTogether for the same pair in overlapping sessions".to_string(),
                                ));
                            }
                        }

                        // If these two are in a hard clique together anywhere applicable, it's redundant but not invalid
                        // We still allow it; scoring will naturally give zero penalty when together.

                        self.should_together_pairs.push((p1_idx, p2_idx));
                        self.should_together_weights.push(*penalty_weight);
                        self.should_together_sessions.push(compiled_sessions);
                    }
                }
            }
        }

        // --- Process PairMeetingCount (soft cross-session subset for pairs) ---
        self.pairmin_pairs.clear();
        self.pairmin_sessions.clear();
        self.pairmin_required.clear();
        self.pairmin_weights.clear();
        self.pairmin_counts.clear();
        for constraint in &input.constraints {
            if let Constraint::PairMeetingCount(params) = constraint {
                // Validate exactly two people
                if params.people.len() != 2 {
                    return Err(SolverError::ValidationError(
                        "PairMeetingCount requires exactly two people".to_string(),
                    ));
                }
                let p1_idx = *self
                    .person_id_to_idx
                    .get(&params.people[0])
                    .ok_or_else(|| {
                        SolverError::ValidationError(format!(
                            "Unknown person '{}' in PairMeetingCount",
                            params.people[0]
                        ))
                    })?;
                let p2_idx = *self
                    .person_id_to_idx
                    .get(&params.people[1])
                    .ok_or_else(|| {
                        SolverError::ValidationError(format!(
                            "Unknown person '{}' in PairMeetingCount",
                            params.people[1]
                        ))
                    })?;
                // Map and validate sessions (empty => all sessions)
                let mut sess: Vec<usize> = if params.sessions.is_empty() {
                    (0..num_sessions).collect()
                } else {
                    let mut tmp: Vec<usize> = Vec::with_capacity(params.sessions.len());
                    for &s in &params.sessions {
                        let si = s as usize;
                        if si >= num_sessions {
                            return Err(SolverError::ValidationError(format!(
                                "PairMeetingCount references invalid session {}",
                                s
                            )));
                        }
                        tmp.push(si);
                    }
                    tmp
                };
                sess.sort_unstable();
                sess.dedup();
                let n = sess.len() as u32;
                if params.target_meetings > n {
                    return Err(SolverError::ValidationError(format!(
                        "PairMeetingCount target_meetings={} exceeds number of sessions in subset {}",
                        params.target_meetings, n
                    )));
                }
                // Feasibility: both must co-participate in at least min_meetings among subset
                let feasible_sessions = sess
                    .iter()
                    .filter(|&&s| {
                        self.person_participation[p1_idx][s] && self.person_participation[p2_idx][s]
                    })
                    .count() as u32;
                if params.mode == PairMeetingMode::AtLeast
                    && params.target_meetings > feasible_sessions
                {
                    return Err(SolverError::ValidationError(format!(
                        "PairMeetingCount target_meetings={} exceeds feasible co-participation {} for the pair",
                        params.target_meetings, feasible_sessions
                    )));
                }

                self.pairmin_pairs.push((p1_idx, p2_idx));
                self.pairmin_sessions.push(sess);
                self.pairmin_required.push(params.target_meetings);
                self.pairmin_weights.push(params.penalty_weight);
                self.pairmin_counts.push(0);
                self.pairmin_modes.push(params.mode);
            }
        }

        // --- Process `ImmovablePerson` ---
        for constraint in &input.constraints {
            match constraint {
                Constraint::ImmovablePerson(params) => {
                    let p_idx = self
                        .person_id_to_idx
                        .get(&params.person_id)
                        .ok_or_else(|| {
                            SolverError::ValidationError(format!(
                                "Person {} not found.",
                                self.display_person_id(&params.person_id)
                            ))
                        })?;
                    let g_idx = self.group_id_to_idx.get(&params.group_id).ok_or_else(|| {
                        SolverError::ValidationError(format!(
                            "Group '{}' not found.",
                            params.group_id
                        ))
                    })?;
                    // Default to all sessions when not provided
                    let sessions_iter: Vec<u32> = params
                        .sessions
                        .clone()
                        .unwrap_or_else(|| (0..self.num_sessions).collect());

                    for &session in &sessions_iter {
                        let s_idx = session as usize;
                        if s_idx >= self.num_sessions as usize {
                            return Err(SolverError::ValidationError(format!(
                                "Session index {} out of bounds for immovable person {}.",
                                s_idx,
                                self.display_person_id(&params.person_id)
                            )));
                        }
                        self.immovable_people.insert((*p_idx, s_idx), *g_idx);
                    }
                }
                Constraint::ImmovablePeople(params) => {
                    // Validate group once
                    let g_idx = self.group_id_to_idx.get(&params.group_id).ok_or_else(|| {
                        SolverError::ValidationError(format!(
                            "Group '{}' not found.",
                            params.group_id
                        ))
                    })?;

                    // Default to all sessions when not provided
                    let sessions_iter: Vec<u32> = params
                        .sessions
                        .clone()
                        .unwrap_or_else(|| (0..self.num_sessions).collect());

                    for person_id in &params.people {
                        let p_idx = self.person_id_to_idx.get(person_id).ok_or_else(|| {
                            SolverError::ValidationError(format!(
                                "Person {} not found.",
                                self.display_person_id(person_id)
                            ))
                        })?;

                        for &session in &sessions_iter {
                            let s_idx = session as usize;
                            if s_idx >= self.num_sessions as usize {
                                return Err(SolverError::ValidationError(format!(
                                    "Session index {} out of bounds for immovable person {}.",
                                    s_idx,
                                    self.display_person_id(person_id)
                                )));
                            }
                            self.immovable_people.insert((*p_idx, s_idx), *g_idx);
                        }
                    }
                }
                _ => {}
            }
        }

        // Initialize constraint violation vectors with correct sizes
        self.clique_violations = vec![0; self.cliques.len()];
        self.soft_apart_pair_violations = vec![0; self.soft_apart_pairs.len()];
        self.hard_apart_pair_violations = vec![0; self.hard_apart_pairs.len()];
        self.should_together_violations = vec![0; self.should_together_pairs.len()];

        // === Propagate immovable constraints to clique members ===
        // If a person in a clique is immovable on a session, all members of that clique
        // become immovable in that session (same target group), and the clique itself
        // is not considered active in that session anymore.

        let mut expanded_immovable: HashMap<(usize, usize), usize> = HashMap::new();

        for ((person_idx, session_idx), &required_group) in &self.immovable_people {
            // Identify clique membership for this session (if any)
            if let Some(cid) = self.person_to_clique_id[*session_idx][*person_idx] {
                // Propagate to all clique members
                for &member in &self.cliques[cid] {
                    let key = (member, *session_idx);
                    if let Some(prev_grp) = expanded_immovable.insert(key, required_group) {
                        if prev_grp != required_group {
                            return Err(SolverError::ValidationError(format!(
                                "Person {} has conflicting immovable assignments in session {} (groups '{}' vs '{}')",
                                self.display_person_by_idx(member),
                                session_idx,
                                self.group_idx_to_id[prev_grp],
                                self.group_idx_to_id[required_group]
                            )));
                        }
                    }
                }

                // Remove this session from the clique's active session list
                match &mut self.clique_sessions[cid] {
                    None => {
                        // Currently active in all sessions – create explicit list excluding this one
                        let mut all: Vec<usize> = (0..num_sessions).collect();
                        all.retain(|&s| s != *session_idx);
                        if all.len() == num_sessions {
                            // should not happen (removed nothing)
                        } else if all.len() == num_sessions - 1 {
                            self.clique_sessions[cid] = Some(all);
                        }
                    }
                    Some(list) => {
                        list.retain(|&s| s != *session_idx);
                        // if list becomes empty, clique no longer active anywhere
                    }
                }
            } else {
                // Person is not in a clique for this session – just copy record
                expanded_immovable.insert((*person_idx, *session_idx), required_group);
            }
        }

        self.immovable_people = expanded_immovable;

        Ok(())
    }
}
