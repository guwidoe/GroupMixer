//! Core solver state management and optimization logic.
//!
//! This module contains the `State` struct which represents the internal solver state
//! with efficient integer-based representations for fast optimization. It handles
//! constraint preprocessing, cost calculation, move evaluation, and schedule manipulation.
//!
//! The `State` is designed for performance, converting string-based API inputs into
//! integer indices for fast array operations during optimization.

mod construction;
mod display;
mod dsu;
mod moves;
mod scoring;
#[cfg(test)]
mod tests;
mod validation;

use crate::models::{
    AttributeBalanceParams, LoggingOptions, PairMeetingMode, SolverResult, TelemetryOptions,
};
use dsu::Dsu;
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
