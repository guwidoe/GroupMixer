mod common;

use common::{
    assert_delta_matches_after, assert_state_matches_full_recalculation,
    count_person_occurrences_in_session, default_solver_config, make_initial_schedule,
};
use gm_core::models::{
    ApiInput, AttributeBalanceMode, AttributeBalanceParams, Constraint, Group,
    ImmovablePersonParams, Objective, PairMeetingCountParams, PairMeetingMode, Person,
    ProblemDefinition,
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

fn groups_with_sizes(sizes: &[u32]) -> Vec<Group> {
    sizes
        .iter()
        .enumerate()
        .map(|(idx, &size)| Group {
            id: format!("g{idx}"),
            size,
            session_sizes: None,
        })
        .collect()
}

fn clique_state_with_group_sizes(
    people: Vec<Person>,
    constraints: Vec<Constraint>,
    sessions: Vec<Vec<Vec<&str>>>,
    num_sessions: u32,
    group_sizes: &[u32],
) -> State {
    let mut solver = default_solver_config(1);
    solver.seed = Some(31);

    let group_ids: Vec<String> = (0..group_sizes.len())
        .map(|idx| format!("g{idx}"))
        .collect();
    let group_id_refs: Vec<&str> = group_ids.iter().map(String::as_str).collect();

    let input = ApiInput {
        initial_schedule: Some(make_initial_schedule(&group_id_refs, sessions)),
        problem: ProblemDefinition {
            people,
            groups: groups_with_sizes(group_sizes),
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

fn richer_clique_state(
    people: Vec<Person>,
    constraints: Vec<Constraint>,
    num_sessions: u32,
) -> State {
    let sessions = if num_sessions == 1 {
        vec![vec![vec!["p0", "p1", "p4"], vec!["p2", "p3", "p5"], vec![]]]
    } else {
        vec![
            vec![vec!["p0", "p1", "p4"], vec!["p2", "p3", "p5"], vec![]],
            vec![vec!["p0", "p2", "p4"], vec!["p1", "p3", "p5"], vec![]],
        ]
    };

    clique_state_with_group_sizes(people, constraints, sessions, num_sessions, &[3, 3, 1])
}

fn sequential_clique_state(constraints: Vec<Constraint>) -> State {
    clique_state_with_group_sizes(
        vec![
            person("p0"),
            person("p1"),
            person("p2"),
            person("p3"),
            person("p4"),
            person("p5"),
        ],
        constraints,
        vec![vec![vec!["p0", "p1"], vec!["p2", "p3"], vec!["p4", "p5"]]],
        1,
        &[2, 2, 2],
    )
}

fn clique_state(
    people: Vec<Person>,
    constraints: Vec<Constraint>,
    sessions: Vec<Vec<Vec<&str>>>,
    num_sessions: u32,
) -> State {
    clique_state_with_group_sizes(people, constraints, sessions, num_sessions, &[2, 2, 2])
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

#[test]
fn forbidden_pair_clique_swap_matches_apply_and_recalculation() {
    let mut state = richer_clique_state(
        vec![
            person("p0"),
            person("p1"),
            person("p2"),
            person("p3"),
            person("p4"),
            person("p5"),
        ],
        vec![
            Constraint::MustStayTogether {
                people: vec!["p0".to_string(), "p1".to_string()],
                sessions: None,
            },
            Constraint::ShouldNotBeTogether {
                people: vec!["p0".to_string(), "p5".to_string()],
                penalty_weight: 25.0,
                sessions: None,
            },
        ],
        1,
    );

    let before = state.clone();
    let delta = state.calculate_clique_swap_cost_delta(0, 0, 0, 1, &[2, 3]);
    assert!(delta > 0.0, "expected forbidden-pair violation increase");

    state.apply_clique_swap(0, 0, 0, 1, &[2, 3]);

    assert_eq!(state.forbidden_pair_violations, vec![1]);
    assert_delta_matches_after(&before, &state, delta);
}

#[test]
fn should_together_clique_swap_matches_apply_and_recalculation() {
    let mut state = richer_clique_state(
        vec![
            person("p0"),
            person("p1"),
            person("p2"),
            person("p3"),
            person("p4"),
            person("p5"),
        ],
        vec![
            Constraint::MustStayTogether {
                people: vec!["p0".to_string(), "p1".to_string()],
                sessions: None,
            },
            Constraint::ShouldStayTogether {
                people: vec!["p0".to_string(), "p4".to_string()],
                penalty_weight: 30.0,
                sessions: None,
            },
        ],
        1,
    );

    let before = state.clone();
    let delta = state.calculate_clique_swap_cost_delta(0, 0, 0, 1, &[2, 3]);
    assert!(delta > 0.0, "expected should-together separation increase");

    state.apply_clique_swap(0, 0, 0, 1, &[2, 3]);

    assert_eq!(state.should_together_violations, vec![1]);
    assert_delta_matches_after(&before, &state, delta);
}

#[test]
fn pair_meeting_clique_swap_matches_apply_and_recalculation() {
    let mut state = richer_clique_state(
        vec![
            person("p0"),
            person("p1"),
            person("p2"),
            person("p3"),
            person("p4"),
            person("p5"),
        ],
        vec![
            Constraint::MustStayTogether {
                people: vec!["p0".to_string(), "p1".to_string()],
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
        2,
    );

    let before = state.clone();
    let delta = state.calculate_clique_swap_cost_delta(0, 0, 0, 1, &[2, 3]);
    assert!(delta < 0.0, "expected pair-meeting target improvement");

    state.apply_clique_swap(0, 0, 0, 1, &[2, 3]);

    assert_eq!(state.pairmin_counts, vec![1]);
    assert_delta_matches_after(&before, &state, delta);
}

#[test]
fn attribute_balance_clique_swap_matches_apply_and_recalculation() {
    let mut desired_values = HashMap::new();
    desired_values.insert("red".to_string(), 1);
    desired_values.insert("blue".to_string(), 2);

    let mut state = richer_clique_state(
        vec![
            person_with_attribute("p0", "team", "red"),
            person_with_attribute("p1", "team", "red"),
            person_with_attribute("p2", "team", "blue"),
            person_with_attribute("p3", "team", "blue"),
            person_with_attribute("p4", "team", "red"),
            person_with_attribute("p5", "team", "blue"),
        ],
        vec![
            Constraint::MustStayTogether {
                people: vec!["p0".to_string(), "p1".to_string()],
                sessions: None,
            },
            Constraint::AttributeBalance(AttributeBalanceParams {
                group_id: "g0".to_string(),
                attribute_key: "team".to_string(),
                desired_values,
                penalty_weight: 12.0,
                sessions: None,
                mode: AttributeBalanceMode::Exact,
            }),
        ],
        1,
    );

    let before = state.clone();
    let delta = state.calculate_clique_swap_cost_delta(0, 0, 0, 1, &[2, 3]);
    assert!(
        delta < 0.0,
        "expected clique swap to improve attribute balance"
    );

    state.apply_clique_swap(0, 0, 0, 1, &[2, 3]);

    assert!(state.attribute_balance_penalty < before.attribute_balance_penalty);
    assert_delta_matches_after(&before, &state, delta);
}

#[test]
fn mixed_constraint_clique_swap_preview_matches_apply_and_recalculation() {
    let mut desired_values = HashMap::new();
    desired_values.insert("red".to_string(), 1);
    desired_values.insert("blue".to_string(), 2);

    let mut state = richer_clique_state(
        vec![
            person_with_attribute("p0", "team", "red"),
            person_with_attribute("p1", "team", "red"),
            person_with_attribute("p2", "team", "blue"),
            person_with_attribute("p3", "team", "blue"),
            person_with_attribute("p4", "team", "red"),
            person_with_attribute("p5", "team", "blue"),
        ],
        vec![
            Constraint::MustStayTogether {
                people: vec!["p0".to_string(), "p1".to_string()],
                sessions: None,
            },
            Constraint::ShouldNotBeTogether {
                people: vec!["p0".to_string(), "p5".to_string()],
                penalty_weight: 25.0,
                sessions: None,
            },
            Constraint::ShouldStayTogether {
                people: vec!["p1".to_string(), "p4".to_string()],
                penalty_weight: 30.0,
                sessions: None,
            },
            Constraint::PairMeetingCount(PairMeetingCountParams {
                people: vec!["p0".to_string(), "p5".to_string()],
                sessions: vec![0, 1],
                target_meetings: 1,
                mode: PairMeetingMode::AtLeast,
                penalty_weight: 17.0,
            }),
            Constraint::AttributeBalance(AttributeBalanceParams {
                group_id: "g0".to_string(),
                attribute_key: "team".to_string(),
                desired_values,
                penalty_weight: 12.0,
                sessions: None,
                mode: AttributeBalanceMode::Exact,
            }),
        ],
        2,
    );

    let before = state.clone();
    let delta = state.calculate_clique_swap_cost_delta(0, 0, 0, 1, &[2, 3]);
    assert!(delta.is_finite());

    state.apply_clique_swap(0, 0, 0, 1, &[2, 3]);

    assert_delta_matches_after(&before, &state, delta);
}

#[test]
fn sequential_clique_swaps_do_not_drift_caches() {
    let mut state = sequential_clique_state(vec![
        Constraint::MustStayTogether {
            people: vec!["p0".to_string(), "p1".to_string()],
            sessions: None,
        },
        Constraint::ShouldNotBeTogether {
            people: vec!["p0".to_string(), "p5".to_string()],
            penalty_weight: 20.0,
            sessions: None,
        },
        Constraint::ShouldStayTogether {
            people: vec!["p1".to_string(), "p4".to_string()],
            penalty_weight: 15.0,
            sessions: None,
        },
        Constraint::PairMeetingCount(PairMeetingCountParams {
            people: vec!["p0".to_string(), "p5".to_string()],
            sessions: vec![0],
            target_meetings: 1,
            mode: PairMeetingMode::AtLeast,
            penalty_weight: 11.0,
        }),
    ]);

    state.apply_clique_swap(0, 0, 0, 1, &[2, 3]);
    assert_state_matches_full_recalculation(&state);

    state.apply_clique_swap(0, 0, 1, 2, &[4, 5]);
    assert_state_matches_full_recalculation(&state);
}

#[test]
fn sequential_clique_swap_previews_match_apply_and_recalculation() {
    let mut state = sequential_clique_state(vec![
        Constraint::MustStayTogether {
            people: vec!["p0".to_string(), "p1".to_string()],
            sessions: None,
        },
        Constraint::ShouldNotBeTogether {
            people: vec!["p0".to_string(), "p5".to_string()],
            penalty_weight: 20.0,
            sessions: None,
        },
        Constraint::ShouldStayTogether {
            people: vec!["p1".to_string(), "p4".to_string()],
            penalty_weight: 15.0,
            sessions: None,
        },
        Constraint::PairMeetingCount(PairMeetingCountParams {
            people: vec!["p0".to_string(), "p5".to_string()],
            sessions: vec![0],
            target_meetings: 1,
            mode: PairMeetingMode::AtLeast,
            penalty_weight: 11.0,
        }),
    ]);

    let before_first = state.clone();
    let first_delta = state.calculate_clique_swap_cost_delta(0, 0, 0, 1, &[2, 3]);
    assert!(first_delta.is_finite());
    state.apply_clique_swap(0, 0, 0, 1, &[2, 3]);
    assert_delta_matches_after(&before_first, &state, first_delta);

    let before_second = state.clone();
    let second_delta = state.calculate_clique_swap_cost_delta(0, 0, 1, 2, &[4, 5]);
    assert!(second_delta.is_finite());
    state.apply_clique_swap(0, 0, 1, 2, &[4, 5]);
    assert_delta_matches_after(&before_second, &state, second_delta);
}
