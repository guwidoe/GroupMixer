use crate::solver5::catalog::mols::MolsCatalogEntry;
use crate::solver5::types::Schedule;

pub(super) fn construct(entry: &MolsCatalogEntry, group_size: usize) -> Schedule {
    let mols = decode_mols(entry);
    assert!(group_size >= 3);
    assert!(group_size <= entry.mols_count + 1);

    let resolution_square = &mols[0];
    let extra_squares = &mols[1..(group_size - 1)];
    let order = entry.num_groups;

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

fn decode_mols(entry: &MolsCatalogEntry) -> Vec<Vec<Vec<usize>>> {
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

fn decode_symbol(symbol: char) -> usize {
    match symbol {
        'a'..='z' => (symbol as u8 - b'a') as usize,
        _ => panic!("unexpected MOLS symbol: {symbol}"),
    }
}

fn encode_point(latent_group: usize, symbol: usize, order: usize) -> usize {
    latent_group * order + symbol
}
