#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
TARGET_SCRIPT="${SCRIPT_DIR}/remote_benchmark_async.sh"

tmpdir="$(mktemp -d)"
machine_name="remote-bundle-test-$$-$(date +%s)"
remote_stage_dir="${tmpdir}/remote-stage"
ssh_log="${tmpdir}/ssh.log"
rsync_log="${tmpdir}/rsync.log"
payload_dir="${tmpdir}/payloads"
mkdir -p "${tmpdir}/bin" "${payload_dir}"
: > "${ssh_log}"

cleanup() {
  rm -rf "${tmpdir}"
  rm -rf "${REPO_DIR}/benchmarking/artifacts/remotes/${machine_name}"
}
trap cleanup EXIT

cat > "${tmpdir}/bin/ssh" <<EOF
#!/usr/bin/env bash
set -euo pipefail

echo "\$*" >> $(printf '%q' "${ssh_log}")
if [[ "\${2:-}" == "python3" && "\${3:-}" == "-" ]]; then
  exec python3 -
fi
command="\${*: -1}"
if [[ "\${command}" == *"remote_benchmark_async_remote.py"* ]]; then
  assign="\${command#*GROUPMIXER_REMOTE_PAYLOAD_B64=}"
  assign="\${assign%% GROUPMIXER_REMOTE_PYTHON_BIN=*}"
  eval "payload_b64=\${assign}"
  payload_json="\$(printf '%s' "\${payload_b64}" | base64 -d)"
  payload_count="\$(find $(printf '%q' "${payload_dir}") -maxdepth 1 -name 'payload-*.json' | wc -l | tr -d ' ')"
  payload_path=$(printf '%q' "${payload_dir}")/payload-\${payload_count}.json
  printf '%s\n' "\${payload_json}" > "\${payload_path}"
  python3 - "\${payload_path}" <<'PY'
import json
import pathlib
import sys
payload_path = pathlib.Path(sys.argv[1])
payload = json.loads(payload_path.read_text())
run_dir = pathlib.Path(payload["remote_runs_dir"]) / payload["run_id"]
run_dir.mkdir(parents=True, exist_ok=True)
meta = {
    "run_id": payload["run_id"],
    "bench_command": payload["bench_command"],
    "bench_args": payload.get("bench_args", []),
    "requested_suite": payload.get("requested_suite"),
    "requested_suites": payload.get("requested_suites", []),
}
(run_dir / "meta.json").write_text(json.dumps(meta, indent=2) + "\n")
(run_dir / "benchmark.log").write_text("stub\n")
print(json.dumps({
    "run_id": payload["run_id"],
    "launcher": "process",
    "session_name": "",
    "pid": 123,
    "remote_log": str(run_dir / "benchmark.log"),
    "machine_name": payload.get("machine_name"),
    "requested_suite": payload.get("requested_suite"),
    "requested_suites": payload.get("requested_suites", []),
    "remote_python_bin": payload.get("remote_python_bin", "")
}))
PY
  exit 0
fi
exec bash -lc "\${command}"
EOF
chmod +x "${tmpdir}/bin/ssh"

cat > "${tmpdir}/bin/rsync" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> __RSYNC_LOG__
args=("$@")
dst="${args[$(( ${#args[@]} - 1 ))]}"
dst="${dst#*:}"
mkdir -p "${dst}" "${dst}/benchmarking"
EOF
chmod +x "${tmpdir}/bin/rsync"
python3 - <<PY
from pathlib import Path
path = Path(${tmpdir@Q}) / "bin" / "rsync"
path.write_text(path.read_text().replace("__RSYNC_LOG__", ${rsync_log@Q}))
PY

remote_shared_refs="${remote_stage_dir}/groupmixer-benchmark/shared/benchmarking-artifacts/refs"
mkdir -p "${remote_shared_refs}/features/setup-refactor/suites/representative/full_solve"
mkdir -p "${remote_shared_refs}/features/setup-refactor/suites/hotpath-swap-preview/swap_preview"
cat > "${remote_shared_refs}/features/setup-refactor/suites/representative/full_solve/latest.json" <<'JSON'
{
  "target": { "run_report_path": "runs/representative-prev/run-report.json" }
}
JSON
cat > "${remote_shared_refs}/features/setup-refactor/suites/hotpath-swap-preview/swap_preview/latest.json" <<'JSON'
{
  "target": { "run_report_path": "runs/hotpath-prev/run-report.json" }
}
JSON

cat > "${tmpdir}/remote_benchmark.env" <<EOF
GROUPMIXER_REMOTE_SSH_TARGET=fake-host
GROUPMIXER_REMOTE_STAGE_DIR=${remote_stage_dir}
GROUPMIXER_REMOTE_MACHINE_NAME=${machine_name}
GROUPMIXER_REMOTE_SSH_BIN=${tmpdir}/bin/ssh
GROUPMIXER_REMOTE_RSYNC_BIN=${tmpdir}/bin/rsync
GROUPMIXER_REMOTE_RSYNC_SSH=${tmpdir}/bin/ssh
GROUPMIXER_REMOTE_PYTHON_BIN=/usr/bin/python3
GROUPMIXER_REMOTE_RECORD_MAIN_SUITES="representative hotpath-swap-preview"
GROUPMIXER_REMOTE_RECORD_FEATURE_SUITES="representative hotpath-swap-preview"
EOF

GROUPMIXER_REMOTE_ENV_FILE_LOCAL="${tmpdir}/remote_benchmark.env" "${TARGET_SCRIPT}" record-main >/dev/null
GROUPMIXER_REMOTE_ENV_FILE_LOCAL="${tmpdir}/remote_benchmark.env" "${TARGET_SCRIPT}" record-feature setup-refactor >/dev/null

python3 - "${payload_dir}" "${REPO_DIR}" "${machine_name}" <<'PY'
import json
import pathlib
import sys

payload_dir = pathlib.Path(sys.argv[1])
repo_dir = pathlib.Path(sys.argv[2])
machine_name = sys.argv[3]
payloads = sorted(payload_dir.glob('payload-*.json'))
assert len(payloads) == 2, payloads
main_payload = json.loads(payloads[0].read_text())
feature_payload = json.loads(payloads[1].read_text())

assert main_payload["bench_command"] == "record-bundle"
assert main_payload["bundle_kind"] == "main"
assert main_payload["requested_suites"] == ["representative", "hotpath-swap-preview"]
assert "--purpose" in main_payload["bench_args"] and "mainline" in main_payload["bench_args"]
assert main_payload["bench_args"].count("--suite") == 2
assert "hotpath-swap-preview" in main_payload["bench_args"]

assert feature_payload["bench_command"] == "record-bundle"
assert feature_payload["bundle_kind"] == "feature"
assert feature_payload["feature_name"] == "setup-refactor"
assert feature_payload["requested_suites"] == ["representative", "hotpath-swap-preview"]
assert feature_payload["feature_previous_targets"] == {
    "representative": "runs/representative-prev/run-report.json",
    "hotpath-swap-preview": "runs/hotpath-prev/run-report.json",
}
assert "--feature-name" in feature_payload["bench_args"]
assert feature_payload["bench_args"][feature_payload["bench_args"].index("--feature-name") + 1] == "setup-refactor"
assert feature_payload["bench_args"].count("--suite") == 2
assert "hotpath-swap-preview" in feature_payload["bench_args"]

remote_local_dir = repo_dir / "benchmarking" / "artifacts" / "remotes" / machine_name / "benchmark-runs"
start_files = sorted(remote_local_dir.glob('*/start.json'))
assert len(start_files) == 2, start_files
for start_file in start_files:
    start = json.loads(start_file.read_text())
    assert start["machine_name"] == machine_name
print("remote_benchmark_async bundle regression test passed")
PY

test "$(wc -l < "${rsync_log}" | tr -d ' ')" = "4"
