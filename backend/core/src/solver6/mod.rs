use crate::models::{
    ApiInput, Solver5Params, SolverConfiguration, SolverKind, SolverParams, SolverResult,
};
use crate::solver5::SearchEngine as Solver5SearchEngine;
use crate::solver_support::SolverError;

mod problem;
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
        let mut solver5_input = input.clone();
        solver5_input.solver = solver5_configuration_from_solver6(&self.configuration);
        Solver5SearchEngine::new(&solver5_input.solver).solve(&solver5_input)
    }
}

fn solver5_configuration_from_solver6(configuration: &SolverConfiguration) -> SolverConfiguration {
    let mut bridged = configuration.clone();
    bridged.solver_type = SolverKind::Solver5.canonical_id().into();
    bridged.solver_params = SolverParams::Solver5(Solver5Params::default());
    bridged
}
