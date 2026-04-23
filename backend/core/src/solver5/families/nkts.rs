use crate::solver5::catalog::nkts::NktsCatalogEntry;
use crate::solver5::types::{Schedule, WeekSchedule};

pub(super) fn construct(entry: &NktsCatalogEntry) -> Schedule {
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
                                .expect(
                                    "nkts catalog symbol should appear in the declared alphabet",
                                )
                        })
                        .collect::<Vec<_>>()
                })
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();
    Schedule::from_raw(weeks)
}

pub(super) fn construct_pseudo_doubling(base: &Schedule, base_player_count: usize) -> Schedule {
    let mut weeks = Vec::new();

    let doubled = |person: usize| person + base_player_count;

    for pair in base.weeks().chunks(2) {
        match pair {
            [left, right] => {
                let (left_blocks, right_blocks) = align_round_pair(left, right).expect(
                    "pseudo-doubling requires a 3-color alignment between paired Kirkman rounds",
                );
                let mut week0 = Vec::new();
                let mut week1 = Vec::new();
                let mut week2 = Vec::new();
                let mut week3 = Vec::new();

                for members in left_blocks {
                    week0.push(vec![members[0], members[1], members[2]]);
                    week1.push(vec![members[0], doubled(members[1]), doubled(members[2])]);
                    week2.push(vec![doubled(members[0]), doubled(members[1]), members[2]]);
                    week3.push(vec![doubled(members[0]), members[1], doubled(members[2])]);
                }

                for members in right_blocks {
                    week0.push(vec![
                        doubled(members[0]),
                        doubled(members[1]),
                        doubled(members[2]),
                    ]);
                    week1.push(vec![doubled(members[0]), members[1], members[2]]);
                    week2.push(vec![members[0], members[1], doubled(members[2])]);
                    week3.push(vec![members[0], doubled(members[1]), members[2]]);
                }

                weeks.extend([week0, week1, week2, week3]);
            }
            [last] => {
                let mut final_week = Vec::new();
                for block in last.blocks() {
                    let members = block
                        .members()
                        .iter()
                        .map(|person| person.raw())
                        .collect::<Vec<_>>();
                    final_week.push(vec![members[0], members[1], members[2]]);
                    final_week.push(vec![
                        doubled(members[0]),
                        doubled(members[1]),
                        doubled(members[2]),
                    ]);
                }
                weeks.push(final_week);
            }
            _ => unreachable!("chunks(2) only yields one or two weeks"),
        }
    }

    Schedule::from_raw(weeks)
}

fn align_round_pair(
    left: &WeekSchedule,
    right: &WeekSchedule,
) -> Option<(Vec<[usize; 3]>, Vec<[usize; 3]>)> {
    let player_count = left
        .blocks()
        .iter()
        .chain(right.blocks().iter())
        .flat_map(|block| block.members().iter().map(|person| person.raw()))
        .max()?
        + 1;

    let constraints = left
        .blocks()
        .iter()
        .chain(right.blocks().iter())
        .map(|block| {
            let members = block
                .members()
                .iter()
                .map(|person| person.raw())
                .collect::<Vec<_>>();
            [members[0], members[1], members[2]]
        })
        .collect::<Vec<_>>();

    let mut domains = vec![0b111u8; player_count];
    if let Some(first_block) = left.blocks().first() {
        for (color, person) in first_block.members().iter().enumerate() {
            domains[person.raw()] = 1 << color;
        }
    }

    let colors = solve_block_coloring(&constraints, domains)?;
    Some((
        reorder_blocks_by_color(left, &colors),
        reorder_blocks_by_color(right, &colors),
    ))
}

fn reorder_blocks_by_color(week: &WeekSchedule, colors: &[u8]) -> Vec<[usize; 3]> {
    week.blocks()
        .iter()
        .map(|block| {
            let mut ordered = [usize::MAX; 3];
            for person in block.members() {
                let raw = person.raw();
                ordered[colors[raw] as usize] = raw;
            }
            ordered
        })
        .collect()
}

fn solve_block_coloring(constraints: &[[usize; 3]], domains: Vec<u8>) -> Option<Vec<u8>> {
    fn bit_to_color(mask: u8) -> Option<u8> {
        match mask {
            0b001 => Some(0),
            0b010 => Some(1),
            0b100 => Some(2),
            _ => None,
        }
    }

    fn propagate(domains: &mut [u8], constraints: &[[usize; 3]]) -> bool {
        let mut changed = true;
        while changed {
            changed = false;
            for block in constraints {
                let mut used = 0u8;
                for person in block {
                    if let Some(color) = bit_to_color(domains[*person]) {
                        let bit = 1 << color;
                        if used & bit != 0 {
                            return false;
                        }
                        used |= bit;
                    }
                }

                for person in block {
                    if bit_to_color(domains[*person]).is_none() {
                        let next = domains[*person] & !used;
                        if next == 0 {
                            return false;
                        }
                        if next != domains[*person] {
                            domains[*person] = next;
                            changed = true;
                        }
                    }
                }

                let assigned = block
                    .iter()
                    .filter_map(|person| bit_to_color(domains[*person]))
                    .collect::<Vec<_>>();
                if assigned.len() == 2 {
                    let missing_mask =
                        0b111 & !assigned.iter().fold(0u8, |acc, color| acc | (1 << color));
                    for person in block {
                        if bit_to_color(domains[*person]).is_none() {
                            if domains[*person] & missing_mask == 0 {
                                return false;
                            }
                            if domains[*person] != missing_mask {
                                domains[*person] = missing_mask;
                                changed = true;
                            }
                        }
                    }
                }
            }
        }
        true
    }

    fn search(mut domains: Vec<u8>, constraints: &[[usize; 3]]) -> Option<Vec<u8>> {
        if !propagate(&mut domains, constraints) {
            return None;
        }

        if domains.iter().all(|domain| domain.count_ones() == 1) {
            return Some(
                domains
                    .into_iter()
                    .map(|domain| bit_to_color(domain).unwrap())
                    .collect(),
            );
        }

        let next_person = domains
            .iter()
            .enumerate()
            .filter(|(_, domain)| domain.count_ones() > 1)
            .min_by_key(|(_, domain)| domain.count_ones())
            .map(|(idx, _)| idx)?;

        for color in 0..3u8 {
            let bit = 1 << color;
            if domains[next_person] & bit == 0 {
                continue;
            }
            let mut branch = domains.clone();
            branch[next_person] = bit;
            if let Some(solution) = search(branch, constraints) {
                return Some(solution);
            }
        }

        None
    }

    search(domains, constraints)
}
