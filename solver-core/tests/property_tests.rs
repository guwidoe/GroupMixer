//! Property-based tests for the solver.
//!
//! These tests use proptest to verify invariants hold across randomly generated
//! problem configurations and operations.

use proptest::prelude::*;
use solver_core::models::{
    ApiInput, Group, Person, ProblemDefinition, SimulatedAnnealingParams, SolverConfiguration,
    SolverParams, StopConditions,
};
use solver_core::solver::State;
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
        })
        .collect();

    ApiInput {
        initial_schedule: None,
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
