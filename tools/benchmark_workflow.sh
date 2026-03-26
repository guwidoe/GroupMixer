#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
RUNNER="${SCRIPT_DIR}/benchmark_runner.py"
BUILD_JOBS="${GROUPMIXER_BENCH_BUILD_JOBS:-1}"
PYTHON_OVERRIDE="${GROUPMIXER_BENCH_PYTHON_BIN:-}"

usage() {
  cat <<'EOF'
Usage:
  tools/benchmark_workflow.sh doctor
  tools/benchmark_workflow.sh run [benchmark-args...]
  tools/benchmark_workflow.sh save <name> [benchmark-args...]
  tools/benchmark_workflow.sh record [benchmark-args...]
  tools/benchmark_workflow.sh record-bundle [benchmark-args...]
  tools/benchmark_workflow.sh compare <baseline-name> [benchmark-args...]
  tools/benchmark_workflow.sh compare-prev [benchmark-args...]
  tools/benchmark_workflow.sh list [benchmark-args...]
  tools/benchmark_workflow.sh history [benchmark-args...]
  tools/benchmark_workflow.sh latest [benchmark-args...]
  tools/benchmark_workflow.sh previous [benchmark-args...]
  tools/benchmark_workflow.sh recordings <list|show ...> [benchmark-args...]
  tools/benchmark_workflow.sh refs <list|show ...> [benchmark-args...]

Conventions:
  - `run` maps to `solver-cli benchmark run ...`
  - `save <name>` maps to `solver-cli benchmark run --save-baseline <name> ...`
  - `compare <name>` maps to `solver-cli benchmark compare --baseline <name> ...`
  - `list` maps to `solver-cli benchmark baseline list ...`
  - `history` maps to `solver-cli benchmark recordings list ...`

Safety knobs:
  - GROUPMIXER_BENCH_BUILD_JOBS=1 keeps release builds memory-bounded by default
  - GROUPMIXER_BENCH_PYTHON_BIN=/usr/bin/python3 forces a known-safe interpreter when needed
EOF
}

resolve_python_bin() {
  if [[ -n "${PYTHON_OVERRIDE}" ]]; then
    printf '%s\n' "${PYTHON_OVERRIDE}"
    return
  fi
  if [[ -x "/usr/bin/python3" ]]; then
    printf '%s\n' "/usr/bin/python3"
    return
  fi
  printf '%s\n' "python3"
}

python_path() {
  local python_bin="$1"
  if [[ "${python_bin}" == */* ]]; then
    printf '%s\n' "${python_bin}"
  else
    command -v "${python_bin}"
  fi
}

assert_safe_python() {
  local python_bin="$1"
  local resolved
  resolved="$(python_path "${python_bin}")"
  if [[ "${resolved}" == *"/intercepted-commands/"* ]]; then
    cat >&2 <<EOF
unsafe benchmark python interpreter detected:
  requested: ${python_bin}
  resolved:  ${resolved}

Use one of:
  export GROUPMIXER_BENCH_PYTHON_BIN=/usr/bin/python3
  ./tools/benchmark_workflow.sh doctor
EOF
    exit 2
  fi
}

print_doctor() {
  local python_bin resolved release_bin
  python_bin="$(resolve_python_bin)"
  resolved="$(python_path "${python_bin}")"
  release_bin="${REPO_DIR}/target/release/solver-cli"

  echo "repo_dir=${REPO_DIR}"
  echo "runner=${RUNNER}"
  echo "python_bin=${python_bin}"
  echo "python_resolved=${resolved}"
  echo "build_jobs=${BUILD_JOBS}"
  echo "release_bin=${release_bin}"
  if [[ "${resolved}" == *"/intercepted-commands/"* ]]; then
    echo "python_safety=unsafe-intercepted-wrapper"
    return 2
  fi
  echo "python_safety=ok"
}

run_runner() {
  local python_bin
  python_bin="$(resolve_python_bin)"
  assert_safe_python "${python_bin}"
  cd "${REPO_DIR}"
  GROUPMIXER_BENCH_BUILD_JOBS="${BUILD_JOBS}" exec "${python_bin}" "${RUNNER}" "$@"
}

main() {
  local command="${1:-}"
  case "${command}" in
    doctor)
      shift || true
      [[ $# -eq 0 ]] || { usage >&2; exit 1; }
      print_doctor
      ;;
    run|record|record-bundle|compare-prev|latest|previous)
      shift || true
      run_runner "${command}" "$@"
      ;;
    save)
      shift || true
      [[ $# -ge 1 ]] || { usage >&2; exit 1; }
      local baseline_name="$1"
      shift
      run_runner run --save-baseline "${baseline_name}" "$@"
      ;;
    compare)
      shift || true
      [[ $# -ge 1 ]] || { usage >&2; exit 1; }
      local baseline_name="$1"
      shift
      run_runner compare --baseline "${baseline_name}" "$@"
      ;;
    list)
      shift || true
      run_runner baseline list "$@"
      ;;
    history)
      shift || true
      run_runner recordings list "$@"
      ;;
    recordings|refs)
      shift || true
      [[ $# -ge 1 ]] || { usage >&2; exit 1; }
      run_runner "${command}" "$@"
      ;;
    help|-h|--help|"")
      usage
      ;;
    *)
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
