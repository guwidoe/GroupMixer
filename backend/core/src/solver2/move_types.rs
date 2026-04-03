use super::affected_region::AffectedRegion;
use super::moves::{CliqueSwapMove, SwapMove, TransferMove};
use super::scoring::FullScoreSnapshot;

/// Typed move values for the `solver2` family.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CandidateMove {
    Swap(SwapMove),
    Transfer(TransferMove),
    CliqueSwap(CliqueSwapMove),
}

/// Correctness-first preview result shared by solver2 move kernels.
#[derive(Debug, Clone, PartialEq)]
pub struct MovePreview {
    pub candidate: CandidateMove,
    pub affected_region: AffectedRegion,
    pub before_score: FullScoreSnapshot,
    pub after_score: FullScoreSnapshot,
    pub delta_cost: f64,
}
