use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

use super::super::runtime_state::RuntimeState;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct EliteArchiveConfig {
    pub(crate) capacity: usize,
    pub(crate) near_duplicate_session_threshold: usize,
}

impl Default for EliteArchiveConfig {
    fn default() -> Self {
        Self {
            capacity: 4,
            near_duplicate_session_threshold: 1,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum ArchiveUpdateReason {
    Added,
    ReplacedExactDuplicate,
    ReplacedNearDuplicate,
    ReplacedRedundantMember,
    RejectedExactDuplicate,
    RejectedNearDuplicate,
    RejectedNotCompetitive,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ArchiveUpdateOutcome {
    pub(crate) reason: ArchiveUpdateReason,
    pub(crate) slot_index: Option<usize>,
}

#[derive(Debug, Clone)]
pub(crate) struct ArchivedElite {
    pub(crate) state: RuntimeState,
    pub(crate) score: f64,
    pub(crate) session_fingerprints: Vec<u64>,
    pub(crate) session_conflict_burden: Vec<u32>,
}

impl ArchivedElite {
    pub(crate) fn from_state(state: RuntimeState) -> Self {
        let session_fingerprints = build_session_fingerprints(&state);
        let session_conflict_burden = build_session_conflict_burden(&state);
        let score = state.total_score;
        Self {
            state,
            score,
            session_fingerprints,
            session_conflict_burden,
        }
    }

    pub(crate) fn session_disagreement_count(&self, other: &Self) -> usize {
        self.session_fingerprints
            .iter()
            .zip(other.session_fingerprints.iter())
            .filter(|(left, right)| left != right)
            .count()
    }
}

#[derive(Debug, Clone, Default)]
pub(crate) struct EliteArchive {
    config: EliteArchiveConfig,
    elites: Vec<ArchivedElite>,
}

pub(crate) type SearchRootId = u64;

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct CrossRootParentSelectionPolicy {
    pub(crate) max_score_delta_from_best: f64,
    pub(crate) min_session_disagreement: usize,
}

impl Default for CrossRootParentSelectionPolicy {
    fn default() -> Self {
        Self {
            max_score_delta_from_best: f64::INFINITY,
            min_session_disagreement: 1,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CrossRootParentSelectionFailure {
    NotEnoughRoots,
    NoCompetitiveCrossRootPair,
    NoPairMetDisagreementThreshold,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct CrossRootParentChoice {
    pub(crate) left_root_id: SearchRootId,
    pub(crate) left_archive_idx: usize,
    pub(crate) left_score: f64,
    pub(crate) right_root_id: SearchRootId,
    pub(crate) right_archive_idx: usize,
    pub(crate) right_score: f64,
    pub(crate) session_disagreement_count: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct MultiRootElitePoolConfig {
    pub(crate) max_roots: usize,
    pub(crate) per_root_archive: EliteArchiveConfig,
}

impl Default for MultiRootElitePoolConfig {
    fn default() -> Self {
        Self {
            max_roots: 4,
            per_root_archive: EliteArchiveConfig::default(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum MultiRootElitePoolUpdateReason {
    AddedNewRoot,
    ReplacedWeakestRoot,
    RejectedNewRootNotCompetitive,
    UpdatedExistingRoot(ArchiveUpdateReason),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct MultiRootElitePoolUpdateOutcome {
    pub(crate) reason: MultiRootElitePoolUpdateReason,
    pub(crate) root_id: SearchRootId,
    pub(crate) evicted_root_id: Option<SearchRootId>,
    pub(crate) slot_index: Option<usize>,
}

#[derive(Debug, Clone)]
pub(crate) struct RootEliteArchive {
    root_id: SearchRootId,
    archive: EliteArchive,
}

impl RootEliteArchive {
    pub(crate) fn root_id(&self) -> SearchRootId {
        self.root_id
    }

    pub(crate) fn entries(&self) -> &[ArchivedElite] {
        self.archive.entries()
    }

    pub(crate) fn best_score(&self) -> Option<f64> {
        self.archive
            .entries()
            .iter()
            .map(|elite| elite.score)
            .min_by(|left, right| left.total_cmp(right))
    }
}

#[derive(Debug, Clone, Default)]
pub(crate) struct MultiRootElitePool {
    config: MultiRootElitePoolConfig,
    roots: Vec<RootEliteArchive>,
}

impl EliteArchive {
    pub(crate) fn new(config: EliteArchiveConfig) -> Self {
        debug_assert!(config.capacity > 0);
        Self {
            config,
            elites: Vec::with_capacity(config.capacity),
        }
    }

    pub(crate) fn len(&self) -> usize {
        self.elites.len()
    }

    pub(crate) fn is_empty(&self) -> bool {
        self.elites.is_empty()
    }

    pub(crate) fn entries(&self) -> &[ArchivedElite] {
        &self.elites
    }

    pub(crate) fn near_duplicate_session_threshold(&self) -> usize {
        self.config.near_duplicate_session_threshold
    }

    pub(crate) fn consider_state(&mut self, state: RuntimeState) -> ArchiveUpdateOutcome {
        let candidate = ArchivedElite::from_state(state);
        self.consider_elite(candidate)
    }

    pub(crate) fn consider_elite(&mut self, candidate: ArchivedElite) -> ArchiveUpdateOutcome {
        assert!(
            self.config.capacity > 0,
            "elite archive capacity must be >= 1"
        );

        if let Some((idx, distance)) = self.closest_match_index(&candidate) {
            if distance == 0 {
                if candidate.score < self.elites[idx].score {
                    self.elites[idx] = candidate;
                    return ArchiveUpdateOutcome {
                        reason: ArchiveUpdateReason::ReplacedExactDuplicate,
                        slot_index: Some(idx),
                    };
                }
                return ArchiveUpdateOutcome {
                    reason: ArchiveUpdateReason::RejectedExactDuplicate,
                    slot_index: Some(idx),
                };
            }

            if distance <= self.config.near_duplicate_session_threshold {
                if candidate.score < self.elites[idx].score {
                    self.elites[idx] = candidate;
                    return ArchiveUpdateOutcome {
                        reason: ArchiveUpdateReason::ReplacedNearDuplicate,
                        slot_index: Some(idx),
                    };
                }
                return ArchiveUpdateOutcome {
                    reason: ArchiveUpdateReason::RejectedNearDuplicate,
                    slot_index: Some(idx),
                };
            }
        }

        if self.elites.len() < self.config.capacity {
            self.elites.push(candidate);
            return ArchiveUpdateOutcome {
                reason: ArchiveUpdateReason::Added,
                slot_index: Some(self.elites.len() - 1),
            };
        }

        let worst_score = self
            .elites
            .iter()
            .map(|elite| elite.score)
            .max_by(|left, right| left.total_cmp(right))
            .expect("non-empty archive should have a worst score");
        if candidate.score > worst_score {
            return ArchiveUpdateOutcome {
                reason: ArchiveUpdateReason::RejectedNotCompetitive,
                slot_index: None,
            };
        }

        let eviction_idx = self
            .most_redundant_member_index()
            .expect("full archive should have an eviction target");
        self.elites[eviction_idx] = candidate;
        ArchiveUpdateOutcome {
            reason: ArchiveUpdateReason::ReplacedRedundantMember,
            slot_index: Some(eviction_idx),
        }
    }

    fn closest_match_index(&self, candidate: &ArchivedElite) -> Option<(usize, usize)> {
        self.elites
            .iter()
            .enumerate()
            .map(|(idx, elite)| {
                (
                    idx,
                    elite.session_disagreement_count(candidate),
                    elite.score,
                )
            })
            .min_by(|left, right| {
                left.1
                    .cmp(&right.1)
                    .then_with(|| left.2.total_cmp(&right.2))
            })
            .map(|(idx, distance, _)| (idx, distance))
    }

    fn most_redundant_member_index(&self) -> Option<usize> {
        if self.elites.is_empty() {
            return None;
        }

        if self.elites.len() == 1 {
            return Some(0);
        }

        self.elites
            .iter()
            .enumerate()
            .map(|(idx, elite)| {
                (
                    idx,
                    minimum_disagreement_to_others(elite, idx, &self.elites),
                )
            })
            .min_by(|(left_idx, left_distance), (right_idx, right_distance)| {
                left_distance.cmp(right_distance).then_with(|| {
                    self.elites[*right_idx]
                        .score
                        .total_cmp(&self.elites[*left_idx].score)
                })
            })
            .map(|(idx, _)| idx)
    }
}

impl MultiRootElitePool {
    pub(crate) fn new(config: MultiRootElitePoolConfig) -> Self {
        debug_assert!(config.max_roots > 0);
        debug_assert!(config.per_root_archive.capacity > 0);
        Self {
            config,
            roots: Vec::with_capacity(config.max_roots),
        }
    }

    pub(crate) fn root_count(&self) -> usize {
        self.roots.len()
    }

    pub(crate) fn roots(&self) -> &[RootEliteArchive] {
        &self.roots
    }

    pub(crate) fn entries_for_root(&self, root_id: SearchRootId) -> Option<&[ArchivedElite]> {
        self.root(root_id).map(|root| root.entries())
    }

    pub(crate) fn consider_state(
        &mut self,
        root_id: SearchRootId,
        state: RuntimeState,
    ) -> MultiRootElitePoolUpdateOutcome {
        let candidate = ArchivedElite::from_state(state);
        self.consider_elite(root_id, candidate)
    }

    pub(crate) fn consider_elite(
        &mut self,
        root_id: SearchRootId,
        candidate: ArchivedElite,
    ) -> MultiRootElitePoolUpdateOutcome {
        assert!(
            self.config.max_roots > 0,
            "multi-root elite pool max_roots must be >= 1"
        );
        assert!(
            self.config.per_root_archive.capacity > 0,
            "multi-root elite pool per-root archive capacity must be >= 1"
        );

        if let Some(root) = self.root_mut(root_id) {
            let outcome = root.archive.consider_elite(candidate);
            return MultiRootElitePoolUpdateOutcome {
                reason: MultiRootElitePoolUpdateReason::UpdatedExistingRoot(outcome.reason),
                root_id,
                evicted_root_id: None,
                slot_index: outcome.slot_index,
            };
        }

        if self.roots.len() < self.config.max_roots {
            let mut archive = EliteArchive::new(self.config.per_root_archive);
            let outcome = archive.consider_elite(candidate);
            self.roots.push(RootEliteArchive { root_id, archive });
            return MultiRootElitePoolUpdateOutcome {
                reason: MultiRootElitePoolUpdateReason::AddedNewRoot,
                root_id,
                evicted_root_id: None,
                slot_index: outcome.slot_index,
            };
        }

        let (weakest_root_idx, weakest_root_best_score) = self
            .roots
            .iter()
            .enumerate()
            .map(|(idx, root)| {
                (
                    idx,
                    root.best_score()
                        .expect("multi-root pool should not keep empty root archives"),
                )
            })
            .max_by(|left, right| {
                left.1
                    .total_cmp(&right.1)
                    .then_with(|| right.0.cmp(&left.0))
            })
            .expect("full multi-root pool should have a weakest root");

        if candidate.score >= weakest_root_best_score {
            return MultiRootElitePoolUpdateOutcome {
                reason: MultiRootElitePoolUpdateReason::RejectedNewRootNotCompetitive,
                root_id,
                evicted_root_id: None,
                slot_index: None,
            };
        }

        let evicted_root_id = self.roots[weakest_root_idx].root_id;
        let mut archive = EliteArchive::new(self.config.per_root_archive);
        let outcome = archive.consider_elite(candidate);
        self.roots[weakest_root_idx] = RootEliteArchive { root_id, archive };
        MultiRootElitePoolUpdateOutcome {
            reason: MultiRootElitePoolUpdateReason::ReplacedWeakestRoot,
            root_id,
            evicted_root_id: Some(evicted_root_id),
            slot_index: outcome.slot_index,
        }
    }

    pub(crate) fn select_cross_root_parent_pair(
        &self,
        policy: CrossRootParentSelectionPolicy,
    ) -> Result<CrossRootParentChoice, CrossRootParentSelectionFailure> {
        if self.roots.len() < 2 {
            return Err(CrossRootParentSelectionFailure::NotEnoughRoots);
        }

        let best_score = self
            .roots
            .iter()
            .flat_map(|root| root.entries().iter())
            .map(|elite| elite.score)
            .min_by(|left, right| left.total_cmp(right))
            .expect("multi-root pool with roots should have elite scores");

        let score_limit = best_score + policy.max_score_delta_from_best;
        let mut best_choice = None;
        let mut saw_competitive_cross_root_pair = false;

        for left_root_idx in 0..self.roots.len() {
            let left_root = &self.roots[left_root_idx];
            for right_root_idx in (left_root_idx + 1)..self.roots.len() {
                let right_root = &self.roots[right_root_idx];
                for (left_archive_idx, left_elite) in left_root.entries().iter().enumerate() {
                    if left_elite.score > score_limit {
                        continue;
                    }
                    for (right_archive_idx, right_elite) in right_root.entries().iter().enumerate()
                    {
                        if right_elite.score > score_limit {
                            continue;
                        }

                        saw_competitive_cross_root_pair = true;
                        let disagreement = left_elite.session_disagreement_count(right_elite);
                        if disagreement < policy.min_session_disagreement {
                            continue;
                        }

                        let candidate = CrossRootParentChoice {
                            left_root_id: left_root.root_id,
                            left_archive_idx,
                            left_score: left_elite.score,
                            right_root_id: right_root.root_id,
                            right_archive_idx,
                            right_score: right_elite.score,
                            session_disagreement_count: disagreement,
                        };
                        match best_choice {
                            Some(current_best)
                                if !cross_root_choice_better(candidate, current_best) => {}
                            _ => best_choice = Some(candidate),
                        }
                    }
                }
            }
        }

        best_choice.ok_or(if saw_competitive_cross_root_pair {
            CrossRootParentSelectionFailure::NoPairMetDisagreementThreshold
        } else {
            CrossRootParentSelectionFailure::NoCompetitiveCrossRootPair
        })
    }

    pub(crate) fn root(&self, root_id: SearchRootId) -> Option<&RootEliteArchive> {
        self.roots.iter().find(|root| root.root_id == root_id)
    }

    fn root_mut(&mut self, root_id: SearchRootId) -> Option<&mut RootEliteArchive> {
        self.roots.iter_mut().find(|root| root.root_id == root_id)
    }
}

fn cross_root_choice_better(
    candidate: CrossRootParentChoice,
    current_best: CrossRootParentChoice,
) -> bool {
    candidate
        .session_disagreement_count
        .cmp(&current_best.session_disagreement_count)
        .then_with(|| {
            let candidate_sum = candidate.left_score + candidate.right_score;
            let current_sum = current_best.left_score + current_best.right_score;
            candidate_sum.total_cmp(&current_sum)
        })
        .then_with(|| current_best.left_root_id.cmp(&candidate.left_root_id))
        .then_with(|| current_best.right_root_id.cmp(&candidate.right_root_id))
        .then_with(|| {
            current_best
                .left_archive_idx
                .cmp(&candidate.left_archive_idx)
        })
        .then_with(|| {
            current_best
                .right_archive_idx
                .cmp(&candidate.right_archive_idx)
        })
        .is_lt()
}

fn minimum_disagreement_to_others(
    elite: &ArchivedElite,
    elite_idx: usize,
    elites: &[ArchivedElite],
) -> usize {
    elites
        .iter()
        .enumerate()
        .filter(|(idx, _)| *idx != elite_idx)
        .map(|(_, other)| elite.session_disagreement_count(other))
        .min()
        .unwrap_or(usize::MAX)
}

pub(crate) fn build_session_fingerprints(state: &RuntimeState) -> Vec<u64> {
    (0..state.compiled.num_sessions)
        .map(|session_idx| build_session_fingerprint(state, session_idx))
        .collect()
}

fn build_session_fingerprint(state: &RuntimeState, session_idx: usize) -> u64 {
    let mut hasher = DefaultHasher::new();
    session_idx.hash(&mut hasher);
    for group_idx in 0..state.compiled.num_groups {
        group_idx.hash(&mut hasher);
        let mut members = state.group_members[state.group_slot(session_idx, group_idx)].clone();
        members.sort_unstable();
        members.hash(&mut hasher);
    }
    hasher.finish()
}

pub(crate) fn build_session_conflict_burden(state: &RuntimeState) -> Vec<u32> {
    let Some(repeat_encounter) = state.compiled.repeat_encounter.as_ref() else {
        return vec![0; state.compiled.num_sessions];
    };

    let max_allowed_encounters = repeat_encounter.max_allowed_encounters as u16;
    let mut burden = vec![0u32; state.compiled.num_sessions];
    for (session_idx, session_burden) in burden.iter_mut().enumerate() {
        for group_idx in 0..state.compiled.num_groups {
            let members = &state.group_members[state.group_slot(session_idx, group_idx)];
            for left_idx in 0..members.len() {
                for right_idx in (left_idx + 1)..members.len() {
                    let pair_idx = state
                        .compiled
                        .pair_idx(members[left_idx], members[right_idx]);
                    let excess =
                        state.pair_contacts[pair_idx].saturating_sub(max_allowed_encounters);
                    *session_burden += excess as u32;
                }
            }
        }
    }
    burden
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use crate::default_solver_configuration_for;
    use crate::models::{
        ApiInput, Constraint, Group, Objective, Person, ProblemDefinition, RepeatEncounterParams,
        SolverKind,
    };

    use super::{
        ArchiveUpdateReason, ArchivedElite, CrossRootParentSelectionFailure,
        CrossRootParentSelectionPolicy, EliteArchive, EliteArchiveConfig, MultiRootElitePool,
        MultiRootElitePoolConfig, MultiRootElitePoolUpdateReason,
    };
    use crate::solver3::runtime_state::RuntimeState;

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
            schedule.insert(format!("session_{}", session_idx), session);
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
    fn archived_elite_captures_session_fingerprints_and_repeat_conflict_burden() {
        let state = state_from_schedule(
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            ],
            true,
            10.0,
        );

        let elite = ArchivedElite::from_state(state);
        assert_eq!(elite.session_fingerprints.len(), 2);
        assert_eq!(elite.session_conflict_burden, vec![2, 2]);
    }

    #[test]
    fn elite_archive_replaces_worse_exact_duplicate() {
        let base = state_from_schedule(
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                vec![vec!["p0", "p3"], vec!["p1", "p2"]],
            ],
            true,
            10.0,
        );
        let duplicate_better = state_from_schedule(
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                vec![vec!["p0", "p3"], vec!["p1", "p2"]],
            ],
            true,
            9.0,
        );

        let mut archive = EliteArchive::new(EliteArchiveConfig::default());
        let first = archive.consider_state(base);
        let second = archive.consider_state(duplicate_better);

        assert_eq!(first.reason, ArchiveUpdateReason::Added);
        assert_eq!(second.reason, ArchiveUpdateReason::ReplacedExactDuplicate);
        assert_eq!(archive.len(), 1);
        assert_eq!(archive.entries()[0].score, 9.0);
    }

    #[test]
    fn elite_archive_rejects_worse_near_duplicate_candidate() {
        let base = state_from_schedule(
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                vec![vec!["p0", "p3"], vec!["p1", "p2"]],
            ],
            true,
            10.0,
        );
        let near_duplicate_worse = state_from_schedule(
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            ],
            true,
            12.0,
        );

        let mut archive = EliteArchive::new(EliteArchiveConfig::default());
        archive.consider_state(base);
        let outcome = archive.consider_state(near_duplicate_worse);

        assert_eq!(outcome.reason, ArchiveUpdateReason::RejectedNearDuplicate);
        assert_eq!(archive.len(), 1);
        assert_eq!(archive.entries()[0].score, 10.0);
    }

    #[test]
    fn elite_archive_evicts_worst_redundant_member_for_novel_competitive_candidate() {
        let state_a = state_from_schedule(
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                vec![vec!["p0", "p3"], vec!["p1", "p2"]],
            ],
            true,
            10.0,
        );
        let state_b = state_from_schedule(
            vec![
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                vec![vec!["p0", "p3"], vec!["p1", "p2"]],
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            ],
            true,
            14.0,
        );
        let state_c = state_from_schedule(
            vec![
                vec![vec!["p0", "p3"], vec!["p1", "p2"]],
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            ],
            true,
            13.0,
        );
        let state_d = state_from_schedule(
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p3"], vec!["p1", "p2"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            ],
            true,
            12.0,
        );

        let mut archive = EliteArchive::new(EliteArchiveConfig {
            capacity: 3,
            near_duplicate_session_threshold: 1,
        });
        archive.consider_state(state_a);
        archive.consider_state(state_b);
        archive.consider_state(state_c);
        let outcome = archive.consider_state(state_d);

        assert_eq!(outcome.reason, ArchiveUpdateReason::ReplacedRedundantMember);
        assert_eq!(archive.len(), 3);
        let scores: Vec<f64> = archive.entries().iter().map(|elite| elite.score).collect();
        assert!(scores.contains(&10.0));
        assert!(scores.contains(&13.0));
        assert!(scores.contains(&12.0));
        assert!(!scores.contains(&14.0));
    }

    #[test]
    fn multi_root_pool_tracks_roots_and_replaces_weakest_root() {
        let root_a = state_from_schedule(
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                vec![vec!["p0", "p3"], vec!["p1", "p2"]],
            ],
            true,
            10.0,
        );
        let root_b = state_from_schedule(
            vec![
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                vec![vec!["p0", "p3"], vec!["p1", "p2"]],
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            ],
            true,
            14.0,
        );
        let root_c = state_from_schedule(
            vec![
                vec![vec!["p0", "p3"], vec!["p1", "p2"]],
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            ],
            true,
            11.0,
        );
        let root_d = state_from_schedule(
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p3"], vec!["p1", "p2"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            ],
            true,
            15.0,
        );

        let mut pool = MultiRootElitePool::new(MultiRootElitePoolConfig {
            max_roots: 2,
            per_root_archive: EliteArchiveConfig::default(),
        });

        let add_a = pool.consider_state(10, root_a);
        let add_b = pool.consider_state(20, root_b);
        let replace_b = pool.consider_state(30, root_c);
        let reject_d = pool.consider_state(40, root_d);

        assert_eq!(add_a.reason, MultiRootElitePoolUpdateReason::AddedNewRoot);
        assert_eq!(add_b.reason, MultiRootElitePoolUpdateReason::AddedNewRoot);
        assert_eq!(
            replace_b.reason,
            MultiRootElitePoolUpdateReason::ReplacedWeakestRoot
        );
        assert_eq!(replace_b.evicted_root_id, Some(20));
        assert_eq!(
            reject_d.reason,
            MultiRootElitePoolUpdateReason::RejectedNewRootNotCompetitive
        );
        assert_eq!(pool.root_count(), 2);
        assert!(pool.root(10).is_some());
        assert!(pool.root(30).is_some());
        assert!(pool.root(20).is_none());
    }

    #[test]
    fn multi_root_parent_selection_rejects_same_root_only_pool() {
        let state_a = state_from_schedule(
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                vec![vec!["p0", "p3"], vec!["p1", "p2"]],
            ],
            true,
            10.0,
        );
        let state_b = state_from_schedule(
            vec![
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p3"], vec!["p1", "p2"]],
            ],
            true,
            11.0,
        );

        let mut pool = MultiRootElitePool::new(MultiRootElitePoolConfig {
            max_roots: 3,
            per_root_archive: EliteArchiveConfig {
                capacity: 2,
                near_duplicate_session_threshold: 0,
            },
        });
        pool.consider_state(10, state_a);
        pool.consider_state(10, state_b);

        let failure = pool
            .select_cross_root_parent_pair(CrossRootParentSelectionPolicy::default())
            .expect_err("same-root-only pool should not produce unrelated parent pair");

        assert_eq!(failure, CrossRootParentSelectionFailure::NotEnoughRoots);
    }

    #[test]
    fn multi_root_parent_selection_prefers_competitive_cross_root_pair() {
        let state_a = state_from_schedule(
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                vec![vec!["p0", "p3"], vec!["p1", "p2"]],
            ],
            true,
            10.0,
        );
        let state_b = state_from_schedule(
            vec![
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                vec![vec!["p0", "p3"], vec!["p1", "p2"]],
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            ],
            true,
            11.0,
        );
        let state_c = state_from_schedule(
            vec![
                vec![vec!["p0", "p3"], vec!["p1", "p2"]],
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            ],
            true,
            17.5,
        );

        let mut pool = MultiRootElitePool::new(MultiRootElitePoolConfig {
            max_roots: 3,
            per_root_archive: EliteArchiveConfig::default(),
        });
        pool.consider_state(10, state_a);
        pool.consider_state(20, state_b);
        pool.consider_state(30, state_c);

        let choice = pool
            .select_cross_root_parent_pair(CrossRootParentSelectionPolicy {
                max_score_delta_from_best: 2.0,
                min_session_disagreement: 2,
            })
            .expect("competitive cross-root pair should exist");

        assert_eq!((choice.left_root_id, choice.right_root_id), (10, 20));
        assert!(choice.session_disagreement_count >= 2);
        assert!(choice.left_score <= 12.0);
        assert!(choice.right_score <= 12.0);
    }

    #[test]
    fn multi_root_parent_selection_reports_disagreement_threshold_failure() {
        let state_a = state_from_schedule(
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                vec![vec!["p0", "p3"], vec!["p1", "p2"]],
            ],
            true,
            10.0,
        );
        let state_b = state_from_schedule(
            vec![
                vec![vec!["p0", "p1"], vec!["p2", "p3"]],
                vec![vec!["p0", "p2"], vec!["p1", "p3"]],
                vec![vec!["p0", "p3"], vec!["p1", "p2"]],
            ],
            true,
            10.5,
        );

        let mut pool = MultiRootElitePool::new(MultiRootElitePoolConfig {
            max_roots: 2,
            per_root_archive: EliteArchiveConfig::default(),
        });
        pool.consider_state(10, state_a);
        pool.consider_state(20, state_b);

        let failure = pool
            .select_cross_root_parent_pair(CrossRootParentSelectionPolicy {
                max_score_delta_from_best: 1.0,
                min_session_disagreement: 1,
            })
            .expect_err("identical cross-root parents should fail disagreement threshold");

        assert_eq!(
            failure,
            CrossRootParentSelectionFailure::NoPairMetDisagreementThreshold
        );
    }
}
