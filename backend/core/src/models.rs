//! Data models and types for the gm-core API.
//!
//! This module contains all the public data structures used to define optimization
//! problems, configure the solver, and receive results. The API is designed to be
//! serializable (JSON/YAML) for easy integration with web services and configuration files.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub type ApiSchedule = HashMap<String, HashMap<String, Vec<String>>>;

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
///     construction_seed_schedule: None,
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
    /// Optional incumbent schedule to warm-start the solver.
    ///
    /// This field is for a **complete, already-valid schedule** only. If provided,
    /// the solver validates it as an incumbent and starts from it directly.
    /// The solver does not silently repair or complete this schedule.
    ///
    /// Format: schedule["session_{i}"][group_id] = [person_ids]
    #[serde(default)]
    pub initial_schedule: Option<ApiSchedule>,
    /// Optional construction seed schedule for constructor-driven bootstrapping.
    ///
    /// Unlike `initial_schedule`, this field may be partial or advisory. It is
    /// consumed by the shared construction heuristic, which must complete it into
    /// a full valid schedule or fail explicitly.
    #[serde(default)]
    pub construction_seed_schedule: Option<ApiSchedule>,
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
    /// Compatibility-facing solver identifier accepted at the current public parse boundary.
    ///
    /// Internally, `gm-core` resolves this string into a typed `SolverKind` so solver-family
    /// selection is explicit even while the public contract is still migrating away from the
    /// legacy string-only shape.
    pub solver_type: String,
    /// Conditions that determine when to stop optimization
    pub stop_conditions: StopConditions,
    /// Algorithm-specific parameters.
    ///
    /// This must describe the same solver family as `solver_type`.
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

/// Typed solver-family identifier used internally by `gm-core`.
///
/// The repo is preparing for multiple solver families, but the wider public contract still uses
/// the legacy string field on `SolverConfiguration`. This enum is the explicit internal source of
/// truth used by the engine registry/factory layer.
#[derive(
    Serialize, Deserialize, JsonSchema, Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord,
)]
#[serde(rename_all = "snake_case")]
pub enum SolverKind {
    /// The current production solver family backed by the `solver1` simulated annealing engine.
    Solver1,
    /// Bootstrapped placeholder for the upcoming `solver2` family.
    Solver2,
    /// Bootstrap scaffold for the `solver3` performance-oriented dense-state solver family.
    /// Solve paths are not yet implemented; registration is truthful metadata only.
    Solver3,
}

/// Default solver family used by current public callers.
pub const DEFAULT_SOLVER_KIND: SolverKind = SolverKind::Solver1;

impl SolverKind {
    pub const fn canonical_id(self) -> &'static str {
        match self {
            Self::Solver1 => "solver1",
            Self::Solver2 => "solver2",
            Self::Solver3 => "solver3",
        }
    }

    pub const fn display_name(self) -> &'static str {
        match self {
            Self::Solver1 => "Solver 1",
            Self::Solver2 => "Solver 2",
            Self::Solver3 => "Solver 3",
        }
    }

    pub fn accepted_config_ids(self) -> &'static [&'static str] {
        match self {
            Self::Solver1 => &[
                "solver1",
                "legacy_simulated_annealing",
                "simulated_annealing",
                "SimulatedAnnealing",
            ],
            Self::Solver2 => &["solver2"],
            Self::Solver3 => &["solver3"],
        }
    }

    pub fn parse_config_id(value: &str) -> Result<Self, String> {
        match value {
            "solver1"
            | "legacy_simulated_annealing"
            | "simulated_annealing"
            | "SimulatedAnnealing" => Ok(Self::Solver1),
            "solver2" => Ok(Self::Solver2),
            "solver3" => Ok(Self::Solver3),
            other => Err(format!(
                "Unknown solver type '{other}'. Supported solver IDs: {}",
                [Self::Solver1, Self::Solver2, Self::Solver3]
                    .iter()
                    .map(|kind| kind.canonical_id())
                    .collect::<Vec<_>>()
                    .join(", ")
            )),
        }
    }
}

impl std::fmt::Display for SolverKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.canonical_id())
    }
}

impl SolverConfiguration {
    /// Resolves the compatibility-facing `solver_type` field into the typed internal solver kind.
    pub fn solver_kind(&self) -> Result<SolverKind, String> {
        SolverKind::parse_config_id(&self.solver_type)
    }

    /// Validates that `solver_type` and `solver_params` describe the same solver family.
    pub fn validate_solver_selection(&self) -> Result<SolverKind, String> {
        let declared_kind = self.solver_kind()?;
        let params_kind = self.solver_params.solver_kind();

        if declared_kind != params_kind {
            return Err(format!(
                "solver_type '{}' resolves to '{}', but solver_params describe '{}'",
                self.solver_type,
                declared_kind.canonical_id(),
                params_kind.canonical_id()
            ));
        }

        Ok(declared_kind)
    }

    pub fn simulated_annealing_params(&self) -> Result<&SimulatedAnnealingParams, String> {
        let kind = self.validate_solver_selection()?;
        if kind != SolverKind::Solver1 {
            return Err(format!(
                "solver '{}' does not expose simulated annealing parameters",
                kind.canonical_id()
            ));
        }

        self.solver_params
            .simulated_annealing_params()
            .ok_or_else(|| {
                "solver_params did not contain simulated annealing parameters after validation"
                    .to_string()
            })
    }
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
///     stop_on_optimal_score: true,
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
    /// Stop immediately when the best-known score reaches the theoretical optimum of zero.
    ///
    /// Defaults to `true` for user-facing solve runs. Benchmark lanes can disable this so
    /// fixed-budget measurements continue consuming their configured search budget even when an
    /// optimal state is discovered early.
    #[serde(default = "default_stop_on_optimal_score")]
    pub stop_on_optimal_score: bool,
}

pub const OPTIMAL_SCORE_TOLERANCE: f64 = 1e-9;

pub const fn default_stop_on_optimal_score() -> bool {
    true
}

impl StopConditions {
    pub fn should_stop_for_optimal_score(&self, score: f64) -> bool {
        self.stop_on_optimal_score && score <= OPTIMAL_SCORE_TOLERANCE
    }
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
    /// Parameters for the internal `solver2` family.
    #[serde(rename = "solver2")]
    Solver2(Solver2Params),
    /// Parameters for the internal `solver3` family.
    ///
    /// `solver3` is currently a bootstrap scaffold. This parameter type is intentionally
    /// small until explicit tuning knobs are defined during the implementation epics.
    #[serde(rename = "solver3")]
    Solver3(Solver3Params),
}

impl SolverParams {
    pub fn solver_kind(&self) -> SolverKind {
        match self {
            Self::SimulatedAnnealing(_) => SolverKind::Solver1,
            Self::Solver2(_) => SolverKind::Solver2,
            Self::Solver3(_) => SolverKind::Solver3,
        }
    }

    pub fn simulated_annealing_params(&self) -> Option<&SimulatedAnnealingParams> {
        match self {
            Self::SimulatedAnnealing(params) => Some(params),
            Self::Solver2(_) | Self::Solver3(_) => None,
        }
    }

    pub fn solver3_params(&self) -> Option<&Solver3Params> {
        match self {
            Self::Solver3(params) => Some(params),
            Self::SimulatedAnnealing(_) | Self::Solver2(_) => None,
        }
    }
}

/// Parameters for the internal `solver2` family.
///
/// The dedicated directory and typed registry slot allow the new solver architecture to evolve in
/// parallel. During the current bring-up phase, `solver2` uses a built-in minimal search baseline
/// and this parameter type remains intentionally small until explicit tuning knobs are ready.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, Default)]
pub struct Solver2Params {}

/// Parameters for the internal `solver3` family.
///
/// `solver3` is a bootstrap scaffold targeting dense runtime state and patch-based move
/// kernels. The correctness lane is intentionally opt-in so benchmark and hotpath timing runs
/// keep representative performance by default.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, Default)]
pub struct Solver3Params {
    /// Outer search-driver mode for solver3.
    #[serde(default)]
    pub search_driver: Solver3SearchDriverParams,
    /// Local-improver mode used by the selected driver.
    #[serde(default)]
    pub local_improver: Solver3LocalImproverParams,
    /// Correctness-lane controls for sampled runtime validation during real search runs.
    #[serde(default)]
    pub correctness_lane: Solver3CorrectnessLaneParams,
    /// Experimental hotspot-guidance controls for proposal-generation research.
    #[serde(default)]
    pub hotspot_guidance: Solver3HotspotGuidanceParams,
}

/// Explicit outer-driver selection for `solver3`.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, Copy, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Solver3SearchDriverMode {
    /// Baseline single-state search loop.
    #[default]
    SingleState,
    /// Future steady-state memetic outer loop.
    SteadyStateMemetic,
    /// Rare archive-based donor-session transplant outer loop.
    DonorSessionTransplant,
}

/// Explicit local-improver selection for `solver3`.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, Copy, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Solver3LocalImproverMode {
    /// Baseline record-to-record acceptance loop.
    #[default]
    RecordToRecord,
    /// Future SGP-shaped week-local swapped-pair tabu improver.
    SgpWeekPairTabu,
}

/// Tenure-sampling mode for the `solver3` SGP week-pair tabu improver.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, Copy, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Solver3SgpWeekPairTabuTenureMode {
    /// Sample a tabu tenure directly from the configured bounded interval.
    #[default]
    FixedInterval,
    /// Scale the sampled tenure upward for sessions with more active participants.
    SessionParticipantScaled,
    /// Scale the sampled tenure upward as the no-improvement streak grows.
    ReactiveNoImprovementScaled,
}

/// Driver configuration for `solver3`.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, Default)]
pub struct Solver3SearchDriverParams {
    /// Which outer search driver to run.
    #[serde(default)]
    pub mode: Solver3SearchDriverMode,
    /// Config for the steady-state memetic outer driver.
    #[serde(default)]
    pub steady_state_memetic: Solver3SteadyStateMemeticParams,
    /// Config for the rare donor-session transplant outer driver.
    #[serde(default)]
    pub donor_session_transplant: Solver3DonorSessionTransplantParams,
}

/// Config for the rare donor-session transplant outer driver.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct Solver3DonorSessionTransplantParams {
    /// Maximum number of elites retained in the small archive.
    #[serde(default = "default_solver3_donor_session_archive_size")]
    pub archive_size: u32,
    /// Recombination only becomes eligible after this many non-improving iterations.
    #[serde(default = "default_solver3_donor_session_no_improvement_window")]
    pub recombination_no_improvement_window: u32,
    /// Minimum number of iterations between recombination events.
    #[serde(default = "default_solver3_donor_session_cooldown_window")]
    pub recombination_cooldown_window: u32,
    /// Optional non-binding safety cap on recombination events in a single run.
    ///
    /// `None` means the trigger is governed only by stagnation, cooldown, donor availability,
    /// and child quality rather than by a fixed per-run event ceiling.
    #[serde(default)]
    pub max_recombination_events_per_run: Option<u32>,
    /// Adaptive raw-child quality gate applied before post-transplant polish.
    #[serde(default)]
    pub adaptive_raw_child_retention: Solver3AdaptiveRawChildRetentionParams,
    /// Post-transplant child-polish iteration budget granted per full stagnation window.
    #[serde(default = "default_solver3_donor_session_child_polish_iterations_per_window")]
    pub child_polish_iterations_per_stagnation_window: u32,
    /// Post-transplant child-polish no-improvement budget granted per full stagnation window.
    #[serde(default = "default_solver3_donor_session_child_polish_no_improvement_iterations_per_window")]
    pub child_polish_no_improvement_iterations_per_stagnation_window: u32,
    /// Maximum number of stagnation windows that contribute to a single child-polish budget.
    #[serde(default = "default_solver3_donor_session_child_polish_max_stagnation_windows")]
    pub child_polish_max_stagnation_windows: u32,
}

impl Default for Solver3DonorSessionTransplantParams {
    fn default() -> Self {
        Self {
            archive_size: default_solver3_donor_session_archive_size(),
            recombination_no_improvement_window:
                default_solver3_donor_session_no_improvement_window(),
            recombination_cooldown_window: default_solver3_donor_session_cooldown_window(),
            max_recombination_events_per_run: None,
            adaptive_raw_child_retention: Solver3AdaptiveRawChildRetentionParams::default(),
            child_polish_iterations_per_stagnation_window:
                default_solver3_donor_session_child_polish_iterations_per_window(),
            child_polish_no_improvement_iterations_per_stagnation_window:
                default_solver3_donor_session_child_polish_no_improvement_iterations_per_window(),
            child_polish_max_stagnation_windows:
                default_solver3_donor_session_child_polish_max_stagnation_windows(),
        }
    }
}

/// Adaptive retention policy for raw donor-session transplants before child polish.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct Solver3AdaptiveRawChildRetentionParams {
    /// Fraction of raw transplanted children to retain for polish after warmup.
    #[serde(default = "default_solver3_donor_session_raw_child_keep_ratio")]
    pub keep_ratio: f64,
    /// Number of raw child samples collected before the percentile gate becomes active.
    #[serde(default = "default_solver3_donor_session_raw_child_warmup_samples")]
    pub warmup_samples: u32,
    /// Rolling history length used for percentile-based gating.
    #[serde(default = "default_solver3_donor_session_raw_child_history_limit")]
    pub history_limit: u32,
}

impl Default for Solver3AdaptiveRawChildRetentionParams {
    fn default() -> Self {
        Self {
            keep_ratio: default_solver3_donor_session_raw_child_keep_ratio(),
            warmup_samples: default_solver3_donor_session_raw_child_warmup_samples(),
            history_limit: default_solver3_donor_session_raw_child_history_limit(),
        }
    }
}

/// Config for the steady-state memetic outer driver.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct Solver3SteadyStateMemeticParams {
    /// Small fixed population size maintained by the memetic outer loop.
    #[serde(default = "default_solver3_memetic_population_size")]
    pub population_size: u32,
    /// Tournament size used for parent selection.
    #[serde(default = "default_solver3_memetic_parent_tournament_size")]
    pub parent_tournament_size: u32,
    /// Minimum number of same-session swaps applied during macro mutation.
    #[serde(default = "default_solver3_memetic_mutation_swaps_min")]
    pub mutation_swaps_min: u32,
    /// Maximum number of same-session swaps applied during macro mutation.
    #[serde(default = "default_solver3_memetic_mutation_swaps_max")]
    pub mutation_swaps_max: u32,
    /// Per-child bounded local-polish iteration cap.
    #[serde(default = "default_solver3_memetic_child_polish_max_iterations")]
    pub child_polish_max_iterations: u32,
    /// Per-child early-stop cap after this many non-improving local-improver iterations.
    #[serde(default = "default_solver3_memetic_child_polish_no_improvement_iterations")]
    pub child_polish_no_improvement_iterations: u32,
}

impl Default for Solver3SteadyStateMemeticParams {
    fn default() -> Self {
        Self {
            population_size: default_solver3_memetic_population_size(),
            parent_tournament_size: default_solver3_memetic_parent_tournament_size(),
            mutation_swaps_min: default_solver3_memetic_mutation_swaps_min(),
            mutation_swaps_max: default_solver3_memetic_mutation_swaps_max(),
            child_polish_max_iterations: default_solver3_memetic_child_polish_max_iterations(),
            child_polish_no_improvement_iterations:
                default_solver3_memetic_child_polish_no_improvement_iterations(),
        }
    }
}

/// Local-improver configuration for `solver3`.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, Default)]
pub struct Solver3LocalImproverParams {
    /// Which local improver the selected driver should call.
    #[serde(default)]
    pub mode: Solver3LocalImproverMode,
    /// Config for the SGP-shaped swapped-pair tabu improver.
    #[serde(default)]
    pub sgp_week_pair_tabu: Solver3SgpWeekPairTabuParams,
}

/// Config for the SGP-shaped swapped-pair tabu improver.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct Solver3SgpWeekPairTabuParams {
    /// How tabu tenure should be derived from the configured base interval.
    #[serde(default)]
    pub tenure_mode: Solver3SgpWeekPairTabuTenureMode,
    /// Dynamic tenure lower bound in accepted-move iterations.
    #[serde(default = "default_solver3_sgp_week_pair_tabu_tenure_min")]
    pub tenure_min: u32,
    /// Dynamic tenure upper bound in accepted-move iterations.
    #[serde(default = "default_solver3_sgp_week_pair_tabu_tenure_max")]
    pub tenure_max: u32,
    /// Bounded sampler retry cap for tabooed raw swap proposals.
    #[serde(default = "default_solver3_sgp_week_pair_tabu_retry_cap")]
    pub retry_cap: u32,
    /// Whether tabu aspiration may override a tabooed move after preview.
    #[serde(default = "default_solver3_sgp_week_pair_tabu_aspiration")]
    pub aspiration_enabled: bool,
    /// Reference participant count for `session_participant_scaled` tenure.
    #[serde(default = "default_solver3_sgp_week_pair_tabu_session_scale_reference_participants")]
    pub session_scale_reference_participants: u32,
    /// No-improvement window for `reactive_no_improvement_scaled` tenure.
    #[serde(default = "default_solver3_sgp_week_pair_tabu_reactive_window")]
    pub reactive_no_improvement_window: u32,
    /// Maximum multiplier for `reactive_no_improvement_scaled` tenure.
    #[serde(default = "default_solver3_sgp_week_pair_tabu_reactive_max_multiplier")]
    pub reactive_max_multiplier: u32,
    /// Whether swap sampling should be restricted to repeat-conflict positions when conflicts exist.
    #[serde(default)]
    pub conflict_restricted_swap_sampling_enabled: bool,
}

impl Default for Solver3SgpWeekPairTabuParams {
    fn default() -> Self {
        Self {
            tenure_mode: Solver3SgpWeekPairTabuTenureMode::default(),
            tenure_min: default_solver3_sgp_week_pair_tabu_tenure_min(),
            tenure_max: default_solver3_sgp_week_pair_tabu_tenure_max(),
            retry_cap: default_solver3_sgp_week_pair_tabu_retry_cap(),
            aspiration_enabled: default_solver3_sgp_week_pair_tabu_aspiration(),
            session_scale_reference_participants:
                default_solver3_sgp_week_pair_tabu_session_scale_reference_participants(),
            reactive_no_improvement_window: default_solver3_sgp_week_pair_tabu_reactive_window(),
            reactive_max_multiplier: default_solver3_sgp_week_pair_tabu_reactive_max_multiplier(),
            conflict_restricted_swap_sampling_enabled: false,
        }
    }
}

/// Experimental hotspot-guidance controls for `solver3`.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, Default)]
pub struct Solver3HotspotGuidanceParams {
    /// Repeat-encounter-guided swap proposal controls.
    #[serde(default)]
    pub repeat_guided_swaps: Solver3RepeatGuidedSwapParams,
}

/// Experimental controls for repeat-encounter-guided swap proposal generation.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct Solver3RepeatGuidedSwapParams {
    /// Enables repeat-encounter-guided swap proposals.
    #[serde(default)]
    pub enabled: bool,

    /// Probability that a swap proposal attempt will use the guided path.
    #[serde(default = "default_solver3_repeat_guided_swap_probability")]
    pub guided_proposal_probability: f64,

    /// Maximum number of exact swap previews evaluated for one guided attempt.
    #[serde(default = "default_solver3_repeat_guided_swap_preview_budget")]
    pub candidate_preview_budget: u32,
}

impl Default for Solver3RepeatGuidedSwapParams {
    fn default() -> Self {
        Self {
            enabled: false,
            guided_proposal_probability: default_solver3_repeat_guided_swap_probability(),
            candidate_preview_budget: default_solver3_repeat_guided_swap_preview_budget(),
        }
    }
}

/// Opt-in controls for solver3 correctness-lane sampling.
///
/// This lane is intended for correctness/debug runs and should stay disabled in performance
/// benchmark runs.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct Solver3CorrectnessLaneParams {
    /// Enables periodic sampled correctness checks during solver3 search.
    ///
    /// Note: this requires compiling gm-core with `solver3-oracle-checks`.
    #[serde(default)]
    pub enabled: bool,

    /// Run sampled correctness checks every N accepted moves.
    ///
    /// Values must be >= 1.
    #[serde(default = "default_solver3_correctness_lane_sample_every_accepted_moves")]
    pub sample_every_accepted_moves: u64,
}

impl Default for Solver3CorrectnessLaneParams {
    fn default() -> Self {
        Self {
            enabled: false,
            sample_every_accepted_moves:
                default_solver3_correctness_lane_sample_every_accepted_moves(),
        }
    }
}

fn default_solver3_correctness_lane_sample_every_accepted_moves() -> u64 {
    16
}

fn default_solver3_memetic_population_size() -> u32 {
    6
}

fn default_solver3_memetic_parent_tournament_size() -> u32 {
    2
}

fn default_solver3_memetic_mutation_swaps_min() -> u32 {
    2
}

fn default_solver3_memetic_mutation_swaps_max() -> u32 {
    5
}

fn default_solver3_memetic_child_polish_max_iterations() -> u32 {
    64
}

fn default_solver3_memetic_child_polish_no_improvement_iterations() -> u32 {
    32
}

fn default_solver3_donor_session_archive_size() -> u32 {
    4
}

fn default_solver3_donor_session_no_improvement_window() -> u32 {
    200_000
}

fn default_solver3_donor_session_cooldown_window() -> u32 {
    100_000
}

fn default_solver3_donor_session_raw_child_keep_ratio() -> f64 {
    0.5
}

fn default_solver3_donor_session_raw_child_warmup_samples() -> u32 {
    4
}

fn default_solver3_donor_session_raw_child_history_limit() -> u32 {
    32
}

fn default_solver3_donor_session_child_polish_iterations_per_window() -> u32 {
    100_000
}

fn default_solver3_donor_session_child_polish_no_improvement_iterations_per_window() -> u32 {
    100_000
}

fn default_solver3_donor_session_child_polish_max_stagnation_windows() -> u32 {
    4
}

fn default_solver3_repeat_guided_swap_probability() -> f64 {
    0.5
}

fn default_solver3_repeat_guided_swap_preview_budget() -> u32 {
    8
}

fn default_solver3_sgp_week_pair_tabu_tenure_min() -> u32 {
    8
}

fn default_solver3_sgp_week_pair_tabu_tenure_max() -> u32 {
    32
}

fn default_solver3_sgp_week_pair_tabu_retry_cap() -> u32 {
    16
}

fn default_solver3_sgp_week_pair_tabu_aspiration() -> bool {
    true
}

fn default_solver3_sgp_week_pair_tabu_session_scale_reference_participants() -> u32 {
    32
}

fn default_solver3_sgp_week_pair_tabu_reactive_window() -> u32 {
    100_000
}

fn default_solver3_sgp_week_pair_tabu_reactive_max_multiplier() -> u32 {
    4
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
    /// Total iterations planned for the run, or the current runtime-budget estimate when the solver is pacing to a time target.
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
    OptimalScoreReached,
}

/// Per-move-family benchmark telemetry summary.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, PartialEq, Default)]
pub struct MoveFamilyBenchmarkTelemetry {
    #[serde(default)]
    pub attempts: u64,
    #[serde(default)]
    pub accepted: u64,
    #[serde(default)]
    pub improving_accepts: u64,
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

/// A best-so-far score sample recorded during search.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, PartialEq)]
pub struct BestScoreTimelinePoint {
    pub iteration: u64,
    pub elapsed_seconds: f64,
    pub best_score: f64,
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

/// Benchmark telemetry for repeat-guided swap proposal behavior.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, PartialEq, Default)]
pub struct RepeatGuidedSwapBenchmarkTelemetry {
    #[serde(default)]
    pub guided_attempts: u64,
    #[serde(default)]
    pub guided_successes: u64,
    #[serde(default)]
    pub guided_fallback_to_random: u64,
    #[serde(default)]
    pub guided_previewed_candidates: u64,
}

/// Benchmark telemetry for the steady-state memetic outer driver.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, PartialEq, Default)]
pub struct MemeticBenchmarkTelemetry {
    #[serde(default)]
    pub population_size: u32,
    #[serde(default)]
    pub parent_tournament_size: u32,
    #[serde(default)]
    pub child_polish_local_improver_mode: Option<Solver3LocalImproverMode>,
    #[serde(default)]
    pub child_polish_max_iterations: u64,
    #[serde(default)]
    pub child_polish_no_improvement_iterations: u64,
    #[serde(default)]
    pub offspring_attempted: u64,
    #[serde(default)]
    pub offspring_polished: u64,
    #[serde(default)]
    pub offspring_replaced: u64,
    #[serde(default)]
    pub offspring_discarded: u64,
    #[serde(default)]
    pub mutation_attempted_swaps: u64,
    #[serde(default)]
    pub mutation_applied_swaps: u64,
    #[serde(default)]
    pub mutation_length_sum: u64,
    #[serde(default)]
    pub mutation_length_min: Option<u64>,
    #[serde(default)]
    pub mutation_length_max: Option<u64>,
    #[serde(default)]
    pub child_polish_iterations: u64,
    #[serde(default)]
    pub child_polish_improving_moves: u64,
    #[serde(default)]
    pub child_polish_seconds: f64,
}

/// One donor/session choice made during donor-session recombination.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, Copy, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum DonorCandidatePoolTelemetry {
    #[default]
    CompetitiveHalf,
    FullArchive,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, Copy, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum DonorSessionViabilityTierTelemetry {
    #[default]
    StrictImproving,
    NonWorsening,
    AnyDiffering,
}

/// One donor/session choice made during donor-session recombination.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, PartialEq, Default)]
pub struct DonorSessionChoiceTelemetry {
    #[serde(default)]
    pub donor_archive_idx: u32,
    #[serde(default)]
    pub session_idx: u32,
    #[serde(default)]
    pub session_disagreement_count: u32,
    #[serde(default)]
    pub candidate_pool: DonorCandidatePoolTelemetry,
    #[serde(default)]
    pub session_viability_tier: DonorSessionViabilityTierTelemetry,
    #[serde(default)]
    pub conflict_burden_delta: i64,
    #[serde(default)]
    pub raw_child_delta: f64,
    #[serde(default)]
    pub adaptive_discard_threshold: Option<f64>,
    #[serde(default)]
    pub retained_for_polish: bool,
    #[serde(default)]
    pub stagnation_windows_at_trigger: u64,
    #[serde(default)]
    pub child_polish_budget_iterations: Option<u64>,
    #[serde(default)]
    pub child_polish_budget_no_improvement_iterations: Option<u64>,
}

/// Benchmark telemetry for the donor-session transplant outer driver.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, PartialEq, Default)]
pub struct DonorSessionTransplantBenchmarkTelemetry {
    #[serde(default)]
    pub archive_size: u32,
    #[serde(default)]
    pub child_polish_local_improver_mode: Option<Solver3LocalImproverMode>,
    #[serde(default)]
    pub raw_child_keep_ratio: f64,
    #[serde(default)]
    pub raw_child_warmup_samples: u32,
    #[serde(default)]
    pub raw_child_history_limit: u32,
    #[serde(default)]
    pub child_polish_iterations_per_stagnation_window: u64,
    #[serde(default)]
    pub child_polish_no_improvement_iterations_per_stagnation_window: u64,
    #[serde(default)]
    pub child_polish_max_stagnation_windows: u64,
    #[serde(default)]
    pub archive_additions: u64,
    #[serde(default)]
    pub archive_exact_duplicate_replacements: u64,
    #[serde(default)]
    pub archive_near_duplicate_replacements: u64,
    #[serde(default)]
    pub archive_redundant_evictions: u64,
    #[serde(default)]
    pub archive_rejected_exact_duplicates: u64,
    #[serde(default)]
    pub archive_rejected_near_duplicates: u64,
    #[serde(default)]
    pub archive_rejected_not_competitive: u64,
    #[serde(default)]
    pub trigger_blocked_not_armed: u64,
    #[serde(default)]
    pub trigger_blocked_event_cap: u64,
    #[serde(default)]
    pub trigger_armed_no_viable_donor: u64,
    #[serde(default)]
    pub trigger_armed_no_viable_session: u64,
    #[serde(default)]
    pub recombination_events_fired: u64,
    #[serde(default)]
    pub raw_children_evaluated: u64,
    #[serde(default)]
    pub raw_child_delta_sum: f64,
    #[serde(default)]
    pub raw_child_delta_min: Option<f64>,
    #[serde(default)]
    pub raw_child_delta_max: Option<f64>,
    #[serde(default)]
    pub adaptive_discard_threshold: Option<f64>,
    #[serde(default)]
    pub donor_choices: Vec<DonorSessionChoiceTelemetry>,
    #[serde(default)]
    pub immediate_discards: u64,
    #[serde(default)]
    pub polished_children: u64,
    #[serde(default)]
    pub polished_children_kept: u64,
    #[serde(default)]
    pub polished_children_discarded: u64,
    #[serde(default)]
    pub child_polish_budget_iterations_sum: u64,
    #[serde(default)]
    pub child_polish_budget_no_improvement_iterations_sum: u64,
    #[serde(default)]
    pub child_polish_iterations: u64,
    #[serde(default)]
    pub child_polish_improving_moves: u64,
    #[serde(default)]
    pub child_polish_seconds: f64,
}

/// Benchmark telemetry for the SGP week-pair tabu local improver.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, PartialEq, Default)]
pub struct SgpWeekPairTabuBenchmarkTelemetry {
    #[serde(default)]
    pub raw_tabu_hits: u64,
    #[serde(default)]
    pub prefilter_skips: u64,
    #[serde(default)]
    pub retry_exhaustions: u64,
    #[serde(default)]
    pub hard_blocks: u64,
    #[serde(default)]
    pub aspiration_preview_surfaces: u64,
    #[serde(default)]
    pub aspiration_overrides: u64,
    #[serde(default)]
    pub recorded_swaps: u64,
    #[serde(default)]
    pub realized_tenure_sum: u64,
    #[serde(default)]
    pub realized_tenure_min: Option<u64>,
    #[serde(default)]
    pub realized_tenure_max: Option<u64>,
}

/// End-of-run benchmark telemetry intended for regression / benchmark artifacts.
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, PartialEq)]
pub struct SolverBenchmarkTelemetry {
    pub effective_seed: u64,
    pub move_policy: MovePolicy,
    pub stop_reason: StopReason,
    pub iterations_completed: u64,
    pub no_improvement_count: u64,
    #[serde(default)]
    pub max_no_improvement_streak: u64,
    pub reheats_performed: u64,
    #[serde(default)]
    pub accepted_uphill_moves: u64,
    #[serde(default)]
    pub accepted_downhill_moves: u64,
    #[serde(default)]
    pub accepted_neutral_moves: u64,
    #[serde(default)]
    pub restart_count: Option<u64>,
    #[serde(default)]
    pub perturbation_count: Option<u64>,
    pub initial_score: f64,
    pub best_score: f64,
    pub final_score: f64,
    pub initialization_seconds: f64,
    pub search_seconds: f64,
    pub finalization_seconds: f64,
    pub total_seconds: f64,
    #[serde(default)]
    pub iterations_per_second: f64,
    #[serde(default)]
    pub best_score_timeline: Vec<BestScoreTimelinePoint>,
    #[serde(default)]
    pub repeat_guided_swaps: RepeatGuidedSwapBenchmarkTelemetry,
    #[serde(default)]
    pub sgp_week_pair_tabu: Option<SgpWeekPairTabuBenchmarkTelemetry>,
    #[serde(default)]
    pub memetic: Option<MemeticBenchmarkTelemetry>,
    #[serde(default)]
    pub donor_session_transplant: Option<DonorSessionTransplantBenchmarkTelemetry>,
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
/// #     construction_seed_schedule: None,
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
    /// #     construction_seed_schedule: None,
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
