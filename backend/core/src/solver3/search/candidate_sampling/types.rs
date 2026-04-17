#[cfg(not(target_arch = "wasm32"))]
use std::time::Instant;

#[cfg(target_arch = "wasm32")]
use js_sys;

use crate::models::MoveFamily;

use super::super::super::moves::{
    CliqueSwapRuntimePreview, PairContactUpdate, SwapRuntimePreview, TransferRuntimePreview,
};
#[cfg(feature = "solver3-experimental-repeat-guidance")]
use super::super::repeat_guidance::RepeatGuidanceState;
#[cfg(feature = "solver3-experimental-conflict-restricted-sampling")]
use super::super::sgp_conflicts::SgpConflictState;
use super::super::tabu::SgpWeekPairTabuState;

pub(super) const MAX_RANDOM_CANDIDATE_ATTEMPTS: usize = 24;
pub(super) const MAX_RANDOM_TARGET_ATTEMPTS: usize = 24;

#[cfg(not(target_arch = "wasm32"))]
pub(super) fn get_current_time() -> Instant {
    Instant::now()
}

#[cfg(target_arch = "wasm32")]
pub(super) fn get_current_time() -> f64 {
    js_sys::Date::now()
}

#[cfg(not(target_arch = "wasm32"))]
pub(super) fn get_elapsed_seconds_between(start: Instant, end: Instant) -> f64 {
    end.duration_since(start).as_secs_f64()
}

#[cfg(target_arch = "wasm32")]
pub(super) fn get_elapsed_seconds_between(start: f64, end: f64) -> f64 {
    (end - start) / 1000.0
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) enum SearchMovePreview {
    Swap(SwapRuntimePreview),
    Transfer(TransferRuntimePreview),
    CliqueSwap(CliqueSwapRuntimePreview),
}

impl SearchMovePreview {
    #[inline]
    pub(crate) fn delta_score(&self) -> f64 {
        match self {
            Self::Swap(preview) => preview.delta_score,
            Self::Transfer(preview) => preview.delta_score,
            Self::CliqueSwap(preview) => preview.delta_score,
        }
    }

    pub(crate) fn session_idx(&self) -> usize {
        match self {
            Self::Swap(preview) => preview.analysis.swap.session_idx,
            Self::Transfer(preview) => preview.analysis.transfer.session_idx,
            Self::CliqueSwap(preview) => preview.analysis.clique_swap.session_idx,
        }
    }

    #[inline]
    pub(crate) fn pair_contact_updates(&self) -> &[PairContactUpdate] {
        match self {
            Self::Swap(preview) => &preview.patch.pair_contact_updates,
            Self::Transfer(preview) => &preview.patch.pair_contact_updates,
            Self::CliqueSwap(preview) => &preview.patch.pair_contact_updates,
        }
    }

    #[cfg(feature = "solver3-oracle-checks")]
    pub(crate) fn describe(&self) -> String {
        match self {
            Self::Swap(preview) => format!("swap {:?}", preview.analysis.swap),
            Self::Transfer(preview) => format!("transfer {:?}", preview.analysis.transfer),
            Self::CliqueSwap(preview) => {
                format!("clique_swap {:?}", preview.analysis.clique_swap)
            }
        }
    }
}

#[derive(Debug, Default, Clone, Copy)]
pub(crate) struct CandidateSampler;

#[cfg(test)]
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct CandidateSelectionTimingBreakdown {
    pub(crate) selection: Option<(MoveFamily, SearchMovePreview, f64)>,
    pub(crate) proposal_seconds: f64,
    pub(crate) preview_kernel_seconds: f64,
}

#[cfg(test)]
#[derive(Debug, Default, Clone, Copy, PartialEq)]
pub(super) struct FamilyPreviewTimingBreakdown {
    pub(super) preview_kernel_seconds: f64,
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub(crate) struct RepeatGuidedSwapSamplingDelta {
    pub(crate) guided_attempts: u64,
    pub(crate) guided_successes: u64,
    pub(crate) guided_fallback_to_random: u64,
    pub(crate) guided_previewed_candidates: u64,
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub(crate) struct TabuSwapSamplingDelta {
    pub(crate) raw_tabu_hits: u64,
    pub(crate) prefilter_skips: u64,
    pub(crate) retry_exhaustions: u64,
    pub(crate) hard_blocks: u64,
    pub(crate) aspiration_preview_surfaces: u64,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct CandidateSelectionResult {
    pub(crate) selection: Option<(MoveFamily, SearchMovePreview, f64)>,
    pub(crate) repeat_guided_swap_sampling: RepeatGuidedSwapSamplingDelta,
    pub(crate) tabu_swap_sampling: TabuSwapSamplingDelta,
}

#[derive(Debug, Clone, PartialEq)]
pub(super) struct GuidedSwapSamplingPreviewResult {
    pub(super) preview: Option<SwapRuntimePreview>,
    pub(super) previewed_candidates: u64,
    pub(super) tabu_sampling: TabuSwapSamplingDelta,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct SwapSamplingOptions<'a> {
    #[cfg(feature = "solver3-experimental-repeat-guidance")]
    pub(crate) repeat_guidance: Option<&'a RepeatGuidanceState>,
    #[cfg(feature = "solver3-experimental-conflict-restricted-sampling")]
    pub(crate) sgp_conflicts: Option<&'a SgpConflictState>,
    #[cfg(feature = "solver3-experimental-repeat-guidance")]
    pub(crate) repeat_guided_swap_probability: f64,
    #[cfg(feature = "solver3-experimental-repeat-guidance")]
    pub(crate) repeat_guided_swap_candidate_preview_budget: usize,
    pub(crate) tabu: Option<&'a SgpWeekPairTabuState>,
    pub(crate) tabu_retry_cap: usize,
    pub(crate) tabu_allow_aspiration_preview: bool,
    pub(crate) current_iteration: u64,
}

impl Default for SwapSamplingOptions<'_> {
    fn default() -> Self {
        Self {
            #[cfg(feature = "solver3-experimental-repeat-guidance")]
            repeat_guidance: None,
            #[cfg(feature = "solver3-experimental-conflict-restricted-sampling")]
            sgp_conflicts: None,
            #[cfg(feature = "solver3-experimental-repeat-guidance")]
            repeat_guided_swap_probability: 0.0,
            #[cfg(feature = "solver3-experimental-repeat-guidance")]
            repeat_guided_swap_candidate_preview_budget: 0,
            tabu: None,
            tabu_retry_cap: 0,
            tabu_allow_aspiration_preview: false,
            current_iteration: 0,
        }
    }
}
