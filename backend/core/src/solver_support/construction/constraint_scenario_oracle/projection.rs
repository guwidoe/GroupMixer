use crate::solver3::compiled_problem::{CompiledProblem, PackedSchedule};
use crate::solver_support::SolverError;

use super::oracle_backend::validate_pure_oracle_schedule;
use super::template_candidates::person_oracle_template_priority;
use super::types::{
    ConstraintScenarioScaffoldMask, ConstraintScenarioSignals, OracleTemplateCandidate,
    OracleTemplateProjectionResult, PureStructureOracleRequest, PureStructureOracleSchedule,
};

const PERSON_ASSIGNMENT_ITERATIONS: usize = 1;
const PARTICIPATION_REWARD: f64 = 0.05;
const ABSENT_SESSION_PENALTY: f64 = 0.20;
const PLACEMENT_ANCHOR_WEIGHT: f64 = 0.25;
const RIGIDITY_ANCHOR_WEIGHT: f64 = 2.0;
const FROZEN_ANCHOR_WEIGHT: f64 = 8.0;
const IMMOVABLE_ANCHOR_WEIGHT: f64 = 12.0;
const CONTACT_SIGNATURE_WEIGHT: f64 = 0.20;
const PERSON_PRIORITY_WEIGHT: f64 = 0.01;
const DUMMY_ASSIGNMENT_SCORE: f64 = 0.0;
const HARD_APART_GROUP_CONFLICT_PENALTY: f64 = 4.0;
const HARD_APART_PAIR_ALIGNMENT_PENALTY: f64 = 1_000.0;

/// Projects oracle-local people and groups into one capacity-template candidate.
///
/// Projection is an oracle relabeling problem, not a movement filter. Frozen/fixed real people are
/// eligible projection anchors because their placements strongly describe the CS incumbent; merge
/// still protects those placements later.
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

    let oracle_group_by_session_person =
        oracle_group_by_session_person(candidate, &oracle_schedule.schedule);
    let contact_pressure_by_person_session_group =
        build_contact_pressure_by_person_session_group(compiled, signals, candidate);
    let projectable_people = template_candidate_projectable_people(compiled, signals, candidate);

    let mut real_group_by_session_oracle_group = initial_template_group_mapping(candidate);
    let mut real_person_by_oracle_person = vec![None; candidate.oracle_capacity];

    for _ in 0..PERSON_ASSIGNMENT_ITERATIONS {
        real_person_by_oracle_person = solve_template_person_assignment(
            compiled,
            signals,
            mask,
            candidate,
            &oracle_group_by_session_person,
            &contact_pressure_by_person_session_group,
            &projectable_people,
            &real_group_by_session_oracle_group,
        );
        real_group_by_session_oracle_group = align_oracle_template_groups_to_real_groups(
            compiled,
            signals,
            mask,
            candidate,
            &oracle_schedule.schedule,
            &contact_pressure_by_person_session_group,
            &real_person_by_oracle_person,
        )
        .0;
    }

    real_person_by_oracle_person = solve_template_person_assignment(
        compiled,
        signals,
        mask,
        candidate,
        &oracle_group_by_session_person,
        &contact_pressure_by_person_session_group,
        &projectable_people,
        &real_group_by_session_oracle_group,
    );

    let pair_alignment_score = oracle_template_pair_alignment_score(
        compiled,
        signals,
        candidate,
        &oracle_schedule.schedule,
        &real_person_by_oracle_person,
    );
    let (real_group_by_session_oracle_group, group_alignment_score, rigidity_mismatch) =
        align_oracle_template_groups_to_real_groups(
            compiled,
            signals,
            mask,
            candidate,
            &oracle_schedule.schedule,
            &contact_pressure_by_person_session_group,
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

fn template_candidate_projectable_people(
    compiled: &CompiledProblem,
    signals: &ConstraintScenarioSignals,
    candidate: &OracleTemplateCandidate,
) -> Vec<usize> {
    let mut people = (0..compiled.num_people)
        .filter(|&person_idx| {
            candidate
                .sessions
                .iter()
                .any(|&session_idx| compiled.person_participation[person_idx][session_idx])
        })
        .collect::<Vec<_>>();
    people.sort_by(|&left, &right| {
        let left_sessions = participating_template_session_count(compiled, candidate, left);
        let right_sessions = participating_template_session_count(compiled, candidate, right);
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

fn participating_template_session_count(
    compiled: &CompiledProblem,
    candidate: &OracleTemplateCandidate,
    person_idx: usize,
) -> usize {
    candidate
        .sessions
        .iter()
        .filter(|&&session_idx| compiled.person_participation[person_idx][session_idx])
        .count()
}

fn initial_template_group_mapping(candidate: &OracleTemplateCandidate) -> Vec<Vec<usize>> {
    candidate
        .groups_by_session
        .iter()
        .map(|groups| groups.iter().copied().take(candidate.num_groups).collect())
        .collect()
}

fn oracle_group_by_session_person(
    candidate: &OracleTemplateCandidate,
    oracle_schedule: &PackedSchedule,
) -> Vec<Vec<usize>> {
    let mut group_by_session_person =
        vec![vec![usize::MAX; candidate.oracle_capacity]; candidate.num_sessions()];
    for (session_pos, session) in oracle_schedule
        .iter()
        .enumerate()
        .take(candidate.num_sessions())
    {
        for (oracle_group_idx, group) in session.iter().enumerate().take(candidate.num_groups) {
            for &oracle_person_idx in group {
                if oracle_person_idx < candidate.oracle_capacity {
                    group_by_session_person[session_pos][oracle_person_idx] = oracle_group_idx;
                }
            }
        }
    }
    group_by_session_person
}

fn build_contact_pressure_by_person_session_group(
    compiled: &CompiledProblem,
    signals: &ConstraintScenarioSignals,
    candidate: &OracleTemplateCandidate,
) -> Vec<f64> {
    let mut contact_pressure =
        vec![0.0; compiled.num_sessions * compiled.num_people * compiled.num_groups];
    for (session_pos, &session_idx) in candidate.sessions.iter().enumerate() {
        for person_idx in 0..compiled.num_people {
            if !compiled.person_participation[person_idx][session_idx] {
                continue;
            }
            for &group_idx in &candidate.groups_by_session[session_pos] {
                let mut pressure = 0.0;
                for other_idx in 0..compiled.num_people {
                    if other_idx == person_idx
                        || !compiled.person_participation[other_idx][session_idx]
                    {
                        continue;
                    }
                    let placement =
                        signals.placement_frequency(compiled, session_idx, other_idx, group_idx);
                    if compiled.hard_apart_active(session_idx, person_idx, other_idx) {
                        pressure -= HARD_APART_GROUP_CONFLICT_PENALTY * placement;
                        continue;
                    }
                    let pair_pressure = signals.pair_pressure(
                        compiled,
                        session_idx,
                        compiled.pair_idx(person_idx, other_idx),
                    );
                    if pair_pressure > 0.0 {
                        pressure += pair_pressure * placement;
                    }
                }
                contact_pressure
                    [contact_pressure_index(compiled, session_idx, person_idx, group_idx)] =
                    pressure;
            }
        }
    }
    contact_pressure
}

#[inline]
fn contact_pressure_index(
    compiled: &CompiledProblem,
    session_idx: usize,
    person_idx: usize,
    group_idx: usize,
) -> usize {
    (session_idx * compiled.num_people + person_idx) * compiled.num_groups + group_idx
}

fn solve_template_person_assignment(
    compiled: &CompiledProblem,
    signals: &ConstraintScenarioSignals,
    mask: &ConstraintScenarioScaffoldMask,
    candidate: &OracleTemplateCandidate,
    oracle_group_by_session_person: &[Vec<usize>],
    contact_pressure_by_person_session_group: &[f64],
    projectable_people: &[usize],
    real_group_by_session_oracle_group: &[Vec<usize>],
) -> Vec<Option<usize>> {
    let row_count = candidate.oracle_capacity;
    let column_count = projectable_people.len() + candidate.oracle_capacity;
    let person_priorities = projectable_people
        .iter()
        .map(|&person_idx| {
            person_oracle_template_priority(compiled, signals, &candidate.sessions, person_idx)
        })
        .collect::<Vec<_>>();

    let mut score_matrix = vec![vec![DUMMY_ASSIGNMENT_SCORE; column_count]; row_count];
    for oracle_person_idx in 0..row_count {
        for (person_column, &real_person_idx) in projectable_people.iter().enumerate() {
            score_matrix[oracle_person_idx][person_column] =
                oracle_person_real_person_assignment_score(
                    compiled,
                    signals,
                    mask,
                    candidate,
                    oracle_group_by_session_person,
                    contact_pressure_by_person_session_group,
                    real_group_by_session_oracle_group,
                    oracle_person_idx,
                    real_person_idx,
                    person_priorities[person_column],
                );
        }
    }

    let assignment = solve_max_weight_assignment(&score_matrix);
    assignment
        .into_iter()
        .map(|column_idx| projectable_people.get(column_idx).copied())
        .collect()
}

fn oracle_person_real_person_assignment_score(
    compiled: &CompiledProblem,
    signals: &ConstraintScenarioSignals,
    mask: &ConstraintScenarioScaffoldMask,
    candidate: &OracleTemplateCandidate,
    oracle_group_by_session_person: &[Vec<usize>],
    contact_pressure_by_person_session_group: &[f64],
    real_group_by_session_oracle_group: &[Vec<usize>],
    oracle_person_idx: usize,
    real_person_idx: usize,
    person_priority: f64,
) -> f64 {
    let mut score = PERSON_PRIORITY_WEIGHT * person_priority;
    let mut active_session_count = 0usize;

    for (session_pos, &real_session_idx) in candidate.sessions.iter().enumerate() {
        if !compiled.person_participation[real_person_idx][real_session_idx] {
            score -= ABSENT_SESSION_PENALTY;
            continue;
        }
        active_session_count += 1;

        let oracle_group_idx = oracle_group_by_session_person[session_pos][oracle_person_idx];
        if oracle_group_idx == usize::MAX {
            continue;
        }
        let real_group_idx = real_group_by_session_oracle_group[session_pos][oracle_group_idx];
        score += PARTICIPATION_REWARD;
        score += placement_anchor_score(
            compiled,
            signals,
            mask,
            real_session_idx,
            real_person_idx,
            real_group_idx,
        );
        score += CONTACT_SIGNATURE_WEIGHT
            * contact_pressure_by_person_session_group[contact_pressure_index(
                compiled,
                real_session_idx,
                real_person_idx,
                real_group_idx,
            )];
    }

    if active_session_count == 0 {
        f64::NEG_INFINITY
    } else {
        score
    }
}

fn placement_anchor_score(
    compiled: &CompiledProblem,
    signals: &ConstraintScenarioSignals,
    mask: &ConstraintScenarioScaffoldMask,
    real_session_idx: usize,
    real_person_idx: usize,
    real_group_idx: usize,
) -> f64 {
    let placement =
        signals.placement_frequency(compiled, real_session_idx, real_person_idx, real_group_idx);
    let rigidity = signals.rigidity(compiled, real_session_idx, real_person_idx);
    let mut score = PLACEMENT_ANCHOR_WEIGHT * placement
        + RIGIDITY_ANCHOR_WEIGHT * rigidity * placement
        - 0.25 * rigidity * (1.0 - placement);

    if mask.is_frozen(compiled, real_session_idx, real_person_idx) {
        score += FROZEN_ANCHOR_WEIGHT * placement;
        score -= FROZEN_ANCHOR_WEIGHT * (1.0 - placement);
    }

    if let Some(required_group_idx) = compiled.immovable_group(real_session_idx, real_person_idx) {
        if required_group_idx == real_group_idx {
            score += IMMOVABLE_ANCHOR_WEIGHT;
        } else {
            score -= IMMOVABLE_ANCHOR_WEIGHT;
        }
    }

    score
}

fn oracle_template_pair_alignment_score(
    compiled: &CompiledProblem,
    signals: &ConstraintScenarioSignals,
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
                    let real_left = projected_oracle_person_for_projection_session(
                        compiled,
                        real_person_by_oracle_person,
                        real_session_idx,
                        left,
                    )?;
                    let real_right = projected_oracle_person_for_projection_session(
                        compiled,
                        real_person_by_oracle_person,
                        real_session_idx,
                        right,
                    )?;
                    if compiled.hard_apart_active(real_session_idx, real_left, real_right) {
                        Some(-HARD_APART_PAIR_ALIGNMENT_PENALTY)
                    } else {
                        Some(signals.pair_pressure(
                            compiled,
                            real_session_idx,
                            compiled.pair_idx(real_left, real_right),
                        ))
                    }
                })
                .sum::<f64>()
        })
        .sum()
}

fn projected_oracle_person_for_projection_session(
    compiled: &CompiledProblem,
    real_person_by_oracle_person: &[Option<usize>],
    real_session_idx: usize,
    oracle_person_idx: usize,
) -> Option<usize> {
    let real_person_idx = real_person_by_oracle_person[oracle_person_idx]?;
    compiled.person_participation[real_person_idx][real_session_idx].then_some(real_person_idx)
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
    contact_pressure_by_person_session_group: &[f64],
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
                            contact_pressure_by_person_session_group,
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
    contact_pressure_by_person_session_group: &[f64],
    real_person_by_oracle_person: &[Option<usize>],
) -> f64 {
    let projected_people = oracle_group
        .iter()
        .filter_map(|&oracle_person_idx| {
            projected_oracle_person_for_projection_session(
                compiled,
                real_person_by_oracle_person,
                real_session_idx,
                oracle_person_idx,
            )
        })
        .collect::<Vec<_>>();
    let hard_apart_penalty = projected_people
        .iter()
        .enumerate()
        .flat_map(|(idx, &left)| {
            projected_people
                .iter()
                .skip(idx + 1)
                .map(move |&right| (left, right))
        })
        .filter(|&(left, right)| compiled.hard_apart_active(real_session_idx, left, right))
        .count() as f64
        * HARD_APART_PAIR_ALIGNMENT_PENALTY;

    projected_people
        .iter()
        .copied()
        .map(|real_person_idx| {
            placement_anchor_score(
                compiled,
                signals,
                mask,
                real_session_idx,
                real_person_idx,
                real_group_idx,
            ) + CONTACT_SIGNATURE_WEIGHT
                * contact_pressure_by_person_session_group[contact_pressure_index(
                    compiled,
                    real_session_idx,
                    real_person_idx,
                    real_group_idx,
                )]
        })
        .sum::<f64>()
        - hard_apart_penalty
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
            projected_oracle_person_for_projection_session(
                compiled,
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
            let mut mismatch = rigidity * (1.0 - placement);
            if mask.is_frozen(compiled, real_session_idx, real_person_idx) {
                mismatch += FROZEN_ANCHOR_WEIGHT * (1.0 - placement);
            }
            if let Some(required_group_idx) =
                compiled.immovable_group(real_session_idx, real_person_idx)
            {
                if required_group_idx != real_group_idx {
                    mismatch += IMMOVABLE_ANCHOR_WEIGHT;
                }
            }
            mismatch
        })
        .sum()
}

fn choose_group_assignment(score_matrix: &[Vec<f64>]) -> Vec<usize> {
    solve_max_weight_assignment(score_matrix)
}

pub(super) fn solve_max_weight_assignment(score_matrix: &[Vec<f64>]) -> Vec<usize> {
    let row_count = score_matrix.len();
    if row_count == 0 {
        return Vec::new();
    }
    let column_count = score_matrix.first().map(Vec::len).unwrap_or(0);
    if column_count == 0 {
        return vec![0; row_count];
    }
    if column_count < row_count {
        return solve_max_weight_assignment_greedy(score_matrix);
    }

    let max_score = score_matrix
        .iter()
        .flat_map(|row| row.iter().copied())
        .filter(|score| score.is_finite())
        .fold(f64::NEG_INFINITY, f64::max)
        .max(0.0);

    let mut u = vec![0.0; row_count + 1];
    let mut v = vec![0.0; column_count + 1];
    let mut p = vec![0usize; column_count + 1];
    let mut way = vec![0usize; column_count + 1];

    for row in 1..=row_count {
        p[0] = row;
        let mut column = 0usize;
        let mut minv = vec![f64::INFINITY; column_count + 1];
        let mut used = vec![false; column_count + 1];

        loop {
            used[column] = true;
            let active_row = p[column];
            let mut delta = f64::INFINITY;
            let mut next_column = 0usize;

            for candidate_column in 1..=column_count {
                if used[candidate_column] {
                    continue;
                }
                let score = score_matrix[active_row - 1][candidate_column - 1];
                let finite_score = if score.is_finite() { score } else { -1.0e12 };
                let cost = max_score - finite_score;
                let current = cost - u[active_row] - v[candidate_column];
                if current < minv[candidate_column] - 1e-12 {
                    minv[candidate_column] = current;
                    way[candidate_column] = column;
                }
                if minv[candidate_column] < delta - 1e-12 {
                    delta = minv[candidate_column];
                    next_column = candidate_column;
                }
            }

            for candidate_column in 0..=column_count {
                if used[candidate_column] {
                    u[p[candidate_column]] += delta;
                    v[candidate_column] -= delta;
                } else {
                    minv[candidate_column] -= delta;
                }
            }

            column = next_column;
            if p[column] == 0 {
                break;
            }
        }

        loop {
            let previous_column = way[column];
            p[column] = p[previous_column];
            column = previous_column;
            if column == 0 {
                break;
            }
        }
    }

    let mut assignment = vec![0usize; row_count];
    for column in 1..=column_count {
        if p[column] != 0 {
            assignment[p[column] - 1] = column - 1;
        }
    }
    assignment
}

fn solve_max_weight_assignment_greedy(score_matrix: &[Vec<f64>]) -> Vec<usize> {
    let mut assignment = vec![0usize; score_matrix.len()];
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
        if candidate_idx < used.len() {
            used[candidate_idx] = true;
        }
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
