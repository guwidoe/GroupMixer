//! Validation scaffolding for the `solver3` family.
//!
//! `invariants` checks structural consistency of the flat runtime state.
//! Drift checking (runtime vs oracle score) lives in `crate::solver3::oracle`.

pub mod invariants;

pub use invariants::validate_invariants;
