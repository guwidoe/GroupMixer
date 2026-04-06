#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

ARTIFACTS_DIR="$(mktemp -d "${TMPDIR:-/tmp}/groupmixer-autoresearch-objective-XXXXXX")"
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

REPRESENTATIVE_REPORT="$(run_suite backend/benchmarking/suites/objective-canonical-representative-v1.yaml representative)"
ADVERSARIAL_REPORT="$(run_suite backend/benchmarking/suites/objective-canonical-adversarial-v1.yaml adversarial)"
STRETCH_REPORT="$(run_suite backend/benchmarking/suites/objective-canonical-stretch-v1.yaml stretch)"
CORRECTNESS_REPORT="$(run_suite backend/benchmarking/suites/correctness-edge-intertwined-v1.yaml correctness)"

python3 - \
  "$REPRESENTATIVE_REPORT" \
  "$ADVERSARIAL_REPORT" \
  "$STRETCH_REPORT" \
  "$CORRECTNESS_REPORT" <<'PY'
import json
import sys
from statistics import mean

representative_path, adversarial_path, stretch_path, correctness_path = sys.argv[1:]


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


def breakdown_mismatches(cases):
    mismatches = 0
    for case in cases:
        external = case.get("external_validation") or {}
        if not bool(external.get("score_breakdown_agreement")):
            mismatches += 1
    return mismatches


def total_score_mismatches(cases):
    mismatches = 0
    for case in cases:
        external = case.get("external_validation") or {}
        if not bool(external.get("total_score_agreement")):
            mismatches += 1
    return mismatches


representative = load(representative_path)
adversarial = load(adversarial_path)
stretch = load(stretch_path)
correctness = load(correctness_path)

canonical_cases = list(iter_cases(representative, adversarial, stretch))
correctness_cases = list(iter_cases(correctness))
all_cases = canonical_cases + correctness_cases

canonical_scores = score_values(canonical_cases)
canonical_runtimes = runtime_values(canonical_cases)
correctness_runtimes = runtime_values(correctness_cases)
all_runtimes = runtime_values(all_cases)

metrics = {
    # Primary objective-quality target (lower is better, runtime-independent).
    "objective_suite_total_final_score": sum(canonical_scores),
    "objective_suite_average_final_score": mean(canonical_scores),
    # Canonical objective suite diagnostics.
    "objective_suite_case_count": float(len(canonical_cases)),
    "objective_suite_total_runtime_seconds": sum(canonical_runtimes),
    "objective_suite_average_runtime_seconds": mean(canonical_runtimes),
    "objective_suite_external_validation_failures": float(
        external_validation_failures(canonical_cases)
    ),
    "objective_suite_total_score_mismatches": float(total_score_mismatches(canonical_cases)),
    "objective_suite_score_breakdown_mismatches": float(
        breakdown_mismatches(canonical_cases)
    ),
    # Required correctness lane diagnostics.
    "correctness_suite_case_count": float(len(correctness_cases)),
    "correctness_suite_total_runtime_seconds": sum(correctness_runtimes),
    "correctness_suite_average_runtime_seconds": mean(correctness_runtimes),
    "correctness_suite_external_validation_failures": float(
        external_validation_failures(correctness_cases)
    ),
    "correctness_suite_total_score_mismatches": float(
        total_score_mismatches(correctness_cases)
    ),
    # Secondary runtime signals for monitoring only.
    "runtime_total_seconds": sum(all_runtimes),
    "runtime_canonical_share_percent": (
        (sum(canonical_runtimes) / sum(all_runtimes)) * 100.0 if sum(all_runtimes) else 0.0
    ),
}

for name, value in metrics.items():
    print(f"METRIC {name}={value}")
PY
