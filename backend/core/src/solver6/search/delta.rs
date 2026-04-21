use super::state::{LocalSearchState, PairCountAdjustment, SameWeekSwapApplication};
use crate::models::Solver6PairRepeatPenaltyModel;
use crate::solver_support::SolverError;
use std::collections::BTreeMap;

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
    pub triangular_repeat_excess_after: u64,
    pub squared_repeat_excess_after: u64,
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
    let mut moves = Vec::new();
    for (week_idx, week) in state.schedule().iter().enumerate() {
        for left_group_idx in 0..week.len() {
            for right_group_idx in (left_group_idx + 1)..week.len() {
                for left_pos_idx in 0..week[left_group_idx].len() {
                    for right_pos_idx in 0..week[right_group_idx].len() {
                        moves.push(SameWeekSwapMove {
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
    moves
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

    let universe = state.pair_state().universe();
    let mut aggregated_adjustments = BTreeMap::<usize, i8>::new();
    for (member_idx, &other) in left_group.iter().enumerate() {
        if member_idx == swap.left_pos_idx {
            continue;
        }
        *aggregated_adjustments
            .entry(universe.pair_index(left_person, other)?)
            .or_insert(0) -= 1;
        *aggregated_adjustments
            .entry(universe.pair_index(right_person, other)?)
            .or_insert(0) += 1;
    }
    for (member_idx, &other) in right_group.iter().enumerate() {
        if member_idx == swap.right_pos_idx {
            continue;
        }
        *aggregated_adjustments
            .entry(universe.pair_index(right_person, other)?)
            .or_insert(0) -= 1;
        *aggregated_adjustments
            .entry(universe.pair_index(left_person, other)?)
            .or_insert(0) += 1;
    }

    let pair_adjustments = aggregated_adjustments
        .into_iter()
        .filter(|(_, delta)| *delta != 0)
        .map(|(pair_idx, delta)| PairCountAdjustment { pair_idx, delta })
        .collect::<Vec<_>>();

    let (linear_delta, triangular_delta, squared_delta) = score_deltas_for_adjustments(state, &pair_adjustments)?;
    let active_delta = match state.active_penalty_model() {
        Solver6PairRepeatPenaltyModel::LinearRepeatExcess => linear_delta,
        Solver6PairRepeatPenaltyModel::TriangularRepeatExcess => triangular_delta,
        Solver6PairRepeatPenaltyModel::SquaredRepeatExcess => squared_delta,
    };
    let active_score_before = state.current_active_score();
    let active_score_after = (active_score_before as i64 + active_delta) as u64;

    Ok(EvaluatedSameWeekSwapMove {
        swap,
        pair_adjustments,
        active_score_before,
        active_score_after,
        linear_repeat_excess_after: (state.pair_state().linear_repeat_excess() as i64 + linear_delta)
            as u64,
        triangular_repeat_excess_after:
            (state.pair_state().triangular_repeat_excess() as i64 + triangular_delta) as u64,
        squared_repeat_excess_after:
            (state.pair_state().squared_repeat_excess() as i64 + squared_delta) as u64,
    })
}

pub(crate) fn find_best_same_week_swap(
    state: &LocalSearchState,
) -> Result<Option<EvaluatedSameWeekSwapMove>, SolverError> {
    let mut best: Option<EvaluatedSameWeekSwapMove> = None;
    for candidate in enumerate_same_week_swap_moves(state) {
        let evaluated = evaluate_same_week_swap(state, candidate)?;
        if best.as_ref().is_none_or(|incumbent| same_week_swap_is_better(&evaluated, incumbent)) {
            best = Some(evaluated);
        }
    }
    Ok(best)
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

fn score_deltas_for_adjustments(
    state: &LocalSearchState,
    adjustments: &[PairCountAdjustment],
) -> Result<(i64, i64, i64), SolverError> {
    let mut linear_delta = 0i64;
    let mut triangular_delta = 0i64;
    let mut squared_delta = 0i64;
    for adjustment in adjustments {
        linear_delta += state.pair_state().score_delta_for_pair_change(
            adjustment.pair_idx,
            adjustment.delta,
            Solver6PairRepeatPenaltyModel::LinearRepeatExcess,
        )?;
        triangular_delta += state.pair_state().score_delta_for_pair_change(
            adjustment.pair_idx,
            adjustment.delta,
            Solver6PairRepeatPenaltyModel::TriangularRepeatExcess,
        )?;
        squared_delta += state.pair_state().score_delta_for_pair_change(
            adjustment.pair_idx,
            adjustment.delta,
            Solver6PairRepeatPenaltyModel::SquaredRepeatExcess,
        )?;
    }
    Ok((linear_delta, triangular_delta, squared_delta))
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
