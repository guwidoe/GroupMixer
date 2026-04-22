use super::relabeling::{
    build_exact_block_seed_from_plan, build_exact_block_seed_prefix_from_plan,
    build_greedy_exact_block_seed, build_greedy_relabeling_plan,
    build_greedy_relabeling_plan_from_initial_plan, ExactBlockRelabelingPlan, SeedPermutation,
};
use super::{
    validate_full_schedule_shape, ExactBlockSeed, ExactBlockSeedDiagnostics, SeedAtomId,
    SeedAtomUsage, SeedPairTelemetry, SeedRelabelingSummary,
};
use crate::models::{ApiInput, Solver6PairRepeatPenaltyModel, SolverParams};
use crate::solver5::atoms::{
    query_construction_atom_from_solver6_input, Solver5AtomSpanRequest, Solver5ConstructionAtom,
};
use crate::solver6::problem::PureSgpProblem;
use crate::solver6::score::PairFrequencyState;
use crate::solver_support::SolverError;
use rand::seq::SliceRandom;
use rand::SeedableRng;
use rand_chacha::ChaCha12Rng;

const HEURISTIC_TAIL_SEED_SALT: u64 = 0x1c91_49f0_52b4_aa77;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum MixedSeedFamily {
    ExactBlockOnly,
    DominantPrefixTail,
    RequestedTailAtom,
    HeuristicTail,
}

impl MixedSeedFamily {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::ExactBlockOnly => "exact_block_only",
            Self::DominantPrefixTail => "dominant_prefix_tail",
            Self::RequestedTailAtom => "requested_tail_atom",
            Self::HeuristicTail => "heuristic_tail",
        }
    }

    fn tie_break_rank(self) -> usize {
        match self {
            Self::RequestedTailAtom => 0,
            Self::DominantPrefixTail => 1,
            Self::HeuristicTail => 2,
            Self::ExactBlockOnly => 3,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct MixedSeedCandidateSummary {
    pub family: MixedSeedFamily,
    pub active_penalty_score: u64,
    pub linear_repeat_excess: u64,
    pub linear_repeat_lower_bound_gap: u64,
    pub squared_repeat_excess: u64,
    pub max_pair_frequency: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct MixedSeedSelection {
    pub selected_family: MixedSeedFamily,
    pub dominant_atom_weeks: usize,
    pub remainder_weeks: usize,
    pub candidates: Vec<MixedSeedCandidateSummary>,
    pub seed: ExactBlockSeed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct PrefixSeedContext {
    seed: ExactBlockSeed,
    plan: ExactBlockRelabelingPlan,
}

pub(crate) fn build_preferred_mixed_seed(
    input: &ApiInput,
) -> Result<MixedSeedSelection, SolverError> {
    let problem = PureSgpProblem::from_input(input)?;
    let dominant_atom = query_construction_atom_from_solver6_input(
        input,
        Solver5AtomSpanRequest::BestAvailableFullSpan,
    )?;
    let dominant_atom_weeks = dominant_atom.returned_weeks();
    if dominant_atom_weeks == 0 {
        return Err(SolverError::ValidationError(
            "solver6 mixed seed selection received an empty dominant atom".into(),
        ));
    }

    let remainder_weeks = problem.num_weeks % dominant_atom_weeks;
    let candidate_seeds = if remainder_weeks == 0 {
        vec![(
            MixedSeedFamily::ExactBlockOnly,
            build_greedy_exact_block_seed(input)?,
        )]
    } else {
        let prefix = build_prefix_seed(
            input,
            problem.num_weeks / dominant_atom_weeks,
            dominant_atom_weeks,
        )?;
        let mut candidates = Vec::new();
        candidates.push((
            MixedSeedFamily::DominantPrefixTail,
            build_dominant_prefix_tail_seed(input, dominant_atom_weeks, &prefix)?,
        ));
        if let Ok(seed) = build_requested_tail_seed(input, dominant_atom_weeks, prefix.seed.clone())
        {
            candidates.push((MixedSeedFamily::RequestedTailAtom, seed));
        }
        candidates.push((
            MixedSeedFamily::HeuristicTail,
            build_heuristic_tail_seed(input, dominant_atom_weeks, prefix.seed)?,
        ));
        candidates
    };

    let mut candidate_summaries = Vec::with_capacity(candidate_seeds.len());
    let mut selected_idx = None;
    for (idx, (family, seed)) in candidate_seeds.iter().enumerate() {
        let telemetry = seed.diagnostics.pair_telemetry.as_ref().ok_or_else(|| {
            SolverError::ValidationError(
                "solver6 mixed seed selection expected pair telemetry for every candidate".into(),
            )
        })?;
        candidate_summaries.push(MixedSeedCandidateSummary {
            family: *family,
            active_penalty_score: telemetry.active_penalty_score,
            linear_repeat_excess: telemetry.linear_repeat_excess,
            linear_repeat_lower_bound_gap: telemetry.linear_repeat_lower_bound_gap,
            squared_repeat_excess: telemetry.squared_repeat_excess,
            max_pair_frequency: telemetry.max_pair_frequency,
        });

        match selected_idx {
            None => selected_idx = Some(idx),
            Some(current_best_idx)
                if candidate_outranks(
                    *family,
                    telemetry,
                    candidate_seeds[current_best_idx].0,
                    candidate_seeds[current_best_idx]
                        .1
                        .diagnostics
                        .pair_telemetry
                        .as_ref()
                        .expect("candidate telemetry should be present"),
                ) =>
            {
                selected_idx = Some(idx)
            }
            Some(_) => {}
        }
    }

    let selected_idx =
        selected_idx.expect("mixed seed selection should have at least one candidate");
    let (selected_family, seed) = candidate_seeds.into_iter().nth(selected_idx).unwrap();

    Ok(MixedSeedSelection {
        selected_family,
        dominant_atom_weeks,
        remainder_weeks,
        candidates: candidate_summaries,
        seed,
    })
}

fn candidate_outranks(
    left_family: MixedSeedFamily,
    left: &SeedPairTelemetry,
    right_family: MixedSeedFamily,
    right: &SeedPairTelemetry,
) -> bool {
    (
        left.active_penalty_score,
        left.linear_repeat_excess,
        left.squared_repeat_excess,
        left.max_pair_frequency,
        left_family.tie_break_rank(),
    ) < (
        right.active_penalty_score,
        right.linear_repeat_excess,
        right.squared_repeat_excess,
        right.max_pair_frequency,
        right_family.tie_break_rank(),
    )
}

fn build_dominant_prefix_tail_seed(
    input: &ApiInput,
    dominant_atom_weeks: usize,
    prefix: &PrefixSeedContext,
) -> Result<ExactBlockSeed, SolverError> {
    let problem = PureSgpProblem::from_input(input)?;
    let full_copy_weeks = ((problem.num_weeks / dominant_atom_weeks) + 1) * dominant_atom_weeks;
    let full_copy_input = clone_input_with_num_weeks(input, full_copy_weeks)?;
    let mut initial_plan = prefix.plan.clone();
    initial_plan
        .copy_permutations
        .push(SeedPermutation::identity(
            problem.num_groups * problem.group_size,
        ));
    let plan = build_greedy_relabeling_plan_from_initial_plan(&full_copy_input, &initial_plan)?;
    build_exact_block_seed_prefix_from_plan(&full_copy_input, &plan, problem.num_weeks)
}

fn build_requested_tail_seed(
    input: &ApiInput,
    dominant_atom_weeks: usize,
    prefix_seed: ExactBlockSeed,
) -> Result<ExactBlockSeed, SolverError> {
    let problem = PureSgpProblem::from_input(input)?;
    let remainder_weeks = problem.num_weeks % dominant_atom_weeks;
    if remainder_weeks == 0 {
        return build_greedy_exact_block_seed(input);
    }

    let tail_input = clone_input_with_num_weeks(input, remainder_weeks)?;
    let tail_atom = query_construction_atom_from_solver6_input(
        &tail_input,
        Solver5AtomSpanRequest::ClosestSupportingSpan,
    )?;
    if tail_atom.returned_weeks() != remainder_weeks {
        return Err(SolverError::ValidationError(format!(
            "solver6 requested tail atom returned {} weeks, expected {}",
            tail_atom.returned_weeks(),
            remainder_weeks
        )));
    }
    compose_seed_with_solver5_tail(input, prefix_seed, tail_atom)
}

fn build_heuristic_tail_seed(
    input: &ApiInput,
    dominant_atom_weeks: usize,
    prefix_seed: ExactBlockSeed,
) -> Result<ExactBlockSeed, SolverError> {
    let problem = PureSgpProblem::from_input(input)?;
    let remainder_weeks = problem.num_weeks % dominant_atom_weeks;
    if remainder_weeks == 0 {
        return build_greedy_exact_block_seed(input);
    }

    let active_penalty_model = active_penalty_model(input)?;
    let num_people = problem.num_groups * problem.group_size;
    let mut schedule = prefix_seed.schedule.clone();
    let mut pair_state = PairFrequencyState::from_raw_schedule(num_people, &schedule)?;
    let mut rng = ChaCha12Rng::seed_from_u64(
        input.solver.seed.unwrap_or(42)
            ^ HEURISTIC_TAIL_SEED_SALT
            ^ ((problem.num_weeks as u64) << 32)
            ^ (dominant_atom_weeks as u64),
    );

    for _ in 0..remainder_weeks {
        let week =
            build_heuristic_tail_week(&problem, &pair_state, active_penalty_model, &mut rng)?;
        apply_week_to_pair_state(&mut pair_state, &week)?;
        schedule.push(week);
    }

    validate_full_schedule_shape(&problem, &schedule)?;
    let mut atom_uses = prefix_seed.diagnostics.atom_uses.clone();
    let week_range_start = problem.num_weeks - remainder_weeks;
    atom_uses.push(SeedAtomUsage::new(
        SeedAtomId::heuristic_tail("greedy_pair_frequency_tail", remainder_weeks),
        atom_uses.len(),
        remainder_weeks,
        week_range_start,
        problem.num_weeks,
        SeedRelabelingSummary::identity(),
    ));
    let pair_telemetry = SeedPairTelemetry::from_pair_state(
        &problem,
        &pair_state,
        schedule.len(),
        active_penalty_model,
    );

    Ok(ExactBlockSeed {
        schedule,
        diagnostics: ExactBlockSeedDiagnostics {
            total_weeks: problem.num_weeks,
            atom_uses,
            pair_telemetry: Some(pair_telemetry),
        },
    })
}

fn build_prefix_seed(
    input: &ApiInput,
    full_copies: usize,
    dominant_atom_weeks: usize,
) -> Result<PrefixSeedContext, SolverError> {
    let problem = PureSgpProblem::from_input(input)?;
    if full_copies == 0 {
        let active_penalty_model = active_penalty_model(input)?;
        return Ok(PrefixSeedContext {
            seed: ExactBlockSeed {
                schedule: Vec::new(),
                diagnostics: ExactBlockSeedDiagnostics {
                    total_weeks: 0,
                    atom_uses: Vec::new(),
                    pair_telemetry: Some(SeedPairTelemetry::from_schedule(
                        &problem,
                        &[],
                        active_penalty_model,
                    )?),
                },
            },
            plan: ExactBlockRelabelingPlan::identity(0, problem.num_groups * problem.group_size),
        });
    }

    let prefix_input = clone_input_with_num_weeks(input, full_copies * dominant_atom_weeks)?;
    let plan = build_greedy_relabeling_plan(&prefix_input)?;
    let seed = build_exact_block_seed_from_plan(&prefix_input, &plan)?;
    Ok(PrefixSeedContext { seed, plan })
}

fn compose_seed_with_solver5_tail(
    input: &ApiInput,
    prefix_seed: ExactBlockSeed,
    tail_atom: Solver5ConstructionAtom,
) -> Result<ExactBlockSeed, SolverError> {
    let problem = PureSgpProblem::from_input(input)?;
    let active_penalty_model = active_penalty_model(input)?;
    let num_people = problem.num_groups * problem.group_size;
    let mut schedule = prefix_seed.schedule.clone();
    let mut pair_state = PairFrequencyState::from_raw_schedule(num_people, &schedule)?;
    let week_range_start = schedule.len();
    for week in tail_atom.schedule.iter().cloned() {
        apply_week_to_pair_state(&mut pair_state, &week)?;
        schedule.push(week);
    }

    let mut atom_uses = prefix_seed.diagnostics.atom_uses.clone();
    atom_uses.push(SeedAtomUsage::new(
        SeedAtomId::from_solver5_atom(&tail_atom),
        atom_uses.len(),
        tail_atom.returned_weeks(),
        week_range_start,
        week_range_start + tail_atom.returned_weeks(),
        SeedRelabelingSummary::identity(),
    ));

    validate_full_schedule_shape(&problem, &schedule)?;
    let pair_telemetry = SeedPairTelemetry::from_pair_state(
        &problem,
        &pair_state,
        schedule.len(),
        active_penalty_model,
    );

    Ok(ExactBlockSeed {
        schedule,
        diagnostics: ExactBlockSeedDiagnostics {
            total_weeks: problem.num_weeks,
            atom_uses,
            pair_telemetry: Some(pair_telemetry),
        },
    })
}

fn build_heuristic_tail_week(
    problem: &PureSgpProblem,
    pair_state: &PairFrequencyState,
    active_penalty_model: Solver6PairRepeatPenaltyModel,
    rng: &mut ChaCha12Rng,
) -> Result<Vec<Vec<usize>>, SolverError> {
    let mut remaining: Vec<usize> = (0..(problem.num_groups * problem.group_size)).collect();
    remaining.shuffle(rng);

    let mut week = Vec::with_capacity(problem.num_groups);
    for _group_idx in 0..problem.num_groups {
        let seed_person = remaining.remove(0);
        let mut block = vec![seed_person];
        while block.len() < problem.group_size {
            let best_idx = remaining
                .iter()
                .enumerate()
                .min_by_key(|(candidate_idx, candidate)| {
                    let (active_delta, linear_delta, existing_pair_sum) = candidate_addition_cost(
                        pair_state,
                        &block,
                        **candidate,
                        active_penalty_model,
                    )
                    .expect("heuristic tail candidate scoring should stay in bounds");
                    (
                        active_delta,
                        linear_delta,
                        existing_pair_sum,
                        *candidate_idx,
                    )
                })
                .map(|(idx, _)| idx)
                .ok_or_else(|| {
                    SolverError::ValidationError(
                        "solver6 heuristic tail builder ran out of remaining people mid-block"
                            .into(),
                    )
                })?;
            block.push(remaining.remove(best_idx));
        }
        week.push(block);
    }

    Ok(week)
}

fn candidate_addition_cost(
    pair_state: &PairFrequencyState,
    block: &[usize],
    candidate: usize,
    active_penalty_model: Solver6PairRepeatPenaltyModel,
) -> Result<(i64, i64, u64), SolverError> {
    let universe = pair_state.universe();
    let mut active_delta = 0i64;
    let mut linear_delta = 0i64;
    let mut existing_pair_sum = 0u64;
    for &member in block {
        let pair_idx = universe.pair_index(member, candidate)?;
        active_delta +=
            pair_state.score_delta_for_pair_change(pair_idx, 1, active_penalty_model)?;
        linear_delta += pair_state.score_delta_for_pair_change(
            pair_idx,
            1,
            Solver6PairRepeatPenaltyModel::LinearRepeatExcess,
        )?;
        existing_pair_sum += u64::from(pair_state.pair_count_by_index(pair_idx)?);
    }
    Ok((active_delta, linear_delta, existing_pair_sum))
}

fn apply_week_to_pair_state(
    pair_state: &mut PairFrequencyState,
    week: &[Vec<usize>],
) -> Result<(), SolverError> {
    let universe = pair_state.universe().clone();
    for block in week {
        for left_idx in 0..block.len() {
            for right_idx in (left_idx + 1)..block.len() {
                let pair_idx = universe.pair_index(block[left_idx], block[right_idx])?;
                pair_state.apply_pair_count_delta(pair_idx, 1)?;
            }
        }
    }
    Ok(())
}

fn clone_input_with_num_weeks(input: &ApiInput, num_weeks: usize) -> Result<ApiInput, SolverError> {
    let num_sessions = u32::try_from(num_weeks).map_err(|_| {
        SolverError::ValidationError(format!(
            "solver6 mixed seed builder could not fit {num_weeks} sessions into u32"
        ))
    })?;
    let mut cloned = input.clone();
    cloned.problem.num_sessions = num_sessions;
    Ok(cloned)
}

fn active_penalty_model(input: &ApiInput) -> Result<Solver6PairRepeatPenaltyModel, SolverError> {
    match &input.solver.solver_params {
        SolverParams::Solver6(params) => Ok(params.pair_repeat_penalty_model),
        _ => Err(SolverError::ValidationError(
            "solver6 mixed seed builder expected solver6 params".into(),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        build_dominant_prefix_tail_seed, build_heuristic_tail_seed, build_preferred_mixed_seed,
        build_prefix_seed, build_requested_tail_seed, MixedSeedFamily,
    };
    use crate::models::{
        ApiInput, Constraint, Group, Objective, Person, ProblemDefinition, RepeatEncounterParams,
        Solver6PairRepeatPenaltyModel, Solver6Params, SolverConfiguration, SolverKind,
        SolverParams, StopConditions,
    };
    use std::collections::HashMap;

    fn solver6_config() -> SolverConfiguration {
        SolverConfiguration {
            solver_type: SolverKind::Solver6.canonical_id().into(),
            stop_conditions: StopConditions {
                max_iterations: Some(200),
                time_limit_seconds: Some(10),
                no_improvement_iterations: Some(40),
                stop_on_optimal_score: true,
            },
            solver_params: SolverParams::Solver6(Solver6Params {
                exact_construction_handoff_enabled: false,
                seed_strategy: Default::default(),
                pair_repeat_penalty_model: Solver6PairRepeatPenaltyModel::LinearRepeatExcess,
                search_strategy: Default::default(),
                seed_catalog: None,
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

    #[test]
    fn requested_tail_seed_attaches_smaller_solver5_tail_when_available() {
        let input = pure_input(8, 3, 21);
        let prefix = build_prefix_seed(&input, 1, 11).expect("prefix seed should build");
        let seed = build_requested_tail_seed(&input, 11, prefix.seed)
            .expect("8-3-21 should support an exact requested tail atom");

        assert_eq!(seed.schedule.len(), 21);
        assert_eq!(seed.diagnostics.atom_uses.len(), 2);
        assert_eq!(seed.diagnostics.atom_uses[0].weeks_used, 11);
        assert_eq!(seed.diagnostics.atom_uses[1].weeks_used, 10);
        assert_eq!(
            seed.diagnostics.atom_uses[1].atom_id.max_supported_weeks,
            10
        );
    }

    #[test]
    fn heuristic_tail_seed_builds_valid_non_multiple_schedule() {
        let input = pure_input(8, 3, 21);
        let prefix = build_prefix_seed(&input, 1, 11).expect("prefix seed should build");
        let seed = build_heuristic_tail_seed(&input, 11, prefix.seed)
            .expect("heuristic tail seed should build for 8-3-21");

        assert_eq!(seed.schedule.len(), 21);
        assert_eq!(seed.diagnostics.atom_uses.len(), 2);
        assert_eq!(seed.diagnostics.atom_uses[1].weeks_used, 10);
        assert_eq!(
            seed.diagnostics.atom_uses[1].atom_id.source_kind,
            super::super::SeedSourceKind::HeuristicTail
        );
        assert!(
            seed.diagnostics
                .pair_telemetry
                .as_ref()
                .expect("heuristic tail seed should expose pair telemetry")
                .active_penalty_score
                > 0
        );
    }

    #[test]
    fn mixed_seed_selection_compares_tail_families_and_picks_best_score() {
        let selection = build_preferred_mixed_seed(&pure_input(8, 3, 21))
            .expect("mixed seed selection should build for 8-3-21");

        assert_eq!(selection.dominant_atom_weeks, 11);
        assert_eq!(selection.remainder_weeks, 10);
        assert!(selection
            .candidates
            .iter()
            .any(|candidate| candidate.family == MixedSeedFamily::DominantPrefixTail));
        assert!(selection
            .candidates
            .iter()
            .any(|candidate| candidate.family == MixedSeedFamily::RequestedTailAtom));
        assert!(selection
            .candidates
            .iter()
            .any(|candidate| candidate.family == MixedSeedFamily::HeuristicTail));

        let best_score = selection
            .candidates
            .iter()
            .map(|candidate| candidate.active_penalty_score)
            .min()
            .expect("candidate list should not be empty");
        let selected = selection
            .candidates
            .iter()
            .find(|candidate| candidate.family == selection.selected_family)
            .expect("selected family should appear in candidate list");
        assert_eq!(selected.active_penalty_score, best_score);
    }

    #[test]
    fn dominant_prefix_tail_seed_is_truncated_to_requested_horizon() {
        let input = pure_input(8, 3, 21);
        let prefix = build_prefix_seed(&input, 1, 11).expect("prefix seed should build");
        let seed = build_dominant_prefix_tail_seed(&input, 11, &prefix)
            .expect("dominant prefix tail seed should build");

        assert_eq!(seed.schedule.len(), 21);
        assert_eq!(seed.diagnostics.total_weeks, 21);
        assert_eq!(seed.diagnostics.atom_uses.len(), 2);
        assert_eq!(seed.diagnostics.atom_uses[1].weeks_used, 10);
    }
}
