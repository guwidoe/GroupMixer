use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use solver_core::models::{ApiInput, MovePolicy};
use std::fs;
use std::path::{Path, PathBuf};

pub const SUITE_SCHEMA_VERSION: u32 = 1;
pub const CASE_SCHEMA_VERSION: u32 = 1;

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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BenchmarkSuiteManifest {
    pub schema_version: u32,
    pub suite_id: String,
    pub class: BenchmarkSuiteClass,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub default_seed: Option<u64>,
    #[serde(default)]
    pub default_max_iterations: Option<u64>,
    #[serde(default)]
    pub default_time_limit_seconds: Option<u64>,
    #[serde(default)]
    pub default_move_policy: Option<MovePolicy>,
    pub cases: Vec<BenchmarkCaseOverride>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BenchmarkCaseOverride {
    pub manifest: String,
    #[serde(default)]
    pub case_id: Option<String>,
    #[serde(default)]
    pub seed: Option<u64>,
    #[serde(default)]
    pub max_iterations: Option<u64>,
    #[serde(default)]
    pub time_limit_seconds: Option<u64>,
    #[serde(default)]
    pub move_policy: Option<MovePolicy>,
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
    pub family: Option<String>,
    #[serde(default)]
    pub paths: Vec<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    pub input: ApiInput,
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
    pub manifest: BenchmarkCaseManifest,
    pub overrides: BenchmarkCaseOverride,
}

pub fn load_suite_manifest(path: impl AsRef<Path>) -> Result<LoadedBenchmarkSuite> {
    let path = path.as_ref();
    let suite_contents = fs::read_to_string(path)
        .with_context(|| format!("failed to read benchmark suite manifest {}", path.display()))?;
    let manifest: BenchmarkSuiteManifest =
        serde_yaml::from_str(&suite_contents).with_context(|| {
            format!("failed to parse benchmark suite manifest {}", path.display())
        })?;

    validate_suite_manifest(path, &manifest)?;

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
        cases.push(LoadedBenchmarkCase {
            manifest_path: case_path,
            manifest: case_manifest,
            overrides: case_override.clone(),
        });
    }

    if cases.is_empty() {
        bail!("benchmark suite {} does not enable any cases", manifest.suite_id);
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
        bail!("benchmark suite manifest {} is missing suite_id", path.display());
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
    if manifest.input.solver.solver_type.trim().is_empty() {
        bail!(
            "benchmark case manifest {} has empty solver type in input",
            path.display()
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn loads_path_suite_and_resolves_case_manifests() {
        let suite = load_suite_manifest(Path::new("../benchmarking/suites/path.yaml"))
            .expect("path suite should load");

        assert_eq!(suite.manifest.suite_id, "path");
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
            "../benchmarking/cases/representative/small_workshop_balanced.json",
        ))
        .expect("representative case should load");

        assert_eq!(case.class, BenchmarkSuiteClass::Representative);
        assert_eq!(case.id, "representative.small-workshop-balanced");
        assert!(!case.input.problem.people.is_empty());
    }
}
