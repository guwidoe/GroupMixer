mod common;

use common::{default_solver_config, make_initial_schedule};
use solver_core::models::{
    ApiInput, Group, Objective, Person, ProblemDefinition, ProgressCallback,
    SimulatedAnnealingParams, SolverParams, StopReason,
};
use solver_core::{run_solver, run_solver_with_progress};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

fn person(id: &str) -> Person {
    Person {
        id: id.to_string(),
        attributes: HashMap::new(),
        sessions: None,
    }
}

fn warm_start_schedule() -> HashMap<String, HashMap<String, Vec<String>>> {
    make_initial_schedule(
        &["g0", "g1"],
        vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
        ],
    )
}

fn driver_input() -> ApiInput {
    let mut solver = default_solver_config(40);
    solver.seed = Some(53);
    solver.stop_conditions.no_improvement_iterations = None;
    solver.solver_params = SolverParams::SimulatedAnnealing(SimulatedAnnealingParams {
        initial_temperature: 3.0,
        final_temperature: 0.1,
        cooling_schedule: "geometric".to_string(),
        reheat_after_no_improvement: Some(0),
        reheat_cycles: Some(0),
    });

    ApiInput {
        initial_schedule: Some(warm_start_schedule()),
        problem: ProblemDefinition {
            people: vec![person("p0"), person("p1"), person("p2"), person("p3")],
            groups: vec![
                Group {
                    id: "g0".to_string(),
                    size: 2,
                },
                Group {
                    id: "g1".to_string(),
                    size: 2,
                },
            ],
            num_sessions: 3,
        },
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".to_string(),
            weight: 1.0,
        }],
        constraints: vec![],
        solver,
    }
}

#[test]
fn allowed_sessions_preserve_other_warm_start_sessions() {
    let mut input = driver_input();
    let initial = input.initial_schedule.clone().expect("warm start present");
    input.solver.allowed_sessions = Some(vec![1]);
    input.solver.stop_conditions.max_iterations = Some(200);

    let result = run_solver(&input).expect("solve should succeed");

    assert_eq!(result.schedule.get("session_0"), initial.get("session_0"));
    assert_eq!(result.schedule.get("session_2"), initial.get("session_2"));
}

#[test]
fn cycle_reheating_is_reported_in_benchmark_telemetry() {
    let mut input = driver_input();
    input.solver.stop_conditions.max_iterations = Some(9);
    input.solver.solver_params = SolverParams::SimulatedAnnealing(SimulatedAnnealingParams {
        initial_temperature: 2.0,
        final_temperature: 0.1,
        cooling_schedule: "geometric".to_string(),
        reheat_after_no_improvement: Some(0),
        reheat_cycles: Some(3),
    });

    let result = run_solver(&input).expect("solve should succeed");
    let telemetry = result
        .benchmark_telemetry
        .expect("benchmark telemetry should be present");

    assert_eq!(telemetry.reheats_performed, 2);
    assert_eq!(telemetry.stop_reason, StopReason::MaxIterationsReached);
}

#[test]
fn no_improvement_reheating_is_reported_in_benchmark_telemetry() {
    let mut input = driver_input();
    input.problem = ProblemDefinition {
        people: vec![person("p0"), person("p1")],
        groups: vec![Group {
            id: "solo".to_string(),
            size: 2,
        }],
        num_sessions: 1,
    };
    input.initial_schedule = Some(make_initial_schedule(&["solo"], vec![vec![vec!["p0", "p1"]]]));
    input.solver.stop_conditions.max_iterations = Some(10);
    input.solver.solver_params = SolverParams::SimulatedAnnealing(SimulatedAnnealingParams {
        initial_temperature: 1.0,
        final_temperature: 1.0,
        cooling_schedule: "geometric".to_string(),
        reheat_after_no_improvement: Some(2),
        reheat_cycles: Some(0),
    });

    let result = run_solver(&input).expect("solve should succeed");
    let telemetry = result
        .benchmark_telemetry
        .expect("benchmark telemetry should be present");

    assert_eq!(telemetry.reheats_performed, 3);
    assert_eq!(telemetry.stop_reason, StopReason::MaxIterationsReached);
}

#[test]
fn time_limit_stop_reason_surfaces_through_result_and_telemetry() {
    let mut input = driver_input();
    input.solver.stop_conditions.max_iterations = Some(5_000);
    input.solver.stop_conditions.time_limit_seconds = Some(0);

    let result = run_solver(&input).expect("solve should succeed");
    let telemetry = result
        .benchmark_telemetry
        .clone()
        .expect("benchmark telemetry should be present");

    assert_eq!(result.stop_reason, Some(StopReason::TimeLimitReached));
    assert_eq!(telemetry.stop_reason, StopReason::TimeLimitReached);
}

#[test]
fn progress_callback_can_request_early_stop() {
    let mut input = driver_input();
    input.solver.stop_conditions.max_iterations = Some(5_000);

    let calls = Arc::new(Mutex::new(0u32));
    let calls_for_callback = Arc::clone(&calls);
    let callback: ProgressCallback = Box::new(move |_| {
        let mut calls = calls_for_callback.lock().unwrap();
        *calls += 1;
        false
    });

    let result = run_solver_with_progress(&input, Some(&callback)).expect("solve should stop");

    assert_eq!(result.stop_reason, Some(StopReason::ProgressCallbackRequestedStop));
    assert!(*calls.lock().unwrap() >= 1);
}
