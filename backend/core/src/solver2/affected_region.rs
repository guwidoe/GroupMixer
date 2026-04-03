/// Explicit description of what a `solver2` move touches.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct AffectedRegion {
    pub touched_session: Option<u32>,
    pub touched_groups: Vec<u32>,
    pub touched_people: Vec<u32>,
}
