#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

ARTIFACTS_DIR="$(mktemp -d "${TMPDIR:-/tmp}/groupmixer-fixed-iteration-diagnostic-XXXXXX")"
cleanup() {
  rm -rf "$ARTIFACTS_DIR"
}
trap cleanup EXIT

run_suite() {
  local manifest="$1"
  local slug="$2"
  local log_file="$ARTIFACTS_DIR/${slug}.log"

  if ! cargo run -q -p gm-cli -- benchmark run --manifest "$manifest" --artifacts-dir "$ARTIFACTS_DIR" >"$log_file" 2>&1; then
    tail -80 "$log_file" >&2 || true
    return 1
  fi

  local report_path
  report_path="$(sed -n 's/^Run report: //p' "$log_file" | tail -1)"
  if [[ -z "$report_path" || ! -f "$report_path" ]]; then
    echo "failed to resolve run report for $manifest" >&2
    tail -80 "$log_file" >&2 || true
    return 1
  fi

  printf '%s\n' "$report_path"
}

REPRESENTATIVE_REPORT="$(run_suite backend/benchmarking/suites/objective-diagnostic-fixed-iteration-representative-v1.yaml representative)"
ADVERSARIAL_REPORT="$(run_suite backend/benchmarking/suites/objective-diagnostic-fixed-iteration-adversarial-v1.yaml adversarial)"
STRETCH_REPORT="$(run_suite backend/benchmarking/suites/objective-diagnostic-fixed-iteration-stretch-v1.yaml stretch)"

python3 - \
  "$REPRESENTATIVE_REPORT" \
  "$ADVERSARIAL_REPORT" \
  "$STRETCH_REPORT" <<'PY'
import json
import sys
from statistics import mean

representative_path, adversarial_path, stretch_path = sys.argv[1:]


def load(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def iter_cases(*reports):
    for report in reports:
        for case in report["cases"]:
            yield case


def score_values(cases):
    return [float(case["final_score"]) for case in cases if case.get("final_score") is not None]


def runtime_values(cases):
    return [float(case.get("runtime_seconds") or 0.0) for case in cases]


def external_validation_failures(cases):
    failures = 0
    for case in cases:
        external = case.get("external_validation") or {}
        if not bool(external.get("validation_passed")):
            failures += 1
    return failures


def total_score_mismatches(cases):
    mismatches = 0
    for case in cases:
        external = case.get("external_validation") or {}
        if not bool(external.get("total_score_agreement")):
            mismatches += 1
    return mismatches


def breakdown_mismatches(cases):
    mismatches = 0
    for case in cases:
        external = case.get("external_validation") or {}
        if not bool(external.get("score_breakdown_agreement")):
            mismatches += 1
    return mismatches


representative = load(representative_path)
adversarial = load(adversarial_path)
stretch = load(stretch_path)

cases = list(iter_cases(representative, adversarial, stretch))
scores = score_values(cases)
runtimes = runtime_values(cases)

metrics = {
    "objective_fixed_iteration_total_final_score": sum(scores),
    "objective_fixed_iteration_average_final_score": mean(scores),
    "objective_fixed_iteration_case_count": float(len(cases)),
    "objective_fixed_iteration_total_runtime_seconds": sum(runtimes),
    "objective_fixed_iteration_average_runtime_seconds": mean(runtimes),
    "objective_fixed_iteration_external_validation_failures": float(external_validation_failures(cases)),
    "objective_fixed_iteration_total_score_mismatches": float(total_score_mismatches(cases)),
    "objective_fixed_iteration_score_breakdown_mismatches": float(breakdown_mismatches(cases)),
}

for name, value in metrics.items():
    print(f"METRIC {name}={value}")
PY
