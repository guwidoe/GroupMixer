//! Freedom-aware construction heuristic facade.
//!
//! The implementation currently shares lower-level state and helper functions with the
//! baseline constructor module; this facade gives the heuristic its own module boundary
//! while preserving the existing public construction API.

pub(crate) use super::baseline::{
    apply_freedom_aware_construction_heuristic, FreedomAwareConstructionParams,
};
