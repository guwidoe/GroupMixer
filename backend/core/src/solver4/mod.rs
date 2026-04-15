use crate::models::{
    ApiInput, ApiSchedule, Constraint, Objective, RepeatEncounterParams,
    SolverBenchmarkTelemetry, SolverConfiguration, SolverKind, SolverResult, StopReason,
};
use crate::solver2::{scoring::FullScoreSnapshot, SolutionState};
use crate::solver_support::SolverError;
use rand::{prelude::IndexedRandom, RngExt, SeedableRng};
use rand_chacha::ChaCha12Rng;
use std::collections::HashMap;
use std::time::Instant;

pub const SOLVER4_NOTES: &str =
    "Dedicated pure-SGP solver family following the Triska/Musliu paper's Sections 6 and 7: strict Social-Golfer-only capability gating, randomized greedy initialization, and conflict-position local search with week-local swapped-player tabu memory. Solver4 does not yet implement the paper's Section 5 complete backtracking/pattern-search branch.";

const DEFAULT_SOLVER4_SEED: u64 = 42;
const PAPER_PAIR_REPEAT_PENALTY: i64 = 1_000_000;
const TABU_TENURE_ITERATIONS: u64 = 10;
const RANDOM_BREAKOUT_AFTER_NO_IMPROVEMENT: u64 = 4;
const RANDOM_BREAKOUT_SWAP_COUNT: usize = 2;

#[derive(Clone)]
pub struct SearchEngine {
    configuration: SolverConfiguration,
}

impl SearchEngine {
    pub fn new(configuration: &SolverConfiguration) -> Self {
        Self {
            configuration: configuration.clone(),
        }
    }

    pub fn solve(&self, input: &ApiInput) -> Result<SolverResult, SolverError> {
        let problem = PureSgpProblem::from_input(input)?;
        let params = match &self.configuration.solver_params {
            crate::models::SolverParams::Solver4(params) => params.clone(),
            _ => {
                return Err(SolverError::ValidationError(
                    "solver4 expected solver4 params after solver selection validation".into(),
                ))
            }
        };
        if !(0.0..=1.0).contains(&params.gamma) {
            return Err(SolverError::ValidationError(
                "solver4 gamma must be within [0.0, 1.0]".into(),
            ));
        }

        let effective_seed = self.configuration.seed.unwrap_or(DEFAULT_SOLVER4_SEED);
        let mut rng = ChaCha12Rng::seed_from_u64(effective_seed);
        let started_at = Instant::now();

        let mut schedule = build_greedy_initial_schedule(&problem, params.gamma, &mut rng);
        let mut current = EvaluatedSchedule::from_schedule(&problem, schedule.clone());
        let mut best = current.clone();
        let mut best_schedule = schedule.clone();
        let mut no_improvement_count = 0u64;
        let mut iterations = 0u64;
        let mut tabu = WeekTabuLists::new(problem.num_weeks);
        let stop_conditions = &self.configuration.stop_conditions;

        if stop_conditions.should_stop_for_optimal_score(current.paper_objective()) {
            return build_solver_result(
                input,
                &problem,
                &best_schedule,
                no_improvement_count,
                effective_seed,
                StopReason::OptimalScoreReached,
            );
        }

        let stop_reason = loop {
            if let Some(limit) = stop_conditions.max_iterations {
                if iterations >= limit {
                    break StopReason::MaxIterationsReached;
                }
            }
            if let Some(limit) = stop_conditions.time_limit_seconds {
                if started_at.elapsed().as_secs() >= limit {
                    break StopReason::TimeLimitReached;
                }
            }
            if let Some(limit) = stop_conditions.no_improvement_iterations {
                if no_improvement_count >= limit {
                    break StopReason::NoImprovementLimitReached;
                }
            }
            if current.conflict_positions == 0 {
                break StopReason::OptimalScoreReached;
            }

            let breakout_applied = should_apply_random_breakout(no_improvement_count);
            let next_schedule = if breakout_applied {
                apply_random_breakout(&problem, &schedule, &mut rng, &mut tabu, iterations)
            } else {
                select_best_swap(&problem, &schedule, &current, &best, &tabu, iterations)
                    .map(|candidate| {
                        tabu.record(
                            candidate.week,
                            unordered_pair(candidate.left_person, candidate.right_person),
                            iterations + TABU_TENURE_ITERATIONS,
                        );
                        candidate.schedule
                    })
                    .unwrap_or_else(|| schedule.clone())
            };

            schedule = next_schedule;
            current = EvaluatedSchedule::from_schedule(&problem, schedule.clone());
            iterations += 1;

            if current.conflict_positions < best.conflict_positions {
                best = current.clone();
                best_schedule = schedule.clone();
                no_improvement_count = next_no_improvement_count(
                    no_improvement_count,
                    true,
                    breakout_applied,
                );
            } else {
                no_improvement_count = next_no_improvement_count(
                    no_improvement_count,
                    false,
                    breakout_applied,
                );
            }

            if stop_conditions.should_stop_for_optimal_score(best.paper_objective()) {
                break StopReason::OptimalScoreReached;
            }
        };

        build_solver_result(
            input,
            &problem,
            &best_schedule,
            no_improvement_count,
            effective_seed,
            stop_reason,
        )
    }
}

fn should_apply_random_breakout(no_improvement_count: u64) -> bool {
    // Paper Section 7 says that after 4 non-improving iterations, two random swaps are made.
    // We therefore trigger exactly when the streak reaches 4 and reset the streak after that
    // breakout iteration, instead of perturbing on every subsequent iteration.
    no_improvement_count == RANDOM_BREAKOUT_AFTER_NO_IMPROVEMENT
}

fn next_no_improvement_count(
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

#[derive(Debug, Clone)]
struct PureSgpProblem {
    people: Vec<String>,
    groups: Vec<String>,
    num_people: usize,
    num_groups: usize,
    group_size: usize,
    num_weeks: usize,
}

impl PureSgpProblem {
    fn from_input(input: &ApiInput) -> Result<Self, SolverError> {
        let kind = input
            .solver
            .validate_solver_selection()
            .map_err(SolverError::ValidationError)?;
        if kind != crate::models::SolverKind::Solver4 {
            return Err(SolverError::ValidationError(format!(
                "solver4 expected solver family 'solver4', got '{}'",
                kind.canonical_id()
            )));
        }
        if input.initial_schedule.is_some() {
            return Err(SolverError::ValidationError(
                "solver4 does not accept initial_schedule; it uses the paper's randomized greedy initializer explicitly".into(),
            ));
        }
        if input.construction_seed_schedule.is_some() {
            return Err(SolverError::ValidationError(
                "solver4 does not accept construction_seed_schedule; it uses the paper's randomized greedy initializer explicitly".into(),
            ));
        }

        let num_weeks = usize::try_from(input.problem.num_sessions).map_err(|_| {
            SolverError::ValidationError("solver4 num_sessions does not fit usize".into())
        })?;
        if num_weeks == 0 {
            return Err(SolverError::ValidationError(
                "solver4 requires at least one session".into(),
            ));
        }
        if input.problem.groups.is_empty() {
            return Err(SolverError::ValidationError(
                "solver4 requires at least one group".into(),
            ));
        }
        if input.problem.people.is_empty() {
            return Err(SolverError::ValidationError(
                "solver4 requires at least one person".into(),
            ));
        }

        let first_group = &input.problem.groups[0];
        if first_group.size == 0 {
            return Err(SolverError::ValidationError(
                "solver4 requires positive uniform group size".into(),
            ));
        }
        if first_group.session_sizes.is_some() {
            return Err(SolverError::ValidationError(
                "solver4 rejects session-specific capacities; pure SGP requires one fixed group size".into(),
            ));
        }
        let group_size = usize::try_from(first_group.size).map_err(|_| {
            SolverError::ValidationError("solver4 group size does not fit usize".into())
        })?;

        for group in &input.problem.groups {
            if group.session_sizes.is_some() {
                return Err(SolverError::ValidationError(
                    "solver4 rejects session-specific capacities; pure SGP requires one fixed group size".into(),
                ));
            }
            if group.size != first_group.size {
                return Err(SolverError::ValidationError(
                    "solver4 requires uniform group sizes across all groups".into(),
                ));
            }
        }

        for person in &input.problem.people {
            if let Some(sessions) = &person.sessions {
                let expected: Vec<u32> = (0..input.problem.num_sessions).collect();
                if sessions != &expected {
                    return Err(SolverError::ValidationError(
                        "solver4 rejects partial attendance; pure SGP requires every person in every session".into(),
                    ));
                }
            }
        }

        let num_people = input.problem.people.len();
        let num_groups = input.problem.groups.len();
        if num_people != num_groups * group_size {
            return Err(SolverError::ValidationError(format!(
                "solver4 requires complete equal partitions each session: {} people != {} groups * size {}",
                num_people, num_groups, group_size
            )));
        }

        validate_pure_sgp_objectives(&input.objectives)?;
        validate_pure_sgp_constraints(&input.constraints)?;

        Ok(Self {
            people: input.problem.people.iter().map(|person| person.id.clone()).collect(),
            groups: input.problem.groups.iter().map(|group| group.id.clone()).collect(),
            num_people,
            num_groups,
            group_size,
            num_weeks,
        })
    }

    fn position_id(&self, week: usize, group: usize, slot: usize) -> usize {
        ((week * self.num_groups) + group) * self.group_size + slot
    }

    fn pair_key(&self, left: usize, right: usize) -> usize {
        let (left, right) = unordered_pair(left, right);
        left * self.num_people + right
    }
}

fn validate_pure_sgp_objectives(objectives: &[Objective]) -> Result<(), SolverError> {
    for objective in objectives {
        if objective.r#type != "maximize_unique_contacts" {
            return Err(SolverError::ValidationError(format!(
                "solver4 rejects objective '{}'; pure SGP only allows maximize_unique_contacts",
                objective.r#type
            )));
        }
    }
    Ok(())
}

fn validate_pure_sgp_constraints(constraints: &[Constraint]) -> Result<(), SolverError> {
    let mut repeat_encounter: Option<&RepeatEncounterParams> = None;
    for constraint in constraints {
        match constraint {
            Constraint::RepeatEncounter(params) => {
                if repeat_encounter.replace(params).is_some() {
                    return Err(SolverError::ValidationError(
                        "solver4 allows at most one RepeatEncounter constraint".into(),
                    ));
                }
            }
            other => {
                return Err(SolverError::ValidationError(format!(
                    "solver4 rejects non-SGP constraint '{:?}'; pure SGP only allows RepeatEncounter",
                    other
                )));
            }
        }
    }
    Ok(())
}

fn build_greedy_initial_schedule(
    problem: &PureSgpProblem,
    gamma: f64,
    rng: &mut ChaCha12Rng,
) -> Vec<Vec<Vec<usize>>> {
    let mut schedule = vec![vec![Vec::with_capacity(problem.group_size); problem.num_groups]; problem.num_weeks];
    let mut met_before = vec![vec![false; problem.num_people]; problem.num_people];
    // Paper Section 6 subtracts a large penalty from a selected pair's freedom in further weeks.
    // We therefore track only cross-week discouragement here; within a partially built group we do
    // not add extra freedom penalties, because the paper explicitly says the heuristic otherwise
    // pays no attention to potential conflicts inside a group.
    let mut selected_pair_penalties = vec![vec![0usize; problem.num_people]; problem.num_people];

    for week in 0..problem.num_weeks {
        let mut remaining: Vec<usize> = (0..problem.num_people).collect();
        for group_idx in 0..problem.num_groups {
            let pair_slots = problem.group_size / 2;
            let mut selected_pairs = Vec::with_capacity(pair_slots);
            for _ in 0..pair_slots {
                let pair = choose_best_pair(&remaining, &met_before, &selected_pair_penalties, gamma, rng);
                schedule[week][group_idx].push(pair.0);
                schedule[week][group_idx].push(pair.1);
                remove_person(&mut remaining, pair.0);
                remove_person(&mut remaining, pair.1);
                selected_pairs.push(pair);
            }
            if problem.group_size % 2 == 1 {
                let selected = choose_last_singleton(&remaining, gamma, rng);
                schedule[week][group_idx].push(selected);
                remove_person(&mut remaining, selected);
            }

            for &(left, right) in &selected_pairs {
                selected_pair_penalties[left][right] += 1;
                selected_pair_penalties[right][left] += 1;
            }
            // Only after the whole group is known do we record the newly created meetings. This
            // preserves the paper's rule that, aside from the future-week pair penalty, the greedy
            // choice does not try to avoid prospective conflicts inside the current group.
            note_group_partnerships(&schedule[week][group_idx], &mut met_before);
        }
    }

    schedule
}

fn choose_best_pair(
    remaining: &[usize],
    met_before: &[Vec<bool>],
    selected_pair_penalties: &[Vec<usize>],
    gamma: f64,
    rng: &mut ChaCha12Rng,
) -> (usize, usize) {
    let mut scored = Vec::new();
    for left_idx in 0..remaining.len() {
        for right_idx in (left_idx + 1)..remaining.len() {
            let left = remaining[left_idx];
            let right = remaining[right_idx];
            let raw_freedom = paper_pair_freedom(left, right, met_before);
            let adjusted_freedom = raw_freedom as i64
                - (selected_pair_penalties[left][right] as i64 * PAPER_PAIR_REPEAT_PENALTY);
            scored.push((left, right, adjusted_freedom));
        }
    }
    scored.sort_by(|left, right| {
        right
            .2
            .cmp(&left.2)
            .then((left.0, left.1).cmp(&(right.0, right.1)))
    });
    let best_score = scored[0].2;
    let tied_len = scored.iter().take_while(|candidate| candidate.2 == best_score).count();
    if tied_len > 1 && rng.random::<f64>() < gamma {
        let chosen = scored[..tied_len]
            .choose(rng)
            .copied()
            .unwrap_or(scored[0]);
        (chosen.0, chosen.1)
    } else {
        (scored[0].0, scored[0].1)
    }
}

fn paper_pair_freedom(left: usize, right: usize, met_before: &[Vec<bool>]) -> usize {
    // Section 6 freedom counts how many *other players* remain compatible with both members of the
    // pair with respect to the current partial configuration. Because we delay same-group updates
    // until the group is complete, this reflects cross-group / cross-week history rather than
    // speculative penalties inside the currently assembled group.
    (0..met_before.len())
        .filter(|candidate| *candidate != left && *candidate != right)
        .filter(|&candidate| !met_before[left][candidate] && !met_before[right][candidate])
        .count()
}

fn choose_last_singleton(remaining: &[usize], gamma: f64, rng: &mut ChaCha12Rng) -> usize {
    if remaining.len() > 1 && rng.random::<f64>() < gamma {
        remaining.choose(rng).copied().unwrap_or(remaining[0])
    } else {
        remaining[0]
    }
}

fn remove_person(remaining: &mut Vec<usize>, person: usize) {
    if let Some(idx) = remaining.iter().position(|candidate| *candidate == person) {
        remaining.remove(idx);
    }
}

fn note_group_partnerships(group: &[usize], met_before: &mut [Vec<bool>]) {
    for left_idx in 0..group.len() {
        for right_idx in (left_idx + 1)..group.len() {
            let left = group[left_idx];
            let right = group[right_idx];
            met_before[left][right] = true;
            met_before[right][left] = true;
        }
    }
}

#[derive(Debug, Clone, Copy)]
struct PairOccurrence {
    left_position: usize,
    right_position: usize,
}

#[derive(Debug, Clone)]
struct EvaluatedSchedule {
    conflict_positions: usize,
    unique_contacts: i32,
    repeat_excess: i32,
    pair_counts: Vec<u16>,
    pair_occurrences: Vec<Vec<PairOccurrence>>,
    incident_counts: Vec<u16>,
}

impl EvaluatedSchedule {
    /// Paper Section 7: a position is a conflict position iff its occupant shares a group with at
    /// least one player that the occupant has already shared a group with in another week. `f(C)`
    /// is therefore the number of schedule positions that participate in any repeated pair.
    fn from_schedule(problem: &PureSgpProblem, schedule: Vec<Vec<Vec<usize>>>) -> Self {
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
        for (key, &count) in pair_counts.iter().enumerate() {
            if count > 0 {
                let _ = key;
                unique_contacts += 1;
            }
            if count > 1 {
                repeat_excess += i32::from(count - 1);
                for occurrence in &pair_occurrences[key] {
                    incident_counts[occurrence.left_position] += 1;
                    incident_counts[occurrence.right_position] += 1;
                }
            }
        }

        let conflict_positions = incident_counts.iter().filter(|count| **count > 0).count();
        Self {
            conflict_positions,
            unique_contacts,
            repeat_excess,
            pair_counts,
            pair_occurrences,
            incident_counts,
        }
    }

    fn paper_objective(&self) -> f64 {
        self.conflict_positions as f64
    }
}

#[derive(Debug, Clone, Copy)]
struct SwapCandidate {
    week: usize,
    left_group: usize,
    left_slot: usize,
    right_group: usize,
    right_slot: usize,
    left_person: usize,
    right_person: usize,
    conflict_positions_after: usize,
}

impl SwapCandidate {
    fn lexicographic_key(&self) -> (usize, usize, usize, usize, usize) {
        // Paper Section 7 describes a swap as exchanging G_ijk with G_ij'k' for j != j'.
        // We therefore make the tie-break explicit over the ordered variable tuple
        // (week=i, left_group=j, left_slot=k, right_group=j', right_slot=k').
        (
            self.week,
            self.left_group,
            self.left_slot,
            self.right_group,
            self.right_slot,
        )
    }

    fn outranks(&self, other: &Self) -> bool {
        self.conflict_positions_after < other.conflict_positions_after
            || (self.conflict_positions_after == other.conflict_positions_after
                && self.lexicographic_key() < other.lexicographic_key())
    }
}

fn select_best_swap(
    problem: &PureSgpProblem,
    schedule: &[Vec<Vec<usize>>],
    current: &EvaluatedSchedule,
    best: &EvaluatedSchedule,
    tabu: &WeekTabuLists,
    iteration: u64,
) -> Option<SelectedSwap> {
    let mut best_candidate: Option<SwapCandidate> = None;

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
                        let candidate_conflicts = evaluate_swap_conflict_positions(
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
                        if tabu.contains(week, swapped_pair, iteration)
                            && candidate_conflicts >= best.conflict_positions
                        {
                            continue;
                        }

                        let candidate = SwapCandidate {
                            week,
                            left_group,
                            left_slot,
                            right_group,
                            right_slot,
                            left_person,
                            right_person,
                            conflict_positions_after: candidate_conflicts,
                        };

                        let is_better = match best_candidate {
                            None => true,
                            Some(current_best) => candidate.outranks(&current_best),
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
struct SelectedSwap {
    week: usize,
    left_person: usize,
    right_person: usize,
    schedule: Vec<Vec<Vec<usize>>>,
}

fn evaluate_swap_conflict_positions(
    problem: &PureSgpProblem,
    schedule: &[Vec<Vec<usize>>],
    current: &EvaluatedSchedule,
    week: usize,
    left_group: usize,
    left_slot: usize,
    right_group: usize,
    right_slot: usize,
) -> usize {
    let left_person = schedule[week][left_group][left_slot];
    let right_person = schedule[week][right_group][right_slot];

    let mut position_deltas: HashMap<usize, i32> = HashMap::new();

    for slot in 0..problem.group_size {
        if slot != left_slot {
            let partner = schedule[week][left_group][slot];
            apply_removed_pair_delta(
                problem,
                current,
                problem.pair_key(left_person, partner),
                problem.position_id(week, left_group, left_slot),
                problem.position_id(week, left_group, slot),
                &mut position_deltas,
            );
            apply_added_pair_delta(
                problem,
                current,
                problem.pair_key(right_person, partner),
                problem.position_id(week, right_group, right_slot),
                problem.position_id(week, left_group, slot),
                &mut position_deltas,
            );
        }
        if slot != right_slot {
            let partner = schedule[week][right_group][slot];
            apply_removed_pair_delta(
                problem,
                current,
                problem.pair_key(right_person, partner),
                problem.position_id(week, right_group, right_slot),
                problem.position_id(week, right_group, slot),
                &mut position_deltas,
            );
            apply_added_pair_delta(
                problem,
                current,
                problem.pair_key(left_person, partner),
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
        match (before, after) {
            (true, false) => new_conflict_positions -= 1,
            (false, true) => new_conflict_positions += 1,
            _ => {}
        }
    }
    new_conflict_positions
}

fn apply_removed_pair_delta(
    problem: &PureSgpProblem,
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
    let _ = problem;
}

fn apply_added_pair_delta(
    _problem: &PureSgpProblem,
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

fn apply_swap(
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

fn apply_random_breakout(
    problem: &PureSgpProblem,
    schedule: &[Vec<Vec<usize>>],
    rng: &mut ChaCha12Rng,
    tabu: &mut WeekTabuLists,
    iteration: u64,
) -> Vec<Vec<Vec<usize>>> {
    let mut next = schedule.to_vec();
    for offset in 0..RANDOM_BREAKOUT_SWAP_COUNT {
        let week = rng.random_range(0..problem.num_weeks);
        let left_group = rng.random_range(0..problem.num_groups);
        let mut right_group = rng.random_range(0..problem.num_groups);
        while right_group == left_group {
            right_group = rng.random_range(0..problem.num_groups);
        }
        let left_slot = rng.random_range(0..problem.group_size);
        let right_slot = rng.random_range(0..problem.group_size);
        let left_person = next[week][left_group][left_slot];
        let right_person = next[week][right_group][right_slot];
        next[week][left_group][left_slot] = right_person;
        next[week][right_group][right_slot] = left_person;
        tabu.record(
            week,
            unordered_pair(left_person, right_person),
            iteration + TABU_TENURE_ITERATIONS + offset as u64,
        );
    }
    next
}

#[derive(Debug, Clone)]
struct WeekTabuLists {
    expirations: Vec<HashMap<(usize, usize), u64>>,
}

impl WeekTabuLists {
    fn new(num_weeks: usize) -> Self {
        Self {
            expirations: vec![HashMap::new(); num_weeks],
        }
    }

    fn contains(&self, week: usize, pair: (usize, usize), iteration: u64) -> bool {
        self.expirations[week]
            .get(&pair)
            .is_some_and(|expires_after| *expires_after > iteration)
    }

    fn record(&mut self, week: usize, pair: (usize, usize), expires_after: u64) {
        self.expirations[week].insert(pair, expires_after);
    }
}

fn unordered_pair(left: usize, right: usize) -> (usize, usize) {
    if left < right {
        (left, right)
    } else {
        (right, left)
    }
}

fn build_solver_result(
    input: &ApiInput,
    problem: &PureSgpProblem,
    schedule: &[Vec<Vec<usize>>],
    no_improvement_count: u64,
    effective_seed: u64,
    stop_reason: StopReason,
) -> Result<SolverResult, SolverError> {
    let api_schedule = to_api_schedule(problem, schedule);
    let canonical = canonical_score_for_schedule(input, &api_schedule)?;

    Ok(SolverResult {
        final_score: canonical.total_score,
        schedule: api_schedule,
        unique_contacts: canonical.unique_contacts,
        repetition_penalty: canonical.repetition_penalty,
        attribute_balance_penalty: canonical.attribute_balance_penalty.round() as i32,
        constraint_penalty: canonical.constraint_penalty,
        no_improvement_count,
        weighted_repetition_penalty: canonical.weighted_repetition_penalty,
        weighted_constraint_penalty: canonical.weighted_constraint_penalty,
        effective_seed: Some(effective_seed),
        move_policy: Some(crate::models::MovePolicy::default()),
        stop_reason: Some(stop_reason),
        benchmark_telemetry: None::<SolverBenchmarkTelemetry>,
    })
}

fn canonical_score_for_schedule(
    input: &ApiInput,
    schedule: &ApiSchedule,
) -> Result<FullScoreSnapshot, SolverError> {
    let mut canonical_input = input.clone();
    canonical_input.initial_schedule = Some(schedule.clone());
    canonical_input.construction_seed_schedule = None;

    let mut solver_override = crate::default_solver_configuration_for(SolverKind::Solver2);
    solver_override.stop_conditions = canonical_input.solver.stop_conditions.clone();
    solver_override.logging = canonical_input.solver.logging.clone();
    solver_override.telemetry = canonical_input.solver.telemetry.clone();
    solver_override.seed = canonical_input.solver.seed;
    solver_override.move_policy = canonical_input.solver.move_policy.clone();
    solver_override.allowed_sessions = canonical_input.solver.allowed_sessions.clone();
    canonical_input.solver = solver_override;

    let state = SolutionState::from_input(&canonical_input).map_err(|error| {
        SolverError::ValidationError(format!(
            "solver4 could not canonicalize its final schedule through solver2 scoring: {error}"
        ))
    })?;

    Ok(state.current_score.clone())
}

fn to_api_schedule(
    problem: &PureSgpProblem,
    schedule: &[Vec<Vec<usize>>],
) -> HashMap<String, HashMap<String, Vec<String>>> {
    let mut api = HashMap::new();
    for (week_idx, groups) in schedule.iter().enumerate() {
        let mut week_map = HashMap::new();
        for (group_idx, members) in groups.iter().enumerate() {
            week_map.insert(
                problem.groups[group_idx].clone(),
                members
                    .iter()
                    .map(|person_idx| problem.people[*person_idx].clone())
                    .collect(),
            );
        }
        api.insert(format!("session_{week_idx}"), week_map);
    }
    api
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{
        Constraint, Group, LoggingOptions, Person, ProblemDefinition, Solver4Params,
        SolverConfiguration, SolverKind, SolverParams, StopConditions,
    };
    use std::collections::HashMap;

    fn evaluated(problem: &PureSgpProblem, schedule: &[Vec<Vec<usize>>]) -> EvaluatedSchedule {
        EvaluatedSchedule::from_schedule(problem, schedule.to_vec())
    }

    fn sample_problem(num_groups: usize, group_size: usize, num_weeks: usize) -> PureSgpProblem {
        PureSgpProblem {
            people: (0..(num_groups * group_size))
                .map(|idx| format!("p{idx}"))
                .collect(),
            groups: (0..num_groups).map(|idx| format!("g{idx}")).collect(),
            num_people: num_groups * group_size,
            num_groups,
            group_size,
            num_weeks,
        }
    }

    fn shuffled_week(num_people: usize, rng: &mut ChaCha12Rng) -> Vec<usize> {
        let mut people: Vec<usize> = (0..num_people).collect();
        for idx in (1..people.len()).rev() {
            let swap_idx = rng.random_range(0..=idx);
            people.swap(idx, swap_idx);
        }
        people
    }

    fn random_schedule(problem: &PureSgpProblem, rng: &mut ChaCha12Rng) -> Vec<Vec<Vec<usize>>> {
        let mut schedule = Vec::with_capacity(problem.num_weeks);
        for _ in 0..problem.num_weeks {
            let shuffled = shuffled_week(problem.num_people, rng);
            let mut week = Vec::with_capacity(problem.num_groups);
            for group in 0..problem.num_groups {
                let start = group * problem.group_size;
                let end = start + problem.group_size;
                week.push(shuffled[start..end].to_vec());
            }
            schedule.push(week);
        }
        schedule
    }

    fn pure_problem(num_groups: u32, group_size: u32, weeks: u32) -> ProblemDefinition {
        let num_people = num_groups * group_size;
        ProblemDefinition {
            people: (0..num_people)
                .map(|idx| Person {
                    id: format!("p{idx}"),
                    attributes: HashMap::new(),
                    sessions: None,
                })
                .collect(),
            groups: (0..num_groups)
                .map(|idx| Group {
                    id: format!("g{idx}"),
                    size: group_size,
                    session_sizes: None,
                })
                .collect(),
            num_sessions: weeks,
        }
    }

    fn solver4_config() -> SolverConfiguration {
        SolverConfiguration {
            solver_type: SolverKind::Solver4.canonical_id().into(),
            stop_conditions: StopConditions {
                max_iterations: Some(10_000),
                time_limit_seconds: Some(5),
                no_improvement_iterations: Some(1_000),
                stop_on_optimal_score: true,
            },
            solver_params: SolverParams::Solver4(Solver4Params::default()),
            logging: LoggingOptions::default(),
            telemetry: Default::default(),
            seed: Some(7),
            move_policy: None,
            allowed_sessions: None,
        }
    }

    #[test]
    fn pure_problem_gate_rejects_partial_attendance() {
        let mut problem = pure_problem(2, 2, 2);
        problem.people[0].sessions = Some(vec![0]);
        let input = ApiInput {
            problem,
            initial_schedule: None,
            construction_seed_schedule: None,
            objectives: vec![],
            constraints: vec![],
            solver: solver4_config(),
        };
        let error = PureSgpProblem::from_input(&input).unwrap_err();
        assert!(error.to_string().contains("partial attendance"));
    }

    #[test]
    fn solver4_solves_small_pure_instance() {
        let input = ApiInput {
            problem: pure_problem(2, 2, 2),
            initial_schedule: None,
            construction_seed_schedule: None,
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".into(),
                weight: 1.0,
            }],
            constraints: vec![],
            solver: solver4_config(),
        };
        let engine = SearchEngine::new(&input.solver);
        let result = engine.solve(&input).unwrap();
        assert_eq!(result.final_score, 0.0);
        assert_eq!(result.stop_reason, Some(StopReason::OptimalScoreReached));
    }

    #[test]
    fn solver4_final_result_uses_canonical_repo_scoring() {
        let input = ApiInput {
            problem: pure_problem(1, 2, 2),
            initial_schedule: None,
            construction_seed_schedule: None,
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".into(),
                weight: 1.0,
            }],
            constraints: vec![Constraint::RepeatEncounter(RepeatEncounterParams {
                max_allowed_encounters: 0,
                penalty_function: "squared".into(),
                penalty_weight: 10.0,
            })],
            solver: solver4_config(),
        };

        let schedule = HashMap::from([
            (
                "session_0".to_string(),
                HashMap::from([("g0".to_string(), vec!["p0".to_string(), "p1".to_string()])]),
            ),
            (
                "session_1".to_string(),
                HashMap::from([("g0".to_string(), vec!["p0".to_string(), "p1".to_string()])]),
            ),
        ]);

        let canonical = canonical_score_for_schedule(&input, &schedule).unwrap();
        assert_eq!(canonical.unique_contacts, 1);
        assert_eq!(canonical.repetition_penalty, 4);
        assert_eq!(canonical.weighted_repetition_penalty, 40.0);
        assert_eq!(canonical.weighted_constraint_penalty, 0.0);
        assert_eq!(canonical.total_score, 40.0);
    }

    #[test]
    fn greedy_constructor_is_deterministic_for_fixed_seed() {
        let problem = PureSgpProblem {
            people: vec!["p0".into(), "p1".into(), "p2".into(), "p3".into()],
            groups: vec!["g0".into(), "g1".into()],
            num_people: 4,
            num_groups: 2,
            group_size: 2,
            num_weeks: 2,
        };
        let mut left_rng = ChaCha12Rng::seed_from_u64(7);
        let mut right_rng = ChaCha12Rng::seed_from_u64(7);
        let left = build_greedy_initial_schedule(&problem, 0.0, &mut left_rng);
        let right = build_greedy_initial_schedule(&problem, 0.0, &mut right_rng);
        assert_eq!(left, right);
    }

    #[test]
    fn gamma_zero_pair_choice_uses_lexicographic_order_for_ties() {
        let remaining = vec![0, 1, 2, 3];
        let met_before = vec![vec![false; 4]; 4];
        let penalties = vec![vec![0usize; 4]; 4];
        let mut rng = ChaCha12Rng::seed_from_u64(1);

        let chosen = choose_best_pair(&remaining, &met_before, &penalties, 0.0, &mut rng);

        assert_eq!(chosen, (0, 1));
    }

    #[test]
    fn gamma_zero_odd_group_singleton_uses_smallest_remaining_player() {
        let remaining = vec![2, 4, 7];
        let mut rng = ChaCha12Rng::seed_from_u64(3);

        let chosen = choose_last_singleton(&remaining, 0.0, &mut rng);

        assert_eq!(chosen, 2);
    }

    #[test]
    fn greedy_constructor_applies_future_week_pair_penalty() {
        let problem = sample_problem(2, 2, 2);
        let mut rng = ChaCha12Rng::seed_from_u64(0);

        let schedule = build_greedy_initial_schedule(&problem, 0.0, &mut rng);

        assert_eq!(schedule, vec![vec![vec![0, 1], vec![2, 3]], vec![vec![0, 2], vec![1, 3]]]);
    }

    #[test]
    fn note_group_partnerships_marks_full_group_pairwise_history() {
        let mut met_before = vec![vec![false; 4]; 4];

        note_group_partnerships(&[0, 1, 2], &mut met_before);

        assert!(met_before[0][1]);
        assert!(met_before[1][0]);
        assert!(met_before[0][2]);
        assert!(met_before[2][0]);
        assert!(met_before[1][2]);
        assert!(met_before[2][1]);
        assert!(!met_before[0][3]);
    }

    #[test]
    fn breakout_is_not_applied_before_four_non_improving_iterations() {
        assert!(!should_apply_random_breakout(0));
        assert!(!should_apply_random_breakout(1));
        assert!(!should_apply_random_breakout(2));
        assert!(!should_apply_random_breakout(3));
    }

    #[test]
    fn breakout_is_applied_exactly_when_streak_reaches_four() {
        assert!(should_apply_random_breakout(4));
    }

    #[test]
    fn breakout_does_not_repeat_without_another_full_stagnation_window() {
        assert!(!should_apply_random_breakout(5));
        assert!(!should_apply_random_breakout(6));
        assert!(!should_apply_random_breakout(7));
        assert!(!should_apply_random_breakout(8));
    }

    #[test]
    fn breakout_resets_the_stagnation_counter() {
        assert_eq!(next_no_improvement_count(4, false, true), 0);
        assert_eq!(next_no_improvement_count(3, false, false), 4);
        assert_eq!(next_no_improvement_count(3, true, false), 0);
    }

    #[test]
    fn conflict_positions_are_zero_without_repeated_pairs() {
        let problem = sample_problem(2, 2, 2);
        let schedule = vec![vec![vec![0, 1], vec![2, 3]], vec![vec![0, 2], vec![1, 3]]];

        let evaluated = evaluated(&problem, &schedule);

        assert_eq!(evaluated.conflict_positions, 0);
        assert_eq!(evaluated.repeat_excess, 0);
    }

    #[test]
    fn conflict_positions_count_both_occurrences_of_one_repeated_pair() {
        let problem = sample_problem(1, 2, 2);
        let schedule = vec![vec![vec![0, 1]], vec![vec![0, 1]]];

        let evaluated = evaluated(&problem, &schedule);

        assert_eq!(evaluated.conflict_positions, 4);
        assert_eq!(evaluated.repeat_excess, 1);
    }

    #[test]
    fn conflict_positions_cover_all_slots_of_repeated_triple_groups() {
        let problem = sample_problem(1, 3, 2);
        let schedule = vec![vec![vec![0, 1, 2]], vec![vec![0, 1, 2]]];

        let evaluated = evaluated(&problem, &schedule);

        assert_eq!(evaluated.conflict_positions, 6);
        assert_eq!(evaluated.repeat_excess, 3);
        assert!(evaluated.incident_counts.iter().all(|count| *count > 0));
    }

    #[test]
    fn conflict_positions_handle_odd_group_size_partial_repeats() {
        let problem = sample_problem(1, 3, 2);
        let schedule = vec![vec![vec![0, 1, 2]], vec![vec![0, 1, 3]]];

        let evaluated = evaluated(&problem, &schedule);

        assert_eq!(evaluated.conflict_positions, 4);
        assert_eq!(evaluated.repeat_excess, 1);
        assert_eq!(evaluated.incident_counts, vec![1, 1, 0, 1, 1, 0]);
    }

    #[test]
    fn swap_preview_matches_full_recompute_on_small_random_schedules() {
        let problem = sample_problem(3, 3, 4);
        let mut rng = ChaCha12Rng::seed_from_u64(11);

        for _ in 0..32 {
            let schedule = random_schedule(&problem, &mut rng);
            let current = evaluated(&problem, &schedule);

            for week in 0..problem.num_weeks {
                for left_group in 0..problem.num_groups {
                    for right_group in (left_group + 1)..problem.num_groups {
                        for left_slot in 0..problem.group_size {
                            for right_slot in 0..problem.group_size {
                                let preview = evaluate_swap_conflict_positions(
                                    &problem,
                                    &schedule,
                                    &current,
                                    week,
                                    left_group,
                                    left_slot,
                                    right_group,
                                    right_slot,
                                );
                                let swapped = apply_swap(
                                    &schedule,
                                    week,
                                    left_group,
                                    left_slot,
                                    right_group,
                                    right_slot,
                                );
                                let recomputed = evaluated(&problem, &swapped);
                                assert_eq!(
                                    preview, recomputed.conflict_positions,
                                    "preview mismatch for week={week} groups=({left_group},{right_group}) slots=({left_slot},{right_slot})",
                                );
                            }
                        }
                    }
                }
            }
        }
    }

    #[test]
    fn swap_candidate_outranks_by_lexicographic_key_when_scores_tie() {
        let left = SwapCandidate {
            week: 0,
            left_group: 0,
            left_slot: 0,
            right_group: 1,
            right_slot: 0,
            left_person: 0,
            right_person: 2,
            conflict_positions_after: 0,
        };
        let right = SwapCandidate {
            week: 0,
            left_group: 0,
            left_slot: 1,
            right_group: 1,
            right_slot: 0,
            left_person: 1,
            right_person: 2,
            conflict_positions_after: 0,
        };

        assert!(left.outranks(&right));
        assert!(!right.outranks(&left));
    }

    #[test]
    fn select_best_swap_uses_explicit_lexicographic_tie_breaking() {
        let problem = sample_problem(2, 2, 2);
        let schedule = vec![vec![vec![0, 1], vec![2, 3]], vec![vec![0, 1], vec![2, 3]]];
        let current = evaluated(&problem, &schedule);
        let tabu = WeekTabuLists::new(problem.num_weeks);

        let selected = select_best_swap(&problem, &schedule, &current, &current, &tabu, 0)
            .expect("expected a best swap");

        assert_eq!(selected.week, 0);
        assert_eq!(selected.left_person, 0);
        assert_eq!(selected.right_person, 2);
        assert_eq!(selected.schedule, vec![vec![vec![2, 1], vec![0, 3]], vec![vec![0, 1], vec![2, 3]]]);
    }
}
