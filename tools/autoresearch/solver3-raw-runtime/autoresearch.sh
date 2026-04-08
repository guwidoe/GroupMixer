#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

ARTIFACTS_DIR="$(mktemp -d "${TMPDIR:-/tmp}/groupmixer-autoresearch-solver3-raw-XXXXXX")"
cleanup() {
  rm -rf "$ARTIFACTS_DIR"
}
trap cleanup EXIT

run_suite() {
  local manifest="$1"
  local log_file="$ARTIFACTS_DIR/$(basename "$manifest" .yaml).log"

  if ! cargo run -q -p gm-cli -- benchmark run --manifest "$manifest" --artifacts-dir "$ARTIFACTS_DIR" >"$log_file" 2>&1; then
    tail -80 "$log_file" >&2 || true
    return 1
  fi

  local report_path
  report_path="$(sed -n 's/^Run report: //p' "$log_file" | tail -1)"
  if [[ -z "$report_path" || ! -f "$report_path" ]]; then
    echo "failed to resolve run report for $manifest" >&2
    tail -80 "$log_file" >&2 || true
    return 1
  fi

  printf '%s\n' "$report_path"
}

SWAP_PREVIEW_REPORT="$(run_suite backend/benchmarking/suites/hotpath-swap-preview-solver3.yaml)"
SWAP_APPLY_REPORT="$(run_suite backend/benchmarking/suites/hotpath-swap-apply-solver3.yaml)"
TRANSFER_PREVIEW_REPORT="$(run_suite backend/benchmarking/suites/hotpath-transfer-preview-solver3.yaml)"
TRANSFER_APPLY_REPORT="$(run_suite backend/benchmarking/suites/hotpath-transfer-apply-solver3.yaml)"
CLIQUE_PREVIEW_REPORT="$(run_suite backend/benchmarking/suites/hotpath-clique-swap-preview-solver3.yaml)"
CLIQUE_APPLY_REPORT="$(run_suite backend/benchmarking/suites/hotpath-clique-swap-apply-solver3.yaml)"
REPRESENTATIVE_REPORT="$(run_suite backend/benchmarking/suites/representative-solver3.yaml)"
PATH_REPORT="$(run_suite backend/benchmarking/suites/path-solver3.yaml)"

python3 - \
  "$SWAP_PREVIEW_REPORT" \
  "$SWAP_APPLY_REPORT" \
  "$TRANSFER_PREVIEW_REPORT" \
  "$TRANSFER_APPLY_REPORT" \
  "$CLIQUE_PREVIEW_REPORT" \
  "$CLIQUE_APPLY_REPORT" \
  "$REPRESENTATIVE_REPORT" \
  "$PATH_REPORT" <<'PY'
import json
import sys
from statistics import mean

(
    swap_preview_path,
    swap_apply_path,
    transfer_preview_path,
    transfer_apply_path,
    clique_preview_path,
    clique_apply_path,
    representative_path,
    path_path,
) = sys.argv[1:]


def load(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def hotpath_avg_us(report):
    return report["cases"][0]["hotpath_metrics"]["average_runtime_seconds"] * 1_000_000.0


def case_iter_us(case):
    iterations = case.get("iteration_count") or 0
    if iterations <= 0:
        return 0.0
    return case["runtime_seconds"] * 1_000_000.0 / iterations

swap_preview = hotpath_avg_us(load(swap_preview_path))
swap_apply = hotpath_avg_us(load(swap_apply_path))
transfer_preview = hotpath_avg_us(load(transfer_preview_path))
transfer_apply = hotpath_avg_us(load(transfer_apply_path))
clique_preview = hotpath_avg_us(load(clique_preview_path))
clique_apply = hotpath_avg_us(load(clique_apply_path))

rep = load(representative_path)
rep_cases = {case["case_id"]: case for case in rep["cases"]}
rep_balanced = rep_cases["representative.small-workshop-balanced"]
rep_constrained = rep_cases["representative.small-workshop-constrained"]
rep_balanced_iter = case_iter_us(rep_balanced)
rep_constrained_iter = case_iter_us(rep_constrained)
rep_avg_iter = mean([case_iter_us(case) for case in rep["cases"]])

path_report = load(path_path)
path_cases = {case["case_id"]: case for case in path_report["cases"]}
path_iter_values = {cid: case_iter_us(case) for cid, case in path_cases.items()}
path_avg_iter = mean(path_iter_values.values())

hotpath_total = (
    swap_preview
    + swap_apply
    + transfer_preview
    + transfer_apply
    + clique_preview
    + clique_apply
)

solver3_raw_score_us = hotpath_total + rep_avg_iter + path_avg_iter

metrics = {
    "solver3_raw_score_us": solver3_raw_score_us,
    "hotpath_total_us": hotpath_total,
    "swap_preview_us": swap_preview,
    "swap_apply_us": swap_apply,
    "transfer_preview_us": transfer_preview,
    "transfer_apply_us": transfer_apply,
    "clique_preview_us": clique_preview,
    "clique_apply_us": clique_apply,
    "rep_avg_iter_us": rep_avg_iter,
    "path_avg_iter_us": path_avg_iter,
    "rep_balanced_iter_us": rep_balanced_iter,
    "rep_constrained_iter_us": rep_constrained_iter,
    "rep_balanced_score": float(rep_balanced["final_score"]),
    "rep_constrained_score": float(rep_constrained["final_score"]),
}

path_metric_names = {
    "path.swap.forbidden-pair": "path_swap_iter_us",
    "path.transfer.pair-meeting": "path_transfer_iter_us",
    "path.clique-swap.partial-participation": "path_clique_iter_us",
    "path.search-driver.allowed-sessions": "path_allowed_sessions_iter_us",
    "path.construction.clique-immovable": "path_construction_iter_us",
}
for case_id, metric_name in path_metric_names.items():
    if case_id in path_iter_values:
        metrics[metric_name] = path_iter_values[case_id]

for name, value in metrics.items():
    print(f"METRIC {name}={value}")
PY
