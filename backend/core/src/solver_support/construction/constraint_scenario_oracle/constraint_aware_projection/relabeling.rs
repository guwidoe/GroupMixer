use std::cmp::Ordering;
use std::collections::{BTreeMap, BTreeSet};

use crate::solver3::compiled_problem::CompiledProblem;

use super::super::types::OracleTemplateCandidate;
use super::atoms::{
    AttributeBalanceProjectionAtom, CapacityProjectionAtom, CliqueProjectionAtom,
    HardApartProjectionAtom, ImmovableTripleProjectionAtom, PairMeetingProjectionAtom,
    ProjectionAtom, ProjectionAtomSet, SoftPairProjectionAtom,
};
use super::deadline::RelabelingSearchBudget;

const UNMAPPED_PERSON_COST: f64 = 0.05;
const UNMAPPED_SESSION_COST: f64 = 0.25;
const UNMAPPED_SLOT_COST: f64 = 0.01;
const RELABELING_BEAM_WIDTH: usize = 16;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum RelabelingAtomFamily {
    Clique,
    HardApart,
    AttributeBalance,
    ImmovableTriple,
    PairMeeting,
    SoftApart,
    ShouldTogether,
    Capacity,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
struct RelabelingConstraintKey {
    family: RelabelingAtomFamily,
    idx: usize,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub(super) struct RelabelingScore {
    /// Lower is better; finite scenario-hard costs are intentionally tradeable against structure.
    pub(super) total_cost: f64,
    /// Higher is better and used by the current greedy scaffold.
    pub(super) objective_value: f64,
    pub(super) hard_compatibility_cost: f64,
    pub(super) soft_penalty_cost: f64,
    pub(super) mapping_incompleteness_cost: f64,
    pub(super) structural_reward: f64,
    pub(super) contact_reward: f64,
    pub(super) mapping_reward: f64,
    pub(super) hard: RelabelingHardBreakdown,
    pub(super) soft: RelabelingSoftBreakdown,
    pub(super) mapping: RelabelingMappingBreakdown,
    pub(super) coverage: RelabelingCoverageBreakdown,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub(super) struct RelabelingHardBreakdown {
    pub(super) immovable_cost: f64,
    pub(super) clique_cost: f64,
    pub(super) hard_apart_cost: f64,
    pub(super) capacity_cost: f64,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub(super) struct RelabelingSoftBreakdown {
    pub(super) attribute_balance_penalty: f64,
    pub(super) pair_meeting_penalty: f64,
    pub(super) soft_pair_penalty: f64,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub(super) struct RelabelingMappingBreakdown {
    pub(super) mapped_people: usize,
    pub(super) unmapped_people: usize,
    pub(super) mapped_sessions: usize,
    pub(super) unmapped_sessions: usize,
    pub(super) mapped_slots: usize,
    pub(super) unmapped_slots: usize,
    pub(super) incompleteness_cost: f64,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub(super) struct RelabelingCoverageBreakdown {
    pub(super) covered_constraint_units: usize,
    pub(super) uncovered_constraint_units: usize,
    pub(super) accepted_atom_count: usize,
}

#[derive(Debug, Clone, PartialEq, Default)]
struct RelabelingScoreImpact {
    hard_compatibility_cost: f64,
    soft_penalty_cost: f64,
    structural_reward: f64,
    contact_reward: f64,
    mapping_reward: f64,
    hard: RelabelingHardBreakdown,
    soft: RelabelingSoftBreakdown,
}

impl RelabelingScoreImpact {
    fn total_cost(&self) -> f64 {
        self.hard_compatibility_cost + self.soft_penalty_cost
    }

    fn structural_reward(value: f64) -> Self {
        Self {
            structural_reward: value.max(0.0),
            ..Self::default()
        }
    }

    fn hard_cost(family: RelabelingAtomFamily, value: f64) -> Self {
        let value = value.max(0.0);
        let mut impact = Self {
            hard_compatibility_cost: value,
            ..Self::default()
        };
        match family {
            RelabelingAtomFamily::Clique => impact.hard.clique_cost = value,
            RelabelingAtomFamily::HardApart => impact.hard.hard_apart_cost = value,
            RelabelingAtomFamily::ImmovableTriple => impact.hard.immovable_cost = value,
            RelabelingAtomFamily::Capacity => impact.hard.capacity_cost = value,
            RelabelingAtomFamily::AttributeBalance
            | RelabelingAtomFamily::PairMeeting
            | RelabelingAtomFamily::SoftApart
            | RelabelingAtomFamily::ShouldTogether => {}
        }
        impact
    }

    fn soft_cost(family: RelabelingAtomFamily, value: f64) -> Self {
        let value = value.max(0.0);
        let mut impact = Self {
            soft_penalty_cost: value,
            ..Self::default()
        };
        match family {
            RelabelingAtomFamily::AttributeBalance => {
                impact.soft.attribute_balance_penalty = value;
            }
            RelabelingAtomFamily::PairMeeting => impact.soft.pair_meeting_penalty = value,
            RelabelingAtomFamily::SoftApart | RelabelingAtomFamily::ShouldTogether => {
                impact.soft.soft_pair_penalty = value;
            }
            RelabelingAtomFamily::Clique
            | RelabelingAtomFamily::HardApart
            | RelabelingAtomFamily::ImmovableTriple
            | RelabelingAtomFamily::Capacity => {}
        }
        impact
    }
}

impl RelabelingScore {
    fn apply(&mut self, impact: &RelabelingScoreImpact) {
        self.hard_compatibility_cost += impact.hard_compatibility_cost;
        self.soft_penalty_cost += impact.soft_penalty_cost;
        self.structural_reward += impact.structural_reward;
        self.contact_reward += impact.contact_reward;
        self.mapping_reward += impact.mapping_reward;
        self.hard.immovable_cost += impact.hard.immovable_cost;
        self.hard.clique_cost += impact.hard.clique_cost;
        self.hard.hard_apart_cost += impact.hard.hard_apart_cost;
        self.hard.capacity_cost += impact.hard.capacity_cost;
        self.soft.attribute_balance_penalty += impact.soft.attribute_balance_penalty;
        self.soft.pair_meeting_penalty += impact.soft.pair_meeting_penalty;
        self.soft.soft_pair_penalty += impact.soft.soft_pair_penalty;
        self.recompute_totals();
    }

    fn recompute_totals(&mut self) {
        self.total_cost = self.hard_compatibility_cost
            + self.soft_penalty_cost
            + self.mapping_incompleteness_cost;
        self.objective_value =
            self.structural_reward + self.contact_reward + self.mapping_reward - self.total_cost;
    }
}

/// Best-effort relabeling search result.
///
/// The relabeler is intentionally timeout-aware from the start: callers get the best internally
/// consistent partial mapping found so far, plus explicit timeout/search telemetry. The current
/// reconciliation logic is still a conservative scaffold, but the API contract already matches the
/// desired production behavior for future beam/backtracking search.
#[derive(Debug, Clone, PartialEq)]
pub(super) struct TimedRelabelingSearchResult {
    pub(super) best: ProjectionRelabeling,
    pub(super) timed_out: bool,
    pub(super) atoms_considered: usize,
    pub(super) atoms_accepted: usize,
    pub(super) elapsed_seconds: f64,
}

/// Partial bijective relabeling from oracle-local labels to real solver labels.
#[derive(Debug, Clone, PartialEq)]
pub(super) struct ProjectionRelabeling {
    real_person_by_oracle_person: Vec<Option<usize>>,
    oracle_person_by_real_person: Vec<Option<usize>>,
    clique_oracle_candidates_by_real_person: Vec<Option<BTreeSet<usize>>>,
    real_session_by_oracle_session: Vec<Option<usize>>,
    oracle_session_by_real_session: Vec<Option<usize>>,
    real_group_by_oracle_session_group: Vec<Vec<Option<usize>>>,
    oracle_slot_by_real_session_group: Vec<Option<(usize, usize)>>,
    covered_constraint_keys: Vec<RelabelingConstraintKey>,
    score: RelabelingScore,
    accepted_atom_count: usize,
}

impl ProjectionRelabeling {
    fn empty(compiled: &CompiledProblem, candidate: &OracleTemplateCandidate) -> Self {
        Self {
            real_person_by_oracle_person: vec![None; candidate.oracle_capacity],
            oracle_person_by_real_person: vec![None; compiled.num_people],
            clique_oracle_candidates_by_real_person: vec![None; compiled.num_people],
            real_session_by_oracle_session: vec![None; candidate.num_sessions()],
            oracle_session_by_real_session: vec![None; compiled.num_sessions],
            real_group_by_oracle_session_group: vec![
                vec![None; candidate.num_groups];
                candidate.num_sessions()
            ],
            oracle_slot_by_real_session_group: vec![
                None;
                compiled.num_sessions * compiled.num_groups
            ],
            covered_constraint_keys: Vec::new(),
            score: RelabelingScore::default(),
            accepted_atom_count: 0,
        }
    }

    pub(super) fn score(&self) -> &RelabelingScore {
        &self.score
    }

    pub(super) fn maps_real_person(&self, real_person: usize) -> bool {
        self.oracle_person_by_real_person
            .get(real_person)
            .is_some_and(Option::is_some)
    }

    pub(super) fn maps_real_session(&self, real_session: usize) -> bool {
        self.oracle_session_by_real_session
            .get(real_session)
            .is_some_and(Option::is_some)
    }

    pub(super) fn maps_real_group_slot(
        &self,
        compiled: &CompiledProblem,
        real_session: usize,
        real_group: usize,
    ) -> bool {
        if real_session >= compiled.num_sessions || real_group >= compiled.num_groups {
            return false;
        }
        self.oracle_slot_by_real_session_group[real_session * compiled.num_groups + real_group]
            .is_some()
    }

    pub(super) fn is_shape_compatible(
        &self,
        compiled: &CompiledProblem,
        candidate: &OracleTemplateCandidate,
    ) -> bool {
        self.real_person_by_oracle_person.len() == candidate.oracle_capacity
            && self.oracle_person_by_real_person.len() == compiled.num_people
            && self.clique_oracle_candidates_by_real_person.len() == compiled.num_people
            && self.real_session_by_oracle_session.len() == candidate.num_sessions()
            && self.oracle_session_by_real_session.len() == compiled.num_sessions
            && self.real_group_by_oracle_session_group.len() == candidate.num_sessions()
            && self
                .real_group_by_oracle_session_group
                .iter()
                .all(|groups| groups.len() == candidate.num_groups)
            && self.oracle_slot_by_real_session_group.len()
                == compiled.num_sessions * compiled.num_groups
    }

    fn try_accept_atom(
        &mut self,
        compiled: &CompiledProblem,
        candidate: &OracleTemplateCandidate,
        atom: &ProjectionAtom,
    ) -> bool {
        let mut next = self.clone();
        let score = match atom {
            ProjectionAtom::Clique(atom) => next.try_accept_clique_atom(compiled, candidate, atom),
            ProjectionAtom::HardApart(atom) => next.try_accept_hard_apart_atom(candidate, atom),
            ProjectionAtom::AttributeBalance(atom) => {
                next.try_accept_attribute_balance_atom(compiled, candidate, atom)
            }
            ProjectionAtom::ImmovableTriple(atom) => {
                next.try_accept_immovable_atom(compiled, candidate, atom)
            }
            ProjectionAtom::PairMeeting(atom) => next.try_accept_pair_meeting_atom(candidate, atom),
            ProjectionAtom::SoftApart(atom) | ProjectionAtom::ShouldTogether(atom) => {
                next.try_accept_soft_pair_atom(candidate, atom)
            }
            ProjectionAtom::Capacity(atom) => {
                next.try_accept_capacity_atom(compiled, candidate, atom)
            }
        };
        let Some(score) = score else {
            return false;
        };
        next.score.apply(&score);
        next.cover_constraint(atom.constraint_key(compiled));
        next.accepted_atom_count += 1;
        next.score.coverage.accepted_atom_count = next.accepted_atom_count;
        *self = next;
        true
    }

    fn cover_constraint(&mut self, key: RelabelingConstraintKey) {
        if !self.covered_constraint_keys.contains(&key) {
            self.covered_constraint_keys.push(key);
            self.score.coverage.covered_constraint_units = self.covered_constraint_keys.len();
        }
    }

    fn mapping_breakdown(&self) -> RelabelingMappingBreakdown {
        let mapped_people = self
            .real_person_by_oracle_person
            .iter()
            .filter(|mapping| mapping.is_some())
            .count();
        let mapped_sessions = self
            .real_session_by_oracle_session
            .iter()
            .filter(|mapping| mapping.is_some())
            .count();
        let mapped_slots = self
            .real_group_by_oracle_session_group
            .iter()
            .flatten()
            .filter(|mapping| mapping.is_some())
            .count();
        let unmapped_people = self.real_person_by_oracle_person.len() - mapped_people;
        let unmapped_sessions = self.real_session_by_oracle_session.len() - mapped_sessions;
        let total_slots = self
            .real_group_by_oracle_session_group
            .iter()
            .map(Vec::len)
            .sum::<usize>();
        let unmapped_slots = total_slots - mapped_slots;
        RelabelingMappingBreakdown {
            mapped_people,
            unmapped_people,
            mapped_sessions,
            unmapped_sessions,
            mapped_slots,
            unmapped_slots,
            incompleteness_cost: unmapped_people as f64 * UNMAPPED_PERSON_COST
                + unmapped_sessions as f64 * UNMAPPED_SESSION_COST
                + unmapped_slots as f64 * UNMAPPED_SLOT_COST,
        }
    }

    fn score_with_uncovered_penalties(
        &self,
        uncovered_penalty_by_key: &BTreeMap<RelabelingConstraintKey, RelabelingScoreImpact>,
    ) -> RelabelingScore {
        let mut score = self.score.clone();
        let mut uncovered_count = 0usize;
        for (key, penalty) in uncovered_penalty_by_key {
            if self.covered_constraint_keys.contains(&key) {
                continue;
            }
            score.apply(&penalty);
            uncovered_count += 1;
        }
        score.coverage.covered_constraint_units = self.covered_constraint_keys.len();
        score.coverage.uncovered_constraint_units = uncovered_count;
        score.coverage.accepted_atom_count = self.accepted_atom_count;
        score.mapping = self.mapping_breakdown();
        score.mapping_incompleteness_cost = score.mapping.incompleteness_cost;
        score.recompute_totals();
        score
    }

    fn try_accept_clique_atom(
        &mut self,
        compiled: &CompiledProblem,
        candidate: &OracleTemplateCandidate,
        atom: &CliqueProjectionAtom,
    ) -> Option<RelabelingScoreImpact> {
        if !self.bind_group_slot(
            compiled,
            candidate,
            atom.oracle_session_pos,
            atom.oracle_group_idx,
            single_session(atom.real_sessions.as_slice())?,
            candidate_group_for_session(candidate, atom.oracle_session_pos, atom.oracle_group_idx)?,
        ) {
            return None;
        }
        if !self.refine_clique_person_candidates(compiled, candidate, atom) {
            return None;
        }
        Some(RelabelingScoreImpact::structural_reward(
            (atom.required_people_count * atom.real_sessions.len()).max(1) as f64 * 10.0,
        ))
    }

    fn refine_clique_person_candidates(
        &mut self,
        compiled: &CompiledProblem,
        candidate: &OracleTemplateCandidate,
        atom: &CliqueProjectionAtom,
    ) -> bool {
        let oracle_pool = atom
            .oracle_people_pool
            .iter()
            .copied()
            .collect::<BTreeSet<_>>();
        for &real_person in &atom.real_people {
            if clique_member_occurrence_count(compiled, real_person) <= 1 {
                continue;
            }
            if !self.refine_clique_person_candidate_set(candidate, real_person, &oracle_pool) {
                return false;
            }
        }
        true
    }

    fn refine_clique_person_candidate_set(
        &mut self,
        candidate: &OracleTemplateCandidate,
        real_person: usize,
        oracle_pool: &BTreeSet<usize>,
    ) -> bool {
        if real_person >= self.oracle_person_by_real_person.len()
            || oracle_pool
                .iter()
                .any(|&person| person >= candidate.oracle_capacity)
        {
            return false;
        }
        if let Some(mapped_oracle) = self.oracle_person_by_real_person[real_person] {
            return oracle_pool.contains(&mapped_oracle);
        }

        let mut next_candidates = self.clique_oracle_candidates_by_real_person[real_person]
            .as_ref()
            .map(|existing| {
                existing
                    .intersection(oracle_pool)
                    .copied()
                    .collect::<BTreeSet<_>>()
            })
            .unwrap_or_else(|| oracle_pool.clone());
        next_candidates.retain(|&oracle_person| {
            self.real_person_by_oracle_person[oracle_person]
                .is_none_or(|mapped_real| mapped_real == real_person)
        });
        if next_candidates.is_empty() {
            return false;
        }
        if next_candidates.len() == 1 {
            let oracle_person = *next_candidates.iter().next().expect("singleton candidate");
            if !self.bind_person(candidate, oracle_person, real_person) {
                return false;
            }
        }
        self.clique_oracle_candidates_by_real_person[real_person] = Some(next_candidates);
        true
    }

    fn try_accept_hard_apart_atom(
        &mut self,
        candidate: &OracleTemplateCandidate,
        atom: &HardApartProjectionAtom,
    ) -> Option<RelabelingScoreImpact> {
        if !self.bind_weak_pair_factor(candidate, atom.oracle_people, atom.real_people) {
            return None;
        }
        Some(RelabelingScoreImpact::structural_reward(
            atom.real_sessions.len().max(1) as f64 * 5.0,
        ))
    }

    fn try_accept_attribute_balance_atom(
        &mut self,
        compiled: &CompiledProblem,
        candidate: &OracleTemplateCandidate,
        atom: &AttributeBalanceProjectionAtom,
    ) -> Option<RelabelingScoreImpact> {
        if !self.bind_group_slot(
            compiled,
            candidate,
            atom.oracle_session_pos,
            atom.oracle_group_idx,
            atom.real_session,
            atom.real_group,
        ) {
            return None;
        }
        let desired_people = atom
            .desired_counts
            .iter()
            .map(|&(_, count)| count as usize)
            .sum::<usize>()
            .max(1);
        Some(RelabelingScoreImpact::structural_reward(
            atom.penalty_weight.max(0.0) * desired_people as f64,
        ))
    }

    fn try_accept_immovable_atom(
        &mut self,
        compiled: &CompiledProblem,
        candidate: &OracleTemplateCandidate,
        atom: &ImmovableTripleProjectionAtom,
    ) -> Option<RelabelingScoreImpact> {
        if !self.bind_group_slot(
            compiled,
            candidate,
            atom.oracle_session_pos,
            atom.oracle_group_idx,
            atom.real_session,
            atom.real_group,
        ) {
            return None;
        }
        if immovable_person_occurrence_count(compiled, atom.real_person) > 2 {
            if !self.bind_person(candidate, atom.oracle_person, atom.real_person) {
                return None;
            }
        } else if !self.bind_person_if_already_anchored(
            candidate,
            atom.oracle_person,
            atom.real_person,
        ) {
            return None;
        }
        Some(RelabelingScoreImpact::structural_reward(20.0))
    }

    fn try_accept_pair_meeting_atom(
        &mut self,
        candidate: &OracleTemplateCandidate,
        atom: &PairMeetingProjectionAtom,
    ) -> Option<RelabelingScoreImpact> {
        if !self.bind_weak_pair_factor(candidate, atom.oracle_people, atom.real_people) {
            return None;
        }
        let mut impact = RelabelingScoreImpact::soft_cost(
            RelabelingAtomFamily::PairMeeting,
            atom.projected_penalty,
        );
        impact.contact_reward = (atom.penalty_weight * (atom.target_meetings as f64 + 1.0)
            + atom.real_sessions.len().max(1) as f64)
            .max(0.0);
        Some(impact)
    }

    fn try_accept_soft_pair_atom(
        &mut self,
        candidate: &OracleTemplateCandidate,
        atom: &SoftPairProjectionAtom,
    ) -> Option<RelabelingScoreImpact> {
        if !self.bind_weak_pair_factor(candidate, atom.oracle_people, atom.real_people) {
            return None;
        }
        let session_count = atom.oracle_session_positions.len() as f64;
        let oracle_meetings = atom.oracle_meetings as f64;
        let realized_penalty = if atom.prefers_together {
            (session_count - oracle_meetings).max(0.0) * atom.penalty_weight.max(0.0)
        } else {
            oracle_meetings * atom.penalty_weight.max(0.0)
        };
        let mut impact = RelabelingScoreImpact::soft_cost(
            if atom.prefers_together {
                RelabelingAtomFamily::ShouldTogether
            } else {
                RelabelingAtomFamily::SoftApart
            },
            realized_penalty,
        );
        impact.contact_reward = session_count.max(1.0) * atom.penalty_weight.max(0.0);
        Some(impact)
    }

    fn try_accept_capacity_atom(
        &mut self,
        compiled: &CompiledProblem,
        candidate: &OracleTemplateCandidate,
        atom: &CapacityProjectionAtom,
    ) -> Option<RelabelingScoreImpact> {
        if !self.bind_group_slot(
            compiled,
            candidate,
            atom.oracle_session_pos,
            atom.oracle_group_idx,
            atom.real_session,
            atom.real_group,
        ) {
            return None;
        }
        Some(RelabelingScoreImpact::structural_reward(
            (atom.real_capacity.saturating_sub(atom.oracle_group_size) + 1) as f64,
        ))
    }

    fn bind_person_if_already_anchored(
        &mut self,
        candidate: &OracleTemplateCandidate,
        oracle_person: usize,
        real_person: usize,
    ) -> bool {
        if oracle_person >= candidate.oracle_capacity
            || real_person >= self.oracle_person_by_real_person.len()
        {
            return false;
        }
        let has_existing_person_anchor = self.real_person_by_oracle_person[oracle_person].is_some()
            || self.oracle_person_by_real_person[real_person].is_some();
        if !has_existing_person_anchor {
            return true;
        }
        self.bind_person(candidate, oracle_person, real_person)
    }

    fn bind_weak_pair_factor(
        &mut self,
        candidate: &OracleTemplateCandidate,
        oracle_people: [usize; 2],
        real_people: [usize; 2],
    ) -> bool {
        if oracle_people
            .iter()
            .any(|&person| person >= candidate.oracle_capacity)
            || real_people
                .iter()
                .any(|&person| person >= self.oracle_person_by_real_person.len())
        {
            return false;
        }
        let has_existing_person_anchor = oracle_people
            .iter()
            .any(|&person| self.real_person_by_oracle_person[person].is_some())
            || real_people
                .iter()
                .any(|&person| self.oracle_person_by_real_person[person].is_some());
        if !has_existing_person_anchor {
            return true;
        }
        self.bind_unordered_pair(candidate, oracle_people, real_people)
    }

    fn bind_unordered_pair(
        &mut self,
        candidate: &OracleTemplateCandidate,
        oracle_people: [usize; 2],
        real_people: [usize; 2],
    ) -> bool {
        let mut direct = self.clone();
        if direct.bind_person(candidate, oracle_people[0], real_people[0])
            && direct.bind_person(candidate, oracle_people[1], real_people[1])
        {
            *self = direct;
            return true;
        }

        let mut swapped = self.clone();
        if swapped.bind_person(candidate, oracle_people[0], real_people[1])
            && swapped.bind_person(candidate, oracle_people[1], real_people[0])
        {
            *self = swapped;
            return true;
        }
        false
    }

    fn bind_person(
        &mut self,
        candidate: &OracleTemplateCandidate,
        oracle_person: usize,
        real_person: usize,
    ) -> bool {
        if oracle_person >= candidate.oracle_capacity
            || real_person >= self.oracle_person_by_real_person.len()
        {
            return false;
        }
        if self.real_person_by_oracle_person[oracle_person]
            .is_some_and(|mapped| mapped != real_person)
            || self.oracle_person_by_real_person[real_person]
                .is_some_and(|mapped| mapped != oracle_person)
        {
            return false;
        }
        self.real_person_by_oracle_person[oracle_person] = Some(real_person);
        self.oracle_person_by_real_person[real_person] = Some(oracle_person);
        true
    }

    fn bind_group_slot(
        &mut self,
        compiled: &CompiledProblem,
        candidate: &OracleTemplateCandidate,
        oracle_session_pos: usize,
        oracle_group_idx: usize,
        real_session: usize,
        real_group: usize,
    ) -> bool {
        if oracle_session_pos >= candidate.num_sessions()
            || oracle_group_idx >= candidate.num_groups
            || real_session >= compiled.num_sessions
            || real_group >= compiled.num_groups
        {
            return false;
        }
        if !self.bind_session(oracle_session_pos, real_session) {
            return false;
        }
        let reverse_slot = real_session * compiled.num_groups + real_group;
        if self.real_group_by_oracle_session_group[oracle_session_pos][oracle_group_idx]
            .is_some_and(|mapped| mapped != real_group)
            || self.oracle_slot_by_real_session_group[reverse_slot]
                .is_some_and(|mapped| mapped != (oracle_session_pos, oracle_group_idx))
        {
            return false;
        }
        self.real_group_by_oracle_session_group[oracle_session_pos][oracle_group_idx] =
            Some(real_group);
        self.oracle_slot_by_real_session_group[reverse_slot] =
            Some((oracle_session_pos, oracle_group_idx));
        true
    }

    fn bind_session(&mut self, oracle_session_pos: usize, real_session: usize) -> bool {
        if oracle_session_pos >= self.real_session_by_oracle_session.len()
            || real_session >= self.oracle_session_by_real_session.len()
        {
            return false;
        }
        if self.real_session_by_oracle_session[oracle_session_pos]
            .is_some_and(|mapped| mapped != real_session)
            || self.oracle_session_by_real_session[real_session]
                .is_some_and(|mapped| mapped != oracle_session_pos)
        {
            return false;
        }
        self.real_session_by_oracle_session[oracle_session_pos] = Some(real_session);
        self.oracle_session_by_real_session[real_session] = Some(oracle_session_pos);
        true
    }
}

impl ProjectionAtom {
    fn constraint_key(&self, compiled: &CompiledProblem) -> RelabelingConstraintKey {
        match self {
            ProjectionAtom::Clique(atom) => RelabelingConstraintKey {
                family: RelabelingAtomFamily::Clique,
                idx: atom.clique_idx,
            },
            ProjectionAtom::HardApart(atom) => RelabelingConstraintKey {
                family: RelabelingAtomFamily::HardApart,
                idx: atom.constraint_idx,
            },
            ProjectionAtom::AttributeBalance(atom) => RelabelingConstraintKey {
                family: RelabelingAtomFamily::AttributeBalance,
                idx: atom.constraint_idx,
            },
            ProjectionAtom::ImmovableTriple(atom) => RelabelingConstraintKey {
                family: RelabelingAtomFamily::ImmovableTriple,
                idx: atom.constraint_idx,
            },
            ProjectionAtom::PairMeeting(atom) => RelabelingConstraintKey {
                family: RelabelingAtomFamily::PairMeeting,
                idx: atom.constraint_idx,
            },
            ProjectionAtom::SoftApart(atom) => RelabelingConstraintKey {
                family: RelabelingAtomFamily::SoftApart,
                idx: atom.constraint_idx,
            },
            ProjectionAtom::ShouldTogether(atom) => RelabelingConstraintKey {
                family: RelabelingAtomFamily::ShouldTogether,
                idx: atom.constraint_idx,
            },
            ProjectionAtom::Capacity(atom) => RelabelingConstraintKey {
                family: RelabelingAtomFamily::Capacity,
                idx: atom.real_session * compiled.num_groups + atom.real_group,
            },
        }
    }

    fn uncovered_penalty(&self, _compiled: &CompiledProblem) -> RelabelingScoreImpact {
        match self {
            ProjectionAtom::Clique(atom) => RelabelingScoreImpact::hard_cost(
                RelabelingAtomFamily::Clique,
                (atom.required_people_count * atom.real_sessions.len()).max(1) as f64 * 10.0,
            ),
            ProjectionAtom::HardApart(atom) => RelabelingScoreImpact::hard_cost(
                RelabelingAtomFamily::HardApart,
                atom.real_sessions.len().max(1) as f64 * 8.0,
            ),
            ProjectionAtom::AttributeBalance(atom) => RelabelingScoreImpact::soft_cost(
                RelabelingAtomFamily::AttributeBalance,
                atom.penalty_weight.max(0.0) * desired_people_count(&atom.desired_counts) as f64,
            ),
            ProjectionAtom::ImmovableTriple(_) => {
                RelabelingScoreImpact::hard_cost(RelabelingAtomFamily::ImmovableTriple, 25.0)
            }
            ProjectionAtom::PairMeeting(atom) => RelabelingScoreImpact::soft_cost(
                RelabelingAtomFamily::PairMeeting,
                (atom.penalty_weight.max(0.0) * (atom.target_meetings as f64 + 1.0))
                    .max(atom.projected_penalty),
            ),
            ProjectionAtom::SoftApart(atom) | ProjectionAtom::ShouldTogether(atom) => {
                RelabelingScoreImpact::soft_cost(
                    if atom.prefers_together {
                        RelabelingAtomFamily::ShouldTogether
                    } else {
                        RelabelingAtomFamily::SoftApart
                    },
                    atom.penalty_weight.max(0.0)
                        * atom.oracle_session_positions.len().max(1) as f64,
                )
            }
            ProjectionAtom::Capacity(atom) => RelabelingScoreImpact::hard_cost(
                RelabelingAtomFamily::Capacity,
                (atom.oracle_group_size.saturating_sub(atom.real_capacity) + 1) as f64 * 4.0,
            ),
        }
    }
}

pub(super) fn search_best_relabeling_within_budget(
    compiled: &CompiledProblem,
    candidate: &OracleTemplateCandidate,
    atoms: &ProjectionAtomSet,
    budget: RelabelingSearchBudget,
) -> TimedRelabelingSearchResult {
    let deadline = budget.start();
    let uncovered_penalty_by_key = build_uncovered_penalty_by_key(compiled, atoms);
    let factor_atoms = build_factor_atom_groups(compiled, atoms);
    let mut beam = vec![ProjectionRelabeling::empty(compiled, candidate)];
    let mut timed_out = false;
    let mut atoms_considered = 0usize;

    for (_, factor_group) in factor_atoms {
        if deadline.is_expired() {
            timed_out = true;
            break;
        }

        let mut next_beam = Vec::with_capacity(beam.len() * 2);
        for state in &beam {
            next_beam.push(state.clone());
            if let Some(representative_atom) = factor_group
                .first()
                .copied()
                .filter(|atom| weak_pair_factor_is_unanchored(state, candidate, atom))
            {
                if deadline.is_expired() {
                    timed_out = true;
                    break;
                }
                atoms_considered += 1;
                let mut next = state.clone();
                if next.try_accept_atom(compiled, candidate, representative_atom) {
                    next_beam.push(next);
                }
            } else {
                for atom in &factor_group {
                    if deadline.is_expired() {
                        timed_out = true;
                        break;
                    }
                    atoms_considered += 1;
                    let mut next = state.clone();
                    if next.try_accept_atom(compiled, candidate, atom) {
                        next_beam.push(next);
                    }
                }
            }
            if timed_out {
                break;
            }
        }

        if next_beam.is_empty() {
            continue;
        }
        prune_relabeling_beam(&mut next_beam, &uncovered_penalty_by_key);
        beam = next_beam;
        if timed_out {
            break;
        }
    }

    let mut best = best_relabeling_from_beam(beam, compiled, candidate, &uncovered_penalty_by_key);
    best.score = best.score_with_uncovered_penalties(&uncovered_penalty_by_key);

    TimedRelabelingSearchResult {
        atoms_accepted: best.accepted_atom_count,
        best,
        timed_out,
        atoms_considered,
        elapsed_seconds: deadline.elapsed_seconds(),
    }
}

fn weak_pair_factor_is_unanchored(
    state: &ProjectionRelabeling,
    candidate: &OracleTemplateCandidate,
    atom: &ProjectionAtom,
) -> bool {
    let Some((oracle_people, real_people)) = weak_pair_people(atom) else {
        return false;
    };
    if oracle_people
        .iter()
        .any(|&person| person >= candidate.oracle_capacity)
        || real_people
            .iter()
            .any(|&person| person >= state.oracle_person_by_real_person.len())
    {
        return false;
    }
    !oracle_people
        .iter()
        .any(|&person| state.real_person_by_oracle_person[person].is_some())
        && !real_people
            .iter()
            .any(|&person| state.oracle_person_by_real_person[person].is_some())
}

fn weak_pair_people(atom: &ProjectionAtom) -> Option<([usize; 2], [usize; 2])> {
    match atom {
        ProjectionAtom::HardApart(atom) => Some((atom.oracle_people, atom.real_people)),
        ProjectionAtom::PairMeeting(atom) => Some((atom.oracle_people, atom.real_people)),
        ProjectionAtom::SoftApart(atom) | ProjectionAtom::ShouldTogether(atom) => {
            Some((atom.oracle_people, atom.real_people))
        }
        ProjectionAtom::Clique(_)
        | ProjectionAtom::AttributeBalance(_)
        | ProjectionAtom::ImmovableTriple(_)
        | ProjectionAtom::Capacity(_) => None,
    }
}

fn build_factor_atom_groups<'a>(
    compiled: &CompiledProblem,
    atoms: &'a ProjectionAtomSet,
) -> Vec<(RelabelingConstraintKey, Vec<&'a ProjectionAtom>)> {
    let mut atoms_by_key = BTreeMap::<RelabelingConstraintKey, Vec<&ProjectionAtom>>::new();
    for atom in atoms.iter() {
        atoms_by_key
            .entry(atom.constraint_key(compiled))
            .or_default()
            .push(atom);
    }
    let mut groups = atoms_by_key.into_iter().collect::<Vec<_>>();
    groups.sort_by(|(left, _), (right, _)| {
        factor_priority(*left)
            .cmp(&factor_priority(*right))
            .then_with(|| left.cmp(right))
    });
    groups
}

fn factor_priority(key: RelabelingConstraintKey) -> (usize, usize) {
    let family_priority = match key.family {
        RelabelingAtomFamily::ImmovableTriple => 0,
        RelabelingAtomFamily::Clique => 1,
        RelabelingAtomFamily::Capacity => 2,
        RelabelingAtomFamily::AttributeBalance => 3,
        RelabelingAtomFamily::HardApart => 4,
        RelabelingAtomFamily::PairMeeting => 5,
        RelabelingAtomFamily::ShouldTogether | RelabelingAtomFamily::SoftApart => 6,
    };
    (family_priority, key.idx)
}

fn prune_relabeling_beam(
    beam: &mut Vec<ProjectionRelabeling>,
    uncovered_penalty_by_key: &BTreeMap<RelabelingConstraintKey, RelabelingScoreImpact>,
) {
    beam.sort_by(|left, right| {
        compare_relabeling_with_context(right, left, uncovered_penalty_by_key)
    });
    if beam.len() <= RELABELING_BEAM_WIDTH {
        return;
    }

    let mut selected = Vec::with_capacity(RELABELING_BEAM_WIDTH);
    let mut seen_session_signatures = BTreeSet::new();
    for state in beam.iter() {
        if selected.len() >= RELABELING_BEAM_WIDTH {
            break;
        }
        if seen_session_signatures.insert(state.oracle_session_by_real_session.clone()) {
            selected.push(state.clone());
        }
    }
    for state in beam.iter() {
        if selected.len() >= RELABELING_BEAM_WIDTH {
            break;
        }
        selected.push(state.clone());
    }
    *beam = selected;
}

fn best_relabeling_from_beam(
    beam: Vec<ProjectionRelabeling>,
    compiled: &CompiledProblem,
    candidate: &OracleTemplateCandidate,
    uncovered_penalty_by_key: &BTreeMap<RelabelingConstraintKey, RelabelingScoreImpact>,
) -> ProjectionRelabeling {
    beam.into_iter()
        .max_by(|left, right| {
            compare_relabeling_with_context(left, right, uncovered_penalty_by_key)
        })
        .unwrap_or_else(|| ProjectionRelabeling::empty(compiled, candidate))
}

fn compare_relabeling_with_context(
    left: &ProjectionRelabeling,
    right: &ProjectionRelabeling,
    uncovered_penalty_by_key: &BTreeMap<RelabelingConstraintKey, RelabelingScoreImpact>,
) -> Ordering {
    let left_score = left.score_with_uncovered_penalties(uncovered_penalty_by_key);
    let right_score = right.score_with_uncovered_penalties(uncovered_penalty_by_key);
    left_score
        .objective_value
        .partial_cmp(&right_score.objective_value)
        .unwrap_or(Ordering::Equal)
        .then_with(|| left.accepted_atom_count.cmp(&right.accepted_atom_count))
        .then_with(|| {
            left_score
                .coverage
                .covered_constraint_units
                .cmp(&right_score.coverage.covered_constraint_units)
        })
}

fn immovable_person_occurrence_count(compiled: &CompiledProblem, real_person: usize) -> usize {
    compiled
        .immovable_assignments
        .iter()
        .filter(|assignment| assignment.person_idx == real_person)
        .count()
}

fn clique_member_occurrence_count(compiled: &CompiledProblem, real_person: usize) -> usize {
    compiled
        .cliques
        .iter()
        .filter(|clique| clique.members.contains(&real_person))
        .count()
}

fn build_uncovered_penalty_by_key(
    compiled: &CompiledProblem,
    atoms: &ProjectionAtomSet,
) -> BTreeMap<RelabelingConstraintKey, RelabelingScoreImpact> {
    let mut potential_by_key = BTreeMap::<RelabelingConstraintKey, RelabelingScoreImpact>::new();
    for atom in atoms.iter() {
        let key = atom.constraint_key(compiled);
        let penalty = atom.uncovered_penalty(compiled);
        potential_by_key
            .entry(key)
            .and_modify(|current| {
                if penalty.total_cost() > current.total_cost() {
                    *current = penalty.clone();
                }
            })
            .or_insert(penalty);
    }
    potential_by_key
}

fn desired_people_count(desired_counts: &[(usize, u32)]) -> usize {
    desired_counts
        .iter()
        .map(|&(_, count)| count as usize)
        .sum::<usize>()
        .max(1)
}

fn single_session(sessions: &[usize]) -> Option<usize> {
    match sessions {
        [session] => Some(*session),
        _ => None,
    }
}

fn candidate_group_for_session(
    candidate: &OracleTemplateCandidate,
    oracle_session_pos: usize,
    oracle_group_idx: usize,
) -> Option<usize> {
    candidate
        .groups_by_session
        .get(oracle_session_pos)
        .and_then(|groups| groups.get(oracle_group_idx))
        .copied()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{ApiInput, Group, Objective, Person, ProblemDefinition, SolverKind};
    use crate::solver_support::construction::constraint_scenario_oracle::constraint_aware_projection::atoms::{
        ImmovableTripleProjectionAtom, ProjectionAtom, SoftPairProjectionAtom,
    };
    use std::collections::HashMap;

    fn test_candidate() -> OracleTemplateCandidate {
        OracleTemplateCandidate {
            sessions: vec![0, 1],
            groups_by_session: vec![vec![0, 1], vec![0, 1]],
            num_groups: 2,
            group_size: 2,
            oracle_capacity: 4,
            stable_people_count: 4,
            high_attendance_people_count: 4,
            dummy_oracle_people: 0,
            omitted_high_attendance_people: 0,
            omitted_group_count: 0,
            scaffold_disruption_risk: 0.0,
            estimated_score: 0.0,
        }
    }

    fn test_input() -> ApiInput {
        ApiInput {
            problem: ProblemDefinition {
                people: (0..4)
                    .map(|idx| Person {
                        id: format!("p{idx}"),
                        attributes: HashMap::new(),
                        sessions: None,
                    })
                    .collect(),
                groups: (0..2)
                    .map(|idx| Group {
                        id: format!("g{idx}"),
                        size: 2,
                        session_sizes: None,
                    })
                    .collect(),
                num_sessions: 2,
            },
            initial_schedule: None,
            construction_seed_schedule: None,
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".into(),
                weight: 1.0,
            }],
            constraints: Vec::new(),
            solver: crate::default_solver_configuration_for(SolverKind::Solver3),
        }
    }

    #[test]
    fn zero_budget_returns_empty_relabeling_without_scanning_atoms() {
        let input = test_input();
        let compiled = CompiledProblem::compile(&input).expect("compile");
        let candidate = test_candidate();
        let atoms = ProjectionAtomSet {
            atoms: vec![ProjectionAtom::ImmovableTriple(
                ImmovableTripleProjectionAtom {
                    constraint_idx: 0,
                    real_person: 0,
                    real_session: 0,
                    real_group: 0,
                    oracle_person: 0,
                    oracle_session_pos: 0,
                    oracle_group_idx: 0,
                },
            )],
        };

        let result = search_best_relabeling_within_budget(
            &compiled,
            &candidate,
            &atoms,
            RelabelingSearchBudget::from_remaining_seconds(Some(0.0)),
        );

        assert!(result.timed_out);
        assert_eq!(result.atoms_considered, 0);
        assert_eq!(result.atoms_accepted, 0);
        assert!(result.best.is_shape_compatible(&compiled, &candidate));
        assert_eq!(result.best.score.coverage.uncovered_constraint_units, 1);
        assert!(result.best.score.hard_compatibility_cost > 0.0);
        assert_eq!(result.best.score.mapping.mapped_people, 0);
        assert!(result.best.score.mapping_incompleteness_cost > 0.0);
        assert!(result.best.score.total_cost.is_finite());
    }

    #[test]
    fn unbounded_budget_returns_best_compatible_relabeling() {
        let input = test_input();
        let compiled = CompiledProblem::compile(&input).expect("compile");
        let candidate = test_candidate();
        let atoms = ProjectionAtomSet {
            atoms: vec![ProjectionAtom::ImmovableTriple(
                ImmovableTripleProjectionAtom {
                    constraint_idx: 0,
                    real_person: 0,
                    real_session: 0,
                    real_group: 0,
                    oracle_person: 0,
                    oracle_session_pos: 0,
                    oracle_group_idx: 0,
                },
            )],
        };

        let result = search_best_relabeling_within_budget(
            &compiled,
            &candidate,
            &atoms,
            RelabelingSearchBudget::unbounded(),
        );

        assert!(!result.timed_out);
        assert_eq!(result.atoms_considered, 1);
        assert_eq!(result.atoms_accepted, 1);
        assert_eq!(result.best.real_person_by_oracle_person[0], None);
        assert_eq!(result.best.real_session_by_oracle_session[0], Some(0));
        assert_eq!(
            result.best.real_group_by_oracle_session_group[0][0],
            Some(0)
        );
        assert_eq!(result.best.score.coverage.covered_constraint_units, 1);
        assert_eq!(result.best.score.coverage.uncovered_constraint_units, 0);
        assert_eq!(result.best.score.hard_compatibility_cost, 0.0);
        assert_eq!(result.best.score.mapping.mapped_people, 0);
        assert_eq!(result.best.score.mapping.mapped_sessions, 1);
        assert_eq!(result.best.score.mapping.mapped_slots, 1);
        assert!(result.best.score.structural_reward > 0.0);
    }

    #[test]
    fn unanchored_immovable_atoms_defer_person_mapping_but_cover_slots() {
        let input = test_input();
        let compiled = CompiledProblem::compile(&input).expect("compile");
        let candidate = test_candidate();
        let atoms = ProjectionAtomSet {
            atoms: vec![
                ProjectionAtom::ImmovableTriple(ImmovableTripleProjectionAtom {
                    constraint_idx: 0,
                    real_person: 0,
                    real_session: 0,
                    real_group: 0,
                    oracle_person: 0,
                    oracle_session_pos: 0,
                    oracle_group_idx: 0,
                }),
                ProjectionAtom::ImmovableTriple(ImmovableTripleProjectionAtom {
                    constraint_idx: 1,
                    real_person: 1,
                    real_session: 0,
                    real_group: 1,
                    oracle_person: 2,
                    oracle_session_pos: 0,
                    oracle_group_idx: 1,
                }),
            ],
        };

        let result = search_best_relabeling_within_budget(
            &compiled,
            &candidate,
            &atoms,
            RelabelingSearchBudget::unbounded(),
        );

        assert!(result.atoms_considered >= 2);
        assert_eq!(result.atoms_accepted, 2);
        assert_eq!(result.best.real_person_by_oracle_person[0], None);
        assert_eq!(result.best.real_person_by_oracle_person[2], None);
        assert_eq!(result.best.score.coverage.covered_constraint_units, 2);
        assert_eq!(result.best.score.coverage.uncovered_constraint_units, 0);
        assert_eq!(result.best.score.mapping.mapped_people, 0);
        assert_eq!(result.best.score.mapping.mapped_slots, 2);
        assert_eq!(result.best.score.hard.immovable_cost, 0.0);
    }

    #[test]
    fn anchored_person_mapping_conflicts_remain_hard_rejects() {
        let input = test_input();
        let compiled = CompiledProblem::compile(&input).expect("compile");
        let candidate = test_candidate();
        let mut relabeling = ProjectionRelabeling::empty(&compiled, &candidate);

        assert!(relabeling.bind_person(&candidate, 0, 0));
        assert!(!relabeling.bind_person_if_already_anchored(&candidate, 0, 1));
        assert!(!relabeling.bind_person_if_already_anchored(&candidate, 1, 0));
        assert!(relabeling.bind_person_if_already_anchored(&candidate, 0, 0));
    }

    #[test]
    fn accepted_soft_pair_atom_uses_real_penalty_weight() {
        let input = test_input();
        let compiled = CompiledProblem::compile(&input).expect("compile");
        let candidate = test_candidate();
        let atoms = ProjectionAtomSet {
            atoms: vec![ProjectionAtom::ShouldTogether(SoftPairProjectionAtom {
                constraint_idx: 0,
                real_people: [0, 1],
                real_sessions: vec![0, 1],
                oracle_people: [0, 1],
                oracle_session_positions: vec![0, 1],
                penalty_weight: 3.0,
                oracle_meetings: 0,
                prefers_together: true,
            })],
        };

        let result = search_best_relabeling_within_budget(
            &compiled,
            &candidate,
            &atoms,
            RelabelingSearchBudget::unbounded(),
        );

        assert_eq!(result.atoms_accepted, 1);
        assert_eq!(result.best.score.coverage.covered_constraint_units, 1);
        assert_eq!(result.best.score.coverage.uncovered_constraint_units, 0);
        assert_eq!(result.best.score.soft.soft_pair_penalty, 6.0);
        assert_eq!(result.best.score.contact_reward, 6.0);
    }
}
