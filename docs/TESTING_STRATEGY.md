# Testing Strategy

This document is the authoritative testing and coverage policy for GroupMixer.

The goal is **refactor safety**, not just a single percentage. For this repository, **100% line coverage is a floor for the most important code paths, not the full strategy**. Confidence comes from multiple layers working together:

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
- module/unit tests in `solver-core/src/**`
- data-driven integration tests in `solver-core/tests/**`
- property/invariant tests in `solver-core/tests/property_tests.rs`
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
- `solver-core/src/**`
- `solver-server/src/**`

Reported separately:
- `solver-wasm/src/**`

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
cargo nextest run --workspace
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
cargo llvm-cov --workspace --all-features --html
cargo llvm-cov --workspace --all-features --lcov --output-path target/coverage/rust.lcov
```

#### Optional native secondary coverage
```bash
cargo tarpaulin -p solver-core --engine llvm --out Html --tests --all-features
```

#### Solver mutation testing
```bash
cargo mutants -p solver-core
```

#### WASM wrapper tests
```bash
wasm-pack test --headless --chrome solver-wasm
```

#### Frontend unit/component coverage
```bash
cd webapp
npm run test:coverage
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
- `solver-core/src/**`: 100% line coverage, branch coverage as high as practical, backed by mutation testing
- `solver-server/src/**`: 100% line coverage for exposed route and lifecycle logic
- `solver-wasm/src/**`: high wrapper-function coverage, reported separately
- `webapp/src/store/**`, `src/services/**`, `src/utils/**`: 100% line coverage target
- high-value frontend components: behavior-focused coverage strong enough to support UI refactors without relying only on E2E

### Enforcement path

The long-term target is 100% on the primary denominators above. CI enforcement may ratchet upward in stages, but every threshold should move toward that target rather than redefine it downward.

The threshold and gate implementation should follow these rules:
- fast test jobs must run on every PR
- coverage reporting must produce human-readable and machine-readable artifacts
- Playwright workflow tests are required browser gates
- visual regression and mutation testing may run on a heavier cadence if needed, but must remain part of the repo strategy

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

## Contributor rule of thumb

- Small Rust change: run relevant unit/data-driven/property tests plus `cargo nextest run --workspace`
- Solver refactor: run full Rust coverage plus mutation testing for the affected solver areas
- Frontend logic change: run Vitest unit/component coverage for the affected area
- UI flow change: run Vitest component tests plus Playwright workflow coverage
- Layout/theme change: run visual regression in addition to functional tests

This document should be updated whenever the testing stack, coverage denominator, or required confidence workflow changes.
