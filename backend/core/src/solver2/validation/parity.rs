use crate::models::ApiInput;
use crate::solver_support::SolverError;

use super::super::not_yet_implemented;

/// Placeholder seam for future bounded-parity checks between `solver1` and `solver2`.
pub fn compare_against_solver1(_input: &ApiInput) -> Result<(), SolverError> {
    Err(not_yet_implemented(
        "solver2 parity validation against solver1",
    ))
}
