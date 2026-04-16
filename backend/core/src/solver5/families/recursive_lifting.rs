use super::counting_bound;
use crate::solver5::types::{ConstructionResult, Schedule};

pub(super) fn lift_transversal_latent_groups(
    num_groups: usize,
    group_size: usize,
    construct_max_schedule: fn(usize, usize) -> Option<ConstructionResult>,
) -> Option<Schedule> {
    if num_groups % group_size != 0 {
        return None;
    }

    let smaller_num_groups = num_groups / group_size;
    if smaller_num_groups < 2 {
        return None;
    }

    let upper_bound = counting_bound(smaller_num_groups, group_size);
    let smaller_schedule = construct_max_schedule(smaller_num_groups, group_size)?.schedule;
    let usable_weeks = smaller_schedule.len().min(upper_bound);
    if usable_weeks == 0 {
        return None;
    }

    let mut lifted = Vec::with_capacity(usable_weeks);
    for week in smaller_schedule.weeks().iter().take(usable_weeks) {
        let mut lifted_week = Vec::with_capacity(num_groups);
        for latent_group in 0..group_size {
            let offset = latent_group * num_groups;
            for block in week.blocks() {
                lifted_week.push(
                    block
                        .members()
                        .iter()
                        .map(|person| person.raw() + offset)
                        .collect(),
                );
            }
        }
        lifted.push(lifted_week);
    }

    Some(Schedule::from_raw(lifted))
}
