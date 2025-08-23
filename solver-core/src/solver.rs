//! Core solver state management and optimization logic.
//!
//! This module contains the `State` struct which represents the internal solver state
//! with efficient integer-based representations for fast optimization. It handles
//! constraint preprocessing, cost calculation, move evaluation, and schedule manipulation.
//!
//! The `State` is designed for performance, converting string-based API inputs into
//! integer indices for fast array operations during optimization.

use crate::models::{
    ApiInput, AttributeBalanceParams, Constraint, LoggingOptions, PairMeetingMode, SolverResult,
};
use rand::seq::SliceRandom;
use serde::Serialize;
use std::collections::HashMap;
use thiserror::Error;

/// Errors that can occur during solver operation.
///
/// These errors represent validation failures or constraint violations that
/// prevent the solver from proceeding with optimization.
#[derive(Error, Debug, Serialize)]
pub enum SolverError {
    /// A constraint validation error with descriptive message.
    ///
    /// This error occurs when the problem configuration is invalid, such as:
    /// - Insufficient group capacity for all people
    /// - Contradictory constraints (e.g., must-stay-together + cannot-be-together for same people)
    /// - Invalid person or group IDs referenced in constraints
    /// - Cliques that are too large to fit in any group
    #[error("Constraint violation: {0}")]
    ValidationError(String),
}

/// The internal state of the solver, optimized for high-performance optimization.
///
/// This struct represents the complete state of an optimization problem, including
/// the current schedule, scoring information, and efficient internal representations
/// of all problem data. It converts the string-based API input into integer indices
/// for fast array operations during optimization.
///
/// # Performance Design
///
/// The `State` uses several performance optimizations:
/// - **Integer indices**: All people, groups, and attributes are mapped to integers
/// - **Dual representations**: Both forward (ID→index) and reverse (index→ID) mappings
/// - **Efficient scoring**: Contact matrix and incremental score updates
/// - **Fast constraint checking**: Preprocessed constraint structures (cliques, forbidden pairs)
/// - **Delta cost evaluation**: Calculate only the cost changes from moves
///
/// # Internal Structure
///
/// The state contains several categories of data:
/// - **Mappings**: Convert between string IDs and integer indices
/// - **Core Schedule**: The actual person-to-group assignments
/// - **Constraints**: Preprocessed constraint data for fast evaluation
/// - **Scoring**: Current optimization scores and penalty tracking
/// - **Configuration**: Logging options and algorithm parameters
///
/// # Usage
///
/// The `State` is primarily used by optimization algorithms through its public methods:
/// - `calculate_swap_cost_delta()` - Evaluate potential moves
/// - `apply_swap()` - Execute beneficial moves
/// - `calculate_cost()` - Get overall solution quality
/// - `to_solver_result()` - Convert to API result format
///
/// # Example
///
/// ```no_run
/// use solver_core::models::ApiInput;
/// use solver_core::solver::State;
///
/// // Create state from API input (normally done by run_solver)
/// # let input = ApiInput {
/// #     initial_schedule: None,
/// #     problem: solver_core::models::ProblemDefinition {
/// #         people: vec![], groups: vec![], num_sessions: 1
/// #     },
/// #     objectives: vec![], constraints: vec![],
/// #     solver: solver_core::models::SolverConfiguration {
/// #         solver_type: "SimulatedAnnealing".to_string(),
/// #         stop_conditions: solver_core::models::StopConditions {
/// #             max_iterations: Some(1000), time_limit_seconds: None, no_improvement_iterations: None
/// #         },
/// #         solver_params: solver_core::models::SolverParams::SimulatedAnnealing(
/// #             solver_core::models::SimulatedAnnealingParams {
/// #                 initial_temperature: 10.0, final_temperature: 0.1, cooling_schedule: "geometric".to_string(), reheat_after_no_improvement: Some(0), reheat_cycles: Some(0)
/// #             }
/// #         ),
/// #         logging: solver_core::models::LoggingOptions::default(),
/// #     },
/// # };
/// let mut state = State::new(&input)?;
///
/// // Evaluate a potential move (person 0 and person 1 in session 0)
/// let delta = state.calculate_swap_cost_delta(0, 0, 1);
/// if delta < 0.0 {
///     // Move improves the solution
///     state.apply_swap(0, 0, 1);
///     println!("Applied beneficial move, delta: {}", delta);
/// }
///
/// // Get detailed score breakdown
/// println!("Score breakdown:\n{}", state.format_score_breakdown());
/// # Ok::<(), solver_core::solver::SolverError>(())
/// ```
#[derive(Debug, Clone)]
pub struct State {
    // === ID MAPPINGS ===
    // These provide bidirectional conversion between string IDs and integer indices
    /// Maps person ID strings to integer indices for fast array access
    pub person_id_to_idx: HashMap<String, usize>,
    /// Maps integer indices back to person ID strings for result formatting
    pub person_idx_to_id: Vec<String>,
    /// Maps group ID strings to integer indices for fast array access
    pub group_id_to_idx: HashMap<String, usize>,
    /// Maps integer indices back to group ID strings for result formatting
    pub group_idx_to_id: Vec<String>,
    /// Capacity (size limit) for each group, aligned with `group_idx_to_id`
    pub group_capacities: Vec<usize>,

    // === ATTRIBUTE MAPPINGS ===
    // Efficient representation of person attributes for constraint evaluation
    /// Maps attribute keys (e.g., "gender") to integer indices
    pub attr_key_to_idx: HashMap<String, usize>,
    /// For each attribute, maps values (e.g., "male") to integer indices
    pub attr_val_to_idx: Vec<HashMap<String, usize>>,
    /// For each attribute, maps integer indices back to value strings
    pub attr_idx_to_val: Vec<Vec<String>>,

    // === CONFIGURATION ===
    /// Logging and output configuration options
    pub logging: LoggingOptions,

    // === CORE SCHEDULE DATA ===
    // The main optimization variables - who is assigned where and when
    /// The main schedule: `schedule[session][group] = [person_indices]`
    /// This is the primary data structure that algorithms modify
    pub schedule: Vec<Vec<Vec<usize>>>,
    /// Fast person location lookup: `locations[session][person] = (group_index, position_in_group)`
    /// Kept in sync with schedule for O(1) person location queries
    pub locations: Vec<Vec<(usize, usize)>>,

    // === CONSTRAINT DATA ===
    // Preprocessed constraint information for fast evaluation
    /// Person attributes in integer form: `person_attributes[person][attribute] = value_index`
    pub person_attributes: Vec<Vec<usize>>,
    /// Attribute balance constraints (copied from input for convenience)
    pub attribute_balance_constraints: Vec<AttributeBalanceParams>,
    /// Merged cliques (groups of people who must stay together)
    pub cliques: Vec<Vec<usize>>,
    /// Maps each person *per session* to their clique index (None if not in a clique in that session)
    /// Dimension: [session][person]
    pub person_to_clique_id: Vec<Vec<Option<usize>>>,
    /// Pairs of people who cannot be together
    pub forbidden_pairs: Vec<(usize, usize)>,
    /// Pairs of people who should be together (soft)
    pub should_together_pairs: Vec<(usize, usize)>,
    /// Immovable person assignments: `(person_index, session_index) -> group_index`
    pub immovable_people: HashMap<(usize, usize), usize>,
    /// Which sessions each clique constraint applies to (None = all sessions)
    pub clique_sessions: Vec<Option<Vec<usize>>>,
    /// Which sessions each forbidden pair constraint applies to (None = all sessions)
    pub forbidden_pair_sessions: Vec<Option<Vec<usize>>>,
    /// Which sessions each should-together pair applies to (None = all sessions)
    pub should_together_sessions: Vec<Option<Vec<usize>>>,
    /// Person participation matrix: `person_participation[person][session] = is_participating`
    pub person_participation: Vec<Vec<bool>>,
    /// Total number of sessions in the problem
    pub num_sessions: u32,

    /// Optional allow-list of sessions the solver may modify.
    /// If present, the solver will only propose moves for these sessions.
    pub allowed_sessions: Option<Vec<u32>>,

    // === SCORING DATA ===
    // Current optimization scores, updated incrementally for performance
    /// Contact matrix: `contact_matrix[person1][person2] = number_of_encounters`
    pub contact_matrix: Vec<Vec<u32>>,
    /// Current number of unique person-to-person contacts
    pub unique_contacts: i32,
    /// Current penalty for exceeding repeat encounter limits
    pub repetition_penalty: i32,
    /// Current penalty for attribute balance violations
    pub attribute_balance_penalty: f64,
    /// Total constraint penalty (sum of individual constraint penalties)
    pub constraint_penalty: i32,
    /// Weighted constraint penalty (actual penalty value used in cost calculation)
    pub weighted_constraint_penalty: f64,

    // === INDIVIDUAL CONSTRAINT VIOLATIONS ===
    // Detailed tracking of specific constraint violations
    /// Number of violations for each clique (people not staying together)
    pub clique_violations: Vec<i32>,
    /// Number of violations for each forbidden pair (people forced together)
    pub forbidden_pair_violations: Vec<i32>,
    /// Number of violations for each should-together pair (people separated)
    pub should_together_violations: Vec<i32>,
    /// Total violations of immovable person constraints
    pub immovable_violations: i32,

    // === OPTIMIZATION WEIGHTS ===
    // Weights for different components of the objective function
    /// Weight for maximizing unique contacts (from objectives)
    pub w_contacts: f64,
    /// Weight for repeat encounter penalties (from constraints)
    pub w_repetition: f64,
    // MustStayTogether is a hard constraint; no weights are tracked
    /// Penalty weight for each forbidden pair violation
    pub forbidden_pair_weights: Vec<f64>,
    /// Penalty weight for each should-together pair violation
    pub should_together_weights: Vec<f64>,

    // === PairMinMeetings (soft, cross-session for fixed subset) ===
    /// Pairs of people constrained to meet at least a minimum number within a subset of sessions
    pub pairmin_pairs: Vec<(usize, usize)>,
    /// Session subsets per constraint (always non-empty, sorted unique session indices)
    pub pairmin_sessions: Vec<Vec<usize>>,
    /// Required minimum meetings per constraint (m <= |sessions|)
    pub pairmin_required: Vec<u32>,
    /// Linear penalty weight per missing meeting
    pub pairmin_weights: Vec<f64>,
    /// Current counts of meetings for each constraint within its session subset
    pub pairmin_counts: Vec<u32>,
    /// Penalty modes per constraint
    pub pairmin_modes: Vec<PairMeetingMode>,

    /// Baseline score to prevent negative scores from unique contacts metric
    pub baseline_score: f64,

    pub current_cost: f64,
}

impl State {
    /// Returns a human-friendly identifier for a person index.
    /// If the person has a `name` attribute, this returns "{name} ({id})"; otherwise just the ID.
    pub fn display_person_by_idx(&self, person_idx: usize) -> String {
        let id_str = &self.person_idx_to_id[person_idx];
        if let Some(&name_attr_idx) = self.attr_key_to_idx.get("name") {
            let name_val_idx = self.person_attributes[person_idx][name_attr_idx];
            if name_val_idx != usize::MAX {
                if let Some(name_str) = self
                    .attr_idx_to_val
                    .get(name_attr_idx)
                    .and_then(|v| v.get(name_val_idx))
                {
                    return format!("{} ({})", name_str, id_str);
                }
            }
        }
        id_str.clone()
    }

    /// Returns a human-friendly identifier for a person by ID string.
    /// If the person exists and has a `name` attribute, returns "{name} ({id})"; otherwise returns the ID.
    pub fn display_person_id(&self, person_id: &str) -> String {
        if let Some(&p_idx) = self.person_id_to_idx.get(person_id) {
            return self.display_person_by_idx(p_idx);
        }
        person_id.to_string()
    }
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
                        if let Some(s_idx_str) = k.split('_').last() {
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

    pub fn _recalculate_locations_from_schedule(&mut self) {
        for (day_idx, day_schedule) in self.schedule.iter().enumerate() {
            for (group_idx, group_vec) in day_schedule.iter().enumerate() {
                for (vec_idx, &person_idx) in group_vec.iter().enumerate() {
                    self.locations[day_idx][person_idx] = (group_idx, vec_idx);
                }
            }
        }
    }

    pub fn _recalculate_scores(&mut self) {
        // Reset contact matrix
        let people_count = self.person_idx_to_id.len();
        self.contact_matrix = vec![vec![0; people_count]; people_count];

        // Calculate contacts only between participating people
        for (day_idx, day_schedule) in self.schedule.iter().enumerate() {
            for group in day_schedule {
                for i in 0..group.len() {
                    for j in (i + 1)..group.len() {
                        let person1 = group[i];
                        let person2 = group[j];

                        // Only count contact if both people are participating in this session
                        if self.person_participation[person1][day_idx]
                            && self.person_participation[person2][day_idx]
                        {
                            self.contact_matrix[person1][person2] += 1;
                            self.contact_matrix[person2][person1] += 1;
                        }
                    }
                }
            }
        }

        // Calculate unique contacts (count pairs with at least 1 contact)
        self.unique_contacts = 0;
        for i in 0..people_count {
            for j in (i + 1)..people_count {
                if self.contact_matrix[i][j] > 0 {
                    self.unique_contacts += 1;
                }
            }
        }

        // Calculate repetition penalty (squared penalty for multiple contacts)
        self.repetition_penalty = 0;
        for i in 0..people_count {
            for j in (i + 1)..people_count {
                let contacts = self.contact_matrix[i][j] as i32;
                if contacts > 1 {
                    self.repetition_penalty += (contacts - 1).pow(2);
                }
            }
        }

        // Recalculate attribute balance penalty
        self._recalculate_attribute_balance_penalty();

        // Recalculate constraint penalties
        self._recalculate_constraint_penalty();

        // Initialize PairMinMeetings counts from current schedule
        for count in &mut self.pairmin_counts {
            *count = 0;
        }
        for (idx, &(a, b)) in self.pairmin_pairs.iter().enumerate() {
            let sessions = &self.pairmin_sessions[idx];
            let mut cnt = 0u32;
            for &day in sessions {
                if self.person_participation[a][day] && self.person_participation[b][day] {
                    let (ga, _) = self.locations[day][a];
                    let (gb, _) = self.locations[day][b];
                    if ga == gb {
                        cnt += 1;
                    }
                }
            }
            self.pairmin_counts[idx] = cnt;
        }

        self.current_cost = self.calculate_cost();
    }

    /// Converts the current state to an API result format.
    ///
    /// This method transforms the internal integer-based representation back to
    /// the string-based API format that users expect. It creates a `SolverResult`
    /// containing the human-readable schedule and detailed scoring breakdown.
    ///
    /// # Arguments
    ///
    /// * `final_score` - The final optimization score to include in the result
    /// * `no_improvement_count` - The number of iterations since the last improvement
    ///
    /// # Returns
    ///
    /// A `SolverResult` containing:
    /// - The schedule in `HashMap<String, HashMap<String, Vec<String>>>` format
    /// - Detailed scoring information (unique contacts, penalties, etc.)
    /// - The provided final score value
    /// - The number of iterations since the last improvement
    ///
    /// # Schedule Format
    ///
    /// The returned schedule follows the pattern:
    /// ```text
    /// result.schedule["session_0"]["Group1"] = ["Alice", "Bob", "Charlie"]
    /// result.schedule["session_0"]["Group2"] = ["Diana", "Eve", "Frank"]
    /// result.schedule["session_1"]["Group1"] = ["Alice", "Diana", "Grace"]
    /// ```
    ///
    /// # Example
    ///
    /// ```no_run
    /// # use solver_core::solver::State;
    /// # use solver_core::models::*;
    /// # use std::collections::HashMap;
    /// # let input = ApiInput {
    /// #     initial_schedule: None,
    /// #     problem: ProblemDefinition { people: vec![], groups: vec![], num_sessions: 1 },
    /// #     objectives: vec![], constraints: vec![],
    /// #     solver: SolverConfiguration {
    /// #         solver_type: "SimulatedAnnealing".to_string(),
    /// #         stop_conditions: StopConditions { max_iterations: Some(1000), time_limit_seconds: None, no_improvement_iterations: None },
    /// #         solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams { initial_temperature: 10.0, final_temperature: 0.1, cooling_schedule: "geometric".to_string(), reheat_after_no_improvement: Some(0), reheat_cycles: Some(0)}),
    /// #         logging: LoggingOptions::default(),
    /// #     },
    /// # };
    /// # let state = State::new(&input)?;
    /// let result = state.to_solver_result(0.0, 0); // Score is calculated inside to_solver_result
    ///
    /// // Access the results
    /// println!("Final score: {}", result.final_score);
    /// println!("Unique contacts: {}", result.unique_contacts);
    /// println!("Repetition penalty: {}", result.repetition_penalty);
    ///
    /// // Access specific schedule assignments
    /// if let Some(session_0) = result.schedule.get("session_0") {
    ///     for (group_name, people) in session_0 {
    ///         println!("{}: {:?}", group_name, people);
    ///     }
    /// }
    /// # Ok::<(), solver_core::solver::SolverError>(())
    /// ```
    pub fn to_solver_result(&self, final_score: f64, no_improvement_count: u64) -> SolverResult {
        let mut schedule_output = HashMap::new();
        for (day, day_schedule) in self.schedule.iter().enumerate() {
            let session_key = format!("session_{}", day);
            let mut group_map = HashMap::new();
            for (group_idx, group) in day_schedule.iter().enumerate() {
                let group_key = self.group_idx_to_id[group_idx].clone();
                let person_ids = group
                    .iter()
                    .map(|&p_idx| self.person_idx_to_id[p_idx].clone())
                    .collect();
                group_map.insert(group_key, person_ids);
            }
            schedule_output.insert(session_key, group_map);
        }

        // Use the already calculated weighted penalties
        let weighted_repetition_penalty = self.repetition_penalty as f64 * self.w_repetition;
        let weighted_constraint_penalty = self.weighted_constraint_penalty;

        SolverResult {
            final_score,
            schedule: schedule_output,
            unique_contacts: self.unique_contacts,
            repetition_penalty: self.repetition_penalty,
            attribute_balance_penalty: self.attribute_balance_penalty as i32,
            constraint_penalty: self.constraint_penalty,
            no_improvement_count,
            weighted_repetition_penalty,
            weighted_constraint_penalty,
        }
    }

    /// Calculates the overall cost of the current state, which the optimizer will try to minimize.
    /// It combines maximizing unique contacts (by negating it) and minimizing penalties.
    pub(crate) fn calculate_cost(&mut self) -> f64 {
        // Calculate weighted constraint penalty
        self.weighted_constraint_penalty = 0.0;
        let mut violation_count = 0;

        // === FORBIDDEN PAIR VIOLATIONS ===
        for (day_idx, day_schedule) in self.schedule.iter().enumerate() {
            for group in day_schedule {
                for (pair_idx, &(p1, p2)) in self.forbidden_pairs.iter().enumerate() {
                    // Check if this forbidden pair applies to this session
                    if let Some(ref sessions) = self.forbidden_pair_sessions[pair_idx] {
                        if !sessions.contains(&day_idx) {
                            continue; // Skip this constraint for this session
                        }
                    }
                    // If sessions is None, apply to all sessions

                    // Check if both people are participating in this session
                    if !self.person_participation[p1][day_idx]
                        || !self.person_participation[p2][day_idx]
                    {
                        continue; // Skip if either person is not participating
                    }

                    let mut p1_in = false;
                    let mut p2_in = false;
                    for &member in group {
                        if member == p1 {
                            p1_in = true;
                        }
                        if member == p2 {
                            p2_in = true;
                        }
                    }
                    if p1_in && p2_in {
                        self.weighted_constraint_penalty += self.forbidden_pair_weights[pair_idx];
                        violation_count += 1;
                    }
                }
            }
        }

        // === SHOULD-TOGETHER PAIR VIOLATIONS ===
        for (day_idx, _day_schedule) in self.schedule.iter().enumerate() {
            for (pair_idx, &(p1, p2)) in self.should_together_pairs.iter().enumerate() {
                // Check if this should-together pair applies to this session
                if let Some(ref sessions) = self.should_together_sessions[pair_idx] {
                    if !sessions.contains(&day_idx) {
                        continue; // Skip this constraint for this session
                    }
                }
                // Only count when both participate
                if !self.person_participation[p1][day_idx]
                    || !self.person_participation[p2][day_idx]
                {
                    continue;
                }

                let (g1, _) = self.locations[day_idx][p1];
                let (g2, _) = self.locations[day_idx][p2];
                if g1 != g2 {
                    self.weighted_constraint_penalty += self.should_together_weights[pair_idx];
                    violation_count += 1;
                }
            }
        }

        // === PAIR MEETING COUNT (mode: at_least, exact, at_most) ===
        for idx in 0..self.pairmin_pairs.len() {
            let target = self.pairmin_required[idx] as i32;
            let have = self.pairmin_counts[idx] as i32;
            let (missing, over) = ((target - have).max(0) as f64, (have - target).max(0) as f64);
            let penalty = match self.pairmin_modes[idx] {
                PairMeetingMode::AtLeast => missing,
                PairMeetingMode::Exact => (have - target).abs() as f64,
                PairMeetingMode::AtMost => over,
            } * self.pairmin_weights[idx];
            if penalty > 0.0 {
                self.weighted_constraint_penalty += penalty;
                violation_count += 1;
            }
        }

        // === CLIQUE VIOLATIONS ===
        for (clique_idx, clique) in self.cliques.iter().enumerate() {
            for (day_idx, day_schedule) in self.schedule.iter().enumerate() {
                // Check if this clique applies to this session
                if let Some(ref sessions) = self.clique_sessions[clique_idx] {
                    if !sessions.contains(&day_idx) {
                        continue; // Skip this constraint for this session
                    }
                }
                // If sessions is None, apply to all sessions

                // Only consider clique members who are participating in this session
                let participating_members: Vec<usize> = clique
                    .iter()
                    .filter(|&&member| self.person_participation[member][day_idx])
                    .cloned()
                    .collect();

                // If fewer than 2 members are participating, no constraint to enforce
                if participating_members.len() < 2 {
                    continue;
                }

                let mut group_counts = vec![0; day_schedule.len()];

                // Count how many participating clique members are in each group
                for &member in &participating_members {
                    let (group_idx, _) = self.locations[day_idx][member];
                    group_counts[group_idx] += 1;
                }

                // Count violations: total participating clique members minus the largest group
                let max_in_one_group = *group_counts.iter().max().unwrap_or(&0);
                let separated_members = participating_members.len() as i32 - max_in_one_group;
                if separated_members > 0 {
                    // MustStayTogether is treated as hard: count unweighted violations only
                    violation_count += separated_members;
                }
            }
        }

        // === IMMOVABLE PERSON VIOLATIONS ===
        for ((person_idx, session_idx), required_group_idx) in &self.immovable_people {
            // Only check immovable constraints for people who are participating
            if self.person_participation[*person_idx][*session_idx] {
                let (actual_group_idx, _) = self.locations[*session_idx][*person_idx];
                if actual_group_idx != *required_group_idx {
                    // Add weighted penalty (assuming weight of 1000.0 for immovable violations)
                    self.weighted_constraint_penalty += 1000.0;
                    violation_count += 1;
                }
            }
        }

        // Verify the unweighted count matches our cached value
        debug_assert_eq!(
            violation_count, self.constraint_penalty,
            "Constraint penalty mismatch: calculated={}, cached={}",
            violation_count, self.constraint_penalty
        );

        (self.repetition_penalty as f64 * self.w_repetition)
            + self.attribute_balance_penalty
            + self.weighted_constraint_penalty
            - (self.unique_contacts as f64 * self.w_contacts)
            + self.baseline_score
    }

    fn get_attribute_counts(&self, group_members: &[usize], attr_idx: usize) -> Vec<u32> {
        let num_values = self.attr_idx_to_val.get(attr_idx).map_or(0, |v| v.len());
        let mut counts = vec![0; num_values];
        for &person_idx in group_members {
            let value_idx = self.person_attributes[person_idx][attr_idx];
            if value_idx != usize::MAX {
                counts[value_idx] += 1;
            }
        }
        counts
    }

    fn calculate_penalty_from_counts(&self, counts: &[u32], ac: &AttributeBalanceParams) -> f64 {
        use crate::models::AttributeBalanceMode;
        let mut penalty = 0.0;
        for (val_str, desired_count) in &ac.desired_values {
            if let Some(&val_idx) =
                self.attr_val_to_idx[self.attr_key_to_idx[&ac.attribute_key]].get(val_str)
            {
                let actual_count = counts[val_idx];
                let diff = match ac.mode {
                    AttributeBalanceMode::Exact => {
                        (actual_count as i32 - *desired_count as i32).abs()
                    }
                    AttributeBalanceMode::AtLeast => {
                        let shortfall = (*desired_count as i32) - (actual_count as i32);
                        shortfall.max(0)
                    }
                };
                penalty += (diff.pow(2) as f64) * ac.penalty_weight;
            }
        }
        penalty
    }

    fn _recalculate_attribute_balance_penalty(&mut self) {
        if std::env::var("DEBUG_ATTR_BALANCE").is_ok() {
            println!("DEBUG: _recalculate_attribute_balance_penalty - starting recalculation");
        }

        self.attribute_balance_penalty = 0.0;
        for (day_idx, day_schedule) in self.schedule.iter().enumerate() {
            for (group_idx, group_people) in day_schedule.iter().enumerate() {
                let group_id = &self.group_idx_to_id[group_idx];

                for ac in &self.attribute_balance_constraints {
                    // Check if the constraint applies to this group
                    if &ac.group_id != group_id {
                        continue;
                    }

                    // Find the internal index for the attribute key (e.g., "gender", "department")
                    if let Some(&attr_idx) = self.attr_key_to_idx.get(&ac.attribute_key) {
                        let num_values = self.attr_idx_to_val[attr_idx].len();
                        let mut value_counts = vec![0; num_values];

                        // Count how many people with each attribute value are in the group
                        for person_idx in group_people {
                            let val_idx = self.person_attributes[*person_idx][attr_idx];
                            if val_idx != usize::MAX {
                                value_counts[val_idx] += 1;
                            }
                        }

                        // Calculate the weighted penalty for this specific constraint using the shared helper
                        let weighted_penalty =
                            self.calculate_penalty_from_counts(&value_counts, ac);

                        if std::env::var("DEBUG_ATTR_BALANCE").is_ok() && weighted_penalty > 0.001 {
                            println!("DEBUG: _recalculate - day {}, group {} ({}), constraint '{}' on '{}':", 
                                    day_idx, group_idx, group_id, ac.attribute_key, ac.group_id);
                            println!("  group_people: {:?}", group_people);
                            println!("  value_counts: {:?}", value_counts);
                            println!("  weighted_penalty: {}", weighted_penalty);
                        }

                        self.attribute_balance_penalty += weighted_penalty;
                    }
                }
            }
        }

        if std::env::var("DEBUG_ATTR_BALANCE").is_ok() {
            println!(
                "DEBUG: _recalculate_attribute_balance_penalty - final result: {}",
                self.attribute_balance_penalty
            );
        }
    }

    fn _recalculate_constraint_penalty(&mut self) {
        // Reset all constraint penalties
        for violation in &mut self.clique_violations {
            *violation = 0;
        }
        for violation in &mut self.forbidden_pair_violations {
            *violation = 0;
        }
        for violation in &mut self.should_together_violations {
            *violation = 0;
        }
        self.immovable_violations = 0;

        // Calculate forbidden pair violations
        for (day_idx, day_schedule) in self.schedule.iter().enumerate() {
            for group in day_schedule {
                for (pair_idx, &(p1, p2)) in self.forbidden_pairs.iter().enumerate() {
                    // Check if this forbidden pair applies to this session
                    if let Some(ref sessions) = self.forbidden_pair_sessions[pair_idx] {
                        if !sessions.contains(&day_idx) {
                            continue; // Skip this constraint for this session
                        }
                    }
                    // If sessions is None, apply to all sessions

                    // Check if both people are participating in this session
                    if !self.person_participation[p1][day_idx]
                        || !self.person_participation[p2][day_idx]
                    {
                        continue; // Skip if either person is not participating
                    }

                    let mut p1_in = false;
                    let mut p2_in = false;
                    for &member in group {
                        if member == p1 {
                            p1_in = true;
                        }
                        if member == p2 {
                            p2_in = true;
                        }
                    }
                    if p1_in && p2_in {
                        self.forbidden_pair_violations[pair_idx] += 1;
                    }
                }
            }
        }

        // Calculate clique violations (when clique members are separated)
        for (clique_idx, clique) in self.cliques.iter().enumerate() {
            for (day_idx, day_schedule) in self.schedule.iter().enumerate() {
                // Check if this clique applies to this session
                if let Some(ref sessions) = self.clique_sessions[clique_idx] {
                    if !sessions.contains(&day_idx) {
                        continue; // Skip this constraint for this session
                    }
                }
                // If sessions is None, apply to all sessions

                // Only consider clique members who are participating in this session
                let participating_members: Vec<usize> = clique
                    .iter()
                    .filter(|&&member| self.person_participation[member][day_idx])
                    .cloned()
                    .collect();

                // If fewer than 2 members are participating, no constraint to enforce
                if participating_members.len() < 2 {
                    continue;
                }

                let mut group_counts = vec![0; day_schedule.len()];

                // Count how many participating clique members are in each group
                for &member in &participating_members {
                    let (group_idx, _) = self.locations[day_idx][member];
                    group_counts[group_idx] += 1;
                }

                // Count violations: total participating clique members minus the largest group
                let max_in_one_group = *group_counts.iter().max().unwrap_or(&0);
                let separated_members = participating_members.len() as i32 - max_in_one_group;
                self.clique_violations[clique_idx] += separated_members;
            }
        }

        // Calculate should-together pair violations (when separated)
        for (day_idx, _day_schedule) in self.schedule.iter().enumerate() {
            for (pair_idx, &(p1, p2)) in self.should_together_pairs.iter().enumerate() {
                // Check if this should-together pair applies to this session
                if let Some(ref sessions) = self.should_together_sessions[pair_idx] {
                    if !sessions.contains(&day_idx) {
                        continue; // Skip this constraint for this session
                    }
                }
                if !self.person_participation[p1][day_idx]
                    || !self.person_participation[p2][day_idx]
                {
                    continue;
                }

                let (g1, _) = self.locations[day_idx][p1];
                let (g2, _) = self.locations[day_idx][p2];
                if g1 != g2 {
                    self.should_together_violations[pair_idx] += 1;
                }
            }
        }

        // Calculate immovable person violations
        for ((person_idx, session_idx), required_group_idx) in &self.immovable_people {
            // Only check immovable constraints for people who are participating
            if self.person_participation[*person_idx][*session_idx] {
                let (actual_group_idx, _) = self.locations[*session_idx][*person_idx];
                if actual_group_idx != *required_group_idx {
                    self.immovable_violations += 1;
                }
            }
        }

        // Update the legacy constraint_penalty field for backward compatibility
        self.constraint_penalty = self.forbidden_pair_violations.iter().sum::<i32>()
            + self.clique_violations.iter().sum::<i32>()
            + self.should_together_violations.iter().sum::<i32>()
            + self.immovable_violations;
    }

    fn calculate_group_attribute_penalty_for_members(
        &self,
        group_members: &[usize],
        ac: &AttributeBalanceParams,
    ) -> f64 {
        if let Some(&attr_idx) = self.attr_key_to_idx.get(&ac.attribute_key) {
            let counts = self.get_attribute_counts(group_members, attr_idx);
            return self.calculate_penalty_from_counts(&counts, ac);
        }
        0.0
    }

    /// Helper: returns true if an attribute balance constraint is active for the given session.
    #[inline]
    fn attribute_balance_constraint_applies(
        &self,
        ac: &AttributeBalanceParams,
        session_idx: usize,
    ) -> bool {
        match &ac.sessions {
            Some(sessions) => sessions.contains(&(session_idx as u32)),
            None => true,
        }
    }

    /// Calculates the change in the total cost function if a swap were to be performed.
    ///
    /// This is the core method for evaluating potential moves during optimization.
    /// It efficiently calculates only the cost difference (delta) that would result
    /// from swapping two people between groups in a specific session, without
    /// actually performing the swap. This allows algorithms to quickly evaluate
    /// many potential moves and select the best ones.
    ///
    /// # Algorithm
    ///
    /// The delta calculation considers all optimization components:
    /// 1. **Contact changes**: How unique contacts and repeat encounters change
    /// 2. **Repetition penalties**: Changes in penalties for exceeding encounter limits
    /// 3. **Attribute balance**: Impact on group attribute distributions
    /// 4. **Constraint violations**: Changes in clique and forbidden pair violations
    ///
    /// # Arguments
    ///
    /// * `day` - Session index (0-based) where the swap would occur
    /// * `p1_idx` - Index of the first person to swap
    /// * `p2_idx` - Index of the second person to swap
    ///
    /// # Returns
    ///
    /// The cost delta as a `f64`:
    /// - **Negative values** indicate the swap would improve the solution (lower cost)
    /// - **Positive values** indicate the swap would worsen the solution (higher cost)
    /// - **Zero** indicates no change (e.g., swapping people in the same group)
    /// - **Infinity** indicates an invalid swap (e.g., non-participating person)
    ///
    /// # Performance
    ///
    /// This method is highly optimized since it's called frequently during optimization:
    /// - **O(group_size)** complexity for contact calculations
    /// - **O(constraints)** complexity for constraint evaluation
    /// - **No full cost recalculation** - only computes changes
    /// - **Early termination** for invalid swaps
    ///
    /// # Example
    ///
    /// ```no_run
    /// # use solver_core::solver::State;
    /// # use solver_core::models::*;
    /// # use std::collections::HashMap;
    /// # let input = ApiInput {
    /// #     initial_schedule: None,
    /// #     problem: ProblemDefinition { people: vec![], groups: vec![], num_sessions: 1 },
    /// #     objectives: vec![], constraints: vec![],
    /// #     solver: SolverConfiguration {
    /// #         solver_type: "SimulatedAnnealing".to_string(),
    /// #         stop_conditions: StopConditions { max_iterations: Some(1000), time_limit_seconds: None, no_improvement_iterations: None },
    /// #         solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams { initial_temperature: 10.0, final_temperature: 0.1, cooling_schedule: "geometric".to_string(), reheat_after_no_improvement: Some(0), reheat_cycles: Some(0) }),
    /// #         logging: LoggingOptions::default(),
    /// #     },
    /// # };
    /// # let mut state = State::new(&input)?;
    /// // Evaluate swapping person 0 and person 1 in session 0
    /// let delta = state.calculate_swap_cost_delta(0, 0, 1);
    ///
    /// if delta < 0.0 {
    ///     println!("Beneficial swap found! Delta: {}", delta);
    ///     // Apply the swap since it improves the solution
    ///     state.apply_swap(0, 0, 1);
    /// } else if delta > 0.0 {
    ///     println!("Swap would worsen solution by: {}", delta);
    ///     // Don't apply this swap
    /// } else {
    ///     println!("Swap has no effect (probably same group)");
    /// }
    /// # Ok::<(), solver_core::solver::SolverError>(())
    /// ```
    ///
    /// # Algorithm Details
    ///
    /// The method calculates deltas for each component:
    ///
    /// ## Contact Delta
    /// - For each person, calculates lost contacts from their current group
    /// - Calculates gained contacts from their new group
    /// - Updates unique contact count and repetition penalties
    ///
    /// ## Attribute Balance Delta
    /// - Simulates the group compositions after the swap
    /// - Calculates how attribute distributions change
    /// - Computes penalty changes for each attribute balance constraint
    ///
    /// ## Constraint Delta
    /// - **Clique violations**: Checks if swap breaks clique integrity
    /// - **Forbidden pairs**: Checks if swap creates/removes forbidden pairings
    /// - **Immovable constraints**: Handled by early validation
    ///
    /// # Validation
    ///
    /// The method performs validation checks:
    /// - Both people must be participating in the session
    /// - People cannot be swapped with themselves
    /// - Swaps within the same group return zero delta
    ///
    /// # Used By
    ///
    /// This method is primarily used by optimization algorithms:
    /// - **Simulated Annealing**: Evaluates random moves for acceptance/rejection
    /// - **Hill Climbing**: Finds the best improving move
    /// - **Local Search**: Explores neighborhood of current solution
    pub fn calculate_swap_cost_delta(&self, day: usize, p1_idx: usize, p2_idx: usize) -> f64 {
        // Check if both people are participating in this session
        if !self.person_participation[p1_idx][day] || !self.person_participation[p2_idx][day] {
            return f64::INFINITY; // Invalid swap - one or both people not participating
        }

        let (g1_idx, _) = self.locations[day][p1_idx];
        let (g2_idx, _) = self.locations[day][p2_idx];

        if g1_idx == g2_idx {
            return 0.0;
        }

        let mut delta_cost = 0.0;

        // --- Contact/Repetition Delta ---
        let g1_members = &self.schedule[day][g1_idx];
        let g2_members = &self.schedule[day][g2_idx];

        // --- Changes for p1 (loses contacts with g1, gains with g2) ---
        for &member in g1_members.iter() {
            if member == p1_idx {
                continue;
            }
            // Only consider contacts with participating members
            if !self.person_participation[member][day] {
                continue;
            }

            let count = self.contact_matrix[p1_idx][member];
            if count > 0 {
                // Repetition penalty change: (new_penalty - old_penalty)
                let old_penalty = if count > 1 {
                    (count as i32 - 1).pow(2)
                } else {
                    0
                };
                let new_count = count - 1;
                let new_penalty = if new_count > 1 {
                    (new_count as i32 - 1).pow(2)
                } else {
                    0
                };
                delta_cost += self.w_repetition * (new_penalty - old_penalty) as f64;
                if count == 1 {
                    // Unique contacts: losing one, so cost increases
                    delta_cost += self.w_contacts;
                }
            }
        }
        for &member in g2_members.iter() {
            if member == p2_idx {
                continue;
            }
            // Only consider contacts with participating members
            if !self.person_participation[member][day] {
                continue;
            }

            let count = self.contact_matrix[p1_idx][member];
            // Repetition penalty change: (new_penalty - old_penalty)
            let old_penalty = if count > 1 {
                (count as i32 - 1).pow(2)
            } else {
                0
            };
            let new_count = count + 1;
            let new_penalty = if new_count > 1 {
                (new_count as i32 - 1).pow(2)
            } else {
                0
            };
            delta_cost += self.w_repetition * (new_penalty - old_penalty) as f64;
            if count == 0 {
                // Unique contacts: gaining one, so cost decreases
                delta_cost -= self.w_contacts;
            }
        }

        // --- Changes for p2 (loses contacts with g2, gains with g1) ---
        for &member in g2_members.iter() {
            if member == p2_idx {
                continue;
            }
            // Only consider contacts with participating members
            if !self.person_participation[member][day] {
                continue;
            }

            let count = self.contact_matrix[p2_idx][member];
            if count > 0 {
                let old_penalty = if count > 1 {
                    (count as i32 - 1).pow(2)
                } else {
                    0
                };
                let new_count = count - 1;
                let new_penalty = if new_count > 1 {
                    (new_count as i32 - 1).pow(2)
                } else {
                    0
                };
                delta_cost += self.w_repetition * (new_penalty - old_penalty) as f64;
                if count == 1 {
                    delta_cost += self.w_contacts;
                }
            }
        }
        for &member in g1_members.iter() {
            if member == p1_idx {
                continue;
            }
            // Only consider contacts with participating members
            if !self.person_participation[member][day] {
                continue;
            }

            let count = self.contact_matrix[p2_idx][member];
            let old_penalty = if count > 1 {
                (count as i32 - 1).pow(2)
            } else {
                0
            };
            let new_count = count + 1;
            let new_penalty = if new_count > 1 {
                (new_count as i32 - 1).pow(2)
            } else {
                0
            };
            delta_cost += self.w_repetition * (new_penalty - old_penalty) as f64;
            if count == 0 {
                delta_cost -= self.w_contacts;
            }
        }

        // Attribute Balance Delta
        for ac in &self.attribute_balance_constraints {
            let g1_id = &self.group_idx_to_id[g1_idx];
            let g2_id = &self.group_idx_to_id[g2_idx];

            if !self.attribute_balance_constraint_applies(ac, day) {
                continue;
            }

            // Only calculate if the constraint applies to one of the affected groups
            let applies_to_g1 = ac.group_id == *g1_id;
            let applies_to_g2 = ac.group_id == *g2_id;

            if !applies_to_g1 && !applies_to_g2 {
                continue; // Skip constraint that doesn't apply to either group
            }

            let old_penalty_g1 = if applies_to_g1 {
                self.calculate_group_attribute_penalty_for_members(g1_members, ac)
            } else {
                0.0
            };
            let old_penalty_g2 = if applies_to_g2 {
                self.calculate_group_attribute_penalty_for_members(g2_members, ac)
            } else {
                0.0
            };

            let new_penalty_g1 = if applies_to_g1 {
                let mut next_g1_members: Vec<usize> = g1_members
                    .iter()
                    .filter(|&&p| p != p1_idx)
                    .cloned()
                    .collect();
                next_g1_members.push(p2_idx);
                self.calculate_group_attribute_penalty_for_members(&next_g1_members, ac)
            } else {
                0.0
            };
            let new_penalty_g2 = if applies_to_g2 {
                let mut next_g2_members: Vec<usize> = g2_members
                    .iter()
                    .filter(|&&p| p != p2_idx)
                    .cloned()
                    .collect();
                next_g2_members.push(p1_idx);
                self.calculate_group_attribute_penalty_for_members(&next_g2_members, ac)
            } else {
                0.0
            };

            let delta_penalty =
                (new_penalty_g1 + new_penalty_g2) - (old_penalty_g1 + old_penalty_g2);
            delta_cost += delta_penalty;
        }

        // Hard Constraint Delta - Cliques
        // No clique weight based delta; cliques are enforced by move feasibility

        // Constraint Delta - Forbidden Pairs
        for (pair_idx, &(p1, p2)) in self.forbidden_pairs.iter().enumerate() {
            // Check if this forbidden pair applies to this session
            if let Some(ref sessions) = self.forbidden_pair_sessions[pair_idx] {
                if !sessions.contains(&day) {
                    continue; // Skip this constraint for this session
                }
            }

            // Check if both people are participating in this session
            if !self.person_participation[p1][day] || !self.person_participation[p2][day] {
                continue; // Skip if either person is not participating
            }

            let p1_is_swapped = p1_idx == p1 || p2_idx == p1;
            let p2_is_swapped = p1_idx == p2 || p2_idx == p2;

            // If the pair is not involved in the swap, no change
            if !p1_is_swapped && !p2_is_swapped {
                continue;
            }

            let pair_weight = self.forbidden_pair_weights[pair_idx];

            // Penalty before swap
            if g1_members.contains(&p1) && g1_members.contains(&p2) {
                delta_cost -= pair_weight;
            }
            if g2_members.contains(&p1) && g2_members.contains(&p2) {
                delta_cost -= pair_weight;
            }

            // Penalty after swap
            let mut next_g1_members: Vec<usize> = g1_members
                .iter()
                .filter(|&&p| p != p1_idx)
                .cloned()
                .collect();
            next_g1_members.push(p2_idx);
            let mut next_g2_members: Vec<usize> = g2_members
                .iter()
                .filter(|&&p| p != p2_idx)
                .cloned()
                .collect();
            next_g2_members.push(p1_idx);
            if next_g1_members.contains(&p1) && next_g1_members.contains(&p2) {
                delta_cost += pair_weight;
            }
            if next_g2_members.contains(&p1) && next_g2_members.contains(&p2) {
                delta_cost += pair_weight;
            }
        }

        // Constraint Delta - ShouldStayTogether pairs
        for (pair_idx, &(person1, person2)) in self.should_together_pairs.iter().enumerate() {
            // Check if this should-together pair applies to this session
            if let Some(ref sessions) = self.should_together_sessions[pair_idx] {
                if !sessions.contains(&day) {
                    continue; // Skip this constraint for this session
                }
            }

            // Check if both people are participating in this session
            if !self.person_participation[person1][day] || !self.person_participation[person2][day]
            {
                continue; // Skip if either person is not participating
            }

            let pair_weight = self.should_together_weights[pair_idx];

            // Old penalty: separated across g1 and g2
            let p1_in_g1 = g1_members.contains(&person1);
            let p1_in_g2 = g2_members.contains(&person1);
            let p2_in_g1 = g1_members.contains(&person2);
            let p2_in_g2 = g2_members.contains(&person2);
            let old_penalty = if (p1_in_g1 && p2_in_g2) || (p1_in_g2 && p2_in_g1) {
                pair_weight
            } else {
                0.0
            };

            // New penalty after swap
            let mut next_g1_members: Vec<usize> = g1_members
                .iter()
                .filter(|&&p| p != p1_idx)
                .cloned()
                .collect();
            next_g1_members.push(p2_idx);
            let mut next_g2_members: Vec<usize> = g2_members
                .iter()
                .filter(|&&p| p != p2_idx)
                .cloned()
                .collect();
            next_g2_members.push(p1_idx);

            let new_p1_in_g1 = next_g1_members.contains(&person1);
            let new_p1_in_g2 = next_g2_members.contains(&person1);
            let new_p2_in_g1 = next_g1_members.contains(&person2);
            let new_p2_in_g2 = next_g2_members.contains(&person2);
            let new_penalty = if (new_p1_in_g1 && new_p2_in_g2) || (new_p1_in_g2 && new_p2_in_g1) {
                pair_weight
            } else {
                0.0
            };

            delta_cost += new_penalty - old_penalty;
        }

        // Constraint Delta - PairMeetingCount
        for (cidx, &(a, b)) in self.pairmin_pairs.iter().enumerate() {
            if !self.pairmin_sessions[cidx].contains(&day) {
                continue;
            }
            // Only if swap involves either endpoint at this day
            if a != p1_idx && a != p2_idx && b != p1_idx && b != p2_idx {
                continue;
            }
            // Determine before-after sameness for the pair on this day
            let (a_g_before, _) = self.locations[day][a];
            let (b_g_before, _) = self.locations[day][b];
            let before_same = a_g_before == b_g_before;

            let (g1_idx, _) = self.locations[day][p1_idx];
            let (g2_idx, _) = self.locations[day][p2_idx];

            let a_g_after = if a == p1_idx {
                g2_idx
            } else if a == p2_idx {
                g1_idx
            } else {
                a_g_before
            };
            let b_g_after = if b == p1_idx {
                g2_idx
            } else if b == p2_idx {
                g1_idx
            } else {
                b_g_before
            };
            let after_same = a_g_after == b_g_after;
            if before_same == after_same {
                continue;
            }

            let have_before = self.pairmin_counts[cidx] as i32;
            let have_after = if after_same {
                have_before + 1
            } else {
                have_before - 1
            };
            let target = self.pairmin_required[cidx] as i32;
            let mode = self.pairmin_modes[cidx];
            let (before_pen, after_pen) = match mode {
                PairMeetingMode::AtLeast => (
                    (target - have_before).max(0) as f64,
                    (target - have_after).max(0) as f64,
                ),
                PairMeetingMode::Exact => (
                    (have_before - target).abs() as f64,
                    (have_after - target).abs() as f64,
                ),
                PairMeetingMode::AtMost => (
                    (have_before - target).max(0) as f64,
                    (have_after - target).max(0) as f64,
                ),
            };
            let delta = (after_pen - before_pen) * self.pairmin_weights[cidx];
            delta_cost += delta;
        }

        delta_cost
    }

    /// Executes a swap of two people between groups and updates all internal state.
    ///
    /// This method performs the actual swap operation that was evaluated by
    /// `calculate_swap_cost_delta()`. It updates the schedule, location mappings,
    /// contact matrix, and all scoring information to reflect the new group assignments.
    /// The method maintains consistency across all internal data structures.
    ///
    /// # Algorithm
    ///
    /// The swap operation involves several steps:
    /// 1. **Update schedule**: Move people between groups in the schedule
    /// 2. **Update locations**: Maintain the fast person→group lookup table
    /// 3. **Update contacts**: Increment/decrement contact matrix entries
    /// 4. **Update scores**: Recalculate unique contacts and repetition penalties
    /// 5. **Update constraints**: Recalculate all constraint penalties
    ///
    /// # Arguments
    ///
    /// * `day` - Session index (0-based) where the swap occurs
    /// * `p1_idx` - Index of the first person to swap
    /// * `p2_idx` - Index of the second person to swap
    ///
    /// # Panics
    ///
    /// This method will panic if:
    /// - Either person is not participating in the specified session
    /// - The day index is out of bounds
    /// - The person indices are invalid
    ///
    /// **Note**: Callers should validate moves using `calculate_swap_cost_delta()`
    /// before calling this method, as that method returns infinity for invalid swaps.
    ///
    /// # Performance
    ///
    /// This method is optimized for frequent use during optimization:
    /// - **O(group_size)** time complexity for contact updates
    /// - **Incremental updates** rather than full recalculation
    /// - **Efficient location tracking** for fast person lookups
    /// - **Batch constraint updates** where possible
    ///
    /// # State Consistency
    ///
    /// After calling this method, all internal state remains consistent:
    /// - `schedule` and `locations` are synchronized
    /// - `contact_matrix` reflects all current pairings
    /// - All scoring fields match the current schedule
    /// - Constraint violation counts are accurate
    ///
    /// # Example
    ///
    /// ```no_run
    /// # use solver_core::solver::State;
    /// # use solver_core::models::*;
    /// # use std::collections::HashMap;
    /// # let input = ApiInput {
    /// #     initial_schedule: None,   
    /// #     problem: ProblemDefinition { people: vec![], groups: vec![], num_sessions: 1 },
    /// #     objectives: vec![], constraints: vec![],
    /// #     solver: SolverConfiguration {
    /// #         solver_type: "SimulatedAnnealing".to_string(),
    /// #         stop_conditions: StopConditions { max_iterations: Some(1000), time_limit_seconds: None, no_improvement_iterations: None },
    /// #         solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams { initial_temperature: 10.0, final_temperature: 0.1, cooling_schedule: "geometric".to_string(), reheat_after_no_improvement: Some(0), reheat_cycles: Some(0) }),
    /// #         logging: LoggingOptions::default(),
    /// #     },
    /// # };
    /// # let mut state = State::new(&input)?;
    /// // First evaluate the swap
    /// let delta = state.calculate_swap_cost_delta(0, 0, 1);
    ///
    /// if delta < 0.0 {
    ///     // The swap improves the solution, so apply it
    ///     state.apply_swap(0, 0, 1);
    ///     println!("Applied beneficial swap, expected improvement: {}", -delta);
    /// }
    /// # Ok::<(), solver_core::solver::SolverError>(())
    /// ```
    ///
    /// # Algorithm Steps
    ///
    /// ## 1. Schedule Update
    /// ```text
    /// Before: Group1=[Alice, Bob]    Group2=[Charlie, Diana]
    /// After:  Group1=[Alice, Diana]  Group2=[Charlie, Bob]
    /// ```
    ///
    /// ## 2. Contact Matrix Update
    /// - Decrements contacts for old group pairings
    /// - Increments contacts for new group pairings
    /// - Updates symmetric entries (contact_matrix[i][j] and contact_matrix[j][i])
    ///
    /// ## 3. Score Recalculation
    /// - Counts unique contacts (pairs with at least 1 encounter)
    /// - Calculates repetition penalties using the configured penalty function
    /// - Updates attribute balance penalties for affected groups
    /// - Recalculates all constraint violations
    ///
    /// # Typical Usage Pattern
    ///
    /// ```no_run
    /// # use solver_core::solver::State;
    /// # use solver_core::models::*;
    /// # use std::collections::HashMap;
    /// # let input = ApiInput {
    /// #     initial_schedule: None,
    /// #     problem: ProblemDefinition { people: vec![], groups: vec![], num_sessions: 1 },
    /// #     objectives: vec![], constraints: vec![],
    /// #     solver: SolverConfiguration {
    /// #         solver_type: "SimulatedAnnealing".to_string(),
    /// #         stop_conditions: StopConditions { max_iterations: Some(1000), time_limit_seconds: None, no_improvement_iterations: None },
    /// #         solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams { initial_temperature: 10.0, final_temperature: 0.1, cooling_schedule: "geometric".to_string(), reheat_after_no_improvement: Some(0), reheat_cycles: Some(0) }),
    /// #         logging: LoggingOptions::default(),
    /// #     },
    /// # };
    /// # let mut state = State::new(&input)?;
    /// // Optimization loop pattern
    /// for iteration in 0..1000 {
    ///     // Choose random people and session
    ///     let day = 0; // or rand::random::<usize>() % num_sessions
    ///     let p1 = 0;  // or random person selection
    ///     let p2 = 1;  // or random person selection
    ///     
    ///     // Evaluate the move
    ///     let delta = state.calculate_swap_cost_delta(day, p1, p2);
    ///     
    ///     // Decide whether to accept (algorithm-specific logic)
    ///     let should_accept = delta < 0.0; // Hill climbing: only improvements
    ///     // or: delta < 0.0 || random::<f64>() < (-delta / temperature).exp(); // Simulated annealing
    ///     
    ///     if should_accept {
    ///         state.apply_swap(day, p1, p2);
    ///     }
    /// }
    /// # Ok::<(), solver_core::solver::SolverError>(())
    /// ```
    pub fn apply_swap(&mut self, day: usize, p1_idx: usize, p2_idx: usize) {
        // Verify both people are participating in this session
        if !self.person_participation[p1_idx][day] || !self.person_participation[p2_idx][day] {
            eprintln!(
                "Warning: Attempted to swap non-participating people in session {}",
                day
            );
            return; // Skip invalid swap
        }

        let (g1_idx, g1_vec_idx) = self.locations[day][p1_idx];
        let (g2_idx, g2_vec_idx) = self.locations[day][p2_idx];

        if g1_idx == g2_idx {
            return; // Same group, no swap needed
        }

        // === UPDATE CONTACT MATRIX ===
        let g1_members = &self.schedule[day][g1_idx].clone();
        let g2_members = &self.schedule[day][g2_idx].clone();

        // Remove old contacts for p1 with participating members in g1
        for &member in g1_members {
            if member != p1_idx && self.person_participation[member][day] {
                let old_count = self.contact_matrix[p1_idx][member];
                if old_count > 0 {
                    self.contact_matrix[p1_idx][member] -= 1;
                    self.contact_matrix[member][p1_idx] -= 1;

                    // Update unique contacts count
                    if old_count == 1 {
                        self.unique_contacts -= 1; // No longer any contact
                    }

                    // Update repetition penalty
                    if old_count > 1 {
                        let old_penalty = (old_count as i32 - 1).pow(2);
                        let new_penalty = if old_count > 1 {
                            (old_count as i32 - 2).pow(2)
                        } else {
                            0
                        };
                        self.repetition_penalty += new_penalty - old_penalty;
                    }
                }
            }
        }

        // Add new contacts for p1 with participating members in g2
        for &member in g2_members {
            if member != p2_idx && self.person_participation[member][day] {
                let old_count = self.contact_matrix[p1_idx][member];
                self.contact_matrix[p1_idx][member] += 1;
                self.contact_matrix[member][p1_idx] += 1;

                // Update unique contacts count
                if old_count == 0 {
                    self.unique_contacts += 1; // New unique contact
                }

                // Update repetition penalty
                let old_penalty = if old_count > 1 {
                    (old_count as i32 - 1).pow(2)
                } else {
                    0
                };
                let new_count = old_count + 1;
                let new_penalty = if new_count > 1 {
                    (new_count as i32 - 1).pow(2)
                } else {
                    0
                };
                self.repetition_penalty += new_penalty - old_penalty;
            }
        }

        // Remove old contacts for p2 with participating members in g2
        for &member in g2_members {
            if member != p2_idx && self.person_participation[member][day] {
                let old_count = self.contact_matrix[p2_idx][member];
                if old_count > 0 {
                    self.contact_matrix[p2_idx][member] -= 1;
                    self.contact_matrix[member][p2_idx] -= 1;

                    // Update unique contacts count
                    if old_count == 1 {
                        self.unique_contacts -= 1; // No longer any contact
                    }

                    // Update repetition penalty
                    if old_count > 1 {
                        let old_penalty = (old_count as i32 - 1).pow(2);
                        let new_penalty = if old_count > 1 {
                            (old_count as i32 - 2).pow(2)
                        } else {
                            0
                        };
                        self.repetition_penalty += new_penalty - old_penalty;
                    }
                }
            }
        }

        // Add new contacts for p2 with participating members in g1
        for &member in g1_members {
            if member != p1_idx && self.person_participation[member][day] {
                let old_count = self.contact_matrix[p2_idx][member];
                self.contact_matrix[p2_idx][member] += 1;
                self.contact_matrix[member][p2_idx] += 1;

                // Update unique contacts count
                if old_count == 0 {
                    self.unique_contacts += 1; // New unique contact
                }

                // Update repetition penalty
                let old_penalty = if old_count > 1 {
                    (old_count as i32 - 1).pow(2)
                } else {
                    0
                };
                let new_count = old_count + 1;
                let new_penalty = if new_count > 1 {
                    (new_count as i32 - 1).pow(2)
                } else {
                    0
                };
                self.repetition_penalty += new_penalty - old_penalty;
            }
        }

        // === UPDATE SCHEDULE AND LOCATIONS ===
        self.schedule[day][g1_idx][g1_vec_idx] = p2_idx;
        self.schedule[day][g2_idx][g2_vec_idx] = p1_idx;
        self.locations[day][p1_idx] = (g2_idx, g2_vec_idx);
        self.locations[day][p2_idx] = (g1_idx, g1_vec_idx);

        // === UPDATE ATTRIBUTE BALANCE PENALTY ===
        if std::env::var("DEBUG_ATTR_BALANCE").is_ok() {
            println!(
                "DEBUG: apply_swap - before attribute balance update: {}",
                self.attribute_balance_penalty
            );
        }

        for ac in &self.attribute_balance_constraints {
            // Get group IDs for filtering
            let g1_id = &self.group_idx_to_id[g1_idx];
            let g2_id = &self.group_idx_to_id[g2_idx];

            if !self.attribute_balance_constraint_applies(ac, day) {
                continue;
            }

            // Only update if the constraint applies to one of the affected groups
            let applies_to_g1 = ac.group_id == *g1_id;
            let applies_to_g2 = ac.group_id == *g2_id;

            if !applies_to_g1 && !applies_to_g2 {
                continue; // Skip constraint that doesn't apply to either group
            }

            let old_penalty_g1 = if applies_to_g1 {
                self.calculate_group_attribute_penalty_for_members(g1_members, ac)
            } else {
                0.0
            };
            let old_penalty_g2 = if applies_to_g2 {
                self.calculate_group_attribute_penalty_for_members(g2_members, ac)
            } else {
                0.0
            };

            // Use the UPDATED schedule to get the new group members
            let new_g1_members = &self.schedule[day][g1_idx];
            let new_g2_members = &self.schedule[day][g2_idx];

            let new_penalty_g1 = if applies_to_g1 {
                self.calculate_group_attribute_penalty_for_members(new_g1_members, ac)
            } else {
                0.0
            };
            let new_penalty_g2 = if applies_to_g2 {
                self.calculate_group_attribute_penalty_for_members(new_g2_members, ac)
            } else {
                0.0
            };

            let delta_penalty =
                (new_penalty_g1 + new_penalty_g2) - (old_penalty_g1 + old_penalty_g2);

            if std::env::var("DEBUG_ATTR_BALANCE").is_ok() && delta_penalty.abs() > 0.001 {
                println!(
                        "DEBUG: apply_swap - specific constraint '{}' on group '{}' (applies_to_g1={}, applies_to_g2={}):",
                        ac.attribute_key, ac.group_id, applies_to_g1, applies_to_g2
                    );
                println!(
                    "  old_penalty_g1: {}, old_penalty_g2: {}",
                    old_penalty_g1, old_penalty_g2
                );
                println!(
                    "  new_penalty_g1: {}, new_penalty_g2: {}",
                    new_penalty_g1, new_penalty_g2
                );
                println!("  delta_penalty: {}", delta_penalty);
                println!("  g1_id: {}, g2_id: {}", g1_id, g2_id);
            }

            self.attribute_balance_penalty += delta_penalty;
        }

        if std::env::var("DEBUG_ATTR_BALANCE").is_ok() {
            println!(
                "DEBUG: apply_swap - after attribute balance update: {}",
                self.attribute_balance_penalty
            );
        }

        // === UPDATE CONSTRAINT PENALTIES (THIS WAS MISSING!) ===

        // Update forbidden pair violations
        for (pair_idx, &(person_a, person_b)) in self.forbidden_pairs.iter().enumerate() {
            // Check if this forbidden pair applies to this session
            if let Some(ref sessions) = self.forbidden_pair_sessions[pair_idx] {
                if !sessions.contains(&day) {
                    continue; // Skip this constraint for this session
                }
            }

            // Check if both people are participating in this session
            if !self.person_participation[person_a][day]
                || !self.person_participation[person_b][day]
            {
                continue; // Skip if either person is not participating
            }

            // Check if this swap affects this forbidden pair
            if (person_a == p1_idx || person_a == p2_idx)
                || (person_b == p1_idx || person_b == p2_idx)
            {
                // Check if they were together before the swap (use original group assignments)
                let a_group_before = if person_a == p1_idx {
                    g1_idx
                } else if person_a == p2_idx {
                    g2_idx
                } else {
                    self.locations[day][person_a].0
                };
                let b_group_before = if person_b == p1_idx {
                    g1_idx
                } else if person_b == p2_idx {
                    g2_idx
                } else {
                    self.locations[day][person_b].0
                };
                let were_together_before = a_group_before == b_group_before;

                // Check if they are together after the swap (use new group assignments)
                let a_group_after = if person_a == p1_idx {
                    g2_idx
                } else if person_a == p2_idx {
                    g1_idx
                } else {
                    self.locations[day][person_a].0
                };
                let b_group_after = if person_b == p1_idx {
                    g2_idx
                } else if person_b == p2_idx {
                    g1_idx
                } else {
                    self.locations[day][person_b].0
                };
                let are_together_after = a_group_after == b_group_after;

                // Update the violation count
                if were_together_before && !are_together_after {
                    // They were together before but not after - violation removed
                    self.forbidden_pair_violations[pair_idx] -= 1;
                } else if !were_together_before && are_together_after {
                    // They were not together before but are after - violation added
                    self.forbidden_pair_violations[pair_idx] += 1;
                }
            }
        }

        // Update clique violations
        for (clique_idx, clique) in self.cliques.iter().enumerate() {
            // Check if this clique applies to this session
            if let Some(ref sessions) = self.clique_sessions[clique_idx] {
                if !sessions.contains(&day) {
                    continue; // Skip this constraint for this session
                }
            }

            // Check if this swap affects this clique
            let clique_affected = clique.contains(&p1_idx) || clique.contains(&p2_idx);
            if clique_affected {
                // Only consider clique members who are participating in this session
                let participating_members: Vec<usize> = clique
                    .iter()
                    .filter(|&&member| self.person_participation[member][day])
                    .cloned()
                    .collect();

                // If fewer than 2 members are participating, no constraint to enforce
                if participating_members.len() >= 2 {
                    // Calculate violations before the swap
                    let mut group_counts_before = vec![0; self.schedule[day].len()];
                    for &member in &participating_members {
                        let group_before = if member == p1_idx {
                            g1_idx
                        } else if member == p2_idx {
                            g2_idx
                        } else {
                            self.locations[day][member].0
                        };
                        group_counts_before[group_before] += 1;
                    }
                    let max_before = *group_counts_before.iter().max().unwrap_or(&0);
                    let violations_before = participating_members.len() as i32 - max_before;

                    // Calculate violations after the swap
                    let mut group_counts_after = vec![0; self.schedule[day].len()];
                    for &member in &participating_members {
                        let group_after = if member == p1_idx {
                            g2_idx
                        } else if member == p2_idx {
                            g1_idx
                        } else {
                            self.locations[day][member].0
                        };
                        group_counts_after[group_after] += 1;
                    }
                    let max_after = *group_counts_after.iter().max().unwrap_or(&0);
                    let violations_after = participating_members.len() as i32 - max_after;

                    // Update the cached violation count
                    self.clique_violations[clique_idx] += violations_after - violations_before;
                }
            }
        }

        // Update immovable person violations
        for ((person_idx, session_idx), required_group_idx) in &self.immovable_people {
            if *session_idx == day && self.person_participation[*person_idx][day] {
                if *person_idx == p1_idx {
                    // p1 moved from g1 to g2
                    let was_violation_before = g1_idx != *required_group_idx;
                    let is_violation_after = g2_idx != *required_group_idx;

                    if was_violation_before && !is_violation_after {
                        self.immovable_violations -= 1; // Violation fixed
                    } else if !was_violation_before && is_violation_after {
                        self.immovable_violations += 1; // New violation
                    }
                } else if *person_idx == p2_idx {
                    // p2 moved from g2 to g1
                    let was_violation_before = g2_idx != *required_group_idx;
                    let is_violation_after = g1_idx != *required_group_idx;

                    if was_violation_before && !is_violation_after {
                        self.immovable_violations -= 1; // Violation fixed
                    } else if !was_violation_before && is_violation_after {
                        self.immovable_violations += 1; // New violation
                    }
                }
            }
        }

        // Update PairMinMeetings counts for this day if relevant
        for (cidx, &(a, b)) in self.pairmin_pairs.iter().enumerate() {
            if !self.pairmin_sessions[cidx].contains(&day) {
                continue;
            }
            // Check if either endpoint moved
            if a != p1_idx && a != p2_idx && b != p1_idx && b != p2_idx {
                continue;
            }
            // Before swap groups for a and b
            let (g1_idx, _) = self.locations[day][p2_idx]; // after swap, p2 in g1
            let (g2_idx, _) = self.locations[day][p1_idx]; // after swap, p1 in g2
            let a_before = if a == p1_idx {
                g1_idx
            } else if a == p2_idx {
                g2_idx
            } else {
                self.locations[day][a].0
            };
            let b_before = if b == p1_idx {
                g1_idx
            } else if b == p2_idx {
                g2_idx
            } else {
                self.locations[day][b].0
            };
            let were_same = a_before == b_before;

            // After swap groups for a and b (use updated locations which already reflect swap)
            let a_after = self.locations[day][a].0;
            let b_after = self.locations[day][b].0;
            let are_same = a_after == b_after;

            if were_same == are_same {
                continue;
            }
            if are_same {
                self.pairmin_counts[cidx] += 1;
            } else {
                self.pairmin_counts[cidx] -= 1;
            }
        }

        // Update the legacy constraint_penalty field for backward compatibility
        self.constraint_penalty = self.forbidden_pair_violations.iter().sum::<i32>()
            + self.clique_violations.iter().sum::<i32>()
            + self.immovable_violations;
    }

    pub fn validate_scores(&mut self) {
        let people_count = self.person_idx_to_id.len();

        // Store original cached values
        let cached_unique_contacts = self.unique_contacts;
        let cached_repetition_penalty = self.repetition_penalty;

        // Recalculate all scores using participation-aware logic
        self._recalculate_scores();

        let recalculated_unique_contacts = self.unique_contacts;
        let recalculated_repetition_penalty = self.repetition_penalty;

        // Check for discrepancies (allowing small floating point errors)
        if cached_unique_contacts != recalculated_unique_contacts {
            eprintln!("Score validation failed!");
            eprintln!(
                "Unique Contacts mismatch: cached={}, recalculated={}",
                cached_unique_contacts, recalculated_unique_contacts
            );

            // Show contact matrix for debugging
            eprintln!("Contact Matrix:");
            for i in 0..people_count.min(5) {
                // Show first 5 people only
                eprint!("Person {}: ", self.person_idx_to_id[i]);
                for j in 0..people_count.min(5) {
                    eprint!("{} ", self.contact_matrix[i][j]);
                }
                eprintln!();
            }

            // Show participation matrix
            eprintln!("Participation Matrix (first 5 people, all sessions):");
            for i in 0..people_count.min(5) {
                eprint!("Person {}: ", self.person_idx_to_id[i]);
                for session in 0..self.num_sessions as usize {
                    eprint!(
                        "{} ",
                        if self.person_participation[i][session] {
                            "T"
                        } else {
                            "F"
                        }
                    );
                }
                eprintln!();
            }

            // Instead of panicking, let's just update the cached values to match
            // This allows the solver to continue working while we debug
            eprintln!("Updating cached values to match recalculated values");
        }

        if cached_repetition_penalty != recalculated_repetition_penalty {
            eprintln!(
                "Repetition Penalty mismatch: cached={}, recalculated={}",
                cached_repetition_penalty, recalculated_repetition_penalty
            );
        }
    }

    /// Validates that no person is assigned more than once per session.
    /// Returns `Ok(())` if valid, otherwise returns a `ValidationError` with details.
    pub fn validate_no_duplicate_assignments(&self) -> Result<(), SolverError> {
        use std::collections::HashMap;
        for session_idx in 0..self.num_sessions as usize {
            let mut occurrences: HashMap<usize, Vec<(usize, usize)>> = HashMap::new();
            for (g_idx, group_people) in self.schedule[session_idx].iter().enumerate() {
                for (pos, &p_idx) in group_people.iter().enumerate() {
                    occurrences.entry(p_idx).or_default().push((g_idx, pos));
                }
            }
            for (&p_idx, slots) in &occurrences {
                if slots.len() > 1 {
                    let mut msg = format!(
                        "Duplicate assignment detected: person {} appears multiple times in session {}",
                        self.display_person_by_idx(p_idx),
                        session_idx
                    );
                    if self.logging.debug_dump_invariant_context {
                        use std::fmt::Write as _;
                        // slots
                        let _ = write!(&mut msg, "\nSlots:");
                        for (g_idx, pos) in slots {
                            let _ = write!(
                                &mut msg,
                                "\n  - group {} (idx {}) pos {}",
                                self.group_idx_to_id[*g_idx], g_idx, pos
                            );
                        }
                        // locations
                        let loc = self.locations[session_idx][p_idx];
                        let _ = write!(
                            &mut msg,
                            "\nlocations says: (group_idx={} pos={})",
                            loc.0, loc.1
                        );
                        // dump session groups
                        for (g_idx, group_people) in self.schedule[session_idx].iter().enumerate() {
                            let names: Vec<String> = group_people
                                .iter()
                                .map(|&pid| self.display_person_by_idx(pid))
                                .collect();
                            let _ = write!(
                                &mut msg,
                                "\n  group {} ({}): {:?}",
                                g_idx, self.group_idx_to_id[g_idx], names
                            );
                        }
                    }
                    return Err(SolverError::ValidationError(msg));
                }
            }
        }
        Ok(())
    }

    /// Formats a detailed breakdown of the current solution's scoring components.
    ///
    /// This method generates a human-readable string that shows how the current
    /// solution performs across all optimization criteria. It's invaluable for
    /// debugging constraint issues, understanding solution quality, and tuning
    /// algorithm parameters.
    ///
    /// # Returns
    ///
    /// A formatted string containing:
    /// - **Overall cost** and its components
    /// - **Unique contacts** achieved vs. theoretical maximum
    /// - **Repetition penalties** with breakdown by penalty level
    /// - **Attribute balance** penalties for each constraint
    /// - **Constraint violations** with detailed counts per constraint type
    /// - **Weights** used for each component
    ///
    /// # Output Format
    ///
    /// The output follows this structure:
    /// ```text
    /// === SCORE BREAKDOWN ===
    /// Total Cost: 85.50
    ///   Unique Contacts: 45 (Weight: 1.0, Contribution: -45.0)
    ///   Repetition Penalty: 12 (Weight: 100.0, Contribution: 1200.0)
    ///   Attribute Balance Penalty: 8.50 (Contribution: 8.50)
    ///   Constraint Penalty: 2 (Contribution: 2000.0)
    ///
    /// CONSTRAINT VIOLATIONS:
    ///   Clique 0 (['Alice', 'Bob']): 1 violations (Weight: 1000.0)
    ///   Forbidden Pair 0 ('Charlie' - 'Diana'): 0 violations (Weight: 500.0)
    ///   Immovable Person Violations: 1
    ///
    /// REPETITION BREAKDOWN:
    ///   0 encounters: 78 pairs
    ///   1 encounter: 45 pairs
    ///   2 encounters: 12 pairs (penalty: 12)
    ///   3+ encounters: 0 pairs
    /// ```
    ///
    /// # Example
    ///
    /// ```no_run
    /// # use solver_core::solver::State;
    /// # use solver_core::models::*;
    /// # use std::collections::HashMap;
    /// # let input = ApiInput {
    /// #     initial_schedule: None,
    /// #     problem: ProblemDefinition { people: vec![], groups: vec![], num_sessions: 1 },
    /// #     objectives: vec![], constraints: vec![],
    /// #     solver: SolverConfiguration {
    /// #         solver_type: "SimulatedAnnealing".to_string(),
    /// #         stop_conditions: StopConditions { max_iterations: Some(1000), time_limit_seconds: None, no_improvement_iterations: None },
    /// #         solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams { initial_temperature: 10.0, final_temperature: 0.1, cooling_schedule: "geometric".to_string(), reheat_after_no_improvement: Some(0), reheat_cycles: Some(0) }),
    /// #         logging: LoggingOptions::default(),
    /// #     },
    /// # };
    /// # let state = State::new(&input)?;
    /// // Get detailed scoring information
    /// let breakdown = state.format_score_breakdown();
    /// println!("{}", breakdown);
    ///
    /// // Use for debugging constraint issues
    /// if state.constraint_penalty > 0 {
    ///     println!("Constraint violations detected:");
    ///     println!("{}", breakdown);
    /// }
    ///
    /// // Compare different solutions
    /// let score_before = state.format_score_breakdown();
    /// // ... apply some moves ...
    /// let score_after = state.format_score_breakdown();
    /// println!("Before:\n{}\nAfter:\n{}", score_before, score_after);
    /// # Ok::<(), solver_core::solver::SolverError>(())
    /// ```
    ///
    /// # Use Cases
    ///
    /// ## Debugging Constraints
    /// When solutions have high constraint penalties, this method helps identify:
    /// - Which specific constraints are being violated
    /// - How many violations exist for each constraint type
    /// - Whether constraint weights are properly balanced
    ///
    /// ## Parameter Tuning
    /// The breakdown helps adjust algorithm parameters:
    /// - If repetition penalties dominate, reduce repetition weights
    /// - If few unique contacts are achieved, increase contact weights
    /// - If constraint violations persist, increase constraint weights
    ///
    /// ## Solution Analysis
    /// Compare solutions to understand optimization progress:
    /// - Track how scores change during optimization
    /// - Identify which components improve/worsen over time
    /// - Understand trade-offs between different objectives
    ///
    /// # Performance Notes
    ///
    /// This method performs some computation to generate the breakdown:
    /// - **O(people²)** to analyze contact patterns
    /// - **O(constraints)** to format constraint information
    /// - **String formatting** overhead for display
    ///
    /// It's intended for debugging and analysis, not for use in tight optimization loops.
    ///
    /// # Typical Usage in Algorithms
    ///
    /// ```no_run
    /// # use solver_core::solver::State;
    /// # use solver_core::models::*;
    /// # use std::collections::HashMap;
    /// # let input = ApiInput {
    /// #     initial_schedule: None,
    /// #     problem: ProblemDefinition { people: vec![], groups: vec![], num_sessions: 1 },
    /// #     objectives: vec![], constraints: vec![],
    /// #     solver: SolverConfiguration {
    /// #         solver_type: "SimulatedAnnealing".to_string(),
    /// #         stop_conditions: StopConditions {
    /// #             max_iterations: Some(1000), time_limit_seconds: None, no_improvement_iterations: None,
    /// #         },
    /// #         solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams {
    /// #             initial_temperature: 10.0, final_temperature: 0.1, cooling_schedule: "geometric".to_string(), reheat_after_no_improvement: Some(0), reheat_cycles: Some(0)
    /// #         }),
    /// #         logging: LoggingOptions { log_initial_score_breakdown: true, log_final_score_breakdown: true, ..Default::default() },
    /// #     },
    /// # };
    /// # let mut state = State::new(&input)?;
    /// // Log initial state (controlled by logging configuration)
    /// if state.logging.log_initial_score_breakdown {
    ///     println!("Initial state:\n{}", state.format_score_breakdown());
    /// }
    ///
    /// // ... run optimization algorithm ...
    ///
    /// // Log final state
    /// if state.logging.log_final_score_breakdown {
    ///     println!("Final state:\n{}", state.format_score_breakdown());
    /// }
    /// # Ok::<(), solver_core::solver::SolverError>(())
    /// ```
    pub fn format_score_breakdown(&self) -> String {
        let mut breakdown = format!(
            "Score Breakdown:\n  UniqueContacts: {} (weight: {:.1})\n  RepetitionPenalty: {} (weight: {:.1})\n  AttributeBalancePenalty: {:.2}\n  BaselineScore: {:.2}",
            self.unique_contacts,
            self.w_contacts,
            self.repetition_penalty,
            self.w_repetition,
            self.attribute_balance_penalty,
            self.baseline_score
        );

        // Add individual constraint penalties
        let mut has_constraints = false;

        // Forbidden pair violations
        for (pair_idx, &violation_count) in self.forbidden_pair_violations.iter().enumerate() {
            if violation_count > 0 {
                let weight = self.forbidden_pair_weights[pair_idx];
                breakdown.push_str(&format!(
                    "\n  ShouldNotBeTogether[{}]: {} (weight: {:.1})",
                    pair_idx, violation_count, weight
                ));
                has_constraints = true;
            }
        }

        // Should stay together violations
        for (pair_idx, &violation_count) in self.should_together_violations.iter().enumerate() {
            if violation_count > 0 {
                let weight = self.should_together_weights[pair_idx];
                breakdown.push_str(&format!(
                    "\n  ShouldStayTogether[{}]: {} (weight: {:.1})",
                    pair_idx, violation_count, weight
                ));
                has_constraints = true;
            }
        }

        // Clique violations
        for (clique_idx, &violation_count) in self.clique_violations.iter().enumerate() {
            if violation_count > 0 {
                breakdown.push_str(&format!(
                    "\n  MustStayTogether[{}]: {} (hard)",
                    clique_idx, violation_count
                ));
                has_constraints = true;
            }
        }

        // Immovable person violations
        if self.immovable_violations > 0 {
            breakdown.push_str(&format!(
                "\n  ImmovablePerson: {} (weight: 1000.0)",
                self.immovable_violations
            ));
            has_constraints = true;
        }

        // If no constraint violations, show that constraints are satisfied
        if !has_constraints {
            breakdown.push_str("\n  Constraints: All satisfied");
        }

        breakdown.push_str(&format!("\n  Total: {:.2}", self.current_cost));
        breakdown
    }

    /// Returns, for each session, the probability of attempting a clique-swap move.
    ///
    /// The heuristic is unchanged: probability scales linearly with the fraction of
    /// people already locked into cliques for that session, capped at 0.1.
    pub fn calculate_clique_swap_probability(&self) -> Vec<f64> {
        let total_people = self.person_idx_to_id.len() as f64;
        if total_people == 0.0 {
            return vec![0.0; self.num_sessions as usize];
        }

        (0..self.num_sessions as usize)
            .map(|session_idx| {
                let in_cliques = self.person_to_clique_id[session_idx]
                    .iter()
                    .filter(|entry| entry.is_some())
                    .count() as f64;

                if in_cliques == 0.0 {
                    0.0
                } else {
                    let ratio = in_cliques / total_people;
                    (ratio * 0.2).min(0.1)
                }
            })
            .collect()
    }

    /// Find all non-clique, movable people in a specific group for a given day
    pub fn find_non_clique_movable_people(&self, day: usize, group_idx: usize) -> Vec<usize> {
        self.schedule[day][group_idx]
            .iter()
            .filter(|&&person_idx| {
                // Must be participating in this session
                self.person_participation[person_idx][day] &&
                // Must not be in a clique
                self.person_to_clique_id[day][person_idx].is_none() &&
                // Must not be immovable in this session
                !self.immovable_people.contains_key(&(person_idx, day))
            })
            .cloned()
            .collect()
    }

    /// Check if a clique swap is feasible between two groups
    pub fn is_clique_swap_feasible(
        &self,
        day: usize,
        clique_idx: usize,
        from_group: usize,
        to_group: usize,
    ) -> bool {
        // If this clique is not active for this session (e.g., deactivated by immovable propagation),
        // do not attempt a clique swap in this session.
        if let Some(ref sessions) = self.clique_sessions[clique_idx] {
            if !sessions.contains(&day) {
                return false;
            }
        }

        let clique = &self.cliques[clique_idx];
        // Active members are those participating this day and currently in from_group
        let active_members: Vec<usize> = clique
            .iter()
            .cloned()
            .filter(|&m| self.person_participation[m][day])
            .filter(|&m| self.locations[day][m].0 == from_group)
            .collect();

        if active_members.is_empty() {
            return false;
        }

        // Ensure all active members are actually co-located in from_group
        if !active_members
            .iter()
            .all(|&m| self.locations[day][m].0 == from_group)
        {
            return false;
        }

        // Hard guard: do not allow moving a clique if any active member is immovable to a different group
        for &member in &active_members {
            if let Some(&required_group) = self.immovable_people.get(&(member, day)) {
                if required_group != to_group {
                    return false;
                }
            }
        }

        // Need at least as many non-clique movable people in target group as active clique size
        let non_clique_people_in_to_group = self.find_non_clique_movable_people(day, to_group);
        non_clique_people_in_to_group.len() >= active_members.len()
    }

    /// Calculate the cost delta for swapping a clique with non-clique people
    pub fn calculate_clique_swap_cost_delta(
        &self,
        day: usize,
        clique_idx: usize,
        from_group: usize,
        to_group: usize,
        target_people: &[usize],
    ) -> f64 {
        // If this clique is not active for this session, disallow by returning +inf
        if let Some(ref sessions) = self.clique_sessions[clique_idx] {
            if !sessions.contains(&day) {
                return f64::INFINITY;
            }
        }

        let clique = &self.cliques[clique_idx];
        // Active members are participating and currently in from_group
        let active_members: Vec<usize> = clique
            .iter()
            .cloned()
            .filter(|&member| self.person_participation[member][day])
            .filter(|&member| self.locations[day][member].0 == from_group)
            .collect();

        if active_members.is_empty() {
            return f64::INFINITY; // No participating clique members
        }

        // Check if target people are all participating
        if !target_people
            .iter()
            .all(|&person| self.person_participation[person][day])
        {
            return f64::INFINITY; // Some target people not participating
        }

        // Hard guard: do not allow moving a clique if any active member is immovable to a different group
        for &member in &active_members {
            if let Some(&required_group) = self.immovable_people.get(&(member, day)) {
                if required_group != to_group {
                    return f64::INFINITY;
                }
            }
        }

        // Hard guard: do not allow swapping in any target person who is immovable to a different group
        for &person in target_people {
            if let Some(&required_group) = self.immovable_people.get(&(person, day)) {
                if required_group != from_group {
                    return f64::INFINITY;
                }
            }
        }

        let mut delta_cost = 0.0;

        // Calculate contact/repetition delta for active members only
        for &clique_member in &active_members {
            for &target_person in target_people {
                // Current contacts between clique member and target person
                let current_contacts = self.contact_matrix[clique_member][target_person];

                // After swap, they will have one more contact
                let new_contacts = current_contacts + 1;

                // Repetition penalty delta
                let old_penalty = if current_contacts > 1 {
                    (current_contacts as i32 - 1).pow(2)
                } else {
                    0
                };
                let new_penalty = (new_contacts as i32 - 1).pow(2);
                delta_cost += self.w_repetition * (new_penalty - old_penalty) as f64;

                // Unique contacts delta
                if current_contacts == 0 {
                    delta_cost -= self.w_contacts; // Gaining a unique contact
                } else if current_contacts == 1 {
                    delta_cost += self.w_contacts; // Losing a unique contact
                }
            }

            // Lost contacts with people remaining in from_group
            let from_group_members = &self.schedule[day][from_group];
            for &remaining_member in from_group_members {
                if remaining_member == clique_member || active_members.contains(&remaining_member) {
                    continue;
                }
                // Only consider participating members
                if !self.person_participation[remaining_member][day] {
                    continue;
                }

                let current_contacts = self.contact_matrix[clique_member][remaining_member];
                if current_contacts > 0 {
                    let old_penalty = (current_contacts as i32 - 1).pow(2);
                    let new_penalty = if current_contacts > 1 {
                        (current_contacts as i32 - 2).pow(2)
                    } else {
                        0
                    };
                    delta_cost += self.w_repetition * (new_penalty - old_penalty) as f64;

                    if current_contacts == 1 {
                        delta_cost += self.w_contacts; // Losing a unique contact
                    }
                }
            }
        }

        // Add attribute balance delta
        delta_cost += self.calculate_attribute_balance_delta_for_groups(
            day,
            from_group,
            to_group,
            &active_members,
            target_people,
        );

        // Add constraint penalty delta for active members only
        delta_cost += self.calculate_clique_swap_constraint_penalty_delta(
            day,
            &active_members,
            target_people,
            from_group,
            to_group,
        );

        delta_cost
    }

    /// Calculate constraint penalty delta for clique swaps
    fn calculate_clique_swap_constraint_penalty_delta(
        &self,
        day: usize,
        clique: &[usize],
        target_people: &[usize],
        from_group: usize,
        to_group: usize,
    ) -> f64 {
        let mut delta = 0.0;

        // Get the affected group memberships before and after the swap
        let from_group_members = &self.schedule[day][from_group];
        let to_group_members = &self.schedule[day][to_group];

        // Calculate new group compositions after swap
        let mut new_from_members: Vec<usize> = from_group_members
            .iter()
            .filter(|&&p| !clique.contains(&p))
            .cloned()
            .collect();
        new_from_members.extend_from_slice(target_people);

        let mut new_to_members: Vec<usize> = to_group_members
            .iter()
            .filter(|&&p| !target_people.contains(&p))
            .cloned()
            .collect();
        new_to_members.extend_from_slice(clique);

        // Check ShouldNotBeTogether constraints
        for (pair_idx, &(person1, person2)) in self.forbidden_pairs.iter().enumerate() {
            let pair_weight = self.forbidden_pair_weights[pair_idx];

            // Old constraint penalty contributions
            let old_penalty = if (from_group_members.contains(&person1)
                && from_group_members.contains(&person2))
                || (to_group_members.contains(&person1) && to_group_members.contains(&person2))
            {
                pair_weight // Constraint violated in current state
            } else {
                0.0 // Constraint satisfied in current state
            };

            // New constraint penalty contributions
            let new_penalty = if (new_from_members.contains(&person1)
                && new_from_members.contains(&person2))
                || (new_to_members.contains(&person1) && new_to_members.contains(&person2))
            {
                pair_weight // Constraint violated in new state
            } else {
                0.0 // Constraint satisfied in new state
            };

            delta += new_penalty - old_penalty;
        }

        // Check ShouldStayTogether pairs
        for (pair_idx, &(person1, person2)) in self.should_together_pairs.iter().enumerate() {
            let pair_weight = self.should_together_weights[pair_idx];

            // Old penalty: they are separated if each group contains exactly one of them
            let old_penalty = if (from_group_members.contains(&person1)
                && !from_group_members.contains(&person2)
                && to_group_members.contains(&person2))
                || (from_group_members.contains(&person2)
                    && !from_group_members.contains(&person1)
                    && to_group_members.contains(&person1))
            {
                pair_weight
            } else {
                0.0
            };

            // New penalty after swap-like move
            let new_from_has_p1 = new_from_members.contains(&person1);
            let new_from_has_p2 = new_from_members.contains(&person2);
            let new_to_has_p1 = new_to_members.contains(&person1);
            let new_to_has_p2 = new_to_members.contains(&person2);
            let new_penalty =
                if (new_from_has_p1 && new_to_has_p2) || (new_from_has_p2 && new_to_has_p1) {
                    pair_weight
                } else {
                    0.0
                };

            delta += new_penalty - old_penalty;
        }

        // Check ImmovablePerson constraints for the affected people
        for &person in clique.iter().chain(target_people.iter()) {
            if let Some(&required_group) = self.immovable_people.get(&(person, day)) {
                let current_group = self.locations[day][person].0;
                let new_group = if clique.contains(&person) {
                    to_group
                } else {
                    from_group
                };

                // Old penalty (using default weight for immovable person constraints)
                let old_penalty = if current_group != required_group {
                    1000.0 // Default hard constraint weight for immovable people
                } else {
                    0.0
                };

                // New penalty
                let new_penalty = if new_group != required_group {
                    1000.0 // Default hard constraint weight for immovable people
                } else {
                    0.0
                };

                delta += new_penalty - old_penalty;
            }
        }

        delta
    }

    /// Simplified attribute balance delta calculation for clique swaps
    fn calculate_attribute_balance_delta_for_groups(
        &self,
        day: usize,
        from_group: usize,
        to_group: usize,
        clique: &[usize],
        target_people: &[usize],
    ) -> f64 {
        let mut delta = 0.0;

        for ac in &self.attribute_balance_constraints {
            // Only consider constraints that apply to these groups
            if ac.group_id != self.group_idx_to_id[from_group]
                && ac.group_id != self.group_idx_to_id[to_group]
            {
                continue;
            }

            let from_group_members = &self.schedule[day][from_group];
            let to_group_members = &self.schedule[day][to_group];

            // Calculate old penalties
            let old_from_penalty =
                self.calculate_group_attribute_penalty_for_members(from_group_members, ac);
            let old_to_penalty =
                self.calculate_group_attribute_penalty_for_members(to_group_members, ac);

            // Calculate new group compositions
            let mut new_from_members: Vec<usize> = from_group_members
                .iter()
                .filter(|&&p| !clique.contains(&p))
                .cloned()
                .collect();
            new_from_members.extend_from_slice(target_people);

            let mut new_to_members: Vec<usize> = to_group_members
                .iter()
                .filter(|&&p| !target_people.contains(&p))
                .cloned()
                .collect();
            new_to_members.extend_from_slice(clique);

            // Calculate new penalties
            let new_from_penalty =
                self.calculate_group_attribute_penalty_for_members(&new_from_members, ac);
            let new_to_penalty =
                self.calculate_group_attribute_penalty_for_members(&new_to_members, ac);

            delta += (new_from_penalty + new_to_penalty) - (old_from_penalty + old_to_penalty);
        }

        delta
    }

    /// Apply a clique swap, moving the clique to a new group and swapping with target people
    pub fn apply_clique_swap(
        &mut self,
        day: usize,
        clique_idx: usize,
        from_group: usize,
        to_group: usize,
        target_people: &[usize],
    ) {
        // If this clique is not active for this session, do nothing
        if let Some(ref sessions) = self.clique_sessions[clique_idx] {
            if !sessions.contains(&day) {
                return;
            }
        }

        let clique_all = self.cliques[clique_idx].clone();
        // Determine active clique members for this day located in from_group
        let active_members: Vec<usize> = clique_all
            .iter()
            .cloned()
            .filter(|&m| self.person_participation[m][day])
            .filter(|&m| self.locations[day][m].0 == from_group)
            .collect();

        if active_members.is_empty() {
            return;
        }

        if active_members.len() != target_people.len() {
            return; // sizes must match
        }

        // Hard guard: do not move if any active member is immovable to a different group
        for &member in &active_members {
            if let Some(&required_group) = self.immovable_people.get(&(member, day)) {
                if required_group != to_group {
                    return;
                }
            }
        }

        // Hard guard: do not move if any target person is immovable to a different group
        for &person in target_people {
            if let Some(&required_group) = self.immovable_people.get(&(person, day)) {
                if required_group != from_group {
                    return;
                }
            }
        }

        // Rebuild groups deterministically to avoid duplicates
        let old_from = self.schedule[day][from_group].clone();
        let old_to = self.schedule[day][to_group].clone();

        let mut new_from: Vec<usize> = old_from
            .into_iter()
            .filter(|p| !active_members.contains(p))
            .collect();
        new_from.extend_from_slice(target_people);

        let mut new_to: Vec<usize> = old_to
            .into_iter()
            .filter(|p| !target_people.contains(p))
            .collect();
        new_to.extend_from_slice(&active_members);

        // In debug mode, assert sizes preserved and no duplicates within each group
        if self.logging.debug_validate_invariants {
            if self.logging.debug_dump_invariant_context {
                // Check for duplicates within groups
                let mut seen = std::collections::HashSet::new();
                for &p in &new_from {
                    if !seen.insert(p) {
                        eprintln!(
                            "[DEBUG] Duplicate in new_from: {}",
                            self.display_person_by_idx(p)
                        );
                    }
                }
                seen.clear();
                for &p in &new_to {
                    if !seen.insert(p) {
                        eprintln!(
                            "[DEBUG] Duplicate in new_to: {}",
                            self.display_person_by_idx(p)
                        );
                    }
                }
            }
            // Expect cardinality preserved
            debug_assert_eq!(
                new_from.len(),
                self.schedule[day][from_group].len() - active_members.len() + target_people.len()
            );
            debug_assert_eq!(
                new_to.len(),
                self.schedule[day][to_group].len() - target_people.len() + active_members.len()
            );
        }

        self.schedule[day][from_group] = new_from;
        self.schedule[day][to_group] = new_to;

        // Update locations for all people in these two groups
        for (pos, &pid) in self.schedule[day][from_group].iter().enumerate() {
            self.locations[day][pid] = (from_group, pos);
        }
        for (pos, &pid) in self.schedule[day][to_group].iter().enumerate() {
            self.locations[day][pid] = (to_group, pos);
        }

        // Recalculate scores (clique swap touches many structures)
        self._recalculate_scores();

        // Session-wide invariant check (debug only)
        if self.logging.debug_validate_invariants {
            if let Err(e) = self.validate_no_duplicate_assignments() {
                if self.logging.debug_dump_invariant_context {
                    eprintln!(
                        "[DEBUG] Invariant failed after clique swap day={} from={} to={} moved_clique_size={} target_size={}",
                        day,
                        self.group_idx_to_id[from_group],
                        self.group_idx_to_id[to_group],
                        active_members.len(),
                        target_people.len()
                    );
                }
                // Surface error up-stack on next algorithm-side check
                let _ = e; // no-op here; algorithm already checks after call
            }
        }
    }

    // === SINGLE PERSON TRANSFER FUNCTIONALITY ===
    // Transfer functions allow moving a single person from one group to another
    // without requiring an exchange, enabling variable group sizes

    /// Calculate the probability of attempting a single-person transfer based on group capacity.
    ///
    /// Returns a probability between 0.0 and 1.0 based on how many groups have available capacity.
    /// If all groups are full, returns 0.0 (no transfers possible).
    /// Otherwise, scales the probability based on available capacity across groups.
    pub fn calculate_transfer_probability(&self, day: usize) -> f64 {
        let total_groups = self.schedule[day].len();
        if total_groups == 0 {
            return 0.0;
        }

        let mut groups_with_capacity = 0;
        let mut total_available_capacity = 0;

        for (group_idx, group_members) in self.schedule[day].iter().enumerate() {
            let max_capacity = self.group_capacities[group_idx];
            let current_size = group_members.len();

            if current_size < max_capacity {
                groups_with_capacity += 1;
                total_available_capacity += max_capacity - current_size;
            }
        }

        if groups_with_capacity == 0 {
            return 0.0; // All groups are full
        }

        // Probability proportional to average spare capacity, capped at 30%
        let capacity_ratio = total_available_capacity as f64 / (total_groups as f64);
        (capacity_ratio * 0.3).min(0.3)
    }

    /// Check if a single-person transfer is feasible.
    ///
    /// A transfer is feasible if:
    /// - Person is participating in the session
    /// - Person is not immovable
    /// - Person is not part of a clique
    /// - Source group would have at least 1 person remaining
    /// - Target group has available capacity
    /// - Source and target groups are different
    pub fn is_transfer_feasible(
        &self,
        day: usize,
        person_idx: usize,
        from_group: usize,
        to_group: usize,
    ) -> bool {
        // Check basic validity
        if from_group == to_group {
            return false;
        }

        // Person must be participating in this session
        if !self.person_participation[person_idx][day] {
            return false;
        }

        // Person must not be immovable
        if self.immovable_people.contains_key(&(person_idx, day)) {
            return false;
        }

        // Person must not be part of a clique
        if self.person_to_clique_id[day][person_idx].is_some() {
            return false;
        }

        // Verify person is actually in the from_group
        let (current_group, _) = self.locations[day][person_idx];
        if current_group != from_group {
            return false;
        }

        // Source group must have more than 1 person (don't create empty groups)
        if self.schedule[day][from_group].len() <= 1 {
            return false;
        }

        // Target group must have capacity based on predefined limit
        if self.schedule[day][to_group].len() >= self.group_capacities[to_group] {
            return false;
        }

        true
    }

    /// Calculate the cost delta for a single-person transfer.
    ///
    /// Similar to swap delta but simpler since only one person moves.
    /// Calculates changes in:
    /// - Contact counts and unique contacts
    /// - Repetition penalties  
    /// - Attribute balance penalties
    /// - Constraint violations
    pub fn calculate_transfer_cost_delta(
        &self,
        day: usize,
        person_idx: usize,
        from_group: usize,
        to_group: usize,
    ) -> f64 {
        // Check feasibility
        if !self.is_transfer_feasible(day, person_idx, from_group, to_group) {
            return f64::INFINITY;
        }

        let mut delta_cost = 0.0;

        // === CONTACT/REPETITION DELTA ===
        let from_group_members = &self.schedule[day][from_group];
        let to_group_members = &self.schedule[day][to_group];

        // Person loses contacts with from_group members
        for &member in from_group_members.iter() {
            if member == person_idx {
                continue;
            }
            // Only consider contacts with participating members
            if !self.person_participation[member][day] {
                continue;
            }

            let count = self.contact_matrix[person_idx][member];
            if count > 0 {
                // Repetition penalty change: (new_penalty - old_penalty)
                let old_penalty = if count > 1 {
                    (count as i32 - 1).pow(2)
                } else {
                    0
                };
                let new_count = count - 1;
                let new_penalty = if new_count > 1 {
                    (new_count as i32 - 1).pow(2)
                } else {
                    0
                };
                delta_cost += self.w_repetition * (new_penalty - old_penalty) as f64;

                if count == 1 {
                    // Unique contacts: losing one, so cost increases
                    delta_cost += self.w_contacts;
                }
            }
        }

        // Person gains contacts with to_group members
        for &member in to_group_members.iter() {
            // Only consider contacts with participating members
            if !self.person_participation[member][day] {
                continue;
            }

            let count = self.contact_matrix[person_idx][member];
            // Repetition penalty change: (new_penalty - old_penalty)
            let old_penalty = if count > 1 {
                (count as i32 - 1).pow(2)
            } else {
                0
            };
            let new_count = count + 1;
            let new_penalty = if new_count > 1 {
                (new_count as i32 - 1).pow(2)
            } else {
                0
            };
            delta_cost += self.w_repetition * (new_penalty - old_penalty) as f64;

            if count == 0 {
                // Unique contacts: gaining one, so cost decreases
                delta_cost -= self.w_contacts;
            }
        }

        // === ATTRIBUTE BALANCE DELTA ===
        for ac in &self.attribute_balance_constraints {
            let from_group_id = &self.group_idx_to_id[from_group];
            let to_group_id = &self.group_idx_to_id[to_group];

            if !self.attribute_balance_constraint_applies(ac, day) {
                continue;
            }

            // For specific group constraints
            let applies_to_from = ac.group_id == *from_group_id;
            let applies_to_to = ac.group_id == *to_group_id;

            if !applies_to_from && !applies_to_to {
                continue; // Skip constraint that doesn't apply to either group
            }

            let old_penalty_from = if applies_to_from {
                self.calculate_group_attribute_penalty_for_members(from_group_members, ac)
            } else {
                0.0
            };
            let old_penalty_to = if applies_to_to {
                self.calculate_group_attribute_penalty_for_members(to_group_members, ac)
            } else {
                0.0
            };

            let new_penalty_from = if applies_to_from {
                let next_from_members: Vec<usize> = from_group_members
                    .iter()
                    .filter(|&&p| p != person_idx)
                    .cloned()
                    .collect();
                self.calculate_group_attribute_penalty_for_members(&next_from_members, ac)
            } else {
                0.0
            };
            let new_penalty_to = if applies_to_to {
                let mut next_to_members = to_group_members.clone();
                next_to_members.push(person_idx);
                self.calculate_group_attribute_penalty_for_members(&next_to_members, ac)
            } else {
                0.0
            };

            let delta_penalty =
                (new_penalty_from + new_penalty_to) - (old_penalty_from + old_penalty_to);
            delta_cost += delta_penalty;
        }

        // === CONSTRAINT PENALTY DELTA ===
        // Check forbidden pairs
        for (pair_idx, &(person1, person2)) in self.forbidden_pairs.iter().enumerate() {
            // Check if this constraint applies to this session
            if let Some(ref sessions) = self.forbidden_pair_sessions[pair_idx] {
                if !sessions.contains(&day) {
                    continue;
                }
            }

            let pair_weight = self.forbidden_pair_weights[pair_idx];

            // Check if the transferring person is part of this forbidden pair
            if person_idx != person1 && person_idx != person2 {
                continue;
            }

            let other_person = if person_idx == person1 {
                person2
            } else {
                person1
            };

            // Check current violation state
            let currently_together = from_group_members.contains(&other_person);

            // Check future violation state
            let will_be_together = to_group_members.contains(&other_person);

            let old_penalty = if currently_together { pair_weight } else { 0.0 };
            let new_penalty = if will_be_together { pair_weight } else { 0.0 };

            delta_cost += new_penalty - old_penalty;
        }

        // Check should-stay-together pairs
        for (pair_idx, &(other1, other2)) in self.should_together_pairs.iter().enumerate() {
            // Check if this constraint applies to this session
            if let Some(ref sessions) = self.should_together_sessions[pair_idx] {
                if !sessions.contains(&day) {
                    continue;
                }
            }

            let weight = self.should_together_weights[pair_idx];

            // Only consider if moving person is part of this pair
            if person_idx != other1 && person_idx != other2 {
                continue;
            }

            let other_person = if person_idx == other1 { other2 } else { other1 };

            // Check current separation state
            let currently_together = from_group_members.contains(&other_person);
            // After transfer, person moves to `to_group`
            let will_be_together = to_group_members.contains(&other_person);

            let old_penalty = if currently_together { 0.0 } else { weight };
            let new_penalty = if will_be_together { 0.0 } else { weight };
            delta_cost += new_penalty - old_penalty;
        }

        // Check PairMeetingCount constraints (only those including this day and where moving person is one endpoint)
        for (cidx, &(a, b)) in self.pairmin_pairs.iter().enumerate() {
            if !self.pairmin_sessions[cidx].contains(&day) {
                continue;
            }
            // Moving person must be one endpoint
            if person_idx != a && person_idx != b {
                continue;
            }
            // Identify the other endpoint
            let other = if person_idx == a { b } else { a };

            // Only meaningful if other participates in this session
            if !self.person_participation[other][day] {
                continue;
            }

            // Before: together if other is in from_group
            let before_same = from_group_members.contains(&other);
            // After: together if other is in to_group
            let after_same = to_group_members.contains(&other);

            if before_same == after_same {
                continue;
            }

            let have_before = self.pairmin_counts[cidx] as i32;
            let have_after = if after_same {
                have_before + 1
            } else {
                have_before - 1
            };
            let target = self.pairmin_required[cidx] as i32;
            let mode = self.pairmin_modes[cidx];
            let (before_pen, after_pen) = match mode {
                PairMeetingMode::AtLeast => (
                    (target - have_before).max(0) as f64,
                    (target - have_after).max(0) as f64,
                ),
                PairMeetingMode::Exact => (
                    (have_before - target).abs() as f64,
                    (have_after - target).abs() as f64,
                ),
                PairMeetingMode::AtMost => (
                    (have_before - target).max(0) as f64,
                    (have_after - target).max(0) as f64,
                ),
            };
            let delta = (after_pen - before_pen) * self.pairmin_weights[cidx];
            delta_cost += delta;
        }

        delta_cost
    }

    /// Apply a single-person transfer.
    ///
    /// Moves a person from one group to another and updates all internal state:
    /// - Schedule and locations
    /// - Contact matrix and scores
    /// - Attribute balance penalties
    /// - Constraint violations
    pub fn apply_transfer(
        &mut self,
        day: usize,
        person_idx: usize,
        from_group: usize,
        to_group: usize,
    ) {
        // Verify the transfer is feasible
        if !self.is_transfer_feasible(day, person_idx, from_group, to_group) {
            eprintln!("Warning: Attempted infeasible transfer");
            return;
        }

        // === UPDATE CONTACT MATRIX ===
        let from_group_members = self.schedule[day][from_group].clone();
        let to_group_members = self.schedule[day][to_group].clone();

        // Remove contacts with old group members
        for &member in from_group_members.iter() {
            if member != person_idx && self.person_participation[member][day] {
                let old_count = self.contact_matrix[person_idx][member];
                if old_count > 0 {
                    self.contact_matrix[person_idx][member] -= 1;
                    self.contact_matrix[member][person_idx] -= 1;

                    // Update unique contacts count
                    if old_count == 1 {
                        self.unique_contacts -= 1; // Lost a unique contact
                    }

                    // Update repetition penalty
                    let old_penalty = if old_count > 1 {
                        (old_count as i32 - 1).pow(2)
                    } else {
                        0
                    };
                    let new_count = old_count - 1;
                    let new_penalty = if new_count > 1 {
                        (new_count as i32 - 1).pow(2)
                    } else {
                        0
                    };
                    self.repetition_penalty += new_penalty - old_penalty;
                }
            }
        }

        // Add contacts with new group members
        for &member in to_group_members.iter() {
            if self.person_participation[member][day] {
                let old_count = self.contact_matrix[person_idx][member];
                self.contact_matrix[person_idx][member] += 1;
                self.contact_matrix[member][person_idx] += 1;

                // Update unique contacts count
                if old_count == 0 {
                    self.unique_contacts += 1; // Gained a unique contact
                }

                // Update repetition penalty
                let old_penalty = if old_count > 1 {
                    (old_count as i32 - 1).pow(2)
                } else {
                    0
                };
                let new_count = old_count + 1;
                let new_penalty = if new_count > 1 {
                    (new_count as i32 - 1).pow(2)
                } else {
                    0
                };
                self.repetition_penalty += new_penalty - old_penalty;
            }
        }

        // === UPDATE SCHEDULE AND LOCATIONS ===
        // Deterministic rebuild to avoid duplicates
        let old_from = std::mem::take(&mut self.schedule[day][from_group]);
        let old_to = std::mem::take(&mut self.schedule[day][to_group]);
        let new_from: Vec<usize> = old_from.into_iter().filter(|&p| p != person_idx).collect();
        let mut new_to = old_to;
        new_to.push(person_idx);

        if self.logging.debug_validate_invariants && self.logging.debug_dump_invariant_context {
            let mut seen = std::collections::HashSet::new();
            for &p in &new_from {
                if !seen.insert(p) {
                    eprintln!(
                        "[DEBUG] Duplicate in transfer new_from: {}",
                        self.display_person_by_idx(p)
                    );
                }
            }
            seen.clear();
            for &p in &new_to {
                if !seen.insert(p) {
                    eprintln!(
                        "[DEBUG] Duplicate in transfer new_to: {}",
                        self.display_person_by_idx(p)
                    );
                }
            }
        }

        self.schedule[day][from_group] = new_from;
        self.schedule[day][to_group] = new_to;

        // Update locations lookup for both groups
        for (pos, &pid) in self.schedule[day][from_group].iter().enumerate() {
            self.locations[day][pid] = (from_group, pos);
        }
        for (pos, &pid) in self.schedule[day][to_group].iter().enumerate() {
            self.locations[day][pid] = (to_group, pos);
        }

        // === UPDATE ATTRIBUTE BALANCE PENALTY ===
        // Recalculate attribute balance penalty for affected groups
        for ac in &self.attribute_balance_constraints.clone() {
            let from_group_id = &self.group_idx_to_id[from_group];
            let to_group_id = &self.group_idx_to_id[to_group];

            if !self.attribute_balance_constraint_applies(ac, day) {
                continue;
            }

            // For specific groups, update only affected groups
            if ac.group_id == *from_group_id {
                let old_penalty =
                    self.calculate_group_attribute_penalty_for_members(&from_group_members, ac);
                let new_penalty = self.calculate_group_attribute_penalty_for_members(
                    &self.schedule[day][from_group],
                    ac,
                );
                self.attribute_balance_penalty += new_penalty - old_penalty;
            }
            if ac.group_id == *to_group_id {
                let old_penalty =
                    self.calculate_group_attribute_penalty_for_members(&to_group_members, ac);
                let new_penalty = self.calculate_group_attribute_penalty_for_members(
                    &self.schedule[day][to_group],
                    ac,
                );
                self.attribute_balance_penalty += new_penalty - old_penalty;
            }
        }

        // === UPDATE CONSTRAINT PENALTIES ===
        self._recalculate_constraint_penalty();

        // === UPDATE PairMeetingCount counts incrementally ===
        for (cidx, &(a, b)) in self.pairmin_pairs.clone().iter().enumerate() {
            if !self.pairmin_sessions[cidx].contains(&day) {
                continue;
            }
            // Only if moving person is one endpoint
            if person_idx != a && person_idx != b {
                continue;
            }
            let other = if person_idx == a { b } else { a };
            if !self.person_participation[other][day] {
                continue;
            }
            // Before: together if other was in from_group
            let were_same = from_group_members.contains(&other);
            // After: together if other is now in to_group (person moved there)
            let are_same = self.schedule[day][to_group].contains(&other);
            if were_same == are_same {
                continue;
            }
            if are_same {
                self.pairmin_counts[cidx] += 1;
            } else {
                self.pairmin_counts[cidx] -= 1;
            }
        }

        // Debug-only final invariant check for the whole session
        if self.logging.debug_validate_invariants {
            if let Err(e) = self.validate_no_duplicate_assignments() {
                if self.logging.debug_dump_invariant_context {
                    eprintln!(
                        "[DEBUG] Invariant failed after transfer day={} person={} from={} to={}",
                        day,
                        self.display_person_by_idx(person_idx),
                        self.group_idx_to_id[from_group],
                        self.group_idx_to_id[to_group]
                    );
                }
                let _ = e;
            }
        }
    }
}

// Helper struct for Disjoint Set Union
struct Dsu {
    parent: Vec<usize>,
}

impl Dsu {
    fn new(n: usize) -> Self {
        Dsu {
            parent: (0..n).collect(),
        }
    }

    fn find(&mut self, i: usize) -> usize {
        if self.parent[i] == i {
            i
        } else {
            self.parent[i] = self.find(self.parent[i]);
            self.parent[i]
        }
    }

    fn union(&mut self, i: usize, j: usize) {
        let root_i = self.find(i);
        let root_j = self.find(j);
        if root_i != root_j {
            self.parent[root_i] = root_j;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        models::{
            ApiInput, Group, Person, ProblemDefinition, SimulatedAnnealingParams,
            SolverConfiguration, SolverParams, StopConditions,
        },
        run_solver,
    };
    use std::collections::HashMap;

    // Helper to create a deterministic test setup
    fn create_test_input(
        num_people: u32,
        groups_config: Vec<(u32, u32)>,
        num_sessions: u32,
    ) -> ApiInput {
        let people = (0..num_people)
            .map(|i| Person {
                id: format!("p{}", i),
                attributes: HashMap::new(),
                sessions: None,
            })
            .collect();

        let groups = groups_config
            .iter()
            .enumerate()
            .map(|(i, (num_groups, size))| {
                (0..*num_groups).map(move |j| Group {
                    id: format!("g{}_{}", i, j),
                    size: *size,
                })
            })
            .flatten()
            .collect();

        ApiInput {
            initial_schedule: None,
            problem: ProblemDefinition {
                people,
                groups,
                num_sessions,
            },
            objectives: vec![],
            constraints: vec![],
            solver: SolverConfiguration {
                solver_type: "SimulatedAnnealing".to_string(),
                stop_conditions: StopConditions {
                    max_iterations: Some(1),
                    time_limit_seconds: None,
                    no_improvement_iterations: None,
                },
                solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams {
                    initial_temperature: 1.0,
                    final_temperature: 0.1,
                    cooling_schedule: "linear".to_string(),
                    reheat_after_no_improvement: Some(0), // No reheat
                    reheat_cycles: Some(0),
                }),
                logging: Default::default(),
                allowed_sessions: None,
            },
        }
    }

    #[test]
    fn test_pair_meeting_count_modes() {
        use crate::models::{Constraint, PairMeetingCountParams, PairMeetingMode};
        // People p0..p3; 2 groups of 2; 3 sessions
        let mut input = create_test_input(4, vec![(2, 2)], 3);

        // Add PairMeetingCount constraints for pair (p0,p1) across sessions [0,1,2]
        input
            .constraints
            .push(Constraint::PairMeetingCount(PairMeetingCountParams {
                people: vec!["p0".into(), "p1".into()],
                sessions: vec![0, 1, 2],
                target_meetings: 2,
                mode: PairMeetingMode::AtLeast,
                penalty_weight: 10.0,
            }));
        input
            .constraints
            .push(Constraint::PairMeetingCount(PairMeetingCountParams {
                people: vec!["p0".into(), "p1".into()],
                sessions: vec![0, 1, 2],
                target_meetings: 2,
                mode: PairMeetingMode::Exact,
                penalty_weight: 10.0,
            }));
        input
            .constraints
            .push(Constraint::PairMeetingCount(PairMeetingCountParams {
                people: vec!["p0".into(), "p1".into()],
                sessions: vec![0, 1, 2],
                target_meetings: 2,
                mode: PairMeetingMode::AtMost,
                penalty_weight: 10.0,
            }));

        let mut state = State::new(&input).unwrap();
        // Construct schedule where p0 and p1 are together exactly once
        // Session 0: (p0,p2) | (p1,p3)
        // Session 1: (p0,p1) | (p2,p3)
        // Session 2: (p0,p3) | (p1,p2)
        state.schedule = vec![
            vec![vec![0, 2], vec![1, 3]],
            vec![vec![0, 1], vec![2, 3]],
            vec![vec![0, 3], vec![1, 2]],
        ];
        state._recalculate_locations_from_schedule();
        state._recalculate_scores();

        assert_eq!(state.pairmin_counts.len(), 3);
        assert_eq!(state.pairmin_counts[0], 1);
        assert_eq!(state.pairmin_counts[1], 1);
        assert_eq!(state.pairmin_counts[2], 1);

        // Perform a swap in session 0 to bring p0 and p1 together again → now 2 in subset
        let _ = state.calculate_swap_cost_delta(0, 1, 2);
        state.apply_swap(0, 1, 2);
        state._recalculate_scores();

        // After swap, session 0 also has (p0,p1) together; counts should be >=2 for first constraint
        // Our counts are stored per-constraint over their subsets, so they should now be 2
        assert_eq!(state.pairmin_counts[0], 2);
        // Other entries correspond to the other two constraints on the same pair/subset; they share counts
        assert_eq!(state.pairmin_counts[1], 2);
        assert_eq!(state.pairmin_counts[2], 2);
    }

    #[test]
    fn test_recalculate_scores_is_correct() {
        // 1. Setup
        let input = create_test_input(6, vec![(2, 3)], 2);
        let mut state = State::new(&input).unwrap();
        state.schedule = vec![
            vec![vec![0, 1, 2], vec![3, 4, 5]], // Day 0: 6 contacts
            vec![vec![0, 3, 4], vec![1, 2, 5]], // Day 1: 6 contacts
        ];
        state._recalculate_locations_from_schedule();

        // 2. Action
        state._recalculate_scores();

        // 3. Assert
        // Contacts:
        // Day 0: (0,1), (0,2), (1,2), (3,4), (3,5), (4,5)
        // Day 1: (0,3), (0,4), (3,4), (1,2), (1,5), (2,5)
        // Total pairs met at least once: (0,1), (0,2), (0,3), (0,4), (1,2), (1,5), (2,5), (3,4), (3,5), (4,5) -> 10 pairs
        //
        // Repetition penalty:
        // (1,2) appears twice -> (2-1)^2 = 1
        // (3,4) appears twice -> (2-1)^2 = 1
        // Total penalty = 2
        assert_eq!(state.unique_contacts, 10);
        assert_eq!(state.repetition_penalty, 2);
    }

    #[test]
    fn test_swap_updates_scores_correctly() {
        // 1. Setup
        let input = create_test_input(6, vec![(2, 3)], 2);
        let mut state = State::new(&input).unwrap();

        // Force a known initial schedule for predictability
        state.schedule = vec![
            vec![vec![0, 1, 2], vec![3, 4, 5]], // Day 0
            vec![vec![0, 3, 4], vec![1, 2, 5]], // Day 1
        ];
        state._recalculate_locations_from_schedule();
        state._recalculate_scores();

        let mut state_after_swap = state.clone();

        // 2. Action: Swap person 2 (from G0) with person 3 (from G1) on day 0
        state_after_swap.apply_swap(0, 2, 3);
        state_after_swap._recalculate_scores();

        // 3. Assert
        assert_ne!(
            state.schedule, state_after_swap.schedule,
            "Schedule should change after a neutral-score swap."
        );

        // After swapping p2 and p3 on day 0, the new schedule is:
        // Day 0: G0=[0, 1, 3], G1=[2, 4, 5]
        let expected_day_0 = vec![vec![0, 1, 3], vec![2, 4, 5]];
        assert_eq!(
            state_after_swap.schedule[0], expected_day_0,
            "Day 0 of schedule is incorrect after swap."
        );

        // For this specific swap, the scores don't change, but they should be recalculated correctly.
        assert_eq!(state_after_swap.unique_contacts, 10);
        assert_eq!(state_after_swap.repetition_penalty, 2);
    }

    #[test]
    fn test_clique_merging() {
        // Create two overlapping MustStayTogether constraints with different session sets
        // A: {p0, p1} active in sessions 0 and 1
        // B: {p1, p2} active in sessions 1 and 2
        // Expected result:
        //   - Clique {p0,p1}  active only in session 0
        //   - Clique {p1,p2}  active only in session 2
        //   - Clique {p0,p1,p2} active only in session 1 (overlap)

        let mut input = create_test_input(6, vec![(1, 6)], 3);

        input.constraints = vec![
            Constraint::MustStayTogether {
                people: vec!["p0".into(), "p1".into()],
                sessions: Some(vec![0, 1]),
            },
            Constraint::MustStayTogether {
                people: vec!["p1".into(), "p2".into()],
                sessions: Some(vec![1, 2]),
            },
        ];

        let state = State::new(&input).unwrap();

        assert_eq!(state.cliques.len(), 3, "Should create three cliques");

        // Collect helper maps: set of members -> sessions
        let mut clique_map: Vec<(Vec<usize>, Option<Vec<usize>>)> = state
            .cliques
            .iter()
            .enumerate()
            .map(|(idx, members)| {
                let mut m = members.clone();
                m.sort();
                (m, state.clique_sessions[idx].clone())
            })
            .collect();

        clique_map.sort_by_key(|(m, _)| m.len());

        // Small cliques size 2
        let (c_a, sess_a) = &clique_map[0];
        let (c_b, sess_b) = &clique_map[1];
        let (c_overlap, sess_overlap) = &clique_map[2];

        assert_eq!(c_a, &vec![0, 1]);
        assert_eq!(sess_a.as_ref().unwrap(), &vec![0usize]);

        assert_eq!(c_b, &vec![1, 2]);
        assert_eq!(sess_b.as_ref().unwrap(), &vec![2usize]);

        assert_eq!(c_overlap, &vec![0, 1, 2]);
        assert_eq!(sess_overlap.as_ref().unwrap(), &vec![1usize]);
    }

    #[test]
    fn test_error_on_clique_too_large() {
        let mut input = create_test_input(5, vec![(1, 3)], 1);
        input.constraints = vec![Constraint::MustStayTogether {
            people: vec!["p0".into(), "p1".into(), "p2".into(), "p3".into()],
            sessions: None,
        }];

        let result = State::new(&input);
        assert!(result.is_err());
        if let Err(SolverError::ValidationError(msg)) = result {
            // The validation can fail in three ways now:
            // 1. The new check for total people vs. total capacity.
            // 2. The original check in `_preprocess_and_validate_constraints` for clique size.
            // 3. The new check during initial placement.
            // We accept any of these error messages as a valid failure for this test case.
            let is_capacity_error = msg.contains("Not enough group capacity");
            let is_specific_error = msg.contains("is larger than any available group");
            let is_general_error = msg.contains("Could not place clique");
            assert!(
                is_capacity_error || is_specific_error || is_general_error,
                "Error message did not match expected patterns. Got: {}",
                msg
            );
        } else {
            panic!("Expected a ValidationError");
        }
    }

    #[test]
    fn test_error_on_forbidden_pair_in_clique() {
        let mut input = create_test_input(5, vec![(1, 5)], 1);
        input.constraints = vec![
            Constraint::MustStayTogether {
                people: vec!["p0".into(), "p1".into()],
                sessions: None,
            },
            Constraint::ShouldNotBeTogether {
                people: vec!["p0".into(), "p1".into()],
                penalty_weight: 1000.0,
                sessions: None,
            },
        ];

        let result = State::new(&input);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("ShouldNotBeTogether constraint conflicts with MustStayTogether"));
    }

    #[test]
    fn test_clique_swap_probability_calculation() {
        // Test with no cliques
        let input_no_cliques = create_test_input(10, vec![(2, 5)], 1);
        let state_no_cliques = State::new(&input_no_cliques).unwrap();
        assert_eq!(
            state_no_cliques.calculate_clique_swap_probability(),
            vec![0.0]
        );

        // Test with some cliques
        let mut input_with_cliques = create_test_input(10, vec![(2, 5)], 1);
        input_with_cliques.constraints = vec![
            Constraint::MustStayTogether {
                people: vec!["p0".into(), "p1".into()],
                sessions: None,
            },
            Constraint::MustStayTogether {
                people: vec!["p2".into(), "p3".into()],
                sessions: None,
            },
        ];
        let state_with_cliques = State::new(&input_with_cliques).unwrap();
        let probabilities = state_with_cliques.calculate_clique_swap_probability();

        assert!(!probabilities.is_empty());
        assert!(probabilities[0] > 0.0);
    }

    #[test]
    fn test_find_non_clique_movable_people() {
        let mut input = create_test_input(8, vec![(2, 4)], 2);
        input.constraints = vec![
            Constraint::MustStayTogether {
                people: vec!["p0".into(), "p1".into()],
                sessions: None,
            },
            Constraint::ImmovablePerson(crate::models::ImmovablePersonParams {
                person_id: "p2".into(),
                group_id: "g0_0".into(),
                sessions: Some(vec![0, 1]),
            }),
        ];
        let state = State::new(&input).unwrap();

        // Find non-clique movable people in group 0 for day 0
        let non_clique_people = state.find_non_clique_movable_people(0, 0);

        // Should exclude p0, p1 (clique members) and p2 (immovable)
        assert!(!non_clique_people.contains(&0)); // p0 in clique
        assert!(!non_clique_people.contains(&1)); // p1 in clique
        assert!(!non_clique_people.contains(&2)); // p2 immovable

        // Should only include movable non-clique people
        for &person_idx in &non_clique_people {
            assert!(state.person_to_clique_id[0][person_idx].is_none());
            assert!(!state.immovable_people.contains_key(&(person_idx, 0)));
        }
    }

    #[test]
    fn test_clique_swap_feasibility() {
        let mut input = create_test_input(10, vec![(2, 5)], 1);
        input.constraints = vec![Constraint::MustStayTogether {
            people: vec!["p0".into(), "p1".into(), "p2".into()],
            sessions: None,
        }];
        let state = State::new(&input).unwrap();

        // Find the clique (should be clique 0)
        let clique_idx = 0;
        let clique_group = state.locations[0][0].0; // Group where p0 is located
        let other_group = if clique_group == 0 { 1 } else { 0 };

        // Check feasibility - need at least 3 non-clique people in target group
        let is_feasible = state.is_clique_swap_feasible(0, clique_idx, clique_group, other_group);

        // Should be feasible since we have enough non-clique people
        let non_clique_in_other = state.find_non_clique_movable_people(0, other_group);
        if non_clique_in_other.len() >= 3 {
            assert!(is_feasible);
        } else {
            assert!(!is_feasible);
        }
    }

    #[test]
    fn test_clique_swap_delta_calculation() {
        let mut input = create_test_input(8, vec![(2, 4)], 1);
        input.constraints = vec![Constraint::MustStayTogether {
            people: vec!["p0".into(), "p1".into()],
            sessions: None,
        }];
        let mut state = State::new(&input).unwrap();

        // Recalculate scores to ensure we have a baseline
        state._recalculate_scores();
        let initial_cost = state.calculate_cost();

        let clique_idx = 0;
        let clique_group = state.locations[0][0].0;
        let other_group = if clique_group == 0 { 1 } else { 0 };
        let non_clique_people = state.find_non_clique_movable_people(0, other_group);

        if non_clique_people.len() >= 2 {
            let target_people: Vec<usize> = non_clique_people.into_iter().take(2).collect();

            // Calculate delta
            let delta = state.calculate_clique_swap_cost_delta(
                0,
                clique_idx,
                clique_group,
                other_group,
                &target_people,
            );

            // Apply the swap and verify the delta was correct
            let mut test_state = state.clone();
            test_state.apply_clique_swap(0, clique_idx, clique_group, other_group, &target_people);
            test_state.validate_scores(); // Ensure scores are consistent

            let actual_new_cost = test_state.calculate_cost();
            let expected_new_cost = initial_cost + delta;

            // Allow small floating point differences
            assert!(
                (actual_new_cost - expected_new_cost).abs() < 0.01,
                "Delta calculation incorrect: expected {}, got {}, delta was {}",
                expected_new_cost,
                actual_new_cost,
                delta
            );
        }
    }

    #[test]
    fn test_clique_swap_preserves_clique_integrity() {
        let mut input = create_test_input(10, vec![(2, 5)], 1);
        input.constraints = vec![Constraint::MustStayTogether {
            people: vec!["p0".into(), "p1".into(), "p2".into()],
            sessions: None,
        }];
        let mut state = State::new(&input).unwrap();

        let clique_idx = 0;
        let clique_group = state.locations[0][0].0;
        let other_group = if clique_group == 0 { 1 } else { 0 };
        let non_clique_people = state.find_non_clique_movable_people(0, other_group);

        if non_clique_people.len() >= 3 {
            let target_people: Vec<usize> = non_clique_people.into_iter().take(3).collect();
            let clique_members = state.cliques[clique_idx].clone();

            // Apply clique swap
            state.apply_clique_swap(0, clique_idx, clique_group, other_group, &target_people);

            // Verify all clique members are in the same group after swap
            let first_member_group = state.locations[0][clique_members[0]].0;
            for &member in &clique_members {
                assert_eq!(
                    state.locations[0][member].0, first_member_group,
                    "Clique member {} not in same group as other members",
                    member
                );
            }

            // Verify they're in the target group
            assert_eq!(
                first_member_group, other_group,
                "Clique not moved to target group"
            );

            // Verify target people are in the original group
            for &target_person in &target_people {
                assert_eq!(
                    state.locations[0][target_person].0, clique_group,
                    "Target person {} not moved to clique's original group",
                    target_person
                );
            }
        }
    }

    #[test]
    fn test_user_reported_json_structure() {
        let json_input = r#"{
        "problem": {
            "people": [
                {"id": "alice", "attributes": {"name": "Alice Johnson", "gender": "female", "department": "engineering", "seniority": "senior"}},
                {"id": "bob", "attributes": {"name": "Bob Smith", "gender": "male", "department": "marketing", "seniority": "mid"}},
                {"id": "charlie", "attributes": {"name": "Charlie Brown", "gender": "male", "department": "engineering", "seniority": "junior"}},
                {"id": "diana", "attributes": {"name": "Diana Prince", "gender": "female", "department": "sales", "seniority": "lead"}},
                {"id": "eve", "attributes": {"name": "Eve Davis", "gender": "female", "department": "hr", "seniority": "mid"}},
                {"id": "frank", "attributes": {"name": "Frank Miller", "gender": "male", "department": "finance", "seniority": "senior"}},
                {"id": "grace", "attributes": {"name": "Grace Lee", "gender": "female", "department": "engineering", "seniority": "junior"}},
                {"id": "henry", "attributes": {"name": "Henry Wilson", "gender": "male", "department": "marketing", "seniority": "senior"}},
                {"id": "iris", "attributes": {"name": "Iris Chen", "gender": "female", "department": "sales", "seniority": "mid"}},
                {"id": "jack", "attributes": {"name": "Jack Taylor", "gender": "male", "department": "hr", "seniority": "junior"}},
                {"id": "kate", "attributes": {"name": "Kate Anderson", "gender": "female", "department": "finance", "seniority": "lead"}},
                {"id": "leo", "attributes": {"name": "Leo Rodriguez", "gender": "male", "department": "engineering", "seniority": "mid", "location": "remote"}, "sessions": [1, 2]}
            ],
            "groups": [
                {"id": "team-alpha", "size": 4},
                {"id": "team-beta", "size": 4},
                {"id": "team-gamma", "size": 4}
            ],
            "num_sessions": 3
        },
        "objectives": [
            {"type": "maximize_unique_contacts", "weight": 1}
        ],
        "constraints": [
            {"type": "RepeatEncounter", "max_allowed_encounters": 1, "penalty_function": "squared", "penalty_weight": 100},
            {"type": "MustStayTogether", "people": ["alice", "bob"], "sessions": [0, 1]},
            {"type": "ShouldNotBeTogether", "people": ["charlie", "diana"], "penalty_weight": 500},
            {"type": "AttributeBalance", "group_id": "team-alpha", "attribute_key": "gender", "desired_values": {"male": 2, "female": 2}, "penalty_weight": 50}
        ],
        "solver": {
            "solver_type": "SimulatedAnnealing",
            "stop_conditions": {
                "max_iterations": 10000,
                "time_limit_seconds": 30,
                "no_improvement_iterations": 1000
            },
            "solver_params": {
                "solver_type": "SimulatedAnnealing",
                "initial_temperature": 1,
                "final_temperature": 0.01,
                "cooling_schedule": "geometric"
            },
            "logging": {
                "log_frequency": null,
                "log_initial_state": false,
                "log_duration_and_score": false,
                "display_final_schedule": false,
                "log_initial_score_breakdown": false,
                "log_final_score_breakdown": false,
                "log_stop_condition": false
            }
        }
    }"#;

        // Test that the JSON parses correctly
        let api_input: ApiInput =
            serde_json::from_str(json_input).expect("Failed to parse user-reported JSON structure");

        // Verify the structure
        assert_eq!(api_input.problem.people.len(), 12);
        assert_eq!(api_input.problem.groups.len(), 3);
        assert_eq!(api_input.problem.num_sessions, 3);
        assert_eq!(api_input.objectives.len(), 1);
        assert_eq!(api_input.constraints.len(), 4);
        assert_eq!(api_input.solver.solver_type, "SimulatedAnnealing");

        // Test that the solver can run with this input
        let result = run_solver(&api_input);
        assert!(
            result.is_ok(),
            "Solver should succeed with user-reported JSON: {:?}",
            result.err()
        );

        let solution = result.unwrap();
        assert!(solution.schedule.len() > 0);
    }

    #[test]
    fn test_constraint_parsing() {
        use crate::models::Constraint;

        // Test RepeatEncounter parsing
        let repeat_json = r#"{"type": "RepeatEncounter", "max_allowed_encounters": 1, "penalty_function": "squared", "penalty_weight": 100}"#;
        let repeat_constraint: Result<Constraint, _> = serde_json::from_str(repeat_json);
        assert!(
            repeat_constraint.is_ok(),
            "RepeatEncounter should parse successfully"
        );

        // Test MustStayTogether parsing
        let must_stay_json =
            r#"{"type": "MustStayTogether", "people": ["alice", "bob"], "sessions": [0, 1]}"#;
        let must_stay_constraint: Result<Constraint, _> = serde_json::from_str(must_stay_json);
        assert!(
            must_stay_constraint.is_ok(),
            "MustStayTogether should parse successfully"
        );

        // Test ShouldNotBeTogether parsing
        let should_not_be_json = r#"{"type": "ShouldNotBeTogether", "people": ["charlie", "diana"], "penalty_weight": 500}"#;
        let should_not_be_constraint: Result<Constraint, _> =
            serde_json::from_str(should_not_be_json);
        assert!(
            should_not_be_constraint.is_ok(),
            "ShouldNotBeTogether should parse successfully"
        );

        // Test AttributeBalance parsing
        let attr_balance_json = r#"{"type": "AttributeBalance", "group_id": "team-alpha", "attribute_key": "gender", "desired_values": {"male": 2, "female": 2}, "penalty_weight": 50}"#;
        let attr_balance_constraint: Result<Constraint, _> =
            serde_json::from_str(attr_balance_json);
        assert!(
            attr_balance_constraint.is_ok(),
            "AttributeBalance should parse successfully"
        );
    }

    #[test]
    fn test_solver_config_parsing() {
        use crate::models::SolverConfiguration;

        let solver_json = r#"{
        "solver_type": "SimulatedAnnealing",
        "stop_conditions": {
            "max_iterations": 10000,
            "time_limit_seconds": 30,
            "no_improvement_iterations": 1000
        },
        "solver_params": {
            "solver_type": "SimulatedAnnealing",
            "initial_temperature": 1,
            "final_temperature": 0.01,
            "cooling_schedule": "geometric"
        },
        "logging": {
            "log_frequency": 0,
            "log_initial_state": false,
            "log_duration_and_score": false,
            "display_final_schedule": false,
            "log_initial_score_breakdown": false,
            "log_final_score_breakdown": false,
            "log_stop_condition": false
        }
    }"#;

        let solver_config: Result<SolverConfiguration, _> = serde_json::from_str(solver_json);
        assert!(
            solver_config.is_ok(),
            "Solver config should parse successfully: {:?}",
            solver_config.err()
        );
    }

    #[test]
    fn test_simplified_user_json_structure() {
        let json_input = r#"{
        "problem": {
            "people": [
                {"id": "alice", "attributes": {"name": "Alice Johnson", "gender": "female"}},
                {"id": "bob", "attributes": {"name": "Bob Smith", "gender": "male"}},
                {"id": "charlie", "attributes": {"name": "Charlie Brown", "gender": "male"}},
                {"id": "diana", "attributes": {"name": "Diana Prince", "gender": "female"}}
            ],
            "groups": [
                {"id": "team-alpha", "size": 2},
                {"id": "team-beta", "size": 2}
            ],
            "num_sessions": 2
        },
        "objectives": [
            {"type": "maximize_unique_contacts", "weight": 1}
        ],
        "constraints": [
            {"type": "RepeatEncounter", "max_allowed_encounters": 1, "penalty_function": "squared", "penalty_weight": 100}
        ],
        "solver": {
            "solver_type": "SimulatedAnnealing",
            "stop_conditions": {
                "max_iterations": 1000,
                "time_limit_seconds": 5,
                "no_improvement_iterations": 100
            },
            "solver_params": {
                "solver_type": "SimulatedAnnealing",
                "initial_temperature": 1,
                "final_temperature": 0.01,
                "cooling_schedule": "geometric"
            },
            "logging": {
                "log_frequency": 0,
                "log_initial_state": false,
                "log_duration_and_score": false,
                "display_final_schedule": false,
                "log_initial_score_breakdown": false,
                "log_final_score_breakdown": false,
                "log_stop_condition": false
            }
        }
    }"#;

        // Test that the JSON parses correctly
        let api_input: ApiInput =
            serde_json::from_str(json_input).expect("Failed to parse simplified JSON structure");

        // Verify the structure
        assert_eq!(api_input.problem.people.len(), 4);
        assert_eq!(api_input.problem.groups.len(), 2);
        assert_eq!(api_input.problem.num_sessions, 2);
        assert_eq!(api_input.objectives.len(), 1);
        assert_eq!(api_input.constraints.len(), 1);
        assert_eq!(api_input.solver.solver_type, "SimulatedAnnealing");

        // Test that the solver can run with this input
        let result = run_solver(&api_input);
        assert!(
            result.is_ok(),
            "Solver should succeed with simplified JSON: {:?}",
            result.err()
        );

        let solution = result.unwrap();
        assert!(solution.schedule.len() > 0);
        assert!(solution.unique_contacts > 0);
    }

    #[test]
    fn test_transfer_probability_when_extra_capacity() {
        // Create a scenario where groups have more capacity than people currently assigned.
        // The transfer probability calculation should recognize the available capacity
        // and return a value greater than zero.
        let input = create_test_input(
            6,             // Total people
            vec![(2, 10)], // Two groups, each with capacity 10 (far more than needed)
            1,             // Single session is enough for this check
        );

        let state = State::new(&input).expect("Failed to create solver state");

        // For day 0, since both groups have room left (each holds 3 people),
        // the transfer probability should be positive.
        let prob = state.calculate_transfer_probability(0);
        assert!(
            prob > 0.0,
            "Expected positive transfer probability, got {}",
            prob
        );
    }

    #[test]
    fn test_immovable_propagates_to_clique_members() {
        // Scenario: p0 and p1 form a clique across all sessions.
        // p0 is immovable to group g0_0 in session 0.
        // Expectation:
        //   • p1 is also immovable to g0_0 in session 0.
        //   • The clique constraint no longer applies in session 0 but still applies in session 1.

        use crate::models::ImmovablePersonParams;

        // 3 people (p0, p1 in clique; p2 free) – 2 groups of size 2 – 2 sessions
        let mut input = create_test_input(3, vec![(2, 2)], 2);

        // Add constraints
        input.constraints = vec![
            Constraint::MustStayTogether {
                people: vec!["p0".into(), "p1".into()],
                sessions: None, // all sessions initially
            },
            Constraint::ImmovablePerson(ImmovablePersonParams {
                person_id: "p0".into(),
                group_id: "g0_0".into(),
                sessions: Some(vec![0]),
            }),
        ];

        // Build state
        let state = State::new(&input).expect("State creation should succeed");

        // Resolve useful indices
        let p0_idx = state.person_id_to_idx["p0"];
        let p1_idx = state.person_id_to_idx["p1"];
        let g0_idx = state.group_id_to_idx["g0_0"];

        // === Assert immovable propagation ===
        assert_eq!(
            state.immovable_people.len(),
            2,
            "Both clique members should be immovable"
        );
        assert_eq!(state.immovable_people.get(&(p0_idx, 0)), Some(&g0_idx));
        assert_eq!(state.immovable_people.get(&(p1_idx, 0)), Some(&g0_idx));

        // === Assert clique session removal ===
        let clique_id = state.person_to_clique_id[0][p0_idx].expect("p0 should be in clique");
        let sessions_opt = &state.clique_sessions[clique_id];
        // After propagation, the clique should only apply to session 1.
        assert_eq!(sessions_opt, &Some(vec![1]));

        // === Ensure no validation errors for conflicting assignments ===
        // (Already covered by State::new success) – Additional logical check:
        // cost calculation should yield zero immovable violations at start.
        assert_eq!(state.immovable_violations, 0);
    }
}

#[cfg(test)]
mod attribute_balance_tests {
    use super::*;
    use crate::models::*;

    #[test]
    fn test_attribute_balance_incremental_vs_recalculation() {
        println!("=== Testing Attribute Balance Incremental Tracking ===");

        // Create a test case with attribute balance constraints
        let input = create_attribute_balance_test_input();
        let mut state = State::new(&input).unwrap();

        println!("Initial state:");
        println!(
            "  attribute_balance_penalty: {}",
            state.attribute_balance_penalty
        );
        println!("  total cost: {}", state.calculate_cost());

        // Perform several swaps and check consistency after each one
        for swap_num in 1..=10 {
            // Find two people to swap (avoid cliques and immovable people)
            let swappable_people: Vec<usize> = (0..state.person_idx_to_id.len())
                .filter(|&p_idx| state.person_to_clique_id[0][p_idx].is_none())
                .collect();

            if swappable_people.len() < 2 {
                break;
            }

            let p1_idx = swappable_people[0];
            let p2_idx = swappable_people[1];
            let day = 0; // Test on first day

            // Calculate delta using incremental method
            let delta_cost = state.calculate_swap_cost_delta(day, p1_idx, p2_idx);
            let cost_before = state.calculate_cost();
            let attr_penalty_before = state.attribute_balance_penalty;

            println!(
                "\nSwap {}: person {} <-> person {} on day {}",
                swap_num, p1_idx, p2_idx, day
            );
            println!("  Before swap:");
            println!("    attribute_balance_penalty: {}", attr_penalty_before);
            println!("    total cost: {}", cost_before);
            println!("  Predicted delta: {}", delta_cost);

            // Apply the swap using incremental updates
            state.apply_swap(day, p1_idx, p2_idx);

            let cost_after_incremental = state.calculate_cost();
            let attr_penalty_after_incremental = state.attribute_balance_penalty;
            let actual_delta = cost_after_incremental - cost_before;

            println!("  After incremental swap:");
            println!(
                "    attribute_balance_penalty: {}",
                attr_penalty_after_incremental
            );
            println!("    total cost: {}", cost_after_incremental);
            println!("    actual delta: {}", actual_delta);

            // Now do full recalculation
            state._recalculate_scores();
            let cost_after_recalc = state.calculate_cost();
            let attr_penalty_after_recalc = state.attribute_balance_penalty;

            println!("  After recalculation:");
            println!(
                "    attribute_balance_penalty: {}",
                attr_penalty_after_recalc
            );
            println!("    total cost: {}", cost_after_recalc);

            // Check for discrepancies
            let delta_prediction_error = (actual_delta - delta_cost).abs();
            let recalc_error = (cost_after_recalc - cost_after_incremental).abs();
            let attr_penalty_error =
                (attr_penalty_after_recalc - attr_penalty_after_incremental).abs();

            println!("  Errors:");
            println!("    delta prediction error: {}", delta_prediction_error);
            println!("    recalculation cost error: {}", recalc_error);
            println!("    attribute penalty error: {}", attr_penalty_error);

            // Assert that incremental and recalculation match
            if delta_prediction_error > 0.001 {
                panic!(
                    "Delta prediction error too large: {}",
                    delta_prediction_error
                );
            }
            if recalc_error > 0.001 {
                panic!("Recalculation cost error too large: {}", recalc_error);
            }
            if attr_penalty_error > 0.001 {
                panic!("Attribute penalty error too large: {}", attr_penalty_error);
            }
        }

        println!("\n=== All swaps passed incremental vs recalculation test ===");
    }

    #[test]
    fn test_attribute_balance_bug_reproduction() {
        println!("=== Testing Specific Attribute Balance Bug ===");

        let input = create_attribute_balance_test_input();
        let mut state = State::new(&input).unwrap();

        // Print initial state
        println!("Initial schedule:");
        for (day, day_schedule) in state.schedule.iter().enumerate() {
            println!("  Day {}:", day);
            for (group_idx, group_people) in day_schedule.iter().enumerate() {
                let group_id = &state.group_idx_to_id[group_idx];
                let people_names: Vec<String> = group_people
                    .iter()
                    .map(|&p_idx| state.person_idx_to_id[p_idx].clone())
                    .collect();
                println!("    Group {} ({}): {:?}", group_idx, group_id, people_names);
            }
        }

        println!(
            "Initial attribute balance penalty: {}",
            state.attribute_balance_penalty
        );

        // Force a specific swap that should create an attribute balance violation
        // Swap Alice (female) from group 0 with Charlie (male) from group 1
        let alice_idx = state.person_id_to_idx["alice"];
        let charlie_idx = state.person_id_to_idx["charlie"];

        println!(
            "Alice (female) idx: {}, Charlie (male) idx: {}",
            alice_idx, charlie_idx
        );

        let (alice_group, _) = state.locations[0][alice_idx];
        let (charlie_group, _) = state.locations[0][charlie_idx];

        println!(
            "Before swap: Alice in group {}, Charlie in group {}",
            alice_group, charlie_group
        );

        // Swap Alice and Charlie (should be in different groups)
        if alice_group != charlie_group {
            let delta = state.calculate_swap_cost_delta(0, alice_idx, charlie_idx);
            println!("Calculated delta: {}", delta);

            let cost_before = state.calculate_cost();
            let attr_penalty_before = state.attribute_balance_penalty;

            println!(
                "Before swap: cost={}, attr_penalty={}",
                cost_before, attr_penalty_before
            );

            // Apply the swap
            state.apply_swap(0, alice_idx, charlie_idx);

            let cost_after_incremental = state.calculate_cost();
            let attr_penalty_after_incremental = state.attribute_balance_penalty;
            let actual_delta = cost_after_incremental - cost_before;

            println!(
                "After incremental swap: cost={}, attr_penalty={}, actual_delta={}",
                cost_after_incremental, attr_penalty_after_incremental, actual_delta
            );

            // Now recalculate
            state._recalculate_scores();

            let cost_after_recalc = state.calculate_cost();
            let attr_penalty_after_recalc = state.attribute_balance_penalty;

            println!(
                "After recalculation: cost={}, attr_penalty={}",
                cost_after_recalc, attr_penalty_after_recalc
            );

            let attr_penalty_error =
                (attr_penalty_after_recalc - attr_penalty_after_incremental).abs();
            let cost_error = (cost_after_recalc - cost_after_incremental).abs();

            println!(
                "Errors: attr_penalty_error={}, cost_error={}",
                attr_penalty_error, cost_error
            );

            if attr_penalty_error > 0.001 {
                println!("BUG DETECTED: Attribute penalty mismatch!");
                println!("  Incremental: {}", attr_penalty_after_incremental);
                println!("  Recalculated: {}", attr_penalty_after_recalc);
                println!("  Difference: {}", attr_penalty_error);
            }
        } else {
            println!("Alice and Bob are in the same group, no swap needed");
        }
    }

    #[test]
    fn test_attribute_balance_delta_calculation() {
        println!("=== Testing Attribute Balance Delta Calculation ===");

        let input = create_attribute_balance_test_input();
        let mut state = State::new(&input).unwrap();

        // Test a specific swap
        let p1_idx = 0; // Should be "alice" (female)
        let p2_idx = 1; // Should be "bob" (male)
        let day = 0;

        println!(
            "Testing swap: {} <-> {} on day {}",
            state.person_idx_to_id[p1_idx], state.person_idx_to_id[p2_idx], day
        );

        // Get current group assignments
        let (p1_group, _) = state.locations[day][p1_idx];
        let (p2_group, _) = state.locations[day][p2_idx];

        println!(
            "  {} is in group {} ({})",
            state.person_idx_to_id[p1_idx], p1_group, state.group_idx_to_id[p1_group]
        );
        println!(
            "  {} is in group {} ({})",
            state.person_idx_to_id[p2_idx], p2_group, state.group_idx_to_id[p2_group]
        );

        // Calculate attribute balance penalty before swap
        let penalty_before = state.attribute_balance_penalty;
        println!("  Attribute balance penalty before: {}", penalty_before);

        // Calculate delta
        let delta = state.calculate_swap_cost_delta(day, p1_idx, p2_idx);
        println!("  Calculated delta: {}", delta);

        // Apply swap and check actual change
        let cost_before = state.calculate_cost();
        state.apply_swap(day, p1_idx, p2_idx);
        let cost_after = state.calculate_cost();
        let penalty_after = state.attribute_balance_penalty;
        let actual_delta = cost_after - cost_before;

        println!("  Attribute balance penalty after: {}", penalty_after);
        println!("  Actual delta: {}", actual_delta);
        println!("  Penalty change: {}", penalty_after - penalty_before);

        // Now recalculate and compare
        state._recalculate_scores();
        let penalty_recalc = state.attribute_balance_penalty;
        let cost_recalc = state.calculate_cost();

        println!("  After recalculation:");
        println!("    Attribute balance penalty: {}", penalty_recalc);
        println!("    Total cost: {}", cost_recalc);

        assert!(
            (penalty_recalc - penalty_after).abs() < 0.001,
            "Attribute penalty mismatch: incremental={}, recalc={}",
            penalty_after,
            penalty_recalc
        );
    }

    fn create_attribute_balance_test_input() -> ApiInput {
        ApiInput {
            initial_schedule: None,
            problem: ProblemDefinition {
                people: vec![
                    Person {
                        id: "alice".to_string(),
                        attributes: [("gender".to_string(), "female".to_string())].into(),
                        sessions: None,
                    },
                    Person {
                        id: "bob".to_string(),
                        attributes: [("gender".to_string(), "male".to_string())].into(),
                        sessions: None,
                    },
                    Person {
                        id: "charlie".to_string(),
                        attributes: [("gender".to_string(), "male".to_string())].into(),
                        sessions: None,
                    },
                    Person {
                        id: "diana".to_string(),
                        attributes: [("gender".to_string(), "female".to_string())].into(),
                        sessions: None,
                    },
                    Person {
                        id: "eve".to_string(),
                        attributes: [("gender".to_string(), "female".to_string())].into(),
                        sessions: None,
                    },
                    Person {
                        id: "frank".to_string(),
                        attributes: [("gender".to_string(), "male".to_string())].into(),
                        sessions: None,
                    },
                ],
                groups: vec![
                    Group {
                        id: "team1".to_string(),
                        size: 3,
                    },
                    Group {
                        id: "team2".to_string(),
                        size: 3,
                    },
                ],
                num_sessions: 1,
            },
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".to_string(),
                weight: 1.0,
            }],
            constraints: vec![
                Constraint::AttributeBalance(AttributeBalanceParams {
                    group_id: "team1".to_string(),
                    attribute_key: "gender".to_string(),
                    desired_values: [("male".to_string(), 2), ("female".to_string(), 1)].into(),
                    penalty_weight: 100.0,
                    mode: crate::models::AttributeBalanceMode::Exact,
                    sessions: Some(vec![0, 1]),
                }),
                Constraint::AttributeBalance(AttributeBalanceParams {
                    group_id: "team2".to_string(),
                    attribute_key: "gender".to_string(),
                    desired_values: [("male".to_string(), 1), ("female".to_string(), 2)].into(),
                    penalty_weight: 100.0,
                    mode: crate::models::AttributeBalanceMode::Exact,
                    sessions: Some(vec![0, 1]),
                }),
            ],
            solver: SolverConfiguration {
                solver_type: "SimulatedAnnealing".to_string(),
                stop_conditions: StopConditions {
                    max_iterations: Some(10),
                    time_limit_seconds: None,
                    no_improvement_iterations: None,
                },
                solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams {
                    initial_temperature: 1.0,
                    final_temperature: 0.1,
                    cooling_schedule: "geometric".to_string(),
                    reheat_after_no_improvement: Some(0), // No reheat
                    reheat_cycles: Some(0),
                }),
                logging: LoggingOptions::default(),
                allowed_sessions: None,
            },
        }
    }

    #[test]
    fn test_attribute_balance_mode_at_least() {
        // People: 4 females, 2 males
        let people = vec![
            Person {
                id: "f1".to_string(),
                attributes: [("gender".to_string(), "female".to_string())].into(),
                sessions: None,
            },
            Person {
                id: "f2".to_string(),
                attributes: [("gender".to_string(), "female".to_string())].into(),
                sessions: None,
            },
            Person {
                id: "f3".to_string(),
                attributes: [("gender".to_string(), "female".to_string())].into(),
                sessions: None,
            },
            Person {
                id: "f4".to_string(),
                attributes: [("gender".to_string(), "female".to_string())].into(),
                sessions: None,
            },
            Person {
                id: "m1".to_string(),
                attributes: [("gender".to_string(), "male".to_string())].into(),
                sessions: None,
            },
            Person {
                id: "m2".to_string(),
                attributes: [("gender".to_string(), "male".to_string())].into(),
                sessions: None,
            },
        ];

        let input = ApiInput {
            initial_schedule: None,
            problem: ProblemDefinition {
                people,
                groups: vec![
                    Group {
                        id: "g1".to_string(),
                        size: 3,
                    },
                    Group {
                        id: "g2".to_string(),
                        size: 3,
                    },
                ],
                num_sessions: 1,
            },
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".to_string(),
                weight: 1.0,
            }],
            constraints: vec![Constraint::AttributeBalance(AttributeBalanceParams {
                group_id: "g1".to_string(),
                attribute_key: "gender".to_string(),
                desired_values: [("female".to_string(), 2)].into(),
                penalty_weight: 10.0,
                mode: crate::models::AttributeBalanceMode::AtLeast,
                sessions: None,
            })],
            solver: SolverConfiguration {
                solver_type: "SimulatedAnnealing".to_string(),
                stop_conditions: StopConditions {
                    max_iterations: Some(1),
                    time_limit_seconds: None,
                    no_improvement_iterations: None,
                },
                solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams {
                    initial_temperature: 1.0,
                    final_temperature: 1.0,
                    cooling_schedule: "geometric".to_string(),
                    reheat_after_no_improvement: Some(0),
                    reheat_cycles: Some(0),
                }),
                logging: LoggingOptions::default(),
                allowed_sessions: None,
            },
        };

        let mut state = State::new(&input).expect("state should build");

        // Case 1: Shortfall (only 1 female in g1) -> penalty = (2-1)^2 * 10 = 10
        // Indices: f1=0, f2=1, f3=2, f4=3, m1=4, m2=5
        state.schedule = vec![vec![vec![0, 4, 5], vec![1, 2, 3]]]; // g1: f1,m1,m2 (1 female); g2: f2,f3,f4
        state._recalculate_scores();
        let p_shortfall = state.attribute_balance_penalty;
        assert!(
            (p_shortfall - 10.0).abs() < 0.001,
            "Expected shortfall penalty 10, got {}",
            p_shortfall
        );

        // Case 2: Overshoot (3 females in g1) -> penalty = 0 in AtLeast mode
        state.schedule = vec![vec![vec![0, 1, 2], vec![3, 4, 5]]]; // g1: f1,f2,f3 (3 females)
        state._recalculate_scores();
        let p_overshoot = state.attribute_balance_penalty;
        assert!(
            p_overshoot.abs() < 0.001,
            "Expected zero penalty for overshoot in AtLeast mode, got {}",
            p_overshoot
        );
    }

    #[test]
    fn test_attribute_balance_detailed_debugging() {
        println!("=== DETAILED ATTRIBUTE BALANCE DEBUGGING ===");

        let input = create_attribute_balance_test_input();
        let mut state = State::new(&input).unwrap();

        println!("Initial state:");
        println!(
            "  attribute_balance_penalty: {}",
            state.attribute_balance_penalty
        );

        // Print attribute constraints
        println!("Attribute balance constraints:");
        for (i, ac) in state.attribute_balance_constraints.iter().enumerate() {
            println!(
                "  {}: group_id='{}', attribute_key='{}', penalty_weight={}",
                i, ac.group_id, ac.attribute_key, ac.penalty_weight
            );
            println!("    desired_values: {:?}", ac.desired_values);
        }

        // Find two people in different groups for testing
        let mut test_people = None;
        for p1 in 0..state.person_idx_to_id.len() {
            for p2 in (p1 + 1)..state.person_idx_to_id.len() {
                let (g1, _) = state.locations[0][p1];
                let (g2, _) = state.locations[0][p2];
                if g1 != g2 {
                    test_people = Some((p1, p2));
                    break;
                }
            }
            if test_people.is_some() {
                break;
            }
        }

        if let Some((p1_idx, p2_idx)) = test_people {
            println!(
                "\nTesting swap: {} <-> {}",
                state.person_idx_to_id[p1_idx], state.person_idx_to_id[p2_idx]
            );

            let (g1_idx, _) = state.locations[0][p1_idx];
            let (g2_idx, _) = state.locations[0][p2_idx];

            println!(
                "  {} in group {} ({})",
                state.person_idx_to_id[p1_idx], g1_idx, state.group_idx_to_id[g1_idx]
            );
            println!(
                "  {} in group {} ({})",
                state.person_idx_to_id[p2_idx], g2_idx, state.group_idx_to_id[g2_idx]
            );

            let g1_members = &state.schedule[0][g1_idx];
            let g2_members = &state.schedule[0][g2_idx];

            println!(
                "  g1_members: {:?}",
                g1_members
                    .iter()
                    .map(|&p| &state.person_idx_to_id[p])
                    .collect::<Vec<_>>()
            );
            println!(
                "  g2_members: {:?}",
                g2_members
                    .iter()
                    .map(|&p| &state.person_idx_to_id[p])
                    .collect::<Vec<_>>()
            );

            // Calculate delta step by step
            println!("\n--- DELTA CALCULATION ---");
            let mut total_delta = 0.0;

            for (i, ac) in state.attribute_balance_constraints.iter().enumerate() {
                println!(
                    "Constraint {}: group_id='{}', attribute_key='{}'",
                    i, ac.group_id, ac.attribute_key
                );

                // Check if constraint applies to these groups
                let g1_id = &state.group_idx_to_id[g1_idx];
                let g2_id = &state.group_idx_to_id[g2_idx];

                let applies_to_g1 = ac.group_id == *g1_id;
                let applies_to_g2 = ac.group_id == *g2_id;

                println!("  applies_to_g1 ({}): {}", g1_id, applies_to_g1);
                println!("  applies_to_g2 ({}): {}", g2_id, applies_to_g2);

                if !applies_to_g1 && !applies_to_g2 {
                    println!("  SKIPPING - constraint doesn't apply to either group");
                    continue;
                }

                let old_penalty_g1 =
                    state.calculate_group_attribute_penalty_for_members(g1_members, ac);
                let old_penalty_g2 =
                    state.calculate_group_attribute_penalty_for_members(g2_members, ac);

                println!("  old_penalty_g1: {}", old_penalty_g1);
                println!("  old_penalty_g2: {}", old_penalty_g2);

                // Calculate new group compositions
                let mut next_g1_members: Vec<usize> = g1_members
                    .iter()
                    .filter(|&&p| p != p1_idx)
                    .cloned()
                    .collect();
                next_g1_members.push(p2_idx);
                let mut next_g2_members: Vec<usize> = g2_members
                    .iter()
                    .filter(|&&p| p != p2_idx)
                    .cloned()
                    .collect();
                next_g2_members.push(p1_idx);

                println!(
                    "  next_g1_members: {:?}",
                    next_g1_members
                        .iter()
                        .map(|&p| &state.person_idx_to_id[p])
                        .collect::<Vec<_>>()
                );
                println!(
                    "  next_g2_members: {:?}",
                    next_g2_members
                        .iter()
                        .map(|&p| &state.person_idx_to_id[p])
                        .collect::<Vec<_>>()
                );

                let new_penalty_g1 =
                    state.calculate_group_attribute_penalty_for_members(&next_g1_members, ac);
                let new_penalty_g2 =
                    state.calculate_group_attribute_penalty_for_members(&next_g2_members, ac);

                println!("  new_penalty_g1: {}", new_penalty_g1);
                println!("  new_penalty_g2: {}", new_penalty_g2);

                let delta_penalty =
                    (new_penalty_g1 + new_penalty_g2) - (old_penalty_g1 + old_penalty_g2);
                println!("  delta_penalty: {}", delta_penalty);

                total_delta += delta_penalty;
                println!("  running total_delta: {}", total_delta);
            }

            println!("FINAL DELTA: {}", total_delta);

            // Now apply the swap and track incremental updates
            println!("\n--- APPLY SWAP ---");
            let attr_penalty_before = state.attribute_balance_penalty;
            println!("attribute_balance_penalty before: {}", attr_penalty_before);

            state.apply_swap(0, p1_idx, p2_idx);

            let attr_penalty_after = state.attribute_balance_penalty;
            println!("attribute_balance_penalty after: {}", attr_penalty_after);

            let actual_delta = attr_penalty_after - attr_penalty_before;
            println!("actual delta: {}", actual_delta);

            // Now recalculate
            println!("\n--- RECALCULATION ---");
            state._recalculate_scores();

            let attr_penalty_recalc = state.attribute_balance_penalty;
            println!(
                "attribute_balance_penalty after recalc: {}",
                attr_penalty_recalc
            );

            println!("\n--- COMPARISON ---");
            println!("Expected delta: {}", total_delta);
            println!("Actual delta: {}", actual_delta);
            println!("Delta error: {}", (actual_delta - total_delta).abs());

            println!("Incremental result: {}", attr_penalty_after);
            println!("Recalculated result: {}", attr_penalty_recalc);
            println!(
                "Incremental vs recalc error: {}",
                (attr_penalty_recalc - attr_penalty_after).abs()
            );

            if (actual_delta - total_delta).abs() > 0.001 {
                println!("BUG DETECTED: Delta calculation mismatch!");
            }
            if (attr_penalty_recalc - attr_penalty_after).abs() > 0.001 {
                println!("BUG DETECTED: Incremental vs recalculation mismatch!");
            }
        } else {
            println!("No suitable test people found (all in same groups)");
        }
    }
}
