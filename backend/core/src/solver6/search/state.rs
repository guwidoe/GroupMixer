use crate::models::Solver6PairRepeatPenaltyModel;
use crate::solver6::problem::PureSgpProblem;
use crate::solver6::score::PairFrequencyState;
use crate::solver6::seed::validate_full_schedule_shape;
use crate::solver_support::SolverError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct PairCountAdjustment {
    pub pair_idx: usize,
    pub delta: i8,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct SameWeekSwapApplication {
    pub week_idx: usize,
    pub left_group_idx: usize,
    pub left_pos_idx: usize,
    pub right_group_idx: usize,
    pub right_pos_idx: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BestSearchSnapshot {
    pub iteration: u64,
    pub schedule: Vec<Vec<Vec<usize>>>,
    pub pair_state: PairFrequencyState,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct LocalSearchState {
    problem: PureSgpProblem,
    schedule: Vec<Vec<Vec<usize>>>,
    pair_state: PairFrequencyState,
    active_penalty_model: Solver6PairRepeatPenaltyModel,
    current_iteration: u64,
    best: BestSearchSnapshot,
}

impl LocalSearchState {
    pub(crate) fn new(
        problem: PureSgpProblem,
        schedule: Vec<Vec<Vec<usize>>>,
        active_penalty_model: Solver6PairRepeatPenaltyModel,
    ) -> Result<Self, SolverError> {
        validate_full_schedule_shape(&problem, &schedule)?;
        let pair_state = PairFrequencyState::from_raw_schedule(problem.num_groups * problem.group_size, &schedule)?;
        let best = BestSearchSnapshot {
            iteration: 0,
            schedule: schedule.clone(),
            pair_state: pair_state.clone(),
        };
        Ok(Self {
            problem,
            schedule,
            pair_state,
            active_penalty_model,
            current_iteration: 0,
            best,
        })
    }

    pub(crate) fn problem(&self) -> &PureSgpProblem {
        &self.problem
    }

    pub(crate) fn schedule(&self) -> &[Vec<Vec<usize>>] {
        &self.schedule
    }

    pub(crate) fn pair_state(&self) -> &PairFrequencyState {
        &self.pair_state
    }

    pub(crate) fn active_penalty_model(&self) -> Solver6PairRepeatPenaltyModel {
        self.active_penalty_model
    }

    pub(crate) fn current_iteration(&self) -> u64 {
        self.current_iteration
    }

    pub(crate) fn current_active_score(&self) -> u64 {
        self.pair_state.score_for_model(self.active_penalty_model)
    }

    pub(crate) fn best(&self) -> &BestSearchSnapshot {
        &self.best
    }

    pub(crate) fn best_active_score(&self) -> u64 {
        self.best.pair_state.score_for_model(self.active_penalty_model)
    }

    pub(crate) fn best_schedule(&self) -> &[Vec<Vec<usize>>] {
        &self.best.schedule
    }

    pub(crate) fn apply_swap_with_adjustments(
        &mut self,
        swap: SameWeekSwapApplication,
        adjustments: &[PairCountAdjustment],
    ) -> Result<(), SolverError> {
        self.ensure_swap_is_in_bounds(swap)?;
        self.schedule[swap.week_idx][swap.left_group_idx].swap(swap.left_pos_idx, swap.left_pos_idx);
        self.schedule[swap.week_idx][swap.right_group_idx].swap(swap.right_pos_idx, swap.right_pos_idx);

        let left_person = self.schedule[swap.week_idx][swap.left_group_idx][swap.left_pos_idx];
        let right_person = self.schedule[swap.week_idx][swap.right_group_idx][swap.right_pos_idx];
        self.schedule[swap.week_idx][swap.left_group_idx][swap.left_pos_idx] = right_person;
        self.schedule[swap.week_idx][swap.right_group_idx][swap.right_pos_idx] = left_person;

        for adjustment in adjustments {
            self.pair_state
                .apply_pair_count_delta(adjustment.pair_idx, adjustment.delta)?;
        }

        self.current_iteration += 1;
        if self.current_active_score() < self.best_active_score() {
            self.best = BestSearchSnapshot {
                iteration: self.current_iteration,
                schedule: self.schedule.clone(),
                pair_state: self.pair_state.clone(),
            };
        }

        self.debug_assert_matches_recompute();
        Ok(())
    }

    pub(crate) fn assert_matches_recompute(&self) -> Result<(), SolverError> {
        validate_full_schedule_shape(&self.problem, &self.schedule)?;
        let recomputed = PairFrequencyState::from_raw_schedule(
            self.problem.num_groups * self.problem.group_size,
            &self.schedule,
        )?;
        if recomputed != self.pair_state {
            return Err(SolverError::ValidationError(format!(
                "solver6 local-search pair state drifted at iteration {}: delta_state={:?}, recomputed_state={:?}",
                self.current_iteration, self.pair_state, recomputed
            )));
        }
        Ok(())
    }

    fn ensure_swap_is_in_bounds(&self, swap: SameWeekSwapApplication) -> Result<(), SolverError> {
        let week = self.schedule.get(swap.week_idx).ok_or_else(|| {
            SolverError::ValidationError(format!(
                "solver6 local-search swap week {} out of bounds",
                swap.week_idx
            ))
        })?;
        let left_group = week.get(swap.left_group_idx).ok_or_else(|| {
            SolverError::ValidationError(format!(
                "solver6 local-search left group {} out of bounds in week {}",
                swap.left_group_idx, swap.week_idx
            ))
        })?;
        let right_group = week.get(swap.right_group_idx).ok_or_else(|| {
            SolverError::ValidationError(format!(
                "solver6 local-search right group {} out of bounds in week {}",
                swap.right_group_idx, swap.week_idx
            ))
        })?;
        if swap.left_group_idx == swap.right_group_idx {
            return Err(SolverError::ValidationError(
                "solver6 local-search same-week swap requires two distinct groups".into(),
            ));
        }
        if swap.left_pos_idx >= left_group.len() || swap.right_pos_idx >= right_group.len() {
            return Err(SolverError::ValidationError(
                "solver6 local-search swap position out of bounds".into(),
            ));
        }
        Ok(())
    }

    fn debug_assert_matches_recompute(&self) {
        #[cfg(debug_assertions)]
        self.assert_matches_recompute()
            .expect("solver6 local-search delta drifted from full recompute");
    }
}

#[cfg(test)]
mod tests {
    use super::{LocalSearchState, PairCountAdjustment, SameWeekSwapApplication};
    use crate::models::Solver6PairRepeatPenaltyModel;
    use crate::solver6::problem::PureSgpProblem;

    fn exact_2_2_3() -> Vec<Vec<Vec<usize>>> {
        vec![
            vec![vec![0, 1], vec![2, 3]],
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
    fn recompute_guardrail_matches_manual_delta_swap() {
        let mut state = LocalSearchState::new(
            problem_2_2_3(),
            exact_2_2_3(),
            Solver6PairRepeatPenaltyModel::LinearRepeatExcess,
        )
        .unwrap();
        let universe = state.pair_state().universe().clone();
        let adjustments = vec![
            PairCountAdjustment {
                pair_idx: universe.pair_index(0, 1).unwrap(),
                delta: -1,
            },
            PairCountAdjustment {
                pair_idx: universe.pair_index(2, 3).unwrap(),
                delta: -1,
            },
            PairCountAdjustment {
                pair_idx: universe.pair_index(0, 2).unwrap(),
                delta: 1,
            },
            PairCountAdjustment {
                pair_idx: universe.pair_index(1, 3).unwrap(),
                delta: 1,
            },
        ];

        state
            .apply_swap_with_adjustments(
                SameWeekSwapApplication {
                    week_idx: 0,
                    left_group_idx: 0,
                    left_pos_idx: 1,
                    right_group_idx: 1,
                    right_pos_idx: 0,
                },
                &adjustments,
            )
            .unwrap();

        state.assert_matches_recompute().unwrap();
        assert_eq!(state.current_active_score(), 2);
        assert_eq!(state.best_active_score(), 0);
        assert_eq!(state.current_iteration(), 1);
    }

    #[test]
    fn best_so_far_tracking_is_explicit() {
        let worsened = vec![
            vec![vec![0, 2], vec![1, 3]],
            vec![vec![0, 2], vec![1, 3]],
            vec![vec![0, 3], vec![1, 2]],
        ];
        let mut state = LocalSearchState::new(
            problem_2_2_3(),
            worsened,
            Solver6PairRepeatPenaltyModel::LinearRepeatExcess,
        )
        .unwrap();
        assert_eq!(state.best_active_score(), 2);

        let universe = state.pair_state().universe().clone();
        let adjustments = vec![
            PairCountAdjustment {
                pair_idx: universe.pair_index(0, 2).unwrap(),
                delta: -1,
            },
            PairCountAdjustment {
                pair_idx: universe.pair_index(1, 3).unwrap(),
                delta: -1,
            },
            PairCountAdjustment {
                pair_idx: universe.pair_index(0, 1).unwrap(),
                delta: 1,
            },
            PairCountAdjustment {
                pair_idx: universe.pair_index(2, 3).unwrap(),
                delta: 1,
            },
        ];

        state
            .apply_swap_with_adjustments(
                SameWeekSwapApplication {
                    week_idx: 0,
                    left_group_idx: 0,
                    left_pos_idx: 1,
                    right_group_idx: 1,
                    right_pos_idx: 0,
                },
                &adjustments,
            )
            .unwrap();

        assert_eq!(state.current_active_score(), 0);
        assert_eq!(state.best_active_score(), 0);
        assert_eq!(state.best().iteration, 1);
        assert_eq!(state.best_schedule(), &exact_2_2_3());
    }
}
