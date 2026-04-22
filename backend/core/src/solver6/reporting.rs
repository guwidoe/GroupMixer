use super::execute_solver6_run;
use super::problem::PureSgpProblem;
use super::score::{
    pure_sgp_linear_repeat_excess_lower_bound, PairFrequencyState, PairFrequencySummary,
};
use super::seed::SeedPairTelemetry;
use crate::models::{
    ApiInput, Constraint, Group, Objective, Person, ProblemDefinition, RepeatEncounterParams,
    Solver6PairRepeatPenaltyModel, Solver6Params, SolverConfiguration, SolverKind, SolverParams,
    StopConditions, StopReason,
};
use crate::solver_support::SolverError;
use rayon::prelude::*;
use serde::Serialize;
use std::collections::HashMap;
use std::time::Instant;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct MatrixBounds {
    pub g_min: usize,
    pub g_max: usize,
    pub p_min: usize,
    pub p_max: usize,
}

impl MatrixBounds {
    pub fn width(&self) -> usize {
        self.p_max - self.p_min + 1
    }

    pub fn height(&self) -> usize {
        self.g_max - self.g_min + 1
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MatrixViewDefinition {
    pub title: String,
    pub subtitle: String,
    pub bounds: MatrixBounds,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Solver6BenchmarkConfigArtifact {
    pub week_cap: usize,
    pub max_people_to_run: usize,
    pub parallel_jobs: usize,
    pub effective_seed: u64,
    pub active_penalty_model: String,
    pub max_iterations: Option<u64>,
    pub no_improvement_iterations: Option<u64>,
    pub time_limit_seconds: Option<u64>,
}

#[derive(Debug, Clone)]
pub struct Solver6BenchmarkConfig {
    pub week_cap: usize,
    pub max_people_to_run: usize,
    pub parallel_jobs: usize,
    pub effective_seed: u64,
    pub stop_conditions: StopConditions,
    pub active_penalty_model: Solver6PairRepeatPenaltyModel,
    pub matrices: Vec<MatrixViewDefinition>,
}

impl Default for Solver6BenchmarkConfig {
    fn default() -> Self {
        Self {
            week_cap: 100,
            max_people_to_run: 36,
            parallel_jobs: 1,
            effective_seed: 42,
            stop_conditions: StopConditions {
                max_iterations: Some(1_000),
                time_limit_seconds: Some(1),
                no_improvement_iterations: Some(150),
                stop_on_optimal_score: true,
            },
            active_penalty_model: Solver6PairRepeatPenaltyModel::LinearRepeatExcess,
            matrices: default_matrix_views(),
        }
    }
}

impl Solver6BenchmarkConfig {
    pub fn to_artifact(&self) -> Solver6BenchmarkConfigArtifact {
        Solver6BenchmarkConfigArtifact {
            week_cap: self.week_cap,
            max_people_to_run: self.max_people_to_run,
            parallel_jobs: self.parallel_jobs,
            effective_seed: self.effective_seed,
            active_penalty_model: penalty_model_label(self.active_penalty_model).into(),
            max_iterations: self.stop_conditions.max_iterations,
            no_improvement_iterations: self.stop_conditions.no_improvement_iterations,
            time_limit_seconds: self.stop_conditions.time_limit_seconds,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionStatus {
    Success,
    Miss,
    Unsupported,
    Timeout,
    Error,
    NotRun,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LayerWeekStatus {
    Exact,
    LowerBoundTight,
    Miss,
    Unsupported,
    Timeout,
    Error,
    NotRun,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ScoreMetrics {
    pub active_penalty_model: String,
    pub active_penalty_score: u64,
    pub linear_repeat_excess: u64,
    pub linear_repeat_lower_bound: u64,
    pub linear_repeat_lower_bound_gap: u64,
    pub squared_repeat_excess: u64,
    pub squared_repeat_lower_bound: u64,
    pub squared_repeat_lower_bound_gap: u64,
    pub distinct_pairs_covered: usize,
    pub total_pair_incidences: usize,
    pub max_pair_frequency: usize,
    pub multiplicity_histogram: Vec<usize>,
}

impl ScoreMetrics {
    fn from_schedule(
        problem: &PureSgpProblem,
        schedule: &[Vec<Vec<usize>>],
        active_penalty_model: Solver6PairRepeatPenaltyModel,
    ) -> Result<Self, SolverError> {
        let num_people = problem.num_groups * problem.group_size;
        let summary = PairFrequencySummary::from_raw_schedule(num_people, schedule)?;
        Ok(Self::from_summary(
            summary,
            problem.num_groups,
            problem.group_size,
            schedule.len(),
            active_penalty_model,
        ))
    }

    fn from_summary(
        summary: PairFrequencySummary,
        num_groups: usize,
        group_size: usize,
        represented_weeks: usize,
        active_penalty_model: Solver6PairRepeatPenaltyModel,
    ) -> Self {
        let linear_repeat_lower_bound = pure_sgp_linear_repeat_excess_lower_bound(
            num_groups,
            group_size,
            represented_weeks,
            summary.universe().total_distinct_pairs(),
            summary.total_pair_incidences(),
        );
        Self {
            active_penalty_model: penalty_model_label(active_penalty_model).into(),
            active_penalty_score: summary.score_for_model(active_penalty_model),
            linear_repeat_excess: summary.linear_repeat_excess(),
            linear_repeat_lower_bound,
            linear_repeat_lower_bound_gap: summary
                .linear_repeat_excess()
                .saturating_sub(linear_repeat_lower_bound),
            squared_repeat_excess: summary.squared_repeat_excess(),
            squared_repeat_lower_bound: summary.squared_repeat_excess_lower_bound(),
            squared_repeat_lower_bound_gap: summary.squared_repeat_excess_lower_bound_gap(),
            distinct_pairs_covered: summary.distinct_pairs_covered(),
            total_pair_incidences: summary.total_pair_incidences(),
            max_pair_frequency: summary.max_pair_frequency(),
            multiplicity_histogram: summary.multiplicity_histogram().counts_by_frequency().to_vec(),
        }
    }

    fn from_pair_state(
        problem: &PureSgpProblem,
        pair_state: &PairFrequencyState,
        active_penalty_model: Solver6PairRepeatPenaltyModel,
    ) -> Self {
        let linear_repeat_lower_bound = pure_sgp_linear_repeat_excess_lower_bound(
            problem.num_groups,
            problem.group_size,
            problem.num_weeks,
            pair_state.universe().total_distinct_pairs(),
            pair_state.total_pair_incidences(),
        );
        Self {
            active_penalty_model: penalty_model_label(active_penalty_model).into(),
            active_penalty_score: pair_state.score_for_model(active_penalty_model),
            linear_repeat_excess: pair_state.linear_repeat_excess(),
            linear_repeat_lower_bound,
            linear_repeat_lower_bound_gap: pair_state
                .linear_repeat_excess()
                .saturating_sub(linear_repeat_lower_bound),
            squared_repeat_excess: pair_state.squared_repeat_excess(),
            squared_repeat_lower_bound: pair_state.squared_repeat_excess_lower_bound(),
            squared_repeat_lower_bound_gap: pair_state.squared_repeat_excess_lower_bound_gap(),
            distinct_pairs_covered: pair_state.distinct_pairs_covered(),
            total_pair_incidences: pair_state.total_pair_incidences(),
            max_pair_frequency: pair_state.max_pair_frequency(),
            multiplicity_histogram: pair_state.multiplicity_histogram().to_vec(),
        }
    }

    fn from_seed_telemetry(problem: &PureSgpProblem, telemetry: &SeedPairTelemetry) -> Self {
        let total_distinct_pairs = problem.num_groups * problem.group_size;
        let universe_pairs = total_distinct_pairs.saturating_mul(total_distinct_pairs.saturating_sub(1)) / 2;
        let squared_repeat_lower_bound = if universe_pairs == 0 {
            0
        } else {
            let repeat_excess = telemetry.linear_repeat_excess;
            let q = repeat_excess / universe_pairs as u64;
            let r = repeat_excess % universe_pairs as u64;
            (universe_pairs as u64 - r) * q * q + r * (q + 1) * (q + 1)
        };
        Self {
            active_penalty_model: penalty_model_label(telemetry.active_penalty_model).into(),
            active_penalty_score: telemetry.active_penalty_score,
            linear_repeat_excess: telemetry.linear_repeat_excess,
            linear_repeat_lower_bound: telemetry.linear_repeat_lower_bound,
            linear_repeat_lower_bound_gap: telemetry.linear_repeat_lower_bound_gap,
            squared_repeat_excess: telemetry.squared_repeat_excess,
            squared_repeat_lower_bound,
            squared_repeat_lower_bound_gap: telemetry
                .squared_repeat_excess
                .saturating_sub(squared_repeat_lower_bound),
            distinct_pairs_covered: telemetry.distinct_pairs_covered,
            total_pair_incidences: telemetry.total_pair_incidences,
            max_pair_frequency: telemetry.max_pair_frequency,
            multiplicity_histogram: telemetry.multiplicity_histogram.clone(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SearchTelemetrySummary {
    pub iterations_completed: u64,
    pub best_iteration: u64,
    pub stop_reason: String,
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MixedSeedCandidateArtifact {
    pub family: String,
    pub active_penalty_score: u64,
    pub linear_repeat_excess: u64,
    pub linear_repeat_lower_bound_gap: u64,
    pub max_pair_frequency: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Solver6BenchmarkInspection {
    pub execution_status: ExecutionStatus,
    pub linear_status: LayerWeekStatus,
    pub squared_status: LayerWeekStatus,
    pub seed_family: String,
    pub seed_metrics: ScoreMetrics,
    pub final_metrics: ScoreMetrics,
    pub stop_reason: String,
    pub runtime_seconds: f64,
    pub exact_handoff: bool,
    pub mixed_seed_candidates: Vec<MixedSeedCandidateArtifact>,
    pub search_telemetry: Option<SearchTelemetrySummary>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct WeekResultArtifact {
    pub week: usize,
    pub execution_status: ExecutionStatus,
    pub linear_status: LayerWeekStatus,
    pub squared_status: LayerWeekStatus,
    pub exact_zero_repeat: bool,
    pub seed_family: Option<String>,
    pub seed_metrics: Option<ScoreMetrics>,
    pub final_metrics: Option<ScoreMetrics>,
    pub stop_reason: Option<String>,
    pub runtime_seconds: Option<f64>,
    pub error_message: Option<String>,
    pub mixed_seed_candidates: Vec<MixedSeedCandidateArtifact>,
    pub search_telemetry: Option<SearchTelemetrySummary>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LayerFrontierSummary {
    pub contiguous_frontier: usize,
    pub best_observed_hit: usize,
    pub exact_week_count: usize,
    pub lower_bound_tight_week_count: usize,
    pub first_miss_week: Option<usize>,
    pub headline_label: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct CellArtifact {
    pub g: usize,
    pub p: usize,
    pub num_people: usize,
    pub benchmark_eligible: bool,
    pub skip_reason: Option<String>,
    pub linear_summary: LayerFrontierSummary,
    pub squared_summary: LayerFrontierSummary,
    pub week_results: Vec<WeekResultArtifact>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct MatrixViewArtifact {
    pub title: String,
    pub subtitle: String,
    pub bounds: MatrixBounds,
    pub cells: Vec<CellArtifact>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Solver6MatrixArtifact {
    pub report_name: String,
    pub config: Solver6BenchmarkConfigArtifact,
    pub matrices: Vec<MatrixViewArtifact>,
}

pub fn inspect_benchmark_run(input: &ApiInput) -> Result<Solver6BenchmarkInspection, SolverError> {
    let start = Instant::now();
    let executed = execute_solver6_run(input, &input.solver)?;
    let runtime_seconds = start.elapsed().as_secs_f64();
    let final_metrics = if let Some(outcome) = executed.local_search_outcome.as_ref() {
        ScoreMetrics::from_pair_state(
            &executed.problem,
            &outcome.best_pair_state,
            executed.active_penalty_model,
        )
    } else {
        ScoreMetrics::from_schedule(
            &executed.problem,
            &executed.final_schedule,
            executed.active_penalty_model,
        )?
    };
    let exact_handoff = executed.exact_handoff_atom.is_some();
    let (seed_family, seed_metrics, mixed_seed_candidates) =
        if let Some(selection) = executed.seed_selection.as_ref() {
            (
                selection.selected_family.label().to_string(),
                ScoreMetrics::from_seed_telemetry(
                    &executed.problem,
                    selection
                        .seed
                        .diagnostics
                        .pair_telemetry
                        .as_ref()
                        .expect("selected seed should expose pair telemetry"),
                ),
                selection
                    .candidates
                    .iter()
                    .map(|candidate| MixedSeedCandidateArtifact {
                        family: candidate.family.label().to_string(),
                        active_penalty_score: candidate.active_penalty_score,
                        linear_repeat_excess: candidate.linear_repeat_excess,
                        linear_repeat_lower_bound_gap: candidate.linear_repeat_lower_bound_gap,
                        max_pair_frequency: candidate.max_pair_frequency,
                    })
                    .collect(),
            )
        } else {
            (
                "solver5_exact_handoff".to_string(),
                final_metrics.clone(),
                Vec::new(),
            )
        };

    let linear_status = classify_layer_status(
        final_metrics.linear_repeat_excess,
        final_metrics.linear_repeat_lower_bound_gap,
        executed.stop_reason,
    );
    let squared_status = classify_layer_status(
        final_metrics.squared_repeat_excess,
        final_metrics.squared_repeat_lower_bound_gap,
        executed.stop_reason,
    );
    let execution_status = match linear_status {
        LayerWeekStatus::Exact | LayerWeekStatus::LowerBoundTight => ExecutionStatus::Success,
        LayerWeekStatus::Miss => ExecutionStatus::Miss,
        LayerWeekStatus::Timeout => ExecutionStatus::Timeout,
        LayerWeekStatus::Unsupported => ExecutionStatus::Unsupported,
        LayerWeekStatus::Error => ExecutionStatus::Error,
        LayerWeekStatus::NotRun => ExecutionStatus::NotRun,
    };

    Ok(Solver6BenchmarkInspection {
        execution_status,
        linear_status,
        squared_status,
        seed_family,
        seed_metrics,
        final_metrics,
        stop_reason: stop_reason_label(executed.stop_reason).into(),
        runtime_seconds,
        exact_handoff,
        mixed_seed_candidates,
        search_telemetry: executed.local_search_outcome.as_ref().map(|outcome| SearchTelemetrySummary {
            iterations_completed: outcome.iterations_completed,
            best_iteration: outcome.best_iteration,
            stop_reason: stop_reason_label(outcome.stop_reason).into(),
            improving_moves_accepted: outcome.telemetry.improving_moves_accepted,
            non_improving_moves_accepted: outcome.telemetry.non_improving_moves_accepted,
            breakout_count: outcome.telemetry.breakout_count,
            breakout_swaps_applied: outcome.telemetry.breakout_swaps_applied,
            tabu_pruned_candidates: outcome.telemetry.tabu_pruned_candidates,
            max_stagnation_streak: outcome.telemetry.max_stagnation_streak,
            neighborhood_scans: outcome.telemetry.neighborhood_scans,
            candidates_evaluated: outcome.telemetry.candidates_evaluated,
            total_scan_micros: outcome.telemetry.total_scan_micros,
            max_scan_micros: outcome.telemetry.max_scan_micros,
        }),
    })
}

pub fn build_matrix_artifact(
    config: &Solver6BenchmarkConfig,
) -> Result<Solver6MatrixArtifact, SolverError> {
    if config.parallel_jobs == 0 {
        return Err(SolverError::ValidationError(
            "solver6 benchmark parallel_jobs must be at least 1".into(),
        ));
    }

    let matrices = if config.parallel_jobs == 1 {
        config
            .matrices
            .iter()
            .map(|matrix| build_matrix_view_artifact(config, matrix))
            .collect::<Result<Vec<_>, _>>()?
    } else {
        let pool = rayon::ThreadPoolBuilder::new()
            .num_threads(config.parallel_jobs)
            .build()
            .map_err(|error| {
                SolverError::ValidationError(format!(
                    "solver6 benchmark failed to build rayon thread pool: {error}"
                ))
            })?;
        pool.install(|| {
            config
                .matrices
                .par_iter()
                .map(|matrix| build_matrix_view_artifact(config, matrix))
                .collect::<Result<Vec<_>, _>>()
        })?
    };

    Ok(Solver6MatrixArtifact {
        report_name: "solver6-optimality-frontier".into(),
        config: config.to_artifact(),
        matrices,
    })
}

fn build_matrix_view_artifact(
    config: &Solver6BenchmarkConfig,
    matrix: &MatrixViewDefinition,
) -> Result<MatrixViewArtifact, SolverError> {
    let coordinates = (matrix.bounds.g_min..=matrix.bounds.g_max)
        .flat_map(|g| (matrix.bounds.p_min..=matrix.bounds.p_max).map(move |p| (g, p)))
        .collect::<Vec<_>>();

    let cells = if config.parallel_jobs == 1 {
        coordinates
            .iter()
            .map(|&(g, p)| build_cell_artifact(config, g, p))
            .collect::<Result<Vec<_>, _>>()?
    } else {
        coordinates
            .par_iter()
            .map(|&(g, p)| build_cell_artifact(config, g, p))
            .collect::<Result<Vec<_>, _>>()?
    };

    Ok(MatrixViewArtifact {
        title: matrix.title.clone(),
        subtitle: matrix.subtitle.clone(),
        bounds: matrix.bounds,
        cells,
    })
}

pub fn pure_input_for_benchmark(
    groups: usize,
    group_size: usize,
    weeks: usize,
    benchmark: &Solver6BenchmarkConfig,
) -> ApiInput {
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
                    id: format!("G{}", idx + 1),
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
        solver: SolverConfiguration {
            solver_type: SolverKind::Solver6.canonical_id().into(),
            stop_conditions: benchmark.stop_conditions.clone(),
            solver_params: SolverParams::Solver6(Solver6Params {
                exact_construction_handoff_enabled: true,
                seed_strategy: crate::models::Solver6SeedStrategy::Solver5ExactBlockComposition,
                pair_repeat_penalty_model: benchmark.active_penalty_model,
                search_strategy: crate::models::Solver6SearchStrategy::DeterministicBestImprovingHillClimb,
            }),
            logging: Default::default(),
            telemetry: Default::default(),
            seed: Some(benchmark.effective_seed),
            move_policy: None,
            allowed_sessions: None,
        },
    }
}

fn build_cell_artifact(
    config: &Solver6BenchmarkConfig,
    groups: usize,
    group_size: usize,
) -> Result<CellArtifact, SolverError> {
    let num_people = groups * group_size;
    let benchmark_eligible = num_people <= config.max_people_to_run;
    let skip_reason = if benchmark_eligible {
        None
    } else {
        Some(format!(
            "skipped because {} people exceeds max_people_to_run={} for the configured benchmark budget",
            num_people, config.max_people_to_run
        ))
    };

    let mut week_results = Vec::with_capacity(config.week_cap);
    for week in 1..=config.week_cap {
        if !benchmark_eligible {
            week_results.push(WeekResultArtifact {
                week,
                execution_status: ExecutionStatus::NotRun,
                linear_status: LayerWeekStatus::NotRun,
                squared_status: LayerWeekStatus::NotRun,
                exact_zero_repeat: false,
                seed_family: None,
                seed_metrics: None,
                final_metrics: None,
                stop_reason: None,
                runtime_seconds: None,
                error_message: skip_reason.clone(),
                mixed_seed_candidates: Vec::new(),
                search_telemetry: None,
            });
            continue;
        }

        let input = pure_input_for_benchmark(groups, group_size, week, config);
        week_results.push(match inspect_benchmark_run(&input) {
            Ok(inspection) => WeekResultArtifact {
                week,
                execution_status: inspection.execution_status,
                linear_status: inspection.linear_status,
                squared_status: inspection.squared_status,
                exact_zero_repeat: inspection.final_metrics.linear_repeat_excess == 0,
                seed_family: Some(inspection.seed_family),
                seed_metrics: Some(inspection.seed_metrics),
                final_metrics: Some(inspection.final_metrics),
                stop_reason: Some(inspection.stop_reason),
                runtime_seconds: Some(inspection.runtime_seconds),
                error_message: None,
                mixed_seed_candidates: inspection.mixed_seed_candidates,
                search_telemetry: inspection.search_telemetry,
            },
            Err(error) => {
                let message = error.to_string();
                let execution_status = classify_error_status(&message);
                WeekResultArtifact {
                    week,
                    execution_status,
                    linear_status: layer_status_for_execution_failure(execution_status),
                    squared_status: layer_status_for_execution_failure(execution_status),
                    exact_zero_repeat: false,
                    seed_family: None,
                    seed_metrics: None,
                    final_metrics: None,
                    stop_reason: None,
                    runtime_seconds: None,
                    error_message: Some(message),
                    mixed_seed_candidates: Vec::new(),
                    search_telemetry: None,
                }
            }
        });
    }

    Ok(CellArtifact {
        g: groups,
        p: group_size,
        num_people,
        benchmark_eligible,
        skip_reason,
        linear_summary: summarize_layer(&week_results, |week| week.linear_status),
        squared_summary: summarize_layer(&week_results, |week| week.squared_status),
        week_results,
    })
}

fn summarize_layer(
    week_results: &[WeekResultArtifact],
    status: impl Fn(&WeekResultArtifact) -> LayerWeekStatus,
) -> LayerFrontierSummary {
    let mut contiguous_frontier = 0usize;
    let mut best_observed_hit = 0usize;
    let mut exact_week_count = 0usize;
    let mut lower_bound_tight_week_count = 0usize;
    let mut first_miss_week = None;
    let mut still_contiguous = true;

    for week in week_results {
        match status(week) {
            LayerWeekStatus::Exact => {
                exact_week_count += 1;
                lower_bound_tight_week_count += 1;
                best_observed_hit = week.week;
                if still_contiguous {
                    contiguous_frontier = week.week;
                }
            }
            LayerWeekStatus::LowerBoundTight => {
                lower_bound_tight_week_count += 1;
                best_observed_hit = week.week;
                if still_contiguous {
                    contiguous_frontier = week.week;
                }
            }
            LayerWeekStatus::Miss
            | LayerWeekStatus::Unsupported
            | LayerWeekStatus::Timeout
            | LayerWeekStatus::Error
            | LayerWeekStatus::NotRun => {
                if still_contiguous {
                    first_miss_week = Some(week.week);
                    still_contiguous = false;
                }
            }
        }
    }

    LayerFrontierSummary {
        contiguous_frontier,
        best_observed_hit,
        exact_week_count,
        lower_bound_tight_week_count,
        first_miss_week,
        headline_label: frontier_headline_label(
            contiguous_frontier,
            best_observed_hit,
            week_results.len(),
        ),
    }
}

fn frontier_headline_label(
    contiguous_frontier: usize,
    best_observed_hit: usize,
    week_cap: usize,
) -> String {
    if contiguous_frontier >= week_cap && week_cap > 0 {
        return format!("≥{week_cap}");
    }
    if contiguous_frontier == 0 && best_observed_hit == 0 {
        return "—".into();
    }
    if best_observed_hit > contiguous_frontier {
        return format!("{contiguous_frontier}/{best_observed_hit}");
    }
    contiguous_frontier.to_string()
}

fn classify_layer_status(
    score: u64,
    lower_bound_gap: u64,
    stop_reason: StopReason,
) -> LayerWeekStatus {
    if score == 0 {
        LayerWeekStatus::Exact
    } else if lower_bound_gap == 0 {
        LayerWeekStatus::LowerBoundTight
    } else if stop_reason == StopReason::TimeLimitReached {
        LayerWeekStatus::Timeout
    } else {
        LayerWeekStatus::Miss
    }
}

fn classify_error_status(message: &str) -> ExecutionStatus {
    let unsupported_markers = [
        "does not yet have a construction family",
        "reserved",
        "supports only",
        "currently supports only",
        "requires",
        "rejects",
    ];
    if unsupported_markers.iter().any(|marker| message.contains(marker)) {
        ExecutionStatus::Unsupported
    } else {
        ExecutionStatus::Error
    }
}

fn layer_status_for_execution_failure(status: ExecutionStatus) -> LayerWeekStatus {
    match status {
        ExecutionStatus::Unsupported => LayerWeekStatus::Unsupported,
        ExecutionStatus::Timeout => LayerWeekStatus::Timeout,
        ExecutionStatus::Error => LayerWeekStatus::Error,
        ExecutionStatus::NotRun => LayerWeekStatus::NotRun,
        ExecutionStatus::Success => LayerWeekStatus::LowerBoundTight,
        ExecutionStatus::Miss => LayerWeekStatus::Miss,
    }
}

fn stop_reason_label(reason: StopReason) -> &'static str {
    match reason {
        StopReason::MaxIterationsReached => "max_iterations_reached",
        StopReason::TimeLimitReached => "time_limit_reached",
        StopReason::NoImprovementLimitReached => "no_improvement_limit_reached",
        StopReason::ProgressCallbackRequestedStop => "progress_callback_requested_stop",
        StopReason::OptimalScoreReached => "optimal_score_reached",
    }
}

fn penalty_model_label(model: Solver6PairRepeatPenaltyModel) -> &'static str {
    match model {
        Solver6PairRepeatPenaltyModel::LinearRepeatExcess => "linear_repeat_excess",
        Solver6PairRepeatPenaltyModel::TriangularRepeatExcess => "triangular_repeat_excess",
        Solver6PairRepeatPenaltyModel::SquaredRepeatExcess => "squared_repeat_excess",
    }
}

fn default_matrix_views() -> Vec<MatrixViewDefinition> {
    vec![
        MatrixViewDefinition {
            title: "Frontier view: g=2..10, p=2..10".into(),
            subtitle: "Primary solver6 optimality-frontier view over smaller pure-SGP cells. Each outer cell summarizes the full week sweep through the configured cap.".into(),
            bounds: MatrixBounds {
                g_min: 2,
                g_max: 10,
                p_min: 2,
                p_max: 10,
            },
        },
        MatrixViewDefinition {
            title: "Frontier view: g=11..20, p=2..10".into(),
            subtitle: "Larger-group frontier view. Cells beyond the configured benchmark budget remain explicit gray not-run regions rather than silently disappearing.".into(),
            bounds: MatrixBounds {
                g_min: 11,
                g_max: 20,
                p_min: 2,
                p_max: 10,
            },
        },
        MatrixViewDefinition {
            title: "Frontier view: g=11..20, p=11..20".into(),
            subtitle: "Large-square frontier view. This view is mostly for visual continuity with the solver5 matrix shape; benchmark budget may skip many heavy cells explicitly.".into(),
            bounds: MatrixBounds {
                g_min: 11,
                g_max: 20,
                p_min: 11,
                p_max: 20,
            },
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::{
        build_matrix_artifact, classify_error_status, frontier_headline_label,
        inspect_benchmark_run, pure_input_for_benchmark, summarize_layer, ExecutionStatus,
        LayerWeekStatus, Solver6BenchmarkConfig, WeekResultArtifact,
    };

    #[test]
    fn frontier_summary_distinguishes_contiguous_frontier_from_later_hit() {
        let weeks = vec![
            WeekResultArtifact {
                week: 1,
                execution_status: ExecutionStatus::Success,
                linear_status: LayerWeekStatus::Exact,
                squared_status: LayerWeekStatus::Exact,
                exact_zero_repeat: true,
                seed_family: None,
                seed_metrics: None,
                final_metrics: None,
                stop_reason: None,
                runtime_seconds: None,
                error_message: None,
                mixed_seed_candidates: Vec::new(),
                search_telemetry: None,
            },
            WeekResultArtifact {
                week: 2,
                execution_status: ExecutionStatus::Success,
                linear_status: LayerWeekStatus::LowerBoundTight,
                squared_status: LayerWeekStatus::LowerBoundTight,
                exact_zero_repeat: false,
                seed_family: None,
                seed_metrics: None,
                final_metrics: None,
                stop_reason: None,
                runtime_seconds: None,
                error_message: None,
                mixed_seed_candidates: Vec::new(),
                search_telemetry: None,
            },
            WeekResultArtifact {
                week: 3,
                execution_status: ExecutionStatus::Miss,
                linear_status: LayerWeekStatus::Miss,
                squared_status: LayerWeekStatus::Miss,
                exact_zero_repeat: false,
                seed_family: None,
                seed_metrics: None,
                final_metrics: None,
                stop_reason: None,
                runtime_seconds: None,
                error_message: None,
                mixed_seed_candidates: Vec::new(),
                search_telemetry: None,
            },
            WeekResultArtifact {
                week: 4,
                execution_status: ExecutionStatus::Success,
                linear_status: LayerWeekStatus::LowerBoundTight,
                squared_status: LayerWeekStatus::LowerBoundTight,
                exact_zero_repeat: false,
                seed_family: None,
                seed_metrics: None,
                final_metrics: None,
                stop_reason: None,
                runtime_seconds: None,
                error_message: None,
                mixed_seed_candidates: Vec::new(),
                search_telemetry: None,
            },
        ];

        let summary = summarize_layer(&weeks, |week| week.linear_status);
        assert_eq!(summary.contiguous_frontier, 2);
        assert_eq!(summary.best_observed_hit, 4);
        assert_eq!(summary.exact_week_count, 1);
        assert_eq!(summary.lower_bound_tight_week_count, 3);
        assert_eq!(summary.headline_label, "2/4");
    }

    #[test]
    fn frontier_headline_uses_cap_saturation_label() {
        assert_eq!(frontier_headline_label(100, 100, 100), "≥100");
        assert_eq!(frontier_headline_label(0, 0, 100), "—");
        assert_eq!(frontier_headline_label(7, 9, 100), "7/9");
    }

    #[test]
    fn benchmark_artifact_marks_over_budget_cells_as_not_run() {
        let config = Solver6BenchmarkConfig {
            week_cap: 4,
            max_people_to_run: 6,
            matrices: vec![super::MatrixViewDefinition {
                title: "tiny".into(),
                subtitle: "tiny".into(),
                bounds: super::MatrixBounds {
                    g_min: 4,
                    g_max: 4,
                    p_min: 2,
                    p_max: 2,
                },
            }],
            ..Solver6BenchmarkConfig::default()
        };
        let artifact = build_matrix_artifact(&config).unwrap();
        let cell = &artifact.matrices[0].cells[0];
        assert!(!cell.benchmark_eligible);
        assert_eq!(cell.linear_summary.headline_label, "—");
        assert!(cell
            .week_results
            .iter()
            .all(|week| week.linear_status == LayerWeekStatus::NotRun));
    }

    #[test]
    fn parallel_benchmark_artifact_preserves_matrix_cell_order() {
        let config = Solver6BenchmarkConfig {
            week_cap: 1,
            max_people_to_run: 8,
            parallel_jobs: 4,
            matrices: vec![super::MatrixViewDefinition {
                title: "tiny".into(),
                subtitle: "tiny".into(),
                bounds: super::MatrixBounds {
                    g_min: 2,
                    g_max: 3,
                    p_min: 2,
                    p_max: 3,
                },
            }],
            ..Solver6BenchmarkConfig::default()
        };

        let artifact = build_matrix_artifact(&config).unwrap();
        let coordinates = artifact.matrices[0]
            .cells
            .iter()
            .map(|cell| (cell.g, cell.p))
            .collect::<Vec<_>>();

        assert_eq!(coordinates, vec![(2, 2), (2, 3), (3, 2), (3, 3)]);
    }

    #[test]
    fn benchmark_input_builder_uses_solver6_with_repeat_bound() {
        let config = Solver6BenchmarkConfig::default();
        let input = pure_input_for_benchmark(4, 2, 5, &config);
        assert_eq!(input.problem.num_sessions, 5);
        assert_eq!(input.problem.groups.len(), 4);
        assert_eq!(input.problem.people.len(), 8);
        assert!(matches!(
            input.solver.solver_params,
            crate::models::SolverParams::Solver6(_)
        ));
    }

    #[test]
    fn benchmark_inspection_records_exact_handoff_as_tight_success() {
        let config = Solver6BenchmarkConfig {
            week_cap: 3,
            max_people_to_run: 8,
            ..Solver6BenchmarkConfig::default()
        };
        let input = pure_input_for_benchmark(2, 2, 3, &config);
        let inspection = inspect_benchmark_run(&input).unwrap();

        assert_eq!(inspection.execution_status, ExecutionStatus::Success);
        assert_eq!(inspection.linear_status, LayerWeekStatus::Exact);
        assert_eq!(inspection.squared_status, LayerWeekStatus::Exact);
        assert!(inspection.exact_handoff);
        assert_eq!(inspection.seed_family, "solver5_exact_handoff");
        assert_eq!(inspection.seed_metrics.linear_repeat_excess, 0);
        assert_eq!(inspection.final_metrics.linear_repeat_excess, 0);
    }

    #[test]
    fn benchmark_inspection_uses_two_week_structural_linear_bound() {
        let config = Solver6BenchmarkConfig {
            week_cap: 2,
            max_people_to_run: 6,
            ..Solver6BenchmarkConfig::default()
        };
        let input = pure_input_for_benchmark(2, 3, 2, &config);
        let inspection = inspect_benchmark_run(&input).unwrap();

        assert_eq!(inspection.execution_status, ExecutionStatus::Success);
        assert_eq!(inspection.linear_status, LayerWeekStatus::LowerBoundTight);
        assert_eq!(inspection.seed_metrics.linear_repeat_excess, 2);
        assert_eq!(inspection.seed_metrics.linear_repeat_lower_bound, 2);
        assert_eq!(inspection.seed_metrics.linear_repeat_lower_bound_gap, 0);
        assert_eq!(inspection.final_metrics.linear_repeat_excess, 2);
        assert_eq!(inspection.final_metrics.linear_repeat_lower_bound, 2);
        assert_eq!(inspection.final_metrics.linear_repeat_lower_bound_gap, 0);
    }

    #[test]
    fn error_classifier_keeps_internal_shape_bugs_out_of_unsupported_bucket() {
        assert_eq!(
            classify_error_status("Constraint violation: solver6 currently supports only k * w0 tilings"),
            ExecutionStatus::Unsupported
        );
        assert_eq!(
            classify_error_status("Constraint violation: solver6 pair state index 9 out of bounds"),
            ExecutionStatus::Error
        );
    }
}
