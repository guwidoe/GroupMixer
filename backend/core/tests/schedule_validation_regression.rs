use gm_core::models::{
    ApiInput, Constraint, Group, ImmovablePersonParams, Objective, Person, ProblemDefinition,
};
use gm_core::solver_support::validation::{
    validate_schedule_as_construction_seed, validate_schedule_as_incumbent,
};
use std::collections::HashMap;

fn person(id: &str) -> Person {
    Person {
        id: id.to_string(),
        attributes: HashMap::new(),
        sessions: None,
    }
}

fn base_input() -> ApiInput {
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
        solver: gm_core::default_solver_configuration(),
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

#[test]
fn incumbent_validator_accepts_complete_valid_schedule() {
    let input = base_input();
    validate_schedule_as_incumbent(&input, &valid_schedule()).expect("warm start should validate");
}

#[test]
fn incumbent_validator_rejects_partial_schedule_but_seed_validator_accepts_it() {
    let input = base_input();
    let partial = HashMap::from([(
        "session_0".to_string(),
        HashMap::from([("g0".to_string(), vec!["p0".to_string()])]),
    )]);

    let error = validate_schedule_as_incumbent(&input, &partial)
        .expect_err("partial warm start must be rejected")
        .to_string();
    assert!(error.contains("must define all 2 sessions explicitly"), "{error}");

    validate_schedule_as_construction_seed(&input, &partial)
        .expect("partial construction seed should validate structurally");
}

#[test]
fn incumbent_validator_rejects_split_clique_schedule() {
    let mut input = base_input();
    input.constraints.push(Constraint::MustStayTogether {
        people: vec!["p0".to_string(), "p1".to_string()],
        sessions: None,
    });
    let schedule = HashMap::from([
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

    let error = validate_schedule_as_incumbent(&input, &schedule)
        .expect_err("split clique warm start must be rejected")
        .to_string();
    assert!(error.contains("must-stay-together clique"), "{error}");
}

#[test]
fn incumbent_validator_rejects_immovable_violation() {
    let mut input = base_input();
    input.constraints.push(Constraint::ImmovablePerson(ImmovablePersonParams {
        person_id: "p0".to_string(),
        group_id: "g1".to_string(),
        sessions: Some(vec![0]),
    }));

    let error = validate_schedule_as_incumbent(&input, &valid_schedule())
        .expect_err("immovable violation should be rejected")
        .to_string();
    assert!(error.contains("immovable person 'p0'"), "{error}");
}
