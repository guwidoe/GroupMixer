use std::cmp::Ordering;

use super::archive::{
    build_session_conflict_burden, build_session_fingerprints, EliteArchive, EliteArchiveConfig,
};
use super::context::DonorSessionTransplantConfig;
use super::super::runtime_state::RuntimeState;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct DonorSessionChoice {
    pub(crate) donor_archive_idx: usize,
    pub(crate) session_idx: usize,
    pub(crate) session_disagreement_count: usize,
    pub(crate) conflict_burden_advantage: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct DonorSessionTriggerState {
    pub(crate) recombination_events_fired: u64,
    pub(crate) iterations_since_last_recombination: u64,
}

impl Default for DonorSessionTriggerState {
    fn default() -> Self {
        Self {
            recombination_events_fired: 0,
            iterations_since_last_recombination: u64::MAX,
        }
    }
}

impl DonorSessionTriggerState {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    pub(crate) fn should_fire(
        &self,
        config: DonorSessionTransplantConfig,
        no_improvement_count: u64,
        donor_available: bool,
    ) -> bool {
        donor_available
            && self.recombination_events_fired < config.max_recombination_events_per_run
            && no_improvement_count >= config.recombination_no_improvement_window
            && self.iterations_since_last_recombination >= config.recombination_cooldown_window
    }

    pub(crate) fn finish_iteration(&mut self) {
        self.iterations_since_last_recombination =
            self.iterations_since_last_recombination.saturating_add(1);
    }

    pub(crate) fn finish_iterations(&mut self, iterations: u64) {
        self.iterations_since_last_recombination = self
            .iterations_since_last_recombination
            .saturating_add(iterations);
    }

    pub(crate) fn record_recombination_event(&mut self) {
        self.recombination_events_fired += 1;
        self.iterations_since_last_recombination = 0;
    }
}

pub(crate) fn archive_config_for_donor_session_mode(
    config: DonorSessionTransplantConfig,
) -> EliteArchiveConfig {
    EliteArchiveConfig {
        capacity: config.archive_size,
        near_duplicate_session_threshold: 1,
    }
}

pub(crate) fn select_donor_session(
    base_state: &RuntimeState,
    archive: &EliteArchive,
) -> Option<DonorSessionChoice> {
    let base_session_fingerprints = build_session_fingerprints(base_state);
    let base_session_conflict_burden = build_session_conflict_burden(base_state);
    select_donor_session_from_summary(
        &base_session_fingerprints,
        &base_session_conflict_burden,
        archive,
    )
}

fn select_donor_session_from_summary(
    base_session_fingerprints: &[u64],
    base_session_conflict_burden: &[u32],
    archive: &EliteArchive,
) -> Option<DonorSessionChoice> {
    if archive.entries().is_empty() {
        return None;
    }

    let mut ranked_archive_indices = (0..archive.entries().len()).collect::<Vec<_>>();
    ranked_archive_indices.sort_by(|left, right| {
        archive.entries()[*left]
            .score
            .total_cmp(&archive.entries()[*right].score)
            .then_with(|| left.cmp(right))
    });

    let competitive_count = ranked_archive_indices.len().div_ceil(2);
    ranked_archive_indices
        .into_iter()
        .take(competitive_count)
        .filter_map(|archive_idx| {
            score_competitive_donor_choice(
                archive_idx,
                &archive.entries()[archive_idx],
                base_session_fingerprints,
                base_session_conflict_burden,
                archive.near_duplicate_session_threshold(),
            )
        })
        .max_by(|left, right| {
            compare_donor_session_choice(left, right).then_with(|| {
                archive.entries()[right.donor_archive_idx]
                    .score
                    .total_cmp(&archive.entries()[left.donor_archive_idx].score)
            })
        })
}

fn score_competitive_donor_choice(
    archive_idx: usize,
    donor: &super::archive::ArchivedElite,
    base_session_fingerprints: &[u64],
    base_session_conflict_burden: &[u32],
    near_duplicate_session_threshold: usize,
) -> Option<DonorSessionChoice> {
    let session_disagreement_count = donor
        .session_fingerprints
        .iter()
        .zip(base_session_fingerprints.iter())
        .filter(|(left, right)| left != right)
        .count();

    if session_disagreement_count <= near_duplicate_session_threshold {
        return None;
    }

    donor
        .session_fingerprints
        .iter()
        .zip(donor.session_conflict_burden.iter())
        .zip(
            base_session_fingerprints
                .iter()
                .zip(base_session_conflict_burden.iter()),
        )
        .enumerate()
        .filter_map(
            |(
                session_idx,
                ((donor_fingerprint, donor_conflict_burden), (base_fingerprint, base_conflict_burden)),
            )| {
                if donor_fingerprint == base_fingerprint || donor_conflict_burden >= base_conflict_burden {
                    return None;
                }
                Some(DonorSessionChoice {
                    donor_archive_idx: archive_idx,
                    session_idx,
                    session_disagreement_count,
                    conflict_burden_advantage: base_conflict_burden - donor_conflict_burden,
                })
            },
        )
        .max_by(|left, right| {
            left.conflict_burden_advantage
                .cmp(&right.conflict_burden_advantage)
                .then_with(|| left.session_idx.cmp(&right.session_idx).reverse())
        })
}

fn compare_donor_session_choice(
    left: &DonorSessionChoice,
    right: &DonorSessionChoice,
) -> Ordering {
    left.session_disagreement_count
        .cmp(&right.session_disagreement_count)
        .then_with(|| left.conflict_burden_advantage.cmp(&right.conflict_burden_advantage))
        .then_with(|| right.donor_archive_idx.cmp(&left.donor_archive_idx))
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::{
        archive_config_for_donor_session_mode, select_donor_session, DonorSessionTriggerState,
    };
    use crate::default_solver_configuration_for;
    use crate::models::{
        ApiInput, Constraint, Group, Objective, Person, ProblemDefinition,
        RepeatEncounterParams, SolverKind,
    };
    use crate::solver3::runtime_state::RuntimeState;
    use crate::solver3::search::archive::EliteArchive;
    use crate::solver3::search::context::DonorSessionTransplantConfig;

    fn config() -> DonorSessionTransplantConfig {
        DonorSessionTransplantConfig {
            archive_size: 4,
            recombination_no_improvement_window: 20,
            recombination_cooldown_window: 10,
            max_recombination_events_per_run: 2,
            early_discard_score_delta: 250.0,
            child_polish_max_iterations: 64,
            child_polish_no_improvement_iterations: 32,
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
                    members.into_iter().map(|member| member.to_string()).collect(),
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
        let mut state = RuntimeState::from_input(&input).expect("schedule should build runtime state");
        state.total_score = score_override;
        state
    }

    #[test]
    fn trigger_waits_for_stagnation_and_donor_availability() {
        let state = DonorSessionTriggerState::new();
        assert!(!state.should_fire(config(), 19, true));
        assert!(!state.should_fire(config(), 20, false));
        assert!(state.should_fire(config(), 20, true));
    }

    #[test]
    fn trigger_respects_cooldown_and_event_cap() {
        let mut state = DonorSessionTriggerState::new();
        state.record_recombination_event();
        assert!(!state.should_fire(config(), 100, true));
        state.finish_iterations(10);
        assert!(state.should_fire(config(), 100, true));
        state.record_recombination_event();
        state.finish_iterations(10);
        assert!(!state.should_fire(config(), 100, true));
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

        let choice = select_donor_session(&base, &archive).expect("expected a viable donor session");
        assert_eq!(choice.donor_archive_idx, 1);
        assert_eq!(choice.session_idx, 0);
        assert_eq!(choice.session_disagreement_count, 3);
        assert_eq!(choice.conflict_burden_advantage, 2);
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
    fn donor_selection_chooses_session_with_largest_conflict_burden_advantage() {
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

        let choice = select_donor_session(&base, &archive).expect("expected a viable donor session");
        assert_eq!(choice.session_idx, 1);
        assert_eq!(choice.conflict_burden_advantage, 4);
    }
}
