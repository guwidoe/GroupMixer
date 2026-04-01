//! Data models and types for the gm-core API.
//!
//! This module contains all the public data structures used to define optimization
//! problems, configure the solver, and receive results. The API is designed to be
//! serializable (JSON/YAML) for easy integration with web services and configuration files.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Complete input specification for the optimization solver.
///
/// This is the root structure that contains all information needed to run
/// an optimization: the problem definition (people, groups, sessions),
/// optimization objectives, constraints to satisfy, and solver configuration.
///
/// # Example
///
/// ```no_run
/// use gm_core::models::*;
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
///             }
///         ],
///         groups: vec![
///             Group {
///                 id: "Team1".to_string(),
///                 size: 4,
///                 session_sizes: None,
///             }
///         ],
///         num_sessions: 3,
///     },
///     objectives: vec![
///         Objective {
///             r#type: "maximize_unique_contacts".to_string(),
///             weight: 1.0,
///         }
///     ],
///     constraints: vec![],
///     solver: SolverConfiguration {
///         solver_type: "SimulatedAnnealing".to_string(),
///         stop_conditions: StopConditions {
///             max_iterations: Some(10_000),
///             time_limit_seconds: None,
///             no_improvement_iterations: None,
///         },
///         solver_params: SolverParams::SimulatedAnnealing(
///             SimulatedAnnealingParams {
///                 initial_temperature: 100.0,
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
/// ```
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct ApiInput {
    /// The core problem definition: people, groups, and sessions
    pub problem: ProblemDefinition,
    /// Optional initial schedule to warm-start the solver. If provided, the solver
    /// initializes the internal state from this schedule instead of a random one.
    /// Format: schedule["session_{i}"][group_id] = [person_ids]
    #[serde(default)]
    pub initial_schedule:
        Option<std::collections::HashMap<String, std::collections::HashMap<String, Vec<String>>>>,
    /// Optimization objectives (defaults to empty list if not specified)
    #[serde(default)]
    pub objectives: Vec<Objective>,
    /// Constraints that must be satisfied or penalized (defaults to empty list)
    #[serde(default)]
    pub constraints: Vec<Constraint>,
    /// Solver algorithm configuration and parameters
    pub solver: SolverConfiguration,
}

/// Defines the core optimization problem: people, groups, and sessions.
///
/// This structure specifies the fundamental elements that need to be scheduled:
/// the list of people to be assigned, the groups they can be assigned to,
/// and how many scheduling sessions will occur.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct ProblemDefinition {
    /// List of all people to be scheduled into groups
    pub people: Vec<Person>,
    /// List of all available groups with their capacity limits
    pub groups: Vec<Group>,
    /// Total number of scheduling sessions (time periods)
    pub num_sessions: u32,
}

/// Represents a person who can be scheduled into groups.
///
/// Each person has a unique identifier, optional attributes for constraint
/// handling (e.g., gender, department), and can optionally specify which
/// sessions they will participate in.
///
/// # Example
///
/// ```no_run
/// use gm_core::models::Person;
/// use std::collections::HashMap;
///
/// // Person participating in all sessions
/// let alice = Person {
///     id: "Alice".to_string(),
///     attributes: {
///         let mut attrs = HashMap::new();
///         attrs.insert("gender".to_string(), "female".to_string());
///         attrs.insert("department".to_string(), "engineering".to_string());
///         attrs
///     },
///     sessions: None, // Participates in all sessions
/// };
///
/// // Person with limited participation (late arrival/early departure)
/// let bob = Person {
///     id: "Bob".to_string(),
///     attributes: HashMap::new(),
///     sessions: Some(vec![1, 2]), // Only participates in sessions 1 and 2
/// };
/// ```
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct Person {
    /// Unique identifier for this person (must be unique across all people)
    pub id: String,
    /// Key-value attributes used for constraint evaluation (e.g., "gender" -> "female")
    pub attributes: HashMap<String, String>,
    /// Optional list of session indices this person participates in.
    /// If `None`, the person participates in all sessions.
    /// Session indices are 0-based (first session is 0).
    #[serde(default)]
    pub sessions: Option<Vec<u32>>,
}

/// Represents a group that people can be assigned to.
///
/// Each group has a unique identifier and a capacity that limits how many
/// people can be assigned to it in any single session.
///
/// `size` remains the backwards-compatible default capacity for every session.
/// When `session_sizes` is provided, it overrides that default on a
/// per-session basis while keeping the same logical group ID across sessions.
///
/// # Example
///
/// ```no_run
/// use gm_core::models::Group;
///
/// let team = Group {
///     id: "Development Team".to_string(),
///     size: 6, // Can hold up to 6 people
///     session_sizes: None,
/// };
/// ```
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct Group {
    /// Unique identifier for this group (must be unique across all groups)
    pub id: String,
    /// Maximum number of people that can be assigned to this group in any session
    /// when `session_sizes` is not supplied.
    pub size: u32,
    /// Optional per-session capacities for this group.
    ///
    /// When present, this vector must have exactly `problem.num_sessions`
    /// entries. A value of `0` can be used to model a group that is closed in a
    /// specific session while preserving stable group IDs across the whole
    /// problem.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_sizes: Option<Vec<u32>>,
}

/// Defines an optimization objective with its weight.
///
/// Objectives specify what the solver should optimize for. Multiple objectives
/// can be specified with different weights to create a multi-objective optimization.
///
/// # Supported Objective Types
///
/// - `"maximize_unique_contacts"`: Maximize the number of unique person-to-person interactions
///
/// # Example
///
/// ```no_run
/// use gm_core::models::Objective;
///
/// let objective = Objective {
///     r#type: "maximize_unique_contacts".to_string(),
///     weight: 1.0,
/// };
/// ```
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct Objective {
    /// The type of objective to optimize for
    pub r#type: String, // "maximize_unique_contacts"
    /// Weight of this objective in the overall optimization function
    pub weight: f64,
}

/// Represents a constraint that must be satisfied or penalized during optimization.
///
/// Constraints define rules that the scheduler should follow. They can be either
/// hard constraints (with very high penalty weights) or soft constraints (with
/// lower penalty weights that represent preferences).
///
/// All constraints support optional session-specific application, meaning they
/// can be applied to all sessions or only to specific sessions.
///
/// # Constraint Types
///
/// - **RepeatEncounter**: Limits how often people can be paired together
/// - **AttributeBalance**: Maintains desired attribute distributions within groups
/// - **ImmovablePerson**: Fixes specific people to specific groups in specific sessions
/// - **MustStayTogether**: Keeps certain people in the same group
/// - **ShouldStayTogether**: Prefers certain people to be in the same group (soft)
/// - **ShouldNotBeTogether**: Prevents certain people from being in the same group
///
/// # Examples
///
/// ```no_run
/// use gm_core::models::*;
/// use std::collections::HashMap;
///
/// // Limit repeat encounters
/// let repeat_constraint = Constraint::RepeatEncounter(RepeatEncounterParams {
///     max_allowed_encounters: 1,
///     penalty_function: "squared".to_string(),
///     penalty_weight: 100.0,
/// });
///
/// // Maintain gender balance in a specific group
/// let balance_constraint = Constraint::AttributeBalance(AttributeBalanceParams {
///     group_id: "Team1".to_string(),
///     attribute_key: "gender".to_string(),
///     desired_values: {
///         let mut values = HashMap::new();
///         values.insert("male".to_string(), 2);
///         values.insert("female".to_string(), 2);
///         values
///     },
///     penalty_weight: 50.0,
///     sessions: None,
///     mode: AttributeBalanceMode::Exact,
/// });
///
/// // Keep two people together (only in sessions 0 and 1)
/// let together_constraint = Constraint::MustStayTogether {
///     people: vec!["Alice".to_string(), "Bob".to_string()],
///     sessions: Some(vec![0, 1]),
/// };
///
/// // Prevent two people from being together
/// let apart_constraint = Constraint::ShouldNotBeTogether {
///     people: vec!["Charlie".to_string(), "Diana".to_string()],
///     penalty_weight: 500.0,
///     sessions: None, // Applies to all sessions
/// };
/// ```
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
#[serde(tag = "type")]
pub enum Constraint {
    /// Limits how often people can encounter each other across sessions
    RepeatEncounter(RepeatEncounterParams),
    /// Maintains desired attribute distributions within specific groups
    AttributeBalance(AttributeBalanceParams),
    /// Fixes specific people to specific groups in specific sessions
    ImmovablePerson(ImmovablePersonParams),
    /// Keeps specified people in the same group
    MustStayTogether {
        /// List of person IDs that must stay together
        people: Vec<String>,
        /// Optional list of session indices where this constraint applies.
        /// If `None`, applies to all sessions.
        #[serde(default)]
        sessions: Option<Vec<u32>>,
    },
    /// Prefers specified people to be in the same group (soft constraint)
    ShouldStayTogether {
        /// List of person IDs that should be together
        people: Vec<String>,
        /// Penalty weight when the people are not together
        #[serde(default = "default_constraint_weight")]
        penalty_weight: f64,
        /// Optional list of session indices where this constraint applies.
        /// If `None`, applies to all sessions.
        #[serde(default)]
        sessions: Option<Vec<u32>>,
    },
    /// Prevents specified people from being in the same group
    ShouldNotBeTogether {
        /// List of person IDs that should not be together
        people: Vec<String>,
        /// Penalty weight for violations (higher = more important)
        #[serde(default = "default_constraint_weight")]
        penalty_weight: f64,
        /// Optional list of session indices where this constraint applies.
        /// If `None`, applies to all sessions.
        #[serde(default)]
        sessions: Option<Vec<u32>>,
    },
    /// Fixes a *set* of people to a specific group in specific sessions (hard constraint)
    ImmovablePeople(ImmovablePeopleParams),
    /// Constrains a pair's meeting count across a fixed subset of sessions
    PairMeetingCount(PairMeetingCountParams),
}

/// Default penalty weight for constraints that don't specify one
fn default_constraint_weight() -> f64 {
    1000.0
}

/// Modes for how to penalize deviations from the target meeting count.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, Copy, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum PairMeetingMode {
    /// Penalize only shortfalls: weight * max(0, target - actual)
    #[default]
    AtLeast,
    /// Penalize absolute deviation: weight * |target - actual|
    Exact,
    /// Penalize only excess: weight * max(0, actual - target)
    AtMost,
}

/// Soft constraint on how often a pair should meet within a subset of sessions.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct PairMeetingCountParams {
    /// Exactly two person IDs involved in the constraint
    pub people: Vec<String>,
    /// Sessions to consider for counting meetings (must be within problem.sessions)
    pub sessions: Vec<u32>,
    /// Target number of meetings within the provided sessions (0..=sessions.len())
    #[serde(alias = "min_meetings")]
    pub target_meetings: u32,
    /// Penalty mode: at_least (default), exact, or at_most
    #[serde(default)]
    pub mode: PairMeetingMode,
    /// Linear penalty weight
    #[serde(default = "default_constraint_weight")]
    pub penalty_weight: f64,
}

/// Parameters for the RepeatEncounter constraint.
///
/// This constraint limits how often people can be paired together across sessions,
/// promoting social diversity by ensuring people meet new individuals rather than
/// always being grouped with the same people.
///
/// # Example
///
/// ```no_run
/// use gm_core::models::RepeatEncounterParams;
///
/// // Allow at most 1 encounter, with squared penalty for violations
/// let params = RepeatEncounterParams {
///     max_allowed_encounters: 1,
///     penalty_function: "squared".to_string(),
///     penalty_weight: 100.0,
/// };
/// ```
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct RepeatEncounterParams {
    /// Maximum number of times two people can be in the same group
    pub max_allowed_encounters: u32,
    /// Penalty function type: "squared" for quadratic penalties, "linear" for linear penalties
    pub penalty_function: String, // "squared" or "linear"
    /// Weight of the penalty applied for constraint violations
    pub penalty_weight: f64,
}

/// Parameters for the AttributeBalance constraint.
///
/// This constraint maintains desired distributions of person attributes within
/// specific groups. For example, it can ensure gender balance or department
/// representation within teams.
///
/// # Example
///
/// ```no_run
/// use gm_core::models::AttributeBalanceParams;
/// use gm_core::models::AttributeBalanceMode;
/// use std::collections::HashMap;
///
/// // Maintain 2 males and 2 females in "Team1"
/// let params = AttributeBalanceParams {
///     group_id: "Team1".to_string(),
///     attribute_key: "gender".to_string(),
///     desired_values: {
///         let mut values = HashMap::new();
///         values.insert("male".to_string(), 2);
///         values.insert("female".to_string(), 2);
///         values
///     },
///     penalty_weight: 50.0,
///     sessions: None,
///     mode: AttributeBalanceMode::Exact,
/// };
/// ```
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct AttributeBalanceParams {
    /// ID of the group where this balance constraint applies
    pub group_id: String,
    /// The attribute key to balance (e.g., "gender", "department")
    pub attribute_key: String,
    /// Desired count for each attribute value (e.g., {"male": 2, "female": 2})
    pub desired_values: HashMap<String, u32>,
    /// Weight of the penalty applied for balance violations
    pub penalty_weight: f64,
    /// How to interpret desired counts. `Exact` penalizes deviation in either direction,
    /// `AtLeast` penalizes only shortfalls (overshoot is not penalized).
    #[serde(default)]
    pub mode: AttributeBalanceMode,
    /// Optional list of session indices in which this constraint is active. If `None`, the constraint applies to all sessions.
    #[serde(default)]
    pub sessions: Option<Vec<u32>>,
}

/// Mode for evaluating attribute balance targets.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, Copy, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum AttributeBalanceMode {
    /// Penalize absolute deviation from the desired count (current behavior)
    #[default]
    Exact,
    /// Penalize only when actual < desired; overshooting is allowed without penalty
    AtLeast,
}

/// Parameters for the ImmovablePerson constraint.
///
/// This constraint fixes specific people to specific groups in specific sessions,
/// ensuring they cannot be moved during optimization. Useful for people with
/// special roles or requirements.
///
/// # Example
///
/// ```no_run
/// use gm_core::models::ImmovablePersonParams;
///
/// // Fix "TeamLeader" to "Team1" for specific sessions
/// let params = ImmovablePersonParams {
///     person_id: "TeamLeader".to_string(),
///     group_id: "Team1".to_string(),
///     sessions: Some(vec![0, 1, 2]), // Sessions 0, 1, and 2
/// };
/// ```
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct ImmovablePersonParams {
    /// ID of the person who must be fixed in place
    pub person_id: String,
    /// ID of the group where this person must be placed
    pub group_id: String,
    /// List of session indices where this person must be in the specified group.
    /// If `None`, applies to all sessions.
    #[serde(default)]
    pub sessions: Option<Vec<u32>>,
}

/// Fixes multiple people to a specific group in specific sessions (hard constraint).
///
/// This is the multi-person analogue of `ImmovablePersonParams` and is now the
/// preferred format. The solver treats these as hard constraints; therefore no
/// penalty weight is necessary.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct ImmovablePeopleParams {
    /// IDs of the people who must be fixed in place
    pub people: Vec<String>,
    /// ID of the group where these people must be placed
    pub group_id: String,
    /// List of session indices where these people must be in the specified group.
    /// If `None`, applies to all sessions.
    #[serde(default)]
    pub sessions: Option<Vec<u32>>,
}

/// Complete configuration for the optimization solver.
///
/// This structure specifies which algorithm to use, when to stop optimization,
/// algorithm-specific parameters, and logging preferences.
///
/// # Example
///
/// ```no_run
/// use gm_core::models::*;
///
/// let config = SolverConfiguration {
///     solver_type: "SimulatedAnnealing".to_string(),
///     stop_conditions: StopConditions {
///         max_iterations: Some(50_000),
///         time_limit_seconds: Some(60),
///         no_improvement_iterations: Some(5_000),
///     },
///     solver_params: SolverParams::SimulatedAnnealing(
///         SimulatedAnnealingParams {
///             initial_temperature: 100.0,
///             final_temperature: 0.1,
///             cooling_schedule: "geometric".to_string(),
///             reheat_after_no_improvement: Some(0),
///             reheat_cycles: Some(0),
///         }
///     ),
///     logging: LoggingOptions {
///         log_frequency: Some(1000),
///         display_final_schedule: true,
///         log_final_score_breakdown: true,
///         ..Default::default()
///     },
///     telemetry: Default::default(),
///     seed: None,
///     move_policy: None,
///     allowed_sessions: None,
/// };
/// ```
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct SolverConfiguration {
    /// Type of solver algorithm to use (currently "SimulatedAnnealing")
    pub solver_type: String,
    /// Conditions that determine when to stop optimization
    pub stop_conditions: StopConditions,
    /// Algorithm-specific parameters
    pub solver_params: SolverParams,
    /// Logging and output preferences (defaults to minimal logging)
    #[serde(default)]
    pub logging: LoggingOptions,
    /// Telemetry options controlling what is emitted via progress updates.
    ///
    /// Defaults to disabled to avoid any performance overhead unless explicitly requested.
    #[serde(default)]
    pub telemetry: TelemetryOptions,
    /// Optional seed used to make solver runs reproducible.
    ///
    /// When omitted, the solver derives a fresh random seed for the run and reports the
    /// effective seed in solver results / benchmark telemetry.
    #[serde(default)]
    pub seed: Option<u64>,
    /// Optional move-policy override controlling which move families may run and how they are selected.
    ///
    /// When omitted, the solver preserves the current adaptive mixed-search behavior.
    #[serde(default)]
    pub move_policy: Option<MovePolicy>,
    /// Optional allow-list of session indices that the solver is allowed to modify during iterations.
    /// If present, the solver will only generate moves within these sessions, leaving others unchanged.
    /// Session indices are 0-based.
    #[serde(default)]
    pub allowed_sessions: Option<Vec<u32>>,
}

/// Explicit move families supported by the simulated annealing search loop.
#[derive(
    Serialize, Deserialize, JsonSchema, Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord,
)]
#[serde(rename_all = "snake_case")]
pub enum MoveFamily {
    Swap,
    Transfer,
    CliqueSwap,
}

impl MoveFamily {
    pub const ALL: [Self; 3] = [Self::Swap, Self::Transfer, Self::CliqueSwap];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Swap => "swap",
            Self::Transfer => "transfer",
            Self::CliqueSwap => "clique_swap",
        }
    }
}

/// Selection mode for mixed move-family search.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, Copy, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum MoveSelectionMode {
    /// Preserve the current solver behavior, where transfer / clique swap probabilities
    /// are derived from the current state.
    #[default]
    Adaptive,
    /// Use caller-provided explicit weights instead of the adaptive heuristics.
    Weighted,
}

/// Explicit weights for each move family when `MoveSelectionMode::Weighted` is used.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, PartialEq)]
pub struct MoveFamilyWeights {
    pub swap: f64,
    pub transfer: f64,
    pub clique_swap: f64,
}

impl Default for MoveFamilyWeights {
    fn default() -> Self {
        Self {
            swap: 1.0,
            transfer: 1.0,
            clique_swap: 1.0,
        }
    }
}

/// Controls which move families are allowed in a run and how the solver chooses between them.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, PartialEq, Default)]
pub struct MovePolicy {
    /// Selection mode for mixed-family runs.
    #[serde(default)]
    pub mode: MoveSelectionMode,
    /// Optional allow-list of move families for this run.
    ///
    /// When omitted, all move families are allowed.
    #[serde(default)]
    pub allowed_families: Option<Vec<MoveFamily>>,
    /// Optional single-family override used for path tests and diagnostics.
    ///
    /// When present, the search loop will only attempt the specified move family.
    #[serde(default)]
    pub forced_family: Option<MoveFamily>,
    /// Optional explicit family weights used when `mode` is `weighted`.
    #[serde(default)]
    pub weights: Option<MoveFamilyWeights>,
}

impl MovePolicy {
    pub fn normalized(&self) -> Result<Self, String> {
        let mut normalized = self.clone();

        if let Some(allowed) = normalized.allowed_families.as_mut() {
            if allowed.is_empty() {
                return Err("move_policy.allowed_families cannot be empty".to_string());
            }

            allowed.sort_unstable();
            allowed.dedup();
        }

        if let Some(forced_family) = normalized.forced_family {
            if let Some(allowed) = &normalized.allowed_families {
                if !allowed.contains(&forced_family) {
                    return Err(format!(
                        "move_policy.forced_family '{}' is not present in move_policy.allowed_families",
                        forced_family.as_str()
                    ));
                }
            }

            if normalized.weights.is_some() {
                return Err(
                    "move_policy.weights cannot be combined with move_policy.forced_family"
                        .to_string(),
                );
            }
        }

        match normalized.mode {
            MoveSelectionMode::Adaptive => {
                if normalized.weights.is_some() {
                    return Err(
                        "move_policy.weights requires move_policy.mode = 'weighted'".to_string()
                    );
                }
            }
            MoveSelectionMode::Weighted => {
                let weights = normalized.weights.as_ref().ok_or_else(|| {
                    "move_policy.mode = 'weighted' requires move_policy.weights".to_string()
                })?;

                let families = normalized.allowed_families();
                let total_weight = families
                    .iter()
                    .map(|family| weights.weight_for(*family))
                    .sum::<f64>();

                for (family, weight) in [
                    (MoveFamily::Swap, weights.swap),
                    (MoveFamily::Transfer, weights.transfer),
                    (MoveFamily::CliqueSwap, weights.clique_swap),
                ] {
                    if weight < 0.0 {
                        return Err(format!(
                            "move_policy weight for '{}' cannot be negative",
                            family.as_str()
                        ));
                    }
                }

                if total_weight <= 0.0 {
                    return Err(
                        "move_policy.weights must leave positive total weight across allowed families"
                            .to_string(),
                    );
                }
            }
        }

        Ok(normalized)
    }

    pub fn allowed_families(&self) -> Vec<MoveFamily> {
        self.allowed_families
            .clone()
            .unwrap_or_else(|| MoveFamily::ALL.to_vec())
    }
}

impl MoveFamilyWeights {
    pub fn weight_for(&self, family: MoveFamily) -> f64 {
        match family {
            MoveFamily::Swap => self.swap,
            MoveFamily::Transfer => self.transfer,
            MoveFamily::CliqueSwap => self.clique_swap,
        }
    }
}

/// Controls optional telemetry emitted during solver execution.
///
/// This is intentionally separate from `LoggingOptions` so that progress/visualization features
/// can be enabled independently of stdout logging.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct TelemetryOptions {
    /// When true, include a `best_schedule` snapshot in some progress updates.
    ///
    /// This can be expensive for large problems (it clones and serializes schedules), so it is
    /// disabled by default.
    #[serde(default)]
    pub emit_best_schedule: bool,

    /// Include a schedule snapshot every N progress callbacks (when enabled).
    ///
    /// Values <= 1 mean \"every callback\".
    #[serde(default)]
    pub best_schedule_every_n_callbacks: u64,
}

impl Default for TelemetryOptions {
    fn default() -> Self {
        Self {
            emit_best_schedule: false,
            // A safe default in case someone enables telemetry without tuning.
            // (Progress callbacks are time-based; snapshots can be large.)
            best_schedule_every_n_callbacks: 5,
        }
    }
}

/// Defines when the optimization process should stop.
///
/// Multiple stop conditions can be specified, and the solver will stop when
/// the first condition is met. This allows for flexible control over optimization
/// duration vs. quality trade-offs.
///
/// # Example
///
/// ```no_run
/// use gm_core::models::StopConditions;
///
/// // Stop after 10,000 iterations OR 30 seconds OR 1,000 iterations without improvement
/// let conditions = StopConditions {
///     max_iterations: Some(10_000),
///     time_limit_seconds: Some(30),
///     no_improvement_iterations: Some(1_000),
/// };
/// ```
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct StopConditions {
    /// Maximum number of optimization iterations before stopping
    pub max_iterations: Option<u64>,
    /// Maximum time in seconds before stopping
    pub time_limit_seconds: Option<u64>,
    /// Stop if no improvement found for this many iterations
    pub no_improvement_iterations: Option<u64>,
}

/// Algorithm-specific parameters for different solver types.
///
/// This enum allows different algorithms to have their own parameter structures
/// while maintaining a unified API.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
#[serde(tag = "solver_type")]
pub enum SolverParams {
    /// Parameters for the Simulated Annealing algorithm
    SimulatedAnnealing(SimulatedAnnealingParams),
}

/// Parameters specific to the Simulated Annealing algorithm.
///
/// Simulated Annealing uses a temperature-based approach where the algorithm
/// starts with high randomness (high temperature) and gradually becomes more
/// selective (lower temperature) as it progresses.
///
/// # Example
///
/// ```no_run
/// use gm_core::models::SimulatedAnnealingParams;
///
/// // Standard configuration with geometric cooling
/// let params = SimulatedAnnealingParams {
///     initial_temperature: 100.0,   // Start with high exploration
///     final_temperature: 0.1,       // End with focused local search
///     cooling_schedule: "geometric".to_string(), // Exponential temperature decay
///     reheat_after_no_improvement: Some(0), // Reheat after 1000 iterations without improvement (0 = no reheat)
///     reheat_cycles: Some(0), // Reheat after 1000 iterations without improvement (0 = no reheat)
/// };
/// ```
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct SimulatedAnnealingParams {
    /// Starting temperature (higher values allow more random moves initially)
    pub initial_temperature: f64,
    /// Ending temperature (lower values focus on local improvements)
    pub final_temperature: f64,
    /// Temperature reduction schedule: "geometric" for exponential decay, "linear" for linear decay
    pub cooling_schedule: String, // "geometric", "linear", etc
    /// Fixed reheat cycles: split the total iterations into this many cycles.
    /// For each cycle, temperature cools from `initial_temperature` down to `final_temperature`,
    /// then reheats to `initial_temperature` at the cycle boundary.
    ///
    /// Semantics:
    /// - `Some(0)` or `None`: disabled (use default behavior)
    /// - `Some(N>0)`: enable cycle-based reheating with N cycles across `max_iterations`
    #[serde(default)]
    pub reheat_cycles: Option<u64>,
    /// Optional reheat threshold: number of iterations without improvement before reheating.
    /// When reached, temperature is reset to initial_temperature and the cooling schedule is recalculated
    /// for the remaining iterations.
    ///
    /// Semantics:
    /// - `Some(0)`: disable reheating explicitly
    /// - `Some(N>0)`: reheat after N iterations without improvement
    /// - `None` (unspecified): default to the smaller of `max_iterations/10` or `no_improvement_iterations/2` (if set)
    #[serde(default)]
    pub reheat_after_no_improvement: Option<u64>,
}

/// Configuration options for logging and output during optimization.
///
/// These options control what information is displayed during and after
/// the optimization process. Useful for debugging, monitoring progress,
/// and understanding the solver's behavior.
///
/// # Example
///
/// ```no_run
/// use gm_core::models::LoggingOptions;
///
/// // Comprehensive logging for debugging
/// let logging = LoggingOptions {
///     log_frequency: Some(1000),           // Log every 1000 iterations
///     log_initial_state: true,             // Show starting configuration
///     log_duration_and_score: true,        // Show final timing and score
///     display_final_schedule: true,        // Show the final schedule
///     log_initial_score_breakdown: true,   // Detailed initial scoring
///     log_final_score_breakdown: true,     // Detailed final scoring
///     log_stop_condition: true,            // Show why optimization stopped
///     debug_validate_invariants: true,     // Validate invariants after each move
///     debug_dump_invariant_context: true,  // Include detailed context in invariant violation errors
/// };
///
/// // Minimal logging for production
/// let minimal_logging = LoggingOptions {
///     display_final_schedule: true,
///     log_final_score_breakdown: true,
///     ..Default::default()
/// };
/// ```
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, Default)]
pub struct LoggingOptions {
    /// How often to log progress (every N iterations). `None` disables progress logging.
    #[serde(default)]
    pub log_frequency: Option<u64>,
    /// Whether to log the initial state and configuration
    #[serde(default)]
    pub log_initial_state: bool,
    /// Whether to log the total optimization time and final score
    #[serde(default)]
    pub log_duration_and_score: bool,
    /// Whether to display the final schedule in a human-readable format
    #[serde(default)]
    pub display_final_schedule: bool,
    /// Whether to log a detailed breakdown of the initial score
    #[serde(default)]
    pub log_initial_score_breakdown: bool,
    /// Whether to log a detailed breakdown of the final score
    #[serde(default)]
    pub log_final_score_breakdown: bool,
    /// Whether to log the reason why optimization stopped
    #[serde(default)]
    pub log_stop_condition: bool,

    /// When enabled, the solver performs invariant checks after each applied move.
    /// This is expensive and intended only for debugging.
    #[serde(default)]
    pub debug_validate_invariants: bool,

    /// When enabled alongside `debug_validate_invariants`, the solver will include
    /// detailed context (attempted move description and before/after schedules)
    /// in any invariant violation error.
    #[serde(default)]
    pub debug_dump_invariant_context: bool,
}

/// Progress update sent during solver execution.
///
/// Contains comprehensive metrics about the current state of optimization,
/// including detailed move statistics, acceptance rates, and performance metrics.
/// This information is valuable for algorithm tuning and providing rich user feedback.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct ProgressUpdate {
    // === Basic Progress Information ===
    /// Current iteration number (0-based)
    pub iteration: u64,
    /// Total number of iterations planned
    pub max_iterations: u64,
    /// Current temperature (for simulated annealing)
    pub temperature: f64,
    /// Current solution cost/score
    pub current_score: f64,
    /// Best solution cost/score found so far
    pub best_score: f64,
    /// Number of unique contacts in current solution
    pub current_contacts: i32,
    /// Number of unique contacts in best solution
    pub best_contacts: i32,
    /// Current repetition penalty
    pub repetition_penalty: i32,
    /// Time elapsed since solver started (in seconds)
    pub elapsed_seconds: f64,
    /// Number of iterations without improvement
    pub no_improvement_count: u64,

    // === Move Type Statistics ===
    /// Number of clique swap moves attempted
    pub clique_swaps_tried: u64,
    /// Number of clique swap moves accepted
    pub clique_swaps_accepted: u64,
    /// Number of clique swap moves rejected
    pub clique_swaps_rejected: u64,
    /// Number of single person transfer moves attempted
    pub transfers_tried: u64,
    /// Number of single person transfer moves accepted
    pub transfers_accepted: u64,
    /// Number of single person transfer moves rejected
    pub transfers_rejected: u64,
    /// Number of regular person swap moves attempted
    pub swaps_tried: u64,
    /// Number of regular person swap moves accepted
    pub swaps_accepted: u64,
    /// Number of regular person swap moves rejected
    pub swaps_rejected: u64,

    // === Acceptance and Quality Metrics ===
    /// Overall acceptance rate (accepted moves / total moves)
    pub overall_acceptance_rate: f64,
    /// Recent acceptance rate (last 100 moves)
    pub recent_acceptance_rate: f64,
    /// Average score change for attempted moves
    pub avg_attempted_move_delta: f64,
    /// Average score change for accepted moves
    pub avg_accepted_move_delta: f64,
    /// Biggest score increase that was accepted
    pub biggest_accepted_increase: f64,
    /// Biggest score increase that was attempted
    pub biggest_attempted_increase: f64,

    // === Current State Breakdown ===
    /// Current repetition penalty (weighted)
    pub current_repetition_penalty: f64,
    /// Current attribute balance penalty
    pub current_balance_penalty: f64,
    /// Current constraint penalty (weighted)
    pub current_constraint_penalty: f64,
    /// Best repetition penalty achieved so far
    pub best_repetition_penalty: f64,
    /// Best attribute balance penalty achieved so far
    pub best_balance_penalty: f64,
    /// Best constraint penalty achieved so far
    pub best_constraint_penalty: f64,

    // === Algorithm State Information ===
    /// Number of reheats performed so far
    pub reheats_performed: u64,
    /// Iterations since last reheat
    pub iterations_since_last_reheat: u64,
    /// Number of local optima escapes (accepted worse moves)
    pub local_optima_escapes: u64,
    /// Average time per iteration in milliseconds
    pub avg_time_per_iteration_ms: f64,
    /// Progress through cooling schedule (0.0 to 1.0)
    pub cooling_progress: f64,

    // === Move Type Success Rates ===
    /// Success rate for clique swap moves (accepted/tried)
    pub clique_swap_success_rate: f64,
    /// Success rate for transfer moves (accepted/tried)
    pub transfer_success_rate: f64,
    /// Success rate for swap moves (accepted/tried)
    pub swap_success_rate: f64,

    // === Advanced Analytics ===
    /// Score variance over recent window (indicates exploration level)
    pub score_variance: f64,
    /// Search efficiency (improvement per unit time)
    pub search_efficiency: f64,

    // === Optional snapshot of the current best schedule ===
    /// Best-known schedule at the time of the update (if included)
    #[serde(default)]
    pub best_schedule:
        Option<std::collections::HashMap<String, std::collections::HashMap<String, Vec<String>>>>,
    /// Effective seed used for the current run.
    #[serde(default)]
    pub effective_seed: Option<u64>,
    /// Effective move policy used for the current run.
    #[serde(default)]
    pub move_policy: Option<MovePolicy>,
    /// Explicit stop reason. Present on final progress updates and absent on intermediate updates.
    #[serde(default)]
    pub stop_reason: Option<StopReason>,
}

/// Callback function type for receiving progress updates during solver execution.
///
/// The solver will call this function periodically during optimization to report
/// progress. The callback should return `true` to continue solving or `false`
/// to request early termination.
///
/// Callback function type for receiving progress updates during solver execution.
///
/// The solver will call this function periodically during optimization to report
/// progress. The callback should return `true` to continue solving or `false`
/// to request early termination.
pub type ProgressCallback = Box<dyn Fn(&ProgressUpdate) -> bool + Send>;

/// Explicit reason why a solver run stopped.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StopReason {
    MaxIterationsReached,
    TimeLimitReached,
    NoImprovementLimitReached,
    ProgressCallbackRequestedStop,
}

/// Per-move-family benchmark telemetry summary.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, PartialEq, Default)]
pub struct MoveFamilyBenchmarkTelemetry {
    #[serde(default)]
    pub attempts: u64,
    #[serde(default)]
    pub accepted: u64,
    #[serde(default)]
    pub rejected: u64,
    #[serde(default)]
    pub preview_seconds: f64,
    #[serde(default)]
    pub apply_seconds: f64,
    #[serde(default)]
    pub full_recalculation_count: u64,
    #[serde(default)]
    pub full_recalculation_seconds: f64,
}

/// Benchmark telemetry grouped by move family.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, PartialEq, Default)]
pub struct MoveFamilyBenchmarkTelemetrySummary {
    #[serde(default)]
    pub swap: MoveFamilyBenchmarkTelemetry,
    #[serde(default)]
    pub transfer: MoveFamilyBenchmarkTelemetry,
    #[serde(default)]
    pub clique_swap: MoveFamilyBenchmarkTelemetry,
}

/// End-of-run benchmark telemetry intended for regression / benchmark artifacts.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, PartialEq)]
pub struct SolverBenchmarkTelemetry {
    pub effective_seed: u64,
    pub move_policy: MovePolicy,
    pub stop_reason: StopReason,
    pub iterations_completed: u64,
    pub no_improvement_count: u64,
    pub reheats_performed: u64,
    pub initial_score: f64,
    pub best_score: f64,
    pub final_score: f64,
    pub initialization_seconds: f64,
    pub search_seconds: f64,
    pub finalization_seconds: f64,
    pub total_seconds: f64,
    pub moves: MoveFamilyBenchmarkTelemetrySummary,
}

/// Benchmark observer lifecycle events.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, PartialEq)]
#[serde(tag = "event", content = "payload", rename_all = "snake_case")]
#[allow(clippy::large_enum_variant)]
pub enum BenchmarkEvent {
    RunStarted(BenchmarkRunStarted),
    RunCompleted(SolverBenchmarkTelemetry),
}

/// Initial benchmark metadata emitted before the search loop starts.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, PartialEq)]
pub struct BenchmarkRunStarted {
    pub effective_seed: u64,
    pub move_policy: MovePolicy,
    pub initial_score: f64,
}

/// Callback for benchmark-oriented observer events.
pub type BenchmarkObserver = Box<dyn Fn(&BenchmarkEvent) + Send>;

/// The result returned by the optimization solver.
///
/// Contains the optimized schedule along with detailed scoring information
/// that shows how well the solution satisfies the objectives and constraints.
/// The schedule format uses nested HashMaps for easy programmatic access.
///
/// # Schedule Format
///
/// The schedule is structured as:
/// ```text
/// schedule["session_0"]["Group1"] = ["Alice", "Bob", "Charlie"]
/// schedule["session_0"]["Group2"] = ["Diana", "Eve", "Frank"]
/// schedule["session_1"]["Group1"] = ["Alice", "Diana", "Grace"]
/// ...
/// ```
///
/// # Example
///
/// ```no_run
/// use gm_core::{run_solver, models::*};
/// use std::collections::HashMap;
///
/// // ... create input configuration ...
/// # let input = ApiInput {
/// #     initial_schedule: None,
/// #     problem: ProblemDefinition { people: vec![], groups: vec![], num_sessions: 1 },
/// #     objectives: vec![], constraints: vec![],
/// #     solver: SolverConfiguration {
/// #         solver_type: "SimulatedAnnealing".to_string(),
/// #         stop_conditions: StopConditions { max_iterations: Some(1000), time_limit_seconds: None, no_improvement_iterations: None },
/// #         solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams { initial_temperature: 10.0, final_temperature: 0.1, cooling_schedule: "geometric".to_string(), reheat_after_no_improvement: Some(0), reheat_cycles: Some(0) }),
/// #         logging: LoggingOptions::default(),
/// #         telemetry: Default::default(),
/// #         seed: None,
/// #         move_policy: None,
/// #         allowed_sessions: None,
/// #     },
/// # };
///
/// match run_solver(&input) {
///     Ok(result) => {
///         println!("Final score: {}", result.final_score);
///         println!("Unique contacts: {}", result.unique_contacts);
///         println!("Repetition penalty: {}", result.repetition_penalty);
///         
///         // Display the schedule
///         println!("Schedule:\n{}", result.display());
///         
///         // Access specific assignments programmatically
///         if let Some(session_0) = result.schedule.get("session_0") {
///             if let Some(group_1) = session_0.get("Group1") {
///                 println!("Group1 in session 0: {:?}", group_1);
///             }
///         }
///     }
///     Err(e) => eprintln!("Error: {:?}", e),
/// }
/// ```
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct SolverResult {
    /// Overall optimization score (higher is better)
    pub final_score: f64,
    /// The optimized schedule: `schedule[session][group] = [people]`
    pub schedule: std::collections::HashMap<String, std::collections::HashMap<String, Vec<String>>>,
    /// Number of unique person-to-person contacts achieved
    pub unique_contacts: i32,
    /// Penalty points for exceeding repeat encounter limits (unweighted for backwards compatibility)
    pub repetition_penalty: i32,
    /// Penalty points for attribute balance violations
    pub attribute_balance_penalty: i32,
    /// Total penalty points for constraint violations (unweighted for backwards compatibility)
    pub constraint_penalty: i32,
    /// Number of iterations without improvement at the end of the run
    pub no_improvement_count: u64,
    /// Weighted repetition penalty (actual penalty value used in cost calculation)
    pub weighted_repetition_penalty: f64,
    /// Weighted constraint penalty (actual penalty value used in cost calculation)
    pub weighted_constraint_penalty: f64,
    /// Effective seed used for this run.
    #[serde(default)]
    pub effective_seed: Option<u64>,
    /// Effective move policy used for this run.
    #[serde(default)]
    pub move_policy: Option<MovePolicy>,
    /// Explicit stop reason for this run.
    #[serde(default)]
    pub stop_reason: Option<StopReason>,
    /// Benchmark-oriented end-of-run telemetry.
    #[serde(default)]
    pub benchmark_telemetry: Option<SolverBenchmarkTelemetry>,
}

impl SolverResult {
    /// Formats the schedule as a human-readable string.
    ///
    /// This method converts the nested HashMap schedule structure into a
    /// nicely formatted string that shows the group assignments for each session.
    /// Sessions and groups are sorted for consistent output.
    ///
    /// # Example Output
    ///
    /// ```text
    /// ========== SESSION_0 ==========
    /// Group1: Alice, Bob, Charlie
    /// Group2: Diana, Eve, Frank
    ///
    /// ========== SESSION_1 ==========
    /// Group1: Alice, Diana, Grace
    /// Group2: Bob, Eve, Henry
    ///
    /// ```
    ///
    /// # Returns
    ///
    /// A formatted string showing all group assignments across all sessions.
    ///
    /// # Example
    ///
    /// ```no_run
    /// use gm_core::{run_solver, models::*};
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
    /// #         telemetry: Default::default(),
    /// #         seed: None,
    /// #         move_policy: None,
    /// #         allowed_sessions: None,
    /// #     },
    /// # };
    ///
    /// match run_solver(&input) {
    ///     Ok(result) => {
    ///         // Print the formatted schedule
    ///         println!("{}", result.display());
    ///     }
    ///     Err(e) => eprintln!("Error: {:?}", e),
    /// }
    /// ```
    pub fn display(&self) -> String {
        let mut output = String::new();

        let mut sorted_sessions: Vec<_> = self.schedule.keys().collect();
        sorted_sessions.sort_by_key(|a| {
            a.split('_')
                .next_back()
                .unwrap_or("0")
                .parse::<usize>()
                .unwrap_or(0)
        });

        for session_key in sorted_sessions {
            output.push_str(&format!(
                "========== {} ==========\n",
                session_key.to_uppercase()
            ));
            if let Some(groups) = self.schedule.get(session_key) {
                let mut sorted_groups: Vec<_> = groups.keys().collect();
                sorted_groups.sort();

                for group_key in sorted_groups {
                    if let Some(people) = groups.get(group_key) {
                        let people_list = people.join(", ");
                        output.push_str(&format!("{group_key}: {people_list}\n"));
                    }
                }
            }
            output.push('\n');
        }
        output
    }
}
