//! Shared construction helpers for solver-family bootstrapping.
//!
//! This module intentionally hosts baseline schedule-construction behavior outside
//! of `solver1` ownership so other solver families can reuse the same bootstrap
//! semantics without copying logic.

use crate::models::ApiInput;
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
    pub num_sessions: usize,
    pub group_id_to_idx: &'a HashMap<String, usize>,
    pub group_idx_to_id: &'a [String],
    pub person_id_to_idx: &'a HashMap<String, usize>,
    pub person_idx_to_id: &'a [String],
    pub attr_key_to_idx: &'a HashMap<String, usize>,
    pub person_attributes: &'a [Vec<usize>],
    pub attr_idx_to_val: &'a [Vec<String>],
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

    fn display_person_by_idx(&self, person_idx: usize) -> String {
        let id_str = &self.person_idx_to_id[person_idx];
        if let Some(&name_attr_idx) = self.attr_key_to_idx.get("name") {
            let name_val_idx = self.person_attributes[person_idx][name_attr_idx];
            if name_val_idx != usize::MAX {
                if let Some(name_str) = self
                    .attr_idx_to_val
                    .get(name_attr_idx)
                    .and_then(|values| values.get(name_val_idx))
                {
                    return format!("{} ({})", name_str, id_str);
                }
            }
        }
        id_str.clone()
    }
}

pub(crate) fn apply_initial_schedule_warm_start(
    context: &mut BaselineConstructionContext<'_>,
    input: &ApiInput,
) -> Result<(), SolverError> {
    let Some(initial_schedule) = &input.initial_schedule else {
        return Ok(());
    };

    let num_sessions = context.num_sessions;
    let group_count = context.group_count();
    let people_count = context.people_count();

    // Build mapping of group id -> index for quick lookup
    // Expect keys like "session_0", iterate in sorted order by session index
    let mut sessions: Vec<(usize, &HashMap<String, Vec<String>>)> = initial_schedule
        .iter()
        .map(|(key, value)| {
            let session_idx = key
                .strip_prefix("session_")
                .ok_or_else(|| {
                    SolverError::ValidationError(format!(
                        "Initial schedule uses invalid session key '{}'",
                        key
                    ))
                })?
                .parse::<usize>()
                .map_err(|_| {
                    SolverError::ValidationError(format!(
                        "Initial schedule uses invalid session key '{}'",
                        key
                    ))
                })?;
            if session_idx >= num_sessions {
                return Err(SolverError::ValidationError(format!(
                    "Initial schedule references invalid session {} (max: {})",
                    session_idx,
                    num_sessions.saturating_sub(1)
                )));
            }
            Ok((session_idx, value))
        })
        .collect::<Result<_, _>>()?;
    sessions.sort_by_key(|(s_idx, _)| *s_idx);

    for (s_idx, group_map) in sessions {
        let day_schedule = &mut context.schedule[s_idx];
        let mut placed: Vec<bool> = vec![false; people_count];
        for (group_id, people_ids) in group_map.iter() {
            let &g_idx = context.group_id_to_idx.get(group_id).ok_or_else(|| {
                SolverError::ValidationError(format!(
                    "Initial schedule references unknown group '{}'",
                    group_id
                ))
            })?;
            let group_capacity = context.effective_group_capacities[s_idx * group_count + g_idx];
            for pid in people_ids {
                let &p_idx = context.person_id_to_idx.get(pid).ok_or_else(|| {
                    SolverError::ValidationError(format!(
                        "Initial schedule references unknown person '{}'",
                        pid
                    ))
                })?;
                if !context.person_participation[p_idx][s_idx] {
                    return Err(SolverError::ValidationError(format!(
                        "Initial schedule assigns non-participating person {} in session {}",
                        context.display_person_by_idx(p_idx),
                        s_idx
                    )));
                }
                if placed[p_idx] {
                    return Err(SolverError::ValidationError(format!(
                        "Initial schedule assigns person {} multiple times in session {}",
                        context.display_person_by_idx(p_idx),
                        s_idx
                    )));
                }
                if day_schedule[g_idx].len() >= group_capacity {
                    return Err(SolverError::ValidationError(format!(
                        "Initial schedule overfills group {} in session {}. Capacity: {}",
                        context.group_idx_to_id[g_idx], s_idx, group_capacity
                    )));
                }

                day_schedule[g_idx].push(p_idx);
                placed[p_idx] = true;
            }
        }
        // Any unplaced participating people will be filled in by random initializer below
    }

    Ok(())
}

pub(crate) fn apply_baseline_construction_heuristic(
    context: &mut BaselineConstructionContext<'_>,
) -> Result<(), SolverError> {
    let people_count = context.people_count();
    let group_count = context.group_count();

    // --- Initialize remaining slots with a random assignment (clique-aware) ---
    let mut rng = ChaCha12Rng::seed_from_u64(derive_phase_seed(
        context.effective_seed,
        BASELINE_CONSTRUCTION_SEED_SALT,
    ));

    for (day, day_schedule) in context.schedule.iter_mut().enumerate() {
        let mut group_cursors = vec![0; group_count];
        let mut assigned_in_day = vec![false; people_count];

        // Warm-start aware: mark already placed people and count existing occupants
        for (g_idx, members) in day_schedule.iter().enumerate() {
            group_cursors[g_idx] = members.len();
            for &p in members {
                if p < people_count {
                    assigned_in_day[p] = true;
                }
            }
        }

        // Get list of people participating in this session
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
            } // Already placed as part of a clique

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
            // Check if any member of the clique is already assigned in this day
            if clique.iter().any(|&member| assigned_in_day[member]) {
                continue;
            }

            // Check if all clique members are participating in this session
            let all_participating = clique
                .iter()
                .all(|&member| context.person_participation[member][day]);

            if !all_participating {
                // Some clique members not participating - handle individual placement
                continue;
            }

            // Check if this clique applies to this session (session-aware initialization)
            if let Some(ref sessions) = context.clique_sessions[clique_idx] {
                if !sessions.contains(&day) {
                    continue;
                }
            }

            // Find a group with enough space for the entire clique
            let mut placed = false;
            let mut potential_groups: Vec<usize> = (0..group_count).collect();
            potential_groups.shuffle(&mut rng);

            for group_idx in potential_groups {
                let group_size = context.effective_group_capacities[day * group_count + group_idx];
                let available_space = group_size - group_cursors[group_idx];

                if available_space >= clique.len() {
                    // Place the entire clique in this group
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
