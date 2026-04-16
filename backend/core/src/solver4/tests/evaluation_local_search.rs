use super::*;

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
fn active_repeated_pair_guidance_only_kicks_in_after_deeper_stagnation() {
    assert!(!should_prefer_active_repeated_pairs(0));
    assert!(!should_prefer_active_repeated_pairs(1));
    assert!(!should_prefer_active_repeated_pairs(2));
    assert!(!should_prefer_active_repeated_pairs(3));
    assert!(should_prefer_active_repeated_pairs(4));
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
                            let preview = evaluate_swap_preview(
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
                                preview.conflict_positions_after,
                                recomputed.conflict_positions,
                                "conflict-position preview mismatch for week={week} groups=({left_group},{right_group}) slots=({left_slot},{right_slot})",
                            );
                            assert_eq!(
                                preview.repeat_excess_after,
                                recomputed.repeat_excess,
                                "repeat-excess preview mismatch for week={week} groups=({left_group},{right_group}) slots=({left_slot},{right_slot})",
                            );
                            assert_eq!(
                                preview.active_repeated_pairs_after,
                                recomputed.active_repeated_pairs,
                                "active-repeated-pairs preview mismatch for week={week} groups=({left_group},{right_group}) slots=({left_slot},{right_slot})",
                            );
                            assert_eq!(
                                preview.max_conflict_positions_in_any_week_after,
                                *recomputed
                                    .conflict_positions_by_week
                                    .iter()
                                    .max()
                                    .unwrap(),
                                "max-week-conflict preview mismatch for week={week} groups=({left_group},{right_group}) slots=({left_slot},{right_slot})",
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
        repeat_excess_after: 0,
        active_repeated_pairs_after: 0,
        max_conflict_positions_in_any_week_after: 0,
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
        repeat_excess_after: 0,
        active_repeated_pairs_after: 0,
        max_conflict_positions_in_any_week_after: 0,
    };

    assert!(!left.outranks(&right, &base_schedule));
    assert!(right.outranks(&left, &base_schedule));
}

#[test]
fn repeat_guidance_tie_break_prefers_fewer_active_repeated_pairs() {
    let base_schedule = vec![vec![vec![0, 1], vec![2, 3]], vec![vec![0, 1], vec![2, 3]]];
    let lower_active_repeat_pairs = SwapCandidate {
        week: 0,
        left_group: 0,
        left_slot: 0,
        right_group: 1,
        right_slot: 0,
        left_person: 0,
        right_person: 2,
        conflict_positions_after: 0,
        repeat_excess_after: 0,
        active_repeated_pairs_after: 1,
        max_conflict_positions_in_any_week_after: 1,
    };
    let higher_active_repeat_pairs = SwapCandidate {
        week: 0,
        left_group: 0,
        left_slot: 1,
        right_group: 1,
        right_slot: 0,
        left_person: 1,
        right_person: 2,
        conflict_positions_after: 0,
        repeat_excess_after: 0,
        active_repeated_pairs_after: 2,
        max_conflict_positions_in_any_week_after: 0,
    };

    assert!(lower_active_repeat_pairs
        .outranks_with_repeat_guidance(&higher_active_repeat_pairs, &base_schedule));
    assert!(!higher_active_repeat_pairs
        .outranks_with_repeat_guidance(&lower_active_repeat_pairs, &base_schedule));
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
        0,
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
fn select_best_swap_prefers_lower_repeat_excess_before_lexicographic_tie_breaking() {
    let problem = sample_problem(3, 3, 4);
    let schedule = vec![
        vec![vec![2, 5, 7], vec![4, 8, 3], vec![6, 1, 0]],
        vec![vec![7, 5, 4], vec![2, 1, 6], vec![3, 8, 0]],
        vec![vec![5, 1, 6], vec![4, 0, 8], vec![2, 7, 3]],
        vec![vec![6, 3, 7], vec![4, 1, 8], vec![0, 5, 2]],
    ];
    let current = evaluated(&problem, &schedule);
    let mut tabu = WeekTabuLists::new(problem.num_weeks);
    let mut tabu_telemetry = SgpWeekPairTabuBenchmarkTelemetry::default();

    let lower_repeat_excess = evaluate_swap_preview(&problem, &schedule, &current, 0, 0, 0, 1, 1);
    let higher_repeat_excess = evaluate_swap_preview(&problem, &schedule, &current, 0, 0, 0, 1, 2);
    assert_eq!(lower_repeat_excess.conflict_positions_after, 24);
    assert_eq!(higher_repeat_excess.conflict_positions_after, 24);
    assert_eq!(lower_repeat_excess.repeat_excess_after, 7);
    assert_eq!(higher_repeat_excess.repeat_excess_after, 8);

    let selected = select_best_swap(
        &problem,
        &schedule,
        &current,
        &current,
        &mut tabu,
        0,
        &mut tabu_telemetry,
        0,
    )
    .expect("expected a best swap");
    let selected_evaluated = evaluated(&problem, &selected.schedule);
    assert_eq!(selected_evaluated.conflict_positions, 24);
    assert_eq!(selected_evaluated.repeat_excess, 7);
}

#[test]
fn select_best_swap_prefers_lower_max_week_conflict_after_repeat_excess_ties() {
    let problem = sample_problem(3, 3, 4);
    let schedule = vec![
        vec![vec![4, 3, 8], vec![0, 5, 7], vec![6, 2, 1]],
        vec![vec![4, 6, 7], vec![5, 2, 8], vec![0, 1, 3]],
        vec![vec![8, 4, 6], vec![0, 7, 1], vec![2, 3, 5]],
        vec![vec![2, 6, 7], vec![3, 5, 4], vec![8, 0, 1]],
    ];
    let current = evaluated(&problem, &schedule);
    let mut tabu = WeekTabuLists::new(problem.num_weeks);
    let mut tabu_telemetry = SgpWeekPairTabuBenchmarkTelemetry::default();

    let lower_max_week = evaluate_swap_preview(&problem, &schedule, &current, 2, 0, 1, 1, 1);
    let higher_max_week = evaluate_swap_preview(&problem, &schedule, &current, 3, 0, 1, 1, 0);
    assert_eq!(lower_max_week.conflict_positions_after, 25);
    assert_eq!(higher_max_week.conflict_positions_after, 25);
    assert_eq!(lower_max_week.repeat_excess_after, 8);
    assert_eq!(higher_max_week.repeat_excess_after, 8);
    assert_eq!(lower_max_week.max_conflict_positions_in_any_week_after, 8);
    assert_eq!(higher_max_week.max_conflict_positions_in_any_week_after, 9);

    let selected = select_best_swap(
        &problem,
        &schedule,
        &current,
        &current,
        &mut tabu,
        0,
        &mut tabu_telemetry,
        0,
    )
    .expect("expected a best swap");
    let selected_evaluated = evaluated(&problem, &selected.schedule);
    assert_eq!(selected_evaluated.conflict_positions, 25);
    assert_eq!(selected_evaluated.repeat_excess, 8);
    assert_eq!(
        *selected_evaluated
            .conflict_positions_by_week
            .iter()
            .max()
            .unwrap(),
        8
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
fn breakout_does_not_record_random_swaps_in_tabu_history() {
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
    assert_eq!(telemetry.recorded_swaps, 0);
    for week in 0..problem.num_weeks {
        assert!(tabu.history[week].is_empty());
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
fn choose_breakout_positions_avoids_reusing_positions_when_possible() {
    let problem = sample_problem(2, 2, 3);
    let schedule = vec![
        vec![vec![0, 1], vec![2, 3]],
        vec![vec![0, 1], vec![2, 3]],
        vec![vec![0, 2], vec![1, 3]],
    ];
    let current = EvaluatedSchedule::from_schedule(&problem, schedule);
    let mut rng = ChaCha12Rng::seed_from_u64(17);
    let mut used_positions = std::collections::BTreeSet::new();

    let first = choose_breakout_positions_avoiding_used_positions(
        &problem,
        &current,
        0,
        &mut rng,
        &used_positions,
    );
    used_positions.insert(problem.position_id(0, first.0, first.1));
    used_positions.insert(problem.position_id(0, first.2, first.3));

    let second = choose_breakout_positions_avoiding_used_positions(
        &problem,
        &current,
        0,
        &mut rng,
        &used_positions,
    );

    let second_left = problem.position_id(0, second.0, second.1);
    let second_right = problem.position_id(0, second.2, second.3);
    assert!(!used_positions.contains(&second_left));
    assert!(!used_positions.contains(&second_right));
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
        0,
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
        0,
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
