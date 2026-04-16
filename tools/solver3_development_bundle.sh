#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BUNDLE_NAME="solver3-development-bundle"
RECORDING_PREFIX="solver3-dev-bundle"
FEATURE_NAME="solver3-development"
PURPOSE_DEFAULT="solver3 development bundle"

BUNDLE_MANIFESTS=(
  "backend/benchmarking/suites/representative-solver3.yaml"
  "backend/benchmarking/suites/correctness-edge-intertwined-solver3-v1.yaml"
  "backend/benchmarking/suites/objective-canonical-adversarial-solver3-v1.yaml"
  "backend/benchmarking/suites/objective-canonical-stretch-solver3-v1.yaml"
  "backend/benchmarking/suites/objective-diagnostic-fixed-iteration-adversarial-solver3-v1.yaml"
  "backend/benchmarking/suites/objective-diagnostic-fixed-iteration-stretch-solver3-v1.yaml"
  "backend/benchmarking/suites/hotpath-search-iteration-sailing-trip-demo-solver3.yaml"
  "backend/benchmarking/suites/hotpath-swap-preview-sailing-trip-demo-solver3.yaml"
  "backend/benchmarking/suites/hotpath-transfer-preview-sailing-trip-demo-solver3.yaml"
  "backend/benchmarking/suites/hotpath-clique-swap-preview-sailing-trip-demo-solver3.yaml"
  "backend/benchmarking/suites/stretch-sailing-trip-demo-time-10s-solver3-canonical.yaml"
  "backend/benchmarking/suites/stretch-sailing-trip-demo-iterations-1m-solver3-canonical.yaml"
  "backend/benchmarking/suites/stretch-partial-attendance-capacity-pressure-time-10s-solver3.yaml"
  "backend/benchmarking/suites/stretch-partial-attendance-capacity-pressure-iterations-1m-solver3.yaml"
)

TARGETED_MULTI_SEED_MANIFESTS=(
  "backend/benchmarking/suites/stretch-sailing-trip-demo-time-10s-solver3-canonical-multiseed.yaml"
  "backend/benchmarking/suites/stretch-sailing-trip-demo-iterations-1m-solver3-canonical-multiseed.yaml"
  "backend/benchmarking/suites/stretch-partial-attendance-capacity-pressure-time-10s-solver3-multiseed.yaml"
  "backend/benchmarking/suites/stretch-partial-attendance-capacity-pressure-iterations-1m-solver3-multiseed.yaml"
)

usage() {
  cat <<'EOF'
Usage:
  ./tools/solver3_development_bundle.sh checks
  ./tools/solver3_development_bundle.sh record [recording-id]
  ./tools/solver3_development_bundle.sh full [recording-id]
  ./tools/solver3_development_bundle.sh record-targeted-multiseed [recording-id]
  ./tools/solver3_development_bundle.sh full-targeted-multiseed [recording-id]
  ./tools/solver3_development_bundle.sh compare-last-two
  ./tools/solver3_development_bundle.sh compare-recordings <previous-recording-id> <current-recording-id>
  ./tools/solver3_development_bundle.sh list-manifests
  ./tools/solver3_development_bundle.sh list-targeted-multiseed-manifests

What it covers:
  - shared solver semantics guardrails (data-driven, property, move/search regressions)
  - solver3-focused correctness/debug checks
  - benchmark metadata/validation checks
  - solver3 benchmark recording bundle:
    * representative solve smoke
    * correctness-edge intertwined lane
    * canonical objective adversarial + stretch bundles
    * fixed-iteration diagnostic adversarial + stretch bundles
    * large Sailing Trip hotpath lanes
    * targeted Sailing Trip real + synthetic partial-attendance stability lanes

Notes:
  - `record` persists one durable benchmark recording via `./tools/benchmark_workflow.sh record-bundle`
  - `record-targeted-multiseed` runs the four targeted Sailing/partial-attendance lanes with 4 explicit seeds each
    and sets `GROUPMIXER_BENCHMARK_JOBS=4` by default so the four seed cases run in parallel
  - `compare-last-two` compares the latest two recordings created by this wrapper lane-by-lane
  - serious timing interpretation should still use the designated remote same-machine lane
EOF
}

run_checks() {
  cargo test -q -p gm-core solver3 -- --nocapture >/dev/null
  cargo test -q -p gm-core --test data_driven_tests -- --nocapture >/dev/null
  cargo test -q -p gm-core --test property_tests -- --nocapture >/dev/null

  for test_name in \
    search_driver_regression \
    move_swap_regression \
    move_transfer_regression \
    move_clique_swap_regression
  do
    cargo test -q -p gm-core --test "$test_name" -- --nocapture >/dev/null
  done

  cargo test -q -p gm-core --features solver3-oracle-checks --test search_driver_regression \
    solver3_correctness_lane_runs_with_feature_enabled -- --nocapture >/dev/null

  cargo test -q -p gm-benchmarking \
    objective_canonical_v1_component_manifests_define_explicit_identity_and_budget_metadata \
    -- --nocapture >/dev/null
  cargo test -q -p gm-benchmarking \
    solver3_objective_autoresearch_suites_pin_solver3_and_include_synthetic \
    -- --nocapture >/dev/null
  cargo test -q -p gm-benchmarking \
    validation_passes_for_real_solver_output \
    -- --nocapture >/dev/null
  cargo test -q -p gm-benchmarking 'hotpath_suite_runs_solver3_' -- --nocapture >/dev/null
}

record_bundle_from_manifests() {
  local recording_id="$1"
  shift
  local args=()
  local manifest
  for manifest in "$@"; do
    args+=(--manifest "$manifest")
  done

  ./tools/benchmark_workflow.sh record-bundle \
    "${args[@]}" \
    --recording-id "$recording_id" \
    --purpose "$PURPOSE_DEFAULT" \
    --feature-name "$FEATURE_NAME"

  printf '\nrecording_id=%s\n' "$recording_id"
}

record_bundle() {
  local recording_id="${1:-${RECORDING_PREFIX}-$(date +%Y%m%dT%H%M%SZ)}"
  record_bundle_from_manifests "$recording_id" "${BUNDLE_MANIFESTS[@]}"
}

record_targeted_multiseed_bundle() {
  local recording_id="${1:-${RECORDING_PREFIX}-targeted-multiseed-$(date +%Y%m%dT%H%M%SZ)}"
  GROUPMIXER_BENCHMARK_JOBS="${GROUPMIXER_BENCHMARK_JOBS:-4}" \
    record_bundle_from_manifests "$recording_id" "${TARGETED_MULTI_SEED_MANIFESTS[@]}"
}

ensure_release_cli() {
  cargo build --release -q -p gm-cli --bin gm-cli
}

compare_recordings() {
  local previous_recording_id="$1"
  local current_recording_id="$2"
  ensure_release_cli

  while IFS=$'\t' read -r suite_name previous_run current_run; do
    [[ -n "$suite_name" ]] || continue
    echo "===== ${suite_name} ====="
    "$ROOT/target/release/gm-cli" benchmark compare \
      --run "$current_run" \
      --baseline-run "$previous_run"
    echo
  done < <(
    python3 - "$ROOT" "$previous_recording_id" "$current_recording_id" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
previous_id = sys.argv[2]
current_id = sys.argv[3]
recordings_dir = root / "backend/benchmarking/artifacts/recordings"
previous_meta = json.loads((recordings_dir / previous_id / "meta.json").read_text())
current_meta = json.loads((recordings_dir / current_id / "meta.json").read_text())
previous_map = {entry["suite_name"]: entry for entry in previous_meta["suite_runs"]}
current_map = {entry["suite_name"]: entry for entry in current_meta["suite_runs"]}
all_suites = sorted(set(previous_map) | set(current_map))
missing = [suite for suite in all_suites if suite not in previous_map or suite not in current_map]
if missing:
    raise SystemExit(f"recordings do not cover the same suite set: {missing}")
for suite in all_suites:
    prev = root / "backend/benchmarking/artifacts" / previous_map[suite]["run_report_path"]
    curr = root / "backend/benchmarking/artifacts" / current_map[suite]["run_report_path"]
    print(f"{suite}\t{prev}\t{curr}")
PY
  )
}

compare_last_two() {
  local previous_current
  previous_current="$(python3 - "$ROOT" "$RECORDING_PREFIX" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
prefix = sys.argv[2]
recordings_dir = root / "backend/benchmarking/artifacts/recordings"
rows = []
for meta_path in recordings_dir.glob('*/meta.json'):
    meta = json.loads(meta_path.read_text())
    recording_id = meta.get('recording_id', '')
    if not recording_id.startswith(prefix):
        continue
    rows.append((meta.get('recorded_at', ''), recording_id))
rows.sort()
if len(rows) < 2:
    raise SystemExit('need at least two recordings produced by this bundle to compare')
print(rows[-2][1])
print(rows[-1][1])
PY
)"
  local previous_recording_id current_recording_id
  previous_recording_id="$(printf '%s\n' "$previous_current" | sed -n '1p')"
  current_recording_id="$(printf '%s\n' "$previous_current" | sed -n '2p')"

  echo "previous_recording_id=${previous_recording_id}"
  echo "current_recording_id=${current_recording_id}"
  echo
  compare_recordings "$previous_recording_id" "$current_recording_id"
}

list_manifests() {
  printf '%s\n' "${BUNDLE_MANIFESTS[@]}"
}

list_targeted_multiseed_manifests() {
  printf '%s\n' "${TARGETED_MULTI_SEED_MANIFESTS[@]}"
}

command="${1:-help}"
case "$command" in
  checks)
    shift
    [[ $# -eq 0 ]] || { usage >&2; exit 1; }
    run_checks
    ;;
  record)
    shift
    [[ $# -le 1 ]] || { usage >&2; exit 1; }
    record_bundle "${1:-}"
    ;;
  full)
    shift
    [[ $# -le 1 ]] || { usage >&2; exit 1; }
    run_checks
    record_bundle "${1:-}"
    ;;
  record-targeted-multiseed)
    shift
    [[ $# -le 1 ]] || { usage >&2; exit 1; }
    record_targeted_multiseed_bundle "${1:-}"
    ;;
  full-targeted-multiseed)
    shift
    [[ $# -le 1 ]] || { usage >&2; exit 1; }
    run_checks
    record_targeted_multiseed_bundle "${1:-}"
    ;;
  compare-last-two)
    shift
    [[ $# -eq 0 ]] || { usage >&2; exit 1; }
    compare_last_two
    ;;
  compare-recordings)
    shift
    [[ $# -eq 2 ]] || { usage >&2; exit 1; }
    compare_recordings "$1" "$2"
    ;;
  list-manifests)
    shift
    [[ $# -eq 0 ]] || { usage >&2; exit 1; }
    list_manifests
    ;;
  list-targeted-multiseed-manifests)
    shift
    [[ $# -eq 0 ]] || { usage >&2; exit 1; }
    list_targeted_multiseed_manifests
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
