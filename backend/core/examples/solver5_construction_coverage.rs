use gm_core::models::{
    ApiInput, Constraint, Group, Objective, Person, ProblemDefinition, RepeatEncounterParams,
    SolverConfiguration, SolverKind, SolverParams, StopConditions,
};
use gm_core::solver5::reporting::{
    inspect_construction, load_default_target_matrix, MatrixCellTarget, Solver5ConstructionInspection,
};
use serde::Serialize;
use std::collections::BTreeMap;
use std::collections::HashMap;
use std::env;
use std::fs;

#[derive(Debug, Clone, Serialize)]
struct CellSummary {
    g: usize,
    p: usize,
    scored: bool,
    upper_bound: Option<usize>,
    constructed_weeks: Option<usize>,
    target_weeks: Option<usize>,
    gap_to_target: usize,
    current_display: String,
    target_display: String,
    method_abbreviation: Option<String>,
    target_method_abbreviation: Option<String>,
    heuristic_target_weeks: Option<usize>,
    heuristic_gap_to_target: Option<usize>,
    proven_optimal_weeks: Option<usize>,
    proven_optimal_gap: Option<usize>,
    family_label: Option<String>,
    operator_labels: Vec<String>,
    quality_label: Option<String>,
    visual_note: Option<String>,
}

#[derive(Debug, Serialize)]
struct MatrixArtifact<'a> {
    matrix_name: &'a str,
    matrix_version: u32,
    visual_bounds: BoundsArtifact,
    scored_bounds: BoundsArtifact,
    cells: Vec<CellSummary>,
}

#[derive(Debug, Serialize)]
struct BoundsArtifact {
    g_min: usize,
    g_max: usize,
    p_min: usize,
    p_max: usize,
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

    let target_matrix = load_default_target_matrix().expect("default target matrix should load");
    let mut cells = Vec::new();
    let mut total_constructed_weeks = 0usize;
    let mut frontier_gap_sum = 0usize;
    let mut solved_cells = 0usize;
    let mut exact_frontier_cells = 0usize;
    let mut per_p_totals: BTreeMap<usize, usize> = BTreeMap::new();

    for groups in target_matrix.visual_bounds.g_min..=target_matrix.visual_bounds.g_max {
        for group_size in target_matrix.visual_bounds.p_min..=target_matrix.visual_bounds.p_max {
            let target = target_matrix
                .target_for(groups, group_size)
                .expect("visual bounds should have target cell");
            let cell = if target_matrix.is_scored_cell(groups, group_size) {
                let upper_bound = counting_bound(groups, group_size);
                let target_weeks = match target {
                    MatrixCellTarget::Finite(value) => *value,
                    MatrixCellTarget::Infinite => upper_bound,
                };
                let scored_cell = best_constructed_scored_cell(
                    groups,
                    group_size,
                    upper_bound,
                    target_weeks,
                    &target_matrix,
                );
                let constructed_weeks = scored_cell.constructed_weeks.unwrap_or(0);
                total_constructed_weeks += constructed_weeks;
                frontier_gap_sum += upper_bound.saturating_sub(constructed_weeks);
                if constructed_weeks > 0 {
                    solved_cells += 1;
                }
                if constructed_weeks == upper_bound {
                    exact_frontier_cells += 1;
                }
                *per_p_totals.entry(group_size).or_default() += constructed_weeks;
                scored_cell
            } else {
                visual_only_cell(groups, group_size, target, &target_matrix)
            };
            cells.push(cell);
        }
    }

    println!("METRIC total_constructed_weeks={total_constructed_weeks}");
    println!("METRIC frontier_gap_sum={frontier_gap_sum}");
    println!("METRIC solved_cells={solved_cells}");
    println!("METRIC exact_frontier_cells={exact_frontier_cells}");
    println!(
        "METRIC unsolved_cells={}",
        ((target_matrix.scored_bounds.g_max - target_matrix.scored_bounds.g_min + 1)
            * (target_matrix.scored_bounds.p_max - target_matrix.scored_bounds.p_min + 1))
            - solved_cells
    );
    for (group_size, total) in per_p_totals {
        println!("METRIC p{}_constructed_weeks={}", group_size, total);
    }
    for cell in &cells {
        if let Some(constructed_weeks) = cell.constructed_weeks {
            println!("METRIC W_{}_{}={}", cell.g, cell.p, constructed_weeks);
        }
    }

    if let Some(path) = json_out {
        let artifact = MatrixArtifact {
            matrix_name: &target_matrix.name,
            matrix_version: target_matrix.version,
            visual_bounds: BoundsArtifact {
                g_min: target_matrix.visual_bounds.g_min,
                g_max: target_matrix.visual_bounds.g_max,
                p_min: target_matrix.visual_bounds.p_min,
                p_max: target_matrix.visual_bounds.p_max,
            },
            scored_bounds: BoundsArtifact {
                g_min: target_matrix.scored_bounds.g_min,
                g_max: target_matrix.scored_bounds.g_max,
                p_min: target_matrix.scored_bounds.p_min,
                p_max: target_matrix.scored_bounds.p_max,
            },
            cells,
        };
        let json = serde_json::to_string_pretty(&artifact)
            .expect("matrix artifact should serialize cleanly");
        fs::write(path, json).expect("should write coverage matrix json");
    }
}

fn counting_bound(groups: usize, group_size: usize) -> usize {
    ((groups * group_size) - 1) / (group_size - 1)
}

fn best_constructed_scored_cell(
    groups: usize,
    group_size: usize,
    upper_bound: usize,
    target_weeks: usize,
    target_matrix: &gm_core::solver5::reporting::Solver5TargetMatrix,
) -> CellSummary {
    for weeks in (1..=upper_bound).rev() {
        let input = pure_sgp_input(groups, group_size, weeks);
        match inspect_construction(&input) {
            Ok(inspection) if inspection.solved_canonically() => {
                let method_abbreviation = Some(target_matrix.compose_method_abbreviation(
                    &inspection.family_label,
                    &inspection.operator_labels,
                ));
                return summarize_scored_cell(
                    groups,
                    group_size,
                    upper_bound,
                    target_weeks,
                    weeks,
                    method_abbreviation,
                    target_matrix,
                    Some(inspection),
                );
            }
            Ok(_) | Err(_) => {}
        }
    }

    summarize_scored_cell(
        groups,
        group_size,
        upper_bound,
        target_weeks,
        0,
        None,
        target_matrix,
        None,
    )
}

fn summarize_scored_cell(
    groups: usize,
    group_size: usize,
    upper_bound: usize,
    target_weeks: usize,
    constructed_weeks: usize,
    method_abbreviation: Option<String>,
    target_matrix: &gm_core::solver5::reporting::Solver5TargetMatrix,
    inspection: Option<Solver5ConstructionInspection>,
) -> CellSummary {
    let gap_to_target = target_weeks.saturating_sub(constructed_weeks);
    let target_method_abbreviation = target_matrix
        .heuristic_target_method_for(groups, group_size)
        .and_then(|label| target_matrix.abbreviation_for(label))
        .map(str::to_string);
    let heuristic_target_weeks = target_matrix.heuristic_target_weeks_for(groups, group_size);
    let heuristic_gap_to_target = heuristic_target_weeks
        .map(|best_known| best_known.saturating_sub(target_weeks));
    let proven_optimal_weeks = target_matrix.proven_optimal_weeks_for(groups, group_size);
    let proven_optimal_gap = proven_optimal_weeks
        .map(|proven_optimal| proven_optimal.saturating_sub(target_weeks));
    let (family_label, operator_labels, quality_label) = inspection
        .map(|inspection| {
            (
                Some(inspection.family_label),
                inspection.operator_labels,
                Some(inspection.quality_label),
            )
        })
        .unwrap_or((None, Vec::new(), None));

    CellSummary {
        g: groups,
        p: group_size,
        scored: true,
        upper_bound: Some(upper_bound),
        constructed_weeks: Some(constructed_weeks),
        target_weeks: Some(target_weeks),
        gap_to_target,
        current_display: constructed_weeks.to_string(),
        target_display: target_weeks.to_string(),
        method_abbreviation,
        target_method_abbreviation,
        heuristic_target_weeks,
        heuristic_gap_to_target,
        proven_optimal_weeks,
        proven_optimal_gap,
        family_label,
        operator_labels,
        quality_label,
        visual_note: None,
    }
}

fn visual_only_cell(
    groups: usize,
    group_size: usize,
    target: &MatrixCellTarget,
    target_matrix: &gm_core::solver5::reporting::Solver5TargetMatrix,
) -> CellSummary {
    let display = target.display_text();
    CellSummary {
        g: groups,
        p: group_size,
        scored: false,
        upper_bound: None,
        constructed_weeks: None,
        target_weeks: None,
        gap_to_target: 0,
        current_display: display.clone(),
        target_display: display,
        method_abbreviation: Some(
            target_matrix
                .abbreviation_for("visual_only")
                .unwrap_or("VIS")
                .to_string(),
        ),
        target_method_abbreviation: None,
        heuristic_target_weeks: None,
        heuristic_gap_to_target: None,
        proven_optimal_weeks: None,
        proven_optimal_gap: None,
        family_label: Some("visual_only".into()),
        operator_labels: Vec::new(),
        quality_label: Some("visual_only".into()),
        visual_note: Some("visual-only cell; excluded from objective".into()),
    }
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
