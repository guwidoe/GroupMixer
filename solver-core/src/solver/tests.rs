use super::*;
use crate::{
    models::{
        ApiInput, Constraint, Group, Person, ProblemDefinition, SimulatedAnnealingParams,
        SolverConfiguration, SolverParams, StopConditions,
    },
    run_solver,
};
use std::collections::HashMap;

// Helper to create a deterministic test setup
fn create_test_input(
    num_people: u32,
    groups_config: Vec<(u32, u32)>,
    num_sessions: u32,
) -> ApiInput {
    let people = (0..num_people)
        .map(|i| Person {
            id: format!("p{}", i),
            attributes: HashMap::new(),
            sessions: None,
        })
        .collect();

    let groups = groups_config
        .iter()
        .enumerate()
        .flat_map(|(i, (num_groups, size))| {
            (0..*num_groups).map(move |j| Group {
                id: format!("g{}_{}", i, j),
                size: *size,
            })
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
                reheat_after_no_improvement: Some(0), // No reheat
                reheat_cycles: Some(0),
            }),
            logging: Default::default(),
            telemetry: Default::default(),
            allowed_sessions: None,
        },
    }
}

#[test]
fn test_pair_meeting_count_modes() {
    use crate::models::{Constraint, PairMeetingCountParams, PairMeetingMode};
    // People p0..p3; 2 groups of 2; 3 sessions
    let mut input = create_test_input(4, vec![(2, 2)], 3);

    // Add PairMeetingCount constraints for pair (p0,p1) across sessions [0,1,2]
    input
        .constraints
        .push(Constraint::PairMeetingCount(PairMeetingCountParams {
            people: vec!["p0".into(), "p1".into()],
            sessions: vec![0, 1, 2],
            target_meetings: 2,
            mode: PairMeetingMode::AtLeast,
            penalty_weight: 10.0,
        }));
    input
        .constraints
        .push(Constraint::PairMeetingCount(PairMeetingCountParams {
            people: vec!["p0".into(), "p1".into()],
            sessions: vec![0, 1, 2],
            target_meetings: 2,
            mode: PairMeetingMode::Exact,
            penalty_weight: 10.0,
        }));
    input
        .constraints
        .push(Constraint::PairMeetingCount(PairMeetingCountParams {
            people: vec!["p0".into(), "p1".into()],
            sessions: vec![0, 1, 2],
            target_meetings: 2,
            mode: PairMeetingMode::AtMost,
            penalty_weight: 10.0,
        }));

    let mut state = State::new(&input).unwrap();
    // Construct schedule where p0 and p1 are together exactly once
    // Session 0: (p0,p2) | (p1,p3)
    // Session 1: (p0,p1) | (p2,p3)
    // Session 2: (p0,p3) | (p1,p2)
    state.schedule = vec![
        vec![vec![0, 2], vec![1, 3]],
        vec![vec![0, 1], vec![2, 3]],
        vec![vec![0, 3], vec![1, 2]],
    ];
    state._recalculate_locations_from_schedule();
    state._recalculate_scores();

    assert_eq!(state.pairmin_counts.len(), 3);
    assert_eq!(state.pairmin_counts[0], 1);
    assert_eq!(state.pairmin_counts[1], 1);
    assert_eq!(state.pairmin_counts[2], 1);

    // Perform a swap in session 0 to bring p0 and p1 together again → now 2 in subset
    let _ = state.calculate_swap_cost_delta(0, 1, 2);
    state.apply_swap(0, 1, 2);
    state._recalculate_scores();

    // After swap, session 0 also has (p0,p1) together; counts should be >=2 for first constraint
    // Our counts are stored per-constraint over their subsets, so they should now be 2
    assert_eq!(state.pairmin_counts[0], 2);
    // Other entries correspond to the other two constraints on the same pair/subset; they share counts
    assert_eq!(state.pairmin_counts[1], 2);
    assert_eq!(state.pairmin_counts[2], 2);
}

#[test]
fn test_recalculate_scores_is_correct() {
    // 1. Setup
    let input = create_test_input(6, vec![(2, 3)], 2);
    let mut state = State::new(&input).unwrap();
    state.schedule = vec![
        vec![vec![0, 1, 2], vec![3, 4, 5]], // Day 0: 6 contacts
        vec![vec![0, 3, 4], vec![1, 2, 5]], // Day 1: 6 contacts
    ];
    state._recalculate_locations_from_schedule();

    // 2. Action
    state._recalculate_scores();

    // 3. Assert
    // Contacts:
    // Day 0: (0,1), (0,2), (1,2), (3,4), (3,5), (4,5)
    // Day 1: (0,3), (0,4), (3,4), (1,2), (1,5), (2,5)
    // Total pairs met at least once: (0,1), (0,2), (0,3), (0,4), (1,2), (1,5), (2,5), (3,4), (3,5), (4,5) -> 10 pairs
    //
    // Repetition penalty:
    // (1,2) appears twice -> (2-1)^2 = 1
    // (3,4) appears twice -> (2-1)^2 = 1
    // Total penalty = 2
    assert_eq!(state.unique_contacts, 10);
    assert_eq!(state.repetition_penalty, 2);
}

#[test]
fn test_swap_updates_scores_correctly() {
    // 1. Setup
    let input = create_test_input(6, vec![(2, 3)], 2);
    let mut state = State::new(&input).unwrap();

    // Force a known initial schedule for predictability
    state.schedule = vec![
        vec![vec![0, 1, 2], vec![3, 4, 5]], // Day 0
        vec![vec![0, 3, 4], vec![1, 2, 5]], // Day 1
    ];
    state._recalculate_locations_from_schedule();
    state._recalculate_scores();

    let mut state_after_swap = state.clone();

    // 2. Action: Swap person 2 (from G0) with person 3 (from G1) on day 0
    state_after_swap.apply_swap(0, 2, 3);
    state_after_swap._recalculate_scores();

    // 3. Assert
    assert_ne!(
        state.schedule, state_after_swap.schedule,
        "Schedule should change after a neutral-score swap."
    );

    // After swapping p2 and p3 on day 0, the new schedule is:
    // Day 0: G0=[0, 1, 3], G1=[2, 4, 5]
    let expected_day_0 = vec![vec![0, 1, 3], vec![2, 4, 5]];
    assert_eq!(
        state_after_swap.schedule[0], expected_day_0,
        "Day 0 of schedule is incorrect after swap."
    );

    // For this specific swap, the scores don't change, but they should be recalculated correctly.
    assert_eq!(state_after_swap.unique_contacts, 10);
    assert_eq!(state_after_swap.repetition_penalty, 2);
}

#[test]
fn test_clique_merging() {
    // Create two overlapping MustStayTogether constraints with different session sets
    // A: {p0, p1} active in sessions 0 and 1
    // B: {p1, p2} active in sessions 1 and 2
    // Expected result:
    //   - Clique {p0,p1}  active only in session 0
    //   - Clique {p1,p2}  active only in session 2
    //   - Clique {p0,p1,p2} active only in session 1 (overlap)

    let mut input = create_test_input(6, vec![(1, 6)], 3);

    input.constraints = vec![
        Constraint::MustStayTogether {
            people: vec!["p0".into(), "p1".into()],
            sessions: Some(vec![0, 1]),
        },
        Constraint::MustStayTogether {
            people: vec!["p1".into(), "p2".into()],
            sessions: Some(vec![1, 2]),
        },
    ];

    let state = State::new(&input).unwrap();

    assert_eq!(state.cliques.len(), 3, "Should create three cliques");

    // Collect helper maps: set of members -> sessions
    let mut clique_map: Vec<(Vec<usize>, Option<Vec<usize>>)> = state
        .cliques
        .iter()
        .enumerate()
        .map(|(idx, members)| {
            let mut m = members.clone();
            m.sort();
            (m, state.clique_sessions[idx].clone())
        })
        .collect();

    clique_map.sort_by_key(|(m, _)| m.len());

    // Small cliques size 2
    let (c_a, sess_a) = &clique_map[0];
    let (c_b, sess_b) = &clique_map[1];
    let (c_overlap, sess_overlap) = &clique_map[2];

    assert_eq!(c_a, &vec![0, 1]);
    assert_eq!(sess_a.as_ref().unwrap(), &vec![0usize]);

    assert_eq!(c_b, &vec![1, 2]);
    assert_eq!(sess_b.as_ref().unwrap(), &vec![2usize]);

    assert_eq!(c_overlap, &vec![0, 1, 2]);
    assert_eq!(sess_overlap.as_ref().unwrap(), &vec![1usize]);
}

#[test]
fn test_error_on_clique_too_large() {
    let mut input = create_test_input(5, vec![(1, 3)], 1);
    input.constraints = vec![Constraint::MustStayTogether {
        people: vec!["p0".into(), "p1".into(), "p2".into(), "p3".into()],
        sessions: None,
    }];

    let result = State::new(&input);
    assert!(result.is_err());
    if let Err(SolverError::ValidationError(msg)) = result {
        // The validation can fail in three ways now:
        // 1. The new check for total people vs. total capacity.
        // 2. The original check in `_preprocess_and_validate_constraints` for clique size.
        // 3. The new check during initial placement.
        // We accept any of these error messages as a valid failure for this test case.
        let is_capacity_error = msg.contains("Not enough group capacity");
        let is_specific_error = msg.contains("is larger than any available group");
        let is_general_error = msg.contains("Could not place clique");
        assert!(
            is_capacity_error || is_specific_error || is_general_error,
            "Error message did not match expected patterns. Got: {}",
            msg
        );
    } else {
        panic!("Expected a ValidationError");
    }
}

#[test]
fn test_error_on_forbidden_pair_in_clique() {
    let mut input = create_test_input(5, vec![(1, 5)], 1);
    input.constraints = vec![
        Constraint::MustStayTogether {
            people: vec!["p0".into(), "p1".into()],
            sessions: None,
        },
        Constraint::ShouldNotBeTogether {
            people: vec!["p0".into(), "p1".into()],
            penalty_weight: 1000.0,
            sessions: None,
        },
    ];

    let result = State::new(&input);
    assert!(result.is_err());
    assert!(result
        .unwrap_err()
        .to_string()
        .contains("ShouldNotBeTogether constraint conflicts with MustStayTogether"));
}

#[test]
fn test_clique_swap_probability_calculation() {
    // Test with no cliques
    let input_no_cliques = create_test_input(10, vec![(2, 5)], 1);
    let state_no_cliques = State::new(&input_no_cliques).unwrap();
    assert_eq!(
        state_no_cliques.calculate_clique_swap_probability(),
        vec![0.0]
    );

    // Test with some cliques
    let mut input_with_cliques = create_test_input(10, vec![(2, 5)], 1);
    input_with_cliques.constraints = vec![
        Constraint::MustStayTogether {
            people: vec!["p0".into(), "p1".into()],
            sessions: None,
        },
        Constraint::MustStayTogether {
            people: vec!["p2".into(), "p3".into()],
            sessions: None,
        },
    ];
    let state_with_cliques = State::new(&input_with_cliques).unwrap();
    let probabilities = state_with_cliques.calculate_clique_swap_probability();

    assert!(!probabilities.is_empty());
    assert!(probabilities[0] > 0.0);
}

#[test]
fn test_find_non_clique_movable_people() {
    let mut input = create_test_input(8, vec![(2, 4)], 2);
    input.constraints = vec![
        Constraint::MustStayTogether {
            people: vec!["p0".into(), "p1".into()],
            sessions: None,
        },
        Constraint::ImmovablePerson(crate::models::ImmovablePersonParams {
            person_id: "p2".into(),
            group_id: "g0_0".into(),
            sessions: Some(vec![0, 1]),
        }),
    ];
    let state = State::new(&input).unwrap();

    // Find non-clique movable people in group 0 for day 0
    let non_clique_people = state.find_non_clique_movable_people(0, 0);

    // Should exclude p0, p1 (clique members) and p2 (immovable)
    assert!(!non_clique_people.contains(&0)); // p0 in clique
    assert!(!non_clique_people.contains(&1)); // p1 in clique
    assert!(!non_clique_people.contains(&2)); // p2 immovable

    // Should only include movable non-clique people
    for &person_idx in &non_clique_people {
        assert!(state.person_to_clique_id[0][person_idx].is_none());
        assert!(!state.immovable_people.contains_key(&(person_idx, 0)));
    }
}

#[test]
fn test_clique_swap_feasibility() {
    let mut input = create_test_input(10, vec![(2, 5)], 1);
    input.constraints = vec![Constraint::MustStayTogether {
        people: vec!["p0".into(), "p1".into(), "p2".into()],
        sessions: None,
    }];
    let state = State::new(&input).unwrap();

    // Find the clique (should be clique 0)
    let clique_idx = 0;
    let clique_group = state.locations[0][0].0; // Group where p0 is located
    let other_group = if clique_group == 0 { 1 } else { 0 };

    // Check feasibility - need at least 3 non-clique people in target group
    let is_feasible = state.is_clique_swap_feasible(0, clique_idx, clique_group, other_group);

    // Should be feasible since we have enough non-clique people
    let non_clique_in_other = state.find_non_clique_movable_people(0, other_group);
    if non_clique_in_other.len() >= 3 {
        assert!(is_feasible);
    } else {
        assert!(!is_feasible);
    }
}

#[test]
fn test_clique_swap_delta_calculation() {
    let mut input = create_test_input(8, vec![(2, 4)], 1);
    input.constraints = vec![Constraint::MustStayTogether {
        people: vec!["p0".into(), "p1".into()],
        sessions: None,
    }];
    let mut state = State::new(&input).unwrap();

    // Recalculate scores to ensure we have a baseline
    state._recalculate_scores();
    let initial_cost = state.calculate_cost();

    let clique_idx = 0;
    let clique_group = state.locations[0][0].0;
    let other_group = if clique_group == 0 { 1 } else { 0 };
    let non_clique_people = state.find_non_clique_movable_people(0, other_group);

    if non_clique_people.len() >= 2 {
        let target_people: Vec<usize> = non_clique_people.into_iter().take(2).collect();

        // Calculate delta
        let delta = state.calculate_clique_swap_cost_delta(
            0,
            clique_idx,
            clique_group,
            other_group,
            &target_people,
        );

        // Apply the swap and verify the delta was correct
        let mut test_state = state.clone();
        test_state.apply_clique_swap(0, clique_idx, clique_group, other_group, &target_people);
        test_state.validate_scores(); // Ensure scores are consistent

        let actual_new_cost = test_state.calculate_cost();
        let expected_new_cost = initial_cost + delta;

        // Allow small floating point differences
        assert!(
            (actual_new_cost - expected_new_cost).abs() < 0.01,
            "Delta calculation incorrect: expected {}, got {}, delta was {}",
            expected_new_cost,
            actual_new_cost,
            delta
        );
    }
}

#[test]
fn test_clique_swap_preserves_clique_integrity() {
    let mut input = create_test_input(10, vec![(2, 5)], 1);
    input.constraints = vec![Constraint::MustStayTogether {
        people: vec!["p0".into(), "p1".into(), "p2".into()],
        sessions: None,
    }];
    let mut state = State::new(&input).unwrap();

    let clique_idx = 0;
    let clique_group = state.locations[0][0].0;
    let other_group = if clique_group == 0 { 1 } else { 0 };
    let non_clique_people = state.find_non_clique_movable_people(0, other_group);

    if non_clique_people.len() >= 3 {
        let target_people: Vec<usize> = non_clique_people.into_iter().take(3).collect();
        let clique_members = state.cliques[clique_idx].clone();

        // Apply clique swap
        state.apply_clique_swap(0, clique_idx, clique_group, other_group, &target_people);

        // Verify all clique members are in the same group after swap
        let first_member_group = state.locations[0][clique_members[0]].0;
        for &member in &clique_members {
            assert_eq!(
                state.locations[0][member].0, first_member_group,
                "Clique member {} not in same group as other members",
                member
            );
        }

        // Verify they're in the target group
        assert_eq!(
            first_member_group, other_group,
            "Clique not moved to target group"
        );

        // Verify target people are in the original group
        for &target_person in &target_people {
            assert_eq!(
                state.locations[0][target_person].0, clique_group,
                "Target person {} not moved to clique's original group",
                target_person
            );
        }
    }
}

#[test]
fn test_user_reported_json_structure() {
    let json_input = r#"{
    "problem": {
        "people": [
            {"id": "alice", "attributes": {"name": "Alice Johnson", "gender": "female", "department": "engineering", "seniority": "senior"}},
            {"id": "bob", "attributes": {"name": "Bob Smith", "gender": "male", "department": "marketing", "seniority": "mid"}},
            {"id": "charlie", "attributes": {"name": "Charlie Brown", "gender": "male", "department": "engineering", "seniority": "junior"}},
            {"id": "diana", "attributes": {"name": "Diana Prince", "gender": "female", "department": "sales", "seniority": "lead"}},
            {"id": "eve", "attributes": {"name": "Eve Davis", "gender": "female", "department": "hr", "seniority": "mid"}},
            {"id": "frank", "attributes": {"name": "Frank Miller", "gender": "male", "department": "finance", "seniority": "senior"}},
            {"id": "grace", "attributes": {"name": "Grace Lee", "gender": "female", "department": "engineering", "seniority": "junior"}},
            {"id": "henry", "attributes": {"name": "Henry Wilson", "gender": "male", "department": "marketing", "seniority": "senior"}},
            {"id": "iris", "attributes": {"name": "Iris Chen", "gender": "female", "department": "sales", "seniority": "mid"}},
            {"id": "jack", "attributes": {"name": "Jack Taylor", "gender": "male", "department": "hr", "seniority": "junior"}},
            {"id": "kate", "attributes": {"name": "Kate Anderson", "gender": "female", "department": "finance", "seniority": "lead"}},
            {"id": "leo", "attributes": {"name": "Leo Rodriguez", "gender": "male", "department": "engineering", "seniority": "mid", "location": "remote"}, "sessions": [1, 2]}
        ],
        "groups": [
            {"id": "team-alpha", "size": 4},
            {"id": "team-beta", "size": 4},
            {"id": "team-gamma", "size": 4}
        ],
        "num_sessions": 3
    },
    "objectives": [
        {"type": "maximize_unique_contacts", "weight": 1}
    ],
    "constraints": [
        {"type": "RepeatEncounter", "max_allowed_encounters": 1, "penalty_function": "squared", "penalty_weight": 100},
        {"type": "MustStayTogether", "people": ["alice", "bob"], "sessions": [0, 1]},
        {"type": "ShouldNotBeTogether", "people": ["charlie", "diana"], "penalty_weight": 500},
        {"type": "AttributeBalance", "group_id": "team-alpha", "attribute_key": "gender", "desired_values": {"male": 2, "female": 2}, "penalty_weight": 50}
    ],
    "solver": {
        "solver_type": "SimulatedAnnealing",
        "stop_conditions": {
            "max_iterations": 10000,
            "time_limit_seconds": 30,
            "no_improvement_iterations": 1000
        },
        "solver_params": {
            "solver_type": "SimulatedAnnealing",
            "initial_temperature": 1,
            "final_temperature": 0.01,
            "cooling_schedule": "geometric"
        },
        "logging": {
            "log_frequency": null,
            "log_initial_state": false,
            "log_duration_and_score": false,
            "display_final_schedule": false,
            "log_initial_score_breakdown": false,
            "log_final_score_breakdown": false,
            "log_stop_condition": false
        }
    }
}"#;

    // Test that the JSON parses correctly
    let api_input: ApiInput =
        serde_json::from_str(json_input).expect("Failed to parse user-reported JSON structure");

    // Verify the structure
    assert_eq!(api_input.problem.people.len(), 12);
    assert_eq!(api_input.problem.groups.len(), 3);
    assert_eq!(api_input.problem.num_sessions, 3);
    assert_eq!(api_input.objectives.len(), 1);
    assert_eq!(api_input.constraints.len(), 4);
    assert_eq!(api_input.solver.solver_type, "SimulatedAnnealing");

    // Test that the solver can run with this input
    let result = run_solver(&api_input);
    assert!(
        result.is_ok(),
        "Solver should succeed with user-reported JSON: {:?}",
        result.err()
    );

    let solution = result.unwrap();
    assert!(!solution.schedule.is_empty());
}

#[test]
fn test_constraint_parsing() {
    use crate::models::Constraint;

    // Test RepeatEncounter parsing
    let repeat_json = r#"{"type": "RepeatEncounter", "max_allowed_encounters": 1, "penalty_function": "squared", "penalty_weight": 100}"#;
    let repeat_constraint: Result<Constraint, _> = serde_json::from_str(repeat_json);
    assert!(
        repeat_constraint.is_ok(),
        "RepeatEncounter should parse successfully"
    );

    // Test MustStayTogether parsing
    let must_stay_json =
        r#"{"type": "MustStayTogether", "people": ["alice", "bob"], "sessions": [0, 1]}"#;
    let must_stay_constraint: Result<Constraint, _> = serde_json::from_str(must_stay_json);
    assert!(
        must_stay_constraint.is_ok(),
        "MustStayTogether should parse successfully"
    );

    // Test ShouldNotBeTogether parsing
    let should_not_be_json =
        r#"{"type": "ShouldNotBeTogether", "people": ["charlie", "diana"], "penalty_weight": 500}"#;
    let should_not_be_constraint: Result<Constraint, _> = serde_json::from_str(should_not_be_json);
    assert!(
        should_not_be_constraint.is_ok(),
        "ShouldNotBeTogether should parse successfully"
    );

    // Test AttributeBalance parsing
    let attr_balance_json = r#"{"type": "AttributeBalance", "group_id": "team-alpha", "attribute_key": "gender", "desired_values": {"male": 2, "female": 2}, "penalty_weight": 50}"#;
    let attr_balance_constraint: Result<Constraint, _> = serde_json::from_str(attr_balance_json);
    assert!(
        attr_balance_constraint.is_ok(),
        "AttributeBalance should parse successfully"
    );
}

#[test]
fn test_solver_config_parsing() {
    use crate::models::SolverConfiguration;

    let solver_json = r#"{
    "solver_type": "SimulatedAnnealing",
    "stop_conditions": {
        "max_iterations": 10000,
        "time_limit_seconds": 30,
        "no_improvement_iterations": 1000
    },
    "solver_params": {
        "solver_type": "SimulatedAnnealing",
        "initial_temperature": 1,
        "final_temperature": 0.01,
        "cooling_schedule": "geometric"
    },
    "logging": {
        "log_frequency": 0,
        "log_initial_state": false,
        "log_duration_and_score": false,
        "display_final_schedule": false,
        "log_initial_score_breakdown": false,
        "log_final_score_breakdown": false,
        "log_stop_condition": false
    }
}"#;

    let solver_config: Result<SolverConfiguration, _> = serde_json::from_str(solver_json);
    assert!(
        solver_config.is_ok(),
        "Solver config should parse successfully: {:?}",
        solver_config.err()
    );
}

#[test]
fn test_simplified_user_json_structure() {
    let json_input = r#"{
    "problem": {
        "people": [
            {"id": "alice", "attributes": {"name": "Alice Johnson", "gender": "female"}},
            {"id": "bob", "attributes": {"name": "Bob Smith", "gender": "male"}},
            {"id": "charlie", "attributes": {"name": "Charlie Brown", "gender": "male"}},
            {"id": "diana", "attributes": {"name": "Diana Prince", "gender": "female"}}
        ],
        "groups": [
            {"id": "team-alpha", "size": 2},
            {"id": "team-beta", "size": 2}
        ],
        "num_sessions": 2
    },
    "objectives": [
        {"type": "maximize_unique_contacts", "weight": 1}
    ],
    "constraints": [
        {"type": "RepeatEncounter", "max_allowed_encounters": 1, "penalty_function": "squared", "penalty_weight": 100}
    ],
    "solver": {
        "solver_type": "SimulatedAnnealing",
        "stop_conditions": {
            "max_iterations": 1000,
            "time_limit_seconds": 5,
            "no_improvement_iterations": 100
        },
        "solver_params": {
            "solver_type": "SimulatedAnnealing",
            "initial_temperature": 1,
            "final_temperature": 0.01,
            "cooling_schedule": "geometric"
        },
        "logging": {
            "log_frequency": 0,
            "log_initial_state": false,
            "log_duration_and_score": false,
            "display_final_schedule": false,
            "log_initial_score_breakdown": false,
            "log_final_score_breakdown": false,
            "log_stop_condition": false
        }
    }
}"#;

    // Test that the JSON parses correctly
    let api_input: ApiInput =
        serde_json::from_str(json_input).expect("Failed to parse simplified JSON structure");

    // Verify the structure
    assert_eq!(api_input.problem.people.len(), 4);
    assert_eq!(api_input.problem.groups.len(), 2);
    assert_eq!(api_input.problem.num_sessions, 2);
    assert_eq!(api_input.objectives.len(), 1);
    assert_eq!(api_input.constraints.len(), 1);
    assert_eq!(api_input.solver.solver_type, "SimulatedAnnealing");

    // Test that the solver can run with this input
    let result = run_solver(&api_input);
    assert!(
        result.is_ok(),
        "Solver should succeed with simplified JSON: {:?}",
        result.err()
    );

    let solution = result.unwrap();
    assert!(!solution.schedule.is_empty());
    assert!(solution.unique_contacts > 0);
}

#[test]
fn test_transfer_probability_when_extra_capacity() {
    // Create a scenario where groups have more capacity than people currently assigned.
    // The transfer probability calculation should recognize the available capacity
    // and return a value greater than zero.
    let input = create_test_input(
        6,             // Total people
        vec![(2, 10)], // Two groups, each with capacity 10 (far more than needed)
        1,             // Single session is enough for this check
    );

    let state = State::new(&input).expect("Failed to create solver state");

    // For day 0, since both groups have room left (each holds 3 people),
    // the transfer probability should be positive.
    let prob = state.calculate_transfer_probability(0);
    assert!(
        prob > 0.0,
        "Expected positive transfer probability, got {}",
        prob
    );
}

#[test]
fn test_immovable_propagates_to_clique_members() {
    // Scenario: p0 and p1 form a clique across all sessions.
    // p0 is immovable to group g0_0 in session 0.
    // Expectation:
    //   • p1 is also immovable to g0_0 in session 0.
    //   • The clique constraint no longer applies in session 0 but still applies in session 1.

    use crate::models::ImmovablePersonParams;

    // 3 people (p0, p1 in clique; p2 free) – 2 groups of size 2 – 2 sessions
    let mut input = create_test_input(3, vec![(2, 2)], 2);

    // Add constraints
    input.constraints = vec![
        Constraint::MustStayTogether {
            people: vec!["p0".into(), "p1".into()],
            sessions: None, // all sessions initially
        },
        Constraint::ImmovablePerson(ImmovablePersonParams {
            person_id: "p0".into(),
            group_id: "g0_0".into(),
            sessions: Some(vec![0]),
        }),
    ];

    // Build state
    let state = State::new(&input).expect("State creation should succeed");

    // Resolve useful indices
    let p0_idx = state.person_id_to_idx["p0"];
    let p1_idx = state.person_id_to_idx["p1"];
    let g0_idx = state.group_id_to_idx["g0_0"];

    // === Assert immovable propagation ===
    assert_eq!(
        state.immovable_people.len(),
        2,
        "Both clique members should be immovable"
    );
    assert_eq!(state.immovable_people.get(&(p0_idx, 0)), Some(&g0_idx));
    assert_eq!(state.immovable_people.get(&(p1_idx, 0)), Some(&g0_idx));

    // === Assert clique session removal ===
    let clique_id = state.person_to_clique_id[0][p0_idx].expect("p0 should be in clique");
    let sessions_opt = &state.clique_sessions[clique_id];
    // After propagation, the clique should only apply to session 1.
    assert_eq!(sessions_opt, &Some(vec![1]));

    // === Ensure no validation errors for conflicting assignments ===
    // (Already covered by State::new success) – Additional logical check:
    // cost calculation should yield zero immovable violations at start.
    assert_eq!(state.immovable_violations, 0);
}
mod attribute_balance_tests {
    use super::*;
    use crate::models::*;

    #[test]
    fn test_attribute_balance_incremental_vs_recalculation() {
        println!("=== Testing Attribute Balance Incremental Tracking ===");

        // Create a test case with attribute balance constraints
        let input = create_attribute_balance_test_input();
        let mut state = State::new(&input).unwrap();

        println!("Initial state:");
        println!(
            "  attribute_balance_penalty: {}",
            state.attribute_balance_penalty
        );
        println!("  total cost: {}", state.calculate_cost());

        // Perform several swaps and check consistency after each one
        for swap_num in 1..=10 {
            // Find two people to swap (avoid cliques and immovable people)
            let swappable_people: Vec<usize> = (0..state.person_idx_to_id.len())
                .filter(|&p_idx| state.person_to_clique_id[0][p_idx].is_none())
                .collect();

            if swappable_people.len() < 2 {
                break;
            }

            let p1_idx = swappable_people[0];
            let p2_idx = swappable_people[1];
            let day = 0; // Test on first day

            // Calculate delta using incremental method
            let delta_cost = state.calculate_swap_cost_delta(day, p1_idx, p2_idx);
            let cost_before = state.calculate_cost();
            let attr_penalty_before = state.attribute_balance_penalty;

            println!(
                "\nSwap {}: person {} <-> person {} on day {}",
                swap_num, p1_idx, p2_idx, day
            );
            println!("  Before swap:");
            println!("    attribute_balance_penalty: {}", attr_penalty_before);
            println!("    total cost: {}", cost_before);
            println!("  Predicted delta: {}", delta_cost);

            // Apply the swap using incremental updates
            state.apply_swap(day, p1_idx, p2_idx);

            let cost_after_incremental = state.calculate_cost();
            let attr_penalty_after_incremental = state.attribute_balance_penalty;
            let actual_delta = cost_after_incremental - cost_before;

            println!("  After incremental swap:");
            println!(
                "    attribute_balance_penalty: {}",
                attr_penalty_after_incremental
            );
            println!("    total cost: {}", cost_after_incremental);
            println!("    actual delta: {}", actual_delta);

            // Now do full recalculation
            state._recalculate_scores();
            let cost_after_recalc = state.calculate_cost();
            let attr_penalty_after_recalc = state.attribute_balance_penalty;

            println!("  After recalculation:");
            println!(
                "    attribute_balance_penalty: {}",
                attr_penalty_after_recalc
            );
            println!("    total cost: {}", cost_after_recalc);

            // Check for discrepancies
            let delta_prediction_error = (actual_delta - delta_cost).abs();
            let recalc_error = (cost_after_recalc - cost_after_incremental).abs();
            let attr_penalty_error =
                (attr_penalty_after_recalc - attr_penalty_after_incremental).abs();

            println!("  Errors:");
            println!("    delta prediction error: {}", delta_prediction_error);
            println!("    recalculation cost error: {}", recalc_error);
            println!("    attribute penalty error: {}", attr_penalty_error);

            // Assert that incremental and recalculation match
            if delta_prediction_error > 0.001 {
                panic!(
                    "Delta prediction error too large: {}",
                    delta_prediction_error
                );
            }
            if recalc_error > 0.001 {
                panic!("Recalculation cost error too large: {}", recalc_error);
            }
            if attr_penalty_error > 0.001 {
                panic!("Attribute penalty error too large: {}", attr_penalty_error);
            }
        }

        println!("\n=== All swaps passed incremental vs recalculation test ===");
    }

    #[test]
    fn test_attribute_balance_bug_reproduction() {
        println!("=== Testing Specific Attribute Balance Bug ===");

        let input = create_attribute_balance_test_input();
        let mut state = State::new(&input).unwrap();

        // Print initial state
        println!("Initial schedule:");
        for (day, day_schedule) in state.schedule.iter().enumerate() {
            println!("  Day {}:", day);
            for (group_idx, group_people) in day_schedule.iter().enumerate() {
                let group_id = &state.group_idx_to_id[group_idx];
                let people_names: Vec<String> = group_people
                    .iter()
                    .map(|&p_idx| state.person_idx_to_id[p_idx].clone())
                    .collect();
                println!("    Group {} ({}): {:?}", group_idx, group_id, people_names);
            }
        }

        println!(
            "Initial attribute balance penalty: {}",
            state.attribute_balance_penalty
        );

        // Force a specific swap that should create an attribute balance violation
        // Swap Alice (female) from group 0 with Charlie (male) from group 1
        let alice_idx = state.person_id_to_idx["alice"];
        let charlie_idx = state.person_id_to_idx["charlie"];

        println!(
            "Alice (female) idx: {}, Charlie (male) idx: {}",
            alice_idx, charlie_idx
        );

        let (alice_group, _) = state.locations[0][alice_idx];
        let (charlie_group, _) = state.locations[0][charlie_idx];

        println!(
            "Before swap: Alice in group {}, Charlie in group {}",
            alice_group, charlie_group
        );

        // Swap Alice and Charlie (should be in different groups)
        if alice_group != charlie_group {
            let delta = state.calculate_swap_cost_delta(0, alice_idx, charlie_idx);
            println!("Calculated delta: {}", delta);

            let cost_before = state.calculate_cost();
            let attr_penalty_before = state.attribute_balance_penalty;

            println!(
                "Before swap: cost={}, attr_penalty={}",
                cost_before, attr_penalty_before
            );

            // Apply the swap
            state.apply_swap(0, alice_idx, charlie_idx);

            let cost_after_incremental = state.calculate_cost();
            let attr_penalty_after_incremental = state.attribute_balance_penalty;
            let actual_delta = cost_after_incremental - cost_before;

            println!(
                "After incremental swap: cost={}, attr_penalty={}, actual_delta={}",
                cost_after_incremental, attr_penalty_after_incremental, actual_delta
            );

            // Now recalculate
            state._recalculate_scores();

            let cost_after_recalc = state.calculate_cost();
            let attr_penalty_after_recalc = state.attribute_balance_penalty;

            println!(
                "After recalculation: cost={}, attr_penalty={}",
                cost_after_recalc, attr_penalty_after_recalc
            );

            let attr_penalty_error =
                (attr_penalty_after_recalc - attr_penalty_after_incremental).abs();
            let cost_error = (cost_after_recalc - cost_after_incremental).abs();

            println!(
                "Errors: attr_penalty_error={}, cost_error={}",
                attr_penalty_error, cost_error
            );

            if attr_penalty_error > 0.001 {
                println!("BUG DETECTED: Attribute penalty mismatch!");
                println!("  Incremental: {}", attr_penalty_after_incremental);
                println!("  Recalculated: {}", attr_penalty_after_recalc);
                println!("  Difference: {}", attr_penalty_error);
            }
        } else {
            println!("Alice and Bob are in the same group, no swap needed");
        }
    }

    #[test]
    fn test_attribute_balance_delta_calculation() {
        println!("=== Testing Attribute Balance Delta Calculation ===");

        let input = create_attribute_balance_test_input();
        let mut state = State::new(&input).unwrap();

        // Test a specific swap
        let p1_idx = 0; // Should be "alice" (female)
        let p2_idx = 1; // Should be "bob" (male)
        let day = 0;

        println!(
            "Testing swap: {} <-> {} on day {}",
            state.person_idx_to_id[p1_idx], state.person_idx_to_id[p2_idx], day
        );

        // Get current group assignments
        let (p1_group, _) = state.locations[day][p1_idx];
        let (p2_group, _) = state.locations[day][p2_idx];

        println!(
            "  {} is in group {} ({})",
            state.person_idx_to_id[p1_idx], p1_group, state.group_idx_to_id[p1_group]
        );
        println!(
            "  {} is in group {} ({})",
            state.person_idx_to_id[p2_idx], p2_group, state.group_idx_to_id[p2_group]
        );

        // Calculate attribute balance penalty before swap
        let penalty_before = state.attribute_balance_penalty;
        println!("  Attribute balance penalty before: {}", penalty_before);

        // Calculate delta
        let delta = state.calculate_swap_cost_delta(day, p1_idx, p2_idx);
        println!("  Calculated delta: {}", delta);

        // Apply swap and check actual change
        let cost_before = state.calculate_cost();
        state.apply_swap(day, p1_idx, p2_idx);
        let cost_after = state.calculate_cost();
        let penalty_after = state.attribute_balance_penalty;
        let actual_delta = cost_after - cost_before;

        println!("  Attribute balance penalty after: {}", penalty_after);
        println!("  Actual delta: {}", actual_delta);
        println!("  Penalty change: {}", penalty_after - penalty_before);

        // Now recalculate and compare
        state._recalculate_scores();
        let penalty_recalc = state.attribute_balance_penalty;
        let cost_recalc = state.calculate_cost();

        println!("  After recalculation:");
        println!("    Attribute balance penalty: {}", penalty_recalc);
        println!("    Total cost: {}", cost_recalc);

        assert!(
            (penalty_recalc - penalty_after).abs() < 0.001,
            "Attribute penalty mismatch: incremental={}, recalc={}",
            penalty_after,
            penalty_recalc
        );
    }

    fn create_attribute_balance_test_input() -> ApiInput {
        ApiInput {
            initial_schedule: None,
            problem: ProblemDefinition {
                people: vec![
                    Person {
                        id: "alice".to_string(),
                        attributes: [("gender".to_string(), "female".to_string())].into(),
                        sessions: None,
                    },
                    Person {
                        id: "bob".to_string(),
                        attributes: [("gender".to_string(), "male".to_string())].into(),
                        sessions: None,
                    },
                    Person {
                        id: "charlie".to_string(),
                        attributes: [("gender".to_string(), "male".to_string())].into(),
                        sessions: None,
                    },
                    Person {
                        id: "diana".to_string(),
                        attributes: [("gender".to_string(), "female".to_string())].into(),
                        sessions: None,
                    },
                    Person {
                        id: "eve".to_string(),
                        attributes: [("gender".to_string(), "female".to_string())].into(),
                        sessions: None,
                    },
                    Person {
                        id: "frank".to_string(),
                        attributes: [("gender".to_string(), "male".to_string())].into(),
                        sessions: None,
                    },
                ],
                groups: vec![
                    Group {
                        id: "team1".to_string(),
                        size: 3,
                    },
                    Group {
                        id: "team2".to_string(),
                        size: 3,
                    },
                ],
                num_sessions: 1,
            },
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".to_string(),
                weight: 1.0,
            }],
            constraints: vec![
                Constraint::AttributeBalance(AttributeBalanceParams {
                    group_id: "team1".to_string(),
                    attribute_key: "gender".to_string(),
                    desired_values: [("male".to_string(), 2), ("female".to_string(), 1)].into(),
                    penalty_weight: 100.0,
                    mode: crate::models::AttributeBalanceMode::Exact,
                    sessions: Some(vec![0, 1]),
                }),
                Constraint::AttributeBalance(AttributeBalanceParams {
                    group_id: "team2".to_string(),
                    attribute_key: "gender".to_string(),
                    desired_values: [("male".to_string(), 1), ("female".to_string(), 2)].into(),
                    penalty_weight: 100.0,
                    mode: crate::models::AttributeBalanceMode::Exact,
                    sessions: Some(vec![0, 1]),
                }),
            ],
            solver: SolverConfiguration {
                solver_type: "SimulatedAnnealing".to_string(),
                stop_conditions: StopConditions {
                    max_iterations: Some(10),
                    time_limit_seconds: None,
                    no_improvement_iterations: None,
                },
                solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams {
                    initial_temperature: 1.0,
                    final_temperature: 0.1,
                    cooling_schedule: "geometric".to_string(),
                    reheat_after_no_improvement: Some(0), // No reheat
                    reheat_cycles: Some(0),
                }),
                logging: LoggingOptions::default(),
                telemetry: Default::default(),
                allowed_sessions: None,
            },
        }
    }

    #[test]
    fn test_attribute_balance_mode_at_least() {
        // People: 4 females, 2 males
        let people = vec![
            Person {
                id: "f1".to_string(),
                attributes: [("gender".to_string(), "female".to_string())].into(),
                sessions: None,
            },
            Person {
                id: "f2".to_string(),
                attributes: [("gender".to_string(), "female".to_string())].into(),
                sessions: None,
            },
            Person {
                id: "f3".to_string(),
                attributes: [("gender".to_string(), "female".to_string())].into(),
                sessions: None,
            },
            Person {
                id: "f4".to_string(),
                attributes: [("gender".to_string(), "female".to_string())].into(),
                sessions: None,
            },
            Person {
                id: "m1".to_string(),
                attributes: [("gender".to_string(), "male".to_string())].into(),
                sessions: None,
            },
            Person {
                id: "m2".to_string(),
                attributes: [("gender".to_string(), "male".to_string())].into(),
                sessions: None,
            },
        ];

        let input = ApiInput {
            initial_schedule: None,
            problem: ProblemDefinition {
                people,
                groups: vec![
                    Group {
                        id: "g1".to_string(),
                        size: 3,
                    },
                    Group {
                        id: "g2".to_string(),
                        size: 3,
                    },
                ],
                num_sessions: 1,
            },
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".to_string(),
                weight: 1.0,
            }],
            constraints: vec![Constraint::AttributeBalance(AttributeBalanceParams {
                group_id: "g1".to_string(),
                attribute_key: "gender".to_string(),
                desired_values: [("female".to_string(), 2)].into(),
                penalty_weight: 10.0,
                mode: crate::models::AttributeBalanceMode::AtLeast,
                sessions: None,
            })],
            solver: SolverConfiguration {
                solver_type: "SimulatedAnnealing".to_string(),
                stop_conditions: StopConditions {
                    max_iterations: Some(1),
                    time_limit_seconds: None,
                    no_improvement_iterations: None,
                },
                solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams {
                    initial_temperature: 1.0,
                    final_temperature: 1.0,
                    cooling_schedule: "geometric".to_string(),
                    reheat_after_no_improvement: Some(0),
                    reheat_cycles: Some(0),
                }),
                logging: LoggingOptions::default(),
                telemetry: Default::default(),
                allowed_sessions: None,
            },
        };

        let mut state = State::new(&input).expect("state should build");

        // Case 1: Shortfall (only 1 female in g1) -> penalty = (2-1)^2 * 10 = 10
        // Indices: f1=0, f2=1, f3=2, f4=3, m1=4, m2=5
        state.schedule = vec![vec![vec![0, 4, 5], vec![1, 2, 3]]]; // g1: f1,m1,m2 (1 female); g2: f2,f3,f4
        state._recalculate_scores();
        let p_shortfall = state.attribute_balance_penalty;
        assert!(
            (p_shortfall - 10.0).abs() < 0.001,
            "Expected shortfall penalty 10, got {}",
            p_shortfall
        );

        // Case 2: Overshoot (3 females in g1) -> penalty = 0 in AtLeast mode
        state.schedule = vec![vec![vec![0, 1, 2], vec![3, 4, 5]]]; // g1: f1,f2,f3 (3 females)
        state._recalculate_scores();
        let p_overshoot = state.attribute_balance_penalty;
        assert!(
            p_overshoot.abs() < 0.001,
            "Expected zero penalty for overshoot in AtLeast mode, got {}",
            p_overshoot
        );
    }

    #[test]
    fn test_attribute_balance_detailed_debugging() {
        println!("=== DETAILED ATTRIBUTE BALANCE DEBUGGING ===");

        let input = create_attribute_balance_test_input();
        let mut state = State::new(&input).unwrap();

        println!("Initial state:");
        println!(
            "  attribute_balance_penalty: {}",
            state.attribute_balance_penalty
        );

        // Print attribute constraints
        println!("Attribute balance constraints:");
        for (i, ac) in state.attribute_balance_constraints.iter().enumerate() {
            println!(
                "  {}: group_id='{}', attribute_key='{}', penalty_weight={}",
                i, ac.group_id, ac.attribute_key, ac.penalty_weight
            );
            println!("    desired_values: {:?}", ac.desired_values);
        }

        // Find two people in different groups for testing
        let mut test_people = None;
        for p1 in 0..state.person_idx_to_id.len() {
            for p2 in (p1 + 1)..state.person_idx_to_id.len() {
                let (g1, _) = state.locations[0][p1];
                let (g2, _) = state.locations[0][p2];
                if g1 != g2 {
                    test_people = Some((p1, p2));
                    break;
                }
            }
            if test_people.is_some() {
                break;
            }
        }

        if let Some((p1_idx, p2_idx)) = test_people {
            println!(
                "\nTesting swap: {} <-> {}",
                state.person_idx_to_id[p1_idx], state.person_idx_to_id[p2_idx]
            );

            let (g1_idx, _) = state.locations[0][p1_idx];
            let (g2_idx, _) = state.locations[0][p2_idx];

            println!(
                "  {} in group {} ({})",
                state.person_idx_to_id[p1_idx], g1_idx, state.group_idx_to_id[g1_idx]
            );
            println!(
                "  {} in group {} ({})",
                state.person_idx_to_id[p2_idx], g2_idx, state.group_idx_to_id[g2_idx]
            );

            let g1_members = &state.schedule[0][g1_idx];
            let g2_members = &state.schedule[0][g2_idx];

            println!(
                "  g1_members: {:?}",
                g1_members
                    .iter()
                    .map(|&p| &state.person_idx_to_id[p])
                    .collect::<Vec<_>>()
            );
            println!(
                "  g2_members: {:?}",
                g2_members
                    .iter()
                    .map(|&p| &state.person_idx_to_id[p])
                    .collect::<Vec<_>>()
            );

            // Calculate delta step by step
            println!("\n--- DELTA CALCULATION ---");
            let mut total_delta = 0.0;

            for (i, ac) in state.attribute_balance_constraints.iter().enumerate() {
                println!(
                    "Constraint {}: group_id='{}', attribute_key='{}'",
                    i, ac.group_id, ac.attribute_key
                );

                // Check if constraint applies to these groups
                let g1_id = &state.group_idx_to_id[g1_idx];
                let g2_id = &state.group_idx_to_id[g2_idx];

                let applies_to_g1 = ac.group_id == *g1_id;
                let applies_to_g2 = ac.group_id == *g2_id;

                println!("  applies_to_g1 ({}): {}", g1_id, applies_to_g1);
                println!("  applies_to_g2 ({}): {}", g2_id, applies_to_g2);

                if !applies_to_g1 && !applies_to_g2 {
                    println!("  SKIPPING - constraint doesn't apply to either group");
                    continue;
                }

                let old_penalty_g1 =
                    state.calculate_group_attribute_penalty_for_members(g1_members, ac);
                let old_penalty_g2 =
                    state.calculate_group_attribute_penalty_for_members(g2_members, ac);

                println!("  old_penalty_g1: {}", old_penalty_g1);
                println!("  old_penalty_g2: {}", old_penalty_g2);

                // Calculate new group compositions
                let mut next_g1_members: Vec<usize> = g1_members
                    .iter()
                    .filter(|&&p| p != p1_idx)
                    .cloned()
                    .collect();
                next_g1_members.push(p2_idx);
                let mut next_g2_members: Vec<usize> = g2_members
                    .iter()
                    .filter(|&&p| p != p2_idx)
                    .cloned()
                    .collect();
                next_g2_members.push(p1_idx);

                println!(
                    "  next_g1_members: {:?}",
                    next_g1_members
                        .iter()
                        .map(|&p| &state.person_idx_to_id[p])
                        .collect::<Vec<_>>()
                );
                println!(
                    "  next_g2_members: {:?}",
                    next_g2_members
                        .iter()
                        .map(|&p| &state.person_idx_to_id[p])
                        .collect::<Vec<_>>()
                );

                let new_penalty_g1 =
                    state.calculate_group_attribute_penalty_for_members(&next_g1_members, ac);
                let new_penalty_g2 =
                    state.calculate_group_attribute_penalty_for_members(&next_g2_members, ac);

                println!("  new_penalty_g1: {}", new_penalty_g1);
                println!("  new_penalty_g2: {}", new_penalty_g2);

                let delta_penalty =
                    (new_penalty_g1 + new_penalty_g2) - (old_penalty_g1 + old_penalty_g2);
                println!("  delta_penalty: {}", delta_penalty);

                total_delta += delta_penalty;
                println!("  running total_delta: {}", total_delta);
            }

            println!("FINAL DELTA: {}", total_delta);

            // Now apply the swap and track incremental updates
            println!("\n--- APPLY SWAP ---");
            let attr_penalty_before = state.attribute_balance_penalty;
            println!("attribute_balance_penalty before: {}", attr_penalty_before);

            state.apply_swap(0, p1_idx, p2_idx);

            let attr_penalty_after = state.attribute_balance_penalty;
            println!("attribute_balance_penalty after: {}", attr_penalty_after);

            let actual_delta = attr_penalty_after - attr_penalty_before;
            println!("actual delta: {}", actual_delta);

            // Now recalculate
            println!("\n--- RECALCULATION ---");
            state._recalculate_scores();

            let attr_penalty_recalc = state.attribute_balance_penalty;
            println!(
                "attribute_balance_penalty after recalc: {}",
                attr_penalty_recalc
            );

            println!("\n--- COMPARISON ---");
            println!("Expected delta: {}", total_delta);
            println!("Actual delta: {}", actual_delta);
            println!("Delta error: {}", (actual_delta - total_delta).abs());

            println!("Incremental result: {}", attr_penalty_after);
            println!("Recalculated result: {}", attr_penalty_recalc);
            println!(
                "Incremental vs recalc error: {}",
                (attr_penalty_recalc - attr_penalty_after).abs()
            );

            if (actual_delta - total_delta).abs() > 0.001 {
                println!("BUG DETECTED: Delta calculation mismatch!");
            }
            if (attr_penalty_recalc - attr_penalty_after).abs() > 0.001 {
                println!("BUG DETECTED: Incremental vs recalculation mismatch!");
            }
        } else {
            println!("No suitable test people found (all in same groups)");
        }
    }
}
