use crate::models::{
    Solver6PairRepeatPenaltyModel, Solver6Params, Solver6SeedStrategy, Solver6SearchStrategy,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct ReservedExecutionPlan {
    objective: &'static str,
    seed_strategy: &'static str,
    search_strategy: &'static str,
}

impl ReservedExecutionPlan {
    pub(super) fn from_params(params: &Solver6Params) -> Self {
        Self {
            objective: objective_label(params.pair_repeat_penalty_model),
            seed_strategy: seed_strategy_label(params.seed_strategy),
            search_strategy: search_strategy_label(params.search_strategy),
        }
    }

    pub(super) fn reserved_message(&self, groups: usize, group_size: usize, weeks: usize) -> String {
        format!(
            "solver6 accepted pure-SGP instance {groups}-{group_size}-{weeks}, but the seeded repeat-minimization pipeline is still scaffold-only after exact solver5 handoff. Reserved execution plan: objective={}, seed_strategy={}, search_strategy={}",
            self.objective, self.seed_strategy, self.search_strategy
        )
    }

    pub(super) fn reserved_message_after_seed(
        &self,
        groups: usize,
        group_size: usize,
        weeks: usize,
        seed_summary: &str,
    ) -> String {
        format!(
            "solver6 accepted pure-SGP instance {groups}-{group_size}-{weeks}, built a deterministic exact-block seed, but relabeling / repeat-aware local search are still reserved. Seed diagnostics: {seed_summary}. Reserved execution plan: objective={}, seed_strategy={}, search_strategy={}",
            self.objective, self.seed_strategy, self.search_strategy
        )
    }
}

fn objective_label(model: Solver6PairRepeatPenaltyModel) -> &'static str {
    match model {
        Solver6PairRepeatPenaltyModel::LinearRepeatExcess => "linear_repeat_excess",
        Solver6PairRepeatPenaltyModel::TriangularRepeatExcess => "triangular_repeat_excess",
        Solver6PairRepeatPenaltyModel::SquaredRepeatExcess => "squared_repeat_excess",
    }
}

fn seed_strategy_label(strategy: Solver6SeedStrategy) -> &'static str {
    match strategy {
        Solver6SeedStrategy::Solver5ExactThenReservedHybrid => {
            "solver5_exact_then_reserved_hybrid"
        }
        Solver6SeedStrategy::Solver5ExactBlockComposition => "solver5_exact_block_composition",
    }
}

fn search_strategy_label(strategy: Solver6SearchStrategy) -> &'static str {
    match strategy {
        Solver6SearchStrategy::ReservedRepeatAwareLocalSearch => {
            "reserved_repeat_aware_local_search"
        }
    }
}
