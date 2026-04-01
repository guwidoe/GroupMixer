//! gm-cli: Command-line interface for GroupMixer solver
//!
//! This CLI enables AI agents and developers to exercise solver functionality
//! without requiring the web interface.
//!
//! # Commands
//!
//! - `solve`: Run the solver on a scenario file
//! - `validate`: Validate a scenario file without solving
//! - `recommend`: Get recommended solver settings for a scenario
//! - `evaluate`: Evaluate an existing schedule
//! - `inspect-result`: Inspect a compact summary from a solver result
//! - `benchmark`: Run / save / compare benchmark artifacts
//! - `schema`: Print the JSON schema for input/output formats

mod cli_help;
mod contract_surface;
mod public_errors;

use anyhow::{Context, Result};
use clap::{Parser, Subcommand, ValueEnum};
use gm_benchmarking::{
    compare_run_to_baseline, create_recording_for_run, create_recording_for_runs,
    find_recording_suite_runs, list_recordings, list_refs, load_baseline_snapshot, load_recording,
    load_ref, load_run_report, persist_comparison_report, persist_run_report,
    render_comparison_summary, resolve_artifact_path, run_suite_from_manifest,
    save_baseline_snapshot, BaselineDescriptor, BenchmarkStorage, RecordingOptions, RecordingQuery,
    RecordingRunInput, RunnerOptions, FULL_SOLVE_BENCHMARK_MODE,
};
use gm_contracts::{
    bootstrap::bootstrap_spec,
    errors::{error_spec, error_specs},
    operations::operation_spec,
    schemas::{export_schema, schema_specs},
    types::{
        RecommendSettingsRequest, ResultSummary, SolveRequest, ValidateRequest, ValidateResponse,
        ValidationIssue,
    },
};
use gm_core::models::{ApiInput, SolverResult};
use gm_core::{calculate_recommended_settings, default_solver_configuration, run_solver};
use serde::Serialize;
use std::fs;
use std::io::{self, Read};
use std::path::{Path, PathBuf};

#[derive(Parser)]
#[command(name = "gm-cli")]
#[command(author = "GroupMixer")]
#[command(version = "0.1.0")]
#[command(about = "GroupMixer solver CLI - AI-testable optimization", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Run the solver on a scenario file
    Solve {
        /// Input JSON file path (use --stdin to read from stdin)
        #[arg(value_name = "FILE")]
        input: Option<PathBuf>,

        /// Read input from stdin instead of a file
        #[arg(long)]
        stdin: bool,

        /// Output file path (defaults to stdout)
        #[arg(short, long)]
        output: Option<PathBuf>,

        /// Pretty-print the JSON output
        #[arg(long)]
        pretty: bool,
    },

    /// Validate a scenario file without solving
    Validate {
        /// Input JSON file path
        #[arg(value_name = "FILE")]
        input: Option<PathBuf>,

        /// Read input from stdin instead of a file
        #[arg(long)]
        stdin: bool,
    },

    /// Get the canonical default solver configuration
    #[command(name = "default-config")]
    DefaultConfig {
        /// Pretty-print the JSON output
        #[arg(long)]
        pretty: bool,
    },

    /// Get recommended solver settings for a scenario
    Recommend {
        /// Input JSON file path (recommend-settings-request)
        #[arg(value_name = "FILE")]
        input: Option<PathBuf>,

        /// Read input from stdin instead of a file
        #[arg(long)]
        stdin: bool,

        /// Pretty-print the JSON output
        #[arg(long)]
        pretty: bool,
    },

    /// Evaluate an existing schedule (compute metrics without solving)
    Evaluate {
        /// Input JSON file path (must include initial_schedule)
        #[arg(value_name = "FILE")]
        input: Option<PathBuf>,

        /// Read input from stdin instead of a file
        #[arg(long)]
        stdin: bool,

        /// Pretty-print the JSON output
        #[arg(long)]
        pretty: bool,
    },

    /// Inspect a compact summary from an existing solver result
    #[command(name = "inspect-result")]
    InspectResult {
        /// Input JSON file path containing a solver result
        #[arg(value_name = "FILE")]
        input: Option<PathBuf>,

        /// Read input from stdin instead of a file
        #[arg(long)]
        stdin: bool,

        /// Pretty-print the JSON output
        #[arg(long)]
        pretty: bool,
    },

    /// Run / save / compare benchmark artifacts
    Benchmark {
        #[command(subcommand)]
        command: BenchmarkCommands,
    },

    /// Print example JSON schemas for input/output formats
    Schema {
        /// Stable schema id to inspect (defaults to listing known schemas)
        #[arg(value_name = "SCHEMA_ID")]
        schema_id: Option<String>,

        /// Emit machine-readable JSON
        #[arg(long)]
        json: bool,
    },

    /// List bootstrap capabilities from gm-contracts
    Capabilities {
        /// Emit machine-readable JSON
        #[arg(long)]
        json: bool,
    },

    /// Inspect canonical public error codes from gm-contracts
    Errors {
        /// Specific error code to inspect (defaults to listing known codes)
        #[arg(value_name = "ERROR_CODE")]
        error_code: Option<String>,

        /// Emit machine-readable JSON
        #[arg(long)]
        json: bool,
    },
}

#[derive(Subcommand)]
enum BenchmarkCommands {
    /// Run a benchmark suite and persist the run report
    Run {
        /// Built-in suite id to run
        #[arg(long, value_enum, default_value = "path", conflicts_with = "manifest")]
        suite: BenchmarkSuiteArg,

        /// Explicit benchmark suite manifest path
        #[arg(long, value_name = "FILE")]
        manifest: Option<PathBuf>,

        /// Override artifact root (defaults to GROUPMIXER_BENCHMARK_ARTIFACTS_DIR or backend/benchmarking/artifacts)
        #[arg(long, value_name = "DIR")]
        artifacts_dir: Option<PathBuf>,

        /// Cargo profile label stored in machine metadata
        #[arg(long, default_value = "dev")]
        cargo_profile: String,

        /// Save the produced run as a named baseline
        #[arg(long, value_name = "NAME")]
        save_baseline: Option<String>,
    },

    /// Compare a run report to a named or explicit baseline snapshot
    Compare {
        /// Path to run-report.json
        #[arg(long, value_name = "FILE")]
        run: PathBuf,

        /// Baseline name (resolved via machine + suite) or explicit baseline snapshot path
        #[arg(long, value_name = "NAME_OR_FILE", conflicts_with = "baseline_run")]
        baseline: Option<String>,

        /// Path to a baseline run-report.json to compare against directly
        #[arg(long, value_name = "FILE", conflicts_with = "baseline")]
        baseline_run: Option<PathBuf>,

        /// Override artifact root (defaults to GROUPMIXER_BENCHMARK_ARTIFACTS_DIR or backend/benchmarking/artifacts)
        #[arg(long, value_name = "DIR")]
        artifacts_dir: Option<PathBuf>,

        /// Optional path to also write the human-readable summary text
        #[arg(long, value_name = "FILE")]
        summary_output: Option<PathBuf>,
    },

    /// Run one suite and persist it as a recording
    Record {
        /// Built-in suite id to run
        #[arg(long, value_enum, default_value = "path", conflicts_with = "manifest")]
        suite: BenchmarkSuiteArg,

        /// Explicit benchmark suite manifest path
        #[arg(long, value_name = "FILE")]
        manifest: Option<PathBuf>,

        /// Override artifact root
        #[arg(long, value_name = "DIR")]
        artifacts_dir: Option<PathBuf>,

        /// Cargo profile label stored in machine metadata
        #[arg(long, default_value = "dev")]
        cargo_profile: String,

        /// Explicit recording id
        #[arg(long, value_name = "ID")]
        recording_id: Option<String>,

        /// Recording purpose label
        #[arg(long, default_value = "manual-record")]
        purpose: String,

        /// Optional feature label for feature-lane refs
        #[arg(long, value_name = "FEATURE")]
        feature_name: Option<String>,
    },

    /// Run multiple suites and persist one bundle recording
    RecordBundle {
        /// Built-in suite ids to run; may be repeated
        #[arg(long, value_enum, value_name = "SUITE")]
        suite: Vec<BenchmarkSuiteArg>,

        /// Explicit benchmark suite manifest paths; may be repeated
        #[arg(long, value_name = "FILE")]
        manifest: Vec<PathBuf>,

        /// Override artifact root
        #[arg(long, value_name = "DIR")]
        artifacts_dir: Option<PathBuf>,

        /// Cargo profile label stored in machine metadata
        #[arg(long, default_value = "dev")]
        cargo_profile: String,

        /// Explicit recording id
        #[arg(long, value_name = "ID")]
        recording_id: Option<String>,

        /// Recording purpose label
        #[arg(long, default_value = "manual-bundle")]
        purpose: String,

        /// Optional feature label for feature-lane refs
        #[arg(long, value_name = "FEATURE")]
        feature_name: Option<String>,
    },

    /// Compare the latest recording in a suite lane to the previous one
    ComparePrev {
        /// Suite lane to compare
        #[arg(long, value_name = "SUITE")]
        suite: String,

        /// Benchmark mode within the suite lane
        #[arg(long, default_value = FULL_SOLVE_BENCHMARK_MODE)]
        mode: String,

        /// Override artifact root
        #[arg(long, value_name = "DIR")]
        artifacts_dir: Option<PathBuf>,

        /// Filter to one machine id
        #[arg(long, value_name = "MACHINE")]
        machine_id: Option<String>,

        /// Filter to one branch
        #[arg(long, value_name = "BRANCH")]
        branch: Option<String>,

        /// Optional path to also write the human-readable summary text
        #[arg(long, value_name = "FILE")]
        summary_output: Option<PathBuf>,
    },

    /// Recording history operations
    Recordings {
        #[command(subcommand)]
        command: BenchmarkRecordingsCommands,
    },

    /// Benchmark ref operations
    Refs {
        #[command(subcommand)]
        command: BenchmarkRefsCommands,
    },

    /// Show the latest recording or lane entry
    Latest {
        /// Override artifact root
        #[arg(long, value_name = "DIR")]
        artifacts_dir: Option<PathBuf>,

        /// Optional suite lane filter
        #[arg(long, value_name = "SUITE")]
        suite: Option<String>,

        /// Benchmark mode when filtering by suite lane
        #[arg(long, default_value = FULL_SOLVE_BENCHMARK_MODE)]
        mode: String,

        /// Filter to one machine id
        #[arg(long, value_name = "MACHINE")]
        machine_id: Option<String>,

        /// Filter to one branch
        #[arg(long, value_name = "BRANCH")]
        branch: Option<String>,
    },

    /// Show the previous recording or lane entry
    Previous {
        /// Override artifact root
        #[arg(long, value_name = "DIR")]
        artifacts_dir: Option<PathBuf>,

        /// Optional suite lane filter
        #[arg(long, value_name = "SUITE")]
        suite: Option<String>,

        /// Benchmark mode when filtering by suite lane
        #[arg(long, default_value = FULL_SOLVE_BENCHMARK_MODE)]
        mode: String,

        /// Filter to one machine id
        #[arg(long, value_name = "MACHINE")]
        machine_id: Option<String>,

        /// Filter to one branch
        #[arg(long, value_name = "BRANCH")]
        branch: Option<String>,
    },

    /// Baseline snapshot operations
    Baseline {
        #[command(subcommand)]
        command: BenchmarkBaselineCommands,
    },
}

#[derive(Subcommand)]
enum BenchmarkBaselineCommands {
    /// Save a named baseline from an existing run report
    Save {
        /// Path to run-report.json
        #[arg(long, value_name = "FILE")]
        run: PathBuf,

        /// Baseline name to save under the run's machine + suite
        #[arg(long, value_name = "NAME")]
        name: String,

        /// Override artifact root (defaults to GROUPMIXER_BENCHMARK_ARTIFACTS_DIR or backend/benchmarking/artifacts)
        #[arg(long, value_name = "DIR")]
        artifacts_dir: Option<PathBuf>,
    },

    /// List known baselines in artifact storage
    List {
        /// Override artifact root (defaults to GROUPMIXER_BENCHMARK_ARTIFACTS_DIR or backend/benchmarking/artifacts)
        #[arg(long, value_name = "DIR")]
        artifacts_dir: Option<PathBuf>,

        /// Filter to one suite id
        #[arg(long, value_name = "SUITE")]
        suite: Option<String>,

        /// Filter to one machine id
        #[arg(long, value_name = "MACHINE")]
        machine_id: Option<String>,
    },
}

#[derive(Subcommand)]
enum BenchmarkRecordingsCommands {
    /// List known benchmark recordings
    List {
        #[arg(long, value_name = "DIR")]
        artifacts_dir: Option<PathBuf>,
    },

    /// Show one recording as JSON
    Show {
        #[arg(value_name = "ID")]
        recording_id: String,

        #[arg(long, value_name = "DIR")]
        artifacts_dir: Option<PathBuf>,
    },
}

#[derive(Subcommand)]
enum BenchmarkRefsCommands {
    /// List benchmark refs
    List {
        #[arg(long, value_name = "DIR")]
        artifacts_dir: Option<PathBuf>,
    },

    /// Show one benchmark ref as JSON
    Show {
        #[arg(value_name = "NAME")]
        ref_name: String,

        #[arg(long, value_name = "DIR")]
        artifacts_dir: Option<PathBuf>,
    },
}

#[derive(Clone, Debug, ValueEnum)]
enum BenchmarkSuiteArg {
    Path,
    Representative,
    Stretch,
    Adversarial,
    HotpathConstruction,
    HotpathFullRecalculation,
    HotpathSwapPreview,
    HotpathSwapApply,
    HotpathTransferPreview,
    HotpathTransferApply,
    HotpathCliqueSwapPreview,
    HotpathCliqueSwapApply,
    HotpathSearchIteration,
}

impl BenchmarkSuiteArg {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Path => "path",
            Self::Representative => "representative",
            Self::Stretch => "stretch",
            Self::Adversarial => "adversarial",
            Self::HotpathConstruction => "hotpath-construction",
            Self::HotpathFullRecalculation => "hotpath-full-recalculation",
            Self::HotpathSwapPreview => "hotpath-swap-preview",
            Self::HotpathSwapApply => "hotpath-swap-apply",
            Self::HotpathTransferPreview => "hotpath-transfer-preview",
            Self::HotpathTransferApply => "hotpath-transfer-apply",
            Self::HotpathCliqueSwapPreview => "hotpath-clique-swap-preview",
            Self::HotpathCliqueSwapApply => "hotpath-clique-swap-apply",
            Self::HotpathSearchIteration => "hotpath-search-iteration",
        }
    }
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{}", error);
        std::process::exit(1);
    }
}

fn run() -> Result<()> {
    let raw_args: Vec<String> = std::env::args().collect();
    if cli_help::try_print_contract_help(&raw_args)? {
        return Ok(());
    }

    let cli = Cli::parse();

    match cli.command {
        Commands::Solve {
            input,
            stdin,
            output,
            pretty,
        } => cmd_solve(input, stdin, output, pretty),

        Commands::Validate { input, stdin } => cmd_validate(input, stdin),

        Commands::DefaultConfig { pretty } => cmd_default_config(pretty),
        Commands::Recommend {
            input,
            stdin,
            pretty,
        } => cmd_recommend(input, stdin, pretty),

        Commands::Evaluate {
            input,
            stdin,
            pretty,
        } => cmd_evaluate(input, stdin, pretty),

        Commands::InspectResult {
            input,
            stdin,
            pretty,
        } => cmd_inspect_result(input, stdin, pretty),

        Commands::Benchmark { command } => cmd_benchmark(command),

        Commands::Schema { schema_id, json } => cmd_schema(schema_id, json),

        Commands::Capabilities { json } => cmd_capabilities(json),

        Commands::Errors { error_code, json } => cmd_errors(error_code, json),
    }
}

fn cmd_benchmark(command: BenchmarkCommands) -> Result<()> {
    match command {
        BenchmarkCommands::Run {
            suite,
            manifest,
            artifacts_dir,
            cargo_profile,
            save_baseline,
        } => cmd_benchmark_run(suite, manifest, artifacts_dir, cargo_profile, save_baseline),
        BenchmarkCommands::Compare {
            run,
            baseline,
            baseline_run,
            artifacts_dir,
            summary_output,
        } => cmd_benchmark_compare(run, baseline, baseline_run, artifacts_dir, summary_output),
        BenchmarkCommands::Record {
            suite,
            manifest,
            artifacts_dir,
            cargo_profile,
            recording_id,
            purpose,
            feature_name,
        } => cmd_benchmark_record(
            suite,
            manifest,
            artifacts_dir,
            cargo_profile,
            recording_id,
            purpose,
            feature_name,
        ),
        BenchmarkCommands::RecordBundle {
            suite,
            manifest,
            artifacts_dir,
            cargo_profile,
            recording_id,
            purpose,
            feature_name,
        } => cmd_benchmark_record_bundle(
            suite,
            manifest,
            artifacts_dir,
            cargo_profile,
            recording_id,
            purpose,
            feature_name,
        ),
        BenchmarkCommands::ComparePrev {
            suite,
            mode,
            artifacts_dir,
            machine_id,
            branch,
            summary_output,
        } => cmd_benchmark_compare_prev(
            suite,
            mode,
            artifacts_dir,
            machine_id,
            branch,
            summary_output,
        ),
        BenchmarkCommands::Recordings { command } => match command {
            BenchmarkRecordingsCommands::List { artifacts_dir } => {
                cmd_benchmark_recordings_list(artifacts_dir)
            }
            BenchmarkRecordingsCommands::Show {
                recording_id,
                artifacts_dir,
            } => cmd_benchmark_recordings_show(recording_id, artifacts_dir),
        },
        BenchmarkCommands::Refs { command } => match command {
            BenchmarkRefsCommands::List { artifacts_dir } => cmd_benchmark_refs_list(artifacts_dir),
            BenchmarkRefsCommands::Show {
                ref_name,
                artifacts_dir,
            } => cmd_benchmark_refs_show(ref_name, artifacts_dir),
        },
        BenchmarkCommands::Latest {
            artifacts_dir,
            suite,
            mode,
            machine_id,
            branch,
        } => cmd_benchmark_latest_or_previous(artifacts_dir, suite, mode, machine_id, branch, 0),
        BenchmarkCommands::Previous {
            artifacts_dir,
            suite,
            mode,
            machine_id,
            branch,
        } => cmd_benchmark_latest_or_previous(artifacts_dir, suite, mode, machine_id, branch, 1),
        BenchmarkCommands::Baseline { command } => match command {
            BenchmarkBaselineCommands::Save {
                run,
                name,
                artifacts_dir,
            } => cmd_benchmark_baseline_save(run, name, artifacts_dir),
            BenchmarkBaselineCommands::List {
                artifacts_dir,
                suite,
                machine_id,
            } => cmd_benchmark_baseline_list(artifacts_dir, suite, machine_id),
        },
    }
}

fn cmd_benchmark_run(
    suite: BenchmarkSuiteArg,
    manifest: Option<PathBuf>,
    artifacts_dir: Option<PathBuf>,
    cargo_profile: String,
    save_baseline: Option<String>,
) -> Result<()> {
    let storage = benchmark_storage(artifacts_dir);
    storage.ensure_layout()?;

    let manifest_path = resolve_suite_manifest_path(&suite, manifest);
    let options = RunnerOptions {
        artifacts_dir: storage.root().to_path_buf(),
        cargo_profile,
    };

    let report = run_suite_from_manifest(&manifest_path, &options)?;
    let run_path = persist_run_report(&report, storage.root())?;

    println!(
        "Benchmark suite '{}' completed: {} cases ({} ok / {} failed)",
        report.suite.suite_id,
        report.totals.total_cases,
        report.totals.successful_cases,
        report.totals.failed_cases
    );
    println!("Run report: {}", run_path.display());

    if let Some(baseline_name) = save_baseline {
        let baseline_path = save_baseline_snapshot(
            &report,
            &baseline_name,
            storage.root(),
            Some(run_path.clone()),
        )?;
        println!("Baseline saved: {}", baseline_path.display());
    }

    Ok(())
}

fn cmd_benchmark_compare(
    run_path: PathBuf,
    baseline: Option<String>,
    baseline_run: Option<PathBuf>,
    artifacts_dir: Option<PathBuf>,
    summary_output: Option<PathBuf>,
) -> Result<()> {
    let storage = benchmark_storage(artifacts_dir);
    storage.ensure_layout()?;

    let run_report = load_run_report(&run_path)?;
    let (baseline_snapshot, baseline_source) = if let Some(baseline_name) = baseline {
        let baseline_path = storage.resolve_baseline_path(&baseline_name, Some(&run_report))?;
        (
            load_baseline_snapshot(&baseline_path)?,
            baseline_path.display().to_string(),
        )
    } else if let Some(baseline_run_path) = baseline_run {
        let baseline_run_report = load_run_report(&baseline_run_path)?;
        (
            gm_benchmarking::BaselineSnapshot {
                schema_version: gm_benchmarking::BASELINE_SNAPSHOT_SCHEMA_VERSION,
                baseline_name: baseline_run_report.run.run_id.clone(),
                created_at: baseline_run_report.run.generated_at.clone(),
                source_run_path: Some(baseline_run_path.display().to_string()),
                run_report: baseline_run_report,
            },
            baseline_run_path.display().to_string(),
        )
    } else {
        anyhow::bail!("compare requires either --baseline or --baseline-run");
    };
    let comparison = compare_run_to_baseline(&run_report, &baseline_snapshot);
    let comparison_path = persist_comparison_report(&comparison, storage.root())?;
    let summary = render_comparison_summary(&comparison);

    println!("Comparison artifact: {}", comparison_path.display());
    println!("Baseline source: {}", baseline_source);
    println!();
    println!("{}", summary);

    if let Some(summary_output) = summary_output {
        write_text_file(&summary_output, &summary)?;
        println!("Summary written: {}", summary_output.display());
    }

    Ok(())
}

fn cmd_benchmark_record(
    suite: BenchmarkSuiteArg,
    manifest: Option<PathBuf>,
    artifacts_dir: Option<PathBuf>,
    cargo_profile: String,
    recording_id: Option<String>,
    purpose: String,
    feature_name: Option<String>,
) -> Result<()> {
    let storage = benchmark_storage(artifacts_dir);
    storage.ensure_layout()?;

    let manifest_path = resolve_suite_manifest_path(&suite, manifest);
    let options = RunnerOptions {
        artifacts_dir: storage.root().to_path_buf(),
        cargo_profile,
    };

    let report = run_suite_from_manifest(&manifest_path, &options)?;
    let run_path = persist_run_report(&report, storage.root())?;
    let recording = create_recording_for_run(
        storage.root(),
        report,
        run_path.clone(),
        &RecordingOptions {
            recording_id,
            purpose,
            source: "gm-cli benchmark record".to_string(),
            feature_name,
        },
    )?;

    println!("Run report: {}", run_path.display());
    println!(
        "Recording saved: {}",
        storage
            .recordings_dir()
            .join(&recording.recording_id)
            .join("meta.json")
            .display()
    );
    Ok(())
}

fn cmd_benchmark_record_bundle(
    suites: Vec<BenchmarkSuiteArg>,
    manifests: Vec<PathBuf>,
    artifacts_dir: Option<PathBuf>,
    cargo_profile: String,
    recording_id: Option<String>,
    purpose: String,
    feature_name: Option<String>,
) -> Result<()> {
    let storage = benchmark_storage(artifacts_dir);
    storage.ensure_layout()?;

    let manifest_paths = resolve_bundle_manifest_paths(suites, manifests)?;
    let options = RunnerOptions {
        artifacts_dir: storage.root().to_path_buf(),
        cargo_profile,
    };

    let mut inputs = Vec::with_capacity(manifest_paths.len());
    for manifest_path in manifest_paths {
        let report = run_suite_from_manifest(&manifest_path, &options)?;
        let run_path = persist_run_report(&report, storage.root())?;
        println!("Run report: {}", run_path.display());
        inputs.push(RecordingRunInput::from_report(report, run_path));
    }

    let recording = create_recording_for_runs(
        storage.root(),
        inputs,
        &RecordingOptions {
            recording_id,
            purpose,
            source: "gm-cli benchmark record-bundle".to_string(),
            feature_name,
        },
    )?;

    println!(
        "Recording saved: {}",
        storage
            .recordings_dir()
            .join(&recording.recording_id)
            .join("meta.json")
            .display()
    );
    Ok(())
}

fn cmd_benchmark_compare_prev(
    suite: String,
    mode: String,
    artifacts_dir: Option<PathBuf>,
    machine_id: Option<String>,
    branch: Option<String>,
    summary_output: Option<PathBuf>,
) -> Result<()> {
    let storage = benchmark_storage(artifacts_dir);
    storage.ensure_layout()?;

    let query = RecordingQuery {
        machine_id,
        branch,
        feature_name: None,
        purpose: None,
        suite_name: Some(suite),
        benchmark_mode: Some(mode),
    };
    let matches = find_recording_suite_runs(storage.root(), &query)?;
    if matches.len() < 2 {
        anyhow::bail!("compare-prev requires at least two recordings in the selected suite lane");
    }

    let current = &matches[0];
    let previous = &matches[1];
    let current_run = load_run_report(resolve_artifact_path(
        storage.root(),
        &current.suite_run.run_report_path,
    ))?;
    let baseline_run = load_run_report(resolve_artifact_path(
        storage.root(),
        &previous.suite_run.run_report_path,
    ))?;
    let synthetic_baseline = gm_benchmarking::BaselineSnapshot {
        schema_version: gm_benchmarking::BASELINE_SNAPSHOT_SCHEMA_VERSION,
        baseline_name: format!("previous-{}", previous.recording.recording_id),
        created_at: previous.recording.recorded_at.clone(),
        source_run_path: Some(previous.suite_run.run_report_path.clone()),
        run_report: baseline_run,
    };
    let comparison = compare_run_to_baseline(&current_run, &synthetic_baseline);
    let comparison_path = persist_comparison_report(&comparison, storage.root())?;
    let summary = render_comparison_summary(&comparison);

    println!("Comparison artifact: {}", comparison_path.display());
    println!(
        "Compared latest recording {} against previous {}",
        current.recording.recording_id, previous.recording.recording_id
    );
    println!();
    println!("{}", summary);

    if let Some(summary_output) = summary_output {
        write_text_file(&summary_output, &summary)?;
        println!("Summary written: {}", summary_output.display());
    }

    Ok(())
}

fn cmd_benchmark_recordings_list(artifacts_dir: Option<PathBuf>) -> Result<()> {
    let storage = benchmark_storage(artifacts_dir);
    storage.ensure_layout()?;

    let rows = list_recordings(storage.root())?;
    if rows.is_empty() {
        println!("No recordings found under {}", storage.root().display());
        return Ok(());
    }

    println!("Recordings under {}", storage.root().display());
    for row in rows {
        println!(
            "- id={} recorded_at={} purpose={} branch={} short_sha={} machine={} suite_count={}{}",
            row.recording_id,
            row.recorded_at,
            row.purpose,
            row.git_branch,
            row.git_short_sha,
            row.machine_id,
            row.suite_count,
            row.feature_name
                .as_ref()
                .map(|value| format!(" feature={value}"))
                .unwrap_or_default()
        );
    }
    Ok(())
}

fn cmd_benchmark_recordings_show(
    recording_id: String,
    artifacts_dir: Option<PathBuf>,
) -> Result<()> {
    let storage = benchmark_storage(artifacts_dir);
    storage.ensure_layout()?;
    let recording = load_recording(storage.root(), &recording_id)?;
    print_json_pretty(&recording)
}

fn cmd_benchmark_refs_list(artifacts_dir: Option<PathBuf>) -> Result<()> {
    let storage = benchmark_storage(artifacts_dir);
    storage.ensure_layout()?;
    let rows = list_refs(storage.root())?;
    if rows.is_empty() {
        println!("No refs found under {}", storage.root().display());
        return Ok(());
    }

    println!("Refs under {}", storage.root().display());
    for row in rows {
        println!(
            "- ref={} recording={} suite={} mode={} updated_at={}",
            row.ref_name,
            row.target_recording_id,
            row.target_suite_name,
            row.target_benchmark_mode,
            row.updated_at
        );
    }
    Ok(())
}

fn cmd_benchmark_refs_show(ref_name: String, artifacts_dir: Option<PathBuf>) -> Result<()> {
    let storage = benchmark_storage(artifacts_dir);
    storage.ensure_layout()?;
    let benchmark_ref = load_ref(storage.root(), &ref_name)?;
    print_json_pretty(&benchmark_ref)
}

fn cmd_benchmark_latest_or_previous(
    artifacts_dir: Option<PathBuf>,
    suite: Option<String>,
    mode: String,
    machine_id: Option<String>,
    branch: Option<String>,
    index: usize,
) -> Result<()> {
    let storage = benchmark_storage(artifacts_dir);
    storage.ensure_layout()?;

    if let Some(suite) = suite {
        let matches = find_recording_suite_runs(
            storage.root(),
            &RecordingQuery {
                machine_id,
                branch,
                feature_name: None,
                purpose: None,
                suite_name: Some(suite),
                benchmark_mode: Some(mode),
            },
        )?;
        let Some(entry) = matches.get(index) else {
            anyhow::bail!(
                "no matching recording found for requested lane position {}",
                index
            );
        };
        println!(
            "recording_id={} suite={} mode={} run_id={} recorded_at={} machine={} branch={}",
            entry.recording.recording_id,
            entry.suite_run.suite_name,
            entry.suite_run.benchmark_mode,
            entry.suite_run.run_id,
            entry.recording.recorded_at,
            entry.recording.machine.id,
            entry.recording.git.branch
        );
        return Ok(());
    }

    let recordings = gm_benchmarking::list_recording_metadatas(storage.root())?;
    let Some(recording) = recordings.get(index) else {
        anyhow::bail!("no recording found at position {}", index);
    };
    println!(
        "recording_id={} recorded_at={} purpose={} machine={} branch={} suite_count={}",
        recording.recording_id,
        recording.recorded_at,
        recording.purpose,
        recording.machine.id,
        recording.git.branch,
        recording.suite_runs.len()
    );
    Ok(())
}

fn cmd_benchmark_baseline_save(
    run_path: PathBuf,
    name: String,
    artifacts_dir: Option<PathBuf>,
) -> Result<()> {
    let storage = benchmark_storage(artifacts_dir);
    storage.ensure_layout()?;

    let run_report = load_run_report(&run_path)?;
    let baseline_path = save_baseline_snapshot(&run_report, &name, storage.root(), Some(run_path))?;
    println!("Baseline saved: {}", baseline_path.display());
    Ok(())
}

fn cmd_benchmark_baseline_list(
    artifacts_dir: Option<PathBuf>,
    suite: Option<String>,
    machine_id: Option<String>,
) -> Result<()> {
    let storage = benchmark_storage(artifacts_dir);
    storage.ensure_layout()?;

    let baselines = storage.list_baselines(machine_id.as_deref(), suite.as_deref())?;
    if baselines.is_empty() {
        println!("No baselines found under {}", storage.root().display());
        return Ok(());
    }

    println!("Baselines under {}", storage.root().display());
    for descriptor in baselines {
        print_baseline_descriptor(&descriptor)?;
    }
    Ok(())
}

fn print_baseline_descriptor(descriptor: &BaselineDescriptor) -> Result<()> {
    let snapshot = load_baseline_snapshot(&descriptor.path)?;
    println!(
        "- machine={} suite={} baseline={} created_at={} path={}",
        descriptor.machine_id,
        descriptor.suite_id,
        snapshot.baseline_name,
        snapshot.created_at,
        descriptor.path.display()
    );
    Ok(())
}

fn benchmark_storage(artifacts_dir: Option<PathBuf>) -> BenchmarkStorage {
    artifacts_dir
        .map(BenchmarkStorage::new)
        .unwrap_or_else(BenchmarkStorage::from_env_or_default)
}

fn resolve_suite_manifest_path(suite: &BenchmarkSuiteArg, manifest: Option<PathBuf>) -> PathBuf {
    manifest.unwrap_or_else(|| {
        PathBuf::from(format!(
            "backend/benchmarking/suites/{}.yaml",
            suite.as_str()
        ))
    })
}

fn resolve_bundle_manifest_paths(
    suites: Vec<BenchmarkSuiteArg>,
    manifests: Vec<PathBuf>,
) -> Result<Vec<PathBuf>> {
    let mut out: Vec<PathBuf> = suites
        .into_iter()
        .map(|suite| resolve_suite_manifest_path(&suite, None))
        .collect();
    out.extend(manifests);
    if out.is_empty() {
        anyhow::bail!("record-bundle requires at least one --suite or --manifest");
    }
    Ok(out)
}

fn write_text_file(path: &Path, contents: &str) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("Failed to create parent dir {:?}", parent))?;
    }
    fs::write(path, contents).with_context(|| format!("Failed to write file: {:?}", path))
}

fn print_json_pretty<T: serde::Serialize>(value: &T) -> Result<()> {
    println!("{}", serde_json::to_string_pretty(value)?);
    Ok(())
}

fn read_input(file: Option<PathBuf>, use_stdin: bool, operation_id: &str) -> Result<String> {
    if use_stdin {
        let mut buffer = String::new();
        io::stdin().read_to_string(&mut buffer).map_err(|error| {
            public_errors::internal_error(
                format!("Failed to read from stdin: {error}"),
                operation_id,
            )
        })?;
        Ok(buffer)
    } else if let Some(path) = file {
        fs::read_to_string(&path).map_err(|error| {
            public_errors::internal_error(
                format!("Failed to read file {:?}: {}", path, error),
                operation_id,
            )
        })
    } else {
        Err(public_errors::invalid_input_error(
            "Either provide an input file or use --stdin",
            Some("input".to_string()),
            operation_id,
            vec!["<FILE>".to_string(), "--stdin".to_string()],
        ))
    }
}

fn cmd_solve(
    input: Option<PathBuf>,
    stdin: bool,
    output: Option<PathBuf>,
    pretty: bool,
) -> Result<()> {
    let json_str = read_input(input, stdin, "solve")?;
    let solve_request: SolveRequest = serde_json::from_str(&json_str).map_err(|error| {
        public_errors::invalid_input_error(
            format!("Failed to parse input JSON: {}", error),
            Some(format!("line {}, column {}", error.line(), error.column())),
            "solve",
            vec!["solve-request".to_string()],
        )
    })?;
    let api_input: ApiInput = solve_request.into();

    eprintln!("Running solver...");
    let result = run_solver(&api_input)
        .map_err(|error| public_errors::map_solver_error(format!("{:?}", error), "solve"))?;

    let output_json = if pretty {
        serde_json::to_string_pretty(&result)?
    } else {
        serde_json::to_string(&result)?
    };

    if let Some(output_path) = output {
        fs::write(&output_path, &output_json).map_err(|error| {
            public_errors::internal_error(
                format!("Failed to write output to {:?}: {}", output_path, error),
                "solve",
            )
        })?;
        eprintln!("Result written to {:?}", output_path);
    } else {
        println!("{}", output_json);
    }

    Ok(())
}

fn cmd_validate(input: Option<PathBuf>, stdin: bool) -> Result<()> {
    let json_str = read_input(input, stdin, "validate-scenario")?;

    let validate_request: ValidateRequest = serde_json::from_str(&json_str).map_err(|error| {
        public_errors::invalid_input_error(
            format!("Failed to parse input JSON: {}", error),
            Some(format!("line {}, column {}", error.line(), error.column())),
            "validate-scenario",
            vec!["validate-request".to_string()],
        )
    })?;
    let api_input: ApiInput = validate_request.into();

    use gm_core::solver::State;
    match State::new(&api_input) {
        Ok(_) => {
            let response = ValidateResponse {
                valid: true,
                issues: Vec::new(),
            };
            print_json_pretty(&response)?;
            Ok(())
        }
        Err(e) => {
            let error_text = format!("{:?}", e);
            let issue = if error_text.contains("unknown variant")
                || error_text.contains("expected one of")
            {
                ValidationIssue {
                    code: Some("unsupported-constraint-kind".to_string()),
                    message: error_text,
                    path: Some("constraints[*].type".to_string()),
                }
            } else {
                ValidationIssue {
                    code: Some("infeasible-scenario".to_string()),
                    message: error_text,
                    path: None,
                }
            };
            let response = ValidateResponse {
                valid: false,
                issues: vec![issue],
            };
            print_json_pretty(&response)?;
            Ok(())
        }
    }
}

fn cmd_default_config(pretty: bool) -> Result<()> {
    let configuration = default_solver_configuration();
    let output_json = if pretty {
        serde_json::to_string_pretty(&configuration)?
    } else {
        serde_json::to_string(&configuration)?
    };

    println!("{}", output_json);
    Ok(())
}

fn cmd_recommend(input: Option<PathBuf>, stdin: bool, pretty: bool) -> Result<()> {
    let json_str = read_input(input, stdin, "recommend-settings")?;
    let recommendation_input = parse_recommend_input(&json_str)?;

    eprintln!(
        "Calculating recommended settings for {}s runtime...",
        recommendation_input.desired_runtime_seconds
    );

    let scenario_definition: gm_core::models::ProblemDefinition =
        (&recommendation_input.scenario).into();
    let recommended = calculate_recommended_settings(
        &scenario_definition,
        &recommendation_input.objectives,
        &recommendation_input.constraints,
        recommendation_input.desired_runtime_seconds,
    )
    .map_err(|error| {
        public_errors::map_solver_error(format!("{:?}", error), "recommend-settings")
    })?;

    let output_json = if pretty {
        serde_json::to_string_pretty(&recommended)?
    } else {
        serde_json::to_string(&recommended)?
    };

    println!("{}", output_json);
    Ok(())
}

fn cmd_evaluate(input: Option<PathBuf>, stdin: bool, pretty: bool) -> Result<()> {
    let json_str = read_input(input, stdin, "evaluate-input")?;
    let solve_request: SolveRequest = serde_json::from_str(&json_str).map_err(|error| {
        public_errors::invalid_input_error(
            format!("Failed to parse input JSON: {}", error),
            Some(format!("line {}, column {}", error.line(), error.column())),
            "evaluate-input",
            vec!["solve-request".to_string()],
        )
    })?;
    let api_input: ApiInput = solve_request.into();

    if api_input.initial_schedule.is_none() {
        return Err(public_errors::invalid_input_error(
            "Evaluate requires initial_schedule in the input",
            Some("initial_schedule".to_string()),
            "evaluate-input",
            vec!["provide initial_schedule".to_string()],
        ));
    }

    let mut eval_input = api_input.clone();
    eval_input.solver.stop_conditions.max_iterations = Some(0);

    let result = run_solver(&eval_input).map_err(|error| {
        public_errors::map_solver_error(format!("{:?}", error), "evaluate-input")
    })?;

    let output_json = if pretty {
        serde_json::to_string_pretty(&result)?
    } else {
        serde_json::to_string(&result)?
    };

    println!("{}", output_json);
    Ok(())
}

fn cmd_inspect_result(input: Option<PathBuf>, stdin: bool, pretty: bool) -> Result<()> {
    let json_str = read_input(input, stdin, "inspect-result")?;
    let result: SolverResult = serde_json::from_str(&json_str).map_err(|error| {
        public_errors::invalid_input_error(
            format!("Failed to parse result JSON: {}", error),
            Some(format!("line {}, column {}", error.line(), error.column())),
            "inspect-result",
            vec!["solve-response".to_string()],
        )
    })?;

    let summary = ResultSummary::from(&result);
    if pretty {
        print_json_pretty(&summary)?;
    } else {
        println!("{}", serde_json::to_string(&summary)?);
    }
    Ok(())
}

fn cmd_schema(schema_id: Option<String>, json: bool) -> Result<()> {
    let Some(schema_id) = schema_id.map(resolve_schema_alias) else {
        #[derive(Serialize)]
        struct SchemaListEntry<'a> {
            id: &'a str,
            version: &'a str,
        }

        let entries: Vec<_> = schema_specs()
            .iter()
            .map(|spec| SchemaListEntry {
                id: spec.id,
                version: spec.version,
            })
            .collect();

        if json {
            print_json_pretty(&entries)?;
        } else {
            println!("Known schema ids:");
            for entry in entries {
                println!("- {} ({})", entry.id, entry.version);
            }
        }
        return Ok(());
    };

    let schema = export_schema(&schema_id).ok_or_else(|| {
        public_errors::unknown_schema_error(
            &schema_id,
            known_schema_ids().into_iter().map(str::to_string).collect(),
        )
    })?;

    if json {
        print_json_pretty(&schema)?;
    } else {
        println!("schema: {}", schema_id);
        println!();
        println!("{}", serde_json::to_string_pretty(&schema)?);
    }

    Ok(())
}

fn cmd_capabilities(json: bool) -> Result<()> {
    #[derive(Serialize)]
    struct CapabilityEntry<'a> {
        command_name: &'a str,
        operation_id: Option<&'a str>,
        summary: &'a str,
        kind: Option<String>,
        input_schema_ids: Vec<&'a str>,
        output_schema_ids: Vec<&'a str>,
        related_operation_ids: Vec<&'a str>,
    }

    #[derive(Serialize)]
    struct CapabilityPayload<'a> {
        title: &'a str,
        summary: &'a str,
        discovery_note: &'a str,
        operations: Vec<CapabilityEntry<'a>>,
    }

    let bootstrap = bootstrap_spec();
    let operations = crate::contract_surface::public_cli_contract_bindings()
        .map(|binding| {
            if let Some(operation_id) = binding.operation_id {
                let operation = operation_spec(operation_id).expect("bound operation");
                CapabilityEntry {
                    command_name: binding.command_name,
                    operation_id: Some(operation.id),
                    summary: operation.summary,
                    kind: Some(format!("{:?}", operation.kind).to_ascii_lowercase()),
                    input_schema_ids: operation.input_schema_ids.to_vec(),
                    output_schema_ids: operation.output_schema_ids.to_vec(),
                    related_operation_ids: operation.related_operation_ids.to_vec(),
                }
            } else {
                CapabilityEntry {
                    command_name: binding.command_name,
                    operation_id: None,
                    summary: binding.note,
                    kind: None,
                    input_schema_ids: Vec::new(),
                    output_schema_ids: Vec::new(),
                    related_operation_ids: bootstrap.top_level_operation_ids.to_vec(),
                }
            }
        })
        .collect();

    let payload = CapabilityPayload {
        title: bootstrap.title,
        summary: bootstrap.summary,
        discovery_note: bootstrap.discovery_note,
        operations,
    };

    if json {
        print_json_pretty(&payload)
    } else {
        println!("{}", payload.title);
        println!();
        println!("{}", payload.summary);
        println!();
        for operation in payload.operations {
            println!("- {}", operation.command_name);
            if let Some(operation_id) = operation.operation_id {
                println!("  operation_id: {}", operation_id);
            }
            println!("  summary: {}", operation.summary);
            if !operation.input_schema_ids.is_empty() {
                println!("  input schemas: {}", operation.input_schema_ids.join(", "));
            }
            if !operation.output_schema_ids.is_empty() {
                println!(
                    "  output schemas: {}",
                    operation.output_schema_ids.join(", ")
                );
            }
            if !operation.related_operation_ids.is_empty() {
                println!("  related: {}", operation.related_operation_ids.join(", "));
            }
            println!();
        }
        Ok(())
    }
}

fn cmd_errors(error_code: Option<String>, json: bool) -> Result<()> {
    let Some(error_code) = error_code else {
        if json {
            return print_json_pretty(&error_specs());
        }
        println!("Known public error codes:");
        for spec in error_specs() {
            println!("- {}: {}", spec.code, spec.summary);
        }
        return Ok(());
    };

    let spec = error_spec(&error_code).ok_or_else(|| {
        public_errors::unknown_error_code_error(
            &error_code,
            error_specs()
                .iter()
                .map(|spec| spec.code.to_string())
                .collect(),
        )
    })?;
    if json {
        print_json_pretty(spec)
    } else {
        println!("error: {}", spec.code);
        println!("category: {:?}", spec.category);
        println!("summary: {}", spec.summary);
        println!("why: {}", spec.why);
        println!("recovery: {}", spec.recovery);
        if !spec.related_help_operation_ids.is_empty() {
            println!(
                "related help: {}",
                spec.related_help_operation_ids.join(", ")
            );
        }
        Ok(())
    }
}

fn resolve_schema_alias(schema_id: String) -> String {
    match schema_id.as_str() {
        "input" => "solve-request".to_string(),
        "output" => "solve-response".to_string(),
        "scenario" => "scenario-definition".to_string(),
        other => other.to_string(),
    }
}

fn parse_recommend_input(json_str: &str) -> Result<RecommendSettingsRequest> {
    serde_json::from_str::<RecommendSettingsRequest>(json_str).map_err(|error| {
        public_errors::invalid_input_error(
            format!(
                "Failed to parse recommend input as recommend-settings-request JSON: {}",
                error
            ),
            Some(format!("line {}, column {}", error.line(), error.column())),
            "recommend-settings",
            vec!["recommend-settings-request".to_string()],
        )
    })
}

fn known_schema_ids() -> Vec<&'static str> {
    schema_specs().iter().map(|spec| spec.id).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn suite_manifest_defaults_to_builtin_path_manifest() {
        let path = resolve_suite_manifest_path(&BenchmarkSuiteArg::Path, None);
        assert_eq!(path, PathBuf::from("backend/benchmarking/suites/path.yaml"));
    }

    #[test]
    fn baseline_list_works_against_storage_layout() {
        let temp = TempDir::new().expect("temp dir");
        let storage = BenchmarkStorage::new(temp.path());
        storage.ensure_layout().expect("layout");
        let path = storage.baseline_snapshot_path("benchbox", "path", "baseline-a");
        fs::create_dir_all(path.parent().unwrap()).expect("mk parent");
        fs::write(&path, "{}\n").expect("write baseline");

        let baselines = storage
            .list_baselines(Some("benchbox"), Some("path"))
            .expect("list baselines");
        assert_eq!(baselines.len(), 1);
        assert_eq!(baselines[0].baseline_name, "baseline-a");
    }

    #[test]
    fn schema_command_unknown_id_uses_canonical_error_output() {
        let error = cmd_schema(Some("does-not-exist".to_string()), false)
            .expect_err("unknown schema should fail")
            .to_string();
        assert!(error.contains("error[unknown-schema]"));
        assert!(error.contains("gm-cli schema --help"));
    }

    #[test]
    fn errors_command_unknown_code_uses_canonical_error_output() {
        let error = cmd_errors(Some("does-not-exist".to_string()), false)
            .expect_err("unknown error code should fail")
            .to_string();
        assert!(error.contains("error[unknown-error-code]"));
        assert!(error.contains("gm-cli errors --help"));
    }

    #[test]
    fn evaluate_without_initial_schedule_uses_canonical_error_output() {
        let temp = TempDir::new().expect("temp dir");
        let input_path = temp.path().join("input.json");
        fs::write(
            &input_path,
            r#"{
  "scenario": {"people": [], "groups": [], "num_sessions": 1},
  "initial_schedule": null,
  "objectives": [],
  "constraints": [],
  "solver": {
    "solver_type": "SimulatedAnnealing",
    "stop_conditions": {"max_iterations": 1, "time_limit_seconds": null, "no_improvement_iterations": null},
    "solver_params": {"solver_type": "SimulatedAnnealing", "initial_temperature": 1.0, "final_temperature": 0.1, "cooling_schedule": "geometric", "reheat_cycles": 0, "reheat_after_no_improvement": 0},
    "logging": {},
    "telemetry": {},
    "seed": null,
    "move_policy": null,
    "allowed_sessions": null
  }
}"#,
        )
        .expect("write input");

        let error = cmd_evaluate(Some(input_path), false, false)
            .expect_err("evaluate should fail")
            .to_string();
        assert!(error.contains("error[invalid-input]"));
        assert!(error.contains("initial_schedule"));
        assert!(error.contains("gm-cli evaluate --help"));
    }
}
