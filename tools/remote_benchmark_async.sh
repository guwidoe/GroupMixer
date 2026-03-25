#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEFAULT_ENV_FILE="${SCRIPT_DIR}/remote_benchmark.env"
LOCAL_REMOTE_DIR="${REPO_DIR}/benchmarking/artifacts/remotes"
DEFAULT_WAIT_POLL_SECONDS=10
STATUS_LOCAL_TTL_SECONDS=""

usage() {
  cat <<'EOF'
Usage:
  tools/remote_benchmark_async.sh check
  tools/remote_benchmark_async.sh snapshot
  tools/remote_benchmark_async.sh record-main
  tools/remote_benchmark_async.sh record-feature <feature-name>
  tools/remote_benchmark_async.sh start [record|record-bundle|compare-prev|save <name>|compare <name>] [-- benchmark-args...]
  tools/remote_benchmark_async.sh status <run-id>
  tools/remote_benchmark_async.sh tail <run-id> [lines]
  tools/remote_benchmark_async.sh wait <run-id>
  tools/remote_benchmark_async.sh fetch <run-id>
  tools/remote_benchmark_async.sh list
  tools/remote_benchmark_async.sh latest
  tools/remote_benchmark_async.sh cancel <run-id>

Defaults:
  - start without extra args runs `record` asynchronously on the remote machine.
  - snapshot runs the codified remote snapshot lane using `record -- --suite <snapshot-suite>`.
  - record-main runs the configured remote mainline recording bundle.
  - record-feature runs the configured remote feature-validation bundle.

Notes:
  - benchmark jobs are serialized remotely behind a single exclusive lock
  - repeated `start` requests for the same commit/command/args dedupe to one active run
  - remote benchmark state is mirrored locally under benchmarking/artifacts/remotes/<machine>/
EOF
}

load_env() {
  local env_file="${GROUPMIXER_REMOTE_ENV_FILE_LOCAL:-${DEFAULT_ENV_FILE}}"
  if [[ -f "${env_file}" ]]; then
    # shellcheck disable=SC1090
    source "${env_file}"
  fi
}

require_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "required variable ${name} is not set" >&2
    exit 1
  fi
}

sanitize_name() {
  printf '%s' "$1" | tr '/[:space:]' '--' | tr -cd '[:alnum:]._-'
}

local_git_branch() {
  git -C "${REPO_DIR}" rev-parse --abbrev-ref HEAD
}

local_git_commit() {
  git -C "${REPO_DIR}" rev-parse HEAD
}

local_git_shortsha() {
  git -C "${REPO_DIR}" rev-parse --short HEAD
}

local_git_subject() {
  git -C "${REPO_DIR}" log -1 --pretty=%s | tr '\t\n' '  ' | tr '()' '[]'
}

default_recording_suite_bundle() {
  cat <<'EOF'
representative
stretch
adversarial
hotpath-construction
hotpath-full-recalculation
hotpath-swap-preview
hotpath-swap-apply
hotpath-transfer-preview
hotpath-transfer-apply
hotpath-clique-swap-preview
hotpath-clique-swap-apply
hotpath-search-iteration
EOF
}

setup_config() {
  load_env
  require_var GROUPMIXER_REMOTE_SSH_TARGET
  require_var GROUPMIXER_REMOTE_STAGE_DIR
  require_var GROUPMIXER_REMOTE_MACHINE_NAME

  GROUPMIXER_REMOTE_SSH_BIN="${GROUPMIXER_REMOTE_SSH_BIN:-ssh}"
  GROUPMIXER_REMOTE_RSYNC_BIN="${GROUPMIXER_REMOTE_RSYNC_BIN:-rsync}"
  GROUPMIXER_REMOTE_RSYNC_SSH="${GROUPMIXER_REMOTE_RSYNC_SSH:-${GROUPMIXER_REMOTE_SSH_BIN}}"
  GROUPMIXER_REMOTE_PYTHON_BIN="${GROUPMIXER_REMOTE_PYTHON_BIN:-}"
  GROUPMIXER_REMOTE_MACHINE_NAME="$(sanitize_name "${GROUPMIXER_REMOTE_MACHINE_NAME}")"
  GROUPMIXER_REMOTE_BENCH_IDLE_MAX_LOAD1="${GROUPMIXER_REMOTE_BENCH_IDLE_MAX_LOAD1:-}"
  GROUPMIXER_REMOTE_BENCH_IDLE_POLL_SECONDS="${GROUPMIXER_REMOTE_BENCH_IDLE_POLL_SECONDS:-30}"
  GROUPMIXER_REMOTE_BENCH_IDLE_STREAK="${GROUPMIXER_REMOTE_BENCH_IDLE_STREAK:-1}"
  GROUPMIXER_REMOTE_BENCH_MAX_SECONDS="${GROUPMIXER_REMOTE_BENCH_MAX_SECONDS:-7200}"
  GROUPMIXER_REMOTE_BENCH_KILL_AFTER_SECONDS="${GROUPMIXER_REMOTE_BENCH_KILL_AFTER_SECONDS:-30}"
  GROUPMIXER_REMOTE_BENCH_BUILD_JOBS="${GROUPMIXER_REMOTE_BENCH_BUILD_JOBS:-1}"
  GROUPMIXER_REMOTE_SNAPSHOT_SUITE="${GROUPMIXER_REMOTE_SNAPSHOT_SUITE:-representative}"
  GROUPMIXER_REMOTE_RECORD_MAIN_SUITES="${GROUPMIXER_REMOTE_RECORD_MAIN_SUITES:-$(default_recording_suite_bundle | tr '\n' ' ')}"
  GROUPMIXER_REMOTE_RECORD_FEATURE_SUITES="${GROUPMIXER_REMOTE_RECORD_FEATURE_SUITES:-${GROUPMIXER_REMOTE_RECORD_MAIN_SUITES}}"
  STATUS_LOCAL_TTL_SECONDS="${GROUPMIXER_REMOTE_STATUS_LOCAL_TTL_SECONDS:-2}"

  REMOTE_REPO_DIR="${GROUPMIXER_REMOTE_STAGE_DIR%/}/GroupMixer"
  REMOTE_BENCH_ROOT="${GROUPMIXER_REMOTE_STAGE_DIR%/}/groupmixer-benchmark"
  REMOTE_RUNS_DIR="${REMOTE_BENCH_ROOT}/runs"
  REMOTE_SHARED_ARTIFACTS_DIR="${REMOTE_BENCH_ROOT}/shared/benchmarking-artifacts"
  REMOTE_LOCK_FILE="${REMOTE_BENCH_ROOT}/benchmark.lock"
  LOCAL_MACHINE_DIR="${LOCAL_REMOTE_DIR}/${GROUPMIXER_REMOTE_MACHINE_NAME}"
  LOCAL_RUNS_DIR="${LOCAL_MACHINE_DIR}/benchmark-runs"
  LOCAL_SHARED_ARTIFACTS_DIR="${LOCAL_MACHINE_DIR}/artifacts"
}

remote_run_snapshot_root() {
  printf '%s\n' "${REMOTE_RUNS_DIR}/$1/snapshot"
}

remote_run_repo_dir() {
  printf '%s\n' "$(remote_run_snapshot_root "$1")/GroupMixer"
}

generate_run_id() {
  local label="$1"
  local ts rand
  ts="$(date -u +%Y%m%d-%H%M%S-%6N)"
  rand="$(od -An -N2 -tx1 /dev/urandom | tr -d ' \n')"
  printf '%s-%s-%s-%s\n' "${ts}" "$(local_git_shortsha)" "$(sanitize_name "${label}")" "${rand}"
}

stage_remote() {
  echo "[groupmixer][remote] staging control checkout on ${GROUPMIXER_REMOTE_SSH_TARGET}:${REMOTE_REPO_DIR}"
  "${GROUPMIXER_REMOTE_SSH_BIN}" "${GROUPMIXER_REMOTE_SSH_TARGET}" \
    "mkdir -p '${REMOTE_REPO_DIR}' '${REMOTE_RUNS_DIR}' '${REMOTE_SHARED_ARTIFACTS_DIR}'"
  "${GROUPMIXER_REMOTE_RSYNC_BIN}" -az --delete -e "${GROUPMIXER_REMOTE_RSYNC_SSH}" \
    --exclude target \
    --exclude benchmarking/artifacts \
    --exclude .git \
    --exclude .pi \
    "${REPO_DIR}/" \
    "${GROUPMIXER_REMOTE_SSH_TARGET}:${REMOTE_REPO_DIR}/"
}

stage_remote_run_snapshot() {
  local run_id="$1"
  local snapshot_repo_dir
  snapshot_repo_dir="$(remote_run_repo_dir "${run_id}")"
  echo "[groupmixer][remote] staging immutable snapshot for run ${run_id}"
  "${GROUPMIXER_REMOTE_SSH_BIN}" "${GROUPMIXER_REMOTE_SSH_TARGET}" \
    "mkdir -p '${snapshot_repo_dir}' '${REMOTE_SHARED_ARTIFACTS_DIR}'"
  "${GROUPMIXER_REMOTE_RSYNC_BIN}" -az --delete -e "${GROUPMIXER_REMOTE_RSYNC_SSH}" \
    --exclude target \
    --exclude benchmarking/artifacts \
    --exclude .git \
    --exclude .pi \
    "${REPO_DIR}/" \
    "${GROUPMIXER_REMOTE_SSH_TARGET}:${snapshot_repo_dir}/"
  "${GROUPMIXER_REMOTE_SSH_BIN}" "${GROUPMIXER_REMOTE_SSH_TARGET}" \
    "rm -rf '${snapshot_repo_dir}/benchmarking/artifacts' && ln -s '${REMOTE_SHARED_ARTIFACTS_DIR}' '${snapshot_repo_dir}/benchmarking/artifacts'"
}

extract_suite_args() {
  local args=("$@")
  local i=0
  while (( i < ${#args[@]} )); do
    if [[ "${args[$i]}" == "--suite" ]]; then
      if (( i + 1 < ${#args[@]} )); then
        printf '%s\n' "${args[$((i + 1))]}"
        ((i += 2))
        continue
      fi
      break
    fi
    ((i += 1))
  done
}

extract_primary_suite_arg() {
  extract_suite_args "$@" | head -n 1
}

build_payload_json() {
  local action="$1"
  local run_id="$2"
  local bench_command="$3"
  shift 3 || true
  local requested_suite requested_suites_csv
  requested_suite="$(extract_primary_suite_arg "$@")"
  requested_suites_csv="$(extract_suite_args "$@" | paste -sd, -)"
  REQUESTED_SUITE="${requested_suite}" \
  REQUESTED_SUITES_CSV="${requested_suites_csv}" \
  REMOTE_REPO_DIR="${REMOTE_REPO_DIR}" \
  REMOTE_RUNS_DIR="${REMOTE_RUNS_DIR}" \
  REMOTE_LOCK_FILE="${REMOTE_LOCK_FILE}" \
  REMOTE_ENV_FILE="${GROUPMIXER_REMOTE_ENV_FILE:-}" \
  MACHINE_NAME="${GROUPMIXER_REMOTE_MACHINE_NAME}" \
  REMOTE_PYTHON_BIN_VALUE="${GROUPMIXER_REMOTE_PYTHON_BIN}" \
  GIT_BRANCH="$(local_git_branch)" \
  GIT_COMMIT="$(local_git_commit)" \
  GIT_SHORTSHA="$(local_git_shortsha)" \
  GIT_SUBJECT="$(local_git_subject)" \
  IDLE_MAX_LOAD1="${GROUPMIXER_REMOTE_BENCH_IDLE_MAX_LOAD1}" \
  IDLE_POLL_SECONDS="${GROUPMIXER_REMOTE_BENCH_IDLE_POLL_SECONDS}" \
  IDLE_STREAK="${GROUPMIXER_REMOTE_BENCH_IDLE_STREAK}" \
  BENCH_MAX_SECONDS="${GROUPMIXER_REMOTE_BENCH_MAX_SECONDS}" \
  BENCH_KILL_AFTER_SECONDS="${GROUPMIXER_REMOTE_BENCH_KILL_AFTER_SECONDS}" \
  BENCH_BUILD_JOBS="${GROUPMIXER_REMOTE_BENCH_BUILD_JOBS}" \
  BUNDLE_KIND_VALUE="${GROUPMIXER_REMOTE_PAYLOAD_BUNDLE_KIND:-}" \
  FEATURE_NAME_VALUE="${GROUPMIXER_REMOTE_PAYLOAD_FEATURE_NAME:-}" \
  FEATURE_PREVIOUS_TARGETS_JSON_VALUE="${GROUPMIXER_REMOTE_PAYLOAD_FEATURE_PREVIOUS_TARGETS_JSON:-}" \
  python3 - "$action" "$run_id" "$bench_command" "$@" <<'PY'
import json
import os
import sys

action, run_id, bench_command, *bench_args = sys.argv[1:]
requested_suites = [value for value in os.environ.get("REQUESTED_SUITES_CSV", "").split(",") if value]
payload = {
    "action": action,
    "run_id": run_id,
    "bench_command": bench_command,
    "bench_args": bench_args,
    "remote_repo_dir": os.environ["REMOTE_REPO_DIR"],
    "remote_runs_dir": os.environ["REMOTE_RUNS_DIR"],
    "remote_lock_file": os.environ["REMOTE_LOCK_FILE"],
    "remote_env_file": os.environ.get("REMOTE_ENV_FILE", ""),
    "machine_name": os.environ["MACHINE_NAME"],
    "requested_suite": os.environ.get("REQUESTED_SUITE", ""),
    "requested_suites": requested_suites,
    "remote_python_bin": os.environ.get("REMOTE_PYTHON_BIN_VALUE", ""),
    "git_branch": os.environ["GIT_BRANCH"],
    "git_commit": os.environ["GIT_COMMIT"],
    "git_shortsha": os.environ["GIT_SHORTSHA"],
    "git_subject": os.environ["GIT_SUBJECT"],
    "idle_max_load1": os.environ.get("IDLE_MAX_LOAD1", ""),
    "idle_poll_seconds": os.environ.get("IDLE_POLL_SECONDS", "30"),
    "idle_streak": os.environ.get("IDLE_STREAK", "1"),
    "bench_max_seconds": os.environ.get("BENCH_MAX_SECONDS", "7200"),
    "bench_kill_after_seconds": os.environ.get("BENCH_KILL_AFTER_SECONDS", "30"),
    "bench_build_jobs": os.environ.get("BENCH_BUILD_JOBS", "1"),
    "bundle_kind": os.environ.get("BUNDLE_KIND_VALUE", ""),
    "feature_name": os.environ.get("FEATURE_NAME_VALUE", ""),
    "feature_previous_targets": json.loads(os.environ.get("FEATURE_PREVIOUS_TARGETS_JSON_VALUE", "{}") or "{}"),
}
print(json.dumps(payload))
PY
}

remote_ref_target_run_report() {
  local ref_name="$1"
  "${GROUPMIXER_REMOTE_SSH_BIN}" "${GROUPMIXER_REMOTE_SSH_TARGET}" python3 - <<PY
import json
from pathlib import Path
ref_path = Path(${REMOTE_SHARED_ARTIFACTS_DIR@Q}) / "refs" / (${ref_name@Q} + ".json")
if ref_path.exists():
    data = json.loads(ref_path.read_text())
    target = data.get("target", {})
    print(target.get("run_report_path", ""))
PY
}

suite_manifest_path() {
  local suite_ref="$1"
  if [[ -f "${suite_ref}" ]]; then
    printf '%s\n' "${suite_ref}"
  else
    printf '%s\n' "${REPO_DIR}/benchmarking/suites/${suite_ref}.yaml"
  fi
}

suite_manifest_field() {
  local suite_ref="$1"
  local field_name="$2"
  local default_value="$3"
  local manifest_path
  manifest_path="$(suite_manifest_path "${suite_ref}")"
  FIELD_NAME="${field_name}" DEFAULT_VALUE="${default_value}" python3 - "${manifest_path}" <<'PY'
import os
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
value = os.environ["DEFAULT_VALUE"]
if path.exists():
    prefix = os.environ["FIELD_NAME"] + ":"
    for line in path.read_text().splitlines():
        stripped = line.strip()
        if stripped.startswith(prefix):
            value = stripped.split(":", 1)[1].strip()
            break
print(value)
PY
}

suite_manifest_id() {
  local suite_ref="$1"
  local fallback
  fallback="$(basename "${suite_ref}" .yaml)"
  suite_manifest_field "${suite_ref}" "suite_id" "${fallback}"
}

suite_manifest_benchmark_mode() {
  suite_manifest_field "$1" "benchmark_mode" "full_solve"
}

collect_feature_previous_targets_json() {
  local feature_name="$1"
  shift
  local sanitized_feature_name
  sanitized_feature_name="$(sanitize_name "${feature_name}")"
  local targets_json="{}"
  local suite suite_id suite_mode target ref_name
  for suite in "$@"; do
    suite_id="$(suite_manifest_id "${suite}")"
    suite_mode="$(suite_manifest_benchmark_mode "${suite}")"
    ref_name="features/${sanitized_feature_name}/suites/${suite_id}/${suite_mode}/latest"
    target="$(remote_ref_target_run_report "${ref_name}")"
    if [[ -n "${target}" ]]; then
      targets_json="$(TARGETS_JSON="${targets_json}" SUITE_NAME="${suite_id}" TARGET_PATH="${target}" python3 - <<'PY'
import json
import os

mapping = json.loads(os.environ["TARGETS_JSON"])
mapping[os.environ["SUITE_NAME"]] = os.environ["TARGET_PATH"]
print(json.dumps(mapping))
PY
)"
    fi
  done
  printf '%s\n' "${targets_json}"
}

run_remote_action() {
  local payload_json="$1"
  local payload_b64 quoted_b64 quoted_remote_python
  payload_b64="$(printf '%s' "${payload_json}" | base64 | tr -d '\n')"
  quoted_b64="$(printf '%q' "${payload_b64}")"
  quoted_remote_python="$(printf '%q' "${GROUPMIXER_REMOTE_PYTHON_BIN}")"
  "${GROUPMIXER_REMOTE_SSH_BIN}" "${GROUPMIXER_REMOTE_SSH_TARGET}" \
    "cd '${REMOTE_REPO_DIR}' && GROUPMIXER_REMOTE_PAYLOAD_B64=${quoted_b64} GROUPMIXER_REMOTE_PYTHON_BIN=${quoted_remote_python} bash -lc 'py=\"\${GROUPMIXER_REMOTE_PYTHON_BIN:-}\"; if [[ -z \"\$py\" ]]; then if [[ -x /usr/bin/python3 ]]; then py=/usr/bin/python3; else py=python3; fi; fi; exec \"\$py\" tools/remote_benchmark_async_remote.py'"
}

print_status_summary() {
  python3 - "$1" <<'PY'
import json, sys
status = json.loads(sys.argv[1])
if "error" in status:
    print(status["error"], file=sys.stderr)
    raise SystemExit(1)
done = bool(status.get("done"))
exit_code = status.get("exit_code")
bench_alive = bool(status.get("bench_process_alive"))
lock_acquired = status.get("lock_acquired_at")
if done:
    state = "passed" if str(exit_code) == "0" else "failed"
elif bench_alive:
    state = "benchmarking"
elif lock_acquired:
    state = "preparing"
else:
    state = "queued"
print(f"run_id: {status.get('run_id','')}")
print(f"command: {status.get('command','')} {' '.join(status.get('bench_args', []))}".rstrip())
print(f"suite: {status.get('requested_suite','')}")
requested_suites = ", ".join(status.get("requested_suites", []))
if requested_suites:
    print(f"suites: {requested_suites}")
print(f"commit: {status.get('git_shortsha','')}")
print(f"machine: {status.get('machine_name','')}")
print(f"remote_python: {status.get('remote_python_bin','')}")
print(f"state: {state}")
print(f"launcher: {status.get('launcher','')}")
print(f"session: {status.get('session_name','')}")
print(f"pid: {status.get('pid','')}")
print(f"bench_pid: {status.get('bench_pid','')}")
print(f"queued_at: {status.get('queued_at','')}")
print(f"lock_acquired_at: {status.get('lock_acquired_at','')}")
print(f"idle_ready_at: {status.get('idle_ready_at','')}")
print(f"finished_at: {status.get('finished_at','')}")
print(f"exit_code: {status.get('exit_code','')}")
print(f"remote_log: {status.get('remote_log','')}")
PY
}

mirror_run() {
  local run_id="$1"
  mkdir -p "${LOCAL_RUNS_DIR}"
  if "${GROUPMIXER_REMOTE_SSH_BIN}" "${GROUPMIXER_REMOTE_SSH_TARGET}" "test -d '${REMOTE_RUNS_DIR}/${run_id}'"; then
    "${GROUPMIXER_REMOTE_RSYNC_BIN}" -az -e "${GROUPMIXER_REMOTE_RSYNC_SSH}" \
      "${GROUPMIXER_REMOTE_SSH_TARGET}:${REMOTE_RUNS_DIR}/${run_id}/" \
      "${LOCAL_RUNS_DIR}/${run_id}/"
    echo "[groupmixer][remote] mirrored benchmark run to ${LOCAL_RUNS_DIR}/${run_id}"
  fi
}

mirror_remote_results() {
  mkdir -p "${LOCAL_MACHINE_DIR}" "${LOCAL_SHARED_ARTIFACTS_DIR}"
  if "${GROUPMIXER_REMOTE_SSH_BIN}" "${GROUPMIXER_REMOTE_SSH_TARGET}" "test -d '${REMOTE_SHARED_ARTIFACTS_DIR}'"; then
    "${GROUPMIXER_REMOTE_RSYNC_BIN}" -az -e "${GROUPMIXER_REMOTE_RSYNC_SSH}" \
      "${GROUPMIXER_REMOTE_SSH_TARGET}:${REMOTE_SHARED_ARTIFACTS_DIR}/" \
      "${LOCAL_SHARED_ARTIFACTS_DIR}/"
    echo "[groupmixer][remote] mirrored shared artifacts to ${LOCAL_SHARED_ARTIFACTS_DIR}"
  fi
}

local_run_dir() {
  local run_id="$1"
  printf '%s\n' "${LOCAL_RUNS_DIR}/${run_id}"
}

write_local_run_json() {
  local run_id="$1"
  local name="$2"
  local json_payload="$3"
  local run_dir
  run_dir="$(local_run_dir "${run_id}")"
  mkdir -p "${run_dir}"
  printf '%s\n' "${json_payload}" > "${run_dir}/${name}"
}

acquire_status_lock() {
  local run_id="$1"
  local lock_dir="${LOCAL_MACHINE_DIR}/.locks"
  mkdir -p "${lock_dir}"
  local lock_file="${lock_dir}/status-$(sanitize_name "${run_id}").lock"
  exec 9>"${lock_file}"
  flock -n 9
}

status_cache_file() {
  local run_id="$1"
  local cache_dir="${LOCAL_MACHINE_DIR}/.cache"
  mkdir -p "${cache_dir}"
  printf '%s\n' "${cache_dir}/status-$(sanitize_name "${run_id}").json"
}

status_cache_fresh() {
  local cache_file="$1"
  local ttl="$2"
  if [[ ! -f "${cache_file}" ]]; then
    printf '0\n'
    return
  fi
  local now mtime age
  now="$(date +%s)"
  mtime="$(stat -c %Y "${cache_file}")"
  age=$((now - mtime))
  if (( age <= ttl )); then
    printf '1\n'
  else
    printf '0\n'
  fi
}

write_latest_local() {
  local run_id="$1"
  mkdir -p "${LOCAL_MACHINE_DIR}"
  printf '%s\n' "${run_id}" > "${LOCAL_MACHINE_DIR}/latest-run"
}

start_run() {
  local bench_command="record"
  if [[ $# -gt 0 ]]; then
    bench_command="$1"
    shift
  fi
  if [[ "${1:-}" == "--" ]]; then
    shift
  fi
  case "${bench_command}" in
    record|record-bundle|compare-prev)
      ;;
    save|compare)
      [[ $# -ge 1 ]] || { usage >&2; exit 1; }
      ;;
    *)
      echo "unsupported async benchmark command: ${bench_command}" >&2
      exit 1
      ;;
  esac

  local run_id payload_json start_json effective_run_id
  run_id="$(generate_run_id "${bench_command}")"
  stage_remote_run_snapshot "${run_id}"
  payload_json="$(build_payload_json start "${run_id}" "${bench_command}" "$@")"
  start_json="$(run_remote_action "${payload_json}")"
  effective_run_id="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["run_id"])' <<<"${start_json}")"
  write_latest_local "${effective_run_id}"
  write_local_run_json "${effective_run_id}" "start.json" "${start_json}"
  mirror_run "${effective_run_id}"
  python3 - "${start_json}" <<'PY'
import json, sys
start = json.loads(sys.argv[1])
if start.get("deduped"):
    print(f"[groupmixer][remote] reusing active benchmark run {start['run_id']}")
else:
    print(f"[groupmixer][remote] started benchmark run {start['run_id']}")
print(f"[groupmixer][remote] launcher: {start.get('launcher','')}")
print(f"[groupmixer][remote] session: {start.get('session_name','')}")
print(f"[groupmixer][remote] pid: {start.get('pid','')}")
print(f"[groupmixer][remote] log: {start.get('remote_log','')}")
PY
}

status_run() {
  local run_id="$1"
  local cache_file cache_fresh payload_json status_json
  acquire_status_lock "${run_id}" || return 0
  cache_file="$(status_cache_file "${run_id}")"
  cache_fresh="$(status_cache_fresh "${cache_file}" "${STATUS_LOCAL_TTL_SECONDS}")"
  if [[ "${cache_fresh}" == "1" ]]; then
    status_json="$(<"${cache_file}")"
  else
    payload_json="$(build_payload_json status "${run_id}" record)"
    status_json="$(run_remote_action "${payload_json}")"
    printf '%s\n' "${status_json}" > "${cache_file}"
  fi
  write_local_run_json "${run_id}" "status.json" "${status_json}"
  print_status_summary "${status_json}"
}

wait_run() {
  local run_id="$1"
  while true; do
    local payload_json status_json done exit_code
    payload_json="$(build_payload_json status "${run_id}" record)"
    status_json="$(run_remote_action "${payload_json}")"
    printf '%s\n' "${status_json}" > "$(status_cache_file "${run_id}")"
    write_local_run_json "${run_id}" "status.json" "${status_json}"
    print_status_summary "${status_json}"
    done="$(python3 -c 'import json,sys; print(str(json.load(sys.stdin).get("done", False)).lower())' <<<"${status_json}")"
    if [[ "${done}" == "true" ]]; then
      mirror_remote_results
      mirror_run "${run_id}"
      exit_code="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("exit_code", 1))' <<<"${status_json}")"
      [[ "${exit_code}" == "0" ]]
      return
    fi
    sleep "${GROUPMIXER_REMOTE_BENCH_WAIT_POLL_SECONDS:-${DEFAULT_WAIT_POLL_SECONDS}}"
    echo "---"
  done
}

list_runs() {
  local payload_json list_json
  payload_json="$(build_payload_json list "" record)"
  list_json="$(run_remote_action "${payload_json}")"
  python3 - "${list_json}" <<'PY'
import json, sys
runs = json.loads(sys.argv[1]).get("runs", [])
for run in runs:
    state = "running"
    if run.get("done"):
        state = "passed" if str(run.get("exit_code")) == "0" else "failed"
    print("\t".join([
        run.get("run_id", ""),
        run.get("command", "") or "",
        run.get("commit", "") or "",
        state,
        str(run.get("exit_code", "") or ""),
    ]))
PY
}

latest_run() {
  local payload_json latest_json
  payload_json="$(build_payload_json latest "" record)"
  latest_json="$(run_remote_action "${payload_json}")"
  python3 - "${latest_json}" <<'PY'
import json, sys
run = json.loads(sys.argv[1]).get("run")
if run:
    print(run.get("run_id", ""))
PY
}

fetch_run() {
  local run_id="$1"
  mirror_remote_results
  mirror_run "${run_id}"
}

start_snapshot() {
  echo "[groupmixer][remote] snapshot suite: ${GROUPMIXER_REMOTE_SNAPSHOT_SUITE}"
  start_run record --suite "${GROUPMIXER_REMOTE_SNAPSHOT_SUITE}"
}

start_recording_bundle() {
  local bundle_kind="$1"
  local feature_name="${2:-}"
  local suites_raw purpose label
  case "${bundle_kind}" in
    main)
      suites_raw="${GROUPMIXER_REMOTE_RECORD_MAIN_SUITES}"
      purpose="mainline"
      label="record-main"
      ;;
    feature)
      suites_raw="${GROUPMIXER_REMOTE_RECORD_FEATURE_SUITES}"
      purpose="feature-validation"
      label="record-feature-${feature_name}"
      ;;
    *)
      echo "unsupported bundle kind: ${bundle_kind}" >&2
      exit 1
      ;;
  esac

  local suites=()
  # shellcheck disable=SC2206
  suites=(${suites_raw})
  [[ ${#suites[@]} -gt 0 ]] || {
    echo "no remote recording suites configured for ${bundle_kind}" >&2
    exit 1
  }

  local bundle_args=(--purpose "${purpose}")
  if [[ "${bundle_kind}" == "feature" ]]; then
    bundle_args+=(--feature-name "${feature_name}")
  fi
  local suite
  for suite in "${suites[@]}"; do
    if [[ -f "${suite}" || "${suite}" == */* || "${suite}" == *.yaml ]]; then
      bundle_args+=(--manifest "${suite}")
    else
      bundle_args+=(--suite "${suite}")
    fi
  done

  local feature_previous_targets_json="{}"
  if [[ "${bundle_kind}" == "feature" ]]; then
    feature_previous_targets_json="$(collect_feature_previous_targets_json "${feature_name}" "${suites[@]}")"
  fi

  local run_id
  run_id="$(generate_run_id "${label}")"
  bundle_args+=(--recording-id "${run_id}")
  stage_remote_run_snapshot "${run_id}"
  local payload_json start_json effective_run_id
  GROUPMIXER_REMOTE_PAYLOAD_BUNDLE_KIND="${bundle_kind}" \
  GROUPMIXER_REMOTE_PAYLOAD_FEATURE_NAME="${feature_name}" \
  GROUPMIXER_REMOTE_PAYLOAD_FEATURE_PREVIOUS_TARGETS_JSON="${feature_previous_targets_json}" \
    payload_json="$(build_payload_json start "${run_id}" "record-bundle" "${bundle_args[@]}")"
  start_json="$(run_remote_action "${payload_json}")"
  effective_run_id="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["run_id"])' <<<"${start_json}")"
  write_latest_local "${effective_run_id}"
  write_local_run_json "${effective_run_id}" "start.json" "${start_json}"
  mirror_run "${effective_run_id}"
  python3 - "${start_json}" <<'PY'
import json, sys
start = json.loads(sys.argv[1])
if start.get("deduped"):
    print(f"[groupmixer][remote] reusing active benchmark run {start['run_id']}")
else:
    print(f"[groupmixer][remote] started benchmark run {start['run_id']}")
print(f"[groupmixer][remote] launcher: {start.get('launcher','')}")
print(f"[groupmixer][remote] session: {start.get('session_name','')}")
print(f"[groupmixer][remote] pid: {start.get('pid','')}")
print(f"[groupmixer][remote] log: {start.get('remote_log','')}")
PY
}

run_check() {
  stage_remote
  local payload_json
  payload_json="$(build_payload_json check "" record)"
  run_remote_action "${payload_json}"
}

main() {
  local command="${1:-}"
  case "${command}" in
    check)
      setup_config
      run_check
      ;;
    snapshot)
      setup_config
      stage_remote
      start_snapshot
      ;;
    record-main)
      setup_config
      stage_remote
      start_recording_bundle main
      ;;
    record-feature)
      [[ $# -eq 2 ]] || { usage; exit 1; }
      setup_config
      stage_remote
      start_recording_bundle feature "$2"
      ;;
    start)
      shift || true
      setup_config
      stage_remote
      start_run "$@"
      ;;
    status)
      [[ $# -eq 2 ]] || { usage; exit 1; }
      setup_config
      status_run "$2"
      ;;
    tail)
      [[ $# -ge 2 && $# -le 3 ]] || { usage; exit 1; }
      setup_config
      local run_id="$2"
      local lines="${3:-200}"
      exec "${GROUPMIXER_REMOTE_SSH_BIN}" "${GROUPMIXER_REMOTE_SSH_TARGET}" "tail -n ${lines} -f '${REMOTE_RUNS_DIR}/${run_id}/benchmark.log'"
      ;;
    wait)
      [[ $# -eq 2 ]] || { usage; exit 1; }
      setup_config
      wait_run "$2"
      ;;
    fetch)
      [[ $# -eq 2 ]] || { usage; exit 1; }
      setup_config
      fetch_run "$2"
      ;;
    list)
      setup_config
      list_runs
      ;;
    latest)
      setup_config
      latest_run
      ;;
    cancel)
      [[ $# -eq 2 ]] || { usage; exit 1; }
      setup_config
      run_remote_action "$(build_payload_json cancel "$2" record)"
      mirror_remote_results
      mirror_run "$2"
      ;;
    ""|-h|--help|help)
      usage
      ;;
    *)
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
