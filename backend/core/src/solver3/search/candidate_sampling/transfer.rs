use rand::RngExt;
use rand_chacha::ChaCha12Rng;

use super::super::super::moves::{
    preview_transfer_runtime_checked, TransferMove, TransferRuntimePreview,
};
use super::super::super::runtime_state::RuntimeState;
use super::{
    runtime_session_can_transfer, runtime_transfer_source_group,
    runtime_transfer_target_has_capacity, CandidateSampler, MAX_RANDOM_CANDIDATE_ATTEMPTS,
    MAX_RANDOM_TARGET_ATTEMPTS,
};

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
