# Benchmarking specification

This folder implements the solve-level benchmark system described in `docs/BENCHMARKING_ARCHITECTURE.md`.

## Design rules

- structured artifacts are the source of truth
- suite class is preserved in every case and rollup
- manifests are explicit and versioned
- benchmark runs record reproducibility inputs like seed, stop budget, move policy, and explicit solver-policy selection
- benchmark run artifacts persist case-identity metadata (source path, canonical case id, role, source fingerprint, purpose/provenance summary, declared budget metadata)
- full-solve case artifacts include an external final-solution validation report (independent recompute + invariant checks + mismatch diagnostics)
- full-solve case artifacts persist a structured score decomposition (total, objective/penalty terms, and weighted major-constraint-family breakdown)
- comparisons must fail honestly when runs are not compatible, including case-identity drift

## Manifest layers

### Suite manifest

A suite manifest describes one benchmark class, one explicit benchmark mode, and the case manifests it contains.

Current shape:

- `schema_version`
- `suite_id`
- `benchmark_mode` (`full_solve` by default; hotpath modes are explicit)
- optional `case_selection_policy` (`canonical_only` by default for full-solve `score_quality` suites; otherwise `allow_non_canonical`)
- `class`
- `title`
- `description`
- optional suite-level defaults for solver family, full solver configuration, seed, stop budget, move policy, hotpath iterations, and hotpath warmup iterations
- `cases[]`

Canonical objective suites default to `case_selection_policy: canonical_only`.
Helper/diagnostic suites that intentionally include derived/proxy/helper cases must opt into `case_selection_policy: allow_non_canonical`.

Each suite case override may also declare benchmark-identity metadata:

- optional `case_role`
- optional `canonical_case_id`
- optional `purpose`
- optional `provenance`
- optional `declared_budget` (`max_iterations` and/or `time_limit_seconds`)

For canonical objective-suite manifests, this metadata is policy-required even when optional in the generic schema:

- `case_role` must be `canonical`
- `purpose` must be set
- `provenance` must be set
- `declared_budget` must be set
- effective budget fields (`max_iterations` and/or `time_limit_seconds`) must be explicit in the case override

### Case manifest

A case manifest describes one deterministic benchmark case.

Current shape:

- `schema_version`
- `id`
- `class`
- `case_role` (`canonical` by default)
- optional `canonical_case_id` for non-canonical helper/derived/proxy cases
- optional `family` and `paths` metadata for path cases
- optional `solver_family` when the case needs to declare an explicit canonical solver-family id
- suite case overrides may also provide an explicit `solver` configuration when benchmark policy must pin solver meta-settings rather than rely on family defaults alone
- optional `purpose`
- optional `provenance`
- optional `declared_budget`
- optional `tags`
- `description`
- either `input` as a valid `gm_core::models::ApiInput` or `hotpath_preset` for a deterministic hotpath fixture

Rules:

- `case_role: canonical` means the case is the exact benchmark/testing target for its declared question
- non-canonical roles (`helper`, `derived`, `proxy`, `warm_start`, `benchmark_start`) must declare `canonical_case_id`
- canonical cases must **not** set `canonical_case_id`
- `declared_budget`, when present, must set at least one of `max_iterations` or `time_limit_seconds`
- full-solve cases may infer solver family from `input.solver`, but may also declare `solver_family` explicitly for metadata clarity
- full-solve suites may replace a case's embedded solver configuration with an explicit checked-in benchmark policy via `default_solver` / `solver` overrides
- hotpath cases **must** declare `solver_family` explicitly
- `hotpath_preset` is a probe identifier, not a promise that every solver family shares the same internal kernel implementation
- shared storage/reporting/comparison remain one platform even when the hotpath probe implementation differs by solver family

### Shared baseline construction ownership model

The benchmark platform has one shared way to describe the **construction benchmark question**,
but construction implementation ownership remains solver-family specific.

What is shared today:

- the benchmark question shape (`benchmark_mode: construction` and `benchmark_mode: full_recalculation`)
- case/suite metadata ownership (manifest id, provenance, solver-family id, class, tags)
- artifact schema + storage ownership (`hotpath_metrics`, run reports, baselines, comparisons)
- reproducibility metadata ownership (seed/budget/move policy capture)

What remains solver-owned:

- the constructor entrypoint that is actually timed
- deterministic placement behavior and internal state layout
- any constructor-specific caches/derived state built before search begins

Current honest status:

- `hotpath-construction` and `hotpath-full-recalculation` currently use solver1 fixtures (`construction_default`)
- solver2/solver3 already share the broader benchmark platform (full-solve suites and move-family hotpath lanes), but do **not** yet provide dedicated construction/full-recalculation hotpath probes
- `solver3` baseline placement is currently family-owned in `RuntimeState::initialize_from_schedule`; it does **not** use the shared solver1 baseline constructor helper (`solver_support::construction::apply_solver1_baseline_construction_heuristic`)

Future work (not done yet):

- add solver2/solver3 construction + full-recalculation presets/cases
- only claim cross-family shared construction baselines once those lanes are implemented and runnable

### Canonical objective full-suite policy

Canonical objective suite v1 is represented by the three manifests documented in `docs/benchmarking/OBJECTIVE_CASE_PORTFOLIO.md`.

For objective autoresearch, the full canonical objective bundle must run every experiment. Running only one manifest is a diagnostic shortcut, not objective-lane keep/discard evidence.

### Correctness edge-case corpus policy

The intertwined-constraints correctness corpus is a separate suite:

- `backend/benchmarking/suites/correctness-edge-intertwined-v1.yaml`

It is intentionally configured for correctness/invariant interpretation (`comparison_category: invariant_only`) and is not part of the canonical objective score-quality bundle.

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

## External full-solve validation

For every `full_solve` case, the runner performs an external validation pass after the solver returns:

- first validate the solver-reported final schedule against the shared **incumbent warm-start** contract
- clear any source-case `construction_seed_schedule` before replaying the final schedule
- parse the solver-reported final schedule as a fresh external state
- recompute total score and score breakdown from scratch
- run independent feasibility/invariant checks
- mark the case as failed (`status: solver_error`) if validation mismatches are found
- persist detailed diagnostics in `external_validation`

## Initial workflow target

Wave 3 is considered complete when the repo can:

1. load a suite manifest
2. run all cases deterministically
3. persist a machine-readable run report
4. save a named baseline snapshot
5. compare a current run to a baseline and produce a structured comparison artifact
6. render a concise human summary from the structured comparison data
