use crate::solver_support::SolverError;

use super::super::{not_yet_implemented, SolutionState};

/// Placeholder seam for future `solver2` invariant checks.
pub fn validate_state_invariants(_state: &SolutionState) -> Result<(), SolverError> {
    Err(not_yet_implemented("solver2 invariant validation"))
}
