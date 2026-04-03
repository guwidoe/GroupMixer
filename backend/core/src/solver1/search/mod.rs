//! Search implementations for the `solver1` solver family.
//!
//! This trait and module tree are solver-family-specific. Shared engine registry and
//! public selection logic live outside `solver1/`.

use crate::models::{BenchmarkObserver, ProgressCallback, SolverResult};
use crate::solver1::State;
use crate::solver_support::SolverError;

pub mod simulated_annealing;

/// A trait implemented by `solver1` search strategies.
pub trait Solver {
    fn solve(
        &self,
        state: &mut State,
        progress_callback: Option<&ProgressCallback>,
        benchmark_observer: Option<&BenchmarkObserver>,
    ) -> Result<SolverResult, SolverError>;
}
