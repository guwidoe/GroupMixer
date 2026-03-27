mod common;

use common::{
    assert_delta_matches_after, count_person_occurrences_in_session, default_solver_config,
    make_initial_schedule,
};
use solver_core::models::{
    ApiInput, Constraint, Group, ImmovablePersonParams, Objective, Person, ProblemDefinition,
};
use solver_core::solver::State;
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

fn groups() -> Vec<Group> {
    vec![
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
    ]
}

fn clique_state(
    people: Vec<Person>,
    constraints: Vec<Constraint>,
    sessions: Vec<Vec<Vec<&str>>>,
    num_sessions: u32,
) -> State {
    let mut solver = default_solver_config(1);
    solver.seed = Some(31);

    let input = ApiInput {
        initial_schedule: Some(make_initial_schedule(&["g0", "g1", "g2"], sessions)),
        problem: ProblemDefinition {
            people,
            groups: groups(),
            num_sessions,
        },
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".to_string(),
            weight: 1.0,
        }],
        constraints,
        solver,
    };

    State::new(&input).expect("state should build")
}

#[test]
fn inactive_session_clique_swap_is_rejected() {
    let state = clique_state(
        vec![person("p0"), person("p1"), person("p2"), person("p3")],
        vec![Constraint::MustStayTogether {
            people: vec!["p0".to_string(), "p1".to_string()],
            sessions: Some(vec![0]),
        }],
        vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"], vec![]],
            vec![vec!["p0", "p1"], vec!["p2", "p3"], vec![]],
        ],
        2,
    );

    assert!(!state.is_clique_swap_feasible(1, 0, 0, 1));
    let delta = state.calculate_clique_swap_cost_delta(1, 0, 0, 1, &[2, 3]);
    assert!(delta.is_infinite());
}

#[test]
fn partial_participation_clique_swap_moves_only_active_members() {
    let mut state = clique_state(
        vec![
            person("p0"),
            person_with_sessions("p1", vec![0]),
            person("p2"),
            person("p3"),
        ],
        vec![Constraint::MustStayTogether {
            people: vec!["p0".to_string(), "p1".to_string()],
            sessions: None,
        }],
        vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"], vec![]],
            vec![vec!["p0"], vec!["p2", "p3"], vec![]],
        ],
        2,
    );

    let before = state.clone();
    let delta = state.calculate_clique_swap_cost_delta(1, 0, 0, 1, &[2]);
    assert!(delta.is_finite());

    state.apply_clique_swap(1, 0, 0, 1, &[2]);

    assert_delta_matches_after(&before, &state, delta);
    assert_eq!(count_person_occurrences_in_session(&state, 1, "p1"), 0);
    assert_eq!(state.locations[1][state.person_id_to_idx["p0"]].0, 1);
    assert_eq!(state.locations[1][state.person_id_to_idx["p2"]].0, 0);
}

#[test]
fn immovable_clique_member_blocks_clique_swap() {
    let mut state = clique_state(
        vec![person("p0"), person("p1"), person("p2"), person("p3")],
        vec![
            Constraint::MustStayTogether {
                people: vec!["p0".to_string(), "p1".to_string()],
                sessions: None,
            },
            Constraint::ImmovablePerson(ImmovablePersonParams {
                person_id: "p0".to_string(),
                group_id: "g0".to_string(),
                sessions: Some(vec![0]),
            }),
        ],
        vec![vec![vec!["p0", "p1"], vec!["p2", "p3"], vec![]]],
        1,
    );
    let before = state.clone();

    assert!(!state.is_clique_swap_feasible(0, 0, 0, 1));
    let delta = state.calculate_clique_swap_cost_delta(0, 0, 0, 1, &[2, 3]);
    assert!(delta.is_infinite());

    state.apply_clique_swap(0, 0, 0, 1, &[2, 3]);

    assert_eq!(state.schedule, before.schedule);
    assert_eq!(state.current_cost, before.current_cost);
}

#[test]
fn immovable_target_member_blocks_clique_swap() {
    let mut state = clique_state(
        vec![person("p0"), person("p1"), person("p2"), person("p3")],
        vec![
            Constraint::MustStayTogether {
                people: vec!["p0".to_string(), "p1".to_string()],
                sessions: None,
            },
            Constraint::ImmovablePerson(ImmovablePersonParams {
                person_id: "p2".to_string(),
                group_id: "g1".to_string(),
                sessions: Some(vec![0]),
            }),
        ],
        vec![vec![vec!["p0", "p1"], vec!["p2", "p3"], vec![]]],
        1,
    );
    let before = state.clone();

    let delta = state.calculate_clique_swap_cost_delta(0, 0, 0, 1, &[2, 3]);
    assert!(delta.is_infinite());

    state.apply_clique_swap(0, 0, 0, 1, &[2, 3]);

    assert_eq!(state.schedule, before.schedule);
    assert_eq!(state.current_cost, before.current_cost);
}

#[test]
fn insufficient_target_people_and_size_mismatch_do_not_mutate_state() {
    let mut state = clique_state(
        vec![person("p0"), person("p1"), person("p2"), person("p3")],
        vec![Constraint::MustStayTogether {
            people: vec!["p0".to_string(), "p1".to_string()],
            sessions: None,
        }],
        vec![vec![vec!["p0", "p1"], vec!["p2"], vec!["p3"]]],
        1,
    );
    let before = state.clone();

    assert!(!state.is_clique_swap_feasible(0, 0, 0, 1));
    state.apply_clique_swap(0, 0, 0, 2, &[3]);

    assert_eq!(state.schedule, before.schedule);
    assert_eq!(state.current_cost, before.current_cost);
}

#[test]
fn accepted_clique_swap_matches_full_recalculation() {
    let mut state = clique_state(
        vec![person("p0"), person("p1"), person("p2"), person("p3")],
        vec![Constraint::MustStayTogether {
            people: vec!["p0".to_string(), "p1".to_string()],
            sessions: None,
        }],
        vec![vec![vec!["p0", "p1"], vec!["p2", "p3"], vec![]]],
        1,
    );

    let before = state.clone();
    let delta = state.calculate_clique_swap_cost_delta(0, 0, 0, 1, &[2, 3]);
    assert!(delta.is_finite());

    state.apply_clique_swap(0, 0, 0, 1, &[2, 3]);

    assert_delta_matches_after(&before, &state, delta);
}
