mod common;

use common::{count_person_occurrences_in_session, default_solver_config};
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
                },
                Group {
                    id: "g1".to_string(),
                    size: 2,
                },
                Group {
                    id: "g2".to_string(),
                    size: 2,
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
