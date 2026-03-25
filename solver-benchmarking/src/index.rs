use crate::recording_types::{BenchmarkRef, RecordingIndexRow, RecordingMetadata, RefIndexRow};
use anyhow::{Context, Result};
use rusqlite::{params, Connection};
use std::fs;
use std::path::{Path, PathBuf};

pub fn db_path(root: &Path) -> PathBuf {
    root.join("index").join("benchmark.sqlite")
}

fn open_db(root: &Path) -> Result<Connection> {
    let path = db_path(root);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create benchmark index dir {}", parent.display()))?;
    }
    let conn = Connection::open(&path)
        .with_context(|| format!("failed to open benchmark index {}", path.display()))?;
    conn.execute_batch(
        r#"
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS recordings (
            recording_id TEXT PRIMARY KEY,
            recorded_at TEXT NOT NULL,
            purpose TEXT NOT NULL,
            feature_name TEXT,
            source TEXT NOT NULL,
            git_branch TEXT NOT NULL,
            git_commit_sha TEXT NOT NULL,
            git_short_sha TEXT NOT NULL,
            git_dirty_tree INTEGER,
            machine_id TEXT NOT NULL,
            machine_hostname TEXT NOT NULL,
            machine_kind TEXT NOT NULL,
            recording_path TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS suite_runs (
            recording_id TEXT NOT NULL,
            suite_name TEXT NOT NULL,
            suite_manifest_path TEXT NOT NULL,
            suite_schema_version INTEGER NOT NULL,
            suite_content_hash TEXT NOT NULL,
            benchmark_mode TEXT NOT NULL,
            run_id TEXT NOT NULL,
            run_report_path TEXT NOT NULL,
            summary_path TEXT,
            case_count INTEGER NOT NULL,
            successful_case_count INTEGER NOT NULL,
            failed_case_count INTEGER NOT NULL,
            runtime_seconds REAL NOT NULL,
            PRIMARY KEY (recording_id, suite_name, benchmark_mode),
            FOREIGN KEY (recording_id) REFERENCES recordings(recording_id)
        );

        CREATE INDEX IF NOT EXISTS idx_suite_runs_lane
            ON suite_runs(suite_name, benchmark_mode, suite_content_hash, recording_id);

        CREATE TABLE IF NOT EXISTS refs (
            ref_name TEXT PRIMARY KEY,
            target_recording_id TEXT NOT NULL,
            target_suite_name TEXT NOT NULL,
            target_benchmark_mode TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            ref_path TEXT NOT NULL
        );
        "#,
    )
    .context("failed to initialize benchmark index schema")?;
    Ok(conn)
}

pub fn upsert_recording(root: &Path, recording: &RecordingMetadata, recording_path: &str) -> Result<()> {
    let conn = open_db(root)?;
    conn.execute(
        r#"
        INSERT INTO recordings (
            recording_id,
            recorded_at,
            purpose,
            feature_name,
            source,
            git_branch,
            git_commit_sha,
            git_short_sha,
            git_dirty_tree,
            machine_id,
            machine_hostname,
            machine_kind,
            recording_path
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
        ON CONFLICT(recording_id) DO UPDATE SET
            recorded_at=excluded.recorded_at,
            purpose=excluded.purpose,
            feature_name=excluded.feature_name,
            source=excluded.source,
            git_branch=excluded.git_branch,
            git_commit_sha=excluded.git_commit_sha,
            git_short_sha=excluded.git_short_sha,
            git_dirty_tree=excluded.git_dirty_tree,
            machine_id=excluded.machine_id,
            machine_hostname=excluded.machine_hostname,
            machine_kind=excluded.machine_kind,
            recording_path=excluded.recording_path
        "#,
        params![
            &recording.recording_id,
            &recording.recorded_at,
            &recording.purpose,
            &recording.feature_name,
            &recording.source,
            &recording.git.branch,
            &recording.git.commit_sha,
            &recording.git.short_sha,
            recording.git.dirty_tree.map(bool_to_i64),
            &recording.machine.id,
            &recording.machine.hostname,
            &recording.machine.kind,
            recording_path,
        ],
    )
    .context("failed to upsert recording metadata")?;

    for suite_run in &recording.suite_runs {
        conn.execute(
            r#"
            INSERT INTO suite_runs (
                recording_id,
                suite_name,
                suite_manifest_path,
                suite_schema_version,
                suite_content_hash,
                benchmark_mode,
                run_id,
                run_report_path,
                summary_path,
                case_count,
                successful_case_count,
                failed_case_count,
                runtime_seconds
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
            ON CONFLICT(recording_id, suite_name, benchmark_mode) DO UPDATE SET
                suite_manifest_path=excluded.suite_manifest_path,
                suite_schema_version=excluded.suite_schema_version,
                suite_content_hash=excluded.suite_content_hash,
                run_id=excluded.run_id,
                run_report_path=excluded.run_report_path,
                summary_path=excluded.summary_path,
                case_count=excluded.case_count,
                successful_case_count=excluded.successful_case_count,
                failed_case_count=excluded.failed_case_count,
                runtime_seconds=excluded.runtime_seconds
            "#,
            params![
                &recording.recording_id,
                &suite_run.suite_name,
                &suite_run.suite_manifest_path,
                suite_run.suite_schema_version as i64,
                &suite_run.suite_content_hash,
                &suite_run.benchmark_mode,
                &suite_run.run_id,
                &suite_run.run_report_path,
                &suite_run.summary_path,
                suite_run.case_count as i64,
                suite_run.successful_case_count as i64,
                suite_run.failed_case_count as i64,
                suite_run.runtime_seconds,
            ],
        )
        .with_context(|| {
            format!(
                "failed to upsert suite run {} ({}) into benchmark index",
                suite_run.suite_name, suite_run.benchmark_mode
            )
        })?;
    }

    Ok(())
}

pub fn upsert_ref(root: &Path, benchmark_ref: &BenchmarkRef, ref_path: &str) -> Result<()> {
    let conn = open_db(root)?;
    conn.execute(
        r#"
        INSERT INTO refs (
            ref_name,
            target_recording_id,
            target_suite_name,
            target_benchmark_mode,
            updated_at,
            ref_path
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        ON CONFLICT(ref_name) DO UPDATE SET
            target_recording_id=excluded.target_recording_id,
            target_suite_name=excluded.target_suite_name,
            target_benchmark_mode=excluded.target_benchmark_mode,
            updated_at=excluded.updated_at,
            ref_path=excluded.ref_path
        "#,
        params![
            &benchmark_ref.ref_name,
            &benchmark_ref.target.recording_id,
            &benchmark_ref.target.suite_name,
            &benchmark_ref.target.benchmark_mode,
            &benchmark_ref.updated_at,
            ref_path,
        ],
    )
    .context("failed to upsert benchmark ref")?;
    Ok(())
}

pub fn list_recordings(root: &Path) -> Result<Vec<RecordingIndexRow>> {
    let conn = open_db(root)?;
    let mut stmt = conn.prepare(
        r#"
        SELECT
            r.recording_id,
            r.recorded_at,
            r.purpose,
            r.feature_name,
            r.git_branch,
            r.git_short_sha,
            r.machine_id,
            COUNT(sr.recording_id) AS suite_count
        FROM recordings r
        LEFT JOIN suite_runs sr ON sr.recording_id = r.recording_id
        GROUP BY
            r.recording_id,
            r.recorded_at,
            r.purpose,
            r.feature_name,
            r.git_branch,
            r.git_short_sha,
            r.machine_id
        ORDER BY r.recorded_at DESC, r.recording_id DESC
        "#,
    )
    .context("failed to prepare recordings list query")?;
    let rows = stmt
        .query_map([], |row| {
            Ok(RecordingIndexRow {
                recording_id: row.get(0)?,
                recorded_at: row.get(1)?,
                purpose: row.get(2)?,
                feature_name: row.get(3)?,
                git_branch: row.get(4)?,
                git_short_sha: row.get(5)?,
                machine_id: row.get(6)?,
                suite_count: row.get::<_, i64>(7)? as usize,
            })
        })
        .context("failed to query benchmark recordings")?;
    rows.collect::<Result<Vec<_>, _>>()
        .context("failed to collect benchmark recordings")
}

pub fn list_refs(root: &Path) -> Result<Vec<RefIndexRow>> {
    let conn = open_db(root)?;
    let mut stmt = conn.prepare(
        r#"
        SELECT ref_name, target_recording_id, target_suite_name, target_benchmark_mode, updated_at
        FROM refs
        ORDER BY ref_name ASC
        "#,
    )
    .context("failed to prepare refs list query")?;
    let rows = stmt
        .query_map([], |row| {
            Ok(RefIndexRow {
                ref_name: row.get(0)?,
                target_recording_id: row.get(1)?,
                target_suite_name: row.get(2)?,
                target_benchmark_mode: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })
        .context("failed to query benchmark refs")?;
    rows.collect::<Result<Vec<_>, _>>()
        .context("failed to collect benchmark refs")
}

fn bool_to_i64(value: bool) -> i64 {
    if value { 1 } else { 0 }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::benchmark_mode::FULL_SOLVE_BENCHMARK_MODE;
    use crate::recording_types::{
        BenchmarkRefTarget, RecordingGitIdentity, RecordingMachineIdentity, RecordingSuiteRun,
        BENCHMARK_REF_SCHEMA_VERSION, RECORDING_SCHEMA_VERSION,
    };
    use tempfile::TempDir;

    fn sample_recording() -> RecordingMetadata {
        RecordingMetadata {
            schema_version: RECORDING_SCHEMA_VERSION.to_string(),
            recording_id: "recording-1".to_string(),
            recorded_at: "2026-03-24T23:00:00Z".to_string(),
            purpose: "manual-record".to_string(),
            feature_name: None,
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
            suite_runs: vec![RecordingSuiteRun {
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
            }],
        }
    }

    #[test]
    fn upsert_recording_populates_index() {
        let temp = TempDir::new().expect("temp dir");
        let recording = sample_recording();

        upsert_recording(temp.path(), &recording, "recordings/recording-1/meta.json")
            .expect("upsert recording");

        let rows = list_recordings(temp.path()).expect("list recordings");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].recording_id, "recording-1");
        assert_eq!(rows[0].suite_count, 1);
    }

    #[test]
    fn upsert_ref_populates_index() {
        let temp = TempDir::new().expect("temp dir");
        let benchmark_ref = BenchmarkRef {
            schema_version: BENCHMARK_REF_SCHEMA_VERSION.to_string(),
            ref_name: "recordings/latest".to_string(),
            updated_at: "2026-03-24T23:00:00Z".to_string(),
            target: BenchmarkRefTarget {
                recording_id: "recording-1".to_string(),
                suite_name: "representative".to_string(),
                benchmark_mode: FULL_SOLVE_BENCHMARK_MODE.to_string(),
                run_id: "representative-run-1".to_string(),
                run_report_path: "benchmarking/artifacts/runs/representative-run-1/run-report.json"
                    .to_string(),
            },
        };

        upsert_ref(temp.path(), &benchmark_ref, "refs/recordings/latest.json")
            .expect("upsert ref");

        let rows = list_refs(temp.path()).expect("list refs");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].ref_name, "recordings/latest");
    }
}
