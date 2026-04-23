use crate::solver5::field::FiniteField;
use crate::solver5::types::Schedule;

pub(super) fn supported_field(num_groups: usize) -> Option<FiniteField> {
    let total_players = num_groups.checked_mul(4)?;
    let q_numerator = total_players.checked_sub(1)?;
    if q_numerator % 3 != 0 {
        return None;
    }

    FiniteField::for_order(q_numerator / 3)
}

pub(super) fn construct(field: &FiniteField) -> Schedule {
    let q = field.order;
    let exponent_stride = (q - 1) / 4;
    let primitive = field
        .primitive_element()
        .expect("supported prime-power field should expose a primitive element");
    let quarter_turn = field.pow(primitive, exponent_stride);
    debug_assert_eq!(field.mul(quarter_turn, quarter_turn), field.neg(1));

    let mut first_week = Vec::new();
    for exponent in 0..exponent_stride {
        let orbit = field.pow(primitive, exponent);
        let neg_orbit = field.neg(orbit);
        let rotated = field.mul(quarter_turn, orbit);
        let neg_rotated = field.neg(rotated);
        for row in 0..3 {
            first_week.push(vec![
                encode_point(q, orbit, row),
                encode_point(q, neg_orbit, row),
                encode_point(q, rotated, (row + 1) % 3),
                encode_point(q, neg_rotated, (row + 1) % 3),
            ]);
        }
    }
    first_week.push(vec![
        encode_point(q, 0, 0),
        encode_point(q, 0, 1),
        encode_point(q, 0, 2),
        3 * q,
    ]);

    let weeks = (0..q)
        .map(|translation| {
            first_week
                .iter()
                .map(|block| {
                    block
                        .iter()
                        .map(|point| translate_point(*field, q, translation, *point))
                        .collect::<Vec<_>>()
                })
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();

    Schedule::from_raw(weeks)
}

fn encode_point(q: usize, field_element: usize, row: usize) -> usize {
    row * q + field_element
}

fn translate_point(field: FiniteField, q: usize, translation: usize, point: usize) -> usize {
    if point == 3 * q {
        return point;
    }

    let row = point / q;
    let field_element = point % q;
    encode_point(q, field.add(field_element, translation), row)
}
