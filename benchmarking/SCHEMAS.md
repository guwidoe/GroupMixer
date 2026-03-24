# Benchmark artifact schemas

This file describes the machine-readable artifacts emitted by the solve-level benchmark runner.

Schema files live in `benchmarking/schemas/`.

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
- reproducibility: git identity, machine identity, effective seed, effective budget, effective move policy
- outcome: status, stop reason, error message if any
- timing: initialization / search / finalization / total
- quality: initial score, final score, best score
- search telemetry: iterations, no-improvement count, per-move-family counters

## Run report

A persisted suite execution.

Key fields:

- suite metadata
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
- per-case runtime / quality / iteration deltas
- per-class rollup deltas
- ranked regression-suspect summary

## Compatibility expectations

Comparison should remain explicit rather than permissive.

Examples of non-comparable situations:

- suite id mismatch
- machine mismatch for runtime interpretation
- missing cases in one side or the other
- incompatible schema versions
