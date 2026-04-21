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
mod result;
mod scaffolding;
mod search;
mod seed;

#[cfg(test)]
mod tests;

use crate::models::Solver6SeedStrategy;
use problem::PureSgpProblem;
use result::build_solver_result;
use scaffolding::ReservedExecutionPlan;
use search::{run_repeat_aware_local_search, state::LocalSearchState, RepeatAwareLocalSearchConfig};
use seed::mixed::build_preferred_mixed_seed;

pub const SOLVER6_NOTES: &str =
    "Hybrid pure-SGP repeat-minimization solver family. Solver6 combines solver5 exact constructions with deterministic exact-block relabeling, explicit mixed-tail seed selection (dominant-prefix, requested-tail atom, heuristic tail), and repeat-aware same-week local search for impossible pure-SGP cases, while still failing explicitly for unsupported seed families.";

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
            let selection = build_preferred_mixed_seed(input)?;
            let effective_seed = input.solver.seed.unwrap_or(42);
            let mut state = LocalSearchState::new(
                problem.clone(),
                selection.seed.schedule,
                params.pair_repeat_penalty_model,
            )?;
            let outcome = run_repeat_aware_local_search(
                &mut state,
                RepeatAwareLocalSearchConfig::for_solver_configuration(
                    &self.configuration.stop_conditions,
                    &problem,
                    effective_seed,
                ),
            )?;
            return build_solver_result(
                input,
                &problem,
                &outcome.best_schedule,
                effective_seed,
                outcome.stop_reason,
            );
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
