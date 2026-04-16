use super::composition;
use super::field::FiniteField;
use super::types::{ConstructionFamilyId, ConstructionResult, Schedule};

mod affine_plane;
mod kirkman;
mod round_robin;
mod transversal_design;

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
