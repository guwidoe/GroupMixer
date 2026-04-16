use super::schedule_from_raw;
use crate::solver5::field::FiniteField;
use crate::solver5::types::Schedule;

pub(super) fn construct(field: &FiniteField) -> Schedule {
    let order = field.order;
    let mut weeks = Vec::with_capacity(order + 1);

    let mut vertical_week = Vec::with_capacity(order);
    for x in 0..order {
        let mut block = Vec::with_capacity(order);
        for y in 0..order {
            block.push(plane_point(x, y, order));
        }
        vertical_week.push(block);
    }
    weeks.push(vertical_week);

    for slope in 0..order {
        let mut week = Vec::with_capacity(order);
        for intercept in 0..order {
            let mut block = Vec::with_capacity(order);
            for x in 0..order {
                let y = field.add(field.mul(slope, x), intercept);
                block.push(plane_point(x, y, order));
            }
            week.push(block);
        }
        weeks.push(week);
    }

    schedule_from_raw(weeks)
}

fn plane_point(x: usize, y: usize, order: usize) -> usize {
    x * order + y
}
