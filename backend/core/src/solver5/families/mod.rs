use super::composition;
use super::field::FiniteField;
use super::portfolio::{ConstructionFamily, FamilyEvaluation};
use super::problem::PureSgpProblem;
use super::types::{ConstructionFamilyId, ConstructionResult, Schedule};

mod affine_plane;
mod kirkman;
mod round_robin;
mod transversal_design;

pub(super) fn registered_families() -> Vec<&'static dyn ConstructionFamily> {
    vec![
        &ROUND_ROBIN_FAMILY,
        &KIRKMAN_6T_PLUS_1_FAMILY,
        &AFFINE_PLANE_PRIME_POWER_FAMILY,
        &TRANSVERSAL_DESIGN_PRIME_POWER_FAMILY,
    ]
}

struct RoundRobinFamily;
struct Kirkman6TPlus1Family;
struct AffinePlanePrimePowerFamily;
struct TransversalDesignPrimePowerFamily;

static ROUND_ROBIN_FAMILY: RoundRobinFamily = RoundRobinFamily;
static KIRKMAN_6T_PLUS_1_FAMILY: Kirkman6TPlus1Family = Kirkman6TPlus1Family;
static AFFINE_PLANE_PRIME_POWER_FAMILY: AffinePlanePrimePowerFamily =
    AffinePlanePrimePowerFamily;
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
}

pub(super) fn construct_kirkman_6t_plus_1(field: &FiniteField) -> ConstructionResult {
    ConstructionResult::new(
        kirkman::construct_6t_plus_1(field),
        ConstructionFamilyId::Kirkman6TPlus1,
    )
}

pub(super) fn construct_affine_plane(field: &FiniteField) -> ConstructionResult {
    ConstructionResult::new(
        affine_plane::construct(field),
        ConstructionFamilyId::AffinePlanePrimePower,
    )
}

pub(super) fn construct_transversal_design_portfolio(
    num_groups: usize,
    group_size: usize,
    field: &FiniteField,
) -> ConstructionResult {
    let result = ConstructionResult::new(
        transversal_design::construct(field, group_size),
        ConstructionFamilyId::TransversalDesignPrimePower,
    );
    composition::apply_recursive_transversal_lift(
        num_groups,
        group_size,
        result,
        construct_max_schedule_recursive,
    )
}

fn construct_max_schedule_recursive(
    num_groups: usize,
    group_size: usize,
) -> Option<ConstructionResult> {
    if group_size == 2 {
        return Some(construct_round_robin(num_groups));
    }

    let field = FiniteField::for_order(num_groups)?;
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

    None
}

pub(super) fn counting_bound(num_groups: usize, group_size: usize) -> usize {
    ((num_groups * group_size) - 1) / (group_size - 1)
}

pub(super) fn schedule_from_raw(raw: Vec<Vec<Vec<usize>>>) -> Schedule {
    Schedule::from_raw(raw)
}
