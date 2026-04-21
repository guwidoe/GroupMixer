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
    visual_only: bool,
    constructed_weeks: Option<usize>,
    target_weeks: Option<usize>,
    upper_bound_weeks: Option<usize>,
    proven_optimal_weeks: Option<usize>,
    glyph_center_text: String,
    glyph_top_left_text: Option<String>,
    glyph_top_right_text: Option<String>,
    glyph_bottom_left_text: Option<String>,
    glyph_bottom_right_text: Option<String>,
    fill_basis_weeks: Option<usize>,
    fill_basis_kind: Option<String>,
    border_kind: String,
    target_kind: Option<String>,
    method_abbreviation: Option<String>,
    desired_method_abbreviation: Option<String>,
    target_basis: Option<String>,
    target_reference_keys: Vec<String>,
    upper_bound_basis: Option<String>,
    heuristic_target_weeks: Option<usize>,
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
    cells: Vec<CellSummary>,
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

    let resolver = CellResolver {
        target_matrix: &target_matrix,
        literature_targets: &supplementary_targets,
    };

    for groups in target_matrix.visual_bounds.g_min..=target_matrix.visual_bounds.g_max {
        for group_size in target_matrix.visual_bounds.p_min..=target_matrix.visual_bounds.p_max {
            let cell = resolver.resolve_cell(groups, group_size);
            let constructed_weeks = cell.constructed_weeks.unwrap_or(0);
            if let Some(upper_bound) = cell.upper_bound_weeks {
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
            }
            cells.push(cell);
        }
    }

    let supplementary_matrices = vec![
        build_supplementary_matrix(
            "Supplementary coverage: g=11..20, p=1..10",
            "Universal glyph grammar: center=W, top-left=O, top-right=T, bottom-left=U, bottom-right=M. In this region T comes from curated literature when available, U is always the counting upper bound, and the trivial p=1 column stays visual-only.",
            11,
            20,
            1,
            10,
            &resolver,
        ),
        build_supplementary_matrix(
            "Supplementary coverage: g=11..20, p=11..20",
            "Universal glyph grammar: center=W, top-left=O, top-right=T, bottom-left=U, bottom-right=M. In this region T comes from curated literature when available, U is always the counting upper bound, and blank T means no clean literature target has been curated yet.",
            11,
            20,
            11,
            20,
            &resolver,
        ),
    ];

    for matrix in &supplementary_matrices {
        for cell in &matrix.cells {
            if let (Some(upper_bound), Some(constructed_weeks)) =
                (cell.upper_bound_weeks, cell.constructed_weeks)
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
    println!(
        "METRIC unsolved_cells={}",
        benchmark_cell_count - solved_cells
    );
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

struct CellResolver<'a> {
    target_matrix: &'a gm_core::solver5::reporting::Solver5TargetMatrix,
    literature_targets: &'a SupplementaryLiteratureTargets,
}

impl CellResolver<'_> {
    fn resolve_cell(&self, groups: usize, group_size: usize) -> CellSummary {
        if is_visual_only_cell(groups, group_size) {
            return self.resolve_visual_only_cell(groups, group_size);
        }

        let upper_bound = counting_bound(groups, group_size);
        let target = self.resolve_target_info(groups, group_size, upper_bound);
        let heuristic_target_weeks = self
            .target_matrix
            .heuristic_target_weeks_for(groups, group_size);
        let proven_optimal_weeks = self
            .target_matrix
            .proven_optimal_weeks_for(groups, group_size);
        let optimality_lower_bound_weeks = self
            .target_matrix
            .optimality_lower_bound_weeks_for(groups, group_size);
        let (constructed_weeks, method_abbreviation, inspection) =
            best_constructed_summary(groups, group_size, upper_bound, self.target_matrix);
        let (family_label, operator_labels, quality_label) = inspection
            .map(|inspection| {
                (
                    Some(inspection.family_label),
                    inspection.operator_labels,
                    Some(inspection.quality_label),
                )
            })
            .unwrap_or((None, Vec::new(), None));

        build_cell_summary(
            groups,
            group_size,
            self.target_matrix.is_scored_cell(groups, group_size),
            false,
            Some(constructed_weeks),
            target.weeks,
            Some(upper_bound),
            proven_optimal_weeks,
            method_abbreviation,
            target.desired_method_abbreviation,
            target.kind,
            target.basis,
            target.reference_keys,
            Some(format!(
                "Counting upper bound: floor(({}*{} - 1)/({} - 1)) = {}",
                groups, group_size, group_size, upper_bound
            )),
            heuristic_target_weeks,
            optimality_lower_bound_weeks,
            family_label,
            operator_labels,
            quality_label,
            visual_note_for(groups, group_size),
            None,
        )
    }

    fn resolve_target_info(
        &self,
        groups: usize,
        group_size: usize,
        upper_bound: usize,
    ) -> TargetInfo {
        if let Some(cell) = self.target_matrix.target_for(groups, group_size) {
            let weeks = Some(match cell {
                MatrixCellTarget::Finite(value) => *value,
                MatrixCellTarget::Infinite => upper_bound,
            });
            let target_method_label = self.target_matrix.target_method_for(groups, group_size);
            let desired_method_abbreviation = target_method_label
                .and_then(|label| self.target_matrix.abbreviation_for(label))
                .map(str::to_string);
            let basis = target_method_label.map(|label| {
                let abbreviation = self.target_matrix.abbreviation_for(label).unwrap_or(label);
                format!("Roadmap target family: {abbreviation}")
            });
            return TargetInfo {
                weeks,
                desired_method_abbreviation,
                kind: Some("roadmap".into()),
                basis,
                reference_keys: canonical_reference_keys_for_label(target_method_label),
            };
        }

        let weeks = self.literature_targets.target_for(groups, group_size);
        let basis = self
            .literature_targets
            .basis_for(groups, group_size)
            .map(str::to_string);
        let reference_keys = if weeks.is_some() {
            vec!["mva2026".to_string()]
        } else {
            Vec::new()
        };
        TargetInfo {
            weeks,
            desired_method_abbreviation: None,
            kind: Some("literature".into()),
            basis,
            reference_keys,
        }
    }

    fn resolve_visual_only_cell(&self, groups: usize, group_size: usize) -> CellSummary {
        let display = if groups == 1 && group_size == 1 {
            MatrixCellTarget::Infinite.display_text()
        } else {
            "1".into()
        };
        build_cell_summary(
            groups,
            group_size,
            false,
            true,
            None,
            None,
            None,
            None,
            Some(
                self.target_matrix
                    .abbreviation_for("visual_only")
                    .unwrap_or("VIS")
                    .to_string(),
            ),
            None,
            None,
            None,
            Vec::new(),
            None,
            None,
            None,
            Some("visual_only".into()),
            Vec::new(),
            Some("visual_only".into()),
            visual_note_for(groups, group_size),
            Some(display),
        )
    }
}

struct TargetInfo {
    weeks: Option<usize>,
    desired_method_abbreviation: Option<String>,
    kind: Option<String>,
    basis: Option<String>,
    reference_keys: Vec<String>,
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

#[allow(clippy::too_many_arguments)]
fn build_cell_summary(
    groups: usize,
    group_size: usize,
    scored: bool,
    visual_only: bool,
    constructed_weeks: Option<usize>,
    target_weeks: Option<usize>,
    upper_bound_weeks: Option<usize>,
    proven_optimal_weeks: Option<usize>,
    method_abbreviation: Option<String>,
    desired_method_abbreviation: Option<String>,
    target_kind: Option<String>,
    target_basis: Option<String>,
    target_reference_keys: Vec<String>,
    upper_bound_basis: Option<String>,
    heuristic_target_weeks: Option<usize>,
    optimality_lower_bound_weeks: Option<usize>,
    family_label: Option<String>,
    operator_labels: Vec<String>,
    quality_label: Option<String>,
    visual_note: Option<String>,
    center_override: Option<String>,
) -> CellSummary {
    let effective_constructed_weeks = constructed_weeks.unwrap_or(0);
    let glyph_center_text = center_override.unwrap_or_else(|| {
        if effective_constructed_weeks == 0 {
            "·".into()
        } else {
            effective_constructed_weeks.to_string()
        }
    });
    let glyph_top_left_text = if visual_only {
        None
    } else {
        proven_optimal_weeks.map(|value| format!("O{value}"))
    };
    let glyph_top_right_text = if visual_only {
        None
    } else {
        target_weeks.map(|value| format!("T{value}"))
    };
    let glyph_bottom_left_text = if visual_only {
        None
    } else {
        upper_bound_weeks.map(|value| format!("U{value}"))
    };
    let fill_basis = if visual_only {
        (None, None)
    } else if let Some(target_weeks) = target_weeks {
        (Some(target_weeks), Some("target".to_string()))
    } else if let Some(upper_bound_weeks) = upper_bound_weeks {
        (Some(upper_bound_weeks), Some("upper_bound".to_string()))
    } else {
        (None, None)
    };
    let border_kind = if visual_only {
        "visual_only".to_string()
    } else if let Some(optimal_weeks) = proven_optimal_weeks {
        if effective_constructed_weeks >= optimal_weeks {
            "optimal_reached".to_string()
        } else {
            "optimal_known_unreached".to_string()
        }
    } else {
        "optimal_unknown".to_string()
    };

    let glyph_bottom_right_text = match (
        method_abbreviation.as_deref(),
        desired_method_abbreviation.as_deref(),
    ) {
        (Some(current), Some(desired)) if current != desired => {
            Some(format!("{current}→{desired}"))
        }
        (Some(current), _) => Some(current.to_string()),
        (None, Some(desired)) => Some(format!("?→{desired}")),
        (None, None) => None,
    };

    CellSummary {
        g: groups,
        p: group_size,
        scored,
        visual_only,
        constructed_weeks,
        target_weeks,
        upper_bound_weeks,
        proven_optimal_weeks,
        glyph_center_text,
        glyph_top_left_text,
        glyph_top_right_text,
        glyph_bottom_left_text,
        glyph_bottom_right_text,
        fill_basis_weeks: fill_basis.0,
        fill_basis_kind: fill_basis.1,
        border_kind,
        target_kind,
        method_abbreviation,
        desired_method_abbreviation,
        target_basis,
        target_reference_keys,
        upper_bound_basis,
        heuristic_target_weeks,
        optimality_lower_bound_weeks,
        family_label,
        operator_labels,
        quality_label,
        visual_note,
    }
}

fn build_supplementary_matrix(
    title: &str,
    subtitle: &str,
    g_min: usize,
    g_max: usize,
    p_min: usize,
    p_max: usize,
    resolver: &CellResolver<'_>,
) -> SupplementaryMatrixArtifact {
    let mut cells = Vec::new();
    for groups in g_min..=g_max {
        for group_size in p_min..=p_max {
            cells.push(resolver.resolve_cell(groups, group_size));
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

fn is_visual_only_cell(groups: usize, group_size: usize) -> bool {
    groups == 1 || group_size == 1
}

fn visual_note_for(groups: usize, group_size: usize) -> Option<String> {
    if groups == 1 || group_size == 1 {
        Some("visual-only cell; excluded from objective".into())
    } else if groups >= 11 {
        Some("same global cell semantics; this matrix is another range view over the report universe".into())
    } else {
        None
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
