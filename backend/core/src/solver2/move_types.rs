use super::moves::{CliqueSwapMove, SwapMove, TransferMove};

/// Typed move values for the bootstrapped `solver2` family.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CandidateMove {
    Swap(SwapMove),
    Transfer(TransferMove),
    CliqueSwap(CliqueSwapMove),
}
