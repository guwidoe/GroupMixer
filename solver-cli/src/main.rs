//! solver-cli: Command-line interface for GroupMixer solver
//!
//! This CLI enables AI agents and developers to exercise solver functionality
//! without requiring the web interface.
//!
//! # Commands
//!
//! - `solve`: Run the solver on a problem file
//! - `validate`: Validate a problem file without solving
//! - `recommend`: Get recommended solver settings for a problem
//! - `evaluate`: Evaluate an existing schedule
//! - `benchmark`: Run / save / compare benchmark artifacts
//! - `schema`: Print the JSON schema for input/output formats

use anyhow::{Context, Result};
use clap::{Parser, Subcommand, ValueEnum};
use solver_benchmarking::{
    compare_run_to_baseline, load_baseline_snapshot, load_run_report, persist_comparison_report,
    persist_run_report, render_comparison_summary, run_suite_from_manifest, save_baseline_snapshot,
    create_recording_for_run, create_recording_for_runs, find_recording_suite_runs,
    list_recordings, list_refs, load_recording, load_ref, resolve_artifact_path,
    BaselineDescriptor, BenchmarkStorage, RecordingOptions, RecordingQuery, RecordingRunInput,
    RunnerOptions, FULL_SOLVE_BENCHMARK_MODE,
};
use solver_core::models::ApiInput;
use solver_core::{calculate_recommended_settings, run_solver};
use std::fs;
use std::io::{self, Read};
use std::path::{Path, PathBuf};

#[derive(Parser)]
#[command(name = "solver-cli")]
#[command(author = "GroupMixer")]
#[command(version = "0.1.0")]
#[command(about = "GroupMixer solver CLI - AI-testable optimization", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Run the solver on a problem file
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

    /// Validate a problem file without solving
    Validate {
        /// Input JSON file path
        #[arg(value_name = "FILE")]
        input: Option<PathBuf>,

        /// Read input from stdin instead of a file
        #[arg(long)]
        stdin: bool,
    },

    /// Get recommended solver settings for a problem
    Recommend {
        /// Input JSON file path (problem definition only)
        #[arg(value_name = "FILE")]
        input: Option<PathBuf>,

        /// Read input from stdin instead of a file
        #[arg(long)]
        stdin: bool,

        /// Desired runtime in seconds
        #[arg(short, long, default_value = "30")]
        runtime: u64,

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

    /// Run / save / compare benchmark artifacts
    Benchmark {
        #[command(subcommand)]
        command: BenchmarkCommands,
    },

    /// Print example JSON schemas for input/output formats
    Schema {
        /// Which schema to print: input, output, problem, or all
        #[arg(value_name = "TYPE", default_value = "all")]
        schema_type: String,
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

        /// Override artifact root (defaults to GROUPMIXER_BENCHMARK_ARTIFACTS_DIR or benchmarking/artifacts)
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
        #[arg(long, value_name = "NAME_OR_FILE")]
        baseline: String,

        /// Override artifact root (defaults to GROUPMIXER_BENCHMARK_ARTIFACTS_DIR or benchmarking/artifacts)
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

        /// Override artifact root (defaults to GROUPMIXER_BENCHMARK_ARTIFACTS_DIR or benchmarking/artifacts)
        #[arg(long, value_name = "DIR")]
        artifacts_dir: Option<PathBuf>,
    },

    /// List known baselines in artifact storage
    List {
        /// Override artifact root (defaults to GROUPMIXER_BENCHMARK_ARTIFACTS_DIR or benchmarking/artifacts)
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
}

impl BenchmarkSuiteArg {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Path => "path",
            Self::Representative => "representative",
            Self::Stretch => "stretch",
            Self::Adversarial => "adversarial",
        }
    }
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Solve {
            input,
            stdin,
            output,
            pretty,
        } => cmd_solve(input, stdin, output, pretty),

        Commands::Validate { input, stdin } => cmd_validate(input, stdin),

        Commands::Recommend {
            input,
            stdin,
            runtime,
            pretty,
        } => cmd_recommend(input, stdin, runtime, pretty),

        Commands::Evaluate {
            input,
            stdin,
            pretty,
        } => cmd_evaluate(input, stdin, pretty),

        Commands::Benchmark { command } => cmd_benchmark(command),

        Commands::Schema { schema_type } => cmd_schema(&schema_type),
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
            artifacts_dir,
            summary_output,
        } => cmd_benchmark_compare(run, baseline, artifacts_dir, summary_output),
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
        } => cmd_benchmark_latest_or_previous(
            artifacts_dir,
            suite,
            mode,
            machine_id,
            branch,
            0,
        ),
        BenchmarkCommands::Previous {
            artifacts_dir,
            suite,
            mode,
            machine_id,
            branch,
        } => cmd_benchmark_latest_or_previous(
            artifacts_dir,
            suite,
            mode,
            machine_id,
            branch,
            1,
        ),
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
    baseline: String,
    artifacts_dir: Option<PathBuf>,
    summary_output: Option<PathBuf>,
) -> Result<()> {
    let storage = benchmark_storage(artifacts_dir);
    storage.ensure_layout()?;

    let run_report = load_run_report(&run_path)?;
    let baseline_path = storage.resolve_baseline_path(&baseline, Some(&run_report))?;
    let baseline_snapshot = load_baseline_snapshot(&baseline_path)?;
    let comparison = compare_run_to_baseline(&run_report, &baseline_snapshot);
    let comparison_path = persist_comparison_report(&comparison, storage.root())?;
    let summary = render_comparison_summary(&comparison);

    println!("Comparison artifact: {}", comparison_path.display());
    println!("Baseline source: {}", baseline_path.display());
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
            source: "solver-cli benchmark record".to_string(),
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
        inputs.push(RecordingRunInput::full_solve(report, run_path));
    }

    let recording = create_recording_for_runs(
        storage.root(),
        inputs,
        &RecordingOptions {
            recording_id,
            purpose,
            source: "solver-cli benchmark record-bundle".to_string(),
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
    let current_run = load_run_report(resolve_artifact_path(storage.root(), &current.suite_run.run_report_path))?;
    let baseline_run = load_run_report(resolve_artifact_path(storage.root(), &previous.suite_run.run_report_path))?;
    let synthetic_baseline = solver_benchmarking::BaselineSnapshot {
        schema_version: solver_benchmarking::BASELINE_SNAPSHOT_SCHEMA_VERSION,
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

fn cmd_benchmark_recordings_show(recording_id: String, artifacts_dir: Option<PathBuf>) -> Result<()> {
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
            anyhow::bail!("no matching recording found for requested lane position {}", index);
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

    let recordings = solver_benchmarking::list_recording_metadatas(storage.root())?;
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

fn resolve_suite_manifest_path(
    suite: &BenchmarkSuiteArg,
    manifest: Option<PathBuf>,
) -> PathBuf {
    manifest.unwrap_or_else(|| {
        PathBuf::from(format!("benchmarking/suites/{}.yaml", suite.as_str()))
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

fn read_input(file: Option<PathBuf>, use_stdin: bool) -> Result<String> {
    if use_stdin {
        let mut buffer = String::new();
        io::stdin()
            .read_to_string(&mut buffer)
            .context("Failed to read from stdin")?;
        Ok(buffer)
    } else if let Some(path) = file {
        fs::read_to_string(&path).with_context(|| format!("Failed to read file: {:?}", path))
    } else {
        anyhow::bail!("Either provide an input file or use --stdin")
    }
}

fn cmd_solve(
    input: Option<PathBuf>,
    stdin: bool,
    output: Option<PathBuf>,
    pretty: bool,
) -> Result<()> {
    let json_str = read_input(input, stdin)?;
    let api_input: ApiInput =
        serde_json::from_str(&json_str).context("Failed to parse input JSON")?;

    eprintln!("Running solver...");
    let result = run_solver(&api_input).map_err(|e| anyhow::anyhow!("Solver error: {:?}", e))?;

    let output_json = if pretty {
        serde_json::to_string_pretty(&result)?
    } else {
        serde_json::to_string(&result)?
    };

    if let Some(output_path) = output {
        fs::write(&output_path, &output_json)
            .with_context(|| format!("Failed to write output to {:?}", output_path))?;
        eprintln!("Result written to {:?}", output_path);
    } else {
        println!("{}", output_json);
    }

    Ok(())
}

fn cmd_validate(input: Option<PathBuf>, stdin: bool) -> Result<()> {
    let json_str = read_input(input, stdin)?;

    let api_input: ApiInput = serde_json::from_str(&json_str).context("JSON parse error")?;

    use solver_core::solver::State;
    match State::new(&api_input) {
        Ok(_) => {
            println!("{{\"valid\": true, \"message\": \"Problem definition is valid\"}}");
            Ok(())
        }
        Err(e) => {
            println!(
                "{{\"valid\": false, \"error\": \"{}\"}}",
                format!("{:?}", e).replace('"', "\\\"")
            );
            Ok(())
        }
    }
}

fn cmd_recommend(input: Option<PathBuf>, stdin: bool, runtime: u64, pretty: bool) -> Result<()> {
    let json_str = read_input(input, stdin)?;
    let api_input: ApiInput =
        serde_json::from_str(&json_str).context("Failed to parse input JSON")?;

    eprintln!(
        "Calculating recommended settings for {}s runtime...",
        runtime
    );

    let recommended = calculate_recommended_settings(
        &api_input.problem,
        &api_input.objectives,
        &api_input.constraints,
        runtime,
    )
    .map_err(|e| anyhow::anyhow!("Error calculating settings: {:?}", e))?;

    let output_json = if pretty {
        serde_json::to_string_pretty(&recommended)?
    } else {
        serde_json::to_string(&recommended)?
    };

    println!("{}", output_json);
    Ok(())
}

fn cmd_evaluate(input: Option<PathBuf>, stdin: bool, pretty: bool) -> Result<()> {
    let json_str = read_input(input, stdin)?;
    let api_input: ApiInput =
        serde_json::from_str(&json_str).context("Failed to parse input JSON")?;

    if api_input.initial_schedule.is_none() {
        anyhow::bail!("Evaluate requires initial_schedule in the input");
    }

    let mut eval_input = api_input.clone();
    eval_input.solver.stop_conditions.max_iterations = Some(0);

    let result =
        run_solver(&eval_input).map_err(|e| anyhow::anyhow!("Evaluation error: {:?}", e))?;

    let output_json = if pretty {
        serde_json::to_string_pretty(&result)?
    } else {
        serde_json::to_string(&result)?
    };

    println!("{}", output_json);
    Ok(())
}

fn cmd_schema(schema_type: &str) -> Result<()> {
    match schema_type {
        "input" => print_input_schema(),
        "output" => print_output_schema(),
        "problem" => print_problem_schema(),
        "all" => {
            println!("=== INPUT SCHEMA ===\n");
            print_input_schema()?;
            println!("\n=== OUTPUT SCHEMA ===\n");
            print_output_schema()?;
            println!("\n=== PROBLEM SCHEMA ===\n");
            print_problem_schema()?;
            Ok(())
        }
        _ => anyhow::bail!(
            "Unknown schema type: {}. Use: input, output, problem, or all",
            schema_type
        ),
    }
}

fn print_input_schema() -> Result<()> {
    let example = r#"{
  "problem": {
    "people": [
      {"id": "alice", "attributes": {"department": "eng"}, "sessions": null},
      {"id": "bob", "attributes": {"department": "sales"}, "sessions": [0, 1]}
    ],
    "groups": [
      {"id": "team-1", "size": 4},
      {"id": "team-2", "size": 4}
    ],
    "num_sessions": 3
  },
  "objectives": [
    {"type": "maximize_unique_contacts", "weight": 1.0}
  ],
  "constraints": [
    {"type": "RepeatEncounter", "max_allowed_encounters": 1, "penalty_function": "squared", "penalty_weight": 100.0},
    {"type": "AttributeBalance", "group_id": "team-1", "attribute_key": "department", "desired_values": {"eng": 2, "sales": 2}, "penalty_weight": 50.0, "mode": "Exact", "sessions": null},
    {"type": "ShouldNotBeTogether", "people": ["alice", "bob"], "penalty_weight": 200.0, "sessions": null},
    {"type": "ShouldStayTogether", "people": ["alice", "charlie"], "penalty_weight": 150.0, "sessions": null},
    {"type": "MustStayTogether", "clique": ["alice", "bob"]},
    {"type": "ImmovablePerson", "person_id": "alice", "session": 0, "group_id": "team-1"},
    {"type": "PairMeetingCount", "min_encounters": 1, "max_encounters": 2, "penalty_weight": 50.0}
  ],
  "solver": {
    "solver_type": "SimulatedAnnealing",
    "stop_conditions": {
      "max_iterations": 100000,
      "time_limit_seconds": 30,
      "no_improvement_iterations": 10000
    },
    "solver_params": {
      "solver_type": "SimulatedAnnealing",
      "initial_temperature": 100.0,
      "final_temperature": 0.01,
      "cooling_schedule": "geometric",
      "reheat_after_no_improvement": 5000,
      "reheat_cycles": 3
    },
    "logging": {
      "log_frequency": 1000,
      "display_final_schedule": true,
      "log_final_score_breakdown": true
    }
  },
  "initial_schedule": null
}"#;
    println!("{}", example);
    Ok(())
}

fn print_output_schema() -> Result<()> {
    let example = r#"{
  "schedule": {
    "session_0": {"team-1": ["alice", "bob"], "team-2": ["charlie", "dave"]},
    "session_1": {"team-1": ["alice", "charlie"], "team-2": ["bob", "dave"]}
  },
  "final_score": 45.5,
  "unique_contacts": 12,
  "repetition_penalty": 0.0,
  "attribute_balance_penalty": 5.5,
  "soft_constraint_penalty": 0.0,
  "iterations_run": 50000,
  "time_elapsed_ms": 15234,
  "constraint_violations": {
    "repeat_encounters": [],
    "attribute_imbalances": [],
    "should_not_together": [],
    "should_stay_together": []
  }
}"#;
    println!("{}", example);
    Ok(())
}

fn print_problem_schema() -> Result<()> {
    let example = r#"{
  "people": [
    {
      "id": "string (required, unique)",
      "attributes": {"key": "value"},
      "sessions": [0, 1, 2] // null means all sessions
    }
  ],
  "groups": [
    {
      "id": "string (required, unique)",
      "size": 4 // capacity per session
    }
  ],
  "num_sessions": 3
}"#;
    println!("{}", example);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn suite_manifest_defaults_to_builtin_path_manifest() {
        let path = resolve_suite_manifest_path(&BenchmarkSuiteArg::Path, None);
        assert_eq!(path, PathBuf::from("benchmarking/suites/path.yaml"));
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
}
