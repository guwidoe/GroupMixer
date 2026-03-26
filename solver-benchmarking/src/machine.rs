use crate::artifacts::{GitIdentity, MachineIdentity};
use anyhow::Result;
use std::env;
use std::fs;
use std::process::Command;

const GIT_COMMIT_SHA_ENV: &str = "GROUPMIXER_BENCHMARK_GIT_COMMIT_SHA";
const GIT_SHORT_SHA_ENV: &str = "GROUPMIXER_BENCHMARK_GIT_SHORT_SHA";
const GIT_BRANCH_ENV: &str = "GROUPMIXER_BENCHMARK_GIT_BRANCH";
const GIT_DIRTY_TREE_ENV: &str = "GROUPMIXER_BENCHMARK_GIT_DIRTY_TREE";

pub fn capture_machine_identity(cargo_profile: Option<&str>) -> MachineIdentity {
    let hostname = env::var("HOSTNAME")
        .ok()
        .or_else(|| command_output("hostname", &[]))
        .filter(|value| !value.trim().is_empty());
    let benchmark_machine_id = env::var("GROUPMIXER_BENCHMARK_MACHINE_ID")
        .ok()
        .or_else(|| hostname.clone());

    MachineIdentity {
        benchmark_machine_id,
        hostname,
        cpu_model: linux_cpu_model().or_else(|| command_output("uname", &["-p"])),
        logical_cores: std::thread::available_parallelism()
            .ok()
            .map(|count| count.get() as u32),
        os: Some(env::consts::OS.to_string()),
        kernel: command_output("uname", &["-r"]),
        rustc_version: command_output("rustc", &["--version"]),
        cargo_profile: cargo_profile.map(ToOwned::to_owned),
    }
}

pub fn capture_git_identity() -> GitIdentity {
    GitIdentity {
        commit_sha: env_string(GIT_COMMIT_SHA_ENV).or_else(|| git_output(&["rev-parse", "HEAD"])),
        short_sha: env_string(GIT_SHORT_SHA_ENV).or_else(|| git_output(&["rev-parse", "--short", "HEAD"])),
        branch: env_string(GIT_BRANCH_ENV).or_else(|| git_output(&["rev-parse", "--abbrev-ref", "HEAD"])),
        dirty_tree: env_bool(GIT_DIRTY_TREE_ENV).or_else(|| git_status_dirty().ok()),
    }
}

fn env_string(name: &str) -> Option<String> {
    env::var(name).ok().filter(|value| !value.trim().is_empty())
}

fn env_bool(name: &str) -> Option<bool> {
    let value = env_string(name)?;
    match value.trim().to_ascii_lowercase().as_str() {
        "1" | "true" | "yes" | "on" => Some(true),
        "0" | "false" | "no" | "off" => Some(false),
        _ => None,
    }
}

fn git_output(args: &[&str]) -> Option<String> {
    command_output("git", args)
}

fn git_status_dirty() -> Result<bool> {
    let output = Command::new("git").args(["status", "--porcelain"]).output()?;
    Ok(!String::from_utf8_lossy(&output.stdout).trim().is_empty())
}

fn linux_cpu_model() -> Option<String> {
    let cpuinfo = fs::read_to_string("/proc/cpuinfo").ok()?;
    cpuinfo
        .lines()
        .find_map(|line| line.strip_prefix("model name\t: "))
        .map(|value| value.trim().to_string())
}

fn command_output(command: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(command).args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

#[cfg(test)]
mod tests {
    use super::{capture_git_identity, GIT_BRANCH_ENV, GIT_COMMIT_SHA_ENV, GIT_DIRTY_TREE_ENV, GIT_SHORT_SHA_ENV};
    use std::env;
    use std::sync::{Mutex, OnceLock};

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    #[test]
    fn capture_git_identity_prefers_explicit_env_overrides() {
        let _guard = env_lock().lock().unwrap();

        let original_commit = env::var(GIT_COMMIT_SHA_ENV).ok();
        let original_short = env::var(GIT_SHORT_SHA_ENV).ok();
        let original_branch = env::var(GIT_BRANCH_ENV).ok();
        let original_dirty = env::var(GIT_DIRTY_TREE_ENV).ok();

        env::set_var(GIT_COMMIT_SHA_ENV, "override-commit");
        env::set_var(GIT_SHORT_SHA_ENV, "override-short");
        env::set_var(GIT_BRANCH_ENV, "override-branch");
        env::set_var(GIT_DIRTY_TREE_ENV, "false");

        let git = capture_git_identity();

        assert_eq!(git.commit_sha.as_deref(), Some("override-commit"));
        assert_eq!(git.short_sha.as_deref(), Some("override-short"));
        assert_eq!(git.branch.as_deref(), Some("override-branch"));
        assert_eq!(git.dirty_tree, Some(false));

        restore_env(GIT_COMMIT_SHA_ENV, original_commit);
        restore_env(GIT_SHORT_SHA_ENV, original_short);
        restore_env(GIT_BRANCH_ENV, original_branch);
        restore_env(GIT_DIRTY_TREE_ENV, original_dirty);
    }

    fn restore_env(name: &str, value: Option<String>) {
        match value {
            Some(value) => env::set_var(name, value),
            None => env::remove_var(name),
        }
    }
}
