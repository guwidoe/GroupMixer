mod common;

use common::{default_solver_config, make_initial_schedule};
use gm_core::models::{
    ApiInput, BenchmarkEvent, Constraint, Group, MoveFamily, MovePolicy, Objective,
    PairMeetingCountParams, PairMeetingMode, Person, ProblemDefinition, ProgressCallback,
    RepeatEncounterParams, SimulatedAnnealingParams, Solver3CorrectnessLaneParams,
    Solver3DonorSessionTransplantParams, Solver3HotspotGuidanceParams, Solver3LocalImproverMode,
    Solver3LocalImproverParams, Solver3MultiRootBalancedSessionInheritanceParams, Solver3Params,
    Solver3PathRelinkingOperatorVariant, Solver3RepeatGuidedSwapParams, Solver3SearchDriverMode,
    Solver3SearchDriverParams, Solver3SessionAlignedPathRelinkingParams,
    Solver3SgpWeekPairTabuParams, SolverKind, SolverParams, StopReason,
};
use gm_core::{
    default_solver_configuration_for, run_solver, run_solver_with_benchmark_observer,
    run_solver_with_callbacks, run_solver_with_progress,
};
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[derive(Debug, Deserialize)]
struct BenchmarkCaseInputEnvelope {
    input: ApiInput,
}

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
    solver.stop_conditions.stop_on_optimal_score = false;
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
        construction_seed_schedule: None,
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
    solver.stop_conditions.stop_on_optimal_score = false;
    input.solver = solver;
    input
}

fn solver3_driver_input() -> ApiInput {
    let mut input = driver_input();
    let mut solver = default_solver_configuration_for(SolverKind::Solver3);
    solver.seed = Some(211);
    solver.stop_conditions.max_iterations = Some(40);
    solver.stop_conditions.time_limit_seconds = None;
    solver.stop_conditions.no_improvement_iterations = None;
    solver.stop_conditions.stop_on_optimal_score = false;
    solver.move_policy = Some(MovePolicy {
        forced_family: Some(MoveFamily::Swap),
        ..MovePolicy::default()
    });
    input.solver = solver;
    input
}

fn solver3_repeat_driver_input() -> ApiInput {
    let mut input = solver3_driver_input();
    input.constraints = vec![Constraint::RepeatEncounter(RepeatEncounterParams {
        max_allowed_encounters: 1,
        penalty_function: "linear".to_string(),
        penalty_weight: 100.0,
    })];
    input
}

fn solver3_raw_sailing_trip_input() -> ApiInput {
    let mut envelope: BenchmarkCaseInputEnvelope = serde_json::from_str(include_str!(
        "../../benchmarking/cases/stretch/sailing_trip_demo_real.json"
    ))
    .expect("raw Sailing Trip benchmark case should parse");

    let mut solver = default_solver_configuration_for(SolverKind::Solver3);
    solver.seed = Some(7);
    solver.stop_conditions.max_iterations = Some(2_000);
    solver.stop_conditions.time_limit_seconds = Some(2);
    solver.stop_conditions.no_improvement_iterations = Some(1_000);
    solver.stop_conditions.stop_on_optimal_score = false;
    envelope.input.solver = solver;
    envelope.input
}

fn solver3_transfer_driver_input() -> ApiInput {
    let mut solver = default_solver_configuration_for(gm_core::models::SolverKind::Solver3);
    solver.seed = Some(281);
    solver.stop_conditions.max_iterations = Some(25);
    solver.stop_conditions.stop_on_optimal_score = false;
    solver.move_policy = Some(MovePolicy {
        forced_family: Some(MoveFamily::Transfer),
        ..MovePolicy::default()
    });

    ApiInput {
        initial_schedule: Some(make_initial_schedule(
            &["g0", "g1", "g2"],
            vec![
                vec![vec!["p0", "p1", "p4"], vec!["p2", "p3"], vec![]],
                vec![vec!["p0", "p4"], vec!["p1", "p2"], vec!["p3"]],
            ],
        )),
        construction_seed_schedule: None,
        problem: ProblemDefinition {
            people: vec![
                person("p0"),
                person("p1"),
                person("p2"),
                person("p3"),
                person("p4"),
            ],
            groups: vec![
                Group {
                    id: "g0".to_string(),
                    size: 3,
                    session_sizes: None,
                },
                Group {
                    id: "g1".to_string(),
                    size: 2,
                    session_sizes: None,
                },
                Group {
                    id: "g2".to_string(),
                    size: 2,
                    session_sizes: None,
                },
            ],
            num_sessions: 2,
        },
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".to_string(),
            weight: 1.0,
        }],
        constraints: vec![Constraint::PairMeetingCount(PairMeetingCountParams {
            people: vec!["p0".to_string(), "p1".to_string()],
            sessions: vec![0, 1],
            target_meetings: 2,
            mode: PairMeetingMode::AtLeast,
            penalty_weight: 13.0,
        })],
        solver,
    }
}

fn solver2_transfer_driver_input() -> ApiInput {
    let mut solver = default_solver_configuration_for(gm_core::models::SolverKind::Solver2);
    solver.seed = Some(181);
    solver.stop_conditions.max_iterations = Some(25);
    solver.move_policy = Some(MovePolicy {
        forced_family: Some(MoveFamily::Transfer),
        ..MovePolicy::default()
    });

    ApiInput {
        initial_schedule: Some(make_initial_schedule(
            &["g0", "g1", "g2"],
            vec![
                vec![vec!["p0", "p1", "p4"], vec!["p2", "p3"], vec![]],
                vec![vec!["p0", "p4"], vec!["p1", "p2"], vec!["p3"]],
            ],
        )),
        construction_seed_schedule: None,
        problem: ProblemDefinition {
            people: vec![
                person("p0"),
                person("p1"),
                person("p2"),
                person("p3"),
                person("p4"),
            ],
            groups: vec![
                Group {
                    id: "g0".to_string(),
                    size: 3,
                    session_sizes: None,
                },
                Group {
                    id: "g1".to_string(),
                    size: 2,
                    session_sizes: None,
                },
                Group {
                    id: "g2".to_string(),
                    size: 2,
                    session_sizes: None,
                },
            ],
            num_sessions: 2,
        },
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".to_string(),
            weight: 1.0,
        }],
        constraints: vec![Constraint::PairMeetingCount(PairMeetingCountParams {
            people: vec!["p0".to_string(), "p1".to_string()],
            sessions: vec![0, 1],
            target_meetings: 2,
            mode: PairMeetingMode::AtLeast,
            penalty_weight: 13.0,
        })],
        solver,
    }
}

fn solver3_clique_driver_input() -> ApiInput {
    let mut solver = default_solver_configuration_for(gm_core::models::SolverKind::Solver3);
    solver.seed = Some(311);
    solver.stop_conditions.max_iterations = Some(25);
    solver.move_policy = Some(MovePolicy {
        forced_family: Some(MoveFamily::CliqueSwap),
        ..MovePolicy::default()
    });

    ApiInput {
        initial_schedule: Some(make_initial_schedule(
            &["g0", "g1", "g2"],
            vec![
                vec![vec!["p0", "p1", "p4"], vec!["p2", "p3", "p5"], vec![]],
                vec![vec!["p0", "p1", "p4"], vec!["p2", "p3", "p5"], vec![]],
            ],
        )),
        construction_seed_schedule: None,
        problem: ProblemDefinition {
            people: vec![
                person("p0"),
                person("p1"),
                person("p2"),
                person("p3"),
                person("p4"),
                person("p5"),
            ],
            groups: vec![
                Group {
                    id: "g0".to_string(),
                    size: 3,
                    session_sizes: None,
                },
                Group {
                    id: "g1".to_string(),
                    size: 3,
                    session_sizes: None,
                },
                Group {
                    id: "g2".to_string(),
                    size: 1,
                    session_sizes: None,
                },
            ],
            num_sessions: 2,
        },
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".to_string(),
            weight: 1.0,
        }],
        constraints: vec![
            Constraint::MustStayTogether {
                people: vec!["p0".to_string(), "p1".to_string()],
                sessions: None,
            },
            Constraint::ShouldNotBeTogether {
                people: vec!["p0".to_string(), "p5".to_string()],
                penalty_weight: 25.0,
                sessions: None,
            },
            Constraint::PairMeetingCount(PairMeetingCountParams {
                people: vec!["p0".to_string(), "p5".to_string()],
                sessions: vec![0, 1],
                target_meetings: 1,
                mode: PairMeetingMode::AtLeast,
                penalty_weight: 17.0,
            }),
        ],
        solver,
    }
}

fn solver2_clique_driver_input() -> ApiInput {
    let mut solver = default_solver_configuration_for(gm_core::models::SolverKind::Solver2);
    solver.seed = Some(191);
    solver.stop_conditions.max_iterations = Some(25);
    solver.move_policy = Some(MovePolicy {
        forced_family: Some(MoveFamily::CliqueSwap),
        ..MovePolicy::default()
    });

    ApiInput {
        initial_schedule: Some(make_initial_schedule(
            &["g0", "g1", "g2"],
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"], vec!["p4", "p5"]],
                vec![vec!["p2", "p3"], vec!["p4", "p5"], vec!["p0", "p1"]],
            ],
        )),
        construction_seed_schedule: None,
        problem: ProblemDefinition {
            people: vec![
                person("p0"),
                person("p1"),
                person("p2"),
                person("p3"),
                person("p4"),
                person("p5"),
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
                Group {
                    id: "g2".to_string(),
                    size: 2,
                    session_sizes: None,
                },
            ],
            num_sessions: 2,
        },
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".to_string(),
            weight: 1.0,
        }],
        constraints: vec![
            Constraint::MustStayTogether {
                people: vec!["p0".to_string(), "p1".to_string()],
                sessions: None,
            },
            Constraint::MustStayTogether {
                people: vec!["p4".to_string(), "p5".to_string()],
                sessions: None,
            },
        ],
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
    let accepted_total = telemetry.moves.swap.accepted
        + telemetry.moves.transfer.accepted
        + telemetry.moves.clique_swap.accepted;
    let accepted_direction_total = telemetry.accepted_downhill_moves
        + telemetry.accepted_uphill_moves
        + telemetry.accepted_neutral_moves;

    assert_eq!(telemetry.reheats_performed, 2);
    assert_eq!(telemetry.stop_reason, StopReason::MaxIterationsReached);
    assert_eq!(telemetry.restart_count, Some(2));
    assert!(telemetry.max_no_improvement_streak >= telemetry.no_improvement_count);
    assert_eq!(accepted_total, accepted_direction_total);
    assert!(telemetry.moves.swap.improving_accepts <= telemetry.moves.swap.accepted);
    assert!(telemetry.moves.transfer.improving_accepts <= telemetry.moves.transfer.accepted);
    assert!(telemetry.moves.clique_swap.improving_accepts <= telemetry.moves.clique_swap.accepted);
    assert!(!telemetry.best_score_timeline.is_empty());
    assert_eq!(telemetry.best_score_timeline[0].iteration, 0);
    assert!(telemetry.iterations_per_second >= 0.0);
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
    assert!(telemetry.perturbation_count.is_none());
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
fn solver3_allowed_sessions_preserve_other_warm_start_sessions() {
    let mut input = solver3_driver_input();
    let initial = input.initial_schedule.clone().expect("warm start present");
    input.solver.allowed_sessions = Some(vec![1]);
    input.solver.stop_conditions.max_iterations = Some(60);

    let result = run_solver(&input).expect("solver3 solve should succeed");

    assert_eq!(result.schedule.get("session_0"), initial.get("session_0"));
    assert_eq!(result.schedule.get("session_2"), initial.get("session_2"));
}

#[test]
fn solver3_runs_exact_raw_sailing_trip_case_without_benchmark_start_substitution() {
    let result = run_solver(&solver3_raw_sailing_trip_input())
        .expect("solver3 should run the exact raw Sailing Trip case");

    assert_eq!(result.effective_seed, Some(7));
    assert!(result.schedule.contains_key("session_0"));
    assert!(result.benchmark_telemetry.is_some());
}

#[test]
fn solver3_time_limit_stop_reason_surfaces_through_result_and_telemetry() {
    let mut input = solver3_driver_input();
    input.solver.stop_conditions.max_iterations = Some(5_000);
    input.solver.stop_conditions.time_limit_seconds = Some(0);

    let result = run_solver(&input).expect("solver3 solve should succeed");
    let telemetry = result
        .benchmark_telemetry
        .clone()
        .expect("benchmark telemetry should be present");

    assert_eq!(result.stop_reason, Some(StopReason::TimeLimitReached));
    assert_eq!(telemetry.stop_reason, StopReason::TimeLimitReached);
}

#[test]
fn solver3_progress_callback_can_request_early_stop() {
    let mut input = solver3_driver_input();
    input.solver.stop_conditions.max_iterations = Some(5_000);

    let calls = Arc::new(Mutex::new(0u32));
    let calls_for_callback = Arc::clone(&calls);
    let callback: ProgressCallback = Box::new(move |_| {
        let mut calls = calls_for_callback.lock().unwrap();
        *calls += 1;
        false
    });

    let result = run_solver_with_progress(&input, Some(&callback)).expect("solver3 should stop");

    assert_eq!(
        result.stop_reason,
        Some(StopReason::ProgressCallbackRequestedStop)
    );
    assert!(*calls.lock().unwrap() >= 1);
}

#[test]
fn solver3_benchmark_observer_receives_started_and_completed_events() {
    let input = solver3_driver_input();

    let events = Arc::new(Mutex::new(Vec::new()));
    let events_clone = Arc::clone(&events);
    let observer: gm_core::models::BenchmarkObserver = Box::new(move |event| {
        events_clone.lock().unwrap().push(event.clone());
    });

    let result = run_solver_with_benchmark_observer(&input, Some(&observer))
        .expect("solver3 benchmark observer solve should succeed");
    let events = events.lock().unwrap().clone();

    assert_eq!(events.len(), 2);

    match &events[0] {
        BenchmarkEvent::RunStarted(started) => {
            assert_eq!(started.effective_seed, 211);
            assert_eq!(started.move_policy.forced_family, Some(MoveFamily::Swap));
        }
        other => panic!("unexpected first benchmark event: {other:?}"),
    }

    let completed = match &events[1] {
        BenchmarkEvent::RunCompleted(completed) => completed,
        other => panic!("unexpected completion benchmark event: {other:?}"),
    };

    assert_eq!(completed.effective_seed, 211);
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
fn solver3_progress_callback_and_benchmark_observer_can_run_together() {
    let input = solver3_driver_input();

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
        .expect("combined solver3 callback solve should succeed");

    assert!(*progress_count.lock().unwrap() >= 1);
    assert_eq!(*benchmark_count.lock().unwrap(), 2);
    assert!(result.benchmark_telemetry.is_some());
}

#[test]
fn solver3_same_seed_runs_remain_deterministic_after_search_changes() {
    let input = solver3_driver_input();

    let result_a = run_solver(&input).expect("first solver3 solve should succeed");
    let result_b = run_solver(&input).expect("second solver3 solve should succeed");

    assert_eq!(result_a.schedule, result_b.schedule);
    assert_eq!(result_a.final_score, result_b.final_score);
    assert_eq!(result_a.effective_seed, Some(211));
    assert_eq!(result_b.effective_seed, Some(211));
    assert_eq!(result_a.stop_reason, result_b.stop_reason);

    let telemetry_a = result_a.benchmark_telemetry.expect("solver3 telemetry a");
    let telemetry_b = result_b.benchmark_telemetry.expect("solver3 telemetry b");
    assert_eq!(
        telemetry_a.moves.swap.attempts,
        telemetry_b.moves.swap.attempts
    );
    assert_eq!(
        telemetry_a.moves.swap.accepted,
        telemetry_b.moves.swap.accepted
    );
    assert_eq!(telemetry_a.moves.transfer.attempts, 0);
    assert_eq!(telemetry_b.moves.transfer.attempts, 0);
    assert_eq!(telemetry_a.moves.clique_swap.attempts, 0);
    assert_eq!(telemetry_b.moves.clique_swap.attempts, 0);
}

#[test]
fn solver3_explicit_default_modes_match_implicit_default_run() {
    let implicit = solver3_driver_input();
    let mut explicit = solver3_driver_input();
    explicit.solver.solver_params = SolverParams::Solver3(Solver3Params {
        search_driver: Solver3SearchDriverParams {
            mode: Solver3SearchDriverMode::SingleState,
            ..Default::default()
        },
        local_improver: Solver3LocalImproverParams {
            mode: Solver3LocalImproverMode::RecordToRecord,
            ..Default::default()
        },
        ..Default::default()
    });

    let implicit_result = run_solver(&implicit).expect("implicit solver3 solve should succeed");
    let explicit_result = run_solver(&explicit).expect("explicit solver3 solve should succeed");

    assert_eq!(implicit_result.schedule, explicit_result.schedule);
    assert_eq!(implicit_result.final_score, explicit_result.final_score);
    assert_eq!(implicit_result.stop_reason, explicit_result.stop_reason);

    let implicit_telemetry = implicit_result
        .benchmark_telemetry
        .expect("implicit telemetry should be present");
    let explicit_telemetry = explicit_result
        .benchmark_telemetry
        .expect("explicit telemetry should be present");
    assert_eq!(
        implicit_telemetry.moves.swap.attempts,
        explicit_telemetry.moves.swap.attempts
    );
    assert_eq!(
        implicit_telemetry.moves.swap.accepted,
        explicit_telemetry.moves.swap.accepted
    );
    assert_eq!(
        implicit_telemetry.moves.swap.rejected,
        explicit_telemetry.moves.swap.rejected
    );
    assert_eq!(
        implicit_telemetry.moves.transfer.attempts,
        explicit_telemetry.moves.transfer.attempts
    );
    assert_eq!(
        implicit_telemetry.moves.clique_swap.attempts,
        explicit_telemetry.moves.clique_swap.attempts
    );
    assert_eq!(
        implicit_telemetry.best_score_timeline,
        explicit_telemetry.best_score_timeline
    );
}

#[test]
fn solver3_sgp_week_pair_tabu_mode_runs_through_public_entry_point() {
    let mut input = solver3_repeat_driver_input();
    input.solver.solver_params = SolverParams::Solver3(Solver3Params {
        local_improver: Solver3LocalImproverParams {
            mode: Solver3LocalImproverMode::SgpWeekPairTabu,
            ..Default::default()
        },
        ..Default::default()
    });

    let result = run_solver(&input).expect("tabu local improver solve should succeed");
    let telemetry = result
        .benchmark_telemetry
        .expect("tabu telemetry should exist");
    assert!(telemetry.sgp_week_pair_tabu.is_some());
}

#[test]
fn solver3_conflict_restricted_tabu_mode_runs_through_public_entry_point() {
    let mut input = solver3_repeat_driver_input();
    input.solver.solver_params = SolverParams::Solver3(Solver3Params {
        local_improver: Solver3LocalImproverParams {
            mode: Solver3LocalImproverMode::SgpWeekPairTabu,
            sgp_week_pair_tabu: Solver3SgpWeekPairTabuParams {
                conflict_restricted_swap_sampling_enabled: true,
                ..Default::default()
            },
        },
        ..Default::default()
    });

    let result = run_solver(&input).expect("conflict-restricted tabu solve should succeed");
    let telemetry = result
        .benchmark_telemetry
        .expect("tabu telemetry should exist");
    assert!(telemetry.sgp_week_pair_tabu.is_some());
}

#[cfg(feature = "solver3-experimental-memetic")]
#[test]
fn solver3_steady_state_memetic_mode_runs_through_public_entry_point() {
    let mut input = solver3_driver_input();
    input.solver.solver_params = SolverParams::Solver3(Solver3Params {
        search_driver: Solver3SearchDriverParams {
            mode: Solver3SearchDriverMode::SteadyStateMemetic,
            ..Default::default()
        },
        ..Default::default()
    });

    let result = run_solver(&input).expect("steady-state memetic solve should succeed");
    let telemetry = result
        .benchmark_telemetry
        .expect("memetic telemetry should exist");

    let memetic = telemetry
        .memetic
        .expect("memetic benchmark telemetry should exist");
    assert!(memetic.population_size >= 2);
    assert!(memetic.offspring_attempted > 0);
    assert!(memetic.offspring_polished > 0);
    assert!(memetic.child_polish_iterations > 0);
}

#[cfg(feature = "solver3-experimental-memetic")]
#[test]
fn solver3_steady_state_memetic_mode_is_seed_stable() {
    let mut input_a = solver3_driver_input();
    input_a.solver.solver_params = SolverParams::Solver3(Solver3Params {
        search_driver: Solver3SearchDriverParams {
            mode: Solver3SearchDriverMode::SteadyStateMemetic,
            ..Default::default()
        },
        ..Default::default()
    });
    let input_b = input_a.clone();

    let result_a = run_solver(&input_a).expect("memetic solve a should succeed");
    let result_b = run_solver(&input_b).expect("memetic solve b should succeed");

    assert_eq!(result_a.final_score, result_b.final_score);
    assert_eq!(result_a.schedule, result_b.schedule);
    assert_eq!(result_a.stop_reason, result_b.stop_reason);

    let telemetry_a = result_a.benchmark_telemetry.expect("memetic telemetry a");
    let telemetry_b = result_b.benchmark_telemetry.expect("memetic telemetry b");
    assert_eq!(
        telemetry_a.best_score_timeline,
        telemetry_b.best_score_timeline
    );
    let mut memetic_a = telemetry_a.memetic.expect("memetic telemetry a details");
    let mut memetic_b = telemetry_b.memetic.expect("memetic telemetry b details");
    memetic_a.child_polish_seconds = 0.0;
    memetic_b.child_polish_seconds = 0.0;
    assert_eq!(memetic_a, memetic_b);
}

#[cfg(feature = "solver3-experimental-memetic")]
#[test]
fn solver3_steady_state_memetic_supports_tabu_child_polish_when_repeat_constraint_exists() {
    let mut input = solver3_repeat_driver_input();
    input.solver.solver_params = SolverParams::Solver3(Solver3Params {
        search_driver: Solver3SearchDriverParams {
            mode: Solver3SearchDriverMode::SteadyStateMemetic,
            ..Default::default()
        },
        local_improver: Solver3LocalImproverParams {
            mode: Solver3LocalImproverMode::SgpWeekPairTabu,
            ..Default::default()
        },
        ..Default::default()
    });

    let result = run_solver(&input).expect("memetic tabu-child solve should succeed");
    let telemetry = result
        .benchmark_telemetry
        .expect("memetic telemetry should exist");
    assert!(telemetry.memetic.is_some());
}

#[cfg(feature = "solver3-experimental-memetic")]
#[test]
fn solver3_steady_state_memetic_rejects_active_cliques() {
    let mut input = solver3_clique_driver_input();
    input.solver.solver_params = SolverParams::Solver3(Solver3Params {
        search_driver: Solver3SearchDriverParams {
            mode: Solver3SearchDriverMode::SteadyStateMemetic,
            ..Default::default()
        },
        ..Default::default()
    });

    let err = run_solver(&input).expect_err("memetic mode should reject active cliques");
    assert!(
        err.to_string()
            .contains("does not yet support active cliques"),
        "unexpected error: {err}"
    );
}

#[cfg(feature = "solver3-experimental-recombination")]
#[test]
fn solver3_donor_session_transplant_mode_runs_through_public_entry_point() {
    let mut input = solver3_repeat_driver_input();
    input.solver.solver_params = SolverParams::Solver3(Solver3Params {
        search_driver: Solver3SearchDriverParams {
            mode: Solver3SearchDriverMode::DonorSessionTransplant,
            donor_session_transplant: Solver3DonorSessionTransplantParams {
                recombination_no_improvement_window: 8,
                recombination_cooldown_window: 8,
                max_recombination_events_per_run: Some(1),
                child_polish_iterations_per_stagnation_window: 16,
                child_polish_no_improvement_iterations_per_stagnation_window: 8,
                child_polish_max_stagnation_windows: 2,
                archive_size: 5,
                ..Default::default()
            },
            ..Default::default()
        },
        local_improver: Solver3LocalImproverParams {
            mode: Solver3LocalImproverMode::SgpWeekPairTabu,
            ..Default::default()
        },
        ..Default::default()
    });

    let result = run_solver(&input).expect("donor-session transplant solve should succeed");
    let telemetry = result
        .benchmark_telemetry
        .expect("donor-session transplant telemetry should exist");
    assert!(telemetry.iterations_completed > 0);
    let donor = telemetry
        .donor_session_transplant
        .expect("donor-session donor telemetry should exist");
    assert!(donor.archive_size >= 1);
}

#[cfg(feature = "solver3-experimental-recombination")]
#[test]
fn solver3_session_aligned_path_relinking_mode_runs_through_public_entry_point() {
    let mut input = solver3_repeat_driver_input();
    input.solver.solver_params = SolverParams::Solver3(Solver3Params {
        search_driver: Solver3SearchDriverParams {
            mode: Solver3SearchDriverMode::SessionAlignedPathRelinking,
            session_aligned_path_relinking: Solver3SessionAlignedPathRelinkingParams {
                recombination_no_improvement_window: 8,
                recombination_cooldown_window: 8,
                max_path_events_per_run: Some(1),
                max_session_imports_per_event: 2,
                path_step_no_improvement_limit: 1,
                child_polish_iterations_per_stagnation_window: 16,
                child_polish_no_improvement_iterations_per_stagnation_window: 8,
                child_polish_max_stagnation_windows: 2,
                archive_size: 5,
                ..Default::default()
            },
            ..Default::default()
        },
        local_improver: Solver3LocalImproverParams {
            mode: Solver3LocalImproverMode::SgpWeekPairTabu,
            ..Default::default()
        },
        ..Default::default()
    });

    let result = run_solver(&input).expect("path relinking solve should succeed");
    let telemetry = result
        .benchmark_telemetry
        .expect("path relinking telemetry should exist");
    assert!(telemetry.iterations_completed > 0);
    assert!(telemetry.session_aligned_path_relinking.is_some());
}

#[cfg(feature = "solver3-experimental-recombination")]
#[test]
fn solver3_random_donor_session_control_runs_through_public_entry_point() {
    let mut input = solver3_repeat_driver_input();
    input.solver.solver_params = SolverParams::Solver3(Solver3Params {
        search_driver: Solver3SearchDriverParams {
            mode: Solver3SearchDriverMode::SessionAlignedPathRelinking,
            session_aligned_path_relinking: Solver3SessionAlignedPathRelinkingParams {
                operator_variant: Solver3PathRelinkingOperatorVariant::RandomDonorSessionControl,
                recombination_no_improvement_window: 8,
                recombination_cooldown_window: 8,
                max_path_events_per_run: Some(1),
                max_session_imports_per_event: 2,
                path_step_no_improvement_limit: 1,
                child_polish_iterations_per_stagnation_window: 16,
                child_polish_no_improvement_iterations_per_stagnation_window: 8,
                child_polish_max_stagnation_windows: 2,
                archive_size: 5,
                ..Default::default()
            },
            ..Default::default()
        },
        local_improver: Solver3LocalImproverParams {
            mode: Solver3LocalImproverMode::SgpWeekPairTabu,
            ..Default::default()
        },
        ..Default::default()
    });

    let result = run_solver(&input).expect("random donor-session control solve should succeed");
    let telemetry = result
        .benchmark_telemetry
        .expect("random donor-session control telemetry should exist");
    assert!(telemetry.iterations_completed > 0);
    let path = telemetry
        .session_aligned_path_relinking
        .expect("path relinking telemetry should exist");
    assert_eq!(
        path.operator_variant,
        Solver3PathRelinkingOperatorVariant::RandomDonorSessionControl
    );
}

#[cfg(feature = "solver3-experimental-recombination")]
#[test]
fn solver3_random_macro_mutation_control_runs_through_public_entry_point() {
    let mut input = solver3_repeat_driver_input();
    input.solver.solver_params = SolverParams::Solver3(Solver3Params {
        search_driver: Solver3SearchDriverParams {
            mode: Solver3SearchDriverMode::SessionAlignedPathRelinking,
            session_aligned_path_relinking: Solver3SessionAlignedPathRelinkingParams {
                operator_variant: Solver3PathRelinkingOperatorVariant::RandomMacroMutationControl,
                recombination_no_improvement_window: 8,
                recombination_cooldown_window: 8,
                max_path_events_per_run: Some(1),
                max_session_imports_per_event: 2,
                path_step_no_improvement_limit: 1,
                child_polish_iterations_per_stagnation_window: 16,
                child_polish_no_improvement_iterations_per_stagnation_window: 8,
                child_polish_max_stagnation_windows: 2,
                archive_size: 5,
                ..Default::default()
            },
            ..Default::default()
        },
        local_improver: Solver3LocalImproverParams {
            mode: Solver3LocalImproverMode::SgpWeekPairTabu,
            ..Default::default()
        },
        ..Default::default()
    });

    let result = run_solver(&input).expect("random macro mutation control solve should succeed");
    let telemetry = result
        .benchmark_telemetry
        .expect("random macro mutation control telemetry should exist");
    assert!(telemetry.iterations_completed > 0);
    let path = telemetry
        .session_aligned_path_relinking
        .expect("path relinking telemetry should exist");
    assert_eq!(
        path.operator_variant,
        Solver3PathRelinkingOperatorVariant::RandomMacroMutationControl
    );
}

#[cfg(feature = "solver3-experimental-recombination")]
#[test]
fn solver3_multi_root_balanced_session_inheritance_runs_through_public_entry_point() {
    let mut input = solver3_repeat_driver_input();
    input.solver.solver_params = SolverParams::Solver3(Solver3Params {
        search_driver: Solver3SearchDriverParams {
            mode: Solver3SearchDriverMode::MultiRootBalancedSessionInheritance,
            multi_root_balanced_session_inheritance:
                Solver3MultiRootBalancedSessionInheritanceParams {
                    root_count: 2,
                    archive_size_per_root: 2,
                    recombination_no_improvement_window: 8,
                    recombination_cooldown_window: 8,
                    max_recombination_events_per_run: Some(1),
                    child_polish_iterations_per_stagnation_window: 16,
                    child_polish_no_improvement_iterations_per_stagnation_window: 8,
                    child_polish_max_stagnation_windows: 2,
                    ..Default::default()
                },
            ..Default::default()
        },
        local_improver: Solver3LocalImproverParams {
            mode: Solver3LocalImproverMode::SgpWeekPairTabu,
            ..Default::default()
        },
        ..Default::default()
    });

    let result = run_solver(&input).expect("multi-root balanced inheritance solve should succeed");
    let telemetry = result
        .benchmark_telemetry
        .expect("multi-root balanced inheritance telemetry should exist");
    assert!(telemetry.iterations_completed > 0);
    assert!(telemetry.multi_root_balanced_session_inheritance.is_some());
}

#[cfg(feature = "solver3-experimental-recombination")]
#[test]
fn solver3_multi_root_balanced_session_inheritance_rejects_active_cliques() {
    let mut input = solver3_clique_driver_input();
    input.solver.solver_params = SolverParams::Solver3(Solver3Params {
        search_driver: Solver3SearchDriverParams {
            mode: Solver3SearchDriverMode::MultiRootBalancedSessionInheritance,
            ..Default::default()
        },
        ..Default::default()
    });

    let err = run_solver(&input)
        .expect_err("multi-root balanced inheritance should reject active cliques");
    assert!(
        err.to_string()
            .contains("does not yet support active cliques"),
        "unexpected error: {err}"
    );
}

#[cfg(feature = "solver3-experimental-recombination")]
#[test]
fn solver3_session_aligned_path_relinking_rejects_active_cliques() {
    let mut input = solver3_clique_driver_input();
    input.solver.solver_params = SolverParams::Solver3(Solver3Params {
        search_driver: Solver3SearchDriverParams {
            mode: Solver3SearchDriverMode::SessionAlignedPathRelinking,
            ..Default::default()
        },
        ..Default::default()
    });

    let err = run_solver(&input).expect_err("path relinking mode should reject active cliques");
    assert!(
        err.to_string()
            .contains("does not yet support active cliques"),
        "unexpected error: {err}"
    );
}

#[cfg(not(feature = "solver3-oracle-checks"))]
#[test]
fn solver3_correctness_lane_requires_solver3_oracle_checks_feature() {
    let mut input = solver3_driver_input();
    input.solver.solver_params = SolverParams::Solver3(Solver3Params {
        correctness_lane: Solver3CorrectnessLaneParams {
            enabled: true,
            sample_every_accepted_moves: 2,
        },
        ..Default::default()
    });

    let err = run_solver(&input).expect_err(
        "solver3 correctness lane should fail when solver3-oracle-checks feature is disabled",
    );
    assert!(
        err.to_string().contains("solver3-oracle-checks"),
        "unexpected error: {err}"
    );
}

#[cfg(not(feature = "solver3-experimental-memetic"))]
#[test]
fn solver3_memetic_mode_requires_feature_through_public_entry_point() {
    let mut input = solver3_driver_input();
    input.solver.solver_params = SolverParams::Solver3(Solver3Params {
        search_driver: Solver3SearchDriverParams {
            mode: Solver3SearchDriverMode::SteadyStateMemetic,
            ..Default::default()
        },
        ..Default::default()
    });

    let err = run_solver(&input).expect_err(
        "steady-state memetic should fail when solver3-experimental-memetic is disabled",
    );
    assert!(
        err.to_string().contains("solver3-experimental-memetic"),
        "unexpected error: {err}"
    );
}

#[cfg(not(feature = "solver3-experimental-recombination"))]
#[test]
fn solver3_recombination_mode_requires_feature_through_public_entry_point() {
    let mut input = solver3_repeat_driver_input();
    input.solver.solver_params = SolverParams::Solver3(Solver3Params {
        search_driver: Solver3SearchDriverParams {
            mode: Solver3SearchDriverMode::DonorSessionTransplant,
            ..Default::default()
        },
        local_improver: Solver3LocalImproverParams {
            mode: Solver3LocalImproverMode::SgpWeekPairTabu,
            ..Default::default()
        },
        ..Default::default()
    });

    let err = run_solver(&input).expect_err(
        "donor-session transplant should fail when solver3-experimental-recombination is disabled",
    );
    assert!(
        err.to_string()
            .contains("solver3-experimental-recombination"),
        "unexpected error: {err}"
    );
}

#[cfg(not(feature = "solver3-experimental-repeat-guidance"))]
#[test]
fn solver3_repeat_guidance_requires_feature_through_public_entry_point() {
    let mut input = solver3_repeat_driver_input();
    input.solver.solver_params = SolverParams::Solver3(Solver3Params {
        hotspot_guidance: Solver3HotspotGuidanceParams {
            repeat_guided_swaps: Solver3RepeatGuidedSwapParams {
                enabled: true,
                guided_proposal_probability: 1.0,
                candidate_preview_budget: 4,
            },
        },
        ..Default::default()
    });

    let err = run_solver(&input).expect_err(
        "repeat guidance should fail when solver3-experimental-repeat-guidance is disabled",
    );
    assert!(
        err.to_string()
            .contains("solver3-experimental-repeat-guidance"),
        "unexpected error: {err}"
    );
}

#[cfg(feature = "solver3-oracle-checks")]
#[test]
fn solver3_correctness_lane_runs_with_feature_enabled() {
    let mut input = solver3_driver_input();
    input.solver.solver_params = SolverParams::Solver3(Solver3Params {
        correctness_lane: Solver3CorrectnessLaneParams {
            enabled: true,
            sample_every_accepted_moves: 1,
        },
        ..Default::default()
    });

    let result = run_solver(&input).expect("solver3 correctness-lane run should succeed");
    assert!(result.benchmark_telemetry.is_some());
}

#[test]
fn solver3_swap_runtime_preview_avoids_full_recompute_per_attempt() {
    let mut input = solver3_driver_input();
    input.solver.stop_conditions.max_iterations = Some(25);

    let result = run_solver(&input).expect("solver3 solve should succeed");
    let telemetry = result
        .benchmark_telemetry
        .expect("benchmark telemetry should be present");

    assert!(telemetry.moves.swap.attempts > 0);
    assert_eq!(telemetry.moves.swap.full_recalculation_count, 0);
    assert_eq!(telemetry.moves.transfer.full_recalculation_count, 0);
    assert_eq!(telemetry.moves.clique_swap.full_recalculation_count, 0);
}

#[test]
fn solver3_transfer_move_policy_only_attempts_transfers() {
    let input = solver3_transfer_driver_input();

    let result = run_solver(&input).expect("solver3 transfer-only solve should succeed");
    let telemetry = result
        .benchmark_telemetry
        .expect("benchmark telemetry should be present");

    assert!(telemetry.moves.transfer.attempts > 0);
    assert_eq!(telemetry.moves.swap.attempts, 0);
    assert_eq!(telemetry.moves.clique_swap.attempts, 0);
}

#[test]
fn solver3_transfer_runtime_preview_avoids_full_recompute_per_attempt() {
    let input = solver3_transfer_driver_input();

    let result = run_solver(&input).expect("solver3 transfer solve should succeed");
    let telemetry = result
        .benchmark_telemetry
        .expect("benchmark telemetry should be present");

    assert!(telemetry.moves.transfer.attempts > 0);
    assert_eq!(telemetry.moves.transfer.full_recalculation_count, 0);
    assert_eq!(telemetry.moves.swap.full_recalculation_count, 0);
    assert_eq!(telemetry.moves.clique_swap.full_recalculation_count, 0);
}

#[test]
fn solver3_clique_swap_move_policy_only_attempts_clique_swaps() {
    let input = solver3_clique_driver_input();

    let result = run_solver(&input).expect("solver3 clique-only solve should succeed");
    let telemetry = result
        .benchmark_telemetry
        .expect("benchmark telemetry should be present");

    assert!(telemetry.moves.clique_swap.attempts > 0);
    assert_eq!(telemetry.moves.swap.attempts, 0);
    assert_eq!(telemetry.moves.transfer.attempts, 0);
}

#[test]
fn solver3_clique_swap_runtime_preview_avoids_full_recompute_per_attempt() {
    let input = solver3_clique_driver_input();

    let result = run_solver(&input).expect("solver3 clique solve should succeed");
    let telemetry = result
        .benchmark_telemetry
        .expect("benchmark telemetry should be present");

    assert!(telemetry.moves.clique_swap.attempts > 0);
    assert_eq!(telemetry.moves.clique_swap.full_recalculation_count, 0);
    assert_eq!(telemetry.moves.swap.full_recalculation_count, 0);
    assert_eq!(telemetry.moves.transfer.full_recalculation_count, 0);
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
fn solver2_same_seed_runs_remain_deterministic_after_runtime_search_changes() {
    let input = solver2_driver_input();

    let result_a = run_solver(&input).expect("first solver2 solve should succeed");
    let result_b = run_solver(&input).expect("second solver2 solve should succeed");

    assert_eq!(result_a.schedule, result_b.schedule);
    assert_eq!(result_a.final_score, result_b.final_score);
    assert_eq!(result_a.effective_seed, Some(97));
    assert_eq!(result_b.effective_seed, Some(97));
    assert_eq!(result_a.stop_reason, result_b.stop_reason);

    let telemetry_a = result_a.benchmark_telemetry.expect("solver2 telemetry a");
    let telemetry_b = result_b.benchmark_telemetry.expect("solver2 telemetry b");
    assert_eq!(
        telemetry_a.moves.swap.attempts,
        telemetry_b.moves.swap.attempts
    );
    assert_eq!(
        telemetry_a.moves.swap.accepted,
        telemetry_b.moves.swap.accepted
    );
    assert_eq!(
        telemetry_a.moves.transfer.attempts,
        telemetry_b.moves.transfer.attempts
    );
    assert_eq!(
        telemetry_a.moves.clique_swap.attempts,
        telemetry_b.moves.clique_swap.attempts
    );
}

#[test]
fn solver2_transfer_runtime_preview_avoids_full_recompute_per_attempt() {
    let input = solver2_transfer_driver_input();
    let result = run_solver(&input).expect("solver2 transfer solve should succeed");
    let telemetry = result
        .benchmark_telemetry
        .expect("benchmark telemetry should be present");

    assert!(telemetry.moves.transfer.attempts > 0);
    assert_eq!(telemetry.moves.transfer.full_recalculation_count, 0);
}

#[test]
fn solver2_clique_swap_runtime_preview_avoids_full_recompute_per_attempt() {
    let input = solver2_clique_driver_input();
    let result = run_solver(&input).expect("solver2 clique solve should succeed");
    let telemetry = result
        .benchmark_telemetry
        .expect("benchmark telemetry should be present");

    assert!(telemetry.moves.clique_swap.attempts > 0);
    assert_eq!(telemetry.moves.clique_swap.full_recalculation_count, 0);
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
