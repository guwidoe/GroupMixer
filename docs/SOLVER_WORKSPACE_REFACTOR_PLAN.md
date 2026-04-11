# Solver Workspace Refactor Plan

## Status

Proposed implementation plan for redesigning the solver frontend into a clean, shared workspace architecture aligned with the scenario setup experience.

## Goals

### Product goals

1. Make the solver area feel like the same product family as the scenario setup flow.
2. Provide one clear default workflow for most users.
3. Provide explicit manual tuning surfaces per solver family.
4. Keep live diagnostics on the same page where runs are configured and launched.
5. Leave room for future expansion:
   - more solver families
   - richer live diagnostics
   - historical run diagnostics / analysis later

### Engineering goals

1. Extract shared layout and chrome instead of duplicating scenario patterns.
2. Keep navigation model, layout, controller, and section/page components separate.
3. Keep runtime/catalog truthfulness explicit:
   - runtime is authoritative about which solvers exist
   - frontend only renders supported UI surfaces for available families
4. Avoid giant page components with many solver-specific conditionals.
5. Avoid hidden behavior and silent fallback.
6. Make solver and scenario workspaces structurally consistent without forcing them into the same domain model.

---

## Recommended information architecture

### Top-level app navigation

Keep the existing top-level app navigation:

- Setup
- Solver
- Results
- Result Details
- Manual Editor

### Solver workspace left navigation

Recommended grouped navigation:

#### Run
- `Run Solver`

#### Manual Tuning
- `Solver 1`
- `Solver 3`

### Explicit non-goals for this refactor

Do **not** add separate left-nav destinations yet for:

- diagnostics
- metrics
- benchmarking
- run history / solver analysis

Those concerns should remain embedded in the same pages used to configure and run the solver.

---

## UX model

### `Run Solver`

This is the default workflow for most users.

It should:

- frame itself as the recommended/default way to run the solver
- allow selecting or confirming a solver family
- emphasize recommended settings when supported
- expose only the highest-value controls by default
- still show full live run status, metrics, and diagnostics

This is **not** a stripped-down wizard. It is the main run workspace.

### `Solver 1` / `Solver 3`

These are manual tuning pages.

They should:

- keep the same page anatomy as `Run Solver`
- expose the full configuration surface for that solver family
- keep run/diagnostics on the same page
- explain solver-specific capabilities and behavior cleanly

These pages are more advanced, but the navigation should not label them as “expert” pages.

---

## Architecture

The solver workspace should mirror the scenario workspace layering.

### 1. Navigation/model layer

Owns metadata only:

- section ids
- route segments
- labels
- icons
- groups
- order
- visibility
- runtime-backed solver-family entries
- optional badges / descriptions / tooltip text

### 2. Layout layer

Owns shared desktop/mobile workspace chrome only:

- desktop sidebar
- mobile drawer
- group rendering
- item rendering
- collapse behavior
- content shell / scroll frame

### 3. Controller/orchestration layer

Owns:

- store access
- runtime catalog loading
- current scenario/settings access
- solver-run actions
- active section resolution
- view-level derived state
- page-level composition inputs

### 4. Section/page layer

Owns the actual page composition for:

- `Run Solver`
- solver-family manual tuning pages

### 5. Shared solver blocks

Own reusable blocks such as:

- status dashboard
- run controls
- solver family chooser
- recommended settings panel
- warm start panel
- allowed sessions panel
- settings sections renderer
- live visualization panel
- detailed metrics panel
- solver family info panel

---

## Shared workspace shell

### Principle

Do **not** build a solver-specific clone of the scenario sidebar.

Instead, extract a generic workspace shell and let both scenario and solver consume it.

### Why

This is the cleanest way to:

- eliminate duplicated sidebar/drawer logic
- keep scenario and solver visually consistent
- avoid baking scenario-specific assumptions into solver layout code

### Recommended new shared area

- `webapp/src/components/workspace/layout/WorkspaceLayout.tsx`
- `webapp/src/components/workspace/layout/WorkspaceSidebar.tsx`
- `webapp/src/components/workspace/layout/WorkspaceMobileNav.tsx`
- `webapp/src/components/workspace/layout/WorkspaceSidebarGroup.tsx`
- `webapp/src/components/workspace/layout/WorkspaceSidebarItem.tsx`
- `webapp/src/components/workspace/layout/types.ts`

Scenario setup should then migrate from its current scenario-specific layout chrome onto these shared primitives while keeping its own navigation registry.

---

## Solver workspace structure

### Recommended new directory

- `webapp/src/components/SolverWorkspace/SolverWorkspace.tsx`
- `webapp/src/components/SolverWorkspace/useSolverWorkspaceController.ts`
- `webapp/src/components/SolverWorkspace/solverWorkspaceSectionRegistry.tsx`
- `webapp/src/components/SolverWorkspace/navigation/solverWorkspaceNav.ts`
- `webapp/src/components/SolverWorkspace/navigation/solverWorkspaceNavTypes.ts`

### Section pages

- `webapp/src/components/SolverWorkspace/sections/RunSolverSection.tsx`
- `webapp/src/components/SolverWorkspace/sections/SolverFamilySection.tsx`

### Shared solver blocks

- `webapp/src/components/SolverWorkspace/blocks/SolverStatusDashboard.tsx`
- `webapp/src/components/SolverWorkspace/blocks/SolverRunControls.tsx`
- `webapp/src/components/SolverWorkspace/blocks/SolverFamilyChooser.tsx`
- `webapp/src/components/SolverWorkspace/blocks/RecommendedSettingsPanel.tsx`
- `webapp/src/components/SolverWorkspace/blocks/WarmStartPanel.tsx`
- `webapp/src/components/SolverWorkspace/blocks/AllowedSessionsPanel.tsx`
- `webapp/src/components/SolverWorkspace/blocks/SolverSettingsSections.tsx`
- `webapp/src/components/SolverWorkspace/blocks/LiveVisualizationPanel.tsx`
- `webapp/src/components/SolverWorkspace/blocks/DetailedMetricsPanel.tsx`
- `webapp/src/components/SolverWorkspace/blocks/SolverFamilyInfoPanel.tsx`

### Legacy compatibility

The current `webapp/src/components/SolverPanel.tsx` should not keep growing.

Short term options:

1. route directly to the new `SolverWorkspace`
2. or leave `SolverPanel.tsx` as a temporary wrapper that renders `SolverWorkspace`

Long term goal:

- remove the old monolithic page composition

---

## Routing plan

### Current route

- `/app/solver`

### Target routes

- `/app/solver` → redirect to `/app/solver/run`
- `/app/solver/run`
- `/app/solver/solver1`
- `/app/solver/solver3`

### Recommendation

Treat the top-level Solver nav as a link to the default workflow (`/app/solver/run`), not the last manual tuning page visited.

Rationale:

- Solver should open into the default user workflow
- manual solver-family pages are subordinate destinations

---

## Main app shell alignment

`MainApp.tsx` currently gives scenario routes special full-height workspace treatment.

This should be generalized to a shared workspace-route concept.

### Recommendation

Replace scenario-only shell logic with a generalized workspace route check:

- `/app/scenario/*`
- `/app/solver/*`

Also rename scenario-specific shell state accordingly, e.g.:

- `scenarioShellHeight` → `workspaceShellHeight`

This keeps solver and scenario visually aligned and avoids more special-case app-shell logic.

---

## Controller design

### Problem with current `SolverPanel.tsx`

It currently mixes:

- store reads
- local UI state
- runtime catalog loading
- solver switching
- run actions
- page composition
- rendering

This should be split.

### Recommended controller hook

Create `useSolverWorkspaceController.ts`.

It should own:

#### Store-backed state
- `scenario`
- `solverState`
- `runtimeSolverCatalog`
- `runtimeSolverCatalogStatus`
- `runtimeSolverCatalogError`
- `savedScenarios`
- `currentScenarioId`
- app actions related to run/start/stop/reset/save

#### Derived state
- solver catalog entries
- selected/current solver family
- selected solver descriptor
- selected solver UI spec
- active route section
- whether current page is default or manual tuning
- capability-derived availability / gating information

#### Local UI state
- metrics expansion
- live visualization expansion/enabled state
- selected live visualization plugin
- runtime input drafts
- settings input drafts
- cancel modal state
- warm start dropdown state
- allowed sessions draft state

#### Actions
- `navigateToSection(sectionId)`
- `selectSolverFamily(familyId)`
- `updateSolverSettings(partial)`
- `applyRecommendedSettings()`
- `startRun(mode)`
- `cancelRun()`
- `resetRun()`
- `saveBestSoFar()`
- `setWarmStartSelection(id)`
- `setAllowedSessions(...)`

This should become the single orchestration seam consumed by solver workspace section pages.

---

## Section composition

### Section ids

Recommended initial set:

- `run`
- `solver1`
- `solver3`

### Rendering model

Use a registry similar to scenario setup:

- `solverWorkspaceSectionRegistry.tsx`

This keeps `SolverWorkspace.tsx` small and declarative.

### `RunSolverSection`

Should be composed mostly from shared blocks and include:

1. page header
2. solver family chooser
3. minimal run setup
4. run controls + status dashboard
5. live visualization
6. detailed metrics
7. optional links to manual tuning pages

### `SolverFamilySection`

Use one parameterized section component rather than hand-writing separate pages for solver1 and solver3.

Input:

- `familyId`

Composition:

1. page header
2. shared run/status block
3. shared setup block
4. full settings sections renderer
5. live visualization
6. detailed metrics
7. solver family info panel

This avoids duplication while still allowing solver-specific sections through the existing solver UI spec system.

---

## Shared solver block responsibilities

### Run/status blocks

#### `SolverStatusDashboard`
Owns:
- run state summary
- key KPIs
- progress bars
- best/current score
- elapsed time

#### `SolverRunControls`
Owns:
- desired runtime input
- start / cancel / reset / save-best-so-far actions

### Setup/config blocks

#### `SolverFamilyChooser`
Owns:
- available family cards
- family selection behavior
- capability summary
- experimental badge
- concise notes

#### `RecommendedSettingsPanel`
Refactor from current `AutoConfigPanel`.

#### `WarmStartPanel`
Refactor from current `WarmStartSelector`.

#### `AllowedSessionsPanel`
Refactor from current `AllowedSessionsSelector`.

#### `SolverSettingsSections`
Refactor from current `SolverSettingsGrid`.

This should become the canonical full-manual settings renderer.

### Diagnostics/info blocks

#### `LiveVisualizationPanel`
Extract from current `SolverStatusCard`.

#### `DetailedMetricsPanel`
Refactor from current `DetailedMetrics`.

#### `SolverFamilyInfoPanel`
Refactor from current `SolverAlgorithmInfo`.

---

## Truthfulness and behavior rules

### 1. Runtime catalog remains authoritative

Available solver families come from the runtime.

The frontend may enrich them for presentation, but must not become the authoritative catalog.

### 2. UI registry remains presentation-only

`webapp/src/services/solverUi/*` should continue to own:

- settings sections
- metric sections
- summaries
- solver-specific copy/labels

It should not become the runtime truth source.

### 3. No silent fallback

If a solver family does not support:

- recommended settings
- warm start
- a specific metrics surface
- a full manual UI spec

then the UI must show that explicitly.

Do not silently:

- downgrade to another family
- reuse another family’s semantics
- imply support that does not exist

### 4. Source of truth for current selected solver family

Recommended behavior:

- the scenario’s current `settings.solver_type` remains the source of truth
- visiting a solver-family manual page explicitly switches the working scenario to that family

This keeps route, page, and run configuration aligned.

---

## Phased implementation plan

## Phase 0 — confirmed product decisions

Confirmed implementation decisions:

1. default page label
   - `Run Solver`
2. route/family synchronization
   - visiting `/app/solver/solver3` switches the working solver family to `solver3`
3. default page family chooser
   - yes, include it on `Run Solver`
4. manual page chooser behavior
   - no duplicate full chooser on manual pages; the side menu is the main navigation surface
5. unknown runtime families with no manual UI support
   - not applicable for the intended frontend contract; any solver family implemented in the frontend must ship with the necessary UI surface

## Phase 1 — extract shared workspace shell

Deliverables:

- generic workspace layout components created
- scenario setup migrated to shared shell primitives
- no scenario UX regression

## Phase 2 — introduce solver workspace routes, nav, and controller skeleton

Deliverables:

- `/app/solver/:section` routes added
- solver nav registry added
- `SolverWorkspace.tsx` and controller skeleton added
- `/app/solver` redirects to `/app/solver/run`

## Phase 3 — extract solver blocks from current monolith

Deliverables:

- status dashboard block
- run controls block
- family chooser block
- recommended settings block
- warm start block
- allowed sessions block
- settings sections block
- live visualization block
- metrics block
- family info block

Goal:

- preserve behavior while greatly improving structure

## Phase 4 — compose new solver pages

Deliverables:

- `RunSolverSection` implemented
- `SolverFamilySection` implemented
- `Solver 1` and `Solver 3` manual pages rendered through shared composition
- old “Solve with Custom Settings” reveal pattern removed

## Phase 5 — cleanup and consistency pass

Deliverables:

- old page-level duplication removed
- route wiring simplified
- naming aligned
- visual consistency pass completed

## Phase 6 — tests and docs

Deliverables:

- workspace layout tests
- scenario regression tests after layout extraction
- solver navigation tests
- controller behavior tests
- run page and manual page render tests
- capability gating tests
- diagnostics rendering tests
- architecture docs updated

---

## Testing strategy

### Shared workspace shell
- sidebar collapse / expand
- mobile drawer open / close
- group rendering
- item activation
- navigation callbacks

### Solver workspace
- `/app/solver` redirects to `/app/solver/run`
- runtime catalog-backed sections resolve correctly
- unsupported/unknown manual surfaces are not faked
- `Run Solver` renders default workflow blocks
- `Solver 1` renders full tuning sections
- `Solver 3` renders full tuning sections

### Behavior
- navigating to a solver-family page updates the working solver family as expected
- switching families resets family-specific params truthfully
- run actions continue to work
- diagnostics stay embedded in the active run page

---

## Risks and mitigations

### Risk: duplicating workspace shell logic
Mitigation:
- extract the shared shell before building the new solver workspace

### Risk: route/page/family state drifting apart
Mitigation:
- keep scenario solver settings as the source of truth
- make manual-family routes explicitly set that family

### Risk: accidental semantic lying across solvers
Mitigation:
- continue using solver UI specs for settings/metrics copy
- do not reuse solver1 wording for solver3 surfaces

### Risk: over-abstraction
Mitigation:
- share layout and reusable blocks
- keep nav registries and domain page composition separate

---

## Acceptance bar

This refactor is complete when:

1. Scenario and Solver both use the same shared workspace shell primitives.
2. Solver uses route-based workspace sections (`run`, `solver1`, `solver3`).
3. The default solver page is a clean recommended workflow rather than a monolithic stack with hidden advanced settings.
4. Manual solver-family pages reuse shared blocks while exposing full tuning per family.
5. Live diagnostics remain on the same page as run controls.
6. Runtime-driven solver truth and frontend presentation roles remain clearly separated.
7. The old `SolverPanel`-style monolithic composition is removed or reduced to a thin compatibility wrapper.
8. The refactor is covered by focused layout, routing, controller, and rendering tests.

---

## Confirmed decisions

1. The default page label is `Run Solver`.
2. Visiting a solver-family page immediately switches the working scenario to that solver family.
3. The default page shows compact solver-family chooser cards.
4. Manual pages do not duplicate the chooser; users navigate between families via the side menu.
5. Frontend-supported solver families are expected to ship with the necessary manual UI surface rather than degrading through partial manual support.
