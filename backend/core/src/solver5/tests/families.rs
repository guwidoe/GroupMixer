use super::helpers::pure_input;
use crate::solver5::{families, field::FiniteField, SearchEngine};

#[test]
fn round_robin_family_constructs_full_one_factorization() {
    let result = families::construct_round_robin(4);

    assert_eq!(result.family.label(), "round_robin");
    assert_eq!(result.max_supported_weeks, 7);
    assert_eq!(result.schedule.len(), 7);
}

#[test]
fn transversal_design_family_constructs_prime_power_case() {
    let field = FiniteField::for_order(4).expect("order 4 field should exist");
    let result = families::construct_transversal_design_portfolio(4, 3, &field);

    assert_eq!(result.family.label(), "transversal_design_prime_power");
    assert_eq!(result.schedule.len(), 4);
}

#[test]
fn affine_plane_family_constructs_prime_power_case() {
    let field = FiniteField::for_order(4).expect("order 4 field should exist");
    let result = families::construct_affine_plane(&field);

    assert_eq!(result.family.label(), "affine_plane_prime_power");
    assert_eq!(result.schedule.len(), 5);
}

#[test]
fn kirkman_family_constructs_6t_plus_1_case() {
    let field = FiniteField::for_order(7).expect("order 7 field should exist");
    let result = families::construct_kirkman_6t_plus_1(&field);

    assert_eq!(result.family.label(), "kirkman_6t_plus_1");
    assert_eq!(result.schedule.len(), 10);
}

#[test]
fn end_to_end_round_robin_schedule_still_scores_zero() {
    let input = pure_input(4, 2, 7);
    let solver = SearchEngine::new(&input.solver);
    let result = solver.solve(&input).expect("round robin should solve 4-2-7");

    assert_eq!(result.final_score, 0.0);
}
