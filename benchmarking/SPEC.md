# Benchmarking specification

This folder implements the solve-level benchmark system described in `docs/BENCHMARKING_ARCHITECTURE.md`.

## Design rules

- structured artifacts are the source of truth
- suite class is preserved in every case and rollup
- manifests are explicit and versioned
- benchmark runs record reproducibility inputs like seed, stop budget, and move policy
- comparisons must fail honestly when runs are not compatible

## Manifest layers

### Suite manifest

A suite manifest describes one benchmark class and the case manifests it contains.

Current shape:

- `schema_version`
- `suite_id`
- `class`
- `title`
- `description`
- optional suite-level defaults for seed, stop budget, and move policy
- `cases[]`

### Case manifest

A case manifest describes one deterministic benchmark case.

Current shape:

- `schema_version`
- `id`
- `class`
- optional `family` and `paths` metadata for path cases
- optional `tags`
- `description`
- `input` as a valid `solver_core::models::ApiInput`

## Directory layout

```text
benchmarking/
  README.md
  SPEC.md
  SCHEMAS.md
  suites/
    path.yaml
    representative.yaml
    stretch.yaml
    adversarial.yaml
  cases/
    path/
    representative/
    stretch/
    adversarial/
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
