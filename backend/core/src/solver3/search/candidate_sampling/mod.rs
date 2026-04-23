mod clique_swap;
mod dispatch;
mod eligibility;
mod swap;
mod transfer;
mod types;

#[cfg(any(
    test,
    feature = "solver3-experimental-repeat-guidance",
    feature = "solver3-experimental-conflict-restricted-sampling"
))]
use eligibility::is_runtime_swappable_person;
use eligibility::{
    runtime_active_clique_in_single_group, runtime_pick_clique_targets,
    runtime_pick_swappable_person_from_group, runtime_session_can_clique_swap,
    runtime_session_can_swap, runtime_session_can_transfer, runtime_transfer_source_group,
    runtime_transfer_target_has_capacity,
};
#[cfg(test)]
pub(crate) use types::CandidateSelectionTimingBreakdown;
#[cfg(test)]
use types::FamilyPreviewTimingBreakdown;
use types::{
    get_current_time, get_elapsed_seconds_between, GuidedSwapSamplingPreviewResult,
    MAX_RANDOM_CANDIDATE_ATTEMPTS, MAX_RANDOM_TARGET_ATTEMPTS,
};
pub(crate) use types::{
    CandidateSampler, CandidateSelectionResult, RepeatGuidedSwapSamplingDelta, SearchMovePreview,
    SwapSamplingOptions, TabuSwapSamplingDelta,
};

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use rand::SeedableRng;
    use rand_chacha::ChaCha12Rng;

    use crate::models::{
        ApiInput, Constraint, Group, ImmovablePersonParams, Objective, Person, ProblemDefinition,
        Solver3Params, SolverConfiguration, SolverParams, StopConditions,
    };

    use super::super::super::runtime_state::RuntimeState;
    use super::super::family_selection::MoveFamilySelector;
    #[cfg(feature = "solver3-experimental-repeat-guidance")]
    use super::super::repeat_guidance::RepeatGuidanceState;
    #[cfg(feature = "solver3-experimental-conflict-restricted-sampling")]
    use super::super::sgp_conflicts::SgpConflictState;
    use super::super::tabu::{SgpWeekPairTabuConfig, SgpWeekPairTabuState};
    #[cfg(any(
        feature = "solver3-experimental-repeat-guidance",
        feature = "solver3-experimental-conflict-restricted-sampling"
    ))]
    use super::SearchMovePreview;
    use super::{CandidateSampler, SwapSamplingOptions};

    fn solver3_config() -> SolverConfiguration {
        SolverConfiguration {
            solver_type: "solver3".to_string(),
            stop_conditions: StopConditions {
                max_iterations: None,
                time_limit_seconds: None,
                no_improvement_iterations: None,
                stop_on_optimal_score: true,
            },
            solver_params: SolverParams::Solver3(Solver3Params::default()),
            logging: Default::default(),
            telemetry: Default::default(),
            seed: Some(7),
            move_policy: None,
            allowed_sessions: None,
        }
    }

    fn simple_runtime_state() -> RuntimeState {
        let input = ApiInput {
            problem: ProblemDefinition {
                people: (0..4)
                    .map(|i| Person {
                        id: format!("p{}", i),
                        attributes: HashMap::new(),
                        sessions: None,
                    })
                    .collect(),
                groups: vec![
                    Group {
                        id: "g0".into(),
                        size: 2,
                        session_sizes: None,
                    },
                    Group {
                        id: "g1".into(),
                        size: 2,
                        session_sizes: None,
                    },
                ],
                num_sessions: 1,
            },
            initial_schedule: None,
            construction_seed_schedule: None,
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".into(),
                weight: 1.0,
            }],
            constraints: vec![],
            solver: solver3_config(),
        };
        RuntimeState::from_input(&input).unwrap()
    }

    fn repeated_pair_runtime_state() -> RuntimeState {
        let input = ApiInput {
            problem: ProblemDefinition {
                people: (0..4)
                    .map(|i| Person {
                        id: format!("p{}", i),
                        attributes: HashMap::new(),
                        sessions: None,
                    })
                    .collect(),
                groups: vec![
                    Group {
                        id: "g0".into(),
                        size: 2,
                        session_sizes: None,
                    },
                    Group {
                        id: "g1".into(),
                        size: 2,
                        session_sizes: None,
                    },
                ],
                num_sessions: 2,
            },
            initial_schedule: Some(HashMap::from([
                (
                    "session_0".to_string(),
                    HashMap::from([
                        ("g0".to_string(), vec!["p0".to_string(), "p1".to_string()]),
                        ("g1".to_string(), vec!["p2".to_string(), "p3".to_string()]),
                    ]),
                ),
                (
                    "session_1".to_string(),
                    HashMap::from([
                        ("g0".to_string(), vec!["p0".to_string(), "p1".to_string()]),
                        ("g1".to_string(), vec!["p2".to_string(), "p3".to_string()]),
                    ]),
                ),
            ])),
            construction_seed_schedule: None,
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".into(),
                weight: 1.0,
            }],
            constraints: vec![crate::models::Constraint::RepeatEncounter(
                crate::models::RepeatEncounterParams {
                    max_allowed_encounters: 1,
                    penalty_function: "linear".into(),
                    penalty_weight: 100.0,
                },
            )],
            solver: solver3_config(),
        };
        RuntimeState::from_input(&input).unwrap()
    }

    fn restricted_swap_runtime_state() -> RuntimeState {
        let input = ApiInput {
            problem: ProblemDefinition {
                people: (0..5)
                    .map(|i| Person {
                        id: format!("p{}", i),
                        attributes: HashMap::new(),
                        sessions: None,
                    })
                    .collect(),
                groups: vec![
                    Group {
                        id: "g0".into(),
                        size: 3,
                        session_sizes: None,
                    },
                    Group {
                        id: "g1".into(),
                        size: 2,
                        session_sizes: None,
                    },
                ],
                num_sessions: 1,
            },
            initial_schedule: Some(HashMap::from([(
                "session_0".to_string(),
                HashMap::from([
                    (
                        "g0".to_string(),
                        vec!["p0".to_string(), "p1".to_string(), "p2".to_string()],
                    ),
                    ("g1".to_string(), vec!["p3".to_string(), "p4".to_string()]),
                ]),
            )])),
            construction_seed_schedule: None,
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".into(),
                weight: 1.0,
            }],
            constraints: vec![
                Constraint::MustStayTogether {
                    people: vec!["p0".into(), "p1".into()],
                    sessions: Some(vec![0]),
                },
                Constraint::ImmovablePerson(ImmovablePersonParams {
                    person_id: "p4".into(),
                    group_id: "g1".into(),
                    sessions: Some(vec![0]),
                }),
            ],
            solver: solver3_config(),
        };

        RuntimeState::from_input(&input).unwrap()
    }

    fn repeat_constrained_non_conflicting_state() -> RuntimeState {
        let input = ApiInput {
            problem: ProblemDefinition {
                people: (0..4)
                    .map(|i| Person {
                        id: format!("p{}", i),
                        attributes: HashMap::new(),
                        sessions: None,
                    })
                    .collect(),
                groups: vec![
                    Group {
                        id: "g0".into(),
                        size: 2,
                        session_sizes: None,
                    },
                    Group {
                        id: "g1".into(),
                        size: 2,
                        session_sizes: None,
                    },
                ],
                num_sessions: 2,
            },
            initial_schedule: Some(HashMap::from([
                (
                    "session_0".to_string(),
                    HashMap::from([
                        ("g0".to_string(), vec!["p0".to_string(), "p1".to_string()]),
                        ("g1".to_string(), vec!["p2".to_string(), "p3".to_string()]),
                    ]),
                ),
                (
                    "session_1".to_string(),
                    HashMap::from([
                        ("g0".to_string(), vec!["p0".to_string(), "p2".to_string()]),
                        ("g1".to_string(), vec!["p1".to_string(), "p3".to_string()]),
                    ]),
                ),
            ])),
            construction_seed_schedule: None,
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".into(),
                weight: 1.0,
            }],
            constraints: vec![crate::models::Constraint::RepeatEncounter(
                crate::models::RepeatEncounterParams {
                    max_allowed_encounters: 1,
                    penalty_function: "linear".into(),
                    penalty_weight: 100.0,
                },
            )],
            solver: solver3_config(),
        };
        RuntimeState::from_input(&input).unwrap()
    }

    fn tabu_config() -> SgpWeekPairTabuConfig {
        SgpWeekPairTabuConfig {
            tenure_mode: crate::models::Solver3SgpWeekPairTabuTenureMode::FixedInterval,
            tenure_min: 10,
            tenure_max: 10,
            retry_cap: 4,
            aspiration_enabled: true,
            session_scale_reference_participants: 32,
            reactive_no_improvement_window: 100_000,
            reactive_max_multiplier: 4,
            conflict_restricted_swap_sampling_enabled: false,
        }
    }

    #[test]
    fn sampler_returns_none_when_no_sessions_allowed() {
        let state = simple_runtime_state();
        let selector = MoveFamilySelector::new(&Default::default());
        let mut rng = ChaCha12Rng::seed_from_u64(7);
        let sampler = CandidateSampler;
        assert!(sampler
            .select_previewed_move(
                &state,
                &selector,
                &[],
                SwapSamplingOptions::default(),
                &mut rng
            )
            .selection
            .is_none());
    }

    #[test]
    fn sampler_can_find_a_swap_preview_on_simple_state() {
        let state = simple_runtime_state();
        let selector = MoveFamilySelector::new(&Default::default());
        let mut rng = ChaCha12Rng::seed_from_u64(7);
        let sampler = CandidateSampler;
        let sampled = sampler.select_previewed_move(
            &state,
            &selector,
            &[0],
            SwapSamplingOptions::default(),
            &mut rng,
        );
        assert!(sampled.selection.is_some());
    }

    #[test]
    fn default_sampler_can_find_a_swap_preview_on_simple_state() {
        let state = simple_runtime_state();
        let selector = MoveFamilySelector::new(&Default::default());
        let mut rng = ChaCha12Rng::seed_from_u64(7);
        let sampler = CandidateSampler;
        let sampled = sampler.select_previewed_move_default(&state, &selector, &[0], &mut rng);
        assert!(sampled.is_some());
    }

    #[test]
    fn swap_eligibility_filters_immovable_and_clique_locked_people() {
        let state = restricted_swap_runtime_state();
        let cp = &state.compiled;

        assert!(!super::is_runtime_swappable_person(
            &state,
            0,
            cp.person_id_to_idx["p0"]
        ));
        assert!(!super::is_runtime_swappable_person(
            &state,
            0,
            cp.person_id_to_idx["p1"]
        ));
        assert!(super::is_runtime_swappable_person(
            &state,
            0,
            cp.person_id_to_idx["p2"]
        ));
        assert!(super::is_runtime_swappable_person(
            &state,
            0,
            cp.person_id_to_idx["p3"]
        ));
        assert!(!super::is_runtime_swappable_person(
            &state,
            0,
            cp.person_id_to_idx["p4"]
        ));
        assert!(super::runtime_session_can_swap(&state, 0));
    }

    #[test]
    fn random_swap_sampler_only_selects_swappable_endpoints() {
        let state = restricted_swap_runtime_state();
        let cp = &state.compiled;
        let mut rng = ChaCha12Rng::seed_from_u64(7);
        let sampler = CandidateSampler;
        let preview = sampler
            .sample_random_swap_preview_in_session(
                &state,
                0,
                SwapSamplingOptions::default(),
                &mut Default::default(),
                &mut rng,
            )
            .expect("swap preview should exist for the two remaining swappable people");

        let mut sampled = [
            preview.analysis.swap.left_person_idx,
            preview.analysis.swap.right_person_idx,
        ];
        sampled.sort_unstable();
        let mut expected = [cp.person_id_to_idx["p2"], cp.person_id_to_idx["p3"]];
        expected.sort_unstable();
        assert_eq!(sampled, expected);
    }

    #[test]
    fn random_swap_sampler_returns_none_when_all_proposals_are_tabu() {
        let state = repeated_pair_runtime_state();
        let selector = MoveFamilySelector::new(&crate::models::MovePolicy {
            forced_family: Some(crate::models::MoveFamily::Swap),
            ..Default::default()
        });
        let mut tabu = SgpWeekPairTabuState::new(&state.compiled, tabu_config());
        let mut tabu_rng = ChaCha12Rng::seed_from_u64(13);
        for &(left, right) in &[(0, 2), (0, 3), (1, 2), (1, 3)] {
            tabu.record_swap(&state.compiled, 0, left, right, 0, 0, &mut tabu_rng);
        }

        let mut rng = ChaCha12Rng::seed_from_u64(7);
        let sampler = CandidateSampler;
        let sampled = sampler.select_previewed_move(
            &state,
            &selector,
            &[0],
            SwapSamplingOptions {
                tabu: Some(&tabu),
                tabu_retry_cap: 4,
                current_iteration: 0,
                ..Default::default()
            },
            &mut rng,
        );

        assert!(sampled.selection.is_none());
        assert_eq!(sampled.tabu_swap_sampling.prefilter_skips, 4);
        assert_eq!(sampled.tabu_swap_sampling.raw_tabu_hits, 4);
        assert_eq!(sampled.tabu_swap_sampling.retry_exhaustions, 1);
        assert_eq!(sampled.tabu_swap_sampling.hard_blocks, 1);
        assert_eq!(sampled.tabu_swap_sampling.aspiration_preview_surfaces, 0);
    }

    #[cfg(feature = "solver3-experimental-repeat-guidance")]
    #[test]
    fn repeat_guided_sampler_honors_allowed_sessions() {
        let state = repeated_pair_runtime_state();
        let guidance = RepeatGuidanceState::build_from_state(&state).unwrap();
        let selector = MoveFamilySelector::new(&crate::models::MovePolicy {
            forced_family: Some(crate::models::MoveFamily::Swap),
            ..Default::default()
        });
        let mut rng = ChaCha12Rng::seed_from_u64(7);
        let sampler = CandidateSampler;

        let (_family, preview, _seconds) = sampler
            .select_previewed_move(
                &state,
                &selector,
                &[1],
                SwapSamplingOptions {
                    repeat_guidance: Some(&guidance),
                    repeat_guided_swap_probability: 1.0,
                    repeat_guided_swap_candidate_preview_budget: 8,
                    ..Default::default()
                },
                &mut rng,
            )
            .selection
            .expect("guided swap preview should be sampled");

        assert_eq!(preview.session_idx(), 1);
    }

    #[cfg(feature = "solver3-experimental-repeat-guidance")]
    #[test]
    fn repeat_guided_sampler_falls_back_to_random_without_guidance() {
        let state = simple_runtime_state();
        let selector = MoveFamilySelector::new(&crate::models::MovePolicy {
            forced_family: Some(crate::models::MoveFamily::Swap),
            ..Default::default()
        });
        let mut rng = ChaCha12Rng::seed_from_u64(7);
        let sampler = CandidateSampler;

        let sampled = sampler.select_previewed_move(
            &state,
            &selector,
            &[0],
            SwapSamplingOptions {
                repeat_guidance: None,
                repeat_guided_swap_probability: 1.0,
                repeat_guided_swap_candidate_preview_budget: 8,
                ..Default::default()
            },
            &mut rng,
        );

        assert!(sampled.selection.is_some());
        assert_eq!(sampled.repeat_guided_swap_sampling.guided_attempts, 0);
        assert_eq!(sampled.repeat_guided_swap_sampling.guided_successes, 0);
        assert_eq!(
            sampled
                .repeat_guided_swap_sampling
                .guided_previewed_candidates,
            0
        );
    }

    #[cfg(feature = "solver3-experimental-repeat-guidance")]
    #[test]
    fn repeat_guided_sampler_centers_swap_on_active_offender_pair() {
        let state = repeated_pair_runtime_state();
        let guidance = RepeatGuidanceState::build_from_state(&state).unwrap();
        let selector = MoveFamilySelector::new(&crate::models::MovePolicy {
            forced_family: Some(crate::models::MoveFamily::Swap),
            ..Default::default()
        });
        let mut rng = ChaCha12Rng::seed_from_u64(3);
        let sampler = CandidateSampler;

        let (_family, preview, _seconds) = sampler
            .select_previewed_move(
                &state,
                &selector,
                &[0, 1],
                SwapSamplingOptions {
                    repeat_guidance: Some(&guidance),
                    repeat_guided_swap_probability: 1.0,
                    repeat_guided_swap_candidate_preview_budget: 8,
                    ..Default::default()
                },
                &mut rng,
            )
            .selection
            .expect("guided swap preview should be sampled");

        match preview {
            SearchMovePreview::Swap(preview) => {
                let swap = preview.analysis.swap;
                assert!(
                    swap.left_person_idx == 0
                        || swap.left_person_idx == 1
                        || swap.right_person_idx == 0
                        || swap.right_person_idx == 1,
                    "guided swap should involve one offender endpoint: {:?}",
                    swap
                );
            }
            other => panic!("expected swap preview, got {other:?}"),
        }
    }

    #[cfg(feature = "solver3-experimental-repeat-guidance")]
    #[test]
    fn guided_swap_sampler_returns_none_when_guided_and_random_proposals_are_tabu() {
        let state = repeated_pair_runtime_state();
        let guidance = RepeatGuidanceState::build_from_state(&state).unwrap();
        let selector = MoveFamilySelector::new(&crate::models::MovePolicy {
            forced_family: Some(crate::models::MoveFamily::Swap),
            ..Default::default()
        });
        let mut tabu = SgpWeekPairTabuState::new(&state.compiled, tabu_config());
        let mut tabu_rng = ChaCha12Rng::seed_from_u64(17);
        for session_idx in [0usize, 1usize] {
            for &(left, right) in &[(0, 2), (0, 3), (1, 2), (1, 3)] {
                tabu.record_swap(
                    &state.compiled,
                    session_idx,
                    left,
                    right,
                    0,
                    0,
                    &mut tabu_rng,
                );
            }
        }

        let mut rng = ChaCha12Rng::seed_from_u64(3);
        let sampler = CandidateSampler;
        let sampled = sampler.select_previewed_move(
            &state,
            &selector,
            &[0, 1],
            SwapSamplingOptions {
                repeat_guidance: Some(&guidance),
                repeat_guided_swap_probability: 1.0,
                repeat_guided_swap_candidate_preview_budget: 8,
                tabu: Some(&tabu),
                tabu_retry_cap: 4,
                tabu_allow_aspiration_preview: false,
                current_iteration: 0,
                ..Default::default()
            },
            &mut rng,
        );

        assert!(sampled.selection.is_none());
    }

    #[cfg(feature = "solver3-experimental-conflict-restricted-sampling")]
    #[test]
    fn conflict_restricted_sampler_keeps_swap_endpoint_inside_conflict_position() {
        let state = repeated_pair_runtime_state();
        let conflicts = SgpConflictState::build_from_state(&state, &[0, 1]).unwrap();
        let selector = MoveFamilySelector::new(&crate::models::MovePolicy {
            forced_family: Some(crate::models::MoveFamily::Swap),
            ..Default::default()
        });
        let mut rng = ChaCha12Rng::seed_from_u64(5);
        let sampler = CandidateSampler;

        let (_family, preview, _seconds) = sampler
            .select_previewed_move(
                &state,
                &selector,
                &[0, 1],
                SwapSamplingOptions {
                    sgp_conflicts: Some(&conflicts),
                    ..Default::default()
                },
                &mut rng,
            )
            .selection
            .expect("conflict-restricted swap preview should be sampled");

        match preview {
            SearchMovePreview::Swap(preview) => {
                let swap = preview.analysis.swap;
                let conflicted_people = conflicts.conflicted_people_in_session(swap.session_idx);
                assert!(
                    conflicted_people.contains(&swap.left_person_idx)
                        || conflicted_people.contains(&swap.right_person_idx),
                    "conflict-restricted swap should touch a conflict position: {:?}",
                    swap
                );
            }
            other => panic!("expected swap preview, got {other:?}"),
        }
    }

    #[cfg(feature = "solver3-experimental-conflict-restricted-sampling")]
    #[test]
    fn conflict_restricted_sampler_falls_back_to_random_when_no_conflicts_exist() {
        let state = repeat_constrained_non_conflicting_state();
        let conflicts = SgpConflictState::build_from_state(&state, &[0]).unwrap();
        let selector = MoveFamilySelector::new(&crate::models::MovePolicy {
            forced_family: Some(crate::models::MoveFamily::Swap),
            ..Default::default()
        });
        let mut rng = ChaCha12Rng::seed_from_u64(7);
        let sampler = CandidateSampler;

        let sampled = sampler.select_previewed_move(
            &state,
            &selector,
            &[0],
            SwapSamplingOptions {
                sgp_conflicts: Some(&conflicts),
                ..Default::default()
            },
            &mut rng,
        );

        assert!(sampled.selection.is_some());
    }

    #[test]
    fn tabu_sampling_can_return_preview_for_aspiration_check_after_retry_cap() {
        let state = repeated_pair_runtime_state();
        let selector = MoveFamilySelector::new(&crate::models::MovePolicy {
            forced_family: Some(crate::models::MoveFamily::Swap),
            ..Default::default()
        });
        let mut tabu = SgpWeekPairTabuState::new(&state.compiled, tabu_config());
        let mut tabu_rng = ChaCha12Rng::seed_from_u64(21);
        for &(left, right) in &[(0, 2), (0, 3), (1, 2), (1, 3)] {
            tabu.record_swap(&state.compiled, 0, left, right, 0, 0, &mut tabu_rng);
        }

        let mut rng = ChaCha12Rng::seed_from_u64(7);
        let sampler = CandidateSampler;
        let sampled = sampler.select_previewed_move(
            &state,
            &selector,
            &[0],
            SwapSamplingOptions {
                tabu: Some(&tabu),
                tabu_retry_cap: 4,
                tabu_allow_aspiration_preview: true,
                current_iteration: 0,
                ..Default::default()
            },
            &mut rng,
        );

        assert!(sampled.selection.is_some());
        assert_eq!(sampled.tabu_swap_sampling.prefilter_skips, 4);
        assert_eq!(sampled.tabu_swap_sampling.retry_exhaustions, 1);
        assert_eq!(sampled.tabu_swap_sampling.hard_blocks, 0);
        assert_eq!(sampled.tabu_swap_sampling.aspiration_preview_surfaces, 1);
    }
}
