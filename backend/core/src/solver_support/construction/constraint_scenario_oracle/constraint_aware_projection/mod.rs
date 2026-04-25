//! Constraint-aware oracle projection scaffold.
//!
//! This module is intentionally parallel to the current projection implementation. It is the
//! staging point for treating projection as a symmetry-aware relabeling problem: constraints
//! generate typed candidate atoms in the oracle schedule, and a later reconciliation step will pick
//! a compatible set of atoms to seed/optimize oracle-person, oracle-session, and oracle-group
//! mappings before merge applies destructive schedule edits.
//!
//! The entry point currently preserves legacy projection behavior after building these typed atoms.
//! That keeps the scaffold benchmark-neutral while giving the replacement algorithm explicit data
//! structures to grow into.

mod atoms;
mod builders;
mod oracle_index;

use crate::solver3::compiled_problem::CompiledProblem;
use crate::solver_support::constraint_presolve::presolve_constraints;
use crate::solver_support::SolverError;

use super::projection::project_oracle_schedule_to_template;
use super::types::{
    ConstraintScenarioScaffoldMask, ConstraintScenarioSignals, OracleTemplateCandidate,
    OracleTemplateProjectionResult, PureStructureOracleSchedule,
};
use builders::build_projection_atoms;

/// Experimental projection entry point for constraint-aware relabeling research.
///
/// Today it delegates to the established projection after building typed projection atoms. The
/// atom generation is deliberately real, not a placeholder: each symmetry-breaking constraint
/// produces candidates over oracle-local people/session/group structures without prematurely
/// treating real names as fixed anchors.
pub(crate) fn project_oracle_schedule_to_template_constraint_aware(
    compiled: &CompiledProblem,
    signals: &ConstraintScenarioSignals,
    mask: &ConstraintScenarioScaffoldMask,
    candidate: &OracleTemplateCandidate,
    oracle_schedule: &PureStructureOracleSchedule,
) -> Result<OracleTemplateProjectionResult, SolverError> {
    let presolved = presolve_constraints(compiled)?;
    let atoms = build_projection_atoms(compiled, candidate, &oracle_schedule.schedule);
    let projection =
        project_oracle_schedule_to_template(compiled, signals, mask, candidate, oracle_schedule)?;
    debug_assert!(presolved.is_shape_compatible(compiled));
    debug_assert!(atoms.is_shape_compatible(compiled, candidate));
    Ok(projection)
}
