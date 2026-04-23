use super::handoff::{NoSearchHandoffPolicy, SearchHandoffDecision, SearchHandoffPolicy};
use super::heuristics::NoopHeuristicPipeline;
use super::problem::PureSgpProblem;
use super::result::build_solver_result;
use super::router::attempt_construction;
use super::types::ConstructionQuality;
use crate::models::{ApiInput, SolverParams};
use crate::solver_support::SolverError;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::error::Error;
use std::fmt::{Display, Formatter};

const DEFAULT_TARGET_MATRIX_JSON: &str = include_str!("targets/solver5_target_matrix.v1.json");
const DEFAULT_OPTIMALITY_LOWER_BOUNDS_JSON: &str =
    include_str!("targets/solver5_optimality_lower_bounds.v1.json");

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MatrixDefinitionError(String);

impl Display for MatrixDefinitionError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl Error for MatrixDefinitionError {}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct MatrixBounds {
    pub g_min: usize,
    pub g_max: usize,
    pub p_min: usize,
    pub p_max: usize,
}

impl MatrixBounds {
    pub fn contains(&self, g: usize, p: usize) -> bool {
        (self.g_min..=self.g_max).contains(&g) && (self.p_min..=self.p_max).contains(&p)
    }

    pub fn width(&self) -> usize {
        self.p_max - self.p_min + 1
    }

    pub fn height(&self) -> usize {
        self.g_max - self.g_min + 1
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MatrixCellTarget {
    Finite(usize),
    Infinite,
}

impl MatrixCellTarget {
    pub fn display_text(&self) -> String {
        match self {
            Self::Finite(value) => value.to_string(),
            Self::Infinite => "∞".into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Solver5TargetMatrix {
    pub version: u32,
    pub name: String,
    pub visual_bounds: MatrixBounds,
    pub scored_bounds: MatrixBounds,
    pub targets: Vec<Vec<MatrixCellTarget>>,
    pub target_methods: Vec<Vec<Option<String>>>,
    pub heuristic_target_weeks: Vec<Vec<Option<usize>>>,
    pub heuristic_target_methods: Vec<Vec<Option<String>>>,
    pub proven_optimal_weeks: Vec<Vec<Option<usize>>>,
    pub optimality_lower_bound_weeks: Vec<Vec<Option<usize>>>,
    pub family_abbreviations: BTreeMap<String, String>,
}

impl Solver5TargetMatrix {
    pub fn target_for(&self, g: usize, p: usize) -> Option<&MatrixCellTarget> {
        if !self.visual_bounds.contains(g, p) {
            return None;
        }
        let row_idx = g - self.visual_bounds.g_min;
        let col_idx = p - self.visual_bounds.p_min;
        self.targets.get(row_idx)?.get(col_idx)
    }

    pub fn is_scored_cell(&self, g: usize, p: usize) -> bool {
        self.scored_bounds.contains(g, p)
    }

    pub fn target_method_for(&self, g: usize, p: usize) -> Option<&str> {
        let (row_idx, col_idx) = self.cell_indices(g, p)?;
        self.target_methods.get(row_idx)?.get(col_idx)?.as_deref()
    }

    pub fn heuristic_target_weeks_for(&self, g: usize, p: usize) -> Option<usize> {
        let (row_idx, col_idx) = self.cell_indices(g, p)?;
        *self.heuristic_target_weeks.get(row_idx)?.get(col_idx)?
    }

    pub fn heuristic_target_method_for(&self, g: usize, p: usize) -> Option<&str> {
        let (row_idx, col_idx) = self.cell_indices(g, p)?;
        self.heuristic_target_methods
            .get(row_idx)?
            .get(col_idx)?
            .as_deref()
    }

    pub fn proven_optimal_weeks_for(&self, g: usize, p: usize) -> Option<usize> {
        let (row_idx, col_idx) = self.cell_indices(g, p)?;
        *self.proven_optimal_weeks.get(row_idx)?.get(col_idx)?
    }

    pub fn optimality_lower_bound_weeks_for(&self, g: usize, p: usize) -> Option<usize> {
        let (row_idx, col_idx) = self.cell_indices(g, p)?;
        *self
            .optimality_lower_bound_weeks
            .get(row_idx)?
            .get(col_idx)?
    }

    pub fn abbreviation_for(&self, label: &str) -> Option<&str> {
        self.family_abbreviations.get(label).map(String::as_str)
    }

    pub fn compose_method_abbreviation(
        &self,
        family_label: &str,
        operator_labels: &[String],
    ) -> String {
        let mut abbreviation = self
            .abbreviation_for(family_label)
            .unwrap_or_else(|| self.abbreviation_for("unknown").unwrap_or("?"))
            .to_string();
        for operator in operator_labels {
            abbreviation.push_str(
                self.abbreviation_for(operator)
                    .unwrap_or_else(|| self.abbreviation_for("unknown").unwrap_or("?")),
            );
        }
        abbreviation
    }

    fn cell_indices(&self, g: usize, p: usize) -> Option<(usize, usize)> {
        if !self.visual_bounds.contains(g, p) {
            return None;
        }
        Some((g - self.visual_bounds.g_min, p - self.visual_bounds.p_min))
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Solver5ConstructionInspection {
    pub requested_weeks: usize,
    pub max_supported_weeks: usize,
    pub final_score_millis: i64,
    pub family_label: String,
    pub operator_labels: Vec<String>,
    pub quality_label: String,
}

impl Solver5ConstructionInspection {
    pub fn solved_canonically(&self) -> bool {
        self.final_score_millis == 0
    }
}

pub fn inspect_construction(
    input: &ApiInput,
) -> Result<Solver5ConstructionInspection, SolverError> {
    let problem = PureSgpProblem::from_input(input)?;
    match &input.solver.solver_params {
        SolverParams::Solver5(_) => {}
        _ => {
            return Err(SolverError::ValidationError(
                "solver5 inspection expected solver5 params after solver selection validation"
                    .into(),
            ));
        }
    }

    let routing = attempt_construction(&problem).map_err(|failure| {
        SolverError::ValidationError(failure.to_solver_error_message(&problem))
    })?;
    let construction = NoopHeuristicPipeline.apply(&problem, routing.result);
    let construction = match NoSearchHandoffPolicy.decide(&problem, construction) {
        SearchHandoffDecision::ConstructionOnly { result, .. } => result,
        SearchHandoffDecision::SearchPreferred { .. } => {
            return Err(SolverError::ValidationError(
                "solver5 search handoff is not enabled; construction-only mode remains authoritative"
                    .into(),
            ));
        }
    };
    let solver_result = build_solver_result(
        input,
        &problem,
        &construction.schedule,
        input.solver.seed.unwrap_or(42),
    )?;

    Ok(Solver5ConstructionInspection {
        requested_weeks: problem.num_weeks,
        max_supported_weeks: construction.max_supported_weeks,
        final_score_millis: (solver_result.final_score * 1000.0).round() as i64,
        family_label: construction.family.label().to_string(),
        operator_labels: construction
            .provenance
            .operators
            .iter()
            .map(|operator| operator.label().to_string())
            .collect(),
        quality_label: quality_label(&construction.metadata.quality).to_string(),
    })
}

pub fn load_default_target_matrix() -> Result<Solver5TargetMatrix, MatrixDefinitionError> {
    let mut matrix = load_target_matrix_from_str(DEFAULT_TARGET_MATRIX_JSON)?;
    let lower_bounds = load_optimality_lower_bounds_from_str(DEFAULT_OPTIMALITY_LOWER_BOUNDS_JSON)?;
    if lower_bounds.visual_bounds != matrix.visual_bounds {
        return Err(MatrixDefinitionError(
            "solver5 optimality lower-bound bounds must match target matrix visual_bounds".into(),
        ));
    }
    matrix.optimality_lower_bound_weeks = lower_bounds.lower_bound_weeks;
    Ok(matrix)
}

pub fn load_target_matrix_from_str(
    raw: &str,
) -> Result<Solver5TargetMatrix, MatrixDefinitionError> {
    let file: RawTargetMatrixFile = serde_json::from_str(raw).map_err(|error| {
        MatrixDefinitionError(format!(
            "failed to parse solver5 target matrix definition: {error}"
        ))
    })?;
    file.validate_and_build()
}

#[derive(Debug, Clone, Deserialize)]
struct RawTargetMatrixFile {
    version: u32,
    name: String,
    visual_bounds: MatrixBounds,
    scored_bounds: MatrixBounds,
    target_rows: Vec<Vec<RawTargetCell>>,
    #[serde(default)]
    target_method_rows: Option<Vec<Vec<Option<String>>>>,
    #[serde(default)]
    heuristic_target_rows: Option<Vec<Vec<Option<RawTargetCell>>>>,
    #[serde(default)]
    heuristic_method_rows: Option<Vec<Vec<Option<String>>>>,
    #[serde(default)]
    proven_optimal_rows: Option<Vec<Vec<Option<RawTargetCell>>>>,
    family_abbreviations: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Deserialize)]
struct RawOptimalityLowerBoundsFile {
    version: u32,
    name: String,
    visual_bounds: MatrixBounds,
    lower_bound_rows: Vec<Vec<Option<RawTargetCell>>>,
}

impl RawTargetMatrixFile {
    fn validate_and_build(self) -> Result<Solver5TargetMatrix, MatrixDefinitionError> {
        if self.version == 0 {
            return Err(MatrixDefinitionError(
                "solver5 target matrix version must be positive".into(),
            ));
        }
        validate_bounds("visual_bounds", self.visual_bounds)?;
        validate_bounds("scored_bounds", self.scored_bounds)?;
        if self.scored_bounds.g_min < self.visual_bounds.g_min
            || self.scored_bounds.g_max > self.visual_bounds.g_max
            || self.scored_bounds.p_min < self.visual_bounds.p_min
            || self.scored_bounds.p_max > self.visual_bounds.p_max
        {
            return Err(MatrixDefinitionError(
                "scored_bounds must be fully contained within visual_bounds".into(),
            ));
        }
        if self.target_rows.len() != self.visual_bounds.height() {
            return Err(MatrixDefinitionError(format!(
                "target_rows height {} does not match visual_bounds height {}",
                self.target_rows.len(),
                self.visual_bounds.height()
            )));
        }

        let mut targets = Vec::with_capacity(self.target_rows.len());
        for (row_idx, row) in self.target_rows.into_iter().enumerate() {
            if row.len() != self.visual_bounds.width() {
                return Err(MatrixDefinitionError(format!(
                    "target row {} width {} does not match visual_bounds width {}",
                    row_idx + self.visual_bounds.g_min,
                    row.len(),
                    self.visual_bounds.width()
                )));
            }
            targets.push(
                row.into_iter()
                    .map(RawTargetCell::into_target)
                    .collect::<Result<Vec<_>, _>>()?,
            );
        }

        let target_methods = validate_optional_string_rows(
            self.target_method_rows,
            self.visual_bounds,
            "target_method_rows",
        )?
        .unwrap_or_else(|| blank_string_rows(self.visual_bounds));
        let heuristic_target_weeks = validate_optional_target_rows(
            self.heuristic_target_rows,
            self.visual_bounds,
            "heuristic_target_rows",
        )?
        .unwrap_or_else(|| derive_target_weeks_rows(&targets));
        let heuristic_target_methods = validate_optional_string_rows(
            self.heuristic_method_rows,
            self.visual_bounds,
            "heuristic_method_rows",
        )?
        .unwrap_or_else(|| target_methods.clone());
        let proven_optimal_weeks = validate_optional_target_rows(
            self.proven_optimal_rows,
            self.visual_bounds,
            "proven_optimal_rows",
        )?
        .unwrap_or_else(|| blank_target_rows(self.visual_bounds));

        let mut abbreviations_seen = BTreeSet::new();
        for (label, abbreviation) in &self.family_abbreviations {
            if label.trim().is_empty() {
                return Err(MatrixDefinitionError(
                    "family abbreviation labels must be non-empty".into(),
                ));
            }
            if abbreviation.trim().is_empty() {
                return Err(MatrixDefinitionError(format!(
                    "family abbreviation for '{label}' must be non-empty"
                )));
            }
            if !abbreviations_seen.insert(abbreviation.clone()) {
                return Err(MatrixDefinitionError(format!(
                    "family abbreviation '{abbreviation}' is duplicated"
                )));
            }
        }

        Ok(Solver5TargetMatrix {
            version: self.version,
            name: self.name,
            visual_bounds: self.visual_bounds,
            scored_bounds: self.scored_bounds,
            targets,
            target_methods,
            heuristic_target_weeks,
            heuristic_target_methods,
            proven_optimal_weeks,
            optimality_lower_bound_weeks: blank_target_rows(self.visual_bounds),
            family_abbreviations: self.family_abbreviations,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct OptimalityLowerBoundsMatrix {
    version: u32,
    name: String,
    visual_bounds: MatrixBounds,
    lower_bound_weeks: Vec<Vec<Option<usize>>>,
}

impl RawOptimalityLowerBoundsFile {
    fn validate_and_build(self) -> Result<OptimalityLowerBoundsMatrix, MatrixDefinitionError> {
        if self.version == 0 {
            return Err(MatrixDefinitionError(
                "solver5 optimality lower-bound matrix version must be positive".into(),
            ));
        }
        validate_bounds("visual_bounds", self.visual_bounds)?;
        let lower_bound_weeks = validate_optional_target_rows(
            Some(self.lower_bound_rows),
            self.visual_bounds,
            "lower_bound_rows",
        )?
        .unwrap_or_else(|| blank_target_rows(self.visual_bounds));
        Ok(OptimalityLowerBoundsMatrix {
            version: self.version,
            name: self.name,
            visual_bounds: self.visual_bounds,
            lower_bound_weeks,
        })
    }
}

fn load_optimality_lower_bounds_from_str(
    raw: &str,
) -> Result<OptimalityLowerBoundsMatrix, MatrixDefinitionError> {
    let file: RawOptimalityLowerBoundsFile = serde_json::from_str(raw).map_err(|error| {
        MatrixDefinitionError(format!(
            "failed to parse solver5 optimality lower-bound definition: {error}"
        ))
    })?;
    file.validate_and_build()
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
enum RawTargetCell {
    Finite(usize),
    Symbol(String),
}

impl RawTargetCell {
    fn into_target(self) -> Result<MatrixCellTarget, MatrixDefinitionError> {
        match self {
            Self::Finite(value) => Ok(MatrixCellTarget::Finite(value)),
            Self::Symbol(symbol) if symbol.eq_ignore_ascii_case("inf") => {
                Ok(MatrixCellTarget::Infinite)
            }
            Self::Symbol(symbol) => Err(MatrixDefinitionError(format!(
                "unsupported target cell symbol '{symbol}'; expected integer or 'inf'"
            ))),
        }
    }
}

fn validate_bounds(name: &str, bounds: MatrixBounds) -> Result<(), MatrixDefinitionError> {
    if bounds.g_min == 0 || bounds.p_min == 0 {
        return Err(MatrixDefinitionError(format!("{name} minima must be >= 1")));
    }
    if bounds.g_min > bounds.g_max || bounds.p_min > bounds.p_max {
        return Err(MatrixDefinitionError(format!(
            "{name} must have min <= max in both dimensions"
        )));
    }
    Ok(())
}

fn validate_optional_string_rows(
    rows: Option<Vec<Vec<Option<String>>>>,
    bounds: MatrixBounds,
    name: &str,
) -> Result<Option<Vec<Vec<Option<String>>>>, MatrixDefinitionError> {
    let Some(rows) = rows else {
        return Ok(None);
    };
    if rows.len() != bounds.height() {
        return Err(MatrixDefinitionError(format!(
            "{name} height {} does not match visual_bounds height {}",
            rows.len(),
            bounds.height()
        )));
    }
    for (row_idx, row) in rows.iter().enumerate() {
        if row.len() != bounds.width() {
            return Err(MatrixDefinitionError(format!(
                "{name} row {} width {} does not match visual_bounds width {}",
                row_idx + bounds.g_min,
                row.len(),
                bounds.width()
            )));
        }
    }
    Ok(Some(rows))
}

fn validate_optional_target_rows(
    rows: Option<Vec<Vec<Option<RawTargetCell>>>>,
    bounds: MatrixBounds,
    name: &str,
) -> Result<Option<Vec<Vec<Option<usize>>>>, MatrixDefinitionError> {
    let Some(rows) = rows else {
        return Ok(None);
    };
    if rows.len() != bounds.height() {
        return Err(MatrixDefinitionError(format!(
            "{name} height {} does not match visual_bounds height {}",
            rows.len(),
            bounds.height()
        )));
    }
    let mut parsed = Vec::with_capacity(rows.len());
    for (row_idx, row) in rows.into_iter().enumerate() {
        if row.len() != bounds.width() {
            return Err(MatrixDefinitionError(format!(
                "{name} row {} width {} does not match visual_bounds width {}",
                row_idx + bounds.g_min,
                row.len(),
                bounds.width()
            )));
        }
        parsed.push(
            row.into_iter()
                .map(|cell| match cell {
                    None => Ok(None),
                    Some(RawTargetCell::Finite(value)) => Ok(Some(value)),
                    Some(RawTargetCell::Symbol(symbol)) if symbol.eq_ignore_ascii_case("inf") => {
                        Ok(None)
                    }
                    Some(RawTargetCell::Symbol(symbol)) => Err(MatrixDefinitionError(format!(
                        "unsupported {name} cell symbol '{symbol}'; expected integer, null, or 'inf'"
                    ))),
                })
                .collect::<Result<Vec<_>, _>>()?,
        );
    }
    Ok(Some(parsed))
}

fn blank_string_rows(bounds: MatrixBounds) -> Vec<Vec<Option<String>>> {
    vec![vec![None; bounds.width()]; bounds.height()]
}

fn blank_target_rows(bounds: MatrixBounds) -> Vec<Vec<Option<usize>>> {
    vec![vec![None; bounds.width()]; bounds.height()]
}

fn derive_target_weeks_rows(targets: &[Vec<MatrixCellTarget>]) -> Vec<Vec<Option<usize>>> {
    targets
        .iter()
        .map(|row| {
            row.iter()
                .map(|cell| match cell {
                    MatrixCellTarget::Finite(value) => Some(*value),
                    MatrixCellTarget::Infinite => None,
                })
                .collect()
        })
        .collect()
}

fn quality_label(quality: &ConstructionQuality) -> &'static str {
    match quality {
        ConstructionQuality::ExactFrontier => "exact_frontier",
        ConstructionQuality::NearFrontier { .. } => "near_frontier",
        ConstructionQuality::LowerBound { .. } => "lower_bound",
    }
}
