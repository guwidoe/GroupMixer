# Benchmark workflow and CI policy

This document explains how GroupMixer's benchmark layers fit into daily work.

Reference documents:

- `docs/BENCHMARKING_ARCHITECTURE.md`
- `docs/TESTING_STRATEGY.md`
- `./TOOLING.md`

## The short version

Use the cheapest layer that answers the engineering question honestly.

| Question | Primary layer | Typical command |
| --- | --- | --- |
| Did I break solver semantics on a known move path? | path regression tests | `cargo test -p gm-core --test move_swap_regression` |
| Did I break broad end-to-end solver behavior? | data-driven + property tests | `cargo test -p gm-core --test data_driven_tests --test property_tests` |
| Did a realistic suite get slower or lower-quality? | solve-level benchmark runner | `gm-cli benchmark run --suite representative` |
| Did a hot kernel regress? | Criterion microbench layer | `cargo bench -p gm-core --bench solver_perf swap` |

## Local workflow by task type

### Small correctness change

Run the narrowest semantic tests first:

```bash
cargo test -p gm-core --test core_regression_tests
cargo test -p gm-core --test data_driven_tests
```

### Move-family or scoring refactor

Run all three semantic layers before performance investigation:

```bash
cargo test -p gm-core --test move_swap_regression
cargo test -p gm-core --test move_transfer_regression
cargo test -p gm-core --test move_clique_swap_regression
cargo test -p gm-core --test data_driven_tests
cargo test -p gm-core --test property_tests
```

If semantics are clean and you need runtime forensics:

```bash
gm-cli benchmark run --suite representative
cargo bench -p gm-core --bench solver_perf swap
cargo bench -p gm-core --bench solver_perf transfer
```

### Construction / search-loop refactor

Use the solve-level and microbench layers together:

```bash
gm-cli benchmark run --suite representative
gm-cli benchmark baseline list --suite representative
cargo bench -p gm-core --bench solver_perf construction
cargo bench -p gm-core --bench solver_perf search_loop
```

### Real-demo large-workload validation

Use the real Sailing Trip package when you need the actual demo workload rather than a toy or derived proxy:

```bash
gm-cli benchmark run --manifest backend/benchmarking/suites/stretch-sailing-trip-demo-time-solver3-canonical.yaml
gm-cli benchmark run --manifest backend/benchmarking/suites/stretch-sailing-trip-demo-iterations-solver3-canonical.yaml
gm-cli benchmark run --manifest backend/benchmarking/suites/hotpath-search-iteration-sailing-trip-demo-solver3.yaml
gm-cli benchmark run --manifest backend/benchmarking/suites/hotpath-clique-swap-preview-sailing-trip-demo-solver3.yaml
```

Policy notes:

- use the `*-canonical` suites for stable architecture/regression comparisons
- use the `*-tuned` suites for checked-in best-known benchmark policy comparisons
- use the `*_demo_real_benchmark_start` workload when you want shared deterministic start-state comparability across solver families

## Baseline workflow

### Record a baseline before a refactor

```bash
gm-cli benchmark run --suite representative --save-baseline before-refactor
```

### Re-run after the change

```bash
gm-cli benchmark run --suite representative
```

### Compare current vs baseline

```bash
gm-cli benchmark compare \
  --run backend/benchmarking/artifacts/runs/<run-id>/run-report.json \
  --baseline before-refactor
```

Short baseline names resolve through the current run's machine id and suite id.

## CI lane policy

### Required on every PR: semantic lanes

These lanes answer correctness questions and should stay deterministic and refactor-safe:

- Rust unit/integration/property/path-regression tests
- frontend/unit/browser correctness gates already defined in repo workflows

These lanes must not depend on same-machine runtime conditions.

### Optional / controlled lane: runtime comparison

Use the dedicated benchmark system for runtime interpretation:

- `gm-cli benchmark run --suite representative`
- `gm-cli benchmark compare ...`
- `cargo bench -p gm-core --bench solver_perf ...`

This lane should run on a controlled benchmark machine or explicitly named benchmark pool.

### Why runtime is not a generic PR gate

Cross-machine timing is noisy and can be misleading. The repo policy is:

- semantic regression is mandatory
- runtime comparison is diagnostic and should be same-machine when used for decisions
- cross-machine benchmark reports may still be collected, but must not be presented as equally trustworthy runtime evidence

## Recommended cadence

### Every solver-affecting PR

- required: semantic tests
- recommended when behavior is performance-sensitive: one solve-level suite relevant to the change

### Before/after major refactors

- save a named baseline
- rerun the same suite on the same benchmark machine
- compare current vs baseline
- use Criterion to drill into any suspect move family or kernel

## Recording workflow

For durable same-machine history, prefer recordings over ad hoc shell notes.

### Record one suite into history

```bash
gm-cli benchmark record --suite representative --recording-id rep-before-refactor
```

or through the wrapper:

```bash
./tools/benchmark_workflow.sh record --suite representative --recording-id rep-before-refactor
```

### Record a bundle for one feature or checkpoint

```bash
gm-cli benchmark record-bundle \
  --suite representative \
  --suite stretch \
  --recording-id feature-checkpoint
```

### Compare latest vs previous in one lane

```bash
gm-cli benchmark compare-prev --suite representative
```

### Inspect history and refs

```bash
gm-cli benchmark recordings list
gm-cli benchmark refs list
gm-cli benchmark latest --suite representative
gm-cli benchmark previous --suite representative
```

## Legacy fixture performance thresholds

A small number of ignored data-driven benchmark fixtures still carry legacy runtime smoke expectations.

Policy:

- they remain optional smoke checks only
- they are not the repo's long-term performance gate
- enable them explicitly with `GROUPMIXER_ENABLE_FIXTURE_PERF_ASSERTIONS=1` when you intentionally want that old lightweight signal
- use `gm-cli benchmark ...` plus baselines/comparisons for durable runtime interpretation

## Remote same-machine workflow

For serious timing interpretation, use the designated remote benchmark lane.

When a change touches solver hot paths (`backend/core/src/solver/**`, hot move preview/apply code, construction, scoring, or other performance-sensitive search paths), queue a remote same-machine benchmark before handoff. The default rule is after-change benchmarking; add a before-change run too when the previous baseline is stale or when you need an explicit fresh comparison point.

### Configure the machine once

```bash
cp ./tools/remote_benchmark.env.example ./tools/remote_benchmark.env
# fill in SSH target, machine name, and stage dir
./tools/remote_benchmark_async.sh check
```

### Queue a representative snapshot run

```bash
./tools/remote_benchmark_async.sh snapshot
./tools/remote_benchmark_async.sh wait "$(./tools/remote_benchmark_async.sh latest)"
./tools/remote_benchmark_async.sh fetch "$(./tools/remote_benchmark_async.sh latest)"
```

### Queue a mainline bundle

```bash
./tools/remote_benchmark_async.sh record-main
```

The canonical mainline bundle includes both solve-level and hotpath lanes.

### Queue a feature-validation bundle

```bash
./tools/remote_benchmark_async.sh record-feature move-policy-refactor
```

Both bundle commands stage an immutable snapshot, persist one recording, and materialize explicit comparison follow-ups for the relevant lanes.

The current canonical bundle adds these hotpath lanes alongside the full-solve suites:

Benchmark artifacts now also record solver-family identity and suite comparison category so cross-solver comparisons stay honest. Use:
- `score_quality` for representative full-solve suites
- `invariant_only` for semantic/path-focused suites
- `performance_only` for hotpath forensics


- `hotpath-construction`
- `hotpath-full-recalculation`
- `hotpath-swap-preview`
- `hotpath-swap-apply`
- `hotpath-transfer-preview`
- `hotpath-transfer-apply`
- `hotpath-clique-swap-preview`
- `hotpath-clique-swap-apply`
- `hotpath-search-iteration`

## Relationship between layers

- `backend/core/tests/**` remains the semantic contract
- `backend/benchmarking/` owns structured run/baseline/comparison artifacts
- `backend/core/benches/` owns repeated kernel timing with Criterion

Do not collapse these roles together.
