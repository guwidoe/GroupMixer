use crate::solver5::types::Schedule;

pub(super) fn construct(num_groups: usize, group_size: usize) -> Schedule {
    let week = (0..num_groups)
        .map(|group_idx| {
            let start = group_idx * group_size;
            (start..start + group_size).collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();

    Schedule::from_raw(vec![week])
}
