use super::*;

#[test]
fn pure_problem_gate_rejects_partial_attendance() {
    let mut problem = pure_problem(2, 2, 2);
    problem.people[0].sessions = Some(vec![0]);
    let input = ApiInput {
        problem,
        initial_schedule: None,
        construction_seed_schedule: None,
        objectives: vec![],
        constraints: vec![repeat_constraint()],
        solver: solver4_config(),
    };
    let error = PureSgpProblem::from_input(&input).unwrap_err();
    assert!(error.to_string().contains("partial attendance"));
}

#[test]
fn pure_problem_gate_requires_meet_at_most_once_repeat_encoding() {
    let input = ApiInput {
        problem: pure_problem(2, 2, 2),
        initial_schedule: None,
        construction_seed_schedule: None,
        objectives: vec![],
        constraints: vec![Constraint::RepeatEncounter(RepeatEncounterParams {
            max_allowed_encounters: 0,
            penalty_function: "squared".into(),
            penalty_weight: 10.0,
        })],
        solver: solver4_config(),
    };
    let error = PureSgpProblem::from_input(&input).unwrap_err();
    assert!(error.to_string().contains("must be 1"));
}

#[test]
fn pure_problem_gate_requires_repeat_constraint() {
    let input = ApiInput {
        problem: pure_problem(2, 2, 2),
        initial_schedule: None,
        construction_seed_schedule: None,
        objectives: vec![],
        constraints: vec![],
        solver: solver4_config(),
    };
    let error = PureSgpProblem::from_input(&input).unwrap_err();
    assert!(error
        .to_string()
        .contains("requires exactly one RepeatEncounter"));
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
        constraints: vec![repeat_constraint()],
        solver: solver4_config(),
    };
    let engine = SearchEngine::new(&input.solver);
    let result = engine.solve(&input).unwrap();
    assert_eq!(result.stop_reason, Some(StopReason::OptimalScoreReached));
}

#[test]
fn solver4_complete_backtracking_solves_small_instance() {
    let mut config = solver4_config();
    config.solver_params = SolverParams::Solver4(Solver4Params {
        mode: Solver4Mode::CompleteBacktracking,
        gamma: 0.0,
        backtracking_pattern: Some("2".into()),
        diagnostics: Solver4DiagnosticsParams::default(),
    });
    let input = ApiInput {
        problem: pure_problem(2, 2, 2),
        initial_schedule: None,
        construction_seed_schedule: None,
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".into(),
            weight: 1.0,
        }],
        constraints: vec![repeat_constraint()],
        solver: config,
    };
    let engine = SearchEngine::new(&input.solver);
    let result = engine.solve(&input).unwrap();
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
        constraints: vec![repeat_constraint()],
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
    assert_eq!(canonical.repetition_penalty, 1);
    assert_eq!(canonical.weighted_repetition_penalty, 10.0);
    assert_eq!(canonical.weighted_constraint_penalty, 0.0);
    assert_eq!(canonical.total_score, 10.0);
}

#[test]
fn canonical_scoring_gives_zero_for_perfect_meet_at_most_once_schedule() {
    let input = ApiInput {
        problem: pure_problem(1, 2, 1),
        initial_schedule: None,
        construction_seed_schedule: None,
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".into(),
            weight: 1.0,
        }],
        constraints: vec![repeat_constraint()],
        solver: solver4_config(),
    };

    let schedule = HashMap::from([(
        "session_0".to_string(),
        HashMap::from([("g0".to_string(), vec!["p0".to_string(), "p1".to_string()])]),
    )]);

    let canonical = canonical_score_for_schedule(&input, &schedule).unwrap();
    assert_eq!(canonical.unique_contacts, 1);
    assert_eq!(canonical.repetition_penalty, 0);
    assert_eq!(canonical.weighted_repetition_penalty, 0.0);
    assert_eq!(canonical.total_score, 0.0);
}

#[test]
fn backtracking_pattern_rejects_invalid_sum() {
    let error = BacktrackingPattern::parse(4, "3").unwrap_err();
    assert!(error.to_string().contains("must sum to the group size 4"));
}

#[test]
fn default_backtracking_pattern_matches_pair_then_single_shape() {
    assert_eq!(default_backtracking_pattern(4), vec![2, 2]);
    assert_eq!(default_backtracking_pattern(5), vec![2, 2, 1]);
    assert_eq!(default_backtracking_pattern(3), vec![2, 1]);
}

#[test]
fn freedom_of_set_matches_paper_intersection_semantics() {
    let mut partnered = vec![vec![false; 5]; 5];
    partnered[0][2] = true;
    partnered[2][0] = true;
    partnered[1][3] = true;
    partnered[3][1] = true;

    let freedom = freedom_of_set(&[0, 1], &partnered);

    assert_eq!(freedom, 1);
}

#[test]
fn chunk_candidates_are_sorted_by_minimal_freedom_then_lexicographic() {
    let mut partnered = vec![vec![false; 4]; 4];
    partnered[0][2] = true;
    partnered[2][0] = true;
    let candidates = ordered_chunk_candidates(&[0, 1, 2, 3], &[], 2, &partnered);
    let freedoms: Vec<_> = candidates
        .iter()
        .map(|candidate| candidate.freedom)
        .collect();
    assert_eq!(freedoms, vec![1, 1, 1, 1, 2]);
    assert_eq!(candidates[0].members, vec![0, 1]);
    assert_eq!(candidates[1].members, vec![0, 3]);
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
    let partnered = vec![vec![false; 4]; 4];
    let penalties = vec![vec![0usize; 4]; 4];
    let mut rng = ChaCha12Rng::seed_from_u64(1);

    let chosen = choose_best_pair(&remaining, &partnered, &penalties, 0.0, &mut rng);

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

    assert_eq!(
        schedule,
        vec![vec![vec![0, 1], vec![2, 3]], vec![vec![0, 2], vec![1, 3]]]
    );
}

#[test]
fn greedy_initializer_trace_locks_even_group_pair_sequence_and_scores() {
    let problem = sample_problem(2, 2, 2);
    let mut rng = ChaCha12Rng::seed_from_u64(0);

    let (schedule, trace) = build_greedy_initial_schedule_with_trace(&problem, 0.0, &mut rng);

    assert_eq!(
        schedule,
        vec![vec![vec![0, 1], vec![2, 3]], vec![vec![0, 2], vec![1, 3]]]
    );
    assert_eq!(
        trace
            .pair_steps
            .iter()
            .map(|step| (step.week, step.group, step.pair_index, step.chosen.pair()))
            .collect::<Vec<_>>(),
        vec![
            (0, 0, 0, (0, 1)),
            (0, 1, 0, (2, 3)),
            (1, 0, 0, (0, 2)),
            (1, 1, 0, (1, 3)),
        ]
    );

    assert_eq!(
        trace.pair_steps[0].scored_candidates,
        vec![
            PairCandidateScore {
                left: 0,
                right: 1,
                raw_freedom: 2,
                repeat_penalty_count: 0,
                adjusted_freedom: 2,
            },
            PairCandidateScore {
                left: 0,
                right: 2,
                raw_freedom: 2,
                repeat_penalty_count: 0,
                adjusted_freedom: 2,
            },
            PairCandidateScore {
                left: 0,
                right: 3,
                raw_freedom: 2,
                repeat_penalty_count: 0,
                adjusted_freedom: 2,
            },
            PairCandidateScore {
                left: 1,
                right: 2,
                raw_freedom: 2,
                repeat_penalty_count: 0,
                adjusted_freedom: 2,
            },
            PairCandidateScore {
                left: 1,
                right: 3,
                raw_freedom: 2,
                repeat_penalty_count: 0,
                adjusted_freedom: 2,
            },
            PairCandidateScore {
                left: 2,
                right: 3,
                raw_freedom: 2,
                repeat_penalty_count: 0,
                adjusted_freedom: 2,
            },
        ]
    );
    assert_eq!(
        trace.pair_steps[2].scored_candidates,
        vec![
            PairCandidateScore {
                left: 0,
                right: 2,
                raw_freedom: 0,
                repeat_penalty_count: 0,
                adjusted_freedom: 0,
            },
            PairCandidateScore {
                left: 0,
                right: 3,
                raw_freedom: 0,
                repeat_penalty_count: 0,
                adjusted_freedom: 0,
            },
            PairCandidateScore {
                left: 1,
                right: 2,
                raw_freedom: 0,
                repeat_penalty_count: 0,
                adjusted_freedom: 0,
            },
            PairCandidateScore {
                left: 1,
                right: 3,
                raw_freedom: 0,
                repeat_penalty_count: 0,
                adjusted_freedom: 0,
            },
            PairCandidateScore {
                left: 0,
                right: 1,
                raw_freedom: 2,
                repeat_penalty_count: 1,
                adjusted_freedom: -999_998,
            },
            PairCandidateScore {
                left: 2,
                right: 3,
                raw_freedom: 2,
                repeat_penalty_count: 1,
                adjusted_freedom: -999_998,
            },
        ]
    );
}

#[test]
fn greedy_initializer_trace_records_group_completion_after_pair_selection() {
    let problem = sample_problem(2, 2, 2);
    let mut rng = ChaCha12Rng::seed_from_u64(0);

    let (_, trace) = build_greedy_initial_schedule_with_trace(&problem, 0.0, &mut rng);

    assert_eq!(
        trace.group_steps,
        vec![
            GreedyGroupStep {
                week: 0,
                group: 0,
                members: vec![0, 1],
                selected_pairs: vec![(0, 1)],
                singleton: None,
                penalty_updates: vec![PairPenaltyUpdate {
                    pair: (0, 1),
                    new_penalty: 1,
                }],
                partnered_pairs_noted: vec![(0, 1)],
            },
            GreedyGroupStep {
                week: 0,
                group: 1,
                members: vec![2, 3],
                selected_pairs: vec![(2, 3)],
                singleton: None,
                penalty_updates: vec![PairPenaltyUpdate {
                    pair: (2, 3),
                    new_penalty: 1,
                }],
                partnered_pairs_noted: vec![(2, 3)],
            },
            GreedyGroupStep {
                week: 1,
                group: 0,
                members: vec![0, 2],
                selected_pairs: vec![(0, 2)],
                singleton: None,
                penalty_updates: vec![PairPenaltyUpdate {
                    pair: (0, 2),
                    new_penalty: 1,
                }],
                partnered_pairs_noted: vec![(0, 2)],
            },
            GreedyGroupStep {
                week: 1,
                group: 1,
                members: vec![1, 3],
                selected_pairs: vec![(1, 3)],
                singleton: None,
                penalty_updates: vec![PairPenaltyUpdate {
                    pair: (1, 3),
                    new_penalty: 1,
                }],
                partnered_pairs_noted: vec![(1, 3)],
            },
        ]
    );
}

#[test]
fn greedy_initializer_trace_locks_odd_group_pair_and_singleton_sequence() {
    let problem = sample_problem(1, 3, 2);
    let mut rng = ChaCha12Rng::seed_from_u64(0);

    let (schedule, trace) = build_greedy_initial_schedule_with_trace(&problem, 0.0, &mut rng);

    assert_eq!(schedule, vec![vec![vec![0, 1, 2]], vec![vec![0, 2, 1]]]);
    assert_eq!(
        trace
            .pair_steps
            .iter()
            .map(|step| (step.week, step.group, step.pair_index, step.chosen.pair()))
            .collect::<Vec<_>>(),
        vec![(0, 0, 0, (0, 1)), (1, 0, 0, (0, 2))]
    );
    assert_eq!(
        trace
            .singleton_steps
            .iter()
            .map(|step| (
                step.week,
                step.group,
                step.remaining_before.clone(),
                step.chosen
            ))
            .collect::<Vec<_>>(),
        vec![(0, 0, vec![2], 2), (1, 0, vec![1], 1)]
    );
    assert_eq!(
        trace.group_steps,
        vec![
            GreedyGroupStep {
                week: 0,
                group: 0,
                members: vec![0, 1, 2],
                selected_pairs: vec![(0, 1)],
                singleton: Some(2),
                penalty_updates: vec![PairPenaltyUpdate {
                    pair: (0, 1),
                    new_penalty: 1,
                }],
                partnered_pairs_noted: vec![(0, 1), (0, 2), (1, 2)],
            },
            GreedyGroupStep {
                week: 1,
                group: 0,
                members: vec![0, 2, 1],
                selected_pairs: vec![(0, 2)],
                singleton: Some(1),
                penalty_updates: vec![PairPenaltyUpdate {
                    pair: (0, 2),
                    new_penalty: 1,
                }],
                partnered_pairs_noted: vec![(0, 2), (0, 1), (2, 1)],
            },
        ]
    );
    assert_eq!(
        trace.pair_steps[1].scored_candidates,
        vec![
            PairCandidateScore {
                left: 0,
                right: 2,
                raw_freedom: 0,
                repeat_penalty_count: 0,
                adjusted_freedom: 0,
            },
            PairCandidateScore {
                left: 1,
                right: 2,
                raw_freedom: 0,
                repeat_penalty_count: 0,
                adjusted_freedom: 0,
            },
            PairCandidateScore {
                left: 0,
                right: 1,
                raw_freedom: 0,
                repeat_penalty_count: 1,
                adjusted_freedom: -1_000_000,
            },
        ]
    );
}

#[test]
fn greedy_initializer_uses_full_group_selection_for_size_four() {
    let problem = sample_problem(2, 4, 1);
    let mut rng = ChaCha12Rng::seed_from_u64(0);

    let (schedule, trace) = build_greedy_initial_schedule_with_trace(&problem, 0.0, &mut rng);

    assert_eq!(schedule, vec![vec![vec![0, 1, 2, 3], vec![4, 5, 6, 7]]]);
    assert!(trace.pair_steps.is_empty());
    assert!(trace.singleton_steps.is_empty());
    assert_eq!(
        trace.group_steps,
        vec![
            GreedyGroupStep {
                week: 0,
                group: 0,
                members: vec![0, 1, 2, 3],
                selected_pairs: vec![(0, 1), (0, 2), (0, 3), (1, 2), (1, 3), (2, 3)],
                singleton: None,
                penalty_updates: vec![
                    PairPenaltyUpdate {
                        pair: (0, 1),
                        new_penalty: 1
                    },
                    PairPenaltyUpdate {
                        pair: (0, 2),
                        new_penalty: 1
                    },
                    PairPenaltyUpdate {
                        pair: (0, 3),
                        new_penalty: 1
                    },
                    PairPenaltyUpdate {
                        pair: (1, 2),
                        new_penalty: 1
                    },
                    PairPenaltyUpdate {
                        pair: (1, 3),
                        new_penalty: 1
                    },
                    PairPenaltyUpdate {
                        pair: (2, 3),
                        new_penalty: 1
                    },
                ],
                partnered_pairs_noted: vec![(0, 1), (0, 2), (0, 3), (1, 2), (1, 3), (2, 3)],
            },
            GreedyGroupStep {
                week: 0,
                group: 1,
                members: vec![4, 5, 6, 7],
                selected_pairs: vec![(4, 5), (4, 6), (4, 7), (5, 6), (5, 7), (6, 7)],
                singleton: None,
                penalty_updates: vec![
                    PairPenaltyUpdate {
                        pair: (4, 5),
                        new_penalty: 1
                    },
                    PairPenaltyUpdate {
                        pair: (4, 6),
                        new_penalty: 1
                    },
                    PairPenaltyUpdate {
                        pair: (4, 7),
                        new_penalty: 1
                    },
                    PairPenaltyUpdate {
                        pair: (5, 6),
                        new_penalty: 1
                    },
                    PairPenaltyUpdate {
                        pair: (5, 7),
                        new_penalty: 1
                    },
                    PairPenaltyUpdate {
                        pair: (6, 7),
                        new_penalty: 1
                    },
                ],
                partnered_pairs_noted: vec![(4, 5), (4, 6), (4, 7), (5, 6), (5, 7), (6, 7)],
            },
        ]
    );
}

#[test]
fn note_group_partnerships_marks_full_group_pairwise_history() {
    let mut partnered = vec![vec![false; 4]; 4];

    note_group_partnerships(&[0, 1, 2], &mut partnered);

    assert!(partnered[0][1]);
    assert!(partnered[1][0]);
    assert!(partnered[0][2]);
    assert!(partnered[2][0]);
    assert!(partnered[1][2]);
    assert!(partnered[2][1]);
    assert!(!partnered[0][3]);
}
