use super::helpers::pure_input;
use crate::solver5::{
    problem::PureSgpProblem,
    router::{attempt_construction, FamilyAttemptStatus},
    types::{CompositionOperatorId, ConstructionFamilyId, ConstructionQuality, ConstructionSpan},
};

#[test]
fn router_selects_round_robin_for_p2_cases() {
    let input = pure_input(4, 2, 7);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should find round robin");

    assert_eq!(decision.result.family, ConstructionFamilyId::RoundRobin);
    assert_eq!(decision.attempts.len(), 17);
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::RoundRobin
            && attempt.status
                == FamilyAttemptStatus::Selected {
                    max_supported_weeks: 7,
                    quality: ConstructionQuality::ExactFrontier,
                }
    }));
}

#[test]
fn router_uses_single_round_partition_for_one_week_fallback_case() {
    let input = pure_input(3, 4, 1);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 3-4-1");

    assert_eq!(
        decision.result.family,
        ConstructionFamilyId::SingleRoundPartition
    );
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::SingleRoundPartition
            && attempt.status
                == FamilyAttemptStatus::Selected {
                    max_supported_weeks: 1,
                    quality: ConstructionQuality::LowerBound {
                        gap_to_counting_bound: 2,
                    },
                }
    }));
}

#[test]
fn router_reports_prefix_and_recursive_provenance() {
    let input = pure_input(9, 3, 10);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 9-3-10");

    assert_eq!(
        decision.result.family,
        ConstructionFamilyId::TransversalDesignPrimePower
    );
    assert_eq!(
        decision.result.span,
        ConstructionSpan::Prefix {
            requested_weeks: 10,
        }
    );
    assert_eq!(decision.result.max_supported_weeks, 13);
    assert_eq!(
        decision.result.provenance.operators,
        vec![CompositionOperatorId::RecursiveTransversalLift]
    );
}

#[test]
fn router_selects_nkts_catalog_case_for_6_3_8() {
    let input = pure_input(6, 3, 8);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 6-3-8");

    assert_eq!(
        decision.result.family,
        ConstructionFamilyId::NearlyKirkmanTripleSystem
    );
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::NearlyKirkmanTripleSystem
            && attempt.status
                == FamilyAttemptStatus::Selected {
                    max_supported_weeks: 8,
                    quality: ConstructionQuality::ExactFrontier,
                }
    }));
}

#[test]
fn router_selects_exact_nkts_catalog_case_for_8_3_11() {
    let input = pure_input(8, 3, 11);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 8-3-11");

    assert_eq!(
        decision.result.family,
        ConstructionFamilyId::NearlyKirkmanTripleSystem
    );
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::NearlyKirkmanTripleSystem
            && attempt.status
                == FamilyAttemptStatus::Selected {
                    max_supported_weeks: 11,
                    quality: ConstructionQuality::ExactFrontier,
                }
    }));
}

#[test]
fn router_selects_catalog_kts_case_for_5_3_7() {
    let input = pure_input(5, 3, 7);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 5-3-7");

    assert_eq!(
        decision.result.family,
        ConstructionFamilyId::KirkmanTripleSystem
    );
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::KirkmanTripleSystem
            && attempt.status
                == FamilyAttemptStatus::Selected {
                    max_supported_weeks: 7,
                    quality: ConstructionQuality::ExactFrontier,
                }
    }));
}

#[test]
fn router_selects_catalog_kts_case_for_17_3_25() {
    let input = pure_input(17, 3, 25);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 17-3-25");

    assert_eq!(decision.result.family, ConstructionFamilyId::KirkmanTripleSystem);
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::KirkmanTripleSystem
            && attempt.status
                == FamilyAttemptStatus::Selected {
                    max_supported_weeks: 25,
                    quality: ConstructionQuality::ExactFrontier,
                }
    }));
}

#[test]
fn router_selects_exact_nkts_catalog_case_for_10_3_14() {
    let input = pure_input(10, 3, 14);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 10-3-14");

    assert_eq!(
        decision.result.family,
        ConstructionFamilyId::NearlyKirkmanTripleSystem
    );
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::NearlyKirkmanTripleSystem
            && attempt.status
                == FamilyAttemptStatus::Selected {
                    max_supported_weeks: 14,
                    quality: ConstructionQuality::ExactFrontier,
                }
    }));
}

#[test]
fn router_selects_exact_nkts_catalog_case_for_12_3_17() {
    let input = pure_input(12, 3, 17);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 12-3-17");

    assert_eq!(
        decision.result.family,
        ConstructionFamilyId::NearlyKirkmanTripleSystem
    );
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::NearlyKirkmanTripleSystem
            && attempt.status
                == FamilyAttemptStatus::Selected {
                    max_supported_weeks: 17,
                    quality: ConstructionQuality::ExactFrontier,
                }
    }));
}

#[test]
fn router_selects_exact_nkts_catalog_case_for_16_3_23() {
    let input = pure_input(16, 3, 23);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 16-3-23");

    assert_eq!(
        decision.result.family,
        ConstructionFamilyId::NearlyKirkmanTripleSystem
    );
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::NearlyKirkmanTripleSystem
            && attempt.status
                == FamilyAttemptStatus::Selected {
                    max_supported_weeks: 23,
                    quality: ConstructionQuality::ExactFrontier,
                }
    }));
}

#[test]
fn router_selects_exact_nkts_seeded_case_for_14_3_20() {
    let input = pure_input(14, 3, 20);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 14-3-20");

    assert_eq!(
        decision.result.family,
        ConstructionFamilyId::NearlyKirkmanTripleSystem
    );
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::NearlyKirkmanTripleSystem
            && attempt.status
                == FamilyAttemptStatus::Selected {
                    max_supported_weeks: 20,
                    quality: ConstructionQuality::ExactFrontier,
                }
    }));
}

#[test]
fn router_selects_published_schedule_bank_for_8_3_10() {
    let input = pure_input(8, 3, 10);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 8-3-10");

    assert_eq!(
        decision.result.family,
        ConstructionFamilyId::NearlyKirkmanTripleSystem
    );
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::PublishedScheduleBank
            && matches!(
                attempt.status,
                FamilyAttemptStatus::RejectedAsWeaker {
                    selected_family: ConstructionFamilyId::NearlyKirkmanTripleSystem,
                    ..
                }
            )
    }));
}

#[test]
fn router_selects_p4_resolvable_bibd_for_10_4_9() {
    let input = pure_input(10, 4, 9);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 10-4-9");

    assert_eq!(
        decision.result.family,
        ConstructionFamilyId::P4ResolvableBIBD
    );
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::PublishedScheduleBank
            && matches!(
                attempt.status,
                FamilyAttemptStatus::RejectedAsWeaker {
                    selected_family: ConstructionFamilyId::P4ResolvableBIBD,
                    ..
                }
            )
    }));
}

#[test]
fn router_selects_p4_resolvable_bibd_for_19_4_25() {
    let input = pure_input(19, 4, 25);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 19-4-25");

    assert_eq!(
        decision.result.family,
        ConstructionFamilyId::P4ResolvableBIBD
    );
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::P4ResolvableBIBD
            && attempt.status
                == FamilyAttemptStatus::Selected {
                    max_supported_weeks: 25,
                    quality: ConstructionQuality::ExactFrontier,
                }
    }));
}

#[test]
fn router_selects_published_schedule_bank_for_9_4_11() {
    let input = pure_input(9, 4, 11);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 9-4-11");

    assert_eq!(
        decision.result.family,
        ConstructionFamilyId::PublishedScheduleBank
    );
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::PublishedScheduleBank
            && attempt.status
                == FamilyAttemptStatus::Selected {
                    max_supported_weeks: 11,
                    quality: ConstructionQuality::ExactFrontier,
                }
    }));
}

#[test]
fn router_selects_prime_power_affine_plane_for_16_16_17() {
    let input = pure_input(16, 16, 17);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 16-16-17");

    assert_eq!(
        decision.result.family,
        ConstructionFamilyId::AffinePlanePrimePower
    );
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::AffinePlanePrimePower
            && attempt.status
                == FamilyAttemptStatus::Selected {
                    max_supported_weeks: 17,
                    quality: ConstructionQuality::ExactFrontier,
                }
    }));
}

#[test]
fn router_selects_ownsg_for_10_7_7() {
    let input = pure_input(10, 7, 7);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 10-7-7");

    assert_eq!(
        decision.result.family,
        ConstructionFamilyId::OwnSocialGolfer
    );
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::OwnSocialGolfer
            && attempt.status
                == FamilyAttemptStatus::Selected {
                    max_supported_weeks: 7,
                    quality: ConstructionQuality::LowerBound {
                        gap_to_counting_bound: 4,
                    },
                }
    }));
}

#[test]
fn router_selects_mols_catalog_for_12_6_13() {
    let input = pure_input(12, 6, 13);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 12-6-13");

    assert_eq!(decision.result.family, ConstructionFamilyId::MolsCatalog);
    assert_eq!(
        decision.result.provenance.operators,
        vec![CompositionOperatorId::RecursiveTransversalLift]
    );
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::MolsCatalog
            && attempt.status
                == FamilyAttemptStatus::Selected {
                    max_supported_weeks: 13,
                    quality: ConstructionQuality::NearFrontier { missing_weeks: 1 },
                }
    }));
}

#[test]
fn router_selects_mols_catalog_for_15_3_22() {
    let input = pure_input(15, 3, 22);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 15-3-22");

    assert_eq!(decision.result.family, ConstructionFamilyId::MolsCatalog);
    assert_eq!(
        decision.result.provenance.operators,
        vec![CompositionOperatorId::RecursiveTransversalLift]
    );
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::MolsCatalog
            && attempt.status
                == FamilyAttemptStatus::Selected {
                    max_supported_weeks: 22,
                    quality: ConstructionQuality::ExactFrontier,
                }
    }));
}

#[test]
fn router_selects_mols_catalog_for_18_5_18() {
    let input = pure_input(18, 5, 18);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 18-5-18");

    assert_eq!(decision.result.family, ConstructionFamilyId::MolsCatalog);
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::MolsCatalog
            && attempt.status
                == FamilyAttemptStatus::Selected {
                    max_supported_weeks: 18,
                    quality: ConstructionQuality::LowerBound {
                        gap_to_counting_bound: 4,
                    },
                }
    }));
}

#[test]
fn router_selects_mols_catalog_for_18_6_19() {
    let input = pure_input(18, 6, 19);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 18-6-19");

    assert_eq!(decision.result.family, ConstructionFamilyId::MolsCatalog);
    assert_eq!(
        decision.result.provenance.operators,
        vec![CompositionOperatorId::RecursiveTransversalLift]
    );
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::MolsCatalog
            && attempt.status
                == FamilyAttemptStatus::Selected {
                    max_supported_weeks: 19,
                    quality: ConstructionQuality::LowerBound {
                        gap_to_counting_bound: 2,
                    },
                }
    }));
}

#[test]
fn router_selects_mols_product_for_20_3_20() {
    let input = pure_input(20, 3, 20);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 20-3-20");

    assert_eq!(decision.result.family, ConstructionFamilyId::MolsProduct);
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::MolsProduct
            && attempt.status
                == FamilyAttemptStatus::Selected {
                    max_supported_weeks: 20,
                    quality: ConstructionQuality::LowerBound {
                        gap_to_counting_bound: 9,
                    },
                }
    }));
}

#[test]
fn router_selects_mols_product_for_20_4_25() {
    let input = pure_input(20, 4, 25);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 20-4-25");

    assert_eq!(decision.result.family, ConstructionFamilyId::MolsProduct);
    assert_eq!(
        decision.result.provenance.operators,
        vec![CompositionOperatorId::RecursiveTransversalLift]
    );
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::MolsProduct
            && attempt.status
                == FamilyAttemptStatus::Selected {
                    max_supported_weeks: 25,
                    quality: ConstructionQuality::NearFrontier { missing_weeks: 1 },
                }
    }));
}

#[test]
fn router_selects_qdm_rtd_catalog_for_20_5_21() {
    let input = pure_input(20, 5, 21);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 20-5-21");

    assert_eq!(decision.result.family, ConstructionFamilyId::RtdQdmCatalog);
    assert_eq!(
        decision.result.provenance.operators,
        vec![CompositionOperatorId::RecursiveTransversalLift]
    );
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::RtdQdmCatalog
            && attempt.status
                == FamilyAttemptStatus::Selected {
                    max_supported_weeks: 21,
                    quality: ConstructionQuality::LowerBound {
                        gap_to_counting_bound: 3,
                    },
                }
    }));
}

#[test]
fn router_selects_molr_from_mols_for_18_8_6() {
    let input = pure_input(18, 8, 6);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 18-8-6");

    assert_eq!(decision.result.family, ConstructionFamilyId::MolrFromMols);
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::MolrFromMols
            && attempt.status
                == FamilyAttemptStatus::Selected {
                    max_supported_weeks: 6,
                    quality: ConstructionQuality::LowerBound {
                        gap_to_counting_bound: 14,
                    },
                }
    }));
}

#[test]
fn router_selects_molr_from_mols_for_12_12_7() {
    let input = pure_input(12, 12, 7);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 12-12-7");

    assert_eq!(decision.result.family, ConstructionFamilyId::MolrFromMols);
    assert_eq!(
        decision.result.provenance.operators,
        vec![CompositionOperatorId::RecursiveTransversalLift]
    );
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::MolrFromMols
            && attempt.status
                == FamilyAttemptStatus::Selected {
                    max_supported_weeks: 7,
                    quality: ConstructionQuality::LowerBound {
                        gap_to_counting_bound: 6,
                    },
                }
    }));
}

#[test]
fn router_selects_qdm_rtd_catalog_for_20_5_5() {
    let input = pure_input(20, 5, 5);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 20-5-5");

    assert_eq!(decision.result.family, ConstructionFamilyId::RtdQdmCatalog);
    assert_eq!(
        decision.result.provenance.operators,
        vec![CompositionOperatorId::RecursiveTransversalLift]
    );
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::RtdQdmCatalog
            && attempt.status
                == FamilyAttemptStatus::Selected {
                    max_supported_weeks: 21,
                    quality: ConstructionQuality::LowerBound {
                        gap_to_counting_bound: 3,
                    },
                }
    }));
}

#[test]
fn router_selects_molr_from_mols_for_20_7_5() {
    let input = pure_input(20, 7, 5);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 20-7-5");

    assert_eq!(decision.result.family, ConstructionFamilyId::MolrFromMols);
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::MolrFromMols
            && attempt.status
                == FamilyAttemptStatus::Selected {
                    max_supported_weeks: 5,
                    quality: ConstructionQuality::LowerBound {
                        gap_to_counting_bound: 18,
                    },
                }
    }));
}

#[test]
fn router_selects_molr_from_mols_for_20_20_6() {
    let input = pure_input(20, 20, 6);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 20-20-6");

    assert_eq!(decision.result.family, ConstructionFamilyId::MolrFromMols);
    assert_eq!(
        decision.result.provenance.operators,
        vec![CompositionOperatorId::RecursiveTransversalLift]
    );
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::MolrFromMols
            && attempt.status
                == FamilyAttemptStatus::Selected {
                    max_supported_weeks: 6,
                    quality: ConstructionQuality::LowerBound {
                        gap_to_counting_bound: 15,
                    },
                }
    }));
}

#[test]
fn router_selects_ownsg_for_12_8_6() {
    let input = pure_input(12, 8, 6);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 12-8-6");

    assert_eq!(decision.result.family, ConstructionFamilyId::OwnSocialGolfer);
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::OwnSocialGolfer
            && attempt.status
                == FamilyAttemptStatus::Selected {
                    max_supported_weeks: 6,
                    quality: ConstructionQuality::LowerBound {
                        gap_to_counting_bound: 7,
                    },
                }
    }));
}

#[test]
fn router_selects_ownsg_for_20_6_13() {
    let input = pure_input(20, 6, 13);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 20-6-13");

    assert_eq!(decision.result.family, ConstructionFamilyId::OwnSocialGolfer);
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::OwnSocialGolfer
            && attempt.status
                == FamilyAttemptStatus::Selected {
                    max_supported_weeks: 13,
                    quality: ConstructionQuality::LowerBound {
                        gap_to_counting_bound: 10,
                    },
                }
    }));
}

#[test]
fn router_reports_recursive_group_lift_for_14_7_9() {
    let input = pure_input(14, 7, 9);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 14-7-9");

    assert_eq!(decision.result.family, ConstructionFamilyId::OwnSocialGolfer);
    assert_eq!(
        decision.result.provenance.operators,
        vec![CompositionOperatorId::RecursiveTransversalLift]
    );
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::OwnSocialGolfer
            && attempt.status
                == FamilyAttemptStatus::Selected {
                    max_supported_weeks: 9,
                    quality: ConstructionQuality::LowerBound {
                        gap_to_counting_bound: 7,
                    },
                }
    }));
}

#[test]
fn router_reports_single_round_recursive_lift_for_16_8_17() {
    let input = pure_input(16, 8, 17);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 16-8-17");

    assert_eq!(
        decision.result.family,
        ConstructionFamilyId::TransversalDesignPrimePower
    );
    assert_eq!(
        decision.result.provenance.operators,
        vec![CompositionOperatorId::RecursiveTransversalLift]
    );
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::TransversalDesignPrimePower
            && attempt.status
                == FamilyAttemptStatus::Selected {
                    max_supported_weeks: 17,
                    quality: ConstructionQuality::NearFrontier { missing_weeks: 1 },
                }
    }));
}

#[test]
fn router_selects_ritd_for_10_5_9() {
    let input = pure_input(10, 5, 9);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 10-5-9");

    assert_eq!(
        decision.result.family,
        ConstructionFamilyId::ResolvableIncompleteTransversalDesign
    );
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::ResolvableIncompleteTransversalDesign
            && attempt.status
                == FamilyAttemptStatus::Selected {
                    max_supported_weeks: 9,
                    quality: ConstructionQuality::LowerBound {
                        gap_to_counting_bound: 3,
                    },
                }
    }));
}

#[test]
fn router_selects_rbibd_catalog_for_15_8_17() {
    let input = pure_input(15, 8, 17);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 15-8-17");

    assert_eq!(decision.result.family, ConstructionFamilyId::ResolvableBIBDCatalog);
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::ResolvableBIBDCatalog
            && attempt.status
                == FamilyAttemptStatus::Selected {
                    max_supported_weeks: 17,
                    quality: ConstructionQuality::ExactFrontier,
                }
    }));
}

#[test]
fn router_selects_molr_group_fill_for_10_10_4() {
    let input = pure_input(10, 10, 4);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 10-10-4");

    assert_eq!(decision.result.family, ConstructionFamilyId::MolrGroupFill);
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::MolrGroupFill
            && attempt.status
                == FamilyAttemptStatus::Selected {
                    max_supported_weeks: 4,
                    quality: ConstructionQuality::LowerBound {
                        gap_to_counting_bound: 7,
                    },
                }
    }));
}

#[test]
fn router_selects_p4_resolvable_bibd_for_7_4_9() {
    let input = pure_input(7, 4, 9);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 7-4-9");

    assert_eq!(
        decision.result.family,
        ConstructionFamilyId::P4ResolvableBIBD
    );
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::P4ResolvableBIBD
            && attempt.status
                == FamilyAttemptStatus::Selected {
                    max_supported_weeks: 9,
                    quality: ConstructionQuality::ExactFrontier,
                }
    }));
}

#[test]
fn router_selects_p4_resolvable_bibd_over_published_patch_for_10_4_13() {
    let input = pure_input(10, 4, 13);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 10-4-13");

    assert_eq!(
        decision.result.family,
        ConstructionFamilyId::P4ResolvableBIBD
    );
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::PublishedScheduleBank
            && matches!(
                attempt.status,
                FamilyAttemptStatus::InsufficientWeeks {
                    requested_weeks: 13,
                    max_supported_weeks: 9,
                    ..
                }
            )
    }));
}

#[test]
fn router_rejects_weaker_candidate_when_multiple_families_apply() {
    let input = pure_input(5, 5, 5);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should compare affine and TD");

    assert_eq!(
        decision.result.family,
        ConstructionFamilyId::AffinePlanePrimePower
    );
    assert!(decision.attempts.iter().any(|attempt| {
        attempt.family == ConstructionFamilyId::TransversalDesignPrimePower
            && matches!(
                attempt.status,
                FamilyAttemptStatus::RejectedAsWeaker {
                    selected_family: ConstructionFamilyId::AffinePlanePrimePower,
                    ..
                }
            )
    }));
}

#[test]
fn router_failure_explains_attempted_families() {
    let input = pure_input(10, 10, 10);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let failure = attempt_construction(&problem).expect_err("10-10-10 should still be unsupported");
    let message = failure.to_solver_error_message(&problem);

    assert!(message.contains("round_robin: requires group_size == 2"));
    assert!(message.contains("kirkman_6t_plus_1: requires group_size == 3"));
    assert!(message.contains("p4_router: requires group_size == 4"));
    assert!(
        message.contains("affine_plane_prime_power: requires supported prime-power group count")
    );
    assert!(message
        .contains("transversal_design_prime_power: requires supported prime-power group count"));
}
