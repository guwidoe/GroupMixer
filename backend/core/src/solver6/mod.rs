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
mod seed;

#[cfg(test)]
mod tests;

use problem::PureSgpProblem;
use scaffolding::ReservedExecutionPlan;
use seed::build_identity_exact_block_seed;
use crate::models::Solver6SeedStrategy;

pub const SOLVER6_NOTES: &str =
    "Hybrid pure-SGP repeat-minimization solver family. Solver6 is intended to combine solver5 exact constructions with seeded overfull-horizon optimization for impossible pure-SGP cases. The current implementation validates solver6 selection, hands exact requests through solver5, can synthesize deterministic identity exact-block seeds for divisible overfull pure-SGP cases, and still reserves relabeling / repeat-aware local search explicitly.";

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
        if params.seed_strategy == Solver6SeedStrategy::Solver5ExactBlockComposition {
            let seed = build_identity_exact_block_seed(input)?;
            return Err(SolverError::ValidationError(
                plan.reserved_message_after_seed(
                    problem.num_groups,
                    problem.group_size,
                    problem.num_weeks,
                    &seed.diagnostics.concise_summary(),
                ),
            ));
        }

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
