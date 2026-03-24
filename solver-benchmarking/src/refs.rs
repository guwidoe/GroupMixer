use crate::index::upsert_ref;
use crate::recording_types::{
    BenchmarkRef, BenchmarkRefTarget, RecordingMetadata, RecordingSuiteRun,
    BENCHMARK_REF_SCHEMA_VERSION,
};
use anyhow::{Context, Result};
use std::fs;
use std::path::{Path, PathBuf};

pub fn ref_file_path(root: &Path, ref_name: &str) -> PathBuf {
    root.join("refs").join(format!("{}.json", ref_name))
}

pub fn standard_ref_names(
    recording: &RecordingMetadata,
    suite_run: &RecordingSuiteRun,
) -> Vec<String> {
    let machine = sanitize(&recording.machine.id);
    let branch = sanitize(&recording.git.branch);
    let suite = sanitize(&suite_run.suite_name);
    let mode = sanitize(&suite_run.benchmark_mode);

    let mut names = vec![
        "recordings/latest".to_string(),
        format!("machines/{machine}/latest"),
        format!("machines/{machine}/suites/{suite}/{mode}/latest"),
        format!("branches/{branch}/latest"),
        format!("branches/{branch}/suites/{suite}/{mode}/latest"),
    ];

    if branch == "main" {
        names.push("main/latest".to_string());
        names.push(format!("main/suites/{suite}/{mode}/latest"));
    }

    if let Some(feature_name) = recording.feature_name.as_deref() {
        let feature = sanitize(feature_name);
        names.push(format!("features/{feature}/latest"));
        names.push(format!("features/{feature}/suites/{suite}/{mode}/latest"));
    }

    names
}

pub fn build_ref(
    ref_name: String,
    updated_at: String,
    recording: &RecordingMetadata,
    suite_run: &RecordingSuiteRun,
) -> BenchmarkRef {
    BenchmarkRef {
        schema_version: BENCHMARK_REF_SCHEMA_VERSION.to_string(),
        ref_name,
        updated_at,
        target: BenchmarkRefTarget {
            recording_id: recording.recording_id.clone(),
            suite_name: suite_run.suite_name.clone(),
            benchmark_mode: suite_run.benchmark_mode.clone(),
            run_id: suite_run.run_id.clone(),
            run_report_path: suite_run.run_report_path.clone(),
        },
    }
}

pub fn load_ref(root: &Path, ref_name: &str) -> Result<BenchmarkRef> {
    let path = ref_file_path(root, ref_name);
    let contents = fs::read_to_string(&path)
        .with_context(|| format!("failed to read benchmark ref {}", path.display()))?;
    serde_json::from_str(&contents)
        .with_context(|| format!("failed to parse benchmark ref {}", path.display()))
}

pub fn update_standard_refs(root: &Path, recording: &RecordingMetadata) -> Result<()> {
    for suite_run in &recording.suite_runs {
        for ref_name in standard_ref_names(recording, suite_run) {
            let benchmark_ref = build_ref(
                ref_name.clone(),
                recording.recorded_at.clone(),
                recording,
                suite_run,
            );
            let path = ref_file_path(root, &ref_name);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).with_context(|| {
                    format!("failed to create benchmark ref dir {}", parent.display())
                })?;
            }
            let contents = serde_json::to_string_pretty(&benchmark_ref)
                .context("failed to serialize benchmark ref")?;
            fs::write(&path, contents)
                .with_context(|| format!("failed to write benchmark ref {}", path.display()))?;
            upsert_ref(root, &benchmark_ref, &relative_to_root(root, &path))?;
        }
    }
    Ok(())
}

fn sanitize(value: &str) -> String {
    value
        .chars()
        .map(|ch| match ch {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' => ch,
            _ => '_',
        })
        .collect()
}

fn relative_to_root(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .ok()
        .map(|relative| relative.to_string_lossy().to_string())
        .unwrap_or_else(|| path.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::recording_types::{
        RecordingGitIdentity, RecordingMachineIdentity, FULL_SOLVE_BENCHMARK_MODE,
        RECORDING_SCHEMA_VERSION,
    };

    fn sample_recording() -> RecordingMetadata {
        RecordingMetadata {
            schema_version: RECORDING_SCHEMA_VERSION.to_string(),
            recording_id: "recording-1".to_string(),
            recorded_at: "2026-03-24T23:00:00Z".to_string(),
            purpose: "manual-record".to_string(),
            feature_name: Some("move-policy-refactor".to_string()),
            source: "solver-cli benchmark record".to_string(),
            git: RecordingGitIdentity {
                branch: "main".to_string(),
                commit_sha: "abc123".to_string(),
                short_sha: "abc123".to_string(),
                dirty_tree: Some(false),
            },
            machine: RecordingMachineIdentity {
                id: "benchbox".to_string(),
                hostname: "benchbox.local".to_string(),
                kind: "local".to_string(),
            },
            suite_runs: vec![],
        }
    }

    fn sample_suite_run() -> RecordingSuiteRun {
        RecordingSuiteRun {
            suite_name: "representative".to_string(),
            suite_manifest_path: "benchmarking/suites/representative.yaml".to_string(),
            suite_schema_version: 1,
            suite_content_hash: "sha256:deadbeef".to_string(),
            benchmark_mode: FULL_SOLVE_BENCHMARK_MODE.to_string(),
            run_id: "representative-run-1".to_string(),
            run_report_path: "benchmarking/artifacts/runs/representative-run-1/run-report.json"
                .to_string(),
            summary_path: None,
            case_count: 2,
            successful_case_count: 2,
            failed_case_count: 0,
            runtime_seconds: 1.25,
        }
    }

    #[test]
    fn standard_ref_names_cover_machine_branch_main_and_feature_lanes() {
        let names = standard_ref_names(&sample_recording(), &sample_suite_run());
        assert!(names.contains(&"recordings/latest".to_string()));
        assert!(names.contains(&"machines/benchbox/latest".to_string()));
        assert!(names.contains(&"branches/main/latest".to_string()));
        assert!(names.contains(&"main/latest".to_string()));
        assert!(names.contains(&"features/move-policy-refactor/latest".to_string()));
    }
}
