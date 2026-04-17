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
fn single_round_partition_family_constructs_one_week_case() {
    let result = families::construct_single_round_partition(3, 4);

    assert_eq!(result.family.label(), "single_round_partition");
    assert_eq!(result.schedule.len(), 1);
    assert_eq!(
        result.metadata.quality,
        ConstructionQuality::LowerBound {
            gap_to_counting_bound: 2,
        }
    );
    assert!(result
        .metadata
        .evidence
        .iter()
        .any(|evidence| matches!(evidence.source_kind, EvidenceSourceKind::TheoremFamily)));
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
fn affine_plane_family_constructs_order_16_case() {
    let field = FiniteField::for_order(16).expect("order 16 field should exist");
    let result = families::construct_affine_plane(&field);

    assert_eq!(result.family.label(), "affine_plane_prime_power");
    assert_eq!(result.schedule.len(), 17);
}

#[test]
fn p4_resolvable_bibd_family_constructs_28_player_case() {
    let field = FiniteField::for_order(9).expect("order 9 field should exist");
    let result = families::construct_p4_resolvable_bibd(&field);

    assert_eq!(result.family.label(), "p4_router");
    assert_eq!(result.schedule.len(), 9);
    assert_eq!(result.metadata.quality, ConstructionQuality::ExactFrontier);
    assert!(result.metadata.evidence.iter().any(|evidence| matches!(
        evidence.source_kind,
        EvidenceSourceKind::FiniteFieldConstruction
    )));
}

#[test]
fn kirkman_family_constructs_6t_plus_1_case() {
    let field = FiniteField::for_order(7).expect("order 7 field should exist");
    let result = families::construct_kirkman_6t_plus_1(&field);

    assert_eq!(result.family.label(), "kirkman_6t_plus_1");
    assert_eq!(result.schedule.len(), 10);
}

#[test]
fn catalog_kts_family_constructs_15_player_case() {
    let entry = crate::solver5::catalog::kts::exact_case(5)
        .expect("kts catalog should expose the 15-player case");
    let result = families::construct_kirkman_triple_system(entry);

    assert_eq!(result.family.label(), "kts");
    assert_eq!(result.schedule.len(), 7);
    assert_eq!(result.metadata.quality, ConstructionQuality::ExactFrontier);
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
fn nkts_family_constructs_catalog_backed_24_case() {
    let entry = crate::solver5::catalog::nkts::exact_case(8)
        .expect("nkts catalog should expose the 24-player case");
    let result = families::construct_nearly_kirkman_triple_system(entry);

    assert_eq!(result.family.label(), "nkts");
    assert_eq!(result.schedule.len(), 11);
    assert_eq!(result.metadata.quality, ConstructionQuality::ExactFrontier);
}

#[test]
fn nkts_family_constructs_catalog_backed_30_case() {
    let entry = crate::solver5::catalog::nkts::exact_case(10)
        .expect("nkts catalog should expose the 30-player case");
    let result = families::construct_nearly_kirkman_triple_system(entry);

    assert_eq!(result.family.label(), "nkts");
    assert_eq!(result.schedule.len(), 14);
    assert_eq!(result.metadata.quality, ConstructionQuality::ExactFrontier);
}

#[test]
fn nkts_pseudo_doubling_constructs_30_player_case() {
    let entry = crate::solver5::catalog::kts::exact_case(5)
        .expect("kts catalog should expose the 15-player case");
    let result = families::construct_nearly_kirkman_triple_system_via_pseudo_doubling(entry);

    assert_eq!(result.family.label(), "nkts");
    assert_eq!(result.schedule.len(), 13);
    assert_eq!(
        result.metadata.quality,
        ConstructionQuality::NearFrontier { missing_weeks: 1 }
    );
}

#[test]
fn published_schedule_bank_constructs_24_player_case() {
    let entry = crate::solver5::catalog::published::exact_case(8, 3)
        .expect("published schedule catalog should expose the 8-3-10 case");
    let result = families::construct_published_schedule_bank(entry);

    assert_eq!(result.family.label(), "published_schedule_bank");
    assert_eq!(result.schedule.len(), 10);
    assert_eq!(
        result.metadata.quality,
        ConstructionQuality::NearFrontier { missing_weeks: 1 }
    );
    assert!(result
        .metadata
        .evidence
        .iter()
        .any(|evidence| matches!(evidence.source_kind, EvidenceSourceKind::PatchBank)));
}

#[test]
fn published_schedule_bank_constructs_40_player_p4_case() {
    let entry = crate::solver5::catalog::published::exact_case(10, 4)
        .expect("published schedule catalog should expose the 10-4-9 case");
    let result = families::construct_published_schedule_bank(entry);

    assert_eq!(result.family.label(), "published_schedule_bank");
    assert_eq!(result.schedule.len(), 9);
    assert_eq!(
        result.metadata.quality,
        ConstructionQuality::LowerBound {
            gap_to_counting_bound: 4,
        }
    );
}

#[test]
fn published_schedule_bank_constructs_36_player_p4_case() {
    let entry = crate::solver5::catalog::published::exact_case(9, 4)
        .expect("published schedule catalog should expose the 9-4-11 case");
    let result = families::construct_published_schedule_bank(entry);

    assert_eq!(result.family.label(), "published_schedule_bank");
    assert_eq!(result.schedule.len(), 11);
    assert_eq!(result.metadata.quality, ConstructionQuality::ExactFrontier);
}

#[test]
fn ownsg_family_constructs_90_player_case() {
    let entry = crate::solver5::catalog::ownsg::exact_case(10, 9)
        .expect("ownsg catalog should expose the 10-9-5 case");
    let result = families::construct_own_social_golfer(entry);

    assert_eq!(result.family.label(), "ownsg");
    assert_eq!(result.schedule.len(), 5);
    assert_eq!(
        result.metadata.quality,
        ConstructionQuality::LowerBound {
            gap_to_counting_bound: 6,
        }
    );
}

#[test]
fn ritd_family_constructs_50_player_case() {
    let entry = crate::solver5::catalog::ritd::exact_case(10, 5)
        .expect("ritd catalog should expose the 10-5 case");
    let result = families::construct_resolvable_incomplete_transversal_design(entry);

    assert_eq!(result.family.label(), "ritd");
    assert_eq!(result.schedule.len(), 9);
    assert_eq!(
        result.metadata.quality,
        ConstructionQuality::LowerBound {
            gap_to_counting_bound: 3,
        }
    );
}

#[test]
fn molr_group_fill_family_constructs_100_player_case() {
    let entry = crate::solver5::catalog::molr::exact_case(10, 10)
        .expect("molr catalog should expose the 10-10 case");
    let result = families::construct_molr_group_fill(entry);

    assert_eq!(result.family.label(), "molr_group_fill");
    assert_eq!(result.schedule.len(), 4);
    assert_eq!(
        result.metadata.quality,
        ConstructionQuality::LowerBound {
            gap_to_counting_bound: 7,
        }
    );
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
            "kts",
            "nkts",
            "ownsg",
            "ritd",
            "molr_group_fill",
            "affine_plane_prime_power",
            "p4_router",
            "published_schedule_bank",
            "transversal_design_prime_power",
            "single_round_partition",
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
