# Benchmarking specification

This folder implements the solve-level benchmark system described in `docs/BENCHMARKING_ARCHITECTURE.md`.

## Design rules

- structured artifacts are the source of truth
- suite class is preserved in every case and rollup
- manifests are explicit and versioned
- benchmark runs record reproducibility inputs like seed, stop budget, move policy, and explicit solver-policy selection
- comparisons must fail honestly when runs are not compatible

## Manifest layers

### Suite manifest

A suite manifest describes one benchmark class, one explicit benchmark mode, and the case manifests it contains.

Current shape:

- `schema_version`
- `suite_id`
- `benchmark_mode` (`full_solve` by default; hotpath modes are explicit)
- `class`
- `title`
- `description`
- optional suite-level defaults for solver family, full solver configuration, seed, stop budget, move policy, hotpath iterations, and hotpath warmup iterations
- `cases[]`

### Case manifest

A case manifest describes one deterministic benchmark case.

Current shape:

- `schema_version`
- `id`
- `class`
- optional `family` and `paths` metadata for path cases
- optional `solver_family` when the case needs to declare an explicit canonical solver-family id
- suite case overrides may also provide an explicit `solver` configuration when benchmark policy must pin solver meta-settings rather than rely on family defaults alone
- optional `tags`
- `description`
- either `input` as a valid `gm_core::models::ApiInput` or `hotpath_preset` for a deterministic hotpath fixture

Rules:

- full-solve cases may infer solver family from `input.solver`, but may also declare `solver_family` explicitly for metadata clarity
- full-solve suites may replace a case's embedded solver configuration with an explicit checked-in benchmark policy via `default_solver` / `solver` overrides
- hotpath cases **must** declare `solver_family` explicitly
- `hotpath_preset` is a probe identifier, not a promise that every solver family shares the same internal kernel implementation
- shared storage/reporting/comparison remain one platform even when the hotpath probe implementation differs by solver family

## Directory layout

```text
docs/benchmarking/
  README.md
  SPEC.md
  SCHEMAS.md

backend/benchmarking/
  suites/
    path.yaml
    representative.yaml
    stretch.yaml
    adversarial.yaml
    hotpath-*.yaml
  cases/
    path/
    representative/
    stretch/
    adversarial/
    hotpath/
  schemas/
    case-run.schema.json
    run-report.schema.json
    baseline-snapshot.schema.json
    comparison-report.schema.json
```

## Initial workflow target

Wave 3 is considered complete when the repo can:

1. load a suite manifest
2. run all cases deterministically
3. persist a machine-readable run report
4. save a named baseline snapshot
5. compare a current run to a baseline and produce a structured comparison artifact
6. render a concise human summary from the structured comparison data
