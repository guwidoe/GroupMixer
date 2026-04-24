#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

ARTIFACTS_DIR="${GROUPMIXER_AUTORESEARCH_ARTIFACTS_DIR:-/tmp/groupmixer-autoresearch-solver3-construction}"
JOBS="${GROUPMIXER_BENCHMARK_JOBS:-4}"
CARGO_PROFILE="${GROUPMIXER_BENCHMARK_CARGO_PROFILE:-dev}"
MANIFEST="backend/benchmarking/suites/solver3-constructor-broad.yaml"
mkdir -p "$ARTIFACTS_DIR"

output_file="$(mktemp)"
trap 'rm -f "$output_file"' EXIT

if ! GROUPMIXER_BENCHMARK_JOBS="$JOBS" \
  cargo run -q -p gm-cli -- benchmark run \
    --manifest "$MANIFEST" \
    --artifacts-dir "$ARTIFACTS_DIR" \
    --cargo-profile "$CARGO_PROFILE" \
  >"$output_file" 2>&1; then
  tail -120 "$output_file" >&2
  exit 1
fi

grep -E 'Benchmark suite|Run report:' "$output_file" || true
report_path="$(grep -E 'Run report:' "$output_file" | tail -1 | sed 's/^.*Run report: //')"
if [[ -z "${report_path}" || ! -f "${report_path}" ]]; then
  echo "failed to locate benchmark run report" >&2
  exit 1
fi

python3 - "$report_path" <<'PY'
import json
import math
import sys
from pathlib import Path

KEY_CASE_METRICS = {
    "score_sailing_real": "stretch.sailing-trip-demo-real",
    "score_synthetic_152p": "stretch.synthetic-partial-attendance-capacity-pressure-152p",
    "score_large_gender_immovable_110p": "stretch.large-gender-immovable-110p",
    "score_transfer_attribute_111p": "adversarial.transfer-attribute-balance-111p",
    "score_google_cp": "stretch.google-cp-equivalent",
    "score_ui_demo": "representative.ui-demo-data",
    "score_ui_demo_no_attr": "representative.ui-demo-data-no-attr",
    "score_clique_swap_35p": "adversarial.clique-swap-functionality-35p",
    "score_sgp_169x13x14": "stretch.social-golfer-169x13x14",
    "score_sgp_32x8x20_constrained": "stretch.social-golfer-32x8x20-constrained",
    "score_sgp_49x7x8_constrained": "stretch.social-golfer-49x7x8-constrained",
    "score_sgp_169x13x14_constrained": "stretch.social-golfer-169x13x14-constrained",
    "score_no_template_clique_immovable": "path.construction.clique-immovable",
    "score_no_template_constraint_heavy_partial": "adversarial.constraint-heavy-partial-attendance",
    "score_no_template_late_arrivals": "adversarial.correctness-late-arrivals-early-departures",
}

report_path = Path(sys.argv[1])
report = json.loads(report_path.read_text())
cases = report.get("cases", [])
if not cases:
    raise SystemExit("benchmark report contains no cases")

failure_penalty = 1000.0
broad_log_score = 0.0
failure_count = 0
construction_total = 0.0
runtime_total = 0.0
case_scores = {}

print(f"REPORT {report_path}")

for case in cases:
    case_id = case.get("case_id", "unknown")
    status = case.get("status")
    final_score = case.get("final_score")
    if status != "success" or final_score is None:
        failure_count += 1
        score = 1_000_000_000.0
        broad_log_score += failure_penalty
    else:
        score = float(final_score)
        if not math.isfinite(score):
            failure_count += 1
            score = 1_000_000_000.0
            broad_log_score += failure_penalty
        else:
            score = max(0.0, score)
            broad_log_score += math.log1p(score)
    case_scores[case_id] = score

    timing = case.get("timing") or {}
    runtime_total += float(case.get("runtime_seconds") or timing.get("total_seconds") or 0.0)
    # In two-phase artifacts, construction is included in initialization time.
    construction_total += float(timing.get("initialization_seconds") or 0.0)

missing = sorted(set(KEY_CASE_METRICS.values()) - set(case_scores))
if missing:
    raise SystemExit(f"benchmark report missing key cases: {', '.join(missing)}")

print(f"METRIC broad_log_score={broad_log_score:.9f}")
print(f"METRIC failure_count={failure_count}")
print(f"METRIC runtime_seconds={runtime_total:.9f}")
print(f"METRIC construction_seconds_total={construction_total:.9f}")
for metric_name, case_id in KEY_CASE_METRICS.items():
    print(f"METRIC {metric_name}={case_scores[case_id]:.6f}")
PY
