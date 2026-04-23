use super::schedule_from_raw;
use crate::solver5::field::FiniteField;
use crate::solver5::types::Schedule;

pub(super) fn construct(field: &FiniteField, group_size: usize) -> Schedule {
    let order = field.order;
    let coefficients = field.nonzero_nonone_elements();
    let mut weeks = Vec::with_capacity(order);
    for offset in 0..order {
        let mut week = Vec::with_capacity(order);
        for symbol in 0..order {
            let mut block = Vec::with_capacity(group_size);
            block.push(td_person(0, field.add(offset, symbol), order));
            block.push(td_person(1, symbol, order));
            for extra_group in 0..(group_size - 2) {
                let adjusted = field.add(offset, field.mul(coefficients[extra_group], symbol));
                block.push(td_person(extra_group + 2, adjusted, order));
            }
            week.push(block);
        }
        weeks.push(week);
    }
    schedule_from_raw(weeks)
}

fn td_person(latent_group: usize, symbol: usize, order: usize) -> usize {
    latent_group * order + symbol
}
