use super::problem::PureSgpProblem;
use super::score::squared_repeat_excess_lower_bound_for_linear_excess;
use super::seed::{validate_full_schedule_shape, SeedPairTelemetry};
use crate::models::{Solver6CacheParams, Solver6CacheWritePolicy, Solver6PairRepeatPenaltyModel};
use crate::solver_support::SolverError;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::fs;
use std::path::{Path, PathBuf};

pub const SOLVER6_CACHE_SCHEMA_VERSION: u32 = 2;
pub const SOLVER6_CACHE_POLICY_VERSION: &str = "solver6_cache_policy_v1";

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, PartialEq, Eq)]
pub struct Solver6CacheCaseKey {
    pub cache_policy_version: String,
    pub num_groups: usize,
    pub group_size: usize,
    pub num_weeks: usize,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Solver6CacheIncumbentStatus {
    SearchTimedOut,
    LocallyOptimal,
    KnownOptimal,
}

impl Solver6CacheIncumbentStatus {
    pub(crate) fn is_complete(self) -> bool {
        matches!(self, Self::LocallyOptimal | Self::KnownOptimal)
    }

    fn completeness_rank(self) -> u8 {
        match self {
            Self::SearchTimedOut => 0,
            Self::LocallyOptimal => 1,
            Self::KnownOptimal => 2,
        }
    }
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, PartialEq, Eq)]
pub struct Solver6CacheMetrics {
    pub linear_repeat_excess: u64,
    pub triangular_repeat_excess: u64,
    pub squared_repeat_excess: u64,
    pub distinct_pairs_covered: usize,
    pub max_pair_frequency: usize,
    pub total_pair_incidences: usize,
    pub linear_repeat_lower_bound: u64,
    pub linear_repeat_lower_bound_gap: u64,
    /// Instance-level squared lower bound implied by the instance linear lower bound.
    pub squared_instance_lower_bound: u64,
    /// Gap from the instance-level squared lower bound; comparable across schedules.
    pub squared_instance_lower_bound_gap: u64,
    /// Conditional squared lower bound given this schedule's observed linear excess.
    pub squared_concentration_lower_bound: u64,
    /// Extra squared penalty from avoidable concentration beyond observed linear excess.
    pub squared_concentration_lower_bound_gap: u64,
    pub multiplicity_histogram: Vec<usize>,
}

impl Solver6CacheMetrics {
    pub(crate) fn quality_tuple(&self) -> (u64, u64, usize) {
        (
            self.linear_repeat_excess,
            self.squared_repeat_excess,
            self.max_pair_frequency,
        )
    }
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, PartialEq, Eq)]
pub struct Solver6CacheProvenance {
    pub generated_by: String,
    pub cache_policy_version: String,
    pub generator_git_commit: Option<String>,
    pub update_count: u64,
    pub last_seed_runtime_micros: Option<u64>,
    pub last_local_search_runtime_micros: Option<u64>,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone, PartialEq, Eq)]
pub struct Solver6CacheEntry {
    pub schema_version: u32,
    pub key: Solver6CacheCaseKey,
    pub status: Solver6CacheIncumbentStatus,
    pub metrics: Solver6CacheMetrics,
    pub schedule: Vec<Vec<Vec<usize>>>,
    pub provenance: Solver6CacheProvenance,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Solver6CacheHit {
    pub entry_path: PathBuf,
    pub entry: Solver6CacheEntry,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Solver6CacheLookup {
    Hit(Solver6CacheHit),
    Miss { reason: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Solver6CacheStoreOutcome {
    Disabled,
    Wrote {
        entry_path: PathBuf,
        entry: Solver6CacheEntry,
    },
    SkippedExistingBetterOrEqual {
        entry_path: PathBuf,
        existing: Solver6CacheEntry,
    },
}

pub fn cache_policy_version() -> &'static str {
    SOLVER6_CACHE_POLICY_VERSION
}

pub(super) fn build_case_key(problem: &PureSgpProblem) -> Solver6CacheCaseKey {
    Solver6CacheCaseKey {
        cache_policy_version: SOLVER6_CACHE_POLICY_VERSION.into(),
        num_groups: problem.num_groups,
        group_size: problem.group_size,
        num_weeks: problem.num_weeks,
    }
}

pub(super) fn lookup_cache_incumbent(
    params: &Solver6CacheParams,
    problem: &PureSgpProblem,
) -> Result<Solver6CacheLookup, SolverError> {
    let entry_path = entry_path(params, problem);
    if !entry_path.exists() {
        let key = build_case_key(problem);
        return Ok(Solver6CacheLookup::Miss {
            reason: format!(
                "solver6 cache '{}' has no incumbent for {}-{}-{} under policy '{}'",
                params.root_path,
                key.num_groups,
                key.group_size,
                key.num_weeks,
                key.cache_policy_version,
            ),
        });
    }

    let entry = load_entry(&entry_path)?;
    validate_entry_for_problem(problem, &entry)?;
    Ok(Solver6CacheLookup::Hit(Solver6CacheHit {
        entry_path,
        entry,
    }))
}

pub(super) fn store_cache_incumbent(
    params: &Solver6CacheParams,
    problem: &PureSgpProblem,
    schedule: Vec<Vec<Vec<usize>>>,
    status: Solver6CacheIncumbentStatus,
    generator_git_commit: Option<String>,
    last_seed_runtime_micros: Option<u64>,
    last_local_search_runtime_micros: Option<u64>,
) -> Result<Solver6CacheStoreOutcome, SolverError> {
    if params.write_policy == Solver6CacheWritePolicy::ReadOnly {
        return Ok(Solver6CacheStoreOutcome::Disabled);
    }

    let entry_path = entry_path(params, problem);
    let metrics = metrics_from_schedule(problem, &schedule)?;
    let new_entry = Solver6CacheEntry {
        schema_version: SOLVER6_CACHE_SCHEMA_VERSION,
        key: build_case_key(problem),
        status,
        metrics,
        schedule,
        provenance: Solver6CacheProvenance {
            generated_by: env!("CARGO_PKG_VERSION").into(),
            cache_policy_version: SOLVER6_CACHE_POLICY_VERSION.into(),
            generator_git_commit,
            update_count: 1,
            last_seed_runtime_micros,
            last_local_search_runtime_micros,
        },
    };
    validate_entry_for_problem(problem, &new_entry)?;

    if entry_path.exists() {
        let existing = load_entry(&entry_path)?;
        validate_entry_for_problem(problem, &existing)?;
        if should_keep_existing(&existing, &new_entry) {
            return Ok(Solver6CacheStoreOutcome::SkippedExistingBetterOrEqual {
                entry_path,
                existing,
            });
        }
        let mut upgraded = new_entry;
        upgraded.provenance.update_count = existing.provenance.update_count.saturating_add(1);
        write_entry_atomically(&entry_path, &upgraded)?;
        return Ok(Solver6CacheStoreOutcome::Wrote {
            entry_path,
            entry: upgraded,
        });
    }

    write_entry_atomically(&entry_path, &new_entry)?;
    Ok(Solver6CacheStoreOutcome::Wrote {
        entry_path,
        entry: new_entry,
    })
}

fn should_keep_existing(existing: &Solver6CacheEntry, candidate: &Solver6CacheEntry) -> bool {
    match existing
        .metrics
        .quality_tuple()
        .cmp(&candidate.metrics.quality_tuple())
    {
        Ordering::Less => true,
        Ordering::Greater => false,
        Ordering::Equal => {
            existing.status.completeness_rank() >= candidate.status.completeness_rank()
        }
    }
}

fn entry_path(params: &Solver6CacheParams, problem: &PureSgpProblem) -> PathBuf {
    PathBuf::from(&params.root_path).join(entry_relative_path(problem))
}

fn entry_relative_path(problem: &PureSgpProblem) -> String {
    format!(
        "entries/g{:02}_p{:02}_w{:02}.json",
        problem.num_groups, problem.group_size, problem.num_weeks,
    )
}

fn load_entry(path: &Path) -> Result<Solver6CacheEntry, SolverError> {
    let bytes = fs::read(path).map_err(|error| {
        SolverError::ValidationError(format!(
            "solver6 cache could not read entry '{}': {error}",
            path.display()
        ))
    })?;
    let entry: Solver6CacheEntry = serde_json::from_slice(&bytes).map_err(|error| {
        SolverError::ValidationError(format!(
            "solver6 cache could not parse entry '{}': {error}",
            path.display()
        ))
    })?;
    if entry.schema_version != SOLVER6_CACHE_SCHEMA_VERSION {
        return Err(SolverError::ValidationError(format!(
            "solver6 cache entry '{}' has schema_version {}, expected {}",
            path.display(),
            entry.schema_version,
            SOLVER6_CACHE_SCHEMA_VERSION,
        )));
    }
    if entry.key.cache_policy_version != SOLVER6_CACHE_POLICY_VERSION {
        return Err(SolverError::ValidationError(format!(
            "solver6 cache entry '{}' has cache_policy_version '{}', expected '{}'",
            path.display(),
            entry.key.cache_policy_version,
            SOLVER6_CACHE_POLICY_VERSION,
        )));
    }
    if entry.provenance.cache_policy_version != SOLVER6_CACHE_POLICY_VERSION {
        return Err(SolverError::ValidationError(format!(
            "solver6 cache entry '{}' has provenance cache_policy_version '{}', expected '{}'",
            path.display(),
            entry.provenance.cache_policy_version,
            SOLVER6_CACHE_POLICY_VERSION,
        )));
    }
    Ok(entry)
}

fn validate_entry_for_problem(
    problem: &PureSgpProblem,
    entry: &Solver6CacheEntry,
) -> Result<(), SolverError> {
    let expected = build_case_key(problem);
    if entry.key != expected {
        return Err(SolverError::ValidationError(format!(
            "solver6 cache entry key does not match requested shape: got {}-{}-{} policy '{}', expected {}-{}-{} policy '{}'",
            entry.key.num_groups,
            entry.key.group_size,
            entry.key.num_weeks,
            entry.key.cache_policy_version,
            expected.num_groups,
            expected.group_size,
            expected.num_weeks,
            expected.cache_policy_version,
        )));
    }
    validate_full_schedule_shape(problem, &entry.schedule)?;
    let recomputed = metrics_from_schedule(problem, &entry.schedule)?;
    if recomputed != entry.metrics {
        return Err(SolverError::ValidationError(
            "solver6 cache entry metrics do not match the stored schedule".into(),
        ));
    }
    Ok(())
}

fn metrics_from_schedule(
    problem: &PureSgpProblem,
    schedule: &[Vec<Vec<usize>>],
) -> Result<Solver6CacheMetrics, SolverError> {
    let telemetry = SeedPairTelemetry::from_schedule(
        problem,
        schedule,
        Solver6PairRepeatPenaltyModel::LinearRepeatExcess,
    )?;
    let num_people = problem.num_groups.saturating_mul(problem.group_size);
    let universe_pairs = num_people.saturating_mul(num_people.saturating_sub(1)) / 2;
    let squared_concentration_lower_bound = squared_repeat_excess_lower_bound_for_linear_excess(
        universe_pairs,
        telemetry.linear_repeat_excess,
    );
    let squared_concentration_lower_bound_gap = telemetry
        .squared_repeat_excess
        .saturating_sub(squared_concentration_lower_bound);
    let squared_instance_lower_bound = squared_repeat_excess_lower_bound_for_linear_excess(
        universe_pairs,
        telemetry.linear_repeat_lower_bound,
    );
    let squared_instance_lower_bound_gap = telemetry
        .squared_repeat_excess
        .saturating_sub(squared_instance_lower_bound);
    Ok(Solver6CacheMetrics {
        linear_repeat_excess: telemetry.linear_repeat_excess,
        triangular_repeat_excess: telemetry.triangular_repeat_excess,
        squared_repeat_excess: telemetry.squared_repeat_excess,
        distinct_pairs_covered: telemetry.distinct_pairs_covered,
        max_pair_frequency: telemetry.max_pair_frequency,
        total_pair_incidences: telemetry.total_pair_incidences,
        linear_repeat_lower_bound: telemetry.linear_repeat_lower_bound,
        linear_repeat_lower_bound_gap: telemetry.linear_repeat_lower_bound_gap,
        squared_instance_lower_bound,
        squared_instance_lower_bound_gap,
        squared_concentration_lower_bound,
        squared_concentration_lower_bound_gap,
        multiplicity_histogram: telemetry.multiplicity_histogram,
    })
}

fn write_entry_atomically(path: &Path, entry: &Solver6CacheEntry) -> Result<(), SolverError> {
    let parent = path.parent().ok_or_else(|| {
        SolverError::ValidationError(format!(
            "solver6 cache entry path '{}' has no parent directory",
            path.display()
        ))
    })?;
    fs::create_dir_all(parent).map_err(|error| {
        SolverError::ValidationError(format!(
            "solver6 cache could not create entry directory '{}': {error}",
            parent.display()
        ))
    })?;
    let json = serde_json::to_string_pretty(entry).map_err(|error| {
        SolverError::ValidationError(format!(
            "solver6 cache could not serialize entry '{}': {error}",
            path.display()
        ))
    })?;
    let tmp_path = path.with_extension(format!(
        "json.tmp-{}-{}",
        std::process::id(),
        uuid::Uuid::new_v4()
    ));
    fs::write(&tmp_path, json).map_err(|error| {
        SolverError::ValidationError(format!(
            "solver6 cache could not write temporary entry '{}': {error}",
            tmp_path.display()
        ))
    })?;
    fs::rename(&tmp_path, path).map_err(|error| {
        let _ = fs::remove_file(&tmp_path);
        SolverError::ValidationError(format!(
            "solver6 cache could not move temporary entry '{}' into '{}': {error}",
            tmp_path.display(),
            path.display()
        ))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{
        ApiInput, Constraint, Group, Objective, Person, ProblemDefinition, RepeatEncounterParams,
        SolverConfiguration, SolverKind, SolverParams, StopConditions,
    };
    use std::collections::HashMap;

    fn pure_input(groups: usize, group_size: usize, weeks: usize) -> ApiInput {
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
                solver_type: SolverKind::Solver6.canonical_id().into(),
                stop_conditions: StopConditions {
                    max_iterations: Some(100),
                    time_limit_seconds: None,
                    no_improvement_iterations: Some(20),
                    stop_on_optimal_score: true,
                },
                solver_params: SolverParams::Solver6(crate::models::Solver6Params::default()),
                logging: Default::default(),
                telemetry: Default::default(),
                seed: Some(7),
                move_policy: None,
                allowed_sessions: None,
            },
        }
    }

    fn sample_schedule() -> Vec<Vec<Vec<usize>>> {
        vec![vec![vec![0, 1], vec![2, 3]], vec![vec![0, 2], vec![1, 3]]]
    }

    fn cache_params(root: &Path) -> Solver6CacheParams {
        Solver6CacheParams {
            root_path: root.to_string_lossy().into_owned(),
            miss_policy: Default::default(),
            write_policy: Default::default(),
        }
    }

    #[test]
    fn case_key_matches_only_solver6_shape_and_policy() {
        let problem = PureSgpProblem::from_input(&pure_input(8, 4, 20)).expect("pure input");
        let key = build_case_key(&problem);
        assert_eq!(key.cache_policy_version, SOLVER6_CACHE_POLICY_VERSION);
        assert_eq!(key.num_groups, 8);
        assert_eq!(key.group_size, 4);
        assert_eq!(key.num_weeks, 20);
    }

    #[test]
    fn store_and_lookup_round_trip_incumbent_entry() {
        let problem = PureSgpProblem::from_input(&pure_input(2, 2, 2)).expect("pure input");
        let root = std::env::temp_dir().join(format!("solver6-cache-{}", uuid::Uuid::new_v4()));
        let params = cache_params(&root);

        let stored = store_cache_incumbent(
            &params,
            &problem,
            sample_schedule(),
            Solver6CacheIncumbentStatus::SearchTimedOut,
            Some("abc1234".into()),
            Some(12),
            Some(34),
        )
        .expect("store should work");
        match stored {
            Solver6CacheStoreOutcome::Wrote { entry, .. } => {
                assert_eq!(entry.status, Solver6CacheIncumbentStatus::SearchTimedOut);
                assert_eq!(entry.provenance.update_count, 1);
            }
            other => panic!("expected write, got {other:?}"),
        }

        let lookup = lookup_cache_incumbent(&params, &problem).expect("lookup should work");
        match lookup {
            Solver6CacheLookup::Hit(hit) => {
                assert_eq!(hit.entry.schedule, sample_schedule());
                assert_eq!(
                    hit.entry.status,
                    Solver6CacheIncumbentStatus::SearchTimedOut
                );
            }
            Solver6CacheLookup::Miss { reason } => panic!("expected hit, got miss: {reason}"),
        }
    }

    #[test]
    fn stale_policy_version_is_rejected_explicitly() {
        let problem = PureSgpProblem::from_input(&pure_input(2, 2, 2)).expect("pure input");
        let root =
            std::env::temp_dir().join(format!("solver6-cache-stale-{}", uuid::Uuid::new_v4()));
        let params = cache_params(&root);
        store_cache_incumbent(
            &params,
            &problem,
            sample_schedule(),
            Solver6CacheIncumbentStatus::SearchTimedOut,
            None,
            None,
            None,
        )
        .expect("store should work");
        let path = entry_path(&params, &problem);
        let mut entry = load_entry(&path).expect("entry should load");
        entry.key.cache_policy_version = "old-policy".into();
        fs::write(&path, serde_json::to_vec(&entry).expect("entry serializes"))
            .expect("entry rewrites");

        let err = lookup_cache_incumbent(&params, &problem).expect_err("stale policy should fail");
        assert!(err.to_string().contains("cache_policy_version"));
    }

    #[test]
    fn corrupt_metrics_are_rejected_explicitly() {
        let problem = PureSgpProblem::from_input(&pure_input(2, 2, 2)).expect("pure input");
        let root =
            std::env::temp_dir().join(format!("solver6-cache-corrupt-{}", uuid::Uuid::new_v4()));
        let params = cache_params(&root);
        store_cache_incumbent(
            &params,
            &problem,
            sample_schedule(),
            Solver6CacheIncumbentStatus::SearchTimedOut,
            None,
            None,
            None,
        )
        .expect("store should work");
        let path = entry_path(&params, &problem);
        let mut entry = load_entry(&path).expect("entry should load");
        entry.metrics.linear_repeat_excess += 1;
        fs::write(&path, serde_json::to_vec(&entry).expect("entry serializes"))
            .expect("entry rewrites");

        let err =
            lookup_cache_incumbent(&params, &problem).expect_err("corrupt metrics should fail");
        assert!(err.to_string().contains("metrics do not match"));
    }
}
