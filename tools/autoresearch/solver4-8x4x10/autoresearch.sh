#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

ARTIFACTS_DIR="$(mktemp -d "${TMPDIR:-/tmp}/groupmixer-autoresearch-solver4-XXXXXX")"
LOG_FILE="$ARTIFACTS_DIR/benchmark.log"
METRICS_LOG="$ARTIFACTS_DIR/metrics.log"
MANIFEST="$ROOT/tools/autoresearch/solver4-8x4x10/benchmark.yaml"
cleanup() {
  rm -rf "$ARTIFACTS_DIR"
}
trap cleanup EXIT

cargo build -q -p gm-cli --release

cargo run --release -q -p gm-cli -- benchmark run --manifest "$MANIFEST" >"$LOG_FILE" 2>&1

REPORT_PATH="$(sed -n 's/^Run report: //p' "$LOG_FILE" | tail -1)"
if [[ -z "$REPORT_PATH" || ! -f "$REPORT_PATH" ]]; then
  echo "failed to resolve run report from benchmark output" >&2
  tail -80 "$LOG_FILE" >&2 || true
  exit 1
fi

echo "run_report=$REPORT_PATH"
python3 "$ROOT/tools/autoresearch/solver4-8x4x10/aggregate_metrics.py" "$REPORT_PATH" | tee "$METRICS_LOG"
python3 "$ROOT/tools/autoresearch/metrics_lines_to_json.py" "$METRICS_LOG" > "$ROOT/autoresearch.last_run_metrics.json"
