# Refactor Plan (Goal: < 500 LOC per file, 1 component per file)

## Guiding goals
- Keep files under 500 LOC (soft cap; target 300–400 where possible).
- One React component per file (helpers/hooks/types in separate files).
- Reduce duplication by extracting shared hooks/components.
- Preserve behavior; ensure TypeScript builds and E2E tests continue to pass.

## Phase 1: Shared primitives + utilities
- Add shared hooks: `useOutsideClick`, `useDropdown`, `usePortalPosition`, `useLocalStorageState`, `useToggleSet`, `useDebouncedValue`.
- Add shared UI primitives: `MetricCard`, `SectionHeader`, `ExportDropdown`, `ConfigDiffBadge` (or variants).
- Extract `snapshotToProblem` to `webapp/src/utils/problemSnapshot.ts`.

## Phase 2: Results module split
- Split `ResultsView.tsx` into:
  - `ResultsView.tsx` (orchestrator)
  - `ResultsHeader.tsx`
  - `ResultsMetrics.tsx`
  - `ResultsSchedule.tsx`
  - `ResultsScheduleGrid.tsx`
  - `ResultsScheduleList.tsx`
  - `ResultsScheduleVisualization.tsx`
- Split `ResultsHistory.tsx` into:
  - `ResultsHistory.tsx` (orchestrator)
  - `ResultList.tsx`
  - `ResultListItem.tsx`
  - `ResultActions.tsx`
  - `ResultConfigDiff.tsx`

## Phase 3: Problem editor split
- Convert `ProblemEditor.tsx` into a foldered module with sections + hooks.
- Create `components/ProblemEditor/sections/*` for People/Groups/Sessions/Attributes/Objectives/Constraints.
- Extract form state hooks: `usePersonForm`, `useGroupForm`, `useAttributeForm`, `useConstraintForm`.
- Move demo dropdown & metrics to `DemoDropdown.tsx` and `useDemoCasesWithMetrics`.

## Phase 4: Manual editor split
- `ManualEditor.tsx` becomes orchestrator.
- Extract subcomponents: toolbar, session tabs, assignment board, storage board, metrics panel, compliance panel.
- Extract hooks: draft history, preview delta, evaluation, locked entities.

## Phase 5: Problem manager + landing
- Split `ProblemManager.tsx` into list, filters, dialogs, and action components.
- Split `LandingPage.tsx` into hero/features/demos/CTA/footer sections.

## Phase 6: Visualizations
- Split `ContactGraphVisualization.tsx` into data, layout, canvas, controls, legend.
- Split large animated3D components (instancing + GLTF) into helper components and hooks.

## Phase 7: Services + store
- Split `services/solverWorker.ts` into protocol, transport, and public API modules.
- Split `services/wasm.ts`, `services/problemStorage.ts` similarly.
- Refactor `store/slices/problemManagerSlice.ts` into actions/helpers modules.

## Phase 8: Types + lint guardrails
- Split `types/index.ts` by domain (problem/solver/results/constraints/ui) with barrel exports.
- Add ESLint warning for files > 500 LOC to prevent regression.

## Execution order (initial)
1. Phase 1 (shared hooks + snapshot util)
2. Phase 2 (ResultsView split first, then ResultsHistory)
3. Phase 3 (ProblemEditor)
