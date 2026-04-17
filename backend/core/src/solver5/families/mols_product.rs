use crate::solver5::field::FiniteField;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct MolsProductSpec {
    pub(super) num_groups: usize,
    pub(super) left_order: usize,
    pub(super) right_order: usize,
    pub(super) mols_count: usize,
}

pub(crate) fn best_spec(num_groups: usize, group_size: usize) -> Option<MolsProductSpec> {
    if group_size < 3 || group_size > num_groups || FiniteField::for_order(num_groups).is_some() {
        return None;
    }

    best_spec_with_predicate(num_groups, |mols_count| group_size <= mols_count + 1)
}

pub(crate) fn best_molr_spec(num_groups: usize, group_size: usize) -> Option<MolsProductSpec> {
    if group_size < 4 || group_size > num_groups || FiniteField::for_order(num_groups).is_some() {
        return None;
    }

    best_spec_with_predicate(num_groups, |mols_count| group_size >= mols_count + 2)
}

fn best_spec_with_predicate(
    num_groups: usize,
    supports_group_size: impl Fn(usize) -> bool,
) -> Option<MolsProductSpec> {
    if FiniteField::for_order(num_groups).is_some() {
        return None;
    }

    let mut best: Option<MolsProductSpec> = None;
    for left_order in 2..=num_groups / 2 {
        if num_groups % left_order != 0 {
            continue;
        }
        let right_order = num_groups / left_order;
        if left_order > right_order {
            continue;
        }

        let Some(left_field) = FiniteField::for_order(left_order) else {
            continue;
        };
        let Some(right_field) = FiniteField::for_order(right_order) else {
            continue;
        };

        let mols_count = left_field
            .order
            .saturating_sub(1)
            .min(right_field.order.saturating_sub(1));
        if !supports_group_size(mols_count) {
            continue;
        }

        let candidate = MolsProductSpec {
            num_groups,
            left_order,
            right_order,
            mols_count,
        };
        best = Some(match best {
            None => candidate,
            Some(current)
                if (candidate.mols_count, candidate.right_order, candidate.left_order)
                    > (current.mols_count, current.right_order, current.left_order) =>
            {
                candidate
            }
            Some(current) => current,
        });
    }

    best
}
