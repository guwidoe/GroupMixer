# Benchmarking

This folder defines the structured benchmarking system for GroupMixer.

Primary references:

- `../BENCHMARKING_ARCHITECTURE.md`
- `./SPEC.md`
- `./SCHEMAS.md`
- `./TOOLING.md`
- `./WORKFLOW.md`
- `./RECORDINGS.md`
- `./AUDIT.md`

## What lives here

- suite manifests in `backend/benchmarking/suites/`
- benchmark case manifests in `backend/benchmarking/cases/`
- machine-readable artifact schemas in `backend/benchmarking/schemas/`
- generated run artifacts and baselines under local artifact storage when the runner is used

## Architectural role

This docs folder is the human-facing benchmark documentation surface.

It is intentionally paired with the machine-readable benchmark surface under
`backend/benchmarking/` and separate from `backend/core/benches/`:

- `backend/core/benches/` owns Criterion microbench timing
- `backend/benchmarking/` owns suite taxonomy, manifests, artifacts, baselines, recordings, and comparisons

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
