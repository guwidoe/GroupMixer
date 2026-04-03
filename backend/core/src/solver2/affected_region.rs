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
