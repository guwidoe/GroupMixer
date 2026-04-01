use crate::artifacts::{
    CaseComparison, ClassRollupComparison, ComparabilityReport, ComparisonReport, ComparisonStatus,
    IntegerDelta, MoveFamilyComparison, NumericDelta, RegressionSuspect, RegressionSuspectKind,
    RegressionSuspectSummary, COMPARISON_REPORT_SCHEMA_VERSION,
};
use crate::manifest::BenchmarkSuiteClass;
use crate::storage::BenchmarkStorage;
use crate::{BaselineSnapshot, CaseRunArtifact, ClassRollup, RunReport};
use anyhow::{Context, Result};
use chrono::Utc;
use solver_core::models::MoveFamilyBenchmarkTelemetry;
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::path::{Path, PathBuf};

pub fn compare_run_to_baseline(
    current: &RunReport,
    baseline: &BaselineSnapshot,
) -> ComparisonReport {
    let mut reasons = Vec::new();
    if current.schema_version != baseline.run_report.schema_version {
        reasons.push(format!(
            "run report schema mismatch: current={} baseline={}",
            current.schema_version, baseline.run_report.schema_version
        ));
    }
    if current.suite.suite_id != baseline.run_report.suite.suite_id {
        reasons.push(format!(
            "suite id mismatch: current={} baseline={}",
            current.suite.suite_id, baseline.run_report.suite.suite_id
        ));
    }

    let same_benchmark_mode =
        current.suite.benchmark_mode == baseline.run_report.suite.benchmark_mode;
    if !same_benchmark_mode {
        reasons.push(format!(
            "benchmark mode mismatch: current={} baseline={}",
            current.suite.benchmark_mode, baseline.run_report.suite.benchmark_mode
        ));
    }

    let same_machine = same_machine_identity(current, &baseline.run_report);
    if !same_machine {
        reasons
            .push("machine identity mismatch; runtime comparison is not trustworthy".to_string());
    }

    let baseline_cases: HashMap<_, _> = baseline
        .run_report
        .cases
        .iter()
        .map(|case| (case.case_id.as_str(), case))
        .collect();
    let current_cases: HashMap<_, _> = current
        .cases
        .iter()
        .map(|case| (case.case_id.as_str(), case))
        .collect();

    for case_id in baseline_cases.keys() {
        if !current_cases.contains_key(case_id) {
            reasons.push(format!("case missing in current run: {case_id}"));
        }
    }
    for case_id in current_cases.keys() {
        if !baseline_cases.contains_key(case_id) {
            reasons.push(format!("case missing in baseline run: {case_id}"));
        }
    }

    let mut shared_case_ids: Vec<_> = baseline_cases
        .keys()
        .filter(|case_id| current_cases.contains_key(**case_id))
        .copied()
        .collect();
    shared_case_ids.sort_unstable();

    let case_comparisons: Vec<_> = shared_case_ids
        .into_iter()
        .map(|case_id| compare_case(current_cases[case_id], baseline_cases[case_id]))
        .collect();

    let class_rollups = compare_class_rollups(current, &baseline.run_report, &mut reasons);
    let comparability = ComparabilityReport {
        status: if reasons.is_empty() {
            ComparisonStatus::Comparable
        } else {
            ComparisonStatus::NotComparable
        },
        reasons,
        same_benchmark_mode,
        same_machine,
        same_suite: current.suite.suite_id == baseline.run_report.suite.suite_id,
    };
    let suspects = build_suspect_summary(&case_comparisons);

    ComparisonReport {
        schema_version: COMPARISON_REPORT_SCHEMA_VERSION,
        compared_at: Utc::now().to_rfc3339(),
        baseline_name: baseline.baseline_name.clone(),
        baseline_run_id: baseline.run_report.run.run_id.clone(),
        current_run_id: current.run.run_id.clone(),
        suite_id: current.suite.suite_id.clone(),
        benchmark_mode: current.suite.benchmark_mode.clone(),
        comparability,
        case_comparisons,
        class_rollups,
        suspects,
    }
}

pub fn persist_comparison_report(
    report: &ComparisonReport,
    artifacts_dir: impl AsRef<Path>,
) -> Result<PathBuf> {
    let storage = BenchmarkStorage::new(artifacts_dir.as_ref());
    storage.ensure_layout()?;
    let comparison_dir = storage
        .comparisons_dir()
        .join(sanitize_filename(&report.suite_id));
    fs::create_dir_all(&comparison_dir).with_context(|| {
        format!(
            "failed to create benchmark comparison dir {}",
            comparison_dir.display()
        )
    })?;
    let filename = format!(
        "{}__{}__{}.json",
        sanitize_filename(&report.suite_id),
        sanitize_filename(&report.baseline_name),
        sanitize_filename(&report.current_run_id)
    );
    let path = comparison_dir.join(filename);
    let contents =
        serde_json::to_string_pretty(report).context("failed to serialize comparison report")?;
    fs::write(&path, contents)
        .with_context(|| format!("failed to write comparison report {}", path.display()))?;
    Ok(path)
}

fn compare_case(current: &CaseRunArtifact, baseline: &CaseRunArtifact) -> CaseComparison {
    let move_family_deltas = vec![
        compare_move_family("swap", &current.moves.swap, &baseline.moves.swap),
        compare_move_family(
            "transfer",
            &current.moves.transfer,
            &baseline.moves.transfer,
        ),
        compare_move_family(
            "clique_swap",
            &current.moves.clique_swap,
            &baseline.moves.clique_swap,
        ),
    ];

    CaseComparison {
        case_id: current.case_id.clone(),
        class: current.case_class,
        runtime_seconds: numeric_delta(baseline.runtime_seconds, current.runtime_seconds),
        final_score: zip_numeric_delta(baseline.final_score, current.final_score),
        best_score: zip_numeric_delta(baseline.best_score, current.best_score),
        iteration_count: zip_integer_delta(baseline.iteration_count, current.iteration_count),
        stop_reason_baseline: baseline.stop_reason,
        stop_reason_current: current.stop_reason,
        move_family_deltas,
    }
}

fn compare_class_rollups(
    current: &RunReport,
    baseline: &RunReport,
    reasons: &mut Vec<String>,
) -> Vec<ClassRollupComparison> {
    let baseline_rollups: BTreeMap<BenchmarkSuiteClass, &ClassRollup> = baseline
        .class_rollups
        .iter()
        .map(|rollup| (rollup.class, rollup))
        .collect();
    let current_rollups: BTreeMap<BenchmarkSuiteClass, &ClassRollup> = current
        .class_rollups
        .iter()
        .map(|rollup| (rollup.class, rollup))
        .collect();

    for class in baseline_rollups.keys() {
        if !current_rollups.contains_key(class) {
            reasons.push(format!(
                "class rollup missing in current run: {}",
                class.as_str()
            ));
        }
    }
    for class in current_rollups.keys() {
        if !baseline_rollups.contains_key(class) {
            reasons.push(format!(
                "class rollup missing in baseline run: {}",
                class.as_str()
            ));
        }
    }

    BenchmarkSuiteClass::ALL
        .into_iter()
        .filter_map(|class| {
            let current = current_rollups.get(&class)?;
            let baseline = baseline_rollups.get(&class)?;
            Some(ClassRollupComparison {
                class,
                total_runtime_seconds: numeric_delta(
                    baseline.total_runtime_seconds,
                    current.total_runtime_seconds,
                ),
                average_runtime_seconds: Some(numeric_delta(
                    baseline.average_runtime_seconds,
                    current.average_runtime_seconds,
                )),
                average_final_score: zip_numeric_delta(
                    baseline.average_final_score,
                    current.average_final_score,
                ),
                average_best_score: zip_numeric_delta(
                    baseline.average_best_score,
                    current.average_best_score,
                ),
            })
        })
        .collect()
}

fn compare_move_family(
    family: &str,
    current: &MoveFamilyBenchmarkTelemetry,
    baseline: &MoveFamilyBenchmarkTelemetry,
) -> MoveFamilyComparison {
    MoveFamilyComparison {
        family: family.to_string(),
        attempts: integer_delta(baseline.attempts, current.attempts),
        accepted: integer_delta(baseline.accepted, current.accepted),
        rejected: integer_delta(baseline.rejected, current.rejected),
        preview_seconds: numeric_delta(baseline.preview_seconds, current.preview_seconds),
        apply_seconds: numeric_delta(baseline.apply_seconds, current.apply_seconds),
        full_recalculation_count: integer_delta(
            baseline.full_recalculation_count,
            current.full_recalculation_count,
        ),
        full_recalculation_seconds: numeric_delta(
            baseline.full_recalculation_seconds,
            current.full_recalculation_seconds,
        ),
    }
}

fn build_suspect_summary(case_comparisons: &[CaseComparison]) -> RegressionSuspectSummary {
    let mut runtime_regressions: Vec<_> = case_comparisons
        .iter()
        .filter(|comparison| comparison.runtime_seconds.absolute > 0.0)
        .map(|comparison| RegressionSuspect {
            kind: RegressionSuspectKind::CaseRuntime,
            id: comparison.case_id.clone(),
            summary: format!(
                "{} runtime changed by {:.4}s ({})",
                comparison.case_id,
                comparison.runtime_seconds.absolute,
                format_percent(comparison.runtime_seconds.percent)
            ),
            absolute_delta: comparison.runtime_seconds.absolute,
            percent_delta: comparison.runtime_seconds.percent,
        })
        .filter(|suspect| suspect.absolute_delta > 0.0)
        .collect();
    runtime_regressions.sort_by(|a, b| b.absolute_delta.total_cmp(&a.absolute_delta));
    runtime_regressions.truncate(5);

    let mut quality_regressions: Vec<_> = case_comparisons
        .iter()
        .filter_map(|comparison| {
            comparison
                .final_score
                .as_ref()
                .map(|delta| (comparison, delta))
        })
        .filter(|(_, delta)| delta.absolute < 0.0)
        .map(|(comparison, delta)| RegressionSuspect {
            kind: RegressionSuspectKind::CaseQuality,
            id: comparison.case_id.clone(),
            summary: format!(
                "{} final score decreased by {:.4} ({})",
                comparison.case_id,
                delta.absolute,
                format_percent(delta.percent)
            ),
            absolute_delta: delta.absolute,
            percent_delta: delta.percent,
        })
        .collect();
    quality_regressions.sort_by(|a, b| a.absolute_delta.total_cmp(&b.absolute_delta));
    quality_regressions.truncate(5);

    let mut move_family_totals: BTreeMap<String, (f64, f64)> = BTreeMap::new();
    for comparison in case_comparisons {
        for family in &comparison.move_family_deltas {
            let total = family.preview_seconds.absolute + family.apply_seconds.absolute;
            let baseline = family.preview_seconds.baseline + family.apply_seconds.baseline;
            let entry = move_family_totals.entry(family.family.clone()).or_default();
            entry.0 += total;
            entry.1 += baseline;
        }
    }
    let mut move_family_regressions: Vec<_> = move_family_totals
        .into_iter()
        .filter(|(_, (delta, _))| *delta > 0.0)
        .map(|(family, (delta, baseline_total))| RegressionSuspect {
            kind: RegressionSuspectKind::MoveFamily,
            id: family.clone(),
            summary: format!(
                "{} move-family time increased by {:.4}s ({})",
                family,
                delta,
                format_percent(percent(delta, baseline_total))
            ),
            absolute_delta: delta,
            percent_delta: percent(delta, baseline_total),
        })
        .collect();
    move_family_regressions.sort_by(|a, b| b.absolute_delta.total_cmp(&a.absolute_delta));
    move_family_regressions.truncate(5);

    let mut improvements: Vec<_> = case_comparisons
        .iter()
        .filter_map(|comparison| {
            if comparison.runtime_seconds.absolute < 0.0 {
                Some(RegressionSuspect {
                    kind: RegressionSuspectKind::CaseRuntime,
                    id: comparison.case_id.clone(),
                    summary: format!(
                        "{} runtime improved by {:.4}s ({})",
                        comparison.case_id,
                        comparison.runtime_seconds.absolute,
                        format_percent(comparison.runtime_seconds.percent)
                    ),
                    absolute_delta: comparison.runtime_seconds.absolute,
                    percent_delta: comparison.runtime_seconds.percent,
                })
            } else if let Some(final_score) = &comparison.final_score {
                if final_score.absolute > 0.0 {
                    Some(RegressionSuspect {
                        kind: RegressionSuspectKind::CaseQuality,
                        id: comparison.case_id.clone(),
                        summary: format!(
                            "{} final score improved by {:.4} ({})",
                            comparison.case_id,
                            final_score.absolute,
                            format_percent(final_score.percent)
                        ),
                        absolute_delta: final_score.absolute,
                        percent_delta: final_score.percent,
                    })
                } else {
                    None
                }
            } else {
                None
            }
        })
        .collect();
    improvements.sort_by(|a, b| a.absolute_delta.total_cmp(&b.absolute_delta));
    improvements.truncate(5);

    RegressionSuspectSummary {
        top_runtime_regressions: runtime_regressions,
        top_quality_regressions: quality_regressions,
        top_move_family_regressions: move_family_regressions,
        top_improvements: improvements,
    }
}

fn same_machine_identity(current: &RunReport, baseline: &RunReport) -> bool {
    let current_id = current.run.machine.benchmark_machine_id.as_ref().or(current
        .run
        .machine
        .hostname
        .as_ref());
    let baseline_id = baseline
        .run
        .machine
        .benchmark_machine_id
        .as_ref()
        .or(baseline.run.machine.hostname.as_ref());
    current_id.is_some() && current_id == baseline_id
}

fn numeric_delta(baseline: f64, current: f64) -> NumericDelta {
    let absolute = current - baseline;
    NumericDelta {
        baseline,
        current,
        absolute,
        percent: percent(absolute, baseline),
    }
}

fn integer_delta(baseline: u64, current: u64) -> IntegerDelta {
    let absolute = current as i64 - baseline as i64;
    IntegerDelta {
        baseline,
        current,
        absolute,
        percent: percent(absolute as f64, baseline as f64),
    }
}

fn zip_numeric_delta(baseline: Option<f64>, current: Option<f64>) -> Option<NumericDelta> {
    Some(numeric_delta(baseline?, current?))
}

fn zip_integer_delta(baseline: Option<u64>, current: Option<u64>) -> Option<IntegerDelta> {
    Some(integer_delta(baseline?, current?))
}

fn percent(delta: f64, baseline: f64) -> Option<f64> {
    if baseline.abs() < f64::EPSILON {
        None
    } else {
        Some((delta / baseline) * 100.0)
    }
}

fn format_percent(value: Option<f64>) -> String {
    value
        .map(|value| format!("{value:.2}%"))
        .unwrap_or_else(|| "n/a".to_string())
}

fn sanitize_filename(value: &str) -> String {
    value
        .chars()
        .map(|ch| match ch {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' => ch,
            _ => '_',
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runner::{
        persist_run_report, run_suite_from_manifest, save_baseline_snapshot, RunnerOptions,
    };
    use tempfile::TempDir;

    #[test]
    fn comparing_run_to_matching_baseline_is_comparable() {
        let temp = TempDir::new().expect("temp dir");
        let options = RunnerOptions {
            artifacts_dir: temp.path().to_path_buf(),
            cargo_profile: "test".to_string(),
        };
        let report = run_suite_from_manifest("../benchmarking/suites/path.yaml", &options)
            .expect("run path suite");
        let run_path =
            persist_run_report(&report, &options.artifacts_dir).expect("persist run report");
        let baseline_path = save_baseline_snapshot(
            &report,
            "path-baseline",
            &options.artifacts_dir,
            Some(run_path),
        )
        .expect("save baseline");
        let baseline =
            crate::runner::load_baseline_snapshot(&baseline_path).expect("load baseline");

        let comparison = compare_run_to_baseline(&report, &baseline);
        assert_eq!(
            comparison.comparability.status,
            ComparisonStatus::Comparable
        );
        assert_eq!(comparison.case_comparisons.len(), report.cases.len());

        let comparison_path = persist_comparison_report(&comparison, &options.artifacts_dir)
            .expect("persist comparison report");
        assert!(comparison_path.exists());
    }

    #[test]
    fn suite_mismatch_is_reported_explicitly() {
        let temp = TempDir::new().expect("temp dir");
        let options = RunnerOptions {
            artifacts_dir: temp.path().to_path_buf(),
            cargo_profile: "test".to_string(),
        };
        let path_report = run_suite_from_manifest("../benchmarking/suites/path.yaml", &options)
            .expect("run path suite");
        let representative_report =
            run_suite_from_manifest("../benchmarking/suites/representative.yaml", &options)
                .expect("run representative suite");
        let baseline_path =
            save_baseline_snapshot(&path_report, "path-baseline", &options.artifacts_dir, None)
                .expect("save baseline");
        let baseline =
            crate::runner::load_baseline_snapshot(&baseline_path).expect("load baseline");

        let comparison = compare_run_to_baseline(&representative_report, &baseline);
        assert_eq!(
            comparison.comparability.status,
            ComparisonStatus::NotComparable
        );
        assert!(comparison
            .comparability
            .reasons
            .iter()
            .any(|reason| reason.contains("suite id mismatch")));
    }

    #[test]
    fn benchmark_mode_mismatch_is_reported_explicitly() {
        let temp = TempDir::new().expect("temp dir");
        let options = RunnerOptions {
            artifacts_dir: temp.path().to_path_buf(),
            cargo_profile: "test".to_string(),
        };
        let mut report = run_suite_from_manifest("../benchmarking/suites/path.yaml", &options)
            .expect("run path suite");
        let baseline_path =
            save_baseline_snapshot(&report, "path-baseline", &options.artifacts_dir, None)
                .expect("save baseline");
        let baseline =
            crate::runner::load_baseline_snapshot(&baseline_path).expect("load baseline");

        report.suite.benchmark_mode = "swap_preview".to_string();
        for case in &mut report.cases {
            case.benchmark_mode = "swap_preview".to_string();
        }

        let comparison = compare_run_to_baseline(&report, &baseline);
        assert_eq!(
            comparison.comparability.status,
            ComparisonStatus::NotComparable
        );
        assert!(!comparison.comparability.same_benchmark_mode);
        assert!(comparison
            .comparability
            .reasons
            .iter()
            .any(|reason| reason.contains("benchmark mode mismatch")));
    }
}
