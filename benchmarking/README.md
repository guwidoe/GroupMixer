# Benchmarking

This folder defines the solve-level benchmarking system for GroupMixer.

Primary references:

- `docs/BENCHMARKING_ARCHITECTURE.md`
- `benchmarking/SPEC.md`
- `benchmarking/SCHEMAS.md`
- `benchmarking/TOOLING.md`
- `benchmarking/WORKFLOW.md`
- `benchmarking/AUDIT.md`

## What lives here

- suite manifests in `benchmarking/suites/`
- benchmark case manifests in `benchmarking/cases/`
- machine-readable artifact schemas in `benchmarking/schemas/`
- generated run artifacts and baselines under local artifact storage when the runner is used

## Architectural role

This folder is the **Layer 3 solve-level benchmark surface**.

It is intentionally separate from `solver-core/benches/`:

- `solver-core/benches/` owns Criterion microbench timing
- `benchmarking/` owns suite taxonomy, manifests, artifacts, baselines, and comparisons

## Current suite classes

- `path`
- `representative`
- `stretch`
- `adversarial`

Each case belongs to exactly one primary class so rollups preserve context instead of flattening unlike workloads into one mixed average.
