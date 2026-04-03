/// Placeholder typed clique-swap move for `solver2`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CliqueSwapMove {
    pub session_idx: u32,
    pub source_group_idx: u32,
    pub target_group_idx: u32,
}
