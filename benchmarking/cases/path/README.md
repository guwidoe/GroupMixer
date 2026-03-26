# Path fixtures

Deterministic fixtures for **Layer 2 — Path regression and solver forensics** from `docs/BENCHMARKING_ARCHITECTURE.md`.

## Convention

Each fixture is a small JSON document with this shape:

```json
{
  "id": "path.swap.forbidden-pair",
  "class": "path",
  "family": "swap",
  "paths": ["swap.forbidden_pair_delta", "swap.apply_cache_consistency"],
  "description": "Why this case exists",
  "input": { "...": "Valid ApiInput payload" }
}
```

## Rules

- `id` is stable and human-meaningful.
- `class` is always `path` for this directory.
- `family` is one of `swap`, `transfer`, `clique_swap`, `search_driver`, or `construction`.
- `paths` lists the benchmark-architecture path taxonomy that the case is intended to activate.
- `input` should remain a valid `ApiInput` payload so a later benchmark runner can execute the case directly.
- Prefer explicit `seed`, explicit `move_policy`, and deterministic warm starts when the path intent depends on them.

## Relationship to tests

These fixtures are **catalog assets**, not replacements for `backend/core/tests/`.

- Rust regression tests prove semantics and cache consistency.
- Path fixtures make the path catalog inspectable and reusable by the future benchmark runner.
- `benchmarking/path-matrix.yaml` is the source of truth for mapping a path to both tests and fixtures.
