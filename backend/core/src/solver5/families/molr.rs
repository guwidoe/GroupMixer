use crate::solver5::catalog::{molr::MolrCatalogEntry, published};
use crate::solver5::types::Schedule;

pub(super) fn construct(entry: &MolrCatalogEntry) -> Schedule {
    let base_entry = published::exact_case(entry.num_groups, entry.group_size)
        .expect("molr catalog entries require a compatible published base schedule");
    let mut schedule = Schedule::from_raw(
        base_entry
            .encoded_weeks
            .iter()
            .map(|week| week.iter().map(|block| block.to_vec()).collect::<Vec<_>>())
            .collect::<Vec<_>>(),
    );
    assert_eq!(schedule.len(), entry.base_weeks);
    schedule.extend(Schedule::from_raw(vec![entry
        .group_fill_week
        .iter()
        .map(|block| block.to_vec())
        .collect::<Vec<_>>()]));
    schedule
}
