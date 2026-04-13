use rand::{rng, RngExt};

use crate::models::{
    BenchmarkObserver, ProgressCallback, Solver3LocalImproverMode, Solver3SearchDriverMode,
    SolverConfiguration, SolverResult,
};
use crate::solver_support::SolverError;

use super::super::runtime_state::RuntimeState;
use super::context::SearchRunContext;
use super::single_state;

#[derive(Debug, Clone)]
pub struct SearchEngine {
    configuration: SolverConfiguration,
}

impl SearchEngine {
    pub fn new(configuration: &SolverConfiguration) -> Self {
        Self {
            configuration: configuration.clone(),
        }
    }

    pub fn solve(
        &self,
        state: &mut RuntimeState,
        progress_callback: Option<&ProgressCallback>,
        benchmark_observer: Option<&BenchmarkObserver>,
    ) -> Result<SolverResult, SolverError> {
        let effective_seed = self.configuration.seed.unwrap_or_else(|| rng().random::<u64>());
        let run_context =
            SearchRunContext::from_solver(&self.configuration, state, effective_seed)?;

        match (
            run_context.search_driver_mode,
            run_context.local_improver_mode,
        ) {
            (
                Solver3SearchDriverMode::SingleState,
                Solver3LocalImproverMode::RecordToRecord,
            )
            | (
                Solver3SearchDriverMode::SingleState,
                Solver3LocalImproverMode::SgpWeekPairTabu,
            ) => single_state::run(state, run_context, progress_callback, benchmark_observer),
            (search_driver_mode, local_improver_mode) => Err(SolverError::ValidationError(
                format!(
                    "solver3 search mode dispatch reached unsupported combination {:?} + {:?}",
                    search_driver_mode, local_improver_mode
                ),
            )),
        }
    }
}
