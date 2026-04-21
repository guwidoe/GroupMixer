use crate::models::{
    ApiInput, SolverConfiguration, SolverParams, SolverResult, StopReason,
};
use crate::solver5::atoms::{
    query_construction_atom_from_solver6_input, Solver5AtomSpanRequest,
    Solver5ConstructionAtom,
};
use crate::solver_support::SolverError;

mod problem;
pub mod reporting;
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
use search::{
    run_configured_local_search, state::LocalSearchState, RepeatAwareLocalSearchOutcome,
};
use seed::mixed::{build_preferred_mixed_seed, MixedSeedSelection};

pub const SOLVER6_NOTES: &str =
    "Hybrid pure-SGP repeat-minimization solver family. Solver6 combines solver5 exact constructions with deterministic exact-block relabeling, explicit mixed-tail seed selection (dominant-prefix, requested-tail atom, heuristic tail), and deterministic best-improving same-week hill climbing by default for impossible pure-SGP cases, while still failing explicitly for unsupported seed families.";

#[derive(Debug, Clone)]
struct ExecutedSolver6Run {
    problem: PureSgpProblem,
    effective_seed: u64,
    active_penalty_model: crate::models::Solver6PairRepeatPenaltyModel,
    final_schedule: Vec<Vec<Vec<usize>>>,
    stop_reason: StopReason,
    exact_handoff_atom: Option<Solver5ConstructionAtom>,
    seed_selection: Option<MixedSeedSelection>,
    local_search_outcome: Option<RepeatAwareLocalSearchOutcome>,
}

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
        let executed = execute_solver6_run(input, &self.configuration)?;
        build_solver_result(
            input,
            &executed.problem,
            &executed.final_schedule,
            executed.effective_seed,
            executed.stop_reason,
        )
    }
}

fn execute_solver6_run(
    input: &ApiInput,
    configuration: &SolverConfiguration,
) -> Result<ExecutedSolver6Run, SolverError> {
    let problem = PureSgpProblem::from_input(input)?;
    let params = match &configuration.solver_params {
        SolverParams::Solver6(params) => params,
        _ => {
            return Err(SolverError::ValidationError(
                "solver6 expected solver6 params after solver selection validation".into(),
            ));
        }
    };

    let effective_seed = input.solver.seed.unwrap_or(42);
    if params.exact_construction_handoff_enabled {
        if let Ok(atom) = query_construction_atom_from_solver6_input(
            input,
            Solver5AtomSpanRequest::RequestedSpan,
        ) {
            return Ok(ExecutedSolver6Run {
                problem,
                effective_seed,
                active_penalty_model: params.pair_repeat_penalty_model,
                final_schedule: atom.schedule.clone(),
                stop_reason: StopReason::OptimalScoreReached,
                exact_handoff_atom: Some(atom),
                seed_selection: None,
                local_search_outcome: None,
            });
        }
    }

    let plan = ReservedExecutionPlan::from_params(params);
    if params.seed_strategy != Solver6SeedStrategy::Solver5ExactBlockComposition {
        return Err(SolverError::ValidationError(plan.reserved_message(
            problem.num_groups,
            problem.group_size,
            problem.num_weeks,
        )));
    }

    let selection = build_preferred_mixed_seed(input)?;
    let mut state = LocalSearchState::new(
        problem.clone(),
        selection.seed.schedule.clone(),
        params.pair_repeat_penalty_model,
    )?;
    let outcome = run_configured_local_search(
        &mut state,
        params.search_strategy,
        &configuration.stop_conditions,
        &problem,
        effective_seed,
    )?;

    Ok(ExecutedSolver6Run {
        problem,
        effective_seed,
        active_penalty_model: params.pair_repeat_penalty_model,
        final_schedule: outcome.best_schedule.clone(),
        stop_reason: outcome.stop_reason,
        exact_handoff_atom: None,
        seed_selection: Some(selection),
        local_search_outcome: Some(outcome),
    })
}
