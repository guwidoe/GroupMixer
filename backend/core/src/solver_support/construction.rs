//! Shared construction helpers for solver-family bootstrapping.
//!
//! Construction heuristics live in one subdirectory per heuristic. This facade preserves
//! the existing shared API while making ownership and future heuristic work explicit.

pub(crate) mod baseline;
pub(crate) mod constraint_scenario_oracle;
pub(crate) mod freedom_aware;

pub(crate) use baseline::{
    apply_baseline_construction_heuristic, apply_construction_seed_schedule,
    BaselineConstructionContext,
};
pub(crate) use freedom_aware::{
    apply_freedom_aware_construction_heuristic, FreedomAwareConstructionParams,
};
