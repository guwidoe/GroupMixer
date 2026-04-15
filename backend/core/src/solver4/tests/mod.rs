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

mod problem_construction;

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
fn swap_candidate_outranks_by_resulting_configuration_lexicographic_order() {
    let base_schedule = vec![vec![vec![0, 1], vec![2, 3]], vec![vec![0, 1], vec![2, 3]]];
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

    assert!(!left.outranks(&right, &base_schedule));
    assert!(right.outranks(&left, &base_schedule));
}

#[test]
fn select_best_swap_uses_explicit_lexicographic_tie_breaking() {
    let problem = sample_problem(2, 2, 2);
    let schedule = vec![vec![vec![0, 1], vec![2, 3]], vec![vec![0, 1], vec![2, 3]]];
    let current = evaluated(&problem, &schedule);
    let mut tabu = WeekTabuLists::new(problem.num_weeks);
    let mut tabu_telemetry = SgpWeekPairTabuBenchmarkTelemetry::default();

    let selected = select_best_swap(
        &problem,
        &schedule,
        &current,
        &current,
        &mut tabu,
        0,
        &mut tabu_telemetry,
    )
    .expect("expected a best swap");

    assert_eq!(selected.week, 1);
    assert_eq!(selected.left_person, 1);
    assert_eq!(selected.right_person, 2);
    assert_eq!(
        selected.schedule,
        vec![vec![vec![0, 1], vec![2, 3]], vec![vec![0, 2], vec![1, 3]],]
    );
}

#[test]
fn tabu_list_keeps_pairs_for_exactly_last_ten_iterations() {
    let mut tabu = WeekTabuLists::new(1);
    let mut telemetry = SgpWeekPairTabuBenchmarkTelemetry::default();
    tabu.record_iteration(0, &[(0, (1, 2))], &mut telemetry);
    for iteration in 1..10 {
        tabu.prune(iteration);
        assert!(tabu.contains(0, (1, 2)));
    }
    tabu.prune(10);
    assert!(!tabu.contains(0, (1, 2)));
}

#[test]
fn breakout_records_both_random_swaps_in_same_iteration_window() {
    let problem = sample_problem(2, 2, 2);
    let schedule = vec![vec![vec![0, 1], vec![2, 3]], vec![vec![0, 2], vec![1, 3]]];
    let current = EvaluatedSchedule::from_schedule(&problem, schedule.clone());
    let mut rng = ChaCha12Rng::seed_from_u64(5);
    let mut tabu = WeekTabuLists::new(problem.num_weeks);
    let mut telemetry = SgpWeekPairTabuBenchmarkTelemetry::default();
    let _ = apply_random_breakout(
        &problem,
        &schedule,
        &current,
        &mut rng,
        &mut tabu,
        3,
        &mut telemetry,
    );
    assert_eq!(telemetry.recorded_swaps, 2);
    for week in 0..problem.num_weeks {
        assert!(tabu.history[week]
            .iter()
            .all(|(iteration, _)| *iteration == 3));
    }
}

#[test]
fn choose_breakout_week_prefers_max_conflict_weeks() {
    let problem = sample_problem(2, 2, 3);
    let schedule = vec![
        vec![vec![0, 1], vec![2, 3]],
        vec![vec![0, 1], vec![2, 3]],
        vec![vec![0, 2], vec![1, 3]],
    ];
    let current = EvaluatedSchedule::from_schedule(&problem, schedule);
    assert_eq!(current.conflict_positions_by_week, vec![4, 4, 0]);

    let mut rng = ChaCha12Rng::seed_from_u64(7);
    for _ in 0..20 {
        let week = choose_breakout_week(&current, problem.num_weeks, &mut rng);
        assert!(week == 0 || week == 1);
    }
}

#[test]
fn choose_breakout_positions_prefers_conflicted_slots_from_different_groups() {
    let problem = sample_problem(2, 2, 3);
    let schedule = vec![
        vec![vec![0, 1], vec![2, 3]],
        vec![vec![0, 1], vec![2, 3]],
        vec![vec![0, 2], vec![1, 3]],
    ];
    let current = EvaluatedSchedule::from_schedule(&problem, schedule);
    let mut rng = ChaCha12Rng::seed_from_u64(11);

    for _ in 0..20 {
        let (left_group, left_slot, right_group, right_slot) =
            choose_breakout_positions(&problem, &current, 0, &mut rng);
        assert_ne!(left_group, right_group);
        assert!(current.incident_counts[problem.position_id(0, left_group, left_slot)] > 0);
        assert!(current.incident_counts[problem.position_id(0, right_group, right_slot)] > 0);
    }
}

#[test]
fn local_search_trace_locks_first_two_iterations_on_repeated_pair_fixture() {
    let problem = sample_problem(2, 2, 3);
    let schedule = vec![
        vec![vec![0, 1], vec![2, 3]],
        vec![vec![0, 1], vec![2, 3]],
        vec![vec![0, 1], vec![2, 3]],
    ];

    let trace = simulate_local_search_iterations(&problem, &schedule, None, 2, 0);

    assert_eq!(
        trace,
        vec![
            LocalSearchIterationTrace {
                iteration: 0,
                breakout_applied: false,
                selected_swap: Some((2, 1, 2)),
                current_conflict_positions: 8,
                best_conflict_positions: 8,
                no_improvement_count: 0,
                tabu_recorded_pairs: vec![(2, (1, 2))],
                raw_tabu_hits_delta: 0,
                aspiration_overrides_delta: 0,
            },
            LocalSearchIterationTrace {
                iteration: 1,
                breakout_applied: false,
                selected_swap: Some((1, 1, 3)),
                current_conflict_positions: 0,
                best_conflict_positions: 0,
                no_improvement_count: 0,
                tabu_recorded_pairs: vec![(1, (1, 3))],
                raw_tabu_hits_delta: 0,
                aspiration_overrides_delta: 0,
            },
        ]
    );
}

#[test]
fn neighborhood_is_all_swaps_with_at_least_one_conflict_position() {
    let problem = sample_problem(3, 2, 2);
    let schedule = vec![
        vec![vec![0, 1], vec![2, 3], vec![4, 5]],
        vec![vec![0, 1], vec![2, 4], vec![3, 5]],
    ];
    let current = evaluated(&problem, &schedule);

    let swaps = enumerated_conflict_affecting_swaps(&problem, &schedule, &current);

    assert!(swaps.contains(&(0, 0, 0, 1, 0)));
    assert!(swaps.contains(&(1, 0, 1, 2, 1)));
    assert!(!swaps.contains(&(0, 1, 0, 2, 0)));
    assert!(!swaps.contains(&(1, 1, 1, 2, 1)));
}

#[test]
fn tabu_move_is_skipped_when_it_does_not_beat_global_best() {
    let problem = sample_problem(2, 2, 3);
    let schedule = vec![
        vec![vec![0, 1], vec![2, 3]],
        vec![vec![0, 1], vec![2, 3]],
        vec![vec![0, 1], vec![2, 3]],
    ];
    let current = evaluated(&problem, &schedule);
    let mut best = current.clone();
    best.conflict_positions = 8;
    let mut tabu = WeekTabuLists::new(problem.num_weeks);
    let mut tabu_telemetry = SgpWeekPairTabuBenchmarkTelemetry::default();
    tabu.record_iteration(0, &[(2, (1, 2))], &mut tabu_telemetry);

    let selected = select_best_swap(
        &problem,
        &schedule,
        &current,
        &best,
        &mut tabu,
        1,
        &mut tabu_telemetry,
    )
    .expect("expected a non-tabu fallback move");

    assert_eq!(selected.week, 2);
    assert_eq!(selected.left_person, 1);
    assert_eq!(selected.right_person, 3);
    assert_eq!(tabu_telemetry.raw_tabu_hits, 1);
    assert_eq!(tabu_telemetry.aspiration_overrides, 0);
}

#[test]
fn aspiration_allows_tabu_move_when_it_beats_global_best() {
    let problem = sample_problem(2, 2, 3);
    let schedule = vec![
        vec![vec![0, 1], vec![2, 3]],
        vec![vec![0, 1], vec![2, 3]],
        vec![vec![0, 1], vec![2, 3]],
    ];
    let current = evaluated(&problem, &schedule);
    let best = current.clone();
    let mut tabu = WeekTabuLists::new(problem.num_weeks);
    let mut tabu_telemetry = SgpWeekPairTabuBenchmarkTelemetry::default();
    tabu.record_iteration(0, &[(2, (1, 2))], &mut tabu_telemetry);

    let selected = select_best_swap(
        &problem,
        &schedule,
        &current,
        &best,
        &mut tabu,
        1,
        &mut tabu_telemetry,
    )
    .expect("expected aspiration to allow the tabu move");

    assert_eq!(selected.week, 2);
    assert_eq!(selected.left_person, 1);
    assert_eq!(selected.right_person, 2);
    assert_eq!(tabu_telemetry.raw_tabu_hits, 1);
    assert_eq!(tabu_telemetry.aspiration_overrides, 1);
}

#[test]
fn local_search_trace_breakout_triggers_on_fifth_non_improving_iteration() {
    let problem = sample_problem(2, 2, 3);
    let schedule = vec![
        vec![vec![0, 1], vec![2, 3]],
        vec![vec![0, 1], vec![2, 3]],
        vec![vec![0, 1], vec![2, 3]],
    ];

    let trace = simulate_local_search_iterations(&problem, &schedule, Some(0), 7, 5);

    assert_eq!(
        trace
            .iter()
            .map(|step| step.breakout_applied)
            .collect::<Vec<_>>(),
        vec![false, false, false, false, false, false, true]
    );
    assert_eq!(
        trace
            .iter()
            .map(|step| step.no_improvement_count)
            .collect::<Vec<_>>(),
        vec![0, 0, 1, 2, 3, 4, 0]
    );
    assert_eq!(trace[0].selected_swap, Some((2, 1, 2)));
    assert_eq!(trace[1].selected_swap, Some((1, 1, 3)));
    assert_eq!(trace[2].selected_swap, None);
    assert_eq!(trace[3].selected_swap, None);
    assert!(trace[4].selected_swap.is_none());
    assert!(trace[5].selected_swap.is_none());
    assert!(trace[6].selected_swap.is_none());
}
