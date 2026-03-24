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
    BaselineDescriptor, BenchmarkStorage, RunnerOptions,
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

fn write_text_file(path: &Path, contents: &str) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("Failed to create parent dir {:?}", parent))?;
    }
    fs::write(path, contents).with_context(|| format!("Failed to write file: {:?}", path))
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
