#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
JSON_OUT="$ROOT/autoresearch.solver6.last_run_metrics.json"
HTML_OUT="$ROOT/autoresearch.solver6.last_run_report.html"

cargo test -q -p gm-core solver6::reporting -- --nocapture >/dev/null
cargo run -q -p gm-core --example solver6_optimality_frontier -- \
  --json-out "$JSON_OUT" \
  "$@"
python3 "$ROOT/tools/autoresearch/solver6-optimality/generate_matrix_report.py" \
  "$JSON_OUT" \
  "$HTML_OUT"

echo "wrote $JSON_OUT"
echo "wrote $HTML_OUT"
