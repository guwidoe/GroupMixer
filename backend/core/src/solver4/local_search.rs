use super::*;

#[derive(Debug, Clone, Copy)]
pub(super) struct SwapCandidate {
    pub(super) week: usize,
    pub(super) left_group: usize,
    pub(super) left_slot: usize,
    pub(super) right_group: usize,
    pub(super) right_slot: usize,
    pub(super) left_person: usize,
    pub(super) right_person: usize,
    pub(super) conflict_positions_after: usize,
    pub(super) repeat_excess_after: i32,
    pub(super) active_repeated_pairs_after: usize,
    pub(super) max_conflict_positions_in_any_week_after: u32,
}

impl SwapCandidate {
    fn resulting_value_at(&self, position: usize, base_schedule: &[Vec<Vec<usize>>]) -> usize {
        let left_position =
            position_id_from_coordinates(base_schedule, self.week, self.left_group, self.left_slot);
        let right_position = position_id_from_coordinates(
            base_schedule,
            self.week,
            self.right_group,
            self.right_slot,
        );
        if position == left_position {
            self.right_person
        } else if position == right_position {
            self.left_person
        } else {
            person_at_position(base_schedule, position)
        }
    }

    pub(super) fn outranks(&self, other: &Self, base_schedule: &[Vec<Vec<usize>>]) -> bool {
        self.conflict_positions_after < other.conflict_positions_after
            || (self.conflict_positions_after == other.conflict_positions_after
                && (self.repeat_excess_after < other.repeat_excess_after
                    || (self.repeat_excess_after == other.repeat_excess_after
                        && (self.max_conflict_positions_in_any_week_after
                            < other.max_conflict_positions_in_any_week_after
                            || (self.max_conflict_positions_in_any_week_after
                                == other.max_conflict_positions_in_any_week_after
                                && resulting_configuration_is_lexicographically_smaller(
                                    base_schedule,
                                    self,
                                    other,
                                ))))))
    }

    pub(super) fn outranks_with_repeat_guidance(
        &self,
        other: &Self,
        base_schedule: &[Vec<Vec<usize>>],
    ) -> bool {
        self.conflict_positions_after < other.conflict_positions_after
            || (self.conflict_positions_after == other.conflict_positions_after
                && (self.repeat_excess_after < other.repeat_excess_after
                    || (self.repeat_excess_after == other.repeat_excess_after
                        && (self.active_repeated_pairs_after < other.active_repeated_pairs_after
                            || (self.active_repeated_pairs_after
                                == other.active_repeated_pairs_after
                                && (self.max_conflict_positions_in_any_week_after
                                    < other.max_conflict_positions_in_any_week_after
                                    || (self.max_conflict_positions_in_any_week_after
                                        == other.max_conflict_positions_in_any_week_after
                                        && resulting_configuration_is_lexicographically_smaller(
                                            base_schedule,
                                            self,
                                            other,
                                        ))))))))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct SwapPreview {
    pub(super) conflict_positions_after: usize,
    pub(super) repeat_excess_after: i32,
    pub(super) active_repeated_pairs_after: usize,
    pub(super) max_conflict_positions_in_any_week_after: u32,
}

pub(super) fn position_id_from_coordinates(
    schedule: &[Vec<Vec<usize>>],
    week: usize,
    group: usize,
    slot: usize,
) -> usize {
    let num_groups = schedule[0].len();
    let group_size = schedule[0][0].len();
    (week * num_groups + group) * group_size + slot
}

pub(super) fn person_at_position(schedule: &[Vec<Vec<usize>>], position: usize) -> usize {
    let num_groups = schedule[0].len();
    let group_size = schedule[0][0].len();
    let week = position / (num_groups * group_size);
    let within_week = position % (num_groups * group_size);
    let group = within_week / group_size;
    let slot = within_week % group_size;
    schedule[week][group][slot]
}

pub(super) fn resulting_configuration_is_lexicographically_smaller(
    base_schedule: &[Vec<Vec<usize>>],
    left: &SwapCandidate,
    right: &SwapCandidate,
) -> bool {
    let mut changed_positions = vec![
        position_id_from_coordinates(base_schedule, left.week, left.left_group, left.left_slot),
        position_id_from_coordinates(base_schedule, left.week, left.right_group, left.right_slot),
        position_id_from_coordinates(base_schedule, right.week, right.left_group, right.left_slot),
        position_id_from_coordinates(
            base_schedule,
            right.week,
            right.right_group,
            right.right_slot,
        ),
    ];
    changed_positions.sort_unstable();
    changed_positions.dedup();

    for position in changed_positions {
        let left_value = left.resulting_value_at(position, base_schedule);
        let right_value = right.resulting_value_at(position, base_schedule);
        if left_value != right_value {
            return left_value < right_value;
        }
    }

    false
}

pub(super) fn select_best_swap(
    problem: &PureSgpProblem,
    schedule: &[Vec<Vec<usize>>],
    current: &EvaluatedSchedule,
    best: &EvaluatedSchedule,
    tabu: &mut WeekTabuLists,
    iteration: u64,
    tabu_telemetry: &mut SgpWeekPairTabuBenchmarkTelemetry,
    no_improvement_count: u64,
) -> Option<SelectedSwap> {
    let mut best_candidate: Option<SwapCandidate> = None;
    tabu.prune(iteration);
    let prefer_active_repeated_pairs = should_prefer_active_repeated_pairs(no_improvement_count);

    for week in 0..problem.num_weeks {
        for left_group in 0..problem.num_groups {
            for right_group in (left_group + 1)..problem.num_groups {
                for left_slot in 0..problem.group_size {
                    let left_position = problem.position_id(week, left_group, left_slot);
                    let left_person = schedule[week][left_group][left_slot];
                    for right_slot in 0..problem.group_size {
                        let right_position = problem.position_id(week, right_group, right_slot);
                        if current.incident_counts[left_position] == 0
                            && current.incident_counts[right_position] == 0
                        {
                            continue;
                        }
                        let right_person = schedule[week][right_group][right_slot];
                        let preview = evaluate_swap_preview(
                            problem,
                            schedule,
                            current,
                            week,
                            left_group,
                            left_slot,
                            right_group,
                            right_slot,
                        );
                        let swapped_pair = unordered_pair(left_person, right_person);
                        if tabu.contains(week, swapped_pair) {
                            tabu_telemetry.raw_tabu_hits += 1;
                            if preview.conflict_positions_after < best.conflict_positions {
                                tabu_telemetry.aspiration_overrides += 1;
                            } else {
                                continue;
                            }
                        }

                        let candidate = SwapCandidate {
                            week,
                            left_group,
                            left_slot,
                            right_group,
                            right_slot,
                            left_person,
                            right_person,
                            conflict_positions_after: preview.conflict_positions_after,
                            repeat_excess_after: preview.repeat_excess_after,
                            active_repeated_pairs_after: preview.active_repeated_pairs_after,
                            max_conflict_positions_in_any_week_after: preview
                                .max_conflict_positions_in_any_week_after,
                        };

                        let is_better = match best_candidate {
                            None => true,
                            Some(current_best) => {
                                if prefer_active_repeated_pairs {
                                    candidate
                                        .outranks_with_repeat_guidance(&current_best, schedule)
                                } else {
                                    candidate.outranks(&current_best, schedule)
                                }
                            }
                        };
                        if is_better {
                            best_candidate = Some(candidate);
                        }
                    }
                }
            }
        }
    }

    best_candidate.map(|candidate| SelectedSwap {
        week: candidate.week,
        left_person: candidate.left_person,
        right_person: candidate.right_person,
        schedule: apply_swap(
            schedule,
            candidate.week,
            candidate.left_group,
            candidate.left_slot,
            candidate.right_group,
            candidate.right_slot,
        ),
    })
}

#[derive(Debug, Clone)]
pub(super) struct SelectedSwap {
    pub(super) week: usize,
    pub(super) left_person: usize,
    pub(super) right_person: usize,
    pub(super) schedule: Vec<Vec<Vec<usize>>>,
}

pub(super) fn evaluate_swap_preview(
    problem: &PureSgpProblem,
    schedule: &[Vec<Vec<usize>>],
    current: &EvaluatedSchedule,
    week: usize,
    left_group: usize,
    left_slot: usize,
    right_group: usize,
    right_slot: usize,
) -> SwapPreview {
    let left_person = schedule[week][left_group][left_slot];
    let right_person = schedule[week][right_group][right_slot];

    let mut position_deltas: HashMap<usize, i32> = HashMap::new();
    let mut pair_count_deltas: HashMap<usize, i16> = HashMap::new();
    let mut repeat_excess_after = current.repeat_excess;
    let mut conflict_positions_by_week_after = current.conflict_positions_by_week.clone();

    for slot in 0..problem.group_size {
        if slot != left_slot {
            let partner = schedule[week][left_group][slot];
            let removed_pair_key = problem.pair_key(left_person, partner);
            *pair_count_deltas.entry(removed_pair_key).or_insert(0) -= 1;
            if current.pair_counts[removed_pair_key] >= 2 {
                repeat_excess_after -= 1;
            }
            apply_removed_pair_delta(
                current,
                removed_pair_key,
                problem.position_id(week, left_group, left_slot),
                problem.position_id(week, left_group, slot),
                &mut position_deltas,
            );
            let added_pair_key = problem.pair_key(right_person, partner);
            *pair_count_deltas.entry(added_pair_key).or_insert(0) += 1;
            if current.pair_counts[added_pair_key] >= 1 {
                repeat_excess_after += 1;
            }
            apply_added_pair_delta(
                current,
                added_pair_key,
                problem.position_id(week, right_group, right_slot),
                problem.position_id(week, left_group, slot),
                &mut position_deltas,
            );
        }
        if slot != right_slot {
            let partner = schedule[week][right_group][slot];
            let removed_pair_key = problem.pair_key(right_person, partner);
            *pair_count_deltas.entry(removed_pair_key).or_insert(0) -= 1;
            if current.pair_counts[removed_pair_key] >= 2 {
                repeat_excess_after -= 1;
            }
            apply_removed_pair_delta(
                current,
                removed_pair_key,
                problem.position_id(week, right_group, right_slot),
                problem.position_id(week, right_group, slot),
                &mut position_deltas,
            );
            let added_pair_key = problem.pair_key(left_person, partner);
            *pair_count_deltas.entry(added_pair_key).or_insert(0) += 1;
            if current.pair_counts[added_pair_key] >= 1 {
                repeat_excess_after += 1;
            }
            apply_added_pair_delta(
                current,
                added_pair_key,
                problem.position_id(week, left_group, left_slot),
                problem.position_id(week, right_group, slot),
                &mut position_deltas,
            );
        }
    }

    let mut new_conflict_positions = current.conflict_positions;
    for (position, delta) in position_deltas {
        let before = current.incident_counts[position] > 0;
        let after = (i32::from(current.incident_counts[position]) + delta) > 0;
        let week = position / (problem.num_groups * problem.group_size);
        match (before, after) {
            (true, false) => {
                new_conflict_positions -= 1;
                conflict_positions_by_week_after[week] -= 1;
            }
            (false, true) => {
                new_conflict_positions += 1;
                conflict_positions_by_week_after[week] += 1;
            }
            _ => {}
        }
    }

    let mut active_repeated_pairs_after = current.active_repeated_pairs;
    for (pair_key, delta) in pair_count_deltas {
        let before_active = current.pair_counts[pair_key] > 1;
        let after_count = i32::from(current.pair_counts[pair_key]) + i32::from(delta);
        let after_active = after_count > 1;
        match (before_active, after_active) {
            (false, true) => active_repeated_pairs_after += 1,
            (true, false) => active_repeated_pairs_after -= 1,
            _ => {}
        }
    }

    SwapPreview {
        conflict_positions_after: new_conflict_positions,
        repeat_excess_after,
        active_repeated_pairs_after,
        max_conflict_positions_in_any_week_after: conflict_positions_by_week_after
            .iter()
            .copied()
            .max()
            .unwrap_or(0),
    }
}

pub(super) fn should_prefer_active_repeated_pairs(no_improvement_count: u64) -> bool {
    no_improvement_count >= 4
}

fn apply_removed_pair_delta(
    current: &EvaluatedSchedule,
    pair_key: usize,
    removed_left_position: usize,
    removed_right_position: usize,
    deltas: &mut HashMap<usize, i32>,
) {
    let old_count = current.pair_counts[pair_key];
    match old_count {
        0 | 1 => {}
        2 => {
            for occurrence in &current.pair_occurrences[pair_key] {
                *deltas.entry(occurrence.left_position).or_insert(0) -= 1;
                *deltas.entry(occurrence.right_position).or_insert(0) -= 1;
            }
        }
        _ => {
            *deltas.entry(removed_left_position).or_insert(0) -= 1;
            *deltas.entry(removed_right_position).or_insert(0) -= 1;
        }
    }
}

fn apply_added_pair_delta(
    current: &EvaluatedSchedule,
    pair_key: usize,
    added_left_position: usize,
    added_right_position: usize,
    deltas: &mut HashMap<usize, i32>,
) {
    let old_count = current.pair_counts[pair_key];
    match old_count {
        0 => {}
        1 => {
            for occurrence in &current.pair_occurrences[pair_key] {
                *deltas.entry(occurrence.left_position).or_insert(0) += 1;
                *deltas.entry(occurrence.right_position).or_insert(0) += 1;
            }
            *deltas.entry(added_left_position).or_insert(0) += 1;
            *deltas.entry(added_right_position).or_insert(0) += 1;
        }
        _ => {
            *deltas.entry(added_left_position).or_insert(0) += 1;
            *deltas.entry(added_right_position).or_insert(0) += 1;
        }
    }
}

pub(super) fn apply_swap(
    schedule: &[Vec<Vec<usize>>],
    week: usize,
    left_group: usize,
    left_slot: usize,
    right_group: usize,
    right_slot: usize,
) -> Vec<Vec<Vec<usize>>> {
    let mut next = schedule.to_vec();
    let left_person = next[week][left_group][left_slot];
    let right_person = next[week][right_group][right_slot];
    next[week][left_group][left_slot] = right_person;
    next[week][right_group][right_slot] = left_person;
    next
}

pub(super) fn apply_random_breakout(
    problem: &PureSgpProblem,
    schedule: &[Vec<Vec<usize>>],
    current: &EvaluatedSchedule,
    rng: &mut ChaCha12Rng,
    tabu: &mut WeekTabuLists,
    iteration: u64,
    tabu_telemetry: &mut SgpWeekPairTabuBenchmarkTelemetry,
) -> Vec<Vec<Vec<usize>>> {
    let mut next = schedule.to_vec();
    let mut recorded = Vec::with_capacity(RANDOM_BREAKOUT_SWAP_COUNT);
    let mut used_positions = std::collections::BTreeSet::new();

    for _ in 0..RANDOM_BREAKOUT_SWAP_COUNT {
        let week = choose_breakout_week(current, problem.num_weeks, rng);
        let (left_group, left_slot, right_group, right_slot) =
            choose_breakout_positions_avoiding_used_positions(
                problem,
                current,
                week,
                rng,
                &used_positions,
            );
        let left_person = next[week][left_group][left_slot];
        let right_person = next[week][right_group][right_slot];
        next[week][left_group][left_slot] = right_person;
        next[week][right_group][right_slot] = left_person;
        used_positions.insert(problem.position_id(week, left_group, left_slot));
        used_positions.insert(problem.position_id(week, right_group, right_slot));
        recorded.push((week, unordered_pair(left_person, right_person)));
    }

    let _ = (recorded, iteration, tabu, tabu_telemetry);
    next
}

pub(super) fn choose_breakout_positions_avoiding_used_positions(
    problem: &PureSgpProblem,
    current: &EvaluatedSchedule,
    week: usize,
    rng: &mut ChaCha12Rng,
    used_positions: &std::collections::BTreeSet<usize>,
) -> (usize, usize, usize, usize) {
    for _ in 0..16 {
        let candidate = choose_breakout_positions(problem, current, week, rng);
        let left_position = problem.position_id(week, candidate.0, candidate.1);
        let right_position = problem.position_id(week, candidate.2, candidate.3);
        if !used_positions.contains(&left_position) && !used_positions.contains(&right_position) {
            return candidate;
        }
    }

    choose_breakout_positions(problem, current, week, rng)
}

pub(super) fn choose_breakout_week(
    current: &EvaluatedSchedule,
    num_weeks: usize,
    rng: &mut ChaCha12Rng,
) -> usize {
    let max_conflicts = current
        .conflict_positions_by_week
        .iter()
        .copied()
        .max()
        .unwrap_or(0);
    if max_conflicts == 0 {
        return rng.random_range(0..num_weeks);
    }

    let mut candidate_weeks = Vec::new();
    for (week, &conflicts) in current.conflict_positions_by_week.iter().enumerate() {
        if conflicts == max_conflicts {
            candidate_weeks.push(week);
        }
    }
    *candidate_weeks
        .choose(rng)
        .expect("max-conflict week list should be non-empty")
}

pub(super) fn choose_breakout_positions(
    problem: &PureSgpProblem,
    current: &EvaluatedSchedule,
    week: usize,
    rng: &mut ChaCha12Rng,
) -> (usize, usize, usize, usize) {
    let mut conflicted_positions = Vec::new();
    for group in 0..problem.num_groups {
        for slot in 0..problem.group_size {
            let position = problem.position_id(week, group, slot);
            if current.incident_counts[position] > 0 {
                conflicted_positions.push((group, slot));
            }
        }
    }

    if conflicted_positions.len() >= 2 {
        let &(left_group, left_slot) = conflicted_positions
            .choose(rng)
            .expect("conflicted positions should be non-empty");
        let right_candidates: Vec<(usize, usize)> = conflicted_positions
            .iter()
            .copied()
            .filter(|(group, _)| *group != left_group)
            .collect();
        if let Some(&(right_group, right_slot)) = right_candidates.choose(rng) {
            return (left_group, left_slot, right_group, right_slot);
        }
    }

    let left_group = rng.random_range(0..problem.num_groups);
    let mut right_group = rng.random_range(0..problem.num_groups);
    while right_group == left_group {
        right_group = rng.random_range(0..problem.num_groups);
    }
    let left_slot = rng.random_range(0..problem.group_size);
    let right_slot = rng.random_range(0..problem.group_size);
    (left_group, left_slot, right_group, right_slot)
}

#[derive(Debug, Clone)]
pub(super) struct WeekTabuLists {
    pub(super) history: Vec<VecDeque<(u64, Vec<(usize, usize)>)>>,
}

impl WeekTabuLists {
    pub(super) fn new(num_weeks: usize) -> Self {
        Self {
            history: vec![VecDeque::new(); num_weeks],
        }
    }

    pub(super) fn prune(&mut self, current_iteration: u64) {
        for week in &mut self.history {
            while week.front().is_some_and(|(iteration, _)| {
                iteration + TABU_TENURE_ITERATIONS <= current_iteration
            }) {
                week.pop_front();
            }
        }
    }

    pub(super) fn contains(&self, week: usize, pair: (usize, usize)) -> bool {
        self.history[week]
            .iter()
            .any(|(_, pairs)| pairs.contains(&pair))
    }

    pub(super) fn record_iteration(
        &mut self,
        iteration: u64,
        recorded_pairs: &[(usize, (usize, usize))],
        telemetry: &mut SgpWeekPairTabuBenchmarkTelemetry,
    ) {
        let mut per_week: HashMap<usize, Vec<(usize, usize)>> = HashMap::new();
        for (week, pair) in recorded_pairs {
            per_week.entry(*week).or_default().push(*pair);
            telemetry.recorded_swaps += 1;
            telemetry.realized_tenure_sum += TABU_TENURE_ITERATIONS;
            telemetry.realized_tenure_min = Some(
                telemetry
                    .realized_tenure_min
                    .map_or(TABU_TENURE_ITERATIONS, |current| {
                        current.min(TABU_TENURE_ITERATIONS)
                    }),
            );
            telemetry.realized_tenure_max = Some(
                telemetry
                    .realized_tenure_max
                    .map_or(TABU_TENURE_ITERATIONS, |current| {
                        current.max(TABU_TENURE_ITERATIONS)
                    }),
            );
        }
        for (week, pairs) in per_week {
            self.history[week].push_back((iteration, pairs));
        }
    }
}

pub(super) fn unordered_pair(left: usize, right: usize) -> (usize, usize) {
    if left < right {
        (left, right)
    } else {
        (right, left)
    }
}

pub(super) fn should_apply_random_breakout(no_improvement_count: u64) -> bool {
    no_improvement_count == RANDOM_BREAKOUT_AFTER_NO_IMPROVEMENT
}

pub(super) fn next_no_improvement_count(
    previous: u64,
    improved_best: bool,
    breakout_applied: bool,
) -> u64 {
    if improved_best || breakout_applied {
        0
    } else {
        previous + 1
    }
}
