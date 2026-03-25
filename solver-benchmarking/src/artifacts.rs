use crate::manifest::BenchmarkSuiteClass;
use serde::{Deserialize, Serialize};
use solver_core::models::{MoveFamilyBenchmarkTelemetrySummary, MovePolicy, StopReason};

pub const CASE_RUN_SCHEMA_VERSION: u32 = 1;
pub const RUN_REPORT_SCHEMA_VERSION: u32 = 1;
pub const BASELINE_SNAPSHOT_SCHEMA_VERSION: u32 = 1;
pub const COMPARISON_REPORT_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BenchmarkArtifactKind {
    FullSolve,
    HotPath,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct HotPathMetrics {
    pub benchmark_mode: String,
    #[serde(default)]
    pub preset: Option<String>,
    pub iterations: u64,
    #[serde(default)]
    pub warmup_iterations: u64,
    pub measured_operations: u64,
    #[serde(default)]
    pub average_runtime_seconds: f64,
    #[serde(default)]
    pub ops_per_second: f64,
    #[serde(default)]
    pub checksum: i64,
    #[serde(default)]
    pub measurement_seconds: f64,
    #[serde(default)]
    pub setup_seconds: f64,
    #[serde(default)]
    pub preview_seconds: f64,
    #[serde(default)]
    pub apply_seconds: f64,
    #[serde(default)]
    pub full_recalculation_seconds: f64,
    #[serde(default)]
    pub search_seconds: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct GitIdentity {
    #[serde(default)]
    pub commit_sha: Option<String>,
    #[serde(default)]
    pub short_sha: Option<String>,
    #[serde(default)]
    pub branch: Option<String>,
    #[serde(default)]
    pub dirty_tree: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct MachineIdentity {
    #[serde(default)]
    pub benchmark_machine_id: Option<String>,
    #[serde(default)]
    pub hostname: Option<String>,
    #[serde(default)]
    pub cpu_model: Option<String>,
    #[serde(default)]
    pub logical_cores: Option<u32>,
    #[serde(default)]
    pub os: Option<String>,
    #[serde(default)]
    pub kernel: Option<String>,
    #[serde(default)]
    pub rustc_version: Option<String>,
    #[serde(default)]
    pub cargo_profile: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct EffectiveBenchmarkBudget {
    #[serde(default)]
    pub max_iterations: Option<u64>,
    #[serde(default)]
    pub time_limit_seconds: Option<u64>,
    #[serde(default)]
    pub no_improvement_iterations: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct SolveTimingBreakdown {
    #[serde(default)]
    pub initialization_seconds: f64,
    #[serde(default)]
    pub search_seconds: f64,
    #[serde(default)]
    pub finalization_seconds: f64,
    #[serde(default)]
    pub total_seconds: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CaseRunStatus {
    Success,
    SolverError,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CaseRunArtifact {
    pub schema_version: u32,
    pub run_id: String,
    pub generated_at: String,
    pub suite_id: String,
    pub benchmark_mode: String,
    pub suite_class: BenchmarkSuiteClass,
    pub case_id: String,
    pub case_class: BenchmarkSuiteClass,
    pub case_manifest_path: String,
    #[serde(default)]
    pub case_title: Option<String>,
    #[serde(default)]
    pub case_description: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    pub git: GitIdentity,
    pub machine: MachineIdentity,
    #[serde(default)]
    pub effective_seed: Option<u64>,
    #[serde(default)]
    pub effective_budget: EffectiveBenchmarkBudget,
    pub artifact_kind: BenchmarkArtifactKind,
    #[serde(default)]
    pub effective_move_policy: Option<MovePolicy>,
    #[serde(default)]
    pub stop_reason: Option<StopReason>,
    pub status: CaseRunStatus,
    #[serde(default)]
    pub error_message: Option<String>,
    #[serde(default)]
    pub timing: SolveTimingBreakdown,
    #[serde(default)]
    pub runtime_seconds: f64,
    #[serde(default)]
    pub initial_score: Option<f64>,
    #[serde(default)]
    pub final_score: Option<f64>,
    #[serde(default)]
    pub best_score: Option<f64>,
    #[serde(default)]
    pub iteration_count: Option<u64>,
    #[serde(default)]
    pub no_improvement_count: Option<u64>,
    #[serde(default)]
    pub unique_contacts: Option<i32>,
    #[serde(default)]
    pub weighted_repetition_penalty: Option<f64>,
    #[serde(default)]
    pub weighted_constraint_penalty: Option<f64>,
    #[serde(default)]
    pub moves: MoveFamilyBenchmarkTelemetrySummary,
    #[serde(default)]
    pub hotpath_metrics: Option<HotPathMetrics>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RunSuiteMetadata {
    pub suite_id: String,
    pub benchmark_mode: String,
    pub class: BenchmarkSuiteClass,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    pub manifest_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RunMetadata {
    pub run_id: String,
    pub generated_at: String,
    pub git: GitIdentity,
    pub machine: MachineIdentity,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct RunTotals {
    #[serde(default)]
    pub total_cases: usize,
    #[serde(default)]
    pub successful_cases: usize,
    #[serde(default)]
    pub failed_cases: usize,
    #[serde(default)]
    pub total_runtime_seconds: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ClassRollup {
    pub class: BenchmarkSuiteClass,
    #[serde(default)]
    pub total_cases: usize,
    #[serde(default)]
    pub successful_cases: usize,
    #[serde(default)]
    pub failed_cases: usize,
    #[serde(default)]
    pub total_runtime_seconds: f64,
    #[serde(default)]
    pub average_runtime_seconds: f64,
    #[serde(default)]
    pub average_final_score: Option<f64>,
    #[serde(default)]
    pub average_best_score: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RunReport {
    pub schema_version: u32,
    pub suite: RunSuiteMetadata,
    pub run: RunMetadata,
    pub totals: RunTotals,
    pub class_rollups: Vec<ClassRollup>,
    pub cases: Vec<CaseRunArtifact>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BaselineSnapshot {
    pub schema_version: u32,
    pub baseline_name: String,
    pub created_at: String,
    #[serde(default)]
    pub source_run_path: Option<String>,
    pub run_report: RunReport,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ComparisonStatus {
    Comparable,
    NotComparable,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ComparabilityReport {
    pub status: ComparisonStatus,
    #[serde(default)]
    pub reasons: Vec<String>,
    pub same_benchmark_mode: bool,
    pub same_machine: bool,
    pub same_suite: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NumericDelta {
    pub baseline: f64,
    pub current: f64,
    pub absolute: f64,
    #[serde(default)]
    pub percent: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct IntegerDelta {
    pub baseline: u64,
    pub current: u64,
    pub absolute: i64,
    #[serde(default)]
    pub percent: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MoveFamilyComparison {
    pub family: String,
    pub attempts: IntegerDelta,
    pub accepted: IntegerDelta,
    pub rejected: IntegerDelta,
    pub preview_seconds: NumericDelta,
    pub apply_seconds: NumericDelta,
    pub full_recalculation_count: IntegerDelta,
    pub full_recalculation_seconds: NumericDelta,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CaseComparison {
    pub case_id: String,
    pub class: BenchmarkSuiteClass,
    pub runtime_seconds: NumericDelta,
    #[serde(default)]
    pub final_score: Option<NumericDelta>,
    #[serde(default)]
    pub best_score: Option<NumericDelta>,
    #[serde(default)]
    pub iteration_count: Option<IntegerDelta>,
    #[serde(default)]
    pub stop_reason_baseline: Option<StopReason>,
    #[serde(default)]
    pub stop_reason_current: Option<StopReason>,
    pub move_family_deltas: Vec<MoveFamilyComparison>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ClassRollupComparison {
    pub class: BenchmarkSuiteClass,
    pub total_runtime_seconds: NumericDelta,
    #[serde(default)]
    pub average_runtime_seconds: Option<NumericDelta>,
    #[serde(default)]
    pub average_final_score: Option<NumericDelta>,
    #[serde(default)]
    pub average_best_score: Option<NumericDelta>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RegressionSuspectKind {
    CaseRuntime,
    CaseQuality,
    MoveFamily,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RegressionSuspect {
    pub kind: RegressionSuspectKind,
    pub id: String,
    pub summary: String,
    pub absolute_delta: f64,
    #[serde(default)]
    pub percent_delta: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct RegressionSuspectSummary {
    #[serde(default)]
    pub top_runtime_regressions: Vec<RegressionSuspect>,
    #[serde(default)]
    pub top_quality_regressions: Vec<RegressionSuspect>,
    #[serde(default)]
    pub top_move_family_regressions: Vec<RegressionSuspect>,
    #[serde(default)]
    pub top_improvements: Vec<RegressionSuspect>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ComparisonReport {
    pub schema_version: u32,
    pub compared_at: String,
    pub baseline_name: String,
    pub baseline_run_id: String,
    pub current_run_id: String,
    pub suite_id: String,
    pub benchmark_mode: String,
    pub comparability: ComparabilityReport,
    pub case_comparisons: Vec<CaseComparison>,
    pub class_rollups: Vec<ClassRollupComparison>,
    pub suspects: RegressionSuspectSummary,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn comparison_report_round_trips_as_json() {
        let report = ComparisonReport {
            schema_version: COMPARISON_REPORT_SCHEMA_VERSION,
            compared_at: "2026-03-24T20:00:00Z".to_string(),
            baseline_name: "before-refactor".to_string(),
            baseline_run_id: "baseline-run".to_string(),
            current_run_id: "current-run".to_string(),
            suite_id: "path".to_string(),
            benchmark_mode: "full_solve".to_string(),
            comparability: ComparabilityReport {
                status: ComparisonStatus::Comparable,
                reasons: vec![],
                same_benchmark_mode: true,
                same_machine: true,
                same_suite: true,
            },
            case_comparisons: vec![],
            class_rollups: vec![],
            suspects: RegressionSuspectSummary::default(),
        };

        let json = serde_json::to_string_pretty(&report).expect("serialize");
        let decoded: ComparisonReport = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(decoded, report);
    }
}
