# Benchmark artifact schemas

This file describes the machine-readable artifacts emitted by the benchmark runner.

The artifact surface now supports two explicit lane families:

- `full_solve` solve-level runs
- recordable hotpath lanes such as `construction`, `swap_preview`, `swap_apply`, and `search_iteration`

These families share the recording/history model while remaining distinguishable in machine-readable artifacts.

Schema files live in `backend/benchmarking/schemas/`.

## Versioning rule

Each artifact embeds an explicit `schema_version` integer.

Current versions:

- case run: `1`
- run report: `1`
- baseline snapshot: `1`
- comparison report: `1`

## Case run artifact

One deterministic execution of one case under one effective solver configuration.

Key fields:

- identity: suite id, case id, manifest path, timestamp, run id
- benchmark lane identity: `benchmark_mode`, `artifact_kind`
- persisted case identity metadata (`case_identity`):
  - normalized source path
  - canonical case id
  - effective case role
  - source fingerprint/hash (`sha256:...`)
  - purpose/provenance summary
  - declared budget metadata
- reproducibility: git identity, machine identity, effective seed, effective budget, effective move policy
- outcome: status, stop reason, error message if any
- timing: initialization / search / finalization / total
- quality: initial score, final score, best score
- structured score decomposition (`score_decomposition`) for full-solve runs:
  - total score
  - unique-contact term (`weight * contacts`, represented as a signed score contribution)
  - repetition term
  - attribute-balance term
  - weighted constraint total
  - weighted major-family breakdown (`forbidden_pair`, `should_stay_together`, `pair_meeting_count`, `clique`, `immovable`, plus residual)
- external full-solve validation block (`external_validation`):
  - `validation_passed`
  - total-score agreement
  - score-breakdown agreement
  - invariant/feasibility status
  - schedule roundtrip agreement
  - mismatch diagnostics and recomputed breakdown details
- search telemetry:
  - iterations and iteration throughput (`iterations_per_second`)
  - no-improvement counters (`no_improvement_count`) and max streak (`search_telemetry.max_no_improvement_streak`)
  - acceptance-direction counters (`accepted_downhill_moves`, `accepted_uphill_moves`, `accepted_neutral_moves`)
  - restart/perturbation counters where available (`restart_count`, `perturbation_count`)
  - best-so-far improvement timeline (`best_score_timeline`)
  - per-move-family counters including `improving_accepts`
- optional hotpath metrics: measured operations, warmup count, throughput, and mode-specific timing buckets

## Timing and construction telemetry semantics

The case-run schema uses two timing surfaces that serve different purposes.

### 1) `timing` (shared solve-level timing)

- for `full_solve` artifacts, `timing.initialization_seconds`, `timing.search_seconds`,
  `timing.finalization_seconds`, and `timing.total_seconds` come from solver benchmark telemetry
- `runtime_seconds` is the same top-level wall-time value used for rollups/comparisons
- this is the cross-suite/cross-case timing surface used by baseline/compare reports

Current-state note:

- solver1 currently fills all three phase buckets (initialization/search/finalization)
- solver2/solver3 currently emphasize search timing and still report `0` for some non-search buckets
  (that gap is known follow-up work, not hidden behavior)

### 2) `hotpath_metrics` (mode-specific timing)

- `measurement_seconds` is total measured-loop wall time
- `setup_seconds` is one-time fixture/setup time outside the measured-loop body
- `construction_seconds`, `preview_seconds`, `apply_seconds`, `full_recalculation_seconds`,
  and `search_seconds` are mode-specific operation-time accumulators
- `runtime_seconds` for hotpath artifacts is computed as:
  - `setup_seconds + measurement_seconds`

Interpretation rule:

- mode-specific buckets are for operation forensics
- `measurement_seconds` and `runtime_seconds` remain the authoritative wall-time values for comparisons

Construction-lane honesty:

- `construction_seconds` is non-zero only when the suite runs `benchmark_mode: construction`
- today that runnable lane is solver1-only (`hotpath.construction.default`)
- solver2/solver3 construction telemetry in the shared hotpath schema is intentionally reserved for future implementation, not currently populated by dedicated construction suites

## Run report

A persisted suite execution.

Key fields:

- suite metadata
- explicit `benchmark_mode`
- run metadata
- totals across all cases
- class rollups
- case artifact list

## Baseline snapshot

A named frozen copy of a run report used for later comparison.

Key fields:

- baseline name
- creation timestamp
- optional source run path
- embedded run report

## Comparison report

A structured diff between a current run report and a baseline snapshot.

Key fields:

- comparability result and explicit incompatibility reasons
- explicit `benchmark_mode` and benchmark-mode compatibility flag
- per-case runtime / quality / iteration deltas
- optional per-case score-decomposition deltas (including weighted major-constraint-family breakdowns)
- per-class rollup deltas
- ranked regression-suspect summary

## Compatibility expectations

Comparison should remain explicit rather than permissive.

Examples of non-comparable situations:

- suite id mismatch
- benchmark mode mismatch
- machine mismatch for runtime interpretation
- missing cases in one side or the other
- case identity mismatch (source path, canonical id, role, fingerprint, purpose/provenance summary, or declared budget metadata)
- incompatible schema versions
