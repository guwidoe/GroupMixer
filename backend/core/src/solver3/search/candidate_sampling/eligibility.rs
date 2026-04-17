use rand::RngExt;
use rand_chacha::ChaCha12Rng;

use super::super::super::runtime_state::RuntimeState;

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
