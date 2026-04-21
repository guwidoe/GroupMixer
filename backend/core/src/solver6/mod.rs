use crate::models::{
    ApiInput, SolverConfiguration, SolverParams, SolverResult,
};
use crate::solver5::atoms::{
    build_solver_result_from_atom_for_solver6_input, query_construction_atom_from_solver6_input,
    Solver5AtomSpanRequest,
};
use crate::solver_support::SolverError;

mod problem;
pub mod score;
mod scaffolding;

#[cfg(test)]
mod tests;

use problem::PureSgpProblem;
use scaffolding::ReservedExecutionPlan;

pub const SOLVER6_NOTES: &str =
    "Hybrid pure-SGP repeat-minimization solver family. Solver6 is intended to combine solver5 exact constructions with seeded overfull-horizon optimization for impossible pure-SGP cases. The current scaffold validates solver6 selection, hands exact requests through solver5, and reserves block-composition / relabeling / repeat-aware local-search phases explicitly.";

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
        let params = match &self.configuration.solver_params {
            SolverParams::Solver6(params) => params,
            _ => {
                return Err(SolverError::ValidationError(
                    "solver6 expected solver6 params after solver selection validation".into(),
                ));
            }
        };

        if params.exact_construction_handoff_enabled {
            if let Ok(result) = self.try_solver5_exact_handoff(input) {
                return Ok(result);
            }
        }

        let plan = ReservedExecutionPlan::from_params(params);
        Err(SolverError::ValidationError(plan.reserved_message(
            problem.num_groups,
            problem.group_size,
            problem.num_weeks,
        )))
    }

    fn try_solver5_exact_handoff(&self, input: &ApiInput) -> Result<SolverResult, SolverError> {
        let atom = query_construction_atom_from_solver6_input(
            input,
            Solver5AtomSpanRequest::RequestedSpan,
        )?;
        build_solver_result_from_atom_for_solver6_input(input, &atom)
    }
}
