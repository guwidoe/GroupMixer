use crate::models::{
    ApiInput, BenchmarkObserver, Constraint, LoggingOptions, Objective, ProblemDefinition,
    ProgressCallback, SimulatedAnnealingParams, Solver2Params, Solver3Params,
    SolverConfiguration, SolverKind, SolverParams, SolverResult, StopConditions,
    DEFAULT_SOLVER_KIND,
};
use crate::runtime_target::runtime_target_iteration_cap;
use crate::solver1::search::simulated_annealing::SimulatedAnnealing;
use crate::solver1::search::Solver as _;
use crate::solver1::State;
use crate::solver2::{SearchEngine as Solver2SearchEngine, SOLVER2_BOOTSTRAP_NOTES};
use crate::solver3::{SearchEngine as Solver3SearchEngine, SOLVER3_BOOTSTRAP_NOTES};
use crate::solver_support::SolverError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SolverEngineCapabilities {
    pub supports_initial_schedule: bool,
    pub supports_progress_callback: bool,
    pub supports_benchmark_observer: bool,
    pub supports_recommended_settings: bool,
    pub supports_deterministic_seed: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SolverDescriptor {
    pub kind: SolverKind,
    pub display_name: &'static str,
    pub capabilities: SolverEngineCapabilities,
    pub notes: &'static str,
}

#[derive(Clone, Copy)]
pub struct SolveRequest<'a> {
    pub input: &'a ApiInput,
    pub progress_callback: Option<&'a ProgressCallback>,
    pub benchmark_observer: Option<&'a BenchmarkObserver>,
}

#[derive(Clone, Copy)]
pub struct RecommendationRequest<'a> {
    pub problem: &'a ProblemDefinition,
    pub objectives: &'a [Objective],
    pub constraints: &'a [Constraint],
    pub desired_runtime_seconds: u64,
}

pub trait SolverEngine {
    fn descriptor(&self) -> &'static SolverDescriptor;
    fn solve(&self, request: SolveRequest<'_>) -> Result<SolverResult, SolverError>;
    fn default_configuration(&self) -> SolverConfiguration;
    fn recommend_configuration(
        &self,
        request: RecommendationRequest<'_>,
    ) -> Result<SolverConfiguration, SolverError>;
}

const SOLVER1_DESCRIPTOR: SolverDescriptor = SolverDescriptor {
    kind: SolverKind::Solver1,
    display_name: "Solver 1",
    capabilities: SolverEngineCapabilities {
        supports_initial_schedule: true,
        supports_progress_callback: true,
        supports_benchmark_observer: true,
        supports_recommended_settings: true,
        supports_deterministic_seed: true,
    },
    notes: "Current production Rust solver family backed by the `solver1` State + simulated annealing search implementation.",
};

const SOLVER2_DESCRIPTOR: SolverDescriptor = SolverDescriptor {
    kind: SolverKind::Solver2,
    display_name: "Solver 2",
    capabilities: SolverEngineCapabilities {
        supports_initial_schedule: true,
        supports_progress_callback: true,
        supports_benchmark_observer: true,
        supports_recommended_settings: false,
        supports_deterministic_seed: true,
    },
    notes: SOLVER2_BOOTSTRAP_NOTES,
};

const SOLVER3_DESCRIPTOR: SolverDescriptor = SolverDescriptor {
    kind: SolverKind::Solver3,
    display_name: "Solver 3",
    capabilities: SolverEngineCapabilities {
        supports_initial_schedule: true,
        supports_progress_callback: true,
        supports_benchmark_observer: true,
        supports_recommended_settings: true,
        supports_deterministic_seed: true,
    },
    notes: SOLVER3_BOOTSTRAP_NOTES,
};

const SOLVER_DESCRIPTORS: [SolverDescriptor; 3] =
    [SOLVER1_DESCRIPTOR, SOLVER2_DESCRIPTOR, SOLVER3_DESCRIPTOR];

struct Solver1Engine;
struct Solver2Engine;
struct Solver3Engine;

impl SolverEngine for Solver1Engine {
    fn descriptor(&self) -> &'static SolverDescriptor {
        &SOLVER1_DESCRIPTOR
    }

    fn solve(&self, request: SolveRequest<'_>) -> Result<SolverResult, SolverError> {
        let mut state = State::new(request.input)?;
        let solver = SimulatedAnnealing::new(&request.input.solver);
        solver.solve(
            &mut state,
            request.progress_callback,
            request.benchmark_observer,
        )
    }

    fn default_configuration(&self) -> SolverConfiguration {
        SolverConfiguration {
            // Keep the current public-facing legacy string until the contract layer migration.
            solver_type: "SimulatedAnnealing".into(),
            stop_conditions: StopConditions {
                max_iterations: Some(10_000),
                time_limit_seconds: Some(30),
                no_improvement_iterations: None,
            },
            solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams {
                initial_temperature: 1.0,
                final_temperature: 0.01,
                cooling_schedule: "geometric".into(),
                reheat_cycles: Some(0),
                reheat_after_no_improvement: Some(0),
            }),
            logging: LoggingOptions {
                log_frequency: Some(1000),
                log_initial_state: true,
                log_duration_and_score: true,
                display_final_schedule: true,
                log_initial_score_breakdown: true,
                log_final_score_breakdown: true,
                log_stop_condition: true,
                ..Default::default()
            },
            telemetry: Default::default(),
            seed: None,
            move_policy: None,
            allowed_sessions: None,
        }
    }

    fn recommend_configuration(
        &self,
        request: RecommendationRequest<'_>,
    ) -> Result<SolverConfiguration, SolverError> {
        Ok(runtime_target_configuration(
            self.default_configuration(),
            request.desired_runtime_seconds,
        ))
    }
}

impl SolverEngine for Solver2Engine {
    fn descriptor(&self) -> &'static SolverDescriptor {
        &SOLVER2_DESCRIPTOR
    }

    fn solve(&self, request: SolveRequest<'_>) -> Result<SolverResult, SolverError> {
        let mut state = crate::solver2::SolutionState::from_input(request.input)?;
        let solver = Solver2SearchEngine::new(&request.input.solver);
        solver.solve(
            &mut state,
            request.progress_callback,
            request.benchmark_observer,
        )
    }

    fn default_configuration(&self) -> SolverConfiguration {
        SolverConfiguration {
            solver_type: SolverKind::Solver2.canonical_id().into(),
            stop_conditions: StopConditions {
                max_iterations: Some(10_000),
                time_limit_seconds: Some(30),
                no_improvement_iterations: Some(5_000),
            },
            solver_params: SolverParams::Solver2(Solver2Params::default()),
            logging: LoggingOptions::default(),
            telemetry: Default::default(),
            seed: None,
            move_policy: None,
            allowed_sessions: None,
        }
    }

    fn recommend_configuration(
        &self,
        _request: RecommendationRequest<'_>,
    ) -> Result<SolverConfiguration, SolverError> {
        Err(crate::solver2::not_yet_implemented(
            "runtime-aware recommendation for solver2",
        ))
    }
}

impl SolverEngine for Solver3Engine {
    fn descriptor(&self) -> &'static SolverDescriptor {
        &SOLVER3_DESCRIPTOR
    }

    fn solve(&self, request: SolveRequest<'_>) -> Result<SolverResult, SolverError> {
        let mut state = crate::solver3::RuntimeState::from_input(request.input)?;
        let solver = Solver3SearchEngine::new(&request.input.solver);
        solver.solve(
            &mut state,
            request.progress_callback,
            request.benchmark_observer,
        )
    }

    fn default_configuration(&self) -> SolverConfiguration {
        SolverConfiguration {
            solver_type: SolverKind::Solver3.canonical_id().into(),
            stop_conditions: StopConditions {
                max_iterations: Some(10_000),
                time_limit_seconds: Some(30),
                no_improvement_iterations: Some(5_000),
            },
            solver_params: SolverParams::Solver3(Solver3Params::default()),
            logging: LoggingOptions::default(),
            telemetry: Default::default(),
            seed: None,
            move_policy: None,
            allowed_sessions: None,
        }
    }

    fn recommend_configuration(
        &self,
        request: RecommendationRequest<'_>,
    ) -> Result<SolverConfiguration, SolverError> {
        Ok(runtime_target_configuration(
            self.default_configuration(),
            request.desired_runtime_seconds,
        ))
    }
}

pub fn default_solver_kind() -> SolverKind {
    DEFAULT_SOLVER_KIND
}

pub fn available_solver_descriptors() -> &'static [SolverDescriptor] {
    &SOLVER_DESCRIPTORS
}

pub fn solver_descriptor(kind: SolverKind) -> &'static SolverDescriptor {
    match kind {
        SolverKind::Solver1 => &SOLVER1_DESCRIPTOR,
        SolverKind::Solver2 => &SOLVER2_DESCRIPTOR,
        SolverKind::Solver3 => &SOLVER3_DESCRIPTOR,
    }
}

pub fn run_solver_with_engine(request: SolveRequest<'_>) -> Result<SolverResult, SolverError> {
    let kind = request
        .input
        .solver
        .validate_solver_selection()
        .map_err(SolverError::ValidationError)?;
    create_solver_engine(kind).solve(request)
}

pub fn default_solver_configuration_for(kind: SolverKind) -> SolverConfiguration {
    create_solver_engine(kind).default_configuration()
}

pub fn calculate_recommended_settings_for(
    kind: SolverKind,
    request: RecommendationRequest<'_>,
) -> Result<SolverConfiguration, SolverError> {
    create_solver_engine(kind).recommend_configuration(request)
}

fn create_solver_engine(kind: SolverKind) -> Box<dyn SolverEngine> {
    match kind {
        SolverKind::Solver1 => Box::new(Solver1Engine),
        SolverKind::Solver2 => Box::new(Solver2Engine),
        SolverKind::Solver3 => Box::new(Solver3Engine),
    }
}

fn runtime_target_configuration(
    mut configuration: SolverConfiguration,
    desired_runtime_seconds: u64,
) -> SolverConfiguration {
    let desired_runtime_seconds = desired_runtime_seconds.max(1);
    configuration.stop_conditions.max_iterations =
        Some(runtime_target_iteration_cap(desired_runtime_seconds));
    configuration.stop_conditions.time_limit_seconds = Some(desired_runtime_seconds);
    configuration.stop_conditions.no_improvement_iterations = None;
    configuration
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Group, Person, ProblemDefinition, SolverKind, SolverParams};
    use std::collections::HashMap;

    fn simple_problem() -> ProblemDefinition {
        ProblemDefinition {
            people: vec![
                Person {
                    id: "p0".to_string(),
                    attributes: HashMap::new(),
                    sessions: None,
                },
                Person {
                    id: "p1".to_string(),
                    attributes: HashMap::new(),
                    sessions: None,
                },
            ],
            groups: vec![Group {
                id: "g0".to_string(),
                size: 2,
                session_sizes: None,
            }],
            num_sessions: 1,
        }
    }

    #[test]
    fn registry_exposes_default_solver_descriptor() {
        let descriptor = solver_descriptor(default_solver_kind());
        assert_eq!(descriptor.kind, SolverKind::Solver1);
        assert!(descriptor.capabilities.supports_recommended_settings);
    }

    #[test]
    fn registry_exposes_solver2_descriptor_with_runnable_capabilities() {
        let descriptor = solver_descriptor(SolverKind::Solver2);
        assert_eq!(descriptor.kind, SolverKind::Solver2);
        assert!(descriptor.capabilities.supports_initial_schedule);
        assert!(descriptor.capabilities.supports_progress_callback);
        assert!(descriptor.capabilities.supports_benchmark_observer);
        assert!(!descriptor.capabilities.supports_recommended_settings);
        assert!(descriptor.capabilities.supports_deterministic_seed);
        assert!(descriptor.notes.contains("solver2"));
    }

    #[test]
    fn default_configuration_round_trips_through_typed_solver_selection() {
        let config = default_solver_configuration_for(SolverKind::Solver1);
        assert_eq!(
            config.validate_solver_selection().unwrap(),
            SolverKind::Solver1
        );

        let solver2 = default_solver_configuration_for(SolverKind::Solver2);
        assert_eq!(
            solver2.validate_solver_selection().unwrap(),
            SolverKind::Solver2
        );
        assert!(matches!(solver2.solver_params, SolverParams::Solver2(_)));
    }

    #[test]
    fn recommendation_routes_through_engine_registry() {
        let config = calculate_recommended_settings_for(
            SolverKind::Solver1,
            RecommendationRequest {
                problem: &simple_problem(),
                objectives: &[],
                constraints: &[],
                desired_runtime_seconds: 1,
            },
        )
        .unwrap();

        assert_eq!(
            config.validate_solver_selection().unwrap(),
            SolverKind::Solver1
        );
        assert!(matches!(
            config.solver_params,
            SolverParams::SimulatedAnnealing(_)
        ));
        assert_eq!(config.stop_conditions.time_limit_seconds, Some(1));
        assert_eq!(config.stop_conditions.no_improvement_iterations, None);
        assert!(config.stop_conditions.max_iterations.unwrap_or_default() >= 1_000_000);
    }

    #[test]
    fn solver2_recommendation_fails_explicitly_until_implemented() {
        let error = calculate_recommended_settings_for(
            SolverKind::Solver2,
            RecommendationRequest {
                problem: &simple_problem(),
                objectives: &[],
                constraints: &[],
                desired_runtime_seconds: 1,
            },
        )
        .unwrap_err();

        assert!(error.to_string().contains("solver2"));
        assert!(error.to_string().contains("not implemented"));
    }

    #[test]
    fn solver2_run_executes_through_engine_registry() {
        let input = ApiInput {
            initial_schedule: None,
            construction_seed_schedule: None,
            problem: simple_problem(),
            objectives: vec![],
            constraints: vec![],
            solver: default_solver_configuration_for(SolverKind::Solver2),
        };

        let result = run_solver_with_engine(SolveRequest {
            input: &input,
            progress_callback: None,
            benchmark_observer: None,
        })
        .unwrap();

        assert_eq!(
            result.stop_reason,
            Some(crate::models::StopReason::NoImprovementLimitReached)
        );
        assert_eq!(
            result.move_policy,
            Some(crate::models::MovePolicy::default())
        );
        assert!(result.effective_seed.is_some());
    }

    #[test]
    fn engine_run_rejects_mismatched_solver_selection() {
        let mut config = default_solver_configuration_for(SolverKind::Solver1);
        config.solver_type = "unknown_solver".to_string();
        let input = ApiInput {
            initial_schedule: None,
            construction_seed_schedule: None,
            problem: simple_problem(),
            objectives: vec![],
            constraints: vec![],
            solver: config,
        };

        let error = run_solver_with_engine(SolveRequest {
            input: &input,
            progress_callback: None,
            benchmark_observer: None,
        })
        .unwrap_err();

        assert!(error.to_string().contains("Unknown solver type"));
    }

    #[test]
    fn registry_exposes_solver3_descriptor_with_runnable_capabilities() {
        let descriptor = solver_descriptor(SolverKind::Solver3);
        assert_eq!(descriptor.kind, SolverKind::Solver3);
        assert!(descriptor.capabilities.supports_initial_schedule);
        assert!(descriptor.capabilities.supports_progress_callback);
        assert!(descriptor.capabilities.supports_benchmark_observer);
        assert!(descriptor.capabilities.supports_recommended_settings);
        assert!(descriptor.capabilities.supports_deterministic_seed);
        assert!(descriptor.notes.contains("Solver 3"));
        assert!(descriptor.notes.contains("recommended runtime mode"));
        assert!(descriptor.notes.contains("correctness checks"));
    }

    #[test]
    fn solver3_default_configuration_round_trips_through_typed_solver_selection() {
        let config = default_solver_configuration_for(SolverKind::Solver3);
        assert_eq!(
            config.validate_solver_selection().unwrap(),
            SolverKind::Solver3
        );
        assert!(matches!(config.solver_params, SolverParams::Solver3(_)));
    }

    #[test]
    fn solver3_recommendation_returns_runtime_targeted_configuration() {
        let config = calculate_recommended_settings_for(
            SolverKind::Solver3,
            RecommendationRequest {
                problem: &simple_problem(),
                objectives: &[],
                constraints: &[],
                desired_runtime_seconds: 4,
            },
        )
        .unwrap();

        assert_eq!(
            config.validate_solver_selection().unwrap(),
            SolverKind::Solver3
        );
        assert_eq!(config.stop_conditions.time_limit_seconds, Some(4));
        assert_eq!(config.stop_conditions.no_improvement_iterations, None);
        assert!(config.stop_conditions.max_iterations.unwrap_or_default() >= 4_000_000);
        assert!(matches!(config.solver_params, SolverParams::Solver3(_)));
    }

    #[test]
    fn solver3_run_executes_through_engine_registry() {
        let input = ApiInput {
            initial_schedule: None,
            construction_seed_schedule: None,
            problem: simple_problem(),
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".to_string(),
                weight: 1.0,
            }],
            constraints: vec![],
            solver: default_solver_configuration_for(SolverKind::Solver3),
        };

        let result = run_solver_with_engine(SolveRequest {
            input: &input,
            progress_callback: None,
            benchmark_observer: None,
        })
        .expect("solver3 should execute through the engine registry");

        assert!(result.stop_reason.is_some());
        assert_eq!(result.effective_seed.is_some(), true);
    }

    #[test]
    fn available_solver_descriptors_includes_solver3() {
        let descriptors = available_solver_descriptors();
        assert!(
            descriptors.iter().any(|d| d.kind == SolverKind::Solver3),
            "solver3 should appear in available_solver_descriptors"
        );
        assert_eq!(descriptors.len(), 3);
    }
}
