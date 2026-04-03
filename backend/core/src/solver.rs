//! Backwards-compatible re-exports for the current solver-family internals.
//!
//! New internal code should prefer `gm_core::solver1` directly.

pub use crate::solver1::State;
pub use crate::solver_support::SolverError;
