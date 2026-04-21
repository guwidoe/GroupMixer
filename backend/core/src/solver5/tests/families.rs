use super::helpers::pure_input;
use crate::solver5::{
    families,
    field::FiniteField,
    portfolio::FamilyEvaluation,
    problem::PureSgpProblem,
    types::{ConstructionQuality, EvidenceSourceKind},
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
fn p4_resolvable_bibd_family_constructs_76_player_case() {
    let field = FiniteField::for_order(25).expect("order 25 field should exist");
    let result = families::construct_p4_resolvable_bibd(&field);

    assert_eq!(result.family.label(), "p4_router");
    assert_eq!(result.schedule.len(), 25);
    assert_eq!(result.metadata.quality, ConstructionQuality::ExactFrontier);
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
fn catalog_kts_family_constructs_51_player_case() {
    let entry = crate::solver5::catalog::kts::exact_case(17)
        .expect("kts catalog should expose the 51-player case");
    let result = families::construct_kirkman_triple_system(entry);

    assert_eq!(result.family.label(), "kts");
    assert_eq!(result.schedule.len(), 25);
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
fn nkts_family_constructs_catalog_backed_36_case() {
    let entry = crate::solver5::catalog::nkts::exact_case(12)
        .expect("nkts catalog should expose the 36-player case");
    let result = families::construct_nearly_kirkman_triple_system(entry);

    assert_eq!(result.family.label(), "nkts");
    assert_eq!(result.schedule.len(), 17);
    assert_eq!(result.metadata.quality, ConstructionQuality::ExactFrontier);
}

#[test]
fn nkts_family_constructs_catalog_backed_48_case() {
    let entry = crate::solver5::catalog::nkts::exact_case(16)
        .expect("nkts catalog should expose the 48-player case");
    let result = families::construct_nearly_kirkman_triple_system(entry);

    assert_eq!(result.family.label(), "nkts");
    assert_eq!(result.schedule.len(), 23);
    assert_eq!(result.metadata.quality, ConstructionQuality::ExactFrontier);
}

#[test]
fn nkts_family_constructs_catalog_backed_60_case() {
    let entry = crate::solver5::catalog::nkts::exact_case(20)
        .expect("nkts catalog should expose the 60-player case");
    let result = families::construct_nearly_kirkman_triple_system(entry);

    assert_eq!(result.family.label(), "nkts");
    assert_eq!(result.schedule.len(), 29);
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
fn nkts_pseudo_doubling_constructs_exact_42_player_case_from_kirkman_seed() {
    let field = FiniteField::for_order(7).expect("order 7 field should exist");
    let seed = families::construct_kirkman_6t_plus_1(&field);
    let result = families::construct_nearly_kirkman_triple_system_via_exact_kirkman_seed(seed, 7);

    assert_eq!(result.family.label(), "nkts");
    assert_eq!(result.schedule.len(), 20);
    assert_eq!(result.metadata.quality, ConstructionQuality::ExactFrontier);
    assert!(result.metadata.evidence.iter().any(|evidence| {
        matches!(
            evidence.source_kind,
            EvidenceSourceKind::FiniteFieldConstruction | EvidenceSourceKind::StructuralComposition
        )
    }));
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
fn mols_catalog_family_constructs_and_lifts_60_player_case() {
    let entry = crate::solver5::catalog::mols::exact_case(12)
        .expect("mols catalog should expose the 12-group case");
    let result = families::construct_catalog_mols_transversal(entry, 6);

    assert_eq!(result.family.label(), "mols_catalog");
    assert_eq!(result.schedule.len(), 13);
    assert_eq!(
        result.provenance.operators,
        vec![crate::solver5::types::CompositionOperatorId::RecursiveTransversalLift]
    );
    assert_eq!(
        result.metadata.quality,
        ConstructionQuality::NearFrontier { missing_weeks: 1 }
    );
}

#[test]
fn mols_catalog_family_constructs_and_lifts_45_player_case() {
    let entry = crate::solver5::catalog::mols::exact_case(15)
        .expect("mols catalog should expose the 15-group case");
    let result = families::construct_catalog_mols_transversal(entry, 3);

    assert_eq!(result.family.label(), "mols_catalog");
    assert_eq!(result.schedule.len(), 22);
    assert_eq!(result.metadata.quality, ConstructionQuality::ExactFrontier);
}

#[test]
fn mols_catalog_family_constructs_18_5_case_from_oa_derived_bank() {
    let entry = crate::solver5::catalog::mols::exact_case(18)
        .expect("mols catalog should expose the 18-group case");
    let result = families::construct_catalog_mols_transversal(entry, 5);

    assert_eq!(result.family.label(), "mols_catalog");
    assert_eq!(result.schedule.len(), 18);
    assert_eq!(
        result.metadata.quality,
        ConstructionQuality::LowerBound {
            gap_to_counting_bound: 4,
        }
    );
}

#[test]
fn mols_catalog_family_constructs_and_lifts_18_6_case_from_oa_derived_bank() {
    let entry = crate::solver5::catalog::mols::exact_case(18)
        .expect("mols catalog should expose the 18-group case");
    let result = families::construct_catalog_mols_transversal(entry, 6);

    assert_eq!(result.family.label(), "mols_catalog");
    assert_eq!(result.schedule.len(), 19);
    assert_eq!(
        result.provenance.operators,
        vec![crate::solver5::types::CompositionOperatorId::RecursiveTransversalLift]
    );
    assert_eq!(
        result.metadata.quality,
        ConstructionQuality::LowerBound {
            gap_to_counting_bound: 2,
        }
    );
}

#[test]
fn mols_product_family_constructs_20_3_case() {
    let spec = crate::solver5::families::mols_product::best_spec(20, 3)
        .expect("mols product should support 20-3");
    let result = families::construct_product_mols_transversal(spec, 3);

    assert_eq!(result.family.label(), "mols_product");
    assert_eq!(result.schedule.len(), 20);
    assert_eq!(
        result.metadata.quality,
        ConstructionQuality::LowerBound {
            gap_to_counting_bound: 9,
        }
    );
}

#[test]
fn mols_product_family_constructs_and_lifts_20_4_case() {
    let spec = crate::solver5::families::mols_product::best_spec(20, 4)
        .expect("mols product should support 20-4");
    let result = families::construct_product_mols_transversal(spec, 4);

    assert_eq!(result.family.label(), "mols_product");
    assert_eq!(result.schedule.len(), 25);
    assert_eq!(
        result.provenance.operators,
        vec![crate::solver5::types::CompositionOperatorId::RecursiveTransversalLift]
    );
    assert_eq!(
        result.metadata.quality,
        ConstructionQuality::NearFrontier { missing_weeks: 1 }
    );
}

#[test]
fn qdm_rtd_catalog_family_constructs_and_lifts_20_5_case() {
    let entry = crate::solver5::catalog::qdm::exact_case(20, 5)
        .expect("qdm catalog should expose the 20-5 case");
    let result = families::construct_qdm_catalog_rtd(entry);

    assert_eq!(result.family.label(), "rtd_qdm_catalog");
    assert_eq!(result.schedule.len(), 21);
    assert_eq!(
        result.provenance.operators,
        vec![crate::solver5::types::CompositionOperatorId::RecursiveTransversalLift]
    );
    assert_eq!(
        result.metadata.quality,
        ConstructionQuality::LowerBound {
            gap_to_counting_bound: 3,
        }
    );
}

#[test]
fn molr_from_mols_family_constructs_high_p_order_18_case() {
    let entry = crate::solver5::catalog::mols::exact_case(18)
        .expect("mols catalog should expose the 18-group case");
    let result = families::construct_molr_from_explicit_mols(entry, 8);

    assert_eq!(result.family.label(), "molr_from_mols");
    assert_eq!(result.schedule.len(), 6);
    assert_eq!(
        result.metadata.quality,
        ConstructionQuality::LowerBound {
            gap_to_counting_bound: 14,
        }
    );
}

#[test]
fn molr_from_mols_family_constructs_and_lifts_product_order_20_case() {
    let spec = crate::solver5::families::mols_product::best_molr_spec(20, 5)
        .expect("product mols should support 20-5 in the MOLR range");
    let result = families::construct_molr_from_product_mols(spec, 5);

    assert_eq!(result.family.label(), "molr_from_mols");
    assert_eq!(result.schedule.len(), 5);
    assert_eq!(
        result.provenance.operators,
        vec![crate::solver5::types::CompositionOperatorId::RecursiveTransversalLift]
    );
    assert_eq!(
        result.metadata.quality,
        ConstructionQuality::LowerBound {
            gap_to_counting_bound: 19,
        }
    );
}

#[test]
fn molr_from_qdm_mols_family_constructs_order_20_high_p_cases() {
    let entry = crate::solver5::catalog::qdm::mols_case(20)
        .expect("qdm catalog should expose an order-20 MOLS bank");

    let result = families::construct_molr_from_qdm_mols(entry, 7);
    assert_eq!(result.family.label(), "molr_from_mols");
    assert_eq!(result.schedule.len(), 5);
    assert_eq!(
        result.metadata.quality,
        ConstructionQuality::LowerBound {
            gap_to_counting_bound: 18,
        }
    );

    let lifted = families::construct_molr_from_qdm_mols(entry, 20);
    assert_eq!(lifted.schedule.len(), 6);
    assert_eq!(
        lifted.provenance.operators,
        vec![crate::solver5::types::CompositionOperatorId::RecursiveTransversalLift]
    );
    assert_eq!(
        lifted.metadata.quality,
        ConstructionQuality::LowerBound {
            gap_to_counting_bound: 15,
        }
    );
}

#[test]
fn molr_from_mols_family_constructs_and_lifts_square_order_case() {
    let entry = crate::solver5::catalog::mols::exact_case(12)
        .expect("mols catalog should expose the 12-group case");
    let result = families::construct_molr_from_explicit_mols(entry, 12);

    assert_eq!(result.family.label(), "molr_from_mols");
    assert_eq!(result.schedule.len(), 7);
    assert_eq!(
        result.provenance.operators,
        vec![crate::solver5::types::CompositionOperatorId::RecursiveTransversalLift]
    );
    assert_eq!(
        result.metadata.quality,
        ConstructionQuality::LowerBound {
            gap_to_counting_bound: 6,
        }
    );
}

#[test]
fn molr_from_mols_family_constructs_product_square_order_case() {
    let spec = crate::solver5::families::mols_product::best_molr_spec(20, 20)
        .expect("product mols should support 20-20 in the MOLR range");
    let result = families::construct_molr_from_product_mols(spec, 20);

    assert_eq!(result.family.label(), "molr_from_mols");
    assert_eq!(result.schedule.len(), 5);
    assert_eq!(
        result.provenance.operators,
        vec![crate::solver5::types::CompositionOperatorId::RecursiveTransversalLift]
    );
    assert_eq!(
        result.metadata.quality,
        ConstructionQuality::LowerBound {
            gap_to_counting_bound: 16,
        }
    );
}

#[test]
fn ownsg_family_constructs_96_player_case() {
    let entry = crate::solver5::catalog::ownsg::exact_case(12, 8)
        .expect("ownsg catalog should expose the 12-8-6 case");
    let result = families::construct_own_social_golfer(entry);

    assert_eq!(result.family.label(), "ownsg");
    assert_eq!(result.schedule.len(), 6);
    assert_eq!(
        result.metadata.quality,
        ConstructionQuality::LowerBound {
            gap_to_counting_bound: 7,
        }
    );
}

#[test]
fn ownsg_family_constructs_120_player_case() {
    let entry = crate::solver5::catalog::ownsg::exact_case(20, 6)
        .expect("ownsg catalog should expose the 20-6-13 case");
    let result = families::construct_own_social_golfer(entry);

    assert_eq!(result.family.label(), "ownsg");
    assert_eq!(result.schedule.len(), 13);
    assert_eq!(
        result.metadata.quality,
        ConstructionQuality::LowerBound {
            gap_to_counting_bound: 10
        }
    );
}

#[test]
fn ownsg_family_applies_group_lift_when_residual_problem_has_one_week() {
    let entry = crate::solver5::catalog::ownsg::exact_case(14, 7)
        .expect("ownsg catalog should expose the 14-7 case");
    let result = families::construct_own_social_golfer(entry);

    assert_eq!(result.family.label(), "ownsg");
    assert_eq!(result.schedule.len(), 9);
    assert_eq!(
        result.provenance.operators,
        vec![crate::solver5::types::CompositionOperatorId::RecursiveTransversalLift]
    );
    assert_eq!(
        result.metadata.quality,
        ConstructionQuality::LowerBound {
            gap_to_counting_bound: 7,
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
fn rbibd_catalog_family_constructs_120_player_case() {
    let entry = crate::solver5::catalog::rbibd::exact_case(15, 8)
        .expect("rbibd catalog should expose the 15-8 case");
    let result = families::construct_resolvable_bibd_catalog(entry);

    assert_eq!(result.family.label(), "rbibd_catalog");
    assert_eq!(result.schedule.len(), 17);
    assert_eq!(result.metadata.quality, ConstructionQuality::ExactFrontier);
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
            "mols_catalog",
            "mols_product",
            "rtd_qdm_catalog",
            "ownsg",
            "molr_from_mols",
            "ritd",
            "molr_group_fill",
            "affine_plane_prime_power",
            "p4_router",
            "rbibd_catalog",
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
            max_supported_weeks: 9,
        }
    );

    let result = family
        .construct(&problem)
        .expect("evaluation-compatible family should construct");
    assert_eq!(result.max_supported_weeks, 9);
    assert_eq!(
        result.provenance.operators,
        vec![crate::solver5::types::CompositionOperatorId::RecursiveTransversalLift]
    );
    assert_eq!(result.metadata.residual, None);
}
