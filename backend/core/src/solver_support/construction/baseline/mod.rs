//! Shared construction helpers for solver-family bootstrapping.
//!
//! This module intentionally hosts baseline schedule-construction behavior outside
//! of `solver1` ownership so other solver families can reuse the same bootstrap
//! semantics without copying logic.

use crate::models::ApiInput;
use crate::solver_support::validation::validate_schedule_as_construction_seed;
use crate::solver_support::SolverError;
use rand::prelude::IndexedRandom;
use rand::seq::SliceRandom;
use rand::{RngExt, SeedableRng};
use rand_chacha::ChaCha12Rng;
use std::collections::HashMap;

const BASELINE_CONSTRUCTION_SEED_SALT: u64 = 0x6a09e667f3bcc909;
const FREEDOM_AWARE_CONSTRUCTION_SEED_SALT: u64 = 0xbb67ae8584caa73b;
const PAPER_PAIR_REPEAT_PENALTY: i64 = 1_000_000;

fn derive_phase_seed(base_seed: u64, salt: u64) -> u64 {
    let mut z = base_seed
        .wrapping_add(salt)
        .wrapping_add(0x9e3779b97f4a7c15);
    z = (z ^ (z >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94d049bb133111eb);
    z ^ (z >> 31)
}

pub(crate) struct BaselineConstructionContext<'a> {
    pub effective_seed: u64,
    pub group_idx_to_id: &'a [String],
    pub person_idx_to_id: &'a [String],
    pub effective_group_capacities: &'a [usize],
    pub person_participation: &'a [Vec<bool>],
    pub immovable_people: &'a HashMap<(usize, usize), usize>,
    pub cliques: &'a [Vec<usize>],
    pub clique_sessions: &'a [Option<Vec<usize>>],
    pub hard_apart_partners_by_person_session: &'a [Vec<usize>],
    pub schedule: &'a mut Vec<Vec<Vec<usize>>>,
}

impl BaselineConstructionContext<'_> {
    #[inline]
    fn group_count(&self) -> usize {
        self.group_idx_to_id.len()
    }

    #[inline]
    fn people_count(&self) -> usize {
        self.person_idx_to_id.len()
    }

    #[inline]
    fn person_session_slot(&self, day: usize, person_idx: usize) -> usize {
        day * self.people_count() + person_idx
    }

    #[inline]
    fn hard_apart_partners(&self, day: usize, person_idx: usize) -> &[usize] {
        &self.hard_apart_partners_by_person_session[self.person_session_slot(day, person_idx)]
    }

    fn group_has_hard_apart_conflict(
        &self,
        day: usize,
        person_idx: usize,
        group_members: &[usize],
    ) -> bool {
        let partners = self.hard_apart_partners(day, person_idx);
        !partners.is_empty() && group_members.iter().any(|member| partners.contains(member))
    }

    fn block_has_hard_apart_conflict(
        &self,
        day: usize,
        block: &[usize],
        group_members: &[usize],
    ) -> bool {
        block.iter().any(|&person_idx| {
            self.group_has_hard_apart_conflict(day, person_idx, group_members)
                || block.iter().any(|&other_idx| {
                    other_idx != person_idx
                        && self
                            .hard_apart_partners(day, person_idx)
                            .contains(&other_idx)
                })
        })
    }
}

fn hard_apart_partners<'a>(
    hard_apart_partners_by_person_session: &'a [Vec<usize>],
    people_count: usize,
    day: usize,
    person_idx: usize,
) -> &'a [usize] {
    &hard_apart_partners_by_person_session[day * people_count + person_idx]
}

fn group_has_hard_apart_conflict(
    hard_apart_partners_by_person_session: &[Vec<usize>],
    people_count: usize,
    day: usize,
    person_idx: usize,
    group_members: &[usize],
) -> bool {
    let partners = hard_apart_partners(
        hard_apart_partners_by_person_session,
        people_count,
        day,
        person_idx,
    );
    !partners.is_empty() && group_members.iter().any(|member| partners.contains(member))
}

fn block_has_hard_apart_conflict(
    hard_apart_partners_by_person_session: &[Vec<usize>],
    people_count: usize,
    day: usize,
    block: &[usize],
    group_members: &[usize],
) -> bool {
    block.iter().any(|&person_idx| {
        group_has_hard_apart_conflict(
            hard_apart_partners_by_person_session,
            people_count,
            day,
            person_idx,
            group_members,
        ) || block.iter().any(|&other_idx| {
            other_idx != person_idx
                && hard_apart_partners(
                    hard_apart_partners_by_person_session,
                    people_count,
                    day,
                    person_idx,
                )
                .contains(&other_idx)
        })
    })
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct FreedomAwareConstructionParams {
    pub gamma: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PairFillMode {
    PaperPairSlots,
    ResidualExtended,
}

pub(crate) fn apply_construction_seed_schedule(
    context: &mut BaselineConstructionContext<'_>,
    input: &ApiInput,
) -> Result<(), SolverError> {
    let Some(construction_seed_schedule) = &input.construction_seed_schedule else {
        return Ok(());
    };
    let validated = validate_schedule_as_construction_seed(input, construction_seed_schedule)?;
    *context.schedule = validated.schedule;
    validate_seeded_hard_constraints(context)?;

    Ok(())
}

fn validate_seeded_hard_constraints(
    context: &BaselineConstructionContext<'_>,
) -> Result<(), SolverError> {
    let people_count = context.people_count();
    let num_sessions = context.schedule.len();

    let mut assigned_group_by_person = vec![vec![None; people_count]; num_sessions];
    for (day, groups) in context.schedule.iter().enumerate() {
        for (group_idx, members) in groups.iter().enumerate() {
            for &person_idx in members {
                assigned_group_by_person[day][person_idx] = Some(group_idx);
            }
        }
    }

    for ((person_idx, session_idx), &required_group_idx) in context.immovable_people.iter() {
        if let Some(actual_group_idx) = assigned_group_by_person[*session_idx][*person_idx] {
            if actual_group_idx != required_group_idx {
                return Err(SolverError::ValidationError(format!(
                    "construction seed places immovable person '{}' in group '{}' instead of '{}' for session {}",
                    context.person_idx_to_id[*person_idx],
                    context.group_idx_to_id[actual_group_idx],
                    context.group_idx_to_id[required_group_idx],
                    session_idx
                )));
            }
        }
    }

    for (clique_idx, clique) in context.cliques.iter().enumerate() {
        for day in 0..num_sessions {
            if let Some(sessions) = &context.clique_sessions[clique_idx] {
                if !sessions.contains(&day) {
                    continue;
                }
            }

            let assigned_members = clique
                .iter()
                .copied()
                .filter(|&person_idx| context.person_participation[person_idx][day])
                .filter_map(|person_idx| {
                    assigned_group_by_person[day][person_idx]
                        .map(|group_idx| (person_idx, group_idx))
                })
                .collect::<Vec<_>>();

            if assigned_members.len() < 2 {
                continue;
            }

            let first_group = assigned_members[0].1;
            if assigned_members
                .iter()
                .any(|&(_, group_idx)| group_idx != first_group)
            {
                let members = assigned_members
                    .iter()
                    .map(|&(person_idx, _)| context.person_idx_to_id[person_idx].clone())
                    .collect::<Vec<_>>();
                return Err(SolverError::ValidationError(format!(
                    "construction seed splits must-stay-together clique {:?} across multiple groups in session {}",
                    members, day
                )));
            }
        }
    }

    for (day, groups) in context.schedule.iter().enumerate() {
        for (group_idx, members) in groups.iter().enumerate() {
            for (pos, &person_idx) in members.iter().enumerate() {
                let others = [&members[..pos], &members[(pos + 1)..]].concat();
                if let Some(&other_idx) = others.iter().find(|&&other_idx| {
                    context
                        .hard_apart_partners(day, person_idx)
                        .binary_search(&other_idx)
                        .is_ok()
                }) {
                    return Err(SolverError::ValidationError(format!(
                        "construction seed places must-stay-apart pair ['{}', '{}'] together in group '{}' for session {}",
                        context.person_idx_to_id[person_idx],
                        context.person_idx_to_id[other_idx],
                        context.group_idx_to_id[group_idx],
                        day
                    )));
                }
            }
        }
    }

    Ok(())
}

pub(crate) fn apply_baseline_construction_heuristic(
    context: &mut BaselineConstructionContext<'_>,
) -> Result<(), SolverError> {
    let people_count = context.people_count();
    let group_count = context.group_count();
    let hard_apart_partners_by_person_session = context.hard_apart_partners_by_person_session;

    // Preserve the legacy solver1 construction heuristic exactly.
    let mut rng = ChaCha12Rng::seed_from_u64(derive_phase_seed(
        context.effective_seed,
        BASELINE_CONSTRUCTION_SEED_SALT,
    ));

    for (day, day_schedule) in context.schedule.iter_mut().enumerate() {
        let mut group_cursors = vec![0; group_count];
        let mut assigned_in_day = vec![false; people_count];

        // Warm-start aware: mark already placed people and count existing occupants.
        for (g_idx, members) in day_schedule.iter().enumerate() {
            group_cursors[g_idx] = members.len();
            for &p in members {
                if p < people_count {
                    assigned_in_day[p] = true;
                }
            }
        }

        let participating_people: Vec<usize> = (0..people_count)
            .filter(|&person_idx| context.person_participation[person_idx][day])
            .collect();

        // --- Step 1: Place all immovable people first ---
        for (person_idx, group_idx) in context
            .immovable_people
            .iter()
            .filter(|((_, s_idx), _)| *s_idx == day)
            .map(|((p_idx, _), g_idx)| (*p_idx, *g_idx))
        {
            if assigned_in_day[person_idx] {
                continue;
            }

            let group_size = context.effective_group_capacities[day * group_count + group_idx];
            if group_cursors[group_idx] >= group_size {
                return Err(SolverError::ValidationError(format!(
                    "Cannot place immovable person: group {} is full",
                    context.group_idx_to_id[group_idx]
                )));
            }

            if group_has_hard_apart_conflict(
                hard_apart_partners_by_person_session,
                people_count,
                day,
                person_idx,
                &day_schedule[group_idx],
            ) {
                return Err(SolverError::ValidationError(format!(
                    "Cannot place immovable person: group {} would violate MustStayApart for {}",
                    context.group_idx_to_id[group_idx], context.person_idx_to_id[person_idx]
                )));
            }

            day_schedule[group_idx].push(person_idx);
            group_cursors[group_idx] += 1;
            assigned_in_day[person_idx] = true;
        }

        // --- Step 2: Place cliques as units ---
        for clique_idx in 0..context.cliques.len() {
            let Some(active_members) = active_clique_members_for_day(
                context.cliques,
                context.clique_sessions,
                context.person_participation,
                clique_idx,
                day,
            ) else {
                continue;
            };

            let missing_members = active_members
                .iter()
                .filter(|&&member| !assigned_in_day[member])
                .count();
            if missing_members == 0 {
                continue;
            }

            let anchor_group =
                resolve_clique_anchor_group(day_schedule, clique_idx, day, &active_members)?;

            let mut placed = false;
            let potential_groups: Vec<usize> = if let Some(group_idx) = anchor_group {
                vec![group_idx]
            } else {
                let mut groups: Vec<usize> = (0..group_count).collect();
                groups.shuffle(&mut rng);
                groups
            };

            for group_idx in potential_groups {
                let group_size = context.effective_group_capacities[day * group_count + group_idx];
                let available_space = group_size.saturating_sub(group_cursors[group_idx]);

                if available_space >= missing_members
                    && !block_has_hard_apart_conflict(
                        hard_apart_partners_by_person_session,
                        people_count,
                        day,
                        &active_members,
                        &day_schedule[group_idx],
                    )
                {
                    for &member in &active_members {
                        if assigned_in_day[member] {
                            continue;
                        }
                        day_schedule[group_idx].push(member);
                        group_cursors[group_idx] += 1;
                        assigned_in_day[member] = true;
                    }
                    placed = true;
                    break;
                }
            }

            if !placed {
                if let Some(group_idx) = anchor_group {
                    return Err(SolverError::ValidationError(format!(
                        "Could not place clique {} (size {}) in required group {} for day {}",
                        clique_idx,
                        active_members.len(),
                        context.group_idx_to_id[group_idx],
                        day
                    )));
                }
                return Err(SolverError::ValidationError(format!(
                    "Could not place clique {} (size {}) in any group for day {}",
                    clique_idx,
                    active_members.len(),
                    day
                )));
            }
        }

        // --- Step 3: Place remaining unassigned participating people ---
        let unassigned_people: Vec<usize> = participating_people
            .iter()
            .filter(|&&person_idx| !assigned_in_day[person_idx])
            .cloned()
            .collect();

        for person_idx in unassigned_people {
            let mut placed = false;
            let mut potential_groups: Vec<usize> = (0..group_count).collect();
            potential_groups.shuffle(&mut rng);
            for group_idx in potential_groups {
                let group_size = context.effective_group_capacities[day * group_count + group_idx];
                if group_cursors[group_idx] < group_size
                    && !group_has_hard_apart_conflict(
                        hard_apart_partners_by_person_session,
                        people_count,
                        day,
                        person_idx,
                        &day_schedule[group_idx],
                    )
                {
                    day_schedule[group_idx].push(person_idx);
                    group_cursors[group_idx] += 1;
                    assigned_in_day[person_idx] = true;
                    placed = true;
                    break;
                }
            }
            if !placed {
                return Err(SolverError::ValidationError(format!(
                    "Could not place person {} in day {}",
                    context.person_idx_to_id[person_idx], day
                )));
            }
        }
    }

    Ok(())
}

pub(crate) fn apply_freedom_aware_construction_heuristic(
    context: &mut BaselineConstructionContext<'_>,
    params: &FreedomAwareConstructionParams,
) -> Result<(), SolverError> {
    if !(0.0..=1.0).contains(&params.gamma) {
        return Err(SolverError::ValidationError(
            "freedom-aware construction requires gamma to be within [0.0, 1.0]".into(),
        ));
    }

    let people_count = context.people_count();
    let num_sessions = context.schedule.len();
    let future_overlap = build_future_overlap_matrix(context.person_participation, num_sessions);
    let mut met_before = vec![vec![false; people_count]; people_count];
    let mut selected_pair_penalties = vec![vec![0usize; people_count]; people_count];
    let mut rng = ChaCha12Rng::seed_from_u64(derive_phase_seed(
        context.effective_seed,
        FREEDOM_AWARE_CONSTRUCTION_SEED_SALT,
    ));

    for day in 0..num_sessions {
        let paper_compatible_case = is_paper_compatible_social_golfer_case(context);
        let mut group_cursors = initialize_group_cursors(context, day);
        let mut assigned_in_day = initialize_assigned_in_day(context, day, people_count);
        let participating_people: Vec<usize> = (0..people_count)
            .filter(|&person_idx| context.person_participation[person_idx][day])
            .collect();

        place_immovables_for_day(context, day, &mut group_cursors, &mut assigned_in_day)?;

        place_active_cliques_for_day(
            context,
            day,
            &future_overlap,
            &met_before,
            params,
            &mut group_cursors,
            &mut assigned_in_day,
            &mut rng,
        )?;

        let anchor_occupancy = group_cursors.clone();
        if paper_compatible_case {
            debug_assert!(anchor_occupancy.iter().all(|&count| count == 0));
        }

        fill_remaining_people_for_day(
            context,
            day,
            &participating_people,
            &future_overlap,
            &met_before,
            &selected_pair_penalties,
            params,
            &anchor_occupancy,
            &mut group_cursors,
            &mut assigned_in_day,
            &mut rng,
        )?;

        note_selected_pair_penalties_for_day(
            &context.schedule[day],
            &anchor_occupancy,
            &mut selected_pair_penalties,
        );
        update_met_before_from_session(
            &context.schedule[day],
            day,
            context.person_participation,
            &mut met_before,
        );
    }

    Ok(())
}

pub(crate) fn is_paper_compatible_social_golfer_case(
    context: &BaselineConstructionContext<'_>,
) -> bool {
    if !context.immovable_people.is_empty() || !context.cliques.is_empty() {
        return false;
    }
    if context
        .hard_apart_partners_by_person_session
        .iter()
        .any(|partners| !partners.is_empty())
    {
        return false;
    }
    if context
        .clique_sessions
        .iter()
        .any(|sessions| sessions.is_some())
    {
        return false;
    }
    if context
        .schedule
        .iter()
        .flat_map(|day| day.iter())
        .any(|group| !group.is_empty())
    {
        return false;
    }
    if context
        .person_participation
        .iter()
        .any(|sessions| sessions.iter().any(|&participates| !participates))
    {
        return false;
    }

    let Some((&first_capacity, rest)) = context.effective_group_capacities.split_first() else {
        return false;
    };
    first_capacity > 0
        && first_capacity % 2 == 0
        && rest.iter().all(|&capacity| capacity == first_capacity)
}

fn initialize_group_cursors(context: &BaselineConstructionContext<'_>, day: usize) -> Vec<usize> {
    let mut group_cursors = vec![0; context.group_count()];
    for (group_idx, members) in context.schedule[day].iter().enumerate() {
        group_cursors[group_idx] = members.len();
    }
    group_cursors
}

fn initialize_assigned_in_day(
    context: &BaselineConstructionContext<'_>,
    day: usize,
    people_count: usize,
) -> Vec<bool> {
    let mut assigned_in_day = vec![false; people_count];
    for members in &context.schedule[day] {
        for &person_idx in members {
            if person_idx < people_count {
                assigned_in_day[person_idx] = true;
            }
        }
    }
    assigned_in_day
}

fn active_clique_members_for_day(
    cliques: &[Vec<usize>],
    clique_sessions: &[Option<Vec<usize>>],
    person_participation: &[Vec<bool>],
    clique_idx: usize,
    day: usize,
) -> Option<Vec<usize>> {
    if let Some(sessions) = &clique_sessions[clique_idx] {
        if !sessions.contains(&day) {
            return None;
        }
    }

    let active_members = cliques[clique_idx]
        .iter()
        .copied()
        .filter(|&member| person_participation[member][day])
        .collect::<Vec<_>>();
    if active_members.len() < 2 {
        return None;
    }

    Some(active_members)
}

fn assigned_group_for_person_in_day(
    day_schedule: &[Vec<usize>],
    person_idx: usize,
) -> Option<usize> {
    day_schedule
        .iter()
        .enumerate()
        .find_map(|(group_idx, members)| members.contains(&person_idx).then_some(group_idx))
}

fn resolve_clique_anchor_group(
    day_schedule: &[Vec<usize>],
    clique_idx: usize,
    day: usize,
    active_members: &[usize],
) -> Result<Option<usize>, SolverError> {
    let mut anchor_group = None;

    for &member in active_members {
        if let Some(group_idx) = assigned_group_for_person_in_day(day_schedule, member) {
            match anchor_group {
                Some(existing) if existing != group_idx => {
                    return Err(SolverError::ValidationError(format!(
                        "Could not place clique {} (size {}) for day {} because seeded/immovable members are already split across groups",
                        clique_idx,
                        active_members.len(),
                        day
                    )));
                }
                Some(_) => {}
                None => anchor_group = Some(group_idx),
            }
        }
    }

    Ok(anchor_group)
}

fn place_immovables_for_day(
    context: &mut BaselineConstructionContext<'_>,
    day: usize,
    group_cursors: &mut [usize],
    assigned_in_day: &mut [bool],
) -> Result<(), SolverError> {
    let group_count = context.group_count();
    for (person_idx, group_idx) in context
        .immovable_people
        .iter()
        .filter(|((_, session_idx), _)| *session_idx == day)
        .map(|((person_idx, _), group_idx)| (*person_idx, *group_idx))
    {
        if assigned_in_day[person_idx] {
            continue;
        }

        let group_size = context.effective_group_capacities[day * group_count + group_idx];
        if group_cursors[group_idx] >= group_size {
            return Err(SolverError::ValidationError(format!(
                "Cannot place immovable person: group {} is full",
                context.group_idx_to_id[group_idx]
            )));
        }

        if context.group_has_hard_apart_conflict(day, person_idx, &context.schedule[day][group_idx])
        {
            return Err(SolverError::ValidationError(format!(
                "Cannot place immovable person: group {} would violate MustStayApart for {}",
                context.group_idx_to_id[group_idx], context.person_idx_to_id[person_idx]
            )));
        }

        context.schedule[day][group_idx].push(person_idx);
        group_cursors[group_idx] += 1;
        assigned_in_day[person_idx] = true;
    }

    Ok(())
}

fn place_active_cliques_for_day(
    context: &mut BaselineConstructionContext<'_>,
    day: usize,
    future_overlap: &[Vec<Vec<bool>>],
    met_before: &[Vec<bool>],
    params: &FreedomAwareConstructionParams,
    group_cursors: &mut [usize],
    assigned_in_day: &mut [bool],
    rng: &mut ChaCha12Rng,
) -> Result<(), SolverError> {
    let group_count = context.group_count();
    for clique_idx in 0..context.cliques.len() {
        let Some(active_members) = active_clique_members_for_day(
            context.cliques,
            context.clique_sessions,
            context.person_participation,
            clique_idx,
            day,
        ) else {
            continue;
        };

        let missing_members = active_members
            .iter()
            .filter(|&&member| !assigned_in_day[member])
            .count();
        if missing_members == 0 {
            continue;
        }

        let anchor_group =
            resolve_clique_anchor_group(&context.schedule[day], clique_idx, day, &active_members)?;

        if let Some(group_idx) = anchor_group {
            let group_size = context.effective_group_capacities[day * group_count + group_idx];
            if group_cursors[group_idx] + missing_members > group_size {
                return Err(SolverError::ValidationError(format!(
                    "Could not place clique {} (size {}) in required group {} for day {}",
                    clique_idx,
                    active_members.len(),
                    context.group_idx_to_id[group_idx],
                    day
                )));
            }

            if context.block_has_hard_apart_conflict(
                day,
                &active_members,
                &context.schedule[day][group_idx],
            ) {
                return Err(SolverError::ValidationError(format!(
                    "Could not place clique {} (size {}) in required group {} for day {} because it would violate MustStayApart",
                    clique_idx,
                    active_members.len(),
                    context.group_idx_to_id[group_idx],
                    day
                )));
            }

            for &member in &active_members {
                if assigned_in_day[member] {
                    continue;
                }
                context.schedule[day][group_idx].push(member);
                assigned_in_day[member] = true;
                group_cursors[group_idx] += 1;
            }
            continue;
        }

        let feasible_groups: Vec<usize> = (0..group_count)
            .filter(|&group_idx| {
                let group_size = context.effective_group_capacities[day * group_count + group_idx];
                group_cursors[group_idx] + active_members.len() <= group_size
                    && !context.block_has_hard_apart_conflict(
                        day,
                        &active_members,
                        &context.schedule[day][group_idx],
                    )
            })
            .collect();

        let Some(selected_group_idx) = choose_best_group_for_block(
            &feasible_groups,
            &context.schedule[day],
            &active_members,
            day,
            future_overlap,
            met_before,
            params,
            rng,
        ) else {
            return Err(SolverError::ValidationError(format!(
                "Could not place clique {} (size {}) in any group for day {}",
                clique_idx,
                active_members.len(),
                day
            )));
        };

        for &member in &active_members {
            context.schedule[day][selected_group_idx].push(member);
            assigned_in_day[member] = true;
        }
        group_cursors[selected_group_idx] += active_members.len();
    }

    Ok(())
}

fn fill_remaining_people_for_day(
    context: &mut BaselineConstructionContext<'_>,
    day: usize,
    participating_people: &[usize],
    future_overlap: &[Vec<Vec<bool>>],
    met_before: &[Vec<bool>],
    selected_pair_penalties: &[Vec<usize>],
    params: &FreedomAwareConstructionParams,
    anchor_occupancy: &[usize],
    group_cursors: &mut [usize],
    assigned_in_day: &mut [bool],
    rng: &mut ChaCha12Rng,
) -> Result<(), SolverError> {
    let group_count = context.group_count();

    for group_idx in 0..group_count {
        let capacity = context.effective_group_capacities[day * group_count + group_idx];
        let fill_mode = pair_fill_mode_for_anchor(anchor_occupancy[group_idx]);

        while group_cursors[group_idx] + 2 <= capacity {
            let unassigned_people =
                remaining_unassigned_people(participating_people, assigned_in_day);
            if unassigned_people.len() < 2 {
                break;
            }

            let Some((left, right)) = choose_best_pair_for_group(
                context,
                &context.schedule[day][group_idx],
                &unassigned_people,
                day,
                future_overlap,
                met_before,
                selected_pair_penalties,
                params,
                fill_mode,
                rng,
            ) else {
                return Err(SolverError::ValidationError(format!(
                    "Could not place a pair into group {} for day {}",
                    context.group_idx_to_id[group_idx], day
                )));
            };

            context.schedule[day][group_idx].push(left);
            context.schedule[day][group_idx].push(right);
            group_cursors[group_idx] += 2;
            assigned_in_day[left] = true;
            assigned_in_day[right] = true;
        }

        if group_cursors[group_idx] < capacity {
            let unassigned_people =
                remaining_unassigned_people(participating_people, assigned_in_day);
            if unassigned_people.is_empty() {
                continue;
            }

            let Some(person_idx) = choose_best_candidate_for_group(
                context,
                &context.schedule[day][group_idx],
                &unassigned_people,
                day,
                future_overlap,
                met_before,
                params,
                rng,
            ) else {
                return Err(SolverError::ValidationError(format!(
                    "Could not place remaining participants into group {} for day {}",
                    context.group_idx_to_id[group_idx], day
                )));
            };

            context.schedule[day][group_idx].push(person_idx);
            group_cursors[group_idx] += 1;
            assigned_in_day[person_idx] = true;
        }
    }

    let missing = participating_people
        .iter()
        .filter(|&&person_idx| !assigned_in_day[person_idx])
        .map(|&person_idx| context.person_idx_to_id[person_idx].clone())
        .collect::<Vec<_>>();
    if !missing.is_empty() {
        return Err(SolverError::ValidationError(format!(
            "No placement remained while constructing day {} for people {:?}",
            day, missing
        )));
    }

    Ok(())
}

fn remaining_unassigned_people(
    participating_people: &[usize],
    assigned_in_day: &[bool],
) -> Vec<usize> {
    participating_people
        .iter()
        .filter(|&&person_idx| !assigned_in_day[person_idx])
        .copied()
        .collect()
}

fn pair_fill_mode_for_anchor(anchor_occupancy: usize) -> PairFillMode {
    if anchor_occupancy == 0 {
        PairFillMode::PaperPairSlots
    } else {
        PairFillMode::ResidualExtended
    }
}

fn choose_best_group_for_block(
    feasible_groups: &[usize],
    day_schedule: &[Vec<usize>],
    block: &[usize],
    day: usize,
    future_overlap: &[Vec<Vec<bool>>],
    met_before: &[Vec<bool>],
    params: &FreedomAwareConstructionParams,
    rng: &mut ChaCha12Rng,
) -> Option<usize> {
    #[derive(Debug, Clone, Copy)]
    struct ScoredGroup {
        group_idx: usize,
        freedom: usize,
    }

    let mut scored = feasible_groups
        .iter()
        .map(|&group_idx| ScoredGroup {
            group_idx,
            freedom: freedom_of_union(
                &day_schedule[group_idx],
                block,
                day,
                future_overlap,
                met_before,
            ),
        })
        .collect::<Vec<_>>();

    if scored.is_empty() {
        return None;
    }

    scored.sort_by(|left, right| {
        right
            .freedom
            .cmp(&left.freedom)
            .then(left.group_idx.cmp(&right.group_idx))
    });

    choose_from_max_freedom_prefix(&scored, |candidate| candidate.freedom, params.gamma, rng)
        .map(|candidate| candidate.group_idx)
}

fn choose_best_pair_for_group(
    context: &BaselineConstructionContext<'_>,
    group_members: &[usize],
    unassigned_people: &[usize],
    day: usize,
    future_overlap: &[Vec<Vec<bool>>],
    met_before: &[Vec<bool>],
    selected_pair_penalties: &[Vec<usize>],
    params: &FreedomAwareConstructionParams,
    fill_mode: PairFillMode,
    rng: &mut ChaCha12Rng,
) -> Option<(usize, usize)> {
    #[derive(Debug, Clone, Copy)]
    struct ScoredPair {
        left: usize,
        right: usize,
        raw_freedom: usize,
        adjusted_freedom: i64,
    }

    let mut scored = Vec::new();
    for left_idx in 0..unassigned_people.len() {
        for right_idx in (left_idx + 1)..unassigned_people.len() {
            let left = unassigned_people[left_idx];
            let right = unassigned_people[right_idx];
            if context.group_has_hard_apart_conflict(day, left, group_members)
                || context.group_has_hard_apart_conflict(day, right, group_members)
                || context.hard_apart_partners(day, left).contains(&right)
            {
                continue;
            }
            let raw_freedom = pair_slot_freedom(
                group_members,
                left,
                right,
                day,
                future_overlap,
                met_before,
                fill_mode,
            );
            let adjusted_freedom =
                adjusted_pair_freedom(left, right, raw_freedom, selected_pair_penalties);
            scored.push(ScoredPair {
                left,
                right,
                raw_freedom,
                adjusted_freedom,
            });
        }
    }

    if scored.is_empty() {
        return None;
    }

    scored.sort_by(|left, right| {
        right
            .adjusted_freedom
            .cmp(&left.adjusted_freedom)
            .then((left.left, left.right).cmp(&(right.left, right.right)))
    });

    choose_from_max_adjusted_prefix(
        &scored,
        |candidate| candidate.adjusted_freedom,
        params.gamma,
        rng,
    )
    .map(|candidate| {
        debug_assert!(candidate.raw_freedom <= met_before.len());
        (candidate.left, candidate.right)
    })
}

fn choose_best_candidate_for_group(
    context: &BaselineConstructionContext<'_>,
    group_members: &[usize],
    unassigned_people: &[usize],
    day: usize,
    future_overlap: &[Vec<Vec<bool>>],
    met_before: &[Vec<bool>],
    params: &FreedomAwareConstructionParams,
    rng: &mut ChaCha12Rng,
) -> Option<usize> {
    #[derive(Debug, Clone, Copy)]
    struct ScoredCandidate {
        person_idx: usize,
        freedom: usize,
    }

    let mut scored = unassigned_people
        .iter()
        .filter(|&&person_idx| {
            !context.group_has_hard_apart_conflict(day, person_idx, group_members)
        })
        .map(|&person_idx| ScoredCandidate {
            person_idx,
            freedom: freedom_of_union(
                group_members,
                &[person_idx],
                day,
                future_overlap,
                met_before,
            ),
        })
        .collect::<Vec<_>>();

    if scored.is_empty() {
        return None;
    }

    scored.sort_by(|left, right| {
        right
            .freedom
            .cmp(&left.freedom)
            .then(left.person_idx.cmp(&right.person_idx))
    });

    choose_from_max_freedom_prefix(&scored, |candidate| candidate.freedom, params.gamma, rng)
        .map(|candidate| candidate.person_idx)
}

fn choose_from_max_adjusted_prefix<T: Copy>(
    scored: &[T],
    score_of: impl Fn(&T) -> i64,
    gamma: f64,
    rng: &mut ChaCha12Rng,
) -> Option<T> {
    let Some(first) = scored.first().copied() else {
        return None;
    };
    let best_score = score_of(&first);
    let tied_len = scored
        .iter()
        .take_while(|candidate| score_of(candidate) == best_score)
        .count();
    if tied_len > 1 && rng.random::<f64>() < gamma {
        scored[..tied_len].choose(rng).copied()
    } else {
        Some(first)
    }
}

fn choose_from_max_freedom_prefix<T: Copy>(
    scored: &[T],
    score_of: impl Fn(&T) -> usize,
    gamma: f64,
    rng: &mut ChaCha12Rng,
) -> Option<T> {
    let Some(first) = scored.first().copied() else {
        return None;
    };
    let best_score = score_of(&first);
    let tied_len = scored
        .iter()
        .take_while(|candidate| score_of(candidate) == best_score)
        .count();
    if tied_len > 1 && rng.random::<f64>() < gamma {
        scored[..tied_len].choose(rng).copied()
    } else {
        Some(first)
    }
}

fn pair_slot_freedom(
    group_members: &[usize],
    left: usize,
    right: usize,
    day: usize,
    future_overlap: &[Vec<Vec<bool>>],
    met_before: &[Vec<bool>],
    fill_mode: PairFillMode,
) -> usize {
    match fill_mode {
        PairFillMode::PaperPairSlots => {
            paper_freedom_of_set(&[left, right], day, future_overlap, met_before)
        }
        PairFillMode::ResidualExtended => freedom_of_union(
            group_members,
            &[left, right],
            day,
            future_overlap,
            met_before,
        ),
    }
}

fn freedom_of_union(
    base_members: &[usize],
    added_members: &[usize],
    day: usize,
    future_overlap: &[Vec<Vec<bool>>],
    met_before: &[Vec<bool>],
) -> usize {
    let mut union_members = Vec::with_capacity(base_members.len() + added_members.len());
    union_members.extend_from_slice(base_members);
    union_members.extend_from_slice(added_members);
    paper_freedom_of_set(&union_members, day, future_overlap, met_before)
}

fn paper_freedom_of_set(
    members: &[usize],
    day: usize,
    future_overlap: &[Vec<Vec<bool>>],
    met_before: &[Vec<bool>],
) -> usize {
    if members.is_empty() {
        return 0;
    }

    let people_count = met_before.len();
    (0..people_count)
        .filter(|candidate| !members.contains(candidate))
        .filter(|&candidate| {
            members.iter().all(|&member| {
                !met_before[member][candidate] && future_overlap[day][member][candidate]
            })
        })
        .count()
}

fn adjusted_pair_freedom(
    left: usize,
    right: usize,
    raw_freedom: usize,
    selected_pair_penalties: &[Vec<usize>],
) -> i64 {
    raw_freedom as i64 - (selected_pair_penalties[left][right] as i64 * PAPER_PAIR_REPEAT_PENALTY)
}

fn note_selected_pair_penalties_for_day(
    day_schedule: &[Vec<usize>],
    anchor_occupancy: &[usize],
    selected_pair_penalties: &mut [Vec<usize>],
) {
    for (group_idx, members) in day_schedule.iter().enumerate() {
        let anchor_count = anchor_occupancy[group_idx];
        if anchor_count >= members.len() {
            continue;
        }
        for pair_start in (anchor_count..members.len().saturating_sub(1)).step_by(2) {
            let left = members[pair_start];
            let right = members[pair_start + 1];
            selected_pair_penalties[left][right] += 1;
            selected_pair_penalties[right][left] += 1;
        }
    }
}

fn build_future_overlap_matrix(
    person_participation: &[Vec<bool>],
    num_sessions: usize,
) -> Vec<Vec<Vec<bool>>> {
    let people_count = person_participation.len();
    let mut matrix = vec![vec![vec![false; people_count]; people_count]; num_sessions];
    let mut future_seen = vec![vec![false; people_count]; people_count];

    for day in (0..num_sessions).rev() {
        matrix[day] = future_seen.clone();
        for left in 0..people_count {
            if !person_participation[left][day] {
                continue;
            }
            for right in (left + 1)..people_count {
                if person_participation[right][day] {
                    future_seen[left][right] = true;
                    future_seen[right][left] = true;
                }
            }
        }
    }

    matrix
}

fn update_met_before_from_session(
    day_schedule: &[Vec<usize>],
    day: usize,
    person_participation: &[Vec<bool>],
    met_before: &mut [Vec<bool>],
) {
    for members in day_schedule {
        for left_idx in 0..members.len() {
            for right_idx in (left_idx + 1)..members.len() {
                let left = members[left_idx];
                let right = members[right_idx];
                if person_participation[left][day] && person_participation[right][day] {
                    met_before[left][right] = true;
                    met_before[right][left] = true;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn context_with_constraints(
        schedule: Vec<Vec<Vec<usize>>>,
        person_participation: Vec<Vec<bool>>,
        group_sizes: Vec<usize>,
        immovable_people: HashMap<(usize, usize), usize>,
        cliques: Vec<Vec<usize>>,
        clique_sessions: Vec<Option<Vec<usize>>>,
    ) -> BaselineConstructionContext<'static> {
        let num_sessions = schedule.len();
        let group_count = schedule.first().map_or(0, |groups| groups.len());
        let group_idx_to_id = Box::leak(Box::new(
            (0..group_count)
                .map(|idx| format!("g{idx}"))
                .collect::<Vec<_>>(),
        ));
        let person_idx_to_id = Box::leak(Box::new(
            (0..person_participation.len())
                .map(|idx| format!("p{idx}"))
                .collect::<Vec<_>>(),
        ));
        let expected_capacity_len = num_sessions * group_count;
        assert_eq!(group_sizes.len(), expected_capacity_len);
        let effective_group_capacities = Box::leak(Box::new(group_sizes));
        let person_participation = Box::leak(Box::new(person_participation));
        let immovable_people = Box::leak(Box::new(immovable_people));
        let cliques = Box::leak(Box::new(cliques));
        let clique_sessions = Box::leak(Box::new(clique_sessions));
        let hard_apart_partners_by_person_session = Box::leak(Box::new(vec![
            Vec::new();
            num_sessions * person_participation.len()
        ]));
        let schedule = Box::leak(Box::new(schedule));
        BaselineConstructionContext {
            effective_seed: 7,
            group_idx_to_id,
            person_idx_to_id,
            effective_group_capacities,
            person_participation,
            immovable_people,
            cliques,
            clique_sessions,
            hard_apart_partners_by_person_session,
            schedule,
        }
    }

    fn context_with_schedule(
        schedule: Vec<Vec<Vec<usize>>>,
        person_participation: Vec<Vec<bool>>,
        group_sizes: Vec<usize>,
    ) -> BaselineConstructionContext<'static> {
        context_with_constraints(
            schedule,
            person_participation,
            group_sizes,
            HashMap::new(),
            Vec::new(),
            Vec::new(),
        )
    }

    #[test]
    fn future_overlap_only_counts_future_sessions() {
        let person_participation = vec![
            vec![true, false, false],
            vec![true, true, false],
            vec![false, true, true],
        ];
        let matrix = build_future_overlap_matrix(&person_participation, 3);

        assert!(
            matrix[0][1][2],
            "day 0 should see session 1 future overlap for p1/p2"
        );
        assert!(
            !matrix[1][0][1],
            "day 1 should not count day 0 as future overlap"
        );
        assert!(!matrix[2][1][2], "last day should have no future overlap");
    }

    #[test]
    fn paper_freedom_excludes_already_met_people() {
        let future_overlap = build_future_overlap_matrix(
            &vec![vec![true, true], vec![true, true], vec![true, true]],
            2,
        );
        let mut met_before = vec![vec![false; 3]; 3];
        met_before[0][2] = true;
        met_before[2][0] = true;

        let freedom = paper_freedom_of_set(&[0, 1], 0, &future_overlap, &met_before);
        assert_eq!(
            freedom, 0,
            "candidate p2 should be excluded because p0 already met p2"
        );
    }

    #[test]
    fn paper_pair_slot_scoring_ignores_existing_group_members() {
        let future_overlap = build_future_overlap_matrix(
            &vec![
                vec![true, true],
                vec![true, true],
                vec![true, true],
                vec![true, true],
                vec![true, true],
            ],
            2,
        );
        let mut met_before = vec![vec![false; 5]; 5];
        met_before[0][4] = true;
        met_before[4][0] = true;

        let paper_score = pair_slot_freedom(
            &[0, 1],
            2,
            3,
            0,
            &future_overlap,
            &met_before,
            PairFillMode::PaperPairSlots,
        );
        let residual_score = pair_slot_freedom(
            &[0, 1],
            2,
            3,
            0,
            &future_overlap,
            &met_before,
            PairFillMode::ResidualExtended,
        );

        assert_eq!(paper_score, 3);
        assert_eq!(residual_score, 0);
    }

    #[test]
    fn pair_penalty_dominates_raw_pair_freedom() {
        let future_overlap = build_future_overlap_matrix(
            &vec![
                vec![true, true],
                vec![true, true],
                vec![true, true],
                vec![true, true],
            ],
            2,
        );
        let met_before = vec![vec![false; 4]; 4];
        let mut selected_pair_penalties = vec![vec![0usize; 4]; 4];
        selected_pair_penalties[0][1] = 1;
        selected_pair_penalties[1][0] = 1;

        let repeated = adjusted_pair_freedom(
            0,
            1,
            paper_freedom_of_set(&[0, 1], 0, &future_overlap, &met_before),
            &selected_pair_penalties,
        );
        let fresh = adjusted_pair_freedom(
            2,
            3,
            paper_freedom_of_set(&[2, 3], 0, &future_overlap, &met_before),
            &selected_pair_penalties,
        );

        assert!(repeated < fresh);
    }

    #[test]
    fn gamma_zero_picks_lexicographically_smallest_max_pair() {
        let future_overlap = build_future_overlap_matrix(
            &vec![
                vec![true, true],
                vec![true, true],
                vec![true, true],
                vec![true, true],
            ],
            2,
        );
        let met_before = vec![vec![false; 4]; 4];
        let selected_pair_penalties = vec![vec![0usize; 4]; 4];
        let params = FreedomAwareConstructionParams { gamma: 0.0 };
        let mut rng = ChaCha12Rng::seed_from_u64(3);
        let context = context_with_schedule(
            vec![vec![vec![], vec![]], vec![vec![], vec![]]],
            vec![
                vec![true, true],
                vec![true, true],
                vec![true, true],
                vec![true, true],
            ],
            vec![2, 2, 2, 2],
        );

        let pair = choose_best_pair_for_group(
            &context,
            &[],
            &[0, 1, 2, 3],
            0,
            &future_overlap,
            &met_before,
            &selected_pair_penalties,
            &params,
            PairFillMode::PaperPairSlots,
            &mut rng,
        )
        .unwrap();

        assert_eq!(pair, (0, 1));
    }

    #[test]
    fn gamma_one_randomizes_only_within_equal_max_pairs() {
        let future_overlap = build_future_overlap_matrix(
            &vec![
                vec![true, true],
                vec![true, true],
                vec![true, true],
                vec![true, true],
            ],
            2,
        );
        let met_before = vec![vec![false; 4]; 4];
        let selected_pair_penalties = vec![vec![0usize; 4]; 4];
        let params = FreedomAwareConstructionParams { gamma: 1.0 };
        let mut saw_non_lexicographic = false;
        let context = context_with_schedule(
            vec![vec![vec![], vec![]], vec![vec![], vec![]]],
            vec![
                vec![true, true],
                vec![true, true],
                vec![true, true],
                vec![true, true],
            ],
            vec![2, 2, 2, 2],
        );

        for seed in 0..32 {
            let mut rng = ChaCha12Rng::seed_from_u64(seed);
            let pair = choose_best_pair_for_group(
                &context,
                &[],
                &[0, 1, 2, 3],
                0,
                &future_overlap,
                &met_before,
                &selected_pair_penalties,
                &params,
                PairFillMode::PaperPairSlots,
                &mut rng,
            )
            .unwrap();
            assert!(matches!(
                pair,
                (0, 1) | (0, 2) | (0, 3) | (1, 2) | (1, 3) | (2, 3)
            ));
            if pair != (0, 1) {
                saw_non_lexicographic = true;
            }
        }

        assert!(saw_non_lexicographic);
    }

    #[test]
    fn paper_compatibility_detector_requires_uniform_even_unseeded_case() {
        let context = context_with_schedule(
            vec![vec![vec![], vec![]], vec![vec![], vec![]]],
            vec![
                vec![true, true],
                vec![true, true],
                vec![true, true],
                vec![true, true],
            ],
            vec![2, 2, 2, 2],
        );
        assert!(is_paper_compatible_social_golfer_case(&context));

        let seeded_context = context_with_schedule(
            vec![vec![vec![0], vec![]], vec![vec![], vec![]]],
            vec![
                vec![true, true],
                vec![true, true],
                vec![true, true],
                vec![true, true],
            ],
            vec![2, 2, 2, 2],
        );
        assert!(!is_paper_compatible_social_golfer_case(&seeded_context));
    }

    #[test]
    fn freedom_aware_constructor_is_deterministic_for_fixed_seed() {
        let schedule = vec![vec![vec![], vec![]], vec![vec![], vec![]]];
        let person_participation = vec![
            vec![true, true],
            vec![true, true],
            vec![true, true],
            vec![true, true],
        ];
        let capacities = vec![2, 2, 2, 2];
        let mut left_context = context_with_schedule(
            schedule.clone(),
            person_participation.clone(),
            capacities.clone(),
        );
        let mut right_context = context_with_schedule(schedule, person_participation, capacities);
        let params = FreedomAwareConstructionParams { gamma: 0.0 };

        apply_freedom_aware_construction_heuristic(&mut left_context, &params).unwrap();
        apply_freedom_aware_construction_heuristic(&mut right_context, &params).unwrap();

        assert_eq!(left_context.schedule, right_context.schedule);
    }

    #[test]
    fn baseline_constructor_anchors_partial_clique_to_immovable_group() {
        let mut context = context_with_constraints(
            vec![vec![vec![], vec![]]],
            vec![vec![true], vec![true], vec![true], vec![true]],
            vec![2, 2],
            HashMap::from([((0usize, 0usize), 1usize)]),
            vec![vec![0, 1]],
            vec![None],
        );

        apply_baseline_construction_heuristic(&mut context)
            .expect("baseline construction succeeds");

        assert_eq!(context.schedule[0][1].len(), 2);
        assert!(context.schedule[0][1].contains(&0));
        assert!(context.schedule[0][1].contains(&1));
    }

    #[test]
    fn freedom_aware_constructor_anchors_partial_clique_to_immovable_group() {
        let mut context = context_with_constraints(
            vec![vec![vec![], vec![]]],
            vec![vec![true], vec![true], vec![true], vec![true]],
            vec![2, 2],
            HashMap::from([((0usize, 0usize), 1usize)]),
            vec![vec![0, 1]],
            vec![None],
        );

        apply_freedom_aware_construction_heuristic(
            &mut context,
            &FreedomAwareConstructionParams { gamma: 0.0 },
        )
        .expect("freedom-aware construction succeeds");

        assert_eq!(context.schedule[0][1].len(), 2);
        assert!(context.schedule[0][1].contains(&0));
        assert!(context.schedule[0][1].contains(&1));
    }

    #[test]
    fn freedom_aware_constructor_rejects_out_of_range_gamma() {
        let schedule = vec![vec![vec![], vec![]]];
        let person_participation = vec![vec![true], vec![true], vec![true], vec![true]];
        let capacities = vec![2, 2];
        let mut context = context_with_schedule(schedule, person_participation, capacities);

        let error = apply_freedom_aware_construction_heuristic(
            &mut context,
            &FreedomAwareConstructionParams { gamma: 1.5 },
        )
        .unwrap_err();

        assert!(matches!(error, SolverError::ValidationError(_)));
    }
}
