use crate::solver3::compiled_problem::{CompiledProblem, PackedSchedule};
use crate::solver_support::SolverError;

use super::oracle_backend::validate_pure_oracle_schedule;
use super::template_candidates::person_oracle_template_priority;
use super::types::{
    ConstraintScenarioScaffoldMask, ConstraintScenarioSignals, OracleTemplateCandidate,
    OracleTemplateProjectionResult, PureStructureOracleRequest, PureStructureOracleSchedule,
};

/// Projects oracle-local people and groups into one capacity-template candidate.
pub(crate) fn project_oracle_schedule_to_template(
    compiled: &CompiledProblem,
    signals: &ConstraintScenarioSignals,
    mask: &ConstraintScenarioScaffoldMask,
    candidate: &OracleTemplateCandidate,
    oracle_schedule: &PureStructureOracleSchedule,
) -> Result<OracleTemplateProjectionResult, SolverError> {
    let request = PureStructureOracleRequest {
        num_groups: candidate.num_groups,
        group_size: candidate.group_size,
        num_sessions: candidate.num_sessions(),
        seed: 0,
    };
    validate_pure_oracle_schedule(&request, &oracle_schedule.schedule)?;

    let mut real_person_by_oracle_person =
        initial_template_person_projection(compiled, signals, mask, candidate);
    let mut pair_alignment_score = oracle_template_pair_alignment_score(
        compiled,
        signals,
        mask,
        candidate,
        &oracle_schedule.schedule,
        &real_person_by_oracle_person,
    );
    improve_template_person_projection_by_swaps(
        compiled,
        signals,
        mask,
        candidate,
        &oracle_schedule.schedule,
        &mut real_person_by_oracle_person,
        &mut pair_alignment_score,
    );

    let (real_group_by_session_oracle_group, group_alignment_score, rigidity_mismatch) =
        align_oracle_template_groups_to_real_groups(
            compiled,
            signals,
            mask,
            candidate,
            &oracle_schedule.schedule,
            &real_person_by_oracle_person,
        );
    let mapped_real_people = real_person_by_oracle_person
        .iter()
        .filter(|person| person.is_some())
        .count();
    let dummy_oracle_people = real_person_by_oracle_person.len() - mapped_real_people;

    Ok(OracleTemplateProjectionResult {
        real_person_by_oracle_person,
        real_group_by_session_oracle_group,
        score: pair_alignment_score + group_alignment_score - rigidity_mismatch,
        pair_alignment_score,
        group_alignment_score,
        rigidity_mismatch,
        mapped_real_people,
        dummy_oracle_people,
    })
}

fn initial_template_person_projection(
    compiled: &CompiledProblem,
    signals: &ConstraintScenarioSignals,
    mask: &ConstraintScenarioScaffoldMask,
    candidate: &OracleTemplateCandidate,
) -> Vec<Option<usize>> {
    let mut people = template_candidate_projectable_people(compiled, signals, mask, candidate);
    people.truncate(candidate.oracle_capacity);

    let mut real_person_by_oracle_person = vec![None; candidate.oracle_capacity];
    for (oracle_person_idx, real_person_idx) in people.into_iter().enumerate() {
        real_person_by_oracle_person[oracle_person_idx] = Some(real_person_idx);
    }
    real_person_by_oracle_person
}

fn template_candidate_projectable_people(
    compiled: &CompiledProblem,
    signals: &ConstraintScenarioSignals,
    mask: &ConstraintScenarioScaffoldMask,
    candidate: &OracleTemplateCandidate,
) -> Vec<usize> {
    let mut people = (0..compiled.num_people)
        .filter(|&person_idx| {
            candidate.sessions.iter().any(|&session_idx| {
                compiled.person_participation[person_idx][session_idx]
                    && !mask.is_frozen(compiled, session_idx, person_idx)
            })
        })
        .collect::<Vec<_>>();
    people.sort_by(|&left, &right| {
        let left_sessions = movable_template_session_count(compiled, mask, candidate, left);
        let right_sessions = movable_template_session_count(compiled, mask, candidate, right);
        right_sessions
            .cmp(&left_sessions)
            .then_with(|| {
                person_oracle_template_priority(compiled, signals, &candidate.sessions, right)
                    .partial_cmp(&person_oracle_template_priority(
                        compiled,
                        signals,
                        &candidate.sessions,
                        left,
                    ))
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .then_with(|| left.cmp(&right))
    });
    people
}

fn movable_template_session_count(
    compiled: &CompiledProblem,
    mask: &ConstraintScenarioScaffoldMask,
    candidate: &OracleTemplateCandidate,
    person_idx: usize,
) -> usize {
    candidate
        .sessions
        .iter()
        .filter(|&&session_idx| {
            compiled.person_participation[person_idx][session_idx]
                && !mask.is_frozen(compiled, session_idx, person_idx)
        })
        .count()
}

fn improve_template_person_projection_by_swaps(
    compiled: &CompiledProblem,
    signals: &ConstraintScenarioSignals,
    mask: &ConstraintScenarioScaffoldMask,
    candidate: &OracleTemplateCandidate,
    oracle_schedule: &PackedSchedule,
    real_person_by_oracle_person: &mut [Option<usize>],
    pair_alignment_score: &mut f64,
) {
    const MAX_RELABEL_SWEEPS: usize = 2;
    for _ in 0..MAX_RELABEL_SWEEPS {
        let mut best_swap = None;
        let mut best_score = *pair_alignment_score;
        for left in 0..real_person_by_oracle_person.len() {
            for right in (left + 1)..real_person_by_oracle_person.len() {
                real_person_by_oracle_person.swap(left, right);
                let candidate_score = oracle_template_pair_alignment_score(
                    compiled,
                    signals,
                    mask,
                    candidate,
                    oracle_schedule,
                    real_person_by_oracle_person,
                );
                real_person_by_oracle_person.swap(left, right);
                if candidate_score > best_score + 1e-9 {
                    best_score = candidate_score;
                    best_swap = Some((left, right));
                }
            }
        }
        let Some((left, right)) = best_swap else {
            return;
        };
        real_person_by_oracle_person.swap(left, right);
        *pair_alignment_score = best_score;
    }
}

fn oracle_template_pair_alignment_score(
    compiled: &CompiledProblem,
    signals: &ConstraintScenarioSignals,
    mask: &ConstraintScenarioScaffoldMask,
    candidate: &OracleTemplateCandidate,
    oracle_schedule: &PackedSchedule,
    real_person_by_oracle_person: &[Option<usize>],
) -> f64 {
    candidate
        .sessions
        .iter()
        .enumerate()
        .map(|(session_pos, &real_session_idx)| {
            oracle_schedule[session_pos]
                .iter()
                .flat_map(|oracle_group| {
                    oracle_group
                        .iter()
                        .enumerate()
                        .flat_map(move |(idx, &left)| {
                            oracle_group
                                .iter()
                                .skip(idx + 1)
                                .map(move |&right| (left, right))
                        })
                })
                .filter_map(|(left, right)| {
                    let real_left = projected_oracle_person_for_session(
                        compiled,
                        mask,
                        real_person_by_oracle_person,
                        real_session_idx,
                        left,
                    )?;
                    let real_right = projected_oracle_person_for_session(
                        compiled,
                        mask,
                        real_person_by_oracle_person,
                        real_session_idx,
                        right,
                    )?;
                    Some(signals.pair_pressure(
                        compiled,
                        real_session_idx,
                        compiled.pair_idx(real_left, real_right),
                    ))
                })
                .sum::<f64>()
        })
        .sum()
}

pub(super) fn projected_oracle_person_for_session(
    compiled: &CompiledProblem,
    mask: &ConstraintScenarioScaffoldMask,
    real_person_by_oracle_person: &[Option<usize>],
    real_session_idx: usize,
    oracle_person_idx: usize,
) -> Option<usize> {
    let real_person_idx = real_person_by_oracle_person[oracle_person_idx]?;
    (compiled.person_participation[real_person_idx][real_session_idx]
        && !mask.is_frozen(compiled, real_session_idx, real_person_idx))
    .then_some(real_person_idx)
}

fn align_oracle_template_groups_to_real_groups(
    compiled: &CompiledProblem,
    signals: &ConstraintScenarioSignals,
    mask: &ConstraintScenarioScaffoldMask,
    candidate: &OracleTemplateCandidate,
    oracle_schedule: &PackedSchedule,
    real_person_by_oracle_person: &[Option<usize>],
) -> (Vec<Vec<usize>>, f64, f64) {
    let mut aligned_groups = Vec::with_capacity(candidate.num_sessions());
    let mut total_group_score = 0.0;
    let mut total_rigidity_mismatch = 0.0;

    for (session_pos, &real_session_idx) in candidate.sessions.iter().enumerate() {
        let candidate_real_groups = &candidate.groups_by_session[session_pos];
        let score_matrix = (0..candidate.num_groups)
            .map(|oracle_group_idx| {
                candidate_real_groups
                    .iter()
                    .map(|&real_group_idx| {
                        oracle_template_group_alignment_score(
                            compiled,
                            signals,
                            mask,
                            real_session_idx,
                            real_group_idx,
                            &oracle_schedule[session_pos][oracle_group_idx],
                            real_person_by_oracle_person,
                        )
                    })
                    .collect::<Vec<_>>()
            })
            .collect::<Vec<_>>();
        let group_assignment = choose_group_assignment(&score_matrix);
        let mut session_groups = vec![0usize; candidate.num_groups];
        for (oracle_group_idx, candidate_idx) in group_assignment.into_iter().enumerate() {
            let real_group_idx = candidate_real_groups[candidate_idx];
            session_groups[oracle_group_idx] = real_group_idx;
            total_group_score += score_matrix[oracle_group_idx][candidate_idx];
            total_rigidity_mismatch += oracle_template_group_rigidity_mismatch(
                compiled,
                signals,
                mask,
                real_session_idx,
                real_group_idx,
                &oracle_schedule[session_pos][oracle_group_idx],
                real_person_by_oracle_person,
            );
        }
        aligned_groups.push(session_groups);
    }

    (aligned_groups, total_group_score, total_rigidity_mismatch)
}

fn oracle_template_group_alignment_score(
    compiled: &CompiledProblem,
    signals: &ConstraintScenarioSignals,
    mask: &ConstraintScenarioScaffoldMask,
    real_session_idx: usize,
    real_group_idx: usize,
    oracle_group: &[usize],
    real_person_by_oracle_person: &[Option<usize>],
) -> f64 {
    oracle_group
        .iter()
        .filter_map(|&oracle_person_idx| {
            projected_oracle_person_for_session(
                compiled,
                mask,
                real_person_by_oracle_person,
                real_session_idx,
                oracle_person_idx,
            )
        })
        .map(|real_person_idx| {
            let placement = signals.placement_frequency(
                compiled,
                real_session_idx,
                real_person_idx,
                real_group_idx,
            );
            let rigidity = signals.rigidity(compiled, real_session_idx, real_person_idx);
            placement - 0.25 * rigidity * (1.0 - placement)
        })
        .sum()
}

fn oracle_template_group_rigidity_mismatch(
    compiled: &CompiledProblem,
    signals: &ConstraintScenarioSignals,
    mask: &ConstraintScenarioScaffoldMask,
    real_session_idx: usize,
    real_group_idx: usize,
    oracle_group: &[usize],
    real_person_by_oracle_person: &[Option<usize>],
) -> f64 {
    oracle_group
        .iter()
        .filter_map(|&oracle_person_idx| {
            projected_oracle_person_for_session(
                compiled,
                mask,
                real_person_by_oracle_person,
                real_session_idx,
                oracle_person_idx,
            )
        })
        .map(|real_person_idx| {
            let placement = signals.placement_frequency(
                compiled,
                real_session_idx,
                real_person_idx,
                real_group_idx,
            );
            let rigidity = signals.rigidity(compiled, real_session_idx, real_person_idx);
            rigidity * (1.0 - placement)
        })
        .sum()
}

fn choose_group_assignment(score_matrix: &[Vec<f64>]) -> Vec<usize> {
    if score_matrix.len() <= 8 {
        return choose_group_assignment_exact(score_matrix);
    }
    choose_group_assignment_greedy(score_matrix)
}

fn choose_group_assignment_exact(score_matrix: &[Vec<f64>]) -> Vec<usize> {
    fn search(
        row: usize,
        score_matrix: &[Vec<f64>],
        used: &mut [bool],
        current: &mut Vec<usize>,
        current_score: f64,
        best: &mut (f64, Vec<usize>),
    ) {
        if row == score_matrix.len() {
            if current_score > best.0 || (current_score == best.0 && *current < best.1) {
                *best = (current_score, current.clone());
            }
            return;
        }
        for candidate_idx in 0..score_matrix[row].len() {
            if used[candidate_idx] {
                continue;
            }
            used[candidate_idx] = true;
            current.push(candidate_idx);
            search(
                row + 1,
                score_matrix,
                used,
                current,
                current_score + score_matrix[row][candidate_idx],
                best,
            );
            current.pop();
            used[candidate_idx] = false;
        }
    }

    let width = score_matrix.first().map(Vec::len).unwrap_or(0);
    let mut best = (f64::NEG_INFINITY, Vec::new());
    search(
        0,
        score_matrix,
        &mut vec![false; width],
        &mut Vec::with_capacity(score_matrix.len()),
        0.0,
        &mut best,
    );
    best.1
}

fn choose_group_assignment_greedy(score_matrix: &[Vec<f64>]) -> Vec<usize> {
    let mut assignment = vec![usize::MAX; score_matrix.len()];
    let mut used = vec![false; score_matrix.first().map(Vec::len).unwrap_or(0)];
    let mut rows = (0..score_matrix.len()).collect::<Vec<_>>();
    rows.sort_by(|&left, &right| {
        assignment_margin(&score_matrix[right])
            .partial_cmp(&assignment_margin(&score_matrix[left]))
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| left.cmp(&right))
    });
    for row in rows {
        let mut best_idx = None;
        let mut best_score = f64::NEG_INFINITY;
        for (candidate_idx, &score) in score_matrix[row].iter().enumerate() {
            if !used[candidate_idx] && score > best_score {
                best_score = score;
                best_idx = Some(candidate_idx);
            }
        }
        let candidate_idx = best_idx.unwrap_or(0);
        assignment[row] = candidate_idx;
        used[candidate_idx] = true;
    }
    assignment
}

fn assignment_margin(scores: &[f64]) -> f64 {
    let mut top = f64::NEG_INFINITY;
    let mut second = f64::NEG_INFINITY;
    for &score in scores {
        if score > top {
            second = top;
            top = score;
        } else if score > second {
            second = score;
        }
    }
    top - second
}
