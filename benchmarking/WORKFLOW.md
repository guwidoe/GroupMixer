# Benchmark workflow and CI policy

This document explains how GroupMixer's benchmark layers fit into daily work.

Reference documents:

- `docs/BENCHMARKING_ARCHITECTURE.md`
- `docs/TESTING_STRATEGY.md`
- `benchmarking/TOOLING.md`

## The short version

Use the cheapest layer that answers the engineering question honestly.

| Question | Primary layer | Typical command |
| --- | --- | --- |
| Did I break solver semantics on a known move path? | path regression tests | `cargo test -p solver-core --test move_swap_regression` |
| Did I break broad end-to-end solver behavior? | data-driven + property tests | `cargo test -p solver-core --test data_driven_tests --test property_tests` |
| Did a realistic suite get slower or lower-quality? | solve-level benchmark runner | `solver-cli benchmark run --suite representative` |
| Did a hot kernel regress? | Criterion microbench layer | `cargo bench -p solver-core --bench solver_perf swap` |

## Local workflow by task type

### Small correctness change

Run the narrowest semantic tests first:

```bash
cargo test -p solver-core --test core_regression_tests
cargo test -p solver-core --test data_driven_tests
```

### Move-family or scoring refactor

Run all three semantic layers before performance investigation:

```bash
cargo test -p solver-core --test move_swap_regression
cargo test -p solver-core --test move_transfer_regression
cargo test -p solver-core --test move_clique_swap_regression
cargo test -p solver-core --test data_driven_tests
cargo test -p solver-core --test property_tests
```

If semantics are clean and you need runtime forensics:

```bash
solver-cli benchmark run --suite representative
cargo bench -p solver-core --bench solver_perf swap
cargo bench -p solver-core --bench solver_perf transfer
```

### Construction / search-loop refactor

Use the solve-level and microbench layers together:

```bash
solver-cli benchmark run --suite representative
solver-cli benchmark baseline list --suite representative
cargo bench -p solver-core --bench solver_perf construction
cargo bench -p solver-core --bench solver_perf search_loop
```

## Baseline workflow

### Record a baseline before a refactor

```bash
solver-cli benchmark run --suite representative --save-baseline before-refactor
```

### Re-run after the change

```bash
solver-cli benchmark run --suite representative
```

### Compare current vs baseline

```bash
solver-cli benchmark compare \
  --run benchmarking/artifacts/runs/<run-id>/run-report.json \
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

- `solver-cli benchmark run --suite representative`
- `solver-cli benchmark compare ...`
- `cargo bench -p solver-core --bench solver_perf ...`

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

## Relationship between layers

- `solver-core/tests/**` remains the semantic contract
- `solver-benchmarking/` owns structured run/baseline/comparison artifacts
- `solver-core/benches/` owns repeated kernel timing with Criterion

Do not collapse these roles together.
