use gm_core::models::Solver6PairRepeatPenaltyModel;
use gm_core::solver6::catalog::{generate_catalog, Solver6SeedCatalogGenerationConfig};
use std::env;
use std::path::PathBuf;

fn main() {
    if let Err(error) = run() {
        eprintln!("error: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let mut config = Solver6SeedCatalogGenerationConfig::default();
    let mut args = env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--output-dir" => {
                config.output_dir = PathBuf::from(next_value(&mut args, "--output-dir")?);
            }
            "--max-groups" => {
                config.max_groups =
                    parse_usize(&next_value(&mut args, "--max-groups")?, "--max-groups")?;
            }
            "--max-group-size" => {
                config.max_group_size = parse_usize(
                    &next_value(&mut args, "--max-group-size")?,
                    "--max-group-size",
                )?;
            }
            "--max-weeks" => {
                config.max_weeks =
                    parse_usize(&next_value(&mut args, "--max-weeks")?, "--max-weeks")?;
            }
            "--threshold-seconds" => {
                config.threshold_seconds = parse_f64(
                    &next_value(&mut args, "--threshold-seconds")?,
                    "--threshold-seconds",
                )?;
            }
            "--seed" => {
                config.effective_seed = parse_u64(&next_value(&mut args, "--seed")?, "--seed")?;
            }
            "--pair-repeat-penalty-model" => {
                config.pair_repeat_penalty_model =
                    parse_penalty_model(&next_value(&mut args, "--pair-repeat-penalty-model")?)?;
            }
            "--git-commit" => {
                config.generator_git_commit = Some(next_value(&mut args, "--git-commit")?);
            }
            "--help" | "-h" => {
                print_help();
                return Ok(());
            }
            other => {
                return Err(format!("unknown argument '{other}'"));
            }
        }
    }

    let summary = generate_catalog(&config).map_err(|error| error.to_string())?;
    println!("manifest={}", summary.manifest_path.display());
    println!("threshold_report={}", summary.report_path.display());
    println!("persisted_entries={}", summary.manifest.entries.len());
    println!("scanned_cases={}", summary.report.scanned_case_count);
    println!(
        "exact_handoff_cases={}",
        summary.report.exact_handoff_case_count
    );
    println!(
        "unsupported_seed_cases={}",
        summary.report.unsupported_seed_case_count
    );
    println!("seeded_cases={}", summary.report.seeded_case_count);
    println!(
        "chosen_threshold_seconds={}",
        summary.report.chosen_threshold_seconds
    );
    for bucket in &summary.report.threshold_report.buckets {
        println!(
            "threshold={} count={} bytes={} recipe_estimate_count={} recipe_estimate_bytes={}",
            bucket.threshold_seconds,
            bucket.matching_case_count,
            bucket.total_artifact_bytes,
            bucket.recipe_estimate_case_count,
            bucket.total_estimated_exact_block_recipe_json_bytes,
        );
    }
    Ok(())
}

fn next_value(args: &mut impl Iterator<Item = String>, flag: &str) -> Result<String, String> {
    args.next()
        .ok_or_else(|| format!("expected a value after {flag}"))
}

fn parse_usize(value: &str, flag: &str) -> Result<usize, String> {
    value
        .parse::<usize>()
        .map_err(|error| format!("invalid value for {flag}: {error}"))
}

fn parse_u64(value: &str, flag: &str) -> Result<u64, String> {
    value
        .parse::<u64>()
        .map_err(|error| format!("invalid value for {flag}: {error}"))
}

fn parse_f64(value: &str, flag: &str) -> Result<f64, String> {
    value
        .parse::<f64>()
        .map_err(|error| format!("invalid value for {flag}: {error}"))
}

fn parse_penalty_model(value: &str) -> Result<Solver6PairRepeatPenaltyModel, String> {
    match value {
        "linear_repeat_excess" => Ok(Solver6PairRepeatPenaltyModel::LinearRepeatExcess),
        "triangular_repeat_excess" => Ok(Solver6PairRepeatPenaltyModel::TriangularRepeatExcess),
        "squared_repeat_excess" => Ok(Solver6PairRepeatPenaltyModel::SquaredRepeatExcess),
        other => Err(format!(
            "unsupported --pair-repeat-penalty-model '{other}'; expected linear_repeat_excess, triangular_repeat_excess, or squared_repeat_excess"
        )),
    }
}

fn print_help() {
    println!(
        "solver6 seed catalog generator\n\n\
Usage:\n  cargo run -q -p gm-core --example solver6_seed_catalog -- [options]\n\n\
Options:\n  --output-dir <path>                  Output directory for manifest, entries, and threshold report\n  --max-groups <n>                     Maximum group count to scan (default: 20)\n  --max-group-size <n>                 Maximum group size to scan (default: 20)\n  --max-weeks <n>                      Maximum week count to scan (default: 20)\n  --threshold-seconds <seconds>        Persist only cases at or above this seed-build runtime (default: 0.1)\n  --seed <u64>                         Effective seed used for catalog generation (default: 42)\n  --pair-repeat-penalty-model <label>  linear_repeat_excess | triangular_repeat_excess | squared_repeat_excess\n  --git-commit <sha>                   Optional provenance tag stored in entries\n  --help                               Show this message\n"
    );
}
