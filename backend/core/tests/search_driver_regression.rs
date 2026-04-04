mod common;

use common::{default_solver_config, make_initial_schedule};
use gm_core::models::{
    ApiInput, BenchmarkEvent, Group, MoveFamily, MovePolicy, Objective, Person, ProblemDefinition,
    ProgressCallback, SimulatedAnnealingParams, SolverParams, StopReason,
};
use gm_core::{
    default_solver_configuration_for, run_solver, run_solver_with_benchmark_observer,
    run_solver_with_callbacks, run_solver_with_progress,
};
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
        constraints: vec![],
        solver,
    }
}

fn solver2_driver_input() -> ApiInput {
    let mut input = driver_input();
    let mut solver = default_solver_configuration_for(gm_core::models::SolverKind::Solver2);
    solver.seed = Some(97);
    solver.stop_conditions.max_iterations = Some(40);
    solver.stop_conditions.time_limit_seconds = None;
    solver.stop_conditions.no_improvement_iterations = None;
    input.solver = solver;
    input
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
            session_sizes: None,
        }],
        num_sessions: 1,
    };
    input.initial_schedule = Some(make_initial_schedule(
        &["solo"],
        vec![vec![vec!["p0", "p1"]]],
    ));
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

    assert_eq!(
        result.stop_reason,
        Some(StopReason::ProgressCallbackRequestedStop)
    );
    assert!(*calls.lock().unwrap() >= 1);
}

#[test]
fn solver2_allowed_sessions_preserve_other_warm_start_sessions() {
    let mut input = solver2_driver_input();
    let initial = input.initial_schedule.clone().expect("warm start present");
    input.solver.allowed_sessions = Some(vec![1]);
    input.solver.stop_conditions.max_iterations = Some(60);

    let result = run_solver(&input).expect("solver2 solve should succeed");

    assert_eq!(result.schedule.get("session_0"), initial.get("session_0"));
    assert_eq!(result.schedule.get("session_2"), initial.get("session_2"));
}

#[test]
fn solver2_time_limit_stop_reason_surfaces_through_result_and_telemetry() {
    let mut input = solver2_driver_input();
    input.solver.stop_conditions.max_iterations = Some(5_000);
    input.solver.stop_conditions.time_limit_seconds = Some(0);

    let result = run_solver(&input).expect("solver2 solve should succeed");
    let telemetry = result
        .benchmark_telemetry
        .clone()
        .expect("benchmark telemetry should be present");

    assert_eq!(result.stop_reason, Some(StopReason::TimeLimitReached));
    assert_eq!(telemetry.stop_reason, StopReason::TimeLimitReached);
}

#[test]
fn solver2_progress_callback_can_request_early_stop() {
    let mut input = solver2_driver_input();
    input.solver.stop_conditions.max_iterations = Some(5_000);

    let calls = Arc::new(Mutex::new(0u32));
    let calls_for_callback = Arc::clone(&calls);
    let callback: ProgressCallback = Box::new(move |_| {
        let mut calls = calls_for_callback.lock().unwrap();
        *calls += 1;
        false
    });

    let result = run_solver_with_progress(&input, Some(&callback)).expect("solver2 should stop");

    assert_eq!(
        result.stop_reason,
        Some(StopReason::ProgressCallbackRequestedStop)
    );
    assert!(*calls.lock().unwrap() >= 1);
}

#[test]
fn solver2_benchmark_observer_receives_started_and_completed_events() {
    let input = solver2_driver_input();

    let events = Arc::new(Mutex::new(Vec::new()));
    let events_clone = Arc::clone(&events);
    let observer: gm_core::models::BenchmarkObserver = Box::new(move |event| {
        events_clone.lock().unwrap().push(event.clone());
    });

    let result = run_solver_with_benchmark_observer(&input, Some(&observer))
        .expect("solver2 benchmark observer solve should succeed");
    let events = events.lock().unwrap().clone();

    assert_eq!(events.len(), 2);

    match &events[0] {
        BenchmarkEvent::RunStarted(started) => {
            assert_eq!(started.effective_seed, 97);
            assert_eq!(started.move_policy, MovePolicy::default());
        }
        other => panic!("unexpected first benchmark event: {other:?}"),
    }

    let completed = match &events[1] {
        BenchmarkEvent::RunCompleted(completed) => completed,
        other => panic!("unexpected completion benchmark event: {other:?}"),
    };

    assert_eq!(completed.effective_seed, 97);
    assert_eq!(completed.stop_reason, result.stop_reason.unwrap());
    assert_eq!(
        result
            .benchmark_telemetry
            .as_ref()
            .expect("result telemetry"),
        completed
    );
}

#[test]
fn solver2_progress_callback_and_benchmark_observer_can_run_together() {
    let input = solver2_driver_input();

    let progress_count = Arc::new(Mutex::new(0usize));
    let progress_count_clone = Arc::clone(&progress_count);
    let progress_callback: ProgressCallback = Box::new(move |_| {
        *progress_count_clone.lock().unwrap() += 1;
        true
    });

    let benchmark_count = Arc::new(Mutex::new(0usize));
    let benchmark_count_clone = Arc::clone(&benchmark_count);
    let observer: gm_core::models::BenchmarkObserver = Box::new(move |_| {
        *benchmark_count_clone.lock().unwrap() += 1;
    });

    let result = run_solver_with_callbacks(&input, Some(&progress_callback), Some(&observer))
        .expect("combined solver2 callback solve should succeed");

    assert!(*progress_count.lock().unwrap() >= 1);
    assert_eq!(*benchmark_count.lock().unwrap(), 2);
    assert!(result.benchmark_telemetry.is_some());
}

#[test]
fn solver2_swap_runtime_preview_avoids_full_recompute_per_attempt() {
    let mut input = solver2_driver_input();
    input.solver.stop_conditions.max_iterations = Some(25);
    input.solver.move_policy = Some(MovePolicy {
        forced_family: Some(MoveFamily::Swap),
        ..MovePolicy::default()
    });

    let result = run_solver(&input).expect("solver2 solve should succeed");
    let telemetry = result
        .benchmark_telemetry
        .expect("benchmark telemetry should be present");

    assert!(telemetry.moves.swap.attempts > 0);
    assert_eq!(
        telemetry.moves.swap.full_recalculation_count, 0,
        "solver2 runtime swap previews should avoid full recomputation in the default path"
    );
    assert_eq!(telemetry.moves.transfer.full_recalculation_count, 0);
    assert_eq!(telemetry.moves.clique_swap.full_recalculation_count, 0);
}
