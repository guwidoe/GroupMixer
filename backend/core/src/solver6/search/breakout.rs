use super::delta::{count_same_week_swap_moves, evaluate_same_week_swap, nth_same_week_swap_move};
use super::state::LocalSearchState;
use super::tabu::RepeatAwareTabuMemory;
use crate::solver_support::SolverError;
use rand::RngExt;
use rand::SeedableRng;
use rand_chacha::ChaCha12Rng;

pub(crate) const BREAKOUT_RNG_SEED_SALT: u64 = 0x6d10_2b51_9f83_a4c7;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct BreakoutConfig {
    pub stagnation_threshold: u64,
    pub swaps_per_breakout: usize,
    pub rng_seed: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BreakoutOutcome {
    pub applied_swaps: usize,
}

pub(crate) struct BreakoutRng {
    rng: ChaCha12Rng,
}

impl BreakoutRng {
    pub(crate) fn from_seed(seed: u64) -> Self {
        Self {
            rng: ChaCha12Rng::seed_from_u64(seed ^ BREAKOUT_RNG_SEED_SALT),
        }
    }

    pub(crate) fn apply_breakout(
        &mut self,
        state: &mut LocalSearchState,
        tabu_memory: &mut RepeatAwareTabuMemory,
        swaps_per_breakout: usize,
    ) -> Result<BreakoutOutcome, SolverError> {
        let mut applied_swaps = 0usize;
        for _ in 0..swaps_per_breakout {
            let candidate_count = count_same_week_swap_moves(state);
            if candidate_count == 0 {
                break;
            }
            let choice_idx = self.rng.random_range(0..candidate_count);
            let candidate = nth_same_week_swap_move(state, choice_idx).ok_or_else(|| {
                SolverError::ValidationError(format!(
                    "solver6 breakout selected move index {choice_idx} out of bounds for {candidate_count} candidates"
                ))
            })?;
            let evaluated = evaluate_same_week_swap(state, candidate)?;
            state.apply_evaluated_swap(&evaluated)?;
            tabu_memory.record_swap(evaluated.swap, state.current_iteration());
            applied_swaps += 1;
        }
        Ok(BreakoutOutcome { applied_swaps })
    }
}

#[cfg(test)]
mod tests {
    use super::{BreakoutRng, BREAKOUT_RNG_SEED_SALT};
    use crate::models::Solver6PairRepeatPenaltyModel;
    use crate::solver6::problem::PureSgpProblem;
    use crate::solver6::search::state::LocalSearchState;
    use crate::solver6::search::tabu::{RepeatAwareTabuMemory, RepeatAwareTabuPolicy};

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
    fn breakout_keeps_schedule_valid_and_is_deterministic() {
        let mut first_state = LocalSearchState::new(
            problem_2_2_3(),
            exact_2_2_3(),
            Solver6PairRepeatPenaltyModel::LinearRepeatExcess,
        )
        .unwrap();
        let mut second_state = first_state.clone();
        let mut first_tabu = RepeatAwareTabuMemory::new(RepeatAwareTabuPolicy::default());
        let mut second_tabu = RepeatAwareTabuMemory::new(RepeatAwareTabuPolicy::default());
        let mut first_rng = BreakoutRng::from_seed(17);
        let mut second_rng = BreakoutRng::from_seed(17);

        let first = first_rng
            .apply_breakout(&mut first_state, &mut first_tabu, 3)
            .unwrap();
        let second = second_rng
            .apply_breakout(&mut second_state, &mut second_tabu, 3)
            .unwrap();

        assert_eq!(first.applied_swaps, 3);
        assert_eq!(first, second);
        assert_eq!(first_state.schedule(), second_state.schedule());
        first_state.assert_matches_recompute().unwrap();
        second_state.assert_matches_recompute().unwrap();
        assert_ne!(BREAKOUT_RNG_SEED_SALT, 0);
    }
}
