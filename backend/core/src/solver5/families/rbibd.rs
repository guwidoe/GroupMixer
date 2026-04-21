use crate::solver5::catalog::rbibd::RbibdCatalogEntry;
use crate::solver5::types::Schedule;

pub(super) fn construct(entry: &RbibdCatalogEntry) -> Schedule {
    let hyperoval_membership = build_membership(entry.source_order, entry.hyperoval);

    let mut residual_blocks = Vec::new();
    let mut equivalence_classes = Vec::new();
    for translation in 0..entry.source_order {
        let block = entry
            .base_block
            .iter()
            .map(|point| (point + translation) % entry.source_order)
            .collect::<Vec<_>>();

        let intersects_hyperoval = block.iter().any(|point| hyperoval_membership[*point]);
        if intersects_hyperoval {
            if block.contains(&entry.pivot_hyperoval_point) {
                equivalence_classes.push(
                    block
                        .into_iter()
                        .filter(|point| !hyperoval_membership[*point])
                        .collect::<Vec<_>>(),
                );
            }
            continue;
        }

        residual_blocks.push(block);
    }

    let relabel = build_relabel(entry.source_order, &hyperoval_membership);
    let residual_blocks = residual_blocks
        .into_iter()
        .map(|block| relabel_block(block, &relabel))
        .collect::<Vec<_>>();
    let equivalence_classes = equivalence_classes
        .into_iter()
        .map(|block| relabel_block(block, &relabel))
        .collect::<Vec<_>>();

    let point_count = relabel.iter().filter(|idx| idx.is_some()).count();
    let mut incidence_rows = vec![Vec::new(); point_count];
    for (block_idx, block) in residual_blocks.iter().enumerate() {
        for &point in block {
            incidence_rows[point].push(block_idx);
        }
    }

    let weeks = equivalence_classes
        .into_iter()
        .map(|parallel_seed| {
            parallel_seed
                .into_iter()
                .map(|point| incidence_rows[point].clone())
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();

    Schedule::from_raw(weeks)
}

fn build_membership(order: usize, members: &[usize]) -> Vec<bool> {
    let mut membership = vec![false; order];
    for &member in members {
        membership[member] = true;
    }
    membership
}

fn build_relabel(order: usize, excluded: &[bool]) -> Vec<Option<usize>> {
    let mut next = 0;
    let mut relabel = vec![None; order];
    for point in 0..order {
        if excluded[point] {
            continue;
        }
        relabel[point] = Some(next);
        next += 1;
    }
    relabel
}

fn relabel_block(block: Vec<usize>, relabel: &[Option<usize>]) -> Vec<usize> {
    block
        .into_iter()
        .map(|point| relabel[point].expect("relabel should exist for non-hyperoval points"))
        .collect()
}
