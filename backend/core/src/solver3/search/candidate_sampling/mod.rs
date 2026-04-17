#[cfg(any(
    feature = "solver3-experimental-repeat-guidance",
    feature = "solver3-experimental-conflict-restricted-sampling"
))]
use rand::seq::SliceRandom;
use rand::RngExt;
use rand_chacha::ChaCha12Rng;

use super::super::moves::{
    preview_clique_swap_runtime_checked, preview_swap_runtime_trusted,
    preview_transfer_runtime_checked, CliqueSwapMove, CliqueSwapRuntimePreview, SwapMove,
    SwapRuntimePreview, TransferMove, TransferRuntimePreview,
};
#[cfg(feature = "solver3-experimental-repeat-guidance")]
use super::super::repeat_guidance::RepeatGuidanceState;
use super::super::runtime_state::RuntimeState;
#[cfg(feature = "solver3-experimental-conflict-restricted-sampling")]
use super::super::sgp_conflicts::SgpConflictState;

mod dispatch;
mod types;

use types::{
    get_current_time, get_elapsed_seconds_between, FamilyPreviewTimingBreakdown,
    GuidedSwapSamplingPreviewResult, MAX_RANDOM_CANDIDATE_ATTEMPTS, MAX_RANDOM_TARGET_ATTEMPTS,
};
pub(crate) use types::{
    CandidateSampler, CandidateSelectionResult, CandidateSelectionTimingBreakdown,
    RepeatGuidedSwapSamplingDelta, SearchMovePreview, SwapSamplingOptions, TabuSwapSamplingDelta,
};

impl CandidateSampler {
    pub(super) fn sample_swap_preview(
        &self,
        state: &RuntimeState,
        allowed_sessions: &[usize],
        swap_sampling: SwapSamplingOptions<'_>,
        rng: &mut ChaCha12Rng,
    ) -> Option<(
        Option<SwapRuntimePreview>,
        RepeatGuidedSwapSamplingDelta,
        TabuSwapSamplingDelta,
    )> {
        if allowed_sessions.is_empty() || state.compiled.num_groups < 2 {
            return Some((
                None,
                RepeatGuidedSwapSamplingDelta::default(),
                TabuSwapSamplingDelta::default(),
            ));
        }

        let mut telemetry = RepeatGuidedSwapSamplingDelta::default();
        let mut tabu_telemetry = TabuSwapSamplingDelta::default();

        #[cfg(feature = "solver3-experimental-repeat-guidance")]
        let guided_preview = if swap_sampling.repeat_guidance.is_some()
            && swap_sampling.repeat_guided_swap_candidate_preview_budget > 0
            && rng.random::<f64>() < swap_sampling.repeat_guided_swap_probability
        {
            telemetry.guided_attempts += 1;
            swap_sampling.repeat_guidance.and_then(|guidance| {
                self.sample_repeat_guided_swap_preview(
                    state,
                    allowed_sessions,
                    guidance,
                    swap_sampling.repeat_guided_swap_candidate_preview_budget,
                    swap_sampling,
                    rng,
                )
            })
        } else {
            None
        };

        #[cfg(not(feature = "solver3-experimental-repeat-guidance"))]
        let guided_preview: Option<GuidedSwapSamplingPreviewResult> = None;

        if let Some(guided_preview) = guided_preview {
            telemetry.guided_previewed_candidates += guided_preview.previewed_candidates;
            tabu_telemetry.raw_tabu_hits += guided_preview.tabu_sampling.raw_tabu_hits;
            tabu_telemetry.prefilter_skips += guided_preview.tabu_sampling.prefilter_skips;
            tabu_telemetry.retry_exhaustions += guided_preview.tabu_sampling.retry_exhaustions;
            tabu_telemetry.hard_blocks += guided_preview.tabu_sampling.hard_blocks;
            tabu_telemetry.aspiration_preview_surfaces +=
                guided_preview.tabu_sampling.aspiration_preview_surfaces;
            if let Some(preview) = guided_preview.preview {
                telemetry.guided_successes += 1;
                return Some((Some(preview), telemetry, tabu_telemetry));
            }
            telemetry.guided_fallback_to_random += 1;
        }

        #[cfg(feature = "solver3-experimental-conflict-restricted-sampling")]
        if swap_sampling
            .sgp_conflicts
            .is_some_and(SgpConflictState::has_active_conflicts)
        {
            let preview = self.sample_conflict_restricted_swap_preview(
                state,
                swap_sampling.sgp_conflicts.expect("checked above"),
                swap_sampling,
                &mut tabu_telemetry,
                rng,
            );
            if preview.is_none() && tabu_telemetry.retry_exhaustions > 0 {
                tabu_telemetry.hard_blocks += 1;
            }
            return Some((preview, telemetry, tabu_telemetry));
        }

        let preview = self.sample_random_swap_preview(
            state,
            allowed_sessions,
            swap_sampling,
            &mut tabu_telemetry,
            rng,
        );
        if preview.is_none() && tabu_telemetry.retry_exhaustions > 0 {
            tabu_telemetry.hard_blocks += 1;
        }

        Some((preview, telemetry, tabu_telemetry))
    }

    pub(super) fn sample_swap_preview_default(
        &self,
        state: &RuntimeState,
        allowed_sessions: &[usize],
        rng: &mut ChaCha12Rng,
    ) -> Option<SwapRuntimePreview> {
        if allowed_sessions.is_empty() || state.compiled.num_groups < 2 {
            return None;
        }

        if allowed_sessions.len() == 1 {
            return self.sample_random_swap_preview_for_session_default(
                state,
                allowed_sessions[0],
                rng,
            );
        }

        for _ in 0..MAX_RANDOM_CANDIDATE_ATTEMPTS {
            let session_idx = allowed_sessions[rng.random_range(0..allowed_sessions.len())];
            if let Some(preview) =
                self.sample_random_swap_preview_for_session_default(state, session_idx, rng)
            {
                return Some(preview);
            }
        }

        None
    }

    #[cfg(feature = "solver3-experimental-conflict-restricted-sampling")]
    fn sample_conflict_restricted_swap_preview(
        &self,
        state: &RuntimeState,
        conflicts: &SgpConflictState,
        swap_sampling: SwapSamplingOptions<'_>,
        tabu_telemetry: &mut TabuSwapSamplingDelta,
        rng: &mut ChaCha12Rng,
    ) -> Option<SwapRuntimePreview> {
        let mut tabu_retry_count = 0usize;
        let mut fallback_tabu_swap = None;
        for _ in 0..MAX_RANDOM_CANDIDATE_ATTEMPTS {
            let Some((session_idx, anchor_person_idx)) = conflicts.sample_conflicted_position(rng)
            else {
                break;
            };

            if let Some(preview) = self.sample_conflict_restricted_swap_preview_for_anchor(
                state,
                session_idx,
                anchor_person_idx,
                swap_sampling,
                tabu_telemetry,
                rng,
                &mut tabu_retry_count,
                &mut fallback_tabu_swap,
            ) {
                return Some(preview);
            }

            if tabu_retry_count >= swap_sampling.tabu_retry_cap {
                tabu_telemetry.retry_exhaustions += 1;
                break;
            }
        }

        let fallback =
            fallback_tabu_swap.and_then(|swap| preview_swap_runtime_trusted(state, &swap).ok());
        if fallback.is_some() {
            tabu_telemetry.aspiration_preview_surfaces += 1;
        }
        fallback
    }

    #[cfg(feature = "solver3-experimental-conflict-restricted-sampling")]
    fn sample_conflict_restricted_swap_preview_for_anchor(
        &self,
        state: &RuntimeState,
        session_idx: usize,
        anchor_person_idx: usize,
        swap_sampling: SwapSamplingOptions<'_>,
        tabu_telemetry: &mut TabuSwapSamplingDelta,
        rng: &mut ChaCha12Rng,
        tabu_retry_count: &mut usize,
        fallback_tabu_swap: &mut Option<SwapMove>,
    ) -> Option<SwapRuntimePreview> {
        if !is_runtime_swappable_person(state, session_idx, anchor_person_idx) {
            return None;
        }

        let Some(source_group_idx) =
            state.person_location[state.people_slot(session_idx, anchor_person_idx)]
        else {
            return None;
        };

        let mut target_groups = (0..state.compiled.num_groups)
            .filter(|group_idx| *group_idx != source_group_idx)
            .collect::<Vec<_>>();
        if target_groups.is_empty() {
            return None;
        }
        target_groups.shuffle(rng);

        for target_group_idx in target_groups {
            let target_slot = state.group_slot(session_idx, target_group_idx);
            let target_members = &state.group_members[target_slot];
            if target_members.is_empty() {
                continue;
            }

            let start = rng.random_range(0..target_members.len());
            for offset in 0..target_members.len() {
                let target_person_idx = target_members[(start + offset) % target_members.len()];
                if target_person_idx == anchor_person_idx {
                    continue;
                }
                if !is_runtime_swappable_person(state, session_idx, target_person_idx) {
                    continue;
                }

                if should_skip_tabu_swap_proposal(
                    &swap_sampling,
                    state,
                    session_idx,
                    anchor_person_idx,
                    target_person_idx,
                    tabu_telemetry,
                    tabu_retry_count,
                ) {
                    if swap_sampling.tabu_allow_aspiration_preview && fallback_tabu_swap.is_none() {
                        *fallback_tabu_swap = Some(SwapMove::new(
                            session_idx,
                            anchor_person_idx,
                            target_person_idx,
                        ));
                    }
                    if *tabu_retry_count >= swap_sampling.tabu_retry_cap {
                        return None;
                    }
                    continue;
                }

                let swap = SwapMove::new(session_idx, anchor_person_idx, target_person_idx);
                if let Ok(preview) = preview_swap_runtime_trusted(state, &swap) {
                    return Some(preview);
                }
            }
        }

        None
    }

    fn sample_random_swap_preview(
        &self,
        state: &RuntimeState,
        allowed_sessions: &[usize],
        swap_sampling: SwapSamplingOptions<'_>,
        tabu_telemetry: &mut TabuSwapSamplingDelta,
        rng: &mut ChaCha12Rng,
    ) -> Option<SwapRuntimePreview> {
        if allowed_sessions.is_empty() || state.compiled.num_groups < 2 {
            return None;
        }

        if allowed_sessions.len() == 1 {
            return self.sample_random_swap_preview_in_session(
                state,
                allowed_sessions[0],
                swap_sampling,
                tabu_telemetry,
                rng,
            );
        }

        let mut tabu_retry_count = 0usize;
        let mut fallback_tabu_swap = None;
        for _ in 0..MAX_RANDOM_CANDIDATE_ATTEMPTS {
            let session_idx = allowed_sessions[rng.random_range(0..allowed_sessions.len())];
            if let Some(preview) = self.sample_random_swap_preview_for_session(
                state,
                session_idx,
                swap_sampling,
                tabu_telemetry,
                rng,
                &mut tabu_retry_count,
                &mut fallback_tabu_swap,
            ) {
                return Some(preview);
            }
            if tabu_retry_count >= swap_sampling.tabu_retry_cap {
                tabu_telemetry.retry_exhaustions += 1;
                break;
            }
        }

        let fallback =
            fallback_tabu_swap.and_then(|swap| preview_swap_runtime_trusted(state, &swap).ok());
        if fallback.is_some() {
            tabu_telemetry.aspiration_preview_surfaces += 1;
        }
        fallback
    }

    pub(crate) fn sample_random_swap_preview_in_session(
        &self,
        state: &RuntimeState,
        session_idx: usize,
        swap_sampling: SwapSamplingOptions<'_>,
        tabu_telemetry: &mut TabuSwapSamplingDelta,
        rng: &mut ChaCha12Rng,
    ) -> Option<SwapRuntimePreview> {
        if state.compiled.num_groups < 2 {
            return None;
        }

        let mut tabu_retry_count = 0usize;
        let mut fallback_tabu_swap = None;
        for _ in 0..MAX_RANDOM_CANDIDATE_ATTEMPTS {
            if let Some(preview) = self.sample_random_swap_preview_for_session(
                state,
                session_idx,
                swap_sampling,
                tabu_telemetry,
                rng,
                &mut tabu_retry_count,
                &mut fallback_tabu_swap,
            ) {
                return Some(preview);
            }
            if tabu_retry_count >= swap_sampling.tabu_retry_cap {
                tabu_telemetry.retry_exhaustions += 1;
                break;
            }
        }

        let fallback =
            fallback_tabu_swap.and_then(|swap| preview_swap_runtime_trusted(state, &swap).ok());
        if fallback.is_some() {
            tabu_telemetry.aspiration_preview_surfaces += 1;
        }
        fallback
    }

    fn sample_random_swap_preview_for_session(
        &self,
        state: &RuntimeState,
        session_idx: usize,
        swap_sampling: SwapSamplingOptions<'_>,
        tabu_telemetry: &mut TabuSwapSamplingDelta,
        rng: &mut ChaCha12Rng,
        tabu_retry_count: &mut usize,
        fallback_tabu_swap: &mut Option<SwapMove>,
    ) -> Option<SwapRuntimePreview> {
        for _ in 0..MAX_RANDOM_TARGET_ATTEMPTS {
            if !runtime_session_can_swap(state, session_idx) {
                return None;
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
            if should_skip_tabu_swap_proposal(
                &swap_sampling,
                state,
                session_idx,
                left_person_idx,
                right_person_idx,
                tabu_telemetry,
                tabu_retry_count,
            ) {
                if swap_sampling.tabu_allow_aspiration_preview && fallback_tabu_swap.is_none() {
                    *fallback_tabu_swap = Some(swap);
                }
                if *tabu_retry_count >= swap_sampling.tabu_retry_cap {
                    break;
                }
                continue;
            }
            if let Ok(preview) = preview_swap_runtime_trusted(state, &swap) {
                return Some(preview);
            }
        }

        None
    }

    fn sample_random_swap_preview_for_session_default(
        &self,
        state: &RuntimeState,
        session_idx: usize,
        rng: &mut ChaCha12Rng,
    ) -> Option<SwapRuntimePreview> {
        if !runtime_session_can_swap(state, session_idx) {
            return None;
        }

        for _ in 0..MAX_RANDOM_TARGET_ATTEMPTS {
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
            if let Ok(preview) = preview_swap_runtime_trusted(state, &swap) {
                return Some(preview);
            }
        }

        None
    }

    #[cfg(feature = "solver3-experimental-repeat-guidance")]
    fn sample_repeat_guided_swap_preview(
        &self,
        state: &RuntimeState,
        allowed_sessions: &[usize],
        guidance: &RepeatGuidanceState,
        candidate_preview_budget: usize,
        swap_sampling: SwapSamplingOptions<'_>,
        rng: &mut ChaCha12Rng,
    ) -> Option<GuidedSwapSamplingPreviewResult> {
        if candidate_preview_budget == 0 || guidance.active_pair_count() == 0 {
            return None;
        }

        let offender_pair_idx = guidance.sample_pair_from_highest_bucket(rng)?;
        let (left_person_idx, right_person_idx) = state.compiled.pair_members(offender_pair_idx);
        let session_idx = pick_repeat_meeting_session(
            state,
            allowed_sessions,
            left_person_idx,
            right_person_idx,
            rng,
        )?;
        let anchor_person_idx = choose_repeat_guided_swappable_anchor_person(
            state,
            session_idx,
            guidance,
            left_person_idx,
            right_person_idx,
            rng,
        )?;
        let source_group_idx =
            state.person_location[state.people_slot(session_idx, anchor_person_idx)]?;

        let mut target_groups = (0..state.compiled.num_groups)
            .filter(|group_idx| *group_idx != source_group_idx)
            .collect::<Vec<_>>();
        if target_groups.is_empty() {
            return None;
        }
        target_groups.shuffle(rng);

        let mut best_preview = None;
        let mut previewed_candidates = 0usize;
        let mut tabu_retry_count = 0usize;
        let mut fallback_tabu_swap = None;
        let mut guided_tabu_telemetry = TabuSwapSamplingDelta::default();
        for target_group_idx in target_groups {
            let target_slot = state.group_slot(session_idx, target_group_idx);
            let target_members = &state.group_members[target_slot];
            if target_members.is_empty() {
                continue;
            }

            let start = rng.random_range(0..target_members.len());
            for offset in 0..target_members.len() {
                let target_person_idx = target_members[(start + offset) % target_members.len()];
                if target_person_idx == anchor_person_idx {
                    continue;
                }
                if !is_runtime_swappable_person(state, session_idx, target_person_idx) {
                    continue;
                }

                if should_skip_tabu_swap_proposal(
                    &swap_sampling,
                    state,
                    session_idx,
                    anchor_person_idx,
                    target_person_idx,
                    &mut guided_tabu_telemetry,
                    &mut tabu_retry_count,
                ) {
                    if swap_sampling.tabu_allow_aspiration_preview && fallback_tabu_swap.is_none() {
                        fallback_tabu_swap = Some(SwapMove::new(
                            session_idx,
                            anchor_person_idx,
                            target_person_idx,
                        ));
                    }
                    if tabu_retry_count >= swap_sampling.tabu_retry_cap {
                        break;
                    }
                    continue;
                }

                let swap = SwapMove::new(session_idx, anchor_person_idx, target_person_idx);
                if let Ok(preview) = preview_swap_runtime_trusted(state, &swap) {
                    previewed_candidates += 1;
                    if best_preview
                        .as_ref()
                        .is_none_or(|best: &SwapRuntimePreview| {
                            preview.delta_score < best.delta_score
                        })
                    {
                        best_preview = Some(preview);
                    }

                    if previewed_candidates >= candidate_preview_budget {
                        if best_preview.is_none()
                            && tabu_retry_count >= swap_sampling.tabu_retry_cap
                        {
                            guided_tabu_telemetry.retry_exhaustions += 1;
                        }
                        return Some(GuidedSwapSamplingPreviewResult {
                            preview: best_preview,
                            previewed_candidates: previewed_candidates as u64,
                            tabu_sampling: guided_tabu_telemetry,
                        });
                    }
                }
            }

            if tabu_retry_count >= swap_sampling.tabu_retry_cap {
                break;
            }
        }

        if best_preview.is_none() && swap_sampling.tabu_allow_aspiration_preview {
            if let Some(swap) = fallback_tabu_swap {
                if let Ok(preview) = preview_swap_runtime_trusted(state, &swap) {
                    best_preview = Some(preview);
                    previewed_candidates += 1;
                    guided_tabu_telemetry.aspiration_preview_surfaces += 1;
                }
            }
        }

        if best_preview.is_none() && tabu_retry_count >= swap_sampling.tabu_retry_cap {
            guided_tabu_telemetry.retry_exhaustions += 1;
            guided_tabu_telemetry.hard_blocks += 1;
        }

        Some(GuidedSwapSamplingPreviewResult {
            preview: best_preview,
            previewed_candidates: previewed_candidates as u64,
            tabu_sampling: guided_tabu_telemetry,
        })
    }
}

#[inline]
fn should_skip_tabu_swap_proposal(
    swap_sampling: &SwapSamplingOptions<'_>,
    state: &RuntimeState,
    session_idx: usize,
    left_person_idx: usize,
    right_person_idx: usize,
    tabu_telemetry: &mut TabuSwapSamplingDelta,
    tabu_retry_count: &mut usize,
) -> bool {
    let Some(tabu) = swap_sampling.tabu else {
        return false;
    };

    if !tabu.is_tabu(
        &state.compiled,
        session_idx,
        left_person_idx,
        right_person_idx,
        swap_sampling.current_iteration,
    ) {
        return false;
    }

    tabu_telemetry.raw_tabu_hits += 1;
    tabu_telemetry.prefilter_skips += 1;
    *tabu_retry_count = tabu_retry_count.saturating_add(1);
    true
}

#[cfg(feature = "solver3-experimental-repeat-guidance")]
fn pick_repeat_meeting_session(
    state: &RuntimeState,
    allowed_sessions: &[usize],
    left_person_idx: usize,
    right_person_idx: usize,
    rng: &mut ChaCha12Rng,
) -> Option<usize> {
    let mut meeting_sessions = Vec::new();
    for &session_idx in allowed_sessions {
        if !state.compiled.person_participation[left_person_idx][session_idx]
            || !state.compiled.person_participation[right_person_idx][session_idx]
        {
            continue;
        }

        let left_group = state.person_location[state.people_slot(session_idx, left_person_idx)];
        let right_group = state.person_location[state.people_slot(session_idx, right_person_idx)];
        if left_group.is_some() && left_group == right_group {
            meeting_sessions.push(session_idx);
        }
    }

    if meeting_sessions.is_empty() {
        None
    } else {
        Some(meeting_sessions[rng.random_range(0..meeting_sessions.len())])
    }
}

#[cfg(feature = "solver3-experimental-repeat-guidance")]
fn choose_repeat_guided_anchor_person(
    guidance: &RepeatGuidanceState,
    left_person_idx: usize,
    right_person_idx: usize,
    rng: &mut ChaCha12Rng,
) -> usize {
    let left_incidents = guidance.person_incident_count(left_person_idx);
    let right_incidents = guidance.person_incident_count(right_person_idx);

    if left_incidents == right_incidents {
        if rng.random::<bool>() {
            left_person_idx
        } else {
            right_person_idx
        }
    } else {
        let (heavier, lighter) = if left_incidents > right_incidents {
            (left_person_idx, right_person_idx)
        } else {
            (right_person_idx, left_person_idx)
        };
        if rng.random::<f64>() < 0.75 {
            heavier
        } else {
            lighter
        }
    }
}

#[cfg(feature = "solver3-experimental-repeat-guidance")]
fn choose_repeat_guided_swappable_anchor_person(
    state: &RuntimeState,
    session_idx: usize,
    guidance: &RepeatGuidanceState,
    left_person_idx: usize,
    right_person_idx: usize,
    rng: &mut ChaCha12Rng,
) -> Option<usize> {
    let preferred =
        choose_repeat_guided_anchor_person(guidance, left_person_idx, right_person_idx, rng);
    let alternate = if preferred == left_person_idx {
        right_person_idx
    } else {
        left_person_idx
    };

    if is_runtime_swappable_person(state, session_idx, preferred) {
        Some(preferred)
    } else if is_runtime_swappable_person(state, session_idx, alternate) {
        Some(alternate)
    } else {
        None
    }
}

impl CandidateSampler {
    pub(super) fn sample_transfer_preview(
        &self,
        state: &RuntimeState,
        allowed_sessions: &[usize],
        rng: &mut ChaCha12Rng,
    ) -> Option<TransferRuntimePreview> {
        if allowed_sessions.is_empty() || state.compiled.num_people == 0 {
            return None;
        }

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
                if let Ok(preview) = preview_transfer_runtime_checked(state, &transfer) {
                    return Some(preview);
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
                    if let Ok(preview) = preview_transfer_runtime_checked(state, &transfer) {
                        return Some(preview);
                    }
                }
            }
        }

        None
    }
}

impl CandidateSampler {
    pub(super) fn sample_clique_swap_preview(
        &self,
        state: &RuntimeState,
        allowed_sessions: &[usize],
        rng: &mut ChaCha12Rng,
    ) -> Option<CliqueSwapRuntimePreview> {
        if allowed_sessions.is_empty() || state.compiled.cliques.is_empty() {
            return None;
        }

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
                if let Ok(preview) = preview_clique_swap_runtime_checked(state, &clique_swap) {
                    return Some(preview);
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
                    if let Ok(preview) = preview_clique_swap_runtime_checked(state, &clique_swap) {
                        return Some(preview);
                    }
                }
            }
        }

        None
    }
}

fn participating_clique_members(
    state: &RuntimeState,
    session_idx: usize,
    clique_idx: usize,
) -> Vec<usize> {
    state.compiled.cliques[clique_idx]
        .members
        .iter()
        .copied()
        .filter(|&member| state.compiled.person_participation[member][session_idx])
        .collect()
}

pub(super) fn runtime_session_can_clique_swap(state: &RuntimeState, session_idx: usize) -> bool {
    (0..state.compiled.cliques.len()).any(|clique_idx| {
        let Some((active_members, source_group_idx)) =
            runtime_active_clique_in_single_group(state, session_idx, clique_idx)
        else {
            return false;
        };

        (0..state.compiled.num_groups).any(|target_group_idx| {
            target_group_idx != source_group_idx
                && runtime_target_group_has_eligible_clique_swap_people(
                    state,
                    session_idx,
                    &active_members,
                    target_group_idx,
                )
        })
    })
}

pub(super) fn runtime_session_can_swap(state: &RuntimeState, session_idx: usize) -> bool {
    let mut swappable_group_count = 0usize;
    for group_idx in 0..state.compiled.num_groups {
        if runtime_group_has_swappable_person(state, session_idx, group_idx) {
            swappable_group_count += 1;
            if swappable_group_count >= 2 {
                return true;
            }
        }
    }

    false
}

fn runtime_group_has_swappable_person(
    state: &RuntimeState,
    session_idx: usize,
    group_idx: usize,
) -> bool {
    let slot = state.group_slot(session_idx, group_idx);
    state.group_members[slot]
        .iter()
        .copied()
        .any(|person_idx| is_runtime_swappable_person(state, session_idx, person_idx))
}

pub(super) fn runtime_pick_swappable_person_from_group(
    state: &RuntimeState,
    session_idx: usize,
    group_idx: usize,
    rng: &mut ChaCha12Rng,
) -> Option<usize> {
    let slot = state.group_slot(session_idx, group_idx);
    let members = &state.group_members[slot];
    if members.is_empty() {
        return None;
    }

    let start = rng.random_range(0..members.len());
    for offset in 0..members.len() {
        let person_idx = members[(start + offset) % members.len()];
        if is_runtime_swappable_person(state, session_idx, person_idx) {
            return Some(person_idx);
        }
    }

    None
}

pub(super) fn runtime_active_clique_in_single_group(
    state: &RuntimeState,
    session_idx: usize,
    clique_idx: usize,
) -> Option<(Vec<usize>, usize)> {
    let active_members = participating_clique_members(state, session_idx, clique_idx);
    if active_members.is_empty() {
        return None;
    }

    let source_group_idx =
        state.person_location[state.people_slot(session_idx, active_members[0])]?;

    if active_members.iter().any(|&member| {
        state.person_location[state.people_slot(session_idx, member)] != Some(source_group_idx)
    }) {
        return None;
    }

    if active_members.iter().any(|&member| {
        state
            .compiled
            .immovable_group(session_idx, member)
            .is_some()
    }) {
        return None;
    }

    Some((active_members, source_group_idx))
}

pub(super) fn runtime_pick_clique_targets(
    state: &RuntimeState,
    session_idx: usize,
    active_members: &[usize],
    target_group_idx: usize,
    rng: &mut ChaCha12Rng,
) -> Option<Vec<usize>> {
    let target_slot = state.group_slot(session_idx, target_group_idx);
    let target_members = &state.group_members[target_slot];
    if target_members.len() < active_members.len() {
        return None;
    }

    let start = rng.random_range(0..target_members.len());
    let mut selected = Vec::with_capacity(active_members.len());
    for offset in 0..target_members.len() {
        let person_idx = target_members[(start + offset) % target_members.len()];
        if !active_members.contains(&person_idx)
            && state.compiled.person_participation[person_idx][session_idx]
            && state.compiled.person_to_clique_id[session_idx][person_idx].is_none()
            && state
                .compiled
                .immovable_group(session_idx, person_idx)
                .is_none()
        {
            selected.push(person_idx);
            if selected.len() == active_members.len() {
                return Some(selected);
            }
        }
    }

    None
}

fn runtime_target_group_has_eligible_clique_swap_people(
    state: &RuntimeState,
    session_idx: usize,
    active_members: &[usize],
    target_group_idx: usize,
) -> bool {
    let target_slot = state.group_slot(session_idx, target_group_idx);
    let eligible = state.group_members[target_slot]
        .iter()
        .filter(|&&person_idx| {
            !active_members.contains(&person_idx)
                && state.compiled.person_participation[person_idx][session_idx]
                && state.compiled.person_to_clique_id[session_idx][person_idx].is_none()
                && state
                    .compiled
                    .immovable_group(session_idx, person_idx)
                    .is_none()
        })
        .count();

    eligible >= active_members.len()
}

pub(super) fn runtime_session_can_transfer(state: &RuntimeState, session_idx: usize) -> bool {
    let has_capacity_target = (0..state.compiled.num_groups)
        .any(|group_idx| runtime_transfer_target_has_capacity(state, session_idx, group_idx));
    let has_nonempty_source = (0..state.compiled.num_groups)
        .any(|group_idx| state.group_sizes[state.group_slot(session_idx, group_idx)] > 1);
    has_capacity_target && has_nonempty_source
}

pub(super) fn runtime_transfer_source_group(
    state: &RuntimeState,
    session_idx: usize,
    person_idx: usize,
) -> Option<usize> {
    if !is_runtime_transferable_person(state, session_idx, person_idx) {
        return None;
    }

    let source_group_idx = state.person_location[state.people_slot(session_idx, person_idx)]?;
    if state.group_sizes[state.group_slot(session_idx, source_group_idx)] <= 1 {
        return None;
    }

    Some(source_group_idx)
}

pub(super) fn runtime_transfer_target_has_capacity(
    state: &RuntimeState,
    session_idx: usize,
    target_group_idx: usize,
) -> bool {
    state.group_sizes[state.group_slot(session_idx, target_group_idx)]
        < state.compiled.group_capacity(session_idx, target_group_idx)
}

fn is_runtime_transferable_person(
    state: &RuntimeState,
    session_idx: usize,
    person_idx: usize,
) -> bool {
    is_runtime_swappable_person(state, session_idx, person_idx)
}

pub(super) fn is_runtime_swappable_person(
    state: &RuntimeState,
    session_idx: usize,
    person_idx: usize,
) -> bool {
    state.compiled.person_participation[person_idx][session_idx]
        && state.person_location[state.people_slot(session_idx, person_idx)].is_some()
        && state
            .compiled
            .immovable_group(session_idx, person_idx)
            .is_none()
        && state.compiled.person_to_clique_id[session_idx][person_idx].is_none()
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use rand::SeedableRng;
    use rand_chacha::ChaCha12Rng;

    use crate::models::{
        ApiInput, Constraint, Group, ImmovablePersonParams, Objective, Person, ProblemDefinition,
        Solver3Params, SolverConfiguration, SolverParams, StopConditions,
    };

    use super::super::super::runtime_state::RuntimeState;
    use super::super::family_selection::MoveFamilySelector;
    #[cfg(feature = "solver3-experimental-repeat-guidance")]
    use super::super::repeat_guidance::RepeatGuidanceState;
    #[cfg(feature = "solver3-experimental-conflict-restricted-sampling")]
    use super::super::sgp_conflicts::SgpConflictState;
    use super::super::tabu::{SgpWeekPairTabuConfig, SgpWeekPairTabuState};
    #[cfg(any(
        feature = "solver3-experimental-repeat-guidance",
        feature = "solver3-experimental-conflict-restricted-sampling"
    ))]
    use super::SearchMovePreview;
    use super::{CandidateSampler, SwapSamplingOptions};

    fn solver3_config() -> SolverConfiguration {
        SolverConfiguration {
            solver_type: "solver3".to_string(),
            stop_conditions: StopConditions {
                max_iterations: None,
                time_limit_seconds: None,
                no_improvement_iterations: None,
                stop_on_optimal_score: true,
            },
            solver_params: SolverParams::Solver3(Solver3Params::default()),
            logging: Default::default(),
            telemetry: Default::default(),
            seed: Some(7),
            move_policy: None,
            allowed_sessions: None,
        }
    }

    fn simple_runtime_state() -> RuntimeState {
        let input = ApiInput {
            problem: ProblemDefinition {
                people: (0..4)
                    .map(|i| Person {
                        id: format!("p{}", i),
                        attributes: HashMap::new(),
                        sessions: None,
                    })
                    .collect(),
                groups: vec![
                    Group {
                        id: "g0".into(),
                        size: 2,
                        session_sizes: None,
                    },
                    Group {
                        id: "g1".into(),
                        size: 2,
                        session_sizes: None,
                    },
                ],
                num_sessions: 1,
            },
            initial_schedule: None,
            construction_seed_schedule: None,
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".into(),
                weight: 1.0,
            }],
            constraints: vec![],
            solver: solver3_config(),
        };
        RuntimeState::from_input(&input).unwrap()
    }

    fn repeated_pair_runtime_state() -> RuntimeState {
        let input = ApiInput {
            problem: ProblemDefinition {
                people: (0..4)
                    .map(|i| Person {
                        id: format!("p{}", i),
                        attributes: HashMap::new(),
                        sessions: None,
                    })
                    .collect(),
                groups: vec![
                    Group {
                        id: "g0".into(),
                        size: 2,
                        session_sizes: None,
                    },
                    Group {
                        id: "g1".into(),
                        size: 2,
                        session_sizes: None,
                    },
                ],
                num_sessions: 2,
            },
            initial_schedule: Some(HashMap::from([
                (
                    "session_0".to_string(),
                    HashMap::from([
                        ("g0".to_string(), vec!["p0".to_string(), "p1".to_string()]),
                        ("g1".to_string(), vec!["p2".to_string(), "p3".to_string()]),
                    ]),
                ),
                (
                    "session_1".to_string(),
                    HashMap::from([
                        ("g0".to_string(), vec!["p0".to_string(), "p1".to_string()]),
                        ("g1".to_string(), vec!["p2".to_string(), "p3".to_string()]),
                    ]),
                ),
            ])),
            construction_seed_schedule: None,
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".into(),
                weight: 1.0,
            }],
            constraints: vec![crate::models::Constraint::RepeatEncounter(
                crate::models::RepeatEncounterParams {
                    max_allowed_encounters: 1,
                    penalty_function: "linear".into(),
                    penalty_weight: 100.0,
                },
            )],
            solver: solver3_config(),
        };
        RuntimeState::from_input(&input).unwrap()
    }

    fn restricted_swap_runtime_state() -> RuntimeState {
        let input = ApiInput {
            problem: ProblemDefinition {
                people: (0..5)
                    .map(|i| Person {
                        id: format!("p{}", i),
                        attributes: HashMap::new(),
                        sessions: None,
                    })
                    .collect(),
                groups: vec![
                    Group {
                        id: "g0".into(),
                        size: 3,
                        session_sizes: None,
                    },
                    Group {
                        id: "g1".into(),
                        size: 2,
                        session_sizes: None,
                    },
                ],
                num_sessions: 1,
            },
            initial_schedule: Some(HashMap::from([(
                "session_0".to_string(),
                HashMap::from([
                    (
                        "g0".to_string(),
                        vec!["p0".to_string(), "p1".to_string(), "p2".to_string()],
                    ),
                    ("g1".to_string(), vec!["p3".to_string(), "p4".to_string()]),
                ]),
            )])),
            construction_seed_schedule: None,
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".into(),
                weight: 1.0,
            }],
            constraints: vec![
                Constraint::MustStayTogether {
                    people: vec!["p0".into(), "p1".into()],
                    sessions: Some(vec![0]),
                },
                Constraint::ImmovablePerson(ImmovablePersonParams {
                    person_id: "p4".into(),
                    group_id: "g1".into(),
                    sessions: Some(vec![0]),
                }),
            ],
            solver: solver3_config(),
        };

        RuntimeState::from_input(&input).unwrap()
    }

    fn repeat_constrained_non_conflicting_state() -> RuntimeState {
        let input = ApiInput {
            problem: ProblemDefinition {
                people: (0..4)
                    .map(|i| Person {
                        id: format!("p{}", i),
                        attributes: HashMap::new(),
                        sessions: None,
                    })
                    .collect(),
                groups: vec![
                    Group {
                        id: "g0".into(),
                        size: 2,
                        session_sizes: None,
                    },
                    Group {
                        id: "g1".into(),
                        size: 2,
                        session_sizes: None,
                    },
                ],
                num_sessions: 2,
            },
            initial_schedule: Some(HashMap::from([
                (
                    "session_0".to_string(),
                    HashMap::from([
                        ("g0".to_string(), vec!["p0".to_string(), "p1".to_string()]),
                        ("g1".to_string(), vec!["p2".to_string(), "p3".to_string()]),
                    ]),
                ),
                (
                    "session_1".to_string(),
                    HashMap::from([
                        ("g0".to_string(), vec!["p0".to_string(), "p2".to_string()]),
                        ("g1".to_string(), vec!["p1".to_string(), "p3".to_string()]),
                    ]),
                ),
            ])),
            construction_seed_schedule: None,
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".into(),
                weight: 1.0,
            }],
            constraints: vec![crate::models::Constraint::RepeatEncounter(
                crate::models::RepeatEncounterParams {
                    max_allowed_encounters: 1,
                    penalty_function: "linear".into(),
                    penalty_weight: 100.0,
                },
            )],
            solver: solver3_config(),
        };
        RuntimeState::from_input(&input).unwrap()
    }

    fn tabu_config() -> SgpWeekPairTabuConfig {
        SgpWeekPairTabuConfig {
            tenure_mode: crate::models::Solver3SgpWeekPairTabuTenureMode::FixedInterval,
            tenure_min: 10,
            tenure_max: 10,
            retry_cap: 4,
            aspiration_enabled: true,
            session_scale_reference_participants: 32,
            reactive_no_improvement_window: 100_000,
            reactive_max_multiplier: 4,
            conflict_restricted_swap_sampling_enabled: false,
        }
    }

    #[test]
    fn sampler_returns_none_when_no_sessions_allowed() {
        let state = simple_runtime_state();
        let selector = MoveFamilySelector::new(&Default::default());
        let mut rng = ChaCha12Rng::seed_from_u64(7);
        let sampler = CandidateSampler;
        assert!(sampler
            .select_previewed_move(
                &state,
                &selector,
                &[],
                SwapSamplingOptions::default(),
                &mut rng
            )
            .selection
            .is_none());
    }

    #[test]
    fn sampler_can_find_a_swap_preview_on_simple_state() {
        let state = simple_runtime_state();
        let selector = MoveFamilySelector::new(&Default::default());
        let mut rng = ChaCha12Rng::seed_from_u64(7);
        let sampler = CandidateSampler;
        let sampled = sampler.select_previewed_move(
            &state,
            &selector,
            &[0],
            SwapSamplingOptions::default(),
            &mut rng,
        );
        assert!(sampled.selection.is_some());
    }

    #[test]
    fn default_sampler_can_find_a_swap_preview_on_simple_state() {
        let state = simple_runtime_state();
        let selector = MoveFamilySelector::new(&Default::default());
        let mut rng = ChaCha12Rng::seed_from_u64(7);
        let sampler = CandidateSampler;
        let sampled = sampler.select_previewed_move_default(&state, &selector, &[0], &mut rng);
        assert!(sampled.is_some());
    }

    #[test]
    fn swap_eligibility_filters_immovable_and_clique_locked_people() {
        let state = restricted_swap_runtime_state();
        let cp = &state.compiled;

        assert!(!super::is_runtime_swappable_person(
            &state,
            0,
            cp.person_id_to_idx["p0"]
        ));
        assert!(!super::is_runtime_swappable_person(
            &state,
            0,
            cp.person_id_to_idx["p1"]
        ));
        assert!(super::is_runtime_swappable_person(
            &state,
            0,
            cp.person_id_to_idx["p2"]
        ));
        assert!(super::is_runtime_swappable_person(
            &state,
            0,
            cp.person_id_to_idx["p3"]
        ));
        assert!(!super::is_runtime_swappable_person(
            &state,
            0,
            cp.person_id_to_idx["p4"]
        ));
        assert!(super::runtime_session_can_swap(&state, 0));
    }

    #[test]
    fn random_swap_sampler_only_selects_swappable_endpoints() {
        let state = restricted_swap_runtime_state();
        let cp = &state.compiled;
        let mut rng = ChaCha12Rng::seed_from_u64(7);
        let sampler = CandidateSampler;
        let preview = sampler
            .sample_random_swap_preview_in_session(
                &state,
                0,
                SwapSamplingOptions::default(),
                &mut Default::default(),
                &mut rng,
            )
            .expect("swap preview should exist for the two remaining swappable people");

        let mut sampled = [
            preview.analysis.swap.left_person_idx,
            preview.analysis.swap.right_person_idx,
        ];
        sampled.sort_unstable();
        let mut expected = [cp.person_id_to_idx["p2"], cp.person_id_to_idx["p3"]];
        expected.sort_unstable();
        assert_eq!(sampled, expected);
    }

    #[test]
    fn random_swap_sampler_returns_none_when_all_proposals_are_tabu() {
        let state = repeated_pair_runtime_state();
        let selector = MoveFamilySelector::new(&crate::models::MovePolicy {
            forced_family: Some(crate::models::MoveFamily::Swap),
            ..Default::default()
        });
        let mut tabu = SgpWeekPairTabuState::new(&state.compiled, tabu_config());
        let mut tabu_rng = ChaCha12Rng::seed_from_u64(13);
        for &(left, right) in &[(0, 2), (0, 3), (1, 2), (1, 3)] {
            tabu.record_swap(&state.compiled, 0, left, right, 0, 0, &mut tabu_rng);
        }

        let mut rng = ChaCha12Rng::seed_from_u64(7);
        let sampler = CandidateSampler;
        let sampled = sampler.select_previewed_move(
            &state,
            &selector,
            &[0],
            SwapSamplingOptions {
                tabu: Some(&tabu),
                tabu_retry_cap: 4,
                current_iteration: 0,
                ..Default::default()
            },
            &mut rng,
        );

        assert!(sampled.selection.is_none());
        assert_eq!(sampled.tabu_swap_sampling.prefilter_skips, 4);
        assert_eq!(sampled.tabu_swap_sampling.raw_tabu_hits, 4);
        assert_eq!(sampled.tabu_swap_sampling.retry_exhaustions, 1);
        assert_eq!(sampled.tabu_swap_sampling.hard_blocks, 1);
        assert_eq!(sampled.tabu_swap_sampling.aspiration_preview_surfaces, 0);
    }

    #[cfg(feature = "solver3-experimental-repeat-guidance")]
    #[test]
    fn repeat_guided_sampler_honors_allowed_sessions() {
        let state = repeated_pair_runtime_state();
        let guidance = RepeatGuidanceState::build_from_state(&state).unwrap();
        let selector = MoveFamilySelector::new(&crate::models::MovePolicy {
            forced_family: Some(crate::models::MoveFamily::Swap),
            ..Default::default()
        });
        let mut rng = ChaCha12Rng::seed_from_u64(7);
        let sampler = CandidateSampler;

        let (_family, preview, _seconds) = sampler
            .select_previewed_move(
                &state,
                &selector,
                &[1],
                SwapSamplingOptions {
                    repeat_guidance: Some(&guidance),
                    repeat_guided_swap_probability: 1.0,
                    repeat_guided_swap_candidate_preview_budget: 8,
                    ..Default::default()
                },
                &mut rng,
            )
            .selection
            .expect("guided swap preview should be sampled");

        assert_eq!(preview.session_idx(), 1);
    }

    #[cfg(feature = "solver3-experimental-repeat-guidance")]
    #[test]
    fn repeat_guided_sampler_falls_back_to_random_without_guidance() {
        let state = simple_runtime_state();
        let selector = MoveFamilySelector::new(&crate::models::MovePolicy {
            forced_family: Some(crate::models::MoveFamily::Swap),
            ..Default::default()
        });
        let mut rng = ChaCha12Rng::seed_from_u64(7);
        let sampler = CandidateSampler;

        let sampled = sampler.select_previewed_move(
            &state,
            &selector,
            &[0],
            SwapSamplingOptions {
                repeat_guidance: None,
                repeat_guided_swap_probability: 1.0,
                repeat_guided_swap_candidate_preview_budget: 8,
                ..Default::default()
            },
            &mut rng,
        );

        assert!(sampled.selection.is_some());
        assert_eq!(sampled.repeat_guided_swap_sampling.guided_attempts, 0);
        assert_eq!(sampled.repeat_guided_swap_sampling.guided_successes, 0);
        assert_eq!(
            sampled
                .repeat_guided_swap_sampling
                .guided_previewed_candidates,
            0
        );
    }

    #[cfg(feature = "solver3-experimental-repeat-guidance")]
    #[test]
    fn repeat_guided_sampler_centers_swap_on_active_offender_pair() {
        let state = repeated_pair_runtime_state();
        let guidance = RepeatGuidanceState::build_from_state(&state).unwrap();
        let selector = MoveFamilySelector::new(&crate::models::MovePolicy {
            forced_family: Some(crate::models::MoveFamily::Swap),
            ..Default::default()
        });
        let mut rng = ChaCha12Rng::seed_from_u64(3);
        let sampler = CandidateSampler;

        let (_family, preview, _seconds) = sampler
            .select_previewed_move(
                &state,
                &selector,
                &[0, 1],
                SwapSamplingOptions {
                    repeat_guidance: Some(&guidance),
                    repeat_guided_swap_probability: 1.0,
                    repeat_guided_swap_candidate_preview_budget: 8,
                    ..Default::default()
                },
                &mut rng,
            )
            .selection
            .expect("guided swap preview should be sampled");

        match preview {
            SearchMovePreview::Swap(preview) => {
                let swap = preview.analysis.swap;
                assert!(
                    swap.left_person_idx == 0
                        || swap.left_person_idx == 1
                        || swap.right_person_idx == 0
                        || swap.right_person_idx == 1,
                    "guided swap should involve one offender endpoint: {:?}",
                    swap
                );
            }
            other => panic!("expected swap preview, got {other:?}"),
        }
    }

    #[cfg(feature = "solver3-experimental-repeat-guidance")]
    #[test]
    fn guided_swap_sampler_returns_none_when_guided_and_random_proposals_are_tabu() {
        let state = repeated_pair_runtime_state();
        let guidance = RepeatGuidanceState::build_from_state(&state).unwrap();
        let selector = MoveFamilySelector::new(&crate::models::MovePolicy {
            forced_family: Some(crate::models::MoveFamily::Swap),
            ..Default::default()
        });
        let mut tabu = SgpWeekPairTabuState::new(&state.compiled, tabu_config());
        let mut tabu_rng = ChaCha12Rng::seed_from_u64(17);
        for session_idx in [0usize, 1usize] {
            for &(left, right) in &[(0, 2), (0, 3), (1, 2), (1, 3)] {
                tabu.record_swap(
                    &state.compiled,
                    session_idx,
                    left,
                    right,
                    0,
                    0,
                    &mut tabu_rng,
                );
            }
        }

        let mut rng = ChaCha12Rng::seed_from_u64(3);
        let sampler = CandidateSampler;
        let sampled = sampler.select_previewed_move(
            &state,
            &selector,
            &[0, 1],
            SwapSamplingOptions {
                repeat_guidance: Some(&guidance),
                repeat_guided_swap_probability: 1.0,
                repeat_guided_swap_candidate_preview_budget: 8,
                tabu: Some(&tabu),
                tabu_retry_cap: 4,
                tabu_allow_aspiration_preview: false,
                current_iteration: 0,
                ..Default::default()
            },
            &mut rng,
        );

        assert!(sampled.selection.is_none());
    }

    #[cfg(feature = "solver3-experimental-conflict-restricted-sampling")]
    #[test]
    fn conflict_restricted_sampler_keeps_swap_endpoint_inside_conflict_position() {
        let state = repeated_pair_runtime_state();
        let conflicts = SgpConflictState::build_from_state(&state, &[0, 1]).unwrap();
        let selector = MoveFamilySelector::new(&crate::models::MovePolicy {
            forced_family: Some(crate::models::MoveFamily::Swap),
            ..Default::default()
        });
        let mut rng = ChaCha12Rng::seed_from_u64(5);
        let sampler = CandidateSampler;

        let (_family, preview, _seconds) = sampler
            .select_previewed_move(
                &state,
                &selector,
                &[0, 1],
                SwapSamplingOptions {
                    sgp_conflicts: Some(&conflicts),
                    ..Default::default()
                },
                &mut rng,
            )
            .selection
            .expect("conflict-restricted swap preview should be sampled");

        match preview {
            SearchMovePreview::Swap(preview) => {
                let swap = preview.analysis.swap;
                let conflicted_people = conflicts.conflicted_people_in_session(swap.session_idx);
                assert!(
                    conflicted_people.contains(&swap.left_person_idx)
                        || conflicted_people.contains(&swap.right_person_idx),
                    "conflict-restricted swap should touch a conflict position: {:?}",
                    swap
                );
            }
            other => panic!("expected swap preview, got {other:?}"),
        }
    }

    #[cfg(feature = "solver3-experimental-conflict-restricted-sampling")]
    #[test]
    fn conflict_restricted_sampler_falls_back_to_random_when_no_conflicts_exist() {
        let state = repeat_constrained_non_conflicting_state();
        let conflicts = SgpConflictState::build_from_state(&state, &[0]).unwrap();
        let selector = MoveFamilySelector::new(&crate::models::MovePolicy {
            forced_family: Some(crate::models::MoveFamily::Swap),
            ..Default::default()
        });
        let mut rng = ChaCha12Rng::seed_from_u64(7);
        let sampler = CandidateSampler;

        let sampled = sampler.select_previewed_move(
            &state,
            &selector,
            &[0],
            SwapSamplingOptions {
                sgp_conflicts: Some(&conflicts),
                ..Default::default()
            },
            &mut rng,
        );

        assert!(sampled.selection.is_some());
    }

    #[test]
    fn tabu_sampling_can_return_preview_for_aspiration_check_after_retry_cap() {
        let state = repeated_pair_runtime_state();
        let selector = MoveFamilySelector::new(&crate::models::MovePolicy {
            forced_family: Some(crate::models::MoveFamily::Swap),
            ..Default::default()
        });
        let mut tabu = SgpWeekPairTabuState::new(&state.compiled, tabu_config());
        let mut tabu_rng = ChaCha12Rng::seed_from_u64(21);
        for &(left, right) in &[(0, 2), (0, 3), (1, 2), (1, 3)] {
            tabu.record_swap(&state.compiled, 0, left, right, 0, 0, &mut tabu_rng);
        }

        let mut rng = ChaCha12Rng::seed_from_u64(7);
        let sampler = CandidateSampler;
        let sampled = sampler.select_previewed_move(
            &state,
            &selector,
            &[0],
            SwapSamplingOptions {
                tabu: Some(&tabu),
                tabu_retry_cap: 4,
                tabu_allow_aspiration_preview: true,
                current_iteration: 0,
                ..Default::default()
            },
            &mut rng,
        );

        assert!(sampled.selection.is_some());
        assert_eq!(sampled.tabu_swap_sampling.prefilter_skips, 4);
        assert_eq!(sampled.tabu_swap_sampling.retry_exhaustions, 1);
        assert_eq!(sampled.tabu_swap_sampling.hard_blocks, 0);
        assert_eq!(sampled.tabu_swap_sampling.aspiration_preview_surfaces, 1);
    }
}
