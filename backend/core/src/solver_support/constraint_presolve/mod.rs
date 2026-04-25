//! Lightweight constraint presolve shared by solver construction heuristics.
//!
//! This module does not replace full model compilation/validation. It derives reusable structural
//! consequences from already-compiled constraints so construction code does not need to rediscover
//! them ad hoc. Initial consumers are oracle-projection experiments that need symmetry-breaking
//! structure such as merged clique components and clique-derived immovable placements.

mod cliques;
mod hard_apart;
mod immovable;
mod sessions;
mod types;

use crate::solver3::compiled_problem::CompiledProblem;
use crate::solver_support::SolverError;

use cliques::{build_clique_component_by_person_session, build_clique_components};
use hard_apart::build_hard_apart_units;
use immovable::build_effective_immovable_assignments;

pub(crate) use types::PresolvedConstraintModel;

pub(crate) fn presolve_constraints(
    compiled: &CompiledProblem,
) -> Result<PresolvedConstraintModel, SolverError> {
    let clique_components = build_clique_components(compiled)?;
    let clique_component_by_person_session = build_clique_component_by_person_session(compiled);
    let effective_immovable_assignments =
        build_effective_immovable_assignments(compiled, &clique_components)?;
    let hard_apart_units = build_hard_apart_units(compiled, &clique_component_by_person_session)?;

    Ok(PresolvedConstraintModel {
        clique_components,
        clique_component_by_person_session,
        effective_immovable_assignments,
        hard_apart_units,
    })
}
