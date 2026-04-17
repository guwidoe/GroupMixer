use crate::solver5::catalog::qdm::QdmCatalogEntry;
use crate::solver5::types::Schedule;

use super::schedule_from_raw;

pub(super) fn construct(entry: &QdmCatalogEntry) -> Schedule {
    let oa = resolvable_oa_from_qdm(entry);
    let weeks = oa
        .chunks(entry.num_groups)
        .map(|week_rows| {
            week_rows
                .iter()
                .map(|row| {
                    row.iter()
                        .enumerate()
                        .map(|(latent_group, symbol)| (latent_group * entry.num_groups) + symbol)
                        .collect::<Vec<_>>()
                })
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();

    schedule_from_raw(weeks)
}

fn resolvable_oa_from_qdm(entry: &QdmCatalogEntry) -> Vec<Vec<usize>> {
    let oa = oa_from_quasi_difference_matrix(entry.encoded_columns, entry.qdm_group_order);
    let mut sorted = oa;
    sorted.sort();
    sorted
        .into_iter()
        .map(|row| row.into_iter().skip(1).collect::<Vec<_>>())
        .collect()
}

fn oa_from_quasi_difference_matrix(columns: &[[i8; 6]], group_order: usize) -> Vec<Vec<usize>> {
    let row_width = columns[0].len();
    let mut expanded_rows = Vec::with_capacity(row_width + 1);
    let mut inf = group_order;

    for row in 0..row_width {
        let mut expanded = Vec::with_capacity(columns.len() * group_order);
        let mut row_inf = group_order;
        for column in columns {
            let value = column[row];
            if value < 0 {
                expanded.extend(std::iter::repeat(row_inf).take(group_order));
                row_inf += 1;
            } else {
                let value = value as usize;
                expanded.extend((0..group_order).map(|offset| (value + offset) % group_order));
            }
        }
        inf = row_inf;
        expanded_rows.push(expanded);
    }

    let total_rows = expanded_rows[0].len();
    let mut oa = (0..total_rows)
        .map(|index| {
            expanded_rows
                .iter()
                .map(|row| row[index])
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();

    if inf > group_order {
        assert_eq!(inf - group_order, 1, "only the single-hole QDM case is currently supported");
        oa.push(vec![group_order; row_width]);
    }

    oa
}
