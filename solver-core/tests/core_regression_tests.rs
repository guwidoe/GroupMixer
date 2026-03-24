mod common;

use common::default_solver_config;
use solver_core::algorithms::simulated_annealing::SimulatedAnnealing;
use solver_core::models::{
    ApiInput, Constraint, Group, LoggingOptions, Objective, Person, ProblemDefinition,
    RepeatEncounterParams, SimulatedAnnealingParams, SolverConfiguration, SolverParams,
    StopConditions,
};
use solver_core::solver::State;
use solver_core::{run_solver, run_solver_with_progress};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

fn basic_input() -> ApiInput {
    ApiInput {
        initial_schedule: None,
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
                },
                Group {
                    id: "g1".to_string(),
                    size: 2,
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
    }];

    let error = State::new(&input).unwrap_err().to_string();
    assert!(error.contains("Not enough group capacity for all people"), "{error}");
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
    let callback: solver_core::models::ProgressCallback = Box::new(move |progress| {
        iterations_clone.lock().unwrap().push(progress.iteration);
        false
    });

    let result =
        run_solver_with_progress(&input, Some(&callback)).expect("solver should stop cleanly");
    let captured = iterations.lock().unwrap();

    assert!(!captured.is_empty(), "callback should have been invoked");
    assert!(captured.iter().copied().max().unwrap() < 5_000);
    assert!(!result.schedule.is_empty());
}

#[test]
fn unknown_solver_type_is_rejected() {
    let mut input = basic_input();
    input.solver.solver_type = "UnknownSolver".to_string();

    let error = run_solver(&input).unwrap_err().to_string();
    assert!(
        error.contains("Unknown solver type: UnknownSolver"),
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
        allowed_sessions: None,
    };

    let solver = SimulatedAnnealing::new(&config);
    assert_eq!(solver.reheat_after_no_improvement, 0);
}
