use crate::models::MoveFamily;
use crate::solver_support::SolverError;

#[cfg(feature = "solver3-oracle-checks")]
use super::super::super::oracle::maybe_cross_check_runtime_state;
use super::super::super::runtime_state::RuntimeState;
#[cfg(feature = "solver3-oracle-checks")]
use super::super::super::validation::invariants::validate_invariants;
use super::super::candidate_sampling::SearchMovePreview;
use super::super::context::SearchRunContext;

pub(crate) fn maybe_run_sampled_correctness_check(
    run_context: &SearchRunContext,
    state: &RuntimeState,
    accepted_move_count: u64,
    family: MoveFamily,
    preview: &SearchMovePreview,
) -> Result<(), SolverError> {
    if !run_context.correctness_lane_enabled {
        return Ok(());
    }

    #[cfg(feature = "solver3-oracle-checks")]
    {
        if should_sample_correctness_check(
            accepted_move_count,
            run_context.correctness_sample_every_accepted_moves,
        ) {
            let preview_description = preview.describe();
            maybe_cross_check_runtime_state(
                state,
                &format!(
                    "search sampled {:?} accepted move {}",
                    family, preview_description
                ),
            )?;
            validate_invariants(state).map_err(|error| {
                SolverError::ValidationError(format!(
                    "solver3 sampled invariant check failed after accepted {:?} move {}: {}",
                    family, preview_description, error
                ))
            })?;
        }
    }

    #[cfg(not(feature = "solver3-oracle-checks"))]
    {
        let _ = (
            run_context.correctness_sample_every_accepted_moves,
            run_context.correctness_lane_enabled,
            state,
            accepted_move_count,
            family,
            preview,
        );
    }

    Ok(())
}

#[cfg(feature = "solver3-oracle-checks")]
fn should_sample_correctness_check(
    accepted_move_count: u64,
    sample_every_accepted_moves: u64,
) -> bool {
    accepted_move_count > 0 && accepted_move_count % sample_every_accepted_moves == 0
}
