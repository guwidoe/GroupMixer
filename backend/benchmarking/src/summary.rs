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

    lines.push(format!(
        "Compatibility checks: canonical_case_identity={} declared_case_budgets={} effective_case_budgets={}",
        yes_no(report.comparability.same_case_canonical_identity),
        yes_no(report.comparability.same_declared_case_budgets),
        yes_no(report.comparability.same_effective_case_budgets)
    ));

    if report.class_rollups.is_empty() {
        lines.push("No class rollups available.".to_string());
    } else {
        lines.push("Class rollups:".to_string());
        for rollup in &report.class_rollups {
            let average_final = rollup
                .average_final_score
                .as_ref()
                .map(|delta| {
                    format!(
                        " avg_final_score {:+.4} ({})",
                        delta.absolute,
                        format_percent(delta.percent)
                    )
                })
                .unwrap_or_default();
            let average_best = rollup
                .average_best_score
                .as_ref()
                .map(|delta| {
                    format!(
                        " avg_best_score {:+.4} ({})",
                        delta.absolute,
                        format_percent(delta.percent)
                    )
                })
                .unwrap_or_default();
            lines.push(format!(
                "- {} runtime delta: {:+.4}s ({}){}{}",
                format_class(rollup.class.as_str()),
                rollup.total_runtime_seconds.absolute,
                format_percent(rollup.total_runtime_seconds.percent),
                average_final,
                average_best,
            ));
        }
    }

    append_per_case_objective_deltas(&mut lines, report);
    append_per_case_score_breakdown_deltas(&mut lines, report);
    append_per_case_telemetry_deltas(&mut lines, report);

    append_section(
        &mut lines,
        "Top runtime regressions",
        &report.suspects.top_runtime_regressions,
    );
    append_section(
        &mut lines,
        "Top quality regressions",
        &report.suspects.top_quality_regressions,
    );
    append_section(
        &mut lines,
        "Top move-family regressions",
        &report.suspects.top_move_family_regressions,
    );
    append_section(
        &mut lines,
        "Top improvements",
        &report.suspects.top_improvements,
    );

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

fn append_per_case_objective_deltas(lines: &mut Vec<String>, report: &ComparisonReport) {
    lines.push("Per-case objective deltas:".to_string());
    let mut found = false;

    for case in &report.case_comparisons {
        let mut metrics = Vec::new();
        if let Some(delta) = case.final_score.as_ref() {
            push_numeric_metric(&mut metrics, "final_score", delta.absolute, None);
        }
        if let Some(delta) = case.best_score.as_ref() {
            push_numeric_metric(&mut metrics, "best_score", delta.absolute, None);
        }
        if let Some(objective) = case.objective_metrics.as_ref() {
            if let Some(delta) = objective.unique_contacts.as_ref() {
                push_integer_metric(&mut metrics, "unique_contacts", delta.absolute);
            }
            if let Some(delta) = objective.weighted_repetition_penalty.as_ref() {
                push_numeric_metric(
                    &mut metrics,
                    "weighted_repetition_penalty",
                    delta.absolute,
                    None,
                );
            }
            if let Some(delta) = objective.weighted_constraint_penalty.as_ref() {
                push_numeric_metric(
                    &mut metrics,
                    "weighted_constraint_penalty",
                    delta.absolute,
                    None,
                );
            }
        }

        if !metrics.is_empty() {
            found = true;
            lines.push(format!("- {}: {}", case.case_id, metrics.join(", ")));
        }
    }

    if !found {
        lines.push("- none".to_string());
    }
}

fn append_per_case_score_breakdown_deltas(lines: &mut Vec<String>, report: &ComparisonReport) {
    lines.push("Per-case score-breakdown deltas:".to_string());
    let mut found = false;

    for case in &report.case_comparisons {
        let Some(decomposition) = case.score_decomposition.as_ref() else {
            continue;
        };

        let mut metrics = Vec::new();
        push_numeric_metric(
            &mut metrics,
            "total_score",
            decomposition.total_score.absolute,
            None,
        );
        push_integer_metric(
            &mut metrics,
            "unique_contacts",
            decomposition.unique_contacts.absolute,
        );
        push_numeric_metric(
            &mut metrics,
            "unique_contact_term",
            decomposition.unique_contact_term.absolute,
            None,
        );
        push_integer_metric(
            &mut metrics,
            "repetition_penalty",
            decomposition.repetition_penalty.absolute,
        );
        push_numeric_metric(
            &mut metrics,
            "repetition_term",
            decomposition.repetition_term.absolute,
            None,
        );
        push_numeric_metric(
            &mut metrics,
            "attribute_balance_term",
            decomposition.attribute_balance_term.absolute,
            None,
        );
        push_numeric_metric(
            &mut metrics,
            "weighted_constraint_total",
            decomposition.weighted_constraint_total.absolute,
            None,
        );

        if let Some((family, delta)) = dominant_constraint_family_delta(decomposition) {
            metrics.push(format!(
                "dominant_constraint_family={} {:+.4}",
                family, delta
            ));
        }

        if !metrics.is_empty() {
            found = true;
            lines.push(format!("- {}: {}", case.case_id, metrics.join(", ")));
        }
    }

    if !found {
        lines.push("- none".to_string());
    }
}

fn append_per_case_telemetry_deltas(lines: &mut Vec<String>, report: &ComparisonReport) {
    lines.push("Per-case telemetry deltas:".to_string());
    let mut found = false;

    for case in &report.case_comparisons {
        let mut metrics = Vec::new();
        if let Some(delta) = case.iteration_count.as_ref() {
            push_integer_metric(&mut metrics, "iteration_count", delta.absolute);
        }
        if let Some(delta) = case.no_improvement_count.as_ref() {
            push_integer_metric(&mut metrics, "no_improvement_count", delta.absolute);
        }
        if let Some(telemetry) = case.search_telemetry.as_ref() {
            push_numeric_metric(
                &mut metrics,
                "iterations_per_second",
                telemetry.iterations_per_second.absolute,
                Some("/s"),
            );
            push_integer_metric(
                &mut metrics,
                "max_no_improvement_streak",
                telemetry.max_no_improvement_streak.absolute,
            );
            push_integer_metric(
                &mut metrics,
                "accepted_downhill_moves",
                telemetry.accepted_downhill_moves.absolute,
            );
            push_integer_metric(
                &mut metrics,
                "accepted_uphill_moves",
                telemetry.accepted_uphill_moves.absolute,
            );
            push_integer_metric(
                &mut metrics,
                "accepted_neutral_moves",
                telemetry.accepted_neutral_moves.absolute,
            );
            if let Some(delta) = telemetry.restart_count.as_ref() {
                push_integer_metric(&mut metrics, "restart_count", delta.absolute);
            }
            if let Some(delta) = telemetry.perturbation_count.as_ref() {
                push_integer_metric(&mut metrics, "perturbation_count", delta.absolute);
            }
            push_integer_metric(
                &mut metrics,
                "best_score_timeline_points",
                telemetry.best_score_timeline_points.absolute,
            );
            push_integer_metric(
                &mut metrics,
                "last_improvement_iteration",
                telemetry.last_improvement_iteration.absolute,
            );
            push_numeric_metric(
                &mut metrics,
                "last_improvement_elapsed_seconds",
                telemetry.last_improvement_elapsed_seconds.absolute,
                Some("s"),
            );
            push_numeric_metric(
                &mut metrics,
                "seconds_after_last_improvement",
                telemetry.seconds_after_last_improvement.absolute,
                Some("s"),
            );
            push_numeric_metric(
                &mut metrics,
                "fraction_of_run_after_last_improvement",
                telemetry.fraction_of_run_after_last_improvement.absolute,
                None,
            );
            push_integer_metric(
                &mut metrics,
                "improvements_after_25_percent_run",
                telemetry.improvements_after_25_percent_run.absolute,
            );
            push_integer_metric(
                &mut metrics,
                "improvements_after_50_percent_run",
                telemetry.improvements_after_50_percent_run.absolute,
            );
            push_integer_metric(
                &mut metrics,
                "improvements_after_75_percent_run",
                telemetry.improvements_after_75_percent_run.absolute,
            );
            for checkpoint in &telemetry.checkpoint_score_deltas {
                push_numeric_metric(
                    &mut metrics,
                    &format!(
                        "checkpoint_{}pct_best_score",
                        (checkpoint.fraction_of_run * 100.0).round() as u64
                    ),
                    checkpoint.best_score.absolute,
                    None,
                );
            }
        }

        if !metrics.is_empty() {
            found = true;
            lines.push(format!("- {}: {}", case.case_id, metrics.join(", ")));
        }
    }

    if !found {
        lines.push("- none".to_string());
    }
}

fn dominant_constraint_family_delta(
    decomposition: &crate::artifacts::ScoreDecompositionComparison,
) -> Option<(&'static str, f64)> {
    let candidates = [
        (
            "forbidden_pair",
            decomposition
                .weighted_constraint_breakdown
                .forbidden_pair
                .weighted_penalty
                .absolute,
        ),
        (
            "should_stay_together",
            decomposition
                .weighted_constraint_breakdown
                .should_stay_together
                .weighted_penalty
                .absolute,
        ),
        (
            "pair_meeting_count",
            decomposition
                .weighted_constraint_breakdown
                .pair_meeting_count
                .weighted_penalty
                .absolute,
        ),
        (
            "clique",
            decomposition
                .weighted_constraint_breakdown
                .clique
                .weighted_penalty
                .absolute,
        ),
        (
            "immovable",
            decomposition
                .weighted_constraint_breakdown
                .immovable
                .weighted_penalty
                .absolute,
        ),
        (
            "residual",
            decomposition
                .weighted_constraint_breakdown
                .residual_weighted_penalty
                .absolute,
        ),
    ];

    let mut best: Option<(&str, f64)> = None;
    for (family, delta) in candidates {
        if delta.abs() <= 1e-9 {
            continue;
        }
        match best {
            Some((_, current_best)) if delta.abs() <= current_best.abs() => {}
            _ => best = Some((family, delta)),
        }
    }

    best
}

fn push_numeric_metric(target: &mut Vec<String>, label: &str, delta: f64, suffix: Option<&str>) {
    if delta.abs() <= 1e-9 {
        return;
    }
    let suffix = suffix.unwrap_or("");
    target.push(format!("{label} {:+.4}{suffix}", delta));
}

fn push_integer_metric(target: &mut Vec<String>, label: &str, delta: i64) {
    if delta == 0 {
        return;
    }
    target.push(format!("{label} {:+}", delta));
}

fn yes_no(value: bool) -> &'static str {
    if value {
        "yes"
    } else {
        "no"
    }
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
        let report = run_suite_from_manifest("suites/path.yaml", &options).expect("run path suite");
        let baseline_path =
            save_baseline_snapshot(&report, "path-baseline", &options.artifacts_dir, None)
                .expect("save baseline");
        let baseline =
            crate::runner::load_baseline_snapshot(&baseline_path).expect("load baseline");
        let comparison = compare_run_to_baseline(&report, &baseline);

        let summary = render_comparison_summary(&comparison);
        assert!(summary.contains("Benchmark comparison for suite 'path' mode 'full_solve'"));
        assert!(summary.contains("Comparability: comparable"));
        assert!(summary.contains("Per-case objective deltas:"));
        assert!(summary.contains("Per-case score-breakdown deltas:"));
        assert!(summary.contains("Per-case telemetry deltas:"));
        assert!(summary.contains("Top runtime regressions:"));
    }
}
