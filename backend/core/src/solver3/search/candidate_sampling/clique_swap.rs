use rand::RngExt;
use rand_chacha::ChaCha12Rng;

use super::super::super::moves::{
    preview_clique_swap_runtime_checked, CliqueSwapMove, CliqueSwapRuntimePreview,
};
use super::super::super::runtime_state::RuntimeState;
use super::{
    runtime_active_clique_in_single_group, runtime_pick_clique_targets,
    runtime_session_can_clique_swap, CandidateSampler, MAX_RANDOM_CANDIDATE_ATTEMPTS,
    MAX_RANDOM_TARGET_ATTEMPTS,
};

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
