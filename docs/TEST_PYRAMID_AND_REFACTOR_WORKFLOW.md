# Test Pyramid and Refactor Workflow

This guide explains **which tests to trust, when to run them, and why**.

Use it together with [`docs/TESTING_STRATEGY.md`](./TESTING_STRATEGY.md):
- `TESTING_STRATEGY.md` = policy, tools, denominators, thresholds, CI gates
- this file = practical contributor workflow for day-to-day changes and refactors

## Core message

For GroupMixer, **100% line coverage is a floor, not the whole strategy**.

Why:
- line coverage can prove a line executed without proving the right assertion failed on a regression
- solver logic can still survive bad mutations unless tests are strong
- UI behavior can regress even when pure logic coverage stays high
- layout/theme drift can slip through functional tests

So the real safety net is a stack of layers, not one number.

## Practical test pyramid

### Backend / Rust

1. **Unit tests**
   - small modules and branch-heavy logic
   - best for validation, score bookkeeping, helpers, and move logic edges

2. **Data-driven integration tests**
   - realistic solver scenarios from fixtures
   - best for solver contract behavior across whole problems

3. **Property / invariant tests**
   - many generated inputs
   - best for assignment validity, group capacity, duplicate prevention, and structural guarantees

4. **Mutation testing**
   - tests whether important solver assertions actually fail when logic changes
   - best for high-risk solver scoring/validation logic

5. **Server integration tests**
   - route wiring, job lifecycle, serialization, status/result endpoints

6. **WASM interop tests**
   - JS boundary, parsing, callback handling, exported wrapper behavior

### Frontend / webapp

1. **Utility / service / store tests**
   - fastest frontend confidence layer
   - best for persistence, conversions, derived metrics, Zustand actions

2. **Component tests**
   - behavior-focused UI coverage for critical screens/modals/headers/results views
   - best for rendering branches, button enablement, callbacks, modal flows

3. **Browser workflow tests**
   - real Playwright journeys through problem setup, solving, persistence, navigation, exports
   - best for "does the product still work in a browser?"

4. **Visual regression tests**
   - screenshot/layout drift detection
   - best for responsive/theme/modal/layout regressions
   - **not** the source of truth for behavior correctness

## What each layer is trusted to catch

| Layer | Trust it for | Do not rely on it alone for |
|---|---|---|
| Rust unit tests | local logic branches, validation, helpers | end-to-end solver realism |
| Data-driven solver tests | realistic solver behavior | broad invariant exploration |
| Property tests | structural guarantees across many inputs | exact UX/API behavior |
| Mutation tests | assertion quality for solver logic | route/UI/layout behavior |
| Server integration tests | API and async lifecycle wiring | deep solver scoring confidence |
| WASM tests | JS/WASM boundary correctness | browser UX/layout |
| Frontend logic tests | stores/services/utils conversions and persistence | full browser workflows |
| Component tests | critical UI interactions and rendering branches | full routing/browser integration |
| Playwright workflow tests | end-to-end product flows | exhaustive branch coverage |
| Visual regression | appearance/layout drift | functional correctness |

## Fast local confidence

Use this before small-to-medium changes when you want quick signal.

### Rust-focused

```bash
./scripts/test-rust-fast.sh
```

### Frontend logic / component-focused

```bash
cd webapp
npm run test:unit -- --run
npm run lint
```

### Browser workflow-focused

```bash
cd webapp
npm run test:e2e:workflows -- --project=chromium
```

## Full confidence

Use this before merging a substantial refactor or after touching multiple surfaces.

### Rust

```bash
./scripts/test-rust-fast.sh
./scripts/coverage-rust.sh
./scripts/mutation-solver-core.sh
```

### Frontend

```bash
cd webapp
npm run test:coverage:ci
npm run test:e2e:workflows -- --project=chromium
npm run test:e2e:visual:stable
npm run lint
```

## Refactor workflow by change type

### 1) Solver-core logic refactor

Run at minimum:

```bash
./scripts/test-rust-fast.sh
./scripts/coverage-rust.sh --summary-only
```

Before considering it done, also run:

```bash
./scripts/mutation-solver-core.sh
```

Why:
- unit/data-driven/property tests catch correctness and invariants
- coverage checks denominator regressions
- mutation testing checks whether assertions are actually strong enough

### 2) Server/API refactor

Run:

```bash
./scripts/test-rust-fast.sh
RUST_COVERAGE_FAIL_UNDER_LINES=78 RUST_COVERAGE_FAIL_UNDER_FUNCTIONS=87 ./scripts/coverage-rust.sh --summary-only
```

Pay special attention to:
- route syntax/wiring
- job creation/status/result flows
- error payloads and status codes

### 3) WASM wrapper / browser boundary refactor

Run:

```bash
./scripts/test-rust-fast.sh
wasm-pack test --node solver-wasm
# or browser mode when available:
# wasm-pack test --headless --chrome solver-wasm
```

Then run at least one browser workflow pass:

```bash
cd webapp
npm run test:e2e:workflows -- --project=chromium
```

### 4) Frontend logic refactor (stores/services/utils)

Run:

```bash
cd webapp
npm run test:coverage:ci
npm run lint
```

Trust this layer for:
- storage/import/export behavior
- conversion correctness
- derived metrics and CSV output
- Zustand state transitions

### 5) Frontend UI/component refactor

Run:

```bash
cd webapp
npm run test:unit -- --run
npm run test:e2e:workflows -- --project=chromium
npm run lint
```

If the work changes layout/theme/responsiveness/modal presentation, also run:

```bash
cd webapp
npm run test:e2e:visual:stable
```

### 6) Cross-cutting refactor (solver + wasm + app)

Run the full stack:

```bash
./scripts/test-rust-fast.sh
RUST_COVERAGE_FAIL_UNDER_LINES=78 RUST_COVERAGE_FAIL_UNDER_FUNCTIONS=87 ./scripts/coverage-rust.sh --summary-only
cd webapp && npm run test:coverage:ci
cd webapp && npm run test:e2e:workflows -- --project=chromium
```

If UI layout changed too, add:

```bash
cd webapp && npm run test:e2e:visual:stable
```

## How to think about failures

### Coverage fails, tests pass
That usually means one of two things:
- you introduced a new branch/path without covering it
- the enforced denominator now includes code your change affected

Action: add focused tests first; only revisit thresholds/denominator if the failure reveals a policy bug.

### Mutation testing fails
Treat this as a strong signal that the test suite executed the code but did not prove the behavior.

Action: add assertions around the semantic outcome, not just execution.

### Playwright workflow fails while unit/component tests pass
This usually means integration drift:
- routing
- persistence wiring
- async browser timing
- real browser DOM behavior
- solver/browser boundary issues

Action: trust the Playwright failure. It is often catching something the lower layers cannot see.

### Visual regression fails while workflow tests pass
This usually means the UI still works but no longer looks the same.

Action: inspect the diff carefully.
- if intentional, update the baseline
- if not intentional, fix the layout/theme regression

## Suggested pre-commit checklist

### For backend-heavy changes
- [ ] `./scripts/test-rust-fast.sh`
- [ ] relevant data-driven/property tests still make sense for the changed area
- [ ] coverage summary reviewed when changing important denominator files
- [ ] mutation test considered for solver logic changes

### For frontend-heavy changes
- [ ] `cd webapp && npm run test:coverage:ci`
- [ ] `cd webapp && npm run lint`
- [ ] component tests updated for new UI branches
- [ ] Playwright workflow run if user journeys changed
- [ ] visual regression run if layout/theme/responsive states changed

## Bottom line

When in doubt:
1. start with the fastest layer closest to the change
2. move outward toward workflow and visual layers as the blast radius grows
3. do not let a high coverage number talk you out of running the layer that matches the risk

That is the practical testing model for this repo.
