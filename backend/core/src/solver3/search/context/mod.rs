mod config;
mod policy_memory;
mod progress;
mod validation;

#[cfg(feature = "solver3-experimental-memetic")]
pub(crate) use config::SteadyStateMemeticConfig;
#[cfg(feature = "solver3-experimental-recombination")]
pub(crate) use config::{
    AdaptiveRawChildRetentionConfig, DonorSessionTransplantConfig,
    MultiRootBalancedSessionInheritanceConfig, SessionAlignedPathRelinkingConfig,
};
pub(crate) use config::{RuntimeScaledNoImprovementStopConfig, SearchRunContext};
pub(crate) use policy_memory::{IteratedLocalSearchMemory, SearchPolicyMemory};
pub(crate) use progress::SearchProgressState;

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use crate::models::{
        ApiInput, Constraint, Group, Objective, Person, ProblemDefinition, RepeatEncounterParams,
        Solver3CorrectnessLaneParams, Solver3DonorSessionTransplantParams,
        Solver3HotspotGuidanceParams, Solver3LocalImproverMode, Solver3LocalImproverParams,
        Solver3MultiRootBalancedSessionInheritanceParams, Solver3Params,
        Solver3PathRelinkingOperatorVariant, Solver3RepeatGuidedSwapParams,
        Solver3SearchDriverMode, Solver3SearchDriverParams,
        Solver3SessionAlignedPathRelinkingParams, Solver3SgpWeekPairTabuParams,
        Solver3SgpWeekPairTabuTenureMode, SolverConfiguration, SolverParams, StopConditions,
    };

    use super::{SearchProgressState, SearchRunContext};
    use crate::solver3::runtime_state::RuntimeState;

    fn solver3_config() -> SolverConfiguration {
        SolverConfiguration {
            solver_type: "solver3".to_string(),
            stop_conditions: StopConditions {
                max_iterations: Some(123),
                time_limit_seconds: Some(9),
                no_improvement_iterations: Some(17),
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

    fn simple_state() -> RuntimeState {
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

    fn repeat_state() -> RuntimeState {
        let mut input = ApiInput {
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
            initial_schedule: None,
            construction_seed_schedule: None,
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".into(),
                weight: 1.0,
            }],
            constraints: vec![],
            solver: solver3_config(),
        };
        input.constraints = vec![Constraint::RepeatEncounter(RepeatEncounterParams {
            max_allowed_encounters: 1,
            penalty_function: "linear".into(),
            penalty_weight: 100.0,
        })];
        RuntimeState::from_input(&input).unwrap()
    }

    #[test]
    fn run_context_captures_runtime_scaled_no_improvement_stop() {
        let state = simple_state();
        let mut config = solver3_config();
        let SolverParams::Solver3(params) = &mut config.solver_params else {
            unreachable!("test config uses solver3 params")
        };
        params
            .search_driver
            .runtime_scaled_no_improvement_stop
            .enabled = true;
        params
            .search_driver
            .runtime_scaled_no_improvement_stop
            .runtime_scale_factor = 1.5;
        params
            .search_driver
            .runtime_scaled_no_improvement_stop
            .grace_seconds = 0.25;

        let context = SearchRunContext::from_solver(&config, &state, 7).unwrap();
        let stop_config = context
            .runtime_scaled_no_improvement_stop
            .expect("runtime-scaled stop enabled");
        assert_eq!(stop_config.runtime_scale_factor, 1.5);
        assert_eq!(stop_config.grace_seconds, 0.25);
    }

    #[test]
    fn run_context_rejects_invalid_runtime_scaled_no_improvement_scale_factor() {
        let state = simple_state();
        let mut config = solver3_config();
        let SolverParams::Solver3(params) = &mut config.solver_params else {
            unreachable!("test config uses solver3 params")
        };
        params
            .search_driver
            .runtime_scaled_no_improvement_stop
            .enabled = true;
        params
            .search_driver
            .runtime_scaled_no_improvement_stop
            .runtime_scale_factor = -0.1;

        let error = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(error.to_string().contains(
            "runtime_scaled_no_improvement_stop.runtime_scale_factor must be finite and >= 0.0"
        ));
    }

    #[test]
    fn run_context_rejects_invalid_runtime_scaled_no_improvement_stop() {
        let state = simple_state();
        let mut config = solver3_config();
        let SolverParams::Solver3(params) = &mut config.solver_params else {
            unreachable!("test config uses solver3 params")
        };
        params
            .search_driver
            .runtime_scaled_no_improvement_stop
            .enabled = true;
        params
            .search_driver
            .runtime_scaled_no_improvement_stop
            .grace_seconds = -0.1;

        let error = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(error.to_string().contains(
            "runtime_scaled_no_improvement_stop.grace_seconds must be finite and >= 0.0"
        ));
    }

    #[test]
    fn run_context_captures_search_limits_and_allowed_sessions() {
        let state = simple_state();
        let context = SearchRunContext::from_solver(&solver3_config(), &state, 7).unwrap();
        assert_eq!(context.effective_seed, 7);
        assert_eq!(
            context.search_driver_mode,
            Solver3SearchDriverMode::SingleState
        );
        assert_eq!(
            context.local_improver_mode,
            Solver3LocalImproverMode::RecordToRecord
        );
        assert_eq!(context.max_iterations, 123);
        assert_eq!(context.no_improvement_limit, Some(17));
        assert_eq!(context.time_limit_seconds, Some(9.0));
        assert_eq!(context.runtime_scaled_no_improvement_stop, None);
        assert_eq!(context.allowed_sessions, vec![0, 1]);
        assert!(!context.correctness_lane_enabled);
        assert_eq!(context.correctness_sample_every_accepted_moves, 16);
        assert!(!context.repeat_guided_swaps_enabled);
        assert_eq!(context.repeat_guided_swap_probability, 0.0);
        assert_eq!(context.repeat_guided_swap_candidate_preview_budget, 0);
        assert_eq!(context.sgp_week_pair_tabu.as_ref().unwrap().tenure_min, 8);
        assert_eq!(context.sgp_week_pair_tabu.as_ref().unwrap().tenure_max, 32);
        assert_eq!(context.sgp_week_pair_tabu.as_ref().unwrap().retry_cap, 16);
        assert_eq!(
            context.sgp_week_pair_tabu.as_ref().unwrap().tenure_mode,
            Solver3SgpWeekPairTabuTenureMode::FixedInterval
        );
        assert_eq!(
            context
                .sgp_week_pair_tabu
                .as_ref()
                .unwrap()
                .session_scale_reference_participants,
            32
        );
        assert_eq!(
            context
                .sgp_week_pair_tabu
                .as_ref()
                .unwrap()
                .reactive_no_improvement_window,
            100_000
        );
        assert_eq!(
            context
                .sgp_week_pair_tabu
                .as_ref()
                .unwrap()
                .reactive_max_multiplier,
            4
        );
        assert_eq!(
            context
                .steady_state_memetic
                .as_ref()
                .unwrap()
                .population_size,
            6
        );
        assert_eq!(
            context
                .steady_state_memetic
                .as_ref()
                .unwrap()
                .child_polish_max_iterations,
            64
        );
        assert_eq!(
            context
                .donor_session_transplant
                .as_ref()
                .unwrap()
                .archive_size,
            4
        );
        assert_eq!(
            context
                .donor_session_transplant
                .as_ref()
                .unwrap()
                .recombination_no_improvement_window,
            200_000
        );
        assert_eq!(
            context
                .donor_session_transplant
                .as_ref()
                .unwrap()
                .recombination_cooldown_window,
            100_000
        );
        assert!(
            context
                .sgp_week_pair_tabu
                .as_ref()
                .unwrap()
                .aspiration_enabled
        );
    }

    #[test]
    fn run_context_rejects_zero_correctness_sample_interval() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            correctness_lane: Solver3CorrectnessLaneParams {
                enabled: false,
                sample_every_accepted_moves: 0,
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("correctness_lane.sample_every_accepted_moves"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn run_context_rejects_zero_tabu_tenure_min() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            local_improver: Solver3LocalImproverParams {
                sgp_week_pair_tabu: Solver3SgpWeekPairTabuParams {
                    tenure_min: 0,
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string().contains("sgp_week_pair_tabu.tenure_min"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn run_context_rejects_tabu_tenure_max_below_min() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            local_improver: Solver3LocalImproverParams {
                sgp_week_pair_tabu: Solver3SgpWeekPairTabuParams {
                    tenure_min: 9,
                    tenure_max: 8,
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string().contains("sgp_week_pair_tabu.tenure_max"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn run_context_rejects_zero_tabu_retry_cap() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            local_improver: Solver3LocalImproverParams {
                sgp_week_pair_tabu: Solver3SgpWeekPairTabuParams {
                    retry_cap: 0,
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string().contains("sgp_week_pair_tabu.retry_cap"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn run_context_rejects_zero_session_scale_reference_participants() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            local_improver: Solver3LocalImproverParams {
                sgp_week_pair_tabu: Solver3SgpWeekPairTabuParams {
                    session_scale_reference_participants: 0,
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("sgp_week_pair_tabu.session_scale_reference_participants"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn run_context_rejects_zero_reactive_tabu_window() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            local_improver: Solver3LocalImproverParams {
                sgp_week_pair_tabu: Solver3SgpWeekPairTabuParams {
                    reactive_no_improvement_window: 0,
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("sgp_week_pair_tabu.reactive_no_improvement_window"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn run_context_rejects_zero_reactive_tabu_max_multiplier() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            local_improver: Solver3LocalImproverParams {
                sgp_week_pair_tabu: Solver3SgpWeekPairTabuParams {
                    reactive_max_multiplier: 0,
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("sgp_week_pair_tabu.reactive_max_multiplier"),
            "unexpected error: {err}"
        );
    }

    #[cfg(feature = "solver3-experimental-memetic")]
    #[test]
    fn run_context_accepts_memetic_driver_with_record_to_record() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                mode: Solver3SearchDriverMode::SteadyStateMemetic,
                ..Default::default()
            },
            ..Default::default()
        });

        let context = SearchRunContext::from_solver(&config, &state, 7).unwrap();
        assert_eq!(
            context.search_driver_mode,
            Solver3SearchDriverMode::SteadyStateMemetic
        );
    }

    #[cfg(feature = "solver3-experimental-recombination")]
    #[test]
    fn run_context_accepts_donor_session_transplant_driver_with_record_to_record() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                mode: Solver3SearchDriverMode::DonorSessionTransplant,
                ..Default::default()
            },
            ..Default::default()
        });

        let context = SearchRunContext::from_solver(&config, &state, 7).unwrap();
        assert_eq!(
            context.search_driver_mode,
            Solver3SearchDriverMode::DonorSessionTransplant
        );
        assert_eq!(context.donor_session_transplant.unwrap().archive_size, 4);
    }

    #[cfg(feature = "solver3-experimental-recombination")]
    #[test]
    fn run_context_accepts_session_aligned_path_relinking_driver_with_record_to_record() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                mode: Solver3SearchDriverMode::SessionAlignedPathRelinking,
                ..Default::default()
            },
            ..Default::default()
        });

        let context = SearchRunContext::from_solver(&config, &state, 7).unwrap();
        assert_eq!(
            context.search_driver_mode,
            Solver3SearchDriverMode::SessionAlignedPathRelinking
        );
        let config = context.session_aligned_path_relinking.unwrap();
        assert_eq!(
            config.operator_variant,
            Solver3PathRelinkingOperatorVariant::SessionAlignedPathRelinking
        );
        assert_eq!(config.archive_size, 4);
        assert_eq!(config.max_session_imports_per_event, 3);
        assert_eq!(config.path_step_no_improvement_limit, 2);
        assert_eq!(config.min_aligned_session_distance_for_relinking, 1);
    }

    #[cfg(feature = "solver3-experimental-recombination")]
    #[test]
    fn run_context_accepts_multi_root_balanced_session_inheritance_driver() {
        let state = repeat_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                mode: Solver3SearchDriverMode::MultiRootBalancedSessionInheritance,
                ..Default::default()
            },
            ..Default::default()
        });

        let context = SearchRunContext::from_solver(&config, &state, 7).unwrap();
        assert_eq!(
            context.search_driver_mode,
            Solver3SearchDriverMode::MultiRootBalancedSessionInheritance
        );
        let config = context.multi_root_balanced_session_inheritance.unwrap();
        assert_eq!(config.root_count, 4);
        assert_eq!(config.archive_size_per_root, 2);
        assert_eq!(config.min_cross_root_session_disagreement, 1);
        assert_eq!(config.parent_a_differing_session_share, 0.5);
    }

    #[test]
    fn run_context_accepts_sgp_week_pair_tabu_local_improver_mode() {
        let state = repeat_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            local_improver: Solver3LocalImproverParams {
                mode: Solver3LocalImproverMode::SgpWeekPairTabu,
                ..Default::default()
            },
            ..Default::default()
        });

        let context = SearchRunContext::from_solver(&config, &state, 7).unwrap();
        assert_eq!(
            context.local_improver_mode,
            Solver3LocalImproverMode::SgpWeekPairTabu
        );
        assert!(context.sgp_week_pair_tabu.is_some());
        assert!(
            !context
                .sgp_week_pair_tabu
                .unwrap()
                .conflict_restricted_swap_sampling_enabled
        );
    }

    #[cfg(feature = "solver3-experimental-conflict-restricted-sampling")]
    #[test]
    fn run_context_captures_conflict_restricted_tabu_sampling_flag() {
        let state = repeat_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            local_improver: Solver3LocalImproverParams {
                mode: Solver3LocalImproverMode::SgpWeekPairTabu,
                sgp_week_pair_tabu: Solver3SgpWeekPairTabuParams {
                    conflict_restricted_swap_sampling_enabled: true,
                    ..Default::default()
                },
            },
            ..Default::default()
        });

        let context = SearchRunContext::from_solver(&config, &state, 7).unwrap();
        assert!(
            context
                .sgp_week_pair_tabu
                .unwrap()
                .conflict_restricted_swap_sampling_enabled
        );
    }

    #[cfg(not(feature = "solver3-experimental-conflict-restricted-sampling"))]
    #[test]
    fn run_context_rejects_conflict_restricted_tabu_sampling_without_feature() {
        let state = repeat_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            local_improver: Solver3LocalImproverParams {
                mode: Solver3LocalImproverMode::SgpWeekPairTabu,
                sgp_week_pair_tabu: Solver3SgpWeekPairTabuParams {
                    conflict_restricted_swap_sampling_enabled: true,
                    ..Default::default()
                },
            },
            ..Default::default()
        });

        let error = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(error
            .to_string()
            .contains("solver3-experimental-conflict-restricted-sampling"));
    }

    #[test]
    fn run_context_captures_scaled_tenure_mode() {
        let state = repeat_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            local_improver: Solver3LocalImproverParams {
                mode: Solver3LocalImproverMode::SgpWeekPairTabu,
                sgp_week_pair_tabu: Solver3SgpWeekPairTabuParams {
                    tenure_mode: Solver3SgpWeekPairTabuTenureMode::SessionParticipantScaled,
                    session_scale_reference_participants: 24,
                    ..Default::default()
                },
            },
            ..Default::default()
        });

        let context = SearchRunContext::from_solver(&config, &state, 7).unwrap();
        assert_eq!(
            context.sgp_week_pair_tabu.unwrap().tenure_mode,
            Solver3SgpWeekPairTabuTenureMode::SessionParticipantScaled
        );
    }

    #[test]
    fn run_context_captures_reactive_tenure_mode() {
        let state = repeat_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            local_improver: Solver3LocalImproverParams {
                mode: Solver3LocalImproverMode::SgpWeekPairTabu,
                sgp_week_pair_tabu: Solver3SgpWeekPairTabuParams {
                    tenure_mode: Solver3SgpWeekPairTabuTenureMode::ReactiveNoImprovementScaled,
                    reactive_no_improvement_window: 50_000,
                    reactive_max_multiplier: 5,
                    ..Default::default()
                },
            },
            ..Default::default()
        });

        let context = SearchRunContext::from_solver(&config, &state, 7).unwrap();
        let tabu = context.sgp_week_pair_tabu.unwrap();
        assert_eq!(
            tabu.tenure_mode,
            Solver3SgpWeekPairTabuTenureMode::ReactiveNoImprovementScaled
        );
        assert_eq!(tabu.reactive_no_improvement_window, 50_000);
        assert_eq!(tabu.reactive_max_multiplier, 5);
    }

    #[test]
    fn run_context_rejects_tabu_local_improver_without_repeat_constraint() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            local_improver: Solver3LocalImproverParams {
                mode: Solver3LocalImproverMode::SgpWeekPairTabu,
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("requires a repeat_encounter constraint"),
            "unexpected error: {err}"
        );
    }

    #[cfg(feature = "solver3-experimental-memetic")]
    #[test]
    fn run_context_rejects_memetic_driver_when_move_policy_disallows_swap() {
        let state = simple_state();
        let mut config = solver3_config();
        config.move_policy = Some(crate::models::MovePolicy {
            allowed_families: Some(vec![crate::models::MoveFamily::Transfer]),
            ..Default::default()
        });
        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                mode: Solver3SearchDriverMode::SteadyStateMemetic,
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("steady_state_memetic requires move_policy to allow swap"),
            "unexpected error: {err}"
        );
    }

    #[cfg(feature = "solver3-experimental-recombination")]
    #[test]
    fn run_context_rejects_zero_donor_archive_size() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                donor_session_transplant: Solver3DonorSessionTransplantParams {
                    archive_size: 0,
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("donor_session_transplant.archive_size"),
            "unexpected error: {err}"
        );
    }

    #[cfg(feature = "solver3-experimental-recombination")]
    #[test]
    fn run_context_rejects_nonpositive_donor_recombination_windows() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                donor_session_transplant: Solver3DonorSessionTransplantParams {
                    recombination_no_improvement_window: 0,
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("donor_session_transplant.recombination_no_improvement_window"),
            "unexpected error: {err}"
        );

        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                donor_session_transplant: Solver3DonorSessionTransplantParams {
                    recombination_cooldown_window: 0,
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });
        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("donor_session_transplant.recombination_cooldown_window"),
            "unexpected error: {err}"
        );
    }

    #[cfg(feature = "solver3-experimental-recombination")]
    #[test]
    fn run_context_rejects_invalid_donor_recombination_budgets() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                donor_session_transplant: Solver3DonorSessionTransplantParams {
                    max_recombination_events_per_run: Some(0),
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });
        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("donor_session_transplant.max_recombination_events_per_run"),
            "unexpected error: {err}"
        );

        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                donor_session_transplant: Solver3DonorSessionTransplantParams {
                    adaptive_raw_child_retention:
                        crate::models::Solver3AdaptiveRawChildRetentionParams {
                            keep_ratio: 0.0,
                            ..Default::default()
                        },
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });
        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("donor_session_transplant.adaptive_raw_child_retention.keep_ratio"),
            "unexpected error: {err}"
        );

        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                donor_session_transplant: Solver3DonorSessionTransplantParams {
                    adaptive_raw_child_retention:
                        crate::models::Solver3AdaptiveRawChildRetentionParams {
                            warmup_samples: 0,
                            ..Default::default()
                        },
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });
        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("donor_session_transplant.adaptive_raw_child_retention.warmup_samples"),
            "unexpected error: {err}"
        );

        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                donor_session_transplant: Solver3DonorSessionTransplantParams {
                    adaptive_raw_child_retention:
                        crate::models::Solver3AdaptiveRawChildRetentionParams {
                            warmup_samples: 4,
                            history_limit: 3,
                            ..Default::default()
                        },
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });
        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("donor_session_transplant.adaptive_raw_child_retention.history_limit"),
            "unexpected error: {err}"
        );

        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                donor_session_transplant: Solver3DonorSessionTransplantParams {
                    child_polish_iterations_per_stagnation_window: 0,
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });
        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("donor_session_transplant.child_polish_iterations_per_stagnation_window"),
            "unexpected error: {err}"
        );

        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                donor_session_transplant: Solver3DonorSessionTransplantParams {
                    child_polish_iterations_per_stagnation_window: 4,
                    child_polish_no_improvement_iterations_per_stagnation_window: 5,
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });
        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string().contains(
                "donor_session_transplant.child_polish_no_improvement_iterations_per_stagnation_window"
            ),
            "unexpected error: {err}"
        );

        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                donor_session_transplant: Solver3DonorSessionTransplantParams {
                    child_polish_max_stagnation_windows: 0,
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });
        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("donor_session_transplant.child_polish_max_stagnation_windows"),
            "unexpected error: {err}"
        );
    }

    #[cfg(feature = "solver3-experimental-recombination")]
    #[test]
    fn run_context_rejects_donor_driver_when_move_policy_disallows_swap() {
        let state = simple_state();
        let mut config = solver3_config();
        config.move_policy = Some(crate::models::MovePolicy {
            allowed_families: Some(vec![crate::models::MoveFamily::Transfer]),
            ..Default::default()
        });
        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                mode: Solver3SearchDriverMode::DonorSessionTransplant,
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("donor_session_transplant requires move_policy to allow swap"),
            "unexpected error: {err}"
        );
    }

    #[cfg(feature = "solver3-experimental-recombination")]
    #[test]
    fn run_context_rejects_invalid_session_aligned_path_relinking_config() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                session_aligned_path_relinking: Solver3SessionAlignedPathRelinkingParams {
                    max_session_imports_per_event: 0,
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });
        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("session_aligned_path_relinking.max_session_imports_per_event"),
            "unexpected error: {err}"
        );

        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                session_aligned_path_relinking: Solver3SessionAlignedPathRelinkingParams {
                    adaptive_raw_child_retention:
                        crate::models::Solver3AdaptiveRawChildRetentionParams {
                            keep_ratio: 0.0,
                            ..Default::default()
                        },
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });
        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("session_aligned_path_relinking.adaptive_raw_child_retention.keep_ratio"),
            "unexpected error: {err}"
        );
    }

    #[cfg(feature = "solver3-experimental-recombination")]
    #[test]
    fn run_context_rejects_session_aligned_path_relinking_when_move_policy_disallows_swap() {
        let state = simple_state();
        let mut config = solver3_config();
        config.move_policy = Some(crate::models::MovePolicy {
            allowed_families: Some(vec![crate::models::MoveFamily::Transfer]),
            ..Default::default()
        });
        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                mode: Solver3SearchDriverMode::SessionAlignedPathRelinking,
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("session_aligned_path_relinking requires move_policy to allow swap"),
            "unexpected error: {err}"
        );
    }

    #[cfg(feature = "solver3-experimental-recombination")]
    #[test]
    fn run_context_rejects_invalid_multi_root_balanced_session_inheritance_config() {
        let state = repeat_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                multi_root_balanced_session_inheritance:
                    Solver3MultiRootBalancedSessionInheritanceParams {
                        root_count: 1,
                        ..Default::default()
                    },
                ..Default::default()
            },
            ..Default::default()
        });
        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("multi_root_balanced_session_inheritance.root_count"),
            "unexpected error: {err}"
        );

        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                multi_root_balanced_session_inheritance:
                    Solver3MultiRootBalancedSessionInheritanceParams {
                        parent_a_differing_session_share: 0.4,
                        ..Default::default()
                    },
                ..Default::default()
            },
            ..Default::default()
        });
        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string().contains(
                "multi_root_balanced_session_inheritance.parent_a_differing_session_share"
            ),
            "unexpected error: {err}"
        );
    }

    #[cfg(feature = "solver3-experimental-recombination")]
    #[test]
    fn run_context_rejects_multi_root_balanced_session_inheritance_without_repeat_constraint() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                mode: Solver3SearchDriverMode::MultiRootBalancedSessionInheritance,
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string().contains(
                "multi_root_balanced_session_inheritance requires a repeat_encounter constraint"
            ),
            "unexpected error: {err}"
        );
    }

    #[cfg(not(feature = "solver3-oracle-checks"))]
    #[test]
    fn run_context_rejects_correctness_lane_when_feature_is_disabled() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            correctness_lane: Solver3CorrectnessLaneParams {
                enabled: true,
                sample_every_accepted_moves: 2,
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string().contains("solver3-oracle-checks"),
            "unexpected error: {err}"
        );
    }

    #[cfg(feature = "solver3-oracle-checks")]
    #[test]
    fn run_context_accepts_correctness_lane_when_feature_is_enabled() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            correctness_lane: Solver3CorrectnessLaneParams {
                enabled: true,
                sample_every_accepted_moves: 3,
            },
            ..Default::default()
        });

        let context = SearchRunContext::from_solver(&config, &state, 7).unwrap();
        assert!(context.correctness_lane_enabled);
        assert_eq!(context.correctness_sample_every_accepted_moves, 3);
    }

    #[cfg(not(feature = "solver3-experimental-memetic"))]
    #[test]
    fn run_context_rejects_memetic_driver_when_feature_is_disabled() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                mode: Solver3SearchDriverMode::SteadyStateMemetic,
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string().contains("solver3-experimental-memetic"),
            "unexpected error: {err}"
        );
    }

    #[cfg(not(feature = "solver3-experimental-recombination"))]
    #[test]
    fn run_context_rejects_recombination_driver_when_feature_is_disabled() {
        let state = repeat_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                mode: Solver3SearchDriverMode::DonorSessionTransplant,
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("solver3-experimental-recombination"),
            "unexpected error: {err}"
        );
    }

    #[cfg(not(feature = "solver3-experimental-repeat-guidance"))]
    #[test]
    fn run_context_rejects_repeat_guidance_when_feature_is_disabled() {
        let state = repeat_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            hotspot_guidance: Solver3HotspotGuidanceParams {
                repeat_guided_swaps: Solver3RepeatGuidedSwapParams {
                    enabled: true,
                    guided_proposal_probability: 0.5,
                    candidate_preview_budget: 8,
                },
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("solver3-experimental-repeat-guidance"),
            "unexpected error: {err}"
        );
    }

    #[cfg(feature = "solver3-experimental-repeat-guidance")]
    #[test]
    fn run_context_rejects_out_of_range_repeat_guidance_probability() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            hotspot_guidance: Solver3HotspotGuidanceParams {
                repeat_guided_swaps: Solver3RepeatGuidedSwapParams {
                    enabled: true,
                    guided_proposal_probability: 1.5,
                    candidate_preview_budget: 8,
                },
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("hotspot_guidance.repeat_guided_swaps.guided_proposal_probability"),
            "unexpected error: {err}"
        );
    }

    #[cfg(feature = "solver3-experimental-repeat-guidance")]
    #[test]
    fn run_context_rejects_zero_repeat_guidance_budget_when_enabled() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            hotspot_guidance: Solver3HotspotGuidanceParams {
                repeat_guided_swaps: Solver3RepeatGuidedSwapParams {
                    enabled: true,
                    guided_proposal_probability: 0.5,
                    candidate_preview_budget: 0,
                },
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("hotspot_guidance.repeat_guided_swaps.candidate_preview_budget"),
            "unexpected error: {err}"
        );
    }

    #[cfg(feature = "solver3-experimental-repeat-guidance")]
    #[test]
    fn run_context_auto_disables_repeat_guidance_without_repeat_constraint() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            hotspot_guidance: Solver3HotspotGuidanceParams {
                repeat_guided_swaps: Solver3RepeatGuidedSwapParams {
                    enabled: true,
                    guided_proposal_probability: 0.75,
                    candidate_preview_budget: 6,
                },
            },
            ..Default::default()
        });

        let context = SearchRunContext::from_solver(&config, &state, 7).unwrap();
        assert!(!context.repeat_guided_swaps_enabled);
        assert_eq!(context.repeat_guided_swap_probability, 0.0);
        assert_eq!(context.repeat_guided_swap_candidate_preview_budget, 0);
    }

    #[test]
    fn progress_state_tracks_acceptance_and_best_state() {
        let mut progress = SearchProgressState::new(simple_state());
        progress.record_preview_attempt(crate::models::MoveFamily::Swap, 0.25, 1.5);
        progress.record_accepted_move(crate::models::MoveFamily::Swap, 0.1, 1.5, true);
        progress.record_acceptance_result(true);
        progress.current_state.total_score -= 2.0;
        progress.refresh_best_from_current(4, 0.42);
        progress.finish_iteration(4);

        assert_eq!(progress.move_metrics.swap.attempts, 1);
        assert_eq!(progress.move_metrics.swap.accepted, 1);
        assert_eq!(progress.local_optima_escapes, 1);
        assert_eq!(progress.iterations_completed, 5);
        assert_eq!(progress.no_improvement_count, 0);
        assert_eq!(progress.recent_acceptance.back(), Some(&true));
        assert_eq!(
            progress.best_state.total_score,
            progress.current_state.total_score
        );
    }

    #[test]
    fn progress_update_reports_completed_iterations_for_ui() {
        let state = simple_state();
        let run_context = SearchRunContext::from_solver(&solver3_config(), &state, 7).unwrap();
        let mut progress = SearchProgressState::new(state);
        progress.finish_iteration(4);

        let update = progress.to_progress_update(&run_context, 4, 1.0, 0.5, None);

        assert_eq!(update.iteration, 5);
        assert_eq!(update.iterations_since_last_reheat, 5);
    }
}
