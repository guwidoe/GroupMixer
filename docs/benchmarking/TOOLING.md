# Benchmark tooling and storage policy

This document defines the operator-facing storage layout and same-machine policy for GroupMixer benchmarks.

Reference architecture: `docs/BENCHMARKING_ARCHITECTURE.md`

## Local workflow wrapper

Primary entrypoint:

```bash
./tools/benchmark_workflow.sh doctor
./tools/benchmark_workflow.sh run --suite representative
./tools/benchmark_workflow.sh save before-refactor --suite representative
./tools/benchmark_workflow.sh record --suite representative --recording-id rep-1
./tools/benchmark_workflow.sh record --suite hotpath-swap-preview --recording-id hotpath-swap-1
./tools/benchmark_workflow.sh record-bundle --suite representative --suite stretch --suite hotpath-search-iteration --recording-id nightly-main
./tools/benchmark_workflow.sh compare-prev --suite representative
./tools/benchmark_workflow.sh history
./tools/benchmark_workflow.sh recordings show <recording-id>
./tools/benchmark_workflow.sh refs list
```

The wrapper builds and launches `gm-cli benchmark ...` through `tools/benchmark_runner.py`.

Safety knobs:

- `GROUPMIXER_BENCH_BUILD_JOBS=1` keeps release builds memory-bounded by default
- `GROUPMIXER_BENCH_PYTHON_BIN=/usr/bin/python3` forces a known-safe interpreter when needed
- `./tools/benchmark_workflow.sh doctor` reports the selected interpreter and refuses intercepted wrappers

## Remote async workflow

Primary entrypoint:

```bash
./tools/remote_benchmark_async.sh check
./tools/remote_benchmark_async.sh snapshot
./tools/remote_benchmark_async.sh record-main
./tools/remote_benchmark_async.sh record-feature move-policy-refactor
./tools/remote_benchmark_async.sh status <run-id>
./tools/remote_benchmark_async.sh wait <run-id>
./tools/remote_benchmark_async.sh fetch <run-id>
```

Remote runs stage an immutable repo snapshot and then execute benchmark workflow commands inside that snapshot.

By default the canonical remote main/feature bundles now include both:

- full-solve suites: `representative`, `stretch`, `adversarial`
- hotpath suites: `hotpath-construction`, `hotpath-full-recalculation`, `hotpath-swap-preview`, `hotpath-swap-apply`, `hotpath-transfer-preview`, `hotpath-transfer-apply`, `hotpath-clique-swap-preview`, `hotpath-clique-swap-apply`, `hotpath-search-iteration`

Safety knobs:

- `GROUPMIXER_REMOTE_BENCH_BUILD_JOBS=1` bounds remote release builds
- `GROUPMIXER_REMOTE_PYTHON_BIN=/usr/bin/python3` forces a known-safe remote interpreter when needed
- mirrored metadata is written locally under `backend/benchmarking/artifacts/remotes/<machine>/benchmark-runs/<run-id>/`

## Artifact root

Default local artifact root:

```text
backend/benchmarking/artifacts/
```

Override with:

```bash
export GROUPMIXER_BENCHMARK_ARTIFACTS_DIR=/absolute/path/to/artifacts
```

## Machine identity

Benchmark runs capture machine identity into every structured artifact and also persist a machine record under:

```text
backend/benchmarking/artifacts/machines/<machine-id>.json
```

Machine identity uses:

1. `GROUPMIXER_BENCHMARK_MACHINE_ID` if set
2. otherwise the local hostname if available

Recorded fields include:

- benchmark machine id
- hostname
- CPU model
- logical core count
- OS
- kernel
- `rustc --version`
- cargo profile
- dirty-tree status is recorded in git identity inside run artifacts

## Storage layout

```text
backend/benchmarking/artifacts/
  machines/
    <machine-id>.json
  runs/
    <run-id>/
      run-report.json
      cases/
        <case-id>.json
  baselines/
    <machine-id>/
      <suite-id>/
        <baseline-name>.json
  comparisons/
    <suite-id>/
      <suite>__<baseline>__<run-id>.json
```

## Why baselines are nested by machine and suite

Runtime comparisons are only trustworthy on the same machine class.

By storing baselines under both machine id and suite id, the normal lookup path is explicit and honest:

- baseline names are local to one machine + one suite
- `path` and `representative` baselines do not collide
- a cross-machine comparison requires an explicit path, not an ambiguous short name

## Lookup rules

### Run reports

Run reports are referenced by full path, typically:

```text
backend/benchmarking/artifacts/runs/<run-id>/run-report.json
```

### Baselines

A baseline may be referenced by:

- full path, or
- short baseline name when the current run report is available to infer machine + suite

Short-name resolution expands to:

```text
backend/benchmarking/artifacts/baselines/<machine-id>/<suite-id>/<baseline-name>.json
```

## Same-machine policy

- local developers may compare against baselines from the same machine id
- CI should always enforce semantic correctness lanes
- serious runtime regression checks should run on a controlled same-machine lane
- cross-machine runtime comparisons may still be generated, but they must remain explicitly labeled as not comparable for trustworthy runtime interpretation

## Recording/history surfaces

The benchmark tooling now includes a durable recording/history layer:

- `backend/benchmarking/artifacts/recordings/`
- `backend/benchmarking/artifacts/index/benchmark.sqlite`
- `backend/benchmarking/artifacts/refs/`

See `docs/benchmarking/RECORDINGS.md` for the recording-store design and operator model.

## Recommended environment setup

For a dedicated benchmark workstation, set:

```bash
export GROUPMIXER_BENCHMARK_MACHINE_ID=groupmixer-bench-linux-amd64
```

That keeps baseline directories stable even if the hostname changes.
