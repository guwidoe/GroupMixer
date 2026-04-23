use crate::solver5::catalog::mols::MolsCatalogEntry;
use crate::solver5::types::Schedule;

use super::mols;

pub(super) fn construct(entry: &MolsCatalogEntry, group_size: usize) -> Schedule {
    let mols = mols::decode_mols(entry);
    construct_from_mols(&mols, group_size)
}

pub(super) fn construct_from_mols(mols: &[Vec<Vec<usize>>], group_size: usize) -> Schedule {
    let order = mols[0].len();
    assert!(group_size >= 2);
    assert!(group_size <= order);

    let mut weeks = Vec::with_capacity(mols.len() + 1);

    let mut first_week = Vec::with_capacity(order);
    for col in 0..order {
        let mut block = Vec::with_capacity(group_size);
        for row in 0..group_size {
            block.push(encode_point(row, col, order));
        }
        first_week.push(block);
    }
    weeks.push(first_week);

    for square in mols {
        let mut week = Vec::with_capacity(order);
        for symbol in 0..order {
            let mut block = Vec::with_capacity(group_size);
            for row in 0..group_size {
                let col = square[row]
                    .iter()
                    .position(|value| *value == symbol)
                    .expect("latin square row should contain every symbol exactly once");
                block.push(encode_point(row, col, order));
            }
            week.push(block);
        }
        weeks.push(week);
    }

    Schedule::from_raw(weeks)
}

pub(super) fn row_fill_week(order: usize, group_size: usize) -> Schedule {
    Schedule::from_raw(vec![(0..group_size)
        .map(|row| {
            (0..order)
                .map(|col| encode_point(row, col, order))
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>()])
}

fn encode_point(latent_group: usize, symbol: usize, order: usize) -> usize {
    latent_group * order + symbol
}
