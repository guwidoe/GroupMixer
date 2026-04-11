use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub type InitialScheduleContract =
    std::collections::HashMap<String, std::collections::HashMap<String, Vec<String>>>;

/// Stable identifier for a public operation exposed by solver-facing surfaces.
pub type OperationId = &'static str;

/// Stable identifier for a public schema exposed by solver-facing surfaces.
pub type SchemaId = &'static str;

/// Stable identifier for a public example exposed by solver-facing surfaces.
pub type ExampleId = &'static str;

/// Stable identifier for a public error code exposed by solver-facing surfaces.
pub type ErrorCode = &'static str;

/// Stable typed solver-family identifier exposed through public contract surfaces.
pub type SolverKindContract = gm_core::models::SolverKind;

/// Public scenario-definition shape shared across solver-facing contract surfaces.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ScenarioDefinitionContract {
    /// List of all people to be scheduled into groups.
    pub people: Vec<gm_core::models::Person>,
    /// List of all available groups with their capacity limits.
    pub groups: Vec<gm_core::models::Group>,
    /// Total number of scheduling sessions.
    pub num_sessions: u32,
}

/// The canonical solve request uses explicit public DTOs with `scenario`
/// terminology at the contract boundary.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SolveRequest {
    /// The scenario definition: people, groups, and sessions.
    pub scenario: ScenarioDefinitionContract,
    /// Optional incumbent schedule to warm-start the solver.
    #[serde(default)]
    pub initial_schedule: Option<InitialScheduleContract>,
    /// Optional construction seed schedule for constructor-driven bootstrapping.
    #[serde(default)]
    pub construction_seed_schedule: Option<InitialScheduleContract>,
    /// Optimization objectives (defaults to empty list if not specified)
    #[serde(default)]
    pub objectives: Vec<gm_core::models::Objective>,
    /// Constraints that must be satisfied or penalized (defaults to empty list)
    #[serde(default)]
    pub constraints: Vec<gm_core::models::Constraint>,
    /// Solver algorithm configuration and parameters
    pub solver: SolverConfigurationContract,
}

/// The canonical solve response currently reuses `gm-core`'s public result model.
pub type SolveResponse = gm_core::models::SolverResult;

/// Validation currently accepts the same request shape as a solve operation.
pub type ValidateRequest = SolveRequest;

/// Public solver-configuration shape currently reuses the core solver config model.
pub type SolverConfigurationContract = gm_core::models::SolverConfiguration;

/// Public progress-update shape currently reuses the core progress telemetry model.
pub type ProgressUpdateContract = gm_core::models::ProgressUpdate;

/// Public capability surface for one solver family.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct SolverCapabilityDescriptor {
    pub supports_initial_schedule: bool,
    pub supports_progress_callback: bool,
    pub supports_benchmark_observer: bool,
    pub supports_recommended_settings: bool,
    pub supports_deterministic_seed: bool,
}

/// Public metadata for one available solver family.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct SolverDescriptorContract {
    pub kind: SolverKindContract,
    pub canonical_id: String,
    pub display_name: String,
    #[serde(default)]
    pub accepted_config_ids: Vec<String>,
    pub capabilities: SolverCapabilityDescriptor,
    pub notes: String,
}

/// Canonical list response for available solver families.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct SolverCatalogResponse {
    pub solvers: Vec<SolverDescriptorContract>,
}

impl From<gm_core::engines::SolverEngineCapabilities> for SolverCapabilityDescriptor {
    fn from(value: gm_core::engines::SolverEngineCapabilities) -> Self {
        Self {
            supports_initial_schedule: value.supports_initial_schedule,
            supports_progress_callback: value.supports_progress_callback,
            supports_benchmark_observer: value.supports_benchmark_observer,
            supports_recommended_settings: value.supports_recommended_settings,
            supports_deterministic_seed: value.supports_deterministic_seed,
        }
    }
}

impl From<&gm_core::engines::SolverDescriptor> for SolverDescriptorContract {
    fn from(value: &gm_core::engines::SolverDescriptor) -> Self {
        Self {
            kind: value.kind,
            canonical_id: value.kind.canonical_id().to_string(),
            display_name: value.display_name.to_string(),
            accepted_config_ids: value
                .kind
                .accepted_config_ids()
                .iter()
                .map(|id| (*id).to_string())
                .collect(),
            capabilities: value.capabilities.into(),
            notes: value.notes.to_string(),
        }
    }
}

/// Canonical request shape for runtime-aware solver setting recommendations.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct RecommendSettingsRequest {
    /// The scenario definition to analyze for runtime-aware recommendation.
    pub scenario: ScenarioDefinitionContract,
    /// Optional solver configuration whose selected family should receive the runtime-targeted recommendation.
    #[serde(default)]
    pub solver: Option<SolverConfigurationContract>,
    #[serde(default)]
    pub objectives: Vec<gm_core::models::Objective>,
    #[serde(default)]
    pub constraints: Vec<gm_core::models::Constraint>,
    pub desired_runtime_seconds: u64,
}

/// High-level operation category for transport-neutral help/rendering.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum OperationKind {
    Read,
    Write,
    Compute,
    Inspect,
}

/// High-level public error category for transport-neutral projections.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCategory {
    InvalidInput,
    Unsupported,
    Conflict,
    Infeasible,
    Permission,
    Internal,
}

/// A lightweight validation issue shape suitable for transport-neutral reporting.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ValidationIssue {
    pub code: Option<String>,
    pub message: String,
    #[serde(default)]
    pub path: Option<String>,
}

/// Canonical transport-neutral validation response shape.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ValidateResponse {
    pub valid: bool,
    #[serde(default)]
    pub issues: Vec<ValidationIssue>,
}

/// Lightweight inspect/result metadata for discovery surfaces that need a stable
/// summary without the full schedule payload.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct ResultSummary {
    pub final_score: f64,
    pub unique_contacts: i32,
    pub repetition_penalty: i32,
    pub attribute_balance_penalty: i32,
    pub constraint_penalty: i32,
    #[serde(default)]
    pub effective_seed: Option<u64>,
    #[serde(default)]
    pub stop_reason: Option<String>,
}

/// Canonical public error instance shape shared across CLI, HTTP, and WASM projections.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct PublicError {
    pub code: String,
    pub message: String,
    #[serde(default)]
    pub where_path: Option<String>,
    #[serde(default)]
    pub why: Option<String>,
    #[serde(default)]
    pub valid_alternatives: Vec<String>,
    #[serde(default)]
    pub recovery: Option<String>,
    #[serde(default)]
    pub related_help: Vec<String>,
}

/// Envelope for public transport-level error responses.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct PublicErrorEnvelope {
    pub error: PublicError,
}

impl From<SolveRequest> for gm_core::models::ApiInput {
    fn from(value: SolveRequest) -> Self {
        Self {
            problem: value.scenario.into(),
            initial_schedule: value.initial_schedule,
            construction_seed_schedule: value.construction_seed_schedule,
            objectives: value.objectives,
            constraints: value.constraints,
            solver: value.solver,
        }
    }
}

impl From<&SolveRequest> for gm_core::models::ApiInput {
    fn from(value: &SolveRequest) -> Self {
        Self {
            problem: value.scenario.clone().into(),
            initial_schedule: value.initial_schedule.clone(),
            construction_seed_schedule: value.construction_seed_schedule.clone(),
            objectives: value.objectives.clone(),
            constraints: value.constraints.clone(),
            solver: value.solver.clone(),
        }
    }
}

impl From<gm_core::models::ApiInput> for SolveRequest {
    fn from(value: gm_core::models::ApiInput) -> Self {
        Self {
            scenario: value.problem.into(),
            initial_schedule: value.initial_schedule,
            construction_seed_schedule: value.construction_seed_schedule,
            objectives: value.objectives,
            constraints: value.constraints,
            solver: value.solver,
        }
    }
}

impl From<&gm_core::models::ApiInput> for SolveRequest {
    fn from(value: &gm_core::models::ApiInput) -> Self {
        Self {
            scenario: value.problem.clone().into(),
            initial_schedule: value.initial_schedule.clone(),
            construction_seed_schedule: value.construction_seed_schedule.clone(),
            objectives: value.objectives.clone(),
            constraints: value.constraints.clone(),
            solver: value.solver.clone(),
        }
    }
}

impl From<ScenarioDefinitionContract> for gm_core::models::ProblemDefinition {
    fn from(value: ScenarioDefinitionContract) -> Self {
        Self {
            people: value.people,
            groups: value.groups,
            num_sessions: value.num_sessions,
        }
    }
}

impl From<&ScenarioDefinitionContract> for gm_core::models::ProblemDefinition {
    fn from(value: &ScenarioDefinitionContract) -> Self {
        Self {
            people: value.people.clone(),
            groups: value.groups.clone(),
            num_sessions: value.num_sessions,
        }
    }
}

impl From<gm_core::models::ProblemDefinition> for ScenarioDefinitionContract {
    fn from(value: gm_core::models::ProblemDefinition) -> Self {
        Self {
            people: value.people,
            groups: value.groups,
            num_sessions: value.num_sessions,
        }
    }
}

impl From<&gm_core::models::ProblemDefinition> for ScenarioDefinitionContract {
    fn from(value: &gm_core::models::ProblemDefinition) -> Self {
        Self {
            people: value.people.clone(),
            groups: value.groups.clone(),
            num_sessions: value.num_sessions,
        }
    }
}

impl From<&SolveResponse> for ResultSummary {
    fn from(value: &SolveResponse) -> Self {
        Self {
            final_score: value.final_score,
            unique_contacts: value.unique_contacts,
            repetition_penalty: value.repetition_penalty,
            attribute_balance_penalty: value.attribute_balance_penalty,
            constraint_penalty: value.constraint_penalty,
            effective_seed: value.effective_seed,
            stop_reason: value.stop_reason.map(|reason| format!("{reason:?}")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{ResultSummary, ScenarioDefinitionContract, SolveRequest};
    use gm_core::models::{
        ApiInput, Group, Objective, Person, ProblemDefinition, SimulatedAnnealingParams,
        SolverConfiguration, SolverParams, SolverResult, StopConditions, StopReason,
    };
    use std::collections::HashMap;

    fn sample_problem_definition() -> ProblemDefinition {
        ProblemDefinition {
            people: vec![
                Person {
                    id: "p1".to_string(),
                    attributes: HashMap::from([("team".to_string(), "A".to_string())]),
                    sessions: None,
                },
                Person {
                    id: "p2".to_string(),
                    attributes: HashMap::from([("team".to_string(), "B".to_string())]),
                    sessions: Some(vec![0]),
                },
            ],
            groups: vec![
                Group {
                    id: "g1".to_string(),
                    size: 2,
                    session_sizes: None,
                },
                Group {
                    id: "g2".to_string(),
                    size: 2,
                    session_sizes: Some(vec![2, 2]),
                },
            ],
            num_sessions: 2,
        }
    }

    fn sample_solver_configuration() -> SolverConfiguration {
        SolverConfiguration {
            solver_type: "SimulatedAnnealing".to_string(),
            stop_conditions: StopConditions {
                max_iterations: Some(100),
                time_limit_seconds: Some(5),
                no_improvement_iterations: Some(25),
            },
            solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams {
                initial_temperature: 1.0,
                final_temperature: 0.01,
                cooling_schedule: "geometric".to_string(),
                reheat_after_no_improvement: Some(0),
                reheat_cycles: Some(0),
            }),
            logging: Default::default(),
            telemetry: Default::default(),
            seed: Some(7),
            move_policy: None,
            allowed_sessions: Some(vec![0, 1]),
        }
    }

    fn sample_api_input() -> ApiInput {
        ApiInput {
            problem: sample_problem_definition(),
            initial_schedule: Some(HashMap::from([(
                "session_0".to_string(),
                HashMap::from([("g1".to_string(), vec!["p1".to_string(), "p2".to_string()])]),
            )])),
            construction_seed_schedule: None,
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".to_string(),
                weight: 1.0,
            }],
            constraints: vec![],
            solver: sample_solver_configuration(),
        }
    }

    #[test]
    fn solve_request_round_trips_api_input_by_reference() {
        let api_input = sample_api_input();

        let request = SolveRequest::from(&api_input);
        let round_tripped = ApiInput::from(&request);

        assert_eq!(request.scenario.num_sessions, 2);
        assert_eq!(request.objectives.len(), 1);
        assert_eq!(
            round_tripped.problem.num_sessions,
            api_input.problem.num_sessions
        );
        assert_eq!(round_tripped.initial_schedule, api_input.initial_schedule);
        assert_eq!(round_tripped.objectives.len(), api_input.objectives.len());
        assert_eq!(
            round_tripped.objectives[0].r#type,
            api_input.objectives[0].r#type
        );
        assert_eq!(
            round_tripped.objectives[0].weight,
            api_input.objectives[0].weight
        );
        assert_eq!(round_tripped.solver.seed, api_input.solver.seed);
    }

    #[test]
    fn scenario_definition_contract_round_trips_problem_definition_by_reference() {
        let problem = sample_problem_definition();

        let contract = ScenarioDefinitionContract::from(&problem);
        let round_tripped = ProblemDefinition::from(&contract);

        assert_eq!(contract.people.len(), problem.people.len());
        assert_eq!(contract.groups.len(), problem.groups.len());
        assert_eq!(round_tripped.num_sessions, problem.num_sessions);
        assert_eq!(round_tripped.people[1].sessions, problem.people[1].sessions);
        assert_eq!(
            round_tripped.groups[1].session_sizes,
            problem.groups[1].session_sizes
        );
    }

    #[test]
    fn result_summary_preserves_seed_and_stop_reason() {
        let result = SolverResult {
            final_score: 1.5,
            schedule: HashMap::new(),
            unique_contacts: 4,
            repetition_penalty: 1,
            attribute_balance_penalty: 0,
            constraint_penalty: 0,
            no_improvement_count: 12,
            weighted_repetition_penalty: 2.0,
            weighted_constraint_penalty: 0.0,
            effective_seed: Some(123),
            move_policy: None,
            stop_reason: Some(StopReason::TimeLimitReached),
            benchmark_telemetry: None,
        };

        let summary = ResultSummary::from(&result);

        assert_eq!(summary.final_score, 1.5);
        assert_eq!(summary.unique_contacts, 4);
        assert_eq!(summary.effective_seed, Some(123));
        assert_eq!(summary.stop_reason.as_deref(), Some("TimeLimitReached"));
    }
}
