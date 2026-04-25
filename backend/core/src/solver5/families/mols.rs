use crate::solver5::catalog::mols::MolsCatalogEntry;
use crate::solver5::field::FiniteField;
use crate::solver5::types::Schedule;

pub(super) fn construct(entry: &MolsCatalogEntry, group_size: usize) -> Schedule {
    let mols = decode_mols(entry);
    construct_from_mols(&mols, group_size)
}

pub(super) fn construct_from_mols(mols: &[Vec<Vec<usize>>], group_size: usize) -> Schedule {
    let order = mols[0].len();
    assert!(group_size >= 3);
    assert!(group_size <= mols.len() + 1);

    let resolution_square = &mols[0];
    let extra_squares = &mols[1..(group_size - 1)];

    let mut weeks = Vec::with_capacity(order);
    for week_symbol in 0..order {
        let mut week = Vec::with_capacity(order);
        for row in 0..order {
            for col in 0..order {
                if resolution_square[row][col] != week_symbol {
                    continue;
                }

                let mut block = Vec::with_capacity(group_size);
                block.push(encode_point(0, row, order));
                block.push(encode_point(1, col, order));
                for (extra_idx, square) in extra_squares.iter().enumerate() {
                    block.push(encode_point(extra_idx + 2, square[row][col], order));
                }
                week.push(block);
            }
        }
        debug_assert_eq!(week.len(), order);
        weeks.push(week);
    }

    Schedule::from_raw(weeks)
}

pub(super) fn decode_mols(entry: &MolsCatalogEntry) -> Vec<Vec<Vec<usize>>> {
    let tokens = entry
        .encoded_mols
        .split_whitespace()
        .collect::<Vec<_>>();
    let order = entry.num_groups;
    let expected = order * entry.mols_count;
    assert_eq!(tokens.len(), expected);

    let mut mols = vec![Vec::with_capacity(order); entry.mols_count];
    for (idx, token) in tokens.iter().enumerate() {
        let square_idx = idx % entry.mols_count;
        let row = token.chars().map(decode_symbol).collect::<Vec<_>>();
        assert_eq!(row.len(), order);
        mols[square_idx].push(row);
    }
    mols
}

pub(super) fn prime_power_bank(field: FiniteField, mols_count: usize) -> Vec<Vec<Vec<usize>>> {
    assert!(mols_count <= field.order.saturating_sub(1));

    (1..=mols_count)
        .map(|multiplier| {
            (0..field.order)
                .map(|row| {
                    (0..field.order)
                        .map(|col| field.add(field.mul(multiplier, row), col))
                        .collect::<Vec<_>>()
                })
                .collect::<Vec<_>>()
        })
        .collect()
}

pub(super) fn direct_product(
    left: &[Vec<Vec<usize>>],
    right: &[Vec<Vec<usize>>],
) -> Vec<Vec<Vec<usize>>> {
    let count = left.len().min(right.len());
    let left_order = left[0].len();
    let right_order = right[0].len();

    (0..count)
        .map(|square_idx| {
            let left_square = &left[square_idx];
            let right_square = &right[square_idx];
            let mut square = Vec::with_capacity(left_order * right_order);
            for left_row in 0..left_order {
                for right_row in 0..right_order {
                    let mut row = Vec::with_capacity(left_order * right_order);
                    for left_col in 0..left_order {
                        for right_col in 0..right_order {
                            row.push(
                                (left_square[left_row][left_col] * right_order)
                                    + right_square[right_row][right_col],
                            );
                        }
                    }
                    square.push(row);
                }
            }
            square
        })
        .collect()
}

fn decode_symbol(symbol: char) -> usize {
    match symbol {
        'a'..='z' => (symbol as u8 - b'a') as usize,
        _ => panic!("unexpected MOLS symbol: {symbol}"),
    }
}

fn encode_point(latent_group: usize, symbol: usize, order: usize) -> usize {
    latent_group * order + symbol
}
