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

# Fixed case baselines from the current best pre-relative-metric constructor line:
# b5fa1752 / run solver3-constructor-broad-20260424T211040Z-6000a6ee.
# The primary metric measures final construction+search score as a ratio to these values.
BASELINE_CASE_SCORES = {
    "path.clique-swap.partial-participation": 1.000000,
    "path.construction.clique-immovable": 2.000000,
    "path.search-driver.allowed-sessions": 0.000000,
    "path.swap.forbidden-pair": 0.000000,
    "path.transfer.pair-meeting": 6.000000,
    "representative.small-workshop-balanced": 3.000000,
    "representative.small-workshop-constrained": 4.000000,
    "representative.ui-demo-data": 710.000000,
    "representative.ui-demo-data-no-attr": 710.000000,
    "adversarial.clique-swap-functionality-35p": 4765.000000,
    "adversarial.constraint-heavy-partial-attendance": 12.000000,
    "adversarial.correctness-hard-constraints-stress": 14.000000,
    "adversarial.correctness-late-arrivals-early-departures": 6.000000,
    "adversarial.correctness-session-aware-group-capacities": 3.000000,
    "adversarial.correctness-session-specific-constraints": 0.000000,
    "adversarial.transfer-attribute-balance-111p": 250.000000,
    "stretch.benchmark-very-large": 0.000000,
    "stretch.benchmark-very-large-constrained": 0.000000,
    "stretch.google-cp-equivalent": 8.000000,
    "stretch.immovable-person-anchor-12p-6g-10s": 0.000000,
    "stretch.kirkman-schoolgirls-15x5x7": 0.000000,
    "stretch.large-gender-immovable-110p": 2157.000000,
    "stretch.medium-multi-session": 8.000000,
    "stretch.sailing-trip-demo-real": 2208.000000,
    "stretch.sailing-trip-feature-dense": 126.000000,
    "stretch.social-golfer-32x8x15": 0.000000,
    "stretch.social-golfer-32x8x15-constrained": 687.000000,
    "stretch.social-golfer-32x8x20": 0.000000,
    "stretch.social-golfer-32x8x20-constrained": 1540.000000,
    "stretch.social-golfer-40x10x11": 0.000000,
    "stretch.social-golfer-49x7x8": 0.000000,
    "stretch.social-golfer-49x7x8-constrained": 302.000000,
    "stretch.social-golfer-169x13x14": 0.000000,
    "stretch.social-golfer-169x13x14-constrained": 446.000000,
    "stretch.synthetic-partial-attendance-capacity-pressure-152p": 6632.000000,
}

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

KEY_CASE_IDS = set(KEY_CASE_METRICS.values())
KEY_CASE_WEIGHT = 2.0
DEFAULT_CASE_WEIGHT = 1.0
ZERO_BASELINE_REGRESSION_PENALTY = 10.0
FAILURE_PENALTY = 1000.0

report_path = Path(sys.argv[1])
report = json.loads(report_path.read_text())
cases = report.get("cases", [])
if not cases:
    raise SystemExit("benchmark report contains no cases")

baseline_case_ids = set(BASELINE_CASE_SCORES)
report_case_ids = {case.get("case_id") for case in cases}
missing_from_report = sorted(baseline_case_ids - report_case_ids)
unknown_in_report = sorted(report_case_ids - baseline_case_ids)
if missing_from_report:
    raise SystemExit(f"benchmark report missing baseline cases: {', '.join(missing_from_report)}")
if unknown_in_report:
    raise SystemExit(f"benchmark report contains cases without fixed baseline: {', '.join(unknown_in_report)}")

weighted_ratio_sum = 0.0
baseline_weight_sum = 0.0
failure_count = 0
zero_regression_count = 0
construction_total = 0.0
runtime_total = 0.0
case_scores = {}

for case_id, baseline_score in BASELINE_CASE_SCORES.items():
    if baseline_score > 0.0:
        baseline_weight_sum += KEY_CASE_WEIGHT if case_id in KEY_CASE_IDS else DEFAULT_CASE_WEIGHT

print(f"REPORT {report_path}")

for case in cases:
    case_id = case.get("case_id", "unknown")
    status = case.get("status")
    final_score = case.get("final_score")
    baseline_score = BASELINE_CASE_SCORES[case_id]
    weight = KEY_CASE_WEIGHT if case_id in KEY_CASE_IDS else DEFAULT_CASE_WEIGHT

    if status != "success" or final_score is None:
        failure_count += 1
        score = 1_000_000_000.0
    else:
        score = float(final_score)
        if not math.isfinite(score):
            failure_count += 1
            score = 1_000_000_000.0
        else:
            score = max(0.0, score)
    case_scores[case_id] = score

    if status == "success" and math.isfinite(score):
        if baseline_score > 0.0:
            weighted_ratio_sum += weight * (score / baseline_score)
        elif score > 0.0:
            zero_regression_count += 1

    timing = case.get("timing") or {}
    runtime_total += float(case.get("runtime_seconds") or timing.get("total_seconds") or 0.0)
    # In two-phase artifacts, construction is included in initialization time.
    construction_total += float(timing.get("initialization_seconds") or 0.0)

missing_key_cases = sorted(set(KEY_CASE_METRICS.values()) - set(case_scores))
if missing_key_cases:
    raise SystemExit(f"benchmark report missing key cases: {', '.join(missing_key_cases)}")

relative_score_mean = weighted_ratio_sum / baseline_weight_sum
broad_relative_score = (
    relative_score_mean
    + zero_regression_count * ZERO_BASELINE_REGRESSION_PENALTY
    + failure_count * FAILURE_PENALTY
)

print(f"METRIC broad_relative_score={broad_relative_score:.9f}")
print(f"METRIC relative_score_mean={relative_score_mean:.9f}")
print(f"METRIC failure_count={failure_count}")
print(f"METRIC zero_regression_count={zero_regression_count}")
print(f"METRIC runtime_seconds={runtime_total:.9f}")
print(f"METRIC construction_seconds_total={construction_total:.9f}")
for metric_name, case_id in KEY_CASE_METRICS.items():
    print(f"METRIC {metric_name}={case_scores[case_id]:.6f}")
PY
