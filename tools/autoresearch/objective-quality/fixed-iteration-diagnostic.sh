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

ADVERSARIAL_REPORT="$(run_suite backend/benchmarking/suites/objective-diagnostic-fixed-iteration-adversarial-v1.yaml adversarial)"
STRETCH_REPORT="$(run_suite backend/benchmarking/suites/objective-diagnostic-fixed-iteration-stretch-v1.yaml stretch)"

python3 tools/autoresearch/objective-quality/aggregate_objective_metrics.py \
  fixed-iteration \
  tools/autoresearch/objective-quality/fixed-iteration-metric-config.json \
  "$ADVERSARIAL_REPORT" \
  "$STRETCH_REPORT"
