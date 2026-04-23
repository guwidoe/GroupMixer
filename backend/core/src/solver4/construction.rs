use super::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct PairCandidateScore {
    pub(super) left: usize,
    pub(super) right: usize,
    pub(super) raw_freedom: usize,
    pub(super) repeat_penalty_count: usize,
    pub(super) adjusted_freedom: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct GroupCandidateScore {
    pub(super) members: Vec<usize>,
    pub(super) raw_freedom: usize,
    pub(super) repeat_penalty_count: usize,
    pub(super) adjusted_freedom: i64,
}

impl PairCandidateScore {
    pub(super) fn pair(&self) -> (usize, usize) {
        (self.left, self.right)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub(super) struct GreedyInitializerTrace {
    pub(super) pair_steps: Vec<GreedyPairStep>,
    pub(super) singleton_steps: Vec<GreedySingletonStep>,
    pub(super) group_steps: Vec<GreedyGroupStep>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct GreedyPairStep {
    pub(super) week: usize,
    pub(super) group: usize,
    pub(super) pair_index: usize,
    pub(super) remaining_before: Vec<usize>,
    pub(super) scored_candidates: Vec<PairCandidateScore>,
    pub(super) chosen: PairCandidateScore,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct GreedySingletonStep {
    pub(super) week: usize,
    pub(super) group: usize,
    pub(super) remaining_before: Vec<usize>,
    pub(super) chosen: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct PairPenaltyUpdate {
    pub(super) pair: (usize, usize),
    pub(super) new_penalty: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct GreedyGroupStep {
    pub(super) week: usize,
    pub(super) group: usize,
    pub(super) members: Vec<usize>,
    pub(super) selected_pairs: Vec<(usize, usize)>,
    pub(super) singleton: Option<usize>,
    pub(super) penalty_updates: Vec<PairPenaltyUpdate>,
    pub(super) partnered_pairs_noted: Vec<(usize, usize)>,
}

pub(super) fn build_greedy_initial_schedule(
    problem: &PureSgpProblem,
    gamma: f64,
    rng: &mut ChaCha12Rng,
) -> Vec<Vec<Vec<usize>>> {
    build_greedy_initial_schedule_internal(problem, gamma, rng, None)
}

#[cfg(test)]
pub(super) fn build_greedy_initial_schedule_with_trace(
    problem: &PureSgpProblem,
    gamma: f64,
    rng: &mut ChaCha12Rng,
) -> (Vec<Vec<Vec<usize>>>, GreedyInitializerTrace) {
    let mut trace = GreedyInitializerTrace::default();
    let schedule = build_greedy_initial_schedule_internal(problem, gamma, rng, Some(&mut trace));
    (schedule, trace)
}

fn build_greedy_initial_schedule_internal(
    problem: &PureSgpProblem,
    gamma: f64,
    rng: &mut ChaCha12Rng,
    mut trace: Option<&mut GreedyInitializerTrace>,
) -> Vec<Vec<Vec<usize>>> {
    let mut schedule =
        vec![vec![Vec::with_capacity(problem.group_size); problem.num_groups]; problem.num_weeks];
    let mut partnered = vec![vec![false; problem.num_people]; problem.num_people];
    let mut selected_pair_penalties = vec![vec![0usize; problem.num_people]; problem.num_people];

    for week in 0..problem.num_weeks {
        let mut remaining: Vec<usize> = (0..problem.num_people).collect();
        for group_idx in 0..problem.num_groups {
            let (selected_pairs, singleton) = if problem.group_size == 4 {
                let chosen = choose_best_group_candidate(
                    &remaining,
                    &partnered,
                    &selected_pair_penalties,
                    problem.group_size,
                    gamma,
                    rng,
                );
                for member in &chosen.members {
                    schedule[week][group_idx].push(*member);
                }
                for member in &chosen.members {
                    remove_person(&mut remaining, *member);
                }
                (all_group_pairs(&chosen.members), None)
            } else {
                let pair_slots = problem.group_size / 2;
                let mut selected_pairs = Vec::with_capacity(pair_slots);
                for pair_index in 0..pair_slots {
                    let remaining_before = remaining.clone();
                    let scored_candidates =
                        score_pair_candidates(&remaining, &partnered, &selected_pair_penalties);
                    let chosen = choose_best_pair_from_scores(&scored_candidates, gamma, rng);
                    schedule[week][group_idx].push(chosen.left);
                    schedule[week][group_idx].push(chosen.right);
                    remove_person(&mut remaining, chosen.left);
                    remove_person(&mut remaining, chosen.right);
                    selected_pairs.push(chosen.pair());
                    if let Some(trace) = trace.as_mut() {
                        trace.pair_steps.push(GreedyPairStep {
                            week,
                            group: group_idx,
                            pair_index,
                            remaining_before,
                            scored_candidates,
                            chosen,
                        });
                    }
                }
                let singleton = if problem.group_size % 2 == 1 {
                    let remaining_before = remaining.clone();
                    let selected = choose_last_singleton(&remaining, gamma, rng);
                    schedule[week][group_idx].push(selected);
                    remove_person(&mut remaining, selected);
                    if let Some(trace) = trace.as_mut() {
                        trace.singleton_steps.push(GreedySingletonStep {
                            week,
                            group: group_idx,
                            remaining_before,
                            chosen: selected,
                        });
                    }
                    Some(selected)
                } else {
                    None
                };
                (selected_pairs, singleton)
            };

            let mut penalty_updates = Vec::with_capacity(selected_pairs.len());
            for &(left, right) in &selected_pairs {
                selected_pair_penalties[left][right] += 1;
                selected_pair_penalties[right][left] += 1;
                penalty_updates.push(PairPenaltyUpdate {
                    pair: (left, right),
                    new_penalty: selected_pair_penalties[left][right],
                });
            }
            let partnered_pairs_noted = all_group_pairs(&schedule[week][group_idx]);
            note_group_partnerships(&schedule[week][group_idx], &mut partnered);
            if let Some(trace) = trace.as_mut() {
                trace.group_steps.push(GreedyGroupStep {
                    week,
                    group: group_idx,
                    members: schedule[week][group_idx].clone(),
                    selected_pairs: selected_pairs.clone(),
                    singleton,
                    penalty_updates,
                    partnered_pairs_noted,
                });
            }
        }
    }

    schedule
}

fn score_pair_candidates(
    remaining: &[usize],
    partnered: &[Vec<bool>],
    selected_pair_penalties: &[Vec<usize>],
) -> Vec<PairCandidateScore> {
    let mut scored = Vec::new();
    for left_idx in 0..remaining.len() {
        for right_idx in (left_idx + 1)..remaining.len() {
            let left = remaining[left_idx];
            let right = remaining[right_idx];
            let raw_freedom = freedom_of_set(&[left, right], partnered);
            let repeat_penalty_count = selected_pair_penalties[left][right];
            let adjusted_freedom =
                raw_freedom as i64 - (repeat_penalty_count as i64 * PAPER_PAIR_REPEAT_PENALTY);
            scored.push(PairCandidateScore {
                left,
                right,
                raw_freedom,
                repeat_penalty_count,
                adjusted_freedom,
            });
        }
    }
    scored.sort_by(|left, right| {
        right
            .adjusted_freedom
            .cmp(&left.adjusted_freedom)
            .then((left.left, left.right).cmp(&(right.left, right.right)))
    });
    scored
}

fn score_group_candidates(
    remaining: &[usize],
    partnered: &[Vec<bool>],
    selected_pair_penalties: &[Vec<usize>],
    group_size: usize,
) -> Vec<GroupCandidateScore> {
    let mut scored = Vec::new();
    let mut scratch = Vec::with_capacity(group_size);
    enumerate_group_candidates(
        remaining,
        group_size,
        0,
        &mut scratch,
        &mut scored,
        partnered,
        selected_pair_penalties,
    );
    scored.sort_by(|left, right| {
        right
            .adjusted_freedom
            .cmp(&left.adjusted_freedom)
            .then(left.members.cmp(&right.members))
    });
    scored
}

fn enumerate_group_candidates(
    remaining: &[usize],
    group_size: usize,
    start: usize,
    scratch: &mut Vec<usize>,
    out: &mut Vec<GroupCandidateScore>,
    partnered: &[Vec<bool>],
    selected_pair_penalties: &[Vec<usize>],
) {
    if scratch.len() == group_size {
        let raw_freedom = freedom_of_set(scratch, partnered);
        let mut repeat_penalty_count = 0usize;
        for left_idx in 0..scratch.len() {
            for right_idx in (left_idx + 1)..scratch.len() {
                repeat_penalty_count +=
                    selected_pair_penalties[scratch[left_idx]][scratch[right_idx]];
            }
        }
        let adjusted_freedom =
            raw_freedom as i64 - (repeat_penalty_count as i64 * PAPER_PAIR_REPEAT_PENALTY);
        out.push(GroupCandidateScore {
            members: scratch.clone(),
            raw_freedom,
            repeat_penalty_count,
            adjusted_freedom,
        });
        return;
    }

    for idx in start..remaining.len() {
        scratch.push(remaining[idx]);
        enumerate_group_candidates(
            remaining,
            group_size,
            idx + 1,
            scratch,
            out,
            partnered,
            selected_pair_penalties,
        );
        scratch.pop();
    }
}

fn choose_best_group_candidate(
    remaining: &[usize],
    partnered: &[Vec<bool>],
    selected_pair_penalties: &[Vec<usize>],
    group_size: usize,
    gamma: f64,
    rng: &mut ChaCha12Rng,
) -> GroupCandidateScore {
    let scored = score_group_candidates(remaining, partnered, selected_pair_penalties, group_size);
    let best_score = scored[0].adjusted_freedom;
    let tied_len = scored
        .iter()
        .take_while(|candidate| candidate.adjusted_freedom == best_score)
        .count();
    if tied_len > 1 && rng.random::<f64>() < gamma {
        scored[..tied_len]
            .choose(rng)
            .cloned()
            .unwrap_or_else(|| scored[0].clone())
    } else {
        scored[0].clone()
    }
}

fn choose_best_pair_from_scores(
    scored: &[PairCandidateScore],
    gamma: f64,
    rng: &mut ChaCha12Rng,
) -> PairCandidateScore {
    let best_score = scored[0].adjusted_freedom;
    let tied_len = scored
        .iter()
        .take_while(|candidate| candidate.adjusted_freedom == best_score)
        .count();
    if tied_len > 1 && rng.random::<f64>() < gamma {
        scored[..tied_len].choose(rng).copied().unwrap_or(scored[0])
    } else {
        scored[0]
    }
}

#[cfg(test)]
pub(super) fn choose_best_pair(
    remaining: &[usize],
    partnered: &[Vec<bool>],
    selected_pair_penalties: &[Vec<usize>],
    gamma: f64,
    rng: &mut ChaCha12Rng,
) -> (usize, usize) {
    let scored = score_pair_candidates(remaining, partnered, selected_pair_penalties);
    choose_best_pair_from_scores(&scored, gamma, rng).pair()
}

pub(super) fn choose_last_singleton(
    remaining: &[usize],
    gamma: f64,
    rng: &mut ChaCha12Rng,
) -> usize {
    if remaining.len() > 1 && rng.random::<f64>() < gamma {
        remaining.choose(rng).copied().unwrap_or(remaining[0])
    } else {
        remaining[0]
    }
}

fn remove_person(remaining: &mut Vec<usize>, person: usize) {
    if let Some(idx) = remaining.iter().position(|candidate| *candidate == person) {
        remaining.remove(idx);
    }
}

pub(super) fn note_group_partnerships(group: &[usize], partnered: &mut [Vec<bool>]) {
    for left_idx in 0..group.len() {
        for right_idx in (left_idx + 1)..group.len() {
            let left = group[left_idx];
            let right = group[right_idx];
            partnered[left][right] = true;
            partnered[right][left] = true;
        }
    }
}

fn all_group_pairs(group: &[usize]) -> Vec<(usize, usize)> {
    let mut pairs = Vec::new();
    for left_idx in 0..group.len() {
        for right_idx in (left_idx + 1)..group.len() {
            pairs.push((group[left_idx], group[right_idx]));
        }
    }
    pairs
}
