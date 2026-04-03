//! Bootstrap skeleton for the `solver2` solver family.
//!
//! This module intentionally provides explicit structure without silently routing work back into
//! `solver1`. The dedicated directory, typed problem/state boundary, and search/validation seams
//! now exist, but execution is still intentionally unsupported until implementation lands.

pub mod affected_region;
pub mod compiled_problem;
pub mod move_types;
pub mod moves;
pub mod scoring;
pub mod search;
pub mod state;
pub mod validation;

#[cfg(test)]
mod tests;

pub use compiled_problem::CompiledProblem;
pub use search::SearchEngine;
pub use state::SolutionState;

use crate::solver_support::SolverError;

pub const SOLVER2_BOOTSTRAP_NOTES: &str =
    "Internal `solver2` family with explicit compiled-problem/state seams, correctness-first move kernels, and a minimal runnable search baseline. Solve paths now run through `gm-core`; runtime-aware recommendation remains intentionally unsupported during bring-up.";

pub(crate) fn not_yet_implemented(feature: &str) -> SolverError {
    SolverError::ValidationError(format!(
        "solver family 'solver2' is registered, but {feature} is not implemented yet"
    ))
}
