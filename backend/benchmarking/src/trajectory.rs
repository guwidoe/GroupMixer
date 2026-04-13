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
    pub best_score_timeline: Vec<BestScoreTimelinePoint>,
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
        best_score_timeline: telemetry.best_score_timeline.clone(),
    })
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
        format!("- sparkline (higher blocks = lower/better score): {}", sparkline),
        "Checkpoint scores:".to_string(),
    ];

    for (fraction, score, elapsed, iteration) in checkpoint_rows(timeline) {
        lines.push(format!(
            "- {:>3}%  score={:.4}  elapsed={:.6}s  iteration={}",
            (fraction * 100.0).round() as u64,
            score,
            elapsed,
            iteration
        ));
    }

    Ok(lines.join("\n"))
}

fn checkpoint_rows(timeline: &[BestScoreTimelinePoint]) -> Vec<(f64, f64, f64, u64)> {
    let fractions = [0.0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0];
    fractions
        .iter()
        .map(|fraction| {
            let point = point_at_fraction(timeline, *fraction);
            (*fraction, point.best_score, point.elapsed_seconds, point.iteration)
        })
        .collect()
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
        assert!(text.contains("Checkpoint scores:"));
        assert!(text.contains("100%"));
    }

    #[test]
    fn trajectory_csv_exports_points() {
        let csv = export_trajectory_csv(&sample_report(), None).expect("trajectory csv");
        assert!(csv.contains("iteration,elapsed_seconds,best_score"));
        assert!(csv.contains("150,7.000000000,50"));
    }
}
