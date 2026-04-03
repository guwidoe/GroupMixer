use crate::models::ApiInput;
use crate::solver_support::SolverError;

use super::compiled_problem::CompiledProblem;

/// Mutable schedule/cache boundary for the bootstrapped `solver2` family.
#[derive(Debug, Clone)]
pub struct SolutionState {
    pub compiled_problem: CompiledProblem,
    pub initial_schedule: Option<ApiInputInitialSchedule>,
}

pub type ApiInputInitialSchedule =
    std::collections::HashMap<String, std::collections::HashMap<String, Vec<String>>>;

impl SolutionState {
    pub fn from_input(input: &ApiInput) -> Result<Self, SolverError> {
        let compiled_problem = CompiledProblem::compile(input)?;
        Ok(Self {
            compiled_problem,
            initial_schedule: input.initial_schedule.clone(),
        })
    }
}
