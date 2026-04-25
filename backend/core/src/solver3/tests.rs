//! Focused foundation tests for the `solver3` Phase 2 dense-state layer.
//!
//! Tests are layered:
//! 1. Pair index math — bijection, formula, edge cases.
//! 2. CompiledProblem construction — indices, capacities, constraint adjacency.
//! 3. RuntimeState initialization — determinism, flat array consistency.
//! 4. Oracle correctness — score recompute matches expected values.
//! 5. Invariant validation — clean pass and targeted rejection cases.
//! 6. Drift check — oracle matches runtime aggregates after initialization.

use std::collections::HashMap;

#[cfg(feature = "solver3-oracle-checks")]
use std::fs;
#[cfg(feature = "solver3-oracle-checks")]
use std::path::Path;

#[cfg(feature = "solver3-oracle-checks")]
use rand::{RngExt, SeedableRng};
#[cfg(feature = "solver3-oracle-checks")]
use rand_chacha::ChaCha12Rng;
#[cfg(feature = "solver3-oracle-checks")]
use serde::Deserialize;

use crate::models::{
    ApiInput, AttributeBalanceMode, AttributeBalanceParams, Constraint, Group,
    ImmovablePersonParams, Objective, PairMeetingCountParams, PairMeetingMode, Person,
    ProblemDefinition, RepeatEncounterParams, Solver3ConstructionMode, Solver3Params,
    SolverConfiguration, SolverParams, StopConditions,
};

use super::compiled_problem::{CompiledProblem, PackedSchedule};
use super::moves::{
    analyze_clique_swap, analyze_swap, analyze_transfer, apply_clique_swap_runtime_preview,
    apply_swap_runtime_preview, apply_transfer_runtime_preview,
    preview_clique_swap_oracle_recompute, preview_clique_swap_runtime_checked,
    preview_clique_swap_runtime_lightweight, preview_clique_swap_runtime_trusted,
    preview_swap_oracle_recompute, preview_swap_runtime_checked, preview_swap_runtime_lightweight,
    preview_swap_runtime_trusted, preview_transfer_oracle_recompute,
    preview_transfer_runtime_checked, preview_transfer_runtime_lightweight,
    preview_transfer_runtime_trusted, CliqueSwapFeasibility, CliqueSwapMove, SwapFeasibility,
    SwapMove, TransferFeasibility, TransferMove,
};
use super::oracle::check_drift;
use super::runtime_state::RuntimeState;
use super::scoring::recompute::recompute_oracle_score;
use super::validation::invariants::validate_invariants;
use crate::solver_support::construction::constraint_scenario_oracle::{
    build_constraint_scenario_ensemble, build_constraint_scenario_scaffold_mask,
    extract_constraint_scenario_signals, generate_oracle_template_candidates,
    merge_projected_oracle_template_into_scaffold, project_oracle_schedule_to_template,
    validate_pure_oracle_schedule, ConstraintScenarioCandidate, ConstraintScenarioCandidateSource,
    OracleTemplateCandidate, OracleTemplateProjectionResult, PureStructureOracle,
    PureStructureOracleRequest, PureStructureOracleSchedule, Solver6PureStructureOracle,
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

fn solver3_config() -> SolverConfiguration {
    SolverConfiguration {
        solver_type: "solver3".to_string(),
        stop_conditions: StopConditions {
            max_iterations: None,
            time_limit_seconds: None,
            no_improvement_iterations: None,
            stop_on_optimal_score: true,
        },
        solver_params: SolverParams::Solver3(Solver3Params::default()),
        logging: Default::default(),
        telemetry: Default::default(),
        seed: None,
        move_policy: None,
        allowed_sessions: None,
    }
}

/// 4 people, 2 groups (2 each), 2 sessions — minimal case.
fn minimal_input() -> ApiInput {
    ApiInput {
        problem: ProblemDefinition {
            people: (0..4)
                .map(|i| Person {
                    id: format!("p{}", i),
                    attributes: HashMap::new(),
                    sessions: None,
                })
                .collect(),
            groups: vec![
                Group {
                    id: "g0".into(),
                    size: 2,
                    session_sizes: None,
                },
                Group {
                    id: "g1".into(),
                    size: 2,
                    session_sizes: None,
                },
            ],
            num_sessions: 2,
        },
        initial_schedule: None,
        construction_seed_schedule: None,
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".into(),
            weight: 1.0,
        }],
        constraints: vec![],
        solver: solver3_config(),
    }
}

fn pure_sgp_solver3_input(num_groups: usize, group_size: usize, num_sessions: usize) -> ApiInput {
    let num_people = num_groups * group_size;
    ApiInput {
        problem: ProblemDefinition {
            people: (0..num_people)
                .map(|idx| Person {
                    id: format!("p{idx}"),
                    attributes: HashMap::new(),
                    sessions: None,
                })
                .collect(),
            groups: (0..num_groups)
                .map(|idx| Group {
                    id: format!("g{idx}"),
                    size: group_size as u32,
                    session_sizes: None,
                })
                .collect(),
            num_sessions: num_sessions as u32,
        },
        initial_schedule: None,
        construction_seed_schedule: None,
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".into(),
            weight: 1.0,
        }],
        constraints: vec![Constraint::RepeatEncounter(RepeatEncounterParams {
            max_allowed_encounters: 1,
            penalty_function: "squared".into(),
            penalty_weight: 1000.0,
        })],
        solver: solver3_config(),
    }
}

fn repeated_partition_schedule(
    num_groups: usize,
    group_size: usize,
    num_sessions: usize,
) -> PackedSchedule {
    (0..num_sessions)
        .map(|_| {
            (0..num_groups)
                .map(|group_idx| {
                    let start = group_idx * group_size;
                    (start..start + group_size).collect::<Vec<_>>()
                })
                .collect::<Vec<_>>()
        })
        .collect()
}

/// 6 people, 2 groups (3 each), 3 sessions with all major constraint types.
fn representative_input() -> ApiInput {
    let mut people = Vec::new();
    for i in 0..6 {
        let mut attrs = HashMap::new();
        attrs.insert(
            "role".into(),
            if i % 2 == 0 { "red" } else { "blue" }.into(),
        );
        people.push(Person {
            id: format!("p{}", i),
            attributes: attrs,
            sessions: if i == 5 { Some(vec![1, 2]) } else { None },
        });
    }

    let groups = vec![
        Group {
            id: "g0".into(),
            size: 3,
            session_sizes: None,
        },
        Group {
            id: "g1".into(),
            size: 3,
            session_sizes: None,
        },
    ];

    let mut initial_schedule = HashMap::new();
    initial_schedule.insert(
        "session_0".into(),
        HashMap::from([
            ("g0".into(), vec!["p0".into(), "p1".into(), "p4".into()]),
            ("g1".into(), vec!["p2".into(), "p3".into()]),
        ]),
    );
    initial_schedule.insert(
        "session_1".into(),
        HashMap::from([
            ("g0".into(), vec!["p0".into(), "p1".into(), "p5".into()]),
            ("g1".into(), vec!["p2".into(), "p3".into(), "p4".into()]),
        ]),
    );
    initial_schedule.insert(
        "session_2".into(),
        HashMap::from([
            ("g0".into(), vec!["p0".into(), "p2".into(), "p4".into()]),
            ("g1".into(), vec!["p1".into(), "p3".into(), "p5".into()]),
        ]),
    );

    ApiInput {
        problem: ProblemDefinition {
            people,
            groups,
            num_sessions: 3,
        },
        initial_schedule: Some(initial_schedule),
        construction_seed_schedule: None,
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".into(),
            weight: 1.0,
        }],
        constraints: vec![
            Constraint::RepeatEncounter(crate::models::RepeatEncounterParams {
                max_allowed_encounters: 1,
                penalty_function: "squared".into(),
                penalty_weight: 10.0,
            }),
            Constraint::AttributeBalance(AttributeBalanceParams {
                group_id: "ALL".into(),
                attribute_key: "role".into(),
                desired_values: HashMap::from([("red".into(), 1u32), ("blue".into(), 1u32)]),
                penalty_weight: 2.0,
                mode: AttributeBalanceMode::Exact,
                sessions: Some(vec![0, 1, 2]),
            }),
            Constraint::MustStayTogether {
                people: vec!["p0".into(), "p1".into()],
                sessions: Some(vec![0, 1]),
            },
            Constraint::ShouldNotBeTogether {
                people: vec!["p2".into(), "p3".into()],
                penalty_weight: 7.0,
                sessions: Some(vec![0]),
            },
            Constraint::ShouldStayTogether {
                people: vec!["p4".into(), "p5".into()],
                penalty_weight: 5.0,
                sessions: Some(vec![1, 2]),
            },
            Constraint::ImmovablePerson(ImmovablePersonParams {
                person_id: "p4".into(),
                group_id: "g1".into(),
                sessions: Some(vec![1]),
            }),
            Constraint::PairMeetingCount(PairMeetingCountParams {
                people: vec!["p2".into(), "p5".into()],
                sessions: vec![1, 2],
                target_meetings: 1,
                mode: PairMeetingMode::Exact,
                penalty_weight: 3.0,
            }),
        ],
        solver: solver3_config(),
    }
}

fn freedom_aware_input() -> ApiInput {
    let mut config = solver3_config();
    config.seed = Some(17);
    if let SolverParams::Solver3(params) = &mut config.solver_params {
        params.construction.mode = Solver3ConstructionMode::FreedomAwareRandomized;
        params.construction.freedom_aware.gamma = 0.0;
    }

    let construction_seed_schedule = HashMap::from([
        (
            "session_0".to_string(),
            HashMap::from([("g0".to_string(), vec!["p0".to_string()])]),
        ),
        (
            "session_1".to_string(),
            HashMap::from([("g2".to_string(), vec!["p5".to_string()])]),
        ),
    ]);

    ApiInput {
        problem: ProblemDefinition {
            people: vec![
                Person {
                    id: "p0".into(),
                    attributes: HashMap::new(),
                    sessions: None,
                },
                Person {
                    id: "p1".into(),
                    attributes: HashMap::new(),
                    sessions: None,
                },
                Person {
                    id: "p2".into(),
                    attributes: HashMap::new(),
                    sessions: None,
                },
                Person {
                    id: "p3".into(),
                    attributes: HashMap::new(),
                    sessions: None,
                },
                Person {
                    id: "p4".into(),
                    attributes: HashMap::new(),
                    sessions: Some(vec![0]),
                },
                Person {
                    id: "p5".into(),
                    attributes: HashMap::new(),
                    sessions: Some(vec![1]),
                },
            ],
            groups: vec![
                Group {
                    id: "g0".into(),
                    size: 2,
                    session_sizes: Some(vec![2, 2]),
                },
                Group {
                    id: "g1".into(),
                    size: 1,
                    session_sizes: Some(vec![1, 1]),
                },
                Group {
                    id: "g2".into(),
                    size: 2,
                    session_sizes: Some(vec![2, 2]),
                },
            ],
            num_sessions: 2,
        },
        initial_schedule: None,
        construction_seed_schedule: Some(construction_seed_schedule),
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".into(),
            weight: 1.0,
        }],
        constraints: vec![
            Constraint::MustStayTogether {
                people: vec!["p1".into(), "p2".into()],
                sessions: Some(vec![1]),
            },
            Constraint::ImmovablePerson(ImmovablePersonParams {
                person_id: "p3".into(),
                group_id: "g1".into(),
                sessions: Some(vec![0]),
            }),
        ],
        solver: config,
    }
}

// ---------------------------------------------------------------------------
// 1. Pair index math
// ---------------------------------------------------------------------------

#[test]
fn pair_index_formula_is_correct_for_small_n() {
    let input = minimal_input();
    let cp = CompiledProblem::compile(&input).unwrap();
    // N=4, expected pairs: (0,1)=0, (0,2)=1, (0,3)=2, (1,2)=3, (1,3)=4, (2,3)=5
    assert_eq!(cp.pair_idx(0, 1), 0);
    assert_eq!(cp.pair_idx(0, 2), 1);
    assert_eq!(cp.pair_idx(0, 3), 2);
    assert_eq!(cp.pair_idx(1, 2), 3);
    assert_eq!(cp.pair_idx(1, 3), 4);
    assert_eq!(cp.pair_idx(2, 3), 5);
    // Symmetric.
    assert_eq!(cp.pair_idx(1, 0), 0);
    assert_eq!(cp.pair_idx(3, 2), 5);
}

#[test]
fn pair_index_is_bijective() {
    let input = representative_input();
    let cp = CompiledProblem::compile(&input).unwrap();
    let n = cp.num_people; // 6
    assert_eq!(cp.num_pairs, n * (n - 1) / 2);

    let mut seen = vec![false; cp.num_pairs];
    for a in 0..n {
        for b in (a + 1)..n {
            let idx = cp.pair_idx(a, b);
            assert!(
                idx < cp.num_pairs,
                "pair_idx({},{}) = {} out of range",
                a,
                b,
                idx
            );
            assert!(!seen[idx], "pair_idx({},{}) = {} collides", a, b, idx);
            seen[idx] = true;
        }
    }
    assert!(seen.iter().all(|&x| x), "not all pair indices were covered");
}

#[test]
fn num_pairs_is_zero_for_single_person() {
    // Build a minimal 1-person input.
    let input = ApiInput {
        problem: ProblemDefinition {
            people: vec![Person {
                id: "p0".into(),
                attributes: HashMap::new(),
                sessions: None,
            }],
            groups: vec![Group {
                id: "g0".into(),
                size: 1,
                session_sizes: None,
            }],
            num_sessions: 1,
        },
        initial_schedule: None,
        construction_seed_schedule: None,
        objectives: vec![],
        constraints: vec![],
        solver: solver3_config(),
    };
    let cp = CompiledProblem::compile(&input).unwrap();
    assert_eq!(cp.num_pairs, 0);
    assert_eq!(cp.num_people, 1);
}

// ---------------------------------------------------------------------------
// 2. CompiledProblem construction
// ---------------------------------------------------------------------------

#[test]
fn compiled_problem_indexes_are_correct() {
    let input = representative_input();
    let cp = CompiledProblem::compile(&input).unwrap();

    assert_eq!(cp.num_people, 6);
    assert_eq!(cp.num_groups, 2);
    assert_eq!(cp.num_sessions, 3);
    assert_eq!(cp.num_pairs, 15); // 6*5/2

    assert_eq!(cp.person_id_to_idx["p0"], 0);
    assert_eq!(cp.person_id_to_idx["p5"], 5);
    assert_eq!(cp.group_id_to_idx["g0"], 0);
    assert_eq!(cp.group_id_to_idx["g1"], 1);
}

#[test]
fn compiled_problem_constraint_adjacency_is_populated() {
    let input = representative_input();
    let cp = CompiledProblem::compile(&input).unwrap();

    assert_eq!(cp.cliques.len(), 1);
    assert_eq!(cp.soft_apart_pairs.len(), 1);
    assert_eq!(cp.should_together_pairs.len(), 1);
    assert_eq!(cp.immovable_assignments.len(), 1);
    assert_eq!(cp.pair_meeting_constraints.len(), 1);

    // Soft-apart adjacency: p2 and p3 each get one entry.
    let p2 = cp.person_id_to_idx["p2"];
    let p3 = cp.person_id_to_idx["p3"];
    assert_eq!(cp.soft_apart_pairs_by_person[p2].len(), 1);
    assert_eq!(cp.soft_apart_pairs_by_person[p3].len(), 1);
}

#[test]
fn compiled_problem_hard_apart_pairs_expand_and_index_by_person() {
    let mut input = minimal_input();
    input.constraints = vec![Constraint::MustStayApart {
        people: vec!["p0".into(), "p1".into(), "p2".into()],
        sessions: Some(vec![1]),
    }];

    let cp = CompiledProblem::compile(&input).unwrap();
    let p0 = cp.person_id_to_idx["p0"];
    let p1 = cp.person_id_to_idx["p1"];
    let p2 = cp.person_id_to_idx["p2"];

    assert_eq!(cp.hard_apart_pairs.len(), 3);
    assert_eq!(cp.hard_apart_pairs_by_person[p0].len(), 2);
    assert_eq!(cp.hard_apart_pairs_by_person[p1].len(), 2);
    assert_eq!(cp.hard_apart_pairs_by_person[p2].len(), 2);
    assert!(cp.hard_apart_active(1, p0, p1));
    assert!(cp.hard_apart_active(1, p0, p2));
    assert!(cp.hard_apart_active(1, p1, p2));
    assert!(!cp.hard_apart_active(0, p0, p1));
}

#[test]
fn compiled_problem_rejects_hard_apart_conflict_with_clique() {
    let mut input = minimal_input();
    input.constraints = vec![
        Constraint::MustStayTogether {
            people: vec!["p0".into(), "p1".into()],
            sessions: Some(vec![0]),
        },
        Constraint::MustStayApart {
            people: vec!["p0".into(), "p1".into()],
            sessions: Some(vec![0]),
        },
    ];

    let err = CompiledProblem::compile(&input).unwrap_err();
    assert!(
        err.to_string()
            .contains("MustStayApart conflicts with MustStayTogether"),
        "unexpected error: {err}"
    );
}

#[test]
fn compiled_problem_rejects_wrong_solver_kind() {
    let mut input = minimal_input();
    input.solver.solver_type = "solver4".into();
    input.solver.solver_params = SolverParams::Solver4(crate::models::Solver4Params::default());
    let err = CompiledProblem::compile(&input).unwrap_err();
    assert!(
        err.to_string().contains("solver3"),
        "error should mention solver3: {}",
        err
    );
}

#[test]
fn group_session_slot_matches_pair_idx_semantics() {
    let input = minimal_input();
    let cp = CompiledProblem::compile(&input).unwrap();
    // Slot is row-major: session*num_groups + group.
    assert_eq!(cp.group_session_slot(0, 0), 0);
    assert_eq!(cp.group_session_slot(0, 1), 1);
    assert_eq!(cp.group_session_slot(1, 0), 2);
    assert_eq!(cp.group_session_slot(1, 1), 3);
}

// ---------------------------------------------------------------------------
// 3. RuntimeState initialization
// ---------------------------------------------------------------------------

#[test]
fn runtime_state_initialization_is_deterministic() {
    let input = minimal_input();
    let s1 = RuntimeState::from_input(&input).unwrap();
    let s2 = RuntimeState::from_input(&input).unwrap();

    assert_eq!(s1.person_location, s2.person_location);
    assert_eq!(s1.group_sizes, s2.group_sizes);
    assert_eq!(s1.pair_contacts, s2.pair_contacts);
    assert_eq!(s1.total_score, s2.total_score);
}

#[test]
fn constraint_scenario_oracle_constructor_returns_cs_scaffold() {
    let mut input = minimal_input();
    if let SolverParams::Solver3(params) = &mut input.solver.solver_params {
        params.construction.mode = Solver3ConstructionMode::ConstraintScenarioOracleGuided;
    }

    let state = RuntimeState::from_input(&input).unwrap();
    validate_invariants(&state).unwrap();
    assert_eq!(state.compiled.num_sessions, 2);
    assert_eq!(state.compiled.num_people, 4);
}

#[test]
fn constraint_scenario_oracle_constructor_returns_scaffold_when_no_oracle_template_exists() {
    let mut input = representative_input();
    input.initial_schedule = None;
    if let SolverParams::Solver3(params) = &mut input.solver.solver_params {
        params.construction.mode = Solver3ConstructionMode::ConstraintScenarioOracleGuided;
    }

    let state = RuntimeState::from_input(&input).unwrap();
    validate_invariants(&state).unwrap();
    assert!(state.total_score.is_finite());
}

#[test]
fn constraint_scenario_oracle_constructor_declines_when_repeat_pressure_absent() {
    let mut input = minimal_input();
    input.objectives.clear();
    if let SolverParams::Solver3(params) = &mut input.solver.solver_params {
        params.construction.mode = Solver3ConstructionMode::ConstraintScenarioOracleGuided;
    }

    let state = RuntimeState::from_input(&input).unwrap();
    validate_invariants(&state).unwrap();
    assert_eq!(state.compiled.maximize_unique_contacts_weight, 0.0);
}

#[test]
fn constraint_scenario_oracle_constructor_preserves_must_stay_apart() {
    let mut input = pure_sgp_solver3_input(3, 3, 4);
    input.constraints.push(Constraint::MustStayApart {
        people: vec!["p0".into(), "p1".into()],
        sessions: None,
    });
    if let SolverParams::Solver3(params) = &mut input.solver.solver_params {
        params.construction.mode = Solver3ConstructionMode::ConstraintScenarioOracleGuided;
    }

    let state = RuntimeState::from_input(&input).unwrap();
    validate_invariants(&state).unwrap();
    let p0 = state.compiled.person_id_to_idx["p0"];
    let p1 = state.compiled.person_id_to_idx["p1"];
    for session_idx in 0..state.compiled.num_sessions {
        assert_ne!(
            state.person_location[state.people_slot(session_idx, p0)],
            state.person_location[state.people_slot(session_idx, p1)],
            "ConstraintScenarioOracleGuided placed a MustStayApart pair together in session {session_idx}"
        );
    }
}

#[test]
fn constraint_scenario_signals_capture_pair_pressure_and_rigidity() {
    let input = minimal_input();
    let compiled = CompiledProblem::compile(&input).unwrap();
    let schedule_a: PackedSchedule =
        vec![vec![vec![0, 1], vec![2, 3]], vec![vec![0, 1], vec![2, 3]]];
    let schedule_b: PackedSchedule =
        vec![vec![vec![0, 1], vec![2, 3]], vec![vec![0, 2], vec![1, 3]]];
    let ensemble = build_constraint_scenario_ensemble(vec![
        ConstraintScenarioCandidate {
            schedule: schedule_a,
            source: ConstraintScenarioCandidateSource::BaselineLegacy,
            seed: 1,
            cs_score: 0.0,
            real_score: 0.0,
        },
        ConstraintScenarioCandidate {
            schedule: schedule_b,
            source: ConstraintScenarioCandidateSource::FreedomAwareDeterministic,
            seed: 2,
            cs_score: 0.0,
            real_score: 0.0,
        },
    ])
    .unwrap();

    let signals = extract_constraint_scenario_signals(&compiled, &ensemble);
    let pair_01 = compiled.pair_idx(0, 1);
    assert_eq!(signals.pair_pressure(&compiled, 0, pair_01), 1.0);
    assert_eq!(signals.pair_pressure(&compiled, 1, pair_01), 0.5);
    assert_eq!(signals.placement_frequency(&compiled, 1, 1, 0), 0.5);
    assert_eq!(signals.placement_frequency(&compiled, 1, 1, 1), 0.5);
    assert!(signals.rigidity(&compiled, 0, 1) > 0.99);
    assert!(signals.rigidity(&compiled, 1, 1) < 0.01);
}

#[test]
fn constraint_scenario_scaffold_mask_protects_rigid_and_immovable_placements() {
    let mut input = minimal_input();
    input
        .constraints
        .push(Constraint::ImmovablePerson(ImmovablePersonParams {
            person_id: "p0".into(),
            group_id: "g0".into(),
            sessions: Some(vec![0]),
        }));
    let compiled = CompiledProblem::compile(&input).unwrap();
    let schedule_a: PackedSchedule =
        vec![vec![vec![0, 1], vec![2, 3]], vec![vec![0, 1], vec![2, 3]]];
    let schedule_b: PackedSchedule =
        vec![vec![vec![0, 1], vec![2, 3]], vec![vec![0, 2], vec![1, 3]]];
    let ensemble = build_constraint_scenario_ensemble(vec![
        ConstraintScenarioCandidate {
            schedule: schedule_a.clone(),
            source: ConstraintScenarioCandidateSource::BaselineLegacy,
            seed: 1,
            cs_score: 0.0,
            real_score: 0.0,
        },
        ConstraintScenarioCandidate {
            schedule: schedule_b,
            source: ConstraintScenarioCandidateSource::FreedomAwareDeterministic,
            seed: 2,
            cs_score: 0.0,
            real_score: 0.0,
        },
    ])
    .unwrap();
    let signals = extract_constraint_scenario_signals(&compiled, &ensemble);
    let mask = build_constraint_scenario_scaffold_mask(&compiled, &schedule_a, &signals);

    assert!(mask.is_frozen(&compiled, 0, 0)); // immovable
    assert!(!mask.is_frozen(&compiled, 0, 1)); // entropy-only rigidity is a soft prior
    assert!(!mask.is_frozen(&compiled, 1, 1)); // split evenly across groups
    assert_eq!(
        mask.rigid_placement_count + mask.flexible_placement_count,
        8
    );
}

#[test]
fn oracle_template_generator_finds_flexible_pure_sgp_template() {
    let input = minimal_input();
    let compiled = CompiledProblem::compile(&input).unwrap();
    let schedule_a: PackedSchedule =
        vec![vec![vec![0, 1], vec![2, 3]], vec![vec![0, 1], vec![2, 3]]];
    let schedule_b: PackedSchedule =
        vec![vec![vec![2, 3], vec![0, 1]], vec![vec![2, 3], vec![0, 1]]];
    let ensemble = build_constraint_scenario_ensemble(vec![
        ConstraintScenarioCandidate {
            schedule: schedule_a.clone(),
            source: ConstraintScenarioCandidateSource::BaselineLegacy,
            seed: 1,
            cs_score: 0.0,
            real_score: 0.0,
        },
        ConstraintScenarioCandidate {
            schedule: schedule_b,
            source: ConstraintScenarioCandidateSource::FreedomAwareRandomized,
            seed: 2,
            cs_score: 0.0,
            real_score: 0.0,
        },
    ])
    .unwrap();
    let signals = extract_constraint_scenario_signals(&compiled, &ensemble);
    let mask = build_constraint_scenario_scaffold_mask(&compiled, &schedule_a, &signals);

    let template = generate_oracle_template_candidates(&compiled, &schedule_a, &signals, &mask)
        .into_iter()
        .next()
        .expect("expected flexible oracle template");
    assert_eq!(template.oracle_capacity, 4);
    assert_eq!(template.num_sessions(), 2);
    assert_eq!(template.num_groups, 2);
    assert_eq!(template.group_size, 2);
}

#[derive(Debug, Clone)]
struct FakePureStructureOracle {
    schedule: PackedSchedule,
}

impl PureStructureOracle for FakePureStructureOracle {
    fn solve(
        &self,
        request: &PureStructureOracleRequest,
    ) -> Result<PureStructureOracleSchedule, crate::solver_support::SolverError> {
        validate_pure_oracle_schedule(request, &self.schedule)?;
        Ok(PureStructureOracleSchedule {
            schedule: self.schedule.clone(),
        })
    }
}

#[test]
fn pure_structure_oracle_seam_supports_fake_oracle() {
    let request = PureStructureOracleRequest {
        num_groups: 2,
        group_size: 2,
        num_sessions: 2,
        seed: 7,
    };
    let fake = FakePureStructureOracle {
        schedule: vec![vec![vec![0, 1], vec![2, 3]], vec![vec![0, 2], vec![1, 3]]],
    };

    let schedule = fake.solve(&request).unwrap();
    assert_eq!(schedule.schedule.len(), 2);
    assert_eq!(schedule.schedule[0].len(), 2);
}

#[test]
fn solver6_pure_structure_oracle_services_exact_small_block() {
    let request = PureStructureOracleRequest {
        num_groups: 2,
        group_size: 2,
        num_sessions: 3,
        seed: 11,
    };

    let schedule = Solver6PureStructureOracle.solve(&request).unwrap();
    validate_pure_oracle_schedule(&request, &schedule.schedule).unwrap();
}

#[test]
fn oracle_template_projection_improves_pair_alignment_and_aligns_groups() {
    let input = minimal_input();
    let compiled = CompiledProblem::compile(&input).unwrap();
    let scaffold: PackedSchedule = vec![vec![vec![0, 1], vec![2, 3]], vec![vec![0, 1], vec![2, 3]]];
    let mut signals = crate::solver_support::construction::constraint_scenario_oracle::ConstraintScenarioSignals {
        pair_pressure_by_session_pair: vec![0.0; compiled.num_sessions * compiled.num_pairs],
        placement_histogram_by_person_session_group: vec![
            0.0;
            compiled.num_sessions
                * compiled.num_people
                * compiled.num_groups
        ],
        rigidity_by_person_session: vec![0.0; compiled.num_sessions * compiled.num_people],
        rigid_placement_count: 0,
        flexible_placement_count: compiled.num_sessions * compiled.num_people,
    };
    for session_idx in 0..compiled.num_sessions {
        let pair_02 = compiled.pair_idx(0, 2);
        let pair_13 = compiled.pair_idx(1, 3);
        signals.pair_pressure_by_session_pair[session_idx * compiled.num_pairs + pair_02] = 1.0;
        signals.pair_pressure_by_session_pair[session_idx * compiled.num_pairs + pair_13] = 1.0;
        for &person_idx in &[0usize, 2] {
            signals.placement_histogram_by_person_session_group
                [(session_idx * compiled.num_people + person_idx) * compiled.num_groups] = 1.0;
        }
        for &person_idx in &[1usize, 3] {
            signals.placement_histogram_by_person_session_group
                [(session_idx * compiled.num_people + person_idx) * compiled.num_groups + 1] = 1.0;
        }
    }
    let mask = build_constraint_scenario_scaffold_mask(&compiled, &scaffold, &signals);
    let candidate = OracleTemplateCandidate {
        sessions: vec![0, 1],
        groups_by_session: vec![vec![0, 1], vec![0, 1]],
        num_groups: 2,
        group_size: 2,
        oracle_capacity: 4,
        stable_people_count: 4,
        high_attendance_people_count: 4,
        dummy_oracle_people: 0,
        omitted_high_attendance_people: 0,
        omitted_group_count: 0,
        scaffold_disruption_risk: 0.0,
        estimated_score: 1.0,
    };
    let oracle_schedule = PureStructureOracleSchedule {
        schedule: vec![vec![vec![0, 1], vec![2, 3]], vec![vec![0, 1], vec![2, 3]]],
    };

    let projection = project_oracle_schedule_to_template(
        &compiled,
        &signals,
        &mask,
        &candidate,
        &oracle_schedule,
    )
    .unwrap();
    assert!(projection.pair_alignment_score >= 4.0);
    assert!(projection.group_alignment_score > 0.0);
    assert_eq!(projection.mapped_real_people, 4);
    let mut assigned_groups = projection.real_group_by_session_oracle_group[0].clone();
    assigned_groups.sort_unstable();
    assert_eq!(assigned_groups, vec![0, 1]);
}

#[test]
fn oracle_template_merge_injects_projected_contacts_into_flexible_scaffold() {
    let input = minimal_input();
    let compiled = CompiledProblem::compile(&input).unwrap();
    let scaffold: PackedSchedule = vec![vec![vec![0, 1], vec![2, 3]], vec![vec![0, 1], vec![2, 3]]];
    let alternate: PackedSchedule =
        vec![vec![vec![2, 3], vec![0, 1]], vec![vec![2, 3], vec![0, 1]]];
    let ensemble = build_constraint_scenario_ensemble(vec![
        ConstraintScenarioCandidate {
            schedule: scaffold.clone(),
            source: ConstraintScenarioCandidateSource::BaselineLegacy,
            seed: 1,
            cs_score: 0.0,
            real_score: 0.0,
        },
        ConstraintScenarioCandidate {
            schedule: alternate,
            source: ConstraintScenarioCandidateSource::FreedomAwareRandomized,
            seed: 2,
            cs_score: 0.0,
            real_score: 0.0,
        },
    ])
    .unwrap();
    let signals = extract_constraint_scenario_signals(&compiled, &ensemble);
    let mask = build_constraint_scenario_scaffold_mask(&compiled, &scaffold, &signals);
    let candidate = OracleTemplateCandidate {
        sessions: vec![0, 1],
        groups_by_session: vec![vec![0, 1], vec![0, 1]],
        num_groups: 2,
        group_size: 2,
        oracle_capacity: 4,
        stable_people_count: 4,
        high_attendance_people_count: 4,
        dummy_oracle_people: 0,
        omitted_high_attendance_people: 0,
        omitted_group_count: 0,
        scaffold_disruption_risk: 0.0,
        estimated_score: 1.0,
    };
    let oracle_schedule = PureStructureOracleSchedule {
        schedule: vec![vec![vec![0, 1], vec![2, 3]], vec![vec![0, 1], vec![2, 3]]],
    };
    let projection = OracleTemplateProjectionResult {
        real_person_by_oracle_person: vec![Some(0), Some(2), Some(1), Some(3)],
        real_group_by_session_oracle_group: vec![vec![0, 1], vec![0, 1]],
        score: 0.0,
        pair_alignment_score: 0.0,
        group_alignment_score: 0.0,
        rigidity_mismatch: 0.0,
        mapped_real_people: 4,
        dummy_oracle_people: 0,
    };

    let merged = merge_projected_oracle_template_into_scaffold(
        &compiled,
        &scaffold,
        &signals,
        &mask,
        &candidate,
        &oracle_schedule,
        &projection,
    )
    .unwrap();

    assert_eq!(merged.schedule[0][0], vec![0, 2]);
    assert_eq!(merged.schedule[0][1], vec![1, 3]);
    assert_eq!(merged.changed_placement_count, 8);
}

#[test]
fn oracle_template_projection_uses_structurally_frozen_people_as_anchors() {
    let mut input = minimal_input();
    input.constraints.extend([
        Constraint::ImmovablePerson(ImmovablePersonParams {
            person_id: "p0".into(),
            group_id: "g0".into(),
            sessions: Some(vec![0, 1]),
        }),
        Constraint::ImmovablePerson(ImmovablePersonParams {
            person_id: "p1".into(),
            group_id: "g0".into(),
            sessions: Some(vec![0, 1]),
        }),
        Constraint::ImmovablePerson(ImmovablePersonParams {
            person_id: "p2".into(),
            group_id: "g1".into(),
            sessions: Some(vec![0, 1]),
        }),
        Constraint::ImmovablePerson(ImmovablePersonParams {
            person_id: "p3".into(),
            group_id: "g1".into(),
            sessions: Some(vec![0, 1]),
        }),
    ]);
    let compiled = CompiledProblem::compile(&input).unwrap();
    let schedule_a: PackedSchedule =
        vec![vec![vec![0, 1], vec![2, 3]], vec![vec![0, 1], vec![2, 3]]];
    let ensemble = build_constraint_scenario_ensemble(vec![ConstraintScenarioCandidate {
        schedule: schedule_a.clone(),
        source: ConstraintScenarioCandidateSource::BaselineLegacy,
        seed: 1,
        cs_score: 0.0,
        real_score: 0.0,
    }])
    .unwrap();
    let signals = extract_constraint_scenario_signals(&compiled, &ensemble);
    let mask = build_constraint_scenario_scaffold_mask(&compiled, &schedule_a, &signals);
    let candidate = OracleTemplateCandidate {
        sessions: vec![0, 1],
        groups_by_session: vec![vec![0, 1], vec![0, 1]],
        num_groups: 2,
        group_size: 2,
        oracle_capacity: 4,
        stable_people_count: 0,
        high_attendance_people_count: 0,
        dummy_oracle_people: 4,
        omitted_high_attendance_people: 0,
        omitted_group_count: 0,
        scaffold_disruption_risk: 0.0,
        estimated_score: 0.0,
    };
    let oracle_schedule = PureStructureOracleSchedule {
        schedule: vec![vec![vec![0, 1], vec![2, 3]], vec![vec![0, 1], vec![2, 3]]],
    };

    let projection = project_oracle_schedule_to_template(
        &compiled,
        &signals,
        &mask,
        &candidate,
        &oracle_schedule,
    )
    .unwrap();
    assert_eq!(projection.mapped_real_people, 4);
    assert_eq!(projection.dummy_oracle_people, 0);
    let mut projected_people = projection
        .real_person_by_oracle_person
        .iter()
        .filter_map(|&person_idx| person_idx)
        .collect::<Vec<_>>();
    projected_people.sort_unstable();
    assert_eq!(projected_people, vec![0, 1, 2, 3]);

    let merged = merge_projected_oracle_template_into_scaffold(
        &compiled,
        &schedule_a,
        &signals,
        &mask,
        &candidate,
        &oracle_schedule,
        &projection,
    )
    .unwrap();
    assert_eq!(merged.schedule, schedule_a);
    assert_eq!(merged.changed_placement_count, 0);
}

#[test]
fn pure_repeat_only_sgp_exposes_the_whole_problem_as_oracle_template() {
    let input = pure_sgp_solver3_input(8, 4, 10);
    let compiled = CompiledProblem::compile(&input).unwrap();
    let scaffold = repeated_partition_schedule(8, 4, 10);
    let ensemble = build_constraint_scenario_ensemble(vec![ConstraintScenarioCandidate {
        schedule: scaffold.clone(),
        source: ConstraintScenarioCandidateSource::BaselineLegacy,
        seed: 1,
        cs_score: 0.0,
        real_score: 0.0,
    }])
    .unwrap();
    let signals = extract_constraint_scenario_signals(&compiled, &ensemble);
    let mask = build_constraint_scenario_scaffold_mask(&compiled, &scaffold, &signals);

    let candidates = generate_oracle_template_candidates(&compiled, &scaffold, &signals, &mask);
    let template = candidates
        .into_iter()
        .find(|candidate| {
            candidate.oracle_capacity == 32
                && candidate.num_sessions() == 10
                && candidate.num_groups == 8
                && candidate.group_size == 4
        })
        .expect("pure SGP should expose the full instance as flexible");
    assert_eq!(template.oracle_capacity, 32);
    assert_eq!(template.num_sessions(), 10);
    assert_eq!(template.num_groups, 8);
    assert_eq!(template.group_size, 4);
}

#[test]
fn oracle_guided_constructor_returns_solver6_perfect_sgp_incumbent() {
    let mut input = pure_sgp_solver3_input(8, 4, 10);
    if let SolverParams::Solver3(params) = &mut input.solver.solver_params {
        params.construction.mode = Solver3ConstructionMode::ConstraintScenarioOracleGuided;
    }

    let state = RuntimeState::from_input(&input).unwrap();
    validate_invariants(&state).unwrap();
    assert_eq!(state.repetition_penalty_raw, 0);
    assert!(
        state.total_score.abs() <= 1e-9,
        "expected perfect SGP incumbent, got score {}",
        state.total_score
    );
}

#[test]
fn runtime_state_rejects_out_of_range_freedom_aware_gamma() {
    let mut input = minimal_input();
    if let SolverParams::Solver3(params) = &mut input.solver.solver_params {
        params.construction.mode = Solver3ConstructionMode::FreedomAwareRandomized;
        params.construction.freedom_aware.gamma = 1.5;
    }

    let err = RuntimeState::from_input(&input).unwrap_err();
    assert!(err.to_string().contains("gamma"), "unexpected error: {err}");
}

#[test]
fn runtime_state_freedom_aware_mode_respects_seed_and_constraints() {
    let input = freedom_aware_input();
    let state = RuntimeState::from_input(&input).unwrap();
    let repeat_state = RuntimeState::from_input(&input).unwrap();
    let cp = &state.compiled;

    assert_eq!(state.to_api_schedule(), repeat_state.to_api_schedule());

    let session0 = state.to_api_schedule().get("session_0").unwrap().clone();
    let session1 = state.to_api_schedule().get("session_1").unwrap().clone();
    assert!(session0.get("g0").unwrap().contains(&"p0".to_string()));
    assert!(session1.get("g2").unwrap().contains(&"p5".to_string()));

    let p1 = cp.person_id_to_idx["p1"];
    let p2 = cp.person_id_to_idx["p2"];
    let p3 = cp.person_id_to_idx["p3"];
    let p4 = cp.person_id_to_idx["p4"];
    let p5 = cp.person_id_to_idx["p5"];
    let g1 = cp.group_id_to_idx["g1"];

    assert_eq!(
        state.person_location[state.people_slot(1, p1)],
        state.person_location[state.people_slot(1, p2)]
    );
    assert_eq!(state.person_location[state.people_slot(0, p3)], Some(g1));
    assert!(state.person_location[state.people_slot(0, p4)].is_some());
    assert_eq!(state.person_location[state.people_slot(1, p4)], None);
    assert_eq!(state.person_location[state.people_slot(0, p5)], None);
    assert!(state.person_location[state.people_slot(1, p5)].is_some());

    for session_idx in 0..cp.num_sessions {
        for group_idx in 0..cp.num_groups {
            let slot = state.group_slot(session_idx, group_idx);
            assert!(state.group_sizes[slot] <= cp.group_capacity(session_idx, group_idx));
        }
    }
}

#[test]
fn runtime_state_constructor_handles_partially_anchored_clique() {
    let mut input = minimal_input();
    input.constraints = vec![
        Constraint::MustStayTogether {
            people: vec!["p0".into(), "p1".into()],
            sessions: Some(vec![0]),
        },
        Constraint::ImmovablePerson(ImmovablePersonParams {
            person_id: "p0".into(),
            group_id: "g1".into(),
            sessions: Some(vec![0]),
        }),
    ];
    input.solver.seed = Some(5);
    if let SolverParams::Solver3(params) = &mut input.solver.solver_params {
        params.construction.mode = Solver3ConstructionMode::FreedomAwareRandomized;
        params.construction.freedom_aware.gamma = 0.0;
    }

    let state = RuntimeState::from_input(&input).expect("solver3 state should initialize");
    let cp = &state.compiled;
    let p0 = cp.person_id_to_idx["p0"];
    let p1 = cp.person_id_to_idx["p1"];
    let g1 = cp.group_id_to_idx["g1"];

    assert_eq!(state.person_location[state.people_slot(0, p0)], Some(g1));
    assert_eq!(state.person_location[state.people_slot(0, p1)], Some(g1));
}

#[test]
fn runtime_state_all_participating_people_are_placed() {
    let input = representative_input();
    let state = RuntimeState::from_input(&input).unwrap();
    let cp = &state.compiled;

    for sidx in 0..cp.num_sessions {
        for pidx in 0..cp.num_people {
            let ps = state.people_slot(sidx, pidx);
            let participates = cp.person_participation[pidx][sidx];
            let placed = state.person_location[ps].is_some();
            assert_eq!(
                participates,
                placed,
                "person '{}' in session {}: participates={} placed={}",
                cp.display_person(pidx),
                sidx,
                participates,
                placed
            );
        }
    }
}

#[test]
fn runtime_state_group_sizes_match_member_counts() {
    let input = representative_input();
    let state = RuntimeState::from_input(&input).unwrap();
    let cp = &state.compiled;

    for sidx in 0..cp.num_sessions {
        for gidx in 0..cp.num_groups {
            let gs = state.group_slot(sidx, gidx);
            assert_eq!(
                state.group_sizes[gs],
                state.group_members[gs].len(),
                "size mismatch for group {} session {}",
                gidx,
                sidx
            );
        }
    }
}

#[test]
fn runtime_state_respects_group_capacities() {
    let input = representative_input();
    let state = RuntimeState::from_input(&input).unwrap();
    let cp = &state.compiled;

    for sidx in 0..cp.num_sessions {
        for gidx in 0..cp.num_groups {
            let cap = cp.group_capacity(sidx, gidx);
            let gs = state.group_slot(sidx, gidx);
            assert!(
                state.group_sizes[gs] <= cap,
                "group '{}' in session {} exceeds capacity: {} > {}",
                cp.display_group(gidx),
                sidx,
                state.group_sizes[gs],
                cap
            );
        }
    }
}

#[test]
fn runtime_state_initial_schedule_is_honoured() {
    let input = representative_input();
    let state = RuntimeState::from_input(&input).unwrap();
    let cp = &state.compiled;

    // session_0: p0,p1 in g0 | p2,p3 in g1 (from initial_schedule).
    let p0 = cp.person_id_to_idx["p0"];
    let p1 = cp.person_id_to_idx["p1"];
    let p2 = cp.person_id_to_idx["p2"];
    let p3 = cp.person_id_to_idx["p3"];
    let g0 = cp.group_id_to_idx["g0"];
    let g1 = cp.group_id_to_idx["g1"];

    assert_eq!(state.person_location[state.people_slot(0, p0)], Some(g0));
    assert_eq!(state.person_location[state.people_slot(0, p1)], Some(g0));
    assert_eq!(state.person_location[state.people_slot(0, p2)], Some(g1));
    assert_eq!(state.person_location[state.people_slot(0, p3)], Some(g1));
}

#[test]
fn runtime_state_immovable_constraint_respected() {
    let input = representative_input();
    let state = RuntimeState::from_input(&input).unwrap();
    let cp = &state.compiled;

    // p4 is immovable to g1 in session 1.
    let p4 = cp.person_id_to_idx["p4"];
    let g1 = cp.group_id_to_idx["g1"];
    assert_eq!(
        state.person_location[state.people_slot(1, p4)],
        Some(g1),
        "p4 must be in g1 in session 1"
    );
}

#[test]
fn runtime_state_clique_placed_together() {
    // p0 and p1 have MustStayTogether in sessions 0 and 1.
    let input = representative_input();
    let state = RuntimeState::from_input(&input).unwrap();
    let cp = &state.compiled;

    let p0 = cp.person_id_to_idx["p0"];
    let p1 = cp.person_id_to_idx["p1"];

    for sidx in [0, 1] {
        let g0 = state.person_location[state.people_slot(sidx, p0)];
        let g1 = state.person_location[state.people_slot(sidx, p1)];
        assert_eq!(
            g0, g1,
            "p0 and p1 (MustStayTogether) must be in same group in session {}",
            sidx
        );
    }
}

#[test]
fn runtime_state_construction_respects_must_stay_apart() {
    let mut input = minimal_input();
    input.constraints = vec![Constraint::MustStayApart {
        people: vec!["p0".into(), "p1".into()],
        sessions: None,
    }];

    let state = RuntimeState::from_input(&input).unwrap();
    let cp = &state.compiled;
    let p0 = cp.person_id_to_idx["p0"];
    let p1 = cp.person_id_to_idx["p1"];

    for sidx in 0..cp.num_sessions {
        assert_ne!(
            state.person_location[state.people_slot(sidx, p0)],
            state.person_location[state.people_slot(sidx, p1)],
            "p0 and p1 must stay apart in session {}",
            sidx
        );
    }
}

#[test]
fn runtime_state_rejects_invalid_constructor_must_stay_apart_output() {
    let mut input = minimal_input();
    input.constraints = vec![Constraint::MustStayApart {
        people: vec!["p0".into(), "p1".into()],
        sessions: Some(vec![0]),
    }];
    input.construction_seed_schedule = Some(HashMap::from([(
        "session_0".into(),
        HashMap::from([
            ("g0".into(), vec!["p0".into(), "p1".into()]),
            ("g1".into(), Vec::new()),
        ]),
    )]));

    let err = RuntimeState::from_input(&input).unwrap_err().to_string();
    assert!(
        err.contains("constructor produced invalid schedule") && err.contains("MustStayApart"),
        "unexpected error: {err}"
    );
}

// ---------------------------------------------------------------------------
// 4. Pair contacts
// ---------------------------------------------------------------------------

#[test]
fn pair_contacts_built_from_group_members() {
    let input = minimal_input();
    let state = RuntimeState::from_input(&input).unwrap();
    let cp = &state.compiled;

    // Sum of all pair contacts should equal the sum of (group_size choose 2) per session/group.
    let expected_total: u32 = (0..cp.num_sessions)
        .flat_map(|s| (0..cp.num_groups).map(move |g| (s, g)))
        .map(|(s, g)| {
            let n = state.group_sizes[state.group_slot(s, g)] as u32;
            n * n.saturating_sub(1) / 2
        })
        .sum();

    let actual_total: u32 = state.pair_contacts.iter().map(|&c| c as u32).sum();
    assert_eq!(actual_total, expected_total);
}

#[test]
fn pair_contacts_consistent_with_fresh_oracle_computation() {
    let input = representative_input();
    let state = RuntimeState::from_input(&input).unwrap();
    let snap = recompute_oracle_score(&state).unwrap();
    // Oracle computes pair_contacts_fresh independently.
    assert_eq!(
        state.pair_contacts, snap.pair_contacts_fresh,
        "runtime pair_contacts should match oracle's independent computation"
    );
}

// ---------------------------------------------------------------------------
// 5. Oracle score correctness
// ---------------------------------------------------------------------------

#[test]
fn oracle_score_matches_runtime_aggregates_after_init() {
    let input = representative_input();
    let state = RuntimeState::from_input(&input).unwrap();
    let snap = recompute_oracle_score(&state).unwrap();

    assert_eq!(
        state.unique_contacts, snap.unique_contacts,
        "unique_contacts mismatch"
    );
    assert_eq!(
        state.repetition_penalty_raw, snap.repetition_penalty_raw,
        "repetition_penalty_raw mismatch"
    );

    let tol = 1e-9;
    assert!(
        (state.total_score - snap.total_score).abs() < tol,
        "total_score mismatch: runtime={} oracle={}",
        state.total_score,
        snap.total_score
    );
    assert!(
        (state.attribute_balance_penalty - snap.attribute_balance_penalty).abs() < tol,
        "attribute_balance_penalty mismatch"
    );
    assert!(
        (state.constraint_penalty_weighted - snap.constraint_penalty_weighted).abs() < tol,
        "constraint_penalty_weighted mismatch"
    );
}

#[test]
fn oracle_score_formula_is_consistent() {
    let input = minimal_input();
    let state = RuntimeState::from_input(&input).unwrap();
    let snap = recompute_oracle_score(&state).unwrap();

    let expected = snap.weighted_repetition_penalty
        + snap.attribute_balance_penalty
        + snap.constraint_penalty_weighted
        - (snap.unique_contacts as f64 * state.compiled.maximize_unique_contacts_weight)
        + snap.baseline_score;

    assert!(
        (snap.total_score - expected).abs() < 1e-9,
        "score formula inconsistency: snap.total_score={} expected={}",
        snap.total_score,
        expected
    );
}

#[test]
fn oracle_unique_contacts_counts_distinct_pairs() {
    let input = minimal_input();
    let state = RuntimeState::from_input(&input).unwrap();
    let snap = recompute_oracle_score(&state).unwrap();

    // unique_contacts counts pairs that met at least once.
    let manual: u32 = snap.pair_contacts_fresh.iter().filter(|&&c| c > 0).count() as u32;
    assert_eq!(snap.unique_contacts, manual);
}

// ---------------------------------------------------------------------------
// 6. Drift check
// ---------------------------------------------------------------------------

#[test]
fn drift_check_passes_on_valid_initialized_state() {
    let input = representative_input();
    let state = RuntimeState::from_input(&input).unwrap();
    check_drift(&state).unwrap();
}

#[test]
fn drift_check_catches_tampered_pair_contacts() {
    let input = minimal_input();
    let mut state = RuntimeState::from_input(&input).unwrap();

    // Corrupt one entry.
    if !state.pair_contacts.is_empty() {
        state.pair_contacts[0] = state.pair_contacts[0].wrapping_add(99);
        let err = check_drift(&state).unwrap_err();
        assert!(
            err.to_string().contains("pair_contacts") || err.to_string().contains("drift"),
            "unexpected error message: {}",
            err
        );
    }
}

#[test]
fn drift_check_catches_tampered_total_score() {
    let input = representative_input();
    let mut state = RuntimeState::from_input(&input).unwrap();
    state.total_score += 9999.0;
    let err = check_drift(&state).unwrap_err();
    assert!(
        err.to_string().contains("total_score") || err.to_string().contains("drift"),
        "unexpected error: {}",
        err
    );
}

// ---------------------------------------------------------------------------
// 7. Invariant validation
// ---------------------------------------------------------------------------

#[test]
fn invariants_pass_on_valid_state() {
    let input = representative_input();
    let state = RuntimeState::from_input(&input).unwrap();
    validate_invariants(&state).unwrap();
}

#[test]
fn invariants_pass_on_minimal_state() {
    let input = minimal_input();
    let state = RuntimeState::from_input(&input).unwrap();
    validate_invariants(&state).unwrap();
}

#[test]
fn invariants_detect_double_assignment() {
    // Use representative_input (groups of size 3) so we can add p0 to g1 without
    // exceeding capacity, letting the uniqueness check fire rather than capacity.
    let input = representative_input();
    let mut state = RuntimeState::from_input(&input).unwrap();
    let cp = state.compiled.clone();

    // After init, session 0 / g0 = [p0, p1, p4], g1 = [p2, p3] (both cap 3).
    // Adding p0 to g1 makes g1 = [p2, p3, p0], still within capacity.
    let p0 = cp.person_id_to_idx["p0"];
    let g1 = cp.group_id_to_idx["g1"];
    let gs1 = state.group_slot(0, g1);
    state.group_members[gs1].push(p0);
    state.group_sizes[gs1] += 1; // keep size consistent so size-mismatch check passes

    let err = validate_invariants(&state).unwrap_err();
    assert!(
        err.to_string().contains("p0") || err.to_string().contains("times"),
        "expected duplicate-person error, got: {}",
        err
    );
}

#[test]
fn invariants_detect_location_membership_mismatch() {
    let input = minimal_input();
    let mut state = RuntimeState::from_input(&input).unwrap();
    let cp = state.compiled.clone();

    // Corrupt person_location for p0 in session 0 to point to wrong group.
    let p0 = cp.person_id_to_idx["p0"];
    let ps = state.people_slot(0, p0);
    let wrong_group = state.person_location[ps].map(|g| if g == 0 { 1 } else { 0 });
    state.person_location[ps] = wrong_group;

    let err = validate_invariants(&state).unwrap_err();
    assert!(
        err.to_string().contains("mismatch") || err.to_string().contains("location"),
        "expected location mismatch error: {}",
        err
    );
}

#[test]
fn invariants_detect_unassigned_participating_person() {
    let input = minimal_input();
    let mut state = RuntimeState::from_input(&input).unwrap();
    let cp = state.compiled.clone();

    // Remove p0 from its group in session 0 but leave person_location as-is.
    let p0 = cp.person_id_to_idx["p0"];
    let g0 = cp.group_id_to_idx["g0"];
    let gs0 = state.group_slot(0, g0);
    state.group_members[gs0].retain(|&m| m != p0);
    state.group_sizes[gs0] = state.group_members[gs0].len();

    let err = validate_invariants(&state).unwrap_err();
    assert!(
        err.to_string().contains("mismatch") || err.to_string().contains("unassigned"),
        "expected unassigned person error: {}",
        err
    );
}

#[test]
fn invariants_detect_split_clique() {
    let input = representative_input();
    let mut state = RuntimeState::from_input(&input).unwrap();
    let cp = state.compiled.clone();

    // In session 0, p0 and p1 are MustStayTogether (placed in g0).
    // Move p1 to g1 to split the clique.
    let p1 = cp.person_id_to_idx["p1"];
    let g0 = cp.group_id_to_idx["g0"];
    let g1 = cp.group_id_to_idx["g1"];
    let gs0 = state.group_slot(0, g0);
    let gs1 = state.group_slot(0, g1);

    state.group_members[gs0].retain(|&m| m != p1);
    state.group_sizes[gs0] = state.group_members[gs0].len();
    state.group_members[gs1].push(p1);
    state.group_sizes[gs1] = state.group_members[gs1].len();
    let ps = state.people_slot(0, p1);
    state.person_location[ps] = Some(g1);

    let err = validate_invariants(&state).unwrap_err();
    assert!(
        err.to_string().contains("split") || err.to_string().contains("clique"),
        "expected clique split error: {}",
        err
    );
}

#[test]
fn invariants_detect_immovable_violation() {
    // After init session 1: g0=[p0,p1,p3] (3/3), g1=[p2,p4,p5] (3/3).
    // p4 is immovable to g1 in session 1.
    // Swap p3 (g0) ↔ p4 (g1) while keeping sizes equal so capacity checks pass.
    // After swap: g0=[p0,p1,p4], g1=[p2,p3,p5] — p4 in g0 violates immovable.
    let input = representative_input();
    let mut state = RuntimeState::from_input(&input).unwrap();
    let cp = state.compiled.clone();

    let p4 = cp.person_id_to_idx["p4"];
    let p5 = cp.person_id_to_idx["p5"];
    let g0 = cp.group_id_to_idx["g0"];
    let g1 = cp.group_id_to_idx["g1"];
    let gs0 = state.group_slot(1, g0);
    let gs1 = state.group_slot(1, g1);

    // Swap p4 and p5 between the two groups while keeping group sizes unchanged.
    state.group_members[gs0].retain(|&m| m != p5);
    state.group_sizes[gs0] = state.group_members[gs0].len();
    state.group_members[gs1].retain(|&m| m != p4);
    state.group_sizes[gs1] = state.group_members[gs1].len();

    state.group_members[gs0].push(p4);
    state.group_sizes[gs0] += 1;
    state.group_members[gs1].push(p5);
    state.group_sizes[gs1] += 1;

    // Update person_location to stay location/membership consistent.
    let ps_p4 = state.people_slot(1, p4);
    let ps_p5 = state.people_slot(1, p5);
    state.person_location[ps_p4] = Some(g0); // violates immovable (must be g1)
    state.person_location[ps_p5] = Some(g1);

    let err = validate_invariants(&state).unwrap_err();
    assert!(
        err.to_string().contains("immovable") || err.to_string().contains("p4"),
        "expected immovable violation error, got: {}",
        err
    );
}

#[test]
fn invariants_detect_must_stay_apart_violation() {
    let mut input = minimal_input();
    input.constraints = vec![Constraint::MustStayApart {
        people: vec!["p0".into(), "p1".into()],
        sessions: Some(vec![0]),
    }];

    let mut state = RuntimeState::from_input(&input).unwrap();
    let cp = state.compiled.clone();
    let p0 = cp.person_id_to_idx["p0"];
    let p1 = cp.person_id_to_idx["p1"];
    let p2 = cp.person_id_to_idx["p2"];
    let g0 = cp.group_id_to_idx["g0"];
    let g1 = cp.group_id_to_idx["g1"];
    let gs0 = state.group_slot(0, g0);
    let gs1 = state.group_slot(0, g1);
    let ps1 = state.people_slot(0, p1);
    let ps2 = state.people_slot(0, p2);

    state.group_members[gs1].retain(|&m| m != p1);
    state.group_sizes[gs1] = state.group_members[gs1].len();
    state.group_members[gs0].retain(|&m| m != p2);
    state.group_sizes[gs0] = state.group_members[gs0].len();
    state.group_members[gs0].push(p1);
    state.group_sizes[gs0] += 1;
    state.group_members[gs1].push(p2);
    state.group_sizes[gs1] += 1;
    state.person_location[ps1] = Some(g0);
    state.person_location[ps2] = Some(g1);

    let err = validate_invariants(&state).unwrap_err();
    assert!(
        err.to_string().contains("MustStayApart") || err.to_string().contains("p0"),
        "expected must-stay-apart violation error, got: {}",
        err
    );

    // keep g1 unused references from being optimized away in future edits
    assert!(g1 != g0);
    assert!(state.person_location[state.people_slot(0, p0)].is_some());
}

// ---------------------------------------------------------------------------
// 8. Arc<CompiledProblem> sharing
// ---------------------------------------------------------------------------

#[test]
fn compiled_problem_is_shared_via_arc() {
    use std::sync::Arc;
    let input = minimal_input();
    let cp = Arc::new(CompiledProblem::compile(&input).unwrap());
    let s1 = RuntimeState::from_compiled(cp.clone()).unwrap();
    let s2 = RuntimeState::from_compiled(cp.clone()).unwrap();

    assert!(
        Arc::ptr_eq(&s1.compiled, &s2.compiled),
        "both states should share the same Arc<CompiledProblem>"
    );
}

// ---------------------------------------------------------------------------
// 9. Edge cases
// ---------------------------------------------------------------------------

#[test]
fn state_with_partial_participation_is_valid() {
    // p5 only participates in sessions 1 and 2, not 0.
    let input = representative_input();
    let state = RuntimeState::from_input(&input).unwrap();
    let cp = &state.compiled;

    let p5 = cp.person_id_to_idx["p5"];
    // Session 0: p5 should not be placed.
    assert!(
        state.person_location[state.people_slot(0, p5)].is_none(),
        "p5 must not be placed in session 0"
    );
    // Sessions 1, 2: p5 should be placed.
    assert!(
        state.person_location[state.people_slot(1, p5)].is_some(),
        "p5 must be placed in session 1"
    );
    assert!(
        state.person_location[state.people_slot(2, p5)].is_some(),
        "p5 must be placed in session 2"
    );

    validate_invariants(&state).unwrap();
    check_drift(&state).unwrap();
}

#[test]
fn zero_unique_contacts_when_no_pairs_share_groups() {
    // 2 people, 2 groups of 1, 1 session: no shared groups possible.
    let input = ApiInput {
        problem: ProblemDefinition {
            people: vec![
                Person {
                    id: "a".into(),
                    attributes: HashMap::new(),
                    sessions: None,
                },
                Person {
                    id: "b".into(),
                    attributes: HashMap::new(),
                    sessions: None,
                },
            ],
            groups: vec![
                Group {
                    id: "g0".into(),
                    size: 1,
                    session_sizes: None,
                },
                Group {
                    id: "g1".into(),
                    size: 1,
                    session_sizes: None,
                },
            ],
            num_sessions: 1,
        },
        initial_schedule: None,
        construction_seed_schedule: None,
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".into(),
            weight: 1.0,
        }],
        constraints: vec![],
        solver: solver3_config(),
    };

    let state = RuntimeState::from_input(&input).unwrap();
    assert_eq!(state.unique_contacts, 0);
    assert!(state.pair_contacts.iter().all(|&c| c == 0));
    validate_invariants(&state).unwrap();
    check_drift(&state).unwrap();
}

#[test]
fn immovable_violation_is_diagnostic_not_scored() {
    let input = ApiInput {
        problem: ProblemDefinition {
            people: vec![
                Person {
                    id: "p0".into(),
                    attributes: HashMap::new(),
                    sessions: None,
                },
                Person {
                    id: "p1".into(),
                    attributes: HashMap::new(),
                    sessions: None,
                },
            ],
            groups: vec![
                Group {
                    id: "g0".into(),
                    size: 2,
                    session_sizes: None,
                },
                Group {
                    id: "g1".into(),
                    size: 2,
                    session_sizes: None,
                },
            ],
            num_sessions: 1,
        },
        initial_schedule: None,
        construction_seed_schedule: None,
        objectives: vec![],
        constraints: vec![Constraint::ImmovablePerson(ImmovablePersonParams {
            person_id: "p0".into(),
            group_id: "g0".into(),
            sessions: None,
        })],
        solver: solver3_config(),
    };

    let mut state = RuntimeState::from_input(&input).unwrap();
    let person_idx = 0usize;
    let old_group_idx = state.person_location[state.people_slot(0, person_idx)].unwrap();
    let old_group_slot = state.group_slot(0, old_group_idx);
    let old_position = state.group_members[old_group_slot]
        .iter()
        .position(|&member| member == person_idx)
        .unwrap();
    state.group_members[old_group_slot].swap_remove(old_position);
    state.group_sizes[old_group_slot] -= 1;

    let new_group_idx = 1usize;
    let new_group_slot = state.group_slot(0, new_group_idx);
    state.group_members[new_group_slot].push(person_idx);
    state.group_sizes[new_group_slot] += 1;
    let person_slot = state.people_slot(0, person_idx);
    state.person_location[person_slot] = Some(new_group_idx);

    let snap = recompute_oracle_score(&state).unwrap();
    assert_eq!(snap.immovable_violations, 1);
    assert_eq!(snap.constraint_penalty_weighted, 0.0);
}

#[test]
fn soft_apart_pair_penalty_is_scored() {
    // 2 people, 1 group of 2, 1 session, one soft-apart constraint.
    let input = ApiInput {
        problem: ProblemDefinition {
            people: vec![
                Person {
                    id: "a".into(),
                    attributes: HashMap::new(),
                    sessions: None,
                },
                Person {
                    id: "b".into(),
                    attributes: HashMap::new(),
                    sessions: None,
                },
            ],
            groups: vec![Group {
                id: "g0".into(),
                size: 2,
                session_sizes: None,
            }],
            num_sessions: 1,
        },
        initial_schedule: None,
        construction_seed_schedule: None,
        objectives: vec![],
        constraints: vec![Constraint::ShouldNotBeTogether {
            people: vec!["a".into(), "b".into()],
            penalty_weight: 42.0,
            sessions: None,
        }],
        solver: solver3_config(),
    };

    let state = RuntimeState::from_input(&input).unwrap();
    // Both people will be placed in the only group.
    assert!(state.constraint_penalty_weighted > 0.0);
    let snap = recompute_oracle_score(&state).unwrap();
    assert_eq!(snap.soft_apart_violations[0], 1);
    assert!((snap.constraint_penalty_weighted - 42.0).abs() < 1e-9);
}

#[test]
fn hard_apart_violation_is_tracked_as_raw_only() {
    let mut input = minimal_input();
    input.constraints = vec![Constraint::MustStayApart {
        people: vec!["p0".into(), "p1".into()],
        sessions: Some(vec![0]),
    }];

    let mut state = RuntimeState::from_input(&input).unwrap();
    let cp = state.compiled.clone();
    let p1 = cp.person_id_to_idx["p1"];
    let p2 = cp.person_id_to_idx["p2"];
    let g0 = cp.group_id_to_idx["g0"];
    let g1 = cp.group_id_to_idx["g1"];
    let gs0 = state.group_slot(0, g0);
    let gs1 = state.group_slot(0, g1);
    let ps1 = state.people_slot(0, p1);
    let ps2 = state.people_slot(0, p2);

    state.group_members[gs1].retain(|&m| m != p1);
    state.group_sizes[gs1] = state.group_members[gs1].len();
    state.group_members[gs0].retain(|&m| m != p2);
    state.group_sizes[gs0] = state.group_members[gs0].len();
    state.group_members[gs0].push(p1);
    state.group_sizes[gs0] += 1;
    state.group_members[gs1].push(p2);
    state.group_sizes[gs1] += 1;
    state.person_location[ps1] = Some(g0);
    state.person_location[ps2] = Some(g1);

    let snap = recompute_oracle_score(&state).unwrap();
    assert_eq!(snap.hard_apart_violations[0], 1);
    assert_eq!(snap.constraint_penalty_weighted, 0.0);
    assert_eq!(snap.constraint_penalty_raw, 1);
    assert!(g1 != g0);
}

// ---------------------------------------------------------------------------
// 10. Swap kernel: equivalence, drift, and invariants
// ---------------------------------------------------------------------------

fn swap_kernel_input() -> ApiInput {
    let people = vec![
        person_with_attr("p0", "role", "eng"),
        person_with_attr("p1", "role", "design"),
        person_with_attr("p2", "role", "eng"),
        person_with_attr("p3", "role", "design"),
        person_with_attr("p4", "role", "pm"),
        person_with_attr("p5", "role", "pm"),
    ];

    let groups = vec![
        Group {
            id: "g0".into(),
            size: 2,
            session_sizes: None,
        },
        Group {
            id: "g1".into(),
            size: 2,
            session_sizes: None,
        },
        Group {
            id: "g2".into(),
            size: 2,
            session_sizes: None,
        },
    ];

    let mut initial_schedule = HashMap::new();
    initial_schedule.insert(
        "session_0".into(),
        HashMap::from([
            ("g0".into(), vec!["p0".into(), "p1".into()]),
            ("g1".into(), vec!["p2".into(), "p3".into()]),
            ("g2".into(), vec!["p4".into(), "p5".into()]),
        ]),
    );
    initial_schedule.insert(
        "session_1".into(),
        HashMap::from([
            ("g0".into(), vec!["p0".into(), "p2".into()]),
            ("g1".into(), vec!["p1".into(), "p4".into()]),
            ("g2".into(), vec!["p3".into(), "p5".into()]),
        ]),
    );

    ApiInput {
        problem: ProblemDefinition {
            people,
            groups,
            num_sessions: 2,
        },
        initial_schedule: Some(initial_schedule),
        construction_seed_schedule: None,
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".into(),
            weight: 1.0,
        }],
        constraints: vec![
            Constraint::RepeatEncounter(RepeatEncounterParams {
                max_allowed_encounters: 1,
                penalty_function: "squared".into(),
                penalty_weight: 11.0,
            }),
            Constraint::ShouldNotBeTogether {
                people: vec!["p0".into(), "p2".into()],
                penalty_weight: 25.0,
                sessions: None,
            },
            Constraint::PairMeetingCount(PairMeetingCountParams {
                people: vec!["p0".into(), "p1".into()],
                sessions: vec![0, 1],
                target_meetings: 2,
                mode: PairMeetingMode::AtLeast,
                penalty_weight: 13.0,
            }),
            Constraint::AttributeBalance(AttributeBalanceParams {
                group_id: "g0".into(),
                attribute_key: "role".into(),
                desired_values: HashMap::from([("eng".into(), 1), ("design".into(), 1)]),
                penalty_weight: 10.0,
                mode: AttributeBalanceMode::Exact,
                sessions: None,
            }),
        ],
        solver: solver3_config(),
    }
}

fn person_with_attr(id: &str, key: &str, value: &str) -> Person {
    Person {
        id: id.into(),
        attributes: HashMap::from([(key.into(), value.into())]),
        sessions: None,
    }
}

fn assert_close(actual: f64, expected: f64, context: &str) {
    let tol = 1e-9;
    assert!(
        (actual - expected).abs() <= tol,
        "{}: actual={} expected={}",
        context,
        actual,
        expected
    );
}

#[test]
fn swap_preview_lightweight_matches_oracle_delta() {
    let input = swap_kernel_input();
    let state = RuntimeState::from_input(&input).unwrap();
    let cp = &state.compiled;
    let swap = SwapMove::new(0, cp.person_id_to_idx["p1"], cp.person_id_to_idx["p2"]);

    let preview = preview_swap_runtime_lightweight(&state, &swap).unwrap();
    assert!(
        !preview.patch.pair_contact_updates.is_empty(),
        "swap preview should emit pair-contact updates"
    );

    let oracle_delta = preview_swap_oracle_recompute(&state, &swap).unwrap();
    assert_close(
        preview.delta_score,
        oracle_delta,
        "swap preview delta should match oracle recompute delta",
    );
}

#[test]
fn trusted_swap_preview_matches_checked_preview_for_sampler_compatible_move() {
    let input = swap_kernel_input();
    let state = RuntimeState::from_input(&input).unwrap();
    let cp = &state.compiled;
    let swap = SwapMove::new(0, cp.person_id_to_idx["p1"], cp.person_id_to_idx["p2"]);

    let checked = preview_swap_runtime_checked(&state, &swap).unwrap();
    let trusted = preview_swap_runtime_trusted(&state, &swap).unwrap();

    assert_eq!(trusted.analysis, checked.analysis);
    assert_eq!(trusted.patch, checked.patch);
    assert_close(
        trusted.delta_score,
        checked.delta_score,
        "trusted swap preview should match checked preview",
    );
}

#[cfg(feature = "solver3-oracle-checks")]
#[test]
fn trusted_swap_preview_rejects_selection_assumption_violation() {
    let state = RuntimeState::from_input(&transfer_restricted_input()).unwrap();
    let cp = state.compiled.clone();
    let swap = SwapMove::new(0, cp.person_id_to_idx["p0"], cp.person_id_to_idx["p3"]);

    let err = preview_swap_runtime_trusted(&state, &swap).unwrap_err();
    assert!(err
        .to_string()
        .contains("trusted swap preview assumptions violated"));
}

#[test]
fn swap_apply_runtime_preview_preserves_invariants_and_oracle_alignment() {
    let input = swap_kernel_input();
    let mut state = RuntimeState::from_input(&input).unwrap();
    let cp = state.compiled.clone();
    let swap = SwapMove::new(0, cp.person_id_to_idx["p1"], cp.person_id_to_idx["p2"]);

    let before_total = state.total_score;
    let preview = preview_swap_runtime_lightweight(&state, &swap).unwrap();
    apply_swap_runtime_preview(&mut state, &preview).unwrap();

    validate_invariants(&state).unwrap();
    check_drift(&state).unwrap();

    let runtime_delta = state.total_score - before_total;
    assert_close(
        runtime_delta,
        preview.delta_score,
        "applied swap total delta should match preview delta",
    );
}

#[test]
fn sequential_swap_runtime_apply_does_not_drift_from_oracle() {
    let input = swap_kernel_input();
    let mut state = RuntimeState::from_input(&input).unwrap();
    let cp = state.compiled.clone();

    let swaps = vec![
        SwapMove::new(0, cp.person_id_to_idx["p1"], cp.person_id_to_idx["p2"]),
        SwapMove::new(1, cp.person_id_to_idx["p4"], cp.person_id_to_idx["p3"]),
        SwapMove::new(0, cp.person_id_to_idx["p0"], cp.person_id_to_idx["p5"]),
    ];

    for (step, swap) in swaps.iter().enumerate() {
        let preview = preview_swap_runtime_lightweight(&state, swap).unwrap();
        let oracle_delta = preview_swap_oracle_recompute(&state, swap).unwrap();
        assert_close(
            preview.delta_score,
            oracle_delta,
            &format!("step {} preview/oracle mismatch", step),
        );

        let before_total = state.total_score;
        apply_swap_runtime_preview(&mut state, &preview).unwrap();
        validate_invariants(&state).unwrap();
        check_drift(&state).unwrap();

        assert_close(
            state.total_score - before_total,
            oracle_delta,
            &format!("step {} runtime delta/oracle mismatch", step),
        );
    }
}

#[test]
fn swap_feasibility_rejects_must_stay_apart_conflict() {
    let input = ApiInput {
        problem: ProblemDefinition {
            people: (0..4)
                .map(|idx| Person {
                    id: format!("p{idx}"),
                    attributes: HashMap::new(),
                    sessions: None,
                })
                .collect(),
            groups: vec![
                Group {
                    id: "g0".into(),
                    size: 2,
                    session_sizes: None,
                },
                Group {
                    id: "g1".into(),
                    size: 2,
                    session_sizes: None,
                },
            ],
            num_sessions: 1,
        },
        initial_schedule: Some(HashMap::from([(
            "session_0".into(),
            HashMap::from([
                ("g0".into(), vec!["p0".into(), "p2".into()]),
                ("g1".into(), vec!["p1".into(), "p3".into()]),
            ]),
        )])),
        construction_seed_schedule: None,
        objectives: vec![],
        constraints: vec![Constraint::MustStayApart {
            people: vec!["p0".into(), "p1".into()],
            sessions: None,
        }],
        solver: solver3_config(),
    };

    let state = RuntimeState::from_input(&input).unwrap();
    let cp = state.compiled.clone();
    let swap = SwapMove::new(0, cp.person_id_to_idx["p0"], cp.person_id_to_idx["p3"]);

    assert!(matches!(
        analyze_swap(&state, &swap).unwrap().feasibility,
        SwapFeasibility::HardApartConflict {
            person_idx,
            other_person_idx,
            target_group_idx
        } if person_idx == cp.person_id_to_idx["p0"]
            && other_person_idx == cp.person_id_to_idx["p1"]
            && target_group_idx == cp.group_id_to_idx["g1"]
    ));
}

// ---------------------------------------------------------------------------
// 11. Transfer kernel: equivalence, drift, and feasibility regressions
// ---------------------------------------------------------------------------

fn transfer_kernel_input() -> ApiInput {
    ApiInput {
        problem: ProblemDefinition {
            people: vec![
                person_with_attr("p0", "role", "eng"),
                person_with_attr("p1", "role", "eng"),
                person_with_attr("p2", "role", "design"),
                person_with_attr("p3", "role", "design"),
                person_with_attr("p4", "role", "pm"),
            ],
            groups: vec![
                Group {
                    id: "g0".into(),
                    size: 3,
                    session_sizes: None,
                },
                Group {
                    id: "g1".into(),
                    size: 2,
                    session_sizes: None,
                },
                Group {
                    id: "g2".into(),
                    size: 2,
                    session_sizes: None,
                },
            ],
            num_sessions: 2,
        },
        initial_schedule: Some(HashMap::from([
            (
                "session_0".into(),
                HashMap::from([
                    ("g0".into(), vec!["p0".into(), "p1".into(), "p4".into()]),
                    ("g1".into(), vec!["p2".into(), "p3".into()]),
                    ("g2".into(), Vec::new()),
                ]),
            ),
            (
                "session_1".into(),
                HashMap::from([
                    ("g0".into(), vec!["p0".into(), "p4".into()]),
                    ("g1".into(), vec!["p1".into(), "p2".into()]),
                    ("g2".into(), vec!["p3".into()]),
                ]),
            ),
        ])),
        construction_seed_schedule: None,
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".into(),
            weight: 1.0,
        }],
        constraints: vec![
            Constraint::RepeatEncounter(RepeatEncounterParams {
                max_allowed_encounters: 1,
                penalty_function: "squared".into(),
                penalty_weight: 11.0,
            }),
            Constraint::ShouldNotBeTogether {
                people: vec!["p0".into(), "p2".into()],
                penalty_weight: 20.0,
                sessions: None,
            },
            Constraint::ShouldStayTogether {
                people: vec!["p3".into(), "p4".into()],
                penalty_weight: 7.0,
                sessions: Some(vec![0, 1]),
            },
            Constraint::PairMeetingCount(PairMeetingCountParams {
                people: vec!["p0".into(), "p1".into()],
                sessions: vec![0, 1],
                target_meetings: 2,
                mode: PairMeetingMode::AtLeast,
                penalty_weight: 13.0,
            }),
            Constraint::AttributeBalance(AttributeBalanceParams {
                group_id: "g0".into(),
                attribute_key: "role".into(),
                desired_values: HashMap::from([
                    ("eng".into(), 2),
                    ("design".into(), 0),
                    ("pm".into(), 1),
                ]),
                penalty_weight: 9.0,
                mode: AttributeBalanceMode::Exact,
                sessions: None,
            }),
        ],
        solver: solver3_config(),
    }
}

fn transfer_restricted_input() -> ApiInput {
    ApiInput {
        problem: ProblemDefinition {
            people: vec![
                person_with_attr("p0", "role", "eng"),
                person_with_attr("p1", "role", "eng"),
                person_with_attr("p2", "role", "design"),
                person_with_attr("p3", "role", "design"),
                person_with_attr("p4", "role", "pm"),
                Person {
                    id: "p5".into(),
                    attributes: HashMap::from([("role".into(), "qa".into())]),
                    sessions: Some(vec![1]),
                },
            ],
            groups: vec![
                Group {
                    id: "g0".into(),
                    size: 3,
                    session_sizes: None,
                },
                Group {
                    id: "g1".into(),
                    size: 2,
                    session_sizes: None,
                },
                Group {
                    id: "g2".into(),
                    size: 2,
                    session_sizes: None,
                },
            ],
            num_sessions: 2,
        },
        initial_schedule: Some(HashMap::from([
            (
                "session_0".into(),
                HashMap::from([
                    ("g0".into(), vec!["p0".into(), "p1".into(), "p2".into()]),
                    ("g1".into(), vec!["p3".into(), "p4".into()]),
                    ("g2".into(), Vec::new()),
                ]),
            ),
            (
                "session_1".into(),
                HashMap::from([
                    ("g0".into(), vec!["p0".into(), "p2".into()]),
                    ("g1".into(), vec!["p1".into(), "p4".into()]),
                    ("g2".into(), vec!["p3".into(), "p5".into()]),
                ]),
            ),
        ])),
        construction_seed_schedule: None,
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".into(),
            weight: 1.0,
        }],
        constraints: vec![
            Constraint::MustStayTogether {
                people: vec!["p0".into(), "p1".into()],
                sessions: Some(vec![0]),
            },
            Constraint::ImmovablePerson(ImmovablePersonParams {
                person_id: "p4".into(),
                group_id: "g1".into(),
                sessions: Some(vec![1]),
            }),
        ],
        solver: solver3_config(),
    }
}

#[test]
fn transfer_preview_lightweight_matches_oracle_delta() {
    let input = transfer_kernel_input();
    let state = RuntimeState::from_input(&input).unwrap();
    let cp = &state.compiled;
    let transfer = TransferMove::new(
        1,
        cp.person_id_to_idx["p1"],
        cp.group_id_to_idx["g1"],
        cp.group_id_to_idx["g0"],
    );

    let preview = preview_transfer_runtime_lightweight(&state, &transfer).unwrap();
    assert!(
        !preview.patch.pair_contact_updates.is_empty(),
        "transfer preview should emit pair-contact updates"
    );

    let oracle_delta = preview_transfer_oracle_recompute(&state, &transfer).unwrap();
    assert_close(
        preview.delta_score,
        oracle_delta,
        "transfer preview delta should match oracle recompute delta",
    );
}

#[test]
fn trusted_transfer_preview_matches_checked_preview_for_sampler_compatible_move() {
    let input = transfer_kernel_input();
    let state = RuntimeState::from_input(&input).unwrap();
    let cp = &state.compiled;
    let transfer = TransferMove::new(
        1,
        cp.person_id_to_idx["p1"],
        cp.group_id_to_idx["g1"],
        cp.group_id_to_idx["g0"],
    );

    let checked = preview_transfer_runtime_checked(&state, &transfer).unwrap();
    let trusted = preview_transfer_runtime_trusted(&state, &transfer).unwrap();

    assert_eq!(trusted.analysis, checked.analysis);
    assert_eq!(trusted.patch, checked.patch);
    assert_close(
        trusted.delta_score,
        checked.delta_score,
        "trusted transfer preview should match checked preview",
    );
}

#[cfg(feature = "solver3-oracle-checks")]
#[test]
fn trusted_transfer_preview_rejects_selection_assumption_violation() {
    let state = RuntimeState::from_input(&transfer_restricted_input()).unwrap();
    let cp = state.compiled.clone();
    let transfer = TransferMove::new(
        1,
        cp.person_id_to_idx["p4"],
        cp.group_id_to_idx["g1"],
        cp.group_id_to_idx["g0"],
    );

    let err = preview_transfer_runtime_trusted(&state, &transfer).unwrap_err();
    assert!(err
        .to_string()
        .contains("trusted transfer preview assumptions violated"));
}

#[test]
fn transfer_apply_runtime_preview_preserves_invariants_and_oracle_alignment() {
    let input = transfer_kernel_input();
    let mut state = RuntimeState::from_input(&input).unwrap();
    let cp = state.compiled.clone();
    let transfer = TransferMove::new(
        1,
        cp.person_id_to_idx["p1"],
        cp.group_id_to_idx["g1"],
        cp.group_id_to_idx["g0"],
    );

    let before_total = state.total_score;
    let preview = preview_transfer_runtime_lightweight(&state, &transfer).unwrap();
    apply_transfer_runtime_preview(&mut state, &preview).unwrap();

    validate_invariants(&state).unwrap();
    check_drift(&state).unwrap();

    assert_close(
        state.total_score - before_total,
        preview.delta_score,
        "applied transfer total delta should match preview delta",
    );
}

#[test]
fn sequential_transfer_runtime_apply_does_not_drift_from_oracle() {
    let input = transfer_kernel_input();
    let mut state = RuntimeState::from_input(&input).unwrap();
    let cp = state.compiled.clone();

    let transfers = vec![
        TransferMove::new(
            1,
            cp.person_id_to_idx["p1"],
            cp.group_id_to_idx["g1"],
            cp.group_id_to_idx["g0"],
        ),
        TransferMove::new(
            0,
            cp.person_id_to_idx["p4"],
            cp.group_id_to_idx["g0"],
            cp.group_id_to_idx["g2"],
        ),
        TransferMove::new(
            1,
            cp.person_id_to_idx["p0"],
            cp.group_id_to_idx["g0"],
            cp.group_id_to_idx["g2"],
        ),
    ];

    for (step, transfer) in transfers.iter().enumerate() {
        let preview = preview_transfer_runtime_lightweight(&state, transfer).unwrap();
        let oracle_delta = preview_transfer_oracle_recompute(&state, transfer).unwrap();
        assert_close(
            preview.delta_score,
            oracle_delta,
            &format!("step {} transfer preview/oracle mismatch", step),
        );

        let before_total = state.total_score;
        apply_transfer_runtime_preview(&mut state, &preview).unwrap();
        validate_invariants(&state).unwrap();
        check_drift(&state).unwrap();

        assert_close(
            state.total_score - before_total,
            oracle_delta,
            &format!("step {} transfer runtime delta/oracle mismatch", step),
        );
    }
}

#[test]
fn transfer_feasibility_regressions_report_specific_reasons() {
    let input = transfer_kernel_input();
    let state = RuntimeState::from_input(&input).unwrap();
    let cp = state.compiled.clone();

    let same_group = TransferMove::new(
        1,
        cp.person_id_to_idx["p1"],
        cp.group_id_to_idx["g1"],
        cp.group_id_to_idx["g1"],
    );
    assert!(matches!(
        analyze_transfer(&state, &same_group).unwrap().feasibility,
        TransferFeasibility::SameGroupNoop
    ));

    let wrong_source = TransferMove::new(
        1,
        cp.person_id_to_idx["p1"],
        cp.group_id_to_idx["g0"],
        cp.group_id_to_idx["g2"],
    );
    assert!(matches!(
        analyze_transfer(&state, &wrong_source).unwrap().feasibility,
        TransferFeasibility::WrongSourceGroup {
            person_idx,
            actual_group_idx
        } if person_idx == cp.person_id_to_idx["p1"] && actual_group_idx == cp.group_id_to_idx["g1"]
    ));

    let target_full = TransferMove::new(
        0,
        cp.person_id_to_idx["p2"],
        cp.group_id_to_idx["g1"],
        cp.group_id_to_idx["g0"],
    );
    assert!(matches!(
        analyze_transfer(&state, &target_full).unwrap().feasibility,
        TransferFeasibility::TargetGroupFull {
            target_group_idx,
            capacity
        } if target_group_idx == cp.group_id_to_idx["g0"] && capacity == 3
    ));

    let source_singleton = TransferMove::new(
        1,
        cp.person_id_to_idx["p3"],
        cp.group_id_to_idx["g2"],
        cp.group_id_to_idx["g0"],
    );
    assert!(matches!(
        analyze_transfer(&state, &source_singleton)
            .unwrap()
            .feasibility,
        TransferFeasibility::SourceWouldBeEmpty { source_group_idx }
            if source_group_idx == cp.group_id_to_idx["g2"]
    ));

    let mut tampered = state.clone();
    let p2_slot = tampered.people_slot(1, cp.person_id_to_idx["p2"]);
    tampered.person_location[p2_slot] = None;
    let missing_location = TransferMove::new(
        1,
        cp.person_id_to_idx["p2"],
        cp.group_id_to_idx["g1"],
        cp.group_id_to_idx["g0"],
    );
    assert!(matches!(
        analyze_transfer(&tampered, &missing_location)
            .unwrap()
            .feasibility,
        TransferFeasibility::MissingLocation { person_idx }
            if person_idx == cp.person_id_to_idx["p2"]
    ));

    let restricted_state = RuntimeState::from_input(&transfer_restricted_input()).unwrap();
    let rcp = restricted_state.compiled.clone();

    let non_participating = TransferMove::new(
        0,
        rcp.person_id_to_idx["p5"],
        rcp.group_id_to_idx["g2"],
        rcp.group_id_to_idx["g0"],
    );
    assert!(matches!(
        analyze_transfer(&restricted_state, &non_participating)
            .unwrap()
            .feasibility,
        TransferFeasibility::NonParticipatingPerson { person_idx }
            if person_idx == rcp.person_id_to_idx["p5"]
    ));

    let clique_member = TransferMove::new(
        0,
        rcp.person_id_to_idx["p0"],
        rcp.group_id_to_idx["g0"],
        rcp.group_id_to_idx["g2"],
    );
    assert!(matches!(
        analyze_transfer(&restricted_state, &clique_member)
            .unwrap()
            .feasibility,
        TransferFeasibility::ActiveCliqueMember { person_idx, .. }
            if person_idx == rcp.person_id_to_idx["p0"]
    ));

    let immovable = TransferMove::new(
        1,
        rcp.person_id_to_idx["p4"],
        rcp.group_id_to_idx["g1"],
        rcp.group_id_to_idx["g0"],
    );
    assert!(matches!(
        analyze_transfer(&restricted_state, &immovable)
            .unwrap()
            .feasibility,
        TransferFeasibility::ImmovablePerson {
            person_idx,
            required_group_idx
        } if person_idx == rcp.person_id_to_idx["p4"] && required_group_idx == rcp.group_id_to_idx["g1"]
    ));

    let hard_apart_input = ApiInput {
        problem: ProblemDefinition {
            people: vec![
                Person {
                    id: "p0".into(),
                    attributes: HashMap::new(),
                    sessions: None,
                },
                Person {
                    id: "p1".into(),
                    attributes: HashMap::new(),
                    sessions: None,
                },
                Person {
                    id: "p2".into(),
                    attributes: HashMap::new(),
                    sessions: None,
                },
            ],
            groups: vec![
                Group {
                    id: "g0".into(),
                    size: 2,
                    session_sizes: None,
                },
                Group {
                    id: "g1".into(),
                    size: 2,
                    session_sizes: None,
                },
            ],
            num_sessions: 1,
        },
        initial_schedule: Some(HashMap::from([(
            "session_0".into(),
            HashMap::from([
                ("g0".into(), vec!["p0".into(), "p2".into()]),
                ("g1".into(), vec!["p1".into()]),
            ]),
        )])),
        construction_seed_schedule: None,
        objectives: vec![],
        constraints: vec![Constraint::MustStayApart {
            people: vec!["p0".into(), "p1".into()],
            sessions: None,
        }],
        solver: solver3_config(),
    };
    let hard_apart_state = RuntimeState::from_input(&hard_apart_input).unwrap();
    let hcp = hard_apart_state.compiled.clone();
    let hard_apart_transfer = TransferMove::new(
        0,
        hcp.person_id_to_idx["p0"],
        hcp.group_id_to_idx["g0"],
        hcp.group_id_to_idx["g1"],
    );
    assert!(matches!(
        analyze_transfer(&hard_apart_state, &hard_apart_transfer)
            .unwrap()
            .feasibility,
        TransferFeasibility::HardApartConflict {
            person_idx,
            other_person_idx,
            target_group_idx
        } if person_idx == hcp.person_id_to_idx["p0"]
            && other_person_idx == hcp.person_id_to_idx["p1"]
            && target_group_idx == hcp.group_id_to_idx["g1"]
    ));
}

// ---------------------------------------------------------------------------
// 12. Clique-swap kernel: oracle equivalence, drift safety, and clique-heavy
//     regression coverage
// ---------------------------------------------------------------------------

fn clique_swap_kernel_input() -> ApiInput {
    ApiInput {
        problem: ProblemDefinition {
            people: vec![
                person_with_attr("p0", "team", "red"),
                person_with_attr("p1", "team", "red"),
                person_with_attr("p2", "team", "blue"),
                person_with_attr("p3", "team", "blue"),
                person_with_attr("p4", "team", "red"),
                person_with_attr("p5", "team", "blue"),
            ],
            groups: vec![
                Group {
                    id: "g0".into(),
                    size: 3,
                    session_sizes: None,
                },
                Group {
                    id: "g1".into(),
                    size: 3,
                    session_sizes: None,
                },
                Group {
                    id: "g2".into(),
                    size: 1,
                    session_sizes: None,
                },
            ],
            num_sessions: 2,
        },
        initial_schedule: Some(HashMap::from([
            (
                "session_0".into(),
                HashMap::from([
                    ("g0".into(), vec!["p0".into(), "p1".into(), "p4".into()]),
                    ("g1".into(), vec!["p2".into(), "p3".into(), "p5".into()]),
                    ("g2".into(), Vec::new()),
                ]),
            ),
            (
                "session_1".into(),
                HashMap::from([
                    ("g0".into(), vec!["p0".into(), "p1".into(), "p4".into()]),
                    ("g1".into(), vec!["p2".into(), "p3".into(), "p5".into()]),
                    ("g2".into(), Vec::new()),
                ]),
            ),
        ])),
        construction_seed_schedule: None,
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".into(),
            weight: 1.0,
        }],
        constraints: vec![
            Constraint::RepeatEncounter(RepeatEncounterParams {
                max_allowed_encounters: 1,
                penalty_function: "squared".into(),
                penalty_weight: 9.0,
            }),
            Constraint::MustStayTogether {
                people: vec!["p0".into(), "p1".into()],
                sessions: None,
            },
            Constraint::ShouldNotBeTogether {
                people: vec!["p0".into(), "p5".into()],
                penalty_weight: 21.0,
                sessions: None,
            },
            Constraint::ShouldStayTogether {
                people: vec!["p2".into(), "p4".into()],
                penalty_weight: 8.0,
                sessions: Some(vec![0]),
            },
            Constraint::PairMeetingCount(PairMeetingCountParams {
                people: vec!["p0".into(), "p5".into()],
                sessions: vec![0, 1],
                target_meetings: 1,
                mode: PairMeetingMode::AtLeast,
                penalty_weight: 17.0,
            }),
            Constraint::AttributeBalance(AttributeBalanceParams {
                group_id: "g0".into(),
                attribute_key: "team".into(),
                desired_values: HashMap::from([("red".into(), 1), ("blue".into(), 2)]),
                penalty_weight: 12.0,
                mode: AttributeBalanceMode::Exact,
                sessions: None,
            }),
        ],
        solver: solver3_config(),
    }
}

fn clique_swap_restricted_input() -> ApiInput {
    ApiInput {
        problem: ProblemDefinition {
            people: vec![
                person_with_attr("p0", "team", "red"),
                person_with_attr("p1", "team", "red"),
                person_with_attr("p2", "team", "blue"),
                person_with_attr("p3", "team", "blue"),
                person_with_attr("p4", "team", "red"),
                person_with_attr("p5", "team", "blue"),
                Person {
                    id: "p6".into(),
                    attributes: HashMap::from([("team".into(), "green".into())]),
                    sessions: Some(vec![1]),
                },
            ],
            groups: vec![
                Group {
                    id: "g0".into(),
                    size: 3,
                    session_sizes: None,
                },
                Group {
                    id: "g1".into(),
                    size: 3,
                    session_sizes: None,
                },
                Group {
                    id: "g2".into(),
                    size: 2,
                    session_sizes: None,
                },
            ],
            num_sessions: 2,
        },
        initial_schedule: Some(HashMap::from([
            (
                "session_0".into(),
                HashMap::from([
                    ("g0".into(), vec!["p0".into(), "p1".into(), "p4".into()]),
                    ("g1".into(), vec!["p2".into(), "p3".into(), "p5".into()]),
                    ("g2".into(), Vec::new()),
                ]),
            ),
            (
                "session_1".into(),
                HashMap::from([
                    ("g0".into(), vec!["p0".into(), "p2".into(), "p4".into()]),
                    ("g1".into(), vec!["p1".into(), "p3".into(), "p5".into()]),
                    ("g2".into(), vec!["p6".into()]),
                ]),
            ),
        ])),
        construction_seed_schedule: None,
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".into(),
            weight: 1.0,
        }],
        constraints: vec![
            Constraint::MustStayTogether {
                people: vec!["p0".into(), "p1".into()],
                sessions: Some(vec![0]),
            },
            Constraint::MustStayTogether {
                people: vec!["p2".into(), "p3".into()],
                sessions: Some(vec![0]),
            },
            Constraint::ImmovablePerson(ImmovablePersonParams {
                person_id: "p0".into(),
                group_id: "g0".into(),
                sessions: Some(vec![0]),
            }),
            Constraint::ImmovablePerson(ImmovablePersonParams {
                person_id: "p5".into(),
                group_id: "g1".into(),
                sessions: Some(vec![0]),
            }),
        ],
        solver: solver3_config(),
    }
}

#[test]
fn clique_swap_preview_lightweight_matches_oracle_delta() {
    let input = clique_swap_kernel_input();
    let state = RuntimeState::from_input(&input).unwrap();
    let cp = state.compiled.clone();
    let clique_idx = cp.person_to_clique_id[0][cp.person_id_to_idx["p0"]]
        .expect("p0 should belong to a clique in session 0");

    let clique_swap = CliqueSwapMove::new(
        0,
        clique_idx,
        cp.group_id_to_idx["g0"],
        cp.group_id_to_idx["g1"],
        vec![cp.person_id_to_idx["p2"], cp.person_id_to_idx["p3"]],
    );

    let preview = preview_clique_swap_runtime_lightweight(&state, &clique_swap).unwrap();
    assert!(
        !preview.patch.pair_contact_updates.is_empty(),
        "clique-swap preview should emit pair-contact updates"
    );

    let oracle_delta = preview_clique_swap_oracle_recompute(&state, &clique_swap).unwrap();
    assert_close(
        preview.delta_score,
        oracle_delta,
        "clique-swap preview delta should match oracle recompute delta",
    );
}

#[test]
fn trusted_clique_swap_preview_matches_checked_preview_for_sampler_compatible_move() {
    let input = clique_swap_kernel_input();
    let state = RuntimeState::from_input(&input).unwrap();
    let cp = state.compiled.clone();
    let clique_idx = cp.person_to_clique_id[0][cp.person_id_to_idx["p0"]]
        .expect("p0 should belong to a clique in session 0");

    let clique_swap = CliqueSwapMove::new(
        0,
        clique_idx,
        cp.group_id_to_idx["g0"],
        cp.group_id_to_idx["g1"],
        vec![cp.person_id_to_idx["p2"], cp.person_id_to_idx["p3"]],
    );

    let checked = preview_clique_swap_runtime_checked(&state, &clique_swap).unwrap();
    let trusted = preview_clique_swap_runtime_trusted(&state, &clique_swap).unwrap();

    assert_eq!(trusted.analysis, checked.analysis);
    assert_eq!(trusted.patch, checked.patch);
    assert_close(
        trusted.delta_score,
        checked.delta_score,
        "trusted clique-swap preview should match checked preview",
    );
}

#[cfg(feature = "solver3-oracle-checks")]
#[test]
fn trusted_clique_swap_preview_rejects_selection_assumption_violation() {
    let state = RuntimeState::from_input(&clique_swap_restricted_input()).unwrap();
    let cp = state.compiled.clone();
    let clique_idx = cp.person_to_clique_id[0][cp.person_id_to_idx["p0"]]
        .expect("p0 should belong to clique in session 0");
    let clique_swap = CliqueSwapMove::new(
        0,
        clique_idx,
        cp.group_id_to_idx["g0"],
        cp.group_id_to_idx["g1"],
        vec![cp.person_id_to_idx["p2"], cp.person_id_to_idx["p3"]],
    );

    let err = preview_clique_swap_runtime_trusted(&state, &clique_swap).unwrap_err();
    assert!(err
        .to_string()
        .contains("trusted clique-swap preview assumptions violated"));
}

#[test]
fn sequential_clique_swap_runtime_apply_does_not_drift_from_oracle() {
    let input = clique_swap_kernel_input();
    let mut state = RuntimeState::from_input(&input).unwrap();
    let cp = state.compiled.clone();
    let clique_idx = cp.person_to_clique_id[0][cp.person_id_to_idx["p0"]]
        .expect("p0 should belong to a clique in session 0");

    let clique_swaps = vec![
        CliqueSwapMove::new(
            0,
            clique_idx,
            cp.group_id_to_idx["g0"],
            cp.group_id_to_idx["g1"],
            vec![cp.person_id_to_idx["p2"], cp.person_id_to_idx["p3"]],
        ),
        CliqueSwapMove::new(
            0,
            clique_idx,
            cp.group_id_to_idx["g1"],
            cp.group_id_to_idx["g0"],
            vec![cp.person_id_to_idx["p2"], cp.person_id_to_idx["p3"]],
        ),
    ];

    for (step, clique_swap) in clique_swaps.iter().enumerate() {
        let preview = preview_clique_swap_runtime_lightweight(&state, clique_swap).unwrap();
        let oracle_delta = preview_clique_swap_oracle_recompute(&state, clique_swap).unwrap();
        assert_close(
            preview.delta_score,
            oracle_delta,
            &format!("step {} clique-swap preview/oracle mismatch", step),
        );

        let before_total = state.total_score;
        apply_clique_swap_runtime_preview(&mut state, &preview).unwrap();
        validate_invariants(&state).unwrap();
        check_drift(&state).unwrap();

        assert_close(
            state.total_score - before_total,
            oracle_delta,
            &format!("step {} clique-swap runtime delta/oracle mismatch", step),
        );
    }
}

#[test]
fn clique_heavy_feasibility_regressions_report_specific_reasons() {
    let state = RuntimeState::from_input(&clique_swap_restricted_input()).unwrap();
    let cp = state.compiled.clone();

    let clique_idx = cp.person_to_clique_id[0][cp.person_id_to_idx["p0"]]
        .expect("p0 should belong to clique in session 0");

    let same_group = CliqueSwapMove::new(
        0,
        clique_idx,
        cp.group_id_to_idx["g0"],
        cp.group_id_to_idx["g0"],
        vec![cp.person_id_to_idx["p2"], cp.person_id_to_idx["p3"]],
    );
    assert!(matches!(
        analyze_clique_swap(&state, &same_group)
            .unwrap()
            .feasibility,
        CliqueSwapFeasibility::SameGroupNoop
    ));

    let immovable_clique_member = CliqueSwapMove::new(
        0,
        clique_idx,
        cp.group_id_to_idx["g0"],
        cp.group_id_to_idx["g1"],
        vec![cp.person_id_to_idx["p2"], cp.person_id_to_idx["p3"]],
    );
    assert!(matches!(
        analyze_clique_swap(&state, &immovable_clique_member)
            .unwrap()
            .feasibility,
        CliqueSwapFeasibility::ActiveCliqueMemberImmovable {
            person_idx,
            required_group_idx
        } if person_idx == cp.person_id_to_idx["p0"] && required_group_idx == cp.group_id_to_idx["g0"]
    ));

    let inactive_clique = CliqueSwapMove::new(
        1,
        clique_idx,
        cp.group_id_to_idx["g0"],
        cp.group_id_to_idx["g1"],
        vec![cp.person_id_to_idx["p3"], cp.person_id_to_idx["p5"]],
    );
    assert!(matches!(
        analyze_clique_swap(&state, &inactive_clique).unwrap().feasibility,
        CliqueSwapFeasibility::InactiveClique { clique_idx: idx } if idx == clique_idx
    ));

    let second_clique_idx = cp.person_to_clique_id[0][cp.person_id_to_idx["p2"]]
        .expect("p2 should be in second clique during session 0");

    let target_count_mismatch = CliqueSwapMove::new(
        0,
        second_clique_idx,
        cp.group_id_to_idx["g1"],
        cp.group_id_to_idx["g0"],
        vec![cp.person_id_to_idx["p4"]],
    );
    assert!(matches!(
        analyze_clique_swap(&state, &target_count_mismatch)
            .unwrap()
            .feasibility,
        CliqueSwapFeasibility::TargetCountMismatch { expected, actual } if expected == 2 && actual == 1
    ));

    let duplicate_target_person = CliqueSwapMove::new(
        0,
        second_clique_idx,
        cp.group_id_to_idx["g1"],
        cp.group_id_to_idx["g0"],
        vec![cp.person_id_to_idx["p4"], cp.person_id_to_idx["p4"]],
    );
    assert!(matches!(
        analyze_clique_swap(&state, &duplicate_target_person)
            .unwrap()
            .feasibility,
        CliqueSwapFeasibility::DuplicateTargetPerson { person_idx }
            if person_idx == cp.person_id_to_idx["p4"]
    ));

    let target_in_another_clique = CliqueSwapMove::new(
        0,
        second_clique_idx,
        cp.group_id_to_idx["g1"],
        cp.group_id_to_idx["g0"],
        vec![cp.person_id_to_idx["p0"], cp.person_id_to_idx["p4"]],
    );
    assert!(matches!(
        analyze_clique_swap(&state, &target_in_another_clique)
            .unwrap()
            .feasibility,
        CliqueSwapFeasibility::TargetPersonInAnotherClique { person_idx, .. }
            if person_idx == cp.person_id_to_idx["p0"]
    ));

    let non_participating_target = CliqueSwapMove::new(
        0,
        second_clique_idx,
        cp.group_id_to_idx["g1"],
        cp.group_id_to_idx["g2"],
        vec![cp.person_id_to_idx["p6"], cp.person_id_to_idx["p4"]],
    );
    assert!(matches!(
        analyze_clique_swap(&state, &non_participating_target)
            .unwrap()
            .feasibility,
        CliqueSwapFeasibility::TargetPersonNotParticipating { person_idx }
            if person_idx == cp.person_id_to_idx["p6"]
    ));

    let hard_apart_input = ApiInput {
        problem: ProblemDefinition {
            people: vec![
                person_with_attr("p0", "team", "red"),
                person_with_attr("p1", "team", "red"),
                person_with_attr("p2", "team", "blue"),
                person_with_attr("p3", "team", "blue"),
                person_with_attr("p4", "team", "red"),
                person_with_attr("p5", "team", "blue"),
            ],
            groups: vec![
                Group {
                    id: "g0".into(),
                    size: 3,
                    session_sizes: None,
                },
                Group {
                    id: "g1".into(),
                    size: 3,
                    session_sizes: None,
                },
                Group {
                    id: "g2".into(),
                    size: 1,
                    session_sizes: None,
                },
            ],
            num_sessions: 1,
        },
        initial_schedule: Some(HashMap::from([(
            "session_0".into(),
            HashMap::from([
                ("g0".into(), vec!["p0".into(), "p1".into(), "p4".into()]),
                ("g1".into(), vec!["p2".into(), "p3".into(), "p5".into()]),
                ("g2".into(), Vec::new()),
            ]),
        )])),
        construction_seed_schedule: None,
        objectives: vec![],
        constraints: vec![
            Constraint::MustStayTogether {
                people: vec!["p0".into(), "p1".into()],
                sessions: None,
            },
            Constraint::MustStayApart {
                people: vec!["p0".into(), "p5".into()],
                sessions: None,
            },
        ],
        solver: solver3_config(),
    };
    let hard_apart_state = RuntimeState::from_input(&hard_apart_input).unwrap();
    let hcp = hard_apart_state.compiled.clone();
    let hard_apart_clique_idx = hcp.person_to_clique_id[0][hcp.person_id_to_idx["p0"]]
        .expect("p0 should belong to clique in session 0");
    let hard_apart_swap = CliqueSwapMove::new(
        0,
        hard_apart_clique_idx,
        hcp.group_id_to_idx["g0"],
        hcp.group_id_to_idx["g1"],
        vec![hcp.person_id_to_idx["p2"], hcp.person_id_to_idx["p3"]],
    );
    assert!(matches!(
        analyze_clique_swap(&hard_apart_state, &hard_apart_swap)
            .unwrap()
            .feasibility,
        CliqueSwapFeasibility::HardApartConflict {
            person_idx,
            other_person_idx,
            target_group_idx
        } if person_idx == hcp.person_id_to_idx["p0"]
            && other_person_idx == hcp.person_id_to_idx["p5"]
            && target_group_idx == hcp.group_id_to_idx["g1"]
    ));
}

// ---------------------------------------------------------------------------
// 13. Oracle cross-check hooks (feature-gated): initialization + preview/apply
//     regression coverage for swap/transfer/clique-swap paths.
// ---------------------------------------------------------------------------

#[cfg(feature = "solver3-oracle-checks")]
#[test]
fn runtime_state_sync_score_from_oracle_rejects_pair_contact_drift() {
    let mut state = RuntimeState::from_input(&swap_kernel_input()).unwrap();
    state.pair_contacts[0] = state.pair_contacts[0].saturating_add(1);

    let err = state.sync_score_from_oracle().unwrap_err();
    assert!(
        err.to_string()
            .contains("oracle cross-check failed during runtime state initialization"),
        "unexpected error: {}",
        err
    );
}

#[cfg(feature = "solver3-oracle-checks")]
#[test]
fn swap_preview_hook_rejects_oracle_mismatch() {
    let mut state = RuntimeState::from_input(&swap_kernel_input()).unwrap();
    let cp = state.compiled.clone();
    let swap = SwapMove::new(0, cp.person_id_to_idx["p1"], cp.person_id_to_idx["p2"]);

    let touched_pair = cp.pair_idx(cp.person_id_to_idx["p1"], cp.person_id_to_idx["p0"]);
    state.pair_contacts[touched_pair] = state.pair_contacts[touched_pair].saturating_add(1);

    let err = preview_swap_runtime_lightweight(&state, &swap).unwrap_err();
    assert!(
        err.to_string()
            .contains("oracle preview delta cross-check failed during swap runtime preview"),
        "unexpected error: {}",
        err
    );
}

#[cfg(feature = "solver3-oracle-checks")]
#[test]
fn transfer_preview_hook_rejects_oracle_mismatch() {
    let mut state = RuntimeState::from_input(&transfer_kernel_input()).unwrap();
    let cp = state.compiled.clone();
    let transfer = TransferMove::new(
        1,
        cp.person_id_to_idx["p1"],
        cp.group_id_to_idx["g1"],
        cp.group_id_to_idx["g0"],
    );

    let touched_pair = cp.pair_idx(cp.person_id_to_idx["p1"], cp.person_id_to_idx["p2"]);
    state.pair_contacts[touched_pair] = state.pair_contacts[touched_pair].saturating_add(1);

    let err = preview_transfer_runtime_lightweight(&state, &transfer).unwrap_err();
    assert!(
        err.to_string()
            .contains("oracle preview delta cross-check failed during transfer runtime preview"),
        "unexpected error: {}",
        err
    );
}

#[cfg(feature = "solver3-oracle-checks")]
#[test]
fn clique_swap_preview_hook_rejects_oracle_mismatch() {
    let mut state = RuntimeState::from_input(&clique_swap_kernel_input()).unwrap();
    let cp = state.compiled.clone();
    let clique_idx = cp.person_to_clique_id[0][cp.person_id_to_idx["p0"]]
        .expect("p0 should belong to a clique in session 0");
    let clique_swap = CliqueSwapMove::new(
        0,
        clique_idx,
        cp.group_id_to_idx["g0"],
        cp.group_id_to_idx["g1"],
        vec![cp.person_id_to_idx["p2"], cp.person_id_to_idx["p3"]],
    );

    let touched_pair = cp.pair_idx(cp.person_id_to_idx["p0"], cp.person_id_to_idx["p4"]);
    state.pair_contacts[touched_pair] = state.pair_contacts[touched_pair].saturating_add(1);

    let err = preview_clique_swap_runtime_lightweight(&state, &clique_swap).unwrap_err();
    assert!(
        err.to_string()
            .contains("oracle preview delta cross-check failed during clique swap runtime preview"),
        "unexpected error: {}",
        err
    );
}

#[cfg(feature = "solver3-oracle-checks")]
#[test]
fn swap_apply_hook_rejects_runtime_state_drift() {
    let mut state = RuntimeState::from_input(&swap_kernel_input()).unwrap();
    let cp = state.compiled.clone();
    let swap = SwapMove::new(0, cp.person_id_to_idx["p1"], cp.person_id_to_idx["p2"]);

    let preview = preview_swap_runtime_lightweight(&state, &swap).unwrap();
    let untouched_pair = cp.pair_idx(cp.person_id_to_idx["p4"], cp.person_id_to_idx["p5"]);
    state.pair_contacts[untouched_pair] = state.pair_contacts[untouched_pair].saturating_add(1);

    let err = apply_swap_runtime_preview(&mut state, &preview).unwrap_err();
    assert!(
        err.to_string()
            .contains("oracle cross-check failed during swap apply runtime preview"),
        "unexpected error: {}",
        err
    );
}

#[cfg(feature = "solver3-oracle-checks")]
#[test]
fn transfer_apply_hook_rejects_runtime_state_drift() {
    let mut state = RuntimeState::from_input(&transfer_kernel_input()).unwrap();
    let cp = state.compiled.clone();
    let transfer = TransferMove::new(
        1,
        cp.person_id_to_idx["p1"],
        cp.group_id_to_idx["g1"],
        cp.group_id_to_idx["g0"],
    );

    let preview = preview_transfer_runtime_lightweight(&state, &transfer).unwrap();
    let untouched_pair = cp.pair_idx(cp.person_id_to_idx["p3"], cp.person_id_to_idx["p4"]);
    state.pair_contacts[untouched_pair] = state.pair_contacts[untouched_pair].saturating_add(1);

    let err = apply_transfer_runtime_preview(&mut state, &preview).unwrap_err();
    assert!(
        err.to_string()
            .contains("oracle cross-check failed during transfer apply runtime preview"),
        "unexpected error: {}",
        err
    );
}

#[cfg(feature = "solver3-oracle-checks")]
#[test]
fn clique_swap_apply_hook_rejects_runtime_state_drift() {
    let mut state = RuntimeState::from_input(&clique_swap_kernel_input()).unwrap();
    let cp = state.compiled.clone();
    let clique_idx = cp.person_to_clique_id[0][cp.person_id_to_idx["p0"]]
        .expect("p0 should belong to a clique in session 0");
    let clique_swap = CliqueSwapMove::new(
        0,
        clique_idx,
        cp.group_id_to_idx["g0"],
        cp.group_id_to_idx["g1"],
        vec![cp.person_id_to_idx["p2"], cp.person_id_to_idx["p3"]],
    );

    let preview = preview_clique_swap_runtime_lightweight(&state, &clique_swap).unwrap();
    let untouched_pair = cp.pair_idx(cp.person_id_to_idx["p4"], cp.person_id_to_idx["p5"]);
    state.pair_contacts[untouched_pair] = state.pair_contacts[untouched_pair].saturating_add(1);

    let err = apply_clique_swap_runtime_preview(&mut state, &preview).unwrap_err();
    assert!(
        err.to_string()
            .contains("oracle cross-check failed during clique swap apply runtime preview"),
        "unexpected error: {}",
        err
    );
}

// ---------------------------------------------------------------------------
// 14. Large-instance random-sequence drift checks (oracle/correctness lane)
// ---------------------------------------------------------------------------

#[cfg(feature = "solver3-oracle-checks")]
const RANDOM_SEQUENCE_CANDIDATE_ATTEMPTS: usize = 32;

#[cfg(feature = "solver3-oracle-checks")]
const RANDOM_SEQUENCE_MAX_STALL_STEPS: usize = 256;

#[cfg(feature = "solver3-oracle-checks")]
#[derive(Deserialize)]
struct FixtureEnvelope {
    input: ApiInput,
}

#[cfg(feature = "solver3-oracle-checks")]
fn load_solver3_fixture_input(file_name: &str) -> ApiInput {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("test_cases")
        .join(file_name);
    let raw = fs::read_to_string(&path)
        .unwrap_or_else(|err| panic!("failed to read fixture {}: {}", path.display(), err));
    let mut fixture: FixtureEnvelope = serde_json::from_str(&raw)
        .unwrap_or_else(|err| panic!("failed to parse fixture {}: {}", path.display(), err));

    fixture.input.solver = solver3_config();
    fixture.input
}

#[cfg(feature = "solver3-oracle-checks")]
fn runtime_session_can_transfer(state: &RuntimeState, session_idx: usize) -> bool {
    let has_capacity_target = (0..state.compiled.num_groups).any(|group_idx| {
        state.group_sizes[state.group_slot(session_idx, group_idx)]
            < state.compiled.group_capacity(session_idx, group_idx)
    });
    let has_nonempty_source = (0..state.compiled.num_groups)
        .any(|group_idx| state.group_sizes[state.group_slot(session_idx, group_idx)] > 1);
    has_capacity_target && has_nonempty_source
}

#[cfg(feature = "solver3-oracle-checks")]
fn active_clique_members_in_single_group(
    state: &RuntimeState,
    session_idx: usize,
    clique_idx: usize,
) -> Option<(Vec<usize>, usize)> {
    let clique = state.compiled.cliques.get(clique_idx)?;
    if clique
        .sessions
        .as_ref()
        .is_some_and(|sessions| !sessions.contains(&session_idx))
    {
        return None;
    }

    let active_members = clique
        .members
        .iter()
        .copied()
        .filter(|&person_idx| state.compiled.person_participation[person_idx][session_idx])
        .collect::<Vec<_>>();

    if active_members.is_empty() {
        return None;
    }

    let source_group_idx =
        state.person_location[state.people_slot(session_idx, active_members[0])]?;

    if active_members.iter().any(|&person_idx| {
        state.person_location[state.people_slot(session_idx, person_idx)] != Some(source_group_idx)
            || state
                .compiled
                .immovable_group(session_idx, person_idx)
                .is_some()
    }) {
        return None;
    }

    Some((active_members, source_group_idx))
}

#[cfg(feature = "solver3-oracle-checks")]
fn pick_clique_targets(
    state: &RuntimeState,
    session_idx: usize,
    active_members: &[usize],
    target_group_idx: usize,
    rng: &mut ChaCha12Rng,
) -> Option<Vec<usize>> {
    let target_slot = state.group_slot(session_idx, target_group_idx);
    let target_members = &state.group_members[target_slot];
    if target_members.len() < active_members.len() {
        return None;
    }

    let start = rng.random_range(0..target_members.len());
    let mut selected = Vec::with_capacity(active_members.len());
    for offset in 0..target_members.len() {
        let person_idx = target_members[(start + offset) % target_members.len()];
        if active_members.contains(&person_idx) {
            continue;
        }
        if !state.compiled.person_participation[person_idx][session_idx] {
            continue;
        }
        if state.compiled.person_to_clique_id[session_idx][person_idx].is_some() {
            continue;
        }
        if state
            .compiled
            .immovable_group(session_idx, person_idx)
            .is_some()
        {
            continue;
        }

        selected.push(person_idx);
        if selected.len() == active_members.len() {
            return Some(selected);
        }
    }

    None
}

#[cfg(feature = "solver3-oracle-checks")]
fn try_apply_random_swap_with_oracle_cross_check(
    state: &mut RuntimeState,
    rng: &mut ChaCha12Rng,
) -> Result<bool, crate::solver_support::SolverError> {
    if state.compiled.num_groups < 2 {
        return Ok(false);
    }

    for _ in 0..RANDOM_SEQUENCE_CANDIDATE_ATTEMPTS {
        let session_idx = rng.random_range(0..state.compiled.num_sessions);
        let left_group_idx = rng.random_range(0..state.compiled.num_groups);
        let mut right_group_idx = rng.random_range(0..state.compiled.num_groups);
        if right_group_idx == left_group_idx {
            right_group_idx = (right_group_idx + 1) % state.compiled.num_groups;
        }

        let left_slot = state.group_slot(session_idx, left_group_idx);
        let right_slot = state.group_slot(session_idx, right_group_idx);
        let left_members = &state.group_members[left_slot];
        let right_members = &state.group_members[right_slot];
        if left_members.is_empty() || right_members.is_empty() {
            continue;
        }

        let left_person_idx = left_members[rng.random_range(0..left_members.len())];
        let right_person_idx = right_members[rng.random_range(0..right_members.len())];
        let swap = SwapMove::new(session_idx, left_person_idx, right_person_idx);
        let Ok(preview) = preview_swap_runtime_lightweight(state, &swap) else {
            continue;
        };

        let oracle_delta = preview_swap_oracle_recompute(state, &swap)?;
        assert_close(
            preview.delta_score,
            oracle_delta,
            "random swap preview delta/oracle mismatch",
        );

        let before_total = state.total_score;
        apply_swap_runtime_preview(state, &preview)?;
        assert_close(
            state.total_score - before_total,
            preview.delta_score,
            "random swap runtime delta/preview mismatch",
        );
        return Ok(true);
    }

    Ok(false)
}

#[cfg(feature = "solver3-oracle-checks")]
fn try_apply_random_transfer_with_oracle_cross_check(
    state: &mut RuntimeState,
    rng: &mut ChaCha12Rng,
) -> Result<bool, crate::solver_support::SolverError> {
    for _ in 0..RANDOM_SEQUENCE_CANDIDATE_ATTEMPTS {
        let session_idx = rng.random_range(0..state.compiled.num_sessions);
        if !runtime_session_can_transfer(state, session_idx) {
            continue;
        }

        let person_idx = rng.random_range(0..state.compiled.num_people);
        if !state.compiled.person_participation[person_idx][session_idx] {
            continue;
        }
        if state
            .compiled
            .immovable_group(session_idx, person_idx)
            .is_some()
        {
            continue;
        }
        if state.compiled.person_to_clique_id[session_idx][person_idx].is_some() {
            continue;
        }

        let Some(source_group_idx) =
            state.person_location[state.people_slot(session_idx, person_idx)]
        else {
            continue;
        };
        if state.group_sizes[state.group_slot(session_idx, source_group_idx)] <= 1 {
            continue;
        }

        let mut target_group_idx = rng.random_range(0..state.compiled.num_groups);
        if target_group_idx == source_group_idx {
            target_group_idx = (target_group_idx + 1) % state.compiled.num_groups;
        }
        if state.group_sizes[state.group_slot(session_idx, target_group_idx)]
            >= state.compiled.group_capacity(session_idx, target_group_idx)
        {
            continue;
        }

        let transfer =
            TransferMove::new(session_idx, person_idx, source_group_idx, target_group_idx);
        let Ok(preview) = preview_transfer_runtime_lightweight(state, &transfer) else {
            continue;
        };

        let oracle_delta = preview_transfer_oracle_recompute(state, &transfer)?;
        assert_close(
            preview.delta_score,
            oracle_delta,
            "random transfer preview delta/oracle mismatch",
        );

        let before_total = state.total_score;
        apply_transfer_runtime_preview(state, &preview)?;
        assert_close(
            state.total_score - before_total,
            preview.delta_score,
            "random transfer runtime delta/preview mismatch",
        );
        return Ok(true);
    }

    Ok(false)
}

#[cfg(feature = "solver3-oracle-checks")]
fn try_apply_random_clique_swap_with_oracle_cross_check(
    state: &mut RuntimeState,
    rng: &mut ChaCha12Rng,
) -> Result<bool, crate::solver_support::SolverError> {
    if state.compiled.num_groups < 2 || state.compiled.cliques.is_empty() {
        return Ok(false);
    }

    for _ in 0..RANDOM_SEQUENCE_CANDIDATE_ATTEMPTS {
        let session_idx = rng.random_range(0..state.compiled.num_sessions);
        let clique_idx = rng.random_range(0..state.compiled.cliques.len());
        let Some((active_members, source_group_idx)) =
            active_clique_members_in_single_group(state, session_idx, clique_idx)
        else {
            continue;
        };

        for _ in 0..RANDOM_SEQUENCE_CANDIDATE_ATTEMPTS {
            let mut target_group_idx = rng.random_range(0..state.compiled.num_groups);
            if target_group_idx == source_group_idx {
                target_group_idx = (target_group_idx + 1) % state.compiled.num_groups;
            }
            let Some(target_people) =
                pick_clique_targets(state, session_idx, &active_members, target_group_idx, rng)
            else {
                continue;
            };

            let clique_swap = CliqueSwapMove::new(
                session_idx,
                clique_idx,
                source_group_idx,
                target_group_idx,
                target_people,
            );
            let Ok(preview) = preview_clique_swap_runtime_lightweight(state, &clique_swap) else {
                continue;
            };

            let oracle_delta = preview_clique_swap_oracle_recompute(state, &clique_swap)?;
            assert_close(
                preview.delta_score,
                oracle_delta,
                "random clique-swap preview delta/oracle mismatch",
            );

            let before_total = state.total_score;
            apply_clique_swap_runtime_preview(state, &preview)?;
            assert_close(
                state.total_score - before_total,
                preview.delta_score,
                "random clique-swap runtime delta/preview mismatch",
            );
            return Ok(true);
        }
    }

    Ok(false)
}

#[cfg(feature = "solver3-oracle-checks")]
fn try_apply_random_move_with_oracle_cross_check(
    state: &mut RuntimeState,
    rng: &mut ChaCha12Rng,
) -> Result<bool, crate::solver_support::SolverError> {
    let start_family = rng.random_range(0..3);
    for family_offset in 0..3 {
        let family = (start_family + family_offset) % 3;
        let applied = match family {
            0 => try_apply_random_swap_with_oracle_cross_check(state, rng)?,
            1 => try_apply_random_transfer_with_oracle_cross_check(state, rng)?,
            2 => try_apply_random_clique_swap_with_oracle_cross_check(state, rng)?,
            _ => unreachable!(),
        };

        if applied {
            return Ok(true);
        }
    }

    Ok(false)
}

#[cfg(feature = "solver3-oracle-checks")]
fn run_random_sequence_drift_checks(
    input: &ApiInput,
    scenario_label: &str,
    seeds: &[u64],
    min_applied_moves_per_seed: usize,
) {
    for &seed in seeds {
        let mut state = RuntimeState::from_input(input)
            .unwrap_or_else(|err| panic!("{} seed {} init failed: {}", scenario_label, seed, err));
        check_drift(&state).unwrap_or_else(|err| {
            panic!("{} seed {} initial drift: {}", scenario_label, seed, err)
        });
        validate_invariants(&state).unwrap_or_else(|err| {
            panic!(
                "{} seed {} initial invariants failed: {}",
                scenario_label, seed, err
            )
        });

        let mut rng = ChaCha12Rng::seed_from_u64(seed);
        let mut applied_moves = 0usize;
        let mut stalled_steps = 0usize;

        while applied_moves < min_applied_moves_per_seed
            && stalled_steps < RANDOM_SEQUENCE_MAX_STALL_STEPS
        {
            let applied = try_apply_random_move_with_oracle_cross_check(&mut state, &mut rng)
                .unwrap_or_else(|err| {
                    panic!(
                        "{} seed {} failed during random move {}: {}",
                        scenario_label, seed, applied_moves, err
                    )
                });

            if !applied {
                stalled_steps += 1;
                continue;
            }

            applied_moves += 1;
            stalled_steps = 0;

            check_drift(&state).unwrap_or_else(|err| {
                panic!(
                    "{} seed {} drifted after move {}: {}",
                    scenario_label, seed, applied_moves, err
                )
            });
            validate_invariants(&state).unwrap_or_else(|err| {
                panic!(
                    "{} seed {} invariants failed after move {}: {}",
                    scenario_label, seed, applied_moves, err
                )
            });
        }

        assert!(
            applied_moves >= min_applied_moves_per_seed,
            "{} seed {} only applied {} random moves (target {})",
            scenario_label,
            seed,
            applied_moves,
            min_applied_moves_per_seed,
        );
    }
}

#[cfg(feature = "solver3-oracle-checks")]
#[test]
fn large_realistic_random_sequences_do_not_drift_from_oracle() {
    let input = load_solver3_fixture_input("benchmark_large_gender_immovable.json");
    run_random_sequence_drift_checks(&input, "benchmark_large_gender_immovable", &[11, 29], 12);
}

#[cfg(feature = "solver3-oracle-checks")]
#[test]
fn intertwined_edge_case_random_sequences_do_not_drift_from_oracle() {
    let input = load_solver3_fixture_input("google_cp_equivalent_test.json");
    run_random_sequence_drift_checks(&input, "google_cp_equivalent", &[7, 23, 91], 24);
}
