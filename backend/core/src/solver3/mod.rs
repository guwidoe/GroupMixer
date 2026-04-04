//! Internal `solver3` solver family — Phase 2: dense-state foundation.
//!
//! `solver3` is a performance-oriented solver family with:
//! - an immutable dense compiled problem with a packed upper-triangular pair index
//! - a flat runtime state (`Vec`-based, no `HashMap` in hot paths)
//! - a permanent recompute oracle for scoring truth and drift validation
//! - baseline invariant and drift validation helpers
//!
//! Phase 2 provides the compiled problem, runtime state, oracle, and validation
//! surface. Phase S3-3 now adds a swap move kernel (typed move + runtime preview/
//! apply patch path + oracle equivalence hooks). Search paths and non-swap move
//! families are still not implemented. Calling solver3 solve paths returns explicit
//! errors. There is no hidden fallback to `solver1` or `solver2`.
//!
//! See `backend/core/src/solver3/IMPLEMENTATION_PLAN.md` for the full design and
//! phased execution plan.

pub mod compiled_problem;
pub mod moves;
pub mod oracle;
pub mod runtime_state;
pub mod scoring;
pub mod search;
pub mod validation;

#[cfg(test)]
mod tests;

pub use compiled_problem::CompiledProblem;
pub use moves::SwapMove;
pub use oracle::{check_drift, oracle_score};
pub use runtime_state::RuntimeState;
pub use scoring::{recompute_oracle_score, OracleSnapshot};
pub use search::SearchEngine;
pub use validation::validate_invariants;

use crate::solver_support::SolverError;

pub const SOLVER3_BOOTSTRAP_NOTES: &str =
    "Internal `solver3` family — performance-oriented dense-state solver with packed-pair index. \
Phase 2 foundation (compiled problem, flat runtime state, oracle, invariants) is implemented, and \
a swap-only move kernel plus a runnable swap-only bounded-sampling search baseline exist. Transfer \
and clique-swap families are still not implemented. No fallback to solver1 or solver2 occurs.";

pub(crate) fn not_yet_implemented(feature: &str) -> SolverError {
    SolverError::ValidationError(format!(
        "solver family 'solver3' is registered, but {feature} is not implemented yet"
    ))
}
