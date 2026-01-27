//! Core solver state management and optimization logic.
//!
//! This module contains the `State` struct which represents the internal solver state
//! with efficient integer-based representations for fast optimization. It handles
//! constraint preprocessing, cost calculation, move evaluation, and schedule manipulation.
//!
//! The `State` is designed for performance, converting string-based API inputs into
//! integer indices for fast array operations during optimization.

mod display;
mod dsu;
mod moves;
mod scoring;
mod validation;
#[cfg(test)]
mod tests;

use crate::models::{
    ApiInput, AttributeBalanceParams, Constraint, LoggingOptions, PairMeetingMode, SolverResult,
    TelemetryOptions,
};
use dsu::Dsu;
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
/// #         telemetry: Default::default(),
/// #         allowed_sessions: None,
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

    /// Optional telemetry controls (used by progress updates / visualizations)
    pub telemetry: TelemetryOptions,

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

        // Keep the legacy unweighted constraint counter consistent with calculate_cost()
        self._update_constraint_penalty_total();

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
    /// #         telemetry: Default::default(),
    /// #         allowed_sessions: None,
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
}

