# Benchmarking

This folder defines the structured benchmarking system for GroupMixer.

Primary references:

- `docs/BENCHMARKING_ARCHITECTURE.md`
- `benchmarking/SPEC.md`
- `benchmarking/SCHEMAS.md`
- `benchmarking/TOOLING.md`
- `benchmarking/WORKFLOW.md`
- `benchmarking/RECORDINGS.md`
- `benchmarking/AUDIT.md`

## What lives here

- suite manifests in `benchmarking/suites/`
- benchmark case manifests in `benchmarking/cases/`
- machine-readable artifact schemas in `benchmarking/schemas/`
- generated run artifacts and baselines under local artifact storage when the runner is used

## Architectural role

This folder is the **structured benchmark operations surface**.

It is intentionally separate from `solver-core/benches/`:

- `solver-core/benches/` owns Criterion microbench timing
- `benchmarking/` owns suite taxonomy, manifests, artifacts, baselines, recordings, and comparisons

That includes both:

- solve-level `full_solve` suites
- recordable hotpath suites used for remote/history lanes

## Current suite classes

- `path`
- `representative`
- `stretch`
- `adversarial`

Each case belongs to exactly one primary class so rollups preserve context instead of flattening unlike workloads into one mixed average.

## Current benchmark-mode families

- `full_solve`
- `construction`
- `full_recalculation`
- `swap_preview`
- `swap_apply`
- `transfer_preview`
- `transfer_apply`
- `clique_swap_preview`
- `clique_swap_apply`
- `search_iteration`
