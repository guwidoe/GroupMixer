use crate::models::{SolverConfiguration, SolverResult};
use crate::solver_support::SolverError;

use super::super::{not_yet_implemented, SolutionState};

/// Bootstrapped search-engine entry point for `solver2`.
#[derive(Debug, Default)]
pub struct SearchEngine;

impl SearchEngine {
    pub fn new(_configuration: &SolverConfiguration) -> Self {
        Self
    }

    pub fn solve(&self, _state: &mut SolutionState) -> Result<SolverResult, SolverError> {
        Err(not_yet_implemented("solver2 search execution"))
    }
}
