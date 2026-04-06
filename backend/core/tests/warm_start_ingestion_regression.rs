use gm_core::models::{
    ApiInput, Constraint, Group, Objective, Person, ProblemDefinition, SolverKind,
};
use gm_core::{default_solver_configuration_for, run_solver};
use std::collections::HashMap;

fn person(id: &str) -> Person {
    Person {
        id: id.to_string(),
        attributes: HashMap::new(),
        sessions: None,
    }
}

fn base_input(solver_kind: SolverKind) -> ApiInput {
    let mut solver = default_solver_configuration_for(solver_kind);
    solver.seed = Some(7);
    solver.stop_conditions.max_iterations = Some(0);
    solver.stop_conditions.time_limit_seconds = None;
    solver.stop_conditions.no_improvement_iterations = None;

    ApiInput {
        initial_schedule: None,
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
            num_sessions: 2,
        },
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".to_string(),
            weight: 1.0,
        }],
        constraints: vec![],
        solver,
    }
}

fn valid_schedule() -> HashMap<String, HashMap<String, Vec<String>>> {
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

fn assert_invalid_warm_start_rejected(kind: SolverKind, schedule: HashMap<String, HashMap<String, Vec<String>>>, needle: &str) {
    let mut input = base_input(kind);
    input.initial_schedule = Some(schedule);
    input.constraints.push(Constraint::MustStayTogether {
        people: vec!["p0".to_string(), "p1".to_string()],
        sessions: None,
    });

    let error = run_solver(&input)
        .expect_err("invalid warm start must be rejected")
        .to_string();
    assert!(error.contains(needle), "{error}");
}

#[test]
fn all_solver_families_accept_valid_incumbent_warm_start_exactly() {
    for kind in [SolverKind::Solver1, SolverKind::Solver2, SolverKind::Solver3] {
        let mut input = base_input(kind);
        let schedule = valid_schedule();
        input.initial_schedule = Some(schedule.clone());

        let result = run_solver(&input).expect("valid warm start should solve");
        assert_eq!(result.schedule, schedule, "solver {:?} changed exact incumbent at iteration 0", kind);
    }
}

#[test]
fn all_solver_families_reject_partial_incumbent_warm_start() {
    let partial = HashMap::from([(
        "session_0".to_string(),
        HashMap::from([("g0".to_string(), vec!["p0".to_string()])]),
    )]);

    for kind in [SolverKind::Solver1, SolverKind::Solver2, SolverKind::Solver3] {
        let mut input = base_input(kind);
        input.initial_schedule = Some(partial.clone());
        let error = run_solver(&input)
            .expect_err("partial warm start must be rejected")
            .to_string();
        assert!(error.contains("must define all 2 sessions explicitly"), "{error}");
    }
}

#[test]
fn all_solver_families_reject_split_clique_incumbent_warm_start() {
    let split = HashMap::from([
        (
            "session_0".to_string(),
            HashMap::from([
                ("g0".to_string(), vec!["p0".to_string(), "p2".to_string()]),
                ("g1".to_string(), vec!["p1".to_string(), "p3".to_string()]),
            ]),
        ),
        (
            "session_1".to_string(),
            HashMap::from([
                ("g0".to_string(), vec!["p0".to_string(), "p1".to_string()]),
                ("g1".to_string(), vec!["p2".to_string(), "p3".to_string()]),
            ]),
        ),
    ]);

    for kind in [SolverKind::Solver1, SolverKind::Solver2, SolverKind::Solver3] {
        assert_invalid_warm_start_rejected(kind, split.clone(), "must-stay-together clique");
    }
}
