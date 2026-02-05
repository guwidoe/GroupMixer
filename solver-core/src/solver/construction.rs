//! State construction and constraint preprocessing.
//!
//! This module contains the `State::new` constructor and constraint
//! preprocessing logic that converts API input into the internal solver state.

use super::{Dsu, SolverError, State};
use crate::models::{ApiInput, Constraint, PairMeetingMode};
use rand::seq::SliceRandom;
use std::collections::HashMap;

impl State {
    /// Creates a new solver state from the API input configuration.
    ///
    /// This constructor performs several important tasks:
    /// 1. **Validation**: Checks that the problem is solvable (sufficient group capacity)
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
    /// - Total group capacity is insufficient for all people
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
    /// use solver_core::models::*;
    /// use solver_core::solver::State;
    /// use std::collections::HashMap;
    ///
    /// let input = ApiInput {
    ///     initial_schedule: None,
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
    ///             Group { id: "Team1".to_string(), size: 2 }
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
        // --- Pre-validation ---
        let people_count = input.problem.people.len();
        let total_capacity: u32 = input.problem.groups.iter().map(|g| g.size).sum();
        if (people_count as u32) > total_capacity {
            return Err(SolverError::ValidationError(format!(
                "Not enough group capacity for all people. People: {}, Capacity: {}",
                people_count, total_capacity
            )));
        }

        let group_count = input.problem.groups.len();

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

        // --- Extract weights from objectives and constraints ---
        let mut w_contacts = 0.0;
        if let Some(objective) = input
            .objectives
            .iter()
            .find(|o| o.r#type == "maximize_unique_contacts")
        {
            w_contacts = objective.weight;
        }

        let mut w_repetition = 0.0;
        if let Some(Constraint::RepeatEncounter(params)) = input
            .constraints
            .iter()
            .find(|c| matches!(c, Constraint::RepeatEncounter(_)))
        {
            w_repetition = params.penalty_weight;
        }

        let schedule = vec![vec![vec![]; group_count]; input.problem.num_sessions as usize];
        let locations = vec![vec![(0, 0); people_count]; input.problem.num_sessions as usize];

        // Store group capacities for quick lookup later (used by transfer probability, feasibility, etc.)
        let group_capacities: Vec<usize> = input
            .problem
            .groups
            .iter()
            .map(|g| g.size as usize)
            .collect();

        // Calculate baseline score to prevent negative scores from unique contacts metric
        // Maximum possible unique contacts = (n * (n-1)) / 2, multiplied by objective weight
        // or (num_sessions * (max_group_size - 1) * n) / 2, depending on which is smaller
        let max_possible_unique_contacts = if people_count >= 2 {
            std::cmp::min(
                (people_count * (people_count - 1)) / 2,
                (people_count
                    * input.problem.num_sessions as usize
                    * (group_capacities.iter().max().unwrap_or(&1) - 1))
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
            attr_key_to_idx,
            attr_val_to_idx,
            attr_idx_to_val,
            logging: input.solver.logging.clone(),
            telemetry: input.solver.telemetry.clone(),
            schedule,
            locations,
            person_attributes,
            attribute_balance_constraints,
            cliques: vec![], // To be populated by preprocessing
            person_to_clique_id: vec![
                vec![None; people_count];
                input.problem.num_sessions as usize
            ], // To be populated
            forbidden_pairs: vec![], // To be populated
            should_together_pairs: vec![], // To be populated
            immovable_people: HashMap::new(), // To be populated
            clique_sessions: vec![], // To be populated by preprocessing
            forbidden_pair_sessions: vec![], // To be populated by preprocessing
            should_together_sessions: vec![], // To be populated by preprocessing
            person_participation: vec![], // To be populated by preprocessing
            num_sessions: input.problem.num_sessions,
            allowed_sessions: input.solver.allowed_sessions.clone(),
            contact_matrix: vec![vec![0; people_count]; people_count],
            unique_contacts: 0,
            repetition_penalty: 0,
            attribute_balance_penalty: 0.0,
            constraint_penalty: 0,
            weighted_constraint_penalty: 0.0,
            clique_violations: Vec::new(), // Will be resized after constraint preprocessing
            forbidden_pair_violations: Vec::new(), // Will be resized after constraint preprocessing
            should_together_violations: Vec::new(), // Will be resized after constraint preprocessing
            immovable_violations: 0,
            w_contacts,
            w_repetition,

            forbidden_pair_weights: Vec::new(),
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

        // If an initial schedule is supplied, warm-start from it; otherwise random initialize
        if let Some(ref initial_schedule) = input.initial_schedule {
            // Build mapping of group id -> index for quick lookup
            let mut _day_idx = 0usize;
            // Expect keys like "session_0", iterate in sorted order by session index
            let mut sessions: Vec<(usize, &std::collections::HashMap<String, Vec<String>>)> =
                initial_schedule
                    .iter()
                    .filter_map(|(k, v)| {
                        if let Some(s_idx_str) = k.split('_').next_back() {
                            if let Ok(s_idx) = s_idx_str.parse::<usize>() {
                                return Some((s_idx, v));
                            }
                        }
                        None
                    })
                    .collect();
            sessions.sort_by_key(|(s_idx, _)| *s_idx);

            for (s_idx, group_map) in sessions {
                if s_idx >= state.schedule.len() {
                    continue;
                }
                let day_schedule = &mut state.schedule[s_idx];
                let mut placed: Vec<bool> = vec![false; people_count];
                for (group_id, people_ids) in group_map.iter() {
                    if let Some(&g_idx) = state.group_id_to_idx.get(group_id) {
                        for pid in people_ids {
                            if let Some(&p_idx) = state.person_id_to_idx.get(pid) {
                                // Only place if participating this day and group has capacity
                                let group_size = input.problem.groups[g_idx].size as usize;
                                if state.person_participation[p_idx][s_idx]
                                    && day_schedule[g_idx].len() < group_size
                                {
                                    day_schedule[g_idx].push(p_idx);
                                    placed[p_idx] = true;
                                }
                            }
                        }
                    }
                }
                // Any unplaced participating people will be filled in by random initializer below
            }
        }

        // --- Initialize remaining slots with a random assignment (clique-aware) ---
        let mut rng = rand::rng();

        for (day, day_schedule) in state.schedule.iter_mut().enumerate() {
            let mut group_cursors = vec![0; group_count];
            let mut assigned_in_day = vec![false; people_count];

            // Warm-start aware: mark already placed people and count existing occupants
            for (g_idx, members) in day_schedule.iter().enumerate() {
                group_cursors[g_idx] = members.len();
                for &p in members {
                    if p < people_count {
                        assigned_in_day[p] = true;
                    }
                }
            }

            // Get list of people participating in this session
            let participating_people: Vec<usize> = (0..people_count)
                .filter(|&person_idx| state.person_participation[person_idx][day])
                .collect();

            // --- Step 1: Place all immovable people first ---
            for (person_idx, group_idx) in state
                .immovable_people
                .iter()
                .filter(|((_, s_idx), _)| *s_idx == day)
                .map(|((p_idx, _), g_idx)| (*p_idx, *g_idx))
            {
                if assigned_in_day[person_idx] {
                    continue;
                } // Already placed as part of a clique

                let group_size = input.problem.groups[group_idx].size as usize;
                if group_cursors[group_idx] >= group_size {
                    return Err(SolverError::ValidationError(format!(
                        "Cannot place immovable person: group {} is full",
                        state.group_idx_to_id[group_idx]
                    )));
                }

                day_schedule[group_idx].push(person_idx);
                group_cursors[group_idx] += 1;
                assigned_in_day[person_idx] = true;
            }

            // --- Step 2: Place cliques as units ---
            for (clique_idx, clique) in state.cliques.iter().enumerate() {
                // Check if any member of the clique is already assigned in this day
                if clique.iter().any(|&member| assigned_in_day[member]) {
                    continue;
                }

                // Check if all clique members are participating in this session
                let all_participating = clique
                    .iter()
                    .all(|&member| state.person_participation[member][day]);

                if !all_participating {
                    // Some clique members not participating - handle individual placement
                    continue;
                }

                // Check if this clique applies to this session (session-aware initialization)
                if let Some(ref sessions) = state.clique_sessions[clique_idx] {
                    if !sessions.contains(&day) {
                        continue;
                    }
                }

                // Find a group with enough space for the entire clique
                let mut placed = false;
                let mut potential_groups: Vec<usize> = (0..group_count).collect();
                potential_groups.shuffle(&mut rng);

                for group_idx in potential_groups {
                    let group_size = input.problem.groups[group_idx].size as usize;
                    let available_space = group_size - group_cursors[group_idx];

                    if available_space >= clique.len() {
                        // Place the entire clique in this group
                        for &member in clique {
                            day_schedule[group_idx].push(member);
                            assigned_in_day[member] = true;
                        }
                        group_cursors[group_idx] += clique.len();
                        placed = true;
                        break;
                    }
                }

                if !placed {
                    return Err(SolverError::ValidationError(format!(
                        "Could not place clique {} (size {}) in any group for day {}",
                        clique_idx,
                        clique.len(),
                        day
                    )));
                }
            }

            // --- Step 3: Place remaining unassigned participating people ---
            let unassigned_people: Vec<usize> = participating_people
                .iter()
                .filter(|&&person_idx| !assigned_in_day[person_idx])
                .cloned()
                .collect();

            for person_idx in unassigned_people {
                let mut placed = false;
                let mut potential_groups: Vec<usize> = (0..group_count).collect();
                potential_groups.shuffle(&mut rng);
                for group_idx in potential_groups {
                    let group_size = input.problem.groups[group_idx].size as usize;
                    if group_cursors[group_idx] < group_size {
                        day_schedule[group_idx].push(person_idx);
                        group_cursors[group_idx] += 1;
                        placed = true;
                        break;
                    }
                }
                if !placed {
                    return Err(SolverError::ValidationError(format!(
                        "Could not place person {} in day {}",
                        state.person_idx_to_id[person_idx], day
                    )));
                }
            }
        }

        state._recalculate_locations_from_schedule();
        state._recalculate_scores();

        Ok(state)
    }

    fn _preprocess_and_validate_constraints(
        &mut self,
        input: &ApiInput,
    ) -> Result<(), SolverError> {
        let people_count = self.person_id_to_idx.len();
        let num_sessions = self.num_sessions as usize;

        // --- Initialize person participation matrix ---
        self.person_participation = vec![vec![false; num_sessions]; people_count];

        for (person_idx, person) in input.problem.people.iter().enumerate() {
            if let Some(ref sessions) = person.sessions {
                // Person only participates in specified sessions
                for &session in sessions {
                    let session_idx = session as usize;
                    if session_idx < num_sessions {
                        self.person_participation[person_idx][session_idx] = true;
                    } else {
                        return Err(SolverError::ValidationError(format!(
                            "Person '{}' has invalid session index: {} (max: {})",
                            person.id,
                            session,
                            num_sessions - 1
                        )));
                    }
                }
            } else {
                // Person participates in all sessions (default behavior)
                for session_idx in 0..num_sessions {
                    self.person_participation[person_idx][session_idx] = true;
                }
            }
        }

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

            // collect buckets
            let mut root_to_members: HashMap<usize, Vec<usize>> = HashMap::new();
            for p in 0..people_count {
                let r = dsu.find(p);
                root_to_members.entry(r).or_default().push(p);
            }

            for members in root_to_members.values() {
                if members.len() < 2 {
                    continue;
                }

                let mut key = members.clone();
                key.sort_unstable();

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

                for &m in members {
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

        // --- Process `ShouldNotBeTogether` (Forbidden Pairs) ---
        for constraint in &input.constraints {
            if let Constraint::ShouldNotBeTogether {
                people,
                penalty_weight,
                sessions: constraint_sessions,
            } = constraint
            {
                for i in 0..people.len() {
                    for j in (i + 1)..people.len() {
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

                        self.forbidden_pairs.push((p1_idx, p2_idx));
                        self.forbidden_pair_weights.push(*penalty_weight);

                        // Convert sessions to indices if provided
                        if let Some(sessions) = constraint_sessions {
                            let session_indices: Vec<usize> =
                                sessions.iter().map(|&s| s as usize).collect();
                            self.forbidden_pair_sessions.push(Some(session_indices));
                        } else {
                            self.forbidden_pair_sessions.push(None); // Apply to all sessions
                        }
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

                        // Conflict check with existing ShouldNotBeTogether pairs
                        if let Some((fp_idx, _)) =
                            self.forbidden_pairs
                                .iter()
                                .enumerate()
                                .find(|(_, &(a, b))| {
                                    (a == p1_idx && b == p2_idx) || (a == p2_idx && b == p1_idx)
                                })
                        {
                            // Sessions overlap?
                            let f_sessions = &self.forbidden_pair_sessions[fp_idx];
                            let s_sessions: Option<Vec<usize>> = constraint_sessions
                                .as_ref()
                                .map(|v| v.iter().map(|&s| s as usize).collect());
                            let overlap = match (f_sessions, &s_sessions) {
                                (None, _) | (_, None) => true,
                                (Some(f), Some(s)) => f.iter().any(|x| s.contains(x)),
                            };
                            if overlap {
                                return Err(SolverError::ValidationError(
                                    "ShouldStayTogether constraint conflicts with existing ShouldNotBeTogether for the same pair in overlapping sessions".to_string(),
                                ));
                            }
                        }

                        // If these two are in a hard clique together anywhere applicable, it's redundant but not invalid
                        // We still allow it; scoring will naturally give zero penalty when together.

                        self.should_together_pairs.push((p1_idx, p2_idx));
                        self.should_together_weights.push(*penalty_weight);

                        // Convert sessions to indices if provided
                        if let Some(sessions) = constraint_sessions {
                            let session_indices: Vec<usize> =
                                sessions.iter().map(|&s| s as usize).collect();
                            self.should_together_sessions.push(Some(session_indices));
                        } else {
                            self.should_together_sessions.push(None); // Apply to all sessions
                        }
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
        self.forbidden_pair_violations = vec![0; self.forbidden_pairs.len()];
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
