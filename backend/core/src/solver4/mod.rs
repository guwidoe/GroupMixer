use crate::models::{
    ApiInput, ApiSchedule, Constraint, MoveFamilyBenchmarkTelemetrySummary, MovePolicy, Objective,
    RepeatEncounterParams, SgpWeekPairTabuBenchmarkTelemetry, Solver4Mode, Solver4PaperTrace,
    Solver4PaperTracePoint, SolverBenchmarkTelemetry, SolverConfiguration, SolverKind,
    SolverResult, StopReason,
};
use crate::solver3::{OracleSnapshot, RuntimeState};
use crate::solver_support::SolverError;
use rand::{prelude::IndexedRandom, RngExt, SeedableRng};
use rand_chacha::ChaCha12Rng;
use std::collections::{HashMap, VecDeque};
use std::time::Instant;

mod backtracking;
mod construction;
mod evaluation;
mod local_search;
mod problem;
mod result;

use backtracking::*;
use construction::*;
use evaluation::*;
use local_search::*;
use problem::*;
use result::*;

#[cfg(test)]
mod tests;

pub const SOLVER4_NOTES: &str =
    "Dedicated pure-SGP solver family implementing the complete Triska/Musliu paper: Section 5 complete backtracking with pattern-driven minimal-freedom set selection, plus Sections 6 and 7 randomized greedy initialization and conflict-position local search. Solver4 strictly accepts only pure zero-repeat Social-Golfer-style scenarios.";

const DEFAULT_SOLVER4_SEED: u64 = 42;
const PAPER_PAIR_REPEAT_PENALTY: i64 = 1_000_000;
const TABU_TENURE_ITERATIONS: u64 = 12;
const RANDOM_BREAKOUT_AFTER_NO_IMPROVEMENT: u64 = 4;
const RANDOM_BREAKOUT_SWAP_COUNT: usize = 2;

#[derive(Clone)]
pub struct SearchEngine {
    configuration: SolverConfiguration,
}

impl SearchEngine {
    pub fn new(configuration: &SolverConfiguration) -> Self {
        Self {
            configuration: configuration.clone(),
        }
    }

    pub fn solve(&self, input: &ApiInput) -> Result<SolverResult, SolverError> {
        let problem = PureSgpProblem::from_input(input)?;
        let params = match &self.configuration.solver_params {
            crate::models::SolverParams::Solver4(params) => params.clone(),
            _ => {
                return Err(SolverError::ValidationError(
                    "solver4 expected solver4 params after solver selection validation".into(),
                ))
            }
        };
        if !(0.0..=1.0).contains(&params.gamma) {
            return Err(SolverError::ValidationError(
                "solver4 gamma must be within [0.0, 1.0]".into(),
            ));
        }
        if params.diagnostics.trace_every_n_iterations == 0 {
            return Err(SolverError::ValidationError(
                "solver4 trace_every_n_iterations must be >= 1".into(),
            ));
        }

        let effective_seed = self.configuration.seed.unwrap_or(DEFAULT_SOLVER4_SEED);
        let mut rng = ChaCha12Rng::seed_from_u64(effective_seed);

        match params.mode {
            Solver4Mode::GreedyLocalSearch => {
                self.solve_greedy_local_search(input, &problem, &params, effective_seed, &mut rng)
            }
            Solver4Mode::CompleteBacktracking => {
                self.solve_complete_backtracking(input, &problem, &params, effective_seed)
            }
        }
    }

    fn solve_complete_backtracking(
        &self,
        input: &ApiInput,
        problem: &PureSgpProblem,
        params: &crate::models::Solver4Params,
        effective_seed: u64,
    ) -> Result<SolverResult, SolverError> {
        let pattern = BacktrackingPattern::resolve(
            problem.group_size,
            params.backtracking_pattern.as_deref(),
        )?;
        let started_at = Instant::now();
        let all_people: Vec<usize> = (0..problem.num_people).collect();
        let state = PaperConstructionState::empty(problem);
        let mut stats = CompleteBacktrackingStats::default();
        let stop_conditions = &self.configuration.stop_conditions;

        let solved = search_complete_backtracking(
            problem,
            &pattern,
            0,
            0,
            0,
            &all_people,
            state,
            stop_conditions,
            started_at,
            &mut stats,
        );

        let Some(solution) = solved else {
            let reason = stats
                .stop_reason
                .map(stop_reason_name)
                .unwrap_or("backtracking_exhausted_without_solution");
            return Err(SolverError::ValidationError(format!(
                "solver4 Section 5 complete backtracking did not find a conflict-free schedule: {reason}"
            )));
        };

        let total_seconds = started_at.elapsed().as_secs_f64();
        let paper_trace = params
            .diagnostics
            .capture_paper_trace
            .then(|| Solver4PaperTrace {
                mode: Some(Solver4Mode::CompleteBacktracking),
                backtracking_pattern: Some(pattern.to_string()),
                initial_schedule: None,
                initial_conflict_positions: Some(0),
                initial_conflict_positions_by_week: vec![0; problem.num_weeks],
                grasp_candidates: vec![],
                continuation_candidate_index: None,
                continuation_gamma: None,
                points: vec![Solver4PaperTracePoint {
                    iteration: stats.nodes_visited,
                    elapsed_seconds: total_seconds,
                    current_conflict_positions: 0,
                    best_conflict_positions: 0,
                    conflict_positions_by_week: vec![0; problem.num_weeks],
                }],
            });
        let telemetry = SolverBenchmarkTelemetry {
            effective_seed,
            move_policy: self
                .configuration
                .move_policy
                .clone()
                .unwrap_or_else(MovePolicy::default),
            stop_reason: StopReason::OptimalScoreReached,
            iterations_completed: stats.nodes_visited,
            no_improvement_count: 0,
            max_no_improvement_streak: 0,
            reheats_performed: 0,
            accepted_uphill_moves: 0,
            accepted_downhill_moves: 0,
            accepted_neutral_moves: 0,
            restart_count: None,
            perturbation_count: Some(0),
            initial_score: 0.0,
            best_score: 0.0,
            final_score: 0.0,
            initialization_seconds: total_seconds,
            search_seconds: 0.0,
            finalization_seconds: 0.0,
            total_seconds,
            iterations_per_second: if total_seconds > 0.0 {
                stats.nodes_visited as f64 / total_seconds
            } else {
                0.0
            },
            best_score_timeline: vec![],
            repeat_guided_swaps: Default::default(),
            sgp_week_pair_tabu: None,
            memetic: None,
            donor_session_transplant: None,
            session_aligned_path_relinking: None,
            multi_root_balanced_session_inheritance: None,
            solver4_paper_trace: paper_trace,
            auto: None,
            moves: MoveFamilyBenchmarkTelemetrySummary::default(),
        };

        build_solver_result(
            input,
            problem,
            &solution.schedule,
            0,
            effective_seed,
            StopReason::OptimalScoreReached,
            Some(telemetry),
        )
    }

    fn solve_greedy_local_search(
        &self,
        input: &ApiInput,
        problem: &PureSgpProblem,
        params: &crate::models::Solver4Params,
        effective_seed: u64,
        rng: &mut ChaCha12Rng,
    ) -> Result<SolverResult, SolverError> {
        let stop_conditions = &self.configuration.stop_conditions;
        let total_started_at = Instant::now();
        let initialization_started_at = Instant::now();

        let mut schedule = build_greedy_initial_schedule(problem, params.gamma, rng);
        let initialization_seconds = initialization_started_at.elapsed().as_secs_f64();
        let mut current = EvaluatedSchedule::from_schedule(problem, schedule.clone());
        let initial = current.clone();
        let mut best = current.clone();
        let mut best_schedule = schedule.clone();
        let mut no_improvement_count = 0u64;
        let mut iterations = 0u64;
        let mut max_no_improvement_streak = 0u64;
        let mut breakout_count = 0u64;
        let mut tabu = WeekTabuLists::new(problem.num_weeks);
        let mut tabu_telemetry = SgpWeekPairTabuBenchmarkTelemetry::default();
        let mut best_score_timeline = vec![crate::models::BestScoreTimelinePoint {
            iteration: 0,
            elapsed_seconds: initialization_seconds,
            best_score: initial.paper_objective(),
        }];
        let mut paper_trace = params
            .diagnostics
            .capture_paper_trace
            .then(|| Solver4PaperTrace {
                mode: Some(Solver4Mode::GreedyLocalSearch),
                backtracking_pattern: None,
                initial_schedule: params
                    .diagnostics
                    .include_initial_schedule_in_trace
                    .then(|| to_api_schedule(problem, &schedule)),
                initial_conflict_positions: Some(initial.conflict_positions as u64),
                initial_conflict_positions_by_week: initial.conflict_positions_by_week.clone(),
                grasp_candidates: vec![],
                continuation_candidate_index: None,
                continuation_gamma: None,
                points: vec![Solver4PaperTracePoint {
                    iteration: 0,
                    elapsed_seconds: initialization_seconds,
                    current_conflict_positions: initial.conflict_positions as u64,
                    best_conflict_positions: initial.conflict_positions as u64,
                    conflict_positions_by_week: initial.conflict_positions_by_week.clone(),
                }],
            });

        if stop_conditions.should_stop_for_optimal_score(current.paper_objective()) {
            let search_seconds = total_started_at.elapsed().as_secs_f64() - initialization_seconds;
            let telemetry = build_local_search_telemetry(
                &self.configuration,
                effective_seed,
                StopReason::OptimalScoreReached,
                iterations,
                no_improvement_count,
                max_no_improvement_streak,
                breakout_count,
                initial.paper_objective(),
                best.paper_objective(),
                current.paper_objective(),
                initialization_seconds,
                search_seconds,
                0.0,
                &best_score_timeline,
                Some(tabu_telemetry),
                paper_trace,
            );
            return build_solver_result(
                input,
                problem,
                &best_schedule,
                no_improvement_count,
                effective_seed,
                StopReason::OptimalScoreReached,
                Some(telemetry),
            );
        }

        let search_started_at = Instant::now();
        let stop_reason = loop {
            if let Some(limit) = stop_conditions.max_iterations {
                if iterations >= limit {
                    break StopReason::MaxIterationsReached;
                }
            }
            if let Some(limit) = stop_conditions.time_limit_seconds {
                if total_started_at.elapsed().as_secs() >= limit {
                    break StopReason::TimeLimitReached;
                }
            }
            if let Some(limit) = stop_conditions.no_improvement_iterations {
                if no_improvement_count >= limit {
                    break StopReason::NoImprovementLimitReached;
                }
            }
            if current.conflict_positions == 0 {
                break StopReason::OptimalScoreReached;
            }

            let breakout_applied = should_apply_random_breakout(no_improvement_count);
            let next_schedule = if breakout_applied {
                breakout_count += 1;
                apply_random_breakout(
                    problem,
                    &schedule,
                    &current,
                    rng,
                    &mut tabu,
                    iterations,
                    &mut tabu_telemetry,
                )
            } else {
                let selection = select_best_swap(
                    problem,
                    &schedule,
                    &current,
                    &best,
                    &mut tabu,
                    iterations,
                    &mut tabu_telemetry,
                    no_improvement_count,
                );
                selection
                    .map(|candidate| {
                        tabu.record_iteration(
                            iterations,
                            &[(
                                candidate.week,
                                unordered_pair(candidate.left_person, candidate.right_person),
                            )],
                            &mut tabu_telemetry,
                        );
                        candidate.schedule
                    })
                    .unwrap_or_else(|| schedule.clone())
            };

            let previous_conflict_positions = current.conflict_positions;
            schedule = next_schedule;
            current = EvaluatedSchedule::from_schedule(problem, schedule.clone());
            iterations += 1;

            let improved_current = current.conflict_positions < previous_conflict_positions;
            let improved_best = current.conflict_positions < best.conflict_positions;
            if improved_best {
                best = current.clone();
                best_schedule = schedule.clone();
                best_score_timeline.push(crate::models::BestScoreTimelinePoint {
                    iteration: iterations,
                    elapsed_seconds: total_started_at.elapsed().as_secs_f64(),
                    best_score: best.paper_objective(),
                });
            }
            no_improvement_count =
                next_no_improvement_count(no_improvement_count, improved_best, breakout_applied);
            max_no_improvement_streak = max_no_improvement_streak.max(no_improvement_count);

            if let Some(trace) = paper_trace.as_mut() {
                if improved_best || iterations % params.diagnostics.trace_every_n_iterations == 0 {
                    trace.points.push(Solver4PaperTracePoint {
                        iteration: iterations,
                        elapsed_seconds: total_started_at.elapsed().as_secs_f64(),
                        current_conflict_positions: current.conflict_positions as u64,
                        best_conflict_positions: best.conflict_positions as u64,
                        conflict_positions_by_week: current.conflict_positions_by_week.clone(),
                    });
                }
            }

            if stop_conditions.should_stop_for_optimal_score(best.paper_objective()) {
                break StopReason::OptimalScoreReached;
            }
        };

        if let Some(trace) = paper_trace.as_mut() {
            let needs_final_point = trace
                .points
                .last()
                .is_none_or(|point| point.iteration != iterations);
            if needs_final_point {
                trace.points.push(Solver4PaperTracePoint {
                    iteration: iterations,
                    elapsed_seconds: total_started_at.elapsed().as_secs_f64(),
                    current_conflict_positions: current.conflict_positions as u64,
                    best_conflict_positions: best.conflict_positions as u64,
                    conflict_positions_by_week: current.conflict_positions_by_week.clone(),
                });
            }
        }

        let search_seconds = search_started_at.elapsed().as_secs_f64();
        let finalization_started_at = Instant::now();
        let finalization_seconds = finalization_started_at.elapsed().as_secs_f64();
        let telemetry = build_local_search_telemetry(
            &self.configuration,
            effective_seed,
            stop_reason,
            iterations,
            no_improvement_count,
            max_no_improvement_streak,
            breakout_count,
            initial.paper_objective(),
            best.paper_objective(),
            current.paper_objective(),
            initialization_seconds,
            search_seconds,
            finalization_seconds,
            &best_score_timeline,
            Some(tabu_telemetry),
            paper_trace,
        );

        build_solver_result(
            input,
            problem,
            &best_schedule,
            no_improvement_count,
            effective_seed,
            stop_reason,
            Some(telemetry),
        )
    }
}
