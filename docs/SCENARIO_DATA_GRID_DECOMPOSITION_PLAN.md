# ScenarioDataGrid Decomposition Plan

## Problem

`webapp/src/components/ScenarioEditor/shared/grid/ScenarioDataGrid.tsx` has become a monolith.

At the time of writing it is roughly:

- ~2100 lines total
- ~900+ lines for the main `ScenarioDataGrid` component alone
- ~300+ lines for `ColumnFilterControl`
- ~100+ lines for `InlineEditorCell`

That means one file is currently responsible for:

- typed/structured column materialization
- primitive semantics
- CSV parsing/serialization
- filter normalization and query behavior
- table-model generation
- workspace draft/edit/csv state management
- column state, resize, and scroll synchronization
- filter popover UI
- inline editor UI
- table/header/body rendering
- pagination/footer rendering
- CSV preview/editor UI

This violates the architecture principle that components should be composed from smaller responsibilities rather than doing everything in one place.

---

## Refactor Goal

Refactor `ScenarioDataGrid` into a composed subsystem with:

- a thin orchestrator component
- small pure utility modules for model/codec behavior
- focused hooks for stateful behavior
- small presentational components for toolbar/table/filter/editor surfaces

### Target outcome

- `ScenarioDataGrid.tsx` becomes a thin assembly layer
- most extracted files should be comfortably under ~200 lines
- filter/editor implementations should be split by variant rather than merged into huge switch-style components
- behavior should remain unchanged
- existing tests should continue to pass

---

## Design Principles

### 1. Split by responsibility, not just by line count
Do not create arbitrary fragments just to satisfy size targets.

Preferred boundaries:
- pure model logic
- codecs/parsers
- hook/state logic
- table integration
- presentational UI
- variant-specific filter/editor components

### 2. Keep logic close to its real abstraction
Examples:
- CSV parsing belongs in a codec module, not inside the main component
- typed primitive semantics belong in a model/behavior module, not inline in JSX assembly
- column resize and scroll sync belong in hooks, not in the orchestrator body

### 3. The main `ScenarioDataGrid` file should orchestrate, not implement subsystems
The top-level component should mostly:
- receive props
- materialize columns
- invoke hooks
- render composed child components

### 4. Avoid “god hooks” replacing the god component
If a hook becomes another 400-line monster, the refactor failed.
Hooks should remain focused.

---

## Proposed Target Structure

```text
webapp/src/components/ScenarioEditor/shared/grid/
  ScenarioDataGrid.tsx
  types.ts

  model/
    columnMaterialization.ts
    primitiveBehavior.ts
    filterUtils.ts
    csvCodec.ts
    exportUtils.ts
    layoutUtils.ts

  hooks/
    useGridWorkspaceDraft.ts
    useGridColumnState.ts
    useGridScrollSync.ts
    useGridColumnResize.ts
    useScenarioDataTable.ts

  components/
    GridToolbar.tsx
    GridActiveFiltersBar.tsx
    GridTopScrollbar.tsx
    GridTable.tsx
    GridHeaderCell.tsx
    GridBody.tsx
    GridPaginationFooter.tsx
    InlineCsvEditor.tsx
    CsvPreviewDialog.tsx

    filters/
      ColumnFilterControl.tsx
      TextTokenFilterPanel.tsx
      SelectFilterPanel.tsx
      NumberRangeFilterPanel.tsx

    editors/
      InlineEditorCell.tsx
      InlineTextEditor.tsx
      InlineNumberEditor.tsx
      InlineSelectEditor.tsx
      InlineMultiSelectEditor.tsx
```

Not every one of these files must exist in the first pass if a thinner grouping is cleaner, but this is the intended decomposition shape.

---

## Concrete Extraction Boundaries

## A. Pure model / utility modules

### `model/columnMaterialization.ts`
Own:
- `isPrimitiveColumn`
- `isStructuredColumn`
- `getStructuredColumnKeys`
- `materializeStructuredColumn`
- `materializeColumns`
- materialized column type alias(es)

Reason:
- this is the typed/structured column normalization layer
- it is not UI and should be independently testable

### `model/primitiveBehavior.ts`
Own:
- `getPrimitiveOptions`
- `getArrayCsvSeparators`
- `normalizePrimitiveText`
- `resolvePrimitiveSortValue`
- `resolvePrimitiveSearchText`
- `resolvePrimitiveExportValue`
- `renderPrimitiveValue`
- `resolvePrimitiveFilter`
- `parsePrimitiveCsvValue`

Reason:
- this is the primitive semantics engine
- it is core behavior, not component wiring

### `model/filterUtils.ts`
Own:
- `normalizeSearchValue`
- `matchesQuery`
- `normalizeFilterText`
- `normalizeFilterListValue`
- `isFilterListValueActive`
- `isNumberRangeFilterActive`
- `getColumnFilterCount`
- `removeFilterListEntry`
- `resolveFilterValue`
- `resolveFilterOptions`
- `resolveFilterOptionLabel`

Reason:
- shared filter behavior currently supports both table logic and filter UI

### `model/csvCodec.ts`
Own:
- `splitCsvRecord`
- `parseCsvText`
- `escapeCsvValue`

Optional:
- shared CSV-line builders if they remain generic enough

Reason:
- CSV parsing/serialization is a clear subsystem

### `model/exportUtils.ts`
Own:
- `normalizeExportValue`
- `resolveExportValue`

Reason:
- export normalization should not live inline in the orchestrator

### `model/layoutUtils.ts`
Own:
- `estimateHeaderMinWidth`

Reason:
- small but clearly layout-specific

---

## B. Hooks

### `hooks/useGridWorkspaceDraft.ts`
Own:
- `draftRows`
- `csvDraftText`
- `csvErrors`
- CSV draft build/parse helpers
- `requestWorkspaceMode`
- `handleApplyDraftChanges`
- `handleAddDraftRow`
- derived flags:
  - `hasDraftEditing`
  - `isInlineCsvMode`
  - `effectiveEditMode`
  - `activeRows`

Reason:
- edit/csv workspace behavior is currently a large state machine hidden inside the main component

### `hooks/useGridColumnState.ts`
Own:
- `columnVisibility`
- `columnSizing`
- `columnFilters`
- reconciliation when materialized columns change

Reason:
- column UI state should be isolated from render logic

### `hooks/useGridScrollSync.ts`
Own:
- top/body/table refs
- scroll metrics
- scroll sync handlers
- resize observer for scrollbar visibility

Reason:
- browser interaction subsystem, independent from table model generation

### `hooks/useGridColumnResize.ts`
Own:
- resize state ref
- pointer move/up listeners
- resize-start handler

Reason:
- column-resize behavior should not clutter the main component body

### `hooks/useScenarioDataTable.ts`
Own:
- table column definitions for TanStack
- `globalFilterFn`
- `useReactTable(...)`
- derived table-facing data:
  - `csvColumns`
  - `activeColumnFilters`
  - export rows / paginated rows

Reason:
- TanStack integration should be a focused adapter layer

---

## C. Presentational components

### `components/GridToolbar.tsx`
Own:
- search input
- summary
- add/apply/discard/edit/csv/columns buttons
- any mode-based toolbar branching

Reason:
- currently a large, highly-conditional render block

### `components/GridActiveFiltersBar.tsx`
Own:
- flattened filter chips
- clear-filters button

### `components/GridTopScrollbar.tsx`
Own:
- mirrored horizontal scrollbar strip

### `components/InlineCsvEditor.tsx`
Own:
- inline CSV textarea
- helper text
- validation error block

### `components/CsvPreviewDialog.tsx`
Move the current dialog into its own file.

### `components/GridTable.tsx`
Own:
- `<table>` assembly only

Likely subcomponents:
- `GridHeaderCell.tsx`
- `GridBody.tsx`
- possibly `GridBodyRow.tsx` if needed

Reason:
- header cells already contain sort + filter + resize behavior and should not stay embedded inline

### `components/GridPaginationFooter.tsx`
Own:
- page summary
- page-size select
- next/previous controls

---

## D. Filter subcomponents

`ColumnFilterControl` is too large to remain one component.

### `components/filters/ColumnFilterControl.tsx`
Should become a thin shell responsible for:
- trigger button
- open/close behavior
- popover shell / positioning
- delegating to the correct panel

### `components/filters/TextTokenFilterPanel.tsx`
Own:
- tokenized text input
- Enter-to-commit behavior
- local text token interactions

### `components/filters/SelectFilterPanel.tsx`
Own:
- searchable multi-select UI
- option toggles

### `components/filters/NumberRangeFilterPanel.tsx`
Own:
- min/max inputs
- range commit/clear behavior

---

## E. Inline editor subcomponents

`InlineEditorCell` should become a dispatcher, not the whole editor system.

### `components/editors/InlineEditorCell.tsx`
Thin switch/dispatcher only.

### `components/editors/InlineTextEditor.tsx`
### `components/editors/InlineNumberEditor.tsx`
### `components/editors/InlineSelectEditor.tsx`
### `components/editors/InlineMultiSelectEditor.tsx`

Reason:
- each editor type has different interaction logic and should remain small

---

## Recommended Execution Order

## Phase 1 — Pure logic extraction
Lowest risk, highest clarity gain.

1. extract `columnMaterialization.ts`
2. extract `primitiveBehavior.ts`
3. extract `filterUtils.ts`
4. extract `csvCodec.ts`
5. extract `exportUtils.ts` / `layoutUtils.ts`

### Expected result
- the giant TSX file loses a large amount of non-UI code first
- behavior stays stable because logic moves without major control-flow changes

---

## Phase 2 — Break up the worst UI hot spots

1. extract `CsvPreviewDialog.tsx`
2. split `InlineEditorCell` into editor components
3. split `ColumnFilterControl` into shell + filter panel variants

### Expected result
- the worst massive components stop dominating the file
- filter/editor logic becomes readable in isolation

---

## Phase 3 — Extract state hooks

1. `useGridWorkspaceDraft.ts`
2. `useGridScrollSync.ts`
3. `useGridColumnResize.ts`
4. `useGridColumnState.ts`
5. `useScenarioDataTable.ts`

### Expected result
- the main orchestrator stops being a giant state machine

---

## Phase 4 — Extract render shell components

1. `GridToolbar.tsx`
2. `GridActiveFiltersBar.tsx`
3. `GridTopScrollbar.tsx`
4. `GridTable.tsx`
5. `GridPaginationFooter.tsx`

### Expected result
- `ScenarioDataGrid.tsx` becomes a thin, legible assembly layer

---

## Acceptance Criteria

This refactor is complete when:

- `ScenarioDataGrid.tsx` is reduced to a thin orchestrator component
- filter/editor logic is split into dedicated components rather than one giant switch surface
- model/codec logic no longer lives in the main TSX file
- most extracted files remain comfortably under ~200 lines
- existing typed-grid and structured-grid behavior is preserved
- existing tests continue to pass
- browser QA remains green

---

## Explicit Non-Goals

- do not change product behavior unless a small bug is discovered during refactor
- do not redesign the grid UX as part of this refactor
- do not weaken the typed-grid / structured-grid abstractions
- do not replace the monolith with one giant hook of similar size

---

## Validation Strategy

At minimum after each refactor step, run focused validation for the grid and its main consumers.

Recommended checks:

```bash
cd webapp && npx vitest run \
  src/components/ScenarioEditor/shared/grid/ScenarioDataGrid.test.tsx \
  src/components/ScenarioEditor/sections/ConstraintFamilySections.test.tsx

cd webapp && npx tsc --noEmit

cd webapp && npx playwright test e2e/tests/data-grid-workspace.spec.ts --project=chromium
```

Add other section tests if a given phase touches their rendering paths.

---

## Practical Goal for the Final Shape

After this refactor, `ScenarioDataGrid` should feel like a composed subsystem rather than a single monster file.

The intended mental model is:

- **model utilities** define what columns/filters/editors mean
- **hooks** manage grid state and browser interaction
- **components** render focused surfaces
- **ScenarioDataGrid.tsx** simply assembles them
