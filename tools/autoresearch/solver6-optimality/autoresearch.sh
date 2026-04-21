#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

cargo test -q -p gm-core solver6::reporting -- --nocapture >/dev/null
cargo run -q -p gm-core --example solver6_optimality_frontier -- \
  --json-out "$ROOT/autoresearch.last_run_metrics.json" \
  "$@"
python3 "$ROOT/tools/autoresearch/solver6-optimality/generate_matrix_report.py" \
  "$ROOT/autoresearch.last_run_metrics.json" \
  "$ROOT/autoresearch.last_run_report.html"

echo "wrote $ROOT/autoresearch.last_run_metrics.json"
echo "wrote $ROOT/autoresearch.last_run_report.html"
