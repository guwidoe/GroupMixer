//! Reusable runtime patch primitives for `solver3` move kernels.
//!
//! Move families produce compact patches that can be applied directly to
//! `RuntimeState` without full oracle recomputation.

use crate::solver3::RuntimeState;
use crate::solver_support::SolverError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PersonLocationUpdate {
    pub session_idx: usize,
    pub person_idx: usize,
    pub new_group_idx: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GroupMembersPatchOp {
    ReplaceAt {
        session_idx: usize,
        group_idx: usize,
        member_pos: usize,
        expected_old_person_idx: usize,
        new_person_idx: usize,
    },
    RemoveAt {
        session_idx: usize,
        group_idx: usize,
        member_pos: usize,
        expected_person_idx: usize,
    },
    Insert {
        session_idx: usize,
        group_idx: usize,
        person_idx: usize,
    },
    Reset {
        session_idx: usize,
        group_idx: usize,
        new_members: Vec<usize>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PairContactUpdate {
    pub pair_idx: usize,
    pub new_count: u16,
}

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct ScoreDelta {
    pub unique_contacts_delta: i32,
    pub repetition_penalty_raw_delta: i32,
    pub weighted_repetition_penalty_delta: f64,
    pub attribute_balance_penalty_delta: f64,
    pub constraint_penalty_weighted_delta: f64,
    pub total_score_delta: f64,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct RuntimePatch {
    pub person_location_updates: Vec<PersonLocationUpdate>,
    pub group_member_ops: Vec<GroupMembersPatchOp>,
    pub pair_contact_updates: Vec<PairContactUpdate>,
    pub score_delta: ScoreDelta,
}

pub fn apply_runtime_patch(
    state: &mut RuntimeState,
    patch: &RuntimePatch,
) -> Result<(), SolverError> {
    for op in &patch.group_member_ops {
        match *op {
            GroupMembersPatchOp::ReplaceAt {
                session_idx,
                group_idx,
                member_pos,
                expected_old_person_idx,
                new_person_idx,
            } => {
                let slot = state.group_slot(session_idx, group_idx);
                let members = &mut state.group_members[slot];
                if member_pos >= members.len() {
                    return Err(SolverError::ValidationError(
                        "solver3 patch replace failed: member position out of range".into(),
                    ));
                }
                if members[member_pos] != expected_old_person_idx {
                    return Err(SolverError::ValidationError(
                        "solver3 patch replace failed: unexpected member at target position".into(),
                    ));
                }
                members[member_pos] = new_person_idx;
            }
            GroupMembersPatchOp::RemoveAt {
                session_idx,
                group_idx,
                member_pos,
                expected_person_idx,
            } => {
                let slot = state.group_slot(session_idx, group_idx);
                let members = &mut state.group_members[slot];
                if member_pos >= members.len() {
                    return Err(SolverError::ValidationError(
                        "solver3 patch remove failed: member position out of range".into(),
                    ));
                }
                if members[member_pos] != expected_person_idx {
                    return Err(SolverError::ValidationError(
                        "solver3 patch remove failed: target member did not match expectation"
                            .into(),
                    ));
                }
                members.swap_remove(member_pos);
                state.group_sizes[slot] = state.group_sizes[slot].saturating_sub(1);
            }
            GroupMembersPatchOp::Insert {
                session_idx,
                group_idx,
                person_idx,
            } => {
                let slot = state.group_slot(session_idx, group_idx);
                state.group_members[slot].push(person_idx);
                state.group_sizes[slot] += 1;
            }
            GroupMembersPatchOp::Reset {
                session_idx,
                group_idx,
                ref new_members,
            } => {
                let slot = state.group_slot(session_idx, group_idx);
                let members = &mut state.group_members[slot];
                members.clear();
                members.extend_from_slice(new_members);
                state.group_sizes[slot] = new_members.len();
            }
        }
    }

    for update in &patch.person_location_updates {
        let ps = state.people_slot(update.session_idx, update.person_idx);
        state.person_location[ps] = update.new_group_idx;
    }

    for update in &patch.pair_contact_updates {
        if update.pair_idx >= state.pair_contacts.len() {
            return Err(SolverError::ValidationError(
                "solver3 patch pair contact update out of range".into(),
            ));
        }
        state.pair_contacts[update.pair_idx] = update.new_count;
    }

    state.unique_contacts = add_signed_u32(
        state.unique_contacts,
        patch.score_delta.unique_contacts_delta,
    )?;
    state.repetition_penalty_raw = state
        .repetition_penalty_raw
        .checked_add(patch.score_delta.repetition_penalty_raw_delta)
        .ok_or_else(|| {
            SolverError::ValidationError("solver3 patch overflow in repetition_penalty_raw".into())
        })?;
    state.weighted_repetition_penalty += patch.score_delta.weighted_repetition_penalty_delta;
    state.attribute_balance_penalty += patch.score_delta.attribute_balance_penalty_delta;
    state.constraint_penalty_weighted += patch.score_delta.constraint_penalty_weighted_delta;

    state.total_score = state.weighted_repetition_penalty
        + state.attribute_balance_penalty
        + state.constraint_penalty_weighted
        - (state.unique_contacts as f64 * state.compiled.maximize_unique_contacts_weight)
        + state.compiled.baseline_score;

    Ok(())
}

fn add_signed_u32(value: u32, delta: i32) -> Result<u32, SolverError> {
    let next = value as i64 + delta as i64;
    if !(0..=u32::MAX as i64).contains(&next) {
        return Err(SolverError::ValidationError(
            "solver3 patch produced out-of-range unique_contacts".into(),
        ));
    }
    Ok(next as u32)
}
