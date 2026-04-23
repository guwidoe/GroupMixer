#[cfg(not(target_arch = "wasm32"))]
use std::time::Instant;

#[cfg(target_arch = "wasm32")]
use js_sys;

use crate::models::{DonorCandidatePoolTelemetry, DonorSessionViabilityTierTelemetry};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct DonorSessionChoice {
    pub(crate) donor_archive_idx: usize,
    pub(crate) session_idx: usize,
    pub(crate) session_disagreement_count: usize,
    pub(crate) candidate_pool: DonorCandidatePool,
    pub(crate) session_viability_tier: DonorSessionViabilityTier,
    pub(crate) conflict_burden_delta: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum DonorCandidatePool {
    CompetitiveHalf,
    FullArchive,
}

impl DonorCandidatePool {
    pub(super) fn telemetry(self) -> DonorCandidatePoolTelemetry {
        match self {
            Self::CompetitiveHalf => DonorCandidatePoolTelemetry::CompetitiveHalf,
            Self::FullArchive => DonorCandidatePoolTelemetry::FullArchive,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum DonorSessionViabilityTier {
    StrictImproving,
    NonWorsening,
    AnyDiffering,
}

impl DonorSessionViabilityTier {
    pub(super) fn telemetry(self) -> DonorSessionViabilityTierTelemetry {
        match self {
            Self::StrictImproving => DonorSessionViabilityTierTelemetry::StrictImproving,
            Self::NonWorsening => DonorSessionViabilityTierTelemetry::NonWorsening,
            Self::AnyDiffering => DonorSessionViabilityTierTelemetry::AnyDiffering,
        }
    }

    pub(super) fn allows(self, conflict_burden_delta: i64) -> bool {
        match self {
            Self::StrictImproving => conflict_burden_delta > 0,
            Self::NonWorsening => conflict_burden_delta >= 0,
            Self::AnyDiffering => true,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum DonorSessionSelectionOutcome {
    Selected(DonorSessionChoice),
    NoViableDonor,
    NoViableSession,
}

#[cfg(not(target_arch = "wasm32"))]
pub(super) type TimePoint = Instant;

#[cfg(target_arch = "wasm32")]
pub(super) type TimePoint = f64;

#[cfg(not(target_arch = "wasm32"))]
pub(super) fn get_current_time() -> Instant {
    Instant::now()
}

#[cfg(target_arch = "wasm32")]
pub(super) fn get_current_time() -> f64 {
    js_sys::Date::now()
}

#[cfg(not(target_arch = "wasm32"))]
pub(super) fn get_elapsed_seconds(start: Instant) -> f64 {
    start.elapsed().as_secs_f64()
}

#[cfg(target_arch = "wasm32")]
pub(super) fn get_elapsed_seconds(start: f64) -> f64 {
    (js_sys::Date::now() - start) / 1000.0
}

#[cfg(not(target_arch = "wasm32"))]
pub(super) fn get_elapsed_seconds_between(start: Instant, end: Instant) -> f64 {
    end.duration_since(start).as_secs_f64()
}

#[cfg(target_arch = "wasm32")]
pub(super) fn get_elapsed_seconds_between(start: f64, end: f64) -> f64 {
    (end - start) / 1000.0
}

#[inline]
pub(super) fn time_limit_exceeded(elapsed_seconds: f64, time_limit_seconds: Option<f64>) -> bool {
    time_limit_seconds.is_some_and(|limit| elapsed_seconds >= limit)
}
