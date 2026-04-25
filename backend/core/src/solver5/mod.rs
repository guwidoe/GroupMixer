use crate::models::{ApiInput, SolverConfiguration, SolverResult};
use crate::solver_support::SolverError;

pub mod atoms;
mod catalog;
mod composition;
mod families;
mod field;
mod handoff;
mod heuristics;
mod portfolio;
mod problem;
pub mod reporting;
mod result;
mod router;
mod types;

#[cfg(test)]
mod tests;

use handoff::{NoSearchHandoffPolicy, SearchHandoffDecision, SearchHandoffPolicy};
use heuristics::NoopHeuristicPipeline;
use problem::PureSgpProblem;
use result::build_solver_result;
use router::attempt_construction;

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

        let routing = attempt_construction(&problem).map_err(|failure| {
            SolverError::ValidationError(failure.to_solver_error_message(&problem))
        })?;
        let construction = NoopHeuristicPipeline.apply(&problem, routing.result);
        let construction = match NoSearchHandoffPolicy.decide(&problem, construction) {
            SearchHandoffDecision::ConstructionOnly { result, .. } => result,
            SearchHandoffDecision::SearchPreferred { .. } => {
                return Err(SolverError::ValidationError(
                    "solver5 search handoff is not enabled; construction-only mode remains authoritative"
                        .into(),
                ));
            }
        };

        build_solver_result(
            input,
            &problem,
            &construction.schedule,
            self.configuration.seed.unwrap_or(DEFAULT_SOLVER5_SEED),
        )
    }
}
