//! Shared test utilities for gm-core integration tests.
//!
//! This module provides common helper functions for creating test inputs
//! and verifying solver results across different test files.

use gm_core::models::{
    ApiInput, Constraint, Group, Objective, Person, ProblemDefinition, SimulatedAnnealingParams,
    SolverConfiguration, SolverParams, StopConditions,
};
use gm_core::solver1::State;
use std::collections::HashMap;

/// Creates a simple test input with the specified configuration.
///
/// # Arguments
/// * `num_people` - Number of people to create (named p0, p1, ...)
/// * `num_groups` - Number of groups to create (named g0, g1, ...)
/// * `group_size` - Maximum capacity of each group
/// * `num_sessions` - Number of sessions
///
/// # Returns
/// An `ApiInput` with no objectives or constraints, suitable for basic testing.
#[allow(dead_code)]
pub fn create_simple_input(
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
        solver: default_solver_config(1),
    }
}

/// Creates an input with people having the specified attributes.
///
/// # Arguments
/// * `people_attrs` - Vec of (person_id, attribute_map) tuples
/// * `groups` - Vec of (group_id, size) tuples
/// * `num_sessions` - Number of sessions
#[allow(dead_code)]
pub fn create_input_with_attributes(
    people_attrs: Vec<(&str, HashMap<String, String>)>,
    groups: Vec<(&str, u32)>,
    num_sessions: u32,
) -> ApiInput {
    let people = people_attrs
        .into_iter()
        .map(|(id, attributes)| Person {
            id: id.to_string(),
            attributes,
            sessions: None,
        })
        .collect();

    let groups = groups
        .into_iter()
        .map(|(id, size)| Group {
            id: id.to_string(),
            size,
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
        solver: default_solver_config(1),
    }
}

/// Creates a default solver configuration.
///
/// # Arguments
/// * `max_iterations` - Maximum iterations for the solver
#[allow(dead_code)]
pub fn default_solver_config(max_iterations: u64) -> SolverConfiguration {
    SolverConfiguration {
        solver_type: "SimulatedAnnealing".to_string(),
        stop_conditions: StopConditions {
            max_iterations: Some(max_iterations),
            time_limit_seconds: None,
            no_improvement_iterations: None,
            stop_on_optimal_score: true,
        },
        solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams {
            initial_temperature: 10.0,
            final_temperature: 0.1,
            cooling_schedule: "geometric".to_string(),
            reheat_after_no_improvement: Some(0),
            reheat_cycles: Some(0),
        }),
        logging: Default::default(),
        telemetry: Default::default(),
        seed: None,
        move_policy: None,
        allowed_sessions: None,
    }
}

/// Creates a quick solver config for fast tests.
#[allow(dead_code)]
pub fn quick_solver_config() -> SolverConfiguration {
    default_solver_config(100)
}

/// Creates a thorough solver config for quality tests.
#[allow(dead_code)]
pub fn thorough_solver_config() -> SolverConfiguration {
    default_solver_config(10000)
}

/// Helper to add an objective to an input.
#[allow(dead_code)]
pub fn with_objective(mut input: ApiInput, objective: Objective) -> ApiInput {
    input.objectives.push(objective);
    input
}

/// Helper to add a constraint to an input.
#[allow(dead_code)]
pub fn with_constraint(mut input: ApiInput, constraint: Constraint) -> ApiInput {
    input.constraints.push(constraint);
    input
}

/// Helper to set solver config on an input.
#[allow(dead_code)]
pub fn with_solver_config(mut input: ApiInput, config: SolverConfiguration) -> ApiInput {
    input.solver = config;
    input
}

/// Verifies that a schedule respects group capacities.
#[allow(dead_code)]
pub fn assert_capacity_respected(schedule: &[Vec<Vec<String>>], groups: &[Group]) {
    let _group_caps: HashMap<_, _> = groups.iter().map(|g| (&g.id, g.size)).collect();

    for session in schedule {
        for (group_idx, group_members) in session.iter().enumerate() {
            // Note: schedule uses group indices, not IDs in the API result
            // The capacity check would need the actual group mapping
            let member_count = group_members.len() as u32;
            if group_idx < groups.len() {
                let capacity = groups[group_idx].size;
                assert!(member_count <= capacity, "Capacity check failed");
            }
        }
    }
}

/// Verifies that no person appears twice in the same session.
#[allow(dead_code)]
pub fn assert_no_duplicate_assignments(schedule: &[Vec<Vec<String>>]) {
    for session in schedule {
        let mut seen = std::collections::HashSet::new();
        for group in session {
            for person in group {
                assert!(seen.insert(person), "Duplicate assignment detected");
            }
        }
    }
}

/// Verifies that two people are in the same group for a given session.
#[allow(dead_code)]
pub fn assert_together_in_session(
    schedule: &[Vec<Vec<String>>],
    session: usize,
    person1: &str,
    person2: &str,
) {
    let session_schedule = &schedule[session];
    let p1_group = session_schedule
        .iter()
        .position(|g| g.contains(&person1.to_string()));
    let p2_group = session_schedule
        .iter()
        .position(|g| g.contains(&person2.to_string()));

    assert_eq!(
        p1_group, p2_group,
        "Expected {} and {} to be in the same group in session {}, but {} is in {:?} and {} is in {:?}",
        person1, person2, session, person1, p1_group, person2, p2_group
    );
}

/// Verifies that two people are NOT in the same group for a given session.
#[allow(dead_code)]
pub fn assert_not_together_in_session(
    schedule: &[Vec<Vec<String>>],
    session: usize,
    person1: &str,
    person2: &str,
) {
    let session_schedule = &schedule[session];
    let p1_group = session_schedule
        .iter()
        .position(|g| g.contains(&person1.to_string()));
    let p2_group = session_schedule
        .iter()
        .position(|g| g.contains(&person2.to_string()));

    assert_ne!(
        p1_group, p2_group,
        "Expected {} and {} to be in different groups in session {}, but both are in {:?}",
        person1, person2, session, p1_group
    );
}

/// Builds a warm-start schedule map using the provided group order for each session.
#[allow(dead_code)]
pub fn make_initial_schedule(
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

#[allow(dead_code)]
pub fn assert_state_matches_full_recalculation(state: &State) {
    state
        .validate_no_duplicate_assignments()
        .expect("state should not contain duplicate assignments");

    let mut recalculated = state.clone();
    recalculated._recalculate_scores();

    assert_eq!(state.unique_contacts, recalculated.unique_contacts);
    assert_eq!(state.repetition_penalty, recalculated.repetition_penalty);
    assert_eq!(state.constraint_penalty, recalculated.constraint_penalty);
    assert_eq!(state.clique_violations, recalculated.clique_violations);
    assert_eq!(
        state.soft_apart_pair_violations,
        recalculated.soft_apart_pair_violations
    );
    assert_eq!(
        state.hard_apart_pair_violations,
        recalculated.hard_apart_pair_violations
    );
    assert_eq!(
        state.should_together_violations,
        recalculated.should_together_violations
    );
    assert_eq!(
        state.immovable_violations,
        recalculated.immovable_violations
    );
    assert_eq!(state.pairmin_counts, recalculated.pairmin_counts);
    assert!(
        (state.attribute_balance_penalty - recalculated.attribute_balance_penalty).abs() < 1e-9,
        "attribute balance penalty mismatch: cached={} recalculated={}",
        state.attribute_balance_penalty,
        recalculated.attribute_balance_penalty
    );
    assert!(
        (state.weighted_constraint_penalty - recalculated.weighted_constraint_penalty).abs() < 1e-9,
        "weighted constraint penalty mismatch: cached={} recalculated={}",
        state.weighted_constraint_penalty,
        recalculated.weighted_constraint_penalty
    );
    assert!(
        (state.current_cost - recalculated.current_cost).abs() < 1e-9,
        "current cost mismatch: cached={} recalculated={}",
        state.current_cost,
        recalculated.current_cost
    );
}

#[allow(dead_code)]
pub fn assert_delta_matches_after(before: &State, after: &State, predicted_delta: f64) {
    let mut recalculated_after = after.clone();
    recalculated_after._recalculate_scores();
    let actual_delta = recalculated_after.current_cost - before.current_cost;
    assert!(
        (predicted_delta - actual_delta).abs() < 1e-9,
        "predicted delta {} did not match actual delta {}",
        predicted_delta,
        actual_delta
    );
    assert_state_matches_full_recalculation(after);
}

#[allow(dead_code)]
pub fn count_person_occurrences_in_session(
    state: &State,
    session: usize,
    person_id: &str,
) -> usize {
    let person_idx = state.person_id_to_idx[person_id];
    state.schedule[session]
        .iter()
        .map(|group| group.iter().filter(|&&idx| idx == person_idx).count())
        .sum()
}
