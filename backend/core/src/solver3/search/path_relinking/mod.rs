#[cfg(not(target_arch = "wasm32"))]
use std::time::Instant;

#[cfg(target_arch = "wasm32")]
use js_sys;

mod alignment;
mod certification;
mod driver;
mod multi_root;
mod retention;
mod telemetry;
mod trigger;

#[cfg(test)]
use alignment::sorted_symmetric_difference_count;
pub(crate) use alignment::{
    align_sessions_by_pairing_distance, build_session_pairing_signature, session_pairing_distance,
    AlignedSessionPair, SessionAlignment, MAX_EXACT_ALIGNMENT_SESSIONS,
};
#[cfg(test)]
use certification::certify_swap_local_optimum;
pub(crate) use driver::run;
#[cfg(test)]
use driver::{
    build_random_donor_session_candidates, build_random_macro_mutation_candidates,
    compare_path_guides, remove_aligned_pair, remove_session_idx, select_path_guide,
    transplant_aligned_session, PathGuideCandidate,
};
pub(crate) use multi_root::run_multi_root_balanced_session_inheritance;
#[cfg(test)]
use multi_root::{
    build_balanced_inheritance_child, build_balanced_inheritance_plan,
    BalancedInheritanceParentRole,
};
#[cfg(test)]
use retention::AdaptiveRawChildRetentionState;

#[cfg(not(target_arch = "wasm32"))]
type TimePoint = Instant;

#[cfg(target_arch = "wasm32")]
type TimePoint = f64;

#[cfg(not(target_arch = "wasm32"))]
fn get_current_time() -> Instant {
    Instant::now()
}

#[cfg(target_arch = "wasm32")]
fn get_current_time() -> f64 {
    js_sys::Date::now()
}

#[cfg(not(target_arch = "wasm32"))]
fn get_elapsed_seconds(start: Instant) -> f64 {
    start.elapsed().as_secs_f64()
}

#[cfg(target_arch = "wasm32")]
fn get_elapsed_seconds(start: f64) -> f64 {
    (js_sys::Date::now() - start) / 1000.0
}

#[cfg(not(target_arch = "wasm32"))]
fn get_elapsed_seconds_between(start: Instant, end: Instant) -> f64 {
    end.duration_since(start).as_secs_f64()
}

#[cfg(target_arch = "wasm32")]
fn get_elapsed_seconds_between(start: f64, end: f64) -> f64 {
    (end - start) / 1000.0
}

#[inline]
fn time_limit_exceeded(elapsed_seconds: f64, time_limit_seconds: Option<f64>) -> bool {
    time_limit_seconds.is_some_and(|limit| elapsed_seconds >= limit)
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use crate::default_solver_configuration_for;
    use crate::models::{
        ApiInput, Constraint, Group, Objective, Person, ProblemDefinition, RepeatEncounterParams,
        Solver3PathRelinkingOperatorVariant, SolverKind,
    };
    use crate::solver3::runtime_state::RuntimeState;
    use crate::solver3::search::archive::EliteArchive;
    use crate::solver3::search::context::{
        AdaptiveRawChildRetentionConfig, SearchRunContext, SessionAlignedPathRelinkingConfig,
    };
    use rand::SeedableRng;
    use rand_chacha::ChaCha12Rng;

    use super::{
        align_sessions_by_pairing_distance, build_balanced_inheritance_child,
        build_balanced_inheritance_plan, build_random_donor_session_candidates,
        build_random_macro_mutation_candidates, build_session_pairing_signature,
        compare_path_guides, remove_aligned_pair, remove_session_idx, select_path_guide,
        session_pairing_distance, sorted_symmetric_difference_count, transplant_aligned_session,
        AdaptiveRawChildRetentionState, AlignedSessionPair, BalancedInheritanceParentRole,
        PathGuideCandidate, MAX_EXACT_ALIGNMENT_SESSIONS,
    };

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

    fn state_from_schedule(sessions: Vec<Vec<Vec<&str>>>) -> RuntimeState {
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
            constraints: vec![Constraint::RepeatEncounter(RepeatEncounterParams {
                max_allowed_encounters: 1,
                penalty_function: "linear".into(),
                penalty_weight: 100.0,
            })],
            solver: default_solver_configuration_for(SolverKind::Solver3),
        };
        RuntimeState::from_input(&input).expect("schedule should build runtime state")
    }

    fn config() -> SessionAlignedPathRelinkingConfig {
        SessionAlignedPathRelinkingConfig {
            operator_variant: Solver3PathRelinkingOperatorVariant::SessionAlignedPathRelinking,
            archive_size: 4,
            recombination_no_improvement_window: 20,
            recombination_cooldown_window: 10,
            max_path_events_per_run: Some(2),
            max_session_imports_per_event: 3,
            path_step_no_improvement_limit: 2,
            min_aligned_session_distance_for_relinking: 1,
            adaptive_raw_child_retention: AdaptiveRawChildRetentionConfig {
                keep_ratio: 0.5,
                warmup_samples: 2,
                history_limit: 8,
            },
            swap_local_optimum_certification_enabled: false,
            child_polish_iterations_per_stagnation_window: 16,
            child_polish_no_improvement_iterations_per_stagnation_window: 8,
            child_polish_max_stagnation_windows: 2,
        }
    }

    #[test]
    fn session_pairing_signature_is_invariant_to_group_order() {
        let left = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
        ]);
        let right = state_from_schedule(vec![
            vec![vec!["p2", "p3"], vec!["p0", "p1"]],
            vec![vec!["p1", "p3"], vec!["p0", "p2"]],
        ]);

        assert_eq!(
            build_session_pairing_signature(&left, 0),
            build_session_pairing_signature(&right, 0)
        );
        assert_eq!(
            build_session_pairing_signature(&left, 1),
            build_session_pairing_signature(&right, 1)
        );
    }

    #[test]
    fn identical_sessions_have_zero_pairing_distance() {
        let base = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
        ]);
        let donor = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
        ]);

        assert_eq!(session_pairing_distance(&base, 0, &donor, 0).unwrap(), 0);
        assert_eq!(session_pairing_distance(&base, 1, &donor, 1).unwrap(), 0);
    }

    #[test]
    fn session_alignment_finds_the_minimum_cost_matching() {
        let base = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
        ]);
        let donor = state_from_schedule(vec![
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
        ]);

        let alignment = align_sessions_by_pairing_distance(&base, &donor).unwrap();
        assert_eq!(alignment.total_alignment_cost, 0);
        assert_eq!(
            alignment.matched_session_pairs,
            vec![
                AlignedSessionPair {
                    base_session_idx: 0,
                    donor_session_idx: 1,
                    structural_distance: 0,
                },
                AlignedSessionPair {
                    base_session_idx: 1,
                    donor_session_idx: 2,
                    structural_distance: 0,
                },
                AlignedSessionPair {
                    base_session_idx: 2,
                    donor_session_idx: 0,
                    structural_distance: 0,
                },
            ]
        );
    }

    #[test]
    fn differing_session_pairs_can_be_ranked_by_structural_distance() {
        let base = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
        ]);
        let donor = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
        ]);

        let alignment = align_sessions_by_pairing_distance(&base, &donor).unwrap();
        let mut differing = alignment.differing_pairs();
        differing.sort_by(|left, right| {
            right
                .structural_distance
                .cmp(&left.structural_distance)
                .then_with(|| left.base_session_idx.cmp(&right.base_session_idx))
        });

        assert!(!differing.is_empty());
        assert!(differing.iter().all(|pair| pair.structural_distance > 0));
        for window in differing.windows(2) {
            assert!(window[0].structural_distance >= window[1].structural_distance);
        }
    }

    #[test]
    fn balanced_inheritance_plan_preserves_agreement_core_and_even_split() {
        let base = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
        ]);
        let donor = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
        ]);

        let alignment = align_sessions_by_pairing_distance(&base, &donor).unwrap();
        let plan = build_balanced_inheritance_plan(&alignment, 10, 20, 0.5);

        assert_eq!(plan.differing_session_count, 2);
        assert_eq!(plan.parent_a_session_count, 1);
        assert_eq!(plan.parent_b_session_count, 1);
        for pair in &alignment.matched_session_pairs {
            if pair.structural_distance == 0 {
                let choice = plan
                    .session_choices
                    .iter()
                    .find(|choice| choice.target_session_idx == pair.base_session_idx)
                    .unwrap();
                assert_eq!(choice.source_parent, BalancedInheritanceParentRole::ParentA);
            }
        }
    }

    #[test]
    fn balanced_inheritance_plan_handles_odd_differing_session_counts_explicitly() {
        let base = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
        ]);
        let donor = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
        ]);

        let alignment = align_sessions_by_pairing_distance(&base, &donor).unwrap();
        let plan = build_balanced_inheritance_plan(&alignment, 10, 20, 0.5);

        assert_eq!(plan.differing_session_count, 3);
        assert_eq!(plan.parent_a_session_count + plan.parent_b_session_count, 3);
        assert_eq!(
            plan.parent_a_session_count
                .abs_diff(plan.parent_b_session_count),
            1
        );
        if plan.parent_a_receives_extra_session {
            assert_eq!(plan.parent_a_session_count, 2);
        } else {
            assert_eq!(plan.parent_b_session_count, 2);
        }
    }

    #[test]
    fn balanced_inheritance_child_uses_exact_parent_split_on_differing_sessions() {
        let base = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
        ]);
        let donor = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
        ]);

        let alignment = align_sessions_by_pairing_distance(&base, &donor).unwrap();
        let plan = build_balanced_inheritance_plan(&alignment, 10, 20, 0.5);
        let child = build_balanced_inheritance_child(&base, &donor, &plan).unwrap();

        for choice in plan
            .session_choices
            .iter()
            .filter(|choice| choice.structural_distance > 0)
        {
            let child_slot = child.group_slot(choice.target_session_idx, 0);
            match choice.source_parent {
                BalancedInheritanceParentRole::ParentA => assert_eq!(
                    child.group_members[child_slot],
                    base.group_members[base.group_slot(choice.source_session_idx, 0)]
                ),
                BalancedInheritanceParentRole::ParentB => assert_eq!(
                    child.group_members[child_slot],
                    donor.group_members[donor.group_slot(choice.source_session_idx, 0)]
                ),
            }
        }
    }

    #[test]
    fn balanced_inheritance_child_does_not_collapse_into_caller_order_bias() {
        let base = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
        ]);
        let donor = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
        ]);

        let alignment_ab = align_sessions_by_pairing_distance(&base, &donor).unwrap();
        let plan_ab = build_balanced_inheritance_plan(&alignment_ab, 10, 20, 0.5);
        let child_ab = build_balanced_inheritance_child(&base, &donor, &plan_ab).unwrap();

        let alignment_ba = align_sessions_by_pairing_distance(&donor, &base).unwrap();
        let plan_ba = build_balanced_inheritance_plan(&alignment_ba, 20, 10, 0.5);
        let child_ba = build_balanced_inheritance_child(&donor, &base, &plan_ba).unwrap();

        assert!(plan_ab.parent_a_session_count > 0);
        assert!(plan_ab.parent_b_session_count > 0);
        assert!(plan_ba.parent_a_session_count > 0);
        assert!(plan_ba.parent_b_session_count > 0);
        assert_ne!(child_ab.to_api_schedule(), base.to_api_schedule());
        assert_ne!(child_ba.to_api_schedule(), donor.to_api_schedule());
    }

    #[test]
    fn select_path_guide_prefers_high_alignment_cost_competitive_donor() {
        let base = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
        ]);
        let better_score_less_diverse = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
        ]);
        let diverse_competitive = state_from_schedule(vec![
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
        ]);
        let mut archive = EliteArchive::new(crate::solver3::search::archive::EliteArchiveConfig {
            capacity: 4,
            near_duplicate_session_threshold: 0,
        });
        archive.consider_state(better_score_less_diverse);
        archive.consider_state(diverse_competitive.clone());

        let guide = select_path_guide(&base, &archive, config())
            .unwrap()
            .expect("expected a viable path guide");
        assert_eq!(guide.donor_archive_idx, 1);
        assert!(guide.alignment.total_alignment_cost > 0);
        assert!(!guide.differing_pairs.is_empty());
    }

    #[test]
    fn transplant_aligned_session_can_import_from_different_donor_session_index() {
        let base = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
        ]);
        let donor = state_from_schedule(vec![
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
        ]);
        let donor = crate::solver3::search::archive::ArchivedElite::from_state(donor.clone());

        let child = transplant_aligned_session(
            &base,
            &donor,
            &AlignedSessionPair {
                base_session_idx: 0,
                donor_session_idx: 1,
                structural_distance: 2,
            },
        )
        .expect("aligned transplant should succeed");

        assert_eq!(
            child.group_members[child.group_slot(0, 0)],
            donor.state.group_members[donor.state.group_slot(1, 0)]
        );
        assert_eq!(
            child.group_members[child.group_slot(1, 0)],
            base.group_members[base.group_slot(1, 0)]
        );
    }

    #[test]
    fn remove_aligned_pair_only_removes_the_selected_step() {
        let mut pairs = vec![
            AlignedSessionPair {
                base_session_idx: 0,
                donor_session_idx: 1,
                structural_distance: 4,
            },
            AlignedSessionPair {
                base_session_idx: 1,
                donor_session_idx: 0,
                structural_distance: 2,
            },
        ];
        let chosen = pairs[0].clone();
        remove_aligned_pair(&mut pairs, &chosen);
        assert_eq!(pairs.len(), 1);
        assert_eq!(pairs[0].base_session_idx, 1);
    }

    #[test]
    fn random_donor_session_candidates_use_unique_base_and_donor_sessions() {
        let base = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
        ]);
        let donor_state = state_from_schedule(vec![
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
        ]);
        let donor = crate::solver3::search::archive::ArchivedElite::from_state(donor_state);
        let mut rng = ChaCha12Rng::seed_from_u64(7);

        let candidates = build_random_donor_session_candidates(
            &base,
            &donor,
            &[0, 1, 2],
            &[0, 1, 2],
            0,
            &mut rng,
        )
        .expect("random donor-session candidates should build");

        assert_eq!(candidates.len(), 3);
        let mut base_sessions = candidates
            .iter()
            .map(|candidate| candidate.base_session_idx)
            .collect::<Vec<_>>();
        base_sessions.sort_unstable();
        base_sessions.dedup();
        assert_eq!(base_sessions, vec![0, 1, 2]);

        let mut donor_sessions = candidates
            .iter()
            .map(|candidate| candidate.donor_session_idx)
            .collect::<Vec<_>>();
        donor_sessions.sort_unstable();
        donor_sessions.dedup();
        assert_eq!(donor_sessions, vec![0, 1, 2]);
    }

    #[test]
    fn remove_session_idx_only_removes_the_selected_session() {
        let mut sessions = vec![0, 1, 2];
        remove_session_idx(&mut sessions, 1);
        assert_eq!(sessions, vec![0, 2]);
    }

    #[test]
    fn random_macro_mutation_candidates_apply_random_swaps() {
        let state = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
        ]);
        let run_context = SearchRunContext {
            effective_seed: 7,
            move_policy: crate::models::MovePolicy::default(),
            search_driver_mode: crate::models::Solver3SearchDriverMode::SessionAlignedPathRelinking,
            local_improver_mode: crate::models::Solver3LocalImproverMode::RecordToRecord,
            max_iterations: 100,
            no_improvement_limit: None,
            time_limit_seconds: None,
            stop_on_optimal_score: false,
            allowed_sessions: vec![0, 1, 2],
            correctness_lane_enabled: false,
            correctness_sample_every_accepted_moves: 100,
            repeat_guided_swaps_enabled: false,
            repeat_guided_swap_probability: 0.0,
            repeat_guided_swap_candidate_preview_budget: 0,
            sgp_week_pair_tabu: None,
            steady_state_memetic: None,
            donor_session_transplant: None,
            session_aligned_path_relinking: Some(config()),
            multi_root_balanced_session_inheritance: None,
        };
        let mut rng = ChaCha12Rng::seed_from_u64(11);

        let candidates =
            build_random_macro_mutation_candidates(&state, &run_context, 3, 2, &mut rng)
                .expect("random macro mutation candidates should build");

        assert_eq!(candidates.len(), 3);
        assert!(candidates
            .iter()
            .all(|candidate| candidate.swaps_applied >= 1 && candidate.swaps_applied <= 2));
    }

    #[test]
    fn adaptive_raw_child_retention_warms_up_then_filters() {
        let mut retention = AdaptiveRawChildRetentionState::new(AdaptiveRawChildRetentionConfig {
            keep_ratio: 0.5,
            warmup_samples: 2,
            history_limit: 4,
        });

        assert!(retention.evaluate(10.0).retained_for_polish);
        assert!(retention.evaluate(5.0).retained_for_polish);
        assert!(!retention.evaluate(9.0).retained_for_polish);
        assert!(retention.evaluate(4.0).retained_for_polish);
    }

    #[test]
    fn compare_path_guides_prefers_more_structural_disagreement_then_better_score() {
        let left = PathGuideCandidate {
            donor_archive_idx: 0,
            alignment: super::SessionAlignment {
                matched_session_pairs: Vec::new(),
                total_alignment_cost: 6,
            },
            differing_pairs: vec![AlignedSessionPair {
                base_session_idx: 0,
                donor_session_idx: 0,
                structural_distance: 6,
            }],
            donor_score: 10.0,
        };
        let right = PathGuideCandidate {
            donor_archive_idx: 1,
            alignment: super::SessionAlignment {
                matched_session_pairs: Vec::new(),
                total_alignment_cost: 4,
            },
            differing_pairs: vec![AlignedSessionPair {
                base_session_idx: 0,
                donor_session_idx: 0,
                structural_distance: 4,
            }],
            donor_score: 8.0,
        };
        assert_eq!(
            compare_path_guides(&left, &right),
            std::cmp::Ordering::Greater
        );
    }

    #[test]
    fn sorted_symmetric_difference_counts_only_disagreement() {
        assert_eq!(sorted_symmetric_difference_count(&[1, 2, 3], &[1, 2, 3]), 0);
        assert_eq!(sorted_symmetric_difference_count(&[1, 2, 3], &[1, 4, 5]), 4);
    }

    #[test]
    fn exact_alignment_session_limit_stays_small_and_explicit() {
        assert!(MAX_EXACT_ALIGNMENT_SESSIONS >= 3);
    }
}
