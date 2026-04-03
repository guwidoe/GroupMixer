use crate::solver_support::SolverError;

use super::super::{not_yet_implemented, SolutionState};

/// Placeholder output for the future full-recomputation scoring path.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct FullScoreSnapshot {
    pub total_score: f64,
}

/// Placeholder seam for correctness-first full score recomputation in `solver2`.
pub fn recompute_full_score(_state: &SolutionState) -> Result<FullScoreSnapshot, SolverError> {
    Err(not_yet_implemented("solver2 full score recomputation"))
}
