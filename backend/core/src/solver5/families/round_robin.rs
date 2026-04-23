use super::schedule_from_raw;
use crate::solver5::types::Schedule;

pub(super) fn construct(num_groups: usize) -> Schedule {
    let total_people = num_groups * 2;
    let mut ring: Vec<usize> = (0..total_people).collect();
    let mut weeks = Vec::with_capacity(total_people.saturating_sub(1));

    for _ in 0..total_people.saturating_sub(1) {
        let mut week = Vec::with_capacity(num_groups);
        for idx in 0..num_groups {
            week.push(vec![ring[idx], ring[total_people - 1 - idx]]);
        }
        weeks.push(week);

        if total_people > 2 {
            let last = ring.pop().expect("round robin ring should be non-empty");
            ring.insert(1, last);
        }
    }

    schedule_from_raw(weeks)
}
