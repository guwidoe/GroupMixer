# Frontend Multi-Solver UI Plan

## Goal

Refactor the webapp so users can:

1. explicitly select a solver family in the UI,
2. edit settings through a truthful configuration surface that separates:
   - universal settings,
   - family-shared settings,
   - solver-specific settings,
3. view runtime analytics through the same truth-preserving split,
4. keep all solver discovery and capability gating driven by the shared runtime / WASM contract rather than a hardcoded frontend registry.

This plan is specifically about the **frontend configuration and analytics experience** for multiple solvers, starting with:

- `solver1` / legacy simulated annealing
- `solver3`

## Why this work is needed

The current repo is only partially ready for this UX:

- the backend/WASM contract already exposes solver discovery and descriptors,
- the frontend transport/runtime layer does not yet expose those APIs,
- frontend settings rendering is still largely solver1-shaped,
- frontend runtime analytics are still largely solver1-shaped,
- several default/demo/result views still assume `SimulatedAnnealing` is the only meaningful solver choice.

Today the webapp can execute non-SA solver configurations through the shared contract path, but it **cannot yet present solver families truthfully as first-class selectable product concepts**.

## Doctrine / architectural guardrails

This plan follows `docs/reference/principles/AGENTIC_ENGINEERING_PRINCIPLES.md` and existing repo doctrine.

Important implications:

- **no silent fallback** from one solver family to another
- **explicit solver selection** or explicit failure
- **explicit capability gating** for recommendation, telemetry, warm start, etc.
- **UI labels must reflect real solver semantics**, not reuse solver1 wording just because field names happen to overlap
- **frontend transport/runtime boundaries must stay explicit**
- **do not turn the webapp into a competing contract registry**; shared discovery comes from runtime/WASM, while the webapp owns only presentation-specific metadata

## Scope

### In scope

- expose runtime solver discovery into the webapp
- add a solver selector UX
- define a frontend solver UI architecture for settings + analytics
- separate universal, family-shared, and solver-specific fields/metrics
- make solver settings editing and analytics rendering registry/spec-driven
- update defaults, demos, persistence-facing summaries, and result views to stop assuming solver1 only
- add tests covering transport, translation, UI rendering, and behavior gating

### Out of scope

- changing core solver behavior
- inventing a second public semantic contract besides `gm-contracts`
- claiming solver3 is rollout-ready or solver1-replacing
- remote runtime / job orchestration redesign
- deep redesign of backend progress/result schemas unless required by correctness or semantics

## Product and truthfulness constraints

### 1. Solver discovery must be contract-driven

The list of available solver families must come from the runtime/WASM contract (`list_solvers`, `get_solver_descriptor`).
The frontend may enrich this with presentation metadata, but must not hardcode the authoritative solver list.

### 2. Shared metrics are only shared when their semantics are shared

A field is only safe to render as a shared metric when its human meaning is actually shared.

Example:

- `temperature` is currently safe as a transport field,
- but solver1 may mean "simulated annealing temperature" while solver3 may mean "acceptance threshold" or similar.

Therefore:

- transport fields can remain shared,
- presentation labels/descriptions must remain solver-aware.

### 3. Solver3 must be presented truthfully

Backend notes currently describe solver3 as an internal experimental family rather than the production successor to solver1.
The webapp must preserve that truth:

- use descriptor notes from the runtime,
- do not imply solver3 is generally recommended by default,
- do not offer solver3-only affordances that claim readiness not supported by the backend.

## Target architecture

The frontend should treat multi-solver UX as three layers.

### Layer 1: Contract / runtime layer

Authoritative responsibilities:

- list solver families
- expose solver descriptors and capabilities
- execute solves
- return raw progress/results
- enforce capability-based failure for unsupported operations

Primary files:

- `webapp/src/services/runtime/runtime.ts`
- `webapp/src/services/runtime/localWasmRuntime.ts`
- `webapp/src/services/runtimeAdapters/contractTransport.ts`
- `webapp/src/services/solverWorker.ts`
- `webapp/src/workers/solverWorker.ts`
- `webapp/src/services/wasm/contracts.ts`

### Layer 2: Frontend translation / UI model layer

Frontend-owned responsibilities:

- translate contract-shaped settings into UI editing models
- classify fields/metrics into universal / family-shared / solver-specific
- derive truthful labels/help text for each solver family
- normalize legacy solver aliases for display

Primary files to add:

- `webapp/src/services/solverUi/types.ts`
- `webapp/src/services/solverUi/translate.ts`
- `webapp/src/services/solverUi/registry.ts`
- `webapp/src/services/solverUi/universal.ts`
- `webapp/src/services/solverUi/localSearch.ts`
- `webapp/src/services/solverUi/solver1.ts`
- `webapp/src/services/solverUi/solver3.ts`

### Layer 3: Component rendering layer

Responsibilities:

- render solver selector
- render field sections from UI specs
- render analytics sections from UI specs
- gate controls from runtime capabilities and solver descriptor capabilities

Primary files to update:

- `webapp/src/components/SolverPanel.tsx`
- `webapp/src/components/SolverPanel/SettingsPanel/SolverSettingsGrid.tsx`
- `webapp/src/components/SolverPanel/SettingsPanel/AutoConfigPanel.tsx`
- `webapp/src/components/SolverPanel/SolverAlgorithmInfo.tsx`
- `webapp/src/components/SolverPanel/SolverStatusCard.tsx`
- `webapp/src/components/SolverPanel/DetailedMetrics.tsx`
- `webapp/src/components/ResultsHistory/ResultCard.tsx`
- `webapp/src/components/ResultComparison.tsx`

## Canonical categorization model

### A. Universal

These should work for every solver family unless explicitly unsupported:

- solver family selection
- stop conditions (`max_iterations`, `time_limit_seconds`, `no_improvement_iterations`)
- deterministic seed
- allowed sessions
- debug logging toggles
- schedule snapshot telemetry toggles
- common status cards: iteration, elapsed time, current score, best score, stop reason, effective seed

### B. Family-shared

These are shared by a subset of solver families with common search behavior.
Initial family grouping:

- `local-search`: solver1 + solver3

Examples:

- move policy / allowed move families / weights
- move attempts / accepts / success rates
- penalty breakdowns
- average iteration time
- search efficiency
- local-search-specific explanatory copy

### C. Solver-specific

#### Solver1 / legacy simulated annealing

Settings:

- initial temperature
- final temperature
- cooling schedule
- reheats

Analytics / labels:

- temperature
- cooling progress
- reheats performed
- iterations since last reheat

#### Solver3

Initial settings:

- correctness lane enablement
- correctness lane sample cadence

Initial analytics:

- likely reuse some local-search transport fields,
- but labels/descriptions must be solver3-specific where semantics differ.

Examples:

- `temperature` may need a solver3-specific presentation label such as acceptance threshold / search threshold
- `cooling_progress` may need a solver3-specific label such as search schedule progress rather than cooling progress

## Data model plan

## 1. Keep the contract-shaped settings model at the boundary

`Scenario.settings` and runtime request/response payloads should remain close to the shared contract.
This preserves the explicit transport boundary.

## 2. Introduce a frontend editing model

Add a discriminated UI model for editing and display.
Conceptually:

```ts
interface CommonSolverSettingsDraft {
  stopConditions: {
    maxIterations?: number;
    timeLimitSeconds?: number;
    noImprovementIterations?: number;
  };
  seed?: number;
  allowedSessions?: number[];
  logging?: ...;
  telemetry?: ...;
  movePolicy?: ...;
}

type SolverDraft =
  | { family: 'solver1'; common: CommonSolverSettingsDraft; specific: Solver1Draft }
  | { family: 'solver3'; common: CommonSolverSettingsDraft; specific: Solver3Draft };
```

Translation seams:

- `fromContractSolverSettings(settings, descriptor) -> SolverDraft`
- `toContractSolverSettings(draft) -> SolverSettings`

These translators own:

- legacy SA alias normalization
- solver-family-specific config shape conversion
- defaulting of UI-only editor conveniences

## 3. Stop using a giant flattened solver-state UI model as the source of truth

Current `SolverState` is carrying many solver1-shaped live fields.
The new direction should be:

- keep lifecycle state in app/store,
- keep raw latest progress/result snapshots,
- derive display sections from solver UI specs.

Preferred shape:

```ts
interface SolverRunUiState {
  isRunning: boolean;
  isComplete: boolean;
  error?: string;
  latestProgress: RuntimeProgressUpdate | null;
  latestSolution: Solution | null;
}
```

This reduces schema churn when new solvers add or reinterpret telemetry.

## UI registry / spec plan

Create a spec-driven registry.
Conceptually:

```ts
interface SolverUiSpec {
  familyId: string;
  inherits: Array<'universal' | 'local-search'>;
  settingsSections: SettingSectionSpec[];
  liveMetricSections: MetricSectionSpec[];
  resultMetricSections: MetricSectionSpec[];
  summarizeSettings: (settings: SolverDraft) => SummaryRow[];
}
```

Supporting registries:

- universal sections
- local-search shared sections
- solver1 overlays
- solver3 overlays

The spec registry should **compose** shared pieces rather than duplicate them.

## Implementation phases

## Phase 1 — Expose solver discovery and capability plumbing end-to-end

### Outcome

The webapp runtime can list solvers and fetch solver descriptors through the same transport path used for solves.

### Files

- `webapp/src/services/runtimeAdapters/contractTransport.ts`
- `webapp/src/services/solverWorker/protocol.ts`
- `webapp/src/services/solverWorker.ts`
- `webapp/src/workers/solverWorker.ts`
- `webapp/src/services/wasm/contracts.ts`
- `webapp/src/services/runtime/runtime.ts`
- `webapp/src/services/runtime/localWasmRuntime.ts`

### Changes

- add `listSolvers()` and `getSolverDescriptor()` to transport/runtime surfaces
- route those calls through worker and direct-WASM paths as appropriate
- add tests for worker RPC handling and runtime exposure

### Acceptance checks

- frontend runtime can fetch the full solver catalog
- frontend can resolve a specific solver descriptor by ID or accepted alias
- solver capabilities are available for UI gating
- no duplicate hardcoded authoritative solver catalog remains in transport/runtime code

## Phase 2 — Introduce frontend solver UI types, translators, and registry

### Outcome

The frontend has an explicit UI architecture for solver settings and analytics.

### Files to add

- `webapp/src/services/solverUi/types.ts`
- `webapp/src/services/solverUi/translate.ts`
- `webapp/src/services/solverUi/registry.ts`
- `webapp/src/services/solverUi/universal.ts`
- `webapp/src/services/solverUi/localSearch.ts`
- `webapp/src/services/solverUi/solver1.ts`
- `webapp/src/services/solverUi/solver3.ts`

### Files to reduce / replace

- `webapp/src/services/solverCatalog.ts`

### Changes

- replace SA-only catalog assumptions with runtime-driven solver descriptors + UI registry overlays
- define common/specific field and metric specs
- add translators between contract settings and frontend editing models
- make `normalizeSolverFamilyId` and related helpers runtime-driven or translator-owned rather than hardcoded around solver1 only

### Acceptance checks

- a selected solver family resolves to a UI spec and a descriptor
- settings can round-trip through draft -> contract -> draft without semantic loss for solver1 and solver3
- runtime-driven catalog and frontend UI registry have clearly separated responsibilities

## Phase 3 — Add solver selector and spec-driven settings editor

### Outcome

Users can choose solver1 vs solver3 and edit the relevant settings through shared + specific sections.

### Files

- `webapp/src/components/SolverPanel.tsx`
- `webapp/src/components/SolverPanel/SettingsPanel/SolverSettingsGrid.tsx`
- `webapp/src/components/SolverPanel/SettingsPanel/AutoConfigPanel.tsx`
- supporting new components if needed:
  - `SolverSelector.tsx`
  - `CommonSettingsSection.tsx`
  - `SolverSpecificSettingsSection.tsx`

### Changes

- add solver-family selector UI
- preserve current scenario settings on load, but explicitly reset/translate family-specific params on solver switch
- render universal fields once
- render family-shared and solver-specific sections from the spec registry
- capability-gate Auto-set / recommended-settings UI
  - solver1: enabled
  - solver3: disabled or hidden until supported
- surface truthful explanatory copy when recommendations are unsupported

### Acceptance checks

- switching solver families updates settings UI immediately and correctly
- switching from solver1 to solver3 drops SA-only fields from the persisted contract payload
- switching from solver3 to solver1 creates valid SA defaults explicitly rather than through hidden fallback
- Auto-set is only offered when the selected solver supports recommendations

## Phase 4 — Refactor live runtime analytics into shared + specific sections

### Outcome

Runtime analytics are rendered truthfully per solver family.

### Files

- `webapp/src/components/SolverPanel/DetailedMetrics.tsx`
- `webapp/src/components/SolverPanel/SolverStatusCard.tsx`
- `webapp/src/components/SolverPanel/SolverAlgorithmInfo.tsx`
- `webapp/src/components/SolverPanel/utils/runSolverHelpers.ts`
- `webapp/src/types/index.ts`
- store slices if needed

### Changes

- stop flattening every progress field into a solver1-shaped UI schema where practical
- keep raw progress snapshots available to UI rendering
- render universal status cards from shared metric definitions
- render family-shared metrics from local-search definitions
- render solver-specific metrics/labels from overlays
- correct any misleading solver1-centric wording for solver3

### Acceptance checks

- solver1 still shows current SA metrics with correct labels
- solver3 shows runtime analytics without SA-specific mislabeling
- shared cards remain identical where semantics are truly shared
- no UI text implies unsupported solver internals or guarantees

## Phase 5 — Generalize defaults, demos, persistence-facing summaries, and result views

### Outcome

The rest of the webapp stops assuming solver1 is the only relevant solver.

### Files

- `webapp/src/store/slices/scenarioSlice.ts`
- `webapp/src/store/slices/demoDataSlice.ts`
- `webapp/src/services/demoDataService.ts`
- `webapp/src/components/ScenarioManager.tsx`
- `webapp/src/components/ScenarioEditor/helpers.ts`
- `webapp/src/components/ResultsHistory/ResultCard.tsx`
- `webapp/src/components/ResultComparison.tsx`

### Changes

- centralize default solver selection policy
- ensure new scenarios use an explicit default solver choice rather than scattered hardcoded strings
- ensure demo scenarios can preserve whichever solver they were authored for
- update result-history and comparison panels to use spec-driven summaries instead of direct SA field access

### Acceptance checks

- creating a new scenario uses one explicit default source of truth
- saved scenarios with solver1 continue loading correctly
- saved scenarios with solver3 round-trip correctly
- results/comparison views show solver-aware summaries without crashes or blank sections

## Phase 6 — Tests, docs, and rollout hardening

### Outcome

The multi-solver frontend path is protected by focused tests and documented truthfully.

### Tests to add/update

- transport and worker RPC tests for solver discovery
- translator round-trip tests for solver1 and solver3
- selector/settings rendering tests
- capability-gating tests for Auto-set
- analytics rendering tests proving solver-specific labels are applied
- result summary/comparison regression tests

### Docs to update

- relevant webapp/runtime docs if they exist
- optional follow-up docs for product copy / experiment flags if solver3 remains clearly experimental in the UI

### Acceptance checks

- the new multi-solver path has unit coverage at transport, translation, and UI layers
- old solver1 workflows still pass
- solver3 path is explicitly covered
- docs and UI copy remain aligned with backend solver notes and capabilities

## Open design decisions to settle early

### 1. What should the default UI solver be?

Recommendation:

- keep solver1 as the explicit default until a separate rollout decision says otherwise
- treat solver3 as selectable but not implicitly recommended

### 2. Should solver3 be marked experimental in the selector?

Recommendation:

- yes, unless product explicitly wants a neutral presentation and is willing to contradict current backend notes
- use descriptor notes + a lightweight badge rather than burying this in docs only

### 3. How much of `SolverState` should survive?

Recommendation:

- keep lifecycle booleans and generic run state,
- progressively stop using it as the flattened source of solver telemetry truth,
- derive analytics from `latestProgress` + spec registry.

### 4. Do we support solver2 in this framework now?

Recommendation:

- architect for N solvers,
- implement only solver1 + solver3 in the first pass,
- keep solver2 out of visible UI until there is an explicit product need.

## Risks and mitigations

### Risk: accidental semantic lying in analytics

Mitigation:

- require every displayed metric to come from a spec with explicit label/help text
- do not render transport field names directly as user-facing meaning

### Risk: hardcoded solver list drifts from runtime truth

Mitigation:

- runtime remains authoritative for available solvers and capabilities
- frontend registry only enriches known families for presentation
- unknown families degrade gracefully with a generic descriptor view rather than pretending full support

### Risk: persisted legacy scenarios break

Mitigation:

- keep compatibility parsing for `SimulatedAnnealing`
- cover load/edit/save round-trips with tests
- make translation seams explicit and narrow

### Risk: over-generalizing before the second solver UX exists

Mitigation:

- implement only the abstractions required for solver1 + solver3
- use composition (`universal`, `local-search`, solver-specific overlays) rather than a huge schema language

## Final acceptance bar

This work is complete when:

1. the runtime can truthfully list available solvers and capabilities,
2. the UI lets the user explicitly select solver1 or solver3,
3. the settings UI is organized into universal / family-shared / solver-specific sections,
4. the runtime analytics UI follows the same framework,
5. Auto-set and similar controls are capability-gated,
6. defaults, demos, saved scenarios, and result views no longer assume solver1-only,
7. solver3 is presented truthfully as an alternative family without overstating readiness.
