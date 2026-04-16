use super::helpers::pure_input;
use crate::solver5::{
    families,
    field::FiniteField,
    portfolio::FamilyEvaluation,
    problem::PureSgpProblem,
    types::{ConstructionQuality, EvidenceSourceKind, ResidualStructure},
    SearchEngine,
};

#[test]
fn round_robin_family_constructs_full_one_factorization() {
    let result = families::construct_round_robin(4);

    assert_eq!(result.family.label(), "round_robin");
    assert_eq!(result.max_supported_weeks, 7);
    assert_eq!(result.schedule.len(), 7);
    assert_eq!(result.metadata.quality, ConstructionQuality::ExactFrontier);
    assert_eq!(
        result.metadata.evidence[0].source_kind,
        EvidenceSourceKind::TheoremFamily
    );
}

#[test]
fn transversal_design_family_constructs_prime_power_case() {
    let field = FiniteField::for_order(4).expect("order 4 field should exist");
    let result = families::construct_transversal_design_portfolio(4, 3, &field);

    assert_eq!(result.family.label(), "transversal_design_prime_power");
    assert_eq!(result.schedule.len(), 4);
    assert_eq!(
        result.metadata.quality,
        ConstructionQuality::NearFrontier { missing_weeks: 1 }
    );
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
fn nkts_family_constructs_catalog_backed_18_case() {
    let entry = crate::solver5::catalog::nkts::exact_case(6)
        .expect("nkts catalog should expose the 18-player case");
    let result = families::construct_nearly_kirkman_triple_system(entry);

    assert_eq!(result.family.label(), "nkts");
    assert_eq!(result.schedule.len(), 8);
    assert_eq!(result.metadata.quality, ConstructionQuality::ExactFrontier);
    assert!(result
        .metadata
        .evidence
        .iter()
        .any(|evidence| matches!(evidence.source_kind, EvidenceSourceKind::CatalogFact)));
}

#[test]
fn end_to_end_round_robin_schedule_still_scores_zero() {
    let input = pure_input(4, 2, 7);
    let solver = SearchEngine::new(&input.solver);
    let result = solver
        .solve(&input)
        .expect("round robin should solve 4-2-7");

    assert_eq!(result.final_score, 0.0);
}

#[test]
fn family_registry_exposes_current_portfolio_order() {
    let families = families::registered_families();

    let labels = families
        .into_iter()
        .map(|family| family.id().label())
        .collect::<Vec<_>>();

    assert_eq!(
        labels,
        vec![
            "round_robin",
            "kirkman_6t_plus_1",
            "nkts",
            "affine_plane_prime_power",
            "transversal_design_prime_power",
        ]
    );
}

#[test]
fn family_evaluation_is_separate_from_construction() {
    let input = pure_input(8, 4, 8);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let family = families::registered_families()
        .into_iter()
        .find(|family| family.id().label() == "transversal_design_prime_power")
        .expect("transversal family should be registered");

    assert_eq!(
        family.evaluate(&problem),
        FamilyEvaluation::Applicable {
            max_supported_weeks: 8,
        }
    );

    let result = family
        .construct(&problem)
        .expect("evaluation-compatible family should construct");
    assert_eq!(result.max_supported_weeks, 8);
    assert_eq!(
        result.metadata.residual,
        Some(ResidualStructure::TransversalLatentGroups {
            subgroup_count: 4,
            subgroup_size: 2,
        })
    );
}
