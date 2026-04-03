use crate::models::{
    ApiInput, BenchmarkObserver, Constraint, LoggingOptions, Objective, ProblemDefinition,
    ProgressCallback, ProgressUpdate, SimulatedAnnealingParams, SolverConfiguration, SolverKind,
    SolverParams, SolverResult, StopConditions, DEFAULT_SOLVER_KIND,
};
use crate::solver1::search::simulated_annealing::SimulatedAnnealing;
use crate::solver1::search::Solver as _;
use crate::solver1::State;
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

const SOLVER_DESCRIPTORS: [SolverDescriptor; 1] = [SOLVER1_DESCRIPTOR];

struct Solver1Engine;

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

pub fn default_solver_kind() -> SolverKind {
    DEFAULT_SOLVER_KIND
}

pub fn available_solver_descriptors() -> &'static [SolverDescriptor] {
    &SOLVER_DESCRIPTORS
}

pub fn solver_descriptor(kind: SolverKind) -> &'static SolverDescriptor {
    match kind {
        SolverKind::Solver1 => &SOLVER1_DESCRIPTOR,
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
}
