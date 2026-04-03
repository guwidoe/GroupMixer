/// Placeholder typed transfer move for `solver2`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TransferMove {
    pub session_idx: u32,
    pub person_idx: u32,
    pub source_group_idx: u32,
    pub target_group_idx: u32,
}
