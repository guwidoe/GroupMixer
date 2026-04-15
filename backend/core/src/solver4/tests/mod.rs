use super::*;
use crate::models::{
    Constraint, Group, LoggingOptions, Person, ProblemDefinition, Solver4DiagnosticsParams,
    Solver4Params, SolverConfiguration, SolverKind, SolverParams, StopConditions,
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

#[derive(Debug, Clone, PartialEq, Eq)]
struct LocalSearchIterationTrace {
    iteration: u64,
    breakout_applied: bool,
    selected_swap: Option<(usize, usize, usize)>,
    current_conflict_positions: usize,
    best_conflict_positions: usize,
    no_improvement_count: u64,
    tabu_recorded_pairs: Vec<(usize, (usize, usize))>,
    raw_tabu_hits_delta: u64,
    aspiration_overrides_delta: u64,
}

fn simulate_local_search_iterations(
    problem: &PureSgpProblem,
    initial_schedule: &[Vec<Vec<usize>>],
    initial_best_conflict_positions: Option<usize>,
    step_count: usize,
    rng_seed: u64,
) -> Vec<LocalSearchIterationTrace> {
    let mut schedule = initial_schedule.to_vec();
    let mut current = evaluated(problem, &schedule);
    let mut best = current.clone();
    if let Some(best_conflict_positions) = initial_best_conflict_positions {
        best.conflict_positions = best_conflict_positions;
    }
    let mut no_improvement_count = 0u64;
    let mut tabu = WeekTabuLists::new(problem.num_weeks);
    let mut telemetry = SgpWeekPairTabuBenchmarkTelemetry::default();
    let mut rng = ChaCha12Rng::seed_from_u64(rng_seed);
    let mut trace = Vec::with_capacity(step_count);

    for iteration in 0..step_count as u64 {
        let breakout_applied = should_apply_random_breakout(no_improvement_count);
        let raw_tabu_hits_before = telemetry.raw_tabu_hits;
        let aspiration_overrides_before = telemetry.aspiration_overrides;

        let (selected_swap, tabu_recorded_pairs, next_schedule) = if breakout_applied {
            let next = apply_random_breakout(
                problem,
                &schedule,
                &current,
                &mut rng,
                &mut tabu,
                iteration,
                &mut telemetry,
            );
            (None, Vec::new(), next)
        } else {
            let selection = select_best_swap(
                problem,
                &schedule,
                &current,
                &best,
                &mut tabu,
                iteration,
                &mut telemetry,
            );
            if let Some(candidate) = selection {
                let pair = unordered_pair(candidate.left_person, candidate.right_person);
                let recorded = vec![(candidate.week, pair)];
                tabu.record_iteration(iteration, &recorded, &mut telemetry);
                (
                    Some((
                        candidate.week,
                        candidate.left_person,
                        candidate.right_person,
                    )),
                    recorded,
                    candidate.schedule,
                )
            } else {
                (None, Vec::new(), schedule.clone())
            }
        };

        let previous_conflict_positions = current.conflict_positions;
        schedule = next_schedule;
        current = evaluated(problem, &schedule);
        let improved_current = current.conflict_positions < previous_conflict_positions;
        let improved_best = current.conflict_positions < best.conflict_positions;
        if improved_best {
            best = current.clone();
        }
        no_improvement_count =
            next_no_improvement_count(no_improvement_count, improved_current, breakout_applied);

        trace.push(LocalSearchIterationTrace {
            iteration,
            breakout_applied,
            selected_swap,
            current_conflict_positions: current.conflict_positions,
            best_conflict_positions: best.conflict_positions,
            no_improvement_count,
            tabu_recorded_pairs,
            raw_tabu_hits_delta: telemetry.raw_tabu_hits - raw_tabu_hits_before,
            aspiration_overrides_delta: telemetry.aspiration_overrides
                - aspiration_overrides_before,
        });
    }

    trace
}

fn enumerated_conflict_affecting_swaps(
    problem: &PureSgpProblem,
    _schedule: &[Vec<Vec<usize>>],
    current: &EvaluatedSchedule,
) -> Vec<(usize, usize, usize, usize, usize)> {
    let mut swaps = Vec::new();
    for week in 0..problem.num_weeks {
        for left_group in 0..problem.num_groups {
            for right_group in (left_group + 1)..problem.num_groups {
                for left_slot in 0..problem.group_size {
                    let left_position = problem.position_id(week, left_group, left_slot);
                    for right_slot in 0..problem.group_size {
                        let right_position = problem.position_id(week, right_group, right_slot);
                        if current.incident_counts[left_position] == 0
                            && current.incident_counts[right_position] == 0
                        {
                            continue;
                        }
                        swaps.push((week, left_group, left_slot, right_group, right_slot));
                    }
                }
            }
        }
    }
    swaps
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

fn repeat_constraint() -> Constraint {
    Constraint::RepeatEncounter(RepeatEncounterParams {
        max_allowed_encounters: 0,
        penalty_function: "squared".into(),
        penalty_weight: 10.0,
    })
}

mod evaluation_local_search;
mod problem_construction;
