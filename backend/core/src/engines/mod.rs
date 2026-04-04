use crate::models::{
    ApiInput, BenchmarkObserver, Constraint, LoggingOptions, Objective, ProblemDefinition,
    ProgressCallback, ProgressUpdate, SimulatedAnnealingParams, Solver2Params, Solver3Params,
    SolverConfiguration, SolverKind, SolverParams, SolverResult, StopConditions,
    DEFAULT_SOLVER_KIND,
};
use crate::solver1::search::simulated_annealing::SimulatedAnnealing;
use crate::solver1::search::Solver as _;
use crate::solver1::State;
use crate::solver2::{SearchEngine as Solver2SearchEngine, SOLVER2_BOOTSTRAP_NOTES};
use crate::solver3::SOLVER3_BOOTSTRAP_NOTES;
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
        supports_initial_schedule: false,
        supports_progress_callback: false,
        supports_benchmark_observer: false,
        supports_recommended_settings: false,
        supports_deterministic_seed: false,
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
                no_improvement_iterations: Some(5_000),
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
        recommend_solver1_configuration(request)
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

    fn solve(&self, _request: SolveRequest<'_>) -> Result<SolverResult, SolverError> {
        Err(crate::solver3::not_yet_implemented("solve paths"))
    }

    fn default_configuration(&self) -> SolverConfiguration {
        SolverConfiguration {
            solver_type: SolverKind::Solver3.canonical_id().into(),
            stop_conditions: StopConditions {
                max_iterations: None,
                time_limit_seconds: None,
                no_improvement_iterations: None,
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
        _request: RecommendationRequest<'_>,
    ) -> Result<SolverConfiguration, SolverError> {
        Err(crate::solver3::not_yet_implemented(
            "runtime-aware recommendation for solver3",
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

fn recommend_solver1_configuration(
    request: RecommendationRequest<'_>,
) -> Result<SolverConfiguration, SolverError> {
    const TRIAL_ITERS: u64 = 10_000;

    let trial_cfg = SolverConfiguration {
        solver_type: "SimulatedAnnealing".into(),
        stop_conditions: StopConditions {
            max_iterations: Some(TRIAL_ITERS),
            time_limit_seconds: None,
            no_improvement_iterations: None,
        },
        solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams {
            initial_temperature: 1_000_000.0,
            final_temperature: 1_000_000.0,
            cooling_schedule: "geometric".into(),
            reheat_cycles: Some(0),
            reheat_after_no_improvement: Some(0),
        }),
        logging: Default::default(),
        telemetry: Default::default(),
        seed: None,
        move_policy: None,
        allowed_sessions: None,
    };

    let trial_objectives: Vec<Objective> = if request.objectives.is_empty() {
        vec![Objective {
            r#type: "maximize_unique_contacts".into(),
            weight: 1.0,
        }]
    } else {
        request.objectives.to_vec()
    };

    let trial_input = ApiInput {
        initial_schedule: None,
        problem: request.problem.clone(),
        objectives: trial_objectives,
        constraints: request.constraints.to_vec(),
        solver: trial_cfg.clone(),
    };

    use std::sync::{Arc, Mutex};
    let last_prog: Arc<Mutex<Option<ProgressUpdate>>> = Arc::new(Mutex::new(None));
    let cb_holder = last_prog.clone();
    let progress: ProgressCallback = Box::new(move |p: &ProgressUpdate| {
        *cb_holder.lock().unwrap() = Some(p.clone());
        true
    });

    let mut state = State::new(&trial_input)?;
    let solver = SimulatedAnnealing::new(&trial_cfg);

    #[cfg(not(target_arch = "wasm32"))]
    let trial_secs = {
        let start = std::time::Instant::now();
        solver.solve(&mut state, Some(&progress), None)?;
        start.elapsed().as_secs_f64()
    };

    #[cfg(target_arch = "wasm32")]
    let trial_secs = {
        use js_sys::Date;
        let start = Date::now();
        solver.solve(&mut state, Some(&progress), None)?;
        (Date::now() - start) / 1000.0
    };

    let metrics = last_prog
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| SolverError::ValidationError("Trial run produced no progress".into()))?;

    let max_uphill_delta = metrics
        .biggest_attempted_increase
        .max(metrics.biggest_accepted_increase);

    let init_temp = if max_uphill_delta > 0.0 {
        -max_uphill_delta / 0.01_f64.ln()
    } else {
        1.0
    };

    let final_temp = -1.0 / (0.00001f64).ln();
    let t_per_iter = trial_secs / TRIAL_ITERS as f64;
    let target_secs = request.desired_runtime_seconds as f64 * 0.9;
    let total_iters = if t_per_iter > 0.0 {
        (target_secs / t_per_iter).round() as u64
    } else {
        2_000_000
    };

    Ok(SolverConfiguration {
        solver_type: "SimulatedAnnealing".into(),
        stop_conditions: StopConditions {
            max_iterations: Some(total_iters),
            time_limit_seconds: Some(request.desired_runtime_seconds),
            no_improvement_iterations: Some(total_iters / 2),
        },
        solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams {
            initial_temperature: init_temp,
            final_temperature: final_temp,
            cooling_schedule: "geometric".into(),
            reheat_cycles: Some(0),
            reheat_after_no_improvement: Some(total_iters / 3),
        }),
        logging: Default::default(),
        telemetry: Default::default(),
        seed: None,
        move_policy: None,
        allowed_sessions: None,
    })
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
    fn registry_exposes_solver3_descriptor_with_bootstrap_capabilities() {
        let descriptor = solver_descriptor(SolverKind::Solver3);
        assert_eq!(descriptor.kind, SolverKind::Solver3);
        assert!(!descriptor.capabilities.supports_initial_schedule);
        assert!(!descriptor.capabilities.supports_progress_callback);
        assert!(!descriptor.capabilities.supports_benchmark_observer);
        assert!(!descriptor.capabilities.supports_recommended_settings);
        assert!(!descriptor.capabilities.supports_deterministic_seed);
        assert!(descriptor.notes.contains("solver3"));
        assert!(descriptor.notes.contains("not yet implemented"));
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
    fn solver3_recommendation_fails_explicitly_until_implemented() {
        let error = calculate_recommended_settings_for(
            SolverKind::Solver3,
            RecommendationRequest {
                problem: &simple_problem(),
                objectives: &[],
                constraints: &[],
                desired_runtime_seconds: 1,
            },
        )
        .unwrap_err();

        assert!(error.to_string().contains("solver3"));
        assert!(error.to_string().contains("not implemented"));
    }

    #[test]
    fn solver3_solve_fails_explicitly_until_implemented() {
        let input = ApiInput {
            initial_schedule: None,
            problem: simple_problem(),
            objectives: vec![],
            constraints: vec![],
            solver: default_solver_configuration_for(SolverKind::Solver3),
        };

        let error = run_solver_with_engine(SolveRequest {
            input: &input,
            progress_callback: None,
            benchmark_observer: None,
        })
        .unwrap_err();

        assert!(error.to_string().contains("solver3"));
        assert!(error.to_string().contains("not implemented"));
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
