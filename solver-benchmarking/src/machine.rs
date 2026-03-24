use crate::artifacts::{GitIdentity, MachineIdentity};
use anyhow::Result;
use std::env;
use std::fs;
use std::process::Command;

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
        commit_sha: git_output(&["rev-parse", "HEAD"]),
        short_sha: git_output(&["rev-parse", "--short", "HEAD"]),
        branch: git_output(&["rev-parse", "--abbrev-ref", "HEAD"]),
        dirty_tree: git_status_dirty().ok(),
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
