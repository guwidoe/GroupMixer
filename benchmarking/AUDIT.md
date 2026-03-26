# Benchmark initiative audit

Date: 2026-03-24

This is a short end-of-wave audit of the benchmark architecture implemented across Waves 2-5.

Reference architecture: `docs/BENCHMARKING_ARCHITECTURE.md`

## Audit result

**Overall status: working as intended for the implemented scope.**

The repo now has all four intended benchmark layers/surfaces in place:

1. deterministic solver seams in `solver-core`
2. path-regression semantic safety in `backend/core/tests/`
3. solve-level benchmark runner/artifacts/baselines/comparisons in `solver-benchmarking/`
4. hot-path Criterion microbenches in `backend/core/benches/`
5. operator-facing storage/CLI/workflow integration in `benchmarking/` + `solver-cli`

## What was explicitly checked in this audit

### Repo-wide validation

- `cargo test --workspace --lib --tests`
- `cargo bench -p solver-core --bench solver_perf --no-run`

### Solve-level benchmark workflow validation

Validated on a temporary artifact root to confirm the full operator workflow works end to end:

```bash
solver-cli benchmark run --suite representative --artifacts-dir <tmp> --cargo-profile audit --save-baseline audit-representative
solver-cli benchmark compare --run <tmp>/runs/.../run-report.json --baseline audit-representative --artifacts-dir <tmp>
solver-cli benchmark baseline list --suite representative --artifacts-dir <tmp>
```

Observed behavior:

- representative suite ran successfully
- run report persisted under the configured artifact root
- named baseline saved under machine-id + suite-id layout
- compare resolved the short baseline name correctly
- comparison artifact and human summary were generated successfully

## Implemented repo surfaces

### Semantic path-regression layer

- `backend/core/tests/move_swap_regression.rs`
- `backend/core/tests/move_transfer_regression.rs`
- `backend/core/tests/move_clique_swap_regression.rs`
- `backend/core/tests/search_driver_regression.rs`
- `backend/core/tests/construction_regression.rs`
- `benchmarking/path-matrix.yaml`
- `benchmarking/cases/path/`

### Solve-level benchmark runner layer

- `solver-benchmarking/src/manifest.rs`
- `solver-benchmarking/src/artifacts.rs`
- `solver-benchmarking/src/machine.rs`
- `solver-benchmarking/src/storage.rs`
- `solver-benchmarking/src/runner.rs`
- `solver-benchmarking/src/compare.rs`
- `solver-benchmarking/src/summary.rs`

### Operator / workflow layer

- `backend/cli/src/main.rs`
- `benchmarking/README.md`
- `benchmarking/SPEC.md`
- `benchmarking/SCHEMAS.md`
- `benchmarking/TOOLING.md`
- `benchmarking/WORKFLOW.md`

### Criterion hot-path layer

- `backend/core/benches/bench_inputs.rs`
- `backend/core/benches/solver_perf.rs`

## Benchmark command matrix

### Semantic safety commands

| Intent | Command |
| --- | --- |
| swap path semantics | `cargo test -p solver-core --test move_swap_regression` |
| transfer path semantics | `cargo test -p solver-core --test move_transfer_regression` |
| clique-swap path semantics | `cargo test -p solver-core --test move_clique_swap_regression` |
| search/construction branches | `cargo test -p solver-core --test construction_regression --test search_driver_regression` |
| broad end-to-end semantic suite | `cargo test -p solver-core --test data_driven_tests --test property_tests` |

### Solve-level benchmark runner commands

| Intent | Command |
| --- | --- |
| run path suite | `solver-cli benchmark run --suite path` |
| run representative suite | `solver-cli benchmark run --suite representative` |
| run with custom manifest | `solver-cli benchmark run --manifest <suite.yaml>` |
| run and save baseline | `solver-cli benchmark run --suite representative --save-baseline before-refactor` |
| save baseline from existing run | `solver-cli benchmark baseline save --run <run-report.json> --name before-refactor` |
| list baselines | `solver-cli benchmark baseline list --suite representative` |
| compare against named baseline | `solver-cli benchmark compare --run <run-report.json> --baseline before-refactor` |
| compare against explicit snapshot path | `solver-cli benchmark compare --run <run-report.json> --baseline <baseline.json>` |

### Criterion microbench commands

| Intent | Command |
| --- | --- |
| compile bench surface only | `cargo bench -p solver-core --bench solver_perf --no-run` |
| construction kernels | `cargo bench -p solver-core --bench solver_perf construction` |
| full recalculation | `cargo bench -p solver-core --bench solver_perf recalculation` |
| swap kernels | `cargo bench -p solver-core --bench solver_perf swap` |
| transfer kernels | `cargo bench -p solver-core --bench solver_perf transfer` |
| clique-swap kernels | `cargo bench -p solver-core --bench solver_perf clique_swap` |
| search-loop kernels | `cargo bench -p solver-core --bench solver_perf search_loop` |

## Environment / storage controls

| Purpose | Variable |
| --- | --- |
| override artifact root | `GROUPMIXER_BENCHMARK_ARTIFACTS_DIR` |
| set stable benchmark machine id | `GROUPMIXER_BENCHMARK_MACHINE_ID` |
| opt in to legacy fixture perf smoke assertions | `GROUPMIXER_ENABLE_FIXTURE_PERF_ASSERTIONS=1` |

## Coverage summary

### Covered well now

- deterministic run reproduction inputs: seed, move policy, stop reason, benchmark telemetry
- intentional move-family/branch semantic regression coverage
- structured benchmark manifests for path / representative / stretch / adversarial suites
- machine-readable run reports, baseline snapshots, and comparison reports
- machine-aware baseline storage and lookup
- CLI-driven benchmark workflows for run / baseline save / baseline list / compare
- dedicated Criterion timing for construction, recalc, swap, transfer, clique-swap, and search loop

### Remaining gaps / next improvements

These are **gaps after the implemented scope**, not regressions in the delivered work:

1. **No dedicated CI automation yet for same-machine runtime lanes**
   - docs and commands exist
   - a controlled benchmark-machine workflow file has not been added yet

2. **No retention/pruning/operator maintenance commands yet**
   - artifacts can be listed and written
   - there is not yet a CLI for cleanup, pruning, or retention policy enforcement

3. **No benchmark history/dashboard surface yet**
   - artifacts are structured and durable
   - trend visualization is still external/manual

4. **Criterion remains cargo-driven, not solver-cli-driven**
   - this is acceptable architecturally
   - but there is no single top-level wrapper command for microbench groups yet

5. **Legacy fixture perf smoke checks still exist in a minimal form**
   - they are now opt-in only
   - the long-term direction is correctly shifted to benchmark artifacts and comparisons

## Bottom line

The benchmark architecture is now real, operable, and internally coherent.

A contributor can now:

1. verify semantics with path regressions and data-driven tests
2. run solve-level suites
3. save same-machine baselines
4. compare current runs to baselines
5. drill into suspect kernels with Criterion

That matches the intended architecture closely enough that future work should focus on adoption and CI/operator polish rather than missing benchmark foundations.
