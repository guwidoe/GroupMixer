use crate::models::{
    ApiInput, ApiSchedule, Constraint, MoveFamilyBenchmarkTelemetrySummary, MovePolicy, Objective,
    RepeatEncounterParams, SgpWeekPairTabuBenchmarkTelemetry, Solver4Mode, Solver4PaperTrace,
    Solver4PaperTracePoint, SolverBenchmarkTelemetry, SolverConfiguration, SolverKind,
    SolverResult, StopReason,
};
use crate::solver2::{scoring::FullScoreSnapshot, SolutionState};
use crate::solver_support::SolverError;
use rand::{prelude::IndexedRandom, RngExt, SeedableRng};
use rand_chacha::ChaCha12Rng;
use std::collections::{HashMap, VecDeque};
use std::time::Instant;

pub const SOLVER4_NOTES: &str =
    "Dedicated pure-SGP solver family implementing the complete Triska/Musliu paper: Section 5 complete backtracking with pattern-driven minimal-freedom set selection, plus Sections 6 and 7 randomized greedy initialization and conflict-position local search. Solver4 strictly accepts only pure zero-repeat Social-Golfer-style scenarios.";

const DEFAULT_SOLVER4_SEED: u64 = 42;
const PAPER_PAIR_REPEAT_PENALTY: i64 = 1_000_000;
const TABU_TENURE_ITERATIONS: u64 = 10;
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
        let pattern = BacktrackingPattern::resolve(problem.group_size, params.backtracking_pattern.as_deref())?;
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
        let paper_trace = params.diagnostics.capture_paper_trace.then(|| Solver4PaperTrace {
            mode: Some(Solver4Mode::CompleteBacktracking),
            backtracking_pattern: Some(pattern.to_string()),
            initial_schedule: None,
            initial_conflict_positions: Some(0),
            initial_conflict_positions_by_week: vec![0; problem.num_weeks],
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
        let mut paper_trace = params.diagnostics.capture_paper_trace.then(|| Solver4PaperTrace {
            mode: Some(Solver4Mode::GreedyLocalSearch),
            backtracking_pattern: None,
            initial_schedule: params
                .diagnostics
                .include_initial_schedule_in_trace
                .then(|| to_api_schedule(problem, &schedule)),
            initial_conflict_positions: Some(initial.conflict_positions as u64),
            initial_conflict_positions_by_week: initial.conflict_positions_by_week.clone(),
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
                apply_random_breakout(problem, &schedule, rng, &mut tabu, iterations, &mut tabu_telemetry)
            } else {
                let selection = select_best_swap(
                    problem,
                    &schedule,
                    &current,
                    &best,
                    &mut tabu,
                    iterations,
                    &mut tabu_telemetry,
                );
                selection
                    .map(|candidate| {
                        tabu.record_iteration(
                            iterations,
                            &[(candidate.week, unordered_pair(candidate.left_person, candidate.right_person))],
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
            no_improvement_count = next_no_improvement_count(
                no_improvement_count,
                improved_current,
                breakout_applied,
            );
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

fn stop_reason_name(reason: StopReason) -> &'static str {
    match reason {
        StopReason::MaxIterationsReached => "max_iterations_reached",
        StopReason::TimeLimitReached => "time_limit_reached",
        StopReason::NoImprovementLimitReached => "no_improvement_limit_reached",
        StopReason::ProgressCallbackRequestedStop => "progress_callback_requested_stop",
        StopReason::OptimalScoreReached => "optimal_score_reached",
    }
}

fn build_local_search_telemetry(
    configuration: &SolverConfiguration,
    effective_seed: u64,
    stop_reason: StopReason,
    iterations: u64,
    no_improvement_count: u64,
    max_no_improvement_streak: u64,
    breakout_count: u64,
    initial_score: f64,
    best_score: f64,
    final_score: f64,
    initialization_seconds: f64,
    search_seconds: f64,
    finalization_seconds: f64,
    best_score_timeline: &[crate::models::BestScoreTimelinePoint],
    sgp_tabu: Option<SgpWeekPairTabuBenchmarkTelemetry>,
    paper_trace: Option<Solver4PaperTrace>,
) -> SolverBenchmarkTelemetry {
    let total_seconds = initialization_seconds + search_seconds + finalization_seconds;
    SolverBenchmarkTelemetry {
        effective_seed,
        move_policy: configuration
            .move_policy
            .clone()
            .unwrap_or_else(MovePolicy::default),
        stop_reason,
        iterations_completed: iterations,
        no_improvement_count,
        max_no_improvement_streak,
        reheats_performed: 0,
        accepted_uphill_moves: 0,
        accepted_downhill_moves: 0,
        accepted_neutral_moves: iterations.saturating_sub(breakout_count),
        restart_count: None,
        perturbation_count: Some(breakout_count),
        initial_score,
        best_score,
        final_score,
        initialization_seconds,
        search_seconds,
        finalization_seconds,
        total_seconds,
        iterations_per_second: if search_seconds > 0.0 {
            iterations as f64 / search_seconds
        } else {
            0.0
        },
        best_score_timeline: best_score_timeline.to_vec(),
        repeat_guided_swaps: Default::default(),
        sgp_week_pair_tabu: sgp_tabu,
        memetic: None,
        donor_session_transplant: None,
        session_aligned_path_relinking: None,
        multi_root_balanced_session_inheritance: None,
        solver4_paper_trace: paper_trace,
        moves: MoveFamilyBenchmarkTelemetrySummary::default(),
    }
}

fn should_apply_random_breakout(no_improvement_count: u64) -> bool {
    no_improvement_count == RANDOM_BREAKOUT_AFTER_NO_IMPROVEMENT
}

fn next_no_improvement_count(
    previous: u64,
    improved_best: bool,
    breakout_applied: bool,
) -> u64 {
    if improved_best || breakout_applied {
        0
    } else {
        previous + 1
    }
}

#[derive(Debug, Clone)]
struct PureSgpProblem {
    people: Vec<String>,
    groups: Vec<String>,
    num_people: usize,
    num_groups: usize,
    group_size: usize,
    num_weeks: usize,
}

impl PureSgpProblem {
    fn from_input(input: &ApiInput) -> Result<Self, SolverError> {
        let kind = input
            .solver
            .validate_solver_selection()
            .map_err(SolverError::ValidationError)?;
        if kind != crate::models::SolverKind::Solver4 {
            return Err(SolverError::ValidationError(format!(
                "solver4 expected solver family 'solver4', got '{}'",
                kind.canonical_id()
            )));
        }
        if input.initial_schedule.is_some() {
            return Err(SolverError::ValidationError(
                "solver4 does not accept initial_schedule; it follows the paper algorithms directly"
                    .into(),
            ));
        }
        if input.construction_seed_schedule.is_some() {
            return Err(SolverError::ValidationError(
                "solver4 does not accept construction_seed_schedule; it follows the paper algorithms directly"
                    .into(),
            ));
        }

        let num_weeks = usize::try_from(input.problem.num_sessions).map_err(|_| {
            SolverError::ValidationError("solver4 num_sessions does not fit usize".into())
        })?;
        if num_weeks == 0 {
            return Err(SolverError::ValidationError(
                "solver4 requires at least one session".into(),
            ));
        }
        if input.problem.groups.is_empty() {
            return Err(SolverError::ValidationError(
                "solver4 requires at least one group".into(),
            ));
        }
        if input.problem.people.is_empty() {
            return Err(SolverError::ValidationError(
                "solver4 requires at least one person".into(),
            ));
        }

        let first_group = &input.problem.groups[0];
        if first_group.size == 0 {
            return Err(SolverError::ValidationError(
                "solver4 requires positive uniform group size".into(),
            ));
        }
        if first_group.session_sizes.is_some() {
            return Err(SolverError::ValidationError(
                "solver4 rejects session-specific capacities; pure SGP requires one fixed group size".into(),
            ));
        }
        let group_size = usize::try_from(first_group.size).map_err(|_| {
            SolverError::ValidationError("solver4 group size does not fit usize".into())
        })?;

        for group in &input.problem.groups {
            if group.session_sizes.is_some() {
                return Err(SolverError::ValidationError(
                    "solver4 rejects session-specific capacities; pure SGP requires one fixed group size".into(),
                ));
            }
            if group.size != first_group.size {
                return Err(SolverError::ValidationError(
                    "solver4 requires uniform group sizes across all groups".into(),
                ));
            }
        }

        for person in &input.problem.people {
            if let Some(sessions) = &person.sessions {
                let expected: Vec<u32> = (0..input.problem.num_sessions).collect();
                if sessions != &expected {
                    return Err(SolverError::ValidationError(
                        "solver4 rejects partial attendance; pure SGP requires every person in every session".into(),
                    ));
                }
            }
        }

        let num_people = input.problem.people.len();
        let num_groups = input.problem.groups.len();
        if num_people != num_groups * group_size {
            return Err(SolverError::ValidationError(format!(
                "solver4 requires complete equal partitions each session: {} people != {} groups * size {}",
                num_people, num_groups, group_size
            )));
        }

        validate_pure_sgp_objectives(&input.objectives)?;
        validate_pure_sgp_constraints(&input.constraints)?;

        Ok(Self {
            people: input.problem.people.iter().map(|person| person.id.clone()).collect(),
            groups: input.problem.groups.iter().map(|group| group.id.clone()).collect(),
            num_people,
            num_groups,
            group_size,
            num_weeks,
        })
    }

    fn position_id(&self, week: usize, group: usize, slot: usize) -> usize {
        ((week * self.num_groups) + group) * self.group_size + slot
    }

    fn pair_key(&self, left: usize, right: usize) -> usize {
        let (left, right) = unordered_pair(left, right);
        left * self.num_people + right
    }
}

fn validate_pure_sgp_objectives(objectives: &[Objective]) -> Result<(), SolverError> {
    for objective in objectives {
        if objective.r#type != "maximize_unique_contacts" {
            return Err(SolverError::ValidationError(format!(
                "solver4 rejects objective '{}'; pure SGP only allows maximize_unique_contacts",
                objective.r#type
            )));
        }
    }
    Ok(())
}

fn validate_pure_sgp_constraints(constraints: &[Constraint]) -> Result<(), SolverError> {
    let mut repeat_encounter: Option<&RepeatEncounterParams> = None;
    for constraint in constraints {
        match constraint {
            Constraint::RepeatEncounter(params) => {
                if repeat_encounter.replace(params).is_some() {
                    return Err(SolverError::ValidationError(
                        "solver4 allows exactly one RepeatEncounter constraint".into(),
                    ));
                }
            }
            other => {
                return Err(SolverError::ValidationError(format!(
                    "solver4 rejects non-SGP constraint '{:?}'; pure SGP only allows RepeatEncounter",
                    other
                )));
            }
        }
    }

    if let Some(params) = repeat_encounter {
        if params.max_allowed_encounters > 1 {
            return Err(SolverError::ValidationError(
                "solver4 requires the zero-repeat canonical encoding: RepeatEncounter.max_allowed_encounters must be 0 or 1"
                    .into(),
            ));
        }
    }
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct BacktrackingPattern {
    chunks: Vec<usize>,
}

impl BacktrackingPattern {
    fn resolve(group_size: usize, raw: Option<&str>) -> Result<Self, SolverError> {
        match raw {
            Some(raw) => Self::parse(group_size, raw),
            None => Ok(Self {
                chunks: default_backtracking_pattern(group_size),
            }),
        }
    }

    fn parse(group_size: usize, raw: &str) -> Result<Self, SolverError> {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return Err(SolverError::ValidationError(
                "solver4 backtracking_pattern must not be empty".into(),
            ));
        }
        let mut chunks = Vec::new();
        for token in trimmed.split('-') {
            let value: usize = token.parse().map_err(|_| {
                SolverError::ValidationError(format!(
                    "solver4 backtracking_pattern token '{token}' is not a positive integer"
                ))
            })?;
            if value == 0 {
                return Err(SolverError::ValidationError(
                    "solver4 backtracking_pattern tokens must be >= 1".into(),
                ));
            }
            chunks.push(value);
        }
        if chunks.iter().sum::<usize>() != group_size {
            return Err(SolverError::ValidationError(format!(
                "solver4 backtracking_pattern '{trimmed}' must sum to the group size {group_size}"
            )));
        }
        Ok(Self { chunks })
    }
}

impl std::fmt::Display for BacktrackingPattern {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        for (idx, chunk) in self.chunks.iter().enumerate() {
            if idx > 0 {
                write!(f, "-")?;
            }
            write!(f, "{chunk}")?;
        }
        Ok(())
    }
}

fn default_backtracking_pattern(group_size: usize) -> Vec<usize> {
    let mut chunks = vec![2; group_size / 2];
    if group_size % 2 == 1 {
        chunks.push(1);
    }
    chunks
}

#[derive(Debug, Clone)]
struct PaperConstructionState {
    schedule: Vec<Vec<Vec<usize>>>,
    partnered: Vec<Vec<bool>>,
}

impl PaperConstructionState {
    fn empty(problem: &PureSgpProblem) -> Self {
        Self {
            schedule: vec![vec![Vec::with_capacity(problem.group_size); problem.num_groups]; problem.num_weeks],
            partnered: vec![vec![false; problem.num_people]; problem.num_people],
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ChunkCandidate {
    members: Vec<usize>,
    freedom: usize,
}

impl ChunkCandidate {
    fn new(members: Vec<usize>, freedom: usize) -> Self {
        Self { members, freedom }
    }
}

#[derive(Debug, Default)]
struct CompleteBacktrackingStats {
    nodes_visited: u64,
    stop_reason: Option<StopReason>,
}

fn search_complete_backtracking(
    problem: &PureSgpProblem,
    pattern: &BacktrackingPattern,
    week: usize,
    group: usize,
    token_index: usize,
    remaining: &[usize],
    state: PaperConstructionState,
    stop_conditions: &crate::models::StopConditions,
    started_at: Instant,
    stats: &mut CompleteBacktrackingStats,
) -> Option<PaperConstructionState> {
    if let Some(limit) = stop_conditions.max_iterations {
        if stats.nodes_visited >= limit {
            stats.stop_reason = Some(StopReason::MaxIterationsReached);
            return None;
        }
    }
    if let Some(limit) = stop_conditions.time_limit_seconds {
        if started_at.elapsed().as_secs() >= limit {
            stats.stop_reason = Some(StopReason::TimeLimitReached);
            return None;
        }
    }

    if week == problem.num_weeks {
        return Some(state);
    }
    if group == problem.num_groups {
        debug_assert!(remaining.is_empty());
        let next_remaining: Vec<usize> = (0..problem.num_people).collect();
        return search_complete_backtracking(
            problem,
            pattern,
            week + 1,
            0,
            0,
            &next_remaining,
            state,
            stop_conditions,
            started_at,
            stats,
        );
    }
    if token_index == pattern.chunks.len() {
        return search_complete_backtracking(
            problem,
            pattern,
            week,
            group + 1,
            0,
            remaining,
            state,
            stop_conditions,
            started_at,
            stats,
        );
    }

    let current_group = &state.schedule[week][group];
    let chunk_size = pattern.chunks[token_index];
    let candidates = ordered_chunk_candidates(
        remaining,
        current_group,
        chunk_size,
        &state.partnered,
    );

    for candidate in candidates {
        stats.nodes_visited += 1;

        let mut next_state = state.clone();
        append_group_chunk(
            &mut next_state.schedule[week][group],
            &candidate.members,
            &mut next_state.partnered,
        );
        let next_remaining = remove_chunk(remaining, &candidate.members);

        if let Some(solution) = search_complete_backtracking(
            problem,
            pattern,
            week,
            group,
            token_index + 1,
            &next_remaining,
            next_state,
            stop_conditions,
            started_at,
            stats,
        ) {
            return Some(solution);
        }

        if stats.stop_reason.is_some() {
            return None;
        }
    }

    None
}

fn ordered_chunk_candidates(
    remaining: &[usize],
    current_group: &[usize],
    chunk_size: usize,
    partnered: &[Vec<bool>],
) -> Vec<ChunkCandidate> {
    if chunk_size == 1 {
        let mut singles: Vec<_> = remaining
            .iter()
            .copied()
            .filter(|candidate| compatible_with_group(*candidate, current_group, partnered))
            .map(|candidate| ChunkCandidate::new(vec![candidate], 0))
            .collect();
        singles.sort_by(|left, right| left.members.cmp(&right.members));
        return singles;
    }

    let mut collected = Vec::new();
    let mut scratch = Vec::with_capacity(chunk_size);
    enumerate_chunk_candidates(
        remaining,
        current_group,
        chunk_size,
        0,
        partnered,
        &mut scratch,
        &mut collected,
    );
    collected.sort_by(|left, right| {
        left.freedom
            .cmp(&right.freedom)
            .then(left.members.cmp(&right.members))
    });
    collected
}

fn enumerate_chunk_candidates(
    remaining: &[usize],
    current_group: &[usize],
    chunk_size: usize,
    start: usize,
    partnered: &[Vec<bool>],
    scratch: &mut Vec<usize>,
    out: &mut Vec<ChunkCandidate>,
) {
    if scratch.len() == chunk_size {
        if chunk_is_compatible(current_group, scratch, partnered) {
            out.push(ChunkCandidate::new(
                scratch.clone(),
                freedom_of_set(scratch, partnered),
            ));
        }
        return;
    }

    for idx in start..remaining.len() {
        scratch.push(remaining[idx]);
        enumerate_chunk_candidates(
            remaining,
            current_group,
            chunk_size,
            idx + 1,
            partnered,
            scratch,
            out,
        );
        scratch.pop();
    }
}

fn chunk_is_compatible(
    current_group: &[usize],
    chunk: &[usize],
    partnered: &[Vec<bool>],
) -> bool {
    for &member in chunk {
        if !compatible_with_group(member, current_group, partnered) {
            return false;
        }
    }
    for left_idx in 0..chunk.len() {
        for right_idx in (left_idx + 1)..chunk.len() {
            if partnered[chunk[left_idx]][chunk[right_idx]] {
                return false;
            }
        }
    }
    true
}

fn compatible_with_group(person: usize, group: &[usize], partnered: &[Vec<bool>]) -> bool {
    group.iter().all(|member| !partnered[person][*member])
}

fn append_group_chunk(group: &mut Vec<usize>, chunk: &[usize], partnered: &mut [Vec<bool>]) {
    let existing_len = group.len();
    group.extend_from_slice(chunk);
    for left_idx in 0..group.len() {
        let start = if left_idx < existing_len {
            existing_len
        } else {
            left_idx + 1
        };
        for right_idx in start..group.len() {
            let left = group[left_idx];
            let right = group[right_idx];
            partnered[left][right] = true;
            partnered[right][left] = true;
        }
    }
}

fn remove_chunk(remaining: &[usize], chunk: &[usize]) -> Vec<usize> {
    remaining
        .iter()
        .copied()
        .filter(|candidate| !chunk.contains(candidate))
        .collect()
}

fn potential_partner_set(person: usize, partnered: &[Vec<bool>]) -> Vec<bool> {
    (0..partnered.len())
        .map(|candidate| candidate != person && !partnered[person][candidate])
        .collect()
}

fn freedom_of_set(set: &[usize], partnered: &[Vec<bool>]) -> usize {
    if set.is_empty() {
        return 0;
    }

    let num_people = partnered.len();
    let mut intersection = vec![true; num_people];
    for &person in set {
        let potential = potential_partner_set(person, partnered);
        for candidate in 0..num_people {
            intersection[candidate] &= potential[candidate];
        }
    }
    for &person in set {
        intersection[person] = false;
    }
    intersection.into_iter().filter(|allowed| *allowed).count()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct PairCandidateScore {
    left: usize,
    right: usize,
    raw_freedom: usize,
    repeat_penalty_count: usize,
    adjusted_freedom: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct GroupCandidateScore {
    members: Vec<usize>,
    raw_freedom: usize,
    repeat_penalty_count: usize,
    adjusted_freedom: i64,
}

impl PairCandidateScore {
    fn pair(&self) -> (usize, usize) {
        (self.left, self.right)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
struct GreedyInitializerTrace {
    pair_steps: Vec<GreedyPairStep>,
    singleton_steps: Vec<GreedySingletonStep>,
    group_steps: Vec<GreedyGroupStep>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct GreedyPairStep {
    week: usize,
    group: usize,
    pair_index: usize,
    remaining_before: Vec<usize>,
    scored_candidates: Vec<PairCandidateScore>,
    chosen: PairCandidateScore,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct GreedySingletonStep {
    week: usize,
    group: usize,
    remaining_before: Vec<usize>,
    chosen: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct PairPenaltyUpdate {
    pair: (usize, usize),
    new_penalty: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct GreedyGroupStep {
    week: usize,
    group: usize,
    members: Vec<usize>,
    selected_pairs: Vec<(usize, usize)>,
    singleton: Option<usize>,
    penalty_updates: Vec<PairPenaltyUpdate>,
    partnered_pairs_noted: Vec<(usize, usize)>,
}

fn build_greedy_initial_schedule(
    problem: &PureSgpProblem,
    gamma: f64,
    rng: &mut ChaCha12Rng,
) -> Vec<Vec<Vec<usize>>> {
    build_greedy_initial_schedule_internal(problem, gamma, rng, None)
}

#[cfg(test)]
fn build_greedy_initial_schedule_with_trace(
    problem: &PureSgpProblem,
    gamma: f64,
    rng: &mut ChaCha12Rng,
) -> (Vec<Vec<Vec<usize>>>, GreedyInitializerTrace) {
    let mut trace = GreedyInitializerTrace::default();
    let schedule = build_greedy_initial_schedule_internal(problem, gamma, rng, Some(&mut trace));
    (schedule, trace)
}

fn build_greedy_initial_schedule_internal(
    problem: &PureSgpProblem,
    gamma: f64,
    rng: &mut ChaCha12Rng,
    mut trace: Option<&mut GreedyInitializerTrace>,
) -> Vec<Vec<Vec<usize>>> {
    let mut schedule = vec![vec![Vec::with_capacity(problem.group_size); problem.num_groups]; problem.num_weeks];
    let mut partnered = vec![vec![false; problem.num_people]; problem.num_people];
    let mut selected_pair_penalties = vec![vec![0usize; problem.num_people]; problem.num_people];

    for week in 0..problem.num_weeks {
        let mut remaining: Vec<usize> = (0..problem.num_people).collect();
        for group_idx in 0..problem.num_groups {
            let (selected_pairs, singleton) = if problem.group_size == 4 {
                let chosen = choose_best_group_candidate(
                    &remaining,
                    &partnered,
                    &selected_pair_penalties,
                    problem.group_size,
                    gamma,
                    rng,
                );
                for member in &chosen.members {
                    schedule[week][group_idx].push(*member);
                }
                for member in &chosen.members {
                    remove_person(&mut remaining, *member);
                }
                (all_group_pairs(&chosen.members), None)
            } else {
                let pair_slots = problem.group_size / 2;
                let mut selected_pairs = Vec::with_capacity(pair_slots);
                for pair_index in 0..pair_slots {
                    let remaining_before = remaining.clone();
                    let scored_candidates = score_pair_candidates(
                        &remaining,
                        &partnered,
                        &selected_pair_penalties,
                    );
                    let chosen = choose_best_pair_from_scores(&scored_candidates, gamma, rng);
                    schedule[week][group_idx].push(chosen.left);
                    schedule[week][group_idx].push(chosen.right);
                    remove_person(&mut remaining, chosen.left);
                    remove_person(&mut remaining, chosen.right);
                    selected_pairs.push(chosen.pair());
                    if let Some(trace) = trace.as_mut() {
                        trace.pair_steps.push(GreedyPairStep {
                            week,
                            group: group_idx,
                            pair_index,
                            remaining_before,
                            scored_candidates,
                            chosen,
                        });
                    }
                }
                let singleton = if problem.group_size % 2 == 1 {
                    let remaining_before = remaining.clone();
                    let selected = choose_last_singleton(&remaining, gamma, rng);
                    schedule[week][group_idx].push(selected);
                    remove_person(&mut remaining, selected);
                    if let Some(trace) = trace.as_mut() {
                        trace.singleton_steps.push(GreedySingletonStep {
                            week,
                            group: group_idx,
                            remaining_before,
                            chosen: selected,
                        });
                    }
                    Some(selected)
                } else {
                    None
                };
                (selected_pairs, singleton)
            };

            let mut penalty_updates = Vec::with_capacity(selected_pairs.len());
            for &(left, right) in &selected_pairs {
                selected_pair_penalties[left][right] += 1;
                selected_pair_penalties[right][left] += 1;
                penalty_updates.push(PairPenaltyUpdate {
                    pair: (left, right),
                    new_penalty: selected_pair_penalties[left][right],
                });
            }
            let partnered_pairs_noted = all_group_pairs(&schedule[week][group_idx]);
            note_group_partnerships(&schedule[week][group_idx], &mut partnered);
            if let Some(trace) = trace.as_mut() {
                trace.group_steps.push(GreedyGroupStep {
                    week,
                    group: group_idx,
                    members: schedule[week][group_idx].clone(),
                    selected_pairs: selected_pairs.clone(),
                    singleton,
                    penalty_updates,
                    partnered_pairs_noted,
                });
            }
        }
    }

    schedule
}

fn score_pair_candidates(
    remaining: &[usize],
    partnered: &[Vec<bool>],
    selected_pair_penalties: &[Vec<usize>],
) -> Vec<PairCandidateScore> {
    let mut scored = Vec::new();
    for left_idx in 0..remaining.len() {
        for right_idx in (left_idx + 1)..remaining.len() {
            let left = remaining[left_idx];
            let right = remaining[right_idx];
            let raw_freedom = freedom_of_set(&[left, right], partnered);
            let repeat_penalty_count = selected_pair_penalties[left][right];
            let adjusted_freedom =
                raw_freedom as i64 - (repeat_penalty_count as i64 * PAPER_PAIR_REPEAT_PENALTY);
            scored.push(PairCandidateScore {
                left,
                right,
                raw_freedom,
                repeat_penalty_count,
                adjusted_freedom,
            });
        }
    }
    scored.sort_by(|left, right| {
        right
            .adjusted_freedom
            .cmp(&left.adjusted_freedom)
            .then((left.left, left.right).cmp(&(right.left, right.right)))
    });
    scored
}

fn score_group_candidates(
    remaining: &[usize],
    partnered: &[Vec<bool>],
    selected_pair_penalties: &[Vec<usize>],
    group_size: usize,
) -> Vec<GroupCandidateScore> {
    let mut scored = Vec::new();
    let mut scratch = Vec::with_capacity(group_size);
    enumerate_group_candidates(
        remaining,
        group_size,
        0,
        &mut scratch,
        &mut scored,
        partnered,
        selected_pair_penalties,
    );
    scored.sort_by(|left, right| {
        right
            .adjusted_freedom
            .cmp(&left.adjusted_freedom)
            .then(left.members.cmp(&right.members))
    });
    scored
}

fn enumerate_group_candidates(
    remaining: &[usize],
    group_size: usize,
    start: usize,
    scratch: &mut Vec<usize>,
    out: &mut Vec<GroupCandidateScore>,
    partnered: &[Vec<bool>],
    selected_pair_penalties: &[Vec<usize>],
) {
    if scratch.len() == group_size {
        let raw_freedom = freedom_of_set(scratch, partnered);
        let mut repeat_penalty_count = 0usize;
        for left_idx in 0..scratch.len() {
            for right_idx in (left_idx + 1)..scratch.len() {
                repeat_penalty_count += selected_pair_penalties[scratch[left_idx]][scratch[right_idx]];
            }
        }
        let adjusted_freedom =
            raw_freedom as i64 - (repeat_penalty_count as i64 * PAPER_PAIR_REPEAT_PENALTY);
        out.push(GroupCandidateScore {
            members: scratch.clone(),
            raw_freedom,
            repeat_penalty_count,
            adjusted_freedom,
        });
        return;
    }

    for idx in start..remaining.len() {
        scratch.push(remaining[idx]);
        enumerate_group_candidates(
            remaining,
            group_size,
            idx + 1,
            scratch,
            out,
            partnered,
            selected_pair_penalties,
        );
        scratch.pop();
    }
}

fn choose_best_group_candidate(
    remaining: &[usize],
    partnered: &[Vec<bool>],
    selected_pair_penalties: &[Vec<usize>],
    group_size: usize,
    gamma: f64,
    rng: &mut ChaCha12Rng,
) -> GroupCandidateScore {
    let scored = score_group_candidates(remaining, partnered, selected_pair_penalties, group_size);
    let best_score = scored[0].adjusted_freedom;
    let tied_len = scored
        .iter()
        .take_while(|candidate| candidate.adjusted_freedom == best_score)
        .count();
    if tied_len > 1 && rng.random::<f64>() < gamma {
        scored[..tied_len].choose(rng).cloned().unwrap_or_else(|| scored[0].clone())
    } else {
        scored[0].clone()
    }
}

fn choose_best_pair_from_scores(
    scored: &[PairCandidateScore],
    gamma: f64,
    rng: &mut ChaCha12Rng,
) -> PairCandidateScore {
    let best_score = scored[0].adjusted_freedom;
    let tied_len = scored
        .iter()
        .take_while(|candidate| candidate.adjusted_freedom == best_score)
        .count();
    if tied_len > 1 && rng.random::<f64>() < gamma {
        scored[..tied_len].choose(rng).copied().unwrap_or(scored[0])
    } else {
        scored[0]
    }
}

#[cfg(test)]
fn choose_best_pair(
    remaining: &[usize],
    partnered: &[Vec<bool>],
    selected_pair_penalties: &[Vec<usize>],
    gamma: f64,
    rng: &mut ChaCha12Rng,
) -> (usize, usize) {
    let scored = score_pair_candidates(remaining, partnered, selected_pair_penalties);
    choose_best_pair_from_scores(&scored, gamma, rng).pair()
}

fn choose_last_singleton(remaining: &[usize], gamma: f64, rng: &mut ChaCha12Rng) -> usize {
    if remaining.len() > 1 && rng.random::<f64>() < gamma {
        remaining.choose(rng).copied().unwrap_or(remaining[0])
    } else {
        remaining[0]
    }
}

fn remove_person(remaining: &mut Vec<usize>, person: usize) {
    if let Some(idx) = remaining.iter().position(|candidate| *candidate == person) {
        remaining.remove(idx);
    }
}

fn note_group_partnerships(group: &[usize], partnered: &mut [Vec<bool>]) {
    for left_idx in 0..group.len() {
        for right_idx in (left_idx + 1)..group.len() {
            let left = group[left_idx];
            let right = group[right_idx];
            partnered[left][right] = true;
            partnered[right][left] = true;
        }
    }
}

fn all_group_pairs(group: &[usize]) -> Vec<(usize, usize)> {
    let mut pairs = Vec::new();
    for left_idx in 0..group.len() {
        for right_idx in (left_idx + 1)..group.len() {
            pairs.push((group[left_idx], group[right_idx]));
        }
    }
    pairs
}

#[derive(Debug, Clone, Copy)]
struct PairOccurrence {
    left_position: usize,
    right_position: usize,
}

#[derive(Debug, Clone)]
struct EvaluatedSchedule {
    conflict_positions: usize,
    conflict_positions_by_week: Vec<u32>,
    unique_contacts: i32,
    repeat_excess: i32,
    pair_counts: Vec<u16>,
    pair_occurrences: Vec<Vec<PairOccurrence>>,
    incident_counts: Vec<u16>,
}

impl EvaluatedSchedule {
    fn from_schedule(problem: &PureSgpProblem, schedule: Vec<Vec<Vec<usize>>>) -> Self {
        let total_positions = problem.num_weeks * problem.num_groups * problem.group_size;
        let mut pair_counts = vec![0u16; problem.num_people * problem.num_people];
        let mut pair_occurrences = vec![Vec::new(); problem.num_people * problem.num_people];

        for week in 0..problem.num_weeks {
            for group in 0..problem.num_groups {
                let members = &schedule[week][group];
                for left_slot in 0..members.len() {
                    for right_slot in (left_slot + 1)..members.len() {
                        let left = members[left_slot];
                        let right = members[right_slot];
                        let key = problem.pair_key(left, right);
                        pair_counts[key] += 1;
                        pair_occurrences[key].push(PairOccurrence {
                            left_position: problem.position_id(week, group, left_slot),
                            right_position: problem.position_id(week, group, right_slot),
                        });
                    }
                }
            }
        }

        let mut incident_counts = vec![0u16; total_positions];
        let mut unique_contacts = 0i32;
        let mut repeat_excess = 0i32;
        for (key, &count) in pair_counts.iter().enumerate() {
            if count > 0 {
                unique_contacts += 1;
            }
            if count > 1 {
                let _ = key;
                repeat_excess += i32::from(count - 1);
                for occurrence in &pair_occurrences[key] {
                    incident_counts[occurrence.left_position] += 1;
                    incident_counts[occurrence.right_position] += 1;
                }
            }
        }

        let mut conflict_positions_by_week = vec![0u32; problem.num_weeks];
        let mut conflict_positions = 0usize;
        for week in 0..problem.num_weeks {
            for group in 0..problem.num_groups {
                for slot in 0..problem.group_size {
                    let position = problem.position_id(week, group, slot);
                    if incident_counts[position] > 0 {
                        conflict_positions += 1;
                        conflict_positions_by_week[week] += 1;
                    }
                }
            }
        }

        Self {
            conflict_positions,
            conflict_positions_by_week,
            unique_contacts,
            repeat_excess,
            pair_counts,
            pair_occurrences,
            incident_counts,
        }
    }

    fn paper_objective(&self) -> f64 {
        self.conflict_positions as f64
    }
}

#[derive(Debug, Clone, Copy)]
struct SwapCandidate {
    week: usize,
    left_group: usize,
    left_slot: usize,
    right_group: usize,
    right_slot: usize,
    left_person: usize,
    right_person: usize,
    conflict_positions_after: usize,
}

impl SwapCandidate {
    fn resulting_value_at(&self, position: usize, base_schedule: &[Vec<Vec<usize>>]) -> usize {
        let left_position = position_id_from_coordinates(
            base_schedule,
            self.week,
            self.left_group,
            self.left_slot,
        );
        let right_position = position_id_from_coordinates(
            base_schedule,
            self.week,
            self.right_group,
            self.right_slot,
        );
        if position == left_position {
            self.right_person
        } else if position == right_position {
            self.left_person
        } else {
            person_at_position(base_schedule, position)
        }
    }

    fn outranks(&self, other: &Self, base_schedule: &[Vec<Vec<usize>>]) -> bool {
        self.conflict_positions_after < other.conflict_positions_after
            || (self.conflict_positions_after == other.conflict_positions_after
                && resulting_configuration_is_lexicographically_smaller(
                    base_schedule,
                    self,
                    other,
                ))
    }
}

fn position_id_from_coordinates(
    schedule: &[Vec<Vec<usize>>],
    week: usize,
    group: usize,
    slot: usize,
) -> usize {
    let num_groups = schedule[0].len();
    let group_size = schedule[0][0].len();
    (week * num_groups + group) * group_size + slot
}

fn person_at_position(schedule: &[Vec<Vec<usize>>], position: usize) -> usize {
    let num_groups = schedule[0].len();
    let group_size = schedule[0][0].len();
    let week = position / (num_groups * group_size);
    let within_week = position % (num_groups * group_size);
    let group = within_week / group_size;
    let slot = within_week % group_size;
    schedule[week][group][slot]
}

fn resulting_configuration_is_lexicographically_smaller(
    base_schedule: &[Vec<Vec<usize>>],
    left: &SwapCandidate,
    right: &SwapCandidate,
) -> bool {
    let mut changed_positions = vec![
        position_id_from_coordinates(base_schedule, left.week, left.left_group, left.left_slot),
        position_id_from_coordinates(base_schedule, left.week, left.right_group, left.right_slot),
        position_id_from_coordinates(base_schedule, right.week, right.left_group, right.left_slot),
        position_id_from_coordinates(base_schedule, right.week, right.right_group, right.right_slot),
    ];
    changed_positions.sort_unstable();
    changed_positions.dedup();

    for position in changed_positions {
        let left_value = left.resulting_value_at(position, base_schedule);
        let right_value = right.resulting_value_at(position, base_schedule);
        if left_value != right_value {
            return left_value < right_value;
        }
    }

    false
}

fn select_best_swap(
    problem: &PureSgpProblem,
    schedule: &[Vec<Vec<usize>>],
    current: &EvaluatedSchedule,
    best: &EvaluatedSchedule,
    tabu: &mut WeekTabuLists,
    iteration: u64,
    tabu_telemetry: &mut SgpWeekPairTabuBenchmarkTelemetry,
) -> Option<SelectedSwap> {
    let mut best_candidate: Option<SwapCandidate> = None;
    tabu.prune(iteration);

    for week in 0..problem.num_weeks {
        for left_group in 0..problem.num_groups {
            for right_group in (left_group + 1)..problem.num_groups {
                for left_slot in 0..problem.group_size {
                    let left_position = problem.position_id(week, left_group, left_slot);
                    let left_person = schedule[week][left_group][left_slot];
                    for right_slot in 0..problem.group_size {
                        let right_position = problem.position_id(week, right_group, right_slot);
                        if current.incident_counts[left_position] == 0
                            && current.incident_counts[right_position] == 0
                        {
                            continue;
                        }
                        let right_person = schedule[week][right_group][right_slot];
                        let candidate_conflicts = evaluate_swap_conflict_positions(
                            problem,
                            schedule,
                            current,
                            week,
                            left_group,
                            left_slot,
                            right_group,
                            right_slot,
                        );
                        let swapped_pair = unordered_pair(left_person, right_person);
                        if tabu.contains(week, swapped_pair) {
                            tabu_telemetry.raw_tabu_hits += 1;
                            if candidate_conflicts < best.conflict_positions {
                                tabu_telemetry.aspiration_overrides += 1;
                            } else {
                                continue;
                            }
                        }

                        let candidate = SwapCandidate {
                            week,
                            left_group,
                            left_slot,
                            right_group,
                            right_slot,
                            left_person,
                            right_person,
                            conflict_positions_after: candidate_conflicts,
                        };

                        let is_better = match best_candidate {
                            None => true,
                            Some(current_best) => candidate.outranks(&current_best, schedule),
                        };
                        if is_better {
                            best_candidate = Some(candidate);
                        }
                    }
                }
            }
        }
    }

    best_candidate.map(|candidate| SelectedSwap {
        week: candidate.week,
        left_person: candidate.left_person,
        right_person: candidate.right_person,
        schedule: apply_swap(
            schedule,
            candidate.week,
            candidate.left_group,
            candidate.left_slot,
            candidate.right_group,
            candidate.right_slot,
        ),
    })
}

#[derive(Debug, Clone)]
struct SelectedSwap {
    week: usize,
    left_person: usize,
    right_person: usize,
    schedule: Vec<Vec<Vec<usize>>>,
}

fn evaluate_swap_conflict_positions(
    problem: &PureSgpProblem,
    schedule: &[Vec<Vec<usize>>],
    current: &EvaluatedSchedule,
    week: usize,
    left_group: usize,
    left_slot: usize,
    right_group: usize,
    right_slot: usize,
) -> usize {
    let left_person = schedule[week][left_group][left_slot];
    let right_person = schedule[week][right_group][right_slot];

    let mut position_deltas: HashMap<usize, i32> = HashMap::new();

    for slot in 0..problem.group_size {
        if slot != left_slot {
            let partner = schedule[week][left_group][slot];
            apply_removed_pair_delta(
                current,
                problem.pair_key(left_person, partner),
                problem.position_id(week, left_group, left_slot),
                problem.position_id(week, left_group, slot),
                &mut position_deltas,
            );
            apply_added_pair_delta(
                current,
                problem.pair_key(right_person, partner),
                problem.position_id(week, right_group, right_slot),
                problem.position_id(week, left_group, slot),
                &mut position_deltas,
            );
        }
        if slot != right_slot {
            let partner = schedule[week][right_group][slot];
            apply_removed_pair_delta(
                current,
                problem.pair_key(right_person, partner),
                problem.position_id(week, right_group, right_slot),
                problem.position_id(week, right_group, slot),
                &mut position_deltas,
            );
            apply_added_pair_delta(
                current,
                problem.pair_key(left_person, partner),
                problem.position_id(week, left_group, left_slot),
                problem.position_id(week, right_group, slot),
                &mut position_deltas,
            );
        }
    }

    let mut new_conflict_positions = current.conflict_positions;
    for (position, delta) in position_deltas {
        let before = current.incident_counts[position] > 0;
        let after = (i32::from(current.incident_counts[position]) + delta) > 0;
        match (before, after) {
            (true, false) => new_conflict_positions -= 1,
            (false, true) => new_conflict_positions += 1,
            _ => {}
        }
    }
    new_conflict_positions
}

fn apply_removed_pair_delta(
    current: &EvaluatedSchedule,
    pair_key: usize,
    removed_left_position: usize,
    removed_right_position: usize,
    deltas: &mut HashMap<usize, i32>,
) {
    let old_count = current.pair_counts[pair_key];
    match old_count {
        0 | 1 => {}
        2 => {
            for occurrence in &current.pair_occurrences[pair_key] {
                *deltas.entry(occurrence.left_position).or_insert(0) -= 1;
                *deltas.entry(occurrence.right_position).or_insert(0) -= 1;
            }
        }
        _ => {
            *deltas.entry(removed_left_position).or_insert(0) -= 1;
            *deltas.entry(removed_right_position).or_insert(0) -= 1;
        }
    }
}

fn apply_added_pair_delta(
    current: &EvaluatedSchedule,
    pair_key: usize,
    added_left_position: usize,
    added_right_position: usize,
    deltas: &mut HashMap<usize, i32>,
) {
    let old_count = current.pair_counts[pair_key];
    match old_count {
        0 => {}
        1 => {
            for occurrence in &current.pair_occurrences[pair_key] {
                *deltas.entry(occurrence.left_position).or_insert(0) += 1;
                *deltas.entry(occurrence.right_position).or_insert(0) += 1;
            }
            *deltas.entry(added_left_position).or_insert(0) += 1;
            *deltas.entry(added_right_position).or_insert(0) += 1;
        }
        _ => {
            *deltas.entry(added_left_position).or_insert(0) += 1;
            *deltas.entry(added_right_position).or_insert(0) += 1;
        }
    }
}

fn apply_swap(
    schedule: &[Vec<Vec<usize>>],
    week: usize,
    left_group: usize,
    left_slot: usize,
    right_group: usize,
    right_slot: usize,
) -> Vec<Vec<Vec<usize>>> {
    let mut next = schedule.to_vec();
    let left_person = next[week][left_group][left_slot];
    let right_person = next[week][right_group][right_slot];
    next[week][left_group][left_slot] = right_person;
    next[week][right_group][right_slot] = left_person;
    next
}

fn apply_random_breakout(
    problem: &PureSgpProblem,
    schedule: &[Vec<Vec<usize>>],
    rng: &mut ChaCha12Rng,
    tabu: &mut WeekTabuLists,
    iteration: u64,
    tabu_telemetry: &mut SgpWeekPairTabuBenchmarkTelemetry,
) -> Vec<Vec<Vec<usize>>> {
    let mut next = schedule.to_vec();
    let mut recorded = Vec::with_capacity(RANDOM_BREAKOUT_SWAP_COUNT);

    for _ in 0..RANDOM_BREAKOUT_SWAP_COUNT {
        let week = rng.random_range(0..problem.num_weeks);
        let left_group = rng.random_range(0..problem.num_groups);
        let mut right_group = rng.random_range(0..problem.num_groups);
        while right_group == left_group {
            right_group = rng.random_range(0..problem.num_groups);
        }
        let left_slot = rng.random_range(0..problem.group_size);
        let right_slot = rng.random_range(0..problem.group_size);
        let left_person = next[week][left_group][left_slot];
        let right_person = next[week][right_group][right_slot];
        next[week][left_group][left_slot] = right_person;
        next[week][right_group][right_slot] = left_person;
        recorded.push((week, unordered_pair(left_person, right_person)));
    }

    tabu.record_iteration(iteration, &recorded, tabu_telemetry);
    next
}

#[derive(Debug, Clone)]
struct WeekTabuLists {
    history: Vec<VecDeque<(u64, Vec<(usize, usize)>)>>,
}

impl WeekTabuLists {
    fn new(num_weeks: usize) -> Self {
        Self {
            history: vec![VecDeque::new(); num_weeks],
        }
    }

    fn prune(&mut self, current_iteration: u64) {
        for week in &mut self.history {
            while week
                .front()
                .is_some_and(|(iteration, _)| iteration + TABU_TENURE_ITERATIONS <= current_iteration)
            {
                week.pop_front();
            }
        }
    }

    fn contains(&self, week: usize, pair: (usize, usize)) -> bool {
        self.history[week]
            .iter()
            .any(|(_, pairs)| pairs.contains(&pair))
    }

    fn record_iteration(
        &mut self,
        iteration: u64,
        recorded_pairs: &[(usize, (usize, usize))],
        telemetry: &mut SgpWeekPairTabuBenchmarkTelemetry,
    ) {
        let mut per_week: HashMap<usize, Vec<(usize, usize)>> = HashMap::new();
        for (week, pair) in recorded_pairs {
            per_week.entry(*week).or_default().push(*pair);
            telemetry.recorded_swaps += 1;
            telemetry.realized_tenure_sum += TABU_TENURE_ITERATIONS;
            telemetry.realized_tenure_min = Some(
                telemetry
                    .realized_tenure_min
                    .map_or(TABU_TENURE_ITERATIONS, |current| current.min(TABU_TENURE_ITERATIONS)),
            );
            telemetry.realized_tenure_max = Some(
                telemetry
                    .realized_tenure_max
                    .map_or(TABU_TENURE_ITERATIONS, |current| current.max(TABU_TENURE_ITERATIONS)),
            );
        }
        for (week, pairs) in per_week {
            self.history[week].push_back((iteration, pairs));
        }
    }
}

fn unordered_pair(left: usize, right: usize) -> (usize, usize) {
    if left < right {
        (left, right)
    } else {
        (right, left)
    }
}

fn build_solver_result(
    input: &ApiInput,
    problem: &PureSgpProblem,
    schedule: &[Vec<Vec<usize>>],
    no_improvement_count: u64,
    effective_seed: u64,
    stop_reason: StopReason,
    benchmark_telemetry: Option<SolverBenchmarkTelemetry>,
) -> Result<SolverResult, SolverError> {
    let api_schedule = to_api_schedule(problem, schedule);
    let canonical = canonical_score_for_schedule(input, &api_schedule)?;

    Ok(SolverResult {
        final_score: canonical.total_score,
        schedule: api_schedule,
        unique_contacts: canonical.unique_contacts,
        repetition_penalty: canonical.repetition_penalty,
        attribute_balance_penalty: canonical.attribute_balance_penalty.round() as i32,
        constraint_penalty: canonical.constraint_penalty,
        no_improvement_count,
        weighted_repetition_penalty: canonical.weighted_repetition_penalty,
        weighted_constraint_penalty: canonical.weighted_constraint_penalty,
        effective_seed: Some(effective_seed),
        move_policy: Some(crate::models::MovePolicy::default()),
        stop_reason: Some(stop_reason),
        benchmark_telemetry,
    })
}

fn canonical_score_for_schedule(
    input: &ApiInput,
    schedule: &ApiSchedule,
) -> Result<FullScoreSnapshot, SolverError> {
    let mut canonical_input = input.clone();
    canonical_input.initial_schedule = Some(schedule.clone());
    canonical_input.construction_seed_schedule = None;

    let mut solver_override = crate::default_solver_configuration_for(SolverKind::Solver2);
    solver_override.stop_conditions = canonical_input.solver.stop_conditions.clone();
    solver_override.logging = canonical_input.solver.logging.clone();
    solver_override.telemetry = canonical_input.solver.telemetry.clone();
    solver_override.seed = canonical_input.solver.seed;
    solver_override.move_policy = canonical_input.solver.move_policy.clone();
    solver_override.allowed_sessions = canonical_input.solver.allowed_sessions.clone();
    canonical_input.solver = solver_override;

    let state = SolutionState::from_input(&canonical_input).map_err(|error| {
        SolverError::ValidationError(format!(
            "solver4 could not canonicalize its final schedule through solver2 scoring: {error}"
        ))
    })?;

    Ok(state.current_score.clone())
}

fn to_api_schedule(
    problem: &PureSgpProblem,
    schedule: &[Vec<Vec<usize>>],
) -> HashMap<String, HashMap<String, Vec<String>>> {
    let mut api = HashMap::new();
    for (week_idx, groups) in schedule.iter().enumerate() {
        let mut week_map = HashMap::new();
        for (group_idx, members) in groups.iter().enumerate() {
            week_map.insert(
                problem.groups[group_idx].clone(),
                members
                    .iter()
                    .map(|person_idx| problem.people[*person_idx].clone())
                    .collect(),
            );
        }
        api.insert(format!("session_{week_idx}"), week_map);
    }
    api
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{
        Constraint, Group, LoggingOptions, Person, ProblemDefinition, Solver4DiagnosticsParams,
        Solver4Params, SolverConfiguration, SolverKind, SolverParams, StopConditions,
    };
    use std::collections::HashMap;

    fn evaluated(problem: &PureSgpProblem, schedule: &[Vec<Vec<usize>>]) -> EvaluatedSchedule {
        EvaluatedSchedule::from_schedule(problem, schedule.to_vec())
    }

    fn sample_problem(num_groups: usize, group_size: usize, num_weeks: usize) -> PureSgpProblem {
        PureSgpProblem {
            people: (0..(num_groups * group_size))
                .map(|idx| format!("p{idx}"))
                .collect(),
            groups: (0..num_groups).map(|idx| format!("g{idx}")).collect(),
            num_people: num_groups * group_size,
            num_groups,
            group_size,
            num_weeks,
        }
    }

    fn shuffled_week(num_people: usize, rng: &mut ChaCha12Rng) -> Vec<usize> {
        let mut people: Vec<usize> = (0..num_people).collect();
        for idx in (1..people.len()).rev() {
            let swap_idx = rng.random_range(0..=idx);
            people.swap(idx, swap_idx);
        }
        people
    }

    fn random_schedule(problem: &PureSgpProblem, rng: &mut ChaCha12Rng) -> Vec<Vec<Vec<usize>>> {
        let mut schedule = Vec::with_capacity(problem.num_weeks);
        for _ in 0..problem.num_weeks {
            let shuffled = shuffled_week(problem.num_people, rng);
            let mut week = Vec::with_capacity(problem.num_groups);
            for group in 0..problem.num_groups {
                let start = group * problem.group_size;
                let end = start + problem.group_size;
                week.push(shuffled[start..end].to_vec());
            }
            schedule.push(week);
        }
        schedule
    }

    #[derive(Debug, Clone, PartialEq, Eq)]
    struct LocalSearchIterationTrace {
        iteration: u64,
        breakout_applied: bool,
        selected_swap: Option<(usize, usize, usize)>,
        current_conflict_positions: usize,
        best_conflict_positions: usize,
        no_improvement_count: u64,
        tabu_recorded_pairs: Vec<(usize, (usize, usize))>,
        raw_tabu_hits_delta: u64,
        aspiration_overrides_delta: u64,
    }

    fn simulate_local_search_iterations(
        problem: &PureSgpProblem,
        initial_schedule: &[Vec<Vec<usize>>],
        initial_best_conflict_positions: Option<usize>,
        step_count: usize,
        rng_seed: u64,
    ) -> Vec<LocalSearchIterationTrace> {
        let mut schedule = initial_schedule.to_vec();
        let mut current = evaluated(problem, &schedule);
        let mut best = current.clone();
        if let Some(best_conflict_positions) = initial_best_conflict_positions {
            best.conflict_positions = best_conflict_positions;
        }
        let mut no_improvement_count = 0u64;
        let mut tabu = WeekTabuLists::new(problem.num_weeks);
        let mut telemetry = SgpWeekPairTabuBenchmarkTelemetry::default();
        let mut rng = ChaCha12Rng::seed_from_u64(rng_seed);
        let mut trace = Vec::with_capacity(step_count);

        for iteration in 0..step_count as u64 {
            let breakout_applied = should_apply_random_breakout(no_improvement_count);
            let raw_tabu_hits_before = telemetry.raw_tabu_hits;
            let aspiration_overrides_before = telemetry.aspiration_overrides;

            let (selected_swap, tabu_recorded_pairs, next_schedule) = if breakout_applied {
                let next = apply_random_breakout(
                    problem,
                    &schedule,
                    &mut rng,
                    &mut tabu,
                    iteration,
                    &mut telemetry,
                );
                (None, Vec::new(), next)
            } else {
                let selection = select_best_swap(
                    problem,
                    &schedule,
                    &current,
                    &best,
                    &mut tabu,
                    iteration,
                    &mut telemetry,
                );
                if let Some(candidate) = selection {
                    let pair = unordered_pair(candidate.left_person, candidate.right_person);
                    let recorded = vec![(candidate.week, pair)];
                    tabu.record_iteration(iteration, &recorded, &mut telemetry);
                    (
                        Some((candidate.week, candidate.left_person, candidate.right_person)),
                        recorded,
                        candidate.schedule,
                    )
                } else {
                    (None, Vec::new(), schedule.clone())
                }
            };

            let previous_conflict_positions = current.conflict_positions;
            schedule = next_schedule;
            current = evaluated(problem, &schedule);
            let improved_current = current.conflict_positions < previous_conflict_positions;
            let improved_best = current.conflict_positions < best.conflict_positions;
            if improved_best {
                best = current.clone();
            }
            no_improvement_count = next_no_improvement_count(
                no_improvement_count,
                improved_current,
                breakout_applied,
            );

            trace.push(LocalSearchIterationTrace {
                iteration,
                breakout_applied,
                selected_swap,
                current_conflict_positions: current.conflict_positions,
                best_conflict_positions: best.conflict_positions,
                no_improvement_count,
                tabu_recorded_pairs,
                raw_tabu_hits_delta: telemetry.raw_tabu_hits - raw_tabu_hits_before,
                aspiration_overrides_delta: telemetry.aspiration_overrides
                    - aspiration_overrides_before,
            });
        }

        trace
    }

    fn enumerated_conflict_affecting_swaps(
        problem: &PureSgpProblem,
        _schedule: &[Vec<Vec<usize>>],
        current: &EvaluatedSchedule,
    ) -> Vec<(usize, usize, usize, usize, usize)> {
        let mut swaps = Vec::new();
        for week in 0..problem.num_weeks {
            for left_group in 0..problem.num_groups {
                for right_group in (left_group + 1)..problem.num_groups {
                    for left_slot in 0..problem.group_size {
                        let left_position = problem.position_id(week, left_group, left_slot);
                        for right_slot in 0..problem.group_size {
                            let right_position = problem.position_id(week, right_group, right_slot);
                            if current.incident_counts[left_position] == 0
                                && current.incident_counts[right_position] == 0
                            {
                                continue;
                            }
                            swaps.push((week, left_group, left_slot, right_group, right_slot));
                        }
                    }
                }
            }
        }
        swaps
    }

    fn pure_problem(num_groups: u32, group_size: u32, weeks: u32) -> ProblemDefinition {
        let num_people = num_groups * group_size;
        ProblemDefinition {
            people: (0..num_people)
                .map(|idx| Person {
                    id: format!("p{idx}"),
                    attributes: HashMap::new(),
                    sessions: None,
                })
                .collect(),
            groups: (0..num_groups)
                .map(|idx| Group {
                    id: format!("g{idx}"),
                    size: group_size,
                    session_sizes: None,
                })
                .collect(),
            num_sessions: weeks,
        }
    }

    fn solver4_config() -> SolverConfiguration {
        SolverConfiguration {
            solver_type: SolverKind::Solver4.canonical_id().into(),
            stop_conditions: StopConditions {
                max_iterations: Some(10_000),
                time_limit_seconds: Some(5),
                no_improvement_iterations: Some(1_000),
                stop_on_optimal_score: true,
            },
            solver_params: SolverParams::Solver4(Solver4Params::default()),
            logging: LoggingOptions::default(),
            telemetry: Default::default(),
            seed: Some(7),
            move_policy: None,
            allowed_sessions: None,
        }
    }

    fn repeat_constraint() -> Constraint {
        Constraint::RepeatEncounter(RepeatEncounterParams {
            max_allowed_encounters: 0,
            penalty_function: "squared".into(),
            penalty_weight: 10.0,
        })
    }

    #[test]
    fn pure_problem_gate_rejects_partial_attendance() {
        let mut problem = pure_problem(2, 2, 2);
        problem.people[0].sessions = Some(vec![0]);
        let input = ApiInput {
            problem,
            initial_schedule: None,
            construction_seed_schedule: None,
            objectives: vec![],
            constraints: vec![repeat_constraint()],
            solver: solver4_config(),
        };
        let error = PureSgpProblem::from_input(&input).unwrap_err();
        assert!(error.to_string().contains("partial attendance"));
    }

    #[test]
    fn pure_problem_gate_rejects_repeat_constraint_above_canonical_zero_repeat_encoding() {
        let input = ApiInput {
            problem: pure_problem(2, 2, 2),
            initial_schedule: None,
            construction_seed_schedule: None,
            objectives: vec![],
            constraints: vec![Constraint::RepeatEncounter(RepeatEncounterParams {
                max_allowed_encounters: 2,
                penalty_function: "squared".into(),
                penalty_weight: 10.0,
            })],
            solver: solver4_config(),
        };
        let error = PureSgpProblem::from_input(&input).unwrap_err();
        assert!(error.to_string().contains("must be 0 or 1"));
    }

    #[test]
    fn solver4_solves_small_pure_instance() {
        let input = ApiInput {
            problem: pure_problem(2, 2, 2),
            initial_schedule: None,
            construction_seed_schedule: None,
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".into(),
                weight: 1.0,
            }],
            constraints: vec![repeat_constraint()],
            solver: solver4_config(),
        };
        let engine = SearchEngine::new(&input.solver);
        let result = engine.solve(&input).unwrap();
        assert_eq!(result.stop_reason, Some(StopReason::OptimalScoreReached));
    }

    #[test]
    fn solver4_complete_backtracking_solves_small_instance() {
        let mut config = solver4_config();
        config.solver_params = SolverParams::Solver4(Solver4Params {
            mode: Solver4Mode::CompleteBacktracking,
            gamma: 0.0,
            backtracking_pattern: Some("2".into()),
            diagnostics: Solver4DiagnosticsParams::default(),
        });
        let input = ApiInput {
            problem: pure_problem(2, 2, 2),
            initial_schedule: None,
            construction_seed_schedule: None,
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".into(),
                weight: 1.0,
            }],
            constraints: vec![repeat_constraint()],
            solver: config,
        };
        let engine = SearchEngine::new(&input.solver);
        let result = engine.solve(&input).unwrap();
        assert_eq!(result.stop_reason, Some(StopReason::OptimalScoreReached));
    }

    #[test]
    fn solver4_final_result_uses_canonical_repo_scoring() {
        let input = ApiInput {
            problem: pure_problem(1, 2, 2),
            initial_schedule: None,
            construction_seed_schedule: None,
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".into(),
                weight: 1.0,
            }],
            constraints: vec![repeat_constraint()],
            solver: solver4_config(),
        };

        let schedule = HashMap::from([
            (
                "session_0".to_string(),
                HashMap::from([("g0".to_string(), vec!["p0".to_string(), "p1".to_string()])]),
            ),
            (
                "session_1".to_string(),
                HashMap::from([("g0".to_string(), vec!["p0".to_string(), "p1".to_string()])]),
            ),
        ]);

        let canonical = canonical_score_for_schedule(&input, &schedule).unwrap();
        assert_eq!(canonical.unique_contacts, 1);
        assert_eq!(canonical.repetition_penalty, 4);
        assert_eq!(canonical.weighted_repetition_penalty, 40.0);
        assert_eq!(canonical.weighted_constraint_penalty, 0.0);
        assert_eq!(canonical.total_score, 40.0);
    }

    #[test]
    fn backtracking_pattern_rejects_invalid_sum() {
        let error = BacktrackingPattern::parse(4, "3").unwrap_err();
        assert!(error.to_string().contains("must sum to the group size 4"));
    }

    #[test]
    fn default_backtracking_pattern_matches_pair_then_single_shape() {
        assert_eq!(default_backtracking_pattern(4), vec![2, 2]);
        assert_eq!(default_backtracking_pattern(5), vec![2, 2, 1]);
        assert_eq!(default_backtracking_pattern(3), vec![2, 1]);
    }

    #[test]
    fn freedom_of_set_matches_paper_intersection_semantics() {
        let mut partnered = vec![vec![false; 5]; 5];
        partnered[0][2] = true;
        partnered[2][0] = true;
        partnered[1][3] = true;
        partnered[3][1] = true;

        let freedom = freedom_of_set(&[0, 1], &partnered);

        assert_eq!(freedom, 1);
    }

    #[test]
    fn chunk_candidates_are_sorted_by_minimal_freedom_then_lexicographic() {
        let mut partnered = vec![vec![false; 4]; 4];
        partnered[0][2] = true;
        partnered[2][0] = true;
        let candidates = ordered_chunk_candidates(&[0, 1, 2, 3], &[], 2, &partnered);
        let freedoms: Vec<_> = candidates.iter().map(|candidate| candidate.freedom).collect();
        assert_eq!(freedoms, vec![1, 1, 1, 1, 2]);
        assert_eq!(candidates[0].members, vec![0, 1]);
        assert_eq!(candidates[1].members, vec![0, 3]);
    }

    #[test]
    fn greedy_constructor_is_deterministic_for_fixed_seed() {
        let problem = PureSgpProblem {
            people: vec!["p0".into(), "p1".into(), "p2".into(), "p3".into()],
            groups: vec!["g0".into(), "g1".into()],
            num_people: 4,
            num_groups: 2,
            group_size: 2,
            num_weeks: 2,
        };
        let mut left_rng = ChaCha12Rng::seed_from_u64(7);
        let mut right_rng = ChaCha12Rng::seed_from_u64(7);
        let left = build_greedy_initial_schedule(&problem, 0.0, &mut left_rng);
        let right = build_greedy_initial_schedule(&problem, 0.0, &mut right_rng);
        assert_eq!(left, right);
    }

    #[test]
    fn gamma_zero_pair_choice_uses_lexicographic_order_for_ties() {
        let remaining = vec![0, 1, 2, 3];
        let partnered = vec![vec![false; 4]; 4];
        let penalties = vec![vec![0usize; 4]; 4];
        let mut rng = ChaCha12Rng::seed_from_u64(1);

        let chosen = choose_best_pair(&remaining, &partnered, &penalties, 0.0, &mut rng);

        assert_eq!(chosen, (0, 1));
    }

    #[test]
    fn gamma_zero_odd_group_singleton_uses_smallest_remaining_player() {
        let remaining = vec![2, 4, 7];
        let mut rng = ChaCha12Rng::seed_from_u64(3);

        let chosen = choose_last_singleton(&remaining, 0.0, &mut rng);

        assert_eq!(chosen, 2);
    }

    #[test]
    fn greedy_constructor_applies_future_week_pair_penalty() {
        let problem = sample_problem(2, 2, 2);
        let mut rng = ChaCha12Rng::seed_from_u64(0);

        let schedule = build_greedy_initial_schedule(&problem, 0.0, &mut rng);

        assert_eq!(schedule, vec![vec![vec![0, 1], vec![2, 3]], vec![vec![0, 2], vec![1, 3]]]);
    }

    #[test]
    fn greedy_initializer_trace_locks_even_group_pair_sequence_and_scores() {
        let problem = sample_problem(2, 2, 2);
        let mut rng = ChaCha12Rng::seed_from_u64(0);

        let (schedule, trace) = build_greedy_initial_schedule_with_trace(&problem, 0.0, &mut rng);

        assert_eq!(schedule, vec![vec![vec![0, 1], vec![2, 3]], vec![vec![0, 2], vec![1, 3]]]);
        assert_eq!(
            trace
                .pair_steps
                .iter()
                .map(|step| (step.week, step.group, step.pair_index, step.chosen.pair()))
                .collect::<Vec<_>>(),
            vec![
                (0, 0, 0, (0, 1)),
                (0, 1, 0, (2, 3)),
                (1, 0, 0, (0, 2)),
                (1, 1, 0, (1, 3)),
            ]
        );

        assert_eq!(
            trace.pair_steps[0].scored_candidates,
            vec![
                PairCandidateScore {
                    left: 0,
                    right: 1,
                    raw_freedom: 2,
                    repeat_penalty_count: 0,
                    adjusted_freedom: 2,
                },
                PairCandidateScore {
                    left: 0,
                    right: 2,
                    raw_freedom: 2,
                    repeat_penalty_count: 0,
                    adjusted_freedom: 2,
                },
                PairCandidateScore {
                    left: 0,
                    right: 3,
                    raw_freedom: 2,
                    repeat_penalty_count: 0,
                    adjusted_freedom: 2,
                },
                PairCandidateScore {
                    left: 1,
                    right: 2,
                    raw_freedom: 2,
                    repeat_penalty_count: 0,
                    adjusted_freedom: 2,
                },
                PairCandidateScore {
                    left: 1,
                    right: 3,
                    raw_freedom: 2,
                    repeat_penalty_count: 0,
                    adjusted_freedom: 2,
                },
                PairCandidateScore {
                    left: 2,
                    right: 3,
                    raw_freedom: 2,
                    repeat_penalty_count: 0,
                    adjusted_freedom: 2,
                },
            ]
        );
        assert_eq!(
            trace.pair_steps[2].scored_candidates,
            vec![
                PairCandidateScore {
                    left: 0,
                    right: 2,
                    raw_freedom: 0,
                    repeat_penalty_count: 0,
                    adjusted_freedom: 0,
                },
                PairCandidateScore {
                    left: 0,
                    right: 3,
                    raw_freedom: 0,
                    repeat_penalty_count: 0,
                    adjusted_freedom: 0,
                },
                PairCandidateScore {
                    left: 1,
                    right: 2,
                    raw_freedom: 0,
                    repeat_penalty_count: 0,
                    adjusted_freedom: 0,
                },
                PairCandidateScore {
                    left: 1,
                    right: 3,
                    raw_freedom: 0,
                    repeat_penalty_count: 0,
                    adjusted_freedom: 0,
                },
                PairCandidateScore {
                    left: 0,
                    right: 1,
                    raw_freedom: 2,
                    repeat_penalty_count: 1,
                    adjusted_freedom: -999_998,
                },
                PairCandidateScore {
                    left: 2,
                    right: 3,
                    raw_freedom: 2,
                    repeat_penalty_count: 1,
                    adjusted_freedom: -999_998,
                },
            ]
        );
    }

    #[test]
    fn greedy_initializer_trace_records_group_completion_after_pair_selection() {
        let problem = sample_problem(2, 2, 2);
        let mut rng = ChaCha12Rng::seed_from_u64(0);

        let (_, trace) = build_greedy_initial_schedule_with_trace(&problem, 0.0, &mut rng);

        assert_eq!(
            trace.group_steps,
            vec![
                GreedyGroupStep {
                    week: 0,
                    group: 0,
                    members: vec![0, 1],
                    selected_pairs: vec![(0, 1)],
                    singleton: None,
                    penalty_updates: vec![PairPenaltyUpdate {
                        pair: (0, 1),
                        new_penalty: 1,
                    }],
                    partnered_pairs_noted: vec![(0, 1)],
                },
                GreedyGroupStep {
                    week: 0,
                    group: 1,
                    members: vec![2, 3],
                    selected_pairs: vec![(2, 3)],
                    singleton: None,
                    penalty_updates: vec![PairPenaltyUpdate {
                        pair: (2, 3),
                        new_penalty: 1,
                    }],
                    partnered_pairs_noted: vec![(2, 3)],
                },
                GreedyGroupStep {
                    week: 1,
                    group: 0,
                    members: vec![0, 2],
                    selected_pairs: vec![(0, 2)],
                    singleton: None,
                    penalty_updates: vec![PairPenaltyUpdate {
                        pair: (0, 2),
                        new_penalty: 1,
                    }],
                    partnered_pairs_noted: vec![(0, 2)],
                },
                GreedyGroupStep {
                    week: 1,
                    group: 1,
                    members: vec![1, 3],
                    selected_pairs: vec![(1, 3)],
                    singleton: None,
                    penalty_updates: vec![PairPenaltyUpdate {
                        pair: (1, 3),
                        new_penalty: 1,
                    }],
                    partnered_pairs_noted: vec![(1, 3)],
                },
            ]
        );
    }

    #[test]
    fn greedy_initializer_trace_locks_odd_group_pair_and_singleton_sequence() {
        let problem = sample_problem(1, 3, 2);
        let mut rng = ChaCha12Rng::seed_from_u64(0);

        let (schedule, trace) = build_greedy_initial_schedule_with_trace(&problem, 0.0, &mut rng);

        assert_eq!(schedule, vec![vec![vec![0, 1, 2]], vec![vec![0, 2, 1]]]);
        assert_eq!(
            trace
                .pair_steps
                .iter()
                .map(|step| (step.week, step.group, step.pair_index, step.chosen.pair()))
                .collect::<Vec<_>>(),
            vec![(0, 0, 0, (0, 1)), (1, 0, 0, (0, 2))]
        );
        assert_eq!(
            trace
                .singleton_steps
                .iter()
                .map(|step| (step.week, step.group, step.remaining_before.clone(), step.chosen))
                .collect::<Vec<_>>(),
            vec![(0, 0, vec![2], 2), (1, 0, vec![1], 1)]
        );
        assert_eq!(
            trace.group_steps,
            vec![
                GreedyGroupStep {
                    week: 0,
                    group: 0,
                    members: vec![0, 1, 2],
                    selected_pairs: vec![(0, 1)],
                    singleton: Some(2),
                    penalty_updates: vec![PairPenaltyUpdate {
                        pair: (0, 1),
                        new_penalty: 1,
                    }],
                    partnered_pairs_noted: vec![(0, 1), (0, 2), (1, 2)],
                },
                GreedyGroupStep {
                    week: 1,
                    group: 0,
                    members: vec![0, 2, 1],
                    selected_pairs: vec![(0, 2)],
                    singleton: Some(1),
                    penalty_updates: vec![PairPenaltyUpdate {
                        pair: (0, 2),
                        new_penalty: 1,
                    }],
                    partnered_pairs_noted: vec![(0, 2), (0, 1), (2, 1)],
                },
            ]
        );
        assert_eq!(
            trace.pair_steps[1].scored_candidates,
            vec![
                PairCandidateScore {
                    left: 0,
                    right: 2,
                    raw_freedom: 0,
                    repeat_penalty_count: 0,
                    adjusted_freedom: 0,
                },
                PairCandidateScore {
                    left: 1,
                    right: 2,
                    raw_freedom: 0,
                    repeat_penalty_count: 0,
                    adjusted_freedom: 0,
                },
                PairCandidateScore {
                    left: 0,
                    right: 1,
                    raw_freedom: 0,
                    repeat_penalty_count: 1,
                    adjusted_freedom: -1_000_000,
                },
            ]
        );
    }

    #[test]
    fn greedy_initializer_uses_full_group_selection_for_size_four() {
        let problem = sample_problem(2, 4, 1);
        let mut rng = ChaCha12Rng::seed_from_u64(0);

        let (schedule, trace) = build_greedy_initial_schedule_with_trace(&problem, 0.0, &mut rng);

        assert_eq!(schedule, vec![vec![vec![0, 1, 2, 3], vec![4, 5, 6, 7]]]);
        assert!(trace.pair_steps.is_empty());
        assert!(trace.singleton_steps.is_empty());
        assert_eq!(
            trace.group_steps,
            vec![
                GreedyGroupStep {
                    week: 0,
                    group: 0,
                    members: vec![0, 1, 2, 3],
                    selected_pairs: vec![(0, 1), (0, 2), (0, 3), (1, 2), (1, 3), (2, 3)],
                    singleton: None,
                    penalty_updates: vec![
                        PairPenaltyUpdate { pair: (0, 1), new_penalty: 1 },
                        PairPenaltyUpdate { pair: (0, 2), new_penalty: 1 },
                        PairPenaltyUpdate { pair: (0, 3), new_penalty: 1 },
                        PairPenaltyUpdate { pair: (1, 2), new_penalty: 1 },
                        PairPenaltyUpdate { pair: (1, 3), new_penalty: 1 },
                        PairPenaltyUpdate { pair: (2, 3), new_penalty: 1 },
                    ],
                    partnered_pairs_noted: vec![(0, 1), (0, 2), (0, 3), (1, 2), (1, 3), (2, 3)],
                },
                GreedyGroupStep {
                    week: 0,
                    group: 1,
                    members: vec![4, 5, 6, 7],
                    selected_pairs: vec![(4, 5), (4, 6), (4, 7), (5, 6), (5, 7), (6, 7)],
                    singleton: None,
                    penalty_updates: vec![
                        PairPenaltyUpdate { pair: (4, 5), new_penalty: 1 },
                        PairPenaltyUpdate { pair: (4, 6), new_penalty: 1 },
                        PairPenaltyUpdate { pair: (4, 7), new_penalty: 1 },
                        PairPenaltyUpdate { pair: (5, 6), new_penalty: 1 },
                        PairPenaltyUpdate { pair: (5, 7), new_penalty: 1 },
                        PairPenaltyUpdate { pair: (6, 7), new_penalty: 1 },
                    ],
                    partnered_pairs_noted: vec![(4, 5), (4, 6), (4, 7), (5, 6), (5, 7), (6, 7)],
                },
            ]
        );
    }

    #[test]
    fn note_group_partnerships_marks_full_group_pairwise_history() {
        let mut partnered = vec![vec![false; 4]; 4];

        note_group_partnerships(&[0, 1, 2], &mut partnered);

        assert!(partnered[0][1]);
        assert!(partnered[1][0]);
        assert!(partnered[0][2]);
        assert!(partnered[2][0]);
        assert!(partnered[1][2]);
        assert!(partnered[2][1]);
        assert!(!partnered[0][3]);
    }

    #[test]
    fn breakout_is_not_applied_before_four_non_improving_iterations() {
        assert!(!should_apply_random_breakout(0));
        assert!(!should_apply_random_breakout(1));
        assert!(!should_apply_random_breakout(2));
        assert!(!should_apply_random_breakout(3));
    }

    #[test]
    fn breakout_is_applied_exactly_when_streak_reaches_four() {
        assert!(should_apply_random_breakout(4));
    }

    #[test]
    fn breakout_resets_the_stagnation_counter() {
        assert_eq!(next_no_improvement_count(4, false, true), 0);
        assert_eq!(next_no_improvement_count(3, false, false), 4);
        assert_eq!(next_no_improvement_count(3, true, false), 0);
    }

    #[test]
    fn conflict_positions_are_zero_without_repeated_pairs() {
        let problem = sample_problem(2, 2, 2);
        let schedule = vec![vec![vec![0, 1], vec![2, 3]], vec![vec![0, 2], vec![1, 3]]];

        let evaluated = evaluated(&problem, &schedule);

        assert_eq!(evaluated.conflict_positions, 0);
        assert_eq!(evaluated.repeat_excess, 0);
    }

    #[test]
    fn conflict_positions_count_both_occurrences_of_one_repeated_pair() {
        let problem = sample_problem(1, 2, 2);
        let schedule = vec![vec![vec![0, 1]], vec![vec![0, 1]]];

        let evaluated = evaluated(&problem, &schedule);

        assert_eq!(evaluated.conflict_positions, 4);
        assert_eq!(evaluated.repeat_excess, 1);
    }

    #[test]
    fn conflict_positions_cover_all_slots_of_repeated_triple_groups() {
        let problem = sample_problem(1, 3, 2);
        let schedule = vec![vec![vec![0, 1, 2]], vec![vec![0, 1, 2]]];

        let evaluated = evaluated(&problem, &schedule);

        assert_eq!(evaluated.conflict_positions, 6);
        assert_eq!(evaluated.repeat_excess, 3);
        assert!(evaluated.incident_counts.iter().all(|count| *count > 0));
    }

    #[test]
    fn conflict_positions_handle_odd_group_size_partial_repeats() {
        let problem = sample_problem(1, 3, 2);
        let schedule = vec![vec![vec![0, 1, 2]], vec![vec![0, 1, 3]]];

        let evaluated = evaluated(&problem, &schedule);

        assert_eq!(evaluated.conflict_positions, 4);
        assert_eq!(evaluated.repeat_excess, 1);
        assert_eq!(evaluated.incident_counts, vec![1, 1, 0, 1, 1, 0]);
    }

    #[test]
    fn swap_preview_matches_full_recompute_on_small_random_schedules() {
        let problem = sample_problem(3, 3, 4);
        let mut rng = ChaCha12Rng::seed_from_u64(11);

        for _ in 0..32 {
            let schedule = random_schedule(&problem, &mut rng);
            let current = evaluated(&problem, &schedule);

            for week in 0..problem.num_weeks {
                for left_group in 0..problem.num_groups {
                    for right_group in (left_group + 1)..problem.num_groups {
                        for left_slot in 0..problem.group_size {
                            for right_slot in 0..problem.group_size {
                                let preview = evaluate_swap_conflict_positions(
                                    &problem,
                                    &schedule,
                                    &current,
                                    week,
                                    left_group,
                                    left_slot,
                                    right_group,
                                    right_slot,
                                );
                                let swapped = apply_swap(
                                    &schedule,
                                    week,
                                    left_group,
                                    left_slot,
                                    right_group,
                                    right_slot,
                                );
                                let recomputed = evaluated(&problem, &swapped);
                                assert_eq!(
                                    preview, recomputed.conflict_positions,
                                    "preview mismatch for week={week} groups=({left_group},{right_group}) slots=({left_slot},{right_slot})",
                                );
                            }
                        }
                    }
                }
            }
        }
    }

    #[test]
    fn swap_candidate_outranks_by_resulting_configuration_lexicographic_order() {
        let base_schedule = vec![vec![vec![0, 1], vec![2, 3]], vec![vec![0, 1], vec![2, 3]]];
        let left = SwapCandidate {
            week: 0,
            left_group: 0,
            left_slot: 0,
            right_group: 1,
            right_slot: 0,
            left_person: 0,
            right_person: 2,
            conflict_positions_after: 0,
        };
        let right = SwapCandidate {
            week: 0,
            left_group: 0,
            left_slot: 1,
            right_group: 1,
            right_slot: 0,
            left_person: 1,
            right_person: 2,
            conflict_positions_after: 0,
        };

        assert!(!left.outranks(&right, &base_schedule));
        assert!(right.outranks(&left, &base_schedule));
    }

    #[test]
    fn select_best_swap_uses_explicit_lexicographic_tie_breaking() {
        let problem = sample_problem(2, 2, 2);
        let schedule = vec![vec![vec![0, 1], vec![2, 3]], vec![vec![0, 1], vec![2, 3]]];
        let current = evaluated(&problem, &schedule);
        let mut tabu = WeekTabuLists::new(problem.num_weeks);
        let mut tabu_telemetry = SgpWeekPairTabuBenchmarkTelemetry::default();

        let selected = select_best_swap(
            &problem,
            &schedule,
            &current,
            &current,
            &mut tabu,
            0,
            &mut tabu_telemetry,
        )
        .expect("expected a best swap");

        assert_eq!(selected.week, 1);
        assert_eq!(selected.left_person, 1);
        assert_eq!(selected.right_person, 2);
        assert_eq!(selected.schedule, vec![
            vec![vec![0, 1], vec![2, 3]],
            vec![vec![0, 2], vec![1, 3]],
        ]);
    }

    #[test]
    fn tabu_list_keeps_pairs_for_exactly_last_ten_iterations() {
        let mut tabu = WeekTabuLists::new(1);
        let mut telemetry = SgpWeekPairTabuBenchmarkTelemetry::default();
        tabu.record_iteration(0, &[(0, (1, 2))], &mut telemetry);
        for iteration in 1..10 {
            tabu.prune(iteration);
            assert!(tabu.contains(0, (1, 2)));
        }
        tabu.prune(10);
        assert!(!tabu.contains(0, (1, 2)));
    }

    #[test]
    fn breakout_records_both_random_swaps_in_same_iteration_window() {
        let problem = sample_problem(2, 2, 2);
        let schedule = vec![vec![vec![0, 1], vec![2, 3]], vec![vec![0, 2], vec![1, 3]]];
        let mut rng = ChaCha12Rng::seed_from_u64(5);
        let mut tabu = WeekTabuLists::new(problem.num_weeks);
        let mut telemetry = SgpWeekPairTabuBenchmarkTelemetry::default();
        let _ = apply_random_breakout(&problem, &schedule, &mut rng, &mut tabu, 3, &mut telemetry);
        assert_eq!(telemetry.recorded_swaps, 2);
        for week in 0..problem.num_weeks {
            assert!(tabu.history[week]
                .iter()
                .all(|(iteration, _)| *iteration == 3));
        }
    }

    #[test]
    fn local_search_trace_locks_first_two_iterations_on_repeated_pair_fixture() {
        let problem = sample_problem(2, 2, 3);
        let schedule = vec![
            vec![vec![0, 1], vec![2, 3]],
            vec![vec![0, 1], vec![2, 3]],
            vec![vec![0, 1], vec![2, 3]],
        ];

        let trace = simulate_local_search_iterations(&problem, &schedule, None, 2, 0);

        assert_eq!(
            trace,
            vec![
                LocalSearchIterationTrace {
                    iteration: 0,
                    breakout_applied: false,
                    selected_swap: Some((2, 1, 2)),
                    current_conflict_positions: 8,
                    best_conflict_positions: 8,
                    no_improvement_count: 0,
                    tabu_recorded_pairs: vec![(2, (1, 2))],
                    raw_tabu_hits_delta: 0,
                    aspiration_overrides_delta: 0,
                },
                LocalSearchIterationTrace {
                    iteration: 1,
                    breakout_applied: false,
                    selected_swap: Some((1, 1, 3)),
                    current_conflict_positions: 0,
                    best_conflict_positions: 0,
                    no_improvement_count: 0,
                    tabu_recorded_pairs: vec![(1, (1, 3))],
                    raw_tabu_hits_delta: 0,
                    aspiration_overrides_delta: 0,
                },
            ]
        );
    }

    #[test]
    fn neighborhood_is_all_swaps_with_at_least_one_conflict_position() {
        let problem = sample_problem(3, 2, 2);
        let schedule = vec![
            vec![vec![0, 1], vec![2, 3], vec![4, 5]],
            vec![vec![0, 1], vec![2, 4], vec![3, 5]],
        ];
        let current = evaluated(&problem, &schedule);

        let swaps = enumerated_conflict_affecting_swaps(&problem, &schedule, &current);

        assert!(swaps.contains(&(0, 0, 0, 1, 0)));
        assert!(swaps.contains(&(1, 0, 1, 2, 1)));
        assert!(!swaps.contains(&(0, 1, 0, 2, 0)));
        assert!(!swaps.contains(&(1, 1, 1, 2, 1)));
    }

    #[test]
    fn tabu_move_is_skipped_when_it_does_not_beat_global_best() {
        let problem = sample_problem(2, 2, 3);
        let schedule = vec![
            vec![vec![0, 1], vec![2, 3]],
            vec![vec![0, 1], vec![2, 3]],
            vec![vec![0, 1], vec![2, 3]],
        ];
        let current = evaluated(&problem, &schedule);
        let mut best = current.clone();
        best.conflict_positions = 8;
        let mut tabu = WeekTabuLists::new(problem.num_weeks);
        let mut tabu_telemetry = SgpWeekPairTabuBenchmarkTelemetry::default();
        tabu.record_iteration(0, &[(2, (1, 2))], &mut tabu_telemetry);

        let selected = select_best_swap(
            &problem,
            &schedule,
            &current,
            &best,
            &mut tabu,
            1,
            &mut tabu_telemetry,
        )
        .expect("expected a non-tabu fallback move");

        assert_eq!(selected.week, 2);
        assert_eq!(selected.left_person, 1);
        assert_eq!(selected.right_person, 3);
        assert_eq!(tabu_telemetry.raw_tabu_hits, 1);
        assert_eq!(tabu_telemetry.aspiration_overrides, 0);
    }

    #[test]
    fn aspiration_allows_tabu_move_when_it_beats_global_best() {
        let problem = sample_problem(2, 2, 3);
        let schedule = vec![
            vec![vec![0, 1], vec![2, 3]],
            vec![vec![0, 1], vec![2, 3]],
            vec![vec![0, 1], vec![2, 3]],
        ];
        let current = evaluated(&problem, &schedule);
        let best = current.clone();
        let mut tabu = WeekTabuLists::new(problem.num_weeks);
        let mut tabu_telemetry = SgpWeekPairTabuBenchmarkTelemetry::default();
        tabu.record_iteration(0, &[(2, (1, 2))], &mut tabu_telemetry);

        let selected = select_best_swap(
            &problem,
            &schedule,
            &current,
            &best,
            &mut tabu,
            1,
            &mut tabu_telemetry,
        )
        .expect("expected aspiration to allow the tabu move");

        assert_eq!(selected.week, 2);
        assert_eq!(selected.left_person, 1);
        assert_eq!(selected.right_person, 2);
        assert_eq!(tabu_telemetry.raw_tabu_hits, 1);
        assert_eq!(tabu_telemetry.aspiration_overrides, 1);
    }

    #[test]
    fn local_search_trace_breakout_triggers_on_fifth_non_improving_iteration() {
        let problem = sample_problem(2, 2, 3);
        let schedule = vec![
            vec![vec![0, 1], vec![2, 3]],
            vec![vec![0, 1], vec![2, 3]],
            vec![vec![0, 1], vec![2, 3]],
        ];

        let trace = simulate_local_search_iterations(&problem, &schedule, Some(0), 7, 5);

        assert_eq!(
            trace.iter().map(|step| step.breakout_applied).collect::<Vec<_>>(),
            vec![false, false, false, false, false, false, true]
        );
        assert_eq!(
            trace.iter().map(|step| step.no_improvement_count).collect::<Vec<_>>(),
            vec![0, 0, 1, 2, 3, 4, 0]
        );
        assert_eq!(trace[0].selected_swap, Some((2, 1, 2)));
        assert_eq!(trace[1].selected_swap, Some((1, 1, 3)));
        assert_eq!(trace[2].selected_swap, None);
        assert_eq!(trace[3].selected_swap, None);
        assert!(trace[4].selected_swap.is_none());
        assert!(trace[5].selected_swap.is_none());
        assert!(trace[6].selected_swap.is_none());
    }
}
