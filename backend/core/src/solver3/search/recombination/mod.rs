mod certification;
mod donor_selection;
mod driver;
mod retention;
mod telemetry;
mod trigger;
mod types;

#[cfg(test)]
use certification::certify_swap_local_optimum;
pub(crate) use donor_selection::select_donor_session;
#[cfg(test)]
use donor_selection::{archive_config_for_donor_session_mode, select_donor_session_from_summary};
pub(crate) use driver::run;
#[cfg(test)]
use driver::transplant_donor_session;
#[cfg(test)]
use retention::{AdaptiveRawChildRetentionDecision, AdaptiveRawChildRetentionState};
#[cfg(test)]
use telemetry::{record_child_polish, record_child_polish_budget, record_raw_child_retention};
#[cfg(test)]
use trigger::{DonorSessionTriggerEligibility, DonorSessionTriggerState};
#[cfg(test)]
use types::DonorSessionSelectionOutcome;
pub(crate) use types::{DonorCandidatePool, DonorSessionChoice, DonorSessionViabilityTier};

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::{
        archive_config_for_donor_session_mode, certify_swap_local_optimum, record_child_polish,
        record_child_polish_budget, record_raw_child_retention, select_donor_session,
        select_donor_session_from_summary, transplant_donor_session,
        AdaptiveRawChildRetentionDecision, AdaptiveRawChildRetentionState, DonorCandidatePool,
        DonorSessionChoice, DonorSessionSelectionOutcome, DonorSessionTriggerEligibility,
        DonorSessionTriggerState, DonorSessionViabilityTier,
    };
    use crate::default_solver_configuration_for;
    use crate::models::{
        ApiInput, Constraint, Group, Objective, Person, ProblemDefinition, RepeatEncounterParams,
        SolverKind, StopReason,
    };
    use crate::solver3::runtime_state::RuntimeState;
    use crate::solver3::search::archive::{ArchivedElite, EliteArchive};
    use crate::solver3::search::context::{
        AdaptiveRawChildRetentionConfig, DonorSessionTransplantConfig, SearchProgressState,
    };

    fn config() -> DonorSessionTransplantConfig {
        DonorSessionTransplantConfig {
            archive_size: 4,
            recombination_no_improvement_window: 20,
            recombination_cooldown_window: 10,
            max_recombination_events_per_run: Some(2),
            adaptive_raw_child_retention: AdaptiveRawChildRetentionConfig {
                keep_ratio: 0.5,
                warmup_samples: 4,
                history_limit: 32,
            },
            swap_local_optimum_certification_enabled: false,
            child_polish_iterations_per_stagnation_window: 100_000,
            child_polish_no_improvement_iterations_per_stagnation_window: 100_000,
            child_polish_max_stagnation_windows: 4,
        }
    }

    fn person(id: &str) -> Person {
        Person {
            id: id.to_string(),
            attributes: HashMap::new(),
            sessions: None,
        }
    }

    fn schedule(
        groups: &[&str],
        sessions: Vec<Vec<Vec<&str>>>,
    ) -> HashMap<String, HashMap<String, Vec<String>>> {
        let mut schedule = HashMap::new();
        for (session_idx, session_groups) in sessions.into_iter().enumerate() {
            let mut session = HashMap::new();
            for (group_idx, members) in session_groups.into_iter().enumerate() {
                session.insert(
                    groups[group_idx].to_string(),
                    members
                        .into_iter()
                        .map(|member| member.to_string())
                        .collect(),
                );
            }
            schedule.insert(format!("session_{session_idx}"), session);
        }
        schedule
    }

    fn state_from_schedule(
        sessions: Vec<Vec<Vec<&str>>>,
        with_repeat_constraint: bool,
        score_override: f64,
    ) -> RuntimeState {
        let mut constraints = Vec::new();
        if with_repeat_constraint {
            constraints.push(Constraint::RepeatEncounter(RepeatEncounterParams {
                max_allowed_encounters: 1,
                penalty_function: "linear".into(),
                penalty_weight: 100.0,
            }));
        }
        let input = ApiInput {
            problem: ProblemDefinition {
                people: vec![person("p0"), person("p1"), person("p2"), person("p3")],
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
                num_sessions: sessions.len() as u32,
            },
            initial_schedule: Some(schedule(&["g0", "g1"], sessions)),
            construction_seed_schedule: None,
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".into(),
                weight: 1.0,
            }],
            constraints,
            solver: default_solver_configuration_for(SolverKind::Solver3),
        };
        let mut state =
            RuntimeState::from_input(&input).expect("schedule should build runtime state");
        state.total_score = score_override;
        state
    }

    #[test]
    fn trigger_waits_for_stagnation_and_donor_availability() {
        let state = DonorSessionTriggerState::new();
        assert_eq!(
            state.is_armed(config(), 19),
            DonorSessionTriggerEligibility::NotArmed
        );
        assert_eq!(
            state.is_armed(config(), 20),
            DonorSessionTriggerEligibility::Armed
        );
    }

    #[test]
    fn trigger_respects_cooldown_and_event_cap() {
        let mut state = DonorSessionTriggerState::new();
        state.record_recombination_event();
        assert_eq!(
            state.is_armed(config(), 100),
            DonorSessionTriggerEligibility::NotArmed
        );
        state.finish_iterations(10);
        assert_eq!(
            state.is_armed(config(), 100),
            DonorSessionTriggerEligibility::Armed
        );
        state.record_recombination_event();
        state.finish_iterations(10);
        assert_eq!(
            state.is_armed(config(), 100),
            DonorSessionTriggerEligibility::EventCapReached
        );
    }

    #[test]
    fn adaptive_raw_child_retention_warms_up_then_filters_by_percentile() {
        let mut retention = AdaptiveRawChildRetentionState::new(AdaptiveRawChildRetentionConfig {
            keep_ratio: 0.5,
            warmup_samples: 2,
            history_limit: 4,
        });

        let first = retention.evaluate(30.0);
        assert!(first.retained_for_polish);
        assert_eq!(first.discard_threshold, None);

        let second = retention.evaluate(10.0);
        assert!(second.retained_for_polish);
        assert_eq!(second.discard_threshold, None);

        let third = retention.evaluate(20.0);
        assert_eq!(third.discard_threshold, Some(10.0));
        assert!(!third.retained_for_polish);

        let fourth = retention.evaluate(15.0);
        assert_eq!(fourth.discard_threshold, Some(20.0));
        assert!(fourth.retained_for_polish);
    }

    #[test]
    fn swap_local_optimum_certification_finds_improving_swap_when_one_exists() {
        let state = state_from_schedule(
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            ],
            true,
            10.0,
        );

        let certification =
            certify_swap_local_optimum(&state, &[0, 1, 2]).expect("scan should succeed");
        assert!(certification.best_improving_swap.is_some());
        assert!(certification.swap_previews_evaluated > 0);
    }

    #[test]
    fn swap_local_optimum_certification_can_certify_local_optimum() {
        let state = state_from_schedule(
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                vec![vec!["p0", "p3"], vec!["p1", "p2"]],
            ],
            true,
            0.0,
        );

        let certification =
            certify_swap_local_optimum(&state, &[0, 1, 2]).expect("scan should succeed");
        assert!(certification.best_improving_swap.is_none());
        assert!(certification.swap_previews_evaluated > 0);
    }

    #[test]
    fn donor_selection_prefers_maximum_disagreement_within_score_competitive_half() {
        let base = state_from_schedule(
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            ],
            true,
            10.0,
        );
        let less_diverse_better_score = state_from_schedule(
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p3"], vec!["p1", "p2"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            ],
            true,
            8.0,
        );
        let more_diverse_competitive = state_from_schedule(
            vec![
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                vec![vec!["p0", "p3"], vec!["p1", "p2"]],
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            ],
            true,
            9.0,
        );
        let more_diverse_not_competitive = state_from_schedule(
            vec![
                vec![vec!["p0", "p3"], vec!["p1", "p2"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            ],
            true,
            20.0,
        );

        let mut archive = EliteArchive::new(archive_config_for_donor_session_mode(config()));
        archive.consider_state(less_diverse_better_score);
        archive.consider_state(more_diverse_competitive);
        archive.consider_state(more_diverse_not_competitive);

        let choice =
            select_donor_session(&base, &archive).expect("expected a viable donor session");
        assert_eq!(choice.donor_archive_idx, 1);
        assert_eq!(choice.session_idx, 0);
        assert_eq!(choice.session_disagreement_count, 3);
        assert_eq!(choice.candidate_pool, DonorCandidatePool::CompetitiveHalf);
        assert_eq!(
            choice.session_viability_tier,
            DonorSessionViabilityTier::StrictImproving
        );
        assert_eq!(choice.conflict_burden_delta, 2);
    }

    #[test]
    fn donor_selection_requires_more_than_near_duplicate_disagreement() {
        let base = state_from_schedule(
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            ],
            true,
            10.0,
        );
        let near_duplicate = state_from_schedule(
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            ],
            true,
            9.0,
        );

        let mut archive = EliteArchive::new(archive_config_for_donor_session_mode(config()));
        archive.consider_state(near_duplicate);

        assert!(select_donor_session(&base, &archive).is_none());
    }

    #[test]
    fn donor_selection_broadens_to_full_archive_when_competitive_half_stalls() {
        let mut archive = EliteArchive::new(archive_config_for_donor_session_mode(config()));
        archive.consider_elite(ArchivedElite {
            state: state_from_schedule(
                vec![
                    vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                    vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                    vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                ],
                true,
                10.0,
            ),
            score: 8.0,
            session_fingerprints: vec![10, 20, 30],
            session_conflict_burden: vec![6, 6, 6],
        });
        archive.consider_elite(ArchivedElite {
            state: state_from_schedule(
                vec![
                    vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                    vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                    vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                ],
                true,
                10.0,
            ),
            score: 9.0,
            session_fingerprints: vec![10, 2, 4],
            session_conflict_burden: vec![4, 5, 5],
        });

        let outcome = select_donor_session_from_summary(&[1, 2, 3], &[5, 5, 5], &archive);
        assert_eq!(
            outcome,
            DonorSessionSelectionOutcome::Selected(DonorSessionChoice {
                donor_archive_idx: 1,
                session_idx: 0,
                session_disagreement_count: 2,
                candidate_pool: DonorCandidatePool::FullArchive,
                session_viability_tier: DonorSessionViabilityTier::StrictImproving,
                conflict_burden_delta: 1,
            })
        );
    }

    #[test]
    fn donor_selection_falls_back_to_any_differing_when_needed() {
        let mut archive = EliteArchive::new(archive_config_for_donor_session_mode(config()));
        archive.consider_elite(ArchivedElite {
            state: state_from_schedule(
                vec![
                    vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                    vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                    vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                ],
                true,
                10.0,
            ),
            score: 9.0,
            session_fingerprints: vec![10, 20, 30],
            session_conflict_burden: vec![7, 6, 8],
        });

        let outcome = select_donor_session_from_summary(&[1, 2, 3], &[5, 5, 5], &archive);
        assert_eq!(
            outcome,
            DonorSessionSelectionOutcome::Selected(DonorSessionChoice {
                donor_archive_idx: 0,
                session_idx: 1,
                session_disagreement_count: 3,
                candidate_pool: DonorCandidatePool::CompetitiveHalf,
                session_viability_tier: DonorSessionViabilityTier::AnyDiffering,
                conflict_burden_delta: -1,
            })
        );
    }

    #[test]
    fn donor_selection_chooses_session_with_largest_conflict_burden_delta() {
        let base = state_from_schedule(
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            ],
            true,
            10.0,
        );
        let donor = state_from_schedule(
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                vec![vec!["p0", "p3"], vec!["p1", "p2"]],
            ],
            true,
            9.0,
        );

        let mut archive = EliteArchive::new(archive_config_for_donor_session_mode(config()));
        archive.consider_state(donor);

        let choice =
            select_donor_session(&base, &archive).expect("expected a viable donor session");
        assert_eq!(choice.session_idx, 1);
        assert_eq!(choice.conflict_burden_delta, 4);
    }

    #[test]
    fn transplant_donor_session_overwrites_only_the_selected_session() {
        let base = state_from_schedule(
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            ],
            true,
            10.0,
        );
        let donor = state_from_schedule(
            vec![
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                vec![vec!["p0", "p3"], vec!["p1", "p2"]],
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            ],
            true,
            9.0,
        );

        let child = transplant_donor_session(
            &base,
            &crate::solver3::search::archive::ArchivedElite::from_state(donor.clone()),
            1,
        )
        .expect("transplant should succeed");

        assert_eq!(
            child.group_members[child.group_slot(0, 0)],
            base.group_members[base.group_slot(0, 0)]
        );
        assert_eq!(
            child.group_members[child.group_slot(1, 0)],
            donor.group_members[donor.group_slot(1, 0)]
        );
        assert_eq!(
            child.group_members[child.group_slot(2, 0)],
            base.group_members[base.group_slot(2, 0)]
        );
        assert_eq!(
            child.pair_contacts,
            RuntimeState::from_input(&ApiInput {
                problem: ProblemDefinition {
                    people: vec![person("p0"), person("p1"), person("p2"), person("p3")],
                    groups: vec![
                        Group {
                            id: "g0".into(),
                            size: 2,
                            session_sizes: None
                        },
                        Group {
                            id: "g1".into(),
                            size: 2,
                            session_sizes: None
                        },
                    ],
                    num_sessions: 3,
                },
                initial_schedule: Some(schedule(
                    &["g0", "g1"],
                    vec![
                        vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                        vec![vec!["p0", "p3"], vec!["p1", "p2"]],
                        vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                    ],
                )),
                construction_seed_schedule: None,
                objectives: vec![Objective {
                    r#type: "maximize_unique_contacts".into(),
                    weight: 1.0,
                }],
                constraints: vec![Constraint::RepeatEncounter(RepeatEncounterParams {
                    max_allowed_encounters: 1,
                    penalty_function: "linear".into(),
                    penalty_weight: 100.0,
                })],
                solver: default_solver_configuration_for(SolverKind::Solver3),
            })
            .expect("expected child runtime state")
            .pair_contacts
        );
    }

    #[test]
    fn child_quality_telemetry_records_post_polish_basin_depth() {
        let base = state_from_schedule(
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            ],
            true,
            10.0,
        );
        let mut aggregate = SearchProgressState::new(base.clone());

        record_raw_child_retention(
            &mut aggregate,
            DonorSessionChoice {
                donor_archive_idx: 1,
                session_idx: 2,
                session_disagreement_count: 3,
                candidate_pool: DonorCandidatePool::CompetitiveHalf,
                session_viability_tier: DonorSessionViabilityTier::StrictImproving,
                conflict_burden_delta: 4,
            },
            10.0,
            9.0,
            12.0,
            2.0,
            AdaptiveRawChildRetentionDecision {
                discard_threshold: Some(3.0),
                retained_for_polish: true,
            },
            3,
            Some(3.0),
        );
        record_child_polish_budget(&mut aggregate, 100, 80);

        let mut polished = SearchProgressState::new(base);
        polished.best_state.total_score = 8.5;
        polished.iterations_completed = 42;
        record_child_polish(
            &mut aggregate,
            &polished,
            0.25,
            StopReason::NoImprovementLimitReached,
        );

        let telemetry = aggregate
            .donor_session_transplant_telemetry
            .expect("telemetry should exist");
        assert_eq!(telemetry.polished_children, 1);
        assert_eq!(telemetry.best_post_polish_score, Some(8.5));
        assert_eq!(telemetry.post_polish_score_sum, 8.5);
        assert_eq!(telemetry.post_polish_score_min, Some(8.5));
        assert_eq!(telemetry.post_polish_score_max, Some(8.5));
        assert_eq!(telemetry.polished_child_vs_raw_delta_sum, -3.5);
        assert_eq!(telemetry.polished_child_vs_raw_delta_min, Some(-3.5));
        assert_eq!(telemetry.polished_child_vs_raw_delta_max, Some(-3.5));
        assert_eq!(telemetry.polished_child_vs_incumbent_delta_sum, -1.5);
        assert_eq!(telemetry.polished_child_vs_incumbent_delta_min, Some(-1.5));
        assert_eq!(telemetry.polished_child_vs_incumbent_delta_max, Some(-1.5));

        let recorded_choice = telemetry
            .donor_choices
            .last()
            .expect("choice telemetry should exist");
        assert_eq!(recorded_choice.pre_recombination_incumbent_score, 10.0);
        assert_eq!(recorded_choice.donor_score, 9.0);
        assert_eq!(recorded_choice.raw_child_score, 12.0);
        assert_eq!(recorded_choice.post_polish_best_score, Some(8.5));
        assert_eq!(recorded_choice.raw_to_polished_delta, Some(-3.5));
        assert_eq!(recorded_choice.incumbent_to_polished_delta, Some(-1.5));
        assert_eq!(recorded_choice.became_new_incumbent, Some(true));
        assert_eq!(recorded_choice.set_new_best_post_polish_score, Some(true));
        assert_eq!(
            recorded_choice.polish_stop_reason,
            Some(StopReason::NoImprovementLimitReached)
        );
        assert_eq!(recorded_choice.polish_iterations_completed, Some(42));
    }

    #[test]
    fn child_quality_telemetry_marks_non_improving_basin_without_new_best_flag() {
        let base = state_from_schedule(
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                vec![vec!["p0", "p3"], vec!["p1", "p2"]],
            ],
            true,
            10.0,
        );
        let mut aggregate = SearchProgressState::new(base.clone());

        record_raw_child_retention(
            &mut aggregate,
            DonorSessionChoice {
                donor_archive_idx: 0,
                session_idx: 0,
                session_disagreement_count: 3,
                candidate_pool: DonorCandidatePool::CompetitiveHalf,
                session_viability_tier: DonorSessionViabilityTier::StrictImproving,
                conflict_burden_delta: 2,
            },
            10.0,
            9.5,
            11.0,
            1.0,
            AdaptiveRawChildRetentionDecision {
                discard_threshold: None,
                retained_for_polish: true,
            },
            2,
            None,
        );
        let mut first_polished = SearchProgressState::new(base.clone());
        first_polished.best_state.total_score = 8.0;
        record_child_polish(
            &mut aggregate,
            &first_polished,
            0.2,
            StopReason::NoImprovementLimitReached,
        );

        record_raw_child_retention(
            &mut aggregate,
            DonorSessionChoice {
                donor_archive_idx: 1,
                session_idx: 1,
                session_disagreement_count: 2,
                candidate_pool: DonorCandidatePool::FullArchive,
                session_viability_tier: DonorSessionViabilityTier::AnyDiffering,
                conflict_burden_delta: -1,
            },
            8.0,
            9.0,
            8.2,
            0.2,
            AdaptiveRawChildRetentionDecision {
                discard_threshold: Some(0.5),
                retained_for_polish: true,
            },
            4,
            Some(0.5),
        );
        let mut second_polished = SearchProgressState::new(base);
        second_polished.best_state.total_score = 8.1;
        second_polished.iterations_completed = 7;
        record_child_polish(
            &mut aggregate,
            &second_polished,
            0.1,
            StopReason::MaxIterationsReached,
        );

        let telemetry = aggregate
            .donor_session_transplant_telemetry
            .expect("telemetry should exist");
        assert_eq!(telemetry.best_post_polish_score, Some(8.0));
        assert_eq!(telemetry.post_polish_score_min, Some(8.0));
        assert_eq!(telemetry.post_polish_score_max, Some(8.1));

        let second_choice = telemetry
            .donor_choices
            .last()
            .expect("second choice should exist");
        assert_eq!(second_choice.post_polish_best_score, Some(8.1));
        assert_eq!(second_choice.became_new_incumbent, Some(false));
        assert_eq!(second_choice.set_new_best_post_polish_score, Some(false));
        assert_eq!(
            second_choice.polish_stop_reason,
            Some(StopReason::MaxIterationsReached)
        );
        assert_eq!(second_choice.polish_iterations_completed, Some(7));
    }
}
