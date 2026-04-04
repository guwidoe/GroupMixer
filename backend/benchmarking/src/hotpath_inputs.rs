use gm_core::models::{
    ApiInput, AttributeBalanceMode, AttributeBalanceParams, Constraint, Group,
    ImmovablePersonParams, MoveFamily, MovePolicy, MoveSelectionMode, Objective,
    PairMeetingCountParams, PairMeetingMode, Person, ProblemDefinition, SimulatedAnnealingParams,
    Solver2Params, SolverConfiguration, SolverParams, StopConditions,
};
use gm_core::solver1::State;
use std::collections::HashMap;

#[derive(Clone)]
pub struct ConstructionBenchInput {
    pub cold_input: ApiInput,
    pub warm_input: ApiInput,
    pub recalc_state: State,
}

#[derive(Clone)]
pub struct SwapBenchInput {
    pub state: State,
    pub day: usize,
    pub p1_idx: usize,
    pub p2_idx: usize,
}

#[derive(Clone)]
pub struct Solver2SwapBenchInput {
    pub input: ApiInput,
    pub state: gm_core::solver2::RuntimeSolutionState,
    pub swap: gm_core::solver2::moves::SwapMove,
}

#[derive(Clone)]
pub struct TransferBenchInput {
    pub state: State,
    pub day: usize,
    pub person_idx: usize,
    pub from_group: usize,
    pub to_group: usize,
}

#[derive(Clone)]
pub struct Solver2TransferBenchInput {
    pub input: ApiInput,
    pub state: gm_core::solver2::SolutionState,
    pub transfer: gm_core::solver2::moves::TransferMove,
}

#[derive(Clone)]
pub struct CliqueSwapBenchInput {
    pub state: State,
    pub day: usize,
    pub clique_idx: usize,
    pub from_group: usize,
    pub to_group: usize,
    pub target_people: Vec<usize>,
}

#[derive(Clone)]
pub struct Solver2CliqueSwapBenchInput {
    pub input: ApiInput,
    pub state: gm_core::solver2::SolutionState,
    pub clique_swap: gm_core::solver2::moves::CliqueSwapMove,
}

#[derive(Clone)]
pub struct SearchLoopBenchInput {
    pub id: &'static str,
    pub input: ApiInput,
    pub base_state: State,
}

pub fn construction_bench_input() -> ConstructionBenchInput {
    let people = vec![
        person_with_attr("p0", "role", "eng"),
        person_with_attr("p1", "role", "eng"),
        person_with_attr("p2", "role", "design"),
        person_with_attr("p3", "role", "design"),
        person_with_attr("p4", "role", "pm"),
        person_with_attr("p5", "role", "pm"),
        person_with_sessions("p6", vec![0, 1]),
        person_with_sessions("p7", vec![1, 2]),
    ];
    let groups = vec![group("g0", 3), group("g1", 3), group("g2", 3)];
    let mut cold_input = make_api_input(
        ProblemDefinition {
            people,
            groups,
            num_sessions: 3,
        },
        vec![
            Constraint::MustStayTogether {
                people: vec!["p0".to_string(), "p1".to_string()],
                sessions: None,
            },
            Constraint::ImmovablePerson(ImmovablePersonParams {
                person_id: "p4".to_string(),
                group_id: "g2".to_string(),
                sessions: Some(vec![0]),
            }),
            Constraint::AttributeBalance(AttributeBalanceParams {
                group_id: "g0".to_string(),
                attribute_key: "role".to_string(),
                desired_values: hashmap_counts(&[("eng", 1), ("design", 1), ("pm", 1)]),
                penalty_weight: 6.0,
                mode: AttributeBalanceMode::Exact,
                sessions: None,
            }),
        ],
        120,
        41,
    );
    let warm_schedule = make_initial_schedule(
        &["g0", "g1", "g2"],
        vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"], vec!["p4", "p5", "p6"]],
            vec![
                vec!["p0", "p1", "p6"],
                vec!["p2", "p3"],
                vec!["p4", "p5", "p7"],
            ],
            vec![vec!["p0", "p1"], vec!["p2", "p3", "p7"], vec!["p4", "p5"]],
        ],
    );
    let mut warm_input = cold_input.clone();
    warm_input.initial_schedule = Some(warm_schedule);

    cold_input.solver.stop_conditions.max_iterations = Some(1);
    warm_input.solver.stop_conditions.max_iterations = Some(1);

    let recalc_state = State::new(&warm_input).expect("construction recalc state should build");

    ConstructionBenchInput {
        cold_input,
        warm_input,
        recalc_state,
    }
}

pub fn swap_bench_input() -> SwapBenchInput {
    let input = make_api_input(
        ProblemDefinition {
            people: vec![
                person_with_attr("p0", "role", "eng"),
                person_with_attr("p1", "role", "design"),
                person_with_attr("p2", "role", "eng"),
                person_with_attr("p3", "role", "design"),
                person_with_attr("p4", "role", "pm"),
                person_with_attr("p5", "role", "pm"),
            ],
            groups: vec![group("g0", 2), group("g1", 2), group("g2", 2)],
            num_sessions: 2,
        },
        vec![
            Constraint::ShouldNotBeTogether {
                people: vec!["p0".to_string(), "p2".to_string()],
                penalty_weight: 25.0,
                sessions: None,
            },
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
                desired_values: hashmap_counts(&[("eng", 1), ("design", 1)]),
                penalty_weight: 10.0,
                mode: AttributeBalanceMode::Exact,
                sessions: None,
            }),
        ],
        80,
        51,
    );
    let mut warm = input.clone();
    warm.initial_schedule = Some(make_initial_schedule(
        &["g0", "g1", "g2"],
        vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"], vec!["p4", "p5"]],
            vec![vec!["p0", "p2"], vec!["p1", "p4"], vec!["p3", "p5"]],
        ],
    ));
    let state = State::new(&warm).expect("swap state should build");
    SwapBenchInput {
        day: 0,
        p1_idx: state.person_id_to_idx["p1"],
        p2_idx: state.person_id_to_idx["p2"],
        state,
    }
}

pub fn solver2_swap_bench_input(id: &str) -> Option<Solver2SwapBenchInput> {
    match id {
        "swap_default_solver2" => {
            let mut input = make_api_input(
                ProblemDefinition {
                    people: vec![
                        person_with_attr("p0", "role", "eng"),
                        person_with_attr("p1", "role", "design"),
                        person_with_attr("p2", "role", "eng"),
                        person_with_attr("p3", "role", "design"),
                        person_with_attr("p4", "role", "pm"),
                        person_with_attr("p5", "role", "pm"),
                    ],
                    groups: vec![group("g0", 2), group("g1", 2), group("g2", 2)],
                    num_sessions: 2,
                },
                vec![
                    Constraint::ShouldNotBeTogether {
                        people: vec!["p0".to_string(), "p2".to_string()],
                        penalty_weight: 25.0,
                        sessions: None,
                    },
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
                        desired_values: hashmap_counts(&[("eng", 1), ("design", 1)]),
                        penalty_weight: 10.0,
                        mode: AttributeBalanceMode::Exact,
                        sessions: None,
                    }),
                ],
                80,
                151,
            );
            input.solver = SolverConfiguration {
                solver_type: "solver2".to_string(),
                stop_conditions: StopConditions {
                    max_iterations: Some(1),
                    time_limit_seconds: None,
                    no_improvement_iterations: None,
                },
                solver_params: SolverParams::Solver2(Solver2Params::default()),
                logging: Default::default(),
                telemetry: Default::default(),
                seed: Some(151),
                move_policy: None,
                allowed_sessions: None,
            };
            input.initial_schedule = Some(make_initial_schedule(
                &["g0", "g1", "g2"],
                vec![
                    vec![vec!["p0", "p1"], vec!["p2", "p3"], vec!["p4", "p5"]],
                    vec![vec!["p0", "p2"], vec!["p1", "p4"], vec!["p3", "p5"]],
                ],
            ));
            let state = gm_core::solver2::RuntimeSolutionState::from_input(&input)
                .expect("solver2 swap state should build");
            let swap = gm_core::solver2::moves::SwapMove::new(
                0,
                state.compiled_problem.person_id_to_idx["p1"],
                state.compiled_problem.person_id_to_idx["p2"],
            );
            Some(Solver2SwapBenchInput { input, state, swap })
        }
        _ => None,
    }
}

pub fn transfer_bench_input(id: &str) -> Option<TransferBenchInput> {
    match id {
        "transfer_default" => Some(transfer_default_bench_input()),
        "transfer_pair_constraints_heavy" => Some(transfer_pair_constraints_heavy_bench_input()),
        _ => None,
    }
}

pub fn solver2_transfer_bench_input(id: &str) -> Option<Solver2TransferBenchInput> {
    match id {
        "transfer_default_solver2" => {
            let mut input = make_api_input(
                ProblemDefinition {
                    people: vec![
                        person_with_attr("p0", "role", "eng"),
                        person_with_attr("p1", "role", "eng"),
                        person_with_attr("p2", "role", "design"),
                        person_with_attr("p3", "role", "design"),
                        person_with_attr("p4", "role", "pm"),
                    ],
                    groups: vec![group("g0", 3), group("g1", 2), group("g2", 2)],
                    num_sessions: 2,
                },
                vec![
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
                        desired_values: hashmap_counts(&[("eng", 2), ("pm", 1)]),
                        penalty_weight: 9.0,
                        mode: AttributeBalanceMode::Exact,
                        sessions: None,
                    }),
                ],
                80,
                161,
            );
            input.solver = SolverConfiguration {
                solver_type: "solver2".to_string(),
                stop_conditions: StopConditions {
                    max_iterations: Some(1),
                    time_limit_seconds: None,
                    no_improvement_iterations: None,
                },
                solver_params: SolverParams::Solver2(Solver2Params::default()),
                logging: Default::default(),
                telemetry: Default::default(),
                seed: Some(161),
                move_policy: None,
                allowed_sessions: None,
            };
            input.initial_schedule = Some(make_initial_schedule(
                &["g0", "g1", "g2"],
                vec![
                    vec![vec!["p0", "p1", "p4"], vec!["p2", "p3"], vec![]],
                    vec![vec!["p0", "p4"], vec!["p1", "p2"], vec!["p3"]],
                ],
            ));
            let state = gm_core::solver2::SolutionState::from_input(&input)
                .expect("solver2 transfer state should build");
            let transfer = gm_core::solver2::moves::TransferMove::new(
                1,
                state.compiled_problem.person_id_to_idx["p1"],
                state.compiled_problem.group_id_to_idx["g1"],
                state.compiled_problem.group_id_to_idx["g0"],
            );
            Some(Solver2TransferBenchInput {
                input,
                state,
                transfer,
            })
        }
        _ => None,
    }
}

fn transfer_default_bench_input() -> TransferBenchInput {
    let input = make_api_input(
        ProblemDefinition {
            people: vec![
                person_with_attr("p0", "role", "eng"),
                person_with_attr("p1", "role", "eng"),
                person_with_attr("p2", "role", "design"),
                person_with_attr("p3", "role", "design"),
                person_with_attr("p4", "role", "pm"),
            ],
            groups: vec![group("g0", 3), group("g1", 2), group("g2", 2)],
            num_sessions: 2,
        },
        vec![
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
                desired_values: hashmap_counts(&[("eng", 2), ("pm", 1)]),
                penalty_weight: 9.0,
                mode: AttributeBalanceMode::Exact,
                sessions: None,
            }),
        ],
        80,
        61,
    );
    let mut warm = input.clone();
    warm.initial_schedule = Some(make_initial_schedule(
        &["g0", "g1", "g2"],
        vec![
            vec![vec!["p0", "p1", "p4"], vec!["p2", "p3"], vec![]],
            vec![vec!["p0", "p4"], vec!["p1", "p2"], vec!["p3"]],
        ],
    ));
    let state = State::new(&warm).expect("transfer state should build");
    TransferBenchInput {
        day: 1,
        person_idx: state.person_id_to_idx["p1"],
        from_group: state.group_id_to_idx["g1"],
        to_group: state.group_id_to_idx["g0"],
        state,
    }
}

fn transfer_pair_constraints_heavy_bench_input() -> TransferBenchInput {
    let mut constraints = vec![
        Constraint::PairMeetingCount(PairMeetingCountParams {
            people: vec!["p0".to_string(), "p13".to_string()],
            sessions: vec![0, 1, 2],
            target_meetings: 1,
            mode: PairMeetingMode::AtLeast,
            penalty_weight: 6.0,
        }),
        Constraint::AttributeBalance(AttributeBalanceParams {
            group_id: "g2".to_string(),
            attribute_key: "role".to_string(),
            desired_values: hashmap_counts(&[("eng", 2), ("design", 1), ("pm", 1), ("qa", 1)]),
            penalty_weight: 9.0,
            mode: AttributeBalanceMode::Exact,
            sessions: None,
        }),
        Constraint::ShouldStayTogether {
            people: vec!["p0".to_string(), "p1".to_string(), "p2".to_string()],
            penalty_weight: 12.0,
            sessions: None,
        },
        Constraint::ShouldStayTogether {
            people: vec!["p0".to_string(), "p9".to_string(), "p10".to_string()],
            penalty_weight: 10.0,
            sessions: None,
        },
        Constraint::ShouldNotBeTogether {
            people: vec!["p0".to_string(), "p3".to_string()],
            penalty_weight: 11.0,
            sessions: None,
        },
        Constraint::ShouldNotBeTogether {
            people: vec!["p0".to_string(), "p4".to_string()],
            penalty_weight: 10.0,
            sessions: None,
        },
        Constraint::ShouldNotBeTogether {
            people: vec!["p0".to_string(), "p11".to_string()],
            penalty_weight: 10.0,
            sessions: None,
        },
        Constraint::ShouldNotBeTogether {
            people: vec!["p0".to_string(), "p12".to_string()],
            penalty_weight: 9.0,
            sessions: None,
        },
    ];

    for people in [
        ["p5", "p6", "p7"],
        ["p8", "p13", "p14"],
        ["p10", "p15", "p16"],
        ["p11", "p14", "p17"],
    ] {
        constraints.push(Constraint::ShouldStayTogether {
            people: people.iter().map(|person| (*person).to_string()).collect(),
            penalty_weight: 7.0,
            sessions: None,
        });
    }

    for (left, right) in [
        ("p5", "p8"),
        ("p6", "p9"),
        ("p7", "p10"),
        ("p8", "p11"),
        ("p13", "p16"),
        ("p14", "p15"),
        ("p2", "p5"),
        ("p6", "p12"),
        ("p7", "p15"),
        ("p10", "p14"),
        ("p1", "p16"),
        ("p4", "p17"),
    ] {
        constraints.push(Constraint::ShouldNotBeTogether {
            people: vec![left.to_string(), right.to_string()],
            penalty_weight: 6.0,
            sessions: None,
        });
    }

    let input = make_api_input(
        ProblemDefinition {
            people: vec![
                person_with_attr("p0", "role", "eng"),
                person_with_attr("p1", "role", "eng"),
                person_with_attr("p2", "role", "design"),
                person_with_attr("p3", "role", "design"),
                person_with_attr("p4", "role", "pm"),
                person_with_attr("p5", "role", "eng"),
                person_with_attr("p6", "role", "design"),
                person_with_attr("p7", "role", "pm"),
                person_with_attr("p8", "role", "qa"),
                person_with_attr("p9", "role", "eng"),
                person_with_attr("p10", "role", "design"),
                person_with_attr("p11", "role", "pm"),
                person_with_attr("p12", "role", "qa"),
                person_with_attr("p13", "role", "eng"),
                person_with_attr("p14", "role", "design"),
                person_with_attr("p15", "role", "pm"),
                person_with_attr("p16", "role", "qa"),
                person_with_attr("p17", "role", "eng"),
            ],
            groups: vec![
                group("g0", 5),
                group("g1", 4),
                group("g2", 5),
                group("g3", 5),
            ],
            num_sessions: 3,
        },
        constraints,
        120,
        62,
    );
    let mut warm = input.clone();
    warm.initial_schedule = Some(make_initial_schedule(
        &["g0", "g1", "g2", "g3"],
        vec![
            vec![
                vec!["p0", "p5", "p9", "p13", "p17"],
                vec!["p1", "p6", "p10", "p14"],
                vec!["p2", "p7", "p11", "p15"],
                vec!["p3", "p4", "p8", "p12", "p16"],
            ],
            vec![
                vec!["p0", "p1", "p2", "p3", "p4"],
                vec!["p5", "p6", "p7", "p8"],
                vec!["p9", "p10", "p11", "p12"],
                vec!["p13", "p14", "p15", "p16", "p17"],
            ],
            vec![
                vec!["p0", "p6", "p11", "p14", "p17"],
                vec!["p1", "p4", "p8", "p15"],
                vec!["p2", "p5", "p9", "p12", "p16"],
                vec!["p3", "p7", "p10", "p13"],
            ],
        ],
    ));
    let state = State::new(&warm).expect("pair-constraint-heavy transfer state should build");
    TransferBenchInput {
        day: 1,
        person_idx: state.person_id_to_idx["p0"],
        from_group: state.group_id_to_idx["g0"],
        to_group: state.group_id_to_idx["g2"],
        state,
    }
}

pub fn clique_swap_bench_input() -> CliqueSwapBenchInput {
    let input = make_api_input(
        ProblemDefinition {
            people: vec![
                person("p0"),
                person("p1"),
                person("p2"),
                person("p3"),
                person("p4"),
                person("p5"),
            ],
            groups: vec![group("g0", 2), group("g1", 2), group("g2", 2)],
            num_sessions: 2,
        },
        vec![
            Constraint::MustStayTogether {
                people: vec!["p0".to_string(), "p1".to_string()],
                sessions: None,
            },
            Constraint::ShouldNotBeTogether {
                people: vec!["p0".to_string(), "p2".to_string()],
                penalty_weight: 11.0,
                sessions: None,
            },
        ],
        60,
        71,
    );
    let mut warm = input.clone();
    warm.initial_schedule = Some(make_initial_schedule(
        &["g0", "g1", "g2"],
        vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"], vec!["p4", "p5"]],
            vec![vec!["p0", "p1"], vec!["p2", "p3"], vec!["p4", "p5"]],
        ],
    ));
    let state = State::new(&warm).expect("clique swap state should build");
    CliqueSwapBenchInput {
        day: 0,
        clique_idx: state.person_to_clique_id[0][state.person_id_to_idx["p0"]]
            .expect("p0 should be in a clique"),
        from_group: state.group_id_to_idx["g0"],
        to_group: state.group_id_to_idx["g1"],
        target_people: vec![state.person_id_to_idx["p2"], state.person_id_to_idx["p3"]],
        state,
    }
}

pub fn solver2_clique_swap_bench_input(id: &str) -> Option<Solver2CliqueSwapBenchInput> {
    match id {
        "clique_swap_default_solver2" => {
            let mut input = make_api_input(
                ProblemDefinition {
                    people: vec![
                        person_with_attr("p0", "team", "red"),
                        person_with_attr("p1", "team", "red"),
                        person_with_attr("p2", "team", "blue"),
                        person_with_attr("p3", "team", "blue"),
                        person_with_attr("p4", "team", "red"),
                        person_with_attr("p5", "team", "blue"),
                    ],
                    groups: vec![group("g0", 3), group("g1", 3), group("g2", 1)],
                    num_sessions: 2,
                },
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
                        desired_values: hashmap_counts(&[("red", 1), ("blue", 2)]),
                        penalty_weight: 12.0,
                        sessions: None,
                        mode: AttributeBalanceMode::Exact,
                    }),
                ],
                60,
                171,
            );
            input.solver = SolverConfiguration {
                solver_type: "solver2".to_string(),
                stop_conditions: StopConditions {
                    max_iterations: Some(1),
                    time_limit_seconds: None,
                    no_improvement_iterations: None,
                },
                solver_params: SolverParams::Solver2(Solver2Params::default()),
                logging: Default::default(),
                telemetry: Default::default(),
                seed: Some(171),
                move_policy: None,
                allowed_sessions: None,
            };
            input.initial_schedule = Some(make_initial_schedule(
                &["g0", "g1", "g2"],
                vec![
                    vec![vec!["p0", "p1", "p4"], vec!["p2", "p3", "p5"], vec![]],
                    vec![vec!["p0", "p2", "p4"], vec!["p1", "p3", "p5"], vec![]],
                ],
            ));
            let state = gm_core::solver2::SolutionState::from_input(&input)
                .expect("solver2 clique swap state should build");
            let clique_idx = state.compiled_problem.person_to_clique_id[0]
                [state.compiled_problem.person_id_to_idx["p0"]]
                .expect("p0 should be in a clique");
            let clique_swap = gm_core::solver2::moves::CliqueSwapMove::new(
                0,
                clique_idx,
                state.compiled_problem.group_id_to_idx["g0"],
                state.compiled_problem.group_id_to_idx["g1"],
                vec![
                    state.compiled_problem.person_id_to_idx["p2"],
                    state.compiled_problem.person_id_to_idx["p3"],
                ],
            );
            Some(Solver2CliqueSwapBenchInput {
                input,
                state,
                clique_swap,
            })
        }
        _ => None,
    }
}

pub fn search_loop_bench_input(id: &str) -> Option<SearchLoopBenchInput> {
    match id {
        "search_mixed" => Some(search_loop_mixed_input()),
        "search_clique_only" => Some(search_loop_clique_only_input()),
        _ => None,
    }
}

fn search_loop_mixed_input() -> SearchLoopBenchInput {
    let mut input = make_api_input(
        ProblemDefinition {
            people: vec![
                person_with_attr("p0", "track", "a"),
                person_with_attr("p1", "track", "a"),
                person_with_attr("p2", "track", "b"),
                person_with_attr("p3", "track", "b"),
                person_with_attr("p4", "track", "c"),
                person_with_attr("p5", "track", "c"),
                person_with_attr("p6", "track", "d"),
                person_with_attr("p7", "track", "d"),
            ],
            groups: vec![group("g0", 4), group("g1", 4)],
            num_sessions: 3,
        },
        vec![
            Constraint::ShouldNotBeTogether {
                people: vec!["p0".to_string(), "p1".to_string()],
                penalty_weight: 7.0,
                sessions: None,
            },
            Constraint::ShouldStayTogether {
                people: vec!["p2".to_string(), "p3".to_string()],
                penalty_weight: 5.0,
                sessions: None,
            },
            Constraint::PairMeetingCount(PairMeetingCountParams {
                people: vec!["p4".to_string(), "p5".to_string()],
                sessions: vec![0, 1, 2],
                target_meetings: 2,
                mode: PairMeetingMode::AtLeast,
                penalty_weight: 6.0,
            }),
        ],
        250,
        81,
    );
    input.initial_schedule = Some(make_initial_schedule(
        &["g0", "g1"],
        vec![
            vec![vec!["p0", "p1", "p4", "p6"], vec!["p2", "p3", "p5", "p7"]],
            vec![vec!["p0", "p2", "p4", "p7"], vec!["p1", "p3", "p5", "p6"]],
            vec![vec!["p0", "p3", "p5", "p6"], vec!["p1", "p2", "p4", "p7"]],
        ],
    ));
    let base_state = State::new(&input).expect("mixed search state should build");
    SearchLoopBenchInput {
        id: "search_mixed",
        input,
        base_state,
    }
}

fn search_loop_clique_only_input() -> SearchLoopBenchInput {
    let mut input = make_api_input(
        ProblemDefinition {
            people: vec![
                person("p0"),
                person("p1"),
                person("p2"),
                person("p3"),
                person("p4"),
                person("p5"),
            ],
            groups: vec![group("g0", 2), group("g1", 2), group("g2", 2)],
            num_sessions: 3,
        },
        vec![
            Constraint::MustStayTogether {
                people: vec!["p0".to_string(), "p1".to_string()],
                sessions: None,
            },
            Constraint::MustStayTogether {
                people: vec!["p4".to_string(), "p5".to_string()],
                sessions: None,
            },
        ],
        180,
        82,
    );
    input.initial_schedule = Some(make_initial_schedule(
        &["g0", "g1", "g2"],
        vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"], vec!["p4", "p5"]],
            vec![vec!["p0", "p1"], vec!["p2", "p3"], vec!["p4", "p5"]],
            vec![vec!["p0", "p1"], vec!["p2", "p3"], vec!["p4", "p5"]],
        ],
    ));
    input.solver.move_policy = Some(MovePolicy {
        mode: MoveSelectionMode::Adaptive,
        forced_family: Some(MoveFamily::CliqueSwap),
        allowed_families: None,
        weights: None,
    });
    let base_state = State::new(&input).expect("clique-only search state should build");
    SearchLoopBenchInput {
        id: "search_clique_only",
        input,
        base_state,
    }
}

pub fn make_api_input(
    problem: ProblemDefinition,
    constraints: Vec<Constraint>,
    max_iterations: u64,
    seed: u64,
) -> ApiInput {
    ApiInput {
        problem,
        initial_schedule: None,
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".to_string(),
            weight: 1.0,
        }],
        constraints,
        solver: seeded_solver_config(max_iterations, seed),
    }
}

fn seeded_solver_config(max_iterations: u64, seed: u64) -> SolverConfiguration {
    SolverConfiguration {
        solver_type: "SimulatedAnnealing".to_string(),
        stop_conditions: StopConditions {
            max_iterations: Some(max_iterations),
            time_limit_seconds: None,
            no_improvement_iterations: None,
        },
        solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams {
            initial_temperature: 10.0,
            final_temperature: 0.001,
            cooling_schedule: "geometric".to_string(),
            reheat_after_no_improvement: Some(0),
            reheat_cycles: Some(0),
        }),
        logging: Default::default(),
        telemetry: Default::default(),
        seed: Some(seed),
        move_policy: None,
        allowed_sessions: None,
    }
}

fn make_initial_schedule(
    group_ids: &[&str],
    sessions: Vec<Vec<Vec<&str>>>,
) -> HashMap<String, HashMap<String, Vec<String>>> {
    sessions
        .into_iter()
        .enumerate()
        .map(|(session_idx, groups)| {
            let group_map = group_ids
                .iter()
                .enumerate()
                .map(|(group_idx, group_id)| {
                    let members = groups
                        .get(group_idx)
                        .cloned()
                        .unwrap_or_default()
                        .into_iter()
                        .map(str::to_string)
                        .collect::<Vec<_>>();
                    ((*group_id).to_string(), members)
                })
                .collect::<HashMap<_, _>>();

            (format!("session_{session_idx}"), group_map)
        })
        .collect()
}

fn person(id: &str) -> Person {
    Person {
        id: id.to_string(),
        attributes: HashMap::new(),
        sessions: None,
    }
}

fn person_with_attr(id: &str, key: &str, value: &str) -> Person {
    Person {
        id: id.to_string(),
        attributes: HashMap::from([(key.to_string(), value.to_string())]),
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

fn group(id: &str, size: u32) -> Group {
    Group {
        id: id.to_string(),
        size,
        session_sizes: None,
    }
}

fn hashmap_counts(entries: &[(&str, u32)]) -> HashMap<String, u32> {
    entries
        .iter()
        .map(|(key, value)| ((*key).to_string(), *value))
        .collect()
}
