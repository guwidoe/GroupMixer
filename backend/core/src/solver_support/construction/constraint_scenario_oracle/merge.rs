use std::collections::HashSet;

use crate::solver3::compiled_problem::{CompiledProblem, PackedSchedule};
use crate::solver_support::SolverError;

use super::oracle_backend::validate_pure_oracle_schedule;
use super::projection::projected_oracle_person_for_session;
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

        displaced.sort_unstable_by_key(|&(person_idx, preferred_group_idx)| {
            (preferred_group_idx, person_idx)
        });
        for (person_idx, preferred_group_idx) in displaced {
            let Some(repair_group_idx) = choose_repair_group(
                compiled,
                &schedule,
                signals,
                real_session_idx,
                person_idx,
                preferred_group_idx,
            ) else {
                return Err(SolverError::ValidationError(format!(
                    "oracle template merge could not repair displaced person {} in session {}",
                    compiled.display_person(person_idx),
                    real_session_idx
                )));
            };
            push_person_if_capacity(
                compiled,
                &mut schedule,
                real_session_idx,
                repair_group_idx,
                person_idx,
            )?;
            displaced_repair_count += 1;
        }
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
    mask: &ConstraintScenarioScaffoldMask,
    candidate: &OracleTemplateCandidate,
    oracle_schedule: &PureStructureOracleSchedule,
    projection: &OracleTemplateProjectionResult,
    session_pos: usize,
    real_session_idx: usize,
) -> Vec<Option<usize>> {
    let mut remaining_capacity_by_group = vec![0usize; compiled.num_groups];
    for &group_idx in &projection.real_group_by_session_oracle_group[session_pos] {
        let frozen_occupancy = scaffold[real_session_idx][group_idx]
            .iter()
            .filter(|&&person_idx| mask.is_frozen(compiled, real_session_idx, person_idx))
            .count();
        remaining_capacity_by_group[group_idx] = compiled
            .group_capacity(real_session_idx, group_idx)
            .saturating_sub(frozen_occupancy);
    }

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
            if remaining_capacity_by_group[real_group_idx] == 0
                || accepted_target_by_person[real_person_idx].is_some()
            {
                continue;
            }
            remaining_capacity_by_group[real_group_idx] -= 1;
            accepted_target_by_person[real_person_idx] = Some(real_group_idx);
        }
    }
    accepted_target_by_person
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

fn choose_repair_group(
    compiled: &CompiledProblem,
    schedule: &PackedSchedule,
    signals: &ConstraintScenarioSignals,
    session_idx: usize,
    person_idx: usize,
    preferred_group_idx: usize,
) -> Option<usize> {
    (0..compiled.num_groups)
        .filter(|&group_idx| {
            schedule[session_idx][group_idx].len() < compiled.group_capacity(session_idx, group_idx)
        })
        .max_by(|&left, &right| {
            let left_score = repair_group_score(
                compiled,
                signals,
                session_idx,
                person_idx,
                preferred_group_idx,
                left,
            );
            let right_score = repair_group_score(
                compiled,
                signals,
                session_idx,
                person_idx,
                preferred_group_idx,
                right,
            );
            left_score
                .partial_cmp(&right_score)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| right.cmp(&left))
        })
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
