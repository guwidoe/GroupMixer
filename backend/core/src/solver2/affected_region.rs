use super::compiled_problem::CompiledProblem;

/// Explicit description of what a `solver2` move touches.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct AffectedRegion {
    pub touched_session: Option<usize>,
    pub touched_groups: Vec<usize>,
    pub touched_people: Vec<usize>,
    pub touched_cliques: Vec<usize>,
    pub touched_forbidden_pair_constraints: Vec<usize>,
    pub touched_should_together_constraints: Vec<usize>,
    pub touched_pair_meeting_constraints: Vec<usize>,
    pub touched_attribute_balance_constraints: Vec<usize>,
}

impl AffectedRegion {
    pub fn for_session(session_idx: usize) -> Self {
        Self {
            touched_session: Some(session_idx),
            ..Default::default()
        }
    }

    pub(crate) fn from_groups_and_people(
        problem: &CompiledProblem,
        session_idx: usize,
        touched_groups: &[usize],
        touched_people: &[usize],
    ) -> Self {
        let mut region = Self::for_session(session_idx);
        region.touched_groups.extend_from_slice(touched_groups);
        region.touched_people.extend_from_slice(touched_people);

        for &person_idx in touched_people {
            if let Some(clique_idx) = problem.person_to_clique_id[session_idx][person_idx] {
                region.touched_cliques.push(clique_idx);
            }
            region.touched_forbidden_pair_constraints.extend(
                problem.forbidden_pairs_by_person[person_idx]
                    .iter()
                    .copied(),
            );
            region.touched_should_together_constraints.extend(
                problem.should_together_pairs_by_person[person_idx]
                    .iter()
                    .copied(),
            );
            region.touched_pair_meeting_constraints.extend(
                problem.pair_meeting_constraints_by_person[person_idx]
                    .iter()
                    .copied(),
            );
        }

        for &group_idx in touched_groups {
            let slot = problem.flat_group_session_slot(session_idx, group_idx);
            region.touched_attribute_balance_constraints.extend(
                problem.attribute_balance_constraints_by_group_session[slot]
                    .iter()
                    .copied(),
            );
        }

        region.normalize();
        region
    }

    pub fn normalize(&mut self) {
        self.touched_groups.sort_unstable();
        self.touched_groups.dedup();
        self.touched_people.sort_unstable();
        self.touched_people.dedup();
        self.touched_cliques.sort_unstable();
        self.touched_cliques.dedup();
        self.touched_forbidden_pair_constraints.sort_unstable();
        self.touched_forbidden_pair_constraints.dedup();
        self.touched_should_together_constraints.sort_unstable();
        self.touched_should_together_constraints.dedup();
        self.touched_pair_meeting_constraints.sort_unstable();
        self.touched_pair_meeting_constraints.dedup();
        self.touched_attribute_balance_constraints.sort_unstable();
        self.touched_attribute_balance_constraints.dedup();
    }
}
