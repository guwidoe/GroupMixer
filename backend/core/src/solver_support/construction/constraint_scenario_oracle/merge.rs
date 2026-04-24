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

/// Merges projected oracle placements into a copy of the CS scaffold and repairs freed slots.
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
        );

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
            push_person_if_capacity(
                compiled,
                &mut schedule,
                real_session_idx,
                real_group_idx,
                real_person_idx,
            )?;
            changed_placement_count += 1;
        }

        displaced_repair_count += repair_displaced_people_by_assignment(
            compiled,
            &mut schedule,
            signals,
            real_session_idx,
            &displaced,
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
) -> Vec<Option<usize>> {
    let mut remaining_capacity_by_group = vec![0usize; compiled.num_groups];
    let selected_groups = &projection.real_group_by_session_oracle_group[session_pos];
    for &group_idx in &projection.real_group_by_session_oracle_group[session_pos] {
        let frozen_occupancy = scaffold[real_session_idx][group_idx]
            .iter()
            .filter(|&&person_idx| mask.is_frozen(compiled, real_session_idx, person_idx))
            .count();
        remaining_capacity_by_group[group_idx] = compiled
            .group_capacity(real_session_idx, group_idx)
            .saturating_sub(frozen_occupancy);
    }

    let mut candidate_people_by_group = vec![Vec::<usize>::new(); compiled.num_groups];
    let mut seen_candidate = vec![false; compiled.num_people];
    let mut accepted_target_by_person = vec![None; compiled.num_people];
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

        for &real_person_idx in candidate_people_by_group[real_group_idx]
            .iter()
            .take(remaining_capacity_by_group[real_group_idx])
        {
            accepted_target_by_person[real_person_idx] = Some(real_group_idx);
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

fn push_person_if_capacity(
    compiled: &CompiledProblem,
    schedule: &mut PackedSchedule,
    session_idx: usize,
    group_idx: usize,
    person_idx: usize,
) -> Result<(), SolverError> {
    if !compiled.person_participation[person_idx][session_idx] {
        return Err(SolverError::ValidationError(format!(
            "oracle merge tried to place non-participating person {} in session {}",
            compiled.display_person(person_idx),
            session_idx
        )));
    }
    if schedule[session_idx][group_idx].len() >= compiled.group_capacity(session_idx, group_idx) {
        return Err(SolverError::ValidationError(format!(
            "oracle merge overfilled group {} in session {}",
            compiled.display_group(group_idx),
            session_idx
        )));
    }
    schedule[session_idx][group_idx].push(person_idx);
    Ok(())
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
        push_person_if_capacity(compiled, schedule, session_idx, group_idx, person_idx)?;
    }
    Ok(displaced.len())
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
        let mut seen = vec![false; compiled.num_people];
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
                if seen[person_idx] {
                    return Err(SolverError::ValidationError(format!(
                        "oracle merge produced duplicate placement for {} in session {}",
                        compiled.display_person(person_idx),
                        session_idx
                    )));
                }
                seen[person_idx] = true;
            }
        }
        for (person_idx, participates) in compiled
            .person_participation
            .iter()
            .map(|sessions| sessions[session_idx])
            .enumerate()
        {
            if participates != seen[person_idx] {
                return Err(SolverError::ValidationError(format!(
                    "oracle merge produced missing/unexpected placement for {} in session {}",
                    compiled.display_person(person_idx),
                    session_idx
                )));
            }
        }
    }
    Ok(())
}
