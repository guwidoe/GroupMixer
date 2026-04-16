use crate::models::{
    ApiInput, Constraint, Objective, RepeatEncounterParams, SolverKind,
};
use crate::solver_support::SolverError;

#[derive(Debug, Clone)]
pub(super) struct PureSgpProblem {
    pub(super) people: Vec<String>,
    pub(super) groups: Vec<String>,
    pub(super) num_groups: usize,
    pub(super) group_size: usize,
    pub(super) num_weeks: usize,
}

impl PureSgpProblem {
    pub(super) fn from_input(input: &ApiInput) -> Result<Self, SolverError> {
        let kind = input
            .solver
            .validate_solver_selection()
            .map_err(SolverError::ValidationError)?;
        if kind != SolverKind::Solver5 {
            return Err(SolverError::ValidationError(format!(
                "solver5 expected solver family 'solver5', got '{}'",
                kind.canonical_id()
            )));
        }
        if input.initial_schedule.is_some() {
            return Err(SolverError::ValidationError(
                "solver5 does not accept initial_schedule; it constructs schedules directly"
                    .into(),
            ));
        }
        if input.construction_seed_schedule.is_some() {
            return Err(SolverError::ValidationError(
                "solver5 does not accept construction_seed_schedule; it constructs schedules directly"
                    .into(),
            ));
        }

        let num_weeks = usize::try_from(input.problem.num_sessions).map_err(|_| {
            SolverError::ValidationError("solver5 num_sessions does not fit usize".into())
        })?;
        if num_weeks == 0 {
            return Err(SolverError::ValidationError(
                "solver5 requires at least one session".into(),
            ));
        }
        if input.problem.groups.is_empty() {
            return Err(SolverError::ValidationError(
                "solver5 requires at least one group".into(),
            ));
        }
        if input.problem.people.is_empty() {
            return Err(SolverError::ValidationError(
                "solver5 requires at least one person".into(),
            ));
        }

        let first_group = &input.problem.groups[0];
        if first_group.size == 0 {
            return Err(SolverError::ValidationError(
                "solver5 requires positive uniform group size".into(),
            ));
        }
        if first_group.session_sizes.is_some() {
            return Err(SolverError::ValidationError(
                "solver5 rejects session-specific capacities; pure SGP requires one fixed group size"
                    .into(),
            ));
        }
        let group_size = usize::try_from(first_group.size).map_err(|_| {
            SolverError::ValidationError("solver5 group size does not fit usize".into())
        })?;

        for group in &input.problem.groups {
            if group.session_sizes.is_some() {
                return Err(SolverError::ValidationError(
                    "solver5 rejects session-specific capacities; pure SGP requires one fixed group size"
                        .into(),
                ));
            }
            if group.size != first_group.size {
                return Err(SolverError::ValidationError(
                    "solver5 requires uniform group sizes across all groups".into(),
                ));
            }
        }

        for person in &input.problem.people {
            if let Some(sessions) = &person.sessions {
                let expected: Vec<u32> = (0..input.problem.num_sessions).collect();
                if sessions != &expected {
                    return Err(SolverError::ValidationError(
                        "solver5 rejects partial attendance; pure SGP requires every person in every session"
                            .into(),
                    ));
                }
            }
        }

        let num_people = input.problem.people.len();
        let num_groups = input.problem.groups.len();
        if num_people != num_groups * group_size {
            return Err(SolverError::ValidationError(format!(
                "solver5 requires complete equal partitions each session: {} people != {} groups * size {}",
                num_people, num_groups, group_size
            )));
        }

        validate_pure_sgp_objectives(&input.objectives)?;
        validate_pure_sgp_constraints(&input.constraints)?;

        Ok(Self {
            people: input
                .problem
                .people
                .iter()
                .map(|person| person.id.clone())
                .collect(),
            groups: input
                .problem
                .groups
                .iter()
                .map(|group| group.id.clone())
                .collect(),
            num_groups,
            group_size,
            num_weeks,
        })
    }
}

fn validate_pure_sgp_objectives(objectives: &[Objective]) -> Result<(), SolverError> {
    for objective in objectives {
        if objective.r#type != "maximize_unique_contacts" {
            return Err(SolverError::ValidationError(format!(
                "solver5 rejects objective '{}'; pure SGP only allows maximize_unique_contacts",
                objective.r#type
            )));
        }
    }
    Ok(())
}

fn validate_pure_sgp_constraints(constraints: &[Constraint]) -> Result<(), SolverError> {
    let mut repeat_encounter: Option<&RepeatEncounterParams> = None;
    for constraint in constraints {
        match constraint {
            Constraint::RepeatEncounter(params) => {
                if repeat_encounter.replace(params).is_some() {
                    return Err(SolverError::ValidationError(
                        "solver5 allows exactly one RepeatEncounter constraint".into(),
                    ));
                }
            }
            other => {
                return Err(SolverError::ValidationError(format!(
                    "solver5 rejects non-SGP constraint '{:?}'; pure SGP only allows RepeatEncounter",
                    other
                )));
            }
        }
    }

    let Some(params) = repeat_encounter else {
        return Err(SolverError::ValidationError(
            "solver5 requires exactly one RepeatEncounter constraint encoding meet-at-most-once semantics"
                .into(),
        ));
    };
    if params.max_allowed_encounters != 1 {
        return Err(SolverError::ValidationError(
            "solver5 requires zero-repeat meet-at-most-once semantics: RepeatEncounter.max_allowed_encounters must be 1"
                .into(),
        ));
    }
    Ok(())
}
