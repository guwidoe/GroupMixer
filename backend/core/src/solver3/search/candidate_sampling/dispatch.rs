use rand_chacha::ChaCha12Rng;

use crate::models::MoveFamily;

#[cfg(test)]
use super::super::super::moves::{
    preview_clique_swap_runtime_checked, preview_swap_runtime_trusted,
    preview_transfer_runtime_checked, CliqueSwapMove, CliqueSwapRuntimePreview, SwapMove,
    SwapRuntimePreview, TransferMove, TransferRuntimePreview,
};
use super::super::super::runtime_state::RuntimeState;
use super::super::family_selection::MoveFamilySelector;
use super::{
    get_current_time, get_elapsed_seconds_between, CandidateSampler, CandidateSelectionResult,
    RepeatGuidedSwapSamplingDelta, SearchMovePreview, SwapSamplingOptions, TabuSwapSamplingDelta,
};
#[cfg(test)]
use super::{
    runtime_active_clique_in_single_group, runtime_pick_clique_targets,
    runtime_pick_swappable_person_from_group, runtime_session_can_clique_swap,
    runtime_session_can_swap, runtime_session_can_transfer, runtime_transfer_source_group,
    runtime_transfer_target_has_capacity, CandidateSelectionTimingBreakdown,
    FamilyPreviewTimingBreakdown, MAX_RANDOM_CANDIDATE_ATTEMPTS, MAX_RANDOM_TARGET_ATTEMPTS,
};
#[cfg(test)]
use rand::RngExt;

impl CandidateSampler {
    #[inline]
    pub(crate) fn select_previewed_move_default(
        &self,
        state: &RuntimeState,
        family_selector: &MoveFamilySelector,
        allowed_sessions: &[usize],
        rng: &mut ChaCha12Rng,
    ) -> Option<(MoveFamily, SearchMovePreview, f64)> {
        let ordered_families = family_selector.ordered_families_small(rng);
        for family in ordered_families.as_slice().iter().copied() {
            let preview_started_at = get_current_time();
            let preview =
                self.sample_preview_for_family_default(state, family, allowed_sessions, rng);
            let preview_seconds =
                get_elapsed_seconds_between(preview_started_at, get_current_time());
            if let Some(preview) = preview {
                return Some((family, preview, preview_seconds));
            }
        }

        None
    }

    #[cfg(test)]
    pub(crate) fn diagnose_select_previewed_move_default_timing(
        &self,
        state: &RuntimeState,
        family_selector: &MoveFamilySelector,
        allowed_sessions: &[usize],
        rng: &mut ChaCha12Rng,
    ) -> CandidateSelectionTimingBreakdown {
        let ordered_families = family_selector.ordered_families_small(rng);
        let mut proposal_seconds = 0.0;
        let mut preview_kernel_seconds = 0.0;

        for family in ordered_families.as_slice().iter().copied() {
            let family_started_at = get_current_time();
            let (preview, timing) = self.diagnose_sample_preview_for_family_default_timing(
                state,
                family,
                allowed_sessions,
                rng,
            );
            let family_seconds = get_elapsed_seconds_between(family_started_at, get_current_time());
            preview_kernel_seconds += timing.preview_kernel_seconds;
            proposal_seconds += (family_seconds - timing.preview_kernel_seconds).max(0.0);

            if let Some(preview) = preview {
                return CandidateSelectionTimingBreakdown {
                    selection: Some((family, preview, family_seconds)),
                    proposal_seconds,
                    preview_kernel_seconds,
                };
            }
        }

        CandidateSelectionTimingBreakdown {
            selection: None,
            proposal_seconds,
            preview_kernel_seconds,
        }
    }

    #[inline]
    pub(crate) fn select_previewed_move(
        &self,
        state: &RuntimeState,
        family_selector: &MoveFamilySelector,
        allowed_sessions: &[usize],
        swap_sampling: SwapSamplingOptions<'_>,
        rng: &mut ChaCha12Rng,
    ) -> CandidateSelectionResult {
        let ordered_families = family_selector.ordered_families_small(rng);
        let mut repeat_guided_swap_sampling = RepeatGuidedSwapSamplingDelta::default();
        let mut tabu_swap_sampling = TabuSwapSamplingDelta::default();
        for family in ordered_families.as_slice().iter().copied() {
            let preview_started_at = get_current_time();
            let (preview, sampling_delta, tabu_delta) =
                self.sample_preview_for_family(state, family, allowed_sessions, swap_sampling, rng);
            repeat_guided_swap_sampling.guided_attempts += sampling_delta.guided_attempts;
            repeat_guided_swap_sampling.guided_successes += sampling_delta.guided_successes;
            repeat_guided_swap_sampling.guided_fallback_to_random +=
                sampling_delta.guided_fallback_to_random;
            repeat_guided_swap_sampling.guided_previewed_candidates +=
                sampling_delta.guided_previewed_candidates;
            tabu_swap_sampling.raw_tabu_hits += tabu_delta.raw_tabu_hits;
            tabu_swap_sampling.prefilter_skips += tabu_delta.prefilter_skips;
            tabu_swap_sampling.retry_exhaustions += tabu_delta.retry_exhaustions;
            tabu_swap_sampling.hard_blocks += tabu_delta.hard_blocks;
            tabu_swap_sampling.aspiration_preview_surfaces +=
                tabu_delta.aspiration_preview_surfaces;
            let preview_seconds =
                get_elapsed_seconds_between(preview_started_at, get_current_time());
            if let Some(preview) = preview {
                return CandidateSelectionResult {
                    selection: Some((family, preview, preview_seconds)),
                    repeat_guided_swap_sampling,
                    tabu_swap_sampling,
                };
            }
        }

        CandidateSelectionResult {
            selection: None,
            repeat_guided_swap_sampling,
            tabu_swap_sampling,
        }
    }

    #[inline]
    pub(crate) fn sample_preview_for_family(
        &self,
        state: &RuntimeState,
        family: MoveFamily,
        allowed_sessions: &[usize],
        swap_sampling: SwapSamplingOptions<'_>,
        rng: &mut ChaCha12Rng,
    ) -> (
        Option<SearchMovePreview>,
        RepeatGuidedSwapSamplingDelta,
        TabuSwapSamplingDelta,
    ) {
        match family {
            MoveFamily::Swap => self
                .sample_swap_preview(state, allowed_sessions, swap_sampling, rng)
                .map(|(preview, telemetry, tabu)| {
                    (preview.map(SearchMovePreview::Swap), telemetry, tabu)
                })
                .unwrap_or_default(),
            MoveFamily::Transfer => self
                .sample_transfer_preview(state, allowed_sessions, rng)
                .map(SearchMovePreview::Transfer)
                .map(|preview| {
                    (
                        Some(preview),
                        RepeatGuidedSwapSamplingDelta::default(),
                        TabuSwapSamplingDelta::default(),
                    )
                })
                .unwrap_or_default(),
            MoveFamily::CliqueSwap => self
                .sample_clique_swap_preview(state, allowed_sessions, rng)
                .map(SearchMovePreview::CliqueSwap)
                .map(|preview| {
                    (
                        Some(preview),
                        RepeatGuidedSwapSamplingDelta::default(),
                        TabuSwapSamplingDelta::default(),
                    )
                })
                .unwrap_or_default(),
        }
    }

    #[inline]
    pub(crate) fn sample_preview_for_family_default(
        &self,
        state: &RuntimeState,
        family: MoveFamily,
        allowed_sessions: &[usize],
        rng: &mut ChaCha12Rng,
    ) -> Option<SearchMovePreview> {
        match family {
            MoveFamily::Swap => self
                .sample_swap_preview_default(state, allowed_sessions, rng)
                .map(SearchMovePreview::Swap),
            MoveFamily::Transfer => self
                .sample_transfer_preview(state, allowed_sessions, rng)
                .map(SearchMovePreview::Transfer),
            MoveFamily::CliqueSwap => self
                .sample_clique_swap_preview(state, allowed_sessions, rng)
                .map(SearchMovePreview::CliqueSwap),
        }
    }

    #[cfg(test)]
    fn diagnose_sample_preview_for_family_default_timing(
        &self,
        state: &RuntimeState,
        family: MoveFamily,
        allowed_sessions: &[usize],
        rng: &mut ChaCha12Rng,
    ) -> (Option<SearchMovePreview>, FamilyPreviewTimingBreakdown) {
        match family {
            MoveFamily::Swap => self
                .diagnose_sample_swap_preview_default_timing(state, allowed_sessions, rng)
                .map(|(preview, timing)| (preview.map(SearchMovePreview::Swap), timing))
                .unwrap_or_default(),
            MoveFamily::Transfer => self
                .diagnose_sample_transfer_preview_default_timing(state, allowed_sessions, rng)
                .map(|(preview, timing)| (preview.map(SearchMovePreview::Transfer), timing))
                .unwrap_or_default(),
            MoveFamily::CliqueSwap => self
                .diagnose_sample_clique_swap_preview_default_timing(state, allowed_sessions, rng)
                .map(|(preview, timing)| (preview.map(SearchMovePreview::CliqueSwap), timing))
                .unwrap_or_default(),
        }
    }

    #[cfg(test)]
    fn diagnose_sample_swap_preview_default_timing(
        &self,
        state: &RuntimeState,
        allowed_sessions: &[usize],
        rng: &mut ChaCha12Rng,
    ) -> Option<(Option<SwapRuntimePreview>, FamilyPreviewTimingBreakdown)> {
        if allowed_sessions.is_empty() || state.compiled.num_groups < 2 {
            return Some((None, FamilyPreviewTimingBreakdown::default()));
        }

        let mut timing = FamilyPreviewTimingBreakdown::default();

        for _ in 0..MAX_RANDOM_CANDIDATE_ATTEMPTS {
            let session_idx = allowed_sessions[rng.random_range(0..allowed_sessions.len())];
            if !runtime_session_can_swap(state, session_idx) {
                continue;
            }
            let left_group_idx = rng.random_range(0..state.compiled.num_groups);
            let mut right_group_idx = rng.random_range(0..state.compiled.num_groups);
            if right_group_idx == left_group_idx {
                right_group_idx = (right_group_idx + 1) % state.compiled.num_groups;
            }

            let Some(left_person_idx) =
                runtime_pick_swappable_person_from_group(state, session_idx, left_group_idx, rng)
            else {
                continue;
            };
            let Some(right_person_idx) =
                runtime_pick_swappable_person_from_group(state, session_idx, right_group_idx, rng)
            else {
                continue;
            };
            let swap = SwapMove::new(session_idx, left_person_idx, right_person_idx);

            let preview_started_at = get_current_time();
            let preview = preview_swap_runtime_trusted(state, &swap);
            timing.preview_kernel_seconds +=
                get_elapsed_seconds_between(preview_started_at, get_current_time());
            if let Ok(preview) = preview {
                return Some((Some(preview), timing));
            }
        }

        Some((None, timing))
    }

    #[cfg(test)]
    fn diagnose_sample_transfer_preview_default_timing(
        &self,
        state: &RuntimeState,
        allowed_sessions: &[usize],
        rng: &mut ChaCha12Rng,
    ) -> Option<(Option<TransferRuntimePreview>, FamilyPreviewTimingBreakdown)> {
        if allowed_sessions.is_empty() || state.compiled.num_people == 0 {
            return Some((None, FamilyPreviewTimingBreakdown::default()));
        }

        let mut timing = FamilyPreviewTimingBreakdown::default();

        for _ in 0..MAX_RANDOM_CANDIDATE_ATTEMPTS {
            let session_idx = allowed_sessions[rng.random_range(0..allowed_sessions.len())];
            if !runtime_session_can_transfer(state, session_idx) {
                continue;
            }
            let person_idx = rng.random_range(0..state.compiled.num_people);
            let Some(source_group_idx) =
                runtime_transfer_source_group(state, session_idx, person_idx)
            else {
                continue;
            };

            for _ in 0..MAX_RANDOM_TARGET_ATTEMPTS {
                let target_group_idx = rng.random_range(0..state.compiled.num_groups);
                if target_group_idx == source_group_idx
                    || !runtime_transfer_target_has_capacity(state, session_idx, target_group_idx)
                {
                    continue;
                }

                let transfer =
                    TransferMove::new(session_idx, person_idx, source_group_idx, target_group_idx);
                let preview_started_at = get_current_time();
                let preview = preview_transfer_runtime_checked(state, &transfer);
                timing.preview_kernel_seconds +=
                    get_elapsed_seconds_between(preview_started_at, get_current_time());
                if let Ok(preview) = preview {
                    return Some((Some(preview), timing));
                }
            }
        }

        let session_start = rng.random_range(0..allowed_sessions.len());
        let person_start = rng.random_range(0..state.compiled.num_people);
        let target_start = rng.random_range(0..state.compiled.num_groups);

        for session_offset in 0..allowed_sessions.len() {
            let session_idx =
                allowed_sessions[(session_start + session_offset) % allowed_sessions.len()];
            if !runtime_session_can_transfer(state, session_idx) {
                continue;
            }
            for person_offset in 0..state.compiled.num_people {
                let person_idx = (person_start + person_offset) % state.compiled.num_people;
                let Some(source_group_idx) =
                    runtime_transfer_source_group(state, session_idx, person_idx)
                else {
                    continue;
                };

                for target_offset in 0..state.compiled.num_groups {
                    let target_group_idx =
                        (target_start + target_offset) % state.compiled.num_groups;
                    if target_group_idx == source_group_idx
                        || !runtime_transfer_target_has_capacity(
                            state,
                            session_idx,
                            target_group_idx,
                        )
                    {
                        continue;
                    }

                    let transfer = TransferMove::new(
                        session_idx,
                        person_idx,
                        source_group_idx,
                        target_group_idx,
                    );
                    let preview_started_at = get_current_time();
                    let preview = preview_transfer_runtime_checked(state, &transfer);
                    timing.preview_kernel_seconds +=
                        get_elapsed_seconds_between(preview_started_at, get_current_time());
                    if let Ok(preview) = preview {
                        return Some((Some(preview), timing));
                    }
                }
            }
        }

        Some((None, timing))
    }

    #[cfg(test)]
    fn diagnose_sample_clique_swap_preview_default_timing(
        &self,
        state: &RuntimeState,
        allowed_sessions: &[usize],
        rng: &mut ChaCha12Rng,
    ) -> Option<(
        Option<CliqueSwapRuntimePreview>,
        FamilyPreviewTimingBreakdown,
    )> {
        if allowed_sessions.is_empty() || state.compiled.cliques.is_empty() {
            return Some((None, FamilyPreviewTimingBreakdown::default()));
        }

        let mut timing = FamilyPreviewTimingBreakdown::default();

        for _ in 0..MAX_RANDOM_CANDIDATE_ATTEMPTS {
            let session_idx = allowed_sessions[rng.random_range(0..allowed_sessions.len())];
            if !runtime_session_can_clique_swap(state, session_idx) {
                continue;
            }
            let clique_idx = rng.random_range(0..state.compiled.cliques.len());
            let Some((active_members, source_group_idx)) =
                runtime_active_clique_in_single_group(state, session_idx, clique_idx)
            else {
                continue;
            };

            for _ in 0..MAX_RANDOM_TARGET_ATTEMPTS {
                let target_group_idx = rng.random_range(0..state.compiled.num_groups);
                if target_group_idx == source_group_idx {
                    continue;
                }
                let Some(target_people) = runtime_pick_clique_targets(
                    state,
                    session_idx,
                    &active_members,
                    target_group_idx,
                    rng,
                ) else {
                    continue;
                };

                let clique_swap = CliqueSwapMove::new(
                    session_idx,
                    clique_idx,
                    source_group_idx,
                    target_group_idx,
                    target_people,
                );
                let preview_started_at = get_current_time();
                let preview = preview_clique_swap_runtime_checked(state, &clique_swap);
                timing.preview_kernel_seconds +=
                    get_elapsed_seconds_between(preview_started_at, get_current_time());
                if let Ok(preview) = preview {
                    return Some((Some(preview), timing));
                }
            }
        }

        let session_start = rng.random_range(0..allowed_sessions.len());
        let clique_start = rng.random_range(0..state.compiled.cliques.len());
        let target_start = rng.random_range(0..state.compiled.num_groups);

        for session_offset in 0..allowed_sessions.len() {
            let session_idx =
                allowed_sessions[(session_start + session_offset) % allowed_sessions.len()];
            if !runtime_session_can_clique_swap(state, session_idx) {
                continue;
            }

            for clique_offset in 0..state.compiled.cliques.len() {
                let clique_idx = (clique_start + clique_offset) % state.compiled.cliques.len();
                let Some((active_members, source_group_idx)) =
                    runtime_active_clique_in_single_group(state, session_idx, clique_idx)
                else {
                    continue;
                };

                for target_offset in 0..state.compiled.num_groups {
                    let target_group_idx =
                        (target_start + target_offset) % state.compiled.num_groups;
                    if target_group_idx == source_group_idx {
                        continue;
                    }

                    let Some(target_people) = runtime_pick_clique_targets(
                        state,
                        session_idx,
                        &active_members,
                        target_group_idx,
                        rng,
                    ) else {
                        continue;
                    };

                    let clique_swap = CliqueSwapMove::new(
                        session_idx,
                        clique_idx,
                        source_group_idx,
                        target_group_idx,
                        target_people,
                    );
                    let preview_started_at = get_current_time();
                    let preview = preview_clique_swap_runtime_checked(state, &clique_swap);
                    timing.preview_kernel_seconds +=
                        get_elapsed_seconds_between(preview_started_at, get_current_time());
                    if let Ok(preview) = preview {
                        return Some((Some(preview), timing));
                    }
                }
            }
        }

        Some((None, timing))
    }
}
