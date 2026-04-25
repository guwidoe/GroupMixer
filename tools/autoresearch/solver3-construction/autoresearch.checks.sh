#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

run_quiet() {
  local label="$1"
  shift
  local tmp
  tmp="$(mktemp)"
  if ! "$@" >"$tmp" 2>&1; then
    echo "FAILED: $label" >&2
    tail -80 "$tmp" >&2
    rm -f "$tmp"
    exit 1
  fi
  rm -f "$tmp"
}

run_quiet "git diff --check" git diff --check
run_quiet "cargo check -p gm-core" cargo check -q -p gm-core
run_quiet "cargo check -p gm-benchmarking" cargo check -q -p gm-benchmarking
run_quiet "gm-core constraint-scenario oracle tests" cargo test -q -p gm-core constraint_scenario_oracle --lib
run_quiet "gm-benchmarking policy tests" cargo test -q -p gm-benchmarking complexity_based_wall_time_policy_uses_complexity_and_sgp_discount
