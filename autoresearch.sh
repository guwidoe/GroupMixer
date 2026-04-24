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
import re
import sys
from pathlib import Path

report_path = Path(sys.argv[1])
report = json.loads(report_path.read_text())
cases = report.get("cases", [])
if not cases:
    raise SystemExit("benchmark report contains no cases")

failure_penalty = 1000.0
broad_log_score = 0.0
failure_count = 0
scores = []
construction_total = 0.0
runtime_total = 0.0

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
    scores.append(score)

    timing = case.get("timing") or {}
    runtime_total += float(case.get("runtime_seconds") or timing.get("total_seconds") or 0.0)
    # In two-phase artifacts, construction is included in initialization time.
    construction_total += float(timing.get("initialization_seconds") or 0.0)

    safe_case_id = re.sub(r"[^A-Za-z0-9]+", "_", case_id).strip("_").lower()
    print(f"METRIC final_score_{safe_case_id}={score:.6f}")

if failure_count:
    broad_log_score += failure_count * failure_penalty

total_score = sum(scores)
mean_score = total_score / len(scores)
max_score = max(scores)

print(f"METRIC broad_log_score={broad_log_score:.9f}")
print(f"METRIC failure_count={failure_count}")
print(f"METRIC total_final_score={total_score:.6f}")
print(f"METRIC mean_final_score={mean_score:.9f}")
print(f"METRIC max_final_score={max_score:.6f}")
print(f"METRIC runtime_seconds={runtime_total:.9f}")
print(f"METRIC construction_seconds_total={construction_total:.9f}")
PY
