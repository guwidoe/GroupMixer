use anyhow::{anyhow, Result};
use gm_core::models::BestScoreTimelinePoint;
use serde::Serialize;

use crate::{CaseRunArtifact, RunReport};

const SPARKLINE_BLOCKS: [char; 8] = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct TrajectoryExport {
    pub run_id: String,
    pub case_id: String,
    pub solver_family: String,
    pub total_runtime_seconds: f64,
    pub point_count: usize,
    pub summary: TrajectorySummary,
    pub best_score_timeline: Vec<BestScoreTimelinePoint>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct TrajectorySummary {
    pub improvement_count: u64,
    pub last_improvement_iteration: u64,
    pub last_improvement_elapsed_seconds: f64,
    pub last_improvement_fraction_of_run: f64,
    pub last_improvement_fraction_of_runtime_budget: Option<f64>,
    pub last_improvement_fraction_of_iteration_budget: Option<f64>,
    pub iterations_after_last_improvement: Option<u64>,
    pub seconds_after_last_improvement: f64,
    pub fraction_of_run_after_last_improvement: f64,
    pub improvements_after_25_percent_run: u64,
    pub improvements_after_50_percent_run: u64,
    pub improvements_after_75_percent_run: u64,
    pub checkpoint_scores: Vec<TrajectoryCheckpoint>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct TrajectoryCheckpoint {
    pub fraction_of_run: f64,
    pub iteration: u64,
    pub elapsed_seconds: f64,
    pub best_score: f64,
}

pub fn select_case<'a>(run_report: &'a RunReport, case_id: Option<&str>) -> Result<&'a CaseRunArtifact> {
    match case_id {
        Some(case_id) => run_report
            .cases
            .iter()
            .find(|case| case.case_id == case_id)
            .ok_or_else(|| anyhow!("case '{}' not found in run {}", case_id, run_report.run.run_id)),
        None if run_report.cases.len() == 1 => Ok(&run_report.cases[0]),
        None => Err(anyhow!(
            "run {} contains multiple cases; pass --case to choose one ({})",
            run_report.run.run_id,
            run_report
                .cases
                .iter()
                .map(|case| case.case_id.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        )),
    }
}

pub fn export_trajectory(run_report: &RunReport, case_id: Option<&str>) -> Result<TrajectoryExport> {
    let case = select_case(run_report, case_id)?;
    let telemetry = case
        .search_telemetry
        .as_ref()
        .ok_or_else(|| anyhow!("case '{}' has no search telemetry", case.case_id))?;

    Ok(TrajectoryExport {
        run_id: run_report.run.run_id.clone(),
        case_id: case.case_id.clone(),
        solver_family: case.solver.solver_family.clone(),
        total_runtime_seconds: case.runtime_seconds,
        point_count: telemetry.best_score_timeline.len(),
        summary: summarize_case_trajectory(case)
            .ok_or_else(|| anyhow!("case '{}' has no search telemetry", case.case_id))?,
        best_score_timeline: telemetry.best_score_timeline.clone(),
    })
}

pub fn summarize_case_trajectory(case: &CaseRunArtifact) -> Option<TrajectorySummary> {
    let telemetry = case.search_telemetry.as_ref()?;
    Some(summarize_trajectory(case, &telemetry.best_score_timeline))
}

pub fn export_trajectory_csv(run_report: &RunReport, case_id: Option<&str>) -> Result<String> {
    let export = export_trajectory(run_report, case_id)?;
    let mut lines = vec!["iteration,elapsed_seconds,best_score".to_string()];
    for point in &export.best_score_timeline {
        lines.push(format!(
            "{},{:.9},{}",
            point.iteration, point.elapsed_seconds, point.best_score
        ));
    }
    Ok(lines.join("\n"))
}

pub fn render_trajectory_text(
    run_report: &RunReport,
    case_id: Option<&str>,
    width: usize,
) -> Result<String> {
    let export = export_trajectory(run_report, case_id)?;
    let timeline = &export.best_score_timeline;
    if timeline.is_empty() {
        return Err(anyhow!("case '{}' has an empty best-score timeline", export.case_id));
    }

    let initial_score = timeline.first().map(|point| point.best_score).unwrap_or(0.0);
    let best_score = timeline.last().map(|point| point.best_score).unwrap_or(initial_score);
    let last_elapsed = timeline.last().map(|point| point.elapsed_seconds).unwrap_or(0.0);
    let width = width.max(8);
    let sparkline = render_sparkline(timeline, width);
    let summary = &export.summary;

    let mut lines = vec![
        format!(
            "Trajectory for case '{}' in run '{}'",
            export.case_id, export.run_id
        ),
        format!("- solver_family: {}", export.solver_family),
        format!("- total_runtime_seconds: {:.6}", export.total_runtime_seconds),
        format!("- timeline_points: {}", export.point_count),
        format!("- initial_score: {:.4}", initial_score),
        format!("- best_score: {:.4}", best_score),
        format!("- last_timeline_elapsed_seconds: {:.6}", last_elapsed),
        format!("- improvement_count: {}", summary.improvement_count),
        format!(
            "- last_improvement_iteration: {}",
            summary.last_improvement_iteration
        ),
        format!(
            "- last_improvement_elapsed_seconds: {:.6}",
            summary.last_improvement_elapsed_seconds
        ),
        format!(
            "- last_improvement_fraction_of_run: {:.4}",
            summary.last_improvement_fraction_of_run
        ),
        format!(
            "- fraction_of_run_after_last_improvement: {:.4}",
            summary.fraction_of_run_after_last_improvement
        ),
        format!(
            "- seconds_after_last_improvement: {:.6}",
            summary.seconds_after_last_improvement
        ),
        format!("- sparkline (higher blocks = lower/better score): {}", sparkline),
    ];

    if let Some(value) = summary.last_improvement_fraction_of_runtime_budget {
        lines.push(format!(
            "- last_improvement_fraction_of_runtime_budget: {:.4}",
            value
        ));
    }
    if let Some(value) = summary.last_improvement_fraction_of_iteration_budget {
        lines.push(format!(
            "- last_improvement_fraction_of_iteration_budget: {:.4}",
            value
        ));
    }
    if let Some(value) = summary.iterations_after_last_improvement {
        lines.push(format!("- iterations_after_last_improvement: {}", value));
    }
    lines.push(format!(
        "- improvements_after_25/50/75_percent_run: {}/{}/{}",
        summary.improvements_after_25_percent_run,
        summary.improvements_after_50_percent_run,
        summary.improvements_after_75_percent_run,
    ));
    lines.push("Checkpoint scores:".to_string());

    for checkpoint in &summary.checkpoint_scores {
        lines.push(format!(
            "- {:>3}%  score={:.4}  elapsed={:.6}s  iteration={}",
            (checkpoint.fraction_of_run * 100.0).round() as u64,
            checkpoint.best_score,
            checkpoint.elapsed_seconds,
            checkpoint.iteration
        ));
    }

    Ok(lines.join("\n"))
}

fn checkpoint_rows(timeline: &[BestScoreTimelinePoint]) -> Vec<TrajectoryCheckpoint> {
    let fractions = [0.0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0];
    fractions
        .iter()
        .map(|fraction| {
            let point = point_at_fraction(timeline, *fraction);
            TrajectoryCheckpoint {
                fraction_of_run: *fraction,
                iteration: point.iteration,
                elapsed_seconds: point.elapsed_seconds,
                best_score: point.best_score,
            }
        })
        .collect()
}

fn summarize_trajectory(
    case: &CaseRunArtifact,
    timeline: &[BestScoreTimelinePoint],
) -> TrajectorySummary {
    let improvement_count = timeline.len().saturating_sub(1) as u64;
    let last_point = timeline.last().unwrap_or(&timeline[0]);
    let total_runtime_seconds = case.runtime_seconds.max(last_point.elapsed_seconds);
    let last_improvement_fraction_of_run = if total_runtime_seconds <= 0.0 {
        1.0
    } else {
        (last_point.elapsed_seconds / total_runtime_seconds).clamp(0.0, 1.0)
    };
    let seconds_after_last_improvement =
        (total_runtime_seconds - last_point.elapsed_seconds).max(0.0);
    let fraction_of_run_after_last_improvement = if total_runtime_seconds <= 0.0 {
        0.0
    } else {
        (seconds_after_last_improvement / total_runtime_seconds).clamp(0.0, 1.0)
    };
    let runtime_budget = case.effective_budget.time_limit_seconds.filter(|limit| *limit > 0);
    let iteration_budget = case.effective_budget.max_iterations.filter(|limit| *limit > 0);
    let completed_iterations = case.iteration_count.unwrap_or(last_point.iteration);

    let improvements_after_fraction = |threshold: f64| -> u64 {
        timeline
            .iter()
            .skip(1)
            .filter(|point| {
                total_runtime_seconds > 0.0
                    && point.elapsed_seconds >= total_runtime_seconds * threshold
            })
            .count() as u64
    };

    TrajectorySummary {
        improvement_count,
        last_improvement_iteration: last_point.iteration,
        last_improvement_elapsed_seconds: last_point.elapsed_seconds,
        last_improvement_fraction_of_run,
        last_improvement_fraction_of_runtime_budget: runtime_budget
            .map(|budget| (last_point.elapsed_seconds / budget as f64).clamp(0.0, 1.0)),
        last_improvement_fraction_of_iteration_budget: iteration_budget
            .map(|budget| (last_point.iteration as f64 / budget as f64).clamp(0.0, 1.0)),
        iterations_after_last_improvement: Some(completed_iterations.saturating_sub(last_point.iteration)),
        seconds_after_last_improvement,
        fraction_of_run_after_last_improvement,
        improvements_after_25_percent_run: improvements_after_fraction(0.25),
        improvements_after_50_percent_run: improvements_after_fraction(0.50),
        improvements_after_75_percent_run: improvements_after_fraction(0.75),
        checkpoint_scores: checkpoint_rows(timeline),
    }
}

fn render_sparkline(timeline: &[BestScoreTimelinePoint], width: usize) -> String {
    let min_score = timeline
        .iter()
        .map(|point| point.best_score)
        .fold(f64::INFINITY, f64::min);
    let max_score = timeline
        .iter()
        .map(|point| point.best_score)
        .fold(f64::NEG_INFINITY, f64::max);

    if !min_score.is_finite() || !max_score.is_finite() {
        return String::new();
    }

    let mut out = String::with_capacity(width);
    for bucket in 0..width {
        let fraction = if width <= 1 {
            1.0
        } else {
            bucket as f64 / (width - 1) as f64
        };
        let score = point_at_fraction(timeline, fraction).best_score;
        let normalized = if (max_score - min_score).abs() <= f64::EPSILON {
            1.0
        } else {
            ((max_score - score) / (max_score - min_score)).clamp(0.0, 1.0)
        };
        let index = ((normalized * (SPARKLINE_BLOCKS.len() - 1) as f64).round() as usize)
            .min(SPARKLINE_BLOCKS.len() - 1);
        out.push(SPARKLINE_BLOCKS[index]);
    }
    out
}

fn point_at_fraction(timeline: &[BestScoreTimelinePoint], fraction: f64) -> &BestScoreTimelinePoint {
    let final_elapsed = timeline.last().map(|point| point.elapsed_seconds).unwrap_or(0.0);
    let target_elapsed = if final_elapsed <= 0.0 {
        0.0
    } else {
        final_elapsed * fraction.clamp(0.0, 1.0)
    };

    timeline
        .iter()
        .take_while(|point| point.elapsed_seconds <= target_elapsed)
        .last()
        .unwrap_or(&timeline[0])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        artifacts::{
            BenchmarkArtifactKind, CaseRunStatus, EffectiveBenchmarkBudget,
            GitIdentity, MachineIdentity, RunMetadata, RunSuiteMetadata, RunTotals,
            SearchTelemetryArtifact, SolveTimingBreakdown, SolverBenchmarkMetadata,
            SolverCapabilitiesSnapshot,
        },
        manifest::BenchmarkSuiteClass,
    };
    use gm_core::models::MoveFamilyBenchmarkTelemetrySummary;

    fn sample_report() -> RunReport {
        RunReport {
            schema_version: 1,
            suite: RunSuiteMetadata {
                suite_id: "trajectory-suite".to_string(),
                benchmark_mode: "full_solve".to_string(),
                comparison_category: crate::BenchmarkComparisonCategory::ScoreQuality,
                solver_families: vec!["solver3".to_string()],
                class: BenchmarkSuiteClass::Stretch,
                title: None,
                description: None,
                manifest_path: "suite.yaml".to_string(),
            },
            run: RunMetadata {
                run_id: "run-123".to_string(),
                generated_at: "2026-04-13T00:00:00Z".to_string(),
                git: GitIdentity {
                    commit_sha: Some("deadbeef".to_string()),
                    short_sha: Some("deadbee".to_string()),
                    branch: Some("main".to_string()),
                    dirty_tree: Some(false),
                },
                machine: MachineIdentity {
                    benchmark_machine_id: Some("benchbox".to_string()),
                    hostname: Some("benchbox".to_string()),
                    cpu_model: None,
                    logical_cores: None,
                    os: Some("linux".to_string()),
                    kernel: None,
                    rustc_version: None,
                    cargo_profile: Some("dev".to_string()),
                },
            },
            totals: RunTotals {
                total_cases: 1,
                successful_cases: 1,
                failed_cases: 0,
                total_runtime_seconds: 10.0,
            },
            class_rollups: vec![],
            cases: vec![CaseRunArtifact {
                schema_version: 1,
                run_id: "run-123".to_string(),
                generated_at: "2026-04-13T00:00:00Z".to_string(),
                suite_id: "trajectory-suite".to_string(),
                benchmark_mode: "full_solve".to_string(),
                suite_class: BenchmarkSuiteClass::Stretch,
                case_id: "stretch.social-golfer-32x8x10".to_string(),
                case_class: BenchmarkSuiteClass::Stretch,
                case_manifest_path: "case.json".to_string(),
                case_identity: None,
                case_title: None,
                case_description: None,
                tags: vec![],
                git: GitIdentity {
                    commit_sha: Some("deadbeef".to_string()),
                    short_sha: Some("deadbee".to_string()),
                    branch: Some("main".to_string()),
                    dirty_tree: Some(false),
                },
                machine: MachineIdentity {
                    benchmark_machine_id: Some("benchbox".to_string()),
                    hostname: Some("benchbox".to_string()),
                    cpu_model: None,
                    logical_cores: None,
                    os: Some("linux".to_string()),
                    kernel: None,
                    rustc_version: None,
                    cargo_profile: Some("dev".to_string()),
                },
                solver: SolverBenchmarkMetadata {
                    solver_family: "solver3".to_string(),
                    solver_config_id: "solver3".to_string(),
                    display_name: "Solver 3".to_string(),
                    seed_policy: crate::BenchmarkSeedPolicy::Explicit,
                    capabilities: SolverCapabilitiesSnapshot {
                        supports_initial_schedule: true,
                        supports_progress_callback: true,
                        supports_benchmark_observer: true,
                        supports_recommended_settings: true,
                        supports_deterministic_seed: true,
                    },
                },
                effective_seed: Some(7),
                effective_budget: EffectiveBenchmarkBudget::default(),
                artifact_kind: BenchmarkArtifactKind::FullSolve,
                effective_move_policy: None,
                stop_reason: None,
                status: CaseRunStatus::Success,
                error_message: None,
                timing: SolveTimingBreakdown {
                    total_seconds: 10.0,
                    ..Default::default()
                },
                runtime_seconds: 10.0,
                initial_score: Some(100.0),
                final_score: Some(50.0),
                best_score: Some(50.0),
                iteration_count: Some(1000),
                no_improvement_count: Some(100),
                unique_contacts: None,
                weighted_repetition_penalty: None,
                weighted_constraint_penalty: None,
                score_decomposition: None,
                search_telemetry: Some(SearchTelemetryArtifact {
                    accepted_uphill_moves: 1,
                    accepted_downhill_moves: 2,
                    accepted_neutral_moves: 3,
                    max_no_improvement_streak: 100,
                    restart_count: None,
                    perturbation_count: None,
                    iterations_per_second: 100.0,
                    best_score_timeline: vec![
                        BestScoreTimelinePoint {
                            iteration: 0,
                            elapsed_seconds: 0.0,
                            best_score: 100.0,
                        },
                        BestScoreTimelinePoint {
                            iteration: 10,
                            elapsed_seconds: 1.0,
                            best_score: 80.0,
                        },
                        BestScoreTimelinePoint {
                            iteration: 100,
                            elapsed_seconds: 3.0,
                            best_score: 60.0,
                        },
                        BestScoreTimelinePoint {
                            iteration: 150,
                            elapsed_seconds: 7.0,
                            best_score: 50.0,
                        },
                    ],
                    repeat_guided_swaps: Default::default(),
                    sgp_week_pair_tabu: None,
                    memetic: None,
                    donor_session_transplant: None,
                    session_aligned_path_relinking: None,
                    multi_root_balanced_session_inheritance: None,
                }),
                moves: MoveFamilyBenchmarkTelemetrySummary::default(),
                hotpath_metrics: None,
                external_validation: None,
            }],
        }
    }

    #[test]
    fn trajectory_text_renders_sparkline_and_checkpoints() {
        let text = render_trajectory_text(&sample_report(), None, 16).expect("trajectory text");
        assert!(text.contains("Trajectory for case 'stretch.social-golfer-32x8x10'"));
        assert!(text.contains("sparkline"));
        assert!(text.contains("improvement_count"));
        assert!(text.contains("Checkpoint scores:"));
        assert!(text.contains("100%"));
    }

    #[test]
    fn trajectory_csv_exports_points() {
        let csv = export_trajectory_csv(&sample_report(), None).expect("trajectory csv");
        assert!(csv.contains("iteration,elapsed_seconds,best_score"));
        assert!(csv.contains("150,7.000000000,50"));
    }

    #[test]
    fn trajectory_export_includes_plateau_summary_metrics() {
        let export = export_trajectory(&sample_report(), None).expect("trajectory export");
        assert_eq!(export.summary.improvement_count, 3);
        assert_eq!(export.summary.last_improvement_iteration, 150);
        assert!((export.summary.last_improvement_elapsed_seconds - 7.0).abs() < 1e-9);
        assert_eq!(export.summary.improvements_after_75_percent_run, 0);
        assert_eq!(export.summary.checkpoint_scores.len(), 7);
    }
}
