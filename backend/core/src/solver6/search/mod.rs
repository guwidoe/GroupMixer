pub(crate) mod breakout;
pub(crate) mod delta;
pub(crate) mod state;
pub(crate) mod tabu;

use self::breakout::{BreakoutConfig, BreakoutRng};
use self::delta::{
    count_same_week_swap_moves, evaluate_same_week_swap, find_best_same_week_swap,
    same_week_swap_is_better, try_for_each_same_week_swap_move, EvaluatedSameWeekSwapMove,
};
use self::state::LocalSearchState;
use self::tabu::{RepeatAwareTabuMemory, RepeatAwareTabuPolicy};
use crate::models::{Solver6SearchStrategy, StopConditions, StopReason};
use crate::solver6::problem::PureSgpProblem;
use crate::solver6::score::{pure_sgp_linear_repeat_excess_lower_bound, PairFrequencyState};
use crate::solver_support::SolverError;
use std::time::Instant;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct RepeatAwareLocalSearchConfig {
    pub max_iterations: u64,
    pub no_improvement_limit: u64,
    pub time_limit_seconds: Option<u64>,
    pub tabu_policy: RepeatAwareTabuPolicy,
    pub breakout: BreakoutConfig,
}

impl Default for RepeatAwareLocalSearchConfig {
    fn default() -> Self {
        Self {
            max_iterations: 250,
            no_improvement_limit: 50,
            time_limit_seconds: None,
            tabu_policy: RepeatAwareTabuPolicy::default(),
            breakout: BreakoutConfig {
                stagnation_threshold: 12,
                swaps_per_breakout: 2,
                rng_seed: 42,
            },
        }
    }
}

impl RepeatAwareLocalSearchConfig {
    pub(crate) fn for_solver_configuration(
        stop_conditions: &StopConditions,
        problem: &PureSgpProblem,
        effective_seed: u64,
    ) -> Self {
        let max_iterations = stop_conditions.max_iterations.unwrap_or(5_000);
        let no_improvement_limit = stop_conditions
            .no_improvement_iterations
            .unwrap_or(max_iterations.min(500));
        let breakout_threshold = no_improvement_limit.clamp(2, 64) / 2;
        Self {
            max_iterations,
            no_improvement_limit,
            time_limit_seconds: stop_conditions.time_limit_seconds,
            tabu_policy: RepeatAwareTabuPolicy {
                base_tenure: problem.group_size.max(3) as u64,
                deterministic_jitter_span: problem.num_groups.min(3) as u64,
            },
            breakout: BreakoutConfig {
                stagnation_threshold: breakout_threshold.max(1),
                swaps_per_breakout: problem.group_size.min(3).max(1),
                rng_seed: effective_seed,
            },
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct DeterministicHillClimbConfig {
    pub max_iterations: u64,
    pub time_limit_seconds: Option<u64>,
}

impl DeterministicHillClimbConfig {
    pub(crate) fn for_solver_configuration(stop_conditions: &StopConditions) -> Self {
        Self {
            max_iterations: stop_conditions.max_iterations.unwrap_or(5_000),
            time_limit_seconds: stop_conditions.time_limit_seconds,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct RepeatAwareSearchTelemetry {
    pub initial_active_score: u64,
    pub final_active_score: u64,
    pub best_active_score: u64,
    pub initial_linear_repeat_excess: u64,
    pub final_linear_repeat_excess: u64,
    pub best_linear_repeat_excess: u64,
    pub initial_max_pair_frequency: usize,
    pub final_max_pair_frequency: usize,
    pub best_max_pair_frequency: usize,
    pub initial_multiplicity_histogram: Vec<usize>,
    pub final_multiplicity_histogram: Vec<usize>,
    pub best_multiplicity_histogram: Vec<usize>,
    pub improving_moves_accepted: u64,
    pub non_improving_moves_accepted: u64,
    pub breakout_count: u64,
    pub breakout_swaps_applied: u64,
    pub tabu_pruned_candidates: u64,
    pub max_stagnation_streak: u64,
    pub neighborhood_scans: u64,
    pub candidates_evaluated: u64,
    pub total_scan_micros: u64,
    pub max_scan_micros: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct RepeatAwareLocalSearchOutcome {
    pub best_schedule: Vec<Vec<Vec<usize>>>,
    pub best_pair_state: PairFrequencyState,
    pub best_active_score: u64,
    pub best_iteration: u64,
    pub iterations_completed: u64,
    pub stop_reason: StopReason,
    pub telemetry: RepeatAwareSearchTelemetry,
}

pub(crate) fn run_configured_local_search(
    state: &mut LocalSearchState,
    strategy: Solver6SearchStrategy,
    stop_conditions: &StopConditions,
    problem: &PureSgpProblem,
    effective_seed: u64,
) -> Result<RepeatAwareLocalSearchOutcome, SolverError> {
    match strategy {
        Solver6SearchStrategy::DeterministicBestImprovingHillClimb => {
            run_deterministic_hill_climb(
                state,
                DeterministicHillClimbConfig::for_solver_configuration(stop_conditions),
            )
        }
        Solver6SearchStrategy::ReservedRepeatAwareLocalSearch => run_repeat_aware_local_search(
            state,
            RepeatAwareLocalSearchConfig::for_solver_configuration(
                stop_conditions,
                problem,
                effective_seed,
            ),
        ),
    }
}

pub(crate) fn run_deterministic_hill_climb(
    state: &mut LocalSearchState,
    config: DeterministicHillClimbConfig,
) -> Result<RepeatAwareLocalSearchOutcome, SolverError> {
    let initial_active_score = state.current_active_score();
    let initial_linear_repeat_excess = state.pair_state().linear_repeat_excess();
    let initial_max_pair_frequency = state.pair_state().max_pair_frequency();
    let initial_multiplicity_histogram = state.pair_state().multiplicity_histogram().to_vec();

    if search_has_reached_known_optimum(state) {
        return Ok(build_outcome_from_state(
            state,
            StopReason::OptimalScoreReached,
            initial_active_score,
            initial_linear_repeat_excess,
            initial_max_pair_frequency,
            initial_multiplicity_histogram,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
        ));
    }

    let start = Instant::now();
    let mut improving_moves_accepted = 0u64;
    let mut neighborhood_scans = 0u64;
    let mut candidates_evaluated = 0u64;
    let mut total_scan_micros = 0u64;
    let mut max_scan_micros = 0u64;

    let stop_reason = loop {
        if state.current_iteration() >= config.max_iterations {
            break StopReason::MaxIterationsReached;
        }
        if config.time_limit_seconds.is_some_and(|seconds| start.elapsed().as_secs() >= seconds) {
            break StopReason::TimeLimitReached;
        }

        let scan_started = Instant::now();
        let scan_candidate_count = count_same_week_swap_moves(state) as u64;
        let best_move = find_best_same_week_swap(state)?;
        let scan_elapsed_micros = scan_started.elapsed().as_micros() as u64;
        neighborhood_scans += 1;
        candidates_evaluated += scan_candidate_count;
        total_scan_micros += scan_elapsed_micros;
        max_scan_micros = max_scan_micros.max(scan_elapsed_micros);

        let Some(best_move) = best_move else {
            break StopReason::NoImprovementLimitReached;
        };
        if !best_move.improves_current() {
            break StopReason::NoImprovementLimitReached;
        }

        state.apply_evaluated_swap(&best_move)?;
        improving_moves_accepted += 1;

        if search_has_reached_known_optimum(state) {
            break StopReason::OptimalScoreReached;
        }
    };

    Ok(build_outcome_from_state(
        state,
        stop_reason,
        initial_active_score,
        initial_linear_repeat_excess,
        initial_max_pair_frequency,
        initial_multiplicity_histogram,
        improving_moves_accepted,
        0,
        0,
        0,
        0,
        0,
        neighborhood_scans,
        candidates_evaluated,
        total_scan_micros,
        max_scan_micros,
    ))
}

pub(crate) fn run_repeat_aware_local_search(
    state: &mut LocalSearchState,
    config: RepeatAwareLocalSearchConfig,
) -> Result<RepeatAwareLocalSearchOutcome, SolverError> {
    let initial_active_score = state.current_active_score();
    let initial_linear_repeat_excess = state.pair_state().linear_repeat_excess();
    let initial_max_pair_frequency = state.pair_state().max_pair_frequency();
    let initial_multiplicity_histogram = state.pair_state().multiplicity_histogram().to_vec();

    if search_has_reached_known_optimum(state) {
        return Ok(build_outcome_from_state(
            state,
            StopReason::OptimalScoreReached,
            initial_active_score,
            initial_linear_repeat_excess,
            initial_max_pair_frequency,
            initial_multiplicity_histogram,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
        ));
    }

    let start = Instant::now();
    let mut tabu_memory = RepeatAwareTabuMemory::new(config.tabu_policy);
    let mut breakout_rng = BreakoutRng::from_seed(config.breakout.rng_seed);
    let mut improving_moves_accepted = 0u64;
    let mut non_improving_moves_accepted = 0u64;
    let mut breakout_count = 0u64;
    let mut breakout_swaps_applied = 0u64;
    let mut tabu_pruned_candidates = 0u64;
    let mut no_improvement_streak = 0u64;
    let mut max_stagnation_streak = 0u64;
    let mut neighborhood_scans = 0u64;
    let mut candidates_evaluated = 0u64;
    let mut total_scan_micros = 0u64;
    let mut max_scan_micros = 0u64;

    let stop_reason = loop {
        if state.current_iteration() >= config.max_iterations {
            break StopReason::MaxIterationsReached;
        }
        if config.time_limit_seconds.is_some_and(|seconds| start.elapsed().as_secs() >= seconds) {
            break StopReason::TimeLimitReached;
        }
        if state.current_iteration() > 0 && no_improvement_streak >= config.no_improvement_limit {
            break StopReason::NoImprovementLimitReached;
        }
        if no_improvement_streak >= config.breakout.stagnation_threshold {
            let breakout = breakout_rng.apply_breakout(
                state,
                &mut tabu_memory,
                config.breakout.swaps_per_breakout,
            )?;
            breakout_count += 1;
            breakout_swaps_applied += breakout.applied_swaps as u64;
            no_improvement_streak = 0;
            continue;
        }

        let selection = select_best_admissible_same_week_swap(state, &tabu_memory)?;
        tabu_pruned_candidates += selection.tabu_pruned_candidates;
        neighborhood_scans += 1;
        candidates_evaluated += selection.candidates_evaluated;
        total_scan_micros += selection.elapsed_micros;
        max_scan_micros = max_scan_micros.max(selection.elapsed_micros);
        let Some(selected_move) = selection.best_move else {
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
            max_stagnation_streak = max_stagnation_streak.max(no_improvement_streak);
        }

        if search_has_reached_known_optimum(state) {
            break StopReason::OptimalScoreReached;
        }
    };

    Ok(build_outcome_from_state(
        state,
        stop_reason,
        initial_active_score,
        initial_linear_repeat_excess,
        initial_max_pair_frequency,
        initial_multiplicity_histogram,
        improving_moves_accepted,
        non_improving_moves_accepted,
        breakout_count,
        breakout_swaps_applied,
        tabu_pruned_candidates,
        max_stagnation_streak,
        neighborhood_scans,
        candidates_evaluated,
        total_scan_micros,
        max_scan_micros,
    ))
}

fn build_outcome_from_state(
    state: &LocalSearchState,
    stop_reason: StopReason,
    initial_active_score: u64,
    initial_linear_repeat_excess: u64,
    initial_max_pair_frequency: usize,
    initial_multiplicity_histogram: Vec<usize>,
    improving_moves_accepted: u64,
    non_improving_moves_accepted: u64,
    breakout_count: u64,
    breakout_swaps_applied: u64,
    tabu_pruned_candidates: u64,
    max_stagnation_streak: u64,
    neighborhood_scans: u64,
    candidates_evaluated: u64,
    total_scan_micros: u64,
    max_scan_micros: u64,
) -> RepeatAwareLocalSearchOutcome {
    RepeatAwareLocalSearchOutcome {
        best_schedule: state.best_schedule().to_vec(),
        best_pair_state: state.best().pair_state.clone(),
        best_active_score: state.best_active_score(),
        best_iteration: state.best().iteration,
        iterations_completed: state.current_iteration(),
        stop_reason,
        telemetry: RepeatAwareSearchTelemetry {
            initial_active_score,
            final_active_score: state.current_active_score(),
            best_active_score: state.best_active_score(),
            initial_linear_repeat_excess,
            final_linear_repeat_excess: state.pair_state().linear_repeat_excess(),
            best_linear_repeat_excess: state.best().pair_state.linear_repeat_excess(),
            initial_max_pair_frequency,
            final_max_pair_frequency: state.pair_state().max_pair_frequency(),
            best_max_pair_frequency: state.best().pair_state.max_pair_frequency(),
            initial_multiplicity_histogram,
            final_multiplicity_histogram: state.pair_state().multiplicity_histogram().to_vec(),
            best_multiplicity_histogram: state.best().pair_state.multiplicity_histogram().to_vec(),
            improving_moves_accepted,
            non_improving_moves_accepted,
            breakout_count,
            breakout_swaps_applied,
            tabu_pruned_candidates,
            max_stagnation_streak,
            neighborhood_scans,
            candidates_evaluated,
            total_scan_micros,
            max_scan_micros,
        },
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct CandidateSelection {
    pub best_move: Option<EvaluatedSameWeekSwapMove>,
    pub tabu_pruned_candidates: u64,
    pub candidates_evaluated: u64,
    pub elapsed_micros: u64,
}

pub(crate) fn select_best_admissible_same_week_swap(
    state: &LocalSearchState,
    tabu_memory: &RepeatAwareTabuMemory,
) -> Result<CandidateSelection, SolverError> {
    let started = Instant::now();
    let mut best: Option<EvaluatedSameWeekSwapMove> = None;
    let mut tabu_pruned_candidates = 0u64;
    let mut candidates_evaluated = 0u64;
    let evaluation_iteration = state.current_iteration() + 1;
    try_for_each_same_week_swap_move(state, |candidate| {
        candidates_evaluated += 1;
        let evaluated = evaluate_same_week_swap(state, candidate)?;
        if tabu_memory.is_tabu(candidate, evaluation_iteration)
            && evaluated.active_score_after >= state.best_active_score()
        {
            tabu_pruned_candidates += 1;
            return Ok(());
        }
        if best
            .as_ref()
            .is_none_or(|incumbent| same_week_swap_is_better(&evaluated, incumbent))
        {
            best = Some(evaluated);
        }
        Ok(())
    })?;
    Ok(CandidateSelection {
        best_move: best,
        tabu_pruned_candidates,
        candidates_evaluated,
        elapsed_micros: started.elapsed().as_micros() as u64,
    })
}

fn search_has_reached_known_optimum(state: &LocalSearchState) -> bool {
    state.current_active_score() == 0
        || (state.active_penalty_model() == crate::models::Solver6PairRepeatPenaltyModel::LinearRepeatExcess
            && state.current_active_score()
                == pure_sgp_linear_repeat_excess_lower_bound(
                    state.problem().num_groups,
                    state.problem().group_size,
                    state.schedule().len(),
                    state.pair_state().universe().total_distinct_pairs(),
                    state.pair_state().total_pair_incidences(),
                ))
}

#[cfg(test)]
mod tests {
    use super::{
        breakout::BreakoutConfig, run_deterministic_hill_climb, run_repeat_aware_local_search,
        select_best_admissible_same_week_swap, DeterministicHillClimbConfig,
        RepeatAwareLocalSearchConfig,
    };
    use crate::models::{
        ApiInput, Constraint, Group, Objective, Person, ProblemDefinition,
        RepeatEncounterParams, Solver6PairRepeatPenaltyModel, Solver6Params,
        SolverConfiguration, SolverKind, SolverParams, StopConditions, StopReason,
    };
    use crate::solver6::problem::PureSgpProblem;
    use crate::solver6::seed::relabeling::build_greedy_exact_block_seed;
    use crate::solver6::search::delta::find_best_same_week_swap;
    use crate::solver6::search::state::LocalSearchState;
    use crate::solver6::search::tabu::{RepeatAwareTabuMemory, RepeatAwareTabuPolicy};
    use std::collections::HashMap;

    fn worsened_2_2_3() -> Vec<Vec<Vec<usize>>> {
        vec![
            vec![vec![0, 2], vec![1, 3]],
            vec![vec![0, 2], vec![1, 3]],
            vec![vec![0, 3], vec![1, 2]],
        ]
    }

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

    fn solver6_config() -> SolverConfiguration {
        SolverConfiguration {
            solver_type: SolverKind::Solver6.canonical_id().into(),
            stop_conditions: StopConditions {
                max_iterations: Some(10),
                time_limit_seconds: Some(30),
                no_improvement_iterations: Some(4),
                stop_on_optimal_score: true,
            },
            solver_params: SolverParams::Solver6(Solver6Params::default()),
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
            ;
        assert_eq!(selected.candidates_evaluated, 12);
        let selected = selected
            .best_move
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
                time_limit_seconds: None,
                tabu_policy: RepeatAwareTabuPolicy {
                    base_tenure: 2,
                    deterministic_jitter_span: 0,
                },
                breakout: BreakoutConfig {
                    stagnation_threshold: 10,
                    swaps_per_breakout: 1,
                    rng_seed: 17,
                },
            },
        )
        .unwrap();

        assert_eq!(outcome.best_active_score, 0);
        assert_eq!(outcome.best_iteration, 1);
        assert!(outcome.telemetry.improving_moves_accepted >= 1);
        assert_eq!(outcome.stop_reason, StopReason::OptimalScoreReached);
        assert_eq!(state.best_active_score(), 0);
        state.assert_matches_recompute().unwrap();
    }

    #[test]
    fn deterministic_hill_climb_improves_a_worsened_seed() {
        let mut state = LocalSearchState::new(
            problem_2_2_3(),
            worsened_2_2_3(),
            Solver6PairRepeatPenaltyModel::LinearRepeatExcess,
        )
        .unwrap();

        let outcome = run_deterministic_hill_climb(
            &mut state,
            DeterministicHillClimbConfig {
                max_iterations: 10,
                time_limit_seconds: None,
            },
        )
        .unwrap();

        assert_eq!(outcome.best_active_score, 0);
        assert_eq!(outcome.best_iteration, 1);
        assert_eq!(outcome.iterations_completed, 1);
        assert_eq!(outcome.telemetry.improving_moves_accepted, 1);
        assert_eq!(outcome.telemetry.breakout_count, 0);
        assert_eq!(outcome.telemetry.non_improving_moves_accepted, 0);
        assert_eq!(outcome.telemetry.neighborhood_scans, 1);
        assert_eq!(outcome.telemetry.candidates_evaluated, 12);
        assert_eq!(outcome.stop_reason, StopReason::OptimalScoreReached);
        assert_eq!(state.best_active_score(), 0);
        state.assert_matches_recompute().unwrap();
    }

    #[test]
    fn breakout_updates_telemetry_and_keeps_schedule_valid() {
        let input = pure_input(8, 4, 20);
        let problem = PureSgpProblem::from_input(&input).unwrap();
        let seed = build_greedy_exact_block_seed(&input).unwrap();
        let mut state = LocalSearchState::new(
            problem,
            seed.schedule,
            Solver6PairRepeatPenaltyModel::TriangularRepeatExcess,
        )
        .unwrap();

        let outcome = run_repeat_aware_local_search(
            &mut state,
            RepeatAwareLocalSearchConfig {
                max_iterations: 3,
                no_improvement_limit: 3,
                time_limit_seconds: None,
                tabu_policy: RepeatAwareTabuPolicy {
                    base_tenure: 2,
                    deterministic_jitter_span: 0,
                },
                breakout: BreakoutConfig {
                    stagnation_threshold: 1,
                    swaps_per_breakout: 1,
                    rng_seed: 23,
                },
            },
        )
        .unwrap();

        assert!(outcome.telemetry.breakout_count >= 1);
        assert!(outcome.telemetry.breakout_swaps_applied >= 1);
        assert_eq!(outcome.telemetry.initial_active_score, 464);
        state.assert_matches_recompute().unwrap();
    }
}
