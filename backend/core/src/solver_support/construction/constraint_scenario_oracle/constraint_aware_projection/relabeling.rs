use crate::solver3::compiled_problem::CompiledProblem;

use super::super::types::OracleTemplateCandidate;
use super::atoms::{
    AttributeBalanceProjectionAtom, CapacityProjectionAtom, CliqueProjectionAtom,
    HardApartProjectionAtom, ImmovableTripleProjectionAtom, PairMeetingProjectionAtom,
    ProjectionAtom, ProjectionAtomSet, SoftPairProjectionAtom,
};
use super::deadline::RelabelingSearchBudget;

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
    real_session_by_oracle_session: Vec<Option<usize>>,
    oracle_session_by_real_session: Vec<Option<usize>>,
    real_group_by_oracle_session_group: Vec<Vec<Option<usize>>>,
    oracle_slot_by_real_session_group: Vec<Option<(usize, usize)>>,
    score: f64,
    accepted_atom_count: usize,
}

impl ProjectionRelabeling {
    fn empty(compiled: &CompiledProblem, candidate: &OracleTemplateCandidate) -> Self {
        Self {
            real_person_by_oracle_person: vec![None; candidate.oracle_capacity],
            oracle_person_by_real_person: vec![None; compiled.num_people],
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
            score: 0.0,
            accepted_atom_count: 0,
        }
    }

    pub(super) fn is_shape_compatible(
        &self,
        compiled: &CompiledProblem,
        candidate: &OracleTemplateCandidate,
    ) -> bool {
        self.real_person_by_oracle_person.len() == candidate.oracle_capacity
            && self.oracle_person_by_real_person.len() == compiled.num_people
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
        next.score += score;
        next.accepted_atom_count += 1;
        *self = next;
        true
    }

    fn try_accept_clique_atom(
        &mut self,
        compiled: &CompiledProblem,
        candidate: &OracleTemplateCandidate,
        atom: &CliqueProjectionAtom,
    ) -> Option<f64> {
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
        Some((atom.required_people_count * atom.real_sessions.len()).max(1) as f64 * 10.0)
    }

    fn try_accept_hard_apart_atom(
        &mut self,
        candidate: &OracleTemplateCandidate,
        atom: &HardApartProjectionAtom,
    ) -> Option<f64> {
        if !self.bind_unordered_pair(candidate, atom.oracle_people, atom.real_people) {
            return None;
        }
        Some(atom.real_sessions.len().max(1) as f64 * 5.0)
    }

    fn try_accept_attribute_balance_atom(
        &mut self,
        compiled: &CompiledProblem,
        candidate: &OracleTemplateCandidate,
        atom: &AttributeBalanceProjectionAtom,
    ) -> Option<f64> {
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
        Some(atom.penalty_weight.max(0.0) * desired_people as f64)
    }

    fn try_accept_immovable_atom(
        &mut self,
        compiled: &CompiledProblem,
        candidate: &OracleTemplateCandidate,
        atom: &ImmovableTripleProjectionAtom,
    ) -> Option<f64> {
        if !self.bind_person(candidate, atom.oracle_person, atom.real_person) {
            return None;
        }
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
        Some(20.0)
    }

    fn try_accept_pair_meeting_atom(
        &mut self,
        candidate: &OracleTemplateCandidate,
        atom: &PairMeetingProjectionAtom,
    ) -> Option<f64> {
        if !self.bind_unordered_pair(candidate, atom.oracle_people, atom.real_people) {
            return None;
        }
        let zero_penalty_reward = (atom.penalty_weight * (atom.target_meetings as f64 + 1.0)
            - atom.projected_penalty)
            .max(0.0);
        Some(zero_penalty_reward + atom.real_sessions.len().max(1) as f64)
    }

    fn try_accept_soft_pair_atom(
        &mut self,
        candidate: &OracleTemplateCandidate,
        atom: &SoftPairProjectionAtom,
    ) -> Option<f64> {
        if !self.bind_unordered_pair(candidate, atom.oracle_people, atom.real_people) {
            return None;
        }
        let directional_reward = if atom.prefers_together {
            atom.oracle_meetings as f64
        } else {
            atom.oracle_session_positions
                .len()
                .saturating_sub(atom.oracle_meetings as usize) as f64
        };
        Some(atom.penalty_weight.max(0.0) * directional_reward.max(1.0))
    }

    fn try_accept_capacity_atom(
        &mut self,
        compiled: &CompiledProblem,
        candidate: &OracleTemplateCandidate,
        atom: &CapacityProjectionAtom,
    ) -> Option<f64> {
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
        Some((atom.real_capacity.saturating_sub(atom.oracle_group_size) + 1) as f64)
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

pub(super) fn search_best_relabeling_within_budget(
    compiled: &CompiledProblem,
    candidate: &OracleTemplateCandidate,
    atoms: &ProjectionAtomSet,
    budget: RelabelingSearchBudget,
) -> TimedRelabelingSearchResult {
    let deadline = budget.start();
    let mut best = ProjectionRelabeling::empty(compiled, candidate);
    let mut timed_out = false;
    let mut atoms_considered = 0usize;

    for atom in atoms.iter() {
        if deadline.is_expired() {
            timed_out = true;
            break;
        }
        atoms_considered += 1;
        let mut next = best.clone();
        if next.try_accept_atom(compiled, candidate, atom) && relabeling_is_better(&next, &best) {
            best = next;
        }
    }

    TimedRelabelingSearchResult {
        atoms_accepted: best.accepted_atom_count,
        best,
        timed_out,
        atoms_considered,
        elapsed_seconds: deadline.elapsed_seconds(),
    }
}

fn relabeling_is_better(left: &ProjectionRelabeling, right: &ProjectionRelabeling) -> bool {
    left.score > right.score
        || (left.score == right.score && left.accepted_atom_count > right.accepted_atom_count)
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
        ImmovableTripleProjectionAtom, ProjectionAtom,
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
        assert_eq!(result.best.real_person_by_oracle_person[0], Some(0));
        assert_eq!(result.best.real_session_by_oracle_session[0], Some(0));
        assert_eq!(
            result.best.real_group_by_oracle_session_group[0][0],
            Some(0)
        );
    }
}
