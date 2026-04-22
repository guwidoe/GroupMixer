use super::problem::PureSgpProblem;
use super::seed::mixed::{build_preferred_mixed_seed, MixedSeedSelection};
use super::seed::{
    validate_full_schedule_shape, ExactBlockSeed, ExactBlockSeedDiagnostics, SeedAtomUsage,
    SeedPairTelemetry, SeedRelabelingKind, SeedRelabelingSummary,
};
use crate::models::{
    ApiInput, Constraint, Group, Objective, Person, ProblemDefinition, RepeatEncounterParams,
    Solver6PairRepeatPenaltyModel, Solver6SeedCatalogMissPolicy, Solver6SeedCatalogParams,
    Solver6SeedStrategy, SolverConfiguration, SolverKind, SolverParams, StopConditions,
};
use crate::solver5::atoms::{query_construction_atom_from_solver6_input, Solver5AtomSpanRequest};
use crate::solver_support::SolverError;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

pub const SOLVER6_SEED_CATALOG_SCHEMA_VERSION: u32 = 1;
pub const SOLVER6_SEED_POLICY_VERSION: &str = "solver6_seed_policy_v1";
const DEFAULT_THRESHOLD_SECONDS: [f64; 3] = [0.1, 0.5, 1.0];

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, PartialEq, Eq)]
pub struct Solver6SeedCatalogCaseKey {
    pub num_groups: usize,
    pub group_size: usize,
    pub num_weeks: usize,
    pub seed_strategy: String,
    pub pair_repeat_penalty_model: String,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, PartialEq, Eq)]
pub struct Solver6SeedCatalogRelabelingSummary {
    pub kind: String,
    pub changed_people: usize,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, PartialEq, Eq)]
pub struct Solver6SeedCatalogAtomUsage {
    pub source_kind: String,
    pub family_label: String,
    pub max_supported_weeks: usize,
    pub quality_label: String,
    pub copy_index: usize,
    pub weeks_used: usize,
    pub week_range_start: usize,
    pub week_range_end_exclusive: usize,
    pub relabeling: Solver6SeedCatalogRelabelingSummary,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, PartialEq, Eq)]
pub struct Solver6SeedCatalogPairTelemetry {
    pub active_penalty_model: String,
    pub active_penalty_score: u64,
    pub linear_repeat_excess: u64,
    pub triangular_repeat_excess: u64,
    pub squared_repeat_excess: u64,
    pub distinct_pairs_covered: usize,
    pub max_pair_frequency: usize,
    pub total_pair_incidences: usize,
    pub linear_repeat_lower_bound: u64,
    pub linear_repeat_lower_bound_gap: u64,
    pub multiplicity_histogram: Vec<usize>,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, PartialEq, Eq)]
pub struct Solver6SeedCatalogDiagnostics {
    pub total_weeks: usize,
    pub atom_uses: Vec<Solver6SeedCatalogAtomUsage>,
    pub pair_telemetry: Solver6SeedCatalogPairTelemetry,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, PartialEq, Eq)]
pub struct Solver6SeedCatalogCandidateSummary {
    pub family: String,
    pub active_penalty_score: u64,
    pub linear_repeat_excess: u64,
    pub linear_repeat_lower_bound_gap: u64,
    pub squared_repeat_excess: u64,
    pub max_pair_frequency: usize,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, PartialEq, Eq)]
pub struct Solver6SeedCatalogProvenance {
    pub generated_by: String,
    pub seed_policy_version: String,
    pub generator_git_commit: Option<String>,
    pub effective_seed: u64,
    pub measured_seed_runtime_micros: u64,
    pub persistence_threshold_micros: u64,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, PartialEq, Eq)]
pub struct Solver6SeedCatalogEntry {
    pub schema_version: u32,
    pub key: Solver6SeedCatalogCaseKey,
    pub selected_family: String,
    pub dominant_atom_weeks: usize,
    pub remainder_weeks: usize,
    pub candidate_summaries: Vec<Solver6SeedCatalogCandidateSummary>,
    pub diagnostics: Solver6SeedCatalogDiagnostics,
    pub schedule: Vec<Vec<Vec<usize>>>,
    pub provenance: Solver6SeedCatalogProvenance,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, PartialEq, Eq)]
pub struct Solver6SeedCatalogManifestEntry {
    pub key: Solver6SeedCatalogCaseKey,
    pub selected_family: String,
    pub relative_entry_path: String,
    pub measured_seed_runtime_micros: u64,
    pub artifact_bytes: u64,
    pub estimated_exact_block_recipe_json_bytes: Option<u64>,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, PartialEq, Eq)]
pub struct Solver6SeedCatalogManifest {
    pub schema_version: u32,
    pub generated_by: String,
    pub seed_policy_version: String,
    pub configured_threshold_micros: u64,
    pub entries: Vec<Solver6SeedCatalogManifestEntry>,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, PartialEq)]
pub struct Solver6SeedCatalogThresholdBucketReport {
    pub threshold_seconds: f64,
    pub matching_case_count: usize,
    pub total_artifact_bytes: u64,
    pub recipe_estimate_case_count: usize,
    pub total_estimated_exact_block_recipe_json_bytes: u64,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, PartialEq)]
pub struct Solver6SeedCatalogThresholdReport {
    pub thresholds_seconds: Vec<f64>,
    pub buckets: Vec<Solver6SeedCatalogThresholdBucketReport>,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, PartialEq)]
pub struct Solver6SeedCatalogGenerationReport {
    pub scanned_case_count: usize,
    pub exact_handoff_case_count: usize,
    pub unsupported_seed_case_count: usize,
    pub seeded_case_count: usize,
    pub persisted_case_count: usize,
    pub chosen_threshold_seconds: f64,
    pub threshold_report: Solver6SeedCatalogThresholdReport,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Solver6CatalogSeedHit {
    pub manifest_path: PathBuf,
    pub entry_path: PathBuf,
    pub selected_family: String,
    pub diagnostics: Solver6SeedCatalogDiagnostics,
    pub(crate) seed: ExactBlockSeed,
    pub measured_seed_runtime_micros: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Solver6CatalogLookup {
    Hit(Solver6CatalogSeedHit),
    Miss { reason: String },
}

#[derive(Debug, Clone)]
pub struct Solver6SeedCatalogGenerationConfig {
    pub output_dir: PathBuf,
    pub max_groups: usize,
    pub max_group_size: usize,
    pub max_weeks: usize,
    pub threshold_seconds: f64,
    pub effective_seed: u64,
    pub pair_repeat_penalty_model: Solver6PairRepeatPenaltyModel,
    pub generator_git_commit: Option<String>,
}

impl Default for Solver6SeedCatalogGenerationConfig {
    fn default() -> Self {
        Self {
            output_dir: PathBuf::from("solver6-seed-catalog"),
            max_groups: 20,
            max_group_size: 20,
            max_weeks: 20,
            threshold_seconds: 0.1,
            effective_seed: 42,
            pair_repeat_penalty_model: Solver6PairRepeatPenaltyModel::LinearRepeatExcess,
            generator_git_commit: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct Solver6SeedCatalogGenerationSummary {
    pub manifest_path: PathBuf,
    pub report_path: PathBuf,
    pub manifest: Solver6SeedCatalogManifest,
    pub report: Solver6SeedCatalogGenerationReport,
}

#[derive(Debug, Clone)]
struct SeedGenerationObservation {
    manifest_entry: Solver6SeedCatalogManifestEntry,
    entry: Solver6SeedCatalogEntry,
}

pub fn synthesize_catalog_artifact_for_input(
    input: &ApiInput,
    threshold_seconds: f64,
    generator_git_commit: Option<String>,
) -> Result<(Solver6SeedCatalogManifestEntry, Solver6SeedCatalogEntry), SolverError> {
    let observation = synthesize_catalog_entry(input, threshold_seconds, generator_git_commit)?;
    Ok((observation.manifest_entry, observation.entry))
}

pub fn seed_policy_version() -> &'static str {
    SOLVER6_SEED_POLICY_VERSION
}

pub fn build_case_key(input: &ApiInput) -> Result<Solver6SeedCatalogCaseKey, SolverError> {
    let problem = PureSgpProblem::from_input(input)?;
    let params = solver6_params(input)?;
    Ok(Solver6SeedCatalogCaseKey {
        num_groups: problem.num_groups,
        group_size: problem.group_size,
        num_weeks: problem.num_weeks,
        seed_strategy: seed_strategy_label(params.seed_strategy).into(),
        pair_repeat_penalty_model: penalty_model_label(params.pair_repeat_penalty_model).into(),
    })
}

pub fn generate_catalog(
    config: &Solver6SeedCatalogGenerationConfig,
) -> Result<Solver6SeedCatalogGenerationSummary, SolverError> {
    if config.max_groups == 0 || config.max_group_size == 0 || config.max_weeks == 0 {
        return Err(SolverError::ValidationError(
            "solver6 seed catalog generation requires positive max_groups, max_group_size, and max_weeks"
                .into(),
        ));
    }
    if !(config.threshold_seconds.is_finite() && config.threshold_seconds >= 0.0) {
        return Err(SolverError::ValidationError(
            "solver6 seed catalog threshold_seconds must be finite and non-negative".into(),
        ));
    }

    fs::create_dir_all(config.output_dir.join("entries")).map_err(|error| {
        SolverError::ValidationError(format!(
            "solver6 seed catalog could not create output directory '{}': {error}",
            config.output_dir.display()
        ))
    })?;

    let mut scanned_case_count = 0usize;
    let mut exact_handoff_case_count = 0usize;
    let mut unsupported_seed_case_count = 0usize;
    let mut observations = Vec::new();

    for num_groups in 1..=config.max_groups {
        for group_size in 1..=config.max_group_size {
            for num_weeks in 1..=config.max_weeks {
                scanned_case_count += 1;
                let input = catalog_input(
                    num_groups,
                    group_size,
                    num_weeks,
                    config.effective_seed,
                    config.pair_repeat_penalty_model,
                );
                if query_construction_atom_from_solver6_input(
                    &input,
                    Solver5AtomSpanRequest::RequestedSpan,
                )
                .is_ok()
                {
                    exact_handoff_case_count += 1;
                    continue;
                }

                match synthesize_catalog_entry(
                    &input,
                    config.threshold_seconds,
                    config.generator_git_commit.clone(),
                ) {
                    Ok(observation) => observations.push(observation),
                    Err(_) => unsupported_seed_case_count += 1,
                }
            }
        }
    }

    let report = threshold_report_for_observations(
        &observations,
        config.threshold_seconds,
        scanned_case_count,
        exact_handoff_case_count,
        unsupported_seed_case_count,
    );
    let threshold_micros = seconds_to_micros(config.threshold_seconds)?;
    let persisted = observations
        .iter()
        .filter(|observation| {
            observation.manifest_entry.measured_seed_runtime_micros >= threshold_micros
        })
        .collect::<Vec<_>>();

    let mut manifest_entries = Vec::with_capacity(persisted.len());
    for observation in persisted {
        let entry_rel_path = PathBuf::from(&observation.manifest_entry.relative_entry_path);
        let entry_path = config.output_dir.join(&entry_rel_path);
        if let Some(parent) = entry_path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                SolverError::ValidationError(format!(
                    "solver6 seed catalog could not create entry directory '{}': {error}",
                    parent.display()
                ))
            })?;
        }
        let json = serde_json::to_string_pretty(&observation.entry).map_err(|error| {
            SolverError::ValidationError(format!(
                "solver6 seed catalog could not serialize entry for '{}': {error}",
                entry_path.display()
            ))
        })?;
        fs::write(&entry_path, json).map_err(|error| {
            SolverError::ValidationError(format!(
                "solver6 seed catalog could not write entry '{}': {error}",
                entry_path.display()
            ))
        })?;
        manifest_entries.push(observation.manifest_entry.clone());
    }

    manifest_entries
        .sort_by(|left, right| left.relative_entry_path.cmp(&right.relative_entry_path));
    let manifest = Solver6SeedCatalogManifest {
        schema_version: SOLVER6_SEED_CATALOG_SCHEMA_VERSION,
        generated_by: env!("CARGO_PKG_VERSION").into(),
        seed_policy_version: SOLVER6_SEED_POLICY_VERSION.into(),
        configured_threshold_micros: threshold_micros,
        entries: manifest_entries,
    };
    let manifest_path = config.output_dir.join("manifest.json");
    fs::write(
        &manifest_path,
        serde_json::to_string_pretty(&manifest).map_err(|error| {
            SolverError::ValidationError(format!(
                "solver6 seed catalog could not serialize manifest '{}': {error}",
                manifest_path.display()
            ))
        })?,
    )
    .map_err(|error| {
        SolverError::ValidationError(format!(
            "solver6 seed catalog could not write manifest '{}': {error}",
            manifest_path.display()
        ))
    })?;

    let report_path = config.output_dir.join("threshold-report.json");
    fs::write(
        &report_path,
        serde_json::to_string_pretty(&report).map_err(|error| {
            SolverError::ValidationError(format!(
                "solver6 seed catalog could not serialize threshold report '{}': {error}",
                report_path.display()
            ))
        })?,
    )
    .map_err(|error| {
        SolverError::ValidationError(format!(
            "solver6 seed catalog could not write threshold report '{}': {error}",
            report_path.display()
        ))
    })?;

    Ok(Solver6SeedCatalogGenerationSummary {
        manifest_path,
        report_path,
        manifest,
        report,
    })
}

pub(crate) fn lookup_catalog_seed(
    input: &ApiInput,
    params: &Solver6SeedCatalogParams,
) -> Result<Solver6CatalogLookup, SolverError> {
    let manifest_path = PathBuf::from(&params.manifest_path);
    let manifest = load_manifest(&manifest_path)?;
    let key = build_case_key(input)?;
    let Some(manifest_entry) = manifest.entries.iter().find(|entry| entry.key == key) else {
        return Ok(Solver6CatalogLookup::Miss {
            reason: format!(
                "solver6 seed catalog '{}' has no compatible entry for {}-{}-{} ({}, {})",
                manifest_path.display(),
                key.num_groups,
                key.group_size,
                key.num_weeks,
                key.seed_strategy,
                key.pair_repeat_penalty_model,
            ),
        });
    };

    let entry_path = manifest_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join(&manifest_entry.relative_entry_path);
    let entry = load_entry(&entry_path)?;
    validate_entry_against_manifest(&manifest, manifest_entry, &entry)?;
    validate_entry_for_input(input, &entry)?;

    let diagnostics = entry.diagnostics.clone();
    let seed = exact_block_seed_from_entry(&entry);
    Ok(Solver6CatalogLookup::Hit(Solver6CatalogSeedHit {
        manifest_path,
        entry_path,
        selected_family: entry.selected_family.clone(),
        diagnostics,
        measured_seed_runtime_micros: entry.provenance.measured_seed_runtime_micros,
        seed,
    }))
}

pub(crate) fn catalog_miss_error(
    catalog: &Solver6SeedCatalogParams,
    reason: &str,
) -> Result<(), SolverError> {
    match catalog.miss_policy {
        Solver6SeedCatalogMissPolicy::Error => Err(SolverError::ValidationError(format!(
            "solver6 seed catalog miss for '{}': {reason}",
            catalog.manifest_path
        ))),
        Solver6SeedCatalogMissPolicy::FallBackToLiveSeed => Ok(()),
    }
}

fn synthesize_catalog_entry(
    input: &ApiInput,
    threshold_seconds: f64,
    generator_git_commit: Option<String>,
) -> Result<SeedGenerationObservation, SolverError> {
    let key = build_case_key(input)?;
    let effective_seed = input.solver.seed.unwrap_or(42);
    let start = Instant::now();
    let selection = build_preferred_mixed_seed(input)?;
    let measured_seed_runtime_micros = start.elapsed().as_micros() as u64;
    let entry = entry_from_selection(
        &key,
        effective_seed,
        threshold_seconds,
        generator_git_commit,
        measured_seed_runtime_micros,
        &selection,
    )?;
    let artifact_bytes = serde_json::to_vec(&entry)
        .map_err(|error| {
            SolverError::ValidationError(format!(
                "solver6 seed catalog could not size entry for {}-{}-{}: {error}",
                key.num_groups, key.group_size, key.num_weeks
            ))
        })?
        .len() as u64;
    Ok(SeedGenerationObservation {
        manifest_entry: Solver6SeedCatalogManifestEntry {
            key,
            selected_family: entry.selected_family.clone(),
            relative_entry_path: entry_relative_path(&entry),
            measured_seed_runtime_micros,
            artifact_bytes,
            estimated_exact_block_recipe_json_bytes: estimated_exact_block_recipe_json_bytes(
                &entry,
            ),
        },
        entry,
    })
}

fn entry_from_selection(
    key: &Solver6SeedCatalogCaseKey,
    effective_seed: u64,
    threshold_seconds: f64,
    generator_git_commit: Option<String>,
    measured_seed_runtime_micros: u64,
    selection: &MixedSeedSelection,
) -> Result<Solver6SeedCatalogEntry, SolverError> {
    let pair_telemetry = selection
        .seed
        .diagnostics
        .pair_telemetry
        .as_ref()
        .ok_or_else(|| {
            SolverError::ValidationError(
                "solver6 seed catalog requires pair telemetry on selected seeds".into(),
            )
        })?;
    Ok(Solver6SeedCatalogEntry {
        schema_version: SOLVER6_SEED_CATALOG_SCHEMA_VERSION,
        key: key.clone(),
        selected_family: selection.selected_family.label().into(),
        dominant_atom_weeks: selection.dominant_atom_weeks,
        remainder_weeks: selection.remainder_weeks,
        candidate_summaries: selection
            .candidates
            .iter()
            .map(|candidate| Solver6SeedCatalogCandidateSummary {
                family: candidate.family.label().into(),
                active_penalty_score: candidate.active_penalty_score,
                linear_repeat_excess: candidate.linear_repeat_excess,
                linear_repeat_lower_bound_gap: candidate.linear_repeat_lower_bound_gap,
                squared_repeat_excess: candidate.squared_repeat_excess,
                max_pair_frequency: candidate.max_pair_frequency,
            })
            .collect(),
        diagnostics: diagnostics_to_catalog(&selection.seed.diagnostics, pair_telemetry),
        schedule: selection.seed.schedule.clone(),
        provenance: Solver6SeedCatalogProvenance {
            generated_by: env!("CARGO_PKG_VERSION").into(),
            seed_policy_version: SOLVER6_SEED_POLICY_VERSION.into(),
            generator_git_commit,
            effective_seed,
            measured_seed_runtime_micros,
            persistence_threshold_micros: seconds_to_micros(threshold_seconds)?,
        },
    })
}

fn diagnostics_to_catalog(
    diagnostics: &ExactBlockSeedDiagnostics,
    pair_telemetry: &SeedPairTelemetry,
) -> Solver6SeedCatalogDiagnostics {
    Solver6SeedCatalogDiagnostics {
        total_weeks: diagnostics.total_weeks,
        atom_uses: diagnostics
            .atom_uses
            .iter()
            .map(atom_usage_to_catalog)
            .collect(),
        pair_telemetry: pair_telemetry_to_catalog(pair_telemetry),
    }
}

fn atom_usage_to_catalog(usage: &SeedAtomUsage) -> Solver6SeedCatalogAtomUsage {
    Solver6SeedCatalogAtomUsage {
        source_kind: format!("{:?}", usage.atom_id.source_kind).to_ascii_lowercase(),
        family_label: usage.atom_id.family_label.clone(),
        max_supported_weeks: usage.atom_id.max_supported_weeks,
        quality_label: usage.atom_id.quality_label.clone(),
        copy_index: usage.copy_index,
        weeks_used: usage.weeks_used,
        week_range_start: usage.week_range_start,
        week_range_end_exclusive: usage.week_range_end_exclusive,
        relabeling: relabeling_to_catalog(&usage.relabeling),
    }
}

fn relabeling_to_catalog(summary: &SeedRelabelingSummary) -> Solver6SeedCatalogRelabelingSummary {
    Solver6SeedCatalogRelabelingSummary {
        kind: relabeling_kind_label(summary.kind).into(),
        changed_people: summary.changed_people,
    }
}

fn pair_telemetry_to_catalog(telemetry: &SeedPairTelemetry) -> Solver6SeedCatalogPairTelemetry {
    Solver6SeedCatalogPairTelemetry {
        active_penalty_model: penalty_model_label(telemetry.active_penalty_model).into(),
        active_penalty_score: telemetry.active_penalty_score,
        linear_repeat_excess: telemetry.linear_repeat_excess,
        triangular_repeat_excess: telemetry.triangular_repeat_excess,
        squared_repeat_excess: telemetry.squared_repeat_excess,
        distinct_pairs_covered: telemetry.distinct_pairs_covered,
        max_pair_frequency: telemetry.max_pair_frequency,
        total_pair_incidences: telemetry.total_pair_incidences,
        linear_repeat_lower_bound: telemetry.linear_repeat_lower_bound,
        linear_repeat_lower_bound_gap: telemetry.linear_repeat_lower_bound_gap,
        multiplicity_histogram: telemetry.multiplicity_histogram.clone(),
    }
}

fn exact_block_seed_from_entry(entry: &Solver6SeedCatalogEntry) -> ExactBlockSeed {
    ExactBlockSeed {
        schedule: entry.schedule.clone(),
        diagnostics: ExactBlockSeedDiagnostics {
            total_weeks: entry.diagnostics.total_weeks,
            atom_uses: entry
                .diagnostics
                .atom_uses
                .iter()
                .map(atom_usage_from_catalog)
                .collect(),
            pair_telemetry: Some(pair_telemetry_from_catalog(
                &entry.diagnostics.pair_telemetry,
            )),
        },
    }
}

fn atom_usage_from_catalog(usage: &Solver6SeedCatalogAtomUsage) -> SeedAtomUsage {
    SeedAtomUsage::new(
        super::seed::SeedAtomId {
            source_kind: if usage.source_kind == "heuristictail"
                || usage.source_kind == "heuristic_tail"
            {
                super::seed::SeedSourceKind::HeuristicTail
            } else {
                super::seed::SeedSourceKind::Solver5ConstructionAtom
            },
            family_label: usage.family_label.clone(),
            max_supported_weeks: usage.max_supported_weeks,
            quality_label: usage.quality_label.clone(),
        },
        usage.copy_index,
        usage.weeks_used,
        usage.week_range_start,
        usage.week_range_end_exclusive,
        SeedRelabelingSummary {
            kind: if usage.relabeling.kind == relabeling_kind_label(SeedRelabelingKind::Identity) {
                SeedRelabelingKind::Identity
            } else {
                SeedRelabelingKind::ExplicitPermutation
            },
            changed_people: usage.relabeling.changed_people,
        },
    )
}

fn pair_telemetry_from_catalog(telemetry: &Solver6SeedCatalogPairTelemetry) -> SeedPairTelemetry {
    SeedPairTelemetry {
        active_penalty_model: penalty_model_from_label(&telemetry.active_penalty_model),
        active_penalty_score: telemetry.active_penalty_score,
        linear_repeat_excess: telemetry.linear_repeat_excess,
        triangular_repeat_excess: telemetry.triangular_repeat_excess,
        squared_repeat_excess: telemetry.squared_repeat_excess,
        distinct_pairs_covered: telemetry.distinct_pairs_covered,
        max_pair_frequency: telemetry.max_pair_frequency,
        total_pair_incidences: telemetry.total_pair_incidences,
        linear_repeat_lower_bound: telemetry.linear_repeat_lower_bound,
        linear_repeat_lower_bound_gap: telemetry.linear_repeat_lower_bound_gap,
        multiplicity_histogram: telemetry.multiplicity_histogram.clone(),
    }
}

fn entry_relative_path(entry: &Solver6SeedCatalogEntry) -> String {
    format!(
        "entries/g{:02}_p{:02}_w{:02}_{}_{}.json",
        entry.key.num_groups,
        entry.key.group_size,
        entry.key.num_weeks,
        entry.key.pair_repeat_penalty_model,
        entry.selected_family,
    )
}

fn estimated_exact_block_recipe_json_bytes(entry: &Solver6SeedCatalogEntry) -> Option<u64> {
    if entry.selected_family != "exact_block_only" {
        return None;
    }
    let num_people = entry.key.num_groups * entry.key.group_size;
    let copy_count = entry.diagnostics.atom_uses.len();
    let recipe_preview = serde_json::json!({
        "atom_weeks": entry.dominant_atom_weeks,
        "copy_permutations": vec![vec![0usize; num_people]; copy_count],
    });
    serde_json::to_vec(&recipe_preview)
        .ok()
        .map(|bytes| bytes.len() as u64)
}

fn threshold_report_for_observations(
    observations: &[SeedGenerationObservation],
    chosen_threshold_seconds: f64,
    scanned_case_count: usize,
    exact_handoff_case_count: usize,
    unsupported_seed_case_count: usize,
) -> Solver6SeedCatalogGenerationReport {
    let thresholds = DEFAULT_THRESHOLD_SECONDS;
    let buckets = thresholds
        .iter()
        .map(|threshold_seconds| {
            let threshold_micros = seconds_to_micros(*threshold_seconds).unwrap_or(0);
            let matching = observations
                .iter()
                .filter(|observation| {
                    observation.manifest_entry.measured_seed_runtime_micros >= threshold_micros
                })
                .collect::<Vec<_>>();
            Solver6SeedCatalogThresholdBucketReport {
                threshold_seconds: *threshold_seconds,
                matching_case_count: matching.len(),
                total_artifact_bytes: matching
                    .iter()
                    .map(|observation| observation.manifest_entry.artifact_bytes)
                    .sum(),
                recipe_estimate_case_count: matching
                    .iter()
                    .filter(|observation| {
                        observation
                            .manifest_entry
                            .estimated_exact_block_recipe_json_bytes
                            .is_some()
                    })
                    .count(),
                total_estimated_exact_block_recipe_json_bytes: matching
                    .iter()
                    .filter_map(|observation| {
                        observation
                            .manifest_entry
                            .estimated_exact_block_recipe_json_bytes
                    })
                    .sum(),
            }
        })
        .collect();

    Solver6SeedCatalogGenerationReport {
        scanned_case_count,
        exact_handoff_case_count,
        unsupported_seed_case_count,
        seeded_case_count: observations.len(),
        persisted_case_count: observations
            .iter()
            .filter(|observation| {
                observation.manifest_entry.measured_seed_runtime_micros
                    >= seconds_to_micros(chosen_threshold_seconds).unwrap_or(0)
            })
            .count(),
        chosen_threshold_seconds,
        threshold_report: Solver6SeedCatalogThresholdReport {
            thresholds_seconds: thresholds.to_vec(),
            buckets,
        },
    }
}

fn load_manifest(path: &Path) -> Result<Solver6SeedCatalogManifest, SolverError> {
    let bytes = fs::read(path).map_err(|error| {
        SolverError::ValidationError(format!(
            "solver6 seed catalog could not read manifest '{}': {error}",
            path.display()
        ))
    })?;
    let manifest: Solver6SeedCatalogManifest = serde_json::from_slice(&bytes).map_err(|error| {
        SolverError::ValidationError(format!(
            "solver6 seed catalog could not parse manifest '{}': {error}",
            path.display()
        ))
    })?;
    if manifest.schema_version != SOLVER6_SEED_CATALOG_SCHEMA_VERSION {
        return Err(SolverError::ValidationError(format!(
            "solver6 seed catalog manifest '{}' has schema_version {}, expected {}",
            path.display(),
            manifest.schema_version,
            SOLVER6_SEED_CATALOG_SCHEMA_VERSION,
        )));
    }
    if manifest.seed_policy_version != SOLVER6_SEED_POLICY_VERSION {
        return Err(SolverError::ValidationError(format!(
            "solver6 seed catalog manifest '{}' has seed_policy_version '{}', expected '{}'",
            path.display(),
            manifest.seed_policy_version,
            SOLVER6_SEED_POLICY_VERSION,
        )));
    }
    Ok(manifest)
}

fn load_entry(path: &Path) -> Result<Solver6SeedCatalogEntry, SolverError> {
    let bytes = fs::read(path).map_err(|error| {
        SolverError::ValidationError(format!(
            "solver6 seed catalog could not read entry '{}': {error}",
            path.display()
        ))
    })?;
    let entry: Solver6SeedCatalogEntry = serde_json::from_slice(&bytes).map_err(|error| {
        SolverError::ValidationError(format!(
            "solver6 seed catalog could not parse entry '{}': {error}",
            path.display()
        ))
    })?;
    if entry.schema_version != SOLVER6_SEED_CATALOG_SCHEMA_VERSION {
        return Err(SolverError::ValidationError(format!(
            "solver6 seed catalog entry '{}' has schema_version {}, expected {}",
            path.display(),
            entry.schema_version,
            SOLVER6_SEED_CATALOG_SCHEMA_VERSION,
        )));
    }
    if entry.provenance.seed_policy_version != SOLVER6_SEED_POLICY_VERSION {
        return Err(SolverError::ValidationError(format!(
            "solver6 seed catalog entry '{}' has seed_policy_version '{}', expected '{}'",
            path.display(),
            entry.provenance.seed_policy_version,
            SOLVER6_SEED_POLICY_VERSION,
        )));
    }
    Ok(entry)
}

fn validate_entry_against_manifest(
    manifest: &Solver6SeedCatalogManifest,
    manifest_entry: &Solver6SeedCatalogManifestEntry,
    entry: &Solver6SeedCatalogEntry,
) -> Result<(), SolverError> {
    if manifest_entry.key != entry.key {
        return Err(SolverError::ValidationError(
            "solver6 seed catalog manifest entry key does not match artifact key".into(),
        ));
    }
    if manifest_entry.selected_family != entry.selected_family {
        return Err(SolverError::ValidationError(
            "solver6 seed catalog manifest entry family does not match artifact family".into(),
        ));
    }
    if manifest.seed_policy_version != entry.provenance.seed_policy_version {
        return Err(SolverError::ValidationError(
            "solver6 seed catalog manifest and artifact disagree on seed policy version".into(),
        ));
    }
    Ok(())
}

fn validate_entry_for_input(
    input: &ApiInput,
    entry: &Solver6SeedCatalogEntry,
) -> Result<(), SolverError> {
    let problem = PureSgpProblem::from_input(input)?;
    validate_full_schedule_shape(&problem, &entry.schedule)?;
    let params = solver6_params(input)?;
    let recomputed = SeedPairTelemetry::from_schedule(
        &problem,
        &entry.schedule,
        params.pair_repeat_penalty_model,
    )?;
    let recomputed_catalog = pair_telemetry_to_catalog(&recomputed);
    if recomputed_catalog != entry.diagnostics.pair_telemetry {
        return Err(SolverError::ValidationError(
            "solver6 seed catalog artifact telemetry does not match the stored schedule".into(),
        ));
    }
    Ok(())
}

fn solver6_params(input: &ApiInput) -> Result<&crate::models::Solver6Params, SolverError> {
    match &input.solver.solver_params {
        SolverParams::Solver6(params) => Ok(params),
        _ => Err(SolverError::ValidationError(
            "solver6 seed catalog requires solver6 params".into(),
        )),
    }
}

fn seconds_to_micros(seconds: f64) -> Result<u64, SolverError> {
    if !(seconds.is_finite() && seconds >= 0.0) {
        return Err(SolverError::ValidationError(
            "solver6 seed catalog seconds value must be finite and non-negative".into(),
        ));
    }
    Ok((seconds * 1_000_000.0).round() as u64)
}

fn penalty_model_label(model: Solver6PairRepeatPenaltyModel) -> &'static str {
    match model {
        Solver6PairRepeatPenaltyModel::LinearRepeatExcess => "linear_repeat_excess",
        Solver6PairRepeatPenaltyModel::TriangularRepeatExcess => "triangular_repeat_excess",
        Solver6PairRepeatPenaltyModel::SquaredRepeatExcess => "squared_repeat_excess",
    }
}

fn penalty_model_from_label(label: &str) -> Solver6PairRepeatPenaltyModel {
    match label {
        "triangular_repeat_excess" => Solver6PairRepeatPenaltyModel::TriangularRepeatExcess,
        "squared_repeat_excess" => Solver6PairRepeatPenaltyModel::SquaredRepeatExcess,
        _ => Solver6PairRepeatPenaltyModel::LinearRepeatExcess,
    }
}

fn seed_strategy_label(strategy: Solver6SeedStrategy) -> &'static str {
    match strategy {
        Solver6SeedStrategy::Solver5ExactThenReservedHybrid => "solver5_exact_then_reserved_hybrid",
        Solver6SeedStrategy::Solver5ExactBlockComposition => "solver5_exact_block_composition",
    }
}

fn relabeling_kind_label(kind: SeedRelabelingKind) -> &'static str {
    match kind {
        SeedRelabelingKind::Identity => "identity",
        SeedRelabelingKind::ExplicitPermutation => "explicit_permutation",
    }
}

fn catalog_input(
    num_groups: usize,
    group_size: usize,
    num_weeks: usize,
    effective_seed: u64,
    pair_repeat_penalty_model: Solver6PairRepeatPenaltyModel,
) -> ApiInput {
    let num_people = num_groups * group_size;
    ApiInput {
        problem: ProblemDefinition {
            people: (0..num_people)
                .map(|idx| Person {
                    id: format!("p{idx}"),
                    attributes: HashMap::new(),
                    sessions: None,
                })
                .collect(),
            groups: (0..num_groups)
                .map(|idx| Group {
                    id: format!("g{idx}"),
                    size: group_size as u32,
                    session_sizes: None,
                })
                .collect(),
            num_sessions: num_weeks as u32,
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
            solver_type: SolverKind::Solver6.canonical_id().into(),
            stop_conditions: StopConditions {
                max_iterations: Some(1_000_000),
                time_limit_seconds: Some(30),
                no_improvement_iterations: Some(100_000),
                stop_on_optimal_score: true,
            },
            solver_params: SolverParams::Solver6(crate::models::Solver6Params {
                exact_construction_handoff_enabled: false,
                seed_strategy: Solver6SeedStrategy::Solver5ExactBlockComposition,
                pair_repeat_penalty_model,
                search_strategy:
                    crate::models::Solver6SearchStrategy::DeterministicBestImprovingHillClimb,
                seed_catalog: None,
            }),
            logging: Default::default(),
            telemetry: Default::default(),
            seed: Some(effective_seed),
            move_policy: None,
            allowed_sessions: None,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn pure_input(groups: usize, group_size: usize, weeks: usize) -> ApiInput {
        catalog_input(
            groups,
            group_size,
            weeks,
            7,
            Solver6PairRepeatPenaltyModel::LinearRepeatExcess,
        )
    }

    #[test]
    fn case_key_matches_solver6_shape_and_penalty_model() {
        let input = pure_input(8, 4, 20);
        let key = build_case_key(&input).expect("case key should build");
        assert_eq!(key.num_groups, 8);
        assert_eq!(key.group_size, 4);
        assert_eq!(key.num_weeks, 20);
        assert_eq!(key.seed_strategy, "solver5_exact_block_composition");
        assert_eq!(key.pair_repeat_penalty_model, "linear_repeat_excess");
    }

    #[test]
    fn lookup_returns_explicit_miss_for_missing_manifest_entry() {
        let manifest_dir =
            std::env::temp_dir().join(format!("solver6-catalog-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&manifest_dir).expect("temp dir should exist");
        let manifest_path = manifest_dir.join("manifest.json");
        let manifest = Solver6SeedCatalogManifest {
            schema_version: SOLVER6_SEED_CATALOG_SCHEMA_VERSION,
            generated_by: "test".into(),
            seed_policy_version: SOLVER6_SEED_POLICY_VERSION.into(),
            configured_threshold_micros: 100_000,
            entries: Vec::new(),
        };
        fs::write(
            &manifest_path,
            serde_json::to_vec(&manifest).expect("manifest should serialize"),
        )
        .expect("manifest should write");

        let lookup = lookup_catalog_seed(
            &pure_input(8, 4, 20),
            &Solver6SeedCatalogParams {
                manifest_path: manifest_path.to_string_lossy().into_owned(),
                miss_policy: Solver6SeedCatalogMissPolicy::Error,
            },
        )
        .expect("lookup should succeed with an explicit miss");
        match lookup {
            Solver6CatalogLookup::Hit(_) => panic!("expected catalog miss"),
            Solver6CatalogLookup::Miss { reason } => {
                assert!(reason.contains("has no compatible entry"));
            }
        }
    }

    #[test]
    fn generated_entry_round_trips_through_manifest_validation() {
        let input = pure_input(8, 4, 20);
        let observation = synthesize_catalog_entry(&input, 0.1, Some("abc1234".into()))
            .expect("seed entry should synthesize");

        let manifest_dir = std::env::temp_dir().join(format!(
            "solver6-catalog-roundtrip-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(manifest_dir.join("entries")).expect("temp dir should exist");
        let entry_path = manifest_dir.join(&observation.manifest_entry.relative_entry_path);
        fs::create_dir_all(entry_path.parent().expect("entry parent"))
            .expect("entry parent should exist");
        fs::write(
            &entry_path,
            serde_json::to_vec(&observation.entry).expect("entry should serialize"),
        )
        .expect("entry should write");
        let manifest = Solver6SeedCatalogManifest {
            schema_version: SOLVER6_SEED_CATALOG_SCHEMA_VERSION,
            generated_by: "test".into(),
            seed_policy_version: SOLVER6_SEED_POLICY_VERSION.into(),
            configured_threshold_micros: 100_000,
            entries: vec![observation.manifest_entry.clone()],
        };
        let manifest_path = manifest_dir.join("manifest.json");
        fs::write(
            &manifest_path,
            serde_json::to_vec(&manifest).expect("manifest should serialize"),
        )
        .expect("manifest should write");

        let lookup = lookup_catalog_seed(
            &input,
            &Solver6SeedCatalogParams {
                manifest_path: manifest_path.to_string_lossy().into_owned(),
                miss_policy: Solver6SeedCatalogMissPolicy::Error,
            },
        )
        .expect("lookup should parse generated catalog");
        match lookup {
            Solver6CatalogLookup::Miss { reason } => panic!("expected hit, got miss: {reason}"),
            Solver6CatalogLookup::Hit(hit) => {
                assert_eq!(hit.seed.schedule.len(), 20);
                assert!(hit.measured_seed_runtime_micros > 0);
            }
        }
    }

    #[test]
    fn threshold_report_includes_the_user_requested_0_1_second_bucket() {
        let report = threshold_report_for_observations(&[], 0.1, 0, 0, 0);
        assert!(report.threshold_report.thresholds_seconds.contains(&0.1));
    }
}
