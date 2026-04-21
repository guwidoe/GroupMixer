#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
JSON_OUT="$ROOT/autoresearch.solver5.last_run_metrics.json"
HTML_OUT="$ROOT/autoresearch.solver5.last_run_report.html"
cd "$ROOT"

export RUSTFLAGS="${RUSTFLAGS:-} -Awarnings"

cargo test -q -p gm-core solver5::tests -- --nocapture >/dev/null
cargo run -q -p gm-core --example solver5_construction_coverage -- --json-out "$JSON_OUT"
python3 "$ROOT/tools/autoresearch/solver5-construction/check_matrix_artifact.py" \
  "$JSON_OUT"
python3 "$ROOT/tools/autoresearch/solver5-construction/generate_matrix_report.py" \
  "$JSON_OUT" \
  "$HTML_OUT"

echo "wrote $JSON_OUT"
echo "wrote $HTML_OUT"
