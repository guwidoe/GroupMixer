use std::collections::HashMap;

use crate::models::{
    ApiInput, Constraint, Group, Objective, Person, ProblemDefinition, RepeatEncounterParams,
    Solver6PairRepeatPenaltyModel, Solver6Params, Solver6SearchStrategy, Solver6SeedStrategy,
    SolverConfiguration, SolverKind, SolverParams, StopConditions,
};
use crate::solver3::compiled_problem::PackedSchedule;
use crate::solver6::SearchEngine as Solver6SearchEngine;
use crate::solver_support::SolverError;

use super::types::{PureStructureOracleRequest, PureStructureOracleSchedule};

/// Stub-testable seam for obtaining pure SGP contact geometry.
pub(crate) trait PureStructureOracle {
    fn solve(
        &self,
        request: &PureStructureOracleRequest,
    ) -> Result<PureStructureOracleSchedule, SolverError>;
}

/// Default pure-structure oracle implementation backed by solver6.
#[derive(Debug, Clone, Copy, Default)]
pub(crate) struct Solver6PureStructureOracle;

impl PureStructureOracle for Solver6PureStructureOracle {
    fn solve(
        &self,
        request: &PureStructureOracleRequest,
    ) -> Result<PureStructureOracleSchedule, SolverError> {
        validate_pure_structure_request(request)?;
        let input = build_solver6_oracle_input(request)?;
        let solver = Solver6SearchEngine::new(&input.solver);
        let result = solver.solve(&input).map_err(|error| {
            SolverError::ValidationError(format!(
                "solver3 pure-structure oracle request g={} q={} w={} failed in solver6: {}",
                request.num_groups, request.group_size, request.num_sessions, error
            ))
        })?;
        let schedule = parse_solver6_oracle_schedule(request, &result.schedule)?;
        validate_pure_oracle_schedule(request, &schedule)?;
        Ok(PureStructureOracleSchedule { schedule })
    }
}

fn validate_pure_structure_request(
    request: &PureStructureOracleRequest,
) -> Result<(), SolverError> {
    if request.num_groups < 2 {
        return Err(SolverError::ValidationError(
            "solver3 pure-structure oracle requires at least two groups".into(),
        ));
    }
    if request.group_size < 2 {
        return Err(SolverError::ValidationError(
            "solver3 pure-structure oracle requires group size at least two".into(),
        ));
    }
    if request.num_sessions < 2 {
        return Err(SolverError::ValidationError(
            "solver3 pure-structure oracle requires at least two sessions".into(),
        ));
    }
    Ok(())
}

fn build_solver6_oracle_input(
    request: &PureStructureOracleRequest,
) -> Result<ApiInput, SolverError> {
    let num_sessions = u32::try_from(request.num_sessions).map_err(|_| {
        SolverError::ValidationError(
            "solver3 pure-structure oracle num_sessions does not fit u32".into(),
        )
    })?;
    let group_size = u32::try_from(request.group_size).map_err(|_| {
        SolverError::ValidationError(
            "solver3 pure-structure oracle group_size does not fit u32".into(),
        )
    })?;
    let people = (0..request.num_people())
        .map(|idx| Person {
            id: oracle_person_id(idx),
            attributes: HashMap::new(),
            sessions: None,
        })
        .collect::<Vec<_>>();
    let groups = (0..request.num_groups)
        .map(|idx| Group {
            id: oracle_group_id(idx),
            size: group_size,
            session_sizes: None,
        })
        .collect::<Vec<_>>();

    Ok(ApiInput {
        problem: ProblemDefinition {
            people,
            groups,
            num_sessions,
        },
        initial_schedule: None,
        construction_seed_schedule: None,
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".into(),
            weight: 1.0,
        }],
        constraints: vec![Constraint::RepeatEncounter(RepeatEncounterParams {
            max_allowed_encounters: 1,
            penalty_function: "linear".into(),
            penalty_weight: 1.0,
        })],
        solver: SolverConfiguration {
            solver_type: SolverKind::Solver6.canonical_id().into(),
            stop_conditions: StopConditions {
                max_iterations: Some(500),
                time_limit_seconds: Some(1),
                no_improvement_iterations: Some(100),
                stop_on_optimal_score: true,
            },
            solver_params: SolverParams::Solver6(Solver6Params {
                exact_construction_handoff_enabled: true,
                seed_strategy: Solver6SeedStrategy::Solver5ExactBlockComposition,
                pair_repeat_penalty_model: Solver6PairRepeatPenaltyModel::LinearRepeatExcess,
                search_strategy: Solver6SearchStrategy::DeterministicBestImprovingHillClimb,
                cache: None,
                seed_time_limit_seconds: None,
                local_search_time_limit_seconds: None,
            }),
            logging: Default::default(),
            telemetry: Default::default(),
            seed: Some(request.seed),
            move_policy: None,
            allowed_sessions: None,
        },
    })
}

fn parse_solver6_oracle_schedule(
    request: &PureStructureOracleRequest,
    api_schedule: &HashMap<String, HashMap<String, Vec<String>>>,
) -> Result<PackedSchedule, SolverError> {
    let mut schedule = vec![vec![Vec::new(); request.num_groups]; request.num_sessions];
    for (session_idx, groups) in schedule.iter_mut().enumerate() {
        let session_key = format!("session_{session_idx}");
        let api_groups = api_schedule.get(&session_key).ok_or_else(|| {
            SolverError::ValidationError(format!(
                "solver6 pure-structure oracle result omitted {session_key}"
            ))
        })?;
        for (group_idx, members) in groups.iter_mut().enumerate() {
            let group_key = oracle_group_id(group_idx);
            let api_members = api_groups.get(&group_key).ok_or_else(|| {
                SolverError::ValidationError(format!(
                    "solver6 pure-structure oracle result omitted group {group_key} in {session_key}"
                ))
            })?;
            for person_id in api_members {
                let Some(raw_idx) = person_id.strip_prefix("oracle_p") else {
                    return Err(SolverError::ValidationError(format!(
                        "solver6 pure-structure oracle returned unexpected person id '{person_id}'"
                    )));
                };
                let person_idx = raw_idx.parse::<usize>().map_err(|_| {
                    SolverError::ValidationError(format!(
                        "solver6 pure-structure oracle returned non-numeric person id '{person_id}'"
                    ))
                })?;
                members.push(person_idx);
            }
        }
    }
    Ok(schedule)
}

pub(crate) fn validate_pure_oracle_schedule(
    request: &PureStructureOracleRequest,
    schedule: &PackedSchedule,
) -> Result<(), SolverError> {
    if schedule.len() != request.num_sessions {
        return Err(SolverError::ValidationError(format!(
            "pure-structure oracle returned {} sessions for requested {}",
            schedule.len(),
            request.num_sessions
        )));
    }
    for (session_idx, groups) in schedule.iter().enumerate() {
        if groups.len() != request.num_groups {
            return Err(SolverError::ValidationError(format!(
                "pure-structure oracle returned {} groups in session {}, requested {}",
                groups.len(),
                session_idx,
                request.num_groups
            )));
        }
        let mut seen = vec![false; request.num_people()];
        for (group_idx, members) in groups.iter().enumerate() {
            if members.len() != request.group_size {
                return Err(SolverError::ValidationError(format!(
                    "pure-structure oracle returned group size {} in session {}, group {}, requested {}",
                    members.len(), session_idx, group_idx, request.group_size
                )));
            }
            for &person_idx in members {
                if person_idx >= request.num_people() {
                    return Err(SolverError::ValidationError(format!(
                        "pure-structure oracle returned out-of-range person index {person_idx}"
                    )));
                }
                if seen[person_idx] {
                    return Err(SolverError::ValidationError(format!(
                        "pure-structure oracle returned duplicate person index {person_idx} in session {session_idx}"
                    )));
                }
                seen[person_idx] = true;
            }
        }
        if seen.iter().any(|seen| !seen) {
            return Err(SolverError::ValidationError(format!(
                "pure-structure oracle omitted at least one person in session {session_idx}"
            )));
        }
    }
    Ok(())
}

fn oracle_person_id(idx: usize) -> String {
    format!("oracle_p{idx}")
}

fn oracle_group_id(idx: usize) -> String {
    format!("oracle_g{idx}")
}
