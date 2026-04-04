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

use crate::models::{
    ApiInput, AttributeBalanceMode, AttributeBalanceParams, Constraint, Group,
    ImmovablePersonParams, Objective, PairMeetingCountParams, PairMeetingMode, Person,
    ProblemDefinition, RepeatEncounterParams, Solver3Params, SolverConfiguration, SolverParams,
    StopConditions,
};

use super::compiled_problem::CompiledProblem;
use super::moves::{
    analyze_transfer, apply_swap_runtime_preview, apply_transfer_runtime_preview,
    preview_swap_oracle_recompute, preview_swap_runtime_lightweight,
    preview_transfer_oracle_recompute, preview_transfer_runtime_lightweight, SwapMove,
    TransferFeasibility, TransferMove,
};
use super::oracle::check_drift;
use super::runtime_state::RuntimeState;
use super::scoring::recompute::recompute_oracle_score;
use super::validation::invariants::validate_invariants;

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
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".into(),
            weight: 1.0,
        }],
        constraints: vec![],
        solver: solver3_config(),
    }
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
            ("g0".into(), vec!["p0".into(), "p1".into()]),
            ("g1".into(), vec!["p2".into(), "p3".into()]),
        ]),
    );
    initial_schedule.insert(
        "session_1".into(),
        HashMap::from([
            ("g0".into(), vec!["p0".into(), "p1".into()]),
            ("g1".into(), vec!["p2".into(), "p4".into()]),
        ]),
    );
    initial_schedule.insert(
        "session_2".into(),
        HashMap::from([
            ("g0".into(), vec!["p0".into(), "p2".into()]),
            ("g1".into(), vec!["p1".into(), "p3".into()]),
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
    assert_eq!(cp.forbidden_pairs.len(), 1);
    assert_eq!(cp.should_together_pairs.len(), 1);
    assert_eq!(cp.immovable_assignments.len(), 1);
    assert_eq!(cp.pair_meeting_constraints.len(), 1);

    // Forbidden pair adjacency: p2 and p3 each get one entry.
    let p2 = cp.person_id_to_idx["p2"];
    let p3 = cp.person_id_to_idx["p3"];
    assert_eq!(cp.forbidden_pairs_by_person[p2].len(), 1);
    assert_eq!(cp.forbidden_pairs_by_person[p3].len(), 1);
}

#[test]
fn compiled_problem_rejects_wrong_solver_kind() {
    let mut input = minimal_input();
    input.solver.solver_type = "solver2".into();
    input.solver.solver_params = SolverParams::Solver2(crate::models::Solver2Params::default());
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

    let p3 = cp.person_id_to_idx["p3"];
    let p4 = cp.person_id_to_idx["p4"];
    let g0 = cp.group_id_to_idx["g0"];
    let g1 = cp.group_id_to_idx["g1"];
    let gs0 = state.group_slot(1, g0);
    let gs1 = state.group_slot(1, g1);

    // Remove p3 from g0 and p4 from g1.
    state.group_members[gs0].retain(|&m| m != p3);
    state.group_sizes[gs0] = state.group_members[gs0].len();
    state.group_members[gs1].retain(|&m| m != p4);
    state.group_sizes[gs1] = state.group_members[gs1].len();

    // Insert p4 into g0 and p3 into g1 — sizes stay the same.
    state.group_members[gs0].push(p4);
    state.group_sizes[gs0] += 1;
    state.group_members[gs1].push(p3);
    state.group_sizes[gs1] += 1;

    // Update person_location to stay location/membership consistent.
    let ps_p3 = state.people_slot(1, p3);
    let ps_p4 = state.people_slot(1, p4);
    state.person_location[ps_p3] = Some(g1);
    state.person_location[ps_p4] = Some(g0); // violates immovable (must be g1)

    let err = validate_invariants(&state).unwrap_err();
    assert!(
        err.to_string().contains("immovable") || err.to_string().contains("p4"),
        "expected immovable violation error, got: {}",
        err
    );
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
fn forbidden_pair_penalty_is_scored() {
    // 2 people, 1 group of 2, 1 session, one forbidden pair constraint.
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
    assert_eq!(snap.forbidden_pair_violations[0], 1);
    assert!((snap.constraint_penalty_weighted - 42.0).abs() < 1e-9);
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
}
