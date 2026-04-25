use crate::artifacts::BenchmarkComparisonCategory;
use crate::benchmark_mode::{
    default_benchmark_mode, is_hotpath_benchmark_mode, is_supported_benchmark_mode,
    SEARCH_ITERATION_BENCHMARK_MODE,
};
use anyhow::{bail, Context, Result};
use gm_core::models::{ApiInput, MovePolicy, SolverConfiguration, SolverKind};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Component, Path, PathBuf};

pub const SUITE_SCHEMA_VERSION: u32 = 1;
pub const CASE_SCHEMA_VERSION: u32 = 1;
const MIN_SEARCH_ITERATION_REGRESSION_ITERATIONS: u64 = 10_000;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash, Ord, PartialOrd)]
#[serde(rename_all = "snake_case")]
pub enum BenchmarkCaseSelectionPolicy {
    CanonicalOnly,
    AllowNonCanonical,
}

#[derive(
    Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash, Ord, PartialOrd, Default,
)]
#[serde(rename_all = "snake_case")]
pub enum BenchmarkTimeoutPolicy {
    /// Derive per-case wall-clock runtime from canonical problem complexity.
    #[default]
    ComplexityBasedWallTime,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash, Ord, PartialOrd)]
#[serde(rename_all = "snake_case")]
pub enum BenchmarkSolverPolicy {
    /// Run solver3 in a constructor/search split: constructor must produce an incumbent, then
    /// normal solver3 search continues from that incumbent with runtime-scaled stagnation stop.
    Solver3ConstructThenSearch,
}

impl BenchmarkCaseSelectionPolicy {
    pub fn default_for(
        benchmark_mode: &str,
        comparison_category: BenchmarkComparisonCategory,
    ) -> Self {
        if benchmark_mode == default_benchmark_mode()
            && comparison_category == BenchmarkComparisonCategory::ScoreQuality
        {
            Self::CanonicalOnly
        } else {
            Self::AllowNonCanonical
        }
    }
}

#[derive(
    Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash, Ord, PartialOrd, Default,
)]
#[serde(rename_all = "snake_case")]
pub enum BenchmarkCaseRole {
    #[default]
    Canonical,
    Helper,
    Derived,
    Proxy,
    WarmStart,
    BenchmarkStart,
}

impl BenchmarkCaseRole {
    pub fn is_canonical(self) -> bool {
        matches!(self, Self::Canonical)
    }
}

pub fn effective_case_selection_policy(
    manifest: &BenchmarkSuiteManifest,
) -> BenchmarkCaseSelectionPolicy {
    manifest.case_selection_policy.unwrap_or_else(|| {
        BenchmarkCaseSelectionPolicy::default_for(
            &manifest.benchmark_mode,
            manifest.comparison_category,
        )
    })
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct DeclaredBenchmarkBudget {
    #[serde(default)]
    pub max_iterations: Option<u64>,
    #[serde(default)]
    pub time_limit_seconds: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct BenchmarkSearchPolicyOverride {
    #[serde(default)]
    pub no_improvement_iterations: NullableU64Override,
    #[serde(default)]
    pub simulated_annealing: Option<BenchmarkSimulatedAnnealingPolicyOverride>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum NullableU64Override {
    #[default]
    Inherit,
    Clear,
    Value(u64),
}

impl Serialize for NullableU64Override {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            Self::Inherit => serializer.serialize_unit(),
            Self::Clear => serializer.serialize_none(),
            Self::Value(value) => serializer.serialize_u64(*value),
        }
    }
}

impl<'de> Deserialize<'de> for NullableU64Override {
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = Option::<u64>::deserialize(deserializer)?;
        Ok(match value {
            Some(value) => Self::Value(value),
            None => Self::Clear,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct BenchmarkSimulatedAnnealingPolicyOverride {
    #[serde(default)]
    pub initial_temperature: Option<f64>,
    #[serde(default)]
    pub final_temperature: Option<f64>,
    #[serde(default)]
    pub cooling_schedule: Option<String>,
    #[serde(default)]
    pub reheat_cycles: Option<u64>,
    #[serde(default)]
    pub reheat_after_no_improvement: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BenchmarkSolver3RelabelingProjectionPolicy {
    pub relabeling_timeout_seconds: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash, Ord, PartialOrd)]
#[serde(rename_all = "snake_case")]
pub enum BenchmarkSuiteClass {
    Path,
    Representative,
    Stretch,
    Adversarial,
    Mixed,
}

impl BenchmarkSuiteClass {
    pub const ALL: [Self; 5] = [
        Self::Path,
        Self::Representative,
        Self::Stretch,
        Self::Adversarial,
        Self::Mixed,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Path => "path",
            Self::Representative => "representative",
            Self::Stretch => "stretch",
            Self::Adversarial => "adversarial",
            Self::Mixed => "mixed",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkSuiteManifest {
    pub schema_version: u32,
    pub suite_id: String,
    #[serde(default = "default_benchmark_mode")]
    pub benchmark_mode: String,
    #[serde(default)]
    pub comparison_category: BenchmarkComparisonCategory,
    pub class: BenchmarkSuiteClass,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub case_selection_policy: Option<BenchmarkCaseSelectionPolicy>,
    #[serde(default)]
    pub default_solver_family: Option<String>,
    #[serde(default)]
    pub default_solver: Option<SolverConfiguration>,
    #[serde(default)]
    pub default_seed: Option<u64>,
    #[serde(default)]
    pub default_max_iterations: Option<u64>,
    #[serde(default)]
    pub default_time_limit_seconds: Option<u64>,
    #[serde(default)]
    pub default_search_policy: Option<BenchmarkSearchPolicyOverride>,
    #[serde(default)]
    pub default_move_policy: Option<MovePolicy>,
    #[serde(default)]
    pub default_iterations: Option<u64>,
    #[serde(default)]
    pub timeout_policy: Option<BenchmarkTimeoutPolicy>,
    #[serde(default)]
    pub solver_policy: Option<BenchmarkSolverPolicy>,
    #[serde(default)]
    pub solver3_relabeling_projection: Option<BenchmarkSolver3RelabelingProjectionPolicy>,
    #[serde(default)]
    pub default_warmup_iterations: Option<u64>,
    pub cases: Vec<BenchmarkCaseOverride>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkCaseOverride {
    pub manifest: String,
    #[serde(default)]
    pub case_id: Option<String>,
    #[serde(default)]
    pub case_role: Option<BenchmarkCaseRole>,
    #[serde(default)]
    pub canonical_case_id: Option<String>,
    #[serde(default)]
    pub purpose: Option<String>,
    #[serde(default)]
    pub provenance: Option<String>,
    #[serde(default)]
    pub declared_budget: Option<DeclaredBenchmarkBudget>,
    #[serde(default)]
    pub solver_family: Option<String>,
    #[serde(default)]
    pub solver: Option<SolverConfiguration>,
    #[serde(default)]
    pub seed: Option<u64>,
    #[serde(default)]
    pub max_iterations: Option<u64>,
    #[serde(default)]
    pub time_limit_seconds: Option<u64>,
    #[serde(default)]
    pub search_policy: Option<BenchmarkSearchPolicyOverride>,
    #[serde(default)]
    pub move_policy: Option<MovePolicy>,
    #[serde(default)]
    pub iterations: Option<u64>,
    #[serde(default)]
    pub warmup_iterations: Option<u64>,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

fn default_enabled() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkCaseManifest {
    pub schema_version: u32,
    pub id: String,
    pub class: BenchmarkSuiteClass,
    #[serde(default)]
    pub case_role: BenchmarkCaseRole,
    #[serde(default)]
    pub canonical_case_id: Option<String>,
    #[serde(default)]
    pub family: Option<String>,
    #[serde(default)]
    pub solver_family: Option<String>,
    #[serde(default)]
    pub paths: Vec<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub purpose: Option<String>,
    #[serde(default)]
    pub provenance: Option<String>,
    #[serde(default)]
    pub declared_budget: Option<DeclaredBenchmarkBudget>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub input: Option<ApiInput>,
    #[serde(default)]
    pub hotpath_preset: Option<String>,
}

pub fn canonical_solver_family_for_case(manifest: &BenchmarkCaseManifest) -> Result<String> {
    if let Some(input) = &manifest.input {
        return Ok(input
            .solver
            .validate_solver_selection()
            .map_err(anyhow::Error::msg)?
            .canonical_id()
            .to_string());
    }

    if let Some(solver_family) = manifest.solver_family.as_deref() {
        return Ok(SolverKind::parse_config_id(solver_family)
            .map_err(anyhow::Error::msg)?
            .canonical_id()
            .to_string());
    }

    if manifest
        .hotpath_preset
        .as_deref()
        .is_some_and(|preset| !preset.is_empty())
    {
        bail!(
            "benchmark case {} defines hotpath_preset but does not declare solver_family",
            manifest.id
        );
    }

    bail!(
        "benchmark case {} does not define a solver family",
        manifest.id
    )
}

#[derive(Debug, Clone)]
pub struct LoadedBenchmarkSuite {
    pub manifest_path: PathBuf,
    pub manifest: BenchmarkSuiteManifest,
    pub cases: Vec<LoadedBenchmarkCase>,
}

#[derive(Debug, Clone)]
pub struct LoadedBenchmarkCase {
    pub manifest_path: PathBuf,
    pub source_path: String,
    pub source_fingerprint: String,
    pub manifest: BenchmarkCaseManifest,
    pub overrides: BenchmarkCaseOverride,
}

pub fn load_suite_manifest(path: impl AsRef<Path>) -> Result<LoadedBenchmarkSuite> {
    let path = path.as_ref();
    let suite_contents = fs::read_to_string(path)
        .with_context(|| format!("failed to read benchmark suite manifest {}", path.display()))?;
    let manifest: BenchmarkSuiteManifest =
        serde_yaml::from_str(&suite_contents).with_context(|| {
            format!(
                "failed to parse benchmark suite manifest {}",
                path.display()
            )
        })?;

    validate_suite_manifest(path, &manifest)?;

    let case_selection_policy = effective_case_selection_policy(&manifest);

    let suite_dir = path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));

    let mut cases = Vec::new();
    for case_override in manifest.cases.iter().filter(|case| case.enabled) {
        let case_path = suite_dir.join(&case_override.manifest);
        let case_manifest = load_case_manifest(&case_path)?;
        if manifest.class != BenchmarkSuiteClass::Mixed && case_manifest.class != manifest.class {
            bail!(
                "benchmark case {} has class {:?}, but suite {} expects {:?}",
                case_manifest.id,
                case_manifest.class,
                manifest.suite_id,
                manifest.class
            );
        }
        if let Some(expected_case_id) = &case_override.case_id {
            if expected_case_id != &case_manifest.id {
                bail!(
                    "benchmark case manifest {} loaded id {}, expected {}",
                    case_path.display(),
                    case_manifest.id,
                    expected_case_id
                );
            }
        }
        let effective_case_role = case_override.case_role.unwrap_or(case_manifest.case_role);
        if matches!(
            case_selection_policy,
            BenchmarkCaseSelectionPolicy::CanonicalOnly
        ) && !effective_case_role.is_canonical()
        {
            bail!(
                "benchmark suite {} rejects non-canonical case {} with role {:?}; set case_selection_policy: allow_non_canonical only for explicit helper/diagnostic suites",
                manifest.suite_id,
                case_manifest.id,
                effective_case_role
            );
        }
        if is_hotpath_benchmark_mode(&manifest.benchmark_mode) {
            if case_manifest
                .hotpath_preset
                .as_deref()
                .is_none_or(str::is_empty)
            {
                bail!(
                    "hotpath suite {} requires case {} to define hotpath_preset",
                    manifest.suite_id,
                    case_manifest.id
                );
            }
        } else if case_manifest.input.is_none() {
            bail!(
                "full-solve suite {} requires case {} to define input",
                manifest.suite_id,
                case_manifest.id
            );
        }
        let source_path = normalized_manifest_path(&case_path);
        let source_fingerprint = format!("sha256:{}", sha256_file(&case_path)?);
        cases.push(LoadedBenchmarkCase {
            manifest_path: case_path,
            source_path,
            source_fingerprint,
            manifest: case_manifest,
            overrides: case_override.clone(),
        });
    }

    if cases.is_empty() {
        bail!(
            "benchmark suite {} does not enable any cases",
            manifest.suite_id
        );
    }

    Ok(LoadedBenchmarkSuite {
        manifest_path: path.to_path_buf(),
        manifest,
        cases,
    })
}

pub fn load_case_manifest(path: impl AsRef<Path>) -> Result<BenchmarkCaseManifest> {
    let path = path.as_ref();
    let contents = fs::read_to_string(path)
        .with_context(|| format!("failed to read benchmark case manifest {}", path.display()))?;
    let manifest: BenchmarkCaseManifest = serde_json::from_str(&contents)
        .with_context(|| format!("failed to parse benchmark case manifest {}", path.display()))?;
    validate_case_manifest(path, &manifest)?;
    Ok(manifest)
}

fn validate_suite_manifest(path: &Path, manifest: &BenchmarkSuiteManifest) -> Result<()> {
    if manifest.schema_version != SUITE_SCHEMA_VERSION {
        bail!(
            "benchmark suite manifest {} uses schema version {}, expected {}",
            path.display(),
            manifest.schema_version,
            SUITE_SCHEMA_VERSION
        );
    }
    if manifest.suite_id.trim().is_empty() {
        bail!(
            "benchmark suite manifest {} is missing suite_id",
            path.display()
        );
    }
    if !is_supported_benchmark_mode(&manifest.benchmark_mode) {
        bail!(
            "benchmark suite manifest {} uses unsupported benchmark_mode {}",
            path.display(),
            manifest.benchmark_mode
        );
    }
    let _ = effective_case_selection_policy(manifest);
    if let Some(solver_family) = manifest.default_solver_family.as_deref() {
        SolverKind::parse_config_id(solver_family)
            .map_err(anyhow::Error::msg)
            .with_context(|| {
                format!(
                    "benchmark suite manifest {} has unknown default solver family {}",
                    path.display(),
                    solver_family
                )
            })?;
    }
    if let Some(default_solver) = manifest.default_solver.as_ref() {
        default_solver
            .validate_solver_selection()
            .map_err(anyhow::Error::msg)
            .with_context(|| {
                format!(
                    "benchmark suite manifest {} has invalid default solver override",
                    path.display()
                )
            })?;

        if let Some(solver_family) = manifest.default_solver_family.as_deref() {
            let declared_kind = SolverKind::parse_config_id(solver_family)
                .map_err(anyhow::Error::msg)
                .with_context(|| {
                    format!(
                        "benchmark suite manifest {} has unknown default solver family {}",
                        path.display(),
                        solver_family
                    )
                })?;
            let override_kind = default_solver
                .validate_solver_selection()
                .map_err(anyhow::Error::msg)
                .with_context(|| {
                    format!(
                        "benchmark suite manifest {} has invalid default solver override",
                        path.display()
                    )
                })?;
            if declared_kind != override_kind {
                bail!(
                    "benchmark suite manifest {} declares default solver family {} but default solver override uses {}",
                    path.display(),
                    declared_kind.canonical_id(),
                    override_kind.canonical_id()
                );
            }
        }
    }
    if let Some(default_search_policy) = manifest.default_search_policy.as_ref() {
        validate_search_policy_override(
            &format!(
                "benchmark suite manifest {} default_search_policy",
                path.display()
            ),
            default_search_policy,
        )?;
    }
    if let Some(relabeling_policy) = manifest.solver3_relabeling_projection.as_ref() {
        if manifest.solver_policy != Some(BenchmarkSolverPolicy::Solver3ConstructThenSearch) {
            bail!(
                "benchmark suite manifest {} sets solver3_relabeling_projection but does not use solver_policy: solver3_construct_then_search",
                path.display()
            );
        }
        validate_solver3_relabeling_projection_policy(
            &format!(
                "benchmark suite manifest {} solver3_relabeling_projection",
                path.display()
            ),
            relabeling_policy,
        )?;
    }
    validate_search_iteration_iteration_floor(path, manifest)?;
    for case in &manifest.cases {
        validate_case_identity_fields(
            &format!("benchmark suite manifest {} case override", path.display()),
            case.case_role,
            case.canonical_case_id.as_deref(),
            case.purpose.as_deref(),
            case.declared_budget.as_ref(),
        )?;
        if let Some(solver_family) = case.solver_family.as_deref() {
            SolverKind::parse_config_id(solver_family)
                .map_err(anyhow::Error::msg)
                .with_context(|| {
                    format!(
                        "benchmark suite manifest {} has unknown case override solver family {}",
                        path.display(),
                        solver_family
                    )
                })?;
        }
        if let Some(solver) = case.solver.as_ref() {
            let override_kind = solver
                .validate_solver_selection()
                .map_err(anyhow::Error::msg)
                .with_context(|| {
                    format!(
                        "benchmark suite manifest {} has invalid case solver override",
                        path.display()
                    )
                })?;

            if let Some(solver_family) = case.solver_family.as_deref() {
                let declared_kind = SolverKind::parse_config_id(solver_family)
                    .map_err(anyhow::Error::msg)
                    .with_context(|| {
                        format!(
                            "benchmark suite manifest {} has unknown case override solver family {}",
                            path.display(),
                            solver_family
                        )
                    })?;
                if declared_kind != override_kind {
                    bail!(
                        "benchmark suite manifest {} declares case solver family {} but case solver override uses {}",
                        path.display(),
                        declared_kind.canonical_id(),
                        override_kind.canonical_id()
                    );
                }
            }
        }
        if let Some(search_policy) = case.search_policy.as_ref() {
            validate_search_policy_override(
                &format!(
                    "benchmark suite manifest {} case override search_policy",
                    path.display()
                ),
                search_policy,
            )?;
        }
    }
    if manifest.cases.is_empty() {
        bail!("benchmark suite manifest {} has no cases", path.display());
    }
    Ok(())
}

fn validate_case_manifest(path: &Path, manifest: &BenchmarkCaseManifest) -> Result<()> {
    if manifest.schema_version != CASE_SCHEMA_VERSION {
        bail!(
            "benchmark case manifest {} uses schema version {}, expected {}",
            path.display(),
            manifest.schema_version,
            CASE_SCHEMA_VERSION
        );
    }
    if manifest.id.trim().is_empty() {
        bail!("benchmark case manifest {} is missing id", path.display());
    }
    validate_case_identity_fields(
        &format!("benchmark case manifest {}", path.display()),
        Some(manifest.case_role),
        manifest.canonical_case_id.as_deref(),
        manifest.purpose.as_deref(),
        manifest.declared_budget.as_ref(),
    )?;
    if let Some(input) = &manifest.input {
        if input.solver.solver_type.trim().is_empty() {
            bail!(
                "benchmark case manifest {} has empty solver type in input",
                path.display()
            );
        }
        input
            .solver
            .validate_solver_selection()
            .map_err(anyhow::Error::msg)
            .with_context(|| {
                format!(
                    "benchmark case manifest {} has invalid solver selection",
                    path.display()
                )
            })?;
    }
    if let Some(solver_family) = manifest.solver_family.as_deref() {
        SolverKind::parse_config_id(solver_family)
            .map_err(anyhow::Error::msg)
            .with_context(|| {
                format!(
                    "benchmark case manifest {} has unknown solver family {}",
                    path.display(),
                    solver_family
                )
            })?;
    }
    if manifest
        .hotpath_preset
        .as_deref()
        .is_some_and(|preset| !preset.is_empty())
        && manifest.solver_family.as_deref().is_none_or(str::is_empty)
    {
        bail!(
            "benchmark case manifest {} must declare solver_family when using hotpath_preset",
            path.display()
        );
    }
    if manifest.input.is_none() && manifest.hotpath_preset.as_deref().is_none_or(str::is_empty) {
        bail!(
            "benchmark case manifest {} must define either input or hotpath_preset",
            path.display()
        );
    }
    Ok(())
}

fn validate_case_identity_fields(
    context: &str,
    case_role: Option<BenchmarkCaseRole>,
    canonical_case_id: Option<&str>,
    purpose: Option<&str>,
    declared_budget: Option<&DeclaredBenchmarkBudget>,
) -> Result<()> {
    if let Some(role) = case_role {
        if role.is_canonical() && canonical_case_id.is_some() {
            bail!(
                "{} declares canonical case_role but also sets canonical_case_id",
                context
            );
        }

        if !role.is_canonical() && canonical_case_id.map(str::trim).is_none_or(str::is_empty) {
            bail!(
                "{} declares non-canonical case_role {:?} but does not set canonical_case_id",
                context,
                role
            );
        }
    }

    if purpose.is_some_and(|purpose| purpose.trim().is_empty()) {
        bail!("{} sets an empty purpose", context);
    }

    if let Some(declared_budget) = declared_budget {
        if declared_budget.max_iterations.is_none() && declared_budget.time_limit_seconds.is_none()
        {
            bail!(
                "{} declares an empty declared_budget; set max_iterations and/or time_limit_seconds",
                context
            );
        }
    }

    Ok(())
}

fn validate_search_policy_override(
    context: &str,
    search_policy: &BenchmarkSearchPolicyOverride,
) -> Result<()> {
    let has_top_level = !matches!(
        search_policy.no_improvement_iterations,
        NullableU64Override::Inherit
    );
    let mut has_simulated_annealing = false;

    if let Some(simulated_annealing) = search_policy.simulated_annealing.as_ref() {
        has_simulated_annealing = simulated_annealing.initial_temperature.is_some()
            || simulated_annealing.final_temperature.is_some()
            || simulated_annealing.cooling_schedule.is_some()
            || simulated_annealing.reheat_cycles.is_some()
            || simulated_annealing.reheat_after_no_improvement.is_some();

        if simulated_annealing
            .cooling_schedule
            .as_deref()
            .is_some_and(|schedule| schedule.trim().is_empty())
        {
            bail!(
                "{} sets an empty simulated_annealing.cooling_schedule",
                context
            );
        }
    }

    if !has_top_level && !has_simulated_annealing {
        bail!(
            "{} is empty; set no_improvement_iterations and/or simulated_annealing fields",
            context
        );
    }

    Ok(())
}

fn validate_solver3_relabeling_projection_policy(
    context: &str,
    policy: &BenchmarkSolver3RelabelingProjectionPolicy,
) -> Result<()> {
    if !policy.relabeling_timeout_seconds.is_finite() || policy.relabeling_timeout_seconds <= 0.0 {
        bail!(
            "{} must set relabeling_timeout_seconds to a positive finite value",
            context
        );
    }
    Ok(())
}

fn validate_search_iteration_iteration_floor(
    path: &Path,
    manifest: &BenchmarkSuiteManifest,
) -> Result<()> {
    if manifest.benchmark_mode != SEARCH_ITERATION_BENCHMARK_MODE {
        return Ok(());
    }

    if let Some(default_iterations) = manifest.default_iterations {
        if default_iterations < MIN_SEARCH_ITERATION_REGRESSION_ITERATIONS {
            bail!(
                "benchmark suite manifest {} uses search_iteration but default_iterations={} is below the required minimum {}; search-iteration regression suites must measure at least {} iterations",
                path.display(),
                default_iterations,
                MIN_SEARCH_ITERATION_REGRESSION_ITERATIONS,
                MIN_SEARCH_ITERATION_REGRESSION_ITERATIONS,
            );
        }
    }

    for case in manifest.cases.iter().filter(|case| case.enabled) {
        let effective_iterations = case.iterations.or(manifest.default_iterations);
        match effective_iterations {
            Some(iterations) if iterations >= MIN_SEARCH_ITERATION_REGRESSION_ITERATIONS => {}
            Some(iterations) => {
                bail!(
                    "benchmark suite manifest {} case override for {} uses search_iteration with only {} measured iterations; search-iteration regression suites must measure at least {} iterations",
                    path.display(),
                    case.manifest,
                    iterations,
                    MIN_SEARCH_ITERATION_REGRESSION_ITERATIONS,
                );
            }
            None => {
                bail!(
                    "benchmark suite manifest {} case override for {} uses search_iteration without explicit iterations or default_iterations; search-iteration regression suites must declare at least {} measured iterations",
                    path.display(),
                    case.manifest,
                    MIN_SEARCH_ITERATION_REGRESSION_ITERATIONS,
                );
            }
        }
    }

    Ok(())
}

fn sha256_file(path: &Path) -> Result<String> {
    let contents = fs::read(path)
        .with_context(|| format!("failed to read benchmark case manifest {}", path.display()))?;
    let digest = Sha256::digest(contents);
    Ok(digest.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn normalized_manifest_path(path: &Path) -> String {
    let is_absolute = path.is_absolute();
    let mut parts: Vec<&std::ffi::OsStr> = Vec::new();

    for component in path.components() {
        match component {
            Component::RootDir | Component::CurDir => {}
            Component::ParentDir => {
                if parts
                    .last()
                    .is_some_and(|last| *last != std::ffi::OsStr::new(".."))
                {
                    parts.pop();
                } else if !is_absolute {
                    parts.push(std::ffi::OsStr::new(".."));
                }
            }
            Component::Normal(value) => parts.push(value),
            Component::Prefix(prefix) => {
                parts.push(prefix.as_os_str());
            }
        }
    }

    let mut normalized = if is_absolute {
        PathBuf::from(std::path::MAIN_SEPARATOR_STR)
    } else {
        PathBuf::new()
    };
    for part in parts {
        normalized.push(part);
    }

    if normalized.as_os_str().is_empty() {
        ".".to_string()
    } else {
        normalized.display().to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::Path;
    use tempfile::TempDir;

    #[test]
    fn loads_path_suite_and_resolves_case_manifests() {
        let suite =
            load_suite_manifest(Path::new("suites/path.yaml")).expect("path suite should load");

        assert_eq!(suite.manifest.suite_id, "path");
        assert_eq!(suite.manifest.benchmark_mode, "full_solve");
        assert_eq!(
            suite.manifest.comparison_category,
            BenchmarkComparisonCategory::InvariantOnly
        );
        assert_eq!(suite.manifest.class, BenchmarkSuiteClass::Path);
        assert!(suite.cases.len() >= 5);
        assert!(suite
            .cases
            .iter()
            .all(|case| case.manifest.class == BenchmarkSuiteClass::Path));
    }

    #[test]
    fn solver3_constructor_broad_suite_loads_mixed_case_selection() {
        let suite = load_suite_manifest(Path::new("suites/solver3-constructor-broad.yaml"))
            .expect("solver3 constructor broad suite should load");

        assert_eq!(suite.manifest.suite_id, "solver3-constructor-broad");
        assert_eq!(suite.manifest.class, BenchmarkSuiteClass::Mixed);
        assert_eq!(
            suite.manifest.timeout_policy,
            Some(BenchmarkTimeoutPolicy::ComplexityBasedWallTime)
        );
        assert_eq!(
            suite.manifest.solver_policy,
            Some(BenchmarkSolverPolicy::Solver3ConstructThenSearch)
        );
        assert_eq!(suite.cases.len(), 36);
        assert!(suite.manifest.default_solver_family.is_none());
        assert!(suite.manifest.default_solver.is_none());
        assert!(suite
            .cases
            .iter()
            .any(|case| case.manifest.class == BenchmarkSuiteClass::Path));
        assert!(suite
            .cases
            .iter()
            .any(|case| case.manifest.class == BenchmarkSuiteClass::Representative));
        assert!(suite
            .cases
            .iter()
            .any(|case| case.manifest.class == BenchmarkSuiteClass::Adversarial));
        assert!(suite
            .cases
            .iter()
            .any(|case| case.manifest.class == BenchmarkSuiteClass::Stretch));
        let case_ids: Vec<&str> = suite
            .cases
            .iter()
            .map(|case| case.manifest.id.as_str())
            .collect();
        assert!(!case_ids.contains(&"stretch.sailing_trip_demo_real.benchmark_start"));
        assert!(!case_ids.contains(&"stretch.social-golfer-32x8x9"));
        assert!(!case_ids.contains(&"stretch.social-golfer-32x8x10"));
        assert!(!case_ids.contains(&"stretch.social-golfer-36x9x10"));
        assert!(!case_ids.contains(&"stretch.social-golfer-36x9x11"));
        assert!(!case_ids.contains(&"stretch.social-golfer-40x10x10"));
        assert!(case_ids.contains(&"stretch.social-golfer-32x8x15"));
        assert!(case_ids.contains(&"stretch.social-golfer-32x8x15-constrained"));
        assert!(case_ids.contains(&"stretch.social-golfer-32x8x20"));
        assert!(case_ids.contains(&"stretch.social-golfer-32x8x20-constrained"));
        assert!(case_ids.contains(&"stretch.social-golfer-40x10x11"));
        assert!(case_ids.contains(&"stretch.social-golfer-49x7x8"));
        assert!(case_ids.contains(&"stretch.social-golfer-49x7x8-constrained"));
        assert!(case_ids.contains(&"stretch.social-golfer-169x13x14"));
        assert!(case_ids.contains(&"stretch.social-golfer-169x13x14-constrained"));
        assert!(case_ids.contains(&"stretch.sailing-flotilla-stress-test"));

        for case in &suite.cases {
            let input = case
                .manifest
                .input
                .as_ref()
                .expect("constructor broad suite should contain solve-level cases only");
            gm_core::solver_support::complexity::evaluate_problem_complexity(input).unwrap_or_else(
                |error| {
                    panic!(
                        "case {} should have a valid complexity score: {error}",
                        case.manifest.id
                    )
                },
            );
        }
    }

    #[test]
    fn solver3_path_control_high_event_suites_load_and_cover_all_three_operators() {
        let social = load_suite_manifest(Path::new(
            "suites/social-golfer-plateau-time-solver3-path-control-high-event.yaml",
        ))
        .expect("social golfer high-event path-control suite should load");
        assert_eq!(
            social.manifest.default_solver_family.as_deref(),
            Some("solver3")
        );
        assert_eq!(social.cases.len(), 9);
        assert!(social.cases.iter().any(|case| case
            .overrides
            .purpose
            .as_deref()
            .is_some_and(|purpose| purpose.contains("session_path"))));
        assert!(social.cases.iter().any(|case| case
            .overrides
            .purpose
            .as_deref()
            .is_some_and(|purpose| purpose.contains("random_donor"))));
        assert!(social.cases.iter().any(|case| case
            .overrides
            .purpose
            .as_deref()
            .is_some_and(|purpose| purpose.contains("random_macro"))));

        let kirkman = load_suite_manifest(Path::new(
            "suites/stretch-kirkman-schoolgirls-time-solver3-path-control-high-event.yaml",
        ))
        .expect("kirkman high-event path-control suite should load");
        assert_eq!(
            kirkman.manifest.default_solver_family.as_deref(),
            Some("solver3")
        );
        assert_eq!(kirkman.cases.len(), 9);
        assert!(kirkman.cases.iter().any(|case| case
            .overrides
            .purpose
            .as_deref()
            .is_some_and(|purpose| purpose.contains("session_path"))));
        assert!(kirkman.cases.iter().any(|case| case
            .overrides
            .purpose
            .as_deref()
            .is_some_and(|purpose| purpose.contains("random_donor"))));
        assert!(kirkman.cases.iter().any(|case| case
            .overrides
            .purpose
            .as_deref()
            .is_some_and(|purpose| purpose.contains("random_macro"))));
    }

    #[test]
    fn loads_representative_case_manifest() {
        let case = load_case_manifest(Path::new(
            "cases/representative/small_workshop_balanced.json",
        ))
        .expect("representative case should load");

        assert_eq!(case.class, BenchmarkSuiteClass::Representative);
        assert_eq!(case.id, "representative.small-workshop-balanced");
        assert_eq!(
            canonical_solver_family_for_case(&case).expect("solver family"),
            "solver1"
        );
        assert!(!case
            .input
            .expect("input should exist")
            .problem
            .people
            .is_empty());
    }

    #[test]
    fn objective_canonical_v1_component_manifests_define_explicit_identity_and_budget_metadata() {
        let suite_paths = [
            "suites/objective-canonical-adversarial-v1.yaml",
            "suites/objective-canonical-stretch-v1.yaml",
        ];

        for suite_path in suite_paths {
            let suite = load_suite_manifest(Path::new(suite_path)).unwrap_or_else(|error| {
                panic!(
                    "objective canonical component manifest {} should load: {error}",
                    suite_path
                )
            });

            assert_eq!(
                effective_case_selection_policy(&suite.manifest),
                BenchmarkCaseSelectionPolicy::CanonicalOnly,
                "{} should stay canonical-only",
                suite_path
            );
            assert!(
                !suite.cases.is_empty(),
                "{} should contain cases",
                suite_path
            );
            assert!(
                suite.manifest.default_solver.is_none(),
                "{} should not pin full default_solver config for objective research",
                suite_path
            );

            for case in &suite.cases {
                assert_eq!(
                    case.overrides.case_role,
                    Some(BenchmarkCaseRole::Canonical),
                    "{} / {} should declare case_role: canonical",
                    suite_path,
                    case.manifest.id
                );
                assert!(
                    case.overrides
                        .purpose
                        .as_deref()
                        .is_some_and(|purpose| !purpose.trim().is_empty()),
                    "{} / {} should declare purpose",
                    suite_path,
                    case.manifest.id
                );
                assert!(
                    case.overrides
                        .provenance
                        .as_deref()
                        .is_some_and(|provenance| !provenance.trim().is_empty()),
                    "{} / {} should declare provenance",
                    suite_path,
                    case.manifest.id
                );

                let declared_budget =
                    case.overrides.declared_budget.as_ref().unwrap_or_else(|| {
                        panic!(
                            "{} / {} should declare declared_budget",
                            suite_path, case.manifest.id
                        )
                    });
                assert!(
                    declared_budget.max_iterations.is_some()
                        || declared_budget.time_limit_seconds.is_some(),
                    "{} / {} declared_budget should have at least one limit",
                    suite_path,
                    case.manifest.id
                );
                assert!(
                    case.overrides.max_iterations.is_some()
                        || case.overrides.time_limit_seconds.is_some(),
                    "{} / {} should set explicit effective budget overrides",
                    suite_path,
                    case.manifest.id
                );
                assert!(
                    case.overrides.seed.is_some(),
                    "{} / {} should set explicit seed policy in the suite contract",
                    suite_path,
                    case.manifest.id
                );
                assert!(
                    case.overrides.solver.is_none(),
                    "{} / {} should not replace the full solver config when the benchmark question is objective research",
                    suite_path,
                    case.manifest.id
                );
            }
        }
    }

    #[test]
    fn objective_fixed_iteration_diagnostic_manifests_define_explicit_identity_and_budget_metadata()
    {
        let suite_paths = [
            "suites/objective-diagnostic-fixed-iteration-adversarial-v1.yaml",
            "suites/objective-diagnostic-fixed-iteration-stretch-v1.yaml",
        ];

        for suite_path in suite_paths {
            let suite = load_suite_manifest(Path::new(suite_path)).unwrap_or_else(|error| {
                panic!(
                    "objective fixed-iteration manifest {} should load: {error}",
                    suite_path
                )
            });

            assert_eq!(
                effective_case_selection_policy(&suite.manifest),
                BenchmarkCaseSelectionPolicy::CanonicalOnly,
                "{} should stay canonical-only",
                suite_path
            );
            assert!(
                suite.manifest.default_solver.is_none(),
                "{} should not pin full default_solver config",
                suite_path
            );

            for case in &suite.cases {
                assert_eq!(
                    case.overrides.case_role,
                    Some(BenchmarkCaseRole::Canonical),
                    "{} / {} should stay canonical",
                    suite_path,
                    case.manifest.id
                );
                assert!(
                    case.overrides.seed.is_some(),
                    "{} / {} should declare explicit seed policy",
                    suite_path,
                    case.manifest.id
                );
                assert!(
                    case.overrides.max_iterations.is_some(),
                    "{} / {} should declare explicit fixed-iteration budget",
                    suite_path,
                    case.manifest.id
                );
                assert!(
                    case.overrides.time_limit_seconds.is_some(),
                    "{} / {} should declare explicit safety time limit",
                    suite_path,
                    case.manifest.id
                );
                assert!(
                    case.overrides.solver.is_none(),
                    "{} / {} should not replace the full solver config",
                    suite_path,
                    case.manifest.id
                );
            }
        }
    }

    #[test]
    fn objective_canonical_stretch_v1_uses_raw_sailing_case_without_solver3_override_claims() {
        let suite = load_suite_manifest(Path::new("suites/objective-canonical-stretch-v1.yaml"))
            .expect("objective stretch v1 suite should load");

        assert!(
            suite.manifest.default_solver_family.is_none(),
            "suite should not claim a global solver family override"
        );

        let sailing_case = suite
            .cases
            .iter()
            .find(|case| case.manifest.id == "stretch.sailing-trip-demo-real")
            .expect("stretch objective suite should include raw sailing case");

        assert_eq!(
            sailing_case.manifest.case_role,
            BenchmarkCaseRole::Canonical
        );
        assert!(
            sailing_case
                .overrides
                .manifest
                .ends_with("sailing_trip_demo_real.json"),
            "stretch objective suite should point at raw sailing case manifest"
        );
        assert!(
            !sailing_case.overrides.manifest.contains("benchmark_start"),
            "stretch objective suite must not substitute helper benchmark-start case"
        );
        assert!(
            sailing_case.overrides.solver_family.is_none()
                && sailing_case.overrides.solver.is_none(),
            "stretch objective suite should not imply solver3 raw-case path is already solved"
        );
    }

    #[test]
    fn solver3_canonical_sailing_trip_suites_target_raw_case_without_helper_substitution() {
        let suite_paths = [
            "suites/stretch-sailing-trip-demo-time-solver3-canonical.yaml",
            "suites/stretch-sailing-trip-demo-iterations-solver3-canonical.yaml",
        ];

        for suite_path in suite_paths {
            let suite = load_suite_manifest(Path::new(suite_path))
                .unwrap_or_else(|err| panic!("{suite_path} should load: {err}"));

            assert_eq!(
                effective_case_selection_policy(&suite.manifest),
                BenchmarkCaseSelectionPolicy::CanonicalOnly,
                "{suite_path} should enforce canonical-only case selection"
            );

            let sailing_case = suite
                .cases
                .iter()
                .find(|case| case.manifest.id == "stretch.sailing-trip-demo-real")
                .unwrap_or_else(|| panic!("{suite_path} should include raw sailing case"));

            assert_eq!(
                sailing_case.manifest.case_role,
                BenchmarkCaseRole::Canonical,
                "{suite_path} should classify sailing case as canonical"
            );
            assert!(
                sailing_case
                    .overrides
                    .manifest
                    .ends_with("sailing_trip_demo_real.json"),
                "{suite_path} should point at raw sailing case manifest"
            );
            assert!(
                !sailing_case.overrides.manifest.contains("benchmark_start"),
                "{suite_path} must not substitute helper benchmark-start case"
            );
        }
    }

    #[test]
    fn objective_canonical_stretch_v1_includes_social_golfer_and_large_heterogeneous_cases() {
        let suite = load_suite_manifest(Path::new("suites/objective-canonical-stretch-v1.yaml"))
            .expect("objective stretch v1 suite should load");

        let expected_cases = [
            (
                "stretch.social-golfer-32x8x10",
                "social_golfer_32x8x10.json",
                "objective_target.stretch.social_golfer_zero_repeat_encounters",
            ),
            (
                "stretch.large-gender-immovable-110p",
                "large_gender_immovable_110p.json",
                "objective_target.stretch.large_heterogeneous_attribute_balance_and_immovable",
            ),
        ];

        for (case_id, manifest_suffix, purpose) in expected_cases {
            let case = suite
                .cases
                .iter()
                .find(|case| case.manifest.id == case_id)
                .unwrap_or_else(|| panic!("stretch objective suite should include {case_id}"));

            assert_eq!(
                case.manifest.case_role,
                BenchmarkCaseRole::Canonical,
                "{case_id} should remain canonical"
            );
            assert!(
                case.overrides.manifest.ends_with(manifest_suffix),
                "{case_id} should point at {manifest_suffix}"
            );
            assert_eq!(
                case.overrides.purpose.as_deref(),
                Some(purpose),
                "{case_id} should expose expected canonical purpose"
            );
        }
    }

    #[test]
    fn synthetic_partial_attendance_capacity_case_is_large_session_aware_and_partial() {
        let case = load_case_manifest(Path::new(
            "cases/stretch/synthetic_partial_attendance_capacity_pressure_152p.json",
        ))
        .expect("synthetic partial-attendance stretch case should load");

        assert_eq!(
            case.id,
            "stretch.synthetic-partial-attendance-capacity-pressure-152p"
        );
        assert_eq!(case.class, BenchmarkSuiteClass::Stretch);
        assert_eq!(case.case_role, BenchmarkCaseRole::Canonical);

        let input = case
            .input
            .as_ref()
            .expect("synthetic stretch case should embed full solve input");
        assert_eq!(input.problem.people.len(), 152);
        assert_eq!(input.problem.num_sessions, 6);
        assert_eq!(input.problem.groups.len(), 12);

        let partial_people = input
            .problem
            .people
            .iter()
            .filter(|person| person.sessions.is_some())
            .count();
        assert!(
            partial_people >= 120,
            "expected most people to have explicit partial attendance; got {partial_people}"
        );

        let session_aware_groups = input
            .problem
            .groups
            .iter()
            .filter_map(|group| group.session_sizes.as_ref())
            .filter(|sizes| {
                sizes.iter().any(|size| *size == 0) && sizes.windows(2).any(|w| w[0] != w[1])
            })
            .count();
        assert!(
            session_aware_groups >= 6,
            "expected many groups to have strong session-specific capacities; got {session_aware_groups}"
        );

        let must_stay_count = input
            .constraints
            .iter()
            .filter(|constraint| {
                matches!(
                    constraint,
                    gm_core::models::Constraint::MustStayTogether { .. }
                )
            })
            .count();
        let immovable_count = input
            .constraints
            .iter()
            .filter(|constraint| {
                matches!(constraint, gm_core::models::Constraint::ImmovablePerson(_))
            })
            .count();
        let pair_meeting_count = input
            .constraints
            .iter()
            .filter(|constraint| {
                matches!(constraint, gm_core::models::Constraint::PairMeetingCount(_))
            })
            .count();
        assert!(must_stay_count >= 8);
        assert!(immovable_count >= 20);
        assert!(pair_meeting_count >= 10);
    }

    #[test]
    fn synthetic_partial_attendance_capacity_suite_declares_explicit_seed_and_budget() {
        let suite = load_suite_manifest(Path::new(
            "suites/stretch-partial-attendance-capacity-pressure-time.yaml",
        ))
        .expect("synthetic partial-attendance fixed-time suite should load");
        assert_eq!(suite.cases.len(), 1);
        let case = &suite.cases[0];
        assert_eq!(
            case.manifest.id,
            "stretch.synthetic-partial-attendance-capacity-pressure-152p"
        );
        assert_eq!(case.overrides.seed, Some(152605));
        assert_eq!(case.overrides.max_iterations, Some(4_500_000));
        assert_eq!(case.overrides.time_limit_seconds, Some(15));
    }

    #[test]
    fn synthetic_partial_attendance_keep_apart_case_adds_hard_apart_pressure() {
        let case = load_case_manifest(Path::new(
            "cases/stretch/synthetic_partial_attendance_keep_apart_capacity_pressure_152p.json",
        ))
        .expect("synthetic partial-attendance keep-apart stretch case should load");

        assert_eq!(
            case.id,
            "stretch.synthetic-partial-attendance-keep-apart-capacity-pressure-152p"
        );
        assert_eq!(case.class, BenchmarkSuiteClass::Stretch);
        assert_eq!(case.case_role, BenchmarkCaseRole::Canonical);

        let input = case
            .input
            .as_ref()
            .expect("synthetic keep-apart stretch case should embed full solve input");
        assert_eq!(input.problem.people.len(), 152);
        assert_eq!(input.problem.num_sessions, 6);
        assert_eq!(input.problem.groups.len(), 12);

        let hard_apart_count = input
            .constraints
            .iter()
            .filter(|constraint| {
                matches!(
                    constraint,
                    gm_core::models::Constraint::MustStayApart { .. }
                )
            })
            .count();
        let hard_apart_session_windows = input
            .constraints
            .iter()
            .filter_map(|constraint| match constraint {
                gm_core::models::Constraint::MustStayApart { sessions, .. } => {
                    Some(sessions.as_ref().map_or(6, |sessions| sessions.len()))
                }
                _ => None,
            })
            .collect::<Vec<_>>();
        assert_eq!(hard_apart_count, 24);
        assert!(
            hard_apart_session_windows
                .iter()
                .all(|window_len| *window_len >= 2),
            "all MustStayApart windows should cover at least two sessions"
        );
    }

    #[test]
    fn synthetic_partial_attendance_keep_apart_solver3_suites_declare_explicit_seed_and_budget() {
        let fixed_time = load_suite_manifest(Path::new(
            "suites/stretch-partial-attendance-keep-apart-capacity-pressure-time-10s-solver3.yaml",
        ))
        .expect("synthetic partial-attendance keep-apart 10s suite should load");
        assert_eq!(fixed_time.cases.len(), 1);
        assert_eq!(
            fixed_time.cases[0].manifest.id,
            "stretch.synthetic-partial-attendance-keep-apart-capacity-pressure-152p"
        );
        assert_eq!(fixed_time.cases[0].overrides.seed, Some(152705));
        assert_eq!(
            fixed_time.cases[0].overrides.max_iterations,
            Some(10_000_000)
        );
        assert_eq!(fixed_time.cases[0].overrides.time_limit_seconds, Some(10));

        let fixed_iteration = load_suite_manifest(Path::new(
            "suites/stretch-partial-attendance-keep-apart-capacity-pressure-iterations-1m-solver3.yaml",
        ))
        .expect("synthetic partial-attendance keep-apart 1M suite should load");
        assert_eq!(fixed_iteration.cases.len(), 1);
        assert_eq!(
            fixed_iteration.cases[0].manifest.id,
            "stretch.synthetic-partial-attendance-keep-apart-capacity-pressure-152p"
        );
        assert_eq!(fixed_iteration.cases[0].overrides.seed, Some(152705));
        assert_eq!(
            fixed_iteration.cases[0].overrides.max_iterations,
            Some(1_000_000)
        );
        assert_eq!(
            fixed_iteration.cases[0].overrides.time_limit_seconds,
            Some(120)
        );
    }

    #[test]
    fn search_iteration_suites_require_at_least_ten_thousand_measured_iterations() {
        let temp = TempDir::new().expect("temp dir");
        let suite_dir = temp.path().join("suites");
        let case_dir = temp.path().join("cases/hotpath");
        fs::create_dir_all(&suite_dir).expect("mk suite dir");
        fs::create_dir_all(&case_dir).expect("mk case dir");

        let case_path = case_dir.join("search_iteration_case.json");
        fs::write(
            &case_path,
            serde_json::to_string_pretty(&serde_json::json!({
                "schema_version": 1,
                "id": "hotpath.search-iteration.min-iterations-check",
                "class": "representative",
                "solver_family": "solver3",
                "title": "Hotpath search iteration minimum iteration check",
                "description": "Validation fixture for search_iteration minimum measured iterations.",
                "tags": ["hotpath", "search", "solver3"],
                "hotpath_preset": "search_sailing_trip_demo_real_solver3"
            }))
            .expect("serialize case"),
        )
        .expect("write case");

        let suite_path = suite_dir.join("hotpath-search-iteration-too-small.yaml");
        fs::write(
            &suite_path,
            [
                "schema_version: 1",
                "suite_id: hotpath-search-iteration-too-small",
                "benchmark_mode: search_iteration",
                "class: representative",
                "default_iterations: 9999",
                "default_warmup_iterations: 1",
                "cases:",
                "  - manifest: ../cases/hotpath/search_iteration_case.json",
            ]
            .join("\n"),
        )
        .expect("write suite");

        let error = load_suite_manifest(&suite_path).unwrap_err();
        assert!(
            error.to_string().contains("at least 10000 iterations"),
            "unexpected error: {error}"
        );
    }

    #[test]
    fn built_in_search_iteration_suites_declare_honest_iteration_counts() {
        let representative = load_suite_manifest(Path::new("suites/hotpath-search-iteration.yaml"))
            .expect("representative search-iteration suite should load");
        assert_eq!(representative.manifest.default_iterations, Some(10_000));

        let sailing_trip = load_suite_manifest(Path::new(
            "suites/hotpath-search-iteration-sailing-trip-demo-solver3.yaml",
        ))
        .expect("sailing-trip solver3 search-iteration suite should load");
        assert_eq!(sailing_trip.manifest.default_iterations, Some(10_000));
    }

    #[test]
    fn kirkman_schoolgirls_case_and_suite_load_with_explicit_budget() {
        let case = load_case_manifest(Path::new("cases/stretch/kirkman_schoolgirls_15x5x7.json"))
            .expect("kirkman schoolgirls case should load");

        assert_eq!(case.id, "stretch.kirkman-schoolgirls-15x5x7");
        assert_eq!(case.class, BenchmarkSuiteClass::Stretch);
        assert_eq!(case.case_role, BenchmarkCaseRole::Canonical);

        let input = case.input.as_ref().expect("case should embed input");
        assert_eq!(input.problem.people.len(), 15);
        assert_eq!(input.problem.groups.len(), 5);
        assert_eq!(input.problem.num_sessions, 7);
        assert_eq!(input.constraints.len(), 1);

        let suite = load_suite_manifest(Path::new("suites/stretch-kirkman-schoolgirls-time.yaml"))
            .expect("kirkman schoolgirls suite should load");

        assert_eq!(suite.cases.len(), 1);
        let suite_case = &suite.cases[0];
        assert_eq!(suite_case.manifest.id, "stretch.kirkman-schoolgirls-15x5x7");
        assert_eq!(suite_case.overrides.seed, Some(150507));
        assert_eq!(suite_case.overrides.max_iterations, Some(1_500_000));
        assert_eq!(suite_case.overrides.time_limit_seconds, Some(10));
    }

    #[test]
    fn solver3_objective_autoresearch_suites_pin_solver3_and_include_synthetic() {
        let fixed_time_adversarial = load_suite_manifest(Path::new(
            "suites/objective-canonical-adversarial-solver3-v1.yaml",
        ))
        .expect("solver3 fixed-time adversarial suite should load");
        assert_eq!(
            fixed_time_adversarial
                .manifest
                .default_solver_family
                .as_deref(),
            Some("solver3")
        );
        assert!(fixed_time_adversarial
            .cases
            .iter()
            .all(|case| case.manifest.class == BenchmarkSuiteClass::Adversarial));

        let fixed_time_stretch = load_suite_manifest(Path::new(
            "suites/objective-canonical-stretch-solver3-v1.yaml",
        ))
        .expect("solver3 fixed-time stretch suite should load");
        assert_eq!(
            fixed_time_stretch.manifest.default_solver_family.as_deref(),
            Some("solver3")
        );
        assert!(fixed_time_stretch.cases.iter().any(|case| {
            case.manifest.id == "stretch.synthetic-partial-attendance-capacity-pressure-152p"
        }));

        let fixed_iteration_stretch = load_suite_manifest(Path::new(
            "suites/objective-diagnostic-fixed-iteration-stretch-solver3-v1.yaml",
        ))
        .expect("solver3 fixed-iteration stretch suite should load");
        assert_eq!(
            fixed_iteration_stretch
                .manifest
                .default_solver_family
                .as_deref(),
            Some("solver3")
        );
        assert!(fixed_iteration_stretch.cases.iter().any(|case| {
            case.manifest.id == "stretch.synthetic-partial-attendance-capacity-pressure-152p"
        }));

        let correctness = load_suite_manifest(Path::new(
            "suites/correctness-edge-intertwined-solver3-v1.yaml",
        ))
        .expect("solver3 correctness suite should load");
        assert_eq!(
            correctness.manifest.default_solver_family.as_deref(),
            Some("solver3")
        );
        assert_eq!(
            correctness.manifest.comparison_category,
            BenchmarkComparisonCategory::InvariantOnly
        );
        assert!(correctness.cases.iter().any(|case| {
            case.manifest.id == "adversarial.correctness-partial-attendance-keep-apart-stress"
        }));
    }

    #[test]
    fn solver3_broad_multiseed_autoresearch_suites_pin_solver3_and_cover_broad_portfolio() {
        let representative = load_suite_manifest(Path::new(
            "suites/objective-canonical-representative-solver3-broad-multiseed-v1.yaml",
        ))
        .expect("solver3 broad multiseed representative suite should load");
        assert_eq!(
            representative.manifest.default_solver_family.as_deref(),
            Some("solver3")
        );
        assert_eq!(representative.cases.len(), 8);
        assert!(representative.cases.iter().all(|case| {
            case.overrides.seed.is_some()
                && matches!(case.manifest.class, BenchmarkSuiteClass::Representative)
        }));

        let adversarial = load_suite_manifest(Path::new(
            "suites/objective-canonical-adversarial-solver3-broad-multiseed-v1.yaml",
        ))
        .expect("solver3 broad multiseed adversarial suite should load");
        assert_eq!(
            adversarial.manifest.default_solver_family.as_deref(),
            Some("solver3")
        );
        assert_eq!(adversarial.cases.len(), 8);
        assert!(adversarial.cases.iter().all(|case| {
            case.overrides.seed.is_some()
                && matches!(case.manifest.class, BenchmarkSuiteClass::Adversarial)
        }));

        let stretch = load_suite_manifest(Path::new(
            "suites/objective-canonical-stretch-solver3-broad-multiseed-v1.yaml",
        ))
        .expect("solver3 broad multiseed stretch suite should load");
        assert_eq!(
            stretch.manifest.default_solver_family.as_deref(),
            Some("solver3")
        );
        assert_eq!(stretch.cases.len(), 24);
        assert!(stretch
            .cases
            .iter()
            .any(|case| { case.manifest.id == "stretch.kirkman-schoolgirls-15x5x7" }));
        assert!(stretch.cases.iter().any(|case| {
            case.manifest.id
                == "stretch.synthetic-partial-attendance-keep-apart-capacity-pressure-152p"
        }));
        assert!(stretch.cases.iter().all(|case| {
            case.overrides.seed.is_some()
                && matches!(case.manifest.class, BenchmarkSuiteClass::Stretch)
        }));
    }

    #[test]
    fn solver3_metaheuristic_autoresearch_suites_pin_solver3_and_cover_feature_surface() {
        let fixed_time_representative = load_suite_manifest(Path::new(
            "suites/objective-canonical-representative-solver3-metaheuristic-v1.yaml",
        ))
        .expect("solver3 metaheuristic fixed-time representative suite should load");
        assert_eq!(
            fixed_time_representative
                .manifest
                .default_solver_family
                .as_deref(),
            Some("solver3")
        );
        assert!(fixed_time_representative
            .cases
            .iter()
            .any(|case| { case.manifest.id == "representative.small-workshop-balanced" }));
        assert!(fixed_time_representative
            .cases
            .iter()
            .any(|case| { case.manifest.id == "representative.small-workshop-constrained" }));

        let fixed_time_adversarial = load_suite_manifest(Path::new(
            "suites/objective-canonical-adversarial-solver3-metaheuristic-v1.yaml",
        ))
        .expect("solver3 metaheuristic fixed-time adversarial suite should load");
        assert_eq!(
            fixed_time_adversarial
                .manifest
                .default_solver_family
                .as_deref(),
            Some("solver3")
        );
        assert!(fixed_time_adversarial
            .cases
            .iter()
            .any(|case| { case.manifest.id == "adversarial.clique-swap-functionality-35p" }));
        assert!(fixed_time_adversarial
            .cases
            .iter()
            .any(|case| { case.manifest.id == "adversarial.transfer-attribute-balance-111p" }));

        let fixed_time_stretch = load_suite_manifest(Path::new(
            "suites/objective-canonical-stretch-zero-repeat-solver3-metaheuristic-v1.yaml",
        ))
        .expect("solver3 metaheuristic fixed-time zero-repeat stretch suite should load");
        assert_eq!(
            fixed_time_stretch.manifest.default_solver_family.as_deref(),
            Some("solver3")
        );
        assert!(fixed_time_stretch
            .cases
            .iter()
            .any(|case| { case.manifest.id == "stretch.social-golfer-32x8x10" }));
        assert!(fixed_time_stretch
            .cases
            .iter()
            .any(|case| { case.manifest.id == "stretch.kirkman-schoolgirls-15x5x7" }));
        assert!(!fixed_time_stretch
            .cases
            .iter()
            .any(|case| { case.manifest.id == "stretch.large-gender-immovable-110p" }));

        let fixed_time_stretch_feature_rich = load_suite_manifest(Path::new(
            "suites/objective-canonical-stretch-feature-rich-solver3-metaheuristic-v1.yaml",
        ))
        .expect("solver3 metaheuristic fixed-time feature-rich stretch suite should load");
        assert_eq!(
            fixed_time_stretch_feature_rich
                .manifest
                .default_solver_family
                .as_deref(),
            Some("solver3")
        );
        assert!(fixed_time_stretch_feature_rich
            .cases
            .iter()
            .any(|case| { case.manifest.id == "stretch.large-gender-immovable-110p" }));
        assert!(fixed_time_stretch_feature_rich
            .cases
            .iter()
            .any(|case| { case.manifest.id == "stretch.sailing-trip-demo-real" }));
        assert!(fixed_time_stretch_feature_rich.cases.iter().any(|case| {
            case.manifest.id == "stretch.synthetic-partial-attendance-capacity-pressure-152p"
        }));

        let fixed_iteration_stretch = load_suite_manifest(Path::new(
            "suites/objective-diagnostic-fixed-iteration-stretch-zero-repeat-solver3-metaheuristic-v1.yaml",
        ))
        .expect("solver3 metaheuristic fixed-iteration zero-repeat stretch suite should load");
        assert_eq!(
            fixed_iteration_stretch
                .manifest
                .default_solver_family
                .as_deref(),
            Some("solver3")
        );
        assert!(fixed_iteration_stretch
            .cases
            .iter()
            .any(|case| { case.manifest.id == "stretch.kirkman-schoolgirls-15x5x7" }));
        assert!(!fixed_iteration_stretch
            .cases
            .iter()
            .any(|case| { case.manifest.id == "stretch.large-gender-immovable-110p" }));
        assert!(!fixed_iteration_stretch.cases.iter().any(|case| {
            case.manifest.id == "stretch.synthetic-partial-attendance-capacity-pressure-152p"
        }));

        let fixed_iteration_stretch_feature_rich = load_suite_manifest(Path::new(
            "suites/objective-diagnostic-fixed-iteration-stretch-feature-rich-solver3-metaheuristic-v1.yaml",
        ))
        .expect("solver3 metaheuristic fixed-iteration feature-rich stretch suite should load");
        assert_eq!(
            fixed_iteration_stretch_feature_rich
                .manifest
                .default_solver_family
                .as_deref(),
            Some("solver3")
        );
        assert!(fixed_iteration_stretch_feature_rich
            .cases
            .iter()
            .any(|case| { case.manifest.id == "stretch.large-gender-immovable-110p" }));
        assert!(fixed_iteration_stretch_feature_rich
            .cases
            .iter()
            .any(|case| {
                case.manifest.id == "stretch.synthetic-partial-attendance-capacity-pressure-152p"
            }));
    }

    #[test]
    fn synthetic_partial_attendance_capacity_solver3_suite_declares_solver3_contract() {
        let suite = load_suite_manifest(Path::new(
            "suites/stretch-partial-attendance-capacity-pressure-time-solver3.yaml",
        ))
        .expect("synthetic partial-attendance solver3 suite should load");

        assert_eq!(
            suite.manifest.default_solver_family.as_deref(),
            Some("solver3")
        );
        let default_solver = suite
            .manifest
            .default_solver
            .as_ref()
            .expect("solver3 suite should define default solver");
        assert_eq!(default_solver.solver_type, "solver3");
        assert_eq!(default_solver.stop_conditions.time_limit_seconds, Some(15));

        assert_eq!(suite.cases.len(), 1);
        assert_eq!(
            suite.cases[0].manifest.id,
            "stretch.synthetic-partial-attendance-capacity-pressure-152p"
        );
    }

    #[test]
    fn objective_canonical_adversarial_v1_includes_only_hard_current_adversarial_cases() {
        let suite =
            load_suite_manifest(Path::new("suites/objective-canonical-adversarial-v1.yaml"))
                .expect("objective adversarial v1 suite should load");

        let expected_cases = [
            (
                "adversarial.clique-swap-functionality-35p",
                "clique_swap_functionality_35p.json",
                "objective_target.adversarial.clique_integrity_and_department_balance_35p",
            ),
            (
                "adversarial.transfer-attribute-balance-111p",
                "transfer_attribute_balance_111p.json",
                "objective_target.adversarial.large_attribute_balance_111p",
            ),
        ];

        assert_eq!(suite.cases.len(), expected_cases.len());

        for (case_id, manifest_suffix, purpose) in expected_cases {
            let case = suite
                .cases
                .iter()
                .find(|case| case.manifest.id == case_id)
                .unwrap_or_else(|| panic!("adversarial objective suite should include {case_id}"));

            assert_eq!(case.manifest.case_role, BenchmarkCaseRole::Canonical);
            assert!(case.overrides.manifest.ends_with(manifest_suffix));
            assert_eq!(case.overrides.purpose.as_deref(), Some(purpose));
        }

        assert!(suite
            .cases
            .iter()
            .all(|case| case.manifest.id != "adversarial.constraint-heavy-partial-attendance"));
    }

    #[test]
    fn correctness_edge_intertwined_suite_is_distinct_from_canonical_objective_bundle() {
        let suite = load_suite_manifest(Path::new("suites/correctness-edge-intertwined-v1.yaml"))
            .expect("correctness edge-case suite should load");

        assert_eq!(suite.manifest.class, BenchmarkSuiteClass::Adversarial);
        assert_eq!(
            suite.manifest.comparison_category,
            BenchmarkComparisonCategory::InvariantOnly
        );
        assert_eq!(
            effective_case_selection_policy(&suite.manifest),
            BenchmarkCaseSelectionPolicy::AllowNonCanonical
        );
        assert!(
            !suite.cases.is_empty(),
            "correctness edge-case suite should include at least one case"
        );

        for case in &suite.cases {
            assert_eq!(
                case.overrides.case_role,
                Some(BenchmarkCaseRole::Canonical),
                "correctness corpus uses exact curated scenarios for its own benchmark question"
            );
            assert!(
                case.overrides
                    .purpose
                    .as_deref()
                    .is_some_and(|purpose| purpose.starts_with("correctness_edge.")),
                "{} should declare a correctness-edge purpose",
                case.manifest.id
            );
            assert!(
                case.overrides
                    .provenance
                    .as_deref()
                    .is_some_and(|provenance| provenance.contains("backend/core/tests/test_cases/")),
                "{} should document reused core test-case provenance",
                case.manifest.id
            );
            assert!(
                case.overrides.declared_budget.is_some(),
                "{} should declare an explicit benchmark budget",
                case.manifest.id
            );
        }
    }

    #[test]
    fn hotpath_cases_must_declare_solver_family_explicitly() {
        let temp = TempDir::new().expect("temp dir");
        let case_path = temp.path().join("hotpath-case.json");
        fs::write(
            &case_path,
            serde_json::to_string_pretty(&serde_json::json!({
                "schema_version": 1,
                "id": "hotpath.swap-preview.default",
                "class": "representative",
                "hotpath_preset": "swap_default"
            }))
            .expect("serialize case"),
        )
        .expect("write case");

        let error = load_case_manifest(&case_path).expect_err("manifest should be rejected");
        assert!(error
            .to_string()
            .contains("must declare solver_family when using hotpath_preset"));
    }

    #[test]
    fn non_canonical_cases_must_point_back_to_a_canonical_case() {
        let temp = TempDir::new().expect("temp dir");
        let case_path = temp.path().join("derived-case.json");
        fs::write(
            &case_path,
            serde_json::to_string_pretty(&serde_json::json!({
                "schema_version": 1,
                "id": "stretch.derived-case",
                "class": "stretch",
                "case_role": "derived",
                "input": {
                    "initial_schedule": null,
                    "problem": {
                        "people": [{"id": "p0", "attributes": {}}],
                        "groups": [{"id": "g0", "size": 1}],
                        "num_sessions": 1
                    },
                    "objectives": [],
                    "constraints": [],
                    "solver": {
                        "solver_type": "solver1",
                        "stop_conditions": {"max_iterations": 1, "time_limit_seconds": null, "no_improvement_iterations": null},
                        "solver_params": {"solver_type": "SimulatedAnnealing", "initial_temperature": 1.0, "final_temperature": 0.1, "cooling_schedule": "geometric", "reheat_after_no_improvement": 0, "reheat_cycles": 0},
                        "logging": {},
                        "telemetry": {},
                        "seed": 1,
                        "move_policy": null,
                        "allowed_sessions": null
                    }
                }
            }))
            .expect("serialize case"),
        )
        .expect("write case");

        let error = load_case_manifest(&case_path).expect_err("manifest should be rejected");
        assert!(error.to_string().contains("does not set canonical_case_id"));
    }

    #[test]
    fn canonical_cases_must_not_set_canonical_case_id() {
        let temp = TempDir::new().expect("temp dir");
        let case_path = temp.path().join("canonical-case.json");
        fs::write(
            &case_path,
            serde_json::to_string_pretty(&serde_json::json!({
                "schema_version": 1,
                "id": "representative.example",
                "class": "representative",
                "case_role": "canonical",
                "canonical_case_id": "representative.other",
                "input": {
                    "initial_schedule": null,
                    "problem": {
                        "people": [{"id": "p0", "attributes": {}}],
                        "groups": [{"id": "g0", "size": 1}],
                        "num_sessions": 1
                    },
                    "objectives": [],
                    "constraints": [],
                    "solver": {
                        "solver_type": "solver1",
                        "stop_conditions": {"max_iterations": 1, "time_limit_seconds": null, "no_improvement_iterations": null},
                        "solver_params": {"solver_type": "SimulatedAnnealing", "initial_temperature": 1.0, "final_temperature": 0.1, "cooling_schedule": "geometric", "reheat_after_no_improvement": 0, "reheat_cycles": 0},
                        "logging": {},
                        "telemetry": {},
                        "seed": 1,
                        "move_policy": null,
                        "allowed_sessions": null
                    }
                }
            }))
            .expect("serialize case"),
        )
        .expect("write case");

        let error = load_case_manifest(&case_path).expect_err("manifest should be rejected");
        assert!(error
            .to_string()
            .contains("declares canonical case_role but also sets canonical_case_id"));
    }

    #[test]
    fn suite_case_overrides_validate_declared_budget_metadata() {
        let temp = TempDir::new().expect("temp dir");
        let suite_path = temp.path().join("suite.yaml");
        fs::write(
            &suite_path,
            r#"schema_version: 1
suite_id: test-suite
benchmark_mode: full_solve
class: representative
cases:
  - manifest: ../cases/representative/small_workshop_balanced.json
    declared_budget: {}
"#,
        )
        .expect("write suite");

        let error = load_suite_manifest(&suite_path).expect_err("suite should be rejected");
        assert!(error
            .to_string()
            .contains("declares an empty declared_budget"));
    }

    #[test]
    fn suite_search_policy_must_not_be_empty() {
        let temp = TempDir::new().expect("temp dir");
        let suite_path = temp.path().join("suite.yaml");
        fs::write(
            &suite_path,
            r#"schema_version: 1
suite_id: test-suite
benchmark_mode: full_solve
class: representative
default_search_policy: {}
cases:
  - manifest: ../cases/representative/small_workshop_balanced.json
"#,
        )
        .expect("write suite");

        let error = load_suite_manifest(&suite_path).expect_err("suite should be rejected");
        assert!(error.to_string().contains("default_search_policy is empty"));
    }

    #[test]
    fn search_policy_can_explicitly_clear_no_improvement_iterations() {
        let temp = TempDir::new().expect("temp dir");
        let suite_path = temp.path().join("suite.yaml");
        let case_path = temp.path().join("case.json");
        fs::write(
            &case_path,
            serde_json::to_string_pretty(&serde_json::json!({
                "schema_version": 1,
                "id": "representative.search-policy-clear-case",
                "class": "representative",
                "input": {
                    "initial_schedule": null,
                    "problem": {
                        "people": [{"id": "p0", "attributes": {}}, {"id": "p1", "attributes": {}}],
                        "groups": [{"id": "g0", "size": 2}],
                        "num_sessions": 1
                    },
                    "objectives": [],
                    "constraints": [],
                    "solver": {
                        "solver_type": "solver1",
                        "stop_conditions": {"max_iterations": 1, "time_limit_seconds": null, "no_improvement_iterations": 1},
                        "solver_params": {"solver_type": "SimulatedAnnealing", "initial_temperature": 1.0, "final_temperature": 0.1, "cooling_schedule": "geometric", "reheat_after_no_improvement": 0, "reheat_cycles": 0},
                        "logging": {},
                        "telemetry": {},
                        "seed": 1,
                        "move_policy": null,
                        "allowed_sessions": null
                    }
                }
            }))
            .expect("serialize case"),
        )
        .expect("write case");
        fs::write(
            &suite_path,
            format!(
                r#"schema_version: 1
suite_id: test-suite
benchmark_mode: full_solve
class: representative
cases:
  - manifest: {}
    search_policy:
      no_improvement_iterations: null
"#,
                case_path.display()
            ),
        )
        .expect("write suite");

        let suite = load_suite_manifest(&suite_path).expect("suite should load");
        assert_eq!(
            suite.cases[0].overrides.search_policy,
            Some(BenchmarkSearchPolicyOverride {
                no_improvement_iterations: NullableU64Override::Clear,
                simulated_annealing: None,
            })
        );
    }

    fn write_minimal_helper_case(path: &Path) {
        fs::write(
            path,
            serde_json::to_string_pretty(&serde_json::json!({
                "schema_version": 1,
                "id": "stretch.helper-case",
                "class": "stretch",
                "case_role": "helper",
                "canonical_case_id": "stretch.real-case",
                "input": {
                    "initial_schedule": null,
                    "problem": {
                        "people": [{"id": "p0", "attributes": {}}],
                        "groups": [{"id": "g0", "size": 1}],
                        "num_sessions": 1
                    },
                    "objectives": [],
                    "constraints": [],
                    "solver": {
                        "solver_type": "solver1",
                        "stop_conditions": {"max_iterations": 1, "time_limit_seconds": null, "no_improvement_iterations": null},
                        "solver_params": {"solver_type": "SimulatedAnnealing", "initial_temperature": 1.0, "final_temperature": 0.1, "cooling_schedule": "geometric", "reheat_after_no_improvement": 0, "reheat_cycles": 0},
                        "logging": {},
                        "telemetry": {},
                        "seed": 1,
                        "move_policy": null,
                        "allowed_sessions": null
                    }
                }
            }))
            .expect("serialize case"),
        )
        .expect("write case");
    }

    #[test]
    fn canonical_score_quality_suite_rejects_helper_case() {
        let temp = TempDir::new().expect("temp dir");
        let suite_path = temp.path().join("suite.yaml");
        let case_path = temp.path().join("helper-case.json");

        write_minimal_helper_case(&case_path);

        fs::write(
            &suite_path,
            format!(
                "schema_version: 1\nsuite_id: canonical-default-suite\nbenchmark_mode: full_solve\ncomparison_category: score_quality\nclass: stretch\ncases:\n  - manifest: {}\n",
                case_path.display()
            ),
        )
        .expect("write suite");

        let error = load_suite_manifest(&suite_path)
            .expect_err("helper-start suite should be rejected without explicit override");

        assert!(error.to_string().contains("rejects non-canonical case"));
    }

    #[test]
    fn helper_suites_can_opt_into_non_canonical_cases() {
        let temp = TempDir::new().expect("temp dir");
        let suite_path = temp.path().join("suite.yaml");
        let case_path = temp.path().join("case.json");

        write_minimal_helper_case(&case_path);

        fs::write(
            &suite_path,
            format!(
                "schema_version: 1\nsuite_id: helper-suite\nbenchmark_mode: full_solve\ncomparison_category: score_quality\nclass: stretch\ncase_selection_policy: allow_non_canonical\ncases:\n  - manifest: {}\n",
                case_path.display()
            ),
        )
        .expect("write suite");

        let suite = load_suite_manifest(&suite_path).expect("helper suite should load");
        assert_eq!(
            effective_case_selection_policy(&suite.manifest),
            BenchmarkCaseSelectionPolicy::AllowNonCanonical
        );
    }

    #[test]
    fn multi_root_balanced_inheritance_suites_load() {
        for relative in [
            "../benchmarking/suites/solver3-multi-root-balanced-inheritance-multiseed.yaml",
            "../benchmarking/suites/social-golfer-plateau-time-solver3-multi-root-balanced-inheritance-high-event.yaml",
            "../benchmarking/suites/stretch-kirkman-schoolgirls-time-solver3-multi-root-balanced-inheritance-high-event.yaml",
        ] {
            let suite = load_suite_manifest(relative).expect("suite should load");
            assert_eq!(suite.manifest.default_solver_family.as_deref(), Some("solver3"));
            assert!(!suite.cases.is_empty());
        }
    }
}
