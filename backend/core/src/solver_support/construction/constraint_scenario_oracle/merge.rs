use std::collections::HashSet;

use crate::solver3::compiled_problem::{CompiledProblem, PackedSchedule};
use crate::solver_support::SolverError;

use super::oracle_backend::validate_pure_oracle_schedule;
use super::projection::{projected_oracle_person_for_session, solve_max_weight_assignment};
use super::types::{
    ConstraintScenarioScaffoldMask, ConstraintScenarioSignals, OracleMergeResult,
    OracleTemplateCandidate, OracleTemplateProjectionResult, PureStructureOracleRequest,
    PureStructureOracleSchedule,
};

const HARD_APART_REPAIR_SEARCH_NODE_LIMIT: usize = 50_000;

/// Merges projected oracle placements into a copy of the CS scaffold.
///
/// Sessions with active `MustStayApart` constraints use a conservative non-displacing merge:
/// oracle placements may fill genuine open capacity, but they do not evict scaffold occupants.
/// That keeps pairwise hard-apart feasibility inside the constructor instead of depending on a
/// runtime repair layer to reconstruct damaged sessions.
pub(crate) fn merge_projected_oracle_template_into_scaffold(
    compiled: &CompiledProblem,
    scaffold: &PackedSchedule,
    signals: &ConstraintScenarioSignals,
    mask: &ConstraintScenarioScaffoldMask,
    candidate: &OracleTemplateCandidate,
    oracle_schedule: &PureStructureOracleSchedule,
    projection: &OracleTemplateProjectionResult,
) -> Result<OracleMergeResult, SolverError> {
    let request = PureStructureOracleRequest {
        num_groups: candidate.num_groups,
        group_size: candidate.group_size,
        num_sessions: candidate.num_sessions(),
        seed: 0,
    };
    validate_pure_oracle_schedule(&request, &oracle_schedule.schedule)?;
    validate_template_projection_for_merge(candidate, projection)?;

    let mut schedule = scaffold.clone();
    let mut changed_placement_count = 0usize;
    let mut displaced_repair_count = 0usize;
    for (session_pos, &real_session_idx) in candidate.sessions.iter().enumerate() {
        let preserve_existing_members = session_has_active_hard_apart(compiled, real_session_idx);
        let mut displaced = Vec::<(usize, usize)>::new();
        let mut removed = vec![false; compiled.num_people];
        let selected_real_groups = &projection.real_group_by_session_oracle_group[session_pos];
        let accepted_target_by_person = accepted_template_targets_for_session(
            compiled,
            scaffold,
            signals,
            mask,
            candidate,
            oracle_schedule,
            projection,
            session_pos,
            real_session_idx,
            preserve_existing_members,
        );

        if preserve_existing_members {
            changed_placement_count += apply_non_displacing_hard_apart_targets(
                compiled,
                &mut schedule,
                real_session_idx,
                accepted_target_by_person,
            )?;
            continue;
        }

        for &group_idx in selected_real_groups {
            let original_members = std::mem::take(&mut schedule[real_session_idx][group_idx]);
            for person_idx in original_members {
                if !mask.is_frozen(compiled, real_session_idx, person_idx) {
                    removed[person_idx] = true;
                    if accepted_target_by_person[person_idx].is_none() {
                        displaced.push((person_idx, group_idx));
                    }
                } else {
                    schedule[real_session_idx][group_idx].push(person_idx);
                }
            }
        }

        for (real_person_idx, target_group) in accepted_target_by_person.iter().enumerate() {
            if target_group.is_none() || removed[real_person_idx] {
                continue;
            }
            remove_person_from_session(&mut schedule, real_session_idx, real_person_idx)
                .ok_or_else(|| {
                    SolverError::ValidationError(format!(
                        "oracle template merge could not remove projected person {} from session {}",
                        compiled.display_person(real_person_idx),
                        real_session_idx
                    ))
                })?;
            removed[real_person_idx] = true;
        }

        for (real_person_idx, target_group) in accepted_target_by_person.into_iter().enumerate() {
            let Some(real_group_idx) = target_group else {
                continue;
            };
            push_person_if_feasible(
                compiled,
                &mut schedule,
                real_session_idx,
                real_group_idx,
                real_person_idx,
                "oracle template merge",
            )?;
            changed_placement_count += 1;
        }

        let (restored_count, remaining_displaced) = restore_displaced_to_original_open_slots(
            compiled,
            &mut schedule,
            real_session_idx,
            &displaced,
        )?;
        displaced_repair_count += restored_count;
        displaced_repair_count += repair_displaced_people_by_assignment(
            compiled,
            &mut schedule,
            signals,
            real_session_idx,
            &remaining_displaced,
        )?;
    }

    validate_packed_schedule_shape(compiled, &schedule)?;
    Ok(OracleMergeResult {
        schedule,
        changed_placement_count,
        displaced_repair_count,
    })
}

fn accepted_template_targets_for_session(
    compiled: &CompiledProblem,
    scaffold: &PackedSchedule,
    signals: &ConstraintScenarioSignals,
    mask: &ConstraintScenarioScaffoldMask,
    candidate: &OracleTemplateCandidate,
    oracle_schedule: &PureStructureOracleSchedule,
    projection: &OracleTemplateProjectionResult,
    session_pos: usize,
    real_session_idx: usize,
    preserve_existing_members: bool,
) -> Vec<Option<usize>> {
    let mut remaining_capacity_by_group = vec![0usize; compiled.num_groups];
    let selected_groups = &projection.real_group_by_session_oracle_group[session_pos];
    for &group_idx in &projection.real_group_by_session_oracle_group[session_pos] {
        let protected_occupancy = if preserve_existing_members {
            scaffold[real_session_idx][group_idx].len()
        } else {
            scaffold[real_session_idx][group_idx]
                .iter()
                .filter(|&&person_idx| mask.is_frozen(compiled, real_session_idx, person_idx))
                .count()
        };
        remaining_capacity_by_group[group_idx] = compiled
            .group_capacity(real_session_idx, group_idx)
            .saturating_sub(protected_occupancy);
    }

    let mut accepted_members_by_group = vec![Vec::<usize>::new(); compiled.num_groups];
    let mut candidate_people_by_group = vec![Vec::<usize>::new(); compiled.num_groups];
    let mut seen_candidate = vec![false; compiled.num_people];
    let mut accepted_target_by_person = vec![None; compiled.num_people];
    for &group_idx in selected_groups {
        accepted_members_by_group[group_idx] = if preserve_existing_members {
            scaffold[real_session_idx][group_idx].clone()
        } else {
            scaffold[real_session_idx][group_idx]
                .iter()
                .copied()
                .filter(|&person_idx| mask.is_frozen(compiled, real_session_idx, person_idx))
                .collect()
        };
    }
    for oracle_group_idx in 0..candidate.num_groups {
        let real_group_idx =
            projection.real_group_by_session_oracle_group[session_pos][oracle_group_idx];
        for &oracle_person_idx in &oracle_schedule.schedule[session_pos][oracle_group_idx] {
            let Some(real_person_idx) = projected_oracle_person_for_session(
                compiled,
                mask,
                &projection.real_person_by_oracle_person,
                real_session_idx,
                oracle_person_idx,
            ) else {
                continue;
            };
            if seen_candidate[real_person_idx] {
                continue;
            }
            seen_candidate[real_person_idx] = true;
            candidate_people_by_group[real_group_idx].push(real_person_idx);
        }
    }

    for &real_group_idx in selected_groups {
        candidate_people_by_group[real_group_idx].sort_by(|&left, &right| {
            let left_score = template_target_acceptance_score(
                compiled,
                scaffold,
                signals,
                real_session_idx,
                left,
                real_group_idx,
                selected_groups,
            );
            let right_score = template_target_acceptance_score(
                compiled,
                scaffold,
                signals,
                real_session_idx,
                right,
                real_group_idx,
                selected_groups,
            );
            right_score
                .partial_cmp(&left_score)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| left.cmp(&right))
        });

        for &real_person_idx in &candidate_people_by_group[real_group_idx] {
            if remaining_capacity_by_group[real_group_idx] == 0 {
                break;
            }
            if group_has_hard_apart_conflict(
                compiled,
                real_session_idx,
                &accepted_members_by_group[real_group_idx],
                real_person_idx,
            ) {
                continue;
            }
            accepted_target_by_person[real_person_idx] = Some(real_group_idx);
            accepted_members_by_group[real_group_idx].push(real_person_idx);
            remaining_capacity_by_group[real_group_idx] -= 1;
        }
    }
    accepted_target_by_person
}

fn template_target_acceptance_score(
    compiled: &CompiledProblem,
    scaffold: &PackedSchedule,
    signals: &ConstraintScenarioSignals,
    session_idx: usize,
    person_idx: usize,
    target_group_idx: usize,
    selected_groups: &[usize],
) -> f64 {
    let current_group_idx = current_group_in_session(scaffold, session_idx, person_idx);
    let keep_bonus = if current_group_idx == Some(target_group_idx) {
        3.0
    } else {
        0.0
    };
    let selected_region_move_bonus = current_group_idx
        .filter(|group_idx| selected_groups.contains(group_idx))
        .map(|_| 0.5)
        .unwrap_or(0.0);
    let outside_region_move_penalty = current_group_idx
        .filter(|&group_idx| group_idx != target_group_idx && !selected_groups.contains(&group_idx))
        .map(|_| 1.0)
        .unwrap_or(0.0);
    keep_bonus
        + selected_region_move_bonus
        + signals.placement_frequency(compiled, session_idx, person_idx, target_group_idx)
        + target_group_pair_pressure(
            compiled,
            scaffold,
            signals,
            session_idx,
            person_idx,
            target_group_idx,
        )
        - outside_region_move_penalty
}

fn target_group_pair_pressure(
    compiled: &CompiledProblem,
    scaffold: &PackedSchedule,
    signals: &ConstraintScenarioSignals,
    session_idx: usize,
    person_idx: usize,
    target_group_idx: usize,
) -> f64 {
    scaffold[session_idx][target_group_idx]
        .iter()
        .copied()
        .filter(|&other_idx| other_idx != person_idx)
        .map(|other_idx| {
            signals.pair_pressure(
                compiled,
                session_idx,
                compiled.pair_idx(person_idx, other_idx),
            )
        })
        .sum::<f64>()
}

fn validate_template_projection_for_merge(
    candidate: &OracleTemplateCandidate,
    projection: &OracleTemplateProjectionResult,
) -> Result<(), SolverError> {
    if projection.real_person_by_oracle_person.len() != candidate.oracle_capacity {
        return Err(SolverError::ValidationError(
            "oracle template merge received person projection with wrong shape".into(),
        ));
    }
    if projection.real_group_by_session_oracle_group.len() != candidate.num_sessions() {
        return Err(SolverError::ValidationError(
            "oracle template merge received group projection with wrong session count".into(),
        ));
    }
    for (session_pos, groups) in projection
        .real_group_by_session_oracle_group
        .iter()
        .enumerate()
    {
        if groups.len() != candidate.num_groups {
            return Err(SolverError::ValidationError(
                "oracle template merge received group projection with wrong group count".into(),
            ));
        }
        for &group_idx in groups {
            if !candidate.groups_by_session[session_pos].contains(&group_idx) {
                return Err(SolverError::ValidationError(
                    "oracle template merge received group outside candidate template".into(),
                ));
            }
        }
    }
    let mut seen = HashSet::new();
    for &maybe_person in &projection.real_person_by_oracle_person {
        if let Some(person_idx) = maybe_person {
            if !seen.insert(person_idx) {
                return Err(SolverError::ValidationError(
                    "oracle template merge received duplicate real-person projection".into(),
                ));
            }
        }
    }
    Ok(())
}

fn remove_person_from_session(
    schedule: &mut PackedSchedule,
    session_idx: usize,
    person_idx: usize,
) -> Option<usize> {
    for (group_idx, members) in schedule[session_idx].iter_mut().enumerate() {
        if let Some(position) = members.iter().position(|&member| member == person_idx) {
            members.swap_remove(position);
            return Some(group_idx);
        }
    }
    None
}

fn current_group_in_session(
    schedule: &PackedSchedule,
    session_idx: usize,
    person_idx: usize,
) -> Option<usize> {
    schedule[session_idx]
        .iter()
        .position(|members| members.contains(&person_idx))
}

fn apply_non_displacing_hard_apart_targets(
    compiled: &CompiledProblem,
    schedule: &mut PackedSchedule,
    session_idx: usize,
    accepted_target_by_person: Vec<Option<usize>>,
) -> Result<usize, SolverError> {
    let mut changed = 0usize;
    for (person_idx, maybe_target_group_idx) in accepted_target_by_person.into_iter().enumerate() {
        let Some(target_group_idx) = maybe_target_group_idx else {
            continue;
        };
        let current_group_idx = current_group_in_session(schedule, session_idx, person_idx);
        if current_group_idx == Some(target_group_idx) {
            continue;
        }
        if schedule[session_idx][target_group_idx].len()
            >= compiled.group_capacity(session_idx, target_group_idx)
            || group_has_hard_apart_conflict(
                compiled,
                session_idx,
                &schedule[session_idx][target_group_idx],
                person_idx,
            )
        {
            continue;
        }
        remove_person_from_session(schedule, session_idx, person_idx).ok_or_else(|| {
            SolverError::ValidationError(format!(
                "oracle template merge could not remove projected person {} from session {}",
                compiled.display_person(person_idx),
                session_idx
            ))
        })?;
        push_person_if_feasible(
            compiled,
            schedule,
            session_idx,
            target_group_idx,
            person_idx,
            "oracle template hard-apart-safe merge",
        )?;
        changed += 1;
    }
    Ok(changed)
}

fn push_person_if_feasible(
    compiled: &CompiledProblem,
    schedule: &mut PackedSchedule,
    session_idx: usize,
    group_idx: usize,
    person_idx: usize,
    context: &str,
) -> Result<(), SolverError> {
    if !compiled.person_participation[person_idx][session_idx] {
        return Err(SolverError::ValidationError(format!(
            "{context} tried to place non-participating person {} in session {}",
            compiled.display_person(person_idx),
            session_idx
        )));
    }
    if schedule[session_idx][group_idx].len() >= compiled.group_capacity(session_idx, group_idx) {
        return Err(SolverError::ValidationError(format!(
            "{context} overfilled group {} in session {}",
            compiled.display_group(group_idx),
            session_idx
        )));
    }
    if group_has_hard_apart_conflict(
        compiled,
        session_idx,
        &schedule[session_idx][group_idx],
        person_idx,
    ) {
        return Err(SolverError::ValidationError(format!(
            "{context} would place person {} with a MustStayApart partner in group {} for session {}",
            compiled.display_person(person_idx),
            compiled.display_group(group_idx),
            session_idx
        )));
    }
    schedule[session_idx][group_idx].push(person_idx);
    Ok(())
}

fn group_has_hard_apart_conflict(
    compiled: &CompiledProblem,
    session_idx: usize,
    group_members: &[usize],
    person_idx: usize,
) -> bool {
    !compiled.hard_apart_pairs_by_person[person_idx].is_empty()
        && group_members
            .iter()
            .any(|&member| compiled.hard_apart_active(session_idx, person_idx, member))
}

fn session_has_active_hard_apart(compiled: &CompiledProblem, session_idx: usize) -> bool {
    compiled.hard_apart_pairs.iter().any(|pair| {
        let (left, right) = pair.people;
        compiled.person_participation[left][session_idx]
            && compiled.person_participation[right][session_idx]
            && compiled.hard_apart_active(session_idx, left, right)
    })
}

fn repair_displaced_people_by_assignment(
    compiled: &CompiledProblem,
    schedule: &mut PackedSchedule,
    signals: &ConstraintScenarioSignals,
    session_idx: usize,
    displaced: &[(usize, usize)],
) -> Result<usize, SolverError> {
    if displaced.is_empty() {
        return Ok(0);
    }

    let mut open_slots = Vec::<usize>::new();
    for group_idx in 0..compiled.num_groups {
        let capacity = compiled.group_capacity(session_idx, group_idx);
        let occupancy = schedule[session_idx][group_idx].len();
        for _ in occupancy..capacity {
            open_slots.push(group_idx);
        }
    }
    if open_slots.len() < displaced.len() {
        return Err(SolverError::ValidationError(format!(
            "oracle template merge had {} displaced people but only {} open slots in session {}",
            displaced.len(),
            open_slots.len(),
            session_idx
        )));
    }

    if !compiled.hard_apart_pairs.is_empty() {
        let assignment = solve_hard_apart_aware_displaced_assignment(
            compiled,
            schedule,
            signals,
            session_idx,
            displaced,
        )?;
        for (row_idx, group_idx) in assignment.into_iter().enumerate() {
            let (person_idx, _) = displaced[row_idx];
            push_person_if_feasible(
                compiled,
                schedule,
                session_idx,
                group_idx,
                person_idx,
                "oracle template merge hard-apart-aware repair",
            )?;
        }
        return Ok(displaced.len());
    }

    let score_matrix = displaced
        .iter()
        .map(|&(person_idx, preferred_group_idx)| {
            open_slots
                .iter()
                .map(|&group_idx| {
                    repair_group_score(
                        compiled,
                        signals,
                        session_idx,
                        person_idx,
                        preferred_group_idx,
                        group_idx,
                    )
                })
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();
    let assignment = solve_max_weight_assignment(&score_matrix);
    for (row_idx, &slot_idx) in assignment.iter().enumerate() {
        let (person_idx, _) = displaced[row_idx];
        let Some(&group_idx) = open_slots.get(slot_idx) else {
            return Err(SolverError::ValidationError(
                "oracle template merge repair assignment produced an invalid slot".into(),
            ));
        };
        push_person_if_feasible(
            compiled,
            schedule,
            session_idx,
            group_idx,
            person_idx,
            "oracle template merge repair assignment",
        )?;
    }
    Ok(displaced.len())
}

fn restore_displaced_to_original_open_slots(
    compiled: &CompiledProblem,
    schedule: &mut PackedSchedule,
    session_idx: usize,
    displaced: &[(usize, usize)],
) -> Result<(usize, Vec<(usize, usize)>), SolverError> {
    let mut restored_count = 0usize;
    let mut remaining_displaced = Vec::new();
    for &(person_idx, original_group_idx) in displaced {
        if schedule[session_idx][original_group_idx].len()
            < compiled.group_capacity(session_idx, original_group_idx)
            && !group_has_hard_apart_conflict(
                compiled,
                session_idx,
                &schedule[session_idx][original_group_idx],
                person_idx,
            )
        {
            push_person_if_feasible(
                compiled,
                schedule,
                session_idx,
                original_group_idx,
                person_idx,
                "oracle template merge original-slot restore",
            )?;
            restored_count += 1;
        } else {
            remaining_displaced.push((person_idx, original_group_idx));
        }
    }
    Ok((restored_count, remaining_displaced))
}

fn solve_hard_apart_aware_displaced_assignment(
    compiled: &CompiledProblem,
    schedule: &PackedSchedule,
    signals: &ConstraintScenarioSignals,
    session_idx: usize,
    displaced: &[(usize, usize)],
) -> Result<Vec<usize>, SolverError> {
    let mut remaining_capacity = (0..compiled.num_groups)
        .map(|group_idx| {
            compiled
                .group_capacity(session_idx, group_idx)
                .saturating_sub(schedule[session_idx][group_idx].len())
        })
        .collect::<Vec<_>>();
    let total_slots = remaining_capacity.iter().sum::<usize>();
    if total_slots < displaced.len() {
        return Err(SolverError::ValidationError(format!(
            "oracle template merge hard-apart-aware repair had {} displaced people but only {} open slots in session {}",
            displaced.len(), total_slots, session_idx
        )));
    }

    let candidate_groups_by_row = displaced
        .iter()
        .map(|&(person_idx, preferred_group_idx)| {
            let mut groups = (0..compiled.num_groups)
                .filter(|&group_idx| {
                    remaining_capacity[group_idx] > 0
                        && !group_has_hard_apart_conflict(
                            compiled,
                            session_idx,
                            &schedule[session_idx][group_idx],
                            person_idx,
                        )
                })
                .collect::<Vec<_>>();
            groups.sort_by(|&left, &right| {
                repair_group_score(
                    compiled,
                    signals,
                    session_idx,
                    person_idx,
                    preferred_group_idx,
                    right,
                )
                .partial_cmp(&repair_group_score(
                    compiled,
                    signals,
                    session_idx,
                    person_idx,
                    preferred_group_idx,
                    left,
                ))
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| left.cmp(&right))
            });
            groups
        })
        .collect::<Vec<_>>();

    if let Some((row_idx, _)) = candidate_groups_by_row
        .iter()
        .enumerate()
        .find(|(_, groups)| groups.is_empty())
    {
        let (person_idx, _) = displaced[row_idx];
        return Err(SolverError::ValidationError(format!(
            "oracle template merge could not repair displaced person '{}' without violating MustStayApart in session {}",
            compiled.display_person(person_idx),
            session_idx
        )));
    }

    let mut row_order = (0..displaced.len()).collect::<Vec<_>>();
    row_order.sort_by(|&left, &right| {
        candidate_groups_by_row[left]
            .len()
            .cmp(&candidate_groups_by_row[right].len())
            .then_with(|| {
                active_hard_apart_degree(compiled, session_idx, displaced[right].0).cmp(
                    &active_hard_apart_degree(compiled, session_idx, displaced[left].0),
                )
            })
            .then_with(|| displaced[left].0.cmp(&displaced[right].0))
    });

    let mut assignment = vec![usize::MAX; displaced.len()];
    let mut additions_by_group = vec![Vec::<usize>::new(); compiled.num_groups];
    let mut nodes_remaining = HARD_APART_REPAIR_SEARCH_NODE_LIMIT;
    if assign_displaced_hard_apart_dfs(
        compiled,
        schedule,
        session_idx,
        displaced,
        &candidate_groups_by_row,
        &row_order,
        0,
        &mut remaining_capacity,
        &mut additions_by_group,
        &mut assignment,
        &mut nodes_remaining,
    ) {
        return Ok(assignment);
    }

    Err(SolverError::ValidationError(format!(
        "oracle template merge could not find a MustStayApart-safe displaced-person repair in session {}",
        session_idx
    )))
}

#[allow(clippy::too_many_arguments)]
fn assign_displaced_hard_apart_dfs(
    compiled: &CompiledProblem,
    schedule: &PackedSchedule,
    session_idx: usize,
    displaced: &[(usize, usize)],
    candidate_groups_by_row: &[Vec<usize>],
    row_order: &[usize],
    depth: usize,
    remaining_capacity: &mut [usize],
    additions_by_group: &mut [Vec<usize>],
    assignment: &mut [usize],
    nodes_remaining: &mut usize,
) -> bool {
    if depth == row_order.len() {
        return true;
    }
    if *nodes_remaining == 0 {
        return false;
    }
    *nodes_remaining -= 1;

    let row_idx = row_order[depth];
    let person_idx = displaced[row_idx].0;
    for &group_idx in &candidate_groups_by_row[row_idx] {
        if remaining_capacity[group_idx] == 0 {
            continue;
        }
        if group_has_hard_apart_conflict(
            compiled,
            session_idx,
            &additions_by_group[group_idx],
            person_idx,
        ) || group_has_hard_apart_conflict(
            compiled,
            session_idx,
            &schedule[session_idx][group_idx],
            person_idx,
        ) {
            continue;
        }

        remaining_capacity[group_idx] -= 1;
        additions_by_group[group_idx].push(person_idx);
        assignment[row_idx] = group_idx;
        if assign_displaced_hard_apart_dfs(
            compiled,
            schedule,
            session_idx,
            displaced,
            candidate_groups_by_row,
            row_order,
            depth + 1,
            remaining_capacity,
            additions_by_group,
            assignment,
            nodes_remaining,
        ) {
            return true;
        }
        assignment[row_idx] = usize::MAX;
        additions_by_group[group_idx].pop();
        remaining_capacity[group_idx] += 1;
    }

    false
}

fn active_hard_apart_degree(
    compiled: &CompiledProblem,
    session_idx: usize,
    person_idx: usize,
) -> usize {
    compiled.hard_apart_pairs_by_person[person_idx]
        .iter()
        .copied()
        .filter(|&constraint_idx| {
            let pair = &compiled.hard_apart_pairs[constraint_idx];
            let (left, right) = pair.people;
            let other = if left == person_idx { right } else { left };
            compiled.person_participation[other][session_idx]
                && compiled.hard_apart_active(session_idx, person_idx, other)
        })
        .count()
}

fn repair_group_score(
    compiled: &CompiledProblem,
    signals: &ConstraintScenarioSignals,
    session_idx: usize,
    person_idx: usize,
    preferred_group_idx: usize,
    candidate_group_idx: usize,
) -> f64 {
    let scaffold_prior = if candidate_group_idx == preferred_group_idx {
        2.0
    } else {
        0.0
    };
    scaffold_prior
        + signals.placement_frequency(compiled, session_idx, person_idx, candidate_group_idx)
}

fn validate_packed_schedule_shape(
    compiled: &CompiledProblem,
    schedule: &PackedSchedule,
) -> Result<(), SolverError> {
    if schedule.len() != compiled.num_sessions {
        return Err(SolverError::ValidationError(
            "oracle merge produced wrong session count".into(),
        ));
    }
    for (session_idx, groups) in schedule.iter().enumerate() {
        if groups.len() != compiled.num_groups {
            return Err(SolverError::ValidationError(format!(
                "oracle merge produced wrong group count in session {session_idx}"
            )));
        }
        let mut person_group = vec![None; compiled.num_people];
        for (group_idx, members) in groups.iter().enumerate() {
            if members.len() > compiled.group_capacity(session_idx, group_idx) {
                return Err(SolverError::ValidationError(format!(
                    "oracle merge produced over-capacity group {} in session {}",
                    compiled.display_group(group_idx),
                    session_idx
                )));
            }
            for &person_idx in members {
                if person_idx >= compiled.num_people {
                    return Err(SolverError::ValidationError(
                        "oracle merge produced out-of-range person index".into(),
                    ));
                }
                if !compiled.person_participation[person_idx][session_idx] {
                    return Err(SolverError::ValidationError(format!(
                        "oracle merge produced non-participating placement for {} in session {}",
                        compiled.display_person(person_idx),
                        session_idx
                    )));
                }
                if person_group[person_idx].is_some() {
                    return Err(SolverError::ValidationError(format!(
                        "oracle merge produced duplicate placement for {} in session {}",
                        compiled.display_person(person_idx),
                        session_idx
                    )));
                }
                person_group[person_idx] = Some(group_idx);
            }
        }
        for (person_idx, participates) in compiled
            .person_participation
            .iter()
            .map(|sessions| sessions[session_idx])
            .enumerate()
        {
            if participates != person_group[person_idx].is_some() {
                return Err(SolverError::ValidationError(format!(
                    "oracle merge produced missing/unexpected placement for {} in session {}",
                    compiled.display_person(person_idx),
                    session_idx
                )));
            }
        }
        validate_oracle_merge_hard_constraints(compiled, session_idx, &person_group)?;
    }
    Ok(())
}

fn validate_oracle_merge_hard_constraints(
    compiled: &CompiledProblem,
    session_idx: usize,
    person_group: &[Option<usize>],
) -> Result<(), SolverError> {
    for clique in &compiled.cliques {
        if let Some(sessions) = &clique.sessions {
            if !sessions.contains(&session_idx) {
                continue;
            }
        }
        let active_members = clique
            .members
            .iter()
            .copied()
            .filter(|&member| compiled.person_participation[member][session_idx])
            .collect::<Vec<_>>();
        if active_members.len() < 2 {
            continue;
        }
        let first_group = person_group[active_members[0]];
        if active_members
            .iter()
            .any(|&member| person_group[member] != first_group)
        {
            let members = active_members
                .iter()
                .map(|&member| compiled.display_person(member))
                .collect::<Vec<_>>();
            return Err(SolverError::ValidationError(format!(
                "oracle merge split MustStayTogether clique {:?} in session {}",
                members, session_idx
            )));
        }
    }

    for assignment in compiled
        .immovable_assignments
        .iter()
        .filter(|assignment| assignment.session_idx == session_idx)
    {
        if !compiled.person_participation[assignment.person_idx][session_idx] {
            continue;
        }
        if person_group[assignment.person_idx] != Some(assignment.group_idx) {
            return Err(SolverError::ValidationError(format!(
                "oracle merge moved immovable person '{}' out of group '{}' in session {}",
                compiled.display_person(assignment.person_idx),
                compiled.display_group(assignment.group_idx),
                session_idx
            )));
        }
    }

    for pair in &compiled.hard_apart_pairs {
        if let Some(sessions) = &pair.sessions {
            if !sessions.contains(&session_idx) {
                continue;
            }
        }
        let (left, right) = pair.people;
        if !compiled.person_participation[left][session_idx]
            || !compiled.person_participation[right][session_idx]
        {
            continue;
        }
        if person_group[left].is_some() && person_group[left] == person_group[right] {
            return Err(SolverError::ValidationError(format!(
                "oracle merge placed MustStayApart pair ['{}', '{}'] together in group '{}' for session {}",
                compiled.display_person(left),
                compiled.display_person(right),
                compiled.display_group(person_group[left].expect("checked above")),
                session_idx
            )));
        }
    }

    Ok(())
}
