use serde::{Deserialize, Serialize};

pub const RECORDING_SCHEMA_VERSION: &str = "groupmixer-benchmark-recording";
pub const BENCHMARK_REF_SCHEMA_VERSION: &str = "groupmixer-benchmark-ref";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RecordingMetadata {
    pub schema_version: String,
    pub recording_id: String,
    pub recorded_at: String,
    pub purpose: String,
    #[serde(default)]
    pub feature_name: Option<String>,
    pub source: String,
    pub git: RecordingGitIdentity,
    pub machine: RecordingMachineIdentity,
    pub suite_runs: Vec<RecordingSuiteRun>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RecordingGitIdentity {
    pub branch: String,
    pub commit_sha: String,
    pub short_sha: String,
    #[serde(default)]
    pub dirty_tree: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RecordingMachineIdentity {
    pub id: String,
    pub hostname: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RecordingSuiteRun {
    pub suite_name: String,
    pub suite_manifest_path: String,
    pub suite_schema_version: u32,
    pub suite_content_hash: String,
    pub benchmark_mode: String,
    pub run_id: String,
    pub run_report_path: String,
    #[serde(default)]
    pub summary_path: Option<String>,
    pub case_count: usize,
    pub successful_case_count: usize,
    pub failed_case_count: usize,
    pub runtime_seconds: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BenchmarkRef {
    pub schema_version: String,
    pub ref_name: String,
    pub updated_at: String,
    pub target: BenchmarkRefTarget,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BenchmarkRefTarget {
    pub recording_id: String,
    pub suite_name: String,
    pub benchmark_mode: String,
    pub run_id: String,
    pub run_report_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecordingIndexRow {
    pub recording_id: String,
    pub recorded_at: String,
    pub purpose: String,
    pub feature_name: Option<String>,
    pub git_branch: String,
    pub git_short_sha: String,
    pub machine_id: String,
    pub suite_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RefIndexRow {
    pub ref_name: String,
    pub target_recording_id: String,
    pub target_suite_name: String,
    pub target_benchmark_mode: String,
    pub updated_at: String,
}
