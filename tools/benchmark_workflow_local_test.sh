#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
TARGET_SCRIPT="${SCRIPT_DIR}/benchmark_workflow.sh"

TMPDIR_LOCAL="$(mktemp -d)"
ARTIFACTS_DIR="${TMPDIR_LOCAL}/artifacts"
PYTHON_BIN="${GROUPMIXER_BENCH_TEST_PYTHON_BIN:-${GROUPMIXER_BENCH_PYTHON_BIN:-}}"
if [[ -z "${PYTHON_BIN}" ]]; then
  if [[ -x "/usr/bin/python3" ]]; then
    PYTHON_BIN="/usr/bin/python3"
  else
    PYTHON_BIN="python3"
  fi
fi

cleanup() {
  rm -rf "${TMPDIR_LOCAL}"
}
trap cleanup EXIT

cd "${REPO_DIR}"

GROUPMIXER_BENCH_PYTHON_BIN="${PYTHON_BIN}" "${TARGET_SCRIPT}" doctor >/dev/null
GROUPMIXER_BENCH_PYTHON_BIN="${PYTHON_BIN}" GROUPMIXER_BENCH_BUILD_JOBS=1 \
  "${TARGET_SCRIPT}" record --suite hotpath-swap-preview --artifacts-dir "${ARTIFACTS_DIR}" --recording-id hotpath-a --purpose tooling-hotpath >/dev/null
GROUPMIXER_BENCH_PYTHON_BIN="${PYTHON_BIN}" GROUPMIXER_BENCH_BUILD_JOBS=1 \
  "${TARGET_SCRIPT}" record --suite hotpath-swap-preview --artifacts-dir "${ARTIFACTS_DIR}" --recording-id hotpath-b --purpose tooling-hotpath >/dev/null
GROUPMIXER_BENCH_PYTHON_BIN="${PYTHON_BIN}" GROUPMIXER_BENCH_BUILD_JOBS=1 \
  "${TARGET_SCRIPT}" compare-prev --suite hotpath-swap-preview --mode swap_preview --artifacts-dir "${ARTIFACTS_DIR}" >/dev/null
GROUPMIXER_BENCH_PYTHON_BIN="${PYTHON_BIN}" GROUPMIXER_BENCH_BUILD_JOBS=1 \
  "${TARGET_SCRIPT}" record-bundle --suite representative --suite hotpath-swap-preview --artifacts-dir "${ARTIFACTS_DIR}" --recording-id tooling-bundle --purpose tooling-bundle --feature-name tooling-feature >/dev/null

recordings_output="$(GROUPMIXER_BENCH_PYTHON_BIN="${PYTHON_BIN}" "${TARGET_SCRIPT}" recordings list --artifacts-dir "${ARTIFACTS_DIR}")"
refs_output="$(GROUPMIXER_BENCH_PYTHON_BIN="${PYTHON_BIN}" "${TARGET_SCRIPT}" refs list --artifacts-dir "${ARTIFACTS_DIR}")"
feature_ref_output="$(GROUPMIXER_BENCH_PYTHON_BIN="${PYTHON_BIN}" "${TARGET_SCRIPT}" refs show features/tooling-feature/suites/hotpath-swap-preview/swap_preview/latest --artifacts-dir "${ARTIFACTS_DIR}")"

[[ "${recordings_output}" == *"tooling-bundle"* ]]
[[ "${refs_output}" == *"hotpath-swap-preview"* ]]
[[ "${feature_ref_output}" == *'"benchmark_mode": "swap_preview"'* ]]

python3 - "${ARTIFACTS_DIR}" <<'PY'
import json
import pathlib
import sys

artifacts = pathlib.Path(sys.argv[1])
recording_meta = json.loads((artifacts / "recordings" / "tooling-bundle" / "meta.json").read_text())
assert recording_meta["recording_id"] == "tooling-bundle"
lanes = {(entry["suite_name"], entry["benchmark_mode"]) for entry in recording_meta["suite_runs"]}
assert ("representative", "full_solve") in lanes
assert ("hotpath-swap-preview", "swap_preview") in lanes

hotpath_run = next(entry for entry in recording_meta["suite_runs"] if entry["suite_name"] == "hotpath-swap-preview")
run_report = json.loads((artifacts / hotpath_run["run_report_path"]).read_text())
assert run_report["suite"]["benchmark_mode"] == "swap_preview"
case = run_report["cases"][0]
assert case["artifact_kind"] == "hot_path"
assert case["hotpath_metrics"]["benchmark_mode"] == "swap_preview"
assert case["hotpath_metrics"]["preview_seconds"] > 0.0

comparison_dir = artifacts / "comparisons" / "hotpath-swap-preview"
comparison_files = sorted(comparison_dir.glob("*.json"))
assert comparison_files, comparison_dir
comparison = json.loads(comparison_files[-1].read_text())
assert comparison["benchmark_mode"] == "swap_preview"
assert comparison["comparability"]["same_benchmark_mode"] is True
print("benchmark_workflow local regression test passed")
PY
