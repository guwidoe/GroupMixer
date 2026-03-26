# Webapp Runtime Migration Regression Matrix

This document is the risk map and test-planning artifact for the upcoming
webapp migration from legacy WASM exports to the contract-native browser
surface.

It exists because the highest-risk part of that migration is not the Rust-side
contract registry itself, but the browser runtime seam:

- React/UI state
- Zustand store state
- web worker protocol
- WASM module export names
- request/response payload shapes
- progress callbacks and live visualization
- manual evaluation flows after solving

This matrix is the planning basis for:

- `TODO-b25d5c75` — harden the browser/runtime safety net first
- `TODO-b0982713` — only then migrate the webapp to the contract-native WASM surface

## Current verdict

The current frontend/browser test stack is **useful but insufficient** for a
high-risk solver transport refactor.

### What is already strong enough

- Rust-side contract/schema/error/help parity guardrails
- targeted component crash regressions for some high-value screens
- selected solve-flow service tests that validate higher-level app logic
- basic Playwright workflow coverage for create/save/reload/solve/results flows

### What is still weak for this migration

- direct testing of the `webapp -> worker -> WASM` seam
- direct testing of worker request/response shape drift
- direct testing of WASM export-name drift
- progress-callback/runtime wiring tests
- warm-start runtime-path tests below mocked services
- manual editor/evaluation runtime tests
- stateful integration tests that mount real `/app` solver/results/history trees
  with populated store state

## Existing evidence reviewed

### Browser workflow tests already present

- `webapp/e2e/tests/workflows.spec.ts`
  - create/save/reload/load from problem manager
  - create/solve/export/navigate results

### Targeted component/state regressions already present

- `webapp/src/components/ProblemManager.test.tsx`
- `webapp/src/components/ResultsHistory.test.tsx`
- `webapp/src/components/ResultsView.test.tsx`
- `webapp/src/store/index.test.ts`

### Solver-flow service tests already present

- `webapp/src/services/solver/solveProblem.test.ts`
- `webapp/src/components/SolverPanel/utils/runSolver.test.ts`
- `webapp/src/services/rustBoundary.test.ts`
- `webapp/src/services/solverWorker/conversions.test.ts`
- `webapp/src/services/wasm/conversions.test.ts`

### Important gaps found during review

No strong direct test layer currently protects:

- `webapp/src/services/solverWorker.ts`
- `webapp/src/workers/solverWorker.ts`
- `webapp/src/services/wasm.ts`
- `webapp/src/services/wasm/module.ts`
- `webapp/src/components/ManualEditor/hooks/useManualEditorEvaluation.ts`
- live progress wiring as a runtime behavior rather than as mocked higher-level
  service behavior

`webapp/src/components/ManualEditor/dropPipeline.test.ts` exists, but today it
only protects pure assignment-staging helpers, not the evaluation-heavy runtime
path.

## Risk matrix

| Area | What can break | Current coverage | Confidence now | Required hardening |
| --- | --- | --- | --- | --- |
| Worker init / restart | worker never initializes, double-init bugs, cancel/restart leaves service dead | no strong direct tests for `solverWorker.ts` worker lifecycle | Low | direct worker/service protocol tests |
| WASM export names | renamed/missing exports break runtime at load/call time | module-shape expectations are not directly tested in app runtime layer | Low | adapter/runtime tests around module shape and expected export names |
| Solve request payload shape | request structure drifts, fields renamed, initial_schedule lost | `rustBoundary.test.ts` covers payload building, but not full worker/runtime path | Medium-Low | worker + adapter tests with real request transport |
| Solve success path | structured result shape drift, wrong conversion to `Solution` | conversion tests exist; browser runtime seam lightly covered | Medium-Low | direct runtime tests plus stateful UI integration |
| Progress solve path | progress events stop arriving, last-progress capture breaks, `best_schedule` lost | no strong direct progress-seam tests | Low | direct worker/progress harness + browser flow asserting live progress |
| Warm-start solve path | initial schedule not attached, wrong worker call path, fallback broken | higher-level mocked tests exist in `solveProblem.test.ts` / `runSolver.test.ts` | Medium-Low | direct runtime tests plus stateful UI integration |
| Recommend settings | desired runtime lost, response normalization breaks, fallback behavior regresses | higher-level mocked tests exist | Medium | runtime adapter tests + browser workflow coverage |
| Default solver configuration | blank/new problem defaults drift or stop loading | little to no direct runtime protection today | Low | dedicated adapter/runtime tests + UI state integration tests |
| Validation error path | structured public errors fail to reach UI sensibly | no meaningful direct runtime protection at browser seam | Low | adapter/runtime error normalization tests |
| Manual evaluation | schedule scoring path breaks after migration | little protection beyond pure helper tests | Low | focused evaluation-path tests |
| Drag/drop preview delta | preview calls fail, stale deltas, no-crash behavior regresses | helper-only coverage today | Low | direct tests for preview/evaluation hooks and pipelines |
| Save-best-so-far path | evaluation/snapshot save path regresses | no strong direct tests found | Low | focused tests around `saveBestSoFar` |
| Persisted history / restore | saved results cannot feed back into solving or restore flows | component tests + basic workflows exist | Medium-Low | more stateful integration and browser workflows |
| `/app` surfaces with state already loaded | real feature trees break when mounted with existing store state | some narrow stateful tests exist; app route tests stub major subtrees | Medium-Low | real integration-style mounts for solver/results/history |
| Browser-visible runtime failures | transport errors crash UI or show poor recovery | very limited explicit coverage | Low | error-path integration + browser workflow checks |

## Files/modules that need direct tests

These are the primary runtime-risk files for the migration and should gain
explicit test coverage before the browser-surface refactor starts.

### Worker / protocol seam

- `webapp/src/services/solverWorker.ts`
- `webapp/src/services/solverWorker/protocol.ts`
- `webapp/src/workers/solverWorker.ts`

### WASM client/runtime seam

- `webapp/src/services/wasm.ts`
- `webapp/src/services/wasm/module.ts`
- `webapp/src/types/wasm.d.ts`
- the future contract-native browser adapter layer

### Main solve flow / stateful integration

- `webapp/src/services/solver/solveProblem.ts`
- `webapp/src/components/SolverPanel/utils/runSolverHelpers.ts`
- `webapp/src/components/SolverPanel/utils/runSolver.ts`
- `webapp/src/components/SolverPanel/hooks/useSolverActions.ts`

### Manual evaluation / post-solve paths

- `webapp/src/components/ManualEditor/hooks/useManualEditorEvaluation.ts`
- `webapp/src/components/ManualEditor/dropPipeline.ts`
- `webapp/src/components/SolverPanel/utils/saveBestSoFar.ts`

### UI surfaces that should be mounted with real store state

- `webapp/src/components/SolverPanel.tsx`
- `webapp/src/components/ResultsView.tsx`
- `webapp/src/components/ResultsHistory.tsx`
- `webapp/src/MainApp.tsx`

## Required test layers by risk area

### 1. Worker/protocol harness tests

Needed for:
- worker init/failure/restart
- solve vs solve-with-progress request handling
- warm-start request transport
- recommend/default-config request handling
- RPC error / fatal error propagation
- cancellation behavior
- last-progress tracking

Planned by:
- `TODO-bde85128`

### 2. WASM adapter/runtime tests

Needed for:
- expected export names
- module-shape validation
- request/response conversion
- structured public-error normalization
- progress callback plumbing
- warm-start attachment
- recommend/default-config response normalization

Planned by:
- `TODO-da723b3c`

### 3. Stateful React integration tests

Needed for:
- mounting real `/app/solver`, `/app/results`, `/app/history`
- behavior with problem/solution/result history already in store
- warm-start selection from stored result data
- recommendation/default-config related UI state behavior
- graceful rendering when runtime calls fail

Planned by:
- `TODO-2b8d361d`

### 4. Manual evaluation regression tests

Needed for:
- current assignment evaluation
- hypothetical move evaluation
- preview delta behavior
- no-crash fallback when evaluation fails
- save-best-so-far evaluation path

Planned by:
- `TODO-04aa9e97`

### 5. Playwright workflow expansion

Needed for:
- solve with recommended settings
- warm-start solve from saved result history
- persisted reload then re-solve
- results/history restore feeding back into solving
- one observable live-progress workflow
- browser-visible runtime error path

Planned by:
- `TODO-07383a4c`

### 6. Workflow/documentation gate

Needed for:
- making this hardening work a required prerequisite rather than optional advice

Planned by:
- `TODO-85a669b1`

## New browser workflow scenarios required before migration

The following browser scenarios are currently missing or too weak and should be
added before the contract-native runtime refactor proceeds:

1. **Solve using recommended settings**
   - open existing problem
   - request recommended settings
   - solve successfully
   - verify results persist

2. **Warm-start solve from saved result**
   - solve once
   - save result
   - select saved result as warm start
   - solve again
   - verify run completes and persists

3. **Persisted reload then solve again**
   - create/save problem
   - reload page
   - reopen problem
   - solve from restored state

4. **Results/history restore back into active workspace**
   - open saved result/history
   - restore result/problem into workspace
   - verify solver/results path remains functional

5. **Manual edit follow-up after solve**
   - solve problem
   - perform a manual move if practical in E2E
   - verify evaluation/preview/update behavior

6. **Observable live progress**
   - run a solve where progress UI changes are visible
   - assert at least one progress-related state transition is rendered

7. **Runtime error surface**
   - inject or simulate a solver/runtime failure path
   - verify UI fails gracefully instead of crashing silently

## Go / no-go conclusion for the migration epic

`TODO-b0982713` should be treated as **blocked on hardening**, not merely
preceded by it informally.

The contract-native browser migration should not start until the repo has:

- a direct worker/protocol safety net
- a direct WASM adapter/runtime safety net
- stateful integration tests for real `/app` surfaces
- manual evaluation regression coverage
- stronger browser workflow coverage for solver journeys
- an explicit documented pre-migration safety gate

Without those layers, the risk of silently regressing real webapp behavior is
too high.

## Required pre-migration command gate

Before starting the browser-surface migration epic (`TODO-b0982713`), run:

```bash
cd webapp
npm run test:runtime-safety:unit
npx tsc --noEmit
npm run test:runtime-safety:e2e
# or:
# npm run test:runtime-safety
```

This command gate is the operationalized outcome of hardening epic
`TODO-b25d5c75`.
