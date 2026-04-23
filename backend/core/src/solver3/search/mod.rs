//! Search baseline for `solver3`.

mod acceptance;
mod candidate_sampling;
mod context;
mod engine;
mod family_selection;
mod repeat_guidance;
mod single_state;
mod tabu;

#[cfg(feature = "solver3-experimental-recombination")]
mod archive;
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
#[cfg(feature = "solver3-experimental-conflict-restricted-sampling")]
mod sgp_conflicts;
#[cfg(not(feature = "solver3-experimental-conflict-restricted-sampling"))]
mod sgp_conflicts {
    use super::super::moves::PairContactUpdate;
    use super::super::runtime_state::RuntimeState;

    #[derive(Debug, Clone, PartialEq, Eq, Default)]
    pub(crate) struct SgpConflictState;

    impl SgpConflictState {
        pub(crate) fn build_from_state(
            _state: &RuntimeState,
            _allowed_sessions: &[usize],
        ) -> Option<Self> {
            None
        }

        #[inline]
        pub(crate) fn has_active_conflicts(&self) -> bool {
            false
        }

        pub(crate) fn refresh_after_move(
            &mut self,
            _state: &RuntimeState,
            _allowed_sessions: &[usize],
            _touched_session_idx: usize,
            _pair_contact_updates: &[PairContactUpdate],
        ) {
        }

        #[cfg(test)]
        pub(crate) fn conflicted_people_in_session(&self, _session_idx: usize) -> &[usize] {
            &[]
        }
    }
}

#[cfg(test)]
mod tests;

pub use engine::SearchEngine;
