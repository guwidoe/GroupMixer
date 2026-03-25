# Benchmark recordings and history store

Reference architecture: `docs/BENCHMARKING_ARCHITECTURE.md`

## Purpose

GroupMixer's benchmark system now needs a durable history layer on top of raw run reports.

A **recording** is the canonical history unit for benchmark operations.

A recording captures one benchmark session on one machine for one commit. It may contain:

- one suite run, or
- a bundle of suite runs captured together for one feature or mainline check

A suite run may be either a `full_solve` lane or a recordable hotpath lane such as `swap_preview` or `search_iteration`.

The store must support:

- immutable recording metadata
- machine-lane history
- named refs such as `recordings/latest`
- same-machine-over-time interpretation
- future remote benchmark queue workflows

## Design goals

### Immutable raw truth

Run reports remain the source of truth. Recordings add durable metadata around those artifacts; they do not replace or rewrite them.

### Structured queryability

The store should answer questions like:

- what was the latest recording on this machine?
- what was the previous `representative/full_solve` recording?
- which recording does `branches/main/suites/path/full_solve/latest` point to?

### Same-machine honesty

Timing interpretation must stay inside explicit machine lanes.

Machine identity is therefore part of:

- recording metadata
- lane selection
- ref updates
- later remote compare-target selection

### No service requirement

The storage model remains file-backed and local-first:

- filesystem artifacts are the source of truth
- SQLite powers structured queries
- JSON ref files provide named pointers

## Storage layout

The benchmark history root lives under:

```text
benchmarking/artifacts/
```

The recording store adds these first-class subtrees:

```text
benchmarking/artifacts/
  recordings/
    <recording-id>/
      meta.json
  index/
    benchmark.sqlite
  refs/
    recordings/
      latest.json
    machines/
      <machine-id>/
        latest.json
        suites/
          <suite-name>/
            <benchmark-mode>/
              latest.json
    branches/
      <branch>/
        latest.json
        suites/
          <suite-name>/
            <benchmark-mode>/
              latest.json
```

Existing raw artifacts remain under:

```text
benchmarking/artifacts/runs/<run-id>/
benchmarking/artifacts/baselines/<machine>/<suite>/<baseline>.json
benchmarking/artifacts/comparisons/<suite>/...
```

## Recording metadata contract

Each recording stores `recordings/<recording-id>/meta.json`.

Current shape:

```json
{
  "schema_version": "groupmixer-benchmark-recording",
  "recording_id": "smoke-path-1",
  "recorded_at": "2026-03-24T23:23:46Z",
  "purpose": "manual-record",
  "feature_name": null,
  "source": "solver-cli benchmark record",
  "git": {
    "branch": "main",
    "commit_sha": "...",
    "short_sha": "...",
    "dirty_tree": false
  },
  "machine": {
    "id": "groupmixer-bench-linux-amd64",
    "hostname": "benchbox",
    "kind": "local"
  },
  "suite_runs": [
    {
      "suite_name": "representative",
      "suite_manifest_path": "benchmarking/suites/representative.yaml",
      "suite_schema_version": 1,
      "suite_content_hash": "sha256:...",
      "benchmark_mode": "full_solve",
      "run_id": "representative-...",
      "run_report_path": "runs/representative-.../run-report.json",
      "summary_path": null,
      "case_count": 2,
      "successful_case_count": 2,
      "failed_case_count": 0,
      "runtime_seconds": 1.25
    }
  ]
}
```

## Suite lane identity

A lane is defined by:

- `suite_name`
- `benchmark_mode`
- `machine_id`
- `suite_content_hash`

The suite-content hash prevents false equivalence when a suite file changes but keeps the same filename.

## SQLite index

The SQLite database lives at:

```text
benchmarking/artifacts/index/benchmark.sqlite
```

Current tables:

- `recordings`
- `suite_runs`
- `refs`

This supports:

- newest-first recording listing
- ref listing
- future machine-lane query expansion without introducing a server

## Ref model

Refs are JSON files backed by index rows.

Examples:

- `recordings/latest`
- `machines/<machine-id>/latest`
- `machines/<machine-id>/suites/<suite>/<mode>/latest`
- `branches/<branch>/latest`
- `branches/<branch>/suites/<suite>/<mode>/latest`
- when applicable: `main/...` and `features/<feature>/...`

Each ref file contains the target recording and suite lane entry.

Refs are convenience pointers, not the source of truth.

## Current CLI surfaces

Recording and history operations are now available through `solver-cli`:

```bash
solver-cli benchmark record --suite representative
solver-cli benchmark record --suite hotpath-swap-preview
solver-cli benchmark record-bundle --suite representative --suite stretch --suite hotpath-search-iteration
solver-cli benchmark compare-prev --suite representative
solver-cli benchmark recordings list
solver-cli benchmark recordings show <recording-id>
solver-cli benchmark refs list
solver-cli benchmark refs show branches/main/suites/representative/full_solve/latest
solver-cli benchmark latest --suite representative
solver-cli benchmark previous --suite representative
```

## Workflow wrapper

The normal happy-path wrapper lives at:

```bash
./tools/benchmark_workflow.sh
```

Examples:

```bash
./tools/benchmark_workflow.sh doctor
./tools/benchmark_workflow.sh record --suite representative --recording-id rep-1
./tools/benchmark_workflow.sh record-bundle --suite representative --suite stretch --recording-id nightly-main
./tools/benchmark_workflow.sh history --artifacts-dir /tmp/gm-bench
./tools/benchmark_workflow.sh compare-prev --suite representative
```

## Remote-machine mirror layout

When remote async runs are used, remote state is mirrored locally under:

```text
benchmarking/artifacts/remotes/
  <machine-id>/
    artifacts/
      ... mirrored shared remote benchmark artifacts ...
    benchmark-runs/
      <run-id>/
        start.json
        status.json
        benchmark.log
        meta.json
        ...
```

This local mirror lets operators inspect remote queue state and fetched artifacts without shelling back into the benchmark machine.

## Forward link to remote benchmarking

This recording store is the foundation for the next benchmark wave:

- immutable remote snapshots
- async remote queueing
- mirrored remote artifacts
- `snapshot`, `record-main`, and `record-feature` workflows

The remote lane should feed this recording/ref/index model rather than bypass it.
