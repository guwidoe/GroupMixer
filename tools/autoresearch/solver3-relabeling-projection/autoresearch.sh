#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

ARTIFACTS_DIR="${GROUPMIXER_AUTORESEARCH_ARTIFACTS_DIR:-/tmp/groupmixer-autoresearch-relabeling-projection}"
JOBS="${GROUPMIXER_BENCHMARK_JOBS:-4}"
CARGO_PROFILE="${GROUPMIXER_BENCHMARK_CARGO_PROFILE:-dev}"
MANIFEST="backend/benchmarking/suites/solver3-relabeling-projection.yaml"
RELABELING_TIMEOUT_SECONDS="${GROUPMIXER_RELABELING_TIMEOUT_SECONDS:-5.0}"
mkdir -p "$ARTIFACTS_DIR"

# Primary diagnostic: score the relabeler/factor reconciliation directly, before merge/search.
# This intentionally gives gradient for cases whose final construction currently fails or times out.
mapfile -t CASE_FILES < <(find "$ROOT/backend/benchmarking/cases/stretch/relabeling_projection" -maxdepth 1 -name '*.json' | sort)
if [[ "${#CASE_FILES[@]}" -eq 0 ]]; then
  echo "no relabeling projection case files found" >&2
  exit 1
fi
case_paths="$(IFS=:; echo "${CASE_FILES[*]}")"

diag_output="$(mktemp)"
benchmark_output="$(mktemp)"
trap 'rm -f "$diag_output" "$benchmark_output"' EXIT

if ! GROUPMIXER_RELABELING_CASES="$case_paths" \
  GROUPMIXER_RELABELING_TIMEOUT_SECONDS="$RELABELING_TIMEOUT_SECONDS" \
  cargo test -q -p gm-core relabeling_projection_diagnostic_metrics --lib -- --nocapture \
  >"$diag_output" 2>&1; then
  tail -160 "$diag_output" >&2
  exit 1
fi

grep -E 'RELABEL_CASE|METRIC relabeling_' "$diag_output" || true

# Secondary monitor: run the full diagnostic benchmark too, but do not make its feasibility failures
# the primary optimization signal. Projection/merge feasibility remains important, but the relabeler
# is allowed to rank structurally useful mappings that are not raw feasible schedules.
if ! GROUPMIXER_BENCHMARK_JOBS="$JOBS" \
  cargo run -q -p gm-cli -- benchmark run \
    --manifest "$MANIFEST" \
    --artifacts-dir "$ARTIFACTS_DIR" \
    --cargo-profile "$CARGO_PROFILE" \
  >"$benchmark_output" 2>&1; then
  tail -120 "$benchmark_output" >&2
  exit 1
fi

grep -E 'Benchmark suite|Run report:' "$benchmark_output" || true
report_path="$(grep -E 'Run report:' "$benchmark_output" | tail -1 | sed 's/^.*Run report: //')"
if [[ -z "${report_path}" || ! -f "${report_path}" ]]; then
  echo "failed to locate benchmark run report" >&2
  exit 1
fi

python3 - "$report_path" <<'PY'
import json
import math
import sys
from pathlib import Path

# Construction-lane style fixed baselines retained as secondary final-output monitors only.
# The primary gradient is relabeling_factor_loss from the direct relabeler diagnostic above.
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
    "final_score_relabel_immovable": "stretch.relabeling-projection-13x13x14-immovable",
    "final_score_relabel_partial_attendance": "stretch.relabeling-projection-13x13x14-partial-attendance",
    "final_score_relabel_capacity_variation": "stretch.relabeling-projection-13x13x14-capacity-variation",
    "final_score_relabel_cliques": "stretch.relabeling-projection-13x13x14-cliques",
    "final_score_relabel_hard_apart": "stretch.relabeling-projection-13x13x14-hard-apart",
    "final_score_relabel_attribute_balance": "stretch.relabeling-projection-13x13x14-attribute-balance",
    "final_score_relabel_pair_meeting": "stretch.relabeling-projection-13x13x14-pair-meeting",
    "final_score_relabel_soft_pairs": "stretch.relabeling-projection-13x13x14-soft-pairs",
    "final_score_relabel_mixed_light": "stretch.relabeling-projection-13x13x14-mixed-light",
    "final_score_relabel_mixed_structural": "stretch.relabeling-projection-13x13x14-mixed-structural",
    "final_score_relabel_mixed_full": "stretch.relabeling-projection-13x13x14-mixed-full",
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
        "FINAL_CASE {case_id} status={status} score={score:.6f} runtime={runtime:.6f} error={error}".format(
            case_id=case_id,
            status=status,
            score=score,
            runtime=runtime,
            error=error_message.replace("\n", " ")[:200],
        )
    )

final_relative_score_mean = weighted_ratio_sum / baseline_weight_sum
final_relabeling_relative_score = (
    final_relative_score_mean
    + zero_regression_penalty
    + failure_count * FAILURE_PENALTY
)

print(f"METRIC final_relabeling_relative_score={final_relabeling_relative_score:.9f}")
print(f"METRIC final_relative_score_mean={final_relative_score_mean:.9f}")
print(f"METRIC final_zero_regression_penalty={zero_regression_penalty:.9f}")
print(f"METRIC final_failure_count={failure_count}")
print(f"METRIC final_timeout_failure_count={timeout_failure_count}")
print(f"METRIC final_construction_error_count={construction_error_count}")
print(f"METRIC final_zero_regression_count={zero_regression_count}")
print(f"METRIC final_success_count={success_count}")
print(f"METRIC final_zero_score_count={zero_score_count}")
print(f"METRIC final_mixed_success_count={mixed_success_count}")
print(f"METRIC final_unbaselined_success_count={unbaselined_success_count}")
print(f"METRIC final_diagnostic_score_sum={final_score_sum:.6f}")
print(f"METRIC final_runtime_seconds={runtime_total:.9f}")
print(f"METRIC final_construction_seconds_total={construction_total:.9f}")
for metric_name, case_id in KEY_CASE_METRICS.items():
    print(f"METRIC {metric_name}={case_scores[case_id]:.6f}")
PY
