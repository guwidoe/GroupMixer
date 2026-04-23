#[cfg(any(
    feature = "solver3-experimental-repeat-guidance",
    feature = "solver3-experimental-conflict-restricted-sampling"
))]
use rand::seq::SliceRandom;
use rand::RngExt;
use rand_chacha::ChaCha12Rng;

use super::super::super::moves::{preview_swap_runtime_trusted, SwapMove, SwapRuntimePreview};
use super::super::super::runtime_state::RuntimeState;
#[cfg(feature = "solver3-experimental-repeat-guidance")]
use super::super::repeat_guidance::RepeatGuidanceState;
#[cfg(feature = "solver3-experimental-conflict-restricted-sampling")]
use super::super::sgp_conflicts::SgpConflictState;
#[cfg(any(
    feature = "solver3-experimental-repeat-guidance",
    feature = "solver3-experimental-conflict-restricted-sampling"
))]
use super::is_runtime_swappable_person;
use super::{
    runtime_pick_swappable_person_from_group, runtime_session_can_swap, CandidateSampler,
    GuidedSwapSamplingPreviewResult, RepeatGuidedSwapSamplingDelta, SwapSamplingOptions,
    TabuSwapSamplingDelta, MAX_RANDOM_CANDIDATE_ATTEMPTS, MAX_RANDOM_TARGET_ATTEMPTS,
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
