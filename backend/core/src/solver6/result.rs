use super::problem::PureSgpProblem;
use crate::models::{ApiInput, ApiSchedule, MovePolicy, SolverKind, SolverResult, StopReason};
use crate::solver3::{OracleSnapshot, RuntimeState};
use crate::solver_support::SolverError;
use std::collections::HashMap;

pub(super) fn build_solver_result(
    input: &ApiInput,
    problem: &PureSgpProblem,
    schedule: &[Vec<Vec<usize>>],
    effective_seed: u64,
    stop_reason: StopReason,
) -> Result<SolverResult, SolverError> {
    let api_schedule = to_api_schedule(input, problem, schedule)?;
    let canonical = canonical_score_for_schedule(input, &api_schedule)?;

    Ok(SolverResult {
        final_score: canonical.total_score,
        schedule: api_schedule,
        unique_contacts: canonical.unique_contacts as i32,
        repetition_penalty: canonical.repetition_penalty_raw,
        attribute_balance_penalty: canonical.attribute_balance_penalty.round() as i32,
        constraint_penalty: canonical.constraint_penalty_raw,
        no_improvement_count: 0,
        weighted_repetition_penalty: canonical.weighted_repetition_penalty,
        weighted_constraint_penalty: canonical.constraint_penalty_weighted,
        effective_seed: Some(effective_seed),
        move_policy: Some(MovePolicy::default()),
        stop_reason: Some(stop_reason),
        benchmark_telemetry: None,
    })
}

fn canonical_score_for_schedule(
    input: &ApiInput,
    schedule: &ApiSchedule,
) -> Result<OracleSnapshot, SolverError> {
    let mut canonical_input = input.clone();
    canonical_input.initial_schedule = Some(schedule.clone());
    canonical_input.construction_seed_schedule = None;

    let mut solver_override = crate::default_solver_configuration_for(SolverKind::Solver3);
    solver_override.stop_conditions = canonical_input.solver.stop_conditions.clone();
    solver_override.logging = canonical_input.solver.logging.clone();
    solver_override.telemetry = canonical_input.solver.telemetry.clone();
    solver_override.seed = canonical_input.solver.seed;
    solver_override.move_policy = canonical_input.solver.move_policy.clone();
    solver_override.allowed_sessions = canonical_input.solver.allowed_sessions.clone();
    canonical_input.solver = solver_override;

    let state = RuntimeState::from_input(&canonical_input).map_err(|error| {
        SolverError::ValidationError(format!(
            "solver6 could not canonicalize its final schedule through solver3 scoring: {error}"
        ))
    })?;

    crate::solver3::recompute_oracle_score(&state)
}

fn to_api_schedule(
    input: &ApiInput,
    problem: &PureSgpProblem,
    schedule: &[Vec<Vec<usize>>],
) -> Result<HashMap<String, HashMap<String, Vec<String>>>, SolverError> {
    let mut api = HashMap::new();
    for (week_idx, groups) in schedule.iter().enumerate() {
        let mut week_map = HashMap::new();
        for (group_idx, members) in groups.iter().enumerate() {
            let group_id = input.problem.groups.get(group_idx).ok_or_else(|| {
                SolverError::ValidationError(format!(
                    "solver6 result group index {group_idx} out of bounds for {} groups",
                    problem.num_groups
                ))
            })?;
            let people = members
                .iter()
                .map(|person_idx| {
                    input.problem
                        .people
                        .get(*person_idx)
                        .map(|person| person.id.clone())
                        .ok_or_else(|| {
                            SolverError::ValidationError(format!(
                                "solver6 result person index {person_idx} out of bounds for {} people",
                                input.problem.people.len()
                            ))
                        })
                })
                .collect::<Result<Vec<_>, _>>()?;
            week_map.insert(group_id.id.clone(), people);
        }
        api.insert(format!("session_{week_idx}"), week_map);
    }
    Ok(api)
}
