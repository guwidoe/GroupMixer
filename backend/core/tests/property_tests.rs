//! Property-based tests for the solver.
//!
//! These tests use proptest to verify invariants hold across randomly generated
//! problem configurations and operations.

use gm_core::models::{
    ApiInput, Group, Person, ProblemDefinition, SimulatedAnnealingParams, SolverConfiguration,
    SolverKind, SolverParams, StopConditions,
};
use gm_core::solver1::State;
use gm_core::{available_solver_descriptors, default_solver_configuration_for, run_solver};
use proptest::prelude::*;
use std::collections::HashMap;

/// Strategy for generating a valid problem configuration.
fn problem_strategy() -> impl Strategy<Value = ApiInput> {
    // Generate problem parameters within reasonable bounds
    (3..=12usize, 2..=4usize, 2..=4usize, 2..=5u32).prop_flat_map(
        |(num_people, num_groups, group_size, num_sessions)| {
            // Ensure we have enough capacity for all people
            let actual_group_size = num_people.div_ceil(num_groups).max(group_size);

            Just(create_test_input(
                num_people as u32,
                num_groups as u32,
                actual_group_size as u32,
                num_sessions,
            ))
        },
    )
}

/// Strategy for generating valid problems with partial attendance patterns.
fn sparse_attendance_problem_strategy() -> impl Strategy<Value = ApiInput> {
    (3..=10usize, 2..=4usize, 2..=4u32).prop_flat_map(|(num_people, num_groups, num_sessions)| {
        let actual_group_size = num_people.div_ceil(num_groups).max(2);

        prop::collection::vec(
            prop::collection::vec(0..num_sessions, 1..=num_sessions as usize),
            num_people,
        )
        .prop_map(move |session_sets| {
            let normalized_sets = session_sets
                .into_iter()
                .map(|mut sessions| {
                    sessions.sort_unstable();
                    sessions.dedup();
                    sessions
                })
                .collect();

            create_test_input_with_sessions(
                num_groups as u32,
                actual_group_size as u32,
                num_sessions,
                normalized_sets,
            )
        })
    })
}

/// Strategy for generating problems where at least one transfer is likely feasible.
fn extra_capacity_problem_strategy() -> impl Strategy<Value = ApiInput> {
    (4..=10usize, 2..=4usize, 1..=3u32).prop_map(|(num_people, num_groups, num_sessions)| {
        let actual_group_size = num_people.div_ceil(num_groups) + 1;
        create_test_input(
            num_people as u32,
            num_groups as u32,
            actual_group_size as u32,
            num_sessions,
        )
    })
}

/// Creates a test input with the given parameters.
fn create_test_input(
    num_people: u32,
    num_groups: u32,
    group_size: u32,
    num_sessions: u32,
) -> ApiInput {
    let people = (0..num_people)
        .map(|i| Person {
            id: format!("p{}", i),
            attributes: HashMap::new(),
            sessions: None,
        })
        .collect();

    let groups = (0..num_groups)
        .map(|i| Group {
            id: format!("g{}", i),
            size: group_size,
            session_sizes: None,
        })
        .collect();

    ApiInput {
        initial_schedule: None,
        construction_seed_schedule: None,
        problem: ProblemDefinition {
            people,
            groups,
            num_sessions,
        },
        objectives: vec![],
        constraints: vec![],
        solver: SolverConfiguration {
            solver_type: "SimulatedAnnealing".to_string(),
            stop_conditions: StopConditions {
                max_iterations: Some(1),
                time_limit_seconds: None,
                no_improvement_iterations: None,
                stop_on_optimal_score: true,
            },
            solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams {
                initial_temperature: 1.0,
                final_temperature: 0.1,
                cooling_schedule: "linear".to_string(),
                reheat_after_no_improvement: Some(0),
                reheat_cycles: Some(0),
            }),
            logging: Default::default(),
            telemetry: Default::default(),
            seed: None,
            move_policy: None,
            allowed_sessions: None,
        },
    }
}

fn create_test_input_for_solver(
    num_people: u32,
    num_groups: u32,
    group_size: u32,
    num_sessions: u32,
    solver_kind: SolverKind,
) -> ApiInput {
    let mut input = create_test_input(num_people, num_groups, group_size, num_sessions);
    let mut solver = default_solver_configuration_for(solver_kind);
    solver.stop_conditions.max_iterations = Some(1);
    solver.stop_conditions.time_limit_seconds = None;
    solver.stop_conditions.no_improvement_iterations = None;
    input.solver = solver;
    input
}

fn create_test_input_with_sessions(
    num_groups: u32,
    group_size: u32,
    num_sessions: u32,
    session_sets: Vec<Vec<u32>>,
) -> ApiInput {
    let people = session_sets
        .into_iter()
        .enumerate()
        .map(|(i, sessions)| Person {
            id: format!("p{}", i),
            attributes: HashMap::new(),
            sessions: Some(sessions),
        })
        .collect();

    let groups = (0..num_groups)
        .map(|i| Group {
            id: format!("g{}", i),
            size: group_size,
            session_sizes: None,
        })
        .collect();

    ApiInput {
        initial_schedule: None,
        construction_seed_schedule: None,
        problem: ProblemDefinition {
            people,
            groups,
            num_sessions,
        },
        objectives: vec![],
        constraints: vec![],
        solver: SolverConfiguration {
            solver_type: "SimulatedAnnealing".to_string(),
            stop_conditions: StopConditions {
                max_iterations: Some(1),
                time_limit_seconds: None,
                no_improvement_iterations: None,
                stop_on_optimal_score: true,
            },
            solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams {
                initial_temperature: 1.0,
                final_temperature: 0.1,
                cooling_schedule: "linear".to_string(),
                reheat_after_no_improvement: Some(0),
                reheat_cycles: Some(0),
            }),
            logging: Default::default(),
            telemetry: Default::default(),
            seed: None,
            move_policy: None,
            allowed_sessions: None,
        },
    }
}

proptest! {
    /// Property: State construction should always succeed for valid inputs.
    #[test]
    fn state_construction_succeeds(input in problem_strategy()) {
        let result = State::new(&input);
        prop_assert!(result.is_ok(), "State::new failed: {:?}", result.err());
    }

    /// Property: After any swap, incremental scores should match full recalculation.
    #[test]
    fn swap_scores_match_recalculation(input in problem_strategy()) {
        let mut state = State::new(&input).unwrap();

        // Find two people in different groups for session 0
        if state.schedule.is_empty() || state.schedule[0].len() < 2 {
            return Ok(());
        }

        let group0 = &state.schedule[0][0];
        let group1 = &state.schedule[0][1];

        if group0.is_empty() || group1.is_empty() {
            return Ok(());
        }

        let p1_idx = group0[0];
        let p2_idx = group1[0];

        // Skip if either person is in a clique (would fail swap)
        // person_to_clique_id is [session][person] -> Option<clique_id>
        if state.person_to_clique_id[0][p1_idx].is_some()
            || state.person_to_clique_id[0][p2_idx].is_some()
        {
            return Ok(());
        }

        // Record scores before swap
        let unique_before = state.unique_contacts;
        let repetition_before = state.repetition_penalty;

        // Apply swap
        state.apply_swap(0, p1_idx, p2_idx);

        // Get incremental scores
        let unique_incremental = state.unique_contacts;
        let repetition_incremental = state.repetition_penalty;

        // Recalculate from scratch
        state._recalculate_scores();

        let unique_recalc = state.unique_contacts;
        let repetition_recalc = state.repetition_penalty;

        prop_assert_eq!(
            unique_incremental, unique_recalc,
            "Unique contacts mismatch: incremental={}, recalc={} (before={})",
            unique_incremental, unique_recalc, unique_before
        );

        prop_assert_eq!(
            repetition_incremental, repetition_recalc,
            "Repetition penalty mismatch: incremental={}, recalc={} (before={})",
            repetition_incremental, repetition_recalc, repetition_before
        );
    }

    /// Property: Schedule should always have valid structure (no duplicate assignments).
    #[test]
    fn schedule_has_no_duplicates(input in problem_strategy()) {
        let state = State::new(&input).unwrap();

        for (session_idx, session) in state.schedule.iter().enumerate() {
            let mut seen = std::collections::HashSet::new();
            for group in session {
                for &person in group {
                    prop_assert!(
                        seen.insert(person),
                        "Person {} appears multiple times in session {}",
                        person, session_idx
                    );
                }
            }
        }
    }

    /// Property: After construction, all participating people should be assigned in each session.
    #[test]
    fn all_people_assigned(input in problem_strategy()) {
        let state = State::new(&input).unwrap();
        let num_people = input.problem.people.len();

        for (session_idx, session) in state.schedule.iter().enumerate() {
            let total_in_session: usize = session.iter().map(|g| g.len()).sum();

            // Count expected participants (those who participate in this session)
            let expected = (0..num_people)
                .filter(|&p| state.person_participation[p][session_idx])
                .count();

            prop_assert_eq!(
                total_in_session, expected,
                "Session {} has {} people but expected {}",
                session_idx, total_in_session, expected
            );
        }
    }

    /// Property: Scores should be non-negative after construction.
    #[test]
    fn scores_are_valid_after_construction(input in problem_strategy()) {
        let state = State::new(&input).unwrap();

        // Scores should be non-negative
        prop_assert!(state.unique_contacts >= 0);
        prop_assert!(state.repetition_penalty >= 0);
        prop_assert!(state.constraint_penalty >= 0);
        prop_assert!(state.attribute_balance_penalty >= 0.0);
    }

    /// Property: no group capacity is exceeded after construction.
    #[test]
    fn group_capacities_respected(input in problem_strategy()) {
        let state = State::new(&input).unwrap();

        for (session_idx, session) in state.schedule.iter().enumerate() {
            for (group_idx, group) in session.iter().enumerate() {
                let capacity = state.effective_group_capacity(session_idx, group_idx);
                prop_assert!(
                    group.len() <= capacity,
                    "Group {} exceeds capacity in session {}: {} > {}",
                    group_idx,
                    session_idx,
                    group.len(),
                    capacity
                );
            }
        }
    }

    /// Property: sparse attendance patterns are preserved in the initial schedule.
    #[test]
    fn sparse_attendance_is_respected(input in sparse_attendance_problem_strategy()) {
        let state = State::new(&input).unwrap();

        for (person_idx, person) in input.problem.people.iter().enumerate() {
            let active_sessions = person.sessions.clone().unwrap_or_default();

            for session_idx in 0..input.problem.num_sessions as usize {
                let appears = state.schedule[session_idx]
                    .iter()
                    .any(|group| group.contains(&person_idx));
                let should_appear = active_sessions.contains(&(session_idx as u32));

                prop_assert_eq!(
                    appears,
                    should_appear,
                    "Person {} attendance mismatch in session {}",
                    person.id,
                    session_idx
                );
            }
        }
    }

    /// Property: applying a feasible transfer preserves schedule validity.
    #[test]
    fn feasible_transfer_preserves_validity(input in extra_capacity_problem_strategy()) {
        let mut state = State::new(&input).unwrap();

        let mut applied = false;
        'outer: for day in 0..state.num_sessions as usize {
            for person_idx in 0..state.person_idx_to_id.len() {
                let (from_group, _) = state.locations[day][person_idx];
                for to_group in 0..state.group_idx_to_id.len() {
                    if from_group == to_group {
                        continue;
                    }

                    if state.is_transfer_feasible(day, person_idx, from_group, to_group) {
                        state.apply_transfer(day, person_idx, from_group, to_group);
                        applied = true;
                        break 'outer;
                    }
                }
            }
        }

        prop_assume!(applied);

        for (session_idx, session) in state.schedule.iter().enumerate() {
            let mut seen = std::collections::HashSet::new();
            for (group_idx, group) in session.iter().enumerate() {
                prop_assert!(group.len() <= state.effective_group_capacity(session_idx, group_idx));
                for &person in group {
                    prop_assert!(
                        seen.insert(person),
                        "Person {} appears multiple times in session {} after transfer",
                        person,
                        session_idx
                    );
                }
            }
        }
    }

    /// Property: registered solver families behave truthfully with their typed default configs.
    ///
    /// Runnable solvers (all capabilities true) must complete successfully and report accurate
    /// metadata. Bootstrap-only solvers (no runnable capabilities) must fail explicitly with an
    /// "not implemented" error rather than panicking, returning garbage, or silently falling back
    /// to another solver family.
    #[test]
    fn registered_solver_defaults_are_truthful_about_execution_state((num_people, num_groups, num_sessions) in (3..=8u32, 2..=3u32, 1..=3u32)) {
        let group_size = num_people.div_ceil(num_groups).max(2);
        for descriptor in available_solver_descriptors() {
            let input = create_test_input_for_solver(
                num_people,
                num_groups,
                group_size,
                num_sessions,
                descriptor.kind,
            );

            // Bootstrap-only solvers (no runnable capabilities) are expected to fail
            // explicitly with a clear "not implemented" message and no silent fallback.
            let is_bootstrap_only = !descriptor.capabilities.supports_initial_schedule
                && !descriptor.capabilities.supports_progress_callback
                && !descriptor.capabilities.supports_benchmark_observer
                && !descriptor.capabilities.supports_recommended_settings
                && !descriptor.capabilities.supports_deterministic_seed;

            match run_solver(&input) {
                Ok(result) => {
                    prop_assert!(
                        !is_bootstrap_only,
                        "bootstrap-only solver {} unexpectedly succeeded — capabilities metadata is not truthful",
                        descriptor.kind.canonical_id()
                    );
                    prop_assert!(result.stop_reason.is_some());
                    prop_assert!(result.effective_seed.is_some());
                    prop_assert_eq!(
                        result.move_policy,
                        Some(default_solver_configuration_for(descriptor.kind)
                            .move_policy
                            .unwrap_or_default())
                    );
                }
                Err(error) => {
                    let is_solver4_capability_gate = descriptor.kind == SolverKind::Solver4
                        && (error.to_string().contains("solver4 requires complete equal partitions each session")
                            || error.to_string().contains("solver4 requires exactly one RepeatEncounter constraint encoding meet-at-most-once semantics")
                            || error.to_string().contains("solver4 requires zero-repeat meet-at-most-once semantics"));
                    let is_solver5_capability_gate = descriptor.kind == SolverKind::Solver5
                        && (error.to_string().contains("solver5 requires complete equal partitions each session")
                            || error.to_string().contains("solver5 requires exactly one RepeatEncounter constraint encoding meet-at-most-once semantics")
                            || error.to_string().contains("solver5 requires zero-repeat meet-at-most-once semantics"));
                    prop_assert!(
                        is_bootstrap_only || is_solver4_capability_gate || is_solver5_capability_gate,
                        "runnable solver {} failed with default config: {:?}",
                        descriptor.kind.canonical_id(),
                        error
                    );
                    if is_bootstrap_only {
                        prop_assert!(
                            error.to_string().contains("not implemented"),
                            "bootstrap solver {} should fail with an explicit 'not implemented' error, got: {}",
                            descriptor.kind.canonical_id(),
                            error
                        );
                    }
                }
            }
        }
    }
}

#[test]
fn registered_solver_descriptors_have_valid_default_configurations() {
    for descriptor in available_solver_descriptors() {
        let config = default_solver_configuration_for(descriptor.kind);
        assert_eq!(
            config.validate_solver_selection().unwrap(),
            descriptor.kind,
            "default configuration should resolve back to its registered solver family"
        );
    }
}

/// Additional deterministic tests for edge cases.
#[cfg(test)]
mod edge_cases {
    use super::*;

    #[test]
    fn minimum_viable_problem() {
        // 2 people, 1 group of 2, 1 session
        let input = create_test_input(2, 1, 2, 1);
        let state = State::new(&input).unwrap();

        assert_eq!(state.schedule.len(), 1);
        assert_eq!(state.schedule[0].len(), 1);
        assert_eq!(state.schedule[0][0].len(), 2);
        assert_eq!(state.unique_contacts, 1); // 1 pair
    }

    #[test]
    fn perfect_distribution() {
        // 4 people, 2 groups of 2, 2 sessions
        let input = create_test_input(4, 2, 2, 2);
        let state = State::new(&input).unwrap();

        // Each session has 4 people
        for session in &state.schedule {
            let total: usize = session.iter().map(|g| g.len()).sum();
            assert_eq!(total, 4);
        }
    }

    #[test]
    fn uneven_groups() {
        // 5 people, 2 groups of 3, 1 session
        // Group sizes should accommodate unevenly
        let input = create_test_input(5, 2, 3, 1);
        let result = State::new(&input);

        // Should succeed - groups have capacity for 6, we have 5
        assert!(result.is_ok());

        let state = result.unwrap();
        let total: usize = state.schedule[0].iter().map(|g| g.len()).sum();
        assert_eq!(total, 5);
    }
}
