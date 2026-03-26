use crate::artifacts::{MachineIdentity, RunReport};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

const DEFAULT_ARTIFACTS_DIR: &str = "benchmarking/artifacts";
const ARTIFACTS_DIR_ENV: &str = "GROUPMIXER_BENCHMARK_ARTIFACTS_DIR";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BenchmarkStorage {
    root: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MachineRecord {
    pub machine: MachineIdentity,
    #[serde(default)]
    pub last_seen_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BaselineDescriptor {
    pub machine_id: String,
    pub suite_id: String,
    pub baseline_name: String,
    pub path: PathBuf,
}

impl BenchmarkStorage {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    pub fn from_env_or_default() -> Self {
        Self::new(
            env::var(ARTIFACTS_DIR_ENV)
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from(DEFAULT_ARTIFACTS_DIR)),
        )
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn runs_dir(&self) -> PathBuf {
        self.root.join("runs")
    }

    pub fn comparisons_dir(&self) -> PathBuf {
        self.root.join("comparisons")
    }

    pub fn recordings_dir(&self) -> PathBuf {
        self.root.join("recordings")
    }

    pub fn index_dir(&self) -> PathBuf {
        self.root.join("index")
    }

    pub fn refs_dir(&self) -> PathBuf {
        self.root.join("refs")
    }

    pub fn machines_dir(&self) -> PathBuf {
        self.root.join("machines")
    }

    pub fn baselines_root_dir(&self) -> PathBuf {
        self.root.join("baselines")
    }

    pub fn ensure_layout(&self) -> Result<()> {
        for dir in [
            self.root(),
            self.runs_dir().as_path(),
            self.comparisons_dir().as_path(),
            self.recordings_dir().as_path(),
            self.index_dir().as_path(),
            self.refs_dir().as_path(),
            self.machines_dir().as_path(),
            self.baselines_root_dir().as_path(),
        ] {
            fs::create_dir_all(dir)
                .with_context(|| format!("failed to create benchmark dir {}", dir.display()))?;
        }
        Ok(())
    }

    pub fn run_dir(&self, run_id: &str) -> PathBuf {
        self.runs_dir().join(run_id)
    }

    pub fn baseline_dir(&self, machine_id: &str, suite_id: &str) -> PathBuf {
        self.baselines_root_dir()
            .join(sanitize(machine_id))
            .join(sanitize(suite_id))
    }

    pub fn baseline_snapshot_path(&self, machine_id: &str, suite_id: &str, baseline_name: &str) -> PathBuf {
        self.baseline_dir(machine_id, suite_id)
            .join(format!("{}.json", sanitize(baseline_name)))
    }

    pub fn machine_record_path(&self, machine_id: &str) -> PathBuf {
        self.machines_dir().join(format!("{}.json", sanitize(machine_id)))
    }

    pub fn persist_machine_record(&self, machine: &MachineIdentity, seen_at: &str) -> Result<Option<PathBuf>> {
        let machine_id = machine
            .benchmark_machine_id
            .clone()
            .or_else(|| machine.hostname.clone());
        let Some(machine_id) = machine_id else {
            return Ok(None);
        };

        let path = self.machine_record_path(&machine_id);
        let record = MachineRecord {
            machine: machine.clone(),
            last_seen_at: Some(seen_at.to_string()),
        };
        write_json(&path, &record)?;
        Ok(Some(path))
    }

    pub fn resolve_baseline_path(
        &self,
        requested: &str,
        current_run: Option<&RunReport>,
    ) -> Result<PathBuf> {
        let requested_path = PathBuf::from(requested);
        if requested_path.exists() {
            return Ok(requested_path);
        }

        let run = current_run.context(
            "baseline name lookup requires a current run report to infer suite and machine identity",
        )?;
        let machine_id = machine_identity_label(&run.run.machine)
            .context("cannot resolve baseline by name because current run lacks machine identity")?;
        let baseline_path = self.baseline_snapshot_path(&machine_id, &run.suite.suite_id, requested);
        if baseline_path.exists() {
            Ok(baseline_path)
        } else {
            anyhow::bail!(
                "baseline '{}' not found under {}",
                requested,
                baseline_path.display()
            )
        }
    }

    pub fn list_baselines(
        &self,
        machine_filter: Option<&str>,
        suite_filter: Option<&str>,
    ) -> Result<Vec<BaselineDescriptor>> {
        let root = self.baselines_root_dir();
        if !root.exists() {
            return Ok(Vec::new());
        }

        let mut baselines = Vec::new();
        for machine_entry in fs::read_dir(&root)
            .with_context(|| format!("failed to read baseline root {}", root.display()))?
        {
            let machine_entry = machine_entry?;
            let machine_path = machine_entry.path();
            if !machine_path.is_dir() {
                continue;
            }
            let machine_id = machine_entry.file_name().to_string_lossy().to_string();
            if let Some(filter) = machine_filter {
                if filter != machine_id {
                    continue;
                }
            }

            for suite_entry in fs::read_dir(&machine_path).with_context(|| {
                format!("failed to read machine baseline dir {}", machine_path.display())
            })? {
                let suite_entry = suite_entry?;
                let suite_path = suite_entry.path();
                if !suite_path.is_dir() {
                    continue;
                }
                let suite_id = suite_entry.file_name().to_string_lossy().to_string();
                if let Some(filter) = suite_filter {
                    if filter != suite_id {
                        continue;
                    }
                }

                for baseline_entry in fs::read_dir(&suite_path).with_context(|| {
                    format!("failed to read suite baseline dir {}", suite_path.display())
                })? {
                    let baseline_entry = baseline_entry?;
                    let path = baseline_entry.path();
                    if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
                        continue;
                    }
                    let baseline_name = path
                        .file_stem()
                        .and_then(|stem| stem.to_str())
                        .unwrap_or_default()
                        .to_string();
                    baselines.push(BaselineDescriptor {
                        machine_id: machine_id.clone(),
                        suite_id: suite_id.clone(),
                        baseline_name,
                        path,
                    });
                }
            }
        }

        baselines.sort_by(|a, b| {
            (&a.machine_id, &a.suite_id, &a.baseline_name)
                .cmp(&(&b.machine_id, &b.suite_id, &b.baseline_name))
        });
        Ok(baselines)
    }
}

pub fn default_artifacts_dir() -> PathBuf {
    BenchmarkStorage::from_env_or_default().root().to_path_buf()
}

pub fn machine_identity_label(machine: &MachineIdentity) -> Option<String> {
    machine
        .benchmark_machine_id
        .clone()
        .or_else(|| machine.hostname.clone())
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create parent dir {}", parent.display()))?;
    }
    let contents = serde_json::to_string_pretty(value).context("failed to serialize benchmark json")?;
    fs::write(path, contents).with_context(|| format!("failed to write {}", path.display()))
}

fn sanitize(value: &str) -> String {
    value
        .chars()
        .map(|ch| match ch {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' => ch,
            _ => '_',
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::artifacts::{MachineIdentity, RunMetadata, RunSuiteMetadata, RunTotals};
    use crate::{RunReport, BenchmarkSuiteClass};
    use tempfile::TempDir;

    #[test]
    fn storage_lists_baselines_by_machine_and_suite() {
        let temp = TempDir::new().expect("temp dir");
        let storage = BenchmarkStorage::new(temp.path());
        storage.ensure_layout().expect("layout");

        let first = storage.baseline_snapshot_path("benchbox", "path", "before-refactor");
        let second = storage.baseline_snapshot_path("benchbox", "representative", "daily");
        fs::create_dir_all(first.parent().unwrap()).expect("mk first parent");
        fs::create_dir_all(second.parent().unwrap()).expect("mk second parent");
        fs::write(&first, "{}").expect("write first");
        fs::write(&second, "{}").expect("write second");

        let list = storage.list_baselines(Some("benchbox"), None).expect("list baselines");
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].machine_id, "benchbox");
    }

    #[test]
    fn resolve_baseline_by_name_uses_current_machine_and_suite() {
        let temp = TempDir::new().expect("temp dir");
        let storage = BenchmarkStorage::new(temp.path());
        storage.ensure_layout().expect("layout");

        let run = RunReport {
            schema_version: 1,
            suite: RunSuiteMetadata {
                suite_id: "path".to_string(),
                benchmark_mode: crate::FULL_SOLVE_BENCHMARK_MODE.to_string(),
                class: BenchmarkSuiteClass::Path,
                title: None,
                description: None,
                manifest_path: "benchmarking/suites/path.yaml".to_string(),
            },
            run: RunMetadata {
                run_id: "run-1".to_string(),
                generated_at: "2026-03-24T00:00:00Z".to_string(),
                git: Default::default(),
                machine: MachineIdentity {
                    benchmark_machine_id: Some("benchbox".to_string()),
                    ..Default::default()
                },
            },
            totals: RunTotals::default(),
            class_rollups: vec![],
            cases: vec![],
        };
        let expected = storage.baseline_snapshot_path("benchbox", "path", "before-refactor");
        fs::create_dir_all(expected.parent().unwrap()).expect("mk parent");
        fs::write(&expected, "{}").expect("write baseline");

        let resolved = storage
            .resolve_baseline_path("before-refactor", Some(&run))
            .expect("resolve by name");
        assert_eq!(resolved, expected);
    }
}
