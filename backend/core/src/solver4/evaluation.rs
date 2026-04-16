use super::*;

#[derive(Debug, Clone, Copy)]
pub(super) struct PairOccurrence {
    pub(super) left_position: usize,
    pub(super) right_position: usize,
}

#[derive(Debug, Clone)]
pub(super) struct EvaluatedSchedule {
    pub(super) conflict_positions: usize,
    pub(super) conflict_positions_by_week: Vec<u32>,
    pub(super) unique_contacts: i32,
    pub(super) repeat_excess: i32,
    pub(super) active_repeated_pairs: usize,
    pub(super) pair_counts: Vec<u16>,
    pub(super) pair_occurrences: Vec<Vec<PairOccurrence>>,
    pub(super) incident_counts: Vec<u16>,
}

impl EvaluatedSchedule {
    pub(super) fn from_schedule(problem: &PureSgpProblem, schedule: Vec<Vec<Vec<usize>>>) -> Self {
        let total_positions = problem.num_weeks * problem.num_groups * problem.group_size;
        let mut pair_counts = vec![0u16; problem.num_people * problem.num_people];
        let mut pair_occurrences = vec![Vec::new(); problem.num_people * problem.num_people];

        for week in 0..problem.num_weeks {
            for group in 0..problem.num_groups {
                let members = &schedule[week][group];
                for left_slot in 0..members.len() {
                    for right_slot in (left_slot + 1)..members.len() {
                        let left = members[left_slot];
                        let right = members[right_slot];
                        let key = problem.pair_key(left, right);
                        pair_counts[key] += 1;
                        pair_occurrences[key].push(PairOccurrence {
                            left_position: problem.position_id(week, group, left_slot),
                            right_position: problem.position_id(week, group, right_slot),
                        });
                    }
                }
            }
        }

        let mut incident_counts = vec![0u16; total_positions];
        let mut unique_contacts = 0i32;
        let mut repeat_excess = 0i32;
        let mut active_repeated_pairs = 0usize;
        for (key, &count) in pair_counts.iter().enumerate() {
            if count > 0 {
                unique_contacts += 1;
            }
            if count > 1 {
                active_repeated_pairs += 1;
                let _ = key;
                repeat_excess += i32::from(count - 1);
                for occurrence in &pair_occurrences[key] {
                    incident_counts[occurrence.left_position] += 1;
                    incident_counts[occurrence.right_position] += 1;
                }
            }
        }

        let mut conflict_positions_by_week = vec![0u32; problem.num_weeks];
        let mut conflict_positions = 0usize;
        for week in 0..problem.num_weeks {
            for group in 0..problem.num_groups {
                for slot in 0..problem.group_size {
                    let position = problem.position_id(week, group, slot);
                    if incident_counts[position] > 0 {
                        conflict_positions += 1;
                        conflict_positions_by_week[week] += 1;
                    }
                }
            }
        }

        Self {
            conflict_positions,
            conflict_positions_by_week,
            unique_contacts,
            repeat_excess,
            active_repeated_pairs,
            pair_counts,
            pair_occurrences,
            incident_counts,
        }
    }

    pub(super) fn paper_objective(&self) -> f64 {
        self.conflict_positions as f64
    }
}
