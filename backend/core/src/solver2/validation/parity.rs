use crate::default_solver_configuration_for;
use crate::models::{ApiInput, SolverKind};
use crate::solver1::State as Solver1State;
use crate::solver2::scoring::recompute_full_score;
use crate::solver_support::SolverError;

use super::super::SolutionState;
use super::invariants::validate_state_invariants;

/// Runs a narrow foundation-layer parity check by evaluating the same schedule in solver1 and solver2.
pub fn compare_against_solver1(input: &ApiInput) -> Result<(), SolverError> {
    let state = SolutionState::from_input(input)?;
    compare_state_against_solver1(input, &state)
}

pub(crate) fn compare_state_against_solver1(
    input: &ApiInput,
    state: &SolutionState,
) -> Result<(), SolverError> {
    validate_state_invariants(state)?;
    let solver2_score = recompute_full_score(state)?;

    let mut solver1_input = input.clone();
    solver1_input.solver = default_solver_configuration_for(SolverKind::Solver1);
    solver1_input.initial_schedule = Some(state.to_api_schedule());

    let mut solver1_state = Solver1State::new(&solver1_input)?;
    solver1_state._recalculate_scores();

    assert_close(
        solver2_score.total_score,
        solver1_state.current_cost,
        "total score",
    )?;
    assert_eq_or_err(
        solver2_score.unique_contacts,
        solver1_state.unique_contacts,
        "unique contacts",
    )?;
    assert_eq_or_err(
        solver2_score.repetition_penalty,
        solver1_state.repetition_penalty,
        "repetition penalty",
    )?;
    assert_close(
        solver2_score.attribute_balance_penalty,
        solver1_state.attribute_balance_penalty,
        "attribute balance penalty",
    )?;
    assert_eq_or_err(
        solver2_score.constraint_penalty,
        solver1_state.constraint_penalty,
        "constraint penalty",
    )?;
    assert_close(
        solver2_score.weighted_constraint_penalty,
        solver1_state.weighted_constraint_penalty,
        "weighted constraint penalty",
    )?;
    assert_close(
        solver2_score.weighted_repetition_penalty,
        solver1_state.repetition_penalty as f64 * solver1_state.w_repetition,
        "weighted repetition penalty",
    )?;
    assert_eq_or_err(
        solver2_score.contact_matrix,
        solver1_state.contact_matrix,
        "contact matrix",
    )?;

    Ok(())
}

fn assert_close(left: f64, right: f64, label: &str) -> Result<(), SolverError> {
    const EPSILON: f64 = 1e-9;
    if (left - right).abs() > EPSILON {
        return Err(SolverError::ValidationError(format!(
            "solver1/solver2 parity mismatch for {}: solver2={} solver1={}",
            label, left, right
        )));
    }
    Ok(())
}

fn assert_eq_or_err<T>(left: T, right: T, label: &str) -> Result<(), SolverError>
where
    T: PartialEq + std::fmt::Debug,
{
    if left != right {
        return Err(SolverError::ValidationError(format!(
            "solver1/solver2 parity mismatch for {}: solver2={:?} solver1={:?}",
            label, left, right
        )));
    }
    Ok(())
}
