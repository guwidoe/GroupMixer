use std::ops::{Deref, DerefMut};
use std::sync::Arc;

use crate::models::ApiInput;
use crate::solver_support::SolverError;

use super::compiled_problem::CompiledProblem;
use super::scoring::recompute_full_score;
use super::validation::invariants::validate_state_invariants;
use super::SolutionState;

/// Runtime-oriented solver2 state.
///
/// This wraps the oracle/reference `SolutionState` so the search path can evolve specialized
/// runtime behavior without losing access to the full recompute oracle and existing validation
/// surfaces.
#[derive(Debug, Clone)]
pub struct RuntimeSolutionState {
    inner: SolutionState,
}

impl RuntimeSolutionState {
    pub fn from_input(input: &ApiInput) -> Result<Self, SolverError> {
        Ok(Self {
            inner: SolutionState::from_input(input)?,
        })
    }

    pub fn from_oracle_state(state: &SolutionState) -> Self {
        Self {
            inner: state.clone(),
        }
    }

    pub fn into_oracle_state(self) -> SolutionState {
        self.inner
    }

    pub fn as_oracle_state(&self) -> &SolutionState {
        &self.inner
    }

    pub fn as_oracle_state_mut(&mut self) -> &mut SolutionState {
        &mut self.inner
    }

    pub fn compiled_problem_arc(&self) -> &Arc<CompiledProblem> {
        &self.inner.compiled_problem
    }

    /// Validates the runtime state against the retained oracle surfaces on demand.
    pub fn validate_against_oracle(&self) -> Result<(), SolverError> {
        validate_state_invariants(&self.inner)?;
        let recomputed_score = recompute_full_score(&self.inner)?;
        if recomputed_score != self.inner.current_score {
            return Err(SolverError::ValidationError(
                "solver2 runtime state drifted from the oracle recomputation snapshot".to_string(),
            ));
        }
        Ok(())
    }
}

impl Deref for RuntimeSolutionState {
    type Target = SolutionState;

    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

impl DerefMut for RuntimeSolutionState {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.inner
    }
}
