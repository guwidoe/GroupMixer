#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

ARTIFACTS_DIR="${GROUPMIXER_AUTORESEARCH_ARTIFACTS_DIR:-/tmp/groupmixer-autoresearch-relabeling-projection}"
JOBS="${GROUPMIXER_BENCHMARK_JOBS:-4}"
CARGO_PROFILE="${GROUPMIXER_BENCHMARK_CARGO_PROFILE:-dev}"
MANIFEST="backend/benchmarking/suites/solver3-relabeling-projection.yaml"
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

# Construction-lane style fixed baselines for the relabeling diagnostic suite.
# Values come from the first relabeling-lane baseline run on commit 15cce87/f3850270.
# None means this case had no successful strict-budget baseline yet; it contributes via the
# failure penalty until an experiment makes it successful, then a new baseline can be established.
BASELINE_CASE_SCORES = {
    "stretch.relabeling-projection-13x13x14-immovable": 0.0,
    "stretch.relabeling-projection-13x13x14-partial-attendance": 310.0,
    "stretch.relabeling-projection-13x13x14-capacity-variation": 0.0,
    "stretch.relabeling-projection-13x13x14-cliques": 96.0,
    "stretch.relabeling-projection-13x13x14-hard-apart": None,
    "stretch.relabeling-projection-13x13x14-attribute-balance": 1492.0,
    "stretch.relabeling-projection-13x13x14-pair-meeting": 45.0,
    "stretch.relabeling-projection-13x13x14-soft-pairs": 36.0,
    "stretch.relabeling-projection-13x13x14-mixed-light": 15476.0,
    "stretch.relabeling-projection-13x13x14-mixed-structural": None,
    "stretch.relabeling-projection-13x13x14-mixed-full": None,
}

KEY_CASE_METRICS = {
    "score_relabel_immovable": "stretch.relabeling-projection-13x13x14-immovable",
    "score_relabel_partial_attendance": "stretch.relabeling-projection-13x13x14-partial-attendance",
    "score_relabel_capacity_variation": "stretch.relabeling-projection-13x13x14-capacity-variation",
    "score_relabel_cliques": "stretch.relabeling-projection-13x13x14-cliques",
    "score_relabel_hard_apart": "stretch.relabeling-projection-13x13x14-hard-apart",
    "score_relabel_attribute_balance": "stretch.relabeling-projection-13x13x14-attribute-balance",
    "score_relabel_pair_meeting": "stretch.relabeling-projection-13x13x14-pair-meeting",
    "score_relabel_soft_pairs": "stretch.relabeling-projection-13x13x14-soft-pairs",
    "score_relabel_mixed_light": "stretch.relabeling-projection-13x13x14-mixed-light",
    "score_relabel_mixed_structural": "stretch.relabeling-projection-13x13x14-mixed-structural",
    "score_relabel_mixed_full": "stretch.relabeling-projection-13x13x14-mixed-full",
}

KEY_CASE_IDS = {
    "stretch.relabeling-projection-13x13x14-cliques",
    "stretch.relabeling-projection-13x13x14-hard-apart",
    "stretch.relabeling-projection-13x13x14-attribute-balance",
    "stretch.relabeling-projection-13x13x14-mixed-light",
    "stretch.relabeling-projection-13x13x14-mixed-structural",
    "stretch.relabeling-projection-13x13x14-mixed-full",
}
KEY_CASE_WEIGHT = 2.0
DEFAULT_CASE_WEIGHT = 1.0
FAILURE_PENALTY = 1000.0
FAILURE_SCORE_SENTINEL = 1_000_000_000.0

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
timeout_failure_count = 0
construction_error_count = 0
zero_regression_count = 0
zero_regression_penalty = 0.0
success_count = 0
zero_score_count = 0
mixed_success_count = 0
unbaselined_success_count = 0
runtime_total = 0.0
construction_total = 0.0
final_score_sum = 0.0
case_scores = {}

for case_id, baseline_score in BASELINE_CASE_SCORES.items():
    if baseline_score is not None and baseline_score > 0.0:
        baseline_weight_sum += KEY_CASE_WEIGHT if case_id in KEY_CASE_IDS else DEFAULT_CASE_WEIGHT
if baseline_weight_sum <= 0.0:
    raise SystemExit("no positive fixed baselines configured")

print(f"REPORT {report_path}")

for case in cases:
    case_id = case.get("case_id", "unknown")
    status = case.get("status")
    error_message = case.get("error_message") or ""
    final_score = case.get("final_score")
    baseline_score = BASELINE_CASE_SCORES[case_id]
    weight = KEY_CASE_WEIGHT if case_id in KEY_CASE_IDS else DEFAULT_CASE_WEIGHT

    timing = case.get("timing") or {}
    runtime = float(case.get("runtime_seconds") or timing.get("total_seconds") or 0.0)
    construction = float(timing.get("initialization_seconds") or 0.0)
    runtime_total += runtime
    construction_total += construction

    if status != "success" or final_score is None:
        failure_count += 1
        score = FAILURE_SCORE_SENTINEL
        if "exceeded budget" in error_message:
            timeout_failure_count += 1
        elif "construction phase failed" in error_message or "Constraint violation" in error_message:
            construction_error_count += 1
    else:
        score = float(final_score)
        if not math.isfinite(score):
            failure_count += 1
            score = FAILURE_SCORE_SENTINEL
        else:
            score = max(0.0, score)
            success_count += 1
            final_score_sum += score
            if score == 0.0:
                zero_score_count += 1
            if "mixed" in case_id:
                mixed_success_count += 1
            if baseline_score is None:
                unbaselined_success_count += 1
            elif baseline_score > 0.0:
                weighted_ratio_sum += weight * (score / baseline_score)
            elif score > 0.0:
                zero_regression_count += 1
                zero_regression_penalty += weight * math.log1p(score) / baseline_weight_sum

    case_scores[case_id] = score
    print(
        "CASE {case_id} status={status} score={score:.6f} runtime={runtime:.6f} error={error}".format(
            case_id=case_id,
            status=status,
            score=score,
            runtime=runtime,
            error=error_message.replace("\n", " ")[:200],
        )
    )

relative_score_mean = weighted_ratio_sum / baseline_weight_sum
relabeling_relative_score = (
    relative_score_mean
    + zero_regression_penalty
    + failure_count * FAILURE_PENALTY
)

print(f"METRIC relabeling_relative_score={relabeling_relative_score:.9f}")
print(f"METRIC relative_score_mean={relative_score_mean:.9f}")
print(f"METRIC zero_regression_penalty={zero_regression_penalty:.9f}")
print(f"METRIC failure_count={failure_count}")
print(f"METRIC timeout_failure_count={timeout_failure_count}")
print(f"METRIC construction_error_count={construction_error_count}")
print(f"METRIC zero_regression_count={zero_regression_count}")
print(f"METRIC success_count={success_count}")
print(f"METRIC zero_score_count={zero_score_count}")
print(f"METRIC mixed_success_count={mixed_success_count}")
print(f"METRIC unbaselined_success_count={unbaselined_success_count}")
print(f"METRIC diagnostic_final_score_sum={final_score_sum:.6f}")
print(f"METRIC runtime_seconds={runtime_total:.9f}")
print(f"METRIC construction_seconds_total={construction_total:.9f}")
for metric_name, case_id in KEY_CASE_METRICS.items():
    print(f"METRIC {metric_name}={case_scores[case_id]:.6f}")
PY
