use rand::{rng, RngExt};

use crate::models::{
    BenchmarkObserver, ProgressCallback, Solver3LocalImproverMode, Solver3SearchDriverMode,
    SolverConfiguration, SolverResult,
};
use crate::solver_support::SolverError;

use super::super::runtime_state::RuntimeState;
use super::context::SearchRunContext;
use super::{memetic, path_relinking, recombination, single_state};

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
            (
                Solver3SearchDriverMode::SteadyStateMemetic,
                Solver3LocalImproverMode::RecordToRecord,
            )
            | (
                Solver3SearchDriverMode::SteadyStateMemetic,
                Solver3LocalImproverMode::SgpWeekPairTabu,
            ) => memetic::run(state, run_context, progress_callback, benchmark_observer),
            (
                Solver3SearchDriverMode::DonorSessionTransplant,
                Solver3LocalImproverMode::RecordToRecord,
            )
            | (
                Solver3SearchDriverMode::DonorSessionTransplant,
                Solver3LocalImproverMode::SgpWeekPairTabu,
            ) => recombination::run(state, run_context, progress_callback, benchmark_observer),
            (
                Solver3SearchDriverMode::SessionAlignedPathRelinking,
                Solver3LocalImproverMode::RecordToRecord,
            )
            | (
                Solver3SearchDriverMode::SessionAlignedPathRelinking,
                Solver3LocalImproverMode::SgpWeekPairTabu,
            ) => path_relinking::run(state, run_context, progress_callback, benchmark_observer),
            (
                Solver3SearchDriverMode::MultiRootBalancedSessionInheritance,
                Solver3LocalImproverMode::RecordToRecord,
            )
            | (
                Solver3SearchDriverMode::MultiRootBalancedSessionInheritance,
                Solver3LocalImproverMode::SgpWeekPairTabu,
            ) => path_relinking::run_multi_root_balanced_session_inheritance(
                state,
                run_context,
                progress_callback,
                benchmark_observer,
            ),
        }
    }
}
