use crate::solver5::catalog::ritd::RitdCatalogEntry;
use crate::solver5::types::Schedule;

pub(super) fn construct(entry: &RitdCatalogEntry) -> Schedule {
    let removed_group_upper = entry.source_group_size;
    let mut weeks = entry
        .itd_rows
        .iter()
        .take(entry.complete_parallel_classes)
        .map(|row| {
            row.iter()
                .map(|block| remove_deleted_group_point(block, removed_group_upper))
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();

    if entry.add_group_fill_week {
        weeks.push(group_fill_week(
            entry.num_groups,
            entry.group_size,
            entry.source_group_size,
            removed_group_upper,
        ));
    }

    Schedule::from_raw(weeks)
}

fn remove_deleted_group_point(block: &[usize], removed_group_upper: usize) -> Vec<usize> {
    let filtered = block
        .iter()
        .copied()
        .filter(|player| *player >= removed_group_upper)
        .map(|player| player - removed_group_upper)
        .collect::<Vec<_>>();
    assert_eq!(filtered.len() + 1, block.len());
    filtered
}

fn group_fill_week(
    num_groups: usize,
    group_size: usize,
    source_group_size: usize,
    removed_group_upper: usize,
) -> Vec<Vec<usize>> {
    assert_eq!(source_group_size % group_size, 0);
    let residual_group_count = (num_groups * group_size) / source_group_size;

    let _ = removed_group_upper;

    (0..residual_group_count)
        .flat_map(|group_idx| {
            let start = group_idx * source_group_size;
            [
                (start..start + group_size).collect::<Vec<_>>(),
                (start + group_size..start + source_group_size).collect::<Vec<_>>(),
            ]
        })
        .collect()
}
