#[cfg(not(target_arch = "wasm32"))]
use std::time::Instant;

#[cfg(target_arch = "wasm32")]
use js_sys;

use rand::{seq::SliceRandom, RngExt};
use rand_chacha::ChaCha12Rng;

use crate::models::MoveFamily;

use super::super::moves::{
    preview_clique_swap_runtime_lightweight, preview_swap_runtime_lightweight,
    preview_transfer_runtime_lightweight, CliqueSwapMove, CliqueSwapRuntimePreview,
    PairContactUpdate, SwapMove, SwapRuntimePreview, TransferMove, TransferRuntimePreview,
};
use super::super::runtime_state::RuntimeState;
use super::family_selection::MoveFamilySelector;
use super::repeat_guidance::RepeatGuidanceState;
use super::tabu::SgpWeekPairTabuState;

const MAX_RANDOM_CANDIDATE_ATTEMPTS: usize = 24;
const MAX_RANDOM_TARGET_ATTEMPTS: usize = 24;

#[cfg(not(target_arch = "wasm32"))]
fn get_current_time() -> Instant {
    Instant::now()
}

#[cfg(target_arch = "wasm32")]
fn get_current_time() -> f64 {
    js_sys::Date::now()
}

#[cfg(not(target_arch = "wasm32"))]
fn get_elapsed_seconds_between(start: Instant, end: Instant) -> f64 {
    end.duration_since(start).as_secs_f64()
}

#[cfg(target_arch = "wasm32")]
fn get_elapsed_seconds_between(start: f64, end: f64) -> f64 {
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

    #[cfg(test)]
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

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub(crate) struct RepeatGuidedSwapSamplingDelta {
    pub(crate) guided_attempts: u64,
    pub(crate) guided_successes: u64,
    pub(crate) guided_fallback_to_random: u64,
    pub(crate) guided_previewed_candidates: u64,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct CandidateSelectionResult {
    pub(crate) selection: Option<(MoveFamily, SearchMovePreview, f64)>,
    pub(crate) repeat_guided_swap_sampling: RepeatGuidedSwapSamplingDelta,
}

#[derive(Debug, Clone, PartialEq)]
struct GuidedSwapSamplingPreviewResult {
    preview: Option<SwapRuntimePreview>,
    previewed_candidates: u64,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct SwapSamplingOptions<'a> {
    pub(crate) repeat_guidance: Option<&'a RepeatGuidanceState>,
    pub(crate) repeat_guided_swap_probability: f64,
    pub(crate) repeat_guided_swap_candidate_preview_budget: usize,
    pub(crate) tabu: Option<&'a SgpWeekPairTabuState>,
    pub(crate) tabu_retry_cap: usize,
    pub(crate) tabu_allow_aspiration_preview: bool,
    pub(crate) current_iteration: u64,
}

impl Default for SwapSamplingOptions<'_> {
    fn default() -> Self {
        Self {
            repeat_guidance: None,
            repeat_guided_swap_probability: 0.0,
            repeat_guided_swap_candidate_preview_budget: 0,
            tabu: None,
            tabu_retry_cap: 0,
            tabu_allow_aspiration_preview: false,
            current_iteration: 0,
        }
    }
}

impl CandidateSampler {
    #[inline]
    pub(crate) fn select_previewed_move(
        &self,
        state: &RuntimeState,
        family_selector: &MoveFamilySelector,
        allowed_sessions: &[usize],
        swap_sampling: SwapSamplingOptions<'_>,
        rng: &mut ChaCha12Rng,
    ) -> CandidateSelectionResult {
        let ordered_families = family_selector.ordered_families(rng);
        let mut repeat_guided_swap_sampling = RepeatGuidedSwapSamplingDelta::default();
        for family in ordered_families {
            let preview_started_at = get_current_time();
            let (preview, sampling_delta) =
                self.sample_preview_for_family(state, family, allowed_sessions, swap_sampling, rng);
            repeat_guided_swap_sampling.guided_attempts += sampling_delta.guided_attempts;
            repeat_guided_swap_sampling.guided_successes += sampling_delta.guided_successes;
            repeat_guided_swap_sampling.guided_fallback_to_random +=
                sampling_delta.guided_fallback_to_random;
            repeat_guided_swap_sampling.guided_previewed_candidates +=
                sampling_delta.guided_previewed_candidates;
            let preview_seconds =
                get_elapsed_seconds_between(preview_started_at, get_current_time());
            if let Some(preview) = preview {
                return CandidateSelectionResult {
                    selection: Some((family, preview, preview_seconds)),
                    repeat_guided_swap_sampling,
                };
            }
        }

        CandidateSelectionResult {
            selection: None,
            repeat_guided_swap_sampling,
        }
    }

    #[inline]
    fn sample_preview_for_family(
        &self,
        state: &RuntimeState,
        family: MoveFamily,
        allowed_sessions: &[usize],
        swap_sampling: SwapSamplingOptions<'_>,
        rng: &mut ChaCha12Rng,
    ) -> (Option<SearchMovePreview>, RepeatGuidedSwapSamplingDelta) {
        match family {
            MoveFamily::Swap => self
                .sample_swap_preview(state, allowed_sessions, swap_sampling, rng)
                .map(|(preview, telemetry)| (preview.map(SearchMovePreview::Swap), telemetry))
                .unwrap_or_default(),
            MoveFamily::Transfer => self
                .sample_transfer_preview(state, allowed_sessions, rng)
                .map(SearchMovePreview::Transfer)
                .map(|preview| (Some(preview), RepeatGuidedSwapSamplingDelta::default()))
                .unwrap_or_default(),
            MoveFamily::CliqueSwap => self
                .sample_clique_swap_preview(state, allowed_sessions, rng)
                .map(SearchMovePreview::CliqueSwap)
                .map(|preview| (Some(preview), RepeatGuidedSwapSamplingDelta::default()))
                .unwrap_or_default(),
        }
    }

    fn sample_swap_preview(
        &self,
        state: &RuntimeState,
        allowed_sessions: &[usize],
        swap_sampling: SwapSamplingOptions<'_>,
        rng: &mut ChaCha12Rng,
    ) -> Option<(Option<SwapRuntimePreview>, RepeatGuidedSwapSamplingDelta)> {
        if allowed_sessions.is_empty() || state.compiled.num_groups < 2 {
            return Some((None, RepeatGuidedSwapSamplingDelta::default()));
        }

        let mut telemetry = RepeatGuidedSwapSamplingDelta::default();

        let guided_preview = if swap_sampling.repeat_guided_swap_candidate_preview_budget > 0
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

        if let Some(guided_preview) = guided_preview {
            telemetry.guided_previewed_candidates += guided_preview.previewed_candidates;
            if let Some(preview) = guided_preview.preview {
                telemetry.guided_successes += 1;
                return Some((Some(preview), telemetry));
            }
            telemetry.guided_fallback_to_random += 1;
        }

        Some((
            self.sample_random_swap_preview(state, allowed_sessions, swap_sampling, rng),
            telemetry,
        ))
    }

    fn sample_random_swap_preview(
        &self,
        state: &RuntimeState,
        allowed_sessions: &[usize],
        swap_sampling: SwapSamplingOptions<'_>,
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
                rng,
                &mut tabu_retry_count,
                &mut fallback_tabu_swap,
            ) {
                return Some(preview);
            }
            if tabu_retry_count >= swap_sampling.tabu_retry_cap {
                break;
            }
        }

        fallback_tabu_swap.and_then(|swap| preview_swap_runtime_lightweight(state, &swap).ok())
    }

    pub(crate) fn sample_random_swap_preview_in_session(
        &self,
        state: &RuntimeState,
        session_idx: usize,
        swap_sampling: SwapSamplingOptions<'_>,
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
                rng,
                &mut tabu_retry_count,
                &mut fallback_tabu_swap,
            ) {
                return Some(preview);
            }
            if tabu_retry_count >= swap_sampling.tabu_retry_cap {
                break;
            }
        }

        fallback_tabu_swap.and_then(|swap| preview_swap_runtime_lightweight(state, &swap).ok())
    }

    fn sample_random_swap_preview_for_session(
        &self,
        state: &RuntimeState,
        session_idx: usize,
        swap_sampling: SwapSamplingOptions<'_>,
        rng: &mut ChaCha12Rng,
        tabu_retry_count: &mut usize,
        fallback_tabu_swap: &mut Option<SwapMove>,
    ) -> Option<SwapRuntimePreview> {
        for _ in 0..MAX_RANDOM_TARGET_ATTEMPTS {
            let left_group_idx = rng.random_range(0..state.compiled.num_groups);
            let mut right_group_idx = rng.random_range(0..state.compiled.num_groups);
            if right_group_idx == left_group_idx {
                right_group_idx = (right_group_idx + 1) % state.compiled.num_groups;
            }

            let left_slot = state.group_slot(session_idx, left_group_idx);
            let right_slot = state.group_slot(session_idx, right_group_idx);
            let left_members = &state.group_members[left_slot];
            let right_members = &state.group_members[right_slot];
            if left_members.is_empty() || right_members.is_empty() {
                continue;
            }

            let left_person_idx = left_members[rng.random_range(0..left_members.len())];
            let right_person_idx = right_members[rng.random_range(0..right_members.len())];
            let swap = SwapMove::new(session_idx, left_person_idx, right_person_idx);
            if should_skip_tabu_swap_proposal(
                &swap_sampling,
                state,
                session_idx,
                left_person_idx,
                right_person_idx,
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
            if let Ok(preview) = preview_swap_runtime_lightweight(state, &swap) {
                return Some(preview);
            }
        }

        None
    }

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
        let anchor_person_idx = choose_repeat_guided_anchor_person(
            guidance,
            left_person_idx,
            right_person_idx,
            rng,
        );
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

                if should_skip_tabu_swap_proposal(
                    &swap_sampling,
                    state,
                    session_idx,
                    anchor_person_idx,
                    target_person_idx,
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
                if let Ok(preview) = preview_swap_runtime_lightweight(state, &swap) {
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
                        return Some(GuidedSwapSamplingPreviewResult {
                            preview: best_preview,
                            previewed_candidates: previewed_candidates as u64,
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
                if let Ok(preview) = preview_swap_runtime_lightweight(state, &swap) {
                    best_preview = Some(preview);
                    previewed_candidates += 1;
                }
            }
        }

        Some(GuidedSwapSamplingPreviewResult {
            preview: best_preview,
            previewed_candidates: previewed_candidates as u64,
        })
    }

    fn sample_transfer_preview(
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
                if let Ok(preview) = preview_transfer_runtime_lightweight(state, &transfer) {
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
                    if let Ok(preview) = preview_transfer_runtime_lightweight(state, &transfer) {
                        return Some(preview);
                    }
                }
            }
        }

        None
    }

    fn sample_clique_swap_preview(
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
                if let Ok(preview) = preview_clique_swap_runtime_lightweight(state, &clique_swap) {
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
                    if let Ok(preview) =
                        preview_clique_swap_runtime_lightweight(state, &clique_swap)
                    {
                        return Some(preview);
                    }
                }
            }
        }

        None
    }
}

#[inline]
fn should_skip_tabu_swap_proposal(
    swap_sampling: &SwapSamplingOptions<'_>,
    state: &RuntimeState,
    session_idx: usize,
    left_person_idx: usize,
    right_person_idx: usize,
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

    *tabu_retry_count = tabu_retry_count.saturating_add(1);
    true
}

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

fn runtime_session_can_clique_swap(state: &RuntimeState, session_idx: usize) -> bool {
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

fn runtime_active_clique_in_single_group(
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

fn runtime_pick_clique_targets(
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
        .filter(|person_idx| {
            !active_members.contains(person_idx)
                && state.compiled.person_participation[**person_idx][session_idx]
                && state.compiled.person_to_clique_id[session_idx][**person_idx].is_none()
                && state
                    .compiled
                    .immovable_group(session_idx, **person_idx)
                    .is_none()
        })
        .count();

    eligible >= active_members.len()
}

fn runtime_session_can_transfer(state: &RuntimeState, session_idx: usize) -> bool {
    let has_capacity_target = (0..state.compiled.num_groups)
        .any(|group_idx| runtime_transfer_target_has_capacity(state, session_idx, group_idx));
    let has_nonempty_source = (0..state.compiled.num_groups)
        .any(|group_idx| state.group_sizes[state.group_slot(session_idx, group_idx)] > 1);
    has_capacity_target && has_nonempty_source
}

fn runtime_transfer_source_group(
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

fn runtime_transfer_target_has_capacity(
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
        ApiInput, Group, Objective, Person, ProblemDefinition, Solver3Params, SolverConfiguration,
        SolverParams, StopConditions,
    };

    use super::super::super::runtime_state::RuntimeState;
    use super::super::family_selection::MoveFamilySelector;
    use super::super::repeat_guidance::RepeatGuidanceState;
    use super::super::tabu::{SgpWeekPairTabuConfig, SgpWeekPairTabuState};
    use super::{CandidateSampler, SearchMovePreview, SwapSamplingOptions};

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

    fn tabu_config() -> SgpWeekPairTabuConfig {
        SgpWeekPairTabuConfig {
            tenure_min: 10,
            tenure_max: 10,
            retry_cap: 4,
            aspiration_enabled: true,
        }
    }

    #[test]
    fn sampler_returns_none_when_no_sessions_allowed() {
        let state = simple_runtime_state();
        let selector = MoveFamilySelector::new(&Default::default());
        let mut rng = ChaCha12Rng::seed_from_u64(7);
        let sampler = CandidateSampler;
        assert!(sampler
            .select_previewed_move(&state, &selector, &[], SwapSamplingOptions::default(), &mut rng)
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
    fn random_swap_sampler_returns_none_when_all_proposals_are_tabu() {
        let state = repeated_pair_runtime_state();
        let selector = MoveFamilySelector::new(&crate::models::MovePolicy {
            forced_family: Some(crate::models::MoveFamily::Swap),
            ..Default::default()
        });
        let mut tabu = SgpWeekPairTabuState::new(&state.compiled, tabu_config());
        let mut tabu_rng = ChaCha12Rng::seed_from_u64(13);
        for &(left, right) in &[(0, 2), (0, 3), (1, 2), (1, 3)] {
            tabu.record_swap(&state.compiled, 0, left, right, 0, &mut tabu_rng);
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
    }

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
    }

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
                tabu.record_swap(&state.compiled, session_idx, left, right, 0, &mut tabu_rng);
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
            },
            &mut rng,
        );

        assert!(sampled.selection.is_none());
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
            tabu.record_swap(&state.compiled, 0, left, right, 0, &mut tabu_rng);
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
    }
}
