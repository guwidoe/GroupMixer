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

CASE_WEIGHTS = {
    "stretch.relabeling-projection-13x13x14-immovable": 1.5,
    "stretch.relabeling-projection-13x13x14-partial-attendance": 1.0,
    "stretch.relabeling-projection-13x13x14-capacity-variation": 1.0,
    "stretch.relabeling-projection-13x13x14-cliques": 2.0,
    "stretch.relabeling-projection-13x13x14-hard-apart": 2.0,
    "stretch.relabeling-projection-13x13x14-attribute-balance": 2.0,
    "stretch.relabeling-projection-13x13x14-pair-meeting": 1.5,
    "stretch.relabeling-projection-13x13x14-soft-pairs": 1.25,
    "stretch.relabeling-projection-13x13x14-mixed-light": 2.0,
    "stretch.relabeling-projection-13x13x14-mixed-structural": 3.0,
    "stretch.relabeling-projection-13x13x14-mixed-full": 3.0,
}

CASE_METRIC_NAMES = {
    "stretch.relabeling-projection-13x13x14-immovable": "score_relabel_immovable",
    "stretch.relabeling-projection-13x13x14-partial-attendance": "score_relabel_partial_attendance",
    "stretch.relabeling-projection-13x13x14-capacity-variation": "score_relabel_capacity_variation",
    "stretch.relabeling-projection-13x13x14-cliques": "score_relabel_cliques",
    "stretch.relabeling-projection-13x13x14-hard-apart": "score_relabel_hard_apart",
    "stretch.relabeling-projection-13x13x14-attribute-balance": "score_relabel_attribute_balance",
    "stretch.relabeling-projection-13x13x14-pair-meeting": "score_relabel_pair_meeting",
    "stretch.relabeling-projection-13x13x14-soft-pairs": "score_relabel_soft_pairs",
    "stretch.relabeling-projection-13x13x14-mixed-light": "score_relabel_mixed_light",
    "stretch.relabeling-projection-13x13x14-mixed-structural": "score_relabel_mixed_structural",
    "stretch.relabeling-projection-13x13x14-mixed-full": "score_relabel_mixed_full",
}

FAILURE_LOSS = 100.0
TIMEOUT_EXTRA_LOSS = 25.0
CONSTRUCTION_ERROR_EXTRA_LOSS = 10.0
RUNTIME_SECONDS_WEIGHT = 0.001
FAILURE_SCORE_SENTINEL = 1_000_000_000.0

report_path = Path(sys.argv[1])
report = json.loads(report_path.read_text())
cases = report.get("cases", [])
if not cases:
    raise SystemExit("benchmark report contains no cases")

report_case_ids = {case.get("case_id") for case in cases}
missing = sorted(set(CASE_WEIGHTS) - report_case_ids)
unknown = sorted(report_case_ids - set(CASE_WEIGHTS))
if missing:
    raise SystemExit(f"benchmark report missing relabeling cases: {', '.join(missing)}")
if unknown:
    raise SystemExit(f"benchmark report contains unweighted relabeling cases: {', '.join(unknown)}")

weighted_log_score_sum = 0.0
weight_sum = sum(CASE_WEIGHTS.values())
weighted_failure_sum = 0.0
failure_count = 0
timeout_failure_count = 0
construction_error_count = 0
success_count = 0
zero_score_count = 0
mixed_success_count = 0
runtime_total = 0.0
construction_total = 0.0
final_score_sum = 0.0
case_scores = {}

print(f"REPORT {report_path}")

for case in cases:
    case_id = case.get("case_id", "unknown")
    weight = CASE_WEIGHTS[case_id]
    status = case.get("status")
    error_message = case.get("error_message") or ""
    timing = case.get("timing") or {}
    runtime = float(case.get("runtime_seconds") or timing.get("total_seconds") or 0.0)
    construction = float(timing.get("initialization_seconds") or 0.0)
    runtime_total += runtime
    construction_total += construction

    if status == "success" and case.get("final_score") is not None:
        success_count += 1
        if "mixed" in case_id:
            mixed_success_count += 1
        score = max(0.0, float(case["final_score"]))
        if not math.isfinite(score):
            score = FAILURE_SCORE_SENTINEL
            failure_count += 1
            weighted_failure_sum += weight
        else:
            final_score_sum += score
            weighted_log_score_sum += weight * math.log1p(score)
            if score == 0.0:
                zero_score_count += 1
    else:
        failure_count += 1
        weighted_failure_sum += weight
        score = FAILURE_SCORE_SENTINEL
        # Keep failed cases visible in score-shaped metrics without letting log overflow.
        weighted_log_score_sum += weight * math.log1p(score)
        if "exceeded budget" in error_message:
            timeout_failure_count += 1
        elif "construction phase failed" in error_message or "Constraint violation" in error_message:
            construction_error_count += 1

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

weighted_log_score_mean = weighted_log_score_sum / weight_sum
weighted_failure_rate = weighted_failure_sum / weight_sum
relabeling_research_loss = (
    weighted_log_score_mean
    + FAILURE_LOSS * weighted_failure_rate
    + TIMEOUT_EXTRA_LOSS * timeout_failure_count
    + CONSTRUCTION_ERROR_EXTRA_LOSS * construction_error_count
    + RUNTIME_SECONDS_WEIGHT * runtime_total
)

print(f"METRIC relabeling_research_loss={relabeling_research_loss:.9f}")
print(f"METRIC weighted_log_score_mean={weighted_log_score_mean:.9f}")
print(f"METRIC weighted_failure_rate={weighted_failure_rate:.9f}")
print(f"METRIC failure_count={failure_count}")
print(f"METRIC timeout_failure_count={timeout_failure_count}")
print(f"METRIC construction_error_count={construction_error_count}")
print(f"METRIC success_count={success_count}")
print(f"METRIC zero_score_count={zero_score_count}")
print(f"METRIC mixed_success_count={mixed_success_count}")
print(f"METRIC diagnostic_final_score_sum={final_score_sum:.6f}")
print(f"METRIC runtime_seconds={runtime_total:.9f}")
print(f"METRIC construction_seconds_total={construction_total:.9f}")
for case_id, metric_name in CASE_METRIC_NAMES.items():
    print(f"METRIC {metric_name}={case_scores[case_id]:.6f}")
PY
