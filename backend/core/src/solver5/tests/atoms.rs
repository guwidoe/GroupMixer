use crate::solver5::atoms::{
    build_solver_result_from_atom_for_solver6_input, query_construction_atom,
    query_construction_atom_from_solver6_input, Solver5AtomSpanRequest,
    Solver5ConstructionAtomSpan,
};

use super::helpers::pure_input;

#[test]
fn requested_span_atom_returns_exact_requested_schedule() {
    let input = pure_input(8, 4, 10);
    let atom = query_construction_atom(&input, Solver5AtomSpanRequest::RequestedSpan)
        .expect("8-4-10 should yield an exact requested-span atom");

    assert_eq!(atom.requested_weeks, 10);
    assert_eq!(atom.max_supported_weeks, 10);
    assert_eq!(atom.returned_weeks(), 10);
    assert_eq!(atom.span, Solver5ConstructionAtomSpan::Full);
    assert!(atom.covers_requested_weeks());
}

#[test]
fn closest_supporting_span_prefers_the_smallest_supporting_atom() {
    let input = pure_input(8, 3, 10);
    let atom = query_construction_atom(&input, Solver5AtomSpanRequest::ClosestSupportingSpan)
        .expect("8-3-10 should yield a closest-supporting atom");

    assert_eq!(atom.requested_weeks, 10);
    assert_eq!(atom.max_supported_weeks, 10);
    assert_eq!(atom.returned_weeks(), 10);
    assert_eq!(atom.span, Solver5ConstructionAtomSpan::Full);
}

#[test]
fn best_available_full_span_atom_can_bridge_from_solver6_input() {
    let mut input = pure_input(8, 4, 20);
    input.solver = crate::engines::default_solver_configuration_for(crate::models::SolverKind::Solver6);

    let atom = query_construction_atom_from_solver6_input(
        &input,
        Solver5AtomSpanRequest::BestAvailableFullSpan,
    )
    .expect("solver6 should be able to request the best available solver5 atom");

    assert_eq!(atom.requested_weeks, 20);
    assert_eq!(atom.max_supported_weeks, 10);
    assert_eq!(atom.returned_weeks(), 10);
    assert!(!atom.covers_requested_weeks());
}

#[test]
fn exact_atom_can_be_projected_back_to_a_solver_result_for_solver6() {
    let mut input = pure_input(2, 2, 3);
    input.solver = crate::engines::default_solver_configuration_for(crate::models::SolverKind::Solver6);

    let atom = query_construction_atom_from_solver6_input(
        &input,
        Solver5AtomSpanRequest::RequestedSpan,
    )
    .expect("2-2-3 should produce an exact solver5 atom");
    let result = build_solver_result_from_atom_for_solver6_input(&input, &atom)
        .expect("exact atom should canonicalize back into a solver result");

    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 3);
}
