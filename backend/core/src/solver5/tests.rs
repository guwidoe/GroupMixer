use super::*;
use crate::models::{
    ApiInput, Constraint, Objective, ProblemDefinition, RepeatEncounterParams, SolverConfiguration,
    SolverKind, SolverParams, StopConditions,
};
use std::collections::HashMap;

fn pure_problem(groups: usize, group_size: usize, weeks: usize) -> ProblemDefinition {
    ProblemDefinition {
        people: (0..(groups * group_size))
            .map(|idx| crate::models::Person {
                id: format!("p{idx}"),
                attributes: HashMap::new(),
                sessions: None,
            })
            .collect(),
        groups: (0..groups)
            .map(|idx| crate::models::Group {
                id: format!("g{idx}"),
                size: group_size as u32,
                session_sizes: None,
            })
            .collect(),
        num_sessions: weeks as u32,
    }
}

fn solver5_config() -> SolverConfiguration {
    SolverConfiguration {
        solver_type: SolverKind::Solver5.canonical_id().into(),
        stop_conditions: StopConditions {
            max_iterations: Some(1),
            time_limit_seconds: Some(1),
            no_improvement_iterations: None,
            stop_on_optimal_score: true,
        },
        solver_params: SolverParams::Solver5(crate::models::Solver5Params::default()),
        logging: Default::default(),
        telemetry: Default::default(),
        seed: Some(7),
        move_policy: None,
        allowed_sessions: None,
    }
}

fn pure_input(groups: usize, group_size: usize, weeks: usize) -> ApiInput {
    ApiInput {
        problem: pure_problem(groups, group_size, weeks),
        initial_schedule: None,
        construction_seed_schedule: None,
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".into(),
            weight: 1.0,
        }],
        constraints: vec![Constraint::RepeatEncounter(RepeatEncounterParams {
            max_allowed_encounters: 1,
            penalty_function: "squared".into(),
            penalty_weight: 100.0,
        })],
        solver: solver5_config(),
    }
}

#[test]
fn solver5_solves_round_robin_instances() {
    let input = pure_input(4, 2, 7);
    let solver = SearchEngine::new(&input.solver);
    let result = solver.solve(&input).expect("round robin should solve 4-2-7");

    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 7);
    assert_eq!(result.unique_contacts, 28);
}

#[test]
fn solver5_supports_round_robin_prefixes() {
    let input = pure_input(4, 2, 5);
    let solver = SearchEngine::new(&input.solver);
    let result = solver
        .solve(&input)
        .expect("round robin prefix should solve 4-2-5");

    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 5);
}

#[test]
fn solver5_rejects_non_pure_inputs() {
    let mut input = pure_input(4, 2, 7);
    input.problem.people[0].sessions = Some(vec![0, 1, 2]);
    let solver = SearchEngine::new(&input.solver);
    let error = solver
        .solve(&input)
        .expect_err("partial attendance should be rejected");

    assert!(error
        .to_string()
        .contains("solver5 rejects partial attendance"));
}

#[test]
fn solver5_reports_missing_family_cleanly() {
    let input = pure_input(4, 3, 5);
    let solver = SearchEngine::new(&input.solver);
    let error = solver
        .solve(&input)
        .expect_err("p=3 should not be supported yet");

    assert!(error
        .to_string()
        .contains("solver5 does not yet have a construction family for 4-3-5"));
}

#[test]
fn solver5_solves_prime_power_transversal_design_cases() {
    let input = pure_input(5, 4, 5);
    let solver = SearchEngine::new(&input.solver);
    let result = solver
        .solve(&input)
        .expect("prime-order transversal design should solve 5-4-5");

    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 5);

    let input = pure_input(4, 3, 4);
    let result = solver
        .solve(&input)
        .expect("prime-power transversal design should solve 4-3-4");
    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 4);
}

#[test]
fn solver5_solves_prime_power_affine_plane_cases() {
    let input = pure_input(5, 5, 6);
    let solver = SearchEngine::new(&input.solver);
    let result = solver
        .solve(&input)
        .expect("prime affine plane should solve 5-5-6");

    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 6);

    let input = pure_input(4, 4, 5);
    let result = solver
        .solve(&input)
        .expect("prime-power affine plane should solve 4-4-5");
    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 5);
}

#[test]
fn solver5_recursively_lifts_transversal_design_latent_groups() {
    let input = pure_input(9, 3, 13);
    let solver = SearchEngine::new(&input.solver);
    let result = solver
        .solve(&input)
        .expect("recursive latent-group lifting should solve 9-3-13");

    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 13);
}

#[test]
fn solver5_solves_kirkman_6t_plus_1_cases() {
    let input = pure_input(7, 3, 10);
    let solver = SearchEngine::new(&input.solver);
    let result = solver
        .solve(&input)
        .expect("kirkman 6t+1 construction should solve 7-3-10");

    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 10);
}
