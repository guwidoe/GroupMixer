use crate::models::{
    BenchmarkEvent, BenchmarkObserver, ProgressCallback, Solver3LocalImproverMode, SolverResult,
    StopReason,
};
use crate::solver_support::SolverError;

use super::super::super::runtime_state::RuntimeState;
use super::super::context::{SearchProgressState, SearchRunContext};
use super::build_solver_result;
use super::default_loop::run_local_improver_default;
use super::general_loop::run_local_improver_general;

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct LocalImproverBudget {
    pub(crate) effective_seed: u64,
    pub(crate) max_iterations: u64,
    pub(crate) no_improvement_limit: Option<u64>,
    pub(crate) time_limit_seconds: Option<f64>,
    pub(crate) stop_on_optimal_score: bool,
    pub(crate) runtime_scaled_no_improvement_stop:
        Option<super::super::context::RuntimeScaledNoImprovementStopConfig>,
}

#[derive(Debug, Clone)]
pub(crate) struct LocalImproverRunResult {
    pub(crate) search: SearchProgressState,
    pub(crate) stop_reason: StopReason,
    pub(crate) search_seconds: f64,
}

#[derive(Clone, Copy)]
pub(super) struct LocalImproverHooks<'a> {
    pub(super) progress_callback: Option<&'a ProgressCallback>,
    pub(super) benchmark_observer: Option<&'a BenchmarkObserver>,
}

pub(crate) fn run(
    state: &mut RuntimeState,
    run_context: SearchRunContext,
    progress_callback: Option<&ProgressCallback>,
    benchmark_observer: Option<&BenchmarkObserver>,
) -> Result<SolverResult, SolverError> {
    let outcome = run_local_improver(
        state.clone(),
        &run_context,
        LocalImproverBudget {
            effective_seed: run_context.effective_seed,
            max_iterations: run_context.max_iterations,
            no_improvement_limit: run_context.no_improvement_limit,
            time_limit_seconds: run_context.time_limit_seconds,
            stop_on_optimal_score: run_context.stop_on_optimal_score,
            runtime_scaled_no_improvement_stop: run_context.runtime_scaled_no_improvement_stop,
        },
        LocalImproverHooks {
            progress_callback,
            benchmark_observer,
        },
        true,
    )?;

    let telemetry = outcome.search.to_benchmark_telemetry(
        &run_context,
        outcome.stop_reason,
        outcome.search_seconds,
    );

    if let Some(observer) = benchmark_observer {
        observer(&BenchmarkEvent::RunCompleted(telemetry.clone()));
    }

    *state = outcome.search.best_state.clone();
    build_solver_result(
        &outcome.search.best_state,
        outcome.search.no_improvement_count,
        run_context.effective_seed,
        run_context.move_policy,
        outcome.stop_reason,
        telemetry,
    )
}

pub(crate) fn polish_state(
    initial_state: RuntimeState,
    run_context: &SearchRunContext,
    budget: LocalImproverBudget,
) -> Result<LocalImproverRunResult, SolverError> {
    run_local_improver(
        initial_state,
        run_context,
        budget,
        LocalImproverHooks {
            progress_callback: None,
            benchmark_observer: None,
        },
        false,
    )
}

pub(super) fn run_local_improver(
    initial_state: RuntimeState,
    run_context: &SearchRunContext,
    budget: LocalImproverBudget,
    hooks: LocalImproverHooks<'_>,
    allow_diversification_burst: bool,
) -> Result<LocalImproverRunResult, SolverError> {
    if should_use_default_sampler_path(run_context) {
        run_local_improver_default(
            initial_state,
            run_context,
            budget,
            hooks,
            allow_diversification_burst,
        )
    } else {
        run_local_improver_general(
            initial_state,
            run_context,
            budget,
            hooks,
            allow_diversification_burst,
        )
    }
}

#[inline]
fn should_use_default_sampler_path(run_context: &SearchRunContext) -> bool {
    if run_context.local_improver_mode != Solver3LocalImproverMode::RecordToRecord {
        return false;
    }

    #[cfg(feature = "solver3-experimental-repeat-guidance")]
    if run_context.repeat_guided_swaps_enabled {
        return false;
    }

    true
}
