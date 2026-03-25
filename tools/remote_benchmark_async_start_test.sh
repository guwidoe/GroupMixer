#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
TARGET_SCRIPT="${SCRIPT_DIR}/remote_benchmark_async.sh"

tmpdir="$(mktemp -d)"
machine_name="remote-start-test-$$-$(date +%s)"
remote_stage_dir="${tmpdir}/remote-stage"
payload_path="${tmpdir}/payload.json"
mkdir -p "${tmpdir}/bin"

cleanup() {
  rm -rf "${tmpdir}"
  rm -rf "${REPO_DIR}/benchmarking/artifacts/remotes/${machine_name}"
}
trap cleanup EXIT

cat > "${tmpdir}/bin/ssh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
command="\${*: -1}"
if [[ "\${command}" == *"remote_benchmark_async_remote.py"* ]]; then
  assign="\${command#*GROUPMIXER_REMOTE_PAYLOAD_B64=}"
  assign="\${assign%% GROUPMIXER_REMOTE_PYTHON_BIN=*}"
  eval "payload_b64=\${assign}"
  printf '%s' "\${payload_b64}" | base64 -d > $(printf '%q' "${payload_path}")
  python3 - <<'PY'
import json
import pathlib
run_id = 'stub-run'
payload = json.loads(pathlib.Path(${payload_path@Q}).read_text())
run_dir = pathlib.Path(payload['remote_runs_dir']) / payload['run_id']
run_dir.mkdir(parents=True, exist_ok=True)
(run_dir / 'benchmark.log').write_text('stub\n')
print(json.dumps({
    'run_id': payload['run_id'],
    'launcher': 'process',
    'session_name': 'stub-session',
    'pid': 123,
    'remote_log': str(run_dir / 'benchmark.log'),
    'machine_name': payload.get('machine_name'),
    'requested_suite': payload.get('requested_suite'),
    'requested_suites': payload.get('requested_suites', []),
    'remote_python_bin': payload.get('remote_python_bin', ''),
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
args=("$@")
dst="${args[$(( ${#args[@]} - 1 ))]}"
dst="${dst#*:}"
mkdir -p "${dst}" "${dst}/benchmarking"
EOF
chmod +x "${tmpdir}/bin/rsync"

cat > "${tmpdir}/remote_benchmark.env" <<EOF
GROUPMIXER_REMOTE_SSH_TARGET=fake-host
GROUPMIXER_REMOTE_STAGE_DIR=${remote_stage_dir}
GROUPMIXER_REMOTE_MACHINE_NAME=${machine_name}
GROUPMIXER_REMOTE_SSH_BIN=${tmpdir}/bin/ssh
GROUPMIXER_REMOTE_RSYNC_BIN=${tmpdir}/bin/rsync
GROUPMIXER_REMOTE_RSYNC_SSH=${tmpdir}/bin/ssh
EOF

GROUPMIXER_REMOTE_ENV_FILE_LOCAL="${tmpdir}/remote_benchmark.env" "${TARGET_SCRIPT}" start record -- --suite path >/dev/null

python3 - "${payload_path}" <<'PY'
import json
import pathlib
import sys
payload = json.loads(pathlib.Path(sys.argv[1]).read_text())
assert payload['bench_command'] == 'record'
assert payload['requested_suite'] == 'path'
assert payload['requested_suites'] == ['path']
assert payload['bench_args'] == ['--suite', 'path'], payload['bench_args']
print('remote_benchmark_async start regression test passed')
PY
