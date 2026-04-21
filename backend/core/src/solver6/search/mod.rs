pub(crate) mod delta;
pub(crate) mod state;
pub(crate) mod tabu;

use self::delta::{
    enumerate_same_week_swap_moves, evaluate_same_week_swap, same_week_swap_is_better,
    EvaluatedSameWeekSwapMove,
};
use self::state::LocalSearchState;
use self::tabu::{RepeatAwareTabuMemory, RepeatAwareTabuPolicy};
use crate::models::StopReason;
use crate::solver_support::SolverError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct RepeatAwareLocalSearchConfig {
    pub max_iterations: u64,
    pub no_improvement_limit: u64,
    pub tabu_policy: RepeatAwareTabuPolicy,
}

impl Default for RepeatAwareLocalSearchConfig {
    fn default() -> Self {
        Self {
            max_iterations: 250,
            no_improvement_limit: 50,
            tabu_policy: RepeatAwareTabuPolicy::default(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct RepeatAwareLocalSearchOutcome {
    pub best_schedule: Vec<Vec<Vec<usize>>>,
    pub best_active_score: u64,
    pub best_iteration: u64,
    pub iterations_completed: u64,
    pub improving_moves_accepted: u64,
    pub non_improving_moves_accepted: u64,
    pub stop_reason: StopReason,
}

pub(crate) fn run_repeat_aware_local_search(
    state: &mut LocalSearchState,
    config: RepeatAwareLocalSearchConfig,
) -> Result<RepeatAwareLocalSearchOutcome, SolverError> {
    let mut tabu_memory = RepeatAwareTabuMemory::new(config.tabu_policy);
    let mut improving_moves_accepted = 0u64;
    let mut non_improving_moves_accepted = 0u64;
    let mut no_improvement_streak = 0u64;

    let stop_reason = loop {
        if state.current_iteration() >= config.max_iterations {
            break StopReason::MaxIterationsReached;
        }
        if state.current_iteration() > 0 && no_improvement_streak >= config.no_improvement_limit {
            break StopReason::NoImprovementLimitReached;
        }

        let Some(selected_move) = select_best_admissible_same_week_swap(state, &tabu_memory)? else {
            break StopReason::NoImprovementLimitReached;
        };
        let improved_best = selected_move.active_score_after < state.best_active_score();
        let improved_current = selected_move.improves_current();

        state.apply_evaluated_swap(&selected_move)?;
        tabu_memory.record_swap(selected_move.swap, state.current_iteration());

        if improved_current {
            improving_moves_accepted += 1;
        } else {
            non_improving_moves_accepted += 1;
        }
        if improved_best {
            no_improvement_streak = 0;
        } else {
            no_improvement_streak += 1;
        }
    };

    Ok(RepeatAwareLocalSearchOutcome {
        best_schedule: state.best_schedule().to_vec(),
        best_active_score: state.best_active_score(),
        best_iteration: state.best().iteration,
        iterations_completed: state.current_iteration(),
        improving_moves_accepted,
        non_improving_moves_accepted,
        stop_reason,
    })
}

pub(crate) fn select_best_admissible_same_week_swap(
    state: &LocalSearchState,
    tabu_memory: &RepeatAwareTabuMemory,
) -> Result<Option<EvaluatedSameWeekSwapMove>, SolverError> {
    let mut best: Option<EvaluatedSameWeekSwapMove> = None;
    let evaluation_iteration = state.current_iteration() + 1;
    for candidate in enumerate_same_week_swap_moves(state) {
        let evaluated = evaluate_same_week_swap(state, candidate)?;
        if tabu_memory.is_tabu(candidate, evaluation_iteration)
            && evaluated.active_score_after >= state.best_active_score()
        {
            continue;
        }
        if best
            .as_ref()
            .is_none_or(|incumbent| same_week_swap_is_better(&evaluated, incumbent))
        {
            best = Some(evaluated);
        }
    }
    Ok(best)
}

#[cfg(test)]
mod tests {
    use super::{
        run_repeat_aware_local_search, select_best_admissible_same_week_swap,
        RepeatAwareLocalSearchConfig,
    };
    use crate::models::{Solver6PairRepeatPenaltyModel, StopReason};
    use crate::solver6::problem::PureSgpProblem;
    use crate::solver6::search::delta::find_best_same_week_swap;
    use crate::solver6::search::state::LocalSearchState;
    use crate::solver6::search::tabu::{RepeatAwareTabuMemory, RepeatAwareTabuPolicy};

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
    fn aspiration_allows_best_improving_move_even_when_tabu() {
        let state = LocalSearchState::new(
            problem_2_2_3(),
            worsened_2_2_3(),
            Solver6PairRepeatPenaltyModel::LinearRepeatExcess,
        )
        .unwrap();
        let improving = find_best_same_week_swap(&state)
            .unwrap()
            .expect("an improving move should exist");
        let mut tabu = RepeatAwareTabuMemory::new(RepeatAwareTabuPolicy {
            base_tenure: 5,
            deterministic_jitter_span: 0,
        });
        tabu.record_swap(improving.swap, 1);

        let selected = select_best_admissible_same_week_swap(&state, &tabu)
            .unwrap()
            .expect("aspiration should keep the best-improving move admissible");
        assert_eq!(selected.swap, improving.swap);
        assert_eq!(selected.active_score_after, 0);
    }

    #[test]
    fn repeat_aware_local_search_improves_a_worsened_seed() {
        let mut state = LocalSearchState::new(
            problem_2_2_3(),
            worsened_2_2_3(),
            Solver6PairRepeatPenaltyModel::LinearRepeatExcess,
        )
        .unwrap();

        let outcome = run_repeat_aware_local_search(
            &mut state,
            RepeatAwareLocalSearchConfig {
                max_iterations: 10,
                no_improvement_limit: 3,
                tabu_policy: RepeatAwareTabuPolicy {
                    base_tenure: 2,
                    deterministic_jitter_span: 0,
                },
            },
        )
        .unwrap();

        assert_eq!(outcome.best_active_score, 0);
        assert_eq!(outcome.best_iteration, 1);
        assert!(outcome.improving_moves_accepted >= 1);
        assert_eq!(outcome.stop_reason, StopReason::NoImprovementLimitReached);
        assert_eq!(state.best_active_score(), 0);
        state.assert_matches_recompute().unwrap();
    }
}
