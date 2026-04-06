#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

# Broad shared correctness guardrails. These are the main semantic protection for
# the objective lane and intentionally cover the repo's strongest gm-core solver
# contract surfaces.
cargo test -q -p gm-core --test data_driven_tests -- --nocapture >/dev/null
cargo test -q -p gm-core --test property_tests -- --nocapture >/dev/null

# Focused regression surfaces for the constructor/search driver and concrete move
# families. These keep targeted regressions visible even when the broader suites
# happen not to trip first.
for test_name in \
  construction_regression \
  search_driver_regression \
  move_swap_regression \
  move_transfer_regression \
  move_clique_swap_regression
 do
  cargo test -q -p gm-core --test "$test_name" -- --nocapture >/dev/null
 done

# Solver3 sampled oracle lane (feature-gated correctness path).
cargo test -q -p gm-core --features solver3-oracle-checks --test search_driver_regression \
  solver3_correctness_lane_runs_with_feature_enabled -- --nocapture >/dev/null

# Canonical objective/correctness suite metadata and truth-boundary guardrails.
cargo test -q -p gm-benchmarking \
  objective_canonical_v1_component_manifests_define_explicit_identity_and_budget_metadata \
  -- --nocapture >/dev/null
cargo test -q -p gm-benchmarking \
  correctness_edge_intertwined_suite_is_distinct_from_canonical_objective_bundle \
  -- --nocapture >/dev/null

# External benchmark validation contract must stay healthy.
cargo test -q -p gm-benchmarking validation_passes_for_real_solver_output -- --nocapture >/dev/null
