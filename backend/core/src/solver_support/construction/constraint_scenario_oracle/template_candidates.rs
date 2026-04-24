use crate::solver3::compiled_problem::{CompiledProblem, PackedSchedule};

use super::types::{
    ConstraintScenarioScaffoldMask, ConstraintScenarioSignals, OracleTemplateCandidate,
};

/// Generates simple capacity-ladder pure-template candidates.
pub(crate) fn generate_oracle_template_candidates(
    compiled: &CompiledProblem,
    scaffold: &PackedSchedule,
    signals: &ConstraintScenarioSignals,
    mask: &ConstraintScenarioScaffoldMask,
) -> Vec<OracleTemplateCandidate> {
    let mut candidates = Vec::new();

    for start_session in 0..compiled.num_sessions {
        for end_session in (start_session + 2)..=compiled.num_sessions {
            let sessions = (start_session..end_session).collect::<Vec<_>>();
            let group_slots_by_session = sessions
                .iter()
                .map(|&session_idx| {
                    oracle_group_template_slots(compiled, scaffold, mask, session_idx)
                })
                .collect::<Vec<_>>();
            let max_groups = group_slots_by_session
                .iter()
                .map(|slots| {
                    slots
                        .iter()
                        .filter(|slot| slot.template_capacity >= 2)
                        .count()
                })
                .min()
                .unwrap_or(0)
                .min(compiled.num_groups);
            if max_groups < 2 {
                continue;
            }

            let attendance = template_attendance_summary(compiled, mask, &sessions);
            if attendance.high_attendance_people_count < 4 {
                continue;
            }

            for num_groups in (2..=max_groups).rev() {
                let selected_slots_by_session = group_slots_by_session
                    .iter()
                    .map(|slots| select_template_group_slots(slots, num_groups))
                    .collect::<Option<Vec<_>>>();
                let Some(selected_slots_by_session) = selected_slots_by_session else {
                    continue;
                };
                let max_group_size = selected_slots_by_session
                    .iter()
                    .flat_map(|groups| groups.iter().map(|slot| slot.template_capacity))
                    .min()
                    .unwrap_or(0);
                for group_size in template_group_size_ladder(max_group_size) {
                    let oracle_capacity = num_groups * group_size;
                    if oracle_capacity < 4 {
                        continue;
                    }
                    let groups_by_session = selected_slots_by_session
                        .iter()
                        .map(|slots| slots.iter().map(|slot| slot.group_idx).collect::<Vec<_>>())
                        .collect::<Vec<_>>();
                    let scaffold_disruption_risk = selected_slots_by_session
                        .iter()
                        .enumerate()
                        .map(|(session_pos, slots)| {
                            template_scaffold_disruption_risk(
                                compiled,
                                scaffold,
                                signals,
                                mask,
                                sessions[session_pos],
                                slots,
                            )
                        })
                        .sum::<f64>();
                    let dummy_oracle_people =
                        oracle_capacity.saturating_sub(attendance.high_attendance_people_count);
                    let omitted_high_attendance_people = attendance
                        .high_attendance_people_count
                        .saturating_sub(oracle_capacity);
                    let omitted_group_count = compiled.num_groups.saturating_sub(num_groups);
                    let estimated_score = oracle_template_candidate_score(
                        sessions.len(),
                        num_groups,
                        group_size,
                        oracle_capacity,
                        attendance.stable_people_count,
                        attendance.high_attendance_people_count,
                        dummy_oracle_people,
                        omitted_high_attendance_people,
                        omitted_group_count,
                        scaffold_disruption_risk,
                    );
                    candidates.push(OracleTemplateCandidate {
                        sessions: sessions.clone(),
                        groups_by_session,
                        num_groups,
                        group_size,
                        oracle_capacity,
                        stable_people_count: attendance.stable_people_count,
                        high_attendance_people_count: attendance.high_attendance_people_count,
                        dummy_oracle_people,
                        omitted_high_attendance_people,
                        omitted_group_count,
                        scaffold_disruption_risk,
                        estimated_score,
                    });
                }
            }
        }
    }

    candidates.sort_by(|left, right| oracle_template_candidate_order(left, right));
    candidates
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct OracleGroupTemplateSlot {
    group_idx: usize,
    template_capacity: usize,
    available_capacity: usize,
    flexible_occupancy: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct TemplateAttendanceSummary {
    stable_people_count: usize,
    high_attendance_people_count: usize,
}

fn oracle_group_template_slots(
    compiled: &CompiledProblem,
    scaffold: &PackedSchedule,
    mask: &ConstraintScenarioScaffoldMask,
    session_idx: usize,
) -> Vec<OracleGroupTemplateSlot> {
    let mut slots = (0..compiled.num_groups)
        .map(|group_idx| {
            let frozen_occupancy = scaffold[session_idx][group_idx]
                .iter()
                .filter(|&&person_idx| mask.is_frozen(compiled, session_idx, person_idx))
                .count();
            let flexible_occupancy = scaffold[session_idx][group_idx]
                .iter()
                .filter(|&&person_idx| !mask.is_frozen(compiled, session_idx, person_idx))
                .count();
            let template_capacity = compiled.group_capacity(session_idx, group_idx);
            let available_capacity = template_capacity.saturating_sub(frozen_occupancy);
            OracleGroupTemplateSlot {
                group_idx,
                template_capacity,
                available_capacity,
                flexible_occupancy,
            }
        })
        .collect::<Vec<_>>();
    slots.sort_by_key(|slot| {
        (
            std::cmp::Reverse(slot.template_capacity),
            std::cmp::Reverse(slot.available_capacity),
            std::cmp::Reverse(slot.flexible_occupancy),
            slot.group_idx,
        )
    });
    slots
}

fn select_template_group_slots(
    slots: &[OracleGroupTemplateSlot],
    num_groups: usize,
) -> Option<Vec<OracleGroupTemplateSlot>> {
    let selected = slots
        .iter()
        .copied()
        .filter(|slot| slot.template_capacity >= 2)
        .take(num_groups)
        .collect::<Vec<_>>();
    (selected.len() == num_groups).then_some(selected)
}

fn template_group_size_ladder(max_group_size: usize) -> Vec<usize> {
    let mut sizes = Vec::new();
    for delta in 0..=2 {
        if max_group_size > delta && max_group_size - delta >= 2 {
            sizes.push(max_group_size - delta);
        }
    }
    sizes
}

fn template_attendance_summary(
    compiled: &CompiledProblem,
    mask: &ConstraintScenarioScaffoldMask,
    sessions: &[usize],
) -> TemplateAttendanceSummary {
    let mut stable_people_count = 0usize;
    let mut high_attendance_people_count = 0usize;
    let high_attendance_threshold = (sessions.len() * 3).div_ceil(4).max(1);
    for person_idx in 0..compiled.num_people {
        let available_sessions = sessions
            .iter()
            .filter(|&&session_idx| {
                compiled.person_participation[person_idx][session_idx]
                    && !mask.is_frozen(compiled, session_idx, person_idx)
            })
            .count();
        if available_sessions == sessions.len() {
            stable_people_count += 1;
        }
        if available_sessions >= high_attendance_threshold {
            high_attendance_people_count += 1;
        }
    }
    TemplateAttendanceSummary {
        stable_people_count,
        high_attendance_people_count,
    }
}

fn template_scaffold_disruption_risk(
    compiled: &CompiledProblem,
    scaffold: &PackedSchedule,
    signals: &ConstraintScenarioSignals,
    mask: &ConstraintScenarioScaffoldMask,
    session_idx: usize,
    slots: &[OracleGroupTemplateSlot],
) -> f64 {
    slots
        .iter()
        .flat_map(|slot| scaffold[session_idx][slot.group_idx].iter().copied())
        .map(|person_idx| {
            signals.rigidity(compiled, session_idx, person_idx)
                + if mask.is_frozen(compiled, session_idx, person_idx) {
                    1.0
                } else {
                    0.0
                }
        })
        .sum()
}

fn oracle_template_candidate_score(
    num_sessions: usize,
    num_groups: usize,
    group_size: usize,
    oracle_capacity: usize,
    stable_people_count: usize,
    high_attendance_people_count: usize,
    dummy_oracle_people: usize,
    omitted_high_attendance_people: usize,
    omitted_group_count: usize,
    scaffold_disruption_risk: f64,
) -> f64 {
    let contact_opportunity = num_sessions as f64 * num_groups as f64 * binomial2(group_size);
    let coverage = oracle_capacity.min(high_attendance_people_count) as f64;
    let stable_coverage = oracle_capacity.min(stable_people_count) as f64 * 0.25;
    contact_opportunity + coverage + stable_coverage
        - dummy_oracle_people as f64
        - omitted_high_attendance_people as f64 * 3.0
        - omitted_group_count as f64 * 5.0
        - scaffold_disruption_risk * 3.0
}

fn oracle_template_candidate_order(
    left: &OracleTemplateCandidate,
    right: &OracleTemplateCandidate,
) -> std::cmp::Ordering {
    right
        .estimated_score
        .partial_cmp(&left.estimated_score)
        .unwrap_or(std::cmp::Ordering::Equal)
        .then_with(|| right.sessions.len().cmp(&left.sessions.len()))
        .then_with(|| right.oracle_capacity.cmp(&left.oracle_capacity))
        .then_with(|| right.num_groups.cmp(&left.num_groups))
        .then_with(|| right.group_size.cmp(&left.group_size))
        .then_with(|| left.sessions.cmp(&right.sessions))
}

pub(super) fn person_oracle_template_priority(
    compiled: &CompiledProblem,
    signals: &ConstraintScenarioSignals,
    sessions: &[usize],
    person_idx: usize,
) -> f64 {
    let flexibility = sessions
        .iter()
        .map(|&session_idx| 1.0 - signals.rigidity(compiled, session_idx, person_idx))
        .sum::<f64>();
    let pair_pressure = (0..compiled.num_people)
        .filter(|&other| other != person_idx)
        .map(|other| {
            let pair_idx = compiled.pair_idx(person_idx, other);
            sessions
                .iter()
                .map(|&session_idx| signals.pair_pressure(compiled, session_idx, pair_idx))
                .sum::<f64>()
        })
        .sum::<f64>();
    flexibility + pair_pressure / compiled.num_people.max(1) as f64
}

fn binomial2(value: usize) -> f64 {
    (value.saturating_sub(1) * value / 2) as f64
}
