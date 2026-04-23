use crate::models::{
    ApiInput, Constraint, Objective, ProblemDefinition, RepeatEncounterParams, SolverConfiguration,
    SolverKind, SolverParams, StopConditions,
};
use std::collections::HashMap;

pub(super) fn pure_problem(groups: usize, group_size: usize, weeks: usize) -> ProblemDefinition {
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

pub(super) fn solver5_config() -> SolverConfiguration {
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

pub(super) fn pure_input(groups: usize, group_size: usize, weeks: usize) -> ApiInput {
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
