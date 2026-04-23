#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

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
  solver3_broad_multiseed_autoresearch_suites_pin_solver3_and_cover_broad_portfolio \
  -- --nocapture >/dev/null
cargo test -q -p gm-benchmarking \
  validation_passes_for_real_solver_output \
  -- --nocapture >/dev/null
