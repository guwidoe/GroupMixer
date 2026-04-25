use super::catalog;
use super::composition;
use super::field::FiniteField;
use super::portfolio::{ConstructionFamily, FamilyEvaluation};
use super::problem::PureSgpProblem;
use super::types::{
    CompositionOperatorId, ConstructionApplicability, ConstructionFamilyId, ConstructionQuality,
    ConstructionResult, EvidenceSourceKind, ResidualStructure, Schedule,
};

mod affine_plane;
mod kirkman;
mod molr;
mod molr_from_mols;
mod mols;
pub(super) mod mols_product;
mod nkts;
mod ownsg;
mod p4_rbibd;
mod published;
mod qdm_rtd;
mod rbibd;
mod ritd;
mod round_robin;
mod single_round_partition;
mod transversal_design;

pub(super) fn registered_families() -> Vec<&'static dyn ConstructionFamily> {
    vec![
        &ROUND_ROBIN_FAMILY,
        &KIRKMAN_6T_PLUS_1_FAMILY,
        &KIRKMAN_TRIPLE_SYSTEM_FAMILY,
        &NEARLY_KIRKMAN_TRIPLE_SYSTEM_FAMILY,
        &MOLS_CATALOG_FAMILY,
        &MOLS_PRODUCT_FAMILY,
        &RTD_QDM_CATALOG_FAMILY,
        &OWN_SOCIAL_GOLFER_FAMILY,
        &MOLR_FROM_MOLS_FAMILY,
        &RESOLVABLE_INCOMPLETE_TRANSVERSAL_DESIGN_FAMILY,
        &MOLR_GROUP_FILL_FAMILY,
        &AFFINE_PLANE_PRIME_POWER_FAMILY,
        &P4_RESOLVABLE_BIBD_FAMILY,
        &RESOLVABLE_BIBD_CATALOG_FAMILY,
        &PUBLISHED_SCHEDULE_BANK_FAMILY,
        &TRANSVERSAL_DESIGN_PRIME_POWER_FAMILY,
        &SINGLE_ROUND_PARTITION_FAMILY,
    ]
}

struct RoundRobinFamily;
struct SingleRoundPartitionFamily;
struct Kirkman6TPlus1Family;
struct KirkmanTripleSystemFamily;
struct NearlyKirkmanTripleSystemFamily;
struct MolsCatalogFamily;
struct MolsProductFamily;
struct RtdQdmCatalogFamily;
struct MolrFromMolsFamily;
struct OwnSocialGolferFamily;
struct ResolvableIncompleteTransversalDesignFamily;
struct MolrGroupFillFamily;
struct AffinePlanePrimePowerFamily;
struct P4ResolvableBIBDFamily;
struct ResolvableBIBDCatalogFamily;
struct PublishedScheduleBankFamily;
struct TransversalDesignPrimePowerFamily;

static ROUND_ROBIN_FAMILY: RoundRobinFamily = RoundRobinFamily;
static SINGLE_ROUND_PARTITION_FAMILY: SingleRoundPartitionFamily = SingleRoundPartitionFamily;
static KIRKMAN_6T_PLUS_1_FAMILY: Kirkman6TPlus1Family = Kirkman6TPlus1Family;
static KIRKMAN_TRIPLE_SYSTEM_FAMILY: KirkmanTripleSystemFamily = KirkmanTripleSystemFamily;
static NEARLY_KIRKMAN_TRIPLE_SYSTEM_FAMILY: NearlyKirkmanTripleSystemFamily =
    NearlyKirkmanTripleSystemFamily;
static MOLS_CATALOG_FAMILY: MolsCatalogFamily = MolsCatalogFamily;
static MOLS_PRODUCT_FAMILY: MolsProductFamily = MolsProductFamily;
static RTD_QDM_CATALOG_FAMILY: RtdQdmCatalogFamily = RtdQdmCatalogFamily;
static MOLR_FROM_MOLS_FAMILY: MolrFromMolsFamily = MolrFromMolsFamily;
static OWN_SOCIAL_GOLFER_FAMILY: OwnSocialGolferFamily = OwnSocialGolferFamily;
static RESOLVABLE_INCOMPLETE_TRANSVERSAL_DESIGN_FAMILY:
    ResolvableIncompleteTransversalDesignFamily = ResolvableIncompleteTransversalDesignFamily;
static MOLR_GROUP_FILL_FAMILY: MolrGroupFillFamily = MolrGroupFillFamily;
static AFFINE_PLANE_PRIME_POWER_FAMILY: AffinePlanePrimePowerFamily = AffinePlanePrimePowerFamily;
static P4_RESOLVABLE_BIBD_FAMILY: P4ResolvableBIBDFamily = P4ResolvableBIBDFamily;
static RESOLVABLE_BIBD_CATALOG_FAMILY: ResolvableBIBDCatalogFamily = ResolvableBIBDCatalogFamily;
static PUBLISHED_SCHEDULE_BANK_FAMILY: PublishedScheduleBankFamily = PublishedScheduleBankFamily;
static TRANSVERSAL_DESIGN_PRIME_POWER_FAMILY: TransversalDesignPrimePowerFamily =
    TransversalDesignPrimePowerFamily;

impl ConstructionFamily for RoundRobinFamily {
    fn id(&self) -> ConstructionFamilyId {
        ConstructionFamilyId::RoundRobin
    }

    fn evaluate(&self, problem: &PureSgpProblem) -> FamilyEvaluation {
        if problem.group_size != 2 {
            return FamilyEvaluation::NotApplicable {
                reason: "requires group_size == 2",
            };
        }

        FamilyEvaluation::Applicable {
            max_supported_weeks: (problem.num_groups * 2).saturating_sub(1),
        }
    }

    fn construct(&self, problem: &PureSgpProblem) -> Option<ConstructionResult> {
        (problem.group_size == 2).then(|| construct_round_robin(problem.num_groups))
    }
}

impl ConstructionFamily for SingleRoundPartitionFamily {
    fn id(&self) -> ConstructionFamilyId {
        ConstructionFamilyId::SingleRoundPartition
    }

    fn evaluate(&self, problem: &PureSgpProblem) -> FamilyEvaluation {
        if problem.group_size < 2 {
            return FamilyEvaluation::NotApplicable {
                reason: "requires group_size >= 2",
            };
        }

        FamilyEvaluation::Applicable {
            max_supported_weeks: 1,
        }
    }

    fn construct(&self, problem: &PureSgpProblem) -> Option<ConstructionResult> {
        (problem.group_size >= 2)
            .then(|| construct_single_round_partition(problem.num_groups, problem.group_size))
    }
}

impl ConstructionFamily for Kirkman6TPlus1Family {
    fn id(&self) -> ConstructionFamilyId {
        ConstructionFamilyId::Kirkman6TPlus1
    }

    fn evaluate(&self, problem: &PureSgpProblem) -> FamilyEvaluation {
        if problem.group_size != 3 {
            return FamilyEvaluation::NotApplicable {
                reason: "requires group_size == 3",
            };
        }
        if problem.num_groups % 6 != 1 {
            return FamilyEvaluation::NotApplicable {
                reason: "requires num_groups ≡ 1 (mod 6)",
            };
        }
        if FiniteField::for_order(problem.num_groups).is_none() {
            return FamilyEvaluation::NotApplicable {
                reason: "requires supported prime-power group count",
            };
        }

        FamilyEvaluation::Applicable {
            max_supported_weeks: counting_bound(problem.num_groups, problem.group_size),
        }
    }

    fn construct(&self, problem: &PureSgpProblem) -> Option<ConstructionResult> {
        let field = FiniteField::for_order(problem.num_groups)?;
        (problem.group_size == 3 && problem.num_groups % 6 == 1)
            .then(|| construct_kirkman_6t_plus_1(&field))
    }
}

impl ConstructionFamily for KirkmanTripleSystemFamily {
    fn id(&self) -> ConstructionFamilyId {
        ConstructionFamilyId::KirkmanTripleSystem
    }

    fn evaluate(&self, problem: &PureSgpProblem) -> FamilyEvaluation {
        if problem.group_size != 3 {
            return FamilyEvaluation::NotApplicable {
                reason: "requires group_size == 3",
            };
        }

        let Some(entry) = catalog::kts::exact_case(problem.num_groups) else {
            return FamilyEvaluation::NotApplicable {
                reason: "requires a catalog-backed Kirkman triple system case",
            };
        };

        FamilyEvaluation::Applicable {
            max_supported_weeks: entry.encoded_weeks.len(),
        }
    }

    fn construct(&self, problem: &PureSgpProblem) -> Option<ConstructionResult> {
        (problem.group_size == 3)
            .then(|| catalog::kts::exact_case(problem.num_groups))
            .flatten()
            .map(construct_kirkman_triple_system)
    }
}

impl ConstructionFamily for NearlyKirkmanTripleSystemFamily {
    fn id(&self) -> ConstructionFamilyId {
        ConstructionFamilyId::NearlyKirkmanTripleSystem
    }

    fn evaluate(&self, problem: &PureSgpProblem) -> FamilyEvaluation {
        if problem.group_size != 3 {
            return FamilyEvaluation::NotApplicable {
                reason: "requires group_size == 3",
            };
        }

        if let Some(entry) = catalog::nkts::exact_case(problem.num_groups) {
            return FamilyEvaluation::Applicable {
                max_supported_weeks: entry.encoded_weeks.len(),
            };
        }

        let Some(base_weeks) = (problem.num_groups % 2 == 0)
            .then(|| exact_kirkman_seed_supported_weeks(problem.num_groups / 2))
            .flatten()
        else {
            return FamilyEvaluation::NotApplicable {
                reason: "requires a catalog-backed nearly Kirkman triple system case or an exact Kirkman triple-system seed on half as many groups",
            };
        };

        FamilyEvaluation::Applicable {
            max_supported_weeks: if base_weeks % 2 == 0 {
                base_weeks * 2
            } else {
                (base_weeks * 2).saturating_sub(1)
            },
        }
    }

    fn construct(&self, problem: &PureSgpProblem) -> Option<ConstructionResult> {
        if problem.group_size != 3 {
            return None;
        }

        let Some(entry) = catalog::nkts::exact_case(problem.num_groups) else {
            return (problem.num_groups % 2 == 0)
                .then(|| exact_kirkman_seed_construction(problem.num_groups / 2))
                .flatten()
                .map(|seed| {
                    construct_nearly_kirkman_triple_system_via_exact_kirkman_seed(
                        seed,
                        problem.num_groups / 2,
                    )
                });
        };

        Some(construct_nearly_kirkman_triple_system(entry))
    }
}

impl ConstructionFamily for OwnSocialGolferFamily {
    fn id(&self) -> ConstructionFamilyId {
        ConstructionFamilyId::OwnSocialGolfer
    }

    fn evaluate(&self, problem: &PureSgpProblem) -> FamilyEvaluation {
        let Some(entry) = catalog::ownsg::exact_case(problem.num_groups, problem.group_size) else {
            return FamilyEvaluation::NotApplicable {
                reason: "requires a catalog-backed ownSG starter-block case",
            };
        };

        FamilyEvaluation::Applicable {
            max_supported_weeks: entry.starter_blocks.len(),
        }
    }

    fn construct(&self, problem: &PureSgpProblem) -> Option<ConstructionResult> {
        catalog::ownsg::exact_case(problem.num_groups, problem.group_size)
            .map(construct_own_social_golfer)
    }
}

impl ConstructionFamily for MolsCatalogFamily {
    fn id(&self) -> ConstructionFamilyId {
        ConstructionFamilyId::MolsCatalog
    }

    fn evaluate(&self, problem: &PureSgpProblem) -> FamilyEvaluation {
        let Some(entry) = catalog::mols::exact_case(problem.num_groups) else {
            return FamilyEvaluation::NotApplicable {
                reason: "requires a catalog-backed explicit MOLS case",
            };
        };

        if !(3..=(entry.mols_count + 1)).contains(&problem.group_size) {
            return FamilyEvaluation::NotApplicable {
                reason: "requires 3 <= group_size <= available_mols + 1 for a catalog-backed explicit MOLS case",
            };
        }

        let Some(result) = self.construct(problem) else {
            return FamilyEvaluation::NotApplicable {
                reason: "construction failed despite matching explicit MOLS preconditions",
            };
        };

        FamilyEvaluation::Applicable {
            max_supported_weeks: result.max_supported_weeks,
        }
    }

    fn construct(&self, problem: &PureSgpProblem) -> Option<ConstructionResult> {
        let entry = catalog::mols::exact_case(problem.num_groups)?;
        ((3..=(entry.mols_count + 1)).contains(&problem.group_size))
            .then(|| construct_catalog_mols_transversal(entry, problem.group_size))
    }
}

impl ConstructionFamily for MolsProductFamily {
    fn id(&self) -> ConstructionFamilyId {
        ConstructionFamilyId::MolsProduct
    }

    fn evaluate(&self, problem: &PureSgpProblem) -> FamilyEvaluation {
        let Some(spec) = mols_product::best_spec(problem.num_groups, problem.group_size) else {
            return FamilyEvaluation::NotApplicable {
                reason: "requires a supported prime-power factorization with enough MOLS for a direct product",
            };
        };

        let Some(result) = self.construct(problem) else {
            return FamilyEvaluation::NotApplicable {
                reason: "construction failed despite matching direct-product MOLS preconditions",
            };
        };

        debug_assert_eq!(spec.num_groups, problem.num_groups);
        FamilyEvaluation::Applicable {
            max_supported_weeks: result.max_supported_weeks,
        }
    }

    fn construct(&self, problem: &PureSgpProblem) -> Option<ConstructionResult> {
        let spec = mols_product::best_spec(problem.num_groups, problem.group_size)?;
        Some(construct_product_mols_transversal(spec, problem.group_size))
    }
}

impl ConstructionFamily for MolrFromMolsFamily {
    fn id(&self) -> ConstructionFamilyId {
        ConstructionFamilyId::MolrFromMols
    }

    fn evaluate(&self, problem: &PureSgpProblem) -> FamilyEvaluation {
        let explicit_supported =
            catalog::mols::exact_case(problem.num_groups).is_some_and(|entry| {
                ((entry.mols_count + 2)..=entry.num_groups).contains(&problem.group_size)
            });
        let qdm_supported = catalog::qdm::mols_case(problem.num_groups).is_some_and(|entry| {
            ((qdm_rtd::mols_count(entry) + 2)..=entry.num_groups).contains(&problem.group_size)
        });
        let product_supported =
            mols_product::best_molr_spec(problem.num_groups, problem.group_size).is_some();
        if !explicit_supported && !qdm_supported && !product_supported {
            return FamilyEvaluation::NotApplicable {
                reason: "requires either an explicit MOLS bank (catalog- or QDM-derived) or a direct-product prime-power MOLS bank with enough squares for the MOLR range",
            };
        }

        let Some(result) = self.construct(problem) else {
            return FamilyEvaluation::NotApplicable {
                reason: "construction failed despite matching Sharma-Das MOLR preconditions",
            };
        };

        FamilyEvaluation::Applicable {
            max_supported_weeks: result.max_supported_weeks,
        }
    }

    fn construct(&self, problem: &PureSgpProblem) -> Option<ConstructionResult> {
        if let Some(entry) = catalog::mols::exact_case(problem.num_groups) {
            if ((entry.mols_count + 2)..=entry.num_groups).contains(&problem.group_size) {
                return Some(construct_molr_from_explicit_mols(entry, problem.group_size));
            }
        }

        if let Some(entry) = catalog::qdm::mols_case(problem.num_groups) {
            if ((qdm_rtd::mols_count(entry) + 2)..=entry.num_groups).contains(&problem.group_size) {
                return Some(construct_molr_from_qdm_mols(entry, problem.group_size));
            }
        }

        let spec = mols_product::best_molr_spec(problem.num_groups, problem.group_size)?;
        Some(construct_molr_from_product_mols(spec, problem.group_size))
    }
}

impl ConstructionFamily for RtdQdmCatalogFamily {
    fn id(&self) -> ConstructionFamilyId {
        ConstructionFamilyId::RtdQdmCatalog
    }

    fn evaluate(&self, problem: &PureSgpProblem) -> FamilyEvaluation {
        let Some(entry) = catalog::qdm::exact_case(problem.num_groups, problem.group_size) else {
            return FamilyEvaluation::NotApplicable {
                reason: "requires a catalog-backed quasi-difference matrix route",
            };
        };

        let Some(result) = self.construct(problem) else {
            return FamilyEvaluation::NotApplicable {
                reason: "construction failed despite matching QDM RTD preconditions",
            };
        };

        debug_assert_eq!(entry.num_groups, problem.num_groups);
        FamilyEvaluation::Applicable {
            max_supported_weeks: result.max_supported_weeks,
        }
    }

    fn construct(&self, problem: &PureSgpProblem) -> Option<ConstructionResult> {
        let entry = catalog::qdm::exact_case(problem.num_groups, problem.group_size)?;
        Some(construct_qdm_catalog_rtd(entry))
    }
}

impl ConstructionFamily for ResolvableIncompleteTransversalDesignFamily {
    fn id(&self) -> ConstructionFamilyId {
        ConstructionFamilyId::ResolvableIncompleteTransversalDesign
    }

    fn evaluate(&self, problem: &PureSgpProblem) -> FamilyEvaluation {
        let Some(entry) = catalog::ritd::exact_case(problem.num_groups, problem.group_size) else {
            return FamilyEvaluation::NotApplicable {
                reason: "requires a catalog-backed resolvable incomplete transversal design case",
            };
        };

        FamilyEvaluation::Applicable {
            max_supported_weeks: entry.complete_parallel_classes
                + usize::from(entry.add_group_fill_week),
        }
    }

    fn construct(&self, problem: &PureSgpProblem) -> Option<ConstructionResult> {
        catalog::ritd::exact_case(problem.num_groups, problem.group_size)
            .map(construct_resolvable_incomplete_transversal_design)
    }
}

impl ConstructionFamily for MolrGroupFillFamily {
    fn id(&self) -> ConstructionFamilyId {
        ConstructionFamilyId::MolrGroupFill
    }

    fn evaluate(&self, problem: &PureSgpProblem) -> FamilyEvaluation {
        let Some(entry) = catalog::molr::exact_case(problem.num_groups, problem.group_size) else {
            return FamilyEvaluation::NotApplicable {
                reason: "requires a catalog-backed MOLR/MOLS group-fill case",
            };
        };

        FamilyEvaluation::Applicable {
            max_supported_weeks: entry.base_weeks + 1,
        }
    }

    fn construct(&self, problem: &PureSgpProblem) -> Option<ConstructionResult> {
        catalog::molr::exact_case(problem.num_groups, problem.group_size)
            .map(construct_molr_group_fill)
    }
}

impl ConstructionFamily for PublishedScheduleBankFamily {
    fn id(&self) -> ConstructionFamilyId {
        ConstructionFamilyId::PublishedScheduleBank
    }

    fn evaluate(&self, problem: &PureSgpProblem) -> FamilyEvaluation {
        let Some(entry) = catalog::published::exact_case(problem.num_groups, problem.group_size)
        else {
            return FamilyEvaluation::NotApplicable {
                reason: "requires a catalog-backed published schedule case",
            };
        };

        FamilyEvaluation::Applicable {
            max_supported_weeks: entry.encoded_weeks.len(),
        }
    }

    fn construct(&self, problem: &PureSgpProblem) -> Option<ConstructionResult> {
        catalog::published::exact_case(problem.num_groups, problem.group_size)
            .map(construct_published_schedule_bank)
    }
}

impl ConstructionFamily for AffinePlanePrimePowerFamily {
    fn id(&self) -> ConstructionFamilyId {
        ConstructionFamilyId::AffinePlanePrimePower
    }

    fn evaluate(&self, problem: &PureSgpProblem) -> FamilyEvaluation {
        if problem.group_size != problem.num_groups {
            return FamilyEvaluation::NotApplicable {
                reason: "requires group_size == num_groups",
            };
        }
        if FiniteField::for_order(problem.num_groups).is_none() {
            return FamilyEvaluation::NotApplicable {
                reason: "requires supported prime-power group count",
            };
        }

        FamilyEvaluation::Applicable {
            max_supported_weeks: problem.num_groups + 1,
        }
    }

    fn construct(&self, problem: &PureSgpProblem) -> Option<ConstructionResult> {
        let field = FiniteField::for_order(problem.num_groups)?;
        (problem.group_size == problem.num_groups).then(|| construct_affine_plane(&field))
    }
}

impl ConstructionFamily for P4ResolvableBIBDFamily {
    fn id(&self) -> ConstructionFamilyId {
        ConstructionFamilyId::P4ResolvableBIBD
    }

    fn evaluate(&self, problem: &PureSgpProblem) -> FamilyEvaluation {
        if problem.group_size != 4 {
            return FamilyEvaluation::NotApplicable {
                reason: "requires group_size == 4",
            };
        }

        let Some(field) = p4_rbibd::supported_field(problem.num_groups) else {
            return FamilyEvaluation::NotApplicable {
                reason: "requires v = 3q + 1 with q a supported prime-power order",
            };
        };

        FamilyEvaluation::Applicable {
            max_supported_weeks: field.order,
        }
    }

    fn construct(&self, problem: &PureSgpProblem) -> Option<ConstructionResult> {
        let field = p4_rbibd::supported_field(problem.num_groups)?;
        (problem.group_size == 4).then(|| construct_p4_resolvable_bibd(&field))
    }
}

impl ConstructionFamily for ResolvableBIBDCatalogFamily {
    fn id(&self) -> ConstructionFamilyId {
        ConstructionFamilyId::ResolvableBIBDCatalog
    }

    fn evaluate(&self, problem: &PureSgpProblem) -> FamilyEvaluation {
        let Some(entry) = catalog::rbibd::exact_case(problem.num_groups, problem.group_size) else {
            return FamilyEvaluation::NotApplicable {
                reason: "requires a catalog-backed resolvable BIBD case",
            };
        };

        FamilyEvaluation::Applicable {
            max_supported_weeks: (entry.num_groups * entry.group_size - 1) / (entry.group_size - 1),
        }
    }

    fn construct(&self, problem: &PureSgpProblem) -> Option<ConstructionResult> {
        catalog::rbibd::exact_case(problem.num_groups, problem.group_size)
            .map(construct_resolvable_bibd_catalog)
    }
}

impl ConstructionFamily for TransversalDesignPrimePowerFamily {
    fn id(&self) -> ConstructionFamilyId {
        ConstructionFamilyId::TransversalDesignPrimePower
    }

    fn evaluate(&self, problem: &PureSgpProblem) -> FamilyEvaluation {
        if !(3..=problem.num_groups).contains(&problem.group_size) {
            return FamilyEvaluation::NotApplicable {
                reason: "requires 3 <= group_size <= num_groups",
            };
        }
        if FiniteField::for_order(problem.num_groups).is_none() {
            return FamilyEvaluation::NotApplicable {
                reason: "requires supported prime-power group count",
            };
        }

        let Some(result) = self.construct(problem) else {
            return FamilyEvaluation::NotApplicable {
                reason: "construction failed despite matching advertised preconditions",
            };
        };

        FamilyEvaluation::Applicable {
            max_supported_weeks: result.max_supported_weeks,
        }
    }

    fn construct(&self, problem: &PureSgpProblem) -> Option<ConstructionResult> {
        let field = FiniteField::for_order(problem.num_groups)?;
        ((3..=problem.num_groups).contains(&problem.group_size)).then(|| {
            construct_transversal_design_portfolio(problem.num_groups, problem.group_size, &field)
        })
    }
}

pub(super) fn construct_round_robin(num_groups: usize) -> ConstructionResult {
    ConstructionResult::new(
        round_robin::construct(num_groups),
        ConstructionFamilyId::RoundRobin,
    )
    .with_quality(ConstructionQuality::ExactFrontier)
    .with_evidence(
        EvidenceSourceKind::TheoremFamily,
        "round_robin_1_factorization",
    )
}

pub(super) fn construct_single_round_partition(
    num_groups: usize,
    group_size: usize,
) -> ConstructionResult {
    ConstructionResult::new(
        single_round_partition::construct(num_groups, group_size),
        ConstructionFamilyId::SingleRoundPartition,
    )
    .with_quality(classify_quality(num_groups, group_size, 1))
    .with_applicability(ConstructionApplicability::General)
    .with_evidence(EvidenceSourceKind::TheoremFamily, "single_round_partition")
}

pub(super) fn construct_kirkman_6t_plus_1(field: &FiniteField) -> ConstructionResult {
    ConstructionResult::new(
        kirkman::construct_6t_plus_1(field),
        ConstructionFamilyId::Kirkman6TPlus1,
    )
    .with_quality(ConstructionQuality::ExactFrontier)
    .with_applicability(ConstructionApplicability::Conditional {
        notes: vec![
            "requires group_size == 3",
            "requires num_groups ≡ 1 (mod 6)",
            "requires supported prime-power group count",
        ],
    })
    .with_evidence(
        EvidenceSourceKind::FiniteFieldConstruction,
        "kirkman_6t_plus_1",
    )
}

pub(super) fn construct_kirkman_triple_system(
    entry: &'static catalog::kts::KtsCatalogEntry,
) -> ConstructionResult {
    ConstructionResult::new(
        kirkman::construct_catalog(entry),
        ConstructionFamilyId::KirkmanTripleSystem,
    )
    .with_quality(ConstructionQuality::ExactFrontier)
    .with_applicability(ConstructionApplicability::Conditional {
        notes: vec![
            "requires group_size == 3",
            "requires a catalog-backed Kirkman triple system case",
        ],
    })
    .with_evidence(
        EvidenceSourceKind::CatalogFact,
        catalog::kts::source().citation,
    )
    .with_evidence(EvidenceSourceKind::PatchBank, entry.citation)
}

pub(super) fn construct_nearly_kirkman_triple_system(
    entry: &'static catalog::nkts::NktsCatalogEntry,
) -> ConstructionResult {
    ConstructionResult::new(
        nkts::construct(entry),
        ConstructionFamilyId::NearlyKirkmanTripleSystem,
    )
    .with_quality(ConstructionQuality::ExactFrontier)
    .with_applicability(ConstructionApplicability::Conditional {
        notes: vec![
            "requires group_size == 3",
            "requires a catalog-backed nearly Kirkman triple system case",
        ],
    })
    .with_evidence(
        EvidenceSourceKind::CatalogFact,
        catalog::nkts::source().citation,
    )
    .with_evidence(EvidenceSourceKind::PatchBank, entry.citation)
}

pub(super) fn construct_nearly_kirkman_triple_system_via_pseudo_doubling(
    entry: &'static catalog::kts::KtsCatalogEntry,
) -> ConstructionResult {
    construct_nearly_kirkman_triple_system_via_exact_kirkman_seed(
        construct_kirkman_triple_system(entry),
        entry.num_groups,
    )
}

pub(super) fn construct_nearly_kirkman_triple_system_via_exact_kirkman_seed(
    seed: ConstructionResult,
    base_num_groups: usize,
) -> ConstructionResult {
    let base = seed.schedule.clone();
    let base_player_count = base_num_groups * 3;
    let doubled_num_groups = base_num_groups * 2;
    let supported_weeks = if base.len() % 2 == 0 {
        base.len() * 2
    } else {
        (base.len() * 2).saturating_sub(1)
    };

    let mut result = ConstructionResult::new(
        nkts::construct_pseudo_doubling(&base, base_player_count),
        ConstructionFamilyId::NearlyKirkmanTripleSystem,
    )
    .with_quality(classify_quality(doubled_num_groups, 3, supported_weeks))
    .with_applicability(ConstructionApplicability::Conditional {
        notes: vec![
            "requires group_size == 3",
            "requires an exact Kirkman triple-system seed on half as many groups",
            "uses pseudo-doubling when the seed has an odd number of rounds",
        ],
    });

    for evidence in seed.metadata.evidence {
        result = result.with_evidence(evidence.source_kind, evidence.citation);
    }

    result.with_evidence(
        EvidenceSourceKind::StructuralComposition,
        "pseudo_doubling_from_exact_kts_seed",
    )
}

fn exact_kirkman_seed_supported_weeks(num_groups: usize) -> Option<usize> {
    if let Some(entry) = catalog::kts::exact_case(num_groups) {
        return Some(entry.encoded_weeks.len());
    }

    if num_groups % 6 == 1 && FiniteField::for_order(num_groups).is_some() {
        return Some(counting_bound(num_groups, 3));
    }

    None
}

fn exact_kirkman_seed_construction(num_groups: usize) -> Option<ConstructionResult> {
    if let Some(entry) = catalog::kts::exact_case(num_groups) {
        return Some(construct_kirkman_triple_system(entry));
    }

    if num_groups % 6 == 1 {
        if let Some(field) = FiniteField::for_order(num_groups) {
            return Some(construct_kirkman_6t_plus_1(&field));
        }
    }

    None
}

pub(super) fn construct_published_schedule_bank(
    entry: &'static catalog::published::PublishedScheduleEntry,
) -> ConstructionResult {
    ConstructionResult::new(
        published::construct(entry),
        ConstructionFamilyId::PublishedScheduleBank,
    )
    .with_quality(classify_quality(
        entry.num_groups,
        entry.group_size,
        entry.encoded_weeks.len(),
    ))
    .with_applicability(ConstructionApplicability::Exceptional {
        notes: vec![
            "requires an exact catalog-backed published schedule case",
            "uses an explicit source-backed patch-bank schedule rather than a general theorem family",
        ],
    })
    .with_evidence(
        EvidenceSourceKind::CatalogFact,
        catalog::published::source().citation,
    )
    .with_evidence(EvidenceSourceKind::PatchBank, entry.citation)
}

pub(super) fn construct_own_social_golfer(
    entry: &'static catalog::ownsg::OwnSgCatalogEntry,
) -> ConstructionResult {
    let mut result = ConstructionResult::new(
        ownsg::construct(entry),
        ConstructionFamilyId::OwnSocialGolfer,
    )
    .with_quality(classify_quality(
        entry.num_groups,
        entry.group_size,
        entry.starter_blocks.len(),
    ))
    .with_applicability(ConstructionApplicability::Conditional {
        notes: vec![
            "requires a catalog-backed ownSG starter-block case",
            "develops published starter blocks by +group_size translations across the full group set",
            "can append latent-group weeks when group_size divides num_groups and the residual subgroup problem is constructible",
        ],
    })
    .with_evidence(
        EvidenceSourceKind::CatalogFact,
        catalog::ownsg::source().citation,
    )
    .with_evidence(EvidenceSourceKind::PatchBank, entry.citation);

    if entry.num_groups % entry.group_size == 0 && (entry.num_groups / entry.group_size) >= 2 {
        result = result.with_residual(ResidualStructure::TransversalLatentGroups {
            subgroup_count: entry.group_size,
            subgroup_size: entry.num_groups / entry.group_size,
        });
    }

    let result = composition::apply_modulo_latent_group_lift(
        entry.num_groups,
        entry.group_size,
        result,
        construct_max_schedule_recursive,
    );
    let improved_weeks = result.max_supported_weeks;
    let result = result.with_quality(classify_quality(
        entry.num_groups,
        entry.group_size,
        improved_weeks,
    ));
    if result.provenance.operators.is_empty() {
        result
    } else {
        result.clear_residual()
    }
}

pub(super) fn construct_catalog_mols_transversal(
    entry: &'static catalog::mols::MolsCatalogEntry,
    group_size: usize,
) -> ConstructionResult {
    let mut result = ConstructionResult::new(
        mols::construct(entry, group_size),
        ConstructionFamilyId::MolsCatalog,
    )
    .with_quality(classify_quality(entry.num_groups, group_size, entry.num_groups))
    .with_applicability(ConstructionApplicability::Conditional {
        notes: vec![
            "requires a catalog-backed explicit MOLS case",
            "uses one explicit Latin square as the parallel-class index and the remaining selected squares as transversal symbol groups",
            "can append latent-group weeks when group_size divides num_groups and the residual subgroup problem is constructible",
        ],
    })
    .with_evidence(EvidenceSourceKind::CatalogFact, catalog::mols::source().citation)
    .with_evidence(EvidenceSourceKind::CatalogFact, entry.citation)
    .with_evidence(
        EvidenceSourceKind::StructuralComposition,
        "resolvable_transversal_from_explicit_mols",
    );

    if entry.num_groups % group_size == 0 && (entry.num_groups / group_size) >= 2 {
        result = result.with_residual(ResidualStructure::TransversalLatentGroups {
            subgroup_count: group_size,
            subgroup_size: entry.num_groups / group_size,
        });
    }

    let result = composition::apply_recursive_transversal_lift(
        entry.num_groups,
        group_size,
        result,
        construct_max_schedule_recursive,
    );
    let improved_weeks = result.max_supported_weeks;
    let result = result.with_quality(classify_quality(
        entry.num_groups,
        group_size,
        improved_weeks,
    ));
    if result.provenance.operators.is_empty() {
        result
    } else {
        result.clear_residual()
    }
}

pub(super) fn construct_product_mols_transversal(
    spec: mols_product::MolsProductSpec,
    group_size: usize,
) -> ConstructionResult {
    let left_field =
        FiniteField::for_order(spec.left_order).expect("left product factor should be supported");
    let right_field =
        FiniteField::for_order(spec.right_order).expect("right product factor should be supported");
    let left_bank = mols::prime_power_bank(left_field, spec.mols_count);
    let right_bank = mols::prime_power_bank(right_field, spec.mols_count);
    let product_bank = mols::direct_product(&left_bank, &right_bank);

    let mut result = ConstructionResult::new(
        mols::construct_from_mols(&product_bank, group_size),
        ConstructionFamilyId::MolsProduct,
    )
    .with_quality(classify_quality(spec.num_groups, group_size, spec.num_groups))
    .with_applicability(ConstructionApplicability::Conditional {
        notes: vec![
            "requires num_groups to factor into supported prime-power orders",
            "uses the direct-product theorem for prime-power MOLS banks and one distinguished product square as the parallel-class index",
            "can append latent-group weeks when group_size divides num_groups and the residual subgroup problem is constructible",
        ],
    })
    .with_evidence(
        EvidenceSourceKind::TheoremFamily,
        "direct_product_of_prime_power_mols_banks",
    )
    .with_evidence(
        EvidenceSourceKind::FiniteFieldConstruction,
        "prime_power_mols_factor_banks",
    )
    .with_evidence(
        EvidenceSourceKind::StructuralComposition,
        "resolvable_transversal_from_direct_product_mols",
    );

    if spec.num_groups % group_size == 0 && (spec.num_groups / group_size) >= 2 {
        result = result.with_residual(ResidualStructure::TransversalLatentGroups {
            subgroup_count: group_size,
            subgroup_size: spec.num_groups / group_size,
        });
    }

    let result = composition::apply_recursive_transversal_lift(
        spec.num_groups,
        group_size,
        result,
        construct_max_schedule_recursive,
    );
    let improved_weeks = result.max_supported_weeks;
    let result = result.with_quality(classify_quality(
        spec.num_groups,
        group_size,
        improved_weeks,
    ));
    if result.provenance.operators.is_empty() {
        result
    } else {
        result.clear_residual()
    }
}

pub(super) fn construct_molr_from_explicit_mols(
    entry: &'static catalog::mols::MolsCatalogEntry,
    group_size: usize,
) -> ConstructionResult {
    let base_weeks = entry.mols_count + 1;
    let mut result = ConstructionResult::new(
        molr_from_mols::construct(entry, group_size),
        ConstructionFamilyId::MolrFromMols,
    )
    .with_quality(classify_quality(entry.num_groups, group_size, base_weeks))
    .with_applicability(ConstructionApplicability::Conditional {
        notes: vec![
            "requires an explicit MOLS catalog bank for the group count",
            "uses the Sharma-Das MOLR construction from the first group_size rows of the explicit MOLS bank",
            "can append clique-derived rounds when the unused row cliques themselves support further pure-SGP weeks",
        ],
    })
    .with_evidence(EvidenceSourceKind::CatalogFact, catalog::mols::source().citation)
    .with_evidence(EvidenceSourceKind::CatalogFact, entry.citation)
    .with_evidence(EvidenceSourceKind::TheoremFamily, "sharma_das_molr_from_explicit_mols");

    if entry.num_groups == group_size {
        result
            .schedule
            .extend(molr_from_mols::row_fill_week(entry.num_groups, group_size));
        result.max_supported_weeks = result.schedule.len();
        result = result.add_operator(CompositionOperatorId::RecursiveTransversalLift);
    } else if entry.num_groups % group_size == 0 && (entry.num_groups / group_size) >= 2 {
        result = result.with_residual(ResidualStructure::TransversalLatentGroups {
            subgroup_count: group_size,
            subgroup_size: entry.num_groups / group_size,
        });
        result = composition::apply_recursive_transversal_lift(
            entry.num_groups,
            group_size,
            result,
            construct_max_schedule_recursive,
        );
    }

    let improved_weeks = result.max_supported_weeks;
    let result = result.with_quality(classify_quality(
        entry.num_groups,
        group_size,
        improved_weeks,
    ));
    if result.provenance.operators.is_empty() {
        result
    } else {
        result.clear_residual()
    }
}

pub(super) fn construct_qdm_catalog_rtd(
    entry: &'static catalog::qdm::QdmCatalogEntry,
) -> ConstructionResult {
    let mut result = ConstructionResult::new(
        qdm_rtd::construct(entry),
        ConstructionFamilyId::RtdQdmCatalog,
    )
    .with_quality(classify_quality(entry.num_groups, entry.group_size, entry.num_groups))
    .with_applicability(ConstructionApplicability::Conditional {
        notes: vec![
            "requires an explicit catalog-backed quasi-difference matrix that yields a resolvable OA(group_size+1, num_groups)",
            "uses the Sage / Handbook quasi-difference-matrix construction to build OA(group_size+1, num_groups), then reads the resolvable RTD(group_size, num_groups) classes as weeks",
            "can append latent-group weeks when group_size divides num_groups and the residual subgroup problem is constructible",
        ],
    })
    .with_evidence(EvidenceSourceKind::CatalogFact, catalog::qdm::source().citation)
    .with_evidence(EvidenceSourceKind::CatalogFact, entry.citation)
    .with_evidence(
        EvidenceSourceKind::StructuralComposition,
        "resolvable_transversal_from_quasi_difference_matrix",
    );

    if entry.num_groups % entry.group_size == 0 && (entry.num_groups / entry.group_size) >= 2 {
        result = result.with_residual(ResidualStructure::TransversalLatentGroups {
            subgroup_count: entry.group_size,
            subgroup_size: entry.num_groups / entry.group_size,
        });
    }

    let result = composition::apply_recursive_transversal_lift(
        entry.num_groups,
        entry.group_size,
        result,
        construct_max_schedule_recursive,
    );
    let improved_weeks = result.max_supported_weeks;
    let result = result.with_quality(classify_quality(
        entry.num_groups,
        entry.group_size,
        improved_weeks,
    ));
    if result.provenance.operators.is_empty() {
        result
    } else {
        result.clear_residual()
    }
}

pub(super) fn construct_molr_from_qdm_mols(
    entry: &'static catalog::qdm::QdmCatalogEntry,
    group_size: usize,
) -> ConstructionResult {
    let bank = qdm_rtd::explicit_mols_bank(entry);
    let base_weeks = bank.len() + 1;
    let mut result = ConstructionResult::new(
        molr_from_mols::construct_from_mols(&bank, group_size),
        ConstructionFamilyId::MolrFromMols,
    )
    .with_quality(classify_quality(entry.num_groups, group_size, base_weeks))
    .with_applicability(ConstructionApplicability::Conditional {
        notes: vec![
            "requires an explicit catalog-backed quasi-difference matrix whose OA rows can be decoded into an explicit MOLS bank for the group count",
            "decodes the OA(group_size+1, num_groups) witness from the QDM into an explicit MOLS bank, then applies the Sharma-Das MOLR construction to the first group_size rows",
            "can append clique-derived or recursively lifted rounds when the residual subgroup problem is constructible",
        ],
    })
    .with_evidence(EvidenceSourceKind::CatalogFact, catalog::qdm::source().citation)
    .with_evidence(EvidenceSourceKind::CatalogFact, entry.citation)
    .with_evidence(
        EvidenceSourceKind::StructuralComposition,
        "explicit_mols_bank_decoded_from_quasi_difference_matrix",
    )
    .with_evidence(EvidenceSourceKind::TheoremFamily, "sharma_das_molr_from_explicit_mols");

    if entry.num_groups == group_size {
        result
            .schedule
            .extend(molr_from_mols::row_fill_week(entry.num_groups, group_size));
        result.max_supported_weeks = result.schedule.len();
        result = result.add_operator(CompositionOperatorId::RecursiveTransversalLift);
    } else if entry.num_groups % group_size == 0 && (entry.num_groups / group_size) >= 2 {
        result = result.with_residual(ResidualStructure::TransversalLatentGroups {
            subgroup_count: group_size,
            subgroup_size: entry.num_groups / group_size,
        });
        result = composition::apply_recursive_transversal_lift(
            entry.num_groups,
            group_size,
            result,
            construct_max_schedule_recursive,
        );
    }

    let improved_weeks = result.max_supported_weeks;
    let result = result.with_quality(classify_quality(
        entry.num_groups,
        group_size,
        improved_weeks,
    ));
    if result.provenance.operators.is_empty() {
        result
    } else {
        result.clear_residual()
    }
}

pub(super) fn construct_molr_from_product_mols(
    spec: mols_product::MolsProductSpec,
    group_size: usize,
) -> ConstructionResult {
    let left_field =
        FiniteField::for_order(spec.left_order).expect("left product factor should be supported");
    let right_field =
        FiniteField::for_order(spec.right_order).expect("right product factor should be supported");
    let left_bank = mols::prime_power_bank(left_field, spec.mols_count);
    let right_bank = mols::prime_power_bank(right_field, spec.mols_count);
    let product_bank = mols::direct_product(&left_bank, &right_bank);

    let base_weeks = spec.mols_count + 1;
    let mut result = ConstructionResult::new(
        molr_from_mols::construct_from_mols(&product_bank, group_size),
        ConstructionFamilyId::MolrFromMols,
    )
    .with_quality(classify_quality(spec.num_groups, group_size, base_weeks))
    .with_applicability(ConstructionApplicability::Conditional {
        notes: vec![
            "requires num_groups to factor into supported prime-power orders with enough shared squares for the Sharma-Das MOLR range",
            "uses the direct-product theorem for prime-power MOLS banks, then applies the Sharma-Das MOLR construction to the first group_size rows",
            "can append clique-derived or recursively lifted rounds when the residual subgroup problem is constructible",
        ],
    })
    .with_evidence(
        EvidenceSourceKind::TheoremFamily,
        "direct_product_of_prime_power_mols_banks",
    )
    .with_evidence(
        EvidenceSourceKind::FiniteFieldConstruction,
        "prime_power_mols_factor_banks",
    )
    .with_evidence(EvidenceSourceKind::TheoremFamily, "sharma_das_molr_from_mols");

    if spec.num_groups == group_size {
        result
            .schedule
            .extend(molr_from_mols::row_fill_week(spec.num_groups, group_size));
        result.max_supported_weeks = result.schedule.len();
        result = result.add_operator(CompositionOperatorId::RecursiveTransversalLift);
    } else if spec.num_groups % group_size == 0 && (spec.num_groups / group_size) >= 2 {
        result = result.with_residual(ResidualStructure::TransversalLatentGroups {
            subgroup_count: group_size,
            subgroup_size: spec.num_groups / group_size,
        });
        result = composition::apply_recursive_transversal_lift(
            spec.num_groups,
            group_size,
            result,
            construct_max_schedule_recursive,
        );
    }

    let improved_weeks = result.max_supported_weeks;
    let result = result.with_quality(classify_quality(
        spec.num_groups,
        group_size,
        improved_weeks,
    ));
    if result.provenance.operators.is_empty() {
        result
    } else {
        result.clear_residual()
    }
}

pub(super) fn construct_resolvable_incomplete_transversal_design(
    entry: &'static catalog::ritd::RitdCatalogEntry,
) -> ConstructionResult {
    let supported_weeks = entry.complete_parallel_classes + usize::from(entry.add_group_fill_week);

    ConstructionResult::new(
        ritd::construct(entry),
        ConstructionFamilyId::ResolvableIncompleteTransversalDesign,
    )
    .with_quality(classify_quality(
        entry.num_groups,
        entry.group_size,
        supported_weeks,
    ))
    .with_applicability(ConstructionApplicability::Conditional {
        notes: vec![
            "requires a catalog-backed resolvable incomplete transversal design case",
            "derives complete parallel classes by deleting one source group from an ITD block set",
            "can add an intra-group filler week when the residual groups support a pure equal-size partition",
        ],
    })
    .with_evidence(EvidenceSourceKind::CatalogFact, catalog::ritd::source().citation)
    .with_evidence(EvidenceSourceKind::PatchBank, entry.citation)
    .with_evidence(EvidenceSourceKind::StructuralComposition, "ritd_group_fill")
}

pub(super) fn construct_molr_group_fill(
    entry: &'static catalog::molr::MolrCatalogEntry,
) -> ConstructionResult {
    let supported_weeks = entry.base_weeks + 1;

    ConstructionResult::new(molr::construct(entry), ConstructionFamilyId::MolrGroupFill)
        .with_quality(classify_quality(
            entry.num_groups,
            entry.group_size,
            supported_weeks,
        ))
        .with_applicability(ConstructionApplicability::Conditional {
            notes: vec![
                "requires a catalog-backed MOLR/MOLS group-fill case",
                "extends a validated base schedule by recovering a compatible latent-group partition and adding one intra-group week",
            ],
        })
        .with_evidence(EvidenceSourceKind::CatalogFact, catalog::molr::source().citation)
        .with_evidence(EvidenceSourceKind::PatchBank, entry.citation)
        .with_evidence(EvidenceSourceKind::StructuralComposition, "molr_group_fill")
}

pub(super) fn construct_affine_plane(field: &FiniteField) -> ConstructionResult {
    ConstructionResult::new(
        affine_plane::construct(field),
        ConstructionFamilyId::AffinePlanePrimePower,
    )
    .with_quality(ConstructionQuality::ExactFrontier)
    .with_applicability(ConstructionApplicability::Conditional {
        notes: vec![
            "requires group_size == num_groups",
            "requires supported prime-power group count",
        ],
    })
    .with_evidence(
        EvidenceSourceKind::FiniteFieldConstruction,
        "affine_plane_prime_power",
    )
}

pub(super) fn construct_p4_resolvable_bibd(field: &FiniteField) -> ConstructionResult {
    let num_groups = (3 * field.order + 1) / 4;

    ConstructionResult::new(
        p4_rbibd::construct(field),
        ConstructionFamilyId::P4ResolvableBIBD,
    )
    .with_quality(ConstructionQuality::ExactFrontier)
    .with_applicability(ConstructionApplicability::Conditional {
        notes: vec![
            "requires group_size == 4",
            "requires v = 3q + 1 with q a supported prime-power order",
            "uses the Beth-Jungnickel-Lenz finite-field construction for resolvable (v,4,1)-BIBDs",
        ],
    })
    .with_evidence(
        EvidenceSourceKind::CatalogFact,
        catalog::p4::rbibd_source().citation,
    )
    .with_evidence(
        EvidenceSourceKind::FiniteFieldConstruction,
        "p4_resolvable_bibd_3q_plus_1",
    )
    .with_quality(classify_quality(num_groups, 4, field.order))
}

pub(super) fn construct_resolvable_bibd_catalog(
    entry: &'static catalog::rbibd::RbibdCatalogEntry,
) -> ConstructionResult {
    ConstructionResult::new(
        rbibd::construct(entry),
        ConstructionFamilyId::ResolvableBIBDCatalog,
    )
    .with_quality(ConstructionQuality::ExactFrontier)
    .with_applicability(ConstructionApplicability::Conditional {
        notes: vec![
            "requires a catalog-backed resolvable BIBD case",
            "constructs explicit parallel classes from a source-backed RBIBD incidence design rather than a general finite-field theorem family",
        ],
    })
    .with_evidence(EvidenceSourceKind::CatalogFact, catalog::rbibd::source().citation)
    .with_evidence(EvidenceSourceKind::CatalogFact, entry.citation)
}

pub(super) fn construct_transversal_design_portfolio(
    num_groups: usize,
    group_size: usize,
    field: &FiniteField,
) -> ConstructionResult {
    let quality = classify_quality(num_groups, group_size, num_groups);
    let mut result = ConstructionResult::new(
        transversal_design::construct(field, group_size),
        ConstructionFamilyId::TransversalDesignPrimePower,
    )
    .with_quality(quality)
    .with_applicability(ConstructionApplicability::Conditional {
        notes: vec![
            "requires 3 <= group_size <= num_groups",
            "requires supported prime-power group count",
        ],
    })
    .with_evidence(
        EvidenceSourceKind::FiniteFieldConstruction,
        "transversal_design_prime_power",
    );
    if num_groups % group_size == 0 && (num_groups / group_size) >= 2 {
        result = result.with_residual(ResidualStructure::TransversalLatentGroups {
            subgroup_count: group_size,
            subgroup_size: num_groups / group_size,
        });
    }

    let result = composition::apply_recursive_transversal_lift(
        num_groups,
        group_size,
        result,
        construct_max_schedule_recursive,
    );
    let improved_weeks = result.max_supported_weeks;
    let result = result.with_quality(classify_quality(num_groups, group_size, improved_weeks));
    if result.provenance.operators.is_empty() {
        result
    } else {
        result.clear_residual()
    }
}

fn construct_max_schedule_recursive(
    num_groups: usize,
    group_size: usize,
) -> Option<ConstructionResult> {
    if group_size == 2 {
        return Some(construct_round_robin(num_groups));
    }

    if group_size == 3 {
        if let Some(entry) = catalog::kts::exact_case(num_groups) {
            return Some(construct_kirkman_triple_system(entry));
        }
        if let Some(entry) = catalog::nkts::exact_case(num_groups) {
            return Some(construct_nearly_kirkman_triple_system(entry));
        }
        if num_groups % 2 == 0 {
            if let Some(seed) = exact_kirkman_seed_construction(num_groups / 2) {
                return Some(
                    construct_nearly_kirkman_triple_system_via_exact_kirkman_seed(
                        seed,
                        num_groups / 2,
                    ),
                );
            }
        }
    }

    if group_size == 4 {
        if let Some(field) = p4_rbibd::supported_field(num_groups) {
            return Some(construct_p4_resolvable_bibd(&field));
        }
    }

    if let Some(entry) = catalog::mols::exact_case(num_groups) {
        if (3..=(entry.mols_count + 1)).contains(&group_size) {
            return Some(construct_catalog_mols_transversal(entry, group_size));
        }
    }

    if let Some(spec) = mols_product::best_spec(num_groups, group_size) {
        return Some(construct_product_mols_transversal(spec, group_size));
    }

    if let Some(entry) = catalog::qdm::exact_case(num_groups, group_size) {
        return Some(construct_qdm_catalog_rtd(entry));
    }

    if let Some(entry) = catalog::rbibd::exact_case(num_groups, group_size) {
        return Some(construct_resolvable_bibd_catalog(entry));
    }

    if let Some(entry) = catalog::ownsg::exact_case(num_groups, group_size) {
        return Some(construct_own_social_golfer(entry));
    }

    if let Some(entry) = catalog::mols::exact_case(num_groups) {
        if ((entry.mols_count + 2)..=entry.num_groups).contains(&group_size) {
            return Some(construct_molr_from_explicit_mols(entry, group_size));
        }
    }

    if let Some(entry) = catalog::qdm::mols_case(num_groups) {
        if ((qdm_rtd::mols_count(entry) + 2)..=entry.num_groups).contains(&group_size) {
            return Some(construct_molr_from_qdm_mols(entry, group_size));
        }
    }

    if let Some(spec) = mols_product::best_molr_spec(num_groups, group_size) {
        return Some(construct_molr_from_product_mols(spec, group_size));
    }

    if let Some(entry) = catalog::ritd::exact_case(num_groups, group_size) {
        return Some(construct_resolvable_incomplete_transversal_design(entry));
    }

    if let Some(entry) = catalog::molr::exact_case(num_groups, group_size) {
        return Some(construct_molr_group_fill(entry));
    }

    if let Some(entry) = catalog::published::exact_case(num_groups, group_size) {
        return Some(construct_published_schedule_bank(entry));
    }

    if let Some(field) = FiniteField::for_order(num_groups) {
        if group_size == 3 && num_groups % 6 == 1 {
            return Some(construct_kirkman_6t_plus_1(&field));
        }
        if group_size == num_groups {
            return Some(construct_affine_plane(&field));
        }
        if group_size >= 3 && group_size <= num_groups {
            return Some(construct_transversal_design_portfolio(
                num_groups, group_size, &field,
            ));
        }
    }

    Some(construct_single_round_partition(num_groups, group_size))
}

pub(super) fn counting_bound(num_groups: usize, group_size: usize) -> usize {
    ((num_groups * group_size) - 1) / (group_size - 1)
}

fn classify_quality(
    num_groups: usize,
    group_size: usize,
    supported_weeks: usize,
) -> ConstructionQuality {
    let bound = counting_bound(num_groups, group_size);
    let gap = bound.saturating_sub(supported_weeks);
    match gap {
        0 => ConstructionQuality::ExactFrontier,
        1 => ConstructionQuality::NearFrontier { missing_weeks: 1 },
        gap_to_counting_bound => ConstructionQuality::LowerBound {
            gap_to_counting_bound,
        },
    }
}

pub(super) fn schedule_from_raw(raw: Vec<Vec<Vec<usize>>>) -> Schedule {
    Schedule::from_raw(raw)
}
