use gm_core::models::{ApiInput, Group, Objective, Person, ProblemDefinition, SolverKind};
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
    solver.seed = Some(11);
    solver.stop_conditions.max_iterations = Some(0);
    solver.stop_conditions.time_limit_seconds = None;
    solver.stop_conditions.no_improvement_iterations = None;

    ApiInput {
        initial_schedule: None,
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

#[test]
fn all_solver_families_complete_partial_construction_seed() {
    let seed = HashMap::from([(
        "session_0".to_string(),
        HashMap::from([("g0".to_string(), vec!["p0".to_string()])]),
    )]);

    for kind in [SolverKind::Solver1, SolverKind::Solver3] {
        let mut input = base_input(kind);
        input.construction_seed_schedule = Some(seed.clone());

        let result = run_solver(&input).expect("construction seed should solve");
        let session0 = result.schedule.get("session_0").expect("session_0 present");
        let g0 = session0.get("g0").expect("g0 present");
        assert!(
            g0.contains(&"p0".to_string()),
            "seeded placement must be preserved for {:?}",
            kind
        );

        for session_idx in 0..2 {
            let session = result
                .schedule
                .get(&format!("session_{session_idx}"))
                .expect("session present");
            let mut count = 0;
            for members in session.values() {
                count += members.len();
            }
            assert_eq!(
                count, 4,
                "all people should be assigned in every seeded session"
            );
        }
    }
}

#[test]
fn all_solver_families_reject_both_incumbent_and_construction_seed() {
    let incumbent = HashMap::from([
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
    ]);
    let seed = HashMap::from([(
        "session_0".to_string(),
        HashMap::from([("g0".to_string(), vec!["p0".to_string()])]),
    )]);

    for kind in [SolverKind::Solver1, SolverKind::Solver3] {
        let mut input = base_input(kind);
        input.initial_schedule = Some(incumbent.clone());
        input.construction_seed_schedule = Some(seed.clone());

        let error = run_solver(&input)
            .expect_err("both schedule modes must be rejected")
            .to_string();
        assert!(
            error.contains("both 'initial_schedule' and 'construction_seed_schedule'"),
            "{error}"
        );
    }
}

#[test]
fn construction_seed_truthfully_rejects_immediate_overfill() {
    let seed = HashMap::from([(
        "session_0".to_string(),
        HashMap::from([(
            "g0".to_string(),
            vec!["p0".to_string(), "p1".to_string(), "p2".to_string()],
        )]),
    )]);

    for kind in [SolverKind::Solver1, SolverKind::Solver3] {
        let mut input = base_input(kind);
        input.construction_seed_schedule = Some(seed.clone());
        let error = run_solver(&input)
            .expect_err("overfilled seed must be rejected")
            .to_string();
        assert!(
            error.contains("overfills group 'g0'") || error.contains("overfilled"),
            "{error}"
        );
    }
}
