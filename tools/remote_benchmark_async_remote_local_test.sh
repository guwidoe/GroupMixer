#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_SCRIPT="${SCRIPT_DIR}/remote_benchmark_async_remote.py"

tmpdir="$(mktemp -d)"
remote_root="${tmpdir}/remote"
runs_dir="${remote_root}/groupmixer-benchmark/runs"
control_repo_dir="${remote_root}/GroupMixer"
shared_artifacts_dir="${remote_root}/groupmixer-benchmark/shared/benchmarking-artifacts"
status_payload_path="${tmpdir}/status-payload.json"
bench_log_record="${tmpdir}/bench-record.log"
bench_log_bundle="${tmpdir}/bench-bundle.log"
mkdir -p "${control_repo_dir}/tools" "${shared_artifacts_dir}" "${tmpdir}/bin"

cleanup() {
  rm -rf "${tmpdir}"
}
trap cleanup EXIT

ln -s "$(command -v bash)" "${tmpdir}/bin/bash"
ln -s "$(python3 -c 'import sys; print(sys.executable)')" "${tmpdir}/bin/python3"

cat > "${control_repo_dir}/tools/benchmark_workflow.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
command="\${1:-}"
shift || true
case "\${command}" in
  record)
    {
      printf 'args=%s\n' "\${command} \$*"
      printf 'branch=%s\n' "\${GROUPMIXER_BENCHMARK_GIT_BRANCH:-}"
      printf 'commit=%s\n' "\${GROUPMIXER_BENCHMARK_GIT_COMMIT_SHA:-}"
      printf 'short=%s\n' "\${GROUPMIXER_BENCHMARK_GIT_SHORT_SHA:-}"
      printf 'dirty=%s\n' "\${GROUPMIXER_BENCHMARK_GIT_DIRTY_TREE:-}"
    } > $(printf '%q' "${bench_log_record}")
    ;;
  record-bundle)
    recording_id=""
    while [[ \$# -gt 0 ]]; do
      case "\${1}" in
        --recording-id)
          recording_id="\${2}"
          shift 2
          ;;
        *)
          shift
          ;;
      esac
    done
    [[ -n "\${recording_id}" ]]
    mkdir -p "benchmarking/artifacts/recordings/\${recording_id}" "benchmarking/artifacts/runs/path-run"
    cat > "benchmarking/artifacts/recordings/\${recording_id}/meta.json" <<META
{
  "suite_runs": [
    {
      "suite_name": "path",
      "benchmark_mode": "full_solve",
      "run_report_path": "runs/path-run/run-report.json"
    }
  ]
}
META
    cat > "benchmarking/artifacts/runs/path-run/run-report.json" <<'REPORT'
{"ok": true}
REPORT
    printf 'bundle-recording-id=%s\n' "\${recording_id}" > $(printf '%q' "${bench_log_bundle}")
    ;;
  *)
    echo "unexpected benchmark_workflow command: \${command}" >&2
    exit 1
    ;;
esac
exit 0
EOF
chmod +x "${control_repo_dir}/tools/benchmark_workflow.sh"

make_payload() {
  local action="$1"
  local run_id="$2"
  local bench_command="$3"
  local bundle_kind="$4"
  local feature_name="$5"
  python3 - "$action" "$run_id" "$bench_command" "$bundle_kind" "$feature_name" "${runs_dir}" "${remote_root}/groupmixer-benchmark/benchmark.lock" "${control_repo_dir}" "${shared_artifacts_dir}" <<'PY'
import base64
import json
import sys

action, run_id, bench_command, bundle_kind, feature_name, runs_dir, lock_file, control_repo_dir, shared_artifacts_dir = sys.argv[1:10]
bench_args = ["--suite", "path"]
if bench_command == "record-bundle":
    bench_args = [
        "--purpose", "feature-validation",
        "--feature-name", feature_name,
        "--suite", "path",
        "--recording-id", run_id,
    ]
payload = {
    "action": action,
    "run_id": run_id,
    "bench_command": bench_command,
    "bench_args": bench_args,
    "remote_repo_dir": control_repo_dir,
    "remote_shared_artifacts_dir": shared_artifacts_dir,
    "remote_runs_dir": runs_dir,
    "remote_lock_file": lock_file,
    "remote_env_file": "",
    "machine_name": "local-test-machine",
    "requested_suite": "path",
    "requested_suites": ["path"],
    "remote_python_bin": "",
    "git_branch": "test-branch",
    "git_commit": "deadbeef",
    "git_shortsha": "deadbee",
    "git_subject": "test subject",
    "idle_max_load1": "",
    "idle_poll_seconds": "1",
    "idle_streak": "1",
    "bench_max_seconds": "30",
    "bench_kill_after_seconds": "1",
    "bench_build_jobs": "1",
    "bundle_kind": bundle_kind,
    "feature_name": feature_name,
    "feature_previous_targets": {},
}
print(base64.b64encode(json.dumps(payload).encode()).decode())
PY
}

poll_until_done() {
  local run_id="$1"
  local bench_command="$2"
  local bundle_kind="$3"
  local feature_name="$4"
  local status_path="$5"
  for _ in $(seq 1 40); do
    local status_payload_b64
    status_payload_b64="$(make_payload status "${run_id}" "${bench_command}" "${bundle_kind}" "${feature_name}")"
    PATH="${tmpdir}/bin:${PATH}" GROUPMIXER_REMOTE_PAYLOAD_B64="${status_payload_b64}" python3 "${TARGET_SCRIPT}" > "${status_path}"
    if python3 - "${status_path}" <<'PY'
import json
import pathlib
import sys
status = json.loads(pathlib.Path(sys.argv[1]).read_text())
raise SystemExit(0 if status.get("done") else 1)
PY
    then
      return 0
    fi
    sleep 0.2
  done
  echo "run did not finish: ${run_id}" >&2
  cat "${status_path}" >&2
  return 1
}

# Scenario 1: basic record run finalizes successfully.
record_run_id="local-remote-helper-record"
start_payload_b64="$(make_payload start "${record_run_id}" record "" "")"
PATH="${tmpdir}/bin:${PATH}" GROUPMIXER_REMOTE_PAYLOAD_B64="${start_payload_b64}" python3 "${TARGET_SCRIPT}" > "${tmpdir}/start-record.json"
poll_until_done "${record_run_id}" record "" "" "${status_payload_path}"

python3 - "${status_payload_path}" "${bench_log_record}" <<'PY'
import json
import pathlib
import sys
status = json.loads(pathlib.Path(sys.argv[1]).read_text())
bench_log = pathlib.Path(sys.argv[2])
assert status.get("done") is True, status
assert str(status.get("exit_code")) == "0", status
log_lines = bench_log.read_text().splitlines()
assert "args=record --suite path" in log_lines
assert "branch=test-branch" in log_lines
assert "commit=deadbeef" in log_lines
assert "short=deadbee" in log_lines
assert "dirty=false" in log_lines
PY

# Scenario 2: record-bundle finalizes after follow-up comparison setup.
bundle_run_id="local-remote-helper-bundle"
start_payload_b64="$(make_payload start "${bundle_run_id}" record-bundle feature bundle-feature)"
PATH="${tmpdir}/bin:${PATH}" GROUPMIXER_REMOTE_PAYLOAD_B64="${start_payload_b64}" python3 "${TARGET_SCRIPT}" > "${tmpdir}/start-bundle.json"
poll_until_done "${bundle_run_id}" record-bundle feature bundle-feature "${status_payload_path}"

python3 - "${status_payload_path}" "${bench_log_bundle}" <<'PY'
import json
import pathlib
import sys
status = json.loads(pathlib.Path(sys.argv[1]).read_text())
bench_log = pathlib.Path(sys.argv[2])
assert status.get("done") is True, status
assert str(status.get("exit_code")) == "0", status
assert bench_log.read_text().strip() == "bundle-recording-id=local-remote-helper-bundle"
PY

# Scenario 3: orphaned unfinished runs are finalized on status checks.
orphan_run_id="local-remote-helper-orphan"
orphan_run_dir="${runs_dir}/${orphan_run_id}"
mkdir -p "${orphan_run_dir}"
cat > "${orphan_run_dir}/meta.json" <<'EOF_META'
{
  "launcher": "process",
  "pid": 999999,
  "session_name": "",
  "bench_command": "record",
  "bench_args": ["--suite", "path"],
  "requested_suite": "path",
  "requested_suites": ["path"],
  "remote_python_bin": "",
  "machine_name": "local-test-machine",
  "git_shortsha": "deadbee"
}
EOF_META
printf '2026-03-25T00:00:00Z\n' > "${orphan_run_dir}/queued_at"
printf '2026-03-25T00:00:01Z\n' > "${orphan_run_dir}/started_at"

status_payload_b64="$(make_payload status "${orphan_run_id}" record "" "")"
PATH="${tmpdir}/bin:${PATH}" GROUPMIXER_REMOTE_PAYLOAD_B64="${status_payload_b64}" python3 "${TARGET_SCRIPT}" > "${tmpdir}/status-orphan.json"

python3 - "${tmpdir}/status-orphan.json" "${orphan_run_dir}" <<'PY'
import json
import pathlib
import sys
status = json.loads(pathlib.Path(sys.argv[1]).read_text())
run_dir = pathlib.Path(sys.argv[2])
assert status.get("done") is True, status
assert str(status.get("exit_code")) == "1", status
assert (run_dir / "done").exists()
assert (run_dir / "abandoned").exists()
assert (run_dir / "finished_at").exists()
PY

echo "remote_benchmark_async_remote local helper test passed"
