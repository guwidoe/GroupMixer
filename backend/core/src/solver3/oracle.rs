//! Oracle interface for `solver3`.
//!
//! The oracle is the permanent semantic source of truth. It calls the full
//! recomputation path and provides a drift-check entry point that verifies the
//! incremental score aggregates stored in `RuntimeState` have not diverged from
//! the oracle's result.
//!
//! Design contract:
//! - The oracle must always be callable.
//! - The oracle result takes precedence over any incremental aggregate.
//! - Drift check failure means a bug in the incremental update logic — not in the oracle.

use crate::solver_support::SolverError;

use super::runtime_state::RuntimeState;
use super::scoring::recompute::recompute_oracle_score;

// Re-export so callers can use `solver3::oracle::OracleSnapshot`.
pub use super::scoring::recompute::OracleSnapshot;

/// Recomputes the complete score from scratch and returns a full snapshot.
///
/// This is the oracle entry point — correctness-first, not hot-path-optimized.
pub fn oracle_score(state: &RuntimeState) -> Result<OracleSnapshot, SolverError> {
    recompute_oracle_score(state)
}

/// Validates that `state`'s incremental score aggregates match the oracle recompute.
///
/// Also cross-checks `state.pair_contacts` against the oracle's freshly-computed
/// pair contacts.
///
/// This is the drift-check entry point used by tests and sampled runtime validation.
pub fn check_drift(state: &RuntimeState) -> Result<(), SolverError> {
    let snap = recompute_oracle_score(state)?;

    // Cross-check pair_contacts against the oracle's independent computation.
    if state.pair_contacts != snap.pair_contacts_fresh {
        // Find the first mismatching pair for a diagnostic.
        let mismatch = state
            .pair_contacts
            .iter()
            .zip(snap.pair_contacts_fresh.iter())
            .enumerate()
            .find(|(_, (a, b))| a != b)
            .map(|(idx, (runtime, oracle))| {
                format!("pair_idx {} — runtime={}, oracle={}", idx, runtime, oracle)
            })
            .unwrap_or_else(|| "unknown pair".into());
        return Err(SolverError::ValidationError(format!(
            "solver3 runtime pair_contacts drifted from oracle: {}",
            mismatch
        )));
    }

    // Check score aggregates.
    let tolerance = 1e-9_f64;
    if (state.total_score - snap.total_score).abs() > tolerance {
        return Err(SolverError::ValidationError(format!(
            "solver3 total_score drifted: runtime={:.6}, oracle={:.6}",
            state.total_score, snap.total_score
        )));
    }
    if state.unique_contacts != snap.unique_contacts {
        return Err(SolverError::ValidationError(format!(
            "solver3 unique_contacts drifted: runtime={}, oracle={}",
            state.unique_contacts, snap.unique_contacts
        )));
    }
    if state.repetition_penalty_raw != snap.repetition_penalty_raw {
        return Err(SolverError::ValidationError(format!(
            "solver3 repetition_penalty_raw drifted: runtime={}, oracle={}",
            state.repetition_penalty_raw, snap.repetition_penalty_raw
        )));
    }
    if (state.attribute_balance_penalty - snap.attribute_balance_penalty).abs() > tolerance {
        return Err(SolverError::ValidationError(format!(
            "solver3 attribute_balance_penalty drifted: runtime={:.6}, oracle={:.6}",
            state.attribute_balance_penalty, snap.attribute_balance_penalty
        )));
    }
    if (state.constraint_penalty_weighted - snap.constraint_penalty_weighted).abs() > tolerance {
        return Err(SolverError::ValidationError(format!(
            "solver3 constraint_penalty_weighted drifted: runtime={:.6}, oracle={:.6}",
            state.constraint_penalty_weighted, snap.constraint_penalty_weighted
        )));
    }

    Ok(())
}
