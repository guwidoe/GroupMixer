use crate::artifacts::{
    BaselineSnapshot, BenchmarkArtifactKind, BenchmarkSeedPolicy, CaseRunArtifact, CaseRunStatus,
    ClassRollup, EffectiveBenchmarkBudget, RunMetadata, RunReport, RunSuiteMetadata, RunTotals,
    SolveTimingBreakdown, SolverBenchmarkMetadata, SolverCapabilitiesSnapshot,
    BASELINE_SNAPSHOT_SCHEMA_VERSION, CASE_RUN_SCHEMA_VERSION, RUN_REPORT_SCHEMA_VERSION,
};
use crate::benchmark_mode::FULL_SOLVE_BENCHMARK_MODE;
use crate::hotpath::run_hotpath_case_artifact;
use crate::machine::{capture_git_identity, capture_machine_identity};
use crate::manifest::{
    load_suite_manifest, BenchmarkSuiteClass, LoadedBenchmarkCase, LoadedBenchmarkSuite,
};
use crate::storage::{machine_identity_label, BenchmarkStorage};
use anyhow::{Context, Result};
use chrono::Utc;
use gm_core::models::{MoveFamilyBenchmarkTelemetrySummary, SolverConfiguration, SolverKind};
use gm_core::{default_solver_configuration_for, run_solver, solver_descriptor};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct RunnerOptions {
    pub artifacts_dir: PathBuf,
    pub cargo_profile: String,
}

impl Default for RunnerOptions {
    fn default() -> Self {
        Self {
            artifacts_dir: BenchmarkStorage::from_env_or_default().root().to_path_buf(),
            cargo_profile: std::env::var("PROFILE").unwrap_or_else(|_| "dev".to_string()),
        }
    }
}

pub fn run_suite_from_manifest(
    manifest_path: impl AsRef<Path>,
    options: &RunnerOptions,
) -> Result<RunReport> {
    let suite = load_suite_manifest(manifest_path)?;
    run_loaded_suite(&suite, options)
}

pub fn run_loaded_suite(
    suite: &LoadedBenchmarkSuite,
    options: &RunnerOptions,
) -> Result<RunReport> {
    let run_id = format!(
        "{}-{}-{}",
        suite.manifest.suite_id,
        Utc::now().format("%Y%m%dT%H%M%SZ"),
        &Uuid::new_v4().simple().to_string()[..8]
    );
    let generated_at = Utc::now().to_rfc3339();
    let git = capture_git_identity();
    let machine = capture_machine_identity(Some(&options.cargo_profile));

    let mut cases = Vec::with_capacity(suite.cases.len());
    for case in &suite.cases {
        cases.push(
            if suite.manifest.benchmark_mode == FULL_SOLVE_BENCHMARK_MODE {
                run_case(
                    &run_id,
                    &generated_at,
                    suite,
                    case,
                    git.clone(),
                    machine.clone(),
                )
            } else {
                run_hotpath_case_artifact(
                    &run_id,
                    &generated_at,
                    suite,
                    case,
                    git.clone(),
                    machine.clone(),
                )
            },
        );
    }

    let totals = build_totals(&cases);
    let class_rollups = build_class_rollups(&cases);

    Ok(RunReport {
        schema_version: RUN_REPORT_SCHEMA_VERSION,
        suite: RunSuiteMetadata {
            suite_id: suite.manifest.suite_id.clone(),
            benchmark_mode: suite.manifest.benchmark_mode.clone(),
            comparison_category: suite.manifest.comparison_category,
            solver_families: suite_solver_families(&cases),
            class: suite.manifest.class,
            title: suite.manifest.title.clone(),
            description: suite.manifest.description.clone(),
            manifest_path: suite.manifest_path.display().to_string(),
        },
        run: RunMetadata {
            run_id,
            generated_at,
            git,
            machine,
        },
        totals,
        class_rollups,
        cases,
    })
}

pub fn persist_run_report(report: &RunReport, artifacts_dir: impl AsRef<Path>) -> Result<PathBuf> {
    let storage = BenchmarkStorage::new(artifacts_dir.as_ref());
    storage.ensure_layout()?;
    storage.persist_machine_record(&report.run.machine, &report.run.generated_at)?;

    let run_dir = storage.run_dir(&report.run.run_id);
    let case_dir = run_dir.join("cases");
    fs::create_dir_all(&case_dir)
        .with_context(|| format!("failed to create benchmark run dir {}", run_dir.display()))?;

    let run_report_path = run_dir.join("run-report.json");
    write_json(&run_report_path, report)?;
    for case in &report.cases {
        let case_path = case_dir.join(format!("{}.json", sanitize_filename(&case.case_id)));
        write_json(&case_path, case)?;
    }

    Ok(run_report_path)
}

pub fn save_baseline_snapshot(
    report: &RunReport,
    baseline_name: &str,
    artifacts_dir: impl AsRef<Path>,
    source_run_path: Option<PathBuf>,
) -> Result<PathBuf> {
    let storage = BenchmarkStorage::new(artifacts_dir.as_ref());
    storage.ensure_layout()?;
    storage.persist_machine_record(&report.run.machine, &report.run.generated_at)?;

    let machine_id = machine_identity_label(&report.run.machine)
        .context("cannot save baseline without machine identity")?;
    let baseline_path =
        storage.baseline_snapshot_path(&machine_id, &report.suite.suite_id, baseline_name);

    let snapshot = BaselineSnapshot {
        schema_version: BASELINE_SNAPSHOT_SCHEMA_VERSION,
        baseline_name: baseline_name.to_string(),
        created_at: Utc::now().to_rfc3339(),
        source_run_path: source_run_path.map(|path| path.display().to_string()),
        run_report: report.clone(),
    };

    write_json(&baseline_path, &snapshot)?;
    Ok(baseline_path)
}

pub fn load_run_report(path: impl AsRef<Path>) -> Result<RunReport> {
    let path = path.as_ref();
    let contents = fs::read_to_string(path)
        .with_context(|| format!("failed to read run report {}", path.display()))?;
    let report: RunReport = serde_json::from_str(&contents)
        .with_context(|| format!("failed to parse run report {}", path.display()))?;
    Ok(report)
}

pub fn load_baseline_snapshot(path: impl AsRef<Path>) -> Result<BaselineSnapshot> {
    let path = path.as_ref();
    let contents = fs::read_to_string(path)
        .with_context(|| format!("failed to read baseline snapshot {}", path.display()))?;
    let snapshot: BaselineSnapshot = serde_json::from_str(&contents)
        .with_context(|| format!("failed to parse baseline snapshot {}", path.display()))?;
    Ok(snapshot)
}

fn run_case(
    run_id: &str,
    generated_at: &str,
    suite: &LoadedBenchmarkSuite,
    case: &LoadedBenchmarkCase,
    git: crate::artifacts::GitIdentity,
    machine: crate::artifacts::MachineIdentity,
) -> CaseRunArtifact {
    debug_assert_eq!(suite.manifest.benchmark_mode, FULL_SOLVE_BENCHMARK_MODE);
    let input = apply_effective_overrides(suite, case);
    let effective_budget = EffectiveBenchmarkBudget {
        max_iterations: input.solver.stop_conditions.max_iterations,
        time_limit_seconds: input.solver.stop_conditions.time_limit_seconds,
        no_improvement_iterations: input.solver.stop_conditions.no_improvement_iterations,
    };
    let solver_metadata = build_solver_metadata(&input);

    let wall_start = Instant::now();
    match run_solver(&input) {
        Ok(result) => {
            let telemetry = result.benchmark_telemetry.clone();
            let timing = telemetry
                .as_ref()
                .map(|telemetry| SolveTimingBreakdown {
                    initialization_seconds: telemetry.initialization_seconds,
                    search_seconds: telemetry.search_seconds,
                    finalization_seconds: telemetry.finalization_seconds,
                    total_seconds: telemetry.total_seconds,
                })
                .unwrap_or_else(|| SolveTimingBreakdown {
                    total_seconds: wall_start.elapsed().as_secs_f64(),
                    ..Default::default()
                });
            let moves = telemetry
                .as_ref()
                .map(|telemetry| telemetry.moves.clone())
                .unwrap_or_default();

            CaseRunArtifact {
                schema_version: CASE_RUN_SCHEMA_VERSION,
                run_id: run_id.to_string(),
                generated_at: generated_at.to_string(),
                suite_id: suite.manifest.suite_id.clone(),
                benchmark_mode: suite.manifest.benchmark_mode.clone(),
                suite_class: suite.manifest.class,
                case_id: case.manifest.id.clone(),
                case_class: case.manifest.class,
                case_manifest_path: case.manifest_path.display().to_string(),
                case_title: case.manifest.title.clone(),
                case_description: case.manifest.description.clone(),
                tags: case.manifest.tags.clone(),
                git,
                machine,
                solver: solver_metadata.clone(),
                effective_seed: result.effective_seed.or(input.solver.seed),
                effective_budget,
                artifact_kind: BenchmarkArtifactKind::FullSolve,
                effective_move_policy: result.move_policy.or(input.solver.move_policy.clone()),
                stop_reason: result.stop_reason,
                status: CaseRunStatus::Success,
                error_message: None,
                runtime_seconds: timing.total_seconds,
                timing,
                initial_score: telemetry.as_ref().map(|telemetry| telemetry.initial_score),
                final_score: Some(result.final_score),
                best_score: telemetry.as_ref().map(|telemetry| telemetry.best_score),
                iteration_count: telemetry
                    .as_ref()
                    .map(|telemetry| telemetry.iterations_completed),
                no_improvement_count: Some(result.no_improvement_count),
                unique_contacts: Some(result.unique_contacts),
                weighted_repetition_penalty: Some(result.weighted_repetition_penalty),
                weighted_constraint_penalty: Some(result.weighted_constraint_penalty),
                moves,
                hotpath_metrics: None,
            }
        }
        Err(error) => CaseRunArtifact {
            schema_version: CASE_RUN_SCHEMA_VERSION,
            run_id: run_id.to_string(),
            generated_at: generated_at.to_string(),
            suite_id: suite.manifest.suite_id.clone(),
            benchmark_mode: suite.manifest.benchmark_mode.clone(),
            suite_class: suite.manifest.class,
            case_id: case.manifest.id.clone(),
            case_class: case.manifest.class,
            case_manifest_path: case.manifest_path.display().to_string(),
            case_title: case.manifest.title.clone(),
            case_description: case.manifest.description.clone(),
            tags: case.manifest.tags.clone(),
            git,
            machine,
            solver: solver_metadata,
            effective_seed: input.solver.seed,
            effective_budget,
            artifact_kind: BenchmarkArtifactKind::FullSolve,
            effective_move_policy: input.solver.move_policy.clone(),
            stop_reason: None,
            status: CaseRunStatus::SolverError,
            error_message: Some(error.to_string()),
            runtime_seconds: wall_start.elapsed().as_secs_f64(),
            timing: SolveTimingBreakdown {
                total_seconds: wall_start.elapsed().as_secs_f64(),
                ..Default::default()
            },
            initial_score: None,
            final_score: None,
            best_score: None,
            iteration_count: None,
            no_improvement_count: None,
            unique_contacts: None,
            weighted_repetition_penalty: None,
            weighted_constraint_penalty: None,
            moves: MoveFamilyBenchmarkTelemetrySummary::default(),
            hotpath_metrics: None,
        },
    }
}

fn apply_effective_overrides(
    suite: &LoadedBenchmarkSuite,
    case: &LoadedBenchmarkCase,
) -> gm_core::models::ApiInput {
    let mut input = case
        .manifest
        .input
        .clone()
        .expect("full-solve benchmark cases require input");

    if let Some(target_solver_kind) = effective_solver_kind_override(suite, case) {
        input = retarget_input_for_solver_kind(&input, target_solver_kind);
    }

    input.solver.seed = case
        .overrides
        .seed
        .or(suite.manifest.default_seed)
        .or(input.solver.seed);

    if let Some(max_iterations) = case
        .overrides
        .max_iterations
        .or(suite.manifest.default_max_iterations)
    {
        input.solver.stop_conditions.max_iterations = Some(max_iterations);
    }

    if let Some(time_limit_seconds) = case
        .overrides
        .time_limit_seconds
        .or(suite.manifest.default_time_limit_seconds)
    {
        input.solver.stop_conditions.time_limit_seconds = Some(time_limit_seconds);
    }

    if let Some(move_policy) = case
        .overrides
        .move_policy
        .clone()
        .or_else(|| suite.manifest.default_move_policy.clone())
    {
        input.solver.move_policy = Some(move_policy);
    }

    input
}

fn effective_solver_kind_override(
    suite: &LoadedBenchmarkSuite,
    case: &LoadedBenchmarkCase,
) -> Option<SolverKind> {
    case.overrides
        .solver_family
        .as_deref()
        .or(suite.manifest.default_solver_family.as_deref())
        .map(|solver_family| {
            SolverKind::parse_config_id(solver_family)
                .expect("benchmark suite solver family overrides should validate before use")
        })
}

fn retarget_input_for_solver_kind(
    input: &gm_core::models::ApiInput,
    solver_kind: SolverKind,
) -> gm_core::models::ApiInput {
    let mut retargeted = input.clone();
    let current_kind = input
        .solver
        .validate_solver_selection()
        .expect("benchmark inputs should carry valid solver selection");

    if current_kind == solver_kind {
        retargeted.solver.solver_type = solver_kind.canonical_id().to_string();
        return retargeted;
    }

    let mut replacement: SolverConfiguration = default_solver_configuration_for(solver_kind);
    replacement.stop_conditions = input.solver.stop_conditions.clone();
    replacement.logging = input.solver.logging.clone();
    replacement.telemetry = input.solver.telemetry.clone();
    replacement.seed = input.solver.seed;
    replacement.move_policy = input.solver.move_policy.clone();
    replacement.allowed_sessions = input.solver.allowed_sessions.clone();
    retargeted.solver = replacement;
    retargeted
}

fn build_totals(cases: &[CaseRunArtifact]) -> RunTotals {
    RunTotals {
        total_cases: cases.len(),
        successful_cases: cases
            .iter()
            .filter(|case| case.status == CaseRunStatus::Success)
            .count(),
        failed_cases: cases
            .iter()
            .filter(|case| case.status != CaseRunStatus::Success)
            .count(),
        total_runtime_seconds: cases.iter().map(|case| case.runtime_seconds).sum(),
    }
}

fn build_class_rollups(cases: &[CaseRunArtifact]) -> Vec<ClassRollup> {
    let mut grouped: BTreeMap<BenchmarkSuiteClass, Vec<&CaseRunArtifact>> = BTreeMap::new();
    for case in cases {
        grouped.entry(case.case_class).or_default().push(case);
    }

    grouped
        .into_iter()
        .map(|(class, group)| {
            let total_cases = group.len();
            let successful_cases = group
                .iter()
                .filter(|case| case.status == CaseRunStatus::Success)
                .count();
            let failed_cases = total_cases.saturating_sub(successful_cases);
            let total_runtime_seconds: f64 = group.iter().map(|case| case.runtime_seconds).sum();
            let average_runtime_seconds = if total_cases == 0 {
                0.0
            } else {
                total_runtime_seconds / total_cases as f64
            };
            let final_scores: Vec<f64> = group.iter().filter_map(|case| case.final_score).collect();
            let best_scores: Vec<f64> = group.iter().filter_map(|case| case.best_score).collect();

            ClassRollup {
                class,
                total_cases,
                successful_cases,
                failed_cases,
                total_runtime_seconds,
                average_runtime_seconds,
                average_final_score: average(&final_scores),
                average_best_score: average(&best_scores),
            }
        })
        .collect()
}

fn average(values: &[f64]) -> Option<f64> {
    if values.is_empty() {
        None
    } else {
        Some(values.iter().sum::<f64>() / values.len() as f64)
    }
}

fn build_solver_metadata(input: &gm_core::models::ApiInput) -> SolverBenchmarkMetadata {
    let kind = input
        .solver
        .validate_solver_selection()
        .expect("benchmark inputs should carry valid solver selection");
    let descriptor = solver_descriptor(kind);

    SolverBenchmarkMetadata {
        solver_family: kind.canonical_id().to_string(),
        solver_config_id: input.solver.solver_type.clone(),
        display_name: descriptor.display_name.to_string(),
        seed_policy: if input.solver.seed.is_some() {
            BenchmarkSeedPolicy::Explicit
        } else {
            BenchmarkSeedPolicy::RuntimeGenerated
        },
        capabilities: SolverCapabilitiesSnapshot {
            supports_initial_schedule: descriptor.capabilities.supports_initial_schedule,
            supports_progress_callback: descriptor.capabilities.supports_progress_callback,
            supports_benchmark_observer: descriptor.capabilities.supports_benchmark_observer,
            supports_recommended_settings: descriptor.capabilities.supports_recommended_settings,
            supports_deterministic_seed: descriptor.capabilities.supports_deterministic_seed,
        },
    }
}

pub(crate) fn build_solver_metadata_for_kind(
    kind: SolverKind,
    solver_config_id: &str,
    seed_policy: BenchmarkSeedPolicy,
) -> SolverBenchmarkMetadata {
    let descriptor = solver_descriptor(kind);
    SolverBenchmarkMetadata {
        solver_family: kind.canonical_id().to_string(),
        solver_config_id: solver_config_id.to_string(),
        display_name: descriptor.display_name.to_string(),
        seed_policy,
        capabilities: SolverCapabilitiesSnapshot {
            supports_initial_schedule: descriptor.capabilities.supports_initial_schedule,
            supports_progress_callback: descriptor.capabilities.supports_progress_callback,
            supports_benchmark_observer: descriptor.capabilities.supports_benchmark_observer,
            supports_recommended_settings: descriptor.capabilities.supports_recommended_settings,
            supports_deterministic_seed: descriptor.capabilities.supports_deterministic_seed,
        },
    }
}

fn suite_solver_families(cases: &[CaseRunArtifact]) -> Vec<String> {
    let mut families: Vec<String> = cases
        .iter()
        .map(|case| case.solver.solver_family.clone())
        .collect();
    families.sort();
    families.dedup();
    families
}

fn write_json<T: serde::Serialize>(path: &Path, value: &T) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create benchmark dir {}", parent.display()))?;
    }
    let contents =
        serde_json::to_string_pretty(value).context("failed to serialize benchmark artifact")?;
    fs::write(path, contents)
        .with_context(|| format!("failed to write benchmark artifact {}", path.display()))
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
    use serde_json::json;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn path_suite_runs_and_persists_artifacts() {
        let temp = TempDir::new().expect("temp dir");
        let options = RunnerOptions {
            artifacts_dir: temp.path().to_path_buf(),
            cargo_profile: "test".to_string(),
        };

        let report =
            run_suite_from_manifest("suites/path.yaml", &options).expect("path suite should run");
        assert_eq!(report.suite.suite_id, "path");
        assert_eq!(
            report.suite.comparison_category,
            crate::artifacts::BenchmarkComparisonCategory::InvariantOnly
        );
        assert_eq!(report.suite.solver_families, vec!["solver1".to_string()]);
        assert!(report.totals.total_cases >= 5);
        assert_eq!(report.totals.failed_cases, 0);
        assert!(report
            .cases
            .iter()
            .all(|case| case.solver.solver_family == "solver1"));

        let run_path =
            persist_run_report(&report, &options.artifacts_dir).expect("persist run report");
        assert!(run_path.exists());

        let baseline_path = save_baseline_snapshot(
            &report,
            "path-baseline",
            &options.artifacts_dir,
            Some(run_path.clone()),
        )
        .expect("save baseline");
        assert!(baseline_path.exists());

        let reloaded = load_run_report(&run_path).expect("reload run report");
        assert_eq!(reloaded.run.run_id, report.run.run_id);
        let baseline = load_baseline_snapshot(&baseline_path).expect("reload baseline");
        assert_eq!(baseline.baseline_name, "path-baseline");
        assert_eq!(baseline.run_report.run.run_id, report.run.run_id);
    }

    #[test]
    fn full_solve_suite_can_retarget_cases_to_solver2() {
        let temp = TempDir::new().expect("temp dir");
        let options = RunnerOptions {
            artifacts_dir: temp.path().to_path_buf(),
            cargo_profile: "test".to_string(),
        };

        let report = run_suite_from_manifest("suites/path-solver2.yaml", &options)
            .expect("solver2 path suite should run");

        assert_eq!(report.suite.suite_id, "path-solver2");
        assert_eq!(report.suite.solver_families, vec!["solver2".to_string()]);
        assert_eq!(report.totals.failed_cases, 0);
        assert!(report
            .cases
            .iter()
            .all(|case| case.solver.solver_family == "solver2"));
        assert!(report
            .cases
            .iter()
            .all(|case| case.solver.solver_config_id == "solver2"));
    }

    #[test]
    fn full_solve_suite_can_retarget_cases_to_solver3() {
        let temp = TempDir::new().expect("temp dir");
        let options = RunnerOptions {
            artifacts_dir: temp.path().to_path_buf(),
            cargo_profile: "test".to_string(),
        };

        let report = run_suite_from_manifest("suites/path-solver3.yaml", &options)
            .expect("solver3 path suite should run");

        assert_eq!(report.suite.suite_id, "path-solver3");
        assert_eq!(report.suite.solver_families, vec!["solver3".to_string()]);
        assert_eq!(report.totals.failed_cases, 0);
        assert!(report
            .cases
            .iter()
            .all(|case| case.solver.solver_family == "solver3"));
        assert!(report
            .cases
            .iter()
            .all(|case| case.solver.solver_config_id == "solver3"));
    }

    #[test]
    fn hotpath_suite_runs_and_persists_structured_metrics() {
        let temp = TempDir::new().expect("temp dir");
        let suite_dir = temp.path().join("backend/benchmarking/suites");
        let case_dir = temp.path().join("backend/benchmarking/cases/hotpath");
        fs::create_dir_all(&suite_dir).expect("mk suite dir");
        fs::create_dir_all(&case_dir).expect("mk case dir");

        let case_path = case_dir.join("swap_preview.json");
        fs::write(
            &case_path,
            serde_json::to_string_pretty(&json!({
                "schema_version": 1,
                "id": "hotpath.swap-preview.default",
                "class": "representative",
                "solver_family": "solver1",
                "title": "Hotpath swap preview",
                "description": "Deterministic swap preview kernel run",
                "tags": ["hotpath", "swap", "preview"],
                "hotpath_preset": "swap_default"
            }))
            .expect("serialize case"),
        )
        .expect("write case");

        let suite_path = suite_dir.join("hotpath-swap-preview.yaml");
        fs::write(
            &suite_path,
            [
                "schema_version: 1",
                "suite_id: hotpath-swap-preview",
                "benchmark_mode: swap_preview",
                "class: representative",
                "default_iterations: 8",
                "default_warmup_iterations: 1",
                "cases:",
                "  - manifest: ../cases/hotpath/swap_preview.json",
            ]
            .join("\n"),
        )
        .expect("write suite");

        let options = RunnerOptions {
            artifacts_dir: temp.path().join("artifacts"),
            cargo_profile: "test".to_string(),
        };

        let report =
            run_suite_from_manifest(&suite_path, &options).expect("hotpath suite should run");
        assert_eq!(report.suite.benchmark_mode, "swap_preview");
        assert_eq!(
            report.suite.comparison_category,
            crate::artifacts::BenchmarkComparisonCategory::PerformanceOnly
        );
        assert_eq!(report.totals.total_cases, 1);
        assert_eq!(
            report.cases[0].artifact_kind,
            BenchmarkArtifactKind::HotPath
        );
        assert_eq!(report.cases[0].solver.solver_family, "solver1");
        let metrics = report.cases[0]
            .hotpath_metrics
            .as_ref()
            .expect("hotpath metrics should exist");
        assert_eq!(metrics.benchmark_mode, "swap_preview");
        assert_eq!(metrics.preset.as_deref(), Some("swap_default"));
        assert_eq!(metrics.iterations, 8);
        assert!(metrics.preview_seconds > 0.0);

        let run_path =
            persist_run_report(&report, &options.artifacts_dir).expect("persist run report");
        let reloaded = load_run_report(&run_path).expect("reload run report");
        assert_eq!(reloaded.suite.benchmark_mode, "swap_preview");
        assert_eq!(
            reloaded.cases[0].artifact_kind,
            BenchmarkArtifactKind::HotPath
        );
    }

    #[test]
    fn hotpath_suite_runs_solver2_swap_preview_with_shared_artifacts() {
        let temp = TempDir::new().expect("temp dir");
        let suite_dir = temp.path().join("backend/benchmarking/suites");
        let case_dir = temp.path().join("backend/benchmarking/cases/hotpath");
        fs::create_dir_all(&suite_dir).expect("mk suite dir");
        fs::create_dir_all(&case_dir).expect("mk case dir");

        let case_path = case_dir.join("swap_preview_solver2_supported.json");
        fs::write(
            &case_path,
            serde_json::to_string_pretty(&json!({
                "schema_version": 1,
                "id": "hotpath.swap-preview.solver2.supported",
                "class": "representative",
                "solver_family": "solver2",
                "title": "Hotpath swap preview for solver2",
                "description": "Supported solver2 swap preview hotpath lane",
                "tags": ["hotpath", "swap", "preview", "solver2"],
                "hotpath_preset": "swap_default_solver2"
            }))
            .expect("serialize case"),
        )
        .expect("write case");

        let suite_path = suite_dir.join("hotpath-swap-preview-solver2-supported.yaml");
        fs::write(
            &suite_path,
            [
                "schema_version: 1",
                "suite_id: hotpath-swap-preview-solver2-supported",
                "benchmark_mode: swap_preview",
                "class: representative",
                "default_iterations: 4",
                "default_warmup_iterations: 1",
                "cases:",
                "  - manifest: ../cases/hotpath/swap_preview_solver2_supported.json",
            ]
            .join("\n"),
        )
        .expect("write suite");

        let options = RunnerOptions {
            artifacts_dir: temp.path().join("artifacts"),
            cargo_profile: "test".to_string(),
        };

        let report = run_suite_from_manifest(&suite_path, &options)
            .expect("solver2 hotpath suite should run successfully");
        assert_eq!(report.suite.solver_families, vec!["solver2".to_string()]);
        assert_eq!(report.totals.total_cases, 1);
        assert_eq!(report.totals.successful_cases, 1);
        assert_eq!(
            report.cases[0].artifact_kind,
            BenchmarkArtifactKind::HotPath
        );
        assert_eq!(report.cases[0].solver.solver_family, "solver2");
        assert_eq!(report.cases[0].status, CaseRunStatus::Success);
        let metrics = report.cases[0]
            .hotpath_metrics
            .as_ref()
            .expect("hotpath metrics should exist");
        assert_eq!(metrics.benchmark_mode, "swap_preview");
        assert_eq!(metrics.preset.as_deref(), Some("swap_default_solver2"));
        assert!(metrics.preview_seconds > 0.0);
    }

    #[test]
    fn hotpath_suite_runs_solver3_swap_preview_with_shared_artifacts() {
        let temp = TempDir::new().expect("temp dir");
        let suite_dir = temp.path().join("backend/benchmarking/suites");
        let case_dir = temp.path().join("backend/benchmarking/cases/hotpath");
        fs::create_dir_all(&suite_dir).expect("mk suite dir");
        fs::create_dir_all(&case_dir).expect("mk case dir");

        let case_path = case_dir.join("swap_preview_solver3_supported.json");
        fs::write(
            &case_path,
            serde_json::to_string_pretty(&json!({
                "schema_version": 1,
                "id": "hotpath.swap-preview.solver3.supported",
                "class": "representative",
                "solver_family": "solver3",
                "title": "Hotpath swap preview for solver3",
                "description": "Supported solver3 swap preview hotpath lane",
                "tags": ["hotpath", "swap", "preview", "solver3"],
                "hotpath_preset": "swap_default_solver3"
            }))
            .expect("serialize case"),
        )
        .expect("write case");

        let suite_path = suite_dir.join("hotpath-swap-preview-solver3-supported.yaml");
        fs::write(
            &suite_path,
            [
                "schema_version: 1",
                "suite_id: hotpath-swap-preview-solver3-supported",
                "benchmark_mode: swap_preview",
                "class: representative",
                "default_iterations: 4",
                "default_warmup_iterations: 1",
                "cases:",
                "  - manifest: ../cases/hotpath/swap_preview_solver3_supported.json",
            ]
            .join("\n"),
        )
        .expect("write suite");

        let options = RunnerOptions {
            artifacts_dir: temp.path().join("artifacts"),
            cargo_profile: "test".to_string(),
        };

        let report = run_suite_from_manifest(&suite_path, &options)
            .expect("solver3 hotpath suite should run successfully");
        assert_eq!(report.suite.solver_families, vec!["solver3".to_string()]);
        assert_eq!(report.totals.total_cases, 1);
        assert_eq!(report.totals.successful_cases, 1);
        assert_eq!(
            report.cases[0].artifact_kind,
            BenchmarkArtifactKind::HotPath
        );
        assert_eq!(report.cases[0].solver.solver_family, "solver3");
        assert_eq!(report.cases[0].status, CaseRunStatus::Success);
        let metrics = report.cases[0]
            .hotpath_metrics
            .as_ref()
            .expect("hotpath metrics should exist");
        assert_eq!(metrics.benchmark_mode, "swap_preview");
        assert_eq!(metrics.preset.as_deref(), Some("swap_default_solver3"));
        assert!(metrics.preview_seconds > 0.0);
    }

    #[test]
    fn hotpath_suite_runs_solver2_transfer_preview_with_shared_artifacts() {
        let temp = TempDir::new().expect("temp dir");
        let suite_dir = temp.path().join("backend/benchmarking/suites");
        let case_dir = temp.path().join("backend/benchmarking/cases/hotpath");
        fs::create_dir_all(&suite_dir).expect("mk suite dir");
        fs::create_dir_all(&case_dir).expect("mk case dir");

        let case_path = case_dir.join("transfer_preview_solver2_supported.json");
        fs::write(
            &case_path,
            serde_json::to_string_pretty(&json!({
                "schema_version": 1,
                "id": "hotpath.transfer-preview.solver2.supported",
                "class": "representative",
                "solver_family": "solver2",
                "title": "Hotpath transfer preview for solver2",
                "description": "Supported solver2 transfer preview hotpath lane",
                "tags": ["hotpath", "transfer", "preview", "solver2"],
                "hotpath_preset": "transfer_default_solver2"
            }))
            .expect("serialize case"),
        )
        .expect("write case");

        let suite_path = suite_dir.join("hotpath-transfer-preview-solver2-supported.yaml");
        fs::write(
            &suite_path,
            [
                "schema_version: 1",
                "suite_id: hotpath-transfer-preview-solver2-supported",
                "benchmark_mode: transfer_preview",
                "class: representative",
                "default_iterations: 4",
                "default_warmup_iterations: 1",
                "cases:",
                "  - manifest: ../cases/hotpath/transfer_preview_solver2_supported.json",
            ]
            .join("\n"),
        )
        .expect("write suite");

        let options = RunnerOptions {
            artifacts_dir: temp.path().join("artifacts"),
            cargo_profile: "test".to_string(),
        };

        let report = run_suite_from_manifest(&suite_path, &options)
            .expect("solver2 transfer hotpath suite should run successfully");
        assert_eq!(report.suite.solver_families, vec!["solver2".to_string()]);
        assert_eq!(report.totals.successful_cases, 1);
        assert_eq!(report.cases[0].solver.solver_family, "solver2");
        assert_eq!(report.cases[0].status, CaseRunStatus::Success);
        let metrics = report.cases[0]
            .hotpath_metrics
            .as_ref()
            .expect("hotpath metrics should exist");
        assert_eq!(metrics.benchmark_mode, "transfer_preview");
        assert_eq!(metrics.preset.as_deref(), Some("transfer_default_solver2"));
        assert!(metrics.preview_seconds > 0.0);
    }

    #[test]
    fn hotpath_suite_runs_solver3_transfer_preview_with_shared_artifacts() {
        let temp = TempDir::new().expect("temp dir");
        let suite_dir = temp.path().join("backend/benchmarking/suites");
        let case_dir = temp.path().join("backend/benchmarking/cases/hotpath");
        fs::create_dir_all(&suite_dir).expect("mk suite dir");
        fs::create_dir_all(&case_dir).expect("mk case dir");

        let case_path = case_dir.join("transfer_preview_solver3_supported.json");
        fs::write(
            &case_path,
            serde_json::to_string_pretty(&json!({
                "schema_version": 1,
                "id": "hotpath.transfer-preview.solver3.supported",
                "class": "representative",
                "solver_family": "solver3",
                "title": "Hotpath transfer preview for solver3",
                "description": "Supported solver3 transfer preview hotpath lane",
                "tags": ["hotpath", "transfer", "preview", "solver3"],
                "hotpath_preset": "transfer_default_solver3"
            }))
            .expect("serialize case"),
        )
        .expect("write case");

        let suite_path = suite_dir.join("hotpath-transfer-preview-solver3-supported.yaml");
        fs::write(
            &suite_path,
            [
                "schema_version: 1",
                "suite_id: hotpath-transfer-preview-solver3-supported",
                "benchmark_mode: transfer_preview",
                "class: representative",
                "default_iterations: 4",
                "default_warmup_iterations: 1",
                "cases:",
                "  - manifest: ../cases/hotpath/transfer_preview_solver3_supported.json",
            ]
            .join("\n"),
        )
        .expect("write suite");

        let options = RunnerOptions {
            artifacts_dir: temp.path().join("artifacts"),
            cargo_profile: "test".to_string(),
        };

        let report = run_suite_from_manifest(&suite_path, &options)
            .expect("solver3 transfer hotpath suite should run successfully");
        assert_eq!(report.suite.solver_families, vec!["solver3".to_string()]);
        assert_eq!(report.totals.successful_cases, 1);
        assert_eq!(report.cases[0].solver.solver_family, "solver3");
        assert_eq!(report.cases[0].status, CaseRunStatus::Success);
        let metrics = report.cases[0]
            .hotpath_metrics
            .as_ref()
            .expect("hotpath metrics should exist");
        assert_eq!(metrics.benchmark_mode, "transfer_preview");
        assert_eq!(metrics.preset.as_deref(), Some("transfer_default_solver3"));
        assert!(metrics.preview_seconds > 0.0);
    }

    #[test]
    fn hotpath_suite_runs_solver2_clique_swap_preview_with_shared_artifacts() {
        let temp = TempDir::new().expect("temp dir");
        let suite_dir = temp.path().join("backend/benchmarking/suites");
        let case_dir = temp.path().join("backend/benchmarking/cases/hotpath");
        fs::create_dir_all(&suite_dir).expect("mk suite dir");
        fs::create_dir_all(&case_dir).expect("mk case dir");

        let case_path = case_dir.join("clique_swap_preview_solver2_supported.json");
        fs::write(
            &case_path,
            serde_json::to_string_pretty(&json!({
                "schema_version": 1,
                "id": "hotpath.clique-swap-preview.solver2.supported",
                "class": "representative",
                "solver_family": "solver2",
                "title": "Hotpath clique swap preview for solver2",
                "description": "Supported solver2 clique swap preview hotpath lane",
                "tags": ["hotpath", "clique_swap", "preview", "solver2"],
                "hotpath_preset": "clique_swap_default_solver2"
            }))
            .expect("serialize case"),
        )
        .expect("write case");

        let suite_path = suite_dir.join("hotpath-clique-swap-preview-solver2-supported.yaml");
        fs::write(
            &suite_path,
            [
                "schema_version: 1",
                "suite_id: hotpath-clique-swap-preview-solver2-supported",
                "benchmark_mode: clique_swap_preview",
                "class: representative",
                "default_iterations: 4",
                "default_warmup_iterations: 1",
                "cases:",
                "  - manifest: ../cases/hotpath/clique_swap_preview_solver2_supported.json",
            ]
            .join("\n"),
        )
        .expect("write suite");

        let options = RunnerOptions {
            artifacts_dir: temp.path().join("artifacts"),
            cargo_profile: "test".to_string(),
        };

        let report = run_suite_from_manifest(&suite_path, &options)
            .expect("solver2 clique swap hotpath suite should run successfully");
        assert_eq!(report.suite.solver_families, vec!["solver2".to_string()]);
        assert_eq!(report.totals.successful_cases, 1);
        assert_eq!(report.cases[0].solver.solver_family, "solver2");
        assert_eq!(report.cases[0].status, CaseRunStatus::Success);
        let metrics = report.cases[0]
            .hotpath_metrics
            .as_ref()
            .expect("hotpath metrics should exist");
        assert_eq!(metrics.benchmark_mode, "clique_swap_preview");
        assert_eq!(
            metrics.preset.as_deref(),
            Some("clique_swap_default_solver2")
        );
        assert!(metrics.preview_seconds > 0.0);
    }

    #[test]
    fn hotpath_suite_keeps_shared_artifact_flow_for_unimplemented_solver_family_probes() {
        let temp = TempDir::new().expect("temp dir");
        let suite_dir = temp.path().join("backend/benchmarking/suites");
        let case_dir = temp.path().join("backend/benchmarking/cases/hotpath");
        fs::create_dir_all(&suite_dir).expect("mk suite dir");
        fs::create_dir_all(&case_dir).expect("mk case dir");

        let case_path = case_dir.join("swap_preview_solver2.json");
        fs::write(
            &case_path,
            serde_json::to_string_pretty(&json!({
                "schema_version": 1,
                "id": "hotpath.swap-preview.solver2",
                "class": "representative",
                "solver_family": "solver2",
                "title": "Hotpath swap preview for solver2",
                "description": "Bootstrapped solver2 hotpath lane",
                "tags": ["hotpath", "swap", "preview", "solver2"],
                "hotpath_preset": "swap_default"
            }))
            .expect("serialize case"),
        )
        .expect("write case");

        let suite_path = suite_dir.join("hotpath-swap-preview-solver2.yaml");
        fs::write(
            &suite_path,
            [
                "schema_version: 1",
                "suite_id: hotpath-swap-preview-solver2",
                "benchmark_mode: swap_preview",
                "class: representative",
                "default_iterations: 4",
                "default_warmup_iterations: 1",
                "cases:",
                "  - manifest: ../cases/hotpath/swap_preview_solver2.json",
            ]
            .join("\n"),
        )
        .expect("write suite");

        let options = RunnerOptions {
            artifacts_dir: temp.path().join("artifacts"),
            cargo_profile: "test".to_string(),
        };

        let report = run_suite_from_manifest(&suite_path, &options)
            .expect("runner should still produce a shared run report");
        assert_eq!(report.suite.solver_families, vec!["solver2".to_string()]);
        assert_eq!(report.totals.total_cases, 1);
        assert_eq!(report.totals.failed_cases, 1);
        assert_eq!(
            report.cases[0].artifact_kind,
            BenchmarkArtifactKind::HotPath
        );
        assert_eq!(report.cases[0].solver.solver_family, "solver2");
        assert_eq!(report.cases[0].status, CaseRunStatus::SolverError);
        assert!(report.cases[0]
            .error_message
            .as_deref()
            .is_some_and(|message| {
                message.contains("solver2") && message.contains("not implemented")
            }));
    }
}
