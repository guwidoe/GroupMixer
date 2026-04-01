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
- reproducibility: git identity, machine identity, effective seed, effective budget, effective move policy
- outcome: status, stop reason, error message if any
- timing: initialization / search / finalization / total
- quality: initial score, final score, best score
- search telemetry: iterations, no-improvement count, per-move-family counters
- optional hotpath metrics: measured operations, warmup count, throughput, and mode-specific timing buckets

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
- per-class rollup deltas
- ranked regression-suspect summary

## Compatibility expectations

Comparison should remain explicit rather than permissive.

Examples of non-comparable situations:

- suite id mismatch
- benchmark mode mismatch
- machine mismatch for runtime interpretation
- missing cases in one side or the other
- incompatible schema versions
