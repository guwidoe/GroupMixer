#!/usr/bin/env python3
import os
import subprocess
import sys
from pathlib import Path

repo_dir = Path(__file__).resolve().parent.parent
release_bin = repo_dir / "target" / "release" / "gm-cli"
build_jobs = os.environ.get("GROUPMIXER_BENCH_BUILD_JOBS", "1")

env = os.environ.copy()
env["CARGO_BUILD_JOBS"] = build_jobs


def build_release() -> None:
    subprocess.run(
        [
            "cargo",
            "build",
            "--release",
            "-q",
            "-p",
            "gm-cli",
            "--bin",
            "gm-cli",
        ],
        cwd=repo_dir,
        env=env,
        check=True,
    )


def benchmark_args(args: list[str]) -> list[str]:
    if not args:
        return args

    command = args[0]
    if command in {"run", "record", "record-bundle"} and "--cargo-profile" not in args:
        return [command, "--cargo-profile", "release", *args[1:]]
    return args


build_release()
os.execv(str(release_bin), [str(release_bin), "benchmark", *benchmark_args(sys.argv[1:])])
