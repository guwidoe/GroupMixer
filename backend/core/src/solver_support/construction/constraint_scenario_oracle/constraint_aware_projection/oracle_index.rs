use crate::solver3::compiled_problem::PackedSchedule;

use super::super::types::OracleTemplateCandidate;

pub(super) fn oracle_group_by_session_person(
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

pub(super) fn oracle_sessions_where_pair_is_apart(
    oracle_group_by_session_person: &[Vec<usize>],
    left: usize,
    right: usize,
) -> Vec<usize> {
    oracle_group_by_session_person
        .iter()
        .enumerate()
        .filter_map(|(session_pos, group_by_person)| {
            let left_group = group_by_person.get(left).copied().unwrap_or(usize::MAX);
            let right_group = group_by_person.get(right).copied().unwrap_or(usize::MAX);
            (left_group != usize::MAX && right_group != usize::MAX && left_group != right_group)
                .then_some(session_pos)
        })
        .collect()
}

pub(super) fn oracle_pair_meeting_count(
    oracle_group_by_session_person: &[Vec<usize>],
    left: usize,
    right: usize,
    sessions: impl Iterator<Item = usize>,
) -> u32 {
    sessions
        .filter(|&session_pos| {
            let Some(group_by_person) = oracle_group_by_session_person.get(session_pos) else {
                return false;
            };
            let left_group = group_by_person.get(left).copied().unwrap_or(usize::MAX);
            let right_group = group_by_person.get(right).copied().unwrap_or(usize::MAX);
            left_group != usize::MAX && left_group == right_group
        })
        .count() as u32
}
