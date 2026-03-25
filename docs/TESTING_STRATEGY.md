# Testing Strategy

This document is the authoritative testing and coverage policy for GroupMixer.

For the day-to-day contributor workflow, see [`docs/TEST_PYRAMID_AND_REFACTOR_WORKFLOW.md`](./TEST_PYRAMID_AND_REFACTOR_WORKFLOW.md).

The goal is **refactor safety**, not just a single percentage. For this repository, **100% line coverage is a floor for the most important code paths, not the full strategy**. Confidence comes from multiple layers working together:

For benchmark lane selection and operator workflow, see [`benchmarking/WORKFLOW.md`](../benchmarking/WORKFLOW.md).

For the upcoming webapp worker/WASM migration risk map and required pre-migration safety net, see [`docs/WEBAPP_RUNTIME_MIGRATION_REGRESSION_MATRIX.md`](./WEBAPP_RUNTIME_MIGRATION_REGRESSION_MATRIX.md).

- narrow unit tests for branch-heavy logic
- data-driven integration tests for end-to-end solver behavior
- property/invariant tests for structural guarantees
- API and WASM wrapper tests for boundary layers
- frontend logic and component tests for refactor-safe UI behavior
- Playwright workflow tests for browser-level regressions
- visual regression tests for layout/styling safety
- mutation testing for solver-core logic quality

## Test layers by surface

### `solver-core`
Primary business-critical surface.

Required layers:
- module/unit tests in `backend/core/src/**`
- data-driven integration tests in `backend/core/tests/**`
- property/invariant tests in `backend/core/tests/property_tests.rs`
- mutation testing with `cargo-mutants`

### `solver-server`
Separate API surface.

Required layers:
- route/integration tests through Axum router
- job manager lifecycle tests

### `solver-wasm`
Wrapper/interoperability layer.

Required layers:
- `wasm-bindgen-test` / `wasm-pack test` coverage of exported functions
- explicit tests for JSON parsing, result serialization, callback behavior, and wrapper errors

Important: `solver-wasm` is reported separately so it does not dilute or duplicate `solver-core` business-logic coverage.

### `webapp`
Frontend confidence stack.

Required layers:
- Vitest coverage for `src/store/**`, `src/services/**`, `src/utils/**`
- focused component tests for high-value UI containers/modals/results screens
- Playwright workflow tests for browser-level user journeys
- visual regression tests as a separate UI-layout safety net

Important: Storybook stories are complementary only. They are not the main app test surface.

## Coverage denominator policy

### Rust denominator
The primary Rust coverage denominator is:
- `backend/core/src/**`
- `backend/api/src/**`

Reported separately:
- `backend/wasm/src/**`

Excluded or tracked separately:
- generated artifacts
- benchmark-only code
- `legacy_*`
- build output under `target/`
- wasm-pack/public output

### Frontend denominator
The primary frontend unit/component coverage denominator is:
- `webapp/src/store/**`
- `webapp/src/services/**`
- `webapp/src/utils/**`
- high-value `webapp/src/components/**`

The **currently enforced** frontend coverage gate is intentionally narrower than the long-term denominator above and is defined in `webapp/vite.config.ts`. It covers the currently hardened, refactor-critical surfaces first:
- persistence and conversion services (`problemStorage`, `compare`, worker/wasm conversions)
- critical Zustand slices (`problemSlice`, `solverSlice`, `uiSlice`)
- utility modules already treated as refactor-sensitive
- key navigation/results/problem-manager components that now have direct behavior tests

Excluded or tracked separately:
- `webapp/src/stories/**`
- generated files and build outputs
- public wasm-pack output
- purely generated shims

## Authoritative tools

### Rust
- fast runner: `cargo nextest`
- primary coverage: `cargo llvm-cov`
- optional secondary native coverage check: `cargo tarpaulin`
- mutation testing: `cargo mutants`

### Frontend
- unit/component/store/service coverage: `vitest --coverage`
- browser workflow coverage: `playwright`
- visual regression: dedicated Playwright visual suite

## Canonical local commands

### Fast local confidence

#### Rust
```bash
./scripts/test-rust-fast.sh
# equivalent cargo command: cargo nextest run --workspace --exclude solver-wasm
```

#### Frontend logic
```bash
cd webapp
npm run test:unit
```

#### Browser workflows
```bash
cd webapp
npm run test:e2e:workflows
```

### Full local confidence

#### Rust coverage
```bash
./scripts/coverage-rust.sh
# or individually:
# cargo llvm-cov --workspace --all-features --exclude solver-wasm --exclude solver-cli --ignore-filename-regex '.*/src/main.rs' --summary-only
# cargo llvm-cov --workspace --all-features --exclude solver-wasm --exclude solver-cli --ignore-filename-regex '.*/src/main.rs' --html --output-dir target/coverage/rust-html
# cargo llvm-cov --workspace --all-features --exclude solver-wasm --exclude solver-cli --ignore-filename-regex '.*/src/main.rs' --lcov --output-path target/coverage/rust.lcov
```

This script now also writes `target/coverage/rust-summary.txt` for CI summaries/review.

#### Optional native secondary coverage
```bash
./scripts/coverage-rust-tarpaulin.sh
# equivalent cargo command: cargo tarpaulin -p solver-core --engine llvm --out Html --tests --all-features
```

#### Solver mutation testing
```bash
./scripts/mutation-solver-core.sh
# equivalent cargo command: cargo mutants -p solver-core
```

Mutation testing is an on-demand local and protected-branch/nightly confidence layer for `solver-core`, not an every-edit command.

#### WASM wrapper tests
```bash
wasm-pack test --headless --chrome backend/wasm
# local fallback when browser webdriver setup is unavailable:
# wasm-pack test --node backend/wasm
```

#### Frontend unit/component coverage
```bash
cd webapp
npm run test:coverage
npm run test:coverage:ci
```

#### Frontend browser workflow tests
```bash
cd webapp
npm run test:e2e:workflows
```

#### Frontend visual regression
```bash
cd webapp
npm run test:e2e:visual
```

## Coverage and quality goals

Long-term targets:
- `backend/core/src/**`: 100% line coverage, branch coverage as high as practical, backed by mutation testing
- `backend/api/src/**`: 100% line coverage for exposed route and lifecycle logic
- `backend/wasm/src/**`: high wrapper-function coverage, reported separately
- `webapp/src/store/**`, `src/services/**`, `src/utils/**`: 100% line coverage target
- high-value frontend components: behavior-focused coverage strong enough to support UI refactors without relying only on E2E

### Enforcement path

The long-term target is 100% on the primary denominators above. CI enforcement may ratchet upward in stages, but every threshold should move toward that target rather than redefine it downward.

The threshold and gate implementation should follow these rules:
- fast test jobs must run on every PR
- coverage reporting must produce human-readable and machine-readable artifacts
- Playwright workflow tests are required browser gates
- visual regression and mutation testing may run on a heavier cadence if needed, but must remain part of the repo strategy

### Current staged CI thresholds

These are **ratchet floors**, not the final target:

#### Rust (`cargo llvm-cov` gate)
- denominator: `solver-core` + `solver-server` coverage, excluding `solver-cli`, `solver-wasm`, and binary `src/main.rs` glue
- enforced in CI via `RUST_COVERAGE_FAIL_UNDER_*`
- current floor:
  - lines: `78%`
  - functions: `87%`

Branch coverage is not currently emitted in a stable/useful way by the repo's `cargo llvm-cov` setup, so it is tracked qualitatively for now rather than hard-failed.

#### Frontend (`vitest --coverage` gate)
- denominator: the critical, explicitly enumerated modules in `webapp/vite.config.ts`
- current floor:
  - lines: `73%`
  - statements: `74%`
  - functions: `80%`
  - branches: `65%`

These thresholds are expected to ratchet upward as more `webapp` surfaces are brought under direct test coverage.

## CI artifact/reporting policy

Every PR should surface the following machine/human-readable outputs:
- Rust: `target/coverage/rust.lcov`, `target/coverage/rust-html/`, `target/coverage/rust-summary.txt`
- Frontend: `webapp/coverage/unit/` including HTML, LCOV, Cobertura, and JSON summary output

Current PR gates:
- `.github/workflows/rust.yml`
  - `rust-tests`
  - `rust-coverage`
- `.github/workflows/frontend.yml`
  - `lint`
  - `unit-coverage`
  - `build`
  - `e2e`

Heavier layers remain intentionally separate today:
- mutation testing: on-demand / protected-branch cadence
- visual regression: separate UI-layout safety net, not a required PR gate yet

## What each layer is trusted to catch

- **Unit tests**: local branches, validation rules, edge cases, formatting, small state transitions
- **Data-driven solver tests**: realistic end-to-end solver contract behavior
- **Property tests**: invariants that must hold across broad input spaces
- **Mutation tests**: whether solver tests actually fail on logic changes
- **Server integration tests**: routing, HTTP status, serialization, job lifecycle
- **WASM tests**: parse/serialize/callback/wrapper correctness at the JS boundary
- **Frontend logic tests**: store actions, services, conversions, persistence, utility logic
- **Component tests**: interaction and rendering behavior of critical UI surfaces
- **Playwright workflow tests**: real browser journeys across solving, persistence, navigation
- **Visual regression**: layout, responsive, modal, and styling drift

## Benchmark lane policy

Benchmarking is split across three different surfaces with different trust levels:

- **path / regression tests**: semantic correctness for specific move families and solver branches
- **solve-level benchmark runner** (`solver-cli benchmark ...`): structured run/baseline/comparison workflow for representative runtime + quality interpretation
- **Criterion microbenches** (`cargo bench -p solver-core --bench solver_perf ...`): repeated hot-kernel timing for low-level forensics

Policy:

- every PR should rely on semantic lanes first
- same-machine runtime comparison is a heavier diagnostic lane, not a generic cross-machine PR gate
- Criterion is for hotspot analysis, not for baseline/report semantics

## Contributor rule of thumb

- Small Rust change: run relevant unit/data-driven/property tests plus `cargo nextest run --workspace`
- Solver refactor: run full Rust coverage plus mutation testing for the affected solver areas
- Performance-sensitive solver refactor: add the relevant solve-level benchmark run and, if needed, matching `solver_perf` Criterion microbench group
- Frontend logic change: run Vitest unit/component coverage for the affected area
- UI flow change: run Vitest component tests plus Playwright workflow coverage
- Layout/theme change: run visual regression in addition to functional tests

## Helper scripts

Rust tooling helpers live in `scripts/`:
- `./scripts/install-rust-test-tools.sh`
- `./scripts/test-rust-fast.sh`
- `./scripts/coverage-rust.sh`
- `./scripts/coverage-rust-tarpaulin.sh`
- `./scripts/mutation-solver-core.sh`

This document should be updated whenever the testing stack, coverage denominator, or required confidence workflow changes.
