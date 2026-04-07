#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

ARTIFACTS_DIR="$(mktemp -d "${TMPDIR:-/tmp}/groupmixer-autoresearch-solver3-objective-XXXXXX")"
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

FIXED_TIME_ADVERSARIAL_REPORT="$(run_suite backend/benchmarking/suites/objective-canonical-adversarial-solver3-v1.yaml fixed-time-adversarial)"
FIXED_TIME_STRETCH_REPORT="$(run_suite backend/benchmarking/suites/objective-canonical-stretch-solver3-v1.yaml fixed-time-stretch)"
CORRECTNESS_REPORT="$(run_suite backend/benchmarking/suites/correctness-edge-intertwined-solver3-v1.yaml correctness)"

python3 tools/autoresearch/objective-quality/aggregate_objective_metrics.py \
  fixed-time \
  tools/autoresearch/solver3-objective-quality/fixed-time-metric-config.json \
  "$FIXED_TIME_ADVERSARIAL_REPORT" \
  "$FIXED_TIME_STRETCH_REPORT" \
  "$CORRECTNESS_REPORT"

FIXED_ITERATION_ADVERSARIAL_REPORT="$(run_suite backend/benchmarking/suites/objective-diagnostic-fixed-iteration-adversarial-solver3-v1.yaml fixed-iteration-adversarial)"
FIXED_ITERATION_STRETCH_REPORT="$(run_suite backend/benchmarking/suites/objective-diagnostic-fixed-iteration-stretch-solver3-v1.yaml fixed-iteration-stretch)"

python3 tools/autoresearch/objective-quality/aggregate_objective_metrics.py \
  fixed-iteration \
  tools/autoresearch/solver3-objective-quality/fixed-iteration-metric-config.json \
  "$FIXED_ITERATION_ADVERSARIAL_REPORT" \
  "$FIXED_ITERATION_STRETCH_REPORT"

./tools/autoresearch/solver3-raw-runtime/autoresearch.sh
