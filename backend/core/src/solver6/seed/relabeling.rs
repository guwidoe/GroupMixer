use super::{
    validate_full_schedule_shape, ExactBlockSeed, ExactBlockSeedDiagnostics, SeedAtomId,
    SeedAtomUsage, SeedPairTelemetry, SeedRelabelingSummary,
};
use crate::models::{ApiInput, Solver6PairRepeatPenaltyModel, SolverParams};
use crate::solver5::atoms::{
    query_construction_atom_from_solver6_input, Solver5AtomSpanRequest, Solver5ConstructionAtom,
};
use crate::solver6::problem::PureSgpProblem;
use crate::solver6::score::{
    pure_sgp_linear_repeat_excess_lower_bound, PairFrequencyState,
};
use crate::solver_support::SolverError;
use rand::seq::SliceRandom;
use rand::SeedableRng;
use rand_chacha::ChaCha12Rng;

const RANDOM_RELABELING_BASELINE_SEED_SALT: u64 = 0x6f4d_6d21_4c2b_f973;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct RelabelingPairCountAdjustment {
    pair_idx: usize,
    delta: i8,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct RelabelingPairAdjustmentAccumulator {
    adjustments: Vec<RelabelingPairCountAdjustment>,
}

impl RelabelingPairAdjustmentAccumulator {
    fn with_capacity(capacity: usize) -> Self {
        Self {
            adjustments: Vec::with_capacity(capacity),
        }
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

        self.adjustments
            .push(RelabelingPairCountAdjustment { pair_idx, delta });
    }

    fn finish(self) -> Vec<RelabelingPairCountAdjustment> {
        self.adjustments
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct EvaluatedCopyPermutationSwap {
    left: usize,
    right: usize,
    pair_adjustments: Vec<RelabelingPairCountAdjustment>,
    active_score_after: u64,
    linear_repeat_lower_bound_gap_after: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct GreedyRelabelingState {
    plan: ExactBlockRelabelingPlan,
    pair_state: PairFrequencyState,
    linear_repeat_lower_bound: u64,
}

impl GreedyRelabelingState {
    fn from_plan(
        context: &ExactBlockCompositionContext,
        plan: ExactBlockRelabelingPlan,
    ) -> Result<Self, SolverError> {
        let seed = build_exact_block_seed_from_plan_with_context(context, &plan)?;
        let pair_state = PairFrequencyState::from_raw_schedule(context.num_people(), &seed.schedule)?;
        let linear_repeat_lower_bound = pure_sgp_linear_repeat_excess_lower_bound(
            context.problem.num_groups,
            context.problem.group_size,
            context.problem.num_weeks,
            pair_state.universe().total_distinct_pairs(),
            pair_state.total_pair_incidences(),
        );
        Ok(Self {
            plan,
            pair_state,
            linear_repeat_lower_bound,
        })
    }

    fn current_active_score(
        &self,
        active_penalty_model: Solver6PairRepeatPenaltyModel,
    ) -> u64 {
        self.pair_state.score_for_model(active_penalty_model)
    }

    fn current_linear_repeat_lower_bound_gap(&self) -> u64 {
        self.pair_state
            .linear_repeat_excess()
            .saturating_sub(self.linear_repeat_lower_bound)
    }

    fn apply_swap(
        &mut self,
        copy_index: usize,
        evaluated: &EvaluatedCopyPermutationSwap,
    ) -> Result<(), SolverError> {
        self.plan.copy_permutations[copy_index]
            .image_by_person
            .swap(evaluated.left, evaluated.right);
        for adjustment in &evaluated.pair_adjustments {
            self.pair_state
                .apply_pair_count_delta(adjustment.pair_idx, adjustment.delta)?;
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ExactBlockRelabelingBaseline {
    Identity,
    Random,
}

impl ExactBlockRelabelingBaseline {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::Identity => "identity",
            Self::Random => "random",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ExactBlockRelabelingSearch {
    GreedyIncremental,
}

impl ExactBlockRelabelingSearch {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::GreedyIncremental => "greedy_incremental",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SeedPermutation {
    image_by_person: Vec<usize>,
}

impl SeedPermutation {
    pub(crate) fn identity(num_people: usize) -> Self {
        Self {
            image_by_person: (0..num_people).collect(),
        }
    }

    pub(crate) fn from_image(image_by_person: Vec<usize>) -> Result<Self, SolverError> {
        if image_by_person.len() < 2 {
            return Err(SolverError::ValidationError(
                "solver6 seed permutation requires at least two people".into(),
            ));
        }

        let mut seen_targets = vec![false; image_by_person.len()];
        for (source, &target) in image_by_person.iter().enumerate() {
            if target >= image_by_person.len() {
                return Err(SolverError::ValidationError(format!(
                    "solver6 seed permutation maps person {source} out of bounds to {target}"
                )));
            }
            if seen_targets[target] {
                return Err(SolverError::ValidationError(format!(
                    "solver6 seed permutation is not bijective; target {target} appears more than once"
                )));
            }
            seen_targets[target] = true;
        }

        Ok(Self { image_by_person })
    }

    pub(crate) fn apply(&self, person_idx: usize) -> Result<usize, SolverError> {
        self.image_by_person.get(person_idx).copied().ok_or_else(|| {
            SolverError::ValidationError(format!(
                "solver6 seed permutation received out-of-bounds person index {person_idx}"
            ))
        })
    }

    pub(crate) fn len(&self) -> usize {
        self.image_by_person.len()
    }

    pub(crate) fn changed_people(&self) -> usize {
        self.image_by_person
            .iter()
            .enumerate()
            .filter(|(source, target)| *source != **target)
            .count()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ExactBlockRelabelingPlan {
    pub copy_permutations: Vec<SeedPermutation>,
}

impl ExactBlockRelabelingPlan {
    pub(crate) fn identity(copy_count: usize, num_people: usize) -> Self {
        Self {
            copy_permutations: (0..copy_count)
                .map(|_| SeedPermutation::identity(num_people))
                .collect(),
        }
    }
}

pub(crate) fn build_relabeling_baseline_plan(
    input: &ApiInput,
    baseline: ExactBlockRelabelingBaseline,
) -> Result<ExactBlockRelabelingPlan, SolverError> {
    let context = ExactBlockCompositionContext::for_input(input)?;
    Ok(match baseline {
        ExactBlockRelabelingBaseline::Identity => {
            ExactBlockRelabelingPlan::identity(context.full_copies, context.num_people())
        }
        ExactBlockRelabelingBaseline::Random => {
            build_random_relabeling_plan_from_context(&context, input.solver.seed.unwrap_or(42))
        }
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ExactBlockRelabelingObjective {
    pub copy_count: usize,
    pub atom_weeks: usize,
    pub active_penalty_model: Solver6PairRepeatPenaltyModel,
    pub pair_telemetry: SeedPairTelemetry,
}

impl ExactBlockRelabelingObjective {
    pub(crate) fn active_penalty_score(&self) -> u64 {
        self.pair_telemetry.active_penalty_score
    }

    pub(crate) fn linear_repeat_lower_bound_gap(&self) -> u64 {
        self.pair_telemetry.linear_repeat_lower_bound_gap
    }

    pub(crate) fn reaches_linear_lower_bound(&self) -> bool {
        self.linear_repeat_lower_bound_gap() == 0
    }
}

pub(crate) fn build_identity_exact_block_seed(
    input: &ApiInput,
) -> Result<ExactBlockSeed, SolverError> {
    let plan = build_relabeling_baseline_plan(input, ExactBlockRelabelingBaseline::Identity)?;
    build_exact_block_seed_from_plan(input, &plan)
}

pub(crate) fn build_random_exact_block_seed(
    input: &ApiInput,
) -> Result<ExactBlockSeed, SolverError> {
    let plan = build_relabeling_baseline_plan(input, ExactBlockRelabelingBaseline::Random)?;
    build_exact_block_seed_from_plan(input, &plan)
}

pub(crate) fn build_greedy_exact_block_seed(
    input: &ApiInput,
) -> Result<ExactBlockSeed, SolverError> {
    let plan = build_greedy_relabeling_plan(input)?;
    build_exact_block_seed_from_plan(input, &plan)
}

pub(crate) fn build_exact_block_seed_from_plan(
    input: &ApiInput,
    plan: &ExactBlockRelabelingPlan,
) -> Result<ExactBlockSeed, SolverError> {
    let context = ExactBlockCompositionContext::for_input(input)?;
    build_exact_block_seed_from_plan_with_context(&context, plan)
}

pub(crate) fn evaluate_exact_block_relabeling_objective(
    input: &ApiInput,
    plan: &ExactBlockRelabelingPlan,
) -> Result<ExactBlockRelabelingObjective, SolverError> {
    let context = ExactBlockCompositionContext::for_input(input)?;
    evaluate_exact_block_relabeling_objective_with_context(&context, plan)
}

pub(crate) fn evaluate_relabeling_baseline_objective(
    input: &ApiInput,
    baseline: ExactBlockRelabelingBaseline,
) -> Result<ExactBlockRelabelingObjective, SolverError> {
    let plan = build_relabeling_baseline_plan(input, baseline)?;
    evaluate_exact_block_relabeling_objective(input, &plan)
}

pub(crate) fn build_greedy_relabeling_plan(
    input: &ApiInput,
) -> Result<ExactBlockRelabelingPlan, SolverError> {
    let context = ExactBlockCompositionContext::for_input(input)?;
    let mut state = GreedyRelabelingState::from_plan(
        &context,
        ExactBlockRelabelingPlan::identity(context.full_copies, context.num_people()),
    )?;

    if greedy_relabeling_has_reached_known_optimum(&state, context.active_penalty_model) {
        return Ok(state.plan);
    }

    loop {
        let mut improved_any_copy = false;
        for copy_index in 1..context.full_copies {
            if greedily_improve_copy_permutation(&context, &mut state, copy_index)? {
                improved_any_copy = true;
                if greedy_relabeling_has_reached_known_optimum(&state, context.active_penalty_model)
                {
                    return Ok(state.plan);
                }
            }
        }

        if !improved_any_copy {
            break;
        }
    }

    Ok(state.plan)
}

fn greedy_relabeling_has_reached_known_optimum(
    state: &GreedyRelabelingState,
    active_penalty_model: Solver6PairRepeatPenaltyModel,
) -> bool {
    state.current_active_score(active_penalty_model) == 0
        || (active_penalty_model == Solver6PairRepeatPenaltyModel::LinearRepeatExcess
            && state.current_linear_repeat_lower_bound_gap() == 0)
}

pub(crate) fn evaluate_greedy_relabeling_objective(
    input: &ApiInput,
) -> Result<ExactBlockRelabelingObjective, SolverError> {
    let plan = build_greedy_relabeling_plan(input)?;
    evaluate_exact_block_relabeling_objective(input, &plan)
}

fn build_exact_block_seed_from_plan_with_context(
    context: &ExactBlockCompositionContext,
    plan: &ExactBlockRelabelingPlan,
) -> Result<ExactBlockSeed, SolverError> {
    context.validate_plan(plan)?;

    let atom_id = SeedAtomId::from_solver5_atom(&context.atom);
    let mut schedule = Vec::with_capacity(context.problem.num_weeks);
    let mut atom_uses = Vec::with_capacity(context.full_copies);

    for (copy_index, permutation) in plan.copy_permutations.iter().enumerate() {
        let week_range_start = schedule.len();
        schedule.extend(
            context
                .atom
                .schedule
                .iter()
                .map(|week| {
                    week.iter()
                        .map(|block| {
                            block.iter()
                                .map(|person_idx| permutation.apply(*person_idx))
                                .collect::<Result<Vec<_>, _>>()
                        })
                        .collect::<Result<Vec<_>, _>>()
                })
                .collect::<Result<Vec<_>, _>>()?,
        );

        let relabeling = if permutation.changed_people() == 0 {
            SeedRelabelingSummary::identity()
        } else {
            SeedRelabelingSummary::explicit_permutation(permutation.changed_people())
        };
        atom_uses.push(SeedAtomUsage::new(
            atom_id.clone(),
            copy_index,
            context.atom_weeks,
            week_range_start,
            week_range_start + context.atom_weeks,
            relabeling,
        ));
    }

    validate_full_schedule_shape(&context.problem, &schedule)?;
    let pair_telemetry = SeedPairTelemetry::from_schedule(
        &context.problem,
        &schedule,
        context.active_penalty_model,
    )?;

    Ok(ExactBlockSeed {
        schedule,
        diagnostics: ExactBlockSeedDiagnostics {
            total_weeks: context.problem.num_weeks,
            atom_uses,
            pair_telemetry: Some(pair_telemetry),
        },
    })
}

fn evaluate_exact_block_relabeling_objective_with_context(
    context: &ExactBlockCompositionContext,
    plan: &ExactBlockRelabelingPlan,
) -> Result<ExactBlockRelabelingObjective, SolverError> {
    let seed = build_exact_block_seed_from_plan_with_context(context, plan)?;
    let pair_telemetry = seed.diagnostics.pair_telemetry.clone().ok_or_else(|| {
        SolverError::ValidationError(
            "solver6 exact-block relabeling objective expected pair telemetry on composed seed"
                .into(),
        )
    })?;

    Ok(ExactBlockRelabelingObjective {
        copy_count: context.full_copies,
        atom_weeks: context.atom_weeks,
        active_penalty_model: context.active_penalty_model,
        pair_telemetry,
    })
}

fn greedily_improve_copy_permutation(
    context: &ExactBlockCompositionContext,
    state: &mut GreedyRelabelingState,
    copy_index: usize,
) -> Result<bool, SolverError> {
    let mut improved_any = false;
    loop {
        let Some(best_improvement) = find_best_copy_permutation_swap(context, state, copy_index)? else {
            return Ok(improved_any);
        };
        state.apply_swap(copy_index, &best_improvement)?;
        improved_any = true;
    }
}

fn find_best_copy_permutation_swap(
    context: &ExactBlockCompositionContext,
    state: &GreedyRelabelingState,
    copy_index: usize,
) -> Result<Option<EvaluatedCopyPermutationSwap>, SolverError> {
    let mut best: Option<EvaluatedCopyPermutationSwap> = None;
    for left in 0..context.num_people() {
        for right in (left + 1)..context.num_people() {
            let evaluated = evaluate_copy_permutation_swap(context, state, copy_index, left, right)?;
            if copy_permutation_swap_is_improving(state, context.active_penalty_model, &evaluated)
                && best.as_ref().is_none_or(|incumbent| {
                    copy_permutation_swap_is_better(&evaluated, incumbent)
                })
            {
                best = Some(evaluated);
            }
        }
    }
    Ok(best)
}

fn evaluate_copy_permutation_swap(
    context: &ExactBlockCompositionContext,
    state: &GreedyRelabelingState,
    copy_index: usize,
    left: usize,
    right: usize,
) -> Result<EvaluatedCopyPermutationSwap, SolverError> {
    let permutation = &state.plan.copy_permutations[copy_index];
    let left_target = permutation.apply(left)?;
    let right_target = permutation.apply(right)?;
    let universe = state.pair_state.universe();
    let mut aggregated_adjustments = RelabelingPairAdjustmentAccumulator::with_capacity(
        2 * context.atom_weeks * context.problem.group_size.saturating_sub(1),
    );

    for week_idx in 0..context.atom_weeks {
        let left_mates = &context.groupmates_by_person_by_week[left][week_idx];
        if left_mates.contains(&right) {
            continue;
        }
        let right_mates = &context.groupmates_by_person_by_week[right][week_idx];

        for &mate in left_mates {
            let mate_target = permutation.apply(mate)?;
            aggregated_adjustments.apply(universe.pair_index(left_target, mate_target)?, -1);
            aggregated_adjustments.apply(universe.pair_index(right_target, mate_target)?, 1);
        }
        for &mate in right_mates {
            let mate_target = permutation.apply(mate)?;
            aggregated_adjustments.apply(universe.pair_index(right_target, mate_target)?, -1);
            aggregated_adjustments.apply(universe.pair_index(left_target, mate_target)?, 1);
        }
    }

    let pair_adjustments = aggregated_adjustments.finish();
    let linear_delta = score_delta_for_adjustments(
        &state.pair_state,
        &pair_adjustments,
        Solver6PairRepeatPenaltyModel::LinearRepeatExcess,
    )?;
    let active_delta = match context.active_penalty_model {
        Solver6PairRepeatPenaltyModel::LinearRepeatExcess => linear_delta,
        active_model => score_delta_for_adjustments(&state.pair_state, &pair_adjustments, active_model)?,
    };
    let active_score_after =
        (state.current_active_score(context.active_penalty_model) as i64 + active_delta) as u64;
    let linear_repeat_excess_after =
        (state.pair_state.linear_repeat_excess() as i64 + linear_delta) as u64;

    Ok(EvaluatedCopyPermutationSwap {
        left,
        right,
        pair_adjustments,
        active_score_after,
        linear_repeat_lower_bound_gap_after: linear_repeat_excess_after
            .saturating_sub(state.linear_repeat_lower_bound),
    })
}

fn copy_permutation_swap_is_improving(
    state: &GreedyRelabelingState,
    active_penalty_model: Solver6PairRepeatPenaltyModel,
    candidate: &EvaluatedCopyPermutationSwap,
) -> bool {
    (
        candidate.active_score_after,
        candidate.linear_repeat_lower_bound_gap_after,
    ) < (
        state.current_active_score(active_penalty_model),
        state.current_linear_repeat_lower_bound_gap(),
    )
}

fn copy_permutation_swap_is_better(
    candidate: &EvaluatedCopyPermutationSwap,
    incumbent: &EvaluatedCopyPermutationSwap,
) -> bool {
    (
        candidate.active_score_after,
        candidate.linear_repeat_lower_bound_gap_after,
        candidate.left,
        candidate.right,
    ) < (
        incumbent.active_score_after,
        incumbent.linear_repeat_lower_bound_gap_after,
        incumbent.left,
        incumbent.right,
    )
}

fn score_delta_for_adjustments(
    pair_state: &PairFrequencyState,
    adjustments: &[RelabelingPairCountAdjustment],
    model: Solver6PairRepeatPenaltyModel,
) -> Result<i64, SolverError> {
    adjustments.iter().try_fold(0i64, |delta_sum, adjustment| {
        Ok(delta_sum
            + pair_state.score_delta_for_pair_change(adjustment.pair_idx, adjustment.delta, model)?)
    })
}

fn build_random_relabeling_plan_from_context(
    context: &ExactBlockCompositionContext,
    base_seed: u64,
) -> ExactBlockRelabelingPlan {
    let mut copy_permutations = Vec::with_capacity(context.full_copies);
    copy_permutations.push(SeedPermutation::identity(context.num_people()));

    let mut rng = ChaCha12Rng::seed_from_u64(derive_random_relabeling_seed(
        base_seed,
        context.full_copies,
        context.atom_weeks,
        context.num_people(),
    ));
    for _copy_index in 1..context.full_copies {
        let mut image_by_person: Vec<usize> = (0..context.num_people()).collect();
        image_by_person.shuffle(&mut rng);
        copy_permutations.push(
            SeedPermutation::from_image(image_by_person)
                .expect("shuffled permutation should remain bijective"),
        );
    }

    ExactBlockRelabelingPlan { copy_permutations }
}

fn derive_random_relabeling_seed(
    base_seed: u64,
    full_copies: usize,
    atom_weeks: usize,
    num_people: usize,
) -> u64 {
    base_seed
        ^ RANDOM_RELABELING_BASELINE_SEED_SALT
        ^ ((full_copies as u64) << 32)
        ^ ((atom_weeks as u64) << 16)
        ^ (num_people as u64)
}

struct ExactBlockCompositionContext {
    problem: PureSgpProblem,
    atom: Solver5ConstructionAtom,
    atom_weeks: usize,
    full_copies: usize,
    active_penalty_model: Solver6PairRepeatPenaltyModel,
    groupmates_by_person_by_week: Vec<Vec<Vec<usize>>>,
}

impl ExactBlockCompositionContext {
    fn for_input(input: &ApiInput) -> Result<Self, SolverError> {
        let problem = PureSgpProblem::from_input(input)?;
        let atom = query_construction_atom_from_solver6_input(
            input,
            Solver5AtomSpanRequest::BestAvailableFullSpan,
        )?;
        let atom_weeks = atom.returned_weeks();
        if atom_weeks == 0 {
            return Err(SolverError::ValidationError(
                "solver6 exact-block seed builder received an empty solver5 atom".into(),
            ));
        }
        if atom_weeks > problem.num_weeks {
            return Err(SolverError::ValidationError(format!(
                "solver6 identity exact-block seed builder expected a best available atom no longer than the requested horizon, but got {} weeks for requested {}",
                atom_weeks, problem.num_weeks
            )));
        }

        let full_copies = problem.num_weeks / atom_weeks;
        let remainder = problem.num_weeks % atom_weeks;
        if remainder != 0 {
            return Err(SolverError::ValidationError(format!(
                "solver6 identity exact-block seed builder currently supports only k * w0 tilings; requested {} weeks with best solver5 atom span {} leaves remainder {}",
                problem.num_weeks, atom_weeks, remainder
            )));
        }

        let active_penalty_model = match &input.solver.solver_params {
            SolverParams::Solver6(params) => params.pair_repeat_penalty_model,
            _ => {
                return Err(SolverError::ValidationError(
                    "solver6 identity exact-block seed builder expected solver6 params".into(),
                ));
            }
        };

        let groupmates_by_person_by_week = groupmates_by_person_by_week(&atom, problem.num_groups * problem.group_size)?;

        Ok(Self {
            problem,
            atom,
            atom_weeks,
            full_copies,
            active_penalty_model,
            groupmates_by_person_by_week,
        })
    }

    fn num_people(&self) -> usize {
        self.problem.num_groups * self.problem.group_size
    }

    fn validate_plan(&self, plan: &ExactBlockRelabelingPlan) -> Result<(), SolverError> {
        if plan.copy_permutations.len() != self.full_copies {
            return Err(SolverError::ValidationError(format!(
                "solver6 exact-block relabeling plan expected {} copy permutations, got {}",
                self.full_copies,
                plan.copy_permutations.len()
            )));
        }

        for (copy_index, permutation) in plan.copy_permutations.iter().enumerate() {
            if permutation.len() != self.num_people() {
                return Err(SolverError::ValidationError(format!(
                    "solver6 exact-block relabeling permutation {copy_index} has size {}, expected {}",
                    permutation.len(),
                    self.num_people()
                )));
            }
        }

        Ok(())
    }
}

fn groupmates_by_person_by_week(
    atom: &Solver5ConstructionAtom,
    num_people: usize,
) -> Result<Vec<Vec<Vec<usize>>>, SolverError> {
    let mut groupmates = vec![vec![Vec::new(); atom.schedule.len()]; num_people];

    for (week_idx, week) in atom.schedule.iter().enumerate() {
        for block in week {
            for &person in block {
                if person >= num_people {
                    return Err(SolverError::ValidationError(format!(
                        "solver6 exact-block relabeling atom contains out-of-bounds person {person} for {num_people} people"
                    )));
                }
                groupmates[person][week_idx] = block
                    .iter()
                    .copied()
                    .filter(|other| *other != person)
                    .collect();
            }
        }
    }

    Ok(groupmates)
}

#[cfg(test)]
mod tests {
    use super::{
        build_exact_block_seed_from_plan, build_random_exact_block_seed,
        build_greedy_exact_block_seed, build_greedy_relabeling_plan,
        build_relabeling_baseline_plan, evaluate_copy_permutation_swap,
        evaluate_exact_block_relabeling_objective,
        evaluate_exact_block_relabeling_objective_with_context,
        evaluate_greedy_relabeling_objective, evaluate_relabeling_baseline_objective,
        ExactBlockCompositionContext, ExactBlockRelabelingBaseline,
        ExactBlockRelabelingPlan, ExactBlockRelabelingSearch,
        GreedyRelabelingState, SeedPermutation,
    };
    use crate::models::{
        ApiInput, Constraint, Group, Objective, Person, ProblemDefinition,
        RepeatEncounterParams, Solver6PairRepeatPenaltyModel, Solver6Params,
        SolverConfiguration, SolverKind, SolverParams, StopConditions,
    };
    use std::collections::HashMap;

    fn solver6_config() -> SolverConfiguration {
        SolverConfiguration {
            solver_type: SolverKind::Solver6.canonical_id().into(),
            stop_conditions: StopConditions {
                max_iterations: Some(1_000_000),
                time_limit_seconds: Some(30),
                no_improvement_iterations: Some(100_000),
                stop_on_optimal_score: true,
            },
            solver_params: SolverParams::Solver6(Solver6Params {
                exact_construction_handoff_enabled: true,
                seed_strategy: Default::default(),
                pair_repeat_penalty_model: Solver6PairRepeatPenaltyModel::LinearRepeatExcess,
                search_strategy: Default::default(),
            }),
            logging: Default::default(),
            telemetry: Default::default(),
            seed: Some(7),
            move_policy: None,
            allowed_sessions: None,
        }
    }

    fn pure_input(groups: usize, group_size: usize, weeks: usize) -> ApiInput {
        ApiInput {
            problem: ProblemDefinition {
                people: (0..(groups * group_size))
                    .map(|idx| Person {
                        id: format!("p{idx}"),
                        attributes: HashMap::new(),
                        sessions: None,
                    })
                    .collect(),
                groups: (0..groups)
                    .map(|idx| Group {
                        id: format!("g{idx}"),
                        size: group_size as u32,
                        session_sizes: None,
                    })
                    .collect(),
                num_sessions: weeks as u32,
            },
            initial_schedule: None,
            construction_seed_schedule: None,
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".into(),
                weight: 1.0,
            }],
            constraints: vec![Constraint::RepeatEncounter(RepeatEncounterParams {
                max_allowed_encounters: 1,
                penalty_function: "squared".into(),
                penalty_weight: 100.0,
            })],
            solver: solver6_config(),
        }
    }

    fn shift_15_mod_31_fix_31() -> SeedPermutation {
        let mut image_by_person = Vec::with_capacity(32);
        for person_idx in 0..31 {
            image_by_person.push((person_idx + 15) % 31);
        }
        image_by_person.push(31);
        SeedPermutation::from_image(image_by_person).expect("affine permutation should be valid")
    }

    #[test]
    fn relabeling_objective_matches_identity_seed_baseline() {
        let input = pure_input(8, 4, 20);
        let identity_plan = ExactBlockRelabelingPlan {
            copy_permutations: vec![SeedPermutation::identity(32), SeedPermutation::identity(32)],
        };

        let objective = evaluate_exact_block_relabeling_objective(&input, &identity_plan)
            .expect("identity relabeling objective should evaluate");
        assert_eq!(objective.copy_count, 2);
        assert_eq!(objective.atom_weeks, 10);
        assert_eq!(objective.active_penalty_score(), 480);
        assert_eq!(objective.linear_repeat_lower_bound_gap(), 16);
        assert!(!objective.reaches_linear_lower_bound());
    }

    #[test]
    fn relabeling_objective_can_compare_candidate_without_local_search() {
        let input = pure_input(8, 4, 20);
        let identity = evaluate_exact_block_relabeling_objective(
            &input,
            &ExactBlockRelabelingPlan {
                copy_permutations: vec![
                    SeedPermutation::identity(32),
                    SeedPermutation::identity(32),
                ],
            },
        )
        .expect("identity objective should evaluate");
        let candidate = evaluate_exact_block_relabeling_objective(
            &input,
            &ExactBlockRelabelingPlan {
                copy_permutations: vec![SeedPermutation::identity(32), shift_15_mod_31_fix_31()],
            },
        )
        .expect("candidate objective should evaluate");

        assert_eq!(identity.active_penalty_score(), 480);
        assert_eq!(candidate.active_penalty_score(), 464);
        assert!(candidate.active_penalty_score() < identity.active_penalty_score());
        assert_eq!(candidate.linear_repeat_lower_bound_gap(), 0);
        assert!(candidate.reaches_linear_lower_bound());
    }

    #[test]
    fn identity_baseline_uses_same_objective_path_as_manual_identity_plan() {
        let input = pure_input(8, 4, 20);
        let baseline = evaluate_relabeling_baseline_objective(
            &input,
            ExactBlockRelabelingBaseline::Identity,
        )
        .expect("identity baseline should evaluate");
        let manual = evaluate_exact_block_relabeling_objective(
            &input,
            &ExactBlockRelabelingPlan {
                copy_permutations: vec![
                    SeedPermutation::identity(32),
                    SeedPermutation::identity(32),
                ],
            },
        )
        .expect("manual identity plan should evaluate");

        assert_eq!(baseline, manual);
    }

    #[test]
    fn random_baseline_plan_is_deterministic_for_fixed_seed() {
        let input = pure_input(8, 4, 20);
        let first = build_relabeling_baseline_plan(&input, ExactBlockRelabelingBaseline::Random)
            .expect("random baseline plan should build");
        let second = build_relabeling_baseline_plan(&input, ExactBlockRelabelingBaseline::Random)
            .expect("random baseline plan should be reproducible");

        assert_eq!(first, second);
        assert_eq!(first.copy_permutations[0], SeedPermutation::identity(32));
        assert_ne!(first.copy_permutations[1], SeedPermutation::identity(32));
    }

    #[test]
    fn random_baseline_changes_when_effective_seed_changes() {
        let first = build_relabeling_baseline_plan(
            &pure_input(8, 4, 20),
            ExactBlockRelabelingBaseline::Random,
        )
        .expect("first random baseline plan should build");
        let mut second_input = pure_input(8, 4, 20);
        second_input.solver.seed = Some(19);
        let second = build_relabeling_baseline_plan(
            &second_input,
            ExactBlockRelabelingBaseline::Random,
        )
        .expect("second random baseline plan should build");

        assert_ne!(first, second);
    }

    #[test]
    fn random_baseline_uses_same_objective_path_as_explicit_plan() {
        let input = pure_input(8, 4, 20);
        let plan = build_relabeling_baseline_plan(&input, ExactBlockRelabelingBaseline::Random)
            .expect("random baseline plan should build");
        let baseline = evaluate_relabeling_baseline_objective(
            &input,
            ExactBlockRelabelingBaseline::Random,
        )
        .expect("random baseline objective should evaluate");
        let manual = evaluate_exact_block_relabeling_objective(&input, &plan)
            .expect("manual random plan objective should evaluate");

        assert_eq!(baseline, manual);
    }

    #[test]
    fn explicit_relabeling_seed_marks_non_identity_copy_in_diagnostics() {
        let input = pure_input(8, 4, 20);
        let seed = build_exact_block_seed_from_plan(
            &input,
            &ExactBlockRelabelingPlan {
                copy_permutations: vec![SeedPermutation::identity(32), shift_15_mod_31_fix_31()],
            },
        )
        .expect("explicit relabeling plan should compose a valid seed");

        assert_eq!(seed.diagnostics.atom_uses[0].relabeling.kind.label(), "identity");
        assert_eq!(
            seed.diagnostics.atom_uses[1].relabeling.kind.label(),
            "explicit_permutation"
        );
        assert_eq!(seed.diagnostics.atom_uses[1].relabeling.changed_people, 31);
        assert_eq!(
            seed.diagnostics
                .pair_telemetry
                .as_ref()
                .expect("telemetry should be present")
                .linear_repeat_lower_bound_gap,
            0
        );
    }

    #[test]
    fn random_baseline_seed_records_non_identity_copy_diagnostics() {
        let seed = build_random_exact_block_seed(&pure_input(8, 4, 20))
            .expect("random baseline seed should build");

        assert_eq!(seed.diagnostics.atom_uses[0].relabeling.kind.label(), "identity");
        assert_eq!(seed.diagnostics.atom_uses[1].relabeling.kind.label(), "explicit_permutation");
        assert!(seed.diagnostics.atom_uses[1].relabeling.changed_people > 0);
    }

    #[test]
    fn greedy_relabeling_search_has_stable_label() {
        assert_eq!(
            ExactBlockRelabelingSearch::GreedyIncremental.label(),
            "greedy_incremental"
        );
    }

    #[test]
    fn greedy_relabeling_plan_is_deterministic_for_fixed_seed() {
        let input = pure_input(8, 4, 20);
        let first = build_greedy_relabeling_plan(&input)
            .expect("greedy relabeling plan should build");
        let second = build_greedy_relabeling_plan(&input)
            .expect("greedy relabeling plan should be reproducible");

        assert_eq!(first, second);
    }

    #[test]
    fn greedy_relabeling_beats_identity_on_8_4_20() {
        let input = pure_input(8, 4, 20);
        let identity = evaluate_relabeling_baseline_objective(
            &input,
            ExactBlockRelabelingBaseline::Identity,
        )
        .expect("identity baseline should evaluate");
        let greedy = evaluate_greedy_relabeling_objective(&input)
            .expect("greedy relabeling objective should evaluate");

        assert_eq!(identity.active_penalty_score(), 480);
        assert_eq!(greedy.active_penalty_score(), 464);
        assert!(greedy.active_penalty_score() < identity.active_penalty_score());
        assert_eq!(greedy.linear_repeat_lower_bound_gap(), 0);
        assert!(greedy.reaches_linear_lower_bound());
    }

    #[test]
    fn greedy_relabeling_seed_reaches_linear_lower_bound_on_8_4_20() {
        let seed = build_greedy_exact_block_seed(&pure_input(8, 4, 20))
            .expect("greedy relabeling seed should build");

        let telemetry = seed
            .diagnostics
            .pair_telemetry
            .as_ref()
            .expect("greedy relabeling seed should include telemetry");
        assert_eq!(telemetry.active_penalty_score, 464);
        assert_eq!(telemetry.linear_repeat_lower_bound_gap, 0);
        assert_eq!(telemetry.max_pair_frequency, 2);
    }

    #[test]
    fn incremental_copy_swap_evaluation_matches_full_recompute() {
        let input = pure_input(8, 4, 20);
        let context = ExactBlockCompositionContext::for_input(&input)
            .expect("exact-block context should build");
        let plan = ExactBlockRelabelingPlan::identity(context.full_copies, context.num_people());
        let state = GreedyRelabelingState::from_plan(&context, plan.clone())
            .expect("greedy relabeling state should build");

        let evaluated = evaluate_copy_permutation_swap(&context, &state, 1, 0, 1)
            .expect("incremental swap evaluation should succeed");

        let mut candidate_plan = plan;
        candidate_plan.copy_permutations[1].image_by_person.swap(0, 1);
        let recomputed = evaluate_exact_block_relabeling_objective_with_context(&context, &candidate_plan)
            .expect("full recompute objective should succeed");

        assert_eq!(evaluated.active_score_after, recomputed.active_penalty_score());
        assert_eq!(
            evaluated.linear_repeat_lower_bound_gap_after,
            recomputed.linear_repeat_lower_bound_gap()
        );
    }
}
