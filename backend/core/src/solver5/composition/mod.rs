mod recursive_lifting;

use super::types::ConstructionResult;

pub(super) fn apply_recursive_transversal_lift(
    num_groups: usize,
    group_size: usize,
    base_result: ConstructionResult,
    construct_max_schedule: fn(usize, usize) -> Option<ConstructionResult>,
) -> ConstructionResult {
    recursive_lifting::apply_transversal_latent_group_lift(
        num_groups,
        group_size,
        base_result,
        construct_max_schedule,
    )
}

pub(super) fn apply_modulo_latent_group_lift(
    num_groups: usize,
    group_size: usize,
    base_result: ConstructionResult,
    construct_max_schedule: fn(usize, usize) -> Option<ConstructionResult>,
) -> ConstructionResult {
    recursive_lifting::apply_modulo_latent_group_lift(
        num_groups,
        group_size,
        base_result,
        construct_max_schedule,
    )
}
