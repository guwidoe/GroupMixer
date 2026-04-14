//! Shared construction helpers for solver-family bootstrapping.
//!
//! This module intentionally hosts baseline schedule-construction behavior outside
//! of `solver1` ownership so other solver families can reuse the same bootstrap
//! semantics without copying logic.

use crate::models::ApiInput;
use crate::solver_support::validation::validate_schedule_as_construction_seed;
use crate::solver_support::SolverError;
use rand::seq::SliceRandom;
use rand::SeedableRng;
use rand_chacha::ChaCha12Rng;
use std::collections::HashMap;

const BASELINE_CONSTRUCTION_SEED_SALT: u64 = 0x6a09e667f3bcc909;

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
    _context: &mut BaselineConstructionContext<'_>,
    params: &FreedomAwareConstructionParams,
) -> Result<(), SolverError> {
    if params.restricted_candidate_list_size == 0 {
        return Err(SolverError::ValidationError(
            "freedom-aware construction requires restricted_candidate_list_size >= 1".into(),
        ));
    }

    Err(SolverError::ValidationError(
        "solver3 freedom-aware construction mode is configured but not implemented yet".into(),
    ))
}
