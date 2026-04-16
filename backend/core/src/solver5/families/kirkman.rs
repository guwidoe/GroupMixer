use super::schedule_from_raw;
use crate::solver5::catalog::kts::KtsCatalogEntry;
use crate::solver5::field::FiniteField;
use crate::solver5::types::Schedule;

pub(super) fn construct_catalog(entry: &KtsCatalogEntry) -> Schedule {
    let alphabet = entry.alphabet.chars().collect::<Vec<_>>();
    let weeks = entry
        .encoded_weeks
        .iter()
        .map(|week| {
            week.iter()
                .map(|block| {
                    block
                        .chars()
                        .map(|symbol| {
                            alphabet
                                .iter()
                                .position(|candidate| *candidate == symbol)
                                .expect("kts catalog symbol should appear in the declared alphabet")
                        })
                        .collect::<Vec<_>>()
                })
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();
    Schedule::from_raw(weeks)
}

pub(super) fn construct_6t_plus_1(field: &FiniteField) -> Schedule {
    let q = field.order;
    let t = q / 6;
    let generator = field
        .primitive_element()
        .expect("q ≡ 1 mod 6 prime-power field should have a primitive element");

    let mut base_class = Vec::with_capacity(q);
    base_class.push(vec![
        kts_person(0, 0, q),
        kts_person(0, 1, q),
        kts_person(0, 2, q),
    ]);

    for i in 0..t {
        let exponents = [i, i + 2 * t, i + 4 * t];
        for layer in 0..=2 {
            base_class.push(
                exponents
                    .iter()
                    .map(|exponent| kts_person(field.pow(generator, *exponent), layer, q))
                    .collect(),
            );
        }
    }

    for i in 0..(6 * t) {
        if (i / t) % 2 == 1 {
            let exponents = [i, i + 2 * t, i + 4 * t];
            base_class.push(vec![
                kts_person(field.pow(generator, exponents[0]), 0, q),
                kts_person(field.pow(generator, exponents[1]), 1, q),
                kts_person(field.pow(generator, exponents[2]), 2, q),
            ]);
        }
    }

    let mut classes = Vec::with_capacity((3 * q - 1) / 2);
    for shift in 0..q {
        classes.push(
            base_class
                .iter()
                .map(|block| shift_kts_block(block, shift, field))
                .collect(),
        );
    }

    for i in 0..(6 * t) {
        if (i / t) % 2 == 0 {
            let exponents = [i, i + 2 * t, i + 4 * t];
            let base_block = vec![
                kts_person(field.pow(generator, exponents[0]), 0, q),
                kts_person(field.pow(generator, exponents[1]), 1, q),
                kts_person(field.pow(generator, exponents[2]), 2, q),
            ];
            classes.push(
                (0..q)
                    .map(|shift| shift_kts_block(&base_block, shift, field))
                    .collect(),
            );
        }
    }

    schedule_from_raw(classes)
}

fn kts_person(symbol: usize, layer: usize, order: usize) -> usize {
    layer * order + symbol
}

fn shift_kts_block(block: &[usize], shift: usize, field: &FiniteField) -> Vec<usize> {
    block
        .iter()
        .map(|person| {
            let layer = person / field.order;
            let symbol = person % field.order;
            kts_person(field.add(symbol, shift), layer, field.order)
        })
        .collect()
}
