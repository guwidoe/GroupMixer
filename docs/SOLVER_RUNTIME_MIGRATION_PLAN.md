# Solver Runtime Migration Plan

## Goal

Refactor the webapp so that **frontend/app code depends on a runtime-owned solver contract**, while preserving the current default execution model:

- client-side solve
- worker-based heavy execution
- direct WASM evaluation for hot paths
- WASM as the primary runtime

This plan is intentionally incremental. Each step has a bounded scope, explicit file targets, and concrete acceptance checks.

Important framing:

- this runtime boundary is an **app-internal execution seam** for the webapp
- it does **not** replace `gm-contracts` as the repo's public semantic source of truth
- the first migration target is a clean local-runtime boundary, not a final universal job-orchestration contract for every future runtime

## Guardrails

For every step:

- keep browser-side WASM solving working
- keep direct WASM evaluation working for Manual Editor and similar hot paths
- avoid solver semantic changes unless explicitly intended
- avoid store rewrites unless required for the boundary
- keep app-facing churn localized
- prefer additive files before invasive rewrites
- do not introduce protobuf into app-facing React/store boundaries
- if protobuf is ever introduced later, keep it outside the main migration plan
- keep runtime capabilities explicit rather than assuming all future runtimes expose identical behavior
- do not leave active solve state as an implicit `solverWorkerService` singleton concern
- do not hide recommendation fallback policy inside the runtime boundary
- do not accidentally turn the webapp runtime types into a second competing public contract registry
- do not teach app code that "runtime" universally means only `await solve()` + callback progress + global cancel

## Step 0 — Decompose `runSolver.ts` before the runtime migration

### Objective
Reduce the risk of the migration by breaking up the current orchestration hotspot first.

### Why first
`webapp/src/components/SolverPanel/utils/runSolver.ts` currently mixes:

- validation
- telemetry emission
- cancellation refs
- warm-start extraction
- solve execution
- post-solve state updates
- persistence
- save-and-resume behavior
- recursive resume logic
- nested error handling

Trying to force the runtime boundary through this file in its current shape is unnecessary risk.

### Files to update
- `webapp/src/components/SolverPanel/utils/runSolver.ts`
- `webapp/src/components/SolverPanel/utils/runSolverHelpers.ts`
- add helper modules beside them as needed

### Scope
Refactor for internal structure only. Split into smaller orchestration helpers such as:

- validation/preflight
- solve execution
- result persistence
- save-and-resume handling
- cancellation handling

### Do not do yet
- no new runtime boundary
- no behavior change
- no type redesign

### Acceptance checks
- `runSolver` behavior is unchanged
- existing `runSolver.test.ts` still passes
- save-and-resume still works
- warm-start resume still works
- cancellation still works
- file/function structure is meaningfully simpler

---

## Step 1 — Introduce the runtime boundary, types, and contract tests

### Objective
Create `SolverRuntime`, define runtime-owned types up front, and add shared contract tests. Keep all behavior backed by the current local WASM implementation.

### Files to add
- `webapp/src/services/runtime/types.ts`
- `webapp/src/services/runtime/runtime.ts`
- `webapp/src/services/runtime/localWasmRuntime.ts`
- `webapp/src/services/runtime/index.ts`
- `webapp/src/services/runtime/contractTests.ts`

### Files to update
- `webapp/src/services/solver/solveScenario.ts`
- `webapp/src/services/solverWorker.ts`
- `webapp/src/services/wasm.ts`

### Required design decisions in this step

#### 1. Runtime boundary scope is explicit
`SolverRuntime` in this migration is an app-facing execution boundary, not a new public semantic source of truth.

That means:
- it should wrap local execution semantics used by the webapp
- it should stay compatible with the repo-wide `gm-contracts` direction
- it should not redefine public solver meaning in a competing way

#### 2. Dual-path routing is explicit
`LocalWasmRuntime` must own the routing policy:

- solve / warm-start / validate / recommend / cancel → worker path
- evaluateSolution → direct WASM path

#### 3. Capabilities are explicit from the start
Define `getCapabilities()` in Step 1 and use runtime-owned capability metadata to describe things like:

- supportsWarmStart
- supportsEvaluation
- supportsStreamingProgress
- current execution model characteristics relevant to the app

This avoids hard-coding local-runtime assumptions into app code and keeps room for future runtimes with different behavior.

#### 4. Progress type strategy is explicit
For this migration, runtime progress should be a **near-alias** of the current `ProgressUpdate` shape.

That means:
- define the runtime-owned type now
- keep it very close to current Rust progress
- do not attempt a deep semantic remodel yet
- do not claim this full shape is the permanent universal progress model for every future runtime

#### 5. Cancel semantics are explicit
Define runtime-level cancellation now.

Recommended contract:
- active solve operations reject with a runtime-owned typed cancellation error
- callers stop string-matching on `"cancelled"`
- callers do not know about worker termination/reinit details
- current `cancel()` is acceptable as the local-runtime convenience shape for this migration, but it should not be treated as the final universal remote/job-scoped lifecycle model

#### 6. The initial solve API is a local-runtime convenience, not a permanent universal lifecycle contract
For this migration it is fine for the app-facing runtime to expose direct local-style solve calls such as:

- `solve()` / `solveWithProgress()`
- `solveWarmStart()`

But this should be understood as a local-first convenience surface.

If GroupMixer later adds server-authoritative or async job-oriented runtimes, a run-oriented lifecycle surface may be added deliberately rather than forced awkwardly into the local-first methods.

#### 7. Active local solve state must become explicit
Today several workflows depend on implicit singleton state owned by `solverWorkerService`, especially:

- cancel
- save-best-so-far
- warm-start resume
- access to the latest progress / best schedule snapshot

The migration should not preserve that dependency indirectly.

For this migration, choose one explicit runtime-owned shape and document it clearly:

- either a solve handle / active-run object, or
- a small capability-gated local active-run inspection surface owned by `LocalWasmRuntime`

Recommended migration choice:

- keep the simple app-facing `solve()` / `solveWithProgress()` convenience methods
- add runtime-owned active local solve coordination/state behind them
- make save-best-so-far and resume read that runtime-owned state rather than `solverWorkerService.getLastProgressUpdate()`

This is still local-first, but it prevents the runtime seam from becoming a thin wrapper around hidden worker singleton behavior.

#### 8. Recommendation fallback semantics are explicit
`recommendSettings()` should return already-normalized settings or fail with a runtime-owned error.

If the UI wants a fallback such as “keep current settings and continue”, that policy should remain an explicit caller decision.

Do not hide that fallback inside the runtime layer, because doing so would preserve silent behavior differences at the new boundary.

### Scope
- define runtime-owned operations and types
- define runtime-owned capabilities
- make `LocalWasmRuntime` wrap current services
- add shared contract test helpers for runtime implementations
- make the active local solve state model explicit in the runtime design
- change `solveScenario.ts` to call the runtime

### Do not do yet
- no component rewrites yet
- no deep progress remodel
- no backend runtime

### Acceptance checks
- `solveScenario()` still works end-to-end
- warm-start solve still works
- cancel still works
- recommended settings still work
- direct evaluation still works
- runtime types exist in Step 1, not later
- runtime capabilities exist in Step 1, not later
- shared runtime contract test suite exists
- the chosen active local solve state shape is explicit and documented in code/tests
- the runtime boundary is clearly app-internal rather than a competing public contract source
- `webapp` builds cleanly

---

## Step 2 — Move app-facing workflows and implementation details behind the runtime boundary

### Objective
Route app-facing code through the runtime and push worker/WASM-specific imports behind adapter edges in the same step.

### Files to update
- `webapp/src/components/SolverPanel/hooks/useSolverActions.ts`
- `webapp/src/components/SolverPanel/utils/runSolverHelpers.ts`
- `webapp/src/components/SolverPanel/utils/saveBestSoFar.ts`
- `webapp/src/components/ManualEditor/dropPipeline.ts`
- `webapp/src/components/ManualEditor/hooks/useManualEditorEvaluation.ts`
- `webapp/src/services/solver/solveScenario.ts`
- `webapp/src/services/rustBoundary.ts`
- `webapp/src/services/solverWorker.ts`
- `webapp/src/services/solverWorker/protocol.ts`
- `webapp/src/services/wasm.ts`
- `webapp/src/services/wasm/module.ts`
- `webapp/src/services/wasm/scenarioContract.ts`
- `webapp/src/workers/solverWorker.ts`

### Files to add if helpful
- `webapp/src/services/runtimeAdapters/wasm/workerTransport.ts`
- `webapp/src/services/runtimeAdapters/wasm/wasmAdapter.ts`
- `webapp/src/services/runtimeAdapters/wasm/conversions.ts`

### Scope
- app-facing files stop importing implementation services directly
- worker protocol types move behind runtime adapter internals
- WASM module contract types move behind runtime adapter internals
- `normalizeScenarioForWasm()` is treated as adapter-edge preparation logic for browser app model → solver contract input, even if it temporarily remains in WASM-adjacent files
- `normalizeRecommendedSolverSettings()` moves behind `recommendSettings()` so callers get already-normalized settings
- save-best-so-far and resume stop depending on direct reads of worker singleton progress state
- capability checks stay behind the runtime boundary rather than spreading through components

### Do not do yet
- no second runtime implementation
- no UI for runtime selection
- no store redesign

### Acceptance checks
- app-facing files no longer import `solverWorkerService` directly
- app-facing files no longer import `wasm/module` contract types directly
- `saveBestSoFar.ts` works through the runtime boundary while preserving dual-path behavior internally
- app-facing code no longer reads `solverWorkerService.getLastProgressUpdate()` directly
- Manual Editor evaluation still uses the fast local evaluation path through the runtime
- `recommendSettings()` returns already-normalized settings from the runtime boundary
- existing local solve path still works with no user-visible regression
- `webapp` tests/build pass

---

## Step 3 — Normalize runtime-level progress, result, and error usage without a large store redesign

### Objective
Make runtime-owned types the canonical app-facing types while staying pragmatic about the current progress shape.

### Files to update
- `webapp/src/services/runtime/types.ts`
- `webapp/src/services/runtime/localWasmRuntime.ts`
- `webapp/src/services/solver/solveScenario.ts`
- `webapp/src/store/slices/solverSlice.ts`
- `webapp/src/store/types.ts`
- `webapp/src/components/SolverPanel/utils/runSolverHelpers.ts`
- directly affected tests

### Explicit strategy
Use the pragmatic option:

- runtime progress type is a near-alias of current `ProgressUpdate`
- store continues consuming essentially the same shape for this migration
- decoupling is achieved by ownership and import boundaries, not by inventing a brand-new progress model prematurely
- this progress shape should be treated as current local-runtime telemetry, not as proof that every future runtime must expose identical diagnostics

### Scope
- runtime layer owns the exported progress/result/error types
- store and helpers consume runtime-owned types instead of implementation-owned ones
- `mapProgressToSolverState()` is updated only as needed for type ownership, not for a conceptual redesign

### Do not do yet
- no deep progress/domain remodel
- no detailed metrics redesign

### Acceptance checks
- UI-facing code no longer imports progress types from implementation-specific modules
- solver metrics still render as before
- store updates still behave correctly
- cancellation handling uses typed runtime cancellation semantics
- runtime errors are normalized in one place
- app-facing code does not assume every future runtime must expose the full current telemetry shape
- `webapp` builds and targeted tests pass

---

## Step 4 — Centralize runtime access but keep it simple

### Objective
Provide one central runtime access point while keeping the default runtime local and avoiding unnecessary selector machinery.

### Files to update
- `webapp/src/services/runtime/index.ts`
- `webapp/src/services/runtime/runtime.ts`
- `webapp/src/services/runtime/localWasmRuntime.ts`

### Scope
- introduce a simple `getRuntime(): SolverRuntime`
- keep `LocalWasmRuntime` as the default and production path
- do not overbuild a selector/registry pattern yet
- keep capability lookup centralized with runtime access

### Do not do yet
- no second runtime implementation required
- no runtime selector UI

### Acceptance checks
- application still defaults to local WASM runtime
- runtime access is centralized
- adding a second runtime later is additive
- no UX regression in local solve path

---

## Step 5 — Optional additive runtime expansion

### Objective
Only after Steps 0–4 are complete, add optional new runtimes as adapters.

### Possible files to add
- `webapp/src/services/runtime/httpBackendRuntime.ts`
- `webapp/src/services/runtimeAdapters/http/solverApi.ts`

### Scope
- prove the architecture by adding a second runtime adapter if actually needed
- keep this optional and additive
- do not let it dictate app architecture
- if the second runtime is async or server-authoritative, add any needed run-oriented lifecycle surface deliberately rather than faking strict parity with local-only convenience methods

### Acceptance checks
- second runtime can be introduced without changing solver panel/manual editor/store architecture
- local WASM remains supported and default
- no runtime-specific logic leaks back into components
- capability differences are surfaced explicitly rather than hidden behind fake parity
- active local solve inspection is either supported explicitly or omitted explicitly; it is not recovered through leaked worker singleton state

---

## Recommended sequencing by PR

### PR 0
Step 0 only.

### PR 1
Step 1 only.

### PR 2
Step 2 only.

### PR 3
Step 3 only.

### PR 4
Step 4 only.

### PR 5+
Optional Step 5.

## Runtime contract test requirements

Split runtime contract tests into:

### Core required suite
- initialization
- capabilities
- validation
- recommended settings normalization
- solve success
- error normalization

### Capability-specific suites
- warm-start solve success
- cancellation semantics
- evaluation semantics
- streaming progress semantics

Any future runtime implementation should be expected to satisfy the core suite plus the capability-specific suites for the capabilities it claims.

## Recommended verification commands

Use the repo’s normal frontend verification path for each step.

Suggested checks after each PR:

```bash
cd webapp && npm run lint
cd webapp && npm run test
cd webapp && npm run build
```

If only targeted tests are needed during iteration, still finish with a clean build before handoff.

## Review checklist

Before moving to the next step, confirm:

- local solve still works
- cancel still works
- warm start still works
- recommended settings still work
- manual evaluation still works
- save-best-so-far and resume do not depend on leaked worker singleton state
- app-facing code got simpler, not more abstract for its own sake
- new boundaries are explicit and easy to explain
- direct evaluation hot paths have not regressed in UX
- the app does not assume callback progress or global cancel are the only runtime lifecycle shapes that can ever exist

## Future considerations (not part of the migration plan)

### Server-authoritative or async runtimes
If GroupMixer later adds a server-authoritative runtime with async solve jobs, run IDs, or inspect surfaces, treat that as a deliberate follow-on architecture step.

That future work should:
- introduce run-oriented lifecycle types only when actually needed
- make inspection and cancellation run-scoped
- extend the capability model rather than pretending every runtime behaves like the current local worker flow

The local active-run coordination introduced in this migration should then either:

- evolve into explicit run handles, or
- remain a local-only convenience behind capability-gated methods

Do not stretch the local active-run shape until it implicitly becomes a fake universal remote lifecycle.

### Cross-language solver protocol
If GroupMixer later experiments with solver implementations in other languages, define a separate cross-language solver protocol. Protobuf is a reasonable candidate there.

That future work should stay separate from the current frontend/runtime migration.

## Success definition

This migration is successful when:

1. the webapp remains WASM-first in execution
2. app-facing code no longer depends on WASM/worker implementation details
3. dual-path local execution is hidden inside `LocalWasmRuntime`
4. `normalizeScenarioForWasm()` is clearly adapter-edge logic for browser app model → solver contract preparation
5. `recommendSettings()` returns normalized settings from the runtime boundary
6. cancellation uses runtime-owned semantics rather than string matching
7. save-best-so-far and resume use runtime-owned active solve state rather than leaked worker singleton state
8. adding a second runtime becomes additive rather than invasive
9. runtime capabilities are explicit rather than implicit
10. the codebase stays controlled throughout the refactor
