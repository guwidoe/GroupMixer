//! Internal `solver3` solver family — Phase 2: dense-state foundation.
//!
//! `solver3` is a performance-oriented solver family with:
//! - an immutable dense compiled problem with a packed upper-triangular pair index
//! - a flat runtime state (`Vec`-based, no `HashMap` in hot paths)
//! - a permanent recompute oracle for scoring truth and drift validation
//! - baseline invariant and drift validation helpers
//!
//! Phase 2 provides the compiled problem, runtime state, oracle, and validation
//! surface. Search paths (Phase 3+) and move kernels are not yet implemented.
//! Calling them returns an explicit error. There is no hidden fallback to `solver1`
//! or `solver2`.
//!
//! See `backend/core/src/solver3/IMPLEMENTATION_PLAN.md` for the full design and
//! phased execution plan.

pub mod compiled_problem;
pub mod oracle;
pub mod runtime_state;
pub mod scoring;
pub mod validation;

#[cfg(test)]
mod tests;

pub use compiled_problem::CompiledProblem;
pub use oracle::{check_drift, oracle_score};
pub use runtime_state::RuntimeState;
pub use scoring::{recompute_oracle_score, OracleSnapshot};
pub use validation::validate_invariants;

use crate::solver_support::SolverError;

pub const SOLVER3_BOOTSTRAP_NOTES: &str =
    "Internal `solver3` family — performance-oriented dense-state solver with packed-pair index. \
Phase 2 foundation: compiled problem, flat runtime state, oracle, and invariant validation are \
implemented. Solve paths, search, and move kernels are not yet implemented. No fallback to \
solver1 or solver2 occurs.";

pub(crate) fn not_yet_implemented(feature: &str) -> SolverError {
    SolverError::ValidationError(format!(
        "solver family 'solver3' is registered, but {feature} is not implemented yet"
    ))
}
