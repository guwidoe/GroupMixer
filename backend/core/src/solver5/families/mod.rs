use super::field::FiniteField;
use super::types::{
    CompositionOperatorId, ConstructionFamilyId, ConstructionResult, Schedule,
};

mod affine_plane;
mod kirkman;
mod recursive_lifting;
mod round_robin;
mod transversal_design;

pub(super) fn construct_schedule(
    num_groups: usize,
    group_size: usize,
    num_weeks: usize,
) -> Option<ConstructionResult> {
    construct_max_schedule(num_groups, group_size)?.truncate_to_requested(num_weeks)
}

pub(super) fn construct_max_schedule(
    num_groups: usize,
    group_size: usize,
) -> Option<ConstructionResult> {
    if group_size == 2 {
        return Some(ConstructionResult::new(
            round_robin::construct(num_groups),
            ConstructionFamilyId::RoundRobin,
        ));
    }

    let field = FiniteField::for_order(num_groups)?;
    if group_size == 3 && num_groups % 6 == 1 {
        return Some(ConstructionResult::new(
            kirkman::construct_6t_plus_1(&field),
            ConstructionFamilyId::Kirkman6TPlus1,
        ));
    }
    if group_size == num_groups {
        return Some(ConstructionResult::new(
            affine_plane::construct(&field),
            ConstructionFamilyId::AffinePlanePrimePower,
        ));
    }
    if group_size >= 3 && group_size <= num_groups {
        let mut result = ConstructionResult::new(
            transversal_design::construct(&field, group_size),
            ConstructionFamilyId::TransversalDesignPrimePower,
        );
        if let Some(extra_weeks) = recursive_lifting::lift_transversal_latent_groups(
            num_groups,
            group_size,
            construct_max_schedule,
        ) {
            result.schedule.extend(extra_weeks);
            result.max_supported_weeks = result.schedule.len();
            result = result.add_operator(CompositionOperatorId::RecursiveTransversalLift);
        }
        return Some(result);
    }

    None
}

pub(super) fn counting_bound(num_groups: usize, group_size: usize) -> usize {
    ((num_groups * group_size) - 1) / (group_size - 1)
}

pub(super) fn schedule_from_raw(raw: Vec<Vec<Vec<usize>>>) -> Schedule {
    Schedule::from_raw(raw)
}
