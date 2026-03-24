#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEFAULT_ENV_FILE="${SCRIPT_DIR}/remote_benchmark.env"
LOCAL_REMOTE_DIR="${REPO_DIR}/benchmarking/artifacts/remotes"

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

Notes:
  - This script stages immutable repo snapshots to a designated remote machine.
  - Remote execution is serialized behind one explicit machine lock.
  - Remote benchmark state is mirrored locally under benchmarking/artifacts/remotes/<machine>/.
  - Only `check` is available in the initial staging/config slice; the async control
    commands are completed in the next implementation slice.
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

default_recording_suite_bundle() {
  cat <<'EOF'
representative
stretch
adversarial
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
  GROUPMIXER_REMOTE_SNAPSHOT_SUITE="${GROUPMIXER_REMOTE_SNAPSHOT_SUITE:-representative}"
  GROUPMIXER_REMOTE_RECORD_MAIN_SUITES="${GROUPMIXER_REMOTE_RECORD_MAIN_SUITES:-$(default_recording_suite_bundle | tr '\n' ' ')}"
  GROUPMIXER_REMOTE_RECORD_FEATURE_SUITES="${GROUPMIXER_REMOTE_RECORD_FEATURE_SUITES:-${GROUPMIXER_REMOTE_RECORD_MAIN_SUITES}}"
  GROUPMIXER_REMOTE_BENCH_BUILD_JOBS="${GROUPMIXER_REMOTE_BENCH_BUILD_JOBS:-1}"

  REMOTE_REPO_DIR="${GROUPMIXER_REMOTE_STAGE_DIR%/}/GroupMixer"
  REMOTE_BENCH_ROOT="${GROUPMIXER_REMOTE_STAGE_DIR%/}/groupmixer-benchmark"
  REMOTE_RUNS_DIR="${REMOTE_BENCH_ROOT}/runs"
  REMOTE_SHARED_ARTIFACTS_DIR="${REMOTE_BENCH_ROOT}/shared/benchmarking-artifacts"
  REMOTE_LOCK_FILE="${REMOTE_BENCH_ROOT}/benchmark.lock"
  LOCAL_MACHINE_DIR="${LOCAL_REMOTE_DIR}/${GROUPMIXER_REMOTE_MACHINE_NAME}"
  LOCAL_RUNS_DIR="${LOCAL_MACHINE_DIR}/benchmark-runs"
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
  local snapshot_root snapshot_repo_dir
  snapshot_root="$(remote_run_snapshot_root "${run_id}")"
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

mirror_remote_state_root() {
  mkdir -p "${LOCAL_MACHINE_DIR}" "${LOCAL_RUNS_DIR}"
}

run_check() {
  setup_config
  stage_remote
  local remote_python
  remote_python="${GROUPMIXER_REMOTE_PYTHON_BIN:-python3}"
  "${GROUPMIXER_REMOTE_SSH_BIN}" "${GROUPMIXER_REMOTE_SSH_TARGET}" \
    "cd '${REMOTE_REPO_DIR}' && if [[ -n '${GROUPMIXER_REMOTE_PYTHON_BIN}' ]]; then export GROUPMIXER_REMOTE_PYTHON_BIN='${GROUPMIXER_REMOTE_PYTHON_BIN}'; fi; bash -lc 'command -v cargo >/dev/null && command -v rustc >/dev/null && command -v rsync >/dev/null && echo [groupmixer][remote] host: \$(hostname) && echo [groupmixer][remote] uname: \"\$(uname -a)\" && cargo -V && rustc -Vv && ${remote_python} -V'"
  echo "[groupmixer][remote] machine=${GROUPMIXER_REMOTE_MACHINE_NAME}"
  echo "[groupmixer][remote] stage_dir=${GROUPMIXER_REMOTE_STAGE_DIR}"
  echo "[groupmixer][remote] shared_artifacts=${REMOTE_SHARED_ARTIFACTS_DIR}"
}

main() {
  local command="${1:-}"
  case "${command}" in
    check)
      run_check
      ;;
    snapshot|record-main|record-feature|start|status|tail|wait|fetch|list|latest|cancel)
      echo "remote async control commands are implemented in the next slice; staging/config support is ready now" >&2
      exit 3
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
