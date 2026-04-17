use crate::solver5::field::FiniteField;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct MolsProductSpec {
    pub(super) num_groups: usize,
    pub(super) left_order: usize,
    pub(super) right_order: usize,
    pub(super) mols_count: usize,
}

pub(crate) fn best_spec(num_groups: usize, group_size: usize) -> Option<MolsProductSpec> {
    if group_size < 3 || FiniteField::for_order(num_groups).is_some() {
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
        if group_size > mols_count + 1 {
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
