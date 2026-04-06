use crate::artifacts::BenchmarkComparisonCategory;
use crate::benchmark_mode::{
    default_benchmark_mode, is_hotpath_benchmark_mode, is_supported_benchmark_mode,
};
use anyhow::{bail, Context, Result};
use gm_core::models::{ApiInput, MovePolicy, SolverConfiguration, SolverKind};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Component, Path, PathBuf};

pub const SUITE_SCHEMA_VERSION: u32 = 1;
pub const CASE_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash, Ord, PartialOrd)]
#[serde(rename_all = "snake_case")]
pub enum BenchmarkCaseSelectionPolicy {
    CanonicalOnly,
    AllowNonCanonical,
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

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash, Ord, PartialOrd)]
#[serde(rename_all = "snake_case")]
pub enum BenchmarkSuiteClass {
    Path,
    Representative,
    Stretch,
    Adversarial,
}

impl BenchmarkSuiteClass {
    pub const ALL: [Self; 4] = [
        Self::Path,
        Self::Representative,
        Self::Stretch,
        Self::Adversarial,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Path => "path",
            Self::Representative => "representative",
            Self::Stretch => "stretch",
            Self::Adversarial => "adversarial",
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
    pub default_move_policy: Option<MovePolicy>,
    #[serde(default)]
    pub default_iterations: Option<u64>,
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
        if case_manifest.class != manifest.class {
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
            "suites/objective-canonical-representative-v1.yaml",
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
}
