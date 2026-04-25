#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

ARTIFACTS_DIR="$(mktemp -d "${TMPDIR:-/tmp}/groupmixer-autoresearch-solver3-broad-XXXXXX")"
METRICS_OUTPUT_LOG="$ARTIFACTS_DIR/metrics-output.log"
export GROUPMIXER_BENCHMARK_JOBS="${GROUPMIXER_BENCHMARK_JOBS:-4}"
cleanup() {
  rm -rf "$ARTIFACTS_DIR"
}
trap cleanup EXIT

emit_and_capture() {
  local slug="$1"
  shift
  local output_file="$ARTIFACTS_DIR/${slug}.out"
  "$@" >"$output_file"
  cat "$output_file"
  cat "$output_file" >> "$METRICS_OUTPUT_LOG"
}

run_suite() {
  local manifest="$1"
  local slug="$2"
  local log_file="$ARTIFACTS_DIR/${slug}.log"

  if ! cargo run --release -q -p gm-cli -- benchmark run --manifest "$manifest" --artifacts-dir "$ARTIFACTS_DIR" >"$log_file" 2>&1; then
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

REPRESENTATIVE_REPORT="$(run_suite backend/benchmarking/suites/objective-canonical-representative-solver3-broad-multiseed-v1.yaml representative)"
ADVERSARIAL_REPORT="$(run_suite backend/benchmarking/suites/objective-canonical-adversarial-solver3-broad-multiseed-v1.yaml adversarial)"
STRETCH_REPORT="$(run_suite backend/benchmarking/suites/objective-canonical-stretch-solver3-broad-multiseed-v1.yaml stretch)"
CORRECTNESS_REPORT="$(run_suite backend/benchmarking/suites/correctness-edge-intertwined-solver3-v1.yaml correctness)"

emit_and_capture fixed-time-metrics \
  python3 tools/autoresearch/objective-quality/aggregate_objective_metrics.py \
    fixed-time \
    tools/autoresearch/solver3-broad-quality/fixed-time-metric-config.json \
    "$REPRESENTATIVE_REPORT" \
    "$ADVERSARIAL_REPORT" \
    "$STRETCH_REPORT" \
    "$CORRECTNESS_REPORT"

emit_and_capture raw-runtime-metrics \
  ./tools/autoresearch/solver3-raw-runtime/autoresearch.sh

python3 tools/autoresearch/metrics_lines_to_json.py "$METRICS_OUTPUT_LOG" \
  > "$ROOT/autoresearch.last_run_metrics.json"
