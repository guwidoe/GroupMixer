use crate::solver5::catalog::ownsg::OwnSgCatalogEntry;
use crate::solver5::types::Schedule;

pub(super) fn construct(entry: &OwnSgCatalogEntry) -> Schedule {
    let total_players = entry.num_groups * entry.group_size;
    let weeks = entry
        .starter_blocks
        .iter()
        .map(|starter| {
            (0..entry.num_groups)
                .map(|shift_idx| {
                    let shift = shift_idx * entry.group_size;
                    let mut block = starter
                        .iter()
                        .map(|player| (player + shift) % total_players)
                        .collect::<Vec<_>>();
                    block.sort_unstable();
                    block
                })
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();

    Schedule::from_raw(weeks)
}
