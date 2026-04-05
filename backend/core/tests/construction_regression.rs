mod common;

use common::{count_person_occurrences_in_session, default_solver_config};
use gm_core::models::{
    ApiInput, Constraint, Group, ImmovablePersonParams, Objective, Person, ProblemDefinition,
};
use gm_core::solver1::State;
use std::collections::HashMap;

fn person(id: &str) -> Person {
    Person {
        id: id.to_string(),
        attributes: HashMap::new(),
        sessions: None,
    }
}

fn person_with_sessions(id: &str, sessions: Vec<u32>) -> Person {
    Person {
        id: id.to_string(),
        attributes: HashMap::new(),
        sessions: Some(sessions),
    }
}

fn construction_input() -> ApiInput {
    let mut solver = default_solver_config(1);
    solver.seed = Some(41);

    ApiInput {
        initial_schedule: None,
        problem: ProblemDefinition {
            people: vec![
                person("p0"),
                person("p1"),
                person("p2"),
                person("p3"),
                person("p4"),
                person_with_sessions("p5", vec![0]),
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
            Constraint::ImmovablePerson(ImmovablePersonParams {
                person_id: "p2".to_string(),
                group_id: "g2".to_string(),
                sessions: Some(vec![0]),
            }),
        ],
        solver,
    }
}

#[test]
fn seeded_random_initialization_is_repeatable() {
    let input = construction_input();

    let state_a = State::new(&input).expect("first state should build");
    let state_b = State::new(&input).expect("second state should build");

    assert_eq!(state_a.schedule, state_b.schedule);
}

#[test]
fn construction_places_immovable_people_in_required_group() {
    let input = construction_input();
    let state = State::new(&input).expect("state should build");

    let p2 = state.person_id_to_idx["p2"];
    let g2 = state.group_id_to_idx["g2"];
    assert_eq!(state.locations[0][p2].0, g2);
}

#[test]
fn construction_keeps_clique_members_together_when_active() {
    let input = construction_input();
    let state = State::new(&input).expect("state should build");

    let p0 = state.person_id_to_idx["p0"];
    let p1 = state.person_id_to_idx["p1"];
    for day in 0..state.num_sessions as usize {
        assert_eq!(state.locations[day][p0].0, state.locations[day][p1].0);
    }
}

#[test]
fn construction_omits_non_participants_from_inactive_sessions() {
    let input = construction_input();
    let state = State::new(&input).expect("state should build");

    assert_eq!(count_person_occurrences_in_session(&state, 1, "p5"), 0);
    assert!(state.person_participation[state.person_id_to_idx["p5"]][0]);
    assert!(!state.person_participation[state.person_id_to_idx["p5"]][1]);
}

#[test]
fn construction_assigns_clique_ids_in_sorted_member_order() {
    let mut solver = default_solver_config(1);
    solver.seed = Some(99);

    let input = ApiInput {
        initial_schedule: None,
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
            num_sessions: 1,
        },
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".to_string(),
            weight: 1.0,
        }],
        constraints: vec![
            Constraint::MustStayTogether {
                people: vec!["p4".to_string(), "p5".to_string()],
                sessions: None,
            },
            Constraint::MustStayTogether {
                people: vec!["p0".to_string(), "p1".to_string()],
                sessions: None,
            },
            Constraint::MustStayTogether {
                people: vec!["p2".to_string(), "p3".to_string()],
                sessions: None,
            },
        ],
        solver,
    };

    let state = State::new(&input).expect("state should build");

    let p0 = state.person_id_to_idx["p0"];
    let p1 = state.person_id_to_idx["p1"];
    let p2 = state.person_id_to_idx["p2"];
    let p3 = state.person_id_to_idx["p3"];
    let p4 = state.person_id_to_idx["p4"];
    let p5 = state.person_id_to_idx["p5"];

    assert_eq!(
        state.cliques,
        vec![vec![p0, p1], vec![p2, p3], vec![p4, p5]]
    );
    assert_eq!(state.person_to_clique_id[0][p0], Some(0));
    assert_eq!(state.person_to_clique_id[0][p2], Some(1));
    assert_eq!(state.person_to_clique_id[0][p4], Some(2));
    assert_eq!(state.person_to_clique_id[0][p5], Some(2));
}

#[test]
fn construction_propagates_immovable_assignment_to_clique_members() {
    let mut solver = default_solver_config(1);
    solver.seed = Some(7);

    let input = ApiInput {
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
        constraints: vec![
            Constraint::MustStayTogether {
                people: vec!["p0".to_string(), "p1".to_string()],
                sessions: None,
            },
            Constraint::ImmovablePerson(ImmovablePersonParams {
                person_id: "p0".to_string(),
                group_id: "g1".to_string(),
                sessions: Some(vec![1]),
            }),
        ],
        solver,
    };

    let state = State::new(&input).expect("state should build");

    let p0 = state.person_id_to_idx["p0"];
    let p1 = state.person_id_to_idx["p1"];
    let g1 = state.group_id_to_idx["g1"];

    assert_eq!(state.locations[0][p0].0, state.locations[0][p1].0);
    assert_eq!(state.locations[1][p0].0, g1);
    assert_eq!(state.locations[1][p1].0, g1);

    let clique_id = state.person_to_clique_id[0][p0].expect("p0 should belong to a clique");
    assert_eq!(state.clique_sessions[clique_id], Some(vec![0]));
}

#[test]
fn construction_handles_sparse_participation_for_partially_active_clique() {
    let mut solver = default_solver_config(1);
    solver.seed = Some(21);

    let input = ApiInput {
        initial_schedule: None,
        problem: ProblemDefinition {
            people: vec![
                person_with_sessions("p0", vec![0, 1]),
                person_with_sessions("p1", vec![0]),
                person("p2"),
                person("p3"),
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
        constraints: vec![Constraint::MustStayTogether {
            people: vec!["p0".to_string(), "p1".to_string()],
            sessions: None,
        }],
        solver,
    };

    let state = State::new(&input).expect("state should build");

    let p0 = state.person_id_to_idx["p0"];
    let p1 = state.person_id_to_idx["p1"];

    assert_eq!(state.locations[0][p0].0, state.locations[0][p1].0);
    assert_eq!(count_person_occurrences_in_session(&state, 1, "p1"), 0);
    assert_eq!(count_person_occurrences_in_session(&state, 1, "p0"), 1);
}

#[test]
fn construction_hard_fails_when_immovable_constraints_overfill_group() {
    let mut solver = default_solver_config(1);
    solver.seed = Some(5);

    let input = ApiInput {
        initial_schedule: None,
        problem: ProblemDefinition {
            people: vec![person("p0"), person("p1")],
            groups: vec![
                Group {
                    id: "g0".to_string(),
                    size: 1,
                    session_sizes: None,
                },
                Group {
                    id: "g1".to_string(),
                    size: 1,
                    session_sizes: None,
                },
            ],
            num_sessions: 1,
        },
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".to_string(),
            weight: 1.0,
        }],
        constraints: vec![
            Constraint::ImmovablePerson(ImmovablePersonParams {
                person_id: "p0".to_string(),
                group_id: "g0".to_string(),
                sessions: Some(vec![0]),
            }),
            Constraint::ImmovablePerson(ImmovablePersonParams {
                person_id: "p1".to_string(),
                group_id: "g0".to_string(),
                sessions: Some(vec![0]),
            }),
        ],
        solver,
    };

    let error = State::new(&input)
        .expect_err("state construction should fail")
        .to_string();
    assert!(
        error.contains("Cannot place immovable person: group g0 is full"),
        "unexpected validation error: {error}"
    );
}

#[test]
fn construction_hard_fails_when_active_clique_cannot_fit_any_group() {
    let mut solver = default_solver_config(1);
    solver.seed = Some(11);

    let input = ApiInput {
        initial_schedule: None,
        problem: ProblemDefinition {
            people: vec![person("p0"), person("p1"), person("p2")],
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
            num_sessions: 1,
        },
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".to_string(),
            weight: 1.0,
        }],
        constraints: vec![Constraint::MustStayTogether {
            people: vec!["p0".to_string(), "p1".to_string(), "p2".to_string()],
            sessions: None,
        }],
        solver,
    };

    let error = State::new(&input)
        .expect_err("state construction should fail")
        .to_string();
    assert!(
        error.contains("Could not place clique"),
        "unexpected validation error: {error}"
    );
}
