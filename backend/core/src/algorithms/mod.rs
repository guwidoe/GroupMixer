//! Backwards-compatible re-exports for the current solver-family search module.
//!
//! New internal code should prefer `gm_core::solver1::search` directly.

pub mod simulated_annealing {
    pub use crate::solver1::search::simulated_annealing::SimulatedAnnealing;
}

pub use crate::solver1::search::Solver;
