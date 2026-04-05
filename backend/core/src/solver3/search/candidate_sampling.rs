use std::time::Instant;

use rand::RngExt;
use rand_chacha::ChaCha12Rng;

use crate::models::MoveFamily;

use super::family_selection::MoveFamilySelector;
use super::super::moves::{
    preview_clique_swap_runtime_lightweight, preview_swap_runtime_lightweight,
    preview_transfer_runtime_lightweight, CliqueSwapMove, CliqueSwapRuntimePreview, SwapMove,
    SwapRuntimePreview, TransferMove, TransferRuntimePreview,
};
use super::super::runtime_state::RuntimeState;

const MAX_RANDOM_CANDIDATE_ATTEMPTS: usize = 24;
const MAX_RANDOM_TARGET_ATTEMPTS: usize = 24;

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

impl CandidateSampler {
    #[inline]
    pub(crate) fn select_previewed_move(
        &self,
        state: &RuntimeState,
        family_selector: &MoveFamilySelector,
        allowed_sessions: &[usize],
        rng: &mut ChaCha12Rng,
    ) -> Option<(MoveFamily, SearchMovePreview, f64)> {
        let ordered_families = family_selector.ordered_families(rng);
        for family in ordered_families {
            let preview_started_at = Instant::now();
            let preview = self.sample_preview_for_family(state, family, allowed_sessions, rng);
            let preview_seconds = preview_started_at.elapsed().as_secs_f64();
            if let Some(preview) = preview {
                return Some((family, preview, preview_seconds));
            }
        }

        None
    }

    #[inline]
    fn sample_preview_for_family(
        &self,
        state: &RuntimeState,
        family: MoveFamily,
        allowed_sessions: &[usize],
        rng: &mut ChaCha12Rng,
    ) -> Option<SearchMovePreview> {
        match family {
            MoveFamily::Swap => {
                self.sample_swap_preview(state, allowed_sessions, rng)
                    .map(SearchMovePreview::Swap)
            }
            MoveFamily::Transfer => self
                .sample_transfer_preview(state, allowed_sessions, rng)
                .map(SearchMovePreview::Transfer),
            MoveFamily::CliqueSwap => self
                .sample_clique_swap_preview(state, allowed_sessions, rng)
                .map(SearchMovePreview::CliqueSwap),
        }
    }

    fn sample_swap_preview(
        &self,
        state: &RuntimeState,
        allowed_sessions: &[usize],
        rng: &mut ChaCha12Rng,
    ) -> Option<SwapRuntimePreview> {
        if allowed_sessions.is_empty() || state.compiled.num_groups < 2 {
            return None;
        }

        for _ in 0..MAX_RANDOM_CANDIDATE_ATTEMPTS {
            let session_idx = allowed_sessions[rng.random_range(0..allowed_sessions.len())];
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
            if let Ok(preview) = preview_swap_runtime_lightweight(state, &swap) {
                return Some(preview);
            }
        }

        None
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
            let Some(source_group_idx) = runtime_transfer_source_group(state, session_idx, person_idx)
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
                    let target_group_idx = (target_start + target_offset) % state.compiled.num_groups;
                    if target_group_idx == source_group_idx
                        || !runtime_transfer_target_has_capacity(state, session_idx, target_group_idx)
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
                    let target_group_idx = (target_start + target_offset) % state.compiled.num_groups;
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
                    if let Ok(preview) = preview_clique_swap_runtime_lightweight(state, &clique_swap)
                    {
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

    let source_group_idx = state.person_location[state.people_slot(session_idx, active_members[0])]?;

    if active_members.iter().any(|&member| {
        state.person_location[state.people_slot(session_idx, member)] != Some(source_group_idx)
    }) {
        return None;
    }

    if active_members
        .iter()
        .any(|&member| state.compiled.immovable_group(session_idx, member).is_some())
    {
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
            && state.compiled.immovable_group(session_idx, person_idx).is_none()
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
    let has_nonempty_source =
        (0..state.compiled.num_groups).any(|group_idx| state.group_sizes[state.group_slot(session_idx, group_idx)] > 1);
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
        && state.compiled.immovable_group(session_idx, person_idx).is_none()
        && state.compiled.person_to_clique_id[session_idx][person_idx].is_none()
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use rand::SeedableRng;
    use rand_chacha::ChaCha12Rng;

    use crate::models::{
        ApiInput, Group, Objective, Person, ProblemDefinition, Solver3Params,
        SolverConfiguration, SolverParams, StopConditions,
    };

    use super::CandidateSampler;
    use super::super::family_selection::MoveFamilySelector;
    use super::super::super::runtime_state::RuntimeState;

    fn solver3_config() -> SolverConfiguration {
        SolverConfiguration {
            solver_type: "solver3".to_string(),
            stop_conditions: StopConditions {
                max_iterations: None,
                time_limit_seconds: None,
                no_improvement_iterations: None,
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
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".into(),
                weight: 1.0,
            }],
            constraints: vec![],
            solver: solver3_config(),
        };
        RuntimeState::from_input(&input).unwrap()
    }

    #[test]
    fn sampler_returns_none_when_no_sessions_allowed() {
        let state = simple_runtime_state();
        let selector = MoveFamilySelector::new(&Default::default());
        let mut rng = ChaCha12Rng::seed_from_u64(7);
        let sampler = CandidateSampler;
        assert!(sampler
            .select_previewed_move(&state, &selector, &[], &mut rng)
            .is_none());
    }

    #[test]
    fn sampler_can_find_a_swap_preview_on_simple_state() {
        let state = simple_runtime_state();
        let selector = MoveFamilySelector::new(&Default::default());
        let mut rng = ChaCha12Rng::seed_from_u64(7);
        let sampler = CandidateSampler;
        let sampled = sampler.select_previewed_move(&state, &selector, &[0], &mut rng);
        assert!(sampled.is_some());
    }
}
