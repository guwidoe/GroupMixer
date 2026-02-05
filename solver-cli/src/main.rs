//! solver-cli: Command-line interface for GroupMixer solver
//!
//! This CLI enables AI agents to test 100% of solver functionality
//! without requiring a web interface.
//!
//! # Commands
//!
//! - `solve`: Run the solver on a problem file
//! - `validate`: Validate a problem file without solving
//! - `recommend`: Get recommended solver settings for a problem
//! - `evaluate`: Evaluate an existing schedule
//! - `schema`: Print the JSON schema for input/output formats

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use solver_core::models::ApiInput;
use solver_core::{calculate_recommended_settings, run_solver};
use std::fs;
use std::io::{self, Read};
use std::path::PathBuf;

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

    /// Print example JSON schemas for input/output formats
    Schema {
        /// Which schema to print: input, output, problem, or all
        #[arg(value_name = "TYPE", default_value = "all")]
        schema_type: String,
    },
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

        Commands::Schema { schema_type } => cmd_schema(&schema_type),
    }
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

    // First, validate JSON syntax
    let api_input: ApiInput = serde_json::from_str(&json_str).context("JSON parse error")?;

    // Then, validate problem constraints by attempting to create state
    // This will catch issues like:
    // - Insufficient group capacity
    // - Invalid constraint references
    // - Duplicate IDs
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

    // Run solver with 0 iterations to just evaluate the initial schedule
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
