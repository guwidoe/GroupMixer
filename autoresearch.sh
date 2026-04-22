#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JSON_OUT="$ROOT/autoresearch.solver6.last_run_metrics.json"
HTML_OUT="$ROOT/autoresearch.solver6.last_run_report.html"

WEEK_CAP=20
MAX_PEOPLE=50
TIME_LIMIT=2
MAX_ITERATIONS=2000
NO_IMPROVEMENT=300
JOBS=4

uv run python -m ast "$ROOT/tools/autoresearch/solver6-optimality/generate_matrix_report.py" >/dev/null
cargo test -q -p gm-core solver6::reporting::tests::benchmark_input_builder_uses_solver6_with_repeat_bound -- --exact >/dev/null

cargo run -q -p gm-core --example solver6_optimality_frontier -- \
  --json-out "$JSON_OUT" \
  --week-cap "$WEEK_CAP" \
  --max-people "$MAX_PEOPLE" \
  --jobs "$JOBS" \
  --time-limit "$TIME_LIMIT" \
  --max-iterations "$MAX_ITERATIONS" \
  --no-improvement "$NO_IMPROVEMENT"

python3 "$ROOT/tools/autoresearch/solver6-optimality/generate_matrix_report.py" \
  "$JSON_OUT" \
  "$HTML_OUT"

python3 - "$JSON_OUT" <<'PY'
import json
import math
import sys
from collections import defaultdict

json_path = sys.argv[1]
with open(json_path, "r", encoding="utf-8") as f:
    artifact = json.load(f)

week_cap = artifact["config"]["week_cap"]

eligible_cells = []
for matrix in artifact["matrices"]:
    for cell in matrix["cells"]:
        if cell["benchmark_eligible"]:
            eligible_cells.append(cell)

eligible_week_runs = len(eligible_cells) * week_cap
success_week_runs = 0
timeout_runs = 0
unsupported_runs = 0
error_runs = 0
not_run_runs = 0
linear_exact_count = 0
linear_hit_count = 0
linear_miss_count = 0
linear_gap_sum = 0
squared_hit_count = 0
squared_miss_count = 0
squared_gap_sum = 0
total_runtime_ms = 0
search_scans = 0
scan_time_ms = 0
candidates_evaluated = 0
family_count = defaultdict(int)
family_runtime_ms = defaultdict(int)

for cell in eligible_cells:
    for week in cell["week_results"]:
        execution_status = week["execution_status"]
        if execution_status == "success":
            success_week_runs += 1
        elif execution_status == "timeout":
            timeout_runs += 1
        elif execution_status == "unsupported":
            unsupported_runs += 1
        elif execution_status == "error":
            error_runs += 1
        elif execution_status == "not_run":
            not_run_runs += 1

        runtime_ms = int(round((week.get("runtime_seconds") or 0.0) * 1000.0))
        total_runtime_ms += runtime_ms

        family = week.get("seed_family")
        if family:
            family_count[family] += 1
            family_runtime_ms[family] += runtime_ms

        telemetry = week.get("search_telemetry")
        if telemetry:
            search_scans += int(telemetry.get("neighborhood_scans") or 0)
            scan_time_ms += int(round((telemetry.get("total_scan_micros") or 0) / 1000.0))
            candidates_evaluated += int(telemetry.get("candidates_evaluated") or 0)

        linear_status = week["linear_status"]
        if linear_status == "exact":
            linear_exact_count += 1
            linear_hit_count += 1
        elif linear_status == "lower_bound_tight":
            linear_hit_count += 1
        elif linear_status == "miss":
            linear_miss_count += 1

        squared_status = week["squared_status"]
        if squared_status in {"exact", "lower_bound_tight"}:
            squared_hit_count += 1
        elif squared_status == "miss":
            squared_miss_count += 1

        final_metrics = week.get("final_metrics")
        if final_metrics:
            linear_gap_sum += int(final_metrics.get("linear_repeat_lower_bound_gap") or 0)
            squared_gap_sum += int(final_metrics.get("squared_repeat_lower_bound_gap") or 0)

objective_cost = (
    error_runs * 10_000_000_000_000
    + unsupported_runs * 1_000_000_000_000
    + timeout_runs * 100_000_000_000
    + linear_miss_count * 1_000_000_000
    + linear_gap_sum * 10_000_000
    + squared_miss_count * 100_000
    + squared_gap_sum * 100
    + total_runtime_ms
)

print(f"METRIC objective_cost={objective_cost}")
print(f"METRIC total_runtime_ms={total_runtime_ms}")
print(f"METRIC eligible_week_runs={eligible_week_runs}")
print(f"METRIC success_week_runs={success_week_runs}")
print(f"METRIC timeout_runs={timeout_runs}")
print(f"METRIC unsupported_runs={unsupported_runs}")
print(f"METRIC error_runs={error_runs}")
print(f"METRIC not_run_runs={not_run_runs}")
print(f"METRIC linear_exact_count={linear_exact_count}")
print(f"METRIC linear_hit_count={linear_hit_count}")
print(f"METRIC linear_miss_count={linear_miss_count}")
print(f"METRIC linear_gap_sum={linear_gap_sum}")
print(f"METRIC squared_hit_count={squared_hit_count}")
print(f"METRIC squared_miss_count={squared_miss_count}")
print(f"METRIC squared_gap_sum={squared_gap_sum}")
print(f"METRIC search_scans={search_scans}")
print(f"METRIC scan_time_ms={scan_time_ms}")
print(f"METRIC candidates_evaluated={candidates_evaluated}")

for family in [
    "exact_block_only",
    "requested_tail_atom",
    "heuristic_tail",
    "dominant_prefix_tail",
    "solver5_exact_handoff",
]:
    print(f"METRIC {family}_count={family_count[family]}")
    print(f"METRIC {family}_runtime_ms={family_runtime_ms[family]}")
PY

echo "wrote $JSON_OUT"
echo "wrote $HTML_OUT"
