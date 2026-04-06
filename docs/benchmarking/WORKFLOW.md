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

Construction baseline ownership note:

- the benchmark platform and artifact schema for construction are shared
- the currently runnable hotpath construction baseline (`hotpath-construction`) is solver1-owned today
- solver2/solver3 still rely on shared full-solve + move-family/search-iteration lanes while their dedicated construction probes remain future work

### Real-demo large-workload validation

Use the real Sailing Trip package with the benchmark meaning kept explicit:

```bash
gm-cli benchmark run --manifest backend/benchmarking/suites/stretch-sailing-trip-demo-time-solver3-canonical.yaml
gm-cli benchmark run --manifest backend/benchmarking/suites/stretch-sailing-trip-demo-iterations-solver3-canonical.yaml
gm-cli benchmark run --manifest backend/benchmarking/suites/hotpath-search-iteration-sailing-trip-demo-solver3.yaml
gm-cli benchmark run --manifest backend/benchmarking/suites/hotpath-clique-swap-preview-sailing-trip-demo-solver3.yaml
```

### Solver3 oracle/debug correctness feature

`gm-core` exposes `solver3-oracle-checks` as an explicit correctness/debug feature flag.

The sampled search-loop correctness lane also requires an explicit solver3 setting:

```json
"solver_params": {
  "solver_type": "solver3",
  "correctness_lane": {
    "enabled": true,
    "sample_every_accepted_moves": 16
  }
}
```

- Enable the feature + setting for correctness runs that should execute sampled runtime-vs-oracle/invariant checks:
  - `cargo test -p gm-core --features solver3-oracle-checks --test search_driver_regression solver3_correctness_lane_runs_with_feature_enabled`
- Keep the setting disabled (default) and leave the feature off for performance benchmark lanes so hotpath timing remains representative:
  - run `gm-cli benchmark ...` normally (no extra `--features`)

Truthfulness notes:

- `backend/benchmarking/cases/stretch/sailing_trip_demo_real.json` is the canonical real-demo target case
- `backend/benchmarking/cases/stretch/sailing_trip_demo_real_benchmark_start.json` is a helper comparative case, not a canonical objective target
- solver3 `*-canonical` Sailing Trip full-solve suites now run the exact raw case directly
- helper benchmark-start suites remain valid for explicit shared-start comparative diagnostics only

Policy notes:

- use solver3 `*-canonical` Sailing Trip suites when the benchmark question is the exact raw real-demo workload
- use `*-tuned` or explicit `*_benchmark_start` suites only when you intentionally want shared deterministic start-state comparison
- do not present helper-start runs as the canonical objective benchmark answer

## Objective autoresearch full-suite policy (canonical v1)

Canonical objective suite v1 is a bundle of three manifests:

- `backend/benchmarking/suites/objective-canonical-representative-v1.yaml`
- `backend/benchmarking/suites/objective-canonical-adversarial-v1.yaml`
- `backend/benchmarking/suites/objective-canonical-stretch-v1.yaml`

For objective autoresearch, run **all three manifests on every experiment**:

```bash
gm-cli benchmark run --manifest backend/benchmarking/suites/objective-canonical-representative-v1.yaml
gm-cli benchmark run --manifest backend/benchmarking/suites/objective-canonical-adversarial-v1.yaml
gm-cli benchmark run --manifest backend/benchmarking/suites/objective-canonical-stretch-v1.yaml
```

Rule: partial subsets are diagnostics only and must not be used as keep/discard evidence for objective-lane claims.

Checked-in autoresearch lane wiring:

- `tools/autoresearch/objective-quality/autoresearch.sh` runs the full canonical objective bundle **plus** `correctness-edge-intertwined-v1` on every experiment.
- `tools/autoresearch/objective-quality/autoresearch.checks.sh` runs required correctness/validation guardrails.
- `tools/autoresearch/objective-quality/README.md` documents setup and metric policy (objective quality primary, runtime secondary).

Sailing Trip truth boundary:

- the canonical raw case is included directly in `objective-canonical-stretch-v1`
- the raw Sailing Trip solver3 path is now runnable as itself
- helper benchmark-start cases remain helper-only and must not replace the raw canonical case in objective claims

### Objective autoresearch go-live checklist and blockers

Before declaring the objective autoresearch lane live, confirm every go-live gate is green:

- [x] canonical-vs-helper enforcement is active for objective suites (`case_selection_policy: canonical_only` by default)
- [x] external full-solve validation is active in benchmark run artifacts
- [x] final-solution validation now replays schedules under the shared incumbent-warm-start contract (benchmark helper construction seeds are cleared before replay)
- [x] canonical objective suite v1 manifests + explicit per-case budgets are checked in
- [x] workflow policy requires full-suite execution on every objective experiment
- [x] exact raw `stretch/sailing_trip_demo_real.json` solver3 path is runnable as itself (not helper benchmark-start substitution)
- [x] dedicated objective-quality autoresearch config/command/checks are checked in
- [ ] long-running objective-lane burn-in evidence has been recorded and reviewed

Current status: lane wiring is complete and ready for supervised use; autonomous go-live is still pending burn-in evidence.

See `docs/benchmarking/OBJECTIVE_CASE_PORTFOLIO.md` for required metadata and per-case budget policy.

## Correctness edge-case corpus workflow (intertwined constraints)

Run the dedicated correctness corpus when you need focused confidence on intertwined-constraint semantics:

```bash
gm-cli benchmark run --manifest backend/benchmarking/suites/correctness-edge-intertwined-v1.yaml
```

This corpus is intentionally separate from canonical objective score-quality evidence. Treat it as a correctness/invariant lane, not objective keep/discard proof.

See `docs/benchmarking/CORRECTNESS_EDGE_CASE_CORPUS.md` for case inventory and provenance back to `backend/core/tests/test_cases/` sources.

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
