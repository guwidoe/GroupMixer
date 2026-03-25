use crate::artifacts::{ComparisonReport, ComparisonStatus, RegressionSuspect};

pub fn render_comparison_summary(report: &ComparisonReport) -> String {
    let mut lines = Vec::new();
    lines.push(format!(
        "Benchmark comparison for suite '{}' mode '{}' (baseline '{}' vs run '{}')",
        report.suite_id, report.benchmark_mode, report.baseline_name, report.current_run_id
    ));

    match report.comparability.status {
        ComparisonStatus::Comparable => {
            lines.push("Comparability: comparable".to_string());
        }
        ComparisonStatus::NotComparable => {
            lines.push("Comparability: NOT comparable".to_string());
            for reason in &report.comparability.reasons {
                lines.push(format!("- {reason}"));
            }
            return lines.join("\n");
        }
    }

    if report.class_rollups.is_empty() {
        lines.push("No class rollups available.".to_string());
    } else {
        lines.push("Class rollups: ".to_string());
        for rollup in &report.class_rollups {
            lines.push(format!(
                "- {} runtime delta: {:+.4}s ({})",
                format_class(rollup.class.as_str()),
                rollup.total_runtime_seconds.absolute,
                format_percent(rollup.total_runtime_seconds.percent)
            ));
        }
    }

    append_section(&mut lines, "Top runtime regressions", &report.suspects.top_runtime_regressions);
    append_section(&mut lines, "Top quality regressions", &report.suspects.top_quality_regressions);
    append_section(
        &mut lines,
        "Top move-family regressions",
        &report.suspects.top_move_family_regressions,
    );
    append_section(&mut lines, "Top improvements", &report.suspects.top_improvements);

    lines.join("\n")
}

fn append_section(lines: &mut Vec<String>, title: &str, suspects: &[RegressionSuspect]) {
    lines.push(format!("{title}:"));
    if suspects.is_empty() {
        lines.push("- none".to_string());
    } else {
        for suspect in suspects {
            lines.push(format!("- {}", suspect.summary));
        }
    }
}

fn format_class(value: &str) -> String {
    value.replace('_', " ")
}

fn format_percent(value: Option<f64>) -> String {
    value
        .map(|value| format!("{value:.2}%"))
        .unwrap_or_else(|| "n/a".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compare::compare_run_to_baseline;
    use crate::runner::{run_suite_from_manifest, save_baseline_snapshot, RunnerOptions};
    use tempfile::TempDir;

    #[test]
    fn renders_human_summary_from_comparison_report() {
        let temp = TempDir::new().expect("temp dir");
        let options = RunnerOptions {
            artifacts_dir: temp.path().to_path_buf(),
            cargo_profile: "test".to_string(),
        };
        let report = run_suite_from_manifest("../benchmarking/suites/path.yaml", &options)
            .expect("run path suite");
        let baseline_path = save_baseline_snapshot(
            &report,
            "path-baseline",
            &options.artifacts_dir,
            None,
        )
        .expect("save baseline");
        let baseline = crate::runner::load_baseline_snapshot(&baseline_path).expect("load baseline");
        let comparison = compare_run_to_baseline(&report, &baseline);

        let summary = render_comparison_summary(&comparison);
        assert!(summary.contains("Benchmark comparison for suite 'path' mode 'full_solve'"));
        assert!(summary.contains("Comparability: comparable"));
        assert!(summary.contains("Top runtime regressions:"));
    }
}
