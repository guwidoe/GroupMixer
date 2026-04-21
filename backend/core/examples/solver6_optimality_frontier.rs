use gm_core::solver6::reporting::{build_matrix_artifact, Solver6BenchmarkConfig};
use std::env;
use std::fs;

fn main() {
    let mut config = Solver6BenchmarkConfig::default();
    let mut json_out: Option<String> = None;

    let args: Vec<String> = env::args().collect();
    let mut idx = 1usize;
    while idx < args.len() {
        match args[idx].as_str() {
            "--json-out" => {
                idx += 1;
                json_out = args.get(idx).cloned();
            }
            "--week-cap" => {
                idx += 1;
                config.week_cap = args
                    .get(idx)
                    .expect("--week-cap requires a value")
                    .parse()
                    .expect("--week-cap must parse as usize");
            }
            "--max-people" => {
                idx += 1;
                config.max_people_to_run = args
                    .get(idx)
                    .expect("--max-people requires a value")
                    .parse()
                    .expect("--max-people must parse as usize");
            }
            "--seed" => {
                idx += 1;
                config.effective_seed = args
                    .get(idx)
                    .expect("--seed requires a value")
                    .parse()
                    .expect("--seed must parse as u64");
            }
            "--max-iterations" => {
                idx += 1;
                config.stop_conditions.max_iterations = Some(
                    args.get(idx)
                        .expect("--max-iterations requires a value")
                        .parse()
                        .expect("--max-iterations must parse as u64"),
                );
            }
            "--no-improvement" => {
                idx += 1;
                config.stop_conditions.no_improvement_iterations = Some(
                    args.get(idx)
                        .expect("--no-improvement requires a value")
                        .parse()
                        .expect("--no-improvement must parse as u64"),
                );
            }
            "--time-limit" => {
                idx += 1;
                config.stop_conditions.time_limit_seconds = Some(
                    args.get(idx)
                        .expect("--time-limit requires a value")
                        .parse()
                        .expect("--time-limit must parse as u64"),
                );
            }
            other => panic!("unknown arg: {other}"),
        }
        idx += 1;
    }

    let artifact = build_matrix_artifact(&config).expect("solver6 frontier artifact should build");

    let mut linear_frontier_sum = 0usize;
    let mut linear_best_observed_sum = 0usize;
    let mut squared_frontier_sum = 0usize;
    let mut exact_week_total = 0usize;
    let mut tight_week_total = 0usize;
    let mut benchmarked_cells = 0usize;
    for matrix in &artifact.matrices {
        for cell in &matrix.cells {
            if !cell.benchmark_eligible {
                continue;
            }
            benchmarked_cells += 1;
            linear_frontier_sum += cell.linear_summary.contiguous_frontier;
            linear_best_observed_sum += cell.linear_summary.best_observed_hit;
            squared_frontier_sum += cell.squared_summary.contiguous_frontier;
            exact_week_total += cell.linear_summary.exact_week_count;
            tight_week_total += cell.linear_summary.lower_bound_tight_week_count;
        }
    }

    println!("METRIC linear_frontier_sum={linear_frontier_sum}");
    println!("METRIC linear_best_observed_sum={linear_best_observed_sum}");
    println!("METRIC squared_frontier_sum={squared_frontier_sum}");
    println!("METRIC exact_week_total={exact_week_total}");
    println!("METRIC linear_tight_week_total={tight_week_total}");
    println!("METRIC benchmarked_cells={benchmarked_cells}");

    if let Some(path) = json_out {
        let json = serde_json::to_string_pretty(&artifact)
            .expect("solver6 frontier artifact should serialize cleanly");
        fs::write(path, json).expect("should write solver6 frontier json");
    }
}
