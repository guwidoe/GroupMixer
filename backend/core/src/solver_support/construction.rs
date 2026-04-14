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
use rand::SeedableRng;
use rand_chacha::ChaCha12Rng;
use std::cmp::Reverse;
use std::collections::HashMap;

const BASELINE_CONSTRUCTION_SEED_SALT: u64 = 0x6a09e667f3bcc909;
const FREEDOM_AWARE_CONSTRUCTION_SEED_SALT: u64 = 0xbb67ae8584caa73b;

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
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct FreedomAwareConstructionParams {
    pub restricted_candidate_list_size: usize,
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

    Ok(())
}

pub(crate) fn apply_baseline_construction_heuristic(
    context: &mut BaselineConstructionContext<'_>,
) -> Result<(), SolverError> {
    let people_count = context.people_count();
    let group_count = context.group_count();

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

            day_schedule[group_idx].push(person_idx);
            group_cursors[group_idx] += 1;
            assigned_in_day[person_idx] = true;
        }

        // --- Step 2: Place cliques as units ---
        for (clique_idx, clique) in context.cliques.iter().enumerate() {
            if clique.iter().any(|&member| assigned_in_day[member]) {
                continue;
            }

            let all_participating = clique
                .iter()
                .all(|&member| context.person_participation[member][day]);
            if !all_participating {
                continue;
            }

            if let Some(ref sessions) = context.clique_sessions[clique_idx] {
                if !sessions.contains(&day) {
                    continue;
                }
            }

            let mut placed = false;
            let mut potential_groups: Vec<usize> = (0..group_count).collect();
            potential_groups.shuffle(&mut rng);

            for group_idx in potential_groups {
                let group_size = context.effective_group_capacities[day * group_count + group_idx];
                let available_space = group_size - group_cursors[group_idx];

                if available_space >= clique.len() {
                    for &member in clique {
                        day_schedule[group_idx].push(member);
                        assigned_in_day[member] = true;
                    }
                    group_cursors[group_idx] += clique.len();
                    placed = true;
                    break;
                }
            }

            if !placed {
                return Err(SolverError::ValidationError(format!(
                    "Could not place clique {} (size {}) in any group for day {}",
                    clique_idx,
                    clique.len(),
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
                if group_cursors[group_idx] < group_size {
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
    if params.restricted_candidate_list_size == 0 {
        return Err(SolverError::ValidationError(
            "freedom-aware construction requires restricted_candidate_list_size >= 1".into(),
        ));
    }

    let people_count = context.people_count();
    let group_count = context.group_count();
    let num_sessions = context.schedule.len();
    let future_overlap = build_future_overlap_matrix(context.person_participation, num_sessions);
    let mut met_before = vec![vec![false; people_count]; people_count];
    let mut rng = ChaCha12Rng::seed_from_u64(derive_phase_seed(
        context.effective_seed,
        FREEDOM_AWARE_CONSTRUCTION_SEED_SALT,
    ));

    for day in 0..num_sessions {
        let mut group_cursors = vec![0; group_count];
        let mut assigned_in_day = vec![false; people_count];
        {
            let day_schedule = &context.schedule[day];
            for (group_idx, members) in day_schedule.iter().enumerate() {
                group_cursors[group_idx] = members.len();
                for &person_idx in members {
                    if person_idx < people_count {
                        assigned_in_day[person_idx] = true;
                    }
                }
            }
        }

        let participating_people: Vec<usize> = (0..people_count)
            .filter(|&person_idx| context.person_participation[person_idx][day])
            .collect();

        place_immovables_for_day(
            context,
            day,
            &mut group_cursors,
            &mut assigned_in_day,
        )?;

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

        fill_remaining_people_for_day(
            context,
            day,
            &participating_people,
            &future_overlap,
            &met_before,
            params,
            &mut group_cursors,
            &mut assigned_in_day,
            &mut rng,
        )?;

        update_met_before_from_session(
            &context.schedule[day],
            day,
            context.person_participation,
            &mut met_before,
        );
    }

    Ok(())
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
    for (clique_idx, clique) in context.cliques.iter().enumerate() {
        if clique.iter().any(|&member| assigned_in_day[member]) {
            continue;
        }
        if !clique.iter().all(|&member| context.person_participation[member][day]) {
            continue;
        }
        if let Some(sessions) = &context.clique_sessions[clique_idx] {
            if !sessions.contains(&day) {
                continue;
            }
        }

        let feasible_groups: Vec<usize> = (0..group_count)
            .filter(|&group_idx| {
                let group_size = context.effective_group_capacities[day * group_count + group_idx];
                group_cursors[group_idx] + clique.len() <= group_size
            })
            .collect();

        let Some(selected_group_idx) = choose_best_group_for_block(
            &feasible_groups,
            &context.schedule[day],
            clique,
            day,
            future_overlap,
            met_before,
            params,
            rng,
        ) else {
            return Err(SolverError::ValidationError(format!(
                "Could not place clique {} (size {}) in any group for day {}",
                clique_idx,
                clique.len(),
                day
            )));
        };

        for &member in clique {
            context.schedule[day][selected_group_idx].push(member);
            assigned_in_day[member] = true;
        }
        group_cursors[selected_group_idx] += clique.len();
    }

    Ok(())
}

fn fill_remaining_people_for_day(
    context: &mut BaselineConstructionContext<'_>,
    day: usize,
    participating_people: &[usize],
    future_overlap: &[Vec<Vec<bool>>],
    met_before: &[Vec<bool>],
    params: &FreedomAwareConstructionParams,
    group_cursors: &mut [usize],
    assigned_in_day: &mut [bool],
    rng: &mut ChaCha12Rng,
) -> Result<(), SolverError> {
    let group_count = context.group_count();

    while participating_people.iter().any(|&person_idx| !assigned_in_day[person_idx]) {
        let Some(target_group_idx) = select_next_target_group(
            &context.effective_group_capacities[day * group_count..(day + 1) * group_count],
            group_cursors,
        ) else {
            let missing = participating_people
                .iter()
                .filter(|&&person_idx| !assigned_in_day[person_idx])
                .map(|&person_idx| context.person_idx_to_id[person_idx].clone())
                .collect::<Vec<_>>();
            return Err(SolverError::ValidationError(format!(
                "No group capacity remained while constructing day {} for people {:?}",
                day, missing
            )));
        };

        let remaining_capacity = context.effective_group_capacities[day * group_count + target_group_idx]
            .saturating_sub(group_cursors[target_group_idx]);
        let unassigned_people = participating_people
            .iter()
            .filter(|&&person_idx| !assigned_in_day[person_idx])
            .copied()
            .collect::<Vec<_>>();
        if unassigned_people.is_empty() {
            break;
        }

        if context.schedule[day][target_group_idx].is_empty()
            && remaining_capacity >= 2
            && unassigned_people.len() >= 2
        {
            if let Some((left, right)) = choose_best_pair_for_empty_group(
                &unassigned_people,
                day,
                future_overlap,
                met_before,
                params,
                rng,
            ) {
                context.schedule[day][target_group_idx].push(left);
                context.schedule[day][target_group_idx].push(right);
                group_cursors[target_group_idx] += 2;
                assigned_in_day[left] = true;
                assigned_in_day[right] = true;
                continue;
            }
        }

        let Some(person_idx) = choose_best_candidate_for_group(
            &context.schedule[day][target_group_idx],
            &unassigned_people,
            day,
            future_overlap,
            met_before,
            params,
            rng,
        ) else {
            return Err(SolverError::ValidationError(format!(
                "Could not place remaining participants into group {} for day {}",
                context.group_idx_to_id[target_group_idx],
                day
            )));
        };

        context.schedule[day][target_group_idx].push(person_idx);
        group_cursors[target_group_idx] += 1;
        assigned_in_day[person_idx] = true;
    }

    Ok(())
}

fn select_next_target_group(capacities: &[usize], group_cursors: &[usize]) -> Option<usize> {
    let partial = capacities
        .iter()
        .enumerate()
        .filter_map(|(group_idx, &capacity)| {
            let used = group_cursors[group_idx];
            let remaining = capacity.saturating_sub(used);
            if used > 0 && remaining > 0 {
                Some((group_idx, remaining, used))
            } else {
                None
            }
        })
        .min_by_key(|(group_idx, remaining, used)| (*remaining, Reverse(*used), *group_idx))
        .map(|(group_idx, _, _)| group_idx);
    if partial.is_some() {
        return partial;
    }

    capacities
        .iter()
        .enumerate()
        .filter_map(|(group_idx, &capacity)| {
            let used = group_cursors[group_idx];
            let remaining = capacity.saturating_sub(used);
            if remaining > 0 {
                Some((group_idx, remaining))
            } else {
                None
            }
        })
        .min_by_key(|(group_idx, remaining)| (*remaining, *group_idx))
        .map(|(group_idx, _)| group_idx)
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
        repeat_damage: usize,
        individual_future: usize,
    }

    let mut scored = feasible_groups
        .iter()
        .map(|&group_idx| {
            let group_members = &day_schedule[group_idx];
            let freedom = freedom_score_for_union(group_members, block, day, future_overlap, met_before);
            let repeat_damage = repeat_damage_for_union(group_members, block, met_before);
            let individual_future = block
                .iter()
                .map(|&member| freedom_score_for_union(&[], &[member], day, future_overlap, met_before))
                .sum::<usize>();
            ScoredGroup {
                group_idx,
                freedom,
                repeat_damage,
                individual_future,
            }
        })
        .collect::<Vec<_>>();

    scored.sort_by(|left, right| {
        right
            .freedom
            .cmp(&left.freedom)
            .then(left.repeat_damage.cmp(&right.repeat_damage))
            .then(right.individual_future.cmp(&left.individual_future))
            .then(left.group_idx.cmp(&right.group_idx))
    });

    let rcl_len = params.restricted_candidate_list_size.min(scored.len());
    scored[..rcl_len].choose(rng).map(|candidate| candidate.group_idx)
}

fn choose_best_pair_for_empty_group(
    unassigned_people: &[usize],
    day: usize,
    future_overlap: &[Vec<Vec<bool>>],
    met_before: &[Vec<bool>],
    params: &FreedomAwareConstructionParams,
    rng: &mut ChaCha12Rng,
) -> Option<(usize, usize)> {
    #[derive(Debug, Clone, Copy)]
    struct ScoredPair {
        left: usize,
        right: usize,
        freedom: usize,
        repeat_damage: usize,
        individual_future_sum: usize,
    }

    let mut scored = Vec::new();
    for left_idx in 0..unassigned_people.len() {
        for right_idx in (left_idx + 1)..unassigned_people.len() {
            let left = unassigned_people[left_idx];
            let right = unassigned_people[right_idx];
            scored.push(ScoredPair {
                left,
                right,
                freedom: freedom_score_for_union(&[], &[left, right], day, future_overlap, met_before),
                repeat_damage: repeat_damage_for_union(&[], &[left, right], met_before),
                individual_future_sum: freedom_score_for_union(&[], &[left], day, future_overlap, met_before)
                    + freedom_score_for_union(&[], &[right], day, future_overlap, met_before),
            });
        }
    }

    if scored.is_empty() {
        return None;
    }

    scored.sort_by(|left, right| {
        right
            .freedom
            .cmp(&left.freedom)
            .then(left.repeat_damage.cmp(&right.repeat_damage))
            .then(right.individual_future_sum.cmp(&left.individual_future_sum))
            .then((left.left, left.right).cmp(&(right.left, right.right)))
    });

    let rcl_len = params.restricted_candidate_list_size.min(scored.len());
    scored[..rcl_len]
        .choose(rng)
        .map(|candidate| (candidate.left, candidate.right))
}

fn choose_best_candidate_for_group(
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
        repeat_damage: usize,
        individual_future: usize,
    }

    let mut scored = unassigned_people
        .iter()
        .map(|&person_idx| ScoredCandidate {
            person_idx,
            freedom: freedom_score_for_union(group_members, &[person_idx], day, future_overlap, met_before),
            repeat_damage: repeat_damage_for_union(group_members, &[person_idx], met_before),
            individual_future: freedom_score_for_union(&[], &[person_idx], day, future_overlap, met_before),
        })
        .collect::<Vec<_>>();

    if scored.is_empty() {
        return None;
    }

    scored.sort_by(|left, right| {
        right
            .freedom
            .cmp(&left.freedom)
            .then(left.repeat_damage.cmp(&right.repeat_damage))
            .then(right.individual_future.cmp(&left.individual_future))
            .then(left.person_idx.cmp(&right.person_idx))
    });

    let rcl_len = params.restricted_candidate_list_size.min(scored.len());
    scored[..rcl_len]
        .choose(rng)
        .map(|candidate| candidate.person_idx)
}

fn freedom_score_for_union(
    base_members: &[usize],
    added_members: &[usize],
    day: usize,
    future_overlap: &[Vec<Vec<bool>>],
    met_before: &[Vec<bool>],
) -> usize {
    let mut union_members = Vec::with_capacity(base_members.len() + added_members.len());
    union_members.extend_from_slice(base_members);
    union_members.extend_from_slice(added_members);
    if union_members.is_empty() {
        return 0;
    }

    let people_count = met_before.len();
    (0..people_count)
        .filter(|candidate| !union_members.contains(candidate))
        .filter(|&candidate| {
            union_members.iter().all(|&member| {
                !met_before[member][candidate] && future_overlap[day][member][candidate]
            })
        })
        .count()
}

fn repeat_damage_for_union(
    base_members: &[usize],
    added_members: &[usize],
    met_before: &[Vec<bool>],
) -> usize {
    let mut repeats = 0;
    for &base_member in base_members {
        for &added_member in added_members {
            if met_before[base_member][added_member] {
                repeats += 1;
            }
        }
    }
    for left_idx in 0..added_members.len() {
        for right_idx in (left_idx + 1)..added_members.len() {
            if met_before[added_members[left_idx]][added_members[right_idx]] {
                repeats += 1;
            }
        }
    }
    repeats
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

    fn context_with_schedule(
        schedule: Vec<Vec<Vec<usize>>>,
        person_participation: Vec<Vec<bool>>,
        group_sizes: Vec<usize>,
    ) -> BaselineConstructionContext<'static> {
        let group_idx_to_id = Box::leak(Box::new(vec!["g0".to_string(), "g1".to_string()]));
        let person_idx_to_id = Box::leak(Box::new(
            (0..person_participation.len())
                .map(|idx| format!("p{idx}"))
                .collect::<Vec<_>>(),
        ));
        let effective_group_capacities = Box::leak(Box::new(group_sizes));
        let person_participation = Box::leak(Box::new(person_participation));
        let immovable_people = Box::leak(Box::new(HashMap::new()));
        let cliques = Box::leak(Box::new(Vec::new()));
        let clique_sessions = Box::leak(Box::new(Vec::new()));
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
            schedule,
        }
    }

    #[test]
    fn future_overlap_only_counts_future_sessions() {
        let person_participation = vec![vec![true, false, false], vec![true, true, false], vec![false, true, true]];
        let matrix = build_future_overlap_matrix(&person_participation, 3);

        assert!(matrix[0][1][2], "day 0 should see session 1 future overlap for p1/p2");
        assert!(!matrix[1][0][1], "day 1 should not count day 0 as future overlap");
        assert!(!matrix[2][1][2], "last day should have no future overlap");
    }

    #[test]
    fn freedom_score_excludes_already_met_people() {
        let future_overlap = build_future_overlap_matrix(&vec![vec![true, true], vec![true, true], vec![true, true]], 2);
        let mut met_before = vec![vec![false; 3]; 3];
        met_before[0][2] = true;
        met_before[2][0] = true;

        let freedom = freedom_score_for_union(&[0], &[1], 0, &future_overlap, &met_before);
        assert_eq!(freedom, 0, "candidate p2 should be excluded because p0 already met p2");
    }

    #[test]
    fn freedom_aware_constructor_is_deterministic_for_fixed_seed() {
        let schedule = vec![vec![vec![], vec![]], vec![vec![], vec![]]];
        let person_participation = vec![vec![true, true], vec![true, true], vec![true, true], vec![true, true]];
        let capacities = vec![2, 2, 2, 2];
        let mut left_context = context_with_schedule(schedule.clone(), person_participation.clone(), capacities.clone());
        let mut right_context = context_with_schedule(schedule, person_participation, capacities);
        let params = FreedomAwareConstructionParams {
            restricted_candidate_list_size: 2,
        };

        apply_freedom_aware_construction_heuristic(&mut left_context, &params).unwrap();
        apply_freedom_aware_construction_heuristic(&mut right_context, &params).unwrap();

        assert_eq!(left_context.schedule, right_context.schedule);
    }

    #[test]
    fn freedom_aware_constructor_rejects_zero_sized_rcl() {
        let schedule = vec![vec![vec![], vec![]]];
        let person_participation = vec![vec![true], vec![true], vec![true], vec![true]];
        let capacities = vec![2, 2];
        let mut context = context_with_schedule(schedule, person_participation, capacities);

        let error = apply_freedom_aware_construction_heuristic(
            &mut context,
            &FreedomAwareConstructionParams {
                restricted_candidate_list_size: 0,
            },
        )
        .unwrap_err();

        assert!(matches!(error, SolverError::ValidationError(_)));
    }
}
