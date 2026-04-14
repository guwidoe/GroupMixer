//! Search baseline for `solver3`.

mod acceptance;
#[cfg(feature = "solver3-experimental-recombination")]
mod archive;
mod candidate_sampling;
mod context;
mod engine;
mod family_selection;
#[cfg(feature = "solver3-experimental-memetic")]
mod memetic;
#[cfg(not(feature = "solver3-experimental-memetic"))]
mod memetic {
    use crate::models::{BenchmarkObserver, ProgressCallback, SolverResult};
    use crate::solver_support::SolverError;

    use super::super::runtime_state::RuntimeState;
    use super::context::SearchRunContext;

    pub(super) fn run(
        _state: &mut RuntimeState,
        _run_context: SearchRunContext,
        _progress_callback: Option<&ProgressCallback>,
        _benchmark_observer: Option<&BenchmarkObserver>,
    ) -> Result<SolverResult, SolverError> {
        Err(SolverError::ValidationError(
            "solver3 search_driver.steady_state_memetic requires the gm-core Cargo feature solver3-experimental-memetic"
                .into(),
        ))
    }
}
#[cfg(feature = "solver3-experimental-recombination")]
mod path_relinking;
#[cfg(not(feature = "solver3-experimental-recombination"))]
mod path_relinking {
    use crate::models::{BenchmarkObserver, ProgressCallback, SolverResult};
    use crate::solver_support::SolverError;

    use super::super::runtime_state::RuntimeState;
    use super::context::SearchRunContext;

    pub(super) const MAX_EXACT_ALIGNMENT_SESSIONS: usize = 20;

    pub(super) fn run(
        _state: &mut RuntimeState,
        _run_context: SearchRunContext,
        _progress_callback: Option<&ProgressCallback>,
        _benchmark_observer: Option<&BenchmarkObserver>,
    ) -> Result<SolverResult, SolverError> {
        Err(SolverError::ValidationError(
            "solver3 search_driver.session_aligned_path_relinking requires the gm-core Cargo feature solver3-experimental-recombination"
                .into(),
        ))
    }

    pub(super) fn run_multi_root_balanced_session_inheritance(
        _state: &mut RuntimeState,
        _run_context: SearchRunContext,
        _progress_callback: Option<&ProgressCallback>,
        _benchmark_observer: Option<&BenchmarkObserver>,
    ) -> Result<SolverResult, SolverError> {
        Err(SolverError::ValidationError(
            "solver3 search_driver.multi_root_balanced_session_inheritance requires the gm-core Cargo feature solver3-experimental-recombination"
                .into(),
        ))
    }
}
#[cfg(feature = "solver3-experimental-recombination")]
mod recombination;
#[cfg(not(feature = "solver3-experimental-recombination"))]
mod recombination {
    use crate::models::{BenchmarkObserver, ProgressCallback, SolverResult};
    use crate::solver_support::SolverError;

    use super::super::runtime_state::RuntimeState;
    use super::context::SearchRunContext;

    pub(super) fn run(
        _state: &mut RuntimeState,
        _run_context: SearchRunContext,
        _progress_callback: Option<&ProgressCallback>,
        _benchmark_observer: Option<&BenchmarkObserver>,
    ) -> Result<SolverResult, SolverError> {
        Err(SolverError::ValidationError(
            "solver3 search_driver.donor_session_transplant requires the gm-core Cargo feature solver3-experimental-recombination"
                .into(),
        ))
    }
}
mod repeat_guidance;
mod sgp_conflicts;
mod single_state;
mod tabu;

#[cfg(test)]
mod tests;

pub use engine::SearchEngine;
