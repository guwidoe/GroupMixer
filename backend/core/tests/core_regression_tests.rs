mod common;

use common::default_solver_config;
use gm_core::models::{
    ApiInput, BenchmarkEvent, Constraint, Group, LoggingOptions, MoveFamily, MovePolicy,
    MoveSelectionMode, Objective, Person, ProblemDefinition, RepeatEncounterParams,
    SimulatedAnnealingParams, SolverConfiguration, SolverParams, StopConditions, StopReason,
};
use gm_core::solver1::search::simulated_annealing::SimulatedAnnealing;
use gm_core::solver1::State;
use gm_core::{
    run_solver, run_solver_with_benchmark_observer, run_solver_with_callbacks,
    run_solver_with_progress,
};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

fn basic_input() -> ApiInput {
    ApiInput {
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
            num_sessions: 2,
        },
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".to_string(),
            weight: 1.0,
        }],
        constraints: vec![Constraint::RepeatEncounter(RepeatEncounterParams {
            max_allowed_encounters: 1,
            penalty_function: "squared".to_string(),
            penalty_weight: 10.0,
        })],
        solver: SolverConfiguration {
            solver_type: "SimulatedAnnealing".to_string(),
            stop_conditions: StopConditions {
                max_iterations: Some(250),
                time_limit_seconds: None,
                no_improvement_iterations: Some(100),
            },
            solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams {
                initial_temperature: 5.0,
                final_temperature: 0.1,
                cooling_schedule: "geometric".to_string(),
                reheat_after_no_improvement: Some(0),
                reheat_cycles: Some(0),
            }),
            logging: LoggingOptions::default(),
            telemetry: Default::default(),
            seed: None,
            move_policy: None,
            allowed_sessions: None,
        },
    }
}

fn warm_start_schedule() -> HashMap<String, HashMap<String, Vec<String>>> {
    HashMap::from([
        (
            "session_0".to_string(),
            HashMap::from([
                ("g0".to_string(), vec!["p0".to_string(), "p1".to_string()]),
                ("g1".to_string(), vec!["p2".to_string(), "p3".to_string()]),
            ]),
        ),
        (
            "session_1".to_string(),
            HashMap::from([
                ("g0".to_string(), vec!["p0".to_string(), "p2".to_string()]),
                ("g1".to_string(), vec!["p1".to_string(), "p3".to_string()]),
            ]),
        ),
    ])
}

fn clique_input() -> ApiInput {
    let mut input = basic_input();
    input.constraints.push(Constraint::MustStayTogether {
        people: vec!["p0".to_string(), "p1".to_string()],
        sessions: None,
    });
    input.solver.stop_conditions.max_iterations = Some(250);
    input.solver.stop_conditions.no_improvement_iterations = Some(100);
    input
}

fn transfer_input() -> ApiInput {
    let mut input = basic_input();
    input.problem.groups.push(Group {
        id: "g2".to_string(),
        size: 2,
        session_sizes: None,
    });
    input
}

#[test]
fn duplicate_person_ids_are_rejected() {
    let mut input = basic_input();
    input.problem.people[1].id = "p0".to_string();

    let error = State::new(&input).unwrap_err().to_string();
    assert!(error.contains("Duplicate person ID: 'p0'"), "{error}");
}

#[test]
fn duplicate_group_ids_are_rejected() {
    let mut input = basic_input();
    input.problem.groups[1].id = "g0".to_string();

    let error = State::new(&input).unwrap_err().to_string();
    assert!(error.contains("Duplicate group ID: 'g0'"), "{error}");
}

#[test]
fn insufficient_group_capacity_is_rejected_with_clear_error() {
    let mut input = basic_input();
    input.problem.groups = vec![Group {
        id: "tiny".to_string(),
        size: 2,
        session_sizes: None,
    }];

    let error = State::new(&input).unwrap_err().to_string();
    assert!(
        error.contains("Not enough group capacity in session 0"),
        "{error}"
    );
    assert!(error.contains("People: 4"), "{error}");
    assert!(error.contains("Capacity: 2"), "{error}");
}

#[test]
fn empty_allowed_sessions_are_rejected() {
    let mut input = basic_input();
    input.solver.allowed_sessions = Some(vec![]);

    let error = State::new(&input).unwrap_err().to_string();
    assert!(
        error.contains("allowed_sessions cannot be empty"),
        "{error}"
    );
}

#[test]
fn invalid_allowed_sessions_are_rejected() {
    let mut input = basic_input();
    input.solver.allowed_sessions = Some(vec![2]);

    let error = State::new(&input).unwrap_err().to_string();
    assert!(
        error.contains("allowed_sessions contains invalid session 2"),
        "{error}"
    );
}

#[test]
fn invalid_person_session_equal_to_num_sessions_is_rejected() {
    let mut input = basic_input();
    input.problem.people[0].sessions = Some(vec![2]);

    let error = State::new(&input).unwrap_err().to_string();
    assert!(
        error.contains("invalid session index: 2 (max: 1)"),
        "{error}"
    );
}

#[test]
fn allowed_sessions_are_sorted_and_deduplicated() {
    let mut input = basic_input();
    input.solver.allowed_sessions = Some(vec![1, 0, 1]);

    let state = State::new(&input).unwrap();
    assert_eq!(state.allowed_sessions, Some(vec![0, 1]));
}

#[test]
fn solver_only_mutates_allowed_sessions_from_warm_start() {
    let mut input = basic_input();
    let initial_schedule = warm_start_schedule();
    input.initial_schedule = Some(initial_schedule.clone());
    input.solver.allowed_sessions = Some(vec![1]);
    input.solver.stop_conditions.max_iterations = Some(500);

    let result = run_solver(&input).expect("warm-start solve should succeed");

    assert_eq!(
        result.schedule.get("session_0"),
        initial_schedule.get("session_0"),
        "session_0 should remain untouched when only session_1 is allowed"
    );
}

#[test]
fn progress_callback_can_stop_solver_early() {
    let mut input = basic_input();
    input.solver.stop_conditions.max_iterations = Some(5_000);

    let iterations = Arc::new(Mutex::new(Vec::new()));
    let iterations_clone = Arc::clone(&iterations);
    let callback: gm_core::models::ProgressCallback = Box::new(move |progress| {
        iterations_clone.lock().unwrap().push(progress.iteration);
        false
    });

    let result =
        run_solver_with_progress(&input, Some(&callback)).expect("solver should stop cleanly");
    let captured = iterations.lock().unwrap();

    assert!(!captured.is_empty(), "callback should have been invoked");
    assert!(captured.iter().copied().max().unwrap() < 5_000);
    assert!(!result.schedule.is_empty());
    assert_eq!(
        result.stop_reason,
        Some(StopReason::ProgressCallbackRequestedStop)
    );
}

#[test]
fn final_progress_update_includes_stop_reason() {
    let mut input = basic_input();
    input.solver.stop_conditions.max_iterations = Some(5_000);

    let last_progress = Arc::new(Mutex::new(None));
    let last_progress_clone = Arc::clone(&last_progress);
    let callback: gm_core::models::ProgressCallback = Box::new(move |progress| {
        *last_progress_clone.lock().unwrap() = Some(progress.clone());
        false
    });

    let _ = run_solver_with_progress(&input, Some(&callback)).expect("solver should stop cleanly");
    let progress = last_progress
        .lock()
        .unwrap()
        .clone()
        .expect("final progress update should be captured");

    assert_eq!(
        progress.stop_reason,
        Some(StopReason::ProgressCallbackRequestedStop)
    );
}

#[test]
fn result_reports_max_iterations_stop_reason() {
    let mut input = basic_input();
    input.solver.stop_conditions.max_iterations = Some(1);
    input.solver.stop_conditions.no_improvement_iterations = None;

    let result = run_solver(&input).expect("solve should succeed");
    assert_eq!(result.stop_reason, Some(StopReason::MaxIterationsReached));
}

#[test]
fn result_reports_no_improvement_stop_reason() {
    let mut input = basic_input();
    input.solver.stop_conditions.max_iterations = Some(500);
    input.solver.stop_conditions.no_improvement_iterations = Some(1);

    let result = run_solver(&input).expect("solve should succeed");
    assert_eq!(
        result.stop_reason,
        Some(StopReason::NoImprovementLimitReached)
    );
}

#[test]
fn result_reports_time_limit_stop_reason() {
    let mut input = basic_input();
    input.solver.stop_conditions.max_iterations = Some(5_000);
    input.solver.stop_conditions.no_improvement_iterations = None;
    input.solver.stop_conditions.time_limit_seconds = Some(0);

    let result = run_solver(&input).expect("solve should succeed");
    assert_eq!(result.stop_reason, Some(StopReason::TimeLimitReached));
}

#[test]
fn benchmark_observer_receives_started_and_completed_events() {
    let mut input = basic_input();
    input.solver.seed = Some(2024);

    let events = Arc::new(Mutex::new(Vec::new()));
    let events_clone = Arc::clone(&events);
    let observer: gm_core::models::BenchmarkObserver = Box::new(move |event| {
        events_clone.lock().unwrap().push(event.clone());
    });

    let result = run_solver_with_benchmark_observer(&input, Some(&observer))
        .expect("solve with benchmark observer should succeed");
    let events = events.lock().unwrap().clone();

    assert_eq!(
        events.len(),
        2,
        "observer should receive start + completion"
    );

    match &events[0] {
        BenchmarkEvent::RunStarted(started) => {
            assert_eq!(started.effective_seed, 2024);
            assert_eq!(started.move_policy, MovePolicy::default());
        }
        other => panic!("unexpected first benchmark event: {other:?}"),
    }

    let completed = match &events[1] {
        BenchmarkEvent::RunCompleted(completed) => completed,
        other => panic!("unexpected completion benchmark event: {other:?}"),
    };

    assert_eq!(completed.effective_seed, 2024);
    assert_eq!(completed.stop_reason, result.stop_reason.unwrap());
    assert!(completed.total_seconds >= 0.0);
    assert!(completed.search_seconds >= 0.0);
    assert!(completed.initialization_seconds >= 0.0);
    assert!(completed.finalization_seconds >= 0.0);
    assert_eq!(
        result
            .benchmark_telemetry
            .as_ref()
            .expect("result telemetry"),
        completed
    );
}

#[test]
fn progress_callback_and_benchmark_observer_can_run_together() {
    let input = basic_input();

    let progress_count = Arc::new(Mutex::new(0usize));
    let progress_count_clone = Arc::clone(&progress_count);
    let progress_callback: gm_core::models::ProgressCallback = Box::new(move |_| {
        *progress_count_clone.lock().unwrap() += 1;
        true
    });

    let benchmark_count = Arc::new(Mutex::new(0usize));
    let benchmark_count_clone = Arc::clone(&benchmark_count);
    let observer: gm_core::models::BenchmarkObserver = Box::new(move |_| {
        *benchmark_count_clone.lock().unwrap() += 1;
    });

    let result = run_solver_with_callbacks(&input, Some(&progress_callback), Some(&observer))
        .expect("combined callback solve should succeed");

    assert!(*progress_count.lock().unwrap() >= 1);
    assert_eq!(*benchmark_count.lock().unwrap(), 2);
    assert!(result.benchmark_telemetry.is_some());
}

#[test]
fn initial_construction_is_deterministic_for_same_seed() {
    let mut input = basic_input();
    input.solver.seed = Some(4242);

    let state_a = State::new(&input).expect("seeded state should build");
    let state_b = State::new(&input).expect("seeded state should build twice");

    assert_eq!(state_a.schedule, state_b.schedule);
    assert_eq!(state_a.effective_seed, 4242);
    assert_eq!(state_b.effective_seed, 4242);
}

#[test]
fn full_solver_run_is_deterministic_for_same_seed() {
    let mut input = basic_input();
    input.solver.seed = Some(777);
    input.solver.stop_conditions.max_iterations = Some(500);
    input.solver.stop_conditions.no_improvement_iterations = Some(200);

    let result_a = run_solver(&input).expect("seeded solve should succeed");
    let result_b = run_solver(&input).expect("seeded solve should be replayable");

    assert_eq!(result_a.schedule, result_b.schedule);
    assert_eq!(result_a.final_score, result_b.final_score);
    assert_eq!(result_a.effective_seed, Some(777));
    assert_eq!(result_b.effective_seed, Some(777));
    assert_eq!(result_a.move_policy, Some(MovePolicy::default()));
    assert_eq!(result_b.move_policy, Some(MovePolicy::default()));
    assert_eq!(result_a.stop_reason, result_b.stop_reason);

    let telemetry_a = result_a
        .benchmark_telemetry
        .as_ref()
        .expect("final result should include benchmark telemetry");
    let telemetry_b = result_b
        .benchmark_telemetry
        .as_ref()
        .expect("final result should include benchmark telemetry");

    assert_eq!(
        telemetry_a.iterations_completed,
        telemetry_b.iterations_completed
    );
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
        telemetry_a.moves.transfer.accepted,
        telemetry_b.moves.transfer.accepted
    );
    assert_eq!(
        telemetry_a.moves.clique_swap.attempts,
        telemetry_b.moves.clique_swap.attempts
    );
    assert_eq!(
        telemetry_a.moves.clique_swap.accepted,
        telemetry_b.moves.clique_swap.accepted
    );
}

#[test]
fn move_policy_is_sorted_and_deduplicated() {
    let mut input = basic_input();
    input.solver.move_policy = Some(MovePolicy {
        allowed_families: Some(vec![
            MoveFamily::Transfer,
            MoveFamily::Swap,
            MoveFamily::Transfer,
        ]),
        ..Default::default()
    });

    let state = State::new(&input).expect("move policy should normalize");
    assert_eq!(
        state.move_policy.allowed_families,
        Some(vec![MoveFamily::Swap, MoveFamily::Transfer])
    );
}

#[test]
fn invalid_weighted_move_policy_is_rejected() {
    let mut input = basic_input();
    input.solver.move_policy = Some(MovePolicy {
        mode: MoveSelectionMode::Weighted,
        ..Default::default()
    });

    let error = State::new(&input).unwrap_err().to_string();
    assert!(
        error.contains("move_policy.mode = 'weighted' requires move_policy.weights"),
        "{error}"
    );
}

#[test]
fn forced_swap_move_policy_only_attempts_swaps() {
    let mut input = basic_input();
    input.solver.seed = Some(11);
    input.solver.move_policy = Some(MovePolicy {
        forced_family: Some(MoveFamily::Swap),
        ..Default::default()
    });

    let result = run_solver(&input).expect("swap-only solve should succeed");
    let telemetry = result
        .benchmark_telemetry
        .expect("benchmark telemetry should be present");

    assert!(telemetry.moves.swap.attempts > 0);
    assert_eq!(telemetry.moves.transfer.attempts, 0);
    assert_eq!(telemetry.moves.clique_swap.attempts, 0);
    assert_eq!(result.move_policy, input.solver.move_policy.clone());
}

#[test]
fn forced_transfer_move_policy_only_attempts_transfers() {
    let mut input = transfer_input();
    input.solver.seed = Some(12);
    input.solver.move_policy = Some(MovePolicy {
        forced_family: Some(MoveFamily::Transfer),
        ..Default::default()
    });

    let result = run_solver(&input).expect("transfer-only solve should succeed");
    let telemetry = result
        .benchmark_telemetry
        .expect("benchmark telemetry should be present");

    assert!(telemetry.moves.transfer.attempts > 0);
    assert_eq!(telemetry.moves.swap.attempts, 0);
    assert_eq!(telemetry.moves.clique_swap.attempts, 0);
}

#[test]
fn forced_clique_move_policy_only_attempts_clique_swaps() {
    let mut input = clique_input();
    input.solver.seed = Some(13);
    input.solver.move_policy = Some(MovePolicy {
        forced_family: Some(MoveFamily::CliqueSwap),
        ..Default::default()
    });

    let result = run_solver(&input).expect("clique-only solve should succeed");
    let telemetry = result
        .benchmark_telemetry
        .expect("benchmark telemetry should be present");

    assert!(telemetry.moves.clique_swap.attempts > 0);
    assert_eq!(telemetry.moves.swap.attempts, 0);
    assert_eq!(telemetry.moves.transfer.attempts, 0);
}

#[test]
fn unknown_solver_type_is_rejected() {
    let mut input = basic_input();
    input.solver.solver_type = "UnknownSolver".to_string();

    let error = run_solver(&input).unwrap_err().to_string();
    assert!(
        error.contains("Unknown solver type") && error.contains("UnknownSolver"),
        "{error}"
    );
}

#[test]
fn validate_no_duplicate_assignments_includes_debug_context() {
    let mut input = basic_input();
    input.solver.logging.debug_dump_invariant_context = true;
    let mut state = State::new(&input).unwrap();

    state.schedule[0][0].push(0);

    let error = state
        .validate_no_duplicate_assignments()
        .unwrap_err()
        .to_string();
    assert!(error.contains("Duplicate assignment detected"), "{error}");
    assert!(error.contains("Slots:"), "{error}");
    assert!(error.contains("locations says:"), "{error}");
}

#[test]
fn display_helpers_prefer_name_and_fallback_cleanly() {
    let input = ApiInput {
        initial_schedule: None,
        construction_seed_schedule: None,
        problem: ProblemDefinition {
            people: vec![
                Person {
                    id: "p0".to_string(),
                    attributes: HashMap::from([("name".to_string(), "Ada Lovelace".to_string())]),
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
        },
        objectives: vec![],
        constraints: vec![],
        solver: default_solver_config(1),
    };

    let state = State::new(&input).unwrap();
    assert_eq!(state.display_person_by_idx(0), "Ada Lovelace (p0)");
    assert_eq!(state.display_person_by_idx(1), "p1");
    assert_eq!(state.display_person_id("p0"), "Ada Lovelace (p0)");
    assert_eq!(state.display_person_id("missing"), "missing");
}

#[test]
fn score_breakdown_reports_clean_and_violating_states() {
    let clean_state = State::new(&basic_input()).unwrap();
    let clean_breakdown = clean_state.format_score_breakdown();
    assert!(clean_breakdown.contains("Constraints: All satisfied"));

    let mut violating_input = basic_input();
    violating_input
        .constraints
        .push(Constraint::ShouldNotBeTogether {
            people: vec!["p0".to_string(), "p1".to_string()],
            penalty_weight: 25.0,
            sessions: None,
        });
    let mut violating_state = State::new(&violating_input).unwrap();
    violating_state.forbidden_pair_violations[0] = 1;
    violating_state.current_cost = 42.0;

    let breakdown = violating_state.format_score_breakdown();
    assert!(breakdown.contains("ShouldNotBeTogether[0]: 1 (weight: 25.0)"));
    assert!(breakdown.contains("Total: 42.00"));
}

#[test]
fn score_breakdown_omits_zero_violations_for_all_constraint_types() {
    let mut input = basic_input();
    input.constraints.push(Constraint::ShouldNotBeTogether {
        people: vec!["p0".to_string(), "p1".to_string()],
        penalty_weight: 25.0,
        sessions: None,
    });
    input.constraints.push(Constraint::ShouldStayTogether {
        people: vec!["p2".to_string(), "p3".to_string()],
        penalty_weight: 15.0,
        sessions: None,
    });
    input.constraints.push(Constraint::MustStayTogether {
        people: vec!["p0".to_string(), "p2".to_string()],
        sessions: None,
    });

    let mut state = State::new(&input).unwrap();
    state.forbidden_pair_violations.fill(0);
    state.should_together_violations.fill(0);
    state.clique_violations.fill(0);
    state.immovable_violations = 0;

    let breakdown = state.format_score_breakdown();

    assert!(breakdown.contains("Constraints: All satisfied"));
    assert!(!breakdown.contains("ShouldNotBeTogether[0]"));
    assert!(!breakdown.contains("ShouldStayTogether[0]"));
    assert!(!breakdown.contains("MustStayTogether[0]"));
    assert!(!breakdown.contains("ImmovablePerson:"));
}

#[test]
fn score_breakdown_includes_positive_violations_for_all_constraint_types() {
    let mut input = basic_input();
    input.constraints.push(Constraint::ShouldNotBeTogether {
        people: vec!["p0".to_string(), "p1".to_string()],
        penalty_weight: 25.0,
        sessions: None,
    });
    input.constraints.push(Constraint::ShouldStayTogether {
        people: vec!["p2".to_string(), "p3".to_string()],
        penalty_weight: 15.0,
        sessions: None,
    });
    input.constraints.push(Constraint::MustStayTogether {
        people: vec!["p0".to_string(), "p2".to_string()],
        sessions: None,
    });

    let mut state = State::new(&input).unwrap();
    state.forbidden_pair_violations[0] = 1;
    state.should_together_violations[0] = 1;
    state.clique_violations[0] = 1;
    state.immovable_violations = 1;
    state.current_cost = 99.0;

    let breakdown = state.format_score_breakdown();

    assert!(breakdown.contains("ShouldNotBeTogether[0]: 1 (weight: 25.0)"));
    assert!(breakdown.contains("ShouldStayTogether[0]: 1 (weight: 15.0)"));
    assert!(breakdown.contains("MustStayTogether[0]: 1 (hard)"));
    assert!(breakdown.contains("ImmovablePerson: 1 (weight: 1000.0)"));
    assert!(!breakdown.contains("Constraints: All satisfied"));
}

#[test]
fn validate_scores_recalculates_cache_and_reports_mismatches() {
    let mut state = State::new(&basic_input()).unwrap();
    let expected_contacts = state.unique_contacts;
    let expected_repetition_penalty = state.repetition_penalty;

    state.unique_contacts += 5;
    state.repetition_penalty += 3;

    let summary = state.validate_scores_summary();

    assert!(!summary.unique_contacts_match);
    assert!(!summary.repetition_penalty_match);
    assert_eq!(state.unique_contacts, expected_contacts);
    assert_eq!(state.repetition_penalty, expected_repetition_penalty);
}

#[test]
fn validate_scores_repairs_cache_via_void_api_too() {
    let mut state = State::new(&basic_input()).unwrap();
    let expected_contacts = state.unique_contacts;
    let expected_repetition_penalty = state.repetition_penalty;

    state.unique_contacts += 7;
    state.repetition_penalty += 4;
    state.validate_scores();

    assert_eq!(state.unique_contacts, expected_contacts);
    assert_eq!(state.repetition_penalty, expected_repetition_penalty);
}

#[test]
fn validate_no_duplicate_assignments_accepts_valid_schedule() {
    let state = State::new(&basic_input()).unwrap();
    assert!(state.validate_no_duplicate_assignments().is_ok());
}

#[test]
fn simulated_annealing_auto_reheat_defaults_without_no_improvement_limit() {
    let config = SolverConfiguration {
        solver_type: "SimulatedAnnealing".to_string(),
        stop_conditions: StopConditions {
            max_iterations: Some(200),
            time_limit_seconds: None,
            no_improvement_iterations: None,
        },
        solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams {
            initial_temperature: 10.0,
            final_temperature: 0.1,
            cooling_schedule: "geometric".to_string(),
            reheat_after_no_improvement: None,
            reheat_cycles: Some(0),
        }),
        logging: LoggingOptions::default(),
        telemetry: Default::default(),
        seed: None,
        move_policy: None,
        allowed_sessions: None,
    };

    let solver = SimulatedAnnealing::new(&config);
    assert_eq!(solver.reheat_after_no_improvement, 20);
}

#[test]
fn simulated_annealing_auto_reheat_is_bounded_by_no_improvement_limit() {
    let config = SolverConfiguration {
        solver_type: "SimulatedAnnealing".to_string(),
        stop_conditions: StopConditions {
            max_iterations: Some(10_000),
            time_limit_seconds: None,
            no_improvement_iterations: Some(120),
        },
        solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams {
            initial_temperature: 10.0,
            final_temperature: 0.1,
            cooling_schedule: "geometric".to_string(),
            reheat_after_no_improvement: None,
            reheat_cycles: Some(0),
        }),
        logging: LoggingOptions::default(),
        telemetry: Default::default(),
        seed: None,
        move_policy: None,
        allowed_sessions: None,
    };

    let solver = SimulatedAnnealing::new(&config);
    assert_eq!(solver.reheat_after_no_improvement, 60);
}

#[test]
fn simulated_annealing_keeps_explicit_zero_reheat_disabled() {
    let config = SolverConfiguration {
        solver_type: "SimulatedAnnealing".to_string(),
        stop_conditions: StopConditions {
            max_iterations: Some(500),
            time_limit_seconds: None,
            no_improvement_iterations: Some(250),
        },
        solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams {
            initial_temperature: 10.0,
            final_temperature: 0.1,
            cooling_schedule: "geometric".to_string(),
            reheat_after_no_improvement: Some(0),
            reheat_cycles: Some(0),
        }),
        logging: LoggingOptions::default(),
        telemetry: Default::default(),
        seed: None,
        move_policy: None,
        allowed_sessions: None,
    };

    let solver = SimulatedAnnealing::new(&config);
    assert_eq!(solver.reheat_after_no_improvement, 0);
}
