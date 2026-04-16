use crate::solver5::catalog::published::PublishedScheduleEntry;
use crate::solver5::types::Schedule;

pub(super) fn construct(entry: &PublishedScheduleEntry) -> Schedule {
    let weeks = entry
        .encoded_weeks
        .iter()
        .map(|week| {
            week.iter()
                .map(|block| block.to_vec())
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();
    Schedule::from_raw(weeks)
}
