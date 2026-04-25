use crate::models::{
    ApiInput, AutoSolveTelemetry, AutoSolverParams, BenchmarkEvent, BenchmarkObserver, Constraint,
    LoggingOptions, Objective, ProblemDefinition, ProgressCallback, SimulatedAnnealingParams,
    Solver3ConstructionMode, Solver3Params, Solver4Params, Solver5Params, Solver6Params,
    SolverConfiguration, SolverKind, SolverParams, SolverResult, StopConditions,
    DEFAULT_SOLVER_KIND,
};
use crate::runtime_target::runtime_target_iteration_cap;
use crate::solver1::search::simulated_annealing::SimulatedAnnealing;
use crate::solver1::search::Solver as _;
use crate::solver1::State;
use crate::solver3::runtime_state::AutoConstructionPolicy;
use crate::solver3::{SearchEngine as Solver3SearchEngine, SOLVER3_BOOTSTRAP_NOTES};
use crate::solver4::{SearchEngine as Solver4SearchEngine, SOLVER4_NOTES};
use crate::solver5::{SearchEngine as Solver5SearchEngine, SOLVER5_NOTES};
use crate::solver6::{SearchEngine as Solver6SearchEngine, SOLVER6_NOTES};
use crate::solver_support::complexity::evaluate_problem_complexity;
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

const AUTO_DESCRIPTOR: SolverDescriptor = SolverDescriptor {
    kind: SolverKind::Auto,
    display_name: "Auto",
    capabilities: SolverEngineCapabilities {
        supports_initial_schedule: true,
        supports_progress_callback: true,
        supports_benchmark_observer: true,
        supports_recommended_settings: true,
        supports_deterministic_seed: true,
    },
    notes: "Product-default solve policy: always runs solver3 with complexity-derived runtime, bounded constraint-scenario oracle construction, explicit baseline fallback, and runtime-scaled search stopping.",
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

const SOLVER4_DESCRIPTOR: SolverDescriptor = SolverDescriptor {
    kind: SolverKind::Solver4,
    display_name: "Solver 4",
    capabilities: SolverEngineCapabilities {
        supports_initial_schedule: false,
        supports_progress_callback: false,
        supports_benchmark_observer: false,
        supports_recommended_settings: true,
        supports_deterministic_seed: true,
    },
    notes: SOLVER4_NOTES,
};

const SOLVER5_DESCRIPTOR: SolverDescriptor = SolverDescriptor {
    kind: SolverKind::Solver5,
    display_name: "Solver 5",
    capabilities: SolverEngineCapabilities {
        supports_initial_schedule: false,
        supports_progress_callback: false,
        supports_benchmark_observer: false,
        supports_recommended_settings: true,
        supports_deterministic_seed: true,
    },
    notes: SOLVER5_NOTES,
};

const SOLVER6_DESCRIPTOR: SolverDescriptor = SolverDescriptor {
    kind: SolverKind::Solver6,
    display_name: "Solver 6",
    capabilities: SolverEngineCapabilities {
        supports_initial_schedule: false,
        supports_progress_callback: false,
        supports_benchmark_observer: false,
        supports_recommended_settings: true,
        supports_deterministic_seed: true,
    },
    notes: SOLVER6_NOTES,
};

const SOLVER_DESCRIPTORS: [SolverDescriptor; 6] = [
    AUTO_DESCRIPTOR,
    SOLVER1_DESCRIPTOR,
    SOLVER3_DESCRIPTOR,
    SOLVER4_DESCRIPTOR,
    SOLVER5_DESCRIPTOR,
    SOLVER6_DESCRIPTOR,
];

struct AutoEngine;
struct Solver1Engine;
struct Solver3Engine;
struct Solver4Engine;
struct Solver5Engine;
struct Solver6Engine;

impl SolverEngine for AutoEngine {
    fn descriptor(&self) -> &'static SolverDescriptor {
        &AUTO_DESCRIPTOR
    }

    fn solve(&self, request: SolveRequest<'_>) -> Result<SolverResult, SolverError> {
        let plan = AutoSolvePlan::from_input(request.input)?;
        let solver3_input = auto_solver3_input(request.input, &plan);
        let construction = crate::solver3::RuntimeState::from_input_with_auto_construction(
            &solver3_input,
            AutoConstructionPolicy {
                oracle_construction_budget_seconds: plan.oracle_construction_budget_seconds,
                scaffold_budget_seconds: plan.scaffold_budget_seconds,
                oracle_recombination_budget_seconds: plan.oracle_recombination_budget_seconds,
            },
        )?;

        let auto_telemetry = plan.telemetry(&construction);
        let mut state = construction.state;
        let solver = Solver3SearchEngine::new(&solver3_input.solver);
        let mut result = solver.solve_with_time_limit_override(
            &mut state,
            request.progress_callback,
            None,
            Some(plan.search_budget_seconds),
        )?;

        if let Some(telemetry) = result.benchmark_telemetry.as_mut() {
            telemetry.initialization_seconds = construction.constructor_wall_seconds;
            telemetry.total_seconds = telemetry.initialization_seconds
                + telemetry.search_seconds
                + telemetry.finalization_seconds;
            telemetry.auto = Some(auto_telemetry.clone());
        }
        if let (Some(observer), Some(telemetry)) = (
            request.benchmark_observer,
            result.benchmark_telemetry.clone(),
        ) {
            observer(&BenchmarkEvent::RunCompleted(telemetry));
        }
        Ok(result)
    }

    fn default_configuration(&self) -> SolverConfiguration {
        SolverConfiguration {
            solver_type: SolverKind::Auto.canonical_id().into(),
            stop_conditions: StopConditions {
                max_iterations: None,
                time_limit_seconds: None,
                no_improvement_iterations: None,
                stop_on_optimal_score: true,
            },
            solver_params: SolverParams::Auto(AutoSolverParams::default()),
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
        Ok(self.default_configuration())
    }
}

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
                stop_on_optimal_score: true,
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
                stop_on_optimal_score: true,
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

impl SolverEngine for Solver4Engine {
    fn descriptor(&self) -> &'static SolverDescriptor {
        &SOLVER4_DESCRIPTOR
    }

    fn solve(&self, request: SolveRequest<'_>) -> Result<SolverResult, SolverError> {
        let solver = Solver4SearchEngine::new(&request.input.solver);
        solver.solve(request.input)
    }

    fn default_configuration(&self) -> SolverConfiguration {
        SolverConfiguration {
            solver_type: SolverKind::Solver4.canonical_id().into(),
            stop_conditions: StopConditions {
                max_iterations: Some(1_000_000),
                time_limit_seconds: Some(30),
                no_improvement_iterations: None,
                stop_on_optimal_score: true,
            },
            solver_params: SolverParams::Solver4(Solver4Params::default()),
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

impl SolverEngine for Solver5Engine {
    fn descriptor(&self) -> &'static SolverDescriptor {
        &SOLVER5_DESCRIPTOR
    }

    fn solve(&self, request: SolveRequest<'_>) -> Result<SolverResult, SolverError> {
        let solver = Solver5SearchEngine::new(&request.input.solver);
        solver.solve(request.input)
    }

    fn default_configuration(&self) -> SolverConfiguration {
        SolverConfiguration {
            solver_type: SolverKind::Solver5.canonical_id().into(),
            stop_conditions: StopConditions {
                max_iterations: Some(1),
                time_limit_seconds: Some(1),
                no_improvement_iterations: None,
                stop_on_optimal_score: true,
            },
            solver_params: SolverParams::Solver5(Solver5Params::default()),
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
        Ok(self.default_configuration())
    }
}

impl SolverEngine for Solver6Engine {
    fn descriptor(&self) -> &'static SolverDescriptor {
        &SOLVER6_DESCRIPTOR
    }

    fn solve(&self, request: SolveRequest<'_>) -> Result<SolverResult, SolverError> {
        let solver = Solver6SearchEngine::new(&request.input.solver);
        solver.solve(request.input)
    }

    fn default_configuration(&self) -> SolverConfiguration {
        SolverConfiguration {
            solver_type: SolverKind::Solver6.canonical_id().into(),
            stop_conditions: StopConditions {
                max_iterations: Some(1_000_000),
                time_limit_seconds: Some(30),
                no_improvement_iterations: Some(100_000),
                stop_on_optimal_score: true,
            },
            solver_params: SolverParams::Solver6(Solver6Params::default()),
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

const AUTO_SOLVER_MAX_ITERATIONS: u64 = 1_000_000_000;
const AUTO_CONSTRUCTION_BUDGET_FRACTION: f64 = 0.30;
const AUTO_SCAFFOLD_BUDGET_FRACTION: f64 = 0.30;
const AUTO_MIN_CONSTRUCTION_BUDGET_SECONDS: f64 = 0.1;

#[derive(Debug, Clone)]
struct AutoSolvePlan {
    complexity_model_version: String,
    complexity_score: f64,
    total_budget_seconds: f64,
    oracle_construction_budget_seconds: f64,
    scaffold_budget_seconds: f64,
    oracle_recombination_budget_seconds: f64,
    search_budget_seconds: f64,
}

impl AutoSolvePlan {
    fn from_input(input: &ApiInput) -> Result<Self, SolverError> {
        let complexity = evaluate_problem_complexity(input)?;
        let total_budget_seconds = auto_complexity_wall_time_seconds(complexity.score) as f64;
        let search_reserve_seconds =
            total_budget_seconds * (1.0 - AUTO_CONSTRUCTION_BUDGET_FRACTION);
        let oracle_construction_budget_seconds = if input.initial_schedule.is_some() {
            0.0
        } else {
            let max_construction_budget_seconds =
                (total_budget_seconds - search_reserve_seconds).max(0.0);
            // The complexity policy floors total runtime at 1s, so the 0.1s minimum is compatible
            // with the 70% search reserve. The clamp is a defensive guard if that floor changes.
            (total_budget_seconds * AUTO_CONSTRUCTION_BUDGET_FRACTION)
                .max(AUTO_MIN_CONSTRUCTION_BUDGET_SECONDS)
                .min(max_construction_budget_seconds)
        };
        let search_budget_seconds = if input.initial_schedule.is_some() {
            total_budget_seconds
        } else {
            (total_budget_seconds - oracle_construction_budget_seconds).max(search_reserve_seconds)
        };
        let scaffold_budget_seconds =
            oracle_construction_budget_seconds * AUTO_SCAFFOLD_BUDGET_FRACTION;
        let oracle_recombination_budget_seconds =
            oracle_construction_budget_seconds - scaffold_budget_seconds;

        Ok(Self {
            complexity_model_version: complexity.model_version,
            complexity_score: complexity.score,
            total_budget_seconds,
            oracle_construction_budget_seconds,
            scaffold_budget_seconds,
            oracle_recombination_budget_seconds,
            search_budget_seconds,
        })
    }

    fn telemetry(
        &self,
        construction: &crate::solver3::runtime_state::AutoConstructionResult,
    ) -> AutoSolveTelemetry {
        AutoSolveTelemetry {
            selected_solver: SolverKind::Solver3,
            complexity_model_version: self.complexity_model_version.clone(),
            complexity_score: self.complexity_score,
            total_budget_seconds: self.total_budget_seconds,
            oracle_construction_budget_seconds: self.oracle_construction_budget_seconds,
            scaffold_budget_seconds: self.scaffold_budget_seconds,
            oracle_recombination_budget_seconds: self.oracle_recombination_budget_seconds,
            search_budget_seconds: self.search_budget_seconds,
            constructor_attempt: construction.attempt_label.to_string(),
            constructor_outcome: construction.outcome,
            constructor_fallback_used: construction.fallback_used,
            constructor_failure: construction.failure.clone(),
            constructor_wall_seconds: construction.constructor_wall_seconds,
        }
    }
}

fn auto_solver3_input(input: &ApiInput, plan: &AutoSolvePlan) -> ApiInput {
    let mut params = Solver3Params::default();
    params.construction.mode = Solver3ConstructionMode::ConstraintScenarioOracleGuided;
    params
        .search_driver
        .runtime_scaled_no_improvement_stop
        .enabled = true;
    params
        .search_driver
        .runtime_scaled_no_improvement_stop
        .runtime_scale_factor = 1.0;
    params
        .search_driver
        .runtime_scaled_no_improvement_stop
        .grace_seconds = 0.1;

    let mut solver = SolverConfiguration {
        solver_type: SolverKind::Solver3.canonical_id().into(),
        stop_conditions: StopConditions {
            max_iterations: Some(AUTO_SOLVER_MAX_ITERATIONS),
            time_limit_seconds: Some(plan.search_budget_seconds.ceil().max(1.0) as u64),
            no_improvement_iterations: None,
            stop_on_optimal_score: true,
        },
        solver_params: SolverParams::Solver3(params),
        logging: input.solver.logging.clone(),
        telemetry: input.solver.telemetry.clone(),
        seed: input.solver.seed,
        move_policy: input.solver.move_policy.clone(),
        allowed_sessions: input.solver.allowed_sessions.clone(),
    };
    solver.stop_conditions.stop_on_optimal_score =
        input.solver.stop_conditions.stop_on_optimal_score;

    ApiInput {
        problem: input.problem.clone(),
        initial_schedule: input.initial_schedule.clone(),
        construction_seed_schedule: input.construction_seed_schedule.clone(),
        objectives: input.objectives.clone(),
        constraints: input.constraints.clone(),
        solver,
    }
}

fn auto_complexity_wall_time_seconds(complexity: f64) -> u64 {
    let complexity = if complexity.is_finite() {
        complexity.max(0.0)
    } else {
        0.0
    };
    let raw = 0.75 * complexity.sqrt();
    let floored = if complexity < 1.0 {
        1.0
    } else if complexity < 10.0 {
        raw.max(2.0)
    } else if complexity < 50.0 {
        raw.max(4.0)
    } else if complexity < 150.0 {
        raw.max(8.0)
    } else if complexity < 500.0 {
        raw.max(12.0)
    } else {
        raw.max(15.0)
    };
    floored.round().clamp(1.0, 30.0) as u64
}

pub fn default_solver_kind() -> SolverKind {
    DEFAULT_SOLVER_KIND
}

pub fn available_solver_descriptors() -> &'static [SolverDescriptor] {
    &SOLVER_DESCRIPTORS
}

pub fn solver_descriptor(kind: SolverKind) -> &'static SolverDescriptor {
    match kind {
        SolverKind::Auto => &AUTO_DESCRIPTOR,
        SolverKind::Solver1 => &SOLVER1_DESCRIPTOR,
        SolverKind::Solver3 => &SOLVER3_DESCRIPTOR,
        SolverKind::Solver4 => &SOLVER4_DESCRIPTOR,
        SolverKind::Solver5 => &SOLVER5_DESCRIPTOR,
        SolverKind::Solver6 => &SOLVER6_DESCRIPTOR,
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
        SolverKind::Auto => Box::new(AutoEngine),
        SolverKind::Solver1 => Box::new(Solver1Engine),
        SolverKind::Solver3 => Box::new(Solver3Engine),
        SolverKind::Solver4 => Box::new(Solver4Engine),
        SolverKind::Solver5 => Box::new(Solver5Engine),
        SolverKind::Solver6 => Box::new(Solver6Engine),
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
    use crate::models::{
        AutoConstructorOutcome, Constraint, Group, Objective, Person, ProblemDefinition,
        RepeatEncounterParams, SolverKind, SolverParams,
    };
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

    fn pure_solver4_problem() -> ProblemDefinition {
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
                Person {
                    id: "p2".to_string(),
                    attributes: HashMap::new(),
                    sessions: None,
                },
                Person {
                    id: "p3".to_string(),
                    attributes: HashMap::new(),
                    sessions: None,
                },
            ],
            groups: vec![
                Group {
                    id: "g0".to_string(),
                    size: 2,
                    session_sizes: None,
                },
                Group {
                    id: "g1".to_string(),
                    size: 2,
                    session_sizes: None,
                },
            ],
            num_sessions: 2,
        }
    }

    fn solver4_repeat_constraint() -> Constraint {
        Constraint::RepeatEncounter(RepeatEncounterParams {
            max_allowed_encounters: 1,
            penalty_function: "squared".into(),
            penalty_weight: 10.0,
        })
    }

    #[test]
    fn registry_exposes_default_solver_descriptor() {
        let descriptor = solver_descriptor(default_solver_kind());
        assert_eq!(descriptor.kind, SolverKind::Auto);
        assert!(descriptor.capabilities.supports_recommended_settings);
        assert!(descriptor.notes.contains("always runs solver3"));
    }

    #[test]
    fn auto_default_configuration_round_trips_through_typed_solver_selection() {
        let config = default_solver_configuration_for(SolverKind::Auto);
        assert_eq!(config.solver_type, "auto");
        assert_eq!(
            config.validate_solver_selection().unwrap(),
            SolverKind::Auto
        );
        assert!(matches!(config.solver_params, SolverParams::Auto(_)));
        assert_eq!(
            SolverKind::parse_config_id("default").unwrap(),
            SolverKind::Auto
        );
    }

    #[test]
    fn auto_plan_reserves_search_budget() {
        let input = ApiInput {
            initial_schedule: None,
            construction_seed_schedule: None,
            problem: simple_problem(),
            objectives: vec![],
            constraints: vec![],
            solver: default_solver_configuration_for(SolverKind::Auto),
        };
        let plan = AutoSolvePlan::from_input(&input).unwrap();
        assert!(plan.total_budget_seconds >= 1.0);
        assert!(plan.oracle_construction_budget_seconds >= 0.1);
        assert!(
            plan.search_budget_seconds
                >= plan.total_budget_seconds * (1.0 - AUTO_CONSTRUCTION_BUDGET_FRACTION)
        );
        assert_eq!(
            plan.scaffold_budget_seconds,
            plan.oracle_construction_budget_seconds * AUTO_SCAFFOLD_BUDGET_FRACTION
        );
    }

    #[test]
    fn auto_run_delegates_to_solver3_with_telemetry() {
        let input = ApiInput {
            initial_schedule: None,
            construction_seed_schedule: None,
            problem: simple_problem(),
            objectives: vec![],
            constraints: vec![],
            solver: default_solver_configuration_for(SolverKind::Auto),
        };

        let result = run_solver_with_engine(SolveRequest {
            input: &input,
            progress_callback: None,
            benchmark_observer: None,
        })
        .expect("auto should execute through solver3");

        let telemetry = result
            .benchmark_telemetry
            .and_then(|telemetry| telemetry.auto)
            .expect("auto telemetry should be attached");
        assert_eq!(telemetry.selected_solver, SolverKind::Solver3);
        assert_eq!(
            telemetry.constructor_attempt,
            "constraint_scenario_oracle_guided"
        );
        assert!(matches!(
            telemetry.constructor_outcome,
            AutoConstructorOutcome::Success
        ));
        assert!(!telemetry.constructor_fallback_used);
        assert!(telemetry.search_budget_seconds >= telemetry.total_budget_seconds * 0.70);
    }

    #[test]
    fn auto_constructor_timeout_falls_back_to_baseline() {
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

        let construction = crate::solver3::RuntimeState::from_input_with_auto_construction(
            &input,
            AutoConstructionPolicy {
                oracle_construction_budget_seconds: -1.0,
                scaffold_budget_seconds: 0.0,
                oracle_recombination_budget_seconds: 0.0,
            },
        )
        .expect("baseline fallback should produce a valid incumbent");

        assert_eq!(construction.outcome, AutoConstructorOutcome::Timeout);
        assert!(construction.fallback_used);
        assert!(construction.failure.unwrap().contains("budget"));
    }

    #[test]
    fn default_configuration_round_trips_through_typed_solver_selection() {
        let config = default_solver_configuration_for(SolverKind::Solver1);
        assert_eq!(
            config.validate_solver_selection().unwrap(),
            SolverKind::Solver1
        );
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
    fn solver4_default_configuration_round_trips_through_typed_solver_selection() {
        let config = default_solver_configuration_for(SolverKind::Solver4);
        assert_eq!(
            config.validate_solver_selection().unwrap(),
            SolverKind::Solver4
        );
        assert!(matches!(config.solver_params, SolverParams::Solver4(_)));
    }

    #[test]
    fn solver4_recommendation_returns_runtime_targeted_configuration() {
        let config = calculate_recommended_settings_for(
            SolverKind::Solver4,
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
            SolverKind::Solver4
        );
        assert_eq!(config.stop_conditions.time_limit_seconds, Some(4));
        assert_eq!(config.stop_conditions.no_improvement_iterations, None);
        assert!(config.stop_conditions.max_iterations.unwrap_or_default() >= 4_000_000);
        assert!(matches!(config.solver_params, SolverParams::Solver4(_)));
    }

    #[test]
    fn solver4_run_executes_through_engine_registry() {
        let input = ApiInput {
            initial_schedule: None,
            construction_seed_schedule: None,
            problem: pure_solver4_problem(),
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".to_string(),
                weight: 1.0,
            }],
            constraints: vec![solver4_repeat_constraint()],
            solver: default_solver_configuration_for(SolverKind::Solver4),
        };

        let result = run_solver_with_engine(SolveRequest {
            input: &input,
            progress_callback: None,
            benchmark_observer: None,
        })
        .expect("solver4 should execute through the engine registry");

        assert_eq!(result.final_score, 0.0);
        assert_eq!(
            result.stop_reason,
            Some(crate::models::StopReason::OptimalScoreReached)
        );
    }

    #[test]
    fn solver5_default_configuration_round_trips_through_typed_solver_selection() {
        let config = default_solver_configuration_for(SolverKind::Solver5);
        assert_eq!(
            config.validate_solver_selection().unwrap(),
            SolverKind::Solver5
        );
        assert!(matches!(config.solver_params, SolverParams::Solver5(_)));
    }

    #[test]
    fn solver5_recommendation_returns_default_configuration() {
        let config = calculate_recommended_settings_for(
            SolverKind::Solver5,
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
            SolverKind::Solver5
        );
        assert_eq!(config.stop_conditions.time_limit_seconds, Some(1));
        assert!(matches!(config.solver_params, SolverParams::Solver5(_)));
    }

    #[test]
    fn solver5_run_executes_through_engine_registry() {
        let input = ApiInput {
            initial_schedule: None,
            construction_seed_schedule: None,
            problem: ProblemDefinition {
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
                    Person {
                        id: "p2".to_string(),
                        attributes: HashMap::new(),
                        sessions: None,
                    },
                    Person {
                        id: "p3".to_string(),
                        attributes: HashMap::new(),
                        sessions: None,
                    },
                ],
                groups: vec![
                    Group {
                        id: "g0".to_string(),
                        size: 2,
                        session_sizes: None,
                    },
                    Group {
                        id: "g1".to_string(),
                        size: 2,
                        session_sizes: None,
                    },
                ],
                num_sessions: 3,
            },
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".to_string(),
                weight: 1.0,
            }],
            constraints: vec![solver4_repeat_constraint()],
            solver: default_solver_configuration_for(SolverKind::Solver5),
        };

        let result = run_solver_with_engine(SolveRequest {
            input: &input,
            progress_callback: None,
            benchmark_observer: None,
        })
        .expect("solver5 should execute through the engine registry");

        assert_eq!(result.final_score, 0.0);
        assert_eq!(result.schedule.len(), 3);
        assert_eq!(
            result.stop_reason,
            Some(crate::models::StopReason::OptimalScoreReached)
        );
    }

    #[test]
    fn solver6_default_configuration_round_trips_through_typed_solver_selection() {
        let config = default_solver_configuration_for(SolverKind::Solver6);
        assert_eq!(
            config.validate_solver_selection().unwrap(),
            SolverKind::Solver6
        );
        assert!(matches!(config.solver_params, SolverParams::Solver6(_)));
    }

    #[test]
    fn solver6_recommendation_returns_runtime_target_configuration() {
        let config = calculate_recommended_settings_for(
            SolverKind::Solver6,
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
            SolverKind::Solver6
        );
        assert_eq!(config.stop_conditions.time_limit_seconds, Some(4));
        assert!(matches!(config.solver_params, SolverParams::Solver6(_)));
    }

    #[test]
    fn solver6_run_executes_through_engine_registry_for_exact_cells() {
        let input = ApiInput {
            initial_schedule: None,
            construction_seed_schedule: None,
            problem: ProblemDefinition {
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
                    Person {
                        id: "p2".to_string(),
                        attributes: HashMap::new(),
                        sessions: None,
                    },
                    Person {
                        id: "p3".to_string(),
                        attributes: HashMap::new(),
                        sessions: None,
                    },
                ],
                groups: vec![
                    Group {
                        id: "g0".to_string(),
                        size: 2,
                        session_sizes: None,
                    },
                    Group {
                        id: "g1".to_string(),
                        size: 2,
                        session_sizes: None,
                    },
                ],
                num_sessions: 3,
            },
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".to_string(),
                weight: 1.0,
            }],
            constraints: vec![solver4_repeat_constraint()],
            solver: default_solver_configuration_for(SolverKind::Solver6),
        };

        let result = run_solver_with_engine(SolveRequest {
            input: &input,
            progress_callback: None,
            benchmark_observer: None,
        })
        .expect("solver6 scaffold should execute through the engine registry for exact cells");

        assert_eq!(result.final_score, 0.0);
        assert_eq!(result.schedule.len(), 3);
        assert_eq!(
            result.stop_reason,
            Some(crate::models::StopReason::OptimalScoreReached)
        );
    }

    #[test]
    fn all_solver_families_can_stop_on_optimal_zero_score() {
        for kind in [
            SolverKind::Solver1,
            SolverKind::Solver3,
            SolverKind::Solver4,
            SolverKind::Solver5,
            SolverKind::Solver6,
        ] {
            let (problem, constraints) = if matches!(kind, SolverKind::Solver4) {
                (pure_solver4_problem(), vec![solver4_repeat_constraint()])
            } else if matches!(kind, SolverKind::Solver5 | SolverKind::Solver6) {
                (pure_solver4_problem(), vec![solver4_repeat_constraint()])
            } else {
                (simple_problem(), vec![])
            };
            let input = ApiInput {
                initial_schedule: None,
                construction_seed_schedule: None,
                problem,
                objectives: vec![],
                constraints,
                solver: default_solver_configuration_for(kind),
            };

            let result = run_solver_with_engine(SolveRequest {
                input: &input,
                progress_callback: None,
                benchmark_observer: None,
            })
            .unwrap();

            assert_eq!(
                result.final_score, 0.0,
                "{kind:?} should preserve the optimal score"
            );
            assert_eq!(
                result.stop_reason,
                Some(crate::models::StopReason::OptimalScoreReached),
                "{kind:?} should stop once score zero is reached"
            );
        }
    }

    #[test]
    fn zero_score_stop_can_be_disabled_per_run() {
        let mut solver = default_solver_configuration_for(SolverKind::Solver3);
        solver.stop_conditions.stop_on_optimal_score = false;
        let input = ApiInput {
            initial_schedule: None,
            construction_seed_schedule: None,
            problem: simple_problem(),
            objectives: vec![],
            constraints: vec![],
            solver,
        };

        let result = run_solver_with_engine(SolveRequest {
            input: &input,
            progress_callback: None,
            benchmark_observer: None,
        })
        .unwrap();

        assert_ne!(
            result.stop_reason,
            Some(crate::models::StopReason::OptimalScoreReached)
        );
    }

    #[test]
    fn available_solver_descriptors_include_solver4_and_solver5() {
        let descriptors = available_solver_descriptors();
        assert!(
            descriptors.iter().any(|d| d.kind == SolverKind::Solver3),
            "solver3 should appear in available_solver_descriptors"
        );
        assert!(
            descriptors.iter().any(|d| d.kind == SolverKind::Solver4),
            "solver4 should appear in available_solver_descriptors"
        );
        assert!(
            descriptors.iter().any(|d| d.kind == SolverKind::Solver5),
            "solver5 should appear in available_solver_descriptors"
        );
        assert!(
            descriptors.iter().any(|d| d.kind == SolverKind::Solver6),
            "solver6 should appear in available_solver_descriptors"
        );
        assert_eq!(descriptors.len(), 5);
    }
}
