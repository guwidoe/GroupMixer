use crate::models::AttributeBalanceMode;

#[derive(Debug, Clone)]
pub(crate) struct ResolvedAttributeBalanceConstraint {
    pub(crate) attr_idx: usize,
    pub(crate) desired_counts: Vec<(usize, u32)>,
    pub(crate) penalty_weight: f64,
    pub(crate) mode: AttributeBalanceMode,
}

#[inline]
pub(crate) fn flat_slot(width: usize, day: usize, idx: usize) -> usize {
    day * width + idx
}
