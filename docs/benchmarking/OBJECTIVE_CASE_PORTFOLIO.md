# Objective + correctness case portfolio (v1)

## Status

- Canonical objective suite v1 is checked in and runnable as a three-manifest bundle.
- A separate intertwined correctness corpus is checked in.
- This document tracks, per curated case:
  - provenance
  - purpose
  - canonical/helper status
  - checked-in budget
  - baseline note placeholder
  - best-known note placeholder

This is an honest current-state portfolio, not a claim that all go-live blockers are resolved.

## Canonical objective suite shape (v1)

Because the runner currently enforces one `class` per suite manifest, canonical objective v1 is represented as a bundle:

1. `backend/benchmarking/suites/objective-canonical-representative-v1.yaml`
2. `backend/benchmarking/suites/objective-canonical-adversarial-v1.yaml`
3. `backend/benchmarking/suites/objective-canonical-stretch-v1.yaml`

Objective keep/discard claims must run all three manifests together.

## Separate correctness/edge-case corpus (non-objective)

The intertwined-constraints correctness corpus is tracked separately under:

- `backend/benchmarking/suites/correctness-edge-intertwined-v1.yaml`

That suite is intentionally a correctness/invariant lane (`comparison_category: invariant_only`) and is **not** part of canonical objective score-quality keep/discard evidence.

See `docs/benchmarking/CORRECTNESS_EDGE_CASE_CORPUS.md` for corpus inventory, reused test-case provenance, and run guidance.

## Baseline / best-known placeholder convention

For each curated case below:

- **Baseline note** placeholder: `TODO (record baseline run-report / snapshot ref)`
- **Best-known note** placeholder: `TODO (record checked-in best-known reference, if maintained)`

No baseline/best-known refs are filled in this doc yet; placeholders are intentionally explicit.

## Curated objective cases (canonical)

| Case manifest | Status | Provenance | Purpose | Checked-in budget | Baseline note | Best-known note |
| --- | --- | --- | --- | --- | --- | --- |
| `backend/benchmarking/cases/representative/small_workshop_balanced.json` | canonical objective | `checked_in_case_manifest` (from objective-canonical-representative-v1 entry) | `objective_target.representative.balanced` | `max_iterations: 5000`, `time_limit_seconds: 2` (suite entry) | TODO | TODO |
| `backend/benchmarking/cases/representative/small_workshop_constrained.json` | canonical objective | `checked_in_case_manifest` (from objective-canonical-representative-v1 entry) | `objective_target.representative.constraint_mix` | `max_iterations: 8000`, `time_limit_seconds: 3` (suite entry) | TODO | TODO |
| `backend/benchmarking/cases/adversarial/constraint_heavy_partial_attendance.json` | canonical objective | `checked_in_case_manifest` (from objective-canonical-adversarial-v1 entry) | `objective_target.adversarial.partial_attendance_constraints` | `max_iterations: 12000`, `time_limit_seconds: 4` (suite entry) | TODO | TODO |
| `backend/benchmarking/cases/stretch/medium_multi_session.json` | canonical objective | `checked_in_case_manifest` (from objective-canonical-stretch-v1 entry) | `objective_target.stretch.medium_multi_session` | `max_iterations: 20000`, `time_limit_seconds: 6` (suite entry) | TODO | TODO |
| `backend/benchmarking/cases/stretch/social_golfer_32x8x10.json` | canonical objective | `backend/core/tests/test_cases/social_golfer_problem.json` reused as benchmark manifest | `objective_target.stretch.social_golfer_zero_repeat_encounters` | `max_iterations: 400000`, `time_limit_seconds: 25` (suite entry) | TODO | TODO |
| `backend/benchmarking/cases/stretch/large_gender_immovable_110p.json` | canonical objective | `backend/core/tests/test_cases/benchmark_large_gender_immovable.json` reused as benchmark manifest | `objective_target.stretch.large_heterogeneous_attribute_balance_and_immovable` | `max_iterations: 100000`, `time_limit_seconds: 12` (suite entry) | TODO | TODO |
| `backend/benchmarking/cases/stretch/sailing_trip_demo_real.json` | canonical objective | `exact_anonymized_demo_case_no_helper_start_substitution` (from objective-canonical-stretch-v1 entry) | `objective_target.stretch.real_sailing_trip_raw_case` | `max_iterations: 1000000`, `time_limit_seconds: 15` (suite entry) | TODO | TODO |

## Objective-adjacent checked-in cases (helper / non-canonical)

These cases are curated and useful, but they are not canonical objective targets.

| Case manifest | Status | Provenance | Purpose | Checked-in budget | Baseline note | Best-known note |
| --- | --- | --- | --- | --- | --- | --- |
| `backend/benchmarking/cases/stretch/sailing_trip_demo_real_benchmark_start.json` | helper (`benchmark_start`) | derived from `sailing_trip_demo_real.json` by adding deterministic `initial_schedule` | shared deterministic cross-solver comparative start state for the exact real problem | declared in case: `max_iterations: 1000000`, `time_limit_seconds: 15`; used by dedicated Sailing Trip helper suites | TODO | TODO |
| `backend/benchmarking/cases/stretch/sailing_trip_feature_dense.json` | non-canonical (`derived`) | hand-derived stretch case inspired by Sailing Trip demo, intentionally reshaped | historical derived stretch stress workload (not exact real demo target) | declared in case: `max_iterations: 2500`; also enforced by `stretch.yaml` case override | TODO | TODO |

## Curated correctness / edge-case corpus (currently checked in)

Primary suite:

- `backend/benchmarking/suites/correctness-edge-intertwined-v1.yaml`

This corpus is distinct from the objective suite and is aimed at correctness stress rather than objective score-quality ranking.

| Case manifest | Status | Provenance | Purpose | Checked-in budget | Baseline note | Best-known note |
| --- | --- | --- | --- | --- | --- | --- |
| `backend/benchmarking/cases/adversarial/correctness_hard_constraints_stress.json` | canonical correctness corpus case (non-objective target) | `backend/core/tests/test_cases/hard_constraints_stress_test.json` reused as benchmark manifest | `correctness_edge.hard_constraints_stress` | suite entry `max_iterations: 2000`, `time_limit_seconds: 2` | TODO | TODO |
| `backend/benchmarking/cases/adversarial/correctness_late_arrivals_early_departures.json` | canonical correctness corpus case (non-objective target) | `backend/core/tests/test_cases/late_arrivals_early_departures_test.json` reused as benchmark manifest | `correctness_edge.partial_participation_arrivals_departures` | suite entry `max_iterations: 2000`, `time_limit_seconds: 2` | TODO | TODO |
| `backend/benchmarking/cases/adversarial/correctness_session_aware_group_capacities.json` | canonical correctness corpus case (non-objective target) | `backend/core/tests/test_cases/session_aware_group_capacities_test.json` reused as benchmark manifest | `correctness_edge.session_aware_group_capacities` | suite entry `max_iterations: 1500`, `time_limit_seconds: 2` | TODO | TODO |
| `backend/benchmarking/cases/adversarial/correctness_session_specific_constraints.json` | canonical correctness corpus case (non-objective target) | `backend/core/tests/test_cases/session_specific_constraints_test.json` reused as benchmark manifest | `correctness_edge.session_specific_constraints` | suite entry `max_iterations: 1500`, `time_limit_seconds: 2` | TODO | TODO |

## Full-suite-every-experiment rule (objective lane)

For objective autoresearch, every experiment must run the full canonical bundle:

1. `objective-canonical-representative-v1`
2. `objective-canonical-adversarial-v1`
3. `objective-canonical-stretch-v1`

Single-manifest subset runs are diagnostics only.

## Blockers and gaps (honest status)

- The exact raw Sailing Trip solver3 path remains a go-live blocker for objective autoresearch (`sailing_trip_demo_real.json` as itself, not helper substitution).
- The correctness corpus is now checked in as a separate suite, but it still needs broader expansion for more edge families over time.
- Baseline and best-known references are intentionally placeholders in this document and still need explicit checked-in policy decisions per case.
