# Solver Workspace Architecture

## Purpose

The solver frontend is organized as a route-based workspace that mirrors the scenario setup architecture while preserving solver-specific behavior and runtime truthfulness.

Primary routes:

- `/app/solver/run`
- `/app/solver/solver1`
- `/app/solver/solver3`

`/app/solver` redirects to `/app/solver/run`.

---

## Layering

### Navigation/model layer

Owns section metadata and route resolution only.

Files:

- `navigation/solverWorkspaceNav.ts`
- `navigation/solverWorkspaceNavTypes.ts`

Responsibilities:

- section ids and route segments
- section grouping (`Run`, `Manual Tuning`)
- runtime-catalog-backed manual page visibility
- path helpers and canonical section resolution

### Layout layer

Owns workspace chrome only.

Shared files:

- `../workspace/layout/WorkspaceLayout.tsx`
- `../workspace/layout/WorkspaceSidebar.tsx`
- `../workspace/layout/WorkspaceMobileNav.tsx`

Responsibilities:

- desktop sidebar
- mobile drawer
- grouped navigation rendering
- content shell and scrolling frame

### Controller layer

Owns route/store orchestration and runtime-backed derived state.

Files:

- `useSolverWorkspaceController.ts`
- `useSolverWorkspaceRunController.ts`

Responsibilities:

- active section resolution
- section navigation
- runtime catalog loading
- route/family synchronization for manual solver pages
- run-state orchestration and solver page local UI state

### Section/page layer

Owns page composition only.

Files:

- `SolverWorkspace.tsx`
- `solverWorkspaceSectionRegistry.tsx`
- `sections/RunSolverSection.tsx`
- `sections/SolverFamilySection.tsx`

Responsibilities:

- default recommended workflow composition
- manual solver-family page composition
- selecting which shared blocks appear on which page

### Shared block layer

Owns reusable solver UI building blocks.

Files:

- `blocks/SolverRunControls.tsx`
- `blocks/SolverStatusDashboard.tsx`
- `blocks/SolverFamilyChooser.tsx`
- `blocks/RecommendedSettingsPanel.tsx`
- `blocks/WarmStartPanel.tsx`
- `blocks/AllowedSessionsPanel.tsx`
- `blocks/SolverSettingsSections.tsx`
- `blocks/DetailedMetricsPanel.tsx`
- `blocks/SolverFamilyInfoPanel.tsx`

Responsibilities:

- reusable run controls
- reusable status/diagnostics surfaces
- reusable setup/tuning surfaces
- reusable solver-family-specific info surfaces

---

## Behavioral rules

### Default page

`Run Solver` is the primary workflow for most users.

It includes:

- solver-family chooser
- recommended settings surface
- run controls
- status dashboard
- warm start
- session scope
- live diagnostics
- solver summary/info

It intentionally does **not** show the full manual settings grid.

### Manual solver-family pages

Manual pages are route-specific tuning surfaces:

- `/app/solver/solver1`
- `/app/solver/solver3`

Behavior:

- visiting the page switches the working scenario to that solver family
- the side menu is the primary way to switch between families
- the page includes the full manual settings grid
- diagnostics remain embedded on the same page

### Runtime truthfulness

The runtime catalog remains authoritative for available solver families.

The frontend may enrich runtime entries with presentation metadata, but it must not invent unsupported manual pages or silently fake capability support.

---

## Compatibility note

`../SolverPanel.tsx` remains as a thin compatibility wrapper around the shared solver workspace blocks. New route-based pages should compose blocks directly rather than adding new behavior back into the wrapper.
