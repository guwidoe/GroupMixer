pub mod artifacts;
pub mod benchmark_mode;
pub mod compare;
pub mod hotpath;
pub mod hotpath_inputs;
pub mod index;
pub mod machine;
pub mod manifest;
pub mod recording_types;
pub mod recordings;
pub mod refs;
pub mod runner;
pub mod storage;
pub mod summary;
pub mod trajectory;
pub mod validation;

pub use artifacts::{
    BaselineSnapshot, BenchmarkComparisonCategory, BenchmarkSeedPolicy, CaseComparison,
    CaseIdentityMetadata, CaseRunArtifact, CaseRunStatus, ClassRollup, ClassRollupComparison,
    ComparabilityReport, ComparisonReport, ComparisonStatus, ConstraintFamilyContribution,
    ConstraintFamilyContributionComparison, EffectiveBenchmarkBudget, GitIdentity, IntegerDelta,
    MachineIdentity, MoveFamilyComparison, NumericDelta, ObjectiveMetricsComparison,
    RegressionSuspect, RegressionSuspectKind, RegressionSuspectSummary, RunMetadata, RunReport,
    RunSuiteMetadata, RunTotals, ScoreDecomposition, ScoreDecompositionComparison,
    SearchTelemetryComparison, SolveTimingBreakdown, SolverBenchmarkMetadata,
    SolverCapabilitiesSnapshot, TrajectoryCheckpointComparison, WeightedConstraintBreakdown,
    WeightedConstraintBreakdownComparison, BASELINE_SNAPSHOT_SCHEMA_VERSION,
    CASE_RUN_SCHEMA_VERSION, COMPARISON_REPORT_SCHEMA_VERSION, RUN_REPORT_SCHEMA_VERSION,
};
pub use benchmark_mode::{
    default_benchmark_mode, is_hotpath_benchmark_mode, is_supported_benchmark_mode,
    CLIQUE_SWAP_APPLY_BENCHMARK_MODE, CLIQUE_SWAP_PREVIEW_BENCHMARK_MODE,
    CONSTRUCTION_BENCHMARK_MODE, FULL_RECALCULATION_BENCHMARK_MODE, FULL_SOLVE_BENCHMARK_MODE,
    SEARCH_ITERATION_BENCHMARK_MODE, SWAP_APPLY_BENCHMARK_MODE, SWAP_PREVIEW_BENCHMARK_MODE,
    TRANSFER_APPLY_BENCHMARK_MODE, TRANSFER_PREVIEW_BENCHMARK_MODE,
};
pub use compare::{compare_run_to_baseline, persist_comparison_report};
pub use index::{db_path as benchmark_index_path, list_recordings, list_refs};
pub use manifest::{
    canonical_solver_family_for_case, load_case_manifest, load_suite_manifest,
    BenchmarkCaseManifest, BenchmarkCaseOverride, BenchmarkSolverPolicy, BenchmarkSuiteClass,
    BenchmarkSuiteManifest, BenchmarkTimeoutPolicy, LoadedBenchmarkCase, LoadedBenchmarkSuite,
};
pub use recording_types::{
    BenchmarkRef, BenchmarkRefTarget, RecordingGitIdentity, RecordingIndexRow,
    RecordingMachineIdentity, RecordingMetadata, RecordingSuiteRun, RefIndexRow,
    BENCHMARK_REF_SCHEMA_VERSION, RECORDING_SCHEMA_VERSION,
};
pub use recordings::{
    create_recording_for_run, create_recording_for_runs, find_recording_suite_runs,
    list_recording_metadatas, load_recording, persist_recording, recording_dir,
    recording_meta_path, resolve_artifact_path, RecordingOptions, RecordingQuery,
    RecordingRunInput, RecordingSuiteRunMatch,
};
pub use refs::{build_ref, load_ref, ref_file_path, standard_ref_names};
pub use runner::{
    load_baseline_snapshot, load_run_report, persist_run_report, run_loaded_suite,
    run_suite_from_manifest, save_baseline_snapshot, RunnerOptions,
};
pub use storage::{
    default_artifacts_dir, machine_identity_label, BaselineDescriptor, BenchmarkStorage,
    MachineRecord,
};
pub use summary::render_comparison_summary;
pub use trajectory::{
    export_trajectory, export_trajectory_csv, render_trajectory_text, select_case,
    summarize_case_trajectory, TrajectoryCheckpoint, TrajectoryExport, TrajectorySummary,
};
pub use validation::{
    validate_final_solution, validation_failure_summary, ExternalValidationAgreement,
    ExternalValidationReport, RecomputedScoreBreakdown, ReportedScoreBreakdown,
};
