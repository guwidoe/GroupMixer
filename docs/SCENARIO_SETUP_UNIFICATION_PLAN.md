# Scenario Setup Unification Plan

## Goal

Radically simplify the scenario setup experience so the setup area becomes:

- **structurally consistent** for users
- **conceptually honest** about the domain
- **much easier to extend** in frontend code
- **faster to evolve** without adding another layer of bespoke section logic

The target product model is:

1. most setup pages are not unique screens; they are **typed collection editors**
2. those collection editors should share one **page shell**, one **view-model pattern**, one **card system**, and one **data-grid subsystem**
3. specialized visuals should plug into that framework through explicit extension points rather than one-off page architecture

This plan is specifically for the scenario-setup/editor surface under `webapp/src/components/ScenarioEditor/**`.

---

## Why this work is needed

The current setup experience is fragmented in both UX and code structure.

### Current UX problems

- setup pages that are conceptually similar do not behave similarly
- `Hard Constraints` and `Soft Constraints` add an extra page layer and local tabs that users must mentally unpack
- similar operations are exposed through different toolbars, cards, lists, and modal flows depending on section
- some pages have grid/list switches, others do not
- empty states, bulk actions, filters, and item summaries are inconsistent
- the sidebar hierarchy does not match the real mental model of the editing work

### Current architecture problems

- setup navigation is partially config-driven, but real page behavior is still scattered across many bespoke components
- `ScenarioSetupSectionRenderer.tsx` is forced to coordinate too many unlike page implementations
- constraints are treated as a separate mini-application with their own local family tabs and special panels
- collection editing boilerplate is repeated across people, groups, attributes, and constraints
- many section components mix domain shape, presentation, and mutation logic in page-specific ways
- constraints often rely on array indices as UI identity, which will fight sorting/filtering/grid reuse

Representative files showing the current fragmentation:

- `webapp/src/components/ScenarioEditor/navigation/scenarioSetupNav.ts`
- `webapp/src/components/ScenarioEditor/ScenarioSetupSectionRenderer.tsx`
- `webapp/src/components/ScenarioEditor/sections/people/PeopleDirectory.tsx`
- `webapp/src/components/ScenarioEditor/sections/GroupsSection.tsx`
- `webapp/src/components/ScenarioEditor/sections/AttributeDefinitionsSection.tsx`
- `webapp/src/components/constraints/HardConstraintsPanel.tsx`
- `webapp/src/components/constraints/SoftConstraintsPanel.tsx`
- `webapp/src/components/ScenarioEditor/ScenarioEditorConstraintModals.tsx`
- `webapp/src/components/ScenarioEditor/hooks/useScenarioEditorEntities.ts`
- `webapp/src/components/ScenarioEditor/hooks/useScenarioEditorConstraints.ts`

---

## Doctrine / guardrails

This plan follows `docs/reference/principles/AGENTIC_ENGINEERING_PRINCIPLES.md`.

Key implications:

- **architecture over legacy**: do not preserve current setup structure just because it exists
- **no silent fallback**: do not keep old and new setup models half-alive through hidden fallback code
- **explicit boundaries**: separate navigation model, section registry, collection rendering, mutation adapters, and domain-specific visuals
- **truthful UI**: represent hard constraints as requirements and soft constraints as preferences, rather than hiding them behind generic umbrella pages
- **incremental migration with explicit cleanup**: temporary bridges are acceptable only if they have a defined removal phase

---

## Product thesis

Most setup pages are instances of the same product pattern:

> define and manage a collection of typed records, with multiple useful representations for different editing tasks.

This applies to:

- Groups
- Attributes
- People
- Immovable People
- Must Stay Together
- Repeat Encounter
- Should Not Be Together
- Should Stay Together
- Attribute Balance
- Pair Meeting Count

These should converge on one shared collection-editing framework.

### Important exception

Not every page should be forced into the exact same abstraction.

The likely exceptions are:

- `Sessions`
- `Objectives`

They should still use the same setup chrome and visual language, but they are not primarily “manage a collection of records” pages in the same way.

---

## Target information architecture

Replace the current `Rules` area with first-class constraint-family sections.

### Target sidebar groups

#### Model
- Sessions
- Groups
- Attributes
- People

#### Requirements
- Immovable People
- Must Stay Together

#### Preferences
- Repeat Encounter
- Should Not Be Together
- Should Stay Together
- Attribute Balance
- Pair Meeting Count

#### Optimization
- Objectives

### Why this is better

- removes the extra `Hard Constraints` / `Soft Constraints` page layer
- removes local family tabs from those pages
- makes each constraint family directly addressable by route and nav item
- makes counts local and truthful
- makes the sidebar structure match how users think about setup work
- simplifies section rendering and future extension

---

## Target route model

The route should directly represent first-class setup sections.

### Target section ids

Model:
- `sessions`
- `groups`
- `attributes`
- `people`

Requirements:
- `immovable-people`
- `must-stay-together`

Preferences:
- `repeat-encounter`
- `should-not-be-together`
- `should-stay-together`
- `attribute-balance`
- `pair-meeting-count`

Optimization:
- `objectives`

### Migration note

The old `hard` and `soft` routes should be removed after migration.
If temporary redirects are needed during migration, they should be explicit and short-lived.
Do not retain old sections as a permanent hidden compatibility layer.

---

## Target architecture

The target architecture should have five layers.

### 1. Navigation and section registry layer

Owns:

- section ids and route segments
- sidebar/mobile grouping
- labels, icons, counts, descriptions
- whether a section is a collection page or a singleton/special page

Primary target files:

- `webapp/src/components/ScenarioEditor/navigation/scenarioSetupNav.ts`
- `webapp/src/components/ScenarioEditor/navigation/scenarioSetupNavTypes.ts`
- new: `webapp/src/components/ScenarioEditor/sectionRegistry.ts`

### 2. Collection section specification layer

Owns, for each collection page:

- how to select its items from scenario/editor state
- how to derive a UI-local row identity
- how to convert domain items to editor drafts
- how to validate and save drafts
- what actions, filters, summaries, card fields, and grid columns it exposes

Conceptually:

```ts
interface CollectionSectionSpec<TItem, TDraft> {
  id: ScenarioSetupSectionId;
  title: string;
  createDraft: () => TDraft;
  selectItems: (ctx: SetupSectionContext) => TItem[];
  getItemUiId: (item: TItem, index: number) => string;
  toDraft: (item: TItem) => TDraft;
  saveDraft: (draft: TDraft, ctx: SetupMutationContext) => void;
  deleteItem: (itemUiId: string, ctx: SetupMutationContext) => void;
  cardSpec: SetupCardSpec<TItem>;
  gridSpec: SetupGridSpec<TItem>;
  toolbarSpec?: SetupToolbarSpec<TItem>;
  summarySlot?: React.ComponentType<...>;
}
```

### 3. Shared collection page shell layer

Owns the consistent page structure for collection pages:

- title / subtitle / count
- primary and secondary actions
- cards/list display mode toggle
- search / filters / sort controls
- optional summary region
- empty state
- cards body or grid body

Primary target files to add:

- `webapp/src/components/ScenarioEditor/shared/SetupCollectionPage.tsx`
- `webapp/src/components/ScenarioEditor/shared/SetupSectionHeader.tsx`
- `webapp/src/components/ScenarioEditor/shared/SetupSectionToolbar.tsx`
- `webapp/src/components/ScenarioEditor/shared/SetupEmptyState.tsx`
- `webapp/src/components/ScenarioEditor/shared/SetupViewModeToggle.tsx`

### 4. Shared item rendering layer

Owns reusable visual primitives rather than page-specific card markup.

These should be composable parts, not one giant universal card component.

Recommended primitives:

- `SetupItemCard`
- `SetupItemActions`
- `SetupMetaRow`
- `SetupBadge`
- `SetupWeightBadge`
- `SetupSessionsBadgeList`
- `SetupPeopleChipList`
- `SetupKeyValueList`
- `SetupTagList`

This is where visual consistency should come from.

### 5. Shared data-grid subsystem

Owns list view functionality for collection pages.

Required capabilities over time:

- sorting
- filtering
- resizable columns
- hide/show columns
- row actions
- row selection
- inline editing hooks
- CSV/export/import bridging

Recommendation:

- use **TanStack Table** as the headless engine
- build a project-owned wrapper such as `ScenarioDataGrid`
- keep CSV/bulk-edit mode related but separate from the base table engine

Primary target files to add:

- `webapp/src/components/ScenarioEditor/shared/grid/ScenarioDataGrid.tsx`
- `webapp/src/components/ScenarioEditor/shared/grid/types.ts`
- `webapp/src/components/ScenarioEditor/shared/grid/columnHelpers.ts`
- optional follow-up:
  - `BulkTableEditor.tsx`
  - `CsvEditor.tsx`

---

## Target section model

### A. Collection sections

These should use the shared collection page shell:

- Groups
- Attributes
- People
- Immovable People
- Must Stay Together
- Repeat Encounter
- Should Not Be Together
- Should Stay Together
- Attribute Balance
- Pair Meeting Count

### B. Special sections

These can use the same chrome but remain special implementations:

- Sessions
- Objectives

They should still align with the new spacing, action language, and header structure.

---

## Data model and state strategy

## 1. Separate domain items from editor drafts

For each section, define:

- the persisted/domain item shape
- the editable draft shape
- conversion helpers
- validation helpers

This is especially important for constraints, where editing often requires normalized UI state.

### Example

```ts
interface SetupDraftAdapter<TItem, TDraft> {
  createDraft(): TDraft;
  toDraft(item: TItem): TDraft;
  validateDraft(draft: TDraft): ValidationResult;
  fromDraft(draft: TDraft): TItem;
}
```

This pattern should replace ad hoc page-level form shape handling where possible.

## 2. Give constraint rows stable UI-local identity

Constraint editing currently leans heavily on array indices.
That is a poor fit for:

- sorting
- filtering
- row selection
- grid virtualization
- inline editing
- bulk actions

Target approach:

- assign each constraint row a stable UI-local ID in editor state
- keep backend/domain serialization unchanged
- use local IDs for selection, editing, and row rendering

This can be done via a lightweight editor-side decoration layer.

## 3. Consolidate scenario mutations

Move repeated add/update/delete boilerplate into explicit reusable mutation helpers or reducer-style actions.

Targets:

- add/update/delete person
- add/update/delete group
- add/update/delete attribute
- add/update/delete constraint
- bulk mutations

This will reduce repeated scenario reconstruction logic in:

- `useScenarioEditorEntities.ts`
- `useScenarioEditorConstraints.ts`
- related bulk hooks

---

## Constraint-specific strategy

Constraints should stop behaving like a special mini-app with internal family tabs.

Instead, each family becomes a normal collection section with:

- its own registry entry
- its own draft adapter
- its own card composition
- its own grid columns
- optional special summaries

### Example mapping

- `immovable-people` → collection page over `Constraint[type=ImmovablePeople]`
- `must-stay-together` → collection page over `Constraint[type=MustStayTogether]`
- `repeat-encounter` → collection page over `Constraint[type=RepeatEncounter]`
- `should-not-be-together` → collection page over `Constraint[type=ShouldNotBeTogether]`
- `should-stay-together` → collection page over `Constraint[type=ShouldStayTogether]`
- `attribute-balance` → collection page over `Constraint[type=AttributeBalance]`
- `pair-meeting-count` → collection page over `Constraint[type=PairMeetingCount]`

### Specialized behavior that should remain supported

Some sections need extension points rather than special architecture.
Examples:

- `Attribute Balance` summary graphics/dashboard
- bulk convert flows between related constraint families
- people/session-aware filtering helpers

These should plug into the shared collection shell as explicit slots or section-specific actions.

---

## Recommended component boundaries

## Navigation / registry

- `navigation/scenarioSetupNav.ts`
- `navigation/scenarioSetupNavTypes.ts`
- `sectionRegistry.ts`
- `sectionSpecs/` for concrete section specs

## Shared layout primitives

- `shared/SetupCollectionPage.tsx`
- `shared/SetupSectionHeader.tsx`
- `shared/SetupSectionToolbar.tsx`
- `shared/SetupEmptyState.tsx`
- `shared/SetupItemCard.tsx`
- `shared/grid/ScenarioDataGrid.tsx`

## Domain adapters

- `adapters/peopleSection.ts`
- `adapters/groupsSection.ts`
- `adapters/attributesSection.ts`
- `adapters/constraints/*.ts`

## Mutations

- `mutations/peopleMutations.ts`
- `mutations/groupMutations.ts`
- `mutations/attributeMutations.ts`
- `mutations/constraintMutations.ts`

## Section renderers

Keep `ScenarioSetupSectionRenderer.tsx`, but reduce it to simple dispatch through the registry rather than bespoke page assembly.

---

## Migration phases

### Phase 1 — Reframe navigation and routes

Deliverables:

- remove `hard` and `soft` as first-class setup sections
- add first-class requirement/preference section ids
- regroup sidebar/mobile nav into `Model`, `Requirements`, `Preferences`, `Optimization`
- update section resolution and routing
- keep existing section implementations working where possible during transition

Acceptance criteria:

- every constraint family has a direct sidebar entry and route
- no nested hard/soft tab step is required for navigation
- counts are shown at the family level

### Phase 2 — Build shared collection page foundation

Deliverables:

- shared page shell
- shared section header and toolbar
- cards/list view toggle abstraction
- shared empty-state patterns
- view mode state strategy by section

Acceptance criteria:

- at least one model section and one constraint section use the new shell
- page-level action placement and visual rhythm are consistent

### Phase 3 — Build shared card primitives

Deliverables:

- shared card shell
- shared metadata primitives
- shared action affordances
- common display elements for people, sessions, weights, key/value data

Acceptance criteria:

- cards across migrated pages look obviously related
- repeated visual concepts are no longer hand-rendered differently in each section

### Phase 4 — Introduce the reusable data-grid subsystem

Deliverables:

- `ScenarioDataGrid` foundation
- column definition model
- sorting/filtering/resizing/visibility support
- row action hooks

Acceptance criteria:

- migrated pages can switch between cards and list using the same section data source
- list views do not require section-specific table implementations

### Phase 5 — Migrate collection sections

Suggested migration order:

1. Attributes
2. Groups
3. one constraint family with simple structure, likely `Repeat Encounter`
4. remaining constraint families
5. People last or in parallel depending on complexity

Why:

- attributes and groups are smaller and good for validating the shared shell
- one constraint family proves the constraint migration model
- people is richer and should migrate after the shared framework is stable

Acceptance criteria:

- all collection pages use the shared shell, shared card system, and shared grid foundation
- old hard/soft family panels are deleted

### Phase 6 — Consolidate editor state and cleanup

Deliverables:

- remove obsolete panel/tab components
- replace duplicated mutations with shared helpers
- add stable UI-local identity for constraints
- simplify `ScenarioSetupSectionRenderer.tsx`
- simplify controller hook boundaries where possible

Acceptance criteria:

- no permanent compatibility layer remains for old setup structure
- core editing logic is easier to trace than before

---

## Testing strategy

The new architecture should be protected at multiple layers.

### 1. Registry / navigation tests

Validate:

- group ordering
- direct routes for new sections
- section counts
- active-section resolution

### 2. Shared shell tests

Validate:

- cards/list switching
- empty states
- toolbar actions
- optional summary slot rendering

### 3. Card primitive tests

Validate:

- repeated field rendering consistency
- edit/delete action affordances
- session/people/weight rendering

### 4. Grid tests

Validate:

- sorting
- filtering
- column visibility
- resizing behavior where testable
- inline action invocation

### 5. Section adapter tests

Validate:

- draft conversion
- validation
- save/delete adapters
- constraint-family item selection

### 6. Integration tests

Validate:

- end-to-end section navigation
- add/edit/delete flows on migrated pages
- cards/list parity for the same data
- mobile nav + desktop sidebar behavior

---

## Risks and mitigations

### Risk 1: over-generic abstraction

If the shared system becomes too abstract, readability will suffer.

Mitigation:

- use a registry + adapters + composable primitives
- avoid one giant universal component with many conditionals

### Risk 2: trying to ship the full data grid in one jump

This could stall migration.

Mitigation:

- ship the grid as a foundation first
- stage advanced features like inline edit and CSV mode after the base list model is stable

### Risk 3: constraint migration complexity

Constraint flows are currently the messiest area.

Mitigation:

- migrate one simple family first
- introduce UI-local row identity before deep bulk/grid features depend on it

### Risk 4: prolonged hybrid state

Running both old and new setup architectures for too long will create confusion.

Mitigation:

- define explicit migration phases
- delete old hard/soft panels once new sections are live

---

## Explicit non-goals

This plan does **not** aim to:

- redesign solver/runtime flows
- change backend constraint schemas
- force `Sessions` and `Objectives` into a fake collection abstraction
- build spreadsheet-grade bulk editing in the first migration step

---

## Recommended initial execution order

If executed now, the highest-leverage order is:

1. nav/route restructuring
2. shared collection shell
3. shared card primitives
4. grid foundation
5. migrate attributes + groups
6. migrate constraint families
7. migrate people onto the shared foundation
8. cleanup + delete obsolete structures

---

## Success criteria

The work is successful when:

- the sidebar reflects the true setup domain without extra hard/soft tab indirection
- collection-style setup pages feel like one coherent product system
- cards/list views are consistent across pages
- specialized sections extend the system through slots rather than bespoke page architecture
- setup code becomes easier to follow than the current mixed panel/page/modal structure
- adding a new future setup collection page is mostly a matter of writing a new section spec and adapter rather than inventing another one-off screen
