use std::collections::HashMap;

use crate::models::{
    ApiInput, AttributeBalanceMode, AttributeBalanceParams, Constraint, Group,
    ImmovablePersonParams, Objective, PairMeetingCountParams, PairMeetingMode, Person,
    ProblemDefinition, Solver2Params, SolverConfiguration, SolverParams, StopConditions,
};

use super::compiled_problem::CompiledProblem;
use super::moves::clique_swap::{
    analyze_clique_swap, apply_clique_swap, preview_clique_swap, CliqueSwapFeasibility,
    CliqueSwapMove,
};
use super::moves::swap::{analyze_swap, apply_swap, preview_swap, SwapFeasibility, SwapMove};
use super::moves::transfer::{
    analyze_transfer, apply_transfer, preview_transfer, TransferFeasibility, TransferMove,
};
use super::scoring::recompute_full_score;
use super::validation::invariants::validate_state_invariants;
use super::validation::parity::{compare_against_solver1, compare_state_against_solver1};
use super::SolutionState;

fn solver2_config_for_sessions(num_sessions: u32) -> SolverConfiguration {
    SolverConfiguration {
        solver_type: "solver2".to_string(),
        stop_conditions: StopConditions {
            max_iterations: Some(10),
            time_limit_seconds: None,
            no_improvement_iterations: None,
        },
        solver_params: SolverParams::Solver2(Solver2Params::default()),
        logging: Default::default(),
        telemetry: Default::default(),
        seed: Some(123),
        move_policy: None,
        allowed_sessions: Some((0..num_sessions).collect()),
    }
}

fn representative_input() -> ApiInput {
    let mut people = Vec::new();
    for idx in 0..6 {
        let mut attributes = HashMap::new();
        attributes.insert(
            "role".to_string(),
            if idx % 2 == 0 { "red" } else { "blue" }.to_string(),
        );
        let sessions = if idx == 5 { Some(vec![1, 2]) } else { None };
        people.push(Person {
            id: format!("p{}", idx),
            attributes,
            sessions,
        });
    }

    let groups = vec![
        Group {
            id: "g0".to_string(),
            size: 3,
            session_sizes: None,
        },
        Group {
            id: "g1".to_string(),
            size: 3,
            session_sizes: None,
        },
    ];

    let mut initial_schedule = HashMap::new();
    initial_schedule.insert(
        "session_0".to_string(),
        HashMap::from([
            ("g0".to_string(), vec!["p0".to_string(), "p1".to_string()]),
            ("g1".to_string(), vec!["p2".to_string(), "p3".to_string()]),
        ]),
    );
    initial_schedule.insert(
        "session_1".to_string(),
        HashMap::from([
            ("g0".to_string(), vec!["p0".to_string(), "p1".to_string()]),
            ("g1".to_string(), vec!["p2".to_string(), "p4".to_string()]),
        ]),
    );
    initial_schedule.insert(
        "session_2".to_string(),
        HashMap::from([
            ("g0".to_string(), vec!["p0".to_string(), "p2".to_string()]),
            ("g1".to_string(), vec!["p1".to_string(), "p3".to_string()]),
        ]),
    );

    ApiInput {
        problem: ProblemDefinition {
            people,
            groups,
            num_sessions: 3,
        },
        initial_schedule: Some(initial_schedule),
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".to_string(),
            weight: 1.0,
        }],
        constraints: vec![
            Constraint::RepeatEncounter(crate::models::RepeatEncounterParams {
                max_allowed_encounters: 1,
                penalty_function: "squared".to_string(),
                penalty_weight: 10.0,
            }),
            Constraint::AttributeBalance(AttributeBalanceParams {
                group_id: "ALL".to_string(),
                attribute_key: "role".to_string(),
                desired_values: HashMap::from([("red".to_string(), 1), ("blue".to_string(), 1)]),
                penalty_weight: 2.0,
                mode: AttributeBalanceMode::Exact,
                sessions: Some(vec![0, 1, 2]),
            }),
            Constraint::MustStayTogether {
                people: vec!["p0".to_string(), "p1".to_string()],
                sessions: Some(vec![0, 1]),
            },
            Constraint::ShouldNotBeTogether {
                people: vec!["p2".to_string(), "p3".to_string()],
                penalty_weight: 7.0,
                sessions: Some(vec![0]),
            },
            Constraint::ShouldStayTogether {
                people: vec!["p4".to_string(), "p5".to_string()],
                penalty_weight: 5.0,
                sessions: Some(vec![1, 2]),
            },
            Constraint::ImmovablePerson(ImmovablePersonParams {
                person_id: "p4".to_string(),
                group_id: "g1".to_string(),
                sessions: Some(vec![1]),
            }),
            Constraint::PairMeetingCount(PairMeetingCountParams {
                people: vec!["p2".to_string(), "p5".to_string()],
                sessions: vec![1, 2],
                target_meetings: 1,
                mode: PairMeetingMode::Exact,
                penalty_weight: 3.0,
            }),
        ],
        solver: solver2_config_for_sessions(3),
    }
}

fn deterministic_input_without_initial_schedule() -> ApiInput {
    let mut input = representative_input();
    input.initial_schedule = None;
    input
}

fn transfer_input() -> ApiInput {
    ApiInput {
        problem: ProblemDefinition {
            people: vec![
                Person {
                    id: "p0".to_string(),
                    attributes: HashMap::from([("role".to_string(), "eng".to_string())]),
                    sessions: None,
                },
                Person {
                    id: "p1".to_string(),
                    attributes: HashMap::from([("role".to_string(), "eng".to_string())]),
                    sessions: None,
                },
                Person {
                    id: "p2".to_string(),
                    attributes: HashMap::from([("role".to_string(), "design".to_string())]),
                    sessions: None,
                },
                Person {
                    id: "p3".to_string(),
                    attributes: HashMap::from([("role".to_string(), "design".to_string())]),
                    sessions: None,
                },
                Person {
                    id: "p4".to_string(),
                    attributes: HashMap::from([("role".to_string(), "pm".to_string())]),
                    sessions: None,
                },
            ],
            groups: vec![
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
            ],
            num_sessions: 2,
        },
        initial_schedule: Some(HashMap::from([
            (
                "session_0".to_string(),
                HashMap::from([
                    (
                        "g0".to_string(),
                        vec!["p0".to_string(), "p1".to_string(), "p4".to_string()],
                    ),
                    ("g1".to_string(), vec!["p2".to_string(), "p3".to_string()]),
                    ("g2".to_string(), Vec::new()),
                ]),
            ),
            (
                "session_1".to_string(),
                HashMap::from([
                    ("g0".to_string(), vec!["p0".to_string(), "p4".to_string()]),
                    ("g1".to_string(), vec!["p1".to_string(), "p2".to_string()]),
                    ("g2".to_string(), vec!["p3".to_string()]),
                ]),
            ),
        ])),
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".to_string(),
            weight: 1.0,
        }],
        constraints: vec![
            Constraint::RepeatEncounter(crate::models::RepeatEncounterParams {
                max_allowed_encounters: 1,
                penalty_function: "linear".to_string(),
                penalty_weight: 7.0,
            }),
            Constraint::PairMeetingCount(PairMeetingCountParams {
                people: vec!["p0".to_string(), "p1".to_string()],
                sessions: vec![0, 1],
                target_meetings: 2,
                mode: PairMeetingMode::AtLeast,
                penalty_weight: 13.0,
            }),
            Constraint::AttributeBalance(AttributeBalanceParams {
                group_id: "g0".to_string(),
                attribute_key: "role".to_string(),
                desired_values: HashMap::from([("eng".to_string(), 2), ("pm".to_string(), 1)]),
                penalty_weight: 9.0,
                sessions: None,
                mode: AttributeBalanceMode::Exact,
            }),
        ],
        solver: solver2_config_for_sessions(2),
    }
}

fn transfer_sequential_input() -> ApiInput {
    ApiInput {
        problem: ProblemDefinition {
            people: vec![
                Person {
                    id: "p0".to_string(),
                    attributes: HashMap::from([("team".to_string(), "red".to_string())]),
                    sessions: None,
                },
                Person {
                    id: "p1".to_string(),
                    attributes: HashMap::from([("team".to_string(), "red".to_string())]),
                    sessions: None,
                },
                Person {
                    id: "p2".to_string(),
                    attributes: HashMap::from([("team".to_string(), "blue".to_string())]),
                    sessions: None,
                },
                Person {
                    id: "p3".to_string(),
                    attributes: HashMap::from([("team".to_string(), "blue".to_string())]),
                    sessions: None,
                },
                Person {
                    id: "p4".to_string(),
                    attributes: HashMap::from([("team".to_string(), "blue".to_string())]),
                    sessions: None,
                },
            ],
            groups: vec![
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
            ],
            num_sessions: 2,
        },
        initial_schedule: Some(HashMap::from([
            (
                "session_0".to_string(),
                HashMap::from([
                    ("g0".to_string(), vec!["p0".to_string(), "p1".to_string()]),
                    ("g1".to_string(), vec!["p2".to_string()]),
                    ("g2".to_string(), vec!["p3".to_string(), "p4".to_string()]),
                ]),
            ),
            (
                "session_1".to_string(),
                HashMap::from([
                    ("g0".to_string(), vec!["p0".to_string(), "p2".to_string()]),
                    ("g1".to_string(), vec!["p1".to_string()]),
                    ("g2".to_string(), vec!["p3".to_string(), "p4".to_string()]),
                ]),
            ),
        ])),
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".to_string(),
            weight: 1.0,
        }],
        constraints: vec![
            Constraint::RepeatEncounter(crate::models::RepeatEncounterParams {
                max_allowed_encounters: 1,
                penalty_function: "linear".to_string(),
                penalty_weight: 7.0,
            }),
            Constraint::ShouldNotBeTogether {
                people: vec!["p0".to_string(), "p2".to_string()],
                penalty_weight: 13.0,
                sessions: Some(vec![1]),
            },
            Constraint::ShouldStayTogether {
                people: vec!["p3".to_string(), "p4".to_string()],
                penalty_weight: 17.0,
                sessions: None,
            },
            Constraint::AttributeBalance(AttributeBalanceParams {
                group_id: "g1".to_string(),
                attribute_key: "team".to_string(),
                desired_values: HashMap::from([("red".to_string(), 1), ("blue".to_string(), 1)]),
                penalty_weight: 9.0,
                sessions: None,
                mode: AttributeBalanceMode::Exact,
            }),
            Constraint::PairMeetingCount(PairMeetingCountParams {
                people: vec!["p0".to_string(), "p2".to_string()],
                sessions: vec![0, 1],
                target_meetings: 1,
                mode: PairMeetingMode::Exact,
                penalty_weight: 19.0,
            }),
        ],
        solver: solver2_config_for_sessions(2),
    }
}

fn clique_swap_input() -> ApiInput {
    ApiInput {
        problem: ProblemDefinition {
            people: vec![
                Person {
                    id: "p0".to_string(),
                    attributes: HashMap::from([("team".to_string(), "red".to_string())]),
                    sessions: None,
                },
                Person {
                    id: "p1".to_string(),
                    attributes: HashMap::from([("team".to_string(), "red".to_string())]),
                    sessions: None,
                },
                Person {
                    id: "p2".to_string(),
                    attributes: HashMap::from([("team".to_string(), "blue".to_string())]),
                    sessions: None,
                },
                Person {
                    id: "p3".to_string(),
                    attributes: HashMap::from([("team".to_string(), "blue".to_string())]),
                    sessions: None,
                },
                Person {
                    id: "p4".to_string(),
                    attributes: HashMap::from([("team".to_string(), "red".to_string())]),
                    sessions: None,
                },
                Person {
                    id: "p5".to_string(),
                    attributes: HashMap::from([("team".to_string(), "blue".to_string())]),
                    sessions: None,
                },
            ],
            groups: vec![
                Group {
                    id: "g0".to_string(),
                    size: 3,
                    session_sizes: None,
                },
                Group {
                    id: "g1".to_string(),
                    size: 3,
                    session_sizes: None,
                },
                Group {
                    id: "g2".to_string(),
                    size: 1,
                    session_sizes: None,
                },
            ],
            num_sessions: 2,
        },
        initial_schedule: Some(HashMap::from([
            (
                "session_0".to_string(),
                HashMap::from([
                    (
                        "g0".to_string(),
                        vec!["p0".to_string(), "p1".to_string(), "p4".to_string()],
                    ),
                    (
                        "g1".to_string(),
                        vec!["p2".to_string(), "p3".to_string(), "p5".to_string()],
                    ),
                    ("g2".to_string(), Vec::new()),
                ]),
            ),
            (
                "session_1".to_string(),
                HashMap::from([
                    (
                        "g0".to_string(),
                        vec!["p0".to_string(), "p1".to_string(), "p4".to_string()],
                    ),
                    (
                        "g1".to_string(),
                        vec!["p2".to_string(), "p3".to_string(), "p5".to_string()],
                    ),
                    ("g2".to_string(), Vec::new()),
                ]),
            ),
        ])),
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".to_string(),
            weight: 1.0,
        }],
        constraints: vec![
            Constraint::RepeatEncounter(crate::models::RepeatEncounterParams {
                max_allowed_encounters: 1,
                penalty_function: "linear".to_string(),
                penalty_weight: 7.0,
            }),
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
                desired_values: HashMap::from([("red".to_string(), 1), ("blue".to_string(), 2)]),
                penalty_weight: 12.0,
                sessions: None,
                mode: AttributeBalanceMode::Exact,
            }),
        ],
        solver: solver2_config_for_sessions(2),
    }
}

fn sequential_clique_swap_input() -> ApiInput {
    ApiInput {
        problem: ProblemDefinition {
            people: (0..6)
                .map(|idx| Person {
                    id: format!("p{}", idx),
                    attributes: HashMap::new(),
                    sessions: None,
                })
                .collect(),
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
        initial_schedule: Some(HashMap::from([(
            "session_0".to_string(),
            HashMap::from([
                ("g0".to_string(), vec!["p0".to_string(), "p1".to_string()]),
                ("g1".to_string(), vec!["p2".to_string(), "p3".to_string()]),
                ("g2".to_string(), vec!["p4".to_string(), "p5".to_string()]),
            ]),
        )])),
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".to_string(),
            weight: 1.0,
        }],
        constraints: vec![
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
        ],
        solver: solver2_config_for_sessions(1),
    }
}

#[test]
fn compiled_problem_builds_explicit_indexes_and_initial_schedule() {
    let input = representative_input();
    let compiled = CompiledProblem::compile(&input).unwrap();

    assert_eq!(compiled.num_people, 6);
    assert_eq!(compiled.num_groups, 2);
    assert_eq!(compiled.num_sessions, 3);
    assert_eq!(compiled.person_id_to_idx["p0"], 0);
    assert_eq!(compiled.group_id_to_idx["g1"], 1);
    assert!(compiled.attr_key_to_idx.contains_key("role"));
    assert_eq!(compiled.cliques.len(), 1);
    assert_eq!(compiled.forbidden_pairs.len(), 1);
    assert_eq!(compiled.should_together_pairs.len(), 1);
    assert_eq!(compiled.immovable_assignments.len(), 1);
    assert_eq!(compiled.pair_meeting_constraints.len(), 1);
    assert_eq!(compiled.allowed_sessions, Some(vec![0, 1, 2]));
    assert!(compiled.compiled_initial_schedule.is_some());
}

#[test]
fn solution_state_initialization_is_deterministic_and_valid() {
    let input = deterministic_input_without_initial_schedule();

    let first = SolutionState::from_input(&input).unwrap();
    let second = SolutionState::from_input(&input).unwrap();

    assert_eq!(first.schedule, second.schedule);
    assert_eq!(first.locations, second.locations);
    validate_state_invariants(&first).unwrap();
    compare_state_against_solver1(&input, &first).unwrap();
}

#[test]
fn recompute_full_score_matches_solver1_on_representative_case() {
    let input = representative_input();
    let state = SolutionState::from_input(&input).unwrap();
    let recomputed = recompute_full_score(&state).unwrap();

    assert_eq!(state.current_score, recomputed);
    compare_against_solver1(&input).unwrap();
}

#[test]
fn invariant_validation_rejects_split_cliques() {
    let input = representative_input();
    let mut state = SolutionState::from_input(&input).unwrap();

    let person_idx = state.compiled_problem.person_id_to_idx["p1"];
    let target_group = state.compiled_problem.group_id_to_idx["g1"];
    let source_group = state.compiled_problem.group_id_to_idx["g0"];

    state.schedule[0][source_group].retain(|&member| member != person_idx);
    state.schedule[0][target_group].push(person_idx);

    for (position_idx, &member) in state.schedule[0][source_group].iter().enumerate() {
        state.locations[0][member] = Some((source_group, position_idx));
    }
    for (position_idx, &member) in state.schedule[0][target_group].iter().enumerate() {
        state.locations[0][member] = Some((target_group, position_idx));
    }

    let error = validate_state_invariants(&state).unwrap_err().to_string();
    assert!(error.contains("clique"));
    assert!(error.contains("session 0"));
}

#[test]
fn swap_analysis_reports_explicit_affected_region() {
    let input = representative_input();
    let state = SolutionState::from_input(&input).unwrap();
    let swap = SwapMove::new(
        2,
        state.compiled_problem.person_id_to_idx["p0"],
        state.compiled_problem.person_id_to_idx["p5"],
    );

    let analysis = analyze_swap(&state, &swap).unwrap();
    assert_eq!(analysis.feasibility, SwapFeasibility::Feasible);
    assert_eq!(analysis.affected_region.touched_session, Some(2));
    assert_eq!(analysis.affected_region.touched_groups, vec![0, 1]);
    assert_eq!(analysis.affected_region.touched_people, vec![0, 5]);
    assert!(!analysis
        .affected_region
        .touched_should_together_constraints
        .is_empty());
    assert!(!analysis
        .affected_region
        .touched_pair_meeting_constraints
        .is_empty());
    assert!(!analysis
        .affected_region
        .touched_attribute_balance_constraints
        .is_empty());
}

#[test]
fn swap_preview_matches_apply_and_solver1_parity() {
    let input = representative_input();
    let mut state = SolutionState::from_input(&input).unwrap();
    let swap = SwapMove::new(
        2,
        state.compiled_problem.person_id_to_idx["p0"],
        state.compiled_problem.person_id_to_idx["p5"],
    );

    let before_score = state.current_score.total_score;
    let preview = preview_swap(&state, &swap).unwrap();
    apply_swap(&mut state, &swap).unwrap();

    assert_eq!(state.current_score, preview.after_score);
    assert_eq!(preview.before_score.total_score, before_score);
    assert_eq!(
        preview.delta_cost,
        state.current_score.total_score - preview.before_score.total_score
    );
    validate_state_invariants(&state).unwrap();
    let recomputed = recompute_full_score(&state).unwrap();
    assert_eq!(state.current_score, recomputed);
    compare_state_against_solver1(&input, &state).unwrap();
}

#[test]
fn swap_same_group_is_a_noop() {
    let input = representative_input();
    let mut state = SolutionState::from_input(&input).unwrap();
    let swap = SwapMove::new(
        0,
        state.compiled_problem.person_id_to_idx["p0"],
        state.compiled_problem.person_id_to_idx["p1"],
    );

    let before = state.clone();
    let analysis = analyze_swap(&state, &swap).unwrap();
    assert_eq!(analysis.feasibility, SwapFeasibility::SameGroupNoop);

    let preview = preview_swap(&state, &swap).unwrap();
    assert_eq!(preview.delta_cost, 0.0);

    apply_swap(&mut state, &swap).unwrap();
    assert_eq!(state.schedule, before.schedule);
    assert_eq!(state.locations, before.locations);
    assert_eq!(state.current_score, before.current_score);
}

#[test]
fn swap_rejects_immovable_people_and_active_clique_members() {
    let input = representative_input();
    let mut state = SolutionState::from_input(&input).unwrap();

    let immovable_swap = SwapMove::new(
        1,
        state.compiled_problem.person_id_to_idx["p4"],
        state.compiled_problem.person_id_to_idx["p0"],
    );
    let immovable_error = apply_swap(&mut state, &immovable_swap)
        .unwrap_err()
        .to_string();
    assert!(immovable_error.contains("immovable"));

    let clique_swap = SwapMove::new(
        0,
        state.compiled_problem.person_id_to_idx["p0"],
        state.compiled_problem.person_id_to_idx["p2"],
    );
    let clique_error = apply_swap(&mut state, &clique_swap)
        .unwrap_err()
        .to_string();
    assert!(clique_error.contains("clique"));
}

#[test]
fn sequential_swaps_do_not_drift_from_recomputation() {
    let input = representative_input();
    let mut state = SolutionState::from_input(&input).unwrap();
    let swaps = [
        SwapMove::new(
            2,
            state.compiled_problem.person_id_to_idx["p0"],
            state.compiled_problem.person_id_to_idx["p5"],
        ),
        SwapMove::new(
            2,
            state.compiled_problem.person_id_to_idx["p2"],
            state.compiled_problem.person_id_to_idx["p1"],
        ),
    ];

    for swap in &swaps {
        let preview = preview_swap(&state, swap).unwrap();
        apply_swap(&mut state, swap).unwrap();
        validate_state_invariants(&state).unwrap();
        let recomputed = recompute_full_score(&state).unwrap();
        assert_eq!(state.current_score, recomputed);
        assert_eq!(state.current_score, preview.after_score);
        compare_state_against_solver1(&input, &state).unwrap();
    }
}

#[test]
fn transfer_analysis_reports_explicit_affected_region() {
    let input = transfer_input();
    let state = SolutionState::from_input(&input).unwrap();
    let transfer = TransferMove::new(
        1,
        state.compiled_problem.person_id_to_idx["p1"],
        state.compiled_problem.group_id_to_idx["g1"],
        state.compiled_problem.group_id_to_idx["g0"],
    );

    let analysis = analyze_transfer(&state, &transfer).unwrap();
    assert_eq!(analysis.feasibility, TransferFeasibility::Feasible);
    assert_eq!(analysis.affected_region.touched_session, Some(1));
    assert_eq!(analysis.affected_region.touched_groups, vec![0, 1]);
    assert!(analysis.affected_region.touched_people.contains(&1));
    assert!(!analysis
        .affected_region
        .touched_pair_meeting_constraints
        .is_empty());
    assert!(!analysis
        .affected_region
        .touched_attribute_balance_constraints
        .is_empty());
}

#[test]
fn transfer_preview_matches_apply_and_solver1_parity() {
    let input = transfer_input();
    let mut state = SolutionState::from_input(&input).unwrap();
    let transfer = TransferMove::new(
        1,
        state.compiled_problem.person_id_to_idx["p1"],
        state.compiled_problem.group_id_to_idx["g1"],
        state.compiled_problem.group_id_to_idx["g0"],
    );

    let preview = preview_transfer(&state, &transfer).unwrap();
    assert!(preview.delta_cost < 0.0);
    apply_transfer(&mut state, &transfer).unwrap();

    validate_state_invariants(&state).unwrap();
    let recomputed = recompute_full_score(&state).unwrap();
    assert_eq!(state.current_score, recomputed);
    assert_eq!(state.current_score, preview.after_score);
    compare_state_against_solver1(&input, &state).unwrap();
}

#[test]
fn transfer_rejects_invalid_moves() {
    let input = transfer_input();
    let state = SolutionState::from_input(&input).unwrap();
    let target_full = TransferMove::new(
        0,
        state.compiled_problem.person_id_to_idx["p2"],
        state.compiled_problem.group_id_to_idx["g1"],
        state.compiled_problem.group_id_to_idx["g0"],
    );
    let error = preview_transfer(&state, &target_full)
        .unwrap_err()
        .to_string();
    assert!(error.contains("full"));

    let singleton_input = ApiInput {
        problem: ProblemDefinition {
            people: (0..4)
                .map(|idx| Person {
                    id: format!("p{}", idx),
                    attributes: HashMap::new(),
                    sessions: None,
                })
                .collect(),
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
        initial_schedule: Some(HashMap::from([(
            "session_0".to_string(),
            HashMap::from([
                ("g0".to_string(), vec!["p0".to_string()]),
                ("g1".to_string(), vec!["p1".to_string(), "p2".to_string()]),
                ("g2".to_string(), vec!["p3".to_string()]),
            ]),
        )])),
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".to_string(),
            weight: 1.0,
        }],
        constraints: vec![],
        solver: solver2_config_for_sessions(1),
    };
    let singleton_state = SolutionState::from_input(&singleton_input).unwrap();
    let singleton_transfer = TransferMove::new(
        0,
        singleton_state.compiled_problem.person_id_to_idx["p0"],
        singleton_state.compiled_problem.group_id_to_idx["g0"],
        singleton_state.compiled_problem.group_id_to_idx["g2"],
    );
    let singleton_error = preview_transfer(&singleton_state, &singleton_transfer)
        .unwrap_err()
        .to_string();
    assert!(singleton_error.contains("empty"));

    let clique_input = ApiInput {
        problem: ProblemDefinition {
            people: (0..4)
                .map(|idx| Person {
                    id: format!("p{}", idx),
                    attributes: HashMap::new(),
                    sessions: None,
                })
                .collect(),
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
        initial_schedule: Some(HashMap::from([(
            "session_0".to_string(),
            HashMap::from([
                ("g0".to_string(), vec!["p0".to_string(), "p1".to_string()]),
                ("g1".to_string(), vec!["p2".to_string()]),
                ("g2".to_string(), vec!["p3".to_string()]),
            ]),
        )])),
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
                group_id: "g1".to_string(),
                sessions: Some(vec![0]),
            }),
        ],
        solver: solver2_config_for_sessions(1),
    };
    let clique_state = SolutionState::from_input(&clique_input).unwrap();
    let clique_transfer = TransferMove::new(
        0,
        clique_state.compiled_problem.person_id_to_idx["p0"],
        clique_state.compiled_problem.group_id_to_idx["g0"],
        clique_state.compiled_problem.group_id_to_idx["g1"],
    );
    let clique_error = preview_transfer(&clique_state, &clique_transfer)
        .unwrap_err()
        .to_string();
    assert!(clique_error.contains("clique"));

    let immovable_input = ApiInput {
        problem: ProblemDefinition {
            people: (0..4)
                .map(|idx| Person {
                    id: format!("p{}", idx),
                    attributes: HashMap::new(),
                    sessions: None,
                })
                .collect(),
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
        initial_schedule: Some(HashMap::from([(
            "session_0".to_string(),
            HashMap::from([
                ("g0".to_string(), vec!["p0".to_string(), "p1".to_string()]),
                ("g1".to_string(), vec!["p2".to_string(), "p3".to_string()]),
                ("g2".to_string(), Vec::new()),
            ]),
        )])),
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".to_string(),
            weight: 1.0,
        }],
        constraints: vec![Constraint::ImmovablePerson(ImmovablePersonParams {
            person_id: "p2".to_string(),
            group_id: "g1".to_string(),
            sessions: Some(vec![0]),
        })],
        solver: solver2_config_for_sessions(1),
    };
    let immovable_state = SolutionState::from_input(&immovable_input).unwrap();
    let immovable_transfer = TransferMove::new(
        0,
        immovable_state.compiled_problem.person_id_to_idx["p2"],
        immovable_state.compiled_problem.group_id_to_idx["g1"],
        immovable_state.compiled_problem.group_id_to_idx["g2"],
    );
    let immovable_error = preview_transfer(&immovable_state, &immovable_transfer)
        .unwrap_err()
        .to_string();
    assert!(immovable_error.contains("immovable"), "{immovable_error}");
}

#[test]
fn sequential_transfers_do_not_drift_from_recomputation() {
    let input = transfer_sequential_input();
    let mut state = SolutionState::from_input(&input).unwrap();
    let transfers = [
        TransferMove::new(
            1,
            state.compiled_problem.person_id_to_idx["p2"],
            state.compiled_problem.group_id_to_idx["g0"],
            state.compiled_problem.group_id_to_idx["g1"],
        ),
        TransferMove::new(
            0,
            state.compiled_problem.person_id_to_idx["p1"],
            state.compiled_problem.group_id_to_idx["g0"],
            state.compiled_problem.group_id_to_idx["g1"],
        ),
        TransferMove::new(
            0,
            state.compiled_problem.person_id_to_idx["p4"],
            state.compiled_problem.group_id_to_idx["g2"],
            state.compiled_problem.group_id_to_idx["g0"],
        ),
    ];

    for transfer in &transfers {
        let preview = preview_transfer(&state, transfer).unwrap();
        apply_transfer(&mut state, transfer).unwrap();
        validate_state_invariants(&state).unwrap();
        let recomputed = recompute_full_score(&state).unwrap();
        assert_eq!(state.current_score, recomputed);
        assert_eq!(state.current_score, preview.after_score);
        compare_state_against_solver1(&input, &state).unwrap();
    }
}

#[test]
fn clique_swap_analysis_reports_explicit_affected_region() {
    let input = clique_swap_input();
    let state = SolutionState::from_input(&input).unwrap();
    let clique_idx = state.compiled_problem.person_to_clique_id[0]
        [state.compiled_problem.person_id_to_idx["p0"]]
        .unwrap();
    let clique_swap = CliqueSwapMove::new(
        0,
        clique_idx,
        state.compiled_problem.group_id_to_idx["g0"],
        state.compiled_problem.group_id_to_idx["g1"],
        vec![
            state.compiled_problem.person_id_to_idx["p2"],
            state.compiled_problem.person_id_to_idx["p3"],
        ],
    );

    let analysis = analyze_clique_swap(&state, &clique_swap).unwrap();
    assert_eq!(analysis.feasibility, CliqueSwapFeasibility::Feasible);
    assert_eq!(analysis.active_members, vec![0, 1]);
    assert_eq!(analysis.affected_region.touched_session, Some(0));
    assert_eq!(analysis.affected_region.touched_groups, vec![0, 1]);
    assert!(analysis
        .affected_region
        .touched_cliques
        .contains(&clique_idx));
    assert!(!analysis
        .affected_region
        .touched_should_together_constraints
        .is_empty());
    assert!(!analysis
        .affected_region
        .touched_pair_meeting_constraints
        .is_empty());
    assert!(!analysis
        .affected_region
        .touched_attribute_balance_constraints
        .is_empty());
}

#[test]
fn clique_swap_preview_matches_apply_and_solver1_parity() {
    let input = clique_swap_input();
    let mut state = SolutionState::from_input(&input).unwrap();
    let clique_idx = state.compiled_problem.person_to_clique_id[0]
        [state.compiled_problem.person_id_to_idx["p0"]]
        .unwrap();
    let clique_swap = CliqueSwapMove::new(
        0,
        clique_idx,
        state.compiled_problem.group_id_to_idx["g0"],
        state.compiled_problem.group_id_to_idx["g1"],
        vec![
            state.compiled_problem.person_id_to_idx["p2"],
            state.compiled_problem.person_id_to_idx["p3"],
        ],
    );

    let preview = preview_clique_swap(&state, &clique_swap).unwrap();
    apply_clique_swap(&mut state, &clique_swap).unwrap();

    validate_state_invariants(&state).unwrap();
    let recomputed = recompute_full_score(&state).unwrap();
    assert_eq!(state.current_score, recomputed);
    assert_eq!(state.current_score, preview.after_score);
    compare_state_against_solver1(&input, &state).unwrap();
}

#[test]
fn clique_swap_handles_partial_participation_and_rejects_invalid_targets() {
    let partial_input = ApiInput {
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
                    sessions: Some(vec![0]),
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
        initial_schedule: Some(HashMap::from([
            (
                "session_0".to_string(),
                HashMap::from([
                    ("g0".to_string(), vec!["p0".to_string(), "p1".to_string()]),
                    ("g1".to_string(), vec!["p2".to_string(), "p3".to_string()]),
                    ("g2".to_string(), Vec::new()),
                ]),
            ),
            (
                "session_1".to_string(),
                HashMap::from([
                    ("g0".to_string(), vec!["p0".to_string()]),
                    ("g1".to_string(), vec!["p2".to_string(), "p3".to_string()]),
                    ("g2".to_string(), Vec::new()),
                ]),
            ),
        ])),
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".to_string(),
            weight: 1.0,
        }],
        constraints: vec![Constraint::MustStayTogether {
            people: vec!["p0".to_string(), "p1".to_string()],
            sessions: None,
        }],
        solver: solver2_config_for_sessions(2),
    };
    let mut partial_state = SolutionState::from_input(&partial_input).unwrap();
    let clique_idx = partial_state.compiled_problem.person_to_clique_id[1]
        [partial_state.compiled_problem.person_id_to_idx["p0"]]
        .unwrap();
    let partial_swap = CliqueSwapMove::new(
        1,
        clique_idx,
        partial_state.compiled_problem.group_id_to_idx["g0"],
        partial_state.compiled_problem.group_id_to_idx["g1"],
        vec![partial_state.compiled_problem.person_id_to_idx["p2"]],
    );
    let preview = preview_clique_swap(&partial_state, &partial_swap).unwrap();
    apply_clique_swap(&mut partial_state, &partial_swap).unwrap();
    assert_eq!(partial_state.current_score, preview.after_score);
    assert!(
        partial_state.locations[1][partial_state.compiled_problem.person_id_to_idx["p1"]].is_none()
    );

    let invalid_input = ApiInput {
        problem: ProblemDefinition {
            people: (0..4)
                .map(|idx| Person {
                    id: format!("p{}", idx),
                    attributes: HashMap::new(),
                    sessions: None,
                })
                .collect(),
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
        initial_schedule: Some(HashMap::from([
            (
                "session_0".to_string(),
                HashMap::from([
                    ("g0".to_string(), vec!["p0".to_string(), "p1".to_string()]),
                    ("g1".to_string(), vec!["p2".to_string(), "p3".to_string()]),
                    ("g2".to_string(), Vec::new()),
                ]),
            ),
            (
                "session_1".to_string(),
                HashMap::from([
                    ("g0".to_string(), vec!["p0".to_string(), "p1".to_string()]),
                    ("g1".to_string(), vec!["p2".to_string(), "p3".to_string()]),
                    ("g2".to_string(), Vec::new()),
                ]),
            ),
        ])),
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".to_string(),
            weight: 1.0,
        }],
        constraints: vec![
            Constraint::MustStayTogether {
                people: vec!["p0".to_string(), "p1".to_string()],
                sessions: Some(vec![0]),
            },
            Constraint::ImmovablePerson(ImmovablePersonParams {
                person_id: "p2".to_string(),
                group_id: "g1".to_string(),
                sessions: Some(vec![0]),
            }),
        ],
        solver: solver2_config_for_sessions(2),
    };
    let invalid_state = SolutionState::from_input(&invalid_input).unwrap();
    let session0_clique_idx = invalid_state.compiled_problem.person_to_clique_id[0]
        [invalid_state.compiled_problem.person_id_to_idx["p0"]]
        .unwrap();
    let inactive_swap = CliqueSwapMove::new(
        1,
        session0_clique_idx,
        invalid_state.compiled_problem.group_id_to_idx["g0"],
        invalid_state.compiled_problem.group_id_to_idx["g1"],
        vec![
            invalid_state.compiled_problem.person_id_to_idx["p2"],
            invalid_state.compiled_problem.person_id_to_idx["p3"],
        ],
    );
    let inactive_error = preview_clique_swap(&invalid_state, &inactive_swap)
        .unwrap_err()
        .to_string();
    assert!(inactive_error.contains("not active"));

    let immovable_target_swap = CliqueSwapMove::new(
        0,
        session0_clique_idx,
        invalid_state.compiled_problem.group_id_to_idx["g0"],
        invalid_state.compiled_problem.group_id_to_idx["g1"],
        vec![
            invalid_state.compiled_problem.person_id_to_idx["p2"],
            invalid_state.compiled_problem.person_id_to_idx["p3"],
        ],
    );
    let immovable_target_error = preview_clique_swap(&invalid_state, &immovable_target_swap)
        .unwrap_err()
        .to_string();
    assert!(
        immovable_target_error.contains("immovable"),
        "{immovable_target_error}"
    );
}

#[test]
fn sequential_clique_swaps_do_not_drift_from_recomputation() {
    let input = sequential_clique_swap_input();
    let mut state = SolutionState::from_input(&input).unwrap();
    let clique_idx = state.compiled_problem.person_to_clique_id[0]
        [state.compiled_problem.person_id_to_idx["p0"]]
        .unwrap();
    let swaps = [
        CliqueSwapMove::new(
            0,
            clique_idx,
            state.compiled_problem.group_id_to_idx["g0"],
            state.compiled_problem.group_id_to_idx["g1"],
            vec![
                state.compiled_problem.person_id_to_idx["p2"],
                state.compiled_problem.person_id_to_idx["p3"],
            ],
        ),
        CliqueSwapMove::new(
            0,
            clique_idx,
            state.compiled_problem.group_id_to_idx["g1"],
            state.compiled_problem.group_id_to_idx["g2"],
            vec![
                state.compiled_problem.person_id_to_idx["p4"],
                state.compiled_problem.person_id_to_idx["p5"],
            ],
        ),
    ];

    for clique_swap in &swaps {
        let preview = preview_clique_swap(&state, clique_swap).unwrap();
        apply_clique_swap(&mut state, clique_swap).unwrap();
        validate_state_invariants(&state).unwrap();
        let recomputed = recompute_full_score(&state).unwrap();
        assert_eq!(state.current_score, recomputed);
        assert_eq!(state.current_score, preview.after_score);
        compare_state_against_solver1(&input, &state).unwrap();
    }
}
