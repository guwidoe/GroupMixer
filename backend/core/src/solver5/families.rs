use super::field::FiniteField;
use super::types::{
    CompositionOperatorId, ConstructionFamilyId, ConstructionResult, Schedule,
};

pub(super) fn construct_schedule(
    num_groups: usize,
    group_size: usize,
    num_weeks: usize,
) -> Option<ConstructionResult> {
    construct_max_schedule(num_groups, group_size)?.truncate_to_requested(num_weeks)
}

pub(super) fn construct_max_schedule(
    num_groups: usize,
    group_size: usize,
) -> Option<ConstructionResult> {
    if group_size == 2 {
        return Some(ConstructionResult::new(
            construct_round_robin(num_groups),
            ConstructionFamilyId::RoundRobin,
        ));
    }

    let field = FiniteField::for_order(num_groups)?;
    if group_size == 3 && num_groups % 6 == 1 {
        return Some(ConstructionResult::new(
            construct_kirkman_6t_plus_1(&field),
            ConstructionFamilyId::Kirkman6TPlus1,
        ));
    }
    if group_size == num_groups {
        return Some(ConstructionResult::new(
            construct_affine_plane(&field),
            ConstructionFamilyId::AffinePlanePrimePower,
        ));
    }
    if group_size >= 3 && group_size <= num_groups {
        let mut result = ConstructionResult::new(
            construct_transversal_design(&field, group_size),
            ConstructionFamilyId::TransversalDesignPrimePower,
        );
        if let Some(extra_weeks) = lift_transversal_latent_groups(num_groups, group_size) {
            result.schedule.extend(extra_weeks);
            result.max_supported_weeks = result.schedule.len();
            result = result.add_operator(CompositionOperatorId::RecursiveTransversalLift);
        }
        return Some(result);
    }

    None
}

fn lift_transversal_latent_groups(num_groups: usize, group_size: usize) -> Option<Schedule> {
    if num_groups % group_size != 0 {
        return None;
    }

    let smaller_num_groups = num_groups / group_size;
    if smaller_num_groups < 2 {
        return None;
    }

    let upper_bound = counting_bound(smaller_num_groups, group_size);
    let smaller_schedule = construct_max_schedule(smaller_num_groups, group_size)?.schedule;
    let usable_weeks = smaller_schedule.len().min(upper_bound);
    if usable_weeks == 0 {
        return None;
    }

    let mut lifted = Vec::with_capacity(usable_weeks);
    for week in smaller_schedule.weeks().iter().take(usable_weeks) {
        let mut lifted_week = Vec::with_capacity(num_groups);
        for latent_group in 0..group_size {
            let offset = latent_group * num_groups;
            for block in week.blocks() {
                lifted_week.push(
                    block
                        .members()
                        .iter()
                        .map(|person| person.raw() + offset)
                        .collect(),
                );
            }
        }
        lifted.push(lifted_week);
    }

    Some(Schedule::from_raw(lifted))
}

fn counting_bound(num_groups: usize, group_size: usize) -> usize {
    ((num_groups * group_size) - 1) / (group_size - 1)
}

fn construct_round_robin(num_groups: usize) -> Schedule {
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

    Schedule::from_raw(weeks)
}

fn construct_kirkman_6t_plus_1(field: &FiniteField) -> Schedule {
    let q = field.order;
    let t = q / 6;
    let generator = field
        .primitive_element()
        .expect("q ≡ 1 mod 6 prime-power field should have a primitive element");

    let mut base_class = Vec::with_capacity(q);
    base_class.push(vec![kts_person(0, 0, q), kts_person(0, 1, q), kts_person(0, 2, q)]);

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

    Schedule::from_raw(classes)
}

fn construct_transversal_design(field: &FiniteField, group_size: usize) -> Schedule {
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
    Schedule::from_raw(weeks)
}

fn construct_affine_plane(field: &FiniteField) -> Schedule {
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

    Schedule::from_raw(weeks)
}

fn td_person(latent_group: usize, symbol: usize, order: usize) -> usize {
    latent_group * order + symbol
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

fn plane_point(x: usize, y: usize, order: usize) -> usize {
    x * order + y
}
