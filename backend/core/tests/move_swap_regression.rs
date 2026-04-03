mod common;

use common::{assert_delta_matches_after, default_solver_config, make_initial_schedule};
use gm_core::models::{
    ApiInput, AttributeBalanceMode, AttributeBalanceParams, Constraint, Group, Objective,
    PairMeetingCountParams, PairMeetingMode, Person, ProblemDefinition,
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

fn person_with_attribute(id: &str, key: &str, value: &str) -> Person {
    Person {
        id: id.to_string(),
        attributes: HashMap::from([(key.to_string(), value.to_string())]),
        sessions: None,
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
    ]
}

fn single_session_swap_state(constraints: Vec<Constraint>) -> State {
    let input = ApiInput {
        initial_schedule: Some(make_initial_schedule(
            &["g0", "g1"],
            vec![vec![vec!["p0", "p1"], vec!["p2", "p3"]]],
        )),
        problem: ProblemDefinition {
            people: vec![person("p0"), person("p1"), person("p2"), person("p3")],
            groups: groups(),
            num_sessions: 1,
        },
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".to_string(),
            weight: 1.0,
        }],
        constraints,
        solver: {
            let mut solver = default_solver_config(1);
            solver.seed = Some(7);
            solver
        },
    };

    State::new(&input).expect("state should build")
}

#[test]
fn same_group_noop_returns_zero_and_apply_is_noop() {
    let mut state = single_session_swap_state(vec![]);
    let before = state.clone();

    let delta = state.calculate_swap_cost_delta(0, 0, 1);
    assert_eq!(delta, 0.0);

    state.apply_swap(0, 0, 1);

    assert_eq!(state.schedule, before.schedule);
    assert_eq!(state.locations, before.locations);
    assert_eq!(state.current_cost, before.current_cost);
}

#[test]
fn non_participant_swap_returns_infinity_and_apply_is_noop() {
    let mut solver = default_solver_config(1);
    solver.seed = Some(11);

    let input = ApiInput {
        initial_schedule: Some(make_initial_schedule(
            &["g0", "g1"],
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p1"], vec!["p2"]],
            ],
        )),
        problem: ProblemDefinition {
            people: vec![
                person("p0"),
                person("p1"),
                person("p2"),
                person_with_sessions("p3", vec![0]),
            ],
            groups: groups(),
            num_sessions: 2,
        },
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".to_string(),
            weight: 1.0,
        }],
        constraints: vec![],
        solver,
    };

    let mut state = State::new(&input).expect("state should build");
    let before = state.clone();

    let p0 = state.person_id_to_idx["p0"];
    let p3 = state.person_id_to_idx["p3"];
    let delta = state.calculate_swap_cost_delta(1, p0, p3);
    assert!(delta.is_infinite());

    state.apply_swap(1, p0, p3);

    assert_eq!(state.schedule, before.schedule);
    assert_eq!(state.locations, before.locations);
    assert_eq!(state.current_cost, before.current_cost);
}

#[test]
fn forbidden_pair_delta_matches_apply_and_recalculation() {
    let mut state = single_session_swap_state(vec![Constraint::ShouldNotBeTogether {
        people: vec!["p0".to_string(), "p2".to_string()],
        penalty_weight: 25.0,
        sessions: None,
    }]);

    let before = state.clone();
    let p1 = state.person_id_to_idx["p1"];
    let p2 = state.person_id_to_idx["p2"];
    let delta = state.calculate_swap_cost_delta(0, p1, p2);
    assert!(
        delta > 0.0,
        "expected forbidden-pair violation cost increase"
    );

    state.apply_swap(0, p1, p2);

    assert_delta_matches_after(&before, &state, delta);
}

#[test]
fn should_together_delta_matches_apply_and_recalculation() {
    let mut state = single_session_swap_state(vec![Constraint::ShouldStayTogether {
        people: vec!["p0".to_string(), "p1".to_string()],
        penalty_weight: 30.0,
        sessions: None,
    }]);

    let before = state.clone();
    let p1 = state.person_id_to_idx["p1"];
    let p2 = state.person_id_to_idx["p2"];
    let delta = state.calculate_swap_cost_delta(0, p1, p2);
    assert!(
        delta > 0.0,
        "expected should-together separation cost increase"
    );

    state.apply_swap(0, p1, p2);

    assert_delta_matches_after(&before, &state, delta);
}

#[test]
fn attribute_balance_delta_matches_apply_and_recalculation() {
    let mut desired_values = HashMap::new();
    desired_values.insert("red".to_string(), 1);
    desired_values.insert("blue".to_string(), 1);

    let mut solver = default_solver_config(1);
    solver.seed = Some(5);
    let input = ApiInput {
        initial_schedule: Some(make_initial_schedule(
            &["g0", "g1"],
            vec![vec![vec!["p0", "p1"], vec!["p2", "p3"]]],
        )),
        problem: ProblemDefinition {
            people: vec![
                person_with_attribute("p0", "team", "red"),
                person_with_attribute("p1", "team", "red"),
                person_with_attribute("p2", "team", "blue"),
                person_with_attribute("p3", "team", "blue"),
            ],
            groups: groups(),
            num_sessions: 1,
        },
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".to_string(),
            weight: 1.0,
        }],
        constraints: vec![Constraint::AttributeBalance(AttributeBalanceParams {
            group_id: "g0".to_string(),
            attribute_key: "team".to_string(),
            desired_values,
            penalty_weight: 12.0,
            sessions: None,
            mode: AttributeBalanceMode::Exact,
        })],
        solver,
    };

    let mut state = State::new(&input).expect("state should build");
    let before = state.clone();
    let p1 = state.person_id_to_idx["p1"];
    let p2 = state.person_id_to_idx["p2"];
    let delta = state.calculate_swap_cost_delta(0, p1, p2);
    assert!(delta < 0.0, "expected swap to improve balance");

    state.apply_swap(0, p1, p2);

    assert_delta_matches_after(&before, &state, delta);
}

#[test]
fn pair_meeting_delta_matches_apply_and_recalculation() {
    let mut solver = default_solver_config(1);
    solver.seed = Some(19);

    let input = ApiInput {
        initial_schedule: Some(make_initial_schedule(
            &["g0", "g1"],
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            ],
        )),
        problem: ProblemDefinition {
            people: vec![person("p0"), person("p1"), person("p2"), person("p3")],
            groups: groups(),
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
            penalty_weight: 17.0,
        })],
        solver,
    };

    let mut state = State::new(&input).expect("state should build");
    let before = state.clone();
    let p2 = state.person_id_to_idx["p2"];
    let p1 = state.person_id_to_idx["p1"];
    let delta = state.calculate_swap_cost_delta(1, p2, p1);
    assert!(delta < 0.0, "expected swap to satisfy pair-meeting target");

    state.apply_swap(1, p2, p1);

    assert_delta_matches_after(&before, &state, delta);
}
