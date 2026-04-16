use gm_core::models::{
    ApiInput, Constraint, Group, Objective, Person, ProblemDefinition, RepeatEncounterParams,
    SolverConfiguration, SolverKind, SolverParams, StopConditions,
};
use std::collections::BTreeMap;
use std::collections::HashMap;
use std::env;
use std::fs;

#[derive(Debug, Clone)]
struct CellSummary {
    groups: usize,
    group_size: usize,
    upper_bound: usize,
    constructed_weeks: usize,
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let mut json_out: Option<String> = None;
    let mut idx = 1usize;
    while idx < args.len() {
        if args[idx] == "--json-out" {
            idx += 1;
            json_out = args.get(idx).cloned();
        }
        idx += 1;
    }

    let mut cells = Vec::new();
    let mut total_constructed_weeks = 0usize;
    let mut frontier_gap_sum = 0usize;
    let mut solved_cells = 0usize;
    let mut exact_frontier_cells = 0usize;
    let mut per_p_totals: BTreeMap<usize, usize> = BTreeMap::new();

    for groups in 2..=10 {
        for group_size in 2..=10 {
            let upper_bound = counting_bound(groups, group_size);
            let constructed_weeks = best_constructed_weeks(groups, group_size, upper_bound);
            total_constructed_weeks += constructed_weeks;
            frontier_gap_sum += upper_bound.saturating_sub(constructed_weeks);
            if constructed_weeks > 0 {
                solved_cells += 1;
            }
            if constructed_weeks == upper_bound {
                exact_frontier_cells += 1;
            }
            *per_p_totals.entry(group_size).or_default() += constructed_weeks;
            cells.push(CellSummary {
                groups,
                group_size,
                upper_bound,
                constructed_weeks,
            });
        }
    }

    println!("METRIC total_constructed_weeks={total_constructed_weeks}");
    println!("METRIC frontier_gap_sum={frontier_gap_sum}");
    println!("METRIC solved_cells={solved_cells}");
    println!("METRIC exact_frontier_cells={exact_frontier_cells}");
    println!("METRIC unsolved_cells={}", cells.len() - solved_cells);
    for (group_size, total) in per_p_totals {
        println!("METRIC p{}_constructed_weeks={}", group_size, total);
    }
    for cell in &cells {
        println!(
            "METRIC W_{}_{}={}",
            cell.groups, cell.group_size, cell.constructed_weeks
        );
    }

    if let Some(path) = json_out {
        let mut json = String::from("{\n  \"cells\": [\n");
        for (idx, cell) in cells.iter().enumerate() {
            let comma = if idx + 1 == cells.len() { "" } else { "," };
            json.push_str(&format!(
                "    {{\"g\": {}, \"p\": {}, \"upper_bound\": {}, \"constructed_weeks\": {}}}{}\n",
                cell.groups, cell.group_size, cell.upper_bound, cell.constructed_weeks, comma
            ));
        }
        json.push_str("  ]\n}\n");
        fs::write(path, json).expect("should write coverage matrix json");
    }
}

fn counting_bound(groups: usize, group_size: usize) -> usize {
    ((groups * group_size) - 1) / (group_size - 1)
}

fn best_constructed_weeks(groups: usize, group_size: usize, upper_bound: usize) -> usize {
    for weeks in (1..=upper_bound).rev() {
        let input = pure_sgp_input(groups, group_size, weeks);
        match gm_core::run_solver(&input) {
            Ok(result) if result.final_score.abs() < 1e-9 => return weeks,
            Ok(_) | Err(_) => {}
        }
    }
    0
}

fn pure_sgp_input(groups: usize, group_size: usize, weeks: usize) -> ApiInput {
    ApiInput {
        problem: ProblemDefinition {
            people: (0..(groups * group_size))
                .map(|idx| Person {
                    id: format!("p{idx}"),
                    attributes: HashMap::new(),
                    sessions: None,
                })
                .collect(),
            groups: (0..groups)
                .map(|idx| Group {
                    id: format!("g{idx}"),
                    size: group_size as u32,
                    session_sizes: None,
                })
                .collect(),
            num_sessions: weeks as u32,
        },
        initial_schedule: None,
        construction_seed_schedule: None,
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".into(),
            weight: 1.0,
        }],
        constraints: vec![Constraint::RepeatEncounter(RepeatEncounterParams {
            max_allowed_encounters: 1,
            penalty_function: "squared".into(),
            penalty_weight: 100.0,
        })],
        solver: SolverConfiguration {
            solver_type: SolverKind::Solver5.canonical_id().into(),
            stop_conditions: StopConditions {
                max_iterations: Some(1),
                time_limit_seconds: Some(1),
                no_improvement_iterations: None,
                stop_on_optimal_score: true,
            },
            solver_params: SolverParams::Solver5(gm_core::models::Solver5Params::default()),
            logging: Default::default(),
            telemetry: Default::default(),
            seed: Some(7),
            move_policy: None,
            allowed_sessions: None,
        },
    }
}
