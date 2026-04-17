use gm_core::models::{
    ApiInput, Constraint, Group, Objective, Person, ProblemDefinition, RepeatEncounterParams,
    SolverConfiguration, SolverKind, SolverParams, StopConditions,
};
use gm_core::solver5::reporting::{
    inspect_construction, load_default_target_matrix, MatrixBounds, MatrixCellTarget,
    Solver5ConstructionInspection,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::collections::HashMap;
use std::env;
use std::fs;

const SUPPLEMENTARY_LITERATURE_TARGETS_JSON: &str =
    include_str!("../src/solver5/targets/solver5_supplementary_literature_targets.v1.json");

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
    target_basis: Option<String>,
    target_reference_keys: Vec<String>,
    heuristic_target_weeks: Option<usize>,
    heuristic_gap_to_target: Option<usize>,
    proven_optimal_weeks: Option<usize>,
    proven_optimal_gap: Option<usize>,
    optimality_lower_bound_weeks: Option<usize>,
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
    benchmark_regions: Vec<BenchmarkRegionArtifact>,
    cells: Vec<CellSummary>,
    supplementary_matrices: Vec<SupplementaryMatrixArtifact>,
    literature_references: Vec<LiteratureReferenceArtifact>,
}

#[derive(Debug, Serialize)]
struct BoundsArtifact {
    g_min: usize,
    g_max: usize,
    p_min: usize,
    p_max: usize,
}

#[derive(Debug, Serialize)]
struct BenchmarkRegionArtifact {
    title: String,
    bounds: BoundsArtifact,
}

#[derive(Debug, Serialize)]
struct SupplementaryMatrixArtifact {
    title: String,
    subtitle: String,
    bounds: BoundsArtifact,
    cells: Vec<SupplementaryCellSummary>,
}

#[derive(Debug, Serialize)]
struct SupplementaryCellSummary {
    g: usize,
    p: usize,
    upper_bound: Option<usize>,
    constructed_weeks: Option<usize>,
    literature_target_weeks: Option<usize>,
    current_display: String,
    upper_display: String,
    literature_target_display: Option<String>,
    method_abbreviation: Option<String>,
    family_label: Option<String>,
    operator_labels: Vec<String>,
    quality_label: Option<String>,
    literature_target_basis: Option<String>,
    literature_reference_keys: Vec<String>,
    visual_note: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct LiteratureReferenceArtifact {
    key: String,
    short_label: String,
    citation: String,
    url: String,
    notes: String,
}

#[derive(Debug, Deserialize)]
struct SupplementaryLiteratureTargetFile {
    version: u32,
    name: String,
    bounds: MatrixBounds,
    target_rows: Vec<Vec<Option<usize>>>,
    basis_rows: Vec<Vec<String>>,
}

#[derive(Debug)]
struct SupplementaryLiteratureTargets {
    bounds: MatrixBounds,
    target_rows: Vec<Vec<Option<usize>>>,
    basis_rows: Vec<Vec<String>>,
}

impl SupplementaryLiteratureTargets {
    fn target_for(&self, g: usize, p: usize) -> Option<usize> {
        let (row_idx, col_idx) = self.cell_indices(g, p)?;
        *self.target_rows.get(row_idx)?.get(col_idx)?
    }

    fn basis_for(&self, g: usize, p: usize) -> Option<&str> {
        let (row_idx, col_idx) = self.cell_indices(g, p)?;
        self.basis_rows
            .get(row_idx)?
            .get(col_idx)
            .map(String::as_str)
    }

    fn cell_indices(&self, g: usize, p: usize) -> Option<(usize, usize)> {
        if !self.bounds.contains(g, p) {
            return None;
        }
        Some((g - self.bounds.g_min, p - self.bounds.p_min))
    }
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
    let supplementary_targets = load_supplementary_literature_targets()
        .expect("supplementary literature targets should load");
    let literature_references = supplementary_literature_references();
    let benchmark_regions = vec![
        BenchmarkRegionArtifact {
            title: "Canonical benchmark region".into(),
            bounds: BoundsArtifact {
                g_min: target_matrix.scored_bounds.g_min,
                g_max: target_matrix.scored_bounds.g_max,
                p_min: target_matrix.scored_bounds.p_min,
                p_max: target_matrix.scored_bounds.p_max,
            },
        },
        BenchmarkRegionArtifact {
            title: "Additional benchmark region".into(),
            bounds: BoundsArtifact {
                g_min: 11,
                g_max: 20,
                p_min: 2,
                p_max: 10,
            },
        },
        BenchmarkRegionArtifact {
            title: "Additional benchmark region".into(),
            bounds: BoundsArtifact {
                g_min: 11,
                g_max: 20,
                p_min: 11,
                p_max: 20,
            },
        },
    ];
    let mut cells = Vec::new();
    let mut total_constructed_weeks = 0usize;
    let mut frontier_gap_sum = 0usize;
    let mut solved_cells = 0usize;
    let mut exact_frontier_cells = 0usize;
    let mut benchmark_cell_count = 0usize;
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
                accumulate_benchmark_metrics(
                    group_size,
                    upper_bound,
                    constructed_weeks,
                    &mut total_constructed_weeks,
                    &mut frontier_gap_sum,
                    &mut solved_cells,
                    &mut exact_frontier_cells,
                    &mut benchmark_cell_count,
                    &mut per_p_totals,
                );
                scored_cell
            } else {
                visual_only_cell(groups, group_size, target, &target_matrix)
            };
            cells.push(cell);
        }
    }

    let supplementary_matrices = vec![
        build_supplementary_matrix(
            "Supplementary coverage: g=11..20, p=1..10",
            "Additional benchmark region. Center = current constructed weeks, top-right = conservative literature target T when curated from the 2026 paper, bottom-left = counting upper bound U when a curated target exists, and bottom-right = achieving family. Fill grades against T when present, otherwise against U. Only the trivial p=1 column stays excluded from the objective.",
            11,
            20,
            1,
            10,
            &supplementary_targets,
            &target_matrix,
        ),
        build_supplementary_matrix(
            "Supplementary coverage: g=11..20, p=11..20",
            "Additional benchmark diagonal/high-p region. Center = current constructed weeks, top-right = conservative literature target T when curated from the 2026 paper, bottom-left = counting upper bound U when a curated target exists, and bottom-right = achieving family. Fill grades against T when present, otherwise against U. Blank T means no clean paper-derived target is curated yet for that cell, but the cell still counts in the benchmark via its current constructed weeks and counting upper bound.",
            11,
            20,
            11,
            20,
            &supplementary_targets,
            &target_matrix,
        ),
    ];

    for matrix in &supplementary_matrices {
        for cell in &matrix.cells {
            if let (Some(upper_bound), Some(constructed_weeks)) =
                (cell.upper_bound, cell.constructed_weeks)
            {
                accumulate_benchmark_metrics(
                    cell.p,
                    upper_bound,
                    constructed_weeks,
                    &mut total_constructed_weeks,
                    &mut frontier_gap_sum,
                    &mut solved_cells,
                    &mut exact_frontier_cells,
                    &mut benchmark_cell_count,
                    &mut per_p_totals,
                );
            }
        }
    }

    println!("METRIC total_constructed_weeks={total_constructed_weeks}");
    println!("METRIC frontier_gap_sum={frontier_gap_sum}");
    println!("METRIC solved_cells={solved_cells}");
    println!("METRIC exact_frontier_cells={exact_frontier_cells}");
    println!("METRIC unsolved_cells={}", benchmark_cell_count - solved_cells);
    for (group_size, total) in per_p_totals {
        println!("METRIC p{}_constructed_weeks={}", group_size, total);
    }
    for cell in &cells {
        if let Some(constructed_weeks) = cell.constructed_weeks {
            println!("METRIC W_{}_{}={}", cell.g, cell.p, constructed_weeks);
        }
    }
    for matrix in &supplementary_matrices {
        for cell in &matrix.cells {
            if let Some(constructed_weeks) = cell.constructed_weeks {
                println!("METRIC W_{}_{}={}", cell.g, cell.p, constructed_weeks);
            }
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
            benchmark_regions,
            cells,
            supplementary_matrices,
            literature_references,
        };
        let json = serde_json::to_string_pretty(&artifact)
            .expect("matrix artifact should serialize cleanly");
        fs::write(path, json).expect("should write coverage matrix json");
    }
}

#[allow(clippy::too_many_arguments)]
fn accumulate_benchmark_metrics(
    group_size: usize,
    upper_bound: usize,
    constructed_weeks: usize,
    total_constructed_weeks: &mut usize,
    frontier_gap_sum: &mut usize,
    solved_cells: &mut usize,
    exact_frontier_cells: &mut usize,
    benchmark_cell_count: &mut usize,
    per_p_totals: &mut BTreeMap<usize, usize>,
) {
    *benchmark_cell_count += 1;
    *total_constructed_weeks += constructed_weeks;
    *frontier_gap_sum += upper_bound.saturating_sub(constructed_weeks);
    if constructed_weeks > 0 {
        *solved_cells += 1;
    }
    if constructed_weeks == upper_bound {
        *exact_frontier_cells += 1;
    }
    *per_p_totals.entry(group_size).or_default() += constructed_weeks;
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
    let roadmap_target_method_label = target_matrix.target_method_for(groups, group_size);
    let target_method_abbreviation = target_matrix
        .heuristic_target_method_for(groups, group_size)
        .and_then(|label| target_matrix.abbreviation_for(label))
        .map(str::to_string);
    let target_basis = roadmap_target_method_label.map(|label| {
        let abbreviation = target_matrix.abbreviation_for(label).unwrap_or(label);
        format!("Roadmap target family: {abbreviation}")
    });
    let target_reference_keys = canonical_reference_keys_for_label(roadmap_target_method_label);
    let heuristic_target_weeks = target_matrix.heuristic_target_weeks_for(groups, group_size);
    let heuristic_gap_to_target =
        heuristic_target_weeks.map(|best_known| best_known.saturating_sub(target_weeks));
    let proven_optimal_weeks = target_matrix.proven_optimal_weeks_for(groups, group_size);
    let proven_optimal_gap =
        proven_optimal_weeks.map(|proven_optimal| proven_optimal.saturating_sub(target_weeks));
    let optimality_lower_bound_weeks =
        target_matrix.optimality_lower_bound_weeks_for(groups, group_size);
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
        target_basis,
        target_reference_keys,
        heuristic_target_weeks,
        heuristic_gap_to_target,
        proven_optimal_weeks,
        proven_optimal_gap,
        optimality_lower_bound_weeks,
        family_label,
        operator_labels,
        quality_label,
        visual_note: None,
    }
}

fn build_supplementary_matrix(
    title: &str,
    subtitle: &str,
    g_min: usize,
    g_max: usize,
    p_min: usize,
    p_max: usize,
    supplementary_targets: &SupplementaryLiteratureTargets,
    target_matrix: &gm_core::solver5::reporting::Solver5TargetMatrix,
) -> SupplementaryMatrixArtifact {
    let mut cells = Vec::new();
    for groups in g_min..=g_max {
        for group_size in p_min..=p_max {
            cells.push(build_supplementary_cell(
                groups,
                group_size,
                supplementary_targets,
                target_matrix,
            ));
        }
    }

    SupplementaryMatrixArtifact {
        title: title.into(),
        subtitle: subtitle.into(),
        bounds: BoundsArtifact {
            g_min,
            g_max,
            p_min,
            p_max,
        },
        cells,
    }
}

fn build_supplementary_cell(
    groups: usize,
    group_size: usize,
    supplementary_targets: &SupplementaryLiteratureTargets,
    target_matrix: &gm_core::solver5::reporting::Solver5TargetMatrix,
) -> SupplementaryCellSummary {
    let literature_target_weeks = supplementary_targets.target_for(groups, group_size);
    let literature_target_basis = supplementary_targets
        .basis_for(groups, group_size)
        .map(str::to_string);
    let literature_reference_keys = if literature_target_weeks.is_some() {
        vec!["mva2026".to_string()]
    } else {
        Vec::new()
    };
    if group_size == 1 {
        return SupplementaryCellSummary {
            g: groups,
            p: group_size,
            upper_bound: None,
            constructed_weeks: None,
            literature_target_weeks,
            current_display: "∞".into(),
            upper_display: "∞".into(),
            literature_target_display: None,
            method_abbreviation: Some(
                target_matrix
                    .abbreviation_for("visual_only")
                    .unwrap_or("VIS")
                    .to_string(),
            ),
            family_label: Some("visual_only".into()),
            operator_labels: Vec::new(),
            quality_label: Some("visual_only".into()),
            literature_target_basis,
            literature_reference_keys,
            visual_note: Some("trivial single-player groups; excluded from objective".into()),
        };
    }

    let upper_bound = counting_bound(groups, group_size);
    let (constructed_weeks, method_abbreviation, inspection) =
        best_constructed_summary(groups, group_size, upper_bound, target_matrix);
    let (family_label, operator_labels, quality_label) = inspection
        .map(|inspection| {
            (
                Some(inspection.family_label),
                inspection.operator_labels,
                Some(inspection.quality_label),
            )
        })
        .unwrap_or((None, Vec::new(), None));

    SupplementaryCellSummary {
        g: groups,
        p: group_size,
        upper_bound: Some(upper_bound),
        constructed_weeks: Some(constructed_weeks),
        literature_target_weeks,
        current_display: constructed_weeks.to_string(),
        upper_display: upper_bound.to_string(),
        literature_target_display: literature_target_weeks.map(|value| value.to_string()),
        method_abbreviation,
        family_label,
        operator_labels,
        quality_label,
        literature_target_basis,
        literature_reference_keys,
        visual_note: Some("report-only exploratory cell; excluded from objective".into()),
    }
}

fn supplementary_literature_references() -> Vec<LiteratureReferenceArtifact> {
    vec![LiteratureReferenceArtifact {
        key: "mva2026".into(),
        short_label: "[1]".into(),
        citation: "Miller, A.; Valkov, I.; Abel, R.J.R. (2026). Combinatorial solutions to the Social Golfer Problem and Social Golfer Problem with adjacent group sizes. arXiv:2507.23376.".into(),
        url: "https://arxiv.org/abs/2507.23376".into(),
        notes: "Used for the supplementary literature targets via Appendix B tables (including the additional v>150 examples), for canonical matrix family-backed roadmap targets, for Algorithm 1/2 family-selection rules, and for the paper's MOLS summary table.".into(),
    }]
}

fn canonical_reference_keys_for_label(label: Option<&str>) -> Vec<String> {
    match label {
        Some(
            "round_robin"
            | "kirkman_6t_plus_1"
            | "kts"
            | "nkts"
            | "ownsg"
            | "ritd"
            | "molr_group_fill"
            | "p4_router"
            | "transversal_design_prime_power"
            | "affine_plane_prime_power",
        ) => vec!["mva2026".to_string()],
        _ => Vec::new(),
    }
}

fn load_supplementary_literature_targets() -> Result<SupplementaryLiteratureTargets, String> {
    let file: SupplementaryLiteratureTargetFile =
        serde_json::from_str(SUPPLEMENTARY_LITERATURE_TARGETS_JSON).map_err(|error| {
            format!("failed to parse supplementary literature targets: {error}")
        })?;
    if file.version == 0 {
        return Err("supplementary literature target version must be positive".into());
    }
    let expected_height = file.bounds.height();
    let expected_width = file.bounds.width();
    if file.target_rows.len() != expected_height {
        return Err(format!(
            "supplementary literature target_rows height {} does not match bounds height {} for {}",
            file.target_rows.len(),
            expected_height,
            file.name
        ));
    }
    if file.basis_rows.len() != expected_height {
        return Err(format!(
            "supplementary literature basis_rows height {} does not match bounds height {} for {}",
            file.basis_rows.len(),
            expected_height,
            file.name
        ));
    }
    for (row_idx, row) in file.target_rows.iter().enumerate() {
        if row.len() != expected_width {
            return Err(format!(
                "supplementary literature target row {} width {} does not match bounds width {} for {}",
                row_idx + file.bounds.g_min,
                row.len(),
                expected_width,
                file.name
            ));
        }
    }
    for (row_idx, row) in file.basis_rows.iter().enumerate() {
        if row.len() != expected_width {
            return Err(format!(
                "supplementary literature basis row {} width {} does not match bounds width {} for {}",
                row_idx + file.bounds.g_min,
                row.len(),
                expected_width,
                file.name
            ));
        }
    }

    Ok(SupplementaryLiteratureTargets {
        bounds: file.bounds,
        target_rows: file.target_rows,
        basis_rows: file.basis_rows,
    })
}

fn best_constructed_summary(
    groups: usize,
    group_size: usize,
    upper_bound: usize,
    target_matrix: &gm_core::solver5::reporting::Solver5TargetMatrix,
) -> (usize, Option<String>, Option<Solver5ConstructionInspection>) {
    for weeks in (1..=upper_bound).rev() {
        let input = pure_sgp_input(groups, group_size, weeks);
        match inspect_construction(&input) {
            Ok(inspection) if inspection.solved_canonically() => {
                let method_abbreviation = Some(target_matrix.compose_method_abbreviation(
                    &inspection.family_label,
                    &inspection.operator_labels,
                ));
                return (weeks, method_abbreviation, Some(inspection));
            }
            Ok(_) | Err(_) => {}
        }
    }

    (0, None, None)
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
        target_basis: None,
        target_reference_keys: Vec::new(),
        heuristic_target_weeks: None,
        heuristic_gap_to_target: None,
        proven_optimal_weeks: None,
        proven_optimal_gap: None,
        optimality_lower_bound_weeks: None,
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
