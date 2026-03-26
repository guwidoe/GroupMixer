#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
TARGET_SCRIPT="${SCRIPT_DIR}/remote_benchmark_async_remote.py"

tmpdir="$(mktemp -d)"
remote_root="${tmpdir}/remote"
runs_dir="${remote_root}/groupmixer-benchmark/runs"
run_id="local-remote-helper-test"
snapshot_repo_dir="${runs_dir}/${run_id}/snapshot/GroupMixer"
status_payload_path="${tmpdir}/status-payload.json"
bench_log="${tmpdir}/bench.log"
mkdir -p "${snapshot_repo_dir}/tools" "${tmpdir}/bin"

cleanup() {
  rm -rf "${tmpdir}"
}
trap cleanup EXIT

ln -s "$(command -v bash)" "${tmpdir}/bin/bash"
ln -s "$(python3 -c 'import sys; print(sys.executable)')" "${tmpdir}/bin/python3"

cat > "${snapshot_repo_dir}/tools/benchmark_workflow.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
{
  printf 'args=%s\n' "\$*"
  printf 'branch=%s\n' "\${GROUPMIXER_BENCHMARK_GIT_BRANCH:-}"
  printf 'commit=%s\n' "\${GROUPMIXER_BENCHMARK_GIT_COMMIT_SHA:-}"
  printf 'short=%s\n' "\${GROUPMIXER_BENCHMARK_GIT_SHORT_SHA:-}"
  printf 'dirty=%s\n' "\${GROUPMIXER_BENCHMARK_GIT_DIRTY_TREE:-}"
} > $(printf '%q' "${bench_log}")
exit 0
EOF
chmod +x "${snapshot_repo_dir}/tools/benchmark_workflow.sh"

make_payload() {
  local action="$1"
  python3 - "$action" "${runs_dir}" "${remote_root}/groupmixer-benchmark/benchmark.lock" <<'PY'
import base64
import json
import sys

action, runs_dir, lock_file = sys.argv[1:4]
payload = {
    "action": action,
    "run_id": "local-remote-helper-test",
    "bench_command": "record",
    "bench_args": ["--suite", "path"],
    "remote_repo_dir": "IGNORED-FOR-START",
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
    "bundle_kind": "",
    "feature_name": "",
    "feature_previous_targets": {},
}
print(base64.b64encode(json.dumps(payload).encode()).decode())
PY
}

start_payload_b64="$(make_payload start)"
PATH="${tmpdir}/bin" GROUPMIXER_REMOTE_PAYLOAD_B64="${start_payload_b64}" python3 "${TARGET_SCRIPT}" > "${tmpdir}/start.json"

python3 - "${tmpdir}/start.json" <<'PY'
import json
import pathlib
import sys
start = json.loads(pathlib.Path(sys.argv[1]).read_text())
assert start["run_id"] == "local-remote-helper-test"
PY

for _ in $(seq 1 20); do
  status_payload_b64="$(make_payload status)"
  PATH="${tmpdir}/bin" GROUPMIXER_REMOTE_PAYLOAD_B64="${status_payload_b64}" python3 "${TARGET_SCRIPT}" > "${status_payload_path}"
  if python3 - "${status_payload_path}" <<'PY'
import json
import pathlib
import sys
status = json.loads(pathlib.Path(sys.argv[1]).read_text())
raise SystemExit(0 if status.get("done") else 1)
PY
  then
    break
  fi
  sleep 0.2
done

python3 - "${status_payload_path}" "${bench_log}" <<'PY'
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
print("remote_benchmark_async_remote local helper test passed")
PY
