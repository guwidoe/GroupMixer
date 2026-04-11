//! Internal `solver3` solver family — Phase 2: dense-state foundation.
//!
//! `solver3` is a performance-oriented solver family with:
//! - an immutable dense compiled problem with a packed upper-triangular pair index
//! - a flat runtime state (`Vec`-based, no `HashMap` in hot paths)
//! - a permanent recompute oracle for scoring truth and drift validation
//! - baseline invariant and drift validation helpers
//!
//! Phase 2 provides the compiled problem, runtime state, oracle, and validation
//! surface. Phase S3-3/S3-6 add swap + transfer + clique-swap move kernels (typed
//! moves + runtime preview/apply patch paths + oracle equivalence hooks). Search
//! paths support all three move families. There is no hidden fallback to `solver1`
//! or `solver2`.
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
pub use moves::{CliqueSwapMove, SwapMove, TransferMove};
pub use oracle::{check_drift, oracle_score};
pub use runtime_state::RuntimeState;
pub use scoring::{recompute_oracle_score, OracleSnapshot};
pub use search::SearchEngine;
pub use validation::validate_invariants;

use crate::solver_support::SolverError;

pub const SOLVER3_BOOTSTRAP_NOTES: &str =
    "Solver 3 is an advanced dense-state solver family focused on fast search. Supports recommended runtime mode, \
manual tuning, and optional correctness checks for debugging and validation. For normal runs, leave \
correctness checks off.";

pub(crate) fn not_yet_implemented(feature: &str) -> SolverError {
    SolverError::ValidationError(format!(
        "solver family 'solver3' is registered, but {feature} is not implemented yet"
    ))
}
