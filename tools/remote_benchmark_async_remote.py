#!/usr/bin/env python3
import base64
import json
import os
import shlex
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path


def decode_payload() -> dict:
    raw = os.environ.get("GROUPMIXER_REMOTE_PAYLOAD_B64", "")
    if not raw:
        raise SystemExit("missing GROUPMIXER_REMOTE_PAYLOAD_B64")
    return json.loads(base64.b64decode(raw).decode("utf-8"))


payload = decode_payload()
action = payload["action"]
remote_repo_dir = payload["remote_repo_dir"]
remote_runs_dir = payload["remote_runs_dir"]
remote_lock_file = payload["remote_lock_file"]
remote_env_file = payload.get("remote_env_file", "")

runs_dir = Path(remote_runs_dir)
runs_dir.mkdir(parents=True, exist_ok=True)

prefix_parts: list[str] = []
if remote_env_file and os.path.exists(remote_env_file):
    prefix_parts.append(f'. {shlex.quote(remote_env_file)} >/dev/null 2>&1')
home_cargo = os.path.expanduser("~/.cargo/env")
if os.path.exists(home_cargo):
    prefix_parts.append(f'. {shlex.quote(home_cargo)} >/dev/null 2>&1')
prefix = "; ".join(prefix_parts)
if prefix:
    prefix += "; "


def bench_env() -> dict:
    env = os.environ.copy()
    env.update(
        {
            "GROUPMIXER_BENCHMARK_MACHINE_ID": payload.get("machine_name", "remote"),
            "GROUPMIXER_BENCH_BUILD_JOBS": str(payload.get("bench_build_jobs", "1")),
        }
    )
    return env


def run_bash(command: str, cwd: str | None = None, env: dict | None = None, check: bool = True):
    return subprocess.run(["bash", "-lc", command], cwd=cwd, env=env, check=check, text=True, capture_output=True)


def iso_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def load_snapshot() -> dict:
    load1, load5, load15 = os.getloadavg()
    cpu_count = os.cpu_count() or 1
    return {
        "load1": load1,
        "load5": load5,
        "load15": load15,
        "cpu_count": cpu_count,
        "normalized_load1": load1 / cpu_count,
    }


def process_alive(pid: int | None) -> bool:
    if pid in (None, 0):
        return False
    try:
        os.kill(int(pid), 0)
        return True
    except OSError:
        return False


def existing_pending_run_for_same_job() -> tuple[str | None, dict | None]:
    for run_dir in sorted(runs_dir.iterdir(), reverse=True):
        if not run_dir.is_dir() or (run_dir / "done").exists():
            continue
        meta_path = run_dir / "meta.json"
        if not meta_path.exists():
            continue
        meta = json.loads(meta_path.read_text())
        if (
            meta.get("git_commit") == payload.get("git_commit")
            and meta.get("bench_command") == payload.get("bench_command")
            and meta.get("bench_args", []) == payload.get("bench_args", [])
        ):
            return run_dir.name, meta
    return None, None


if action == "check":
    cmd = (
        prefix
        + "command -v cargo >/dev/null && command -v rustc >/dev/null "
        + "&& echo '[groupmixer][remote] host:' $(hostname) "
        + "&& echo '[groupmixer][remote] uname:' \"$(uname -a)\" "
        + "&& if command -v tmux >/dev/null; then echo '[groupmixer][remote] launcher: tmux'; tmux -V; else echo '[groupmixer][remote] launcher: process'; fi "
        + "&& cargo -V && rustc -Vv && python3 -V"
    )
    result = run_bash(cmd, cwd=remote_repo_dir, env=bench_env())
    sys.stdout.write(result.stdout)
    if result.stderr:
        sys.stderr.write(result.stderr)
    print(json.dumps({"lock_file": remote_lock_file, "load": load_snapshot()}))
    raise SystemExit(0)

if action in {"list", "latest"}:
    runs = []
    for run_dir in sorted(runs_dir.iterdir(), reverse=True):
        if not run_dir.is_dir():
            continue
        meta_path = run_dir / "meta.json"
        meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
        exit_code = (run_dir / "exit_code").read_text().strip() if (run_dir / "exit_code").exists() else None
        done = (run_dir / "done").exists()
        runs.append(
            {
                "run_id": run_dir.name,
                "command": meta.get("bench_command"),
                "commit": meta.get("git_shortsha"),
                "session_name": meta.get("session_name"),
                "launcher": meta.get("launcher"),
                "pid": meta.get("pid"),
                "done": done,
                "exit_code": exit_code,
            }
        )
    print(json.dumps({"run": runs[0] if runs else None} if action == "latest" else {"runs": runs}))
    raise SystemExit(0)

run_id = payload.get("run_id", "")
if not run_id:
    print(json.dumps({"error": "run_id is required"}))
    raise SystemExit(2)

run_dir = runs_dir / run_id
snapshot_repo_dir = run_dir / "snapshot" / "GroupMixer"
meta_path = run_dir / "meta.json"

if action == "start":
    start_lock_path = runs_dir / ".start.lock"
    start_lock_path.parent.mkdir(parents=True, exist_ok=True)
    with start_lock_path.open("a+") as start_lock_handle:
        import fcntl

        fcntl.flock(start_lock_handle.fileno(), fcntl.LOCK_EX)
        existing_run_id, existing_meta = existing_pending_run_for_same_job()
        if existing_run_id and existing_meta:
            existing_run_dir = runs_dir / existing_run_id
            print(
                json.dumps(
                    {
                        "run_id": existing_run_id,
                        "launcher": existing_meta.get("launcher"),
                        "session_name": existing_meta.get("session_name"),
                        "pid": existing_meta.get("pid"),
                        "remote_log": str(existing_run_dir / "benchmark.log"),
                        "deduped": True,
                    }
                )
            )
            raise SystemExit(0)

        run_dir.mkdir(parents=True, exist_ok=True)
        launcher = "tmux" if shutil.which("tmux") else "process"
        log_path = run_dir / "benchmark.log"
        meta = {
            "run_id": run_id,
            "bench_command": payload["bench_command"],
            "bench_args": payload.get("bench_args", []),
            "bundle_kind": payload.get("bundle_kind", ""),
            "feature_name": payload.get("feature_name", ""),
            "feature_previous_targets": payload.get("feature_previous_targets", {}),
            "requested_suite": payload.get("requested_suite"),
            "requested_suites": payload.get("requested_suites", []),
            "remote_python_bin": payload.get("remote_python_bin", ""),
            "workflow_script": "./tools/benchmark_workflow.sh",
            "git_branch": payload.get("git_branch"),
            "git_commit": payload.get("git_commit"),
            "git_shortsha": payload.get("git_shortsha"),
            "git_subject": payload.get("git_subject"),
            "machine_name": payload.get("machine_name"),
            "session_name": f"groupmixer-bench-{run_id}",
            "launcher": launcher,
            "remote_repo_dir": str(snapshot_repo_dir),
            "remote_lock_file": remote_lock_file,
            "idle_max_load1": payload.get("idle_max_load1", ""),
            "idle_poll_seconds": payload.get("idle_poll_seconds", "30"),
            "idle_streak": payload.get("idle_streak", "1"),
            "bench_max_seconds": payload.get("bench_max_seconds", "7200"),
            "bench_kill_after_seconds": payload.get("bench_kill_after_seconds", "30"),
        }
        meta_path.write_text(json.dumps(meta, indent=2, sort_keys=True) + "\n")

    if not snapshot_repo_dir.exists():
        print(json.dumps({"error": f"missing staged snapshot for run_id {run_id}"}))
        raise SystemExit(2)

    runner_path = run_dir / "runner.py"
    wrapper_log_path = run_dir / "runner.log"
    runner_path.write_text(
        f'''#!/usr/bin/env python3
import fcntl
import json
import os
import shlex
import signal
import subprocess
import time
from pathlib import Path

run_dir = Path({str(run_dir)!r})
log_path = Path({str(log_path)!r})
repo_dir = {str(snapshot_repo_dir)!r}
lock_file = Path({remote_lock_file!r})
prefix = {prefix!r}
bench_command = {payload['bench_command']!r}
bench_args = {payload.get('bench_args', [])!r}
bundle_kind = {payload.get('bundle_kind', '')!r}
feature_name = {payload.get('feature_name', '')!r}
feature_previous_targets = {payload.get('feature_previous_targets', {})!r}
idle_max_load1 = {payload.get('idle_max_load1', '')!r}
idle_poll_seconds = int({payload.get('idle_poll_seconds', '30')!r})
idle_streak_required = int({payload.get('idle_streak', '1')!r})
bench_max_seconds = int({payload.get('bench_max_seconds', '7200')!r})
bench_kill_after_seconds = int({payload.get('bench_kill_after_seconds', '30')!r})
env = {bench_env()!r}
if {payload.get('remote_python_bin', '')!r}:
    env["GROUPMIXER_BENCH_PYTHON_BIN"] = {payload.get('remote_python_bin', '')!r}

def iso_now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

def load_snapshot():
    load1, load5, load15 = os.getloadavg()
    cpu_count = os.cpu_count() or 1
    return {{"load1": load1, "load5": load5, "load15": load15, "cpu_count": cpu_count, "normalized_load1": load1 / cpu_count}}

def mark_done(exit_code: int):
    (run_dir / "exit_code").write_text(str(exit_code) + "\\n")
    (run_dir / "finished_at").write_text(iso_now() + "\\n")
    (run_dir / "done").touch()

def resolve_stored_path(stored_path: str) -> Path:
    path = Path(stored_path)
    if path.is_absolute():
        return path
    return repo_dir / "benchmarking" / "artifacts" / path

def load_recording_suite_runs() -> list[dict]:
    recording_meta_path = repo_dir / "benchmarking" / "artifacts" / "recordings" / run_dir.name / "meta.json"
    if not recording_meta_path.exists():
        return []
    return json.loads(recording_meta_path.read_text()).get("suite_runs", [])

def load_ref_target_run_report(ref_name: str) -> str | None:
    ref_path = repo_dir / "benchmarking" / "artifacts" / "refs" / f"{{ref_name}}.json"
    if not ref_path.exists():
        return None
    data = json.loads(ref_path.read_text())
    return data.get("target", {{}}).get("run_report_path")

def run_followup_compare(log, *, suite_name: str, mode: str, current_run_report: Path, compare_label: str, baseline_run_report: Path | None = None, branch: str | None = None) -> int:
    summary_dir = run_dir / "comparisons" / suite_name
    summary_dir.mkdir(parents=True, exist_ok=True)
    summary_path = summary_dir / f"{{compare_label}}.summary.txt"
    cmd_parts = [
        "./tools/benchmark_runner.py",
    ]
    if baseline_run_report is None:
        cmd_parts.extend([
            "compare-prev",
            "--suite", suite_name,
            "--mode", mode,
            "--artifacts-dir", "benchmarking/artifacts",
            "--summary-output", str(summary_path),
        ])
        if branch:
            cmd_parts.extend(["--branch", branch])
    else:
        cmd_parts.extend([
            "compare",
            "--run", str(current_run_report),
            "--baseline-run", str(baseline_run_report),
            "--artifacts-dir", "benchmarking/artifacts",
            "--summary-output", str(summary_path),
        ])
    command = prefix + " ".join(shlex.quote(part) for part in cmd_parts)
    log.write(f"\\n[groupmixer][remote] follow-up compare: {{' '.join(cmd_parts)}}\\n")
    log.flush()
    followup = subprocess.run(["bash", "-lc", command], cwd=repo_dir, env=env, stdout=log, stderr=subprocess.STDOUT)
    return followup.returncode

def materialize_followup_comparisons(log) -> int:
    if bench_command != "record-bundle" or not bundle_kind:
        return 0
    suite_runs = load_recording_suite_runs()
    if not suite_runs:
        log.write("\\n[groupmixer][remote] no recording metadata found for follow-up comparisons\\n")
        log.flush()
        return 1

    overall = 0
    for suite_run in suite_runs:
        suite_name = suite_run.get("suite_name")
        mode = suite_run.get("benchmark_mode", "full_solve")
        current_run_report = resolve_stored_path(suite_run["run_report_path"])
        if bundle_kind == "main":
            rc = run_followup_compare(
                log,
                suite_name=suite_name,
                mode=mode,
                current_run_report=current_run_report,
                compare_label="compare-prev",
                branch={payload.get('git_branch', '')!r},
            )
            overall = overall or rc
        elif bundle_kind == "feature":
            main_latest = load_ref_target_run_report(f"main/suites/{{suite_name}}/{{mode}}/latest")
            if main_latest:
                rc = run_followup_compare(
                    log,
                    suite_name=suite_name,
                    mode=mode,
                    current_run_report=current_run_report,
                    compare_label="compare-main-latest",
                    baseline_run_report=resolve_stored_path(main_latest),
                )
                overall = overall or rc
            feature_previous = feature_previous_targets.get(suite_name)
            if feature_previous:
                rc = run_followup_compare(
                    log,
                    suite_name=suite_name,
                    mode=mode,
                    current_run_report=current_run_report,
                    compare_label="compare-feature-previous",
                    baseline_run_report=resolve_stored_path(feature_previous),
                )
                overall = overall or rc
    return overall

def handle_term(signum, frame):
    mark_done(130)
    raise SystemExit(130)

signal.signal(signal.SIGTERM, handle_term)
signal.signal(signal.SIGINT, handle_term)
run_dir.mkdir(parents=True, exist_ok=True)
(run_dir / "queued_at").write_text(iso_now() + "\\n")
(run_dir / "started_at").write_text(iso_now() + "\\n")
(run_dir / "load_queued.json").write_text(json.dumps(load_snapshot(), indent=2) + "\\n")
lock_file.parent.mkdir(parents=True, exist_ok=True)
with lock_file.open("a+") as lock_handle:
    fcntl.flock(lock_handle.fileno(), fcntl.LOCK_EX)
    (run_dir / "lock_acquired_at").write_text(iso_now() + "\\n")
    (run_dir / "load_lock_acquired.json").write_text(json.dumps(load_snapshot(), indent=2) + "\\n")
    if idle_max_load1:
        idle_max = float(idle_max_load1)
        streak = 0
        while streak < idle_streak_required:
            snapshot = load_snapshot()
            if snapshot["load1"] <= idle_max:
                streak += 1
            else:
                streak = 0
            (run_dir / "load_wait_last.json").write_text(json.dumps(snapshot, indent=2) + "\\n")
            if streak < idle_streak_required:
                time.sleep(idle_poll_seconds)
    (run_dir / "idle_ready_at").write_text(iso_now() + "\\n")
    command = prefix + " ".join(shlex.quote(part) for part in ["./tools/benchmark_workflow.sh", bench_command, *bench_args])
    with log_path.open("w") as log:
        proc = subprocess.Popen(["bash", "-lc", command], cwd=repo_dir, env=env, stdout=log, stderr=subprocess.STDOUT)
        (run_dir / "bench_pid").write_text(str(proc.pid) + "\\n")
        deadline = time.monotonic() + bench_max_seconds if bench_max_seconds > 0 else None
        while True:
            try:
                exit_code = proc.wait(timeout=5)
                break
            except subprocess.TimeoutExpired:
                if deadline is None or time.monotonic() < deadline:
                    continue
                log.write(f"\\n[groupmixer][remote] benchmark command exceeded timeout of {{bench_max_seconds}}s; terminating and marking run failed\\n")
                log.flush()
                proc.terminate()
                try:
                    exit_code = proc.wait(timeout=max(1, bench_kill_after_seconds))
                except subprocess.TimeoutExpired:
                    proc.kill()
                    exit_code = proc.wait()
                exit_code = 124
                (run_dir / "timed_out").touch()
                (run_dir / "timeout_seconds").write_text(str(bench_max_seconds) + "\\n")
                break
        if exit_code == 0:
            followup_exit = materialize_followup_comparisons(log)
            if followup_exit != 0:
                exit_code = followup_exit
    (run_dir / "load_finished.json").write_text(json.dumps(load_snapshot(), indent=2) + "\\n")
    mark_done(exit_code)
    raise SystemExit(exit_code)
'''
    )
    runner_path.chmod(0o755)

    if launcher == "tmux":
        subprocess.run(
            ["tmux", "new-session", "-d", "-s", meta["session_name"], f"python3 {shlex.quote(str(runner_path))} >> {shlex.quote(str(wrapper_log_path))} 2>&1"],
            check=True,
            cwd=snapshot_repo_dir,
        )
    else:
        wrapper_log = wrapper_log_path.open("w")
        proc = subprocess.Popen(
            ["python3", str(runner_path)],
            cwd=snapshot_repo_dir,
            stdout=wrapper_log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        meta["pid"] = proc.pid
        meta_path.write_text(json.dumps(meta, indent=2, sort_keys=True) + "\n")

    print(json.dumps({"run_id": run_id, "launcher": launcher, "session_name": meta["session_name"], "pid": meta.get("pid"), "remote_log": str(log_path), "machine_name": meta.get("machine_name"), "requested_suite": meta.get("requested_suite"), "requested_suites": meta.get("requested_suites", []), "remote_python_bin": meta.get("remote_python_bin")}))
    raise SystemExit(0)

if not run_dir.exists():
    print(json.dumps({"error": f"unknown run_id {run_id}"}))
    raise SystemExit(2)

meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
launcher = meta.get("launcher", "process")
session_name = meta.get("session_name", "")
pid = meta.get("pid")
bench_pid = int((run_dir / "bench_pid").read_text().strip()) if (run_dir / "bench_pid").exists() else None
log_path = run_dir / "benchmark.log"
exit_code = (run_dir / "exit_code").read_text().strip() if (run_dir / "exit_code").exists() else None
done = (run_dir / "done").exists()
queued_at = (run_dir / "queued_at").read_text().strip() if (run_dir / "queued_at").exists() else None
started_at = (run_dir / "started_at").read_text().strip() if (run_dir / "started_at").exists() else None
lock_acquired_at = (run_dir / "lock_acquired_at").read_text().strip() if (run_dir / "lock_acquired_at").exists() else None
idle_ready_at = (run_dir / "idle_ready_at").read_text().strip() if (run_dir / "idle_ready_at").exists() else None
finished_at = (run_dir / "finished_at").read_text().strip() if (run_dir / "finished_at").exists() else None
session_alive = launcher == "tmux" and bool(session_name) and shutil.which("tmux") is not None and subprocess.run(["tmux", "has-session", "-t", session_name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
wrapper_alive = launcher == "process" and process_alive(int(pid) if pid else None)
bench_process_alive = process_alive(bench_pid)

if action == "status":
    print(
        json.dumps(
            {
                "run_id": run_id,
                "command": meta.get("bench_command"),
                "bench_args": meta.get("bench_args", []),
                "requested_suite": meta.get("requested_suite"),
                "requested_suites": meta.get("requested_suites", []),
                "remote_python_bin": meta.get("remote_python_bin"),
                "machine_name": meta.get("machine_name"),
                "git_shortsha": meta.get("git_shortsha"),
                "launcher": launcher,
                "session_name": session_name,
                "session_alive": session_alive,
                "pid": pid,
                "wrapper_alive": wrapper_alive,
                "bench_pid": bench_pid,
                "bench_process_alive": bench_process_alive,
                "done": done,
                "exit_code": exit_code,
                "queued_at": queued_at,
                "started_at": started_at,
                "lock_acquired_at": lock_acquired_at,
                "idle_ready_at": idle_ready_at,
                "finished_at": finished_at,
                "remote_log": str(log_path),
            }
        )
    )
    raise SystemExit(0)

if action == "cancel":
    cancelled = False
    if bench_pid and process_alive(bench_pid):
        os.kill(bench_pid, signal.SIGTERM)
        cancelled = True
    if launcher == "tmux" and session_alive and session_name:
        subprocess.run(["tmux", "kill-session", "-t", session_name], check=True)
        cancelled = True
    if launcher == "process" and wrapper_alive and pid is not None:
        os.kill(int(pid), signal.SIGTERM)
        cancelled = True
    if not done:
        (run_dir / "exit_code").write_text("130\n")
        (run_dir / "finished_at").write_text(iso_now() + "\n")
        (run_dir / "done").touch()
    print(json.dumps({"run_id": run_id, "cancelled": cancelled}))
    raise SystemExit(0)

print(json.dumps({"error": f"unsupported action {action}"}))
raise SystemExit(2)
