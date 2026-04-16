use crate::models::{ApiInput, SolverConfiguration, SolverResult};
use crate::solver_support::SolverError;

mod families;
mod field;
mod problem;
mod result;

#[cfg(test)]
mod tests;

use families::construct_schedule;
use problem::PureSgpProblem;
use result::build_solver_result;

pub const SOLVER5_NOTES: &str =
    "Construction-first pure-SGP solver family. Solver5 accepts only pure zero-repeat Social-Golfer-style scenarios and routes them through explicit construction families. Initial baseline ships the round-robin / 1-factorization family for p=2; broader construction portfolio work belongs here.";

const DEFAULT_SOLVER5_SEED: u64 = 42;

#[derive(Clone)]
pub struct SearchEngine {
    configuration: SolverConfiguration,
}

impl SearchEngine {
    pub fn new(configuration: &SolverConfiguration) -> Self {
        Self {
            configuration: configuration.clone(),
        }
    }

    pub fn solve(&self, input: &ApiInput) -> Result<SolverResult, SolverError> {
        let problem = PureSgpProblem::from_input(input)?;
        match &self.configuration.solver_params {
            crate::models::SolverParams::Solver5(_) => {}
            _ => {
                return Err(SolverError::ValidationError(
                    "solver5 expected solver5 params after solver selection validation".into(),
                ));
            }
        }

        let (schedule, _family) = construct_schedule(
            problem.num_groups,
            problem.group_size,
            problem.num_weeks,
        )
        .ok_or_else(|| {
            SolverError::ValidationError(format!(
                "solver5 does not yet have a construction family for {}-{}-{}",
                problem.num_groups, problem.group_size, problem.num_weeks
            ))
        })?;

        build_solver_result(
            input,
            &problem,
            &schedule,
            self.configuration.seed.unwrap_or(DEFAULT_SOLVER5_SEED),
        )
    }
}
