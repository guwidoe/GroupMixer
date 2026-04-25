use super::state::{LocalSearchState, PairCountAdjustment, SameWeekSwapApplication};
use crate::models::Solver6PairRepeatPenaltyModel;
use crate::solver_support::SolverError;

#[derive(Debug, Clone, PartialEq, Eq)]
struct PairAdjustmentAccumulator {
    adjustments: Vec<PairCountAdjustment>,
}

impl PairAdjustmentAccumulator {
    fn with_capacity(capacity: usize) -> Self {
        Self {
            adjustments: Vec::with_capacity(capacity),
        }
    }

    fn start_candidate(&mut self) {
        self.adjustments.clear();
    }

    fn apply(&mut self, pair_idx: usize, delta: i8) {
        debug_assert_ne!(delta, 0);
        if let Some(existing_idx) = self
            .adjustments
            .iter()
            .position(|adjustment| adjustment.pair_idx == pair_idx)
        {
            let merged_delta = self.adjustments[existing_idx].delta + delta;
            if merged_delta == 0 {
                self.adjustments.swap_remove(existing_idx);
            } else {
                self.adjustments[existing_idx].delta = merged_delta;
            }
            return;
        }

        self.adjustments.push(PairCountAdjustment { pair_idx, delta });
    }

    fn materialize(&self) -> Vec<PairCountAdjustment> {
        self.adjustments.clone()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct SameWeekSwapEvaluationSummary {
    active_score_before: u64,
    active_score_after: u64,
    linear_repeat_excess_after: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct DensePairAdjustmentScratch {
    deltas_by_pair: Vec<i8>,
    touched_pairs: Vec<usize>,
    touched_generations: Vec<u32>,
    current_generation: u32,
}

impl DensePairAdjustmentScratch {
    fn new(total_pairs: usize, expected_adjustments: usize) -> Self {
        Self {
            deltas_by_pair: vec![0; total_pairs],
            touched_pairs: Vec::with_capacity(expected_adjustments),
            touched_generations: vec![0; total_pairs],
            current_generation: 1,
        }
    }

    fn start_candidate(&mut self) {
        self.touched_pairs.clear();
        self.current_generation = self.current_generation.wrapping_add(1);
        if self.current_generation == 0 {
            self.touched_generations.fill(0);
            self.current_generation = 1;
        }
    }

    fn apply(&mut self, pair_idx: usize, delta: i8) {
        debug_assert_ne!(delta, 0);
        if self.touched_generations[pair_idx] != self.current_generation {
            self.touched_generations[pair_idx] = self.current_generation;
            self.deltas_by_pair[pair_idx] = 0;
            self.touched_pairs.push(pair_idx);
        }
        self.deltas_by_pair[pair_idx] += delta;
    }

    fn score_delta_for_model(
        &self,
        state: &LocalSearchState,
        model: Solver6PairRepeatPenaltyModel,
    ) -> i64 {
        let pair_state = state.pair_state();
        self.touched_pairs.iter().fold(0i64, |delta_total, &pair_idx| {
            let delta = self.deltas_by_pair[pair_idx];
            if delta == 0 {
                delta_total
            } else {
                delta_total
                    + match model {
                        Solver6PairRepeatPenaltyModel::LinearRepeatExcess => pair_state
                            .linear_score_delta_for_pair_change_known_valid(pair_idx, delta),
                        _ => pair_state.score_delta_for_pair_change_known_valid(
                            pair_idx, delta, model,
                        ),
                    }
            }
        })
    }

    fn materialize(&self) -> Vec<PairCountAdjustment> {
        self.touched_pairs
            .iter()
            .filter_map(|&pair_idx| {
                let delta = self.deltas_by_pair[pair_idx];
                (delta != 0).then_some(PairCountAdjustment { pair_idx, delta })
            })
            .collect()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct SameWeekSwapMove {
    pub week_idx: usize,
    pub left_group_idx: usize,
    pub left_pos_idx: usize,
    pub right_group_idx: usize,
    pub right_pos_idx: usize,
    pub left_person: usize,
    pub right_person: usize,
}

impl SameWeekSwapMove {
    pub(crate) fn application(self) -> SameWeekSwapApplication {
        SameWeekSwapApplication {
            week_idx: self.week_idx,
            left_group_idx: self.left_group_idx,
            left_pos_idx: self.left_pos_idx,
            right_group_idx: self.right_group_idx,
            right_pos_idx: self.right_pos_idx,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct EvaluatedSameWeekSwapMove {
    pub swap: SameWeekSwapMove,
    pub pair_adjustments: Vec<PairCountAdjustment>,
    pub active_score_before: u64,
    pub active_score_after: u64,
    pub linear_repeat_excess_after: u64,
}

impl EvaluatedSameWeekSwapMove {
    pub(crate) fn active_score_delta(&self) -> i64 {
        self.active_score_after as i64 - self.active_score_before as i64
    }

    pub(crate) fn improves_current(&self) -> bool {
        self.active_score_after < self.active_score_before
    }
}

pub(crate) fn enumerate_same_week_swap_moves(
    state: &LocalSearchState,
) -> Vec<SameWeekSwapMove> {
    let mut moves = Vec::with_capacity(count_same_week_swap_moves(state));
    for_each_same_week_swap_move(state, |candidate| moves.push(candidate));
    moves
}

pub(crate) fn count_same_week_swap_moves(state: &LocalSearchState) -> usize {
    let problem = state.problem();
    problem.num_weeks
        * (problem.num_groups * problem.num_groups.saturating_sub(1) / 2)
        * problem.group_size
        * problem.group_size
}

pub(crate) fn nth_same_week_swap_move(
    state: &LocalSearchState,
    target_idx: usize,
) -> Option<SameWeekSwapMove> {
    let mut current_idx = 0usize;
    let mut found = None;
    for_each_same_week_swap_move(state, |candidate| {
        if found.is_none() && current_idx == target_idx {
            found = Some(candidate);
        }
        current_idx += 1;
    });
    found
}

fn for_each_same_week_swap_move(
    state: &LocalSearchState,
    mut visit: impl FnMut(SameWeekSwapMove),
) {
    for (week_idx, week) in state.schedule().iter().enumerate() {
        for left_group_idx in 0..week.len() {
            for right_group_idx in (left_group_idx + 1)..week.len() {
                for left_pos_idx in 0..week[left_group_idx].len() {
                    for right_pos_idx in 0..week[right_group_idx].len() {
                        visit(SameWeekSwapMove {
                            week_idx,
                            left_group_idx,
                            left_pos_idx,
                            right_group_idx,
                            right_pos_idx,
                            left_person: week[left_group_idx][left_pos_idx],
                            right_person: week[right_group_idx][right_pos_idx],
                        });
                    }
                }
            }
        }
    }
}

pub(crate) fn try_for_each_same_week_swap_move(
    state: &LocalSearchState,
    mut visit: impl FnMut(SameWeekSwapMove) -> Result<(), SolverError>,
) -> Result<(), SolverError> {
    for (week_idx, week) in state.schedule().iter().enumerate() {
        for left_group_idx in 0..week.len() {
            for right_group_idx in (left_group_idx + 1)..week.len() {
                for left_pos_idx in 0..week[left_group_idx].len() {
                    for right_pos_idx in 0..week[right_group_idx].len() {
                        visit(SameWeekSwapMove {
                            week_idx,
                            left_group_idx,
                            left_pos_idx,
                            right_group_idx,
                            right_pos_idx,
                            left_person: week[left_group_idx][left_pos_idx],
                            right_person: week[right_group_idx][right_pos_idx],
                        })?;
                    }
                }
            }
        }
    }
    Ok(())
}

pub(crate) fn evaluate_same_week_swap(
    state: &LocalSearchState,
    swap: SameWeekSwapMove,
) -> Result<EvaluatedSameWeekSwapMove, SolverError> {
    let week = state
        .schedule()
        .get(swap.week_idx)
        .ok_or_else(|| {
            SolverError::ValidationError(format!(
                "solver6 same-week swap evaluation week {} out of bounds",
                swap.week_idx
            ))
        })?;
    let left_group = week.get(swap.left_group_idx).ok_or_else(|| {
        SolverError::ValidationError(format!(
            "solver6 same-week swap evaluation left group {} out of bounds in week {}",
            swap.left_group_idx, swap.week_idx
        ))
    })?;
    let right_group = week.get(swap.right_group_idx).ok_or_else(|| {
        SolverError::ValidationError(format!(
            "solver6 same-week swap evaluation right group {} out of bounds in week {}",
            swap.right_group_idx, swap.week_idx
        ))
    })?;
    if swap.left_group_idx == swap.right_group_idx {
        return Err(SolverError::ValidationError(
            "solver6 same-week swap evaluation requires two distinct groups".into(),
        ));
    }
    let &left_person = left_group.get(swap.left_pos_idx).ok_or_else(|| {
        SolverError::ValidationError("solver6 same-week swap left position out of bounds".into())
    })?;
    let &right_person = right_group.get(swap.right_pos_idx).ok_or_else(|| {
        SolverError::ValidationError("solver6 same-week swap right position out of bounds".into())
    })?;
    if left_person != swap.left_person || right_person != swap.right_person {
        return Err(SolverError::ValidationError(
            "solver6 same-week swap evaluation received stale person coordinates".into(),
        ));
    }

    let mut scratch = PairAdjustmentAccumulator::with_capacity(
        4 * left_group.len().saturating_sub(1),
    );
    evaluate_same_week_swap_with_accumulator(state, swap, &mut scratch)
}

fn evaluate_same_week_swap_with_accumulator(
    state: &LocalSearchState,
    swap: SameWeekSwapMove,
    scratch: &mut PairAdjustmentAccumulator,
) -> Result<EvaluatedSameWeekSwapMove, SolverError> {
    let summary = evaluate_same_week_swap_summary_with_accumulator(state, swap, scratch)?;
    Ok(EvaluatedSameWeekSwapMove {
        swap,
        pair_adjustments: scratch.materialize(),
        active_score_before: summary.active_score_before,
        active_score_after: summary.active_score_after,
        linear_repeat_excess_after: summary.linear_repeat_excess_after,
    })
}

fn evaluate_same_week_swap_summary_with_accumulator(
    state: &LocalSearchState,
    swap: SameWeekSwapMove,
    scratch: &mut PairAdjustmentAccumulator,
) -> Result<SameWeekSwapEvaluationSummary, SolverError> {
    let week = &state.schedule()[swap.week_idx];
    let left_group = &week[swap.left_group_idx];
    let right_group = &week[swap.right_group_idx];
    scratch.start_candidate();

    let universe = state.pair_state().universe();
    for (member_idx, &other) in left_group.iter().enumerate() {
        if member_idx == swap.left_pos_idx {
            continue;
        }
        scratch.apply(universe.pair_index_known_valid(swap.left_person, other), -1);
        scratch.apply(universe.pair_index_known_valid(swap.right_person, other), 1);
    }
    for (member_idx, &other) in right_group.iter().enumerate() {
        if member_idx == swap.right_pos_idx {
            continue;
        }
        scratch.apply(universe.pair_index_known_valid(swap.right_person, other), -1);
        scratch.apply(universe.pair_index_known_valid(swap.left_person, other), 1);
    }

    let linear_delta = score_delta_for_adjustments(
        state,
        &scratch.adjustments,
        Solver6PairRepeatPenaltyModel::LinearRepeatExcess,
    )?;
    let active_delta = match state.active_penalty_model() {
        Solver6PairRepeatPenaltyModel::LinearRepeatExcess => linear_delta,
        active_model => score_delta_for_adjustments(state, &scratch.adjustments, active_model)?,
    };
    let active_score_before = state.current_active_score();
    let active_score_after = (active_score_before as i64 + active_delta) as u64;

    Ok(SameWeekSwapEvaluationSummary {
        active_score_before,
        active_score_after,
        linear_repeat_excess_after: (state.pair_state().linear_repeat_excess() as i64 + linear_delta)
            as u64,
    })
}

pub(crate) fn find_best_same_week_swap(
    state: &LocalSearchState,
) -> Result<Option<EvaluatedSameWeekSwapMove>, SolverError> {
    let mut best: Option<EvaluatedSameWeekSwapMove> = None;
    let mut scratch = DensePairAdjustmentScratch::new(
        state.pair_state().universe().total_distinct_pairs(),
        4 * state.problem().group_size.saturating_sub(1),
    );
    try_for_each_same_week_swap_move(state, |candidate| {
        let summary = evaluate_same_week_swap_summary_with_dense_scratch(state, candidate, &mut scratch);
        if best.as_ref().is_none_or(|incumbent| {
            same_week_swap_summary_is_better(candidate, summary, incumbent)
        }) {
            best = Some(EvaluatedSameWeekSwapMove {
                swap: candidate,
                pair_adjustments: scratch.materialize(),
                active_score_before: summary.active_score_before,
                active_score_after: summary.active_score_after,
                linear_repeat_excess_after: summary.linear_repeat_excess_after,
            });
        }
        Ok(())
    })?;
    Ok(best)
}

fn evaluate_same_week_swap_summary_with_dense_scratch(
    state: &LocalSearchState,
    swap: SameWeekSwapMove,
    scratch: &mut DensePairAdjustmentScratch,
) -> SameWeekSwapEvaluationSummary {
    let week = &state.schedule()[swap.week_idx];
    let left_group = &week[swap.left_group_idx];
    let right_group = &week[swap.right_group_idx];
    scratch.start_candidate();

    let universe = state.pair_state().universe();
    for (member_idx, &other) in left_group.iter().enumerate() {
        if member_idx == swap.left_pos_idx {
            continue;
        }
        scratch.apply(universe.pair_index_known_valid(swap.left_person, other), -1);
        scratch.apply(universe.pair_index_known_valid(swap.right_person, other), 1);
    }
    for (member_idx, &other) in right_group.iter().enumerate() {
        if member_idx == swap.right_pos_idx {
            continue;
        }
        scratch.apply(universe.pair_index_known_valid(swap.right_person, other), -1);
        scratch.apply(universe.pair_index_known_valid(swap.left_person, other), 1);
    }

    let linear_delta = scratch.score_delta_for_model(
        state,
        Solver6PairRepeatPenaltyModel::LinearRepeatExcess,
    );
    let active_delta = match state.active_penalty_model() {
        Solver6PairRepeatPenaltyModel::LinearRepeatExcess => linear_delta,
        active_model => scratch.score_delta_for_model(state, active_model),
    };
    let active_score_before = state.current_active_score();
    let active_score_after = (active_score_before as i64 + active_delta) as u64;

    SameWeekSwapEvaluationSummary {
        active_score_before,
        active_score_after,
        linear_repeat_excess_after: (state.pair_state().linear_repeat_excess() as i64 + linear_delta)
            as u64,
    }
}

fn same_week_swap_summary_is_better(
    candidate_swap: SameWeekSwapMove,
    candidate: SameWeekSwapEvaluationSummary,
    incumbent: &EvaluatedSameWeekSwapMove,
) -> bool {
    (
        candidate.active_score_after,
        candidate.linear_repeat_excess_after,
        candidate_swap.week_idx,
        candidate_swap.left_group_idx,
        candidate_swap.left_pos_idx,
        candidate_swap.right_group_idx,
        candidate_swap.right_pos_idx,
    ) < (
        incumbent.active_score_after,
        incumbent.linear_repeat_excess_after,
        incumbent.swap.week_idx,
        incumbent.swap.left_group_idx,
        incumbent.swap.left_pos_idx,
        incumbent.swap.right_group_idx,
        incumbent.swap.right_pos_idx,
    )
}

pub(crate) fn same_week_swap_is_better(
    candidate: &EvaluatedSameWeekSwapMove,
    incumbent: &EvaluatedSameWeekSwapMove,
) -> bool {
    (
        candidate.active_score_after,
        candidate.linear_repeat_excess_after,
        candidate.swap.week_idx,
        candidate.swap.left_group_idx,
        candidate.swap.left_pos_idx,
        candidate.swap.right_group_idx,
        candidate.swap.right_pos_idx,
    ) < (
        incumbent.active_score_after,
        incumbent.linear_repeat_excess_after,
        incumbent.swap.week_idx,
        incumbent.swap.left_group_idx,
        incumbent.swap.left_pos_idx,
        incumbent.swap.right_group_idx,
        incumbent.swap.right_pos_idx,
    )
}

fn score_delta_for_adjustments(
    state: &LocalSearchState,
    adjustments: &[PairCountAdjustment],
    model: Solver6PairRepeatPenaltyModel,
) -> Result<i64, SolverError> {
    let pair_state = state.pair_state();
    Ok(adjustments.iter().fold(0i64, |delta_total, adjustment| {
        delta_total
            + match model {
                Solver6PairRepeatPenaltyModel::LinearRepeatExcess => pair_state
                    .linear_score_delta_for_pair_change_known_valid(
                        adjustment.pair_idx,
                        adjustment.delta,
                    ),
                _ => pair_state.score_delta_for_pair_change_known_valid(
                    adjustment.pair_idx,
                    adjustment.delta,
                    model,
                ),
            }
    }))
}

#[cfg(test)]
mod tests {
    use super::{enumerate_same_week_swap_moves, evaluate_same_week_swap, find_best_same_week_swap};
    use crate::models::Solver6PairRepeatPenaltyModel;
    use crate::solver6::problem::PureSgpProblem;
    use crate::solver6::search::state::LocalSearchState;

    fn exact_2_2_3() -> Vec<Vec<Vec<usize>>> {
        vec![
            vec![vec![0, 1], vec![2, 3]],
            vec![vec![0, 2], vec![1, 3]],
            vec![vec![0, 3], vec![1, 2]],
        ]
    }

    fn worsened_2_2_3() -> Vec<Vec<Vec<usize>>> {
        vec![
            vec![vec![0, 2], vec![1, 3]],
            vec![vec![0, 2], vec![1, 3]],
            vec![vec![0, 3], vec![1, 2]],
        ]
    }

    fn problem_2_2_3() -> PureSgpProblem {
        PureSgpProblem {
            num_groups: 2,
            group_size: 2,
            num_weeks: 3,
        }
    }

    #[test]
    fn same_week_swap_enumeration_counts_all_cross_group_swaps() {
        let state = LocalSearchState::new(
            problem_2_2_3(),
            exact_2_2_3(),
            Solver6PairRepeatPenaltyModel::LinearRepeatExcess,
        )
        .unwrap();

        assert_eq!(enumerate_same_week_swap_moves(&state).len(), 12);
    }

    #[test]
    fn same_week_swap_delta_matches_full_recompute() {
        let mut state = LocalSearchState::new(
            problem_2_2_3(),
            exact_2_2_3(),
            Solver6PairRepeatPenaltyModel::LinearRepeatExcess,
        )
        .unwrap();

        let evaluated = evaluate_same_week_swap(
            &state,
            enumerate_same_week_swap_moves(&state)[2],
        )
        .unwrap();
        assert_eq!(evaluated.active_score_after, 2);
        assert_eq!(evaluated.linear_repeat_excess_after, 2);
        assert!(!evaluated.improves_current());

        state.apply_evaluated_swap(&evaluated).unwrap();
        state.assert_matches_recompute().unwrap();
        assert_eq!(state.current_active_score(), evaluated.active_score_after);
    }

    #[test]
    fn best_same_week_swap_can_find_an_improving_move() {
        let state = LocalSearchState::new(
            problem_2_2_3(),
            worsened_2_2_3(),
            Solver6PairRepeatPenaltyModel::LinearRepeatExcess,
        )
        .unwrap();

        let best = find_best_same_week_swap(&state)
            .unwrap()
            .expect("a legal swap should exist");
        assert!(best.improves_current());
        assert_eq!(best.active_score_after, 0);
    }
}
