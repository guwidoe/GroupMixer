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
use gm_core::models::MoveFamilyBenchmarkTelemetry;
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

    let same_comparison_category =
        current.suite.comparison_category == baseline.run_report.suite.comparison_category;
    if !same_comparison_category {
        reasons.push(format!(
            "comparison category mismatch: current={:?} baseline={:?}",
            current.suite.comparison_category, baseline.run_report.suite.comparison_category
        ));
    }

    let same_solver_families =
        current.suite.solver_families == baseline.run_report.suite.solver_families;
    if !same_solver_families {
        reasons.push(format!(
            "solver family mismatch: current={:?} baseline={:?}",
            current.suite.solver_families, baseline.run_report.suite.solver_families
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

    let mut same_case_identity = true;
    for case_id in &shared_case_ids {
        let baseline_case = baseline_cases[case_id];
        let current_case = current_cases[case_id];
        if baseline_case.solver.solver_family != current_case.solver.solver_family {
            reasons.push(format!(
                "case solver family mismatch for {}: current={} baseline={}",
                case_id, current_case.solver.solver_family, baseline_case.solver.solver_family
            ));
        }
        if !case_identity_matches(current_case, baseline_case, &mut reasons) {
            same_case_identity = false;
        }
    }

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
        same_comparison_category,
        same_solver_families,
        same_case_identity,
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
        comparison_category: current.suite.comparison_category,
        comparability,
        case_comparisons,
        class_rollups,
        suspects,
    }
}

fn case_identity_matches(
    current: &CaseRunArtifact,
    baseline: &CaseRunArtifact,
    reasons: &mut Vec<String>,
) -> bool {
    let current_identity = current.case_identity.as_ref();
    let baseline_identity = baseline.case_identity.as_ref();

    match (current_identity, baseline_identity) {
        (Some(current_identity), Some(baseline_identity)) => {
            let mut matches = true;
            if current_identity.source_path != baseline_identity.source_path {
                matches = false;
                reasons.push(format!(
                    "case source path mismatch for {}: current={} baseline={}",
                    current.case_id, current_identity.source_path, baseline_identity.source_path
                ));
            }
            if current_identity.source_fingerprint != baseline_identity.source_fingerprint {
                matches = false;
                reasons.push(format!(
                    "case fingerprint mismatch for {}: current={} baseline={}",
                    current.case_id,
                    current_identity.source_fingerprint,
                    baseline_identity.source_fingerprint
                ));
            }
            if current_identity.canonical_case_id != baseline_identity.canonical_case_id {
                matches = false;
                reasons.push(format!(
                    "case canonical id mismatch for {}: current={} baseline={}",
                    current.case_id,
                    current_identity.canonical_case_id,
                    baseline_identity.canonical_case_id
                ));
            }
            if current_identity.case_role != baseline_identity.case_role {
                matches = false;
                reasons.push(format!(
                    "case role mismatch for {}: current={:?} baseline={:?}",
                    current.case_id, current_identity.case_role, baseline_identity.case_role
                ));
            }
            if current_identity.purpose_provenance_summary
                != baseline_identity.purpose_provenance_summary
            {
                matches = false;
                reasons.push(format!(
                    "case purpose/provenance summary mismatch for {}",
                    current.case_id
                ));
            }
            if current_identity.declared_budget != baseline_identity.declared_budget {
                matches = false;
                reasons.push(format!(
                    "case declared_budget mismatch for {}: current={:?} baseline={:?}",
                    current.case_id,
                    current_identity.declared_budget,
                    baseline_identity.declared_budget
                ));
            }

            matches
        }
        (Some(_), None) => {
            reasons.push(format!(
                "case identity metadata missing in baseline run for {}",
                current.case_id
            ));
            false
        }
        (None, Some(_)) => {
            reasons.push(format!(
                "case identity metadata missing in current run for {}",
                current.case_id
            ));
            false
        }
        (None, None) => {
            reasons.push(format!(
                "case identity metadata missing in both runs for {}",
                current.case_id
            ));
            false
        }
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
        .filter_map(|comparison| quality_regression_suspect(comparison))
        .collect();
    quality_regressions.sort_by(|a, b| b.absolute_delta.total_cmp(&a.absolute_delta));
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
            } else {
                quality_improvement_suspect(comparison)
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

fn preferred_quality_delta<'a>(
    comparison: &'a CaseComparison,
) -> Option<(&'static str, &'a NumericDelta)> {
    comparison
        .final_score
        .as_ref()
        .map(|delta| ("final score", delta))
        .or_else(|| {
            comparison
                .best_score
                .as_ref()
                .map(|delta| ("best score", delta))
        })
}

fn quality_regression_suspect(comparison: &CaseComparison) -> Option<RegressionSuspect> {
    let (label, delta) = preferred_quality_delta(comparison)?;
    if delta.absolute <= 0.0 {
        return None;
    }

    Some(RegressionSuspect {
        kind: RegressionSuspectKind::CaseQuality,
        id: comparison.case_id.clone(),
        summary: format!(
            "{} {label} increased by {:.4} ({})",
            comparison.case_id,
            delta.absolute,
            format_percent(delta.percent)
        ),
        absolute_delta: delta.absolute,
        percent_delta: delta.percent,
    })
}

fn quality_improvement_suspect(comparison: &CaseComparison) -> Option<RegressionSuspect> {
    let (label, delta) = preferred_quality_delta(comparison)?;
    if delta.absolute >= 0.0 {
        return None;
    }

    Some(RegressionSuspect {
        kind: RegressionSuspectKind::CaseQuality,
        id: comparison.case_id.clone(),
        summary: format!(
            "{} {label} decreased by {:.4} ({})",
            comparison.case_id,
            delta.absolute.abs(),
            format_percent(delta.percent.map(f64::abs))
        ),
        absolute_delta: delta.absolute,
        percent_delta: delta.percent,
    })
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
    use crate::artifacts::{CaseComparison, MoveFamilyComparison, NumericDelta};
    use crate::manifest::BenchmarkSuiteClass;
    use crate::runner::{
        persist_run_report, run_suite_from_manifest, save_baseline_snapshot, RunnerOptions,
    };
    use tempfile::TempDir;

    fn sample_case_comparison() -> CaseComparison {
        CaseComparison {
            case_id: "stretch.sailing-trip-feature-dense".to_string(),
            class: BenchmarkSuiteClass::Stretch,
            runtime_seconds: NumericDelta {
                baseline: 1.0,
                current: 1.0,
                absolute: 0.0,
                percent: Some(0.0),
            },
            final_score: None,
            best_score: None,
            iteration_count: None,
            stop_reason_baseline: None,
            stop_reason_current: None,
            move_family_deltas: Vec::<MoveFamilyComparison>::new(),
        }
    }

    #[test]
    fn comparing_run_to_matching_baseline_is_comparable() {
        let temp = TempDir::new().expect("temp dir");
        let options = RunnerOptions {
            artifacts_dir: temp.path().to_path_buf(),
            cargo_profile: "test".to_string(),
        };
        let report = run_suite_from_manifest("suites/path.yaml", &options).expect("run path suite");
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
        assert!(comparison.comparability.same_case_identity);
        assert_eq!(comparison.case_comparisons.len(), report.cases.len());

        let comparison_path = persist_comparison_report(&comparison, &options.artifacts_dir)
            .expect("persist comparison report");
        assert!(comparison_path.exists());
    }

    #[test]
    fn run_report_case_identity_fingerprint_mismatch_is_reported_explicitly() {
        let temp = TempDir::new().expect("temp dir");
        let options = RunnerOptions {
            artifacts_dir: temp.path().to_path_buf(),
            cargo_profile: "test".to_string(),
        };
        let mut report =
            run_suite_from_manifest("suites/path.yaml", &options).expect("run path suite");
        let mismatched_case_id = report.cases[0].case_id.clone();
        let baseline_path =
            save_baseline_snapshot(&report, "path-baseline", &options.artifacts_dir, None)
                .expect("save baseline");
        let baseline =
            crate::runner::load_baseline_snapshot(&baseline_path).expect("load baseline");

        report.cases[0]
            .case_identity
            .as_mut()
            .expect("case identity should be present")
            .source_fingerprint =
            "sha256:0000000000000000000000000000000000000000000000000000000000000000".to_string();

        let comparison = compare_run_to_baseline(&report, &baseline);
        assert_eq!(
            comparison.comparability.status,
            ComparisonStatus::NotComparable
        );
        assert!(!comparison.comparability.same_case_identity);
        assert!(comparison.comparability.reasons.iter().any(|reason| {
            reason.contains("case fingerprint mismatch") && reason.contains(&mismatched_case_id)
        }));
    }

    #[test]
    fn suite_mismatch_is_reported_explicitly() {
        let temp = TempDir::new().expect("temp dir");
        let options = RunnerOptions {
            artifacts_dir: temp.path().to_path_buf(),
            cargo_profile: "test".to_string(),
        };
        let path_report =
            run_suite_from_manifest("suites/path.yaml", &options).expect("run path suite");
        let representative_report = run_suite_from_manifest("suites/representative.yaml", &options)
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
        let mut report =
            run_suite_from_manifest("suites/path.yaml", &options).expect("run path suite");
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

    #[test]
    fn solver_family_mismatch_is_reported_explicitly() {
        let temp = TempDir::new().expect("temp dir");
        let options = RunnerOptions {
            artifacts_dir: temp.path().to_path_buf(),
            cargo_profile: "test".to_string(),
        };
        let mut report =
            run_suite_from_manifest("suites/path.yaml", &options).expect("run path suite");
        let baseline_path =
            save_baseline_snapshot(&report, "path-baseline", &options.artifacts_dir, None)
                .expect("save baseline");
        let baseline =
            crate::runner::load_baseline_snapshot(&baseline_path).expect("load baseline");

        report.suite.solver_families = vec!["next_solver".to_string()];
        for case in &mut report.cases {
            case.solver.solver_family = "next_solver".to_string();
        }

        let comparison = compare_run_to_baseline(&report, &baseline);
        assert_eq!(
            comparison.comparability.status,
            ComparisonStatus::NotComparable
        );
        assert!(!comparison.comparability.same_solver_families);
        assert!(comparison
            .comparability
            .reasons
            .iter()
            .any(|reason| reason.contains("solver family mismatch")));
    }

    #[test]
    fn quality_regression_uses_higher_scores_as_worse() {
        let mut comparison = sample_case_comparison();
        comparison.final_score = Some(NumericDelta {
            baseline: 186.0,
            current: 188.0,
            absolute: 2.0,
            percent: Some(1.0752688172043012),
        });

        let suspects = build_suspect_summary(&[comparison]);
        assert_eq!(suspects.top_quality_regressions.len(), 1);
        assert!(suspects.top_quality_regressions[0]
            .summary
            .contains("final score increased by 2.0000"));
        assert!(suspects.top_improvements.is_empty());
    }

    #[test]
    fn quality_improvement_uses_lower_scores_as_better() {
        let mut comparison = sample_case_comparison();
        comparison.final_score = Some(NumericDelta {
            baseline: 188.0,
            current: 186.0,
            absolute: -2.0,
            percent: Some(-1.0638297872340425),
        });

        let suspects = build_suspect_summary(&[comparison]);
        assert!(suspects.top_quality_regressions.is_empty());
        assert_eq!(suspects.top_improvements.len(), 1);
        assert!(suspects.top_improvements[0]
            .summary
            .contains("final score decreased by 2.0000"));
    }

    #[test]
    fn best_score_is_used_when_final_score_is_unavailable() {
        let mut comparison = sample_case_comparison();
        comparison.best_score = Some(NumericDelta {
            baseline: 120.0,
            current: 123.0,
            absolute: 3.0,
            percent: Some(2.5),
        });

        let suspects = build_suspect_summary(&[comparison]);
        assert_eq!(suspects.top_quality_regressions.len(), 1);
        assert!(suspects.top_quality_regressions[0]
            .summary
            .contains("best score increased by 3.0000"));
    }
}
