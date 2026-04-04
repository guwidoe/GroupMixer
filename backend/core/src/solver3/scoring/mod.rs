//! Scoring scaffolding for the `solver3` family.
//!
//! `recompute` is the permanent oracle path — correctness-first, separately named,
//! and the only source of scoring truth during Phase 2.
//!
//! Incremental delta scoring (for move previews) will live alongside `recompute`
//! once Phase 3 swap kernels land.

pub mod recompute;

pub use recompute::{recompute_oracle_score, OracleSnapshot};
