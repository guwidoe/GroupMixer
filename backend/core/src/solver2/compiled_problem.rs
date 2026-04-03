use crate::models::{ApiInput, Constraint, Objective, ProblemDefinition, SolverKind};
use crate::solver_support::SolverError;

/// Immutable compiled representation of the problem for the `solver2` family.
#[derive(Debug, Clone)]
pub struct CompiledProblem {
    pub problem: ProblemDefinition,
    pub objectives: Vec<Objective>,
    pub constraints: Vec<Constraint>,
    pub solver_kind: SolverKind,
}

impl CompiledProblem {
    /// Builds the immutable `solver2` problem boundary from a normal API input.
    pub fn compile(input: &ApiInput) -> Result<Self, SolverError> {
        let solver_kind = input
            .solver
            .validate_solver_selection()
            .map_err(SolverError::ValidationError)?;

        if solver_kind != SolverKind::Solver2 {
            return Err(SolverError::ValidationError(format!(
                "solver2::CompiledProblem expected solver family 'solver2', got '{}'",
                solver_kind.canonical_id()
            )));
        }

        Ok(Self {
            problem: input.problem.clone(),
            objectives: input.objectives.clone(),
            constraints: input.constraints.clone(),
            solver_kind,
        })
    }
}
