use crate::artifacts::RunReport;
use crate::benchmark_mode::FULL_SOLVE_BENCHMARK_MODE;
use crate::index::{list_recordings as list_recording_rows, upsert_recording};
use crate::manifest::SUITE_SCHEMA_VERSION;
use crate::recording_types::{
    RecordingGitIdentity, RecordingMachineIdentity, RecordingMetadata, RecordingSuiteRun,
    RECORDING_SCHEMA_VERSION,
};
use crate::refs::update_standard_refs;
use anyhow::{bail, Context, Result};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct RecordingRunInput {
    pub report: RunReport,
    pub run_report_path: PathBuf,
    pub benchmark_mode: String,
    pub summary_path: Option<PathBuf>,
}

impl RecordingRunInput {
    pub fn from_report(report: RunReport, run_report_path: PathBuf) -> Self {
        Self {
            benchmark_mode: report.suite.benchmark_mode.clone(),
            report,
            run_report_path,
            summary_path: None,
        }
    }

    pub fn full_solve(report: RunReport, run_report_path: PathBuf) -> Self {
        let mut input = Self::from_report(report, run_report_path);
        input.benchmark_mode = FULL_SOLVE_BENCHMARK_MODE.to_string();
        input
    }
}

#[derive(Debug, Clone)]
pub struct RecordingOptions {
    pub recording_id: Option<String>,
    pub purpose: String,
    pub source: String,
    pub feature_name: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct RecordingQuery {
    pub machine_id: Option<String>,
    pub branch: Option<String>,
    pub feature_name: Option<String>,
    pub purpose: Option<String>,
    pub suite_name: Option<String>,
    pub benchmark_mode: Option<String>,
}

#[derive(Debug, Clone)]
pub struct RecordingSuiteRunMatch {
    pub recording: RecordingMetadata,
    pub suite_run: RecordingSuiteRun,
}

pub fn recording_dir(root: &Path, recording_id: &str) -> PathBuf {
    root.join("recordings").join(recording_id)
}

pub fn recording_meta_path(root: &Path, recording_id: &str) -> PathBuf {
    recording_dir(root, recording_id).join("meta.json")
}

pub fn create_recording_for_run(
    root: &Path,
    report: RunReport,
    run_report_path: PathBuf,
    options: &RecordingOptions,
) -> Result<RecordingMetadata> {
    create_recording_for_runs(
        root,
        vec![RecordingRunInput::from_report(report, run_report_path)],
        options,
    )
}

pub fn create_recording_for_runs(
    root: &Path,
    runs: Vec<RecordingRunInput>,
    options: &RecordingOptions,
) -> Result<RecordingMetadata> {
    if runs.is_empty() {
        bail!("recording requires at least one benchmark run");
    }

    let first = &runs[0].report;
    let mut seen_lanes = HashSet::new();
    let mut suite_runs = Vec::with_capacity(runs.len());

    for run in &runs {
        ensure_same_git_identity(first, &run.report)?;
        ensure_same_machine_identity(first, &run.report)?;

        let lane_key = format!("{}::{}", run.report.suite.suite_id, run.benchmark_mode);
        if !seen_lanes.insert(lane_key.clone()) {
            bail!("duplicate suite lane in recording bundle: {lane_key}");
        }

        suite_runs.push(recording_suite_run(root, run)?);
    }

    let recording_id = options
        .recording_id
        .as_deref()
        .map(sanitize)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| default_recording_id(&runs[0].report));

    let recording = RecordingMetadata {
        schema_version: RECORDING_SCHEMA_VERSION.to_string(),
        recording_id,
        recorded_at: first.run.generated_at.clone(),
        purpose: options.purpose.clone(),
        feature_name: options.feature_name.clone(),
        source: options.source.clone(),
        git: RecordingGitIdentity {
            branch: first
                .run
                .git
                .branch
                .clone()
                .unwrap_or_else(|| "unknown".to_string()),
            commit_sha: first
                .run
                .git
                .commit_sha
                .clone()
                .unwrap_or_else(|| "unknown".to_string()),
            short_sha: first
                .run
                .git
                .short_sha
                .clone()
                .unwrap_or_else(|| "unknown".to_string()),
            dirty_tree: first.run.git.dirty_tree,
        },
        machine: RecordingMachineIdentity {
            id: crate::storage::machine_identity_label(&first.run.machine)
                .unwrap_or_else(|| "unknown-machine".to_string()),
            hostname: first
                .run
                .machine
                .hostname
                .clone()
                .unwrap_or_else(|| "unknown-host".to_string()),
            kind: "local".to_string(),
        },
        suite_runs,
    };

    persist_recording(root, &recording)?;
    Ok(recording)
}

pub fn persist_recording(root: &Path, recording: &RecordingMetadata) -> Result<PathBuf> {
    let meta_path = recording_meta_path(root, &recording.recording_id);
    if let Some(parent) = meta_path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create recording dir {}", parent.display()))?;
    }
    write_json(&meta_path, recording)?;
    upsert_recording(root, recording, &relative_to_root(root, &meta_path))?;
    update_standard_refs(root, recording)?;
    Ok(meta_path)
}

pub fn load_recording(root: &Path, recording_id: &str) -> Result<RecordingMetadata> {
    let path = recording_meta_path(root, recording_id);
    let contents = fs::read_to_string(&path)
        .with_context(|| format!("failed to read recording metadata {}", path.display()))?;
    serde_json::from_str(&contents)
        .with_context(|| format!("failed to parse recording metadata {}", path.display()))
}

pub fn list_recording_metadatas(root: &Path) -> Result<Vec<RecordingMetadata>> {
    let rows = list_recording_rows(root)?;
    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        out.push(load_recording(root, &row.recording_id)?);
    }
    Ok(out)
}

pub fn find_recording_suite_runs(
    root: &Path,
    query: &RecordingQuery,
) -> Result<Vec<RecordingSuiteRunMatch>> {
    let mut matches = Vec::new();

    for recording in list_recording_metadatas(root)? {
        if let Some(machine_id) = &query.machine_id {
            if &recording.machine.id != machine_id {
                continue;
            }
        }
        if let Some(branch) = &query.branch {
            if &recording.git.branch != branch {
                continue;
            }
        }
        if let Some(feature_name) = &query.feature_name {
            if recording.feature_name.as_ref() != Some(feature_name) {
                continue;
            }
        }
        if let Some(purpose) = &query.purpose {
            if &recording.purpose != purpose {
                continue;
            }
        }

        for suite_run in &recording.suite_runs {
            if let Some(suite_name) = &query.suite_name {
                if &suite_run.suite_name != suite_name {
                    continue;
                }
            }
            if let Some(benchmark_mode) = &query.benchmark_mode {
                if &suite_run.benchmark_mode != benchmark_mode {
                    continue;
                }
            }

            matches.push(RecordingSuiteRunMatch {
                recording: recording.clone(),
                suite_run: suite_run.clone(),
            });
        }
    }

    matches.sort_by(|left, right| {
        right
            .recording
            .recorded_at
            .cmp(&left.recording.recorded_at)
            .then_with(|| {
                right
                    .recording
                    .recording_id
                    .cmp(&left.recording.recording_id)
            })
            .then_with(|| right.suite_run.suite_name.cmp(&left.suite_run.suite_name))
    });

    Ok(matches)
}

pub fn resolve_artifact_path(root: &Path, stored_path: &str) -> PathBuf {
    let path = PathBuf::from(stored_path);
    if path.is_absolute() {
        path
    } else {
        root.join(path)
    }
}

fn recording_suite_run(root: &Path, run: &RecordingRunInput) -> Result<RecordingSuiteRun> {
    let suite_manifest_path = PathBuf::from(&run.report.suite.manifest_path);
    let suite_hash = sha256_file(&suite_manifest_path)?;
    Ok(RecordingSuiteRun {
        suite_name: run.report.suite.suite_id.clone(),
        suite_manifest_path: relative_or_display(root, &suite_manifest_path),
        suite_schema_version: SUITE_SCHEMA_VERSION,
        suite_content_hash: format!("sha256:{suite_hash}"),
        benchmark_mode: run.benchmark_mode.clone(),
        run_id: run.report.run.run_id.clone(),
        run_report_path: relative_to_root(root, &run.run_report_path),
        summary_path: run
            .summary_path
            .as_ref()
            .map(|path| relative_to_root(root, path)),
        case_count: run.report.totals.total_cases,
        successful_case_count: run.report.totals.successful_cases,
        failed_case_count: run.report.totals.failed_cases,
        runtime_seconds: run.report.totals.total_runtime_seconds,
    })
}

fn ensure_same_git_identity(first: &RunReport, current: &RunReport) -> Result<()> {
    if first.run.git.branch != current.run.git.branch
        || first.run.git.commit_sha != current.run.git.commit_sha
        || first.run.git.short_sha != current.run.git.short_sha
        || first.run.git.dirty_tree != current.run.git.dirty_tree
    {
        bail!("all recording bundle runs must share git identity");
    }
    Ok(())
}

fn ensure_same_machine_identity(first: &RunReport, current: &RunReport) -> Result<()> {
    if crate::storage::machine_identity_label(&first.run.machine)
        != crate::storage::machine_identity_label(&current.run.machine)
        || first.run.machine.hostname != current.run.machine.hostname
    {
        bail!("all recording bundle runs must share machine identity");
    }
    Ok(())
}

fn default_recording_id(report: &RunReport) -> String {
    sanitize(&format!("{}-{}", report.run.run_id, report.suite.suite_id))
}

fn write_json<T: serde::Serialize>(path: &Path, value: &T) -> Result<()> {
    let contents =
        serde_json::to_string_pretty(value).context("failed to serialize recording json")?;
    fs::write(path, contents).with_context(|| format!("failed to write {}", path.display()))
}

fn sha256_file(path: &Path) -> Result<String> {
    let contents = fs::read(path).with_context(|| {
        format!(
            "failed to read suite manifest for hashing {}",
            path.display()
        )
    })?;
    let digest = Sha256::digest(contents);
    Ok(digest.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn relative_or_display(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .ok()
        .map(|relative| relative.to_string_lossy().to_string())
        .unwrap_or_else(|| path.display().to_string())
}

fn relative_to_root(root: &Path, path: &Path) -> String {
    relative_or_display(root, path)
}

fn sanitize(value: &str) -> String {
    value
        .chars()
        .map(|ch| match ch {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' | '.' => ch,
            _ => '_',
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::artifacts::{
        BenchmarkComparisonCategory, GitIdentity, MachineIdentity, RunMetadata, RunSuiteMetadata,
        RunTotals, RUN_REPORT_SCHEMA_VERSION,
    };
    use crate::manifest::BenchmarkSuiteClass;
    use tempfile::TempDir;

    fn sample_report(suite_id: &str, manifest_path: &Path, run_id: &str) -> RunReport {
        RunReport {
            schema_version: RUN_REPORT_SCHEMA_VERSION,
            suite: RunSuiteMetadata {
                suite_id: suite_id.to_string(),
                benchmark_mode: FULL_SOLVE_BENCHMARK_MODE.to_string(),
                comparison_category: BenchmarkComparisonCategory::ScoreQuality,
                solver_families: vec!["solver1".to_string()],
                class: BenchmarkSuiteClass::Representative,
                title: None,
                description: None,
                manifest_path: manifest_path.display().to_string(),
            },
            run: RunMetadata {
                run_id: run_id.to_string(),
                generated_at: "2026-03-24T23:10:00Z".to_string(),
                git: GitIdentity {
                    commit_sha: Some("abc123".to_string()),
                    short_sha: Some("abc123".to_string()),
                    branch: Some("main".to_string()),
                    dirty_tree: Some(false),
                },
                machine: MachineIdentity {
                    benchmark_machine_id: Some("benchbox".to_string()),
                    hostname: Some("benchbox.local".to_string()),
                    ..Default::default()
                },
                case_parallelism: None,
            },
            totals: RunTotals {
                total_cases: 2,
                successful_cases: 2,
                failed_cases: 0,
                total_runtime_seconds: 1.5,
            },
            class_rollups: vec![],
            cases: vec![],
        }
    }

    #[test]
    fn creates_single_run_recording_and_updates_refs() {
        let temp = TempDir::new().expect("temp dir");
        let suite_manifest = temp
            .path()
            .join("backend/benchmarking/suites/representative.yaml");
        fs::create_dir_all(suite_manifest.parent().unwrap()).expect("mk suite dir");
        fs::write(
            &suite_manifest,
            "schema_version: 1\nsuite_id: representative\nclass: representative\ncases: []\n",
        )
        .expect("write suite manifest");
        let run_report_path = temp
            .path()
            .join("runs/representative-run-1/run-report.json");
        fs::create_dir_all(run_report_path.parent().unwrap()).expect("mk run dir");
        fs::write(&run_report_path, "{}\n").expect("write run report placeholder");

        let recording = create_recording_for_run(
            temp.path(),
            sample_report("representative", &suite_manifest, "representative-run-1"),
            run_report_path,
            &RecordingOptions {
                recording_id: Some("recording-1".to_string()),
                purpose: "manual-record".to_string(),
                source: "gm-cli benchmark record".to_string(),
                feature_name: None,
            },
        )
        .expect("create recording");

        assert_eq!(recording.recording_id, "recording-1");
        assert_eq!(recording.suite_runs.len(), 1);
        assert!(recording_meta_path(temp.path(), "recording-1").exists());
        assert!(crate::refs::ref_file_path(temp.path(), "recordings/latest").exists());
    }

    #[test]
    fn creates_bundle_recording_for_multiple_suite_lanes() {
        let temp = TempDir::new().expect("temp dir");
        let suite_a = temp
            .path()
            .join("backend/benchmarking/suites/representative.yaml");
        let suite_b = temp.path().join("backend/benchmarking/suites/stretch.yaml");
        fs::create_dir_all(suite_a.parent().unwrap()).expect("mk suite dir");
        fs::write(
            &suite_a,
            "schema_version: 1\nsuite_id: representative\nclass: representative\ncases: []\n",
        )
        .expect("write suite a");
        fs::write(
            &suite_b,
            "schema_version: 1\nsuite_id: stretch\nclass: stretch\ncases: []\n",
        )
        .expect("write suite b");

        let run_a_path = temp.path().join("runs/run-a/run-report.json");
        let run_b_path = temp.path().join("runs/run-b/run-report.json");
        fs::create_dir_all(run_a_path.parent().unwrap()).expect("mk run a dir");
        fs::create_dir_all(run_b_path.parent().unwrap()).expect("mk run b dir");
        fs::write(&run_a_path, "{}\n").expect("write run a");
        fs::write(&run_b_path, "{}\n").expect("write run b");

        let recording = create_recording_for_runs(
            temp.path(),
            vec![
                RecordingRunInput::full_solve(
                    sample_report("representative", &suite_a, "run-a"),
                    run_a_path,
                ),
                RecordingRunInput::full_solve(
                    sample_report("stretch", &suite_b, "run-b"),
                    run_b_path,
                ),
            ],
            &RecordingOptions {
                recording_id: Some("bundle-1".to_string()),
                purpose: "manual-bundle".to_string(),
                source: "gm-cli benchmark record-bundle".to_string(),
                feature_name: None,
            },
        )
        .expect("create bundle recording");

        assert_eq!(recording.suite_runs.len(), 2);
        let rows = crate::index::list_recordings(temp.path()).expect("list recordings");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].suite_count, 2);
    }

    #[test]
    fn create_recording_for_run_preserves_hotpath_benchmark_mode() {
        let temp = TempDir::new().expect("temp dir");
        let suite = temp
            .path()
            .join("backend/benchmarking/suites/hotpath-swap-preview.yaml");
        fs::create_dir_all(suite.parent().unwrap()).expect("mk suite dir");
        fs::write(
            &suite,
            "schema_version: 1\nsuite_id: hotpath-swap-preview\nbenchmark_mode: swap_preview\nclass: representative\ncases: []\n",
        )
        .expect("write suite");

        let run_path = temp.path().join("runs/hotpath-run/run-report.json");
        fs::create_dir_all(run_path.parent().unwrap()).expect("mk run dir");
        fs::write(&run_path, "{}\n").expect("write run");

        let mut report = sample_report("hotpath-swap-preview", &suite, "hotpath-run");
        report.suite.benchmark_mode = "swap_preview".to_string();

        let recording = create_recording_for_run(
            temp.path(),
            report,
            run_path,
            &RecordingOptions {
                recording_id: Some("hotpath-recording-1".to_string()),
                purpose: "manual-record".to_string(),
                source: "gm-cli benchmark record".to_string(),
                feature_name: None,
            },
        )
        .expect("create hotpath recording");

        assert_eq!(recording.suite_runs.len(), 1);
        assert_eq!(recording.suite_runs[0].suite_name, "hotpath-swap-preview");
        assert_eq!(recording.suite_runs[0].benchmark_mode, "swap_preview");
    }
}
