mod common;

use common::{assert_delta_matches_after, default_solver_config, make_initial_schedule};
use solver_core::models::{
    ApiInput, AttributeBalanceMode, AttributeBalanceParams, Constraint, Group,
    ImmovablePersonParams, Objective, PairMeetingCountParams, PairMeetingMode, Person,
    ProblemDefinition,
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

fn person_with_attribute(id: &str, key: &str, value: &str) -> Person {
    Person {
        id: id.to_string(),
        attributes: HashMap::from([(key.to_string(), value.to_string())]),
        sessions: None,
    }
}

fn transfer_state(
    people: Vec<Person>,
    groups: Vec<Group>,
    constraints: Vec<Constraint>,
    sessions: Vec<Vec<Vec<&str>>>,
) -> State {
    let mut solver = default_solver_config(1);
    solver.seed = Some(23);

    let group_ids = groups
        .iter()
        .map(|group| group.id.as_str())
        .collect::<Vec<_>>();

    let input = ApiInput {
        initial_schedule: Some(make_initial_schedule(&group_ids, sessions)),
        problem: ProblemDefinition {
            people,
            groups,
            num_sessions: 1,
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

fn groups_3x2() -> Vec<Group> {
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

#[test]
fn target_full_transfer_is_rejected() {
    let mut state = transfer_state(
        vec![person("p0"), person("p1"), person("p2"), person("p3")],
        groups_3x2(),
        vec![],
        vec![vec![vec!["p0", "p1"], vec!["p2", "p3"], vec![]]],
    );
    let before = state.clone();

    let p2 = state.person_id_to_idx["p2"];
    assert!(!state.is_transfer_feasible(0, p2, 1, 0));
    let delta = state.calculate_transfer_cost_delta(0, p2, 1, 0);
    assert!(delta.is_infinite());

    state.apply_transfer(0, p2, 1, 0);

    assert_eq!(state.schedule, before.schedule);
    assert_eq!(state.current_cost, before.current_cost);
}

#[test]
fn source_singleton_transfer_is_rejected() {
    let mut state = transfer_state(
        vec![person("p0"), person("p1"), person("p2"), person("p3")],
        groups_3x2(),
        vec![],
        vec![vec![vec!["p0"], vec!["p1", "p2"], vec!["p3"]]],
    );
    let before = state.clone();

    let p0 = state.person_id_to_idx["p0"];
    assert!(!state.is_transfer_feasible(0, p0, 0, 2));
    let delta = state.calculate_transfer_cost_delta(0, p0, 0, 2);
    assert!(delta.is_infinite());

    state.apply_transfer(0, p0, 0, 2);

    assert_eq!(state.schedule, before.schedule);
    assert_eq!(state.current_cost, before.current_cost);
}

#[test]
fn clique_member_transfer_is_rejected() {
    let mut state = transfer_state(
        vec![person("p0"), person("p1"), person("p2"), person("p3")],
        groups_3x2(),
        vec![Constraint::MustStayTogether {
            people: vec!["p0".to_string(), "p1".to_string()],
            sessions: None,
        }],
        vec![vec![vec!["p0", "p1"], vec!["p2"], vec!["p3"]]],
    );
    let before = state.clone();

    let p0 = state.person_id_to_idx["p0"];
    assert!(!state.is_transfer_feasible(0, p0, 0, 1));
    let delta = state.calculate_transfer_cost_delta(0, p0, 0, 1);
    assert!(delta.is_infinite());

    state.apply_transfer(0, p0, 0, 1);

    assert_eq!(state.schedule, before.schedule);
    assert_eq!(state.current_cost, before.current_cost);
}

#[test]
fn immovable_transfer_is_rejected() {
    let mut state = transfer_state(
        vec![person("p0"), person("p1"), person("p2"), person("p3")],
        groups_3x2(),
        vec![Constraint::ImmovablePerson(ImmovablePersonParams {
            person_id: "p0".to_string(),
            group_id: "g0".to_string(),
            sessions: Some(vec![0]),
        })],
        vec![vec![vec!["p0", "p1"], vec!["p2"], vec!["p3"]]],
    );
    let before = state.clone();

    let p0 = state.person_id_to_idx["p0"];
    assert!(!state.is_transfer_feasible(0, p0, 0, 1));
    let delta = state.calculate_transfer_cost_delta(0, p0, 0, 1);
    assert!(delta.is_infinite());

    state.apply_transfer(0, p0, 0, 1);

    assert_eq!(state.schedule, before.schedule);
    assert_eq!(state.current_cost, before.current_cost);
}

#[test]
fn attribute_balance_transfer_delta_matches_apply_and_recalculation() {
    let mut desired_values = HashMap::new();
    desired_values.insert("red".to_string(), 1);
    desired_values.insert("blue".to_string(), 1);

    let mut state = transfer_state(
        vec![
            person_with_attribute("p0", "team", "red"),
            person_with_attribute("p1", "team", "red"),
            person_with_attribute("p2", "team", "blue"),
            person_with_attribute("p3", "team", "blue"),
        ],
        groups_3x2(),
        vec![Constraint::AttributeBalance(AttributeBalanceParams {
            group_id: "g1".to_string(),
            attribute_key: "team".to_string(),
            desired_values,
            penalty_weight: 9.0,
            sessions: None,
            mode: AttributeBalanceMode::Exact,
        })],
        vec![vec![vec!["p0", "p1"], vec!["p2"], vec!["p3"]]],
    );

    let before = state.clone();
    let p1 = state.person_id_to_idx["p1"];
    let delta = state.calculate_transfer_cost_delta(0, p1, 0, 1);
    assert!(
        delta < 0.0,
        "expected transfer to improve target-group balance"
    );

    state.apply_transfer(0, p1, 0, 1);

    assert_delta_matches_after(&before, &state, delta);
}

#[test]
fn pair_meeting_transfer_delta_matches_apply_and_recalculation() {
    let mut solver = default_solver_config(1);
    solver.seed = Some(29);

    let groups = vec![
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
    ];
    let group_ids = groups
        .iter()
        .map(|group| group.id.as_str())
        .collect::<Vec<_>>();

    let input = ApiInput {
        initial_schedule: Some(make_initial_schedule(
            &group_ids,
            vec![
                vec![vec!["p0", "p1", "p4"], vec!["p2", "p3"], vec![]],
                vec![vec!["p0", "p4"], vec!["p1", "p2"], vec!["p3"]],
            ],
        )),
        problem: ProblemDefinition {
            people: vec![
                person("p0"),
                person("p1"),
                person("p2"),
                person("p3"),
                person("p4"),
            ],
            groups,
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
    };

    let mut state = State::new(&input).expect("state should build");
    let before = state.clone();
    let p1 = state.person_id_to_idx["p1"];
    let delta = state.calculate_transfer_cost_delta(1, p1, 1, 0);
    assert!(
        delta < 0.0,
        "expected transfer to satisfy pair meeting target"
    );

    state.apply_transfer(1, p1, 1, 0);

    assert_delta_matches_after(&before, &state, delta);
}
