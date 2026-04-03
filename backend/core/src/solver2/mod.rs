//! Internal `solver2` solver family.
//!
//! `solver2` now has two internal roles:
//!
//! - an oracle/reference path built around full recomputation and strong validation
//! - a runtime path used by the search engine, with room for performance-oriented specialization
//!
//! Both paths stay inside the same solver family so benchmarks, parity checks, and observable
//! semantics remain aligned.

pub mod affected_region;
pub mod compiled_problem;
pub mod move_types;
pub mod moves;
pub mod runtime_state;
pub mod scoring;
pub mod search;
pub mod state;
pub mod validation;

#[cfg(test)]
mod tests;

pub use compiled_problem::CompiledProblem;
pub use runtime_state::RuntimeSolutionState;
pub use search::SearchEngine;
pub use state::SolutionState;

use crate::solver_support::SolverError;

pub const SOLVER2_BOOTSTRAP_NOTES: &str =
    "Internal `solver2` family with explicit compiled-problem/state seams, a retained recompute oracle, and an emerging runtime path for performance-oriented search work. Solve paths run through `gm-core`; runtime-aware recommendation remains intentionally unsupported during bring-up.";

pub(crate) fn not_yet_implemented(feature: &str) -> SolverError {
    SolverError::ValidationError(format!(
        "solver family 'solver2' is registered, but {feature} is not implemented yet"
    ))
}
