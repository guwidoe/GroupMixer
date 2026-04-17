# MustStayApart GUI Implementation Plan

## Goal

Expose `Constraint::MustStayApart` throughout the webapp in a way that is fully coherent with the existing constraint-editing UX.

This means:
- `MustStayApart` appears as a first-class **hard constraint** in the Scenario Editor
- it uses the same interaction model and information architecture as existing hard/soft people constraints
- it reuses shared UI primitives instead of cloning near-identical modal logic
- the existing manual editor and compliance surfaces treat it as a real hard constraint
- infeasibility detection remains backend/solver-driven; the GUI should not add speculative preflight heuristics

## Resolved product decisions

These decisions are now fixed for implementation:

1. **Use the cleaner architecture when in doubt**
   - Do not add a one-off `MustStayApartModal` clone if a shared modal abstraction can cleanly support both hard people-relation constraints.

2. **MustStayApart is a hard requirement family**
   - It belongs beside `MustStayTogether`, not beside soft preference families.
   - Naming should follow the existing display copy: **Keep Apart**.

3. **Add symmetric hard→soft conversion affordance**
   - `MustStayTogether` → `ShouldStayTogether`
   - `MustStayApart` → `ShouldNotBeTogether`

4. **Do not add a GUI-side infeasibility hint**
   - The current product model is to let solver/backend validation produce the explicit user-facing error.
   - No speculative “too many people for too few groups” warning should be added in this pass.

5. **Manual editor coherence is in scope**
   - Manual hard-violation counting should include `MustStayApart`.
   - Drag/drop feasibility should reject hard-apart violations in strict mode just like other hard constraints are respected there.

## Current state summary

### Already present
The browser contract and downstream result/compliance surfaces already recognize `MustStayApart`:
- `webapp/src/types/index.ts`
- `webapp/src/utils/constraintDisplay.ts`
- `webapp/src/services/wasm/scenarioContract.ts`
- `webapp/src/services/evaluator.ts`
- `webapp/src/components/ConstraintComplianceCards/useCompliance.ts`
- `webapp/src/components/ChangeReportModal.tsx`

### Missing / inconsistent today
The main editing surfaces do not yet expose `MustStayApart` coherently:
- Scenario Editor navigation has no `must-stay-apart` section
- hard constraint family typing excludes `MustStayApart`
- no hard constraint section copy exists for `MustStayApart`
- no shared modal path exists for hard apart/together people constraints
- Scenario Editor actions/state/modal wiring only knows about `MustStayTogether`
- manual editor hard-violation counting omits `MustStayApart`
- manual editor drag/drop feasibility does not yet block `MustStayApart` conflicts

## Implementation shape

## Workstream 1 — Introduce a shared hard people-relation modal

### Intent
Replace the current one-off `MustStayTogetherModal` implementation with a reusable shared modal for hard people-relation constraints.

### Why
`MustStayTogether` and `MustStayApart` share the same core structure:
- choose 2+ people
- choose optional session scope
- no penalty weight
- save a hard relationship constraint

A shared modal keeps the codebase cleaner and prevents drift between the two hard relation editors.

### Expected structure
Create a shared component along the lines of:
- `webapp/src/components/modals/HardPeopleConstraintModal.tsx`

That component should accept explicit configuration for:
- `type`: `'MustStayTogether' | 'MustStayApart'`
- add/edit label resolution
- title/body copy
- validation message copy
- save adapter that emits the exact corresponding `Constraint`

Then `MustStayTogetherModal.tsx` can either:
- become a thin wrapper over the shared modal, or
- be removed entirely if call sites can target the shared modal directly.

### Acceptance criteria
- no duplicated add/edit modal logic between hard together and hard apart
- the resulting modal UX for `MustStayApart` is visually and behaviorally parallel to `MustStayTogether`

## Workstream 2 — Add MustStayApart as a first-class hard Scenario Editor family

### Intent
Expose `MustStayApart` through the same section-based setup architecture used by other constraint families.

### Files likely to change
- `webapp/src/components/ScenarioEditor/navigation/scenarioSetupNavTypes.ts`
- `webapp/src/components/ScenarioEditor/navigation/scenarioSetupNav.ts`
- `webapp/src/components/ScenarioEditor/sectionRegistry.tsx`
- `webapp/src/components/ScenarioEditor/sections/constraintFamilies/types.ts`
- `webapp/src/components/ScenarioEditor/sections/constraintFamilies/copy.tsx`
- `webapp/src/components/ScenarioEditor/sections/constraintFamilies/HardConstraintFamilySection.tsx`

### Required changes
1. Add `must-stay-apart` to section IDs and navigation.
2. Add a requirements-group nav entry using the existing display label/tooltip for `MustStayApart`.
3. Extend `HardConstraintFamily` to include `MustStayApart`.
4. Extend people-constraint shared typing to include `MustStayApart`.
5. Add section copy:
   - title: `Keep Apart`
   - description explaining that selected people must be in different groups and violations make the solution invalid
6. Register a `HardConstraintFamilySection family="MustStayApart"` route.
7. Extend `HardConstraintFamilySection` list/cards/grid handling so `MustStayApart` behaves like `MustStayTogether` where appropriate:
   - people column
   - optional session-scope column
   - list/card rendering via existing people-constraint content helpers
   - search/filter behavior by person/session

### Important semantics
- `MustStayApart` should be modeled like `MustStayTogether` in editing surfaces, except that the meaning is separation instead of co-location.
- No penalty weight column or field.
- Grid row validation must require at least 2 people.

## Workstream 3 — Wire Scenario Editor actions/state/modal routing for MustStayApart

### Intent
Make add/edit flows work end-to-end from the section CTA through modal save/cancel and state updates.

### Files likely to change
- `webapp/src/components/ScenarioEditor/scenarioEditorActions.ts`
- `webapp/src/components/ScenarioEditor/hooks/useScenarioEditorConstraints.ts`
- `webapp/src/components/ScenarioEditor/ScenarioEditor.tsx`
- `webapp/src/components/ScenarioEditor/ScenarioEditorConstraintModals.tsx`
- `webapp/src/components/ScenarioEditor/types.ts`
- possibly `webapp/src/components/ScenarioEditor/ConstraintFormModal.tsx` if the legacy fallback surface should remain complete

### Required changes
1. Add modal open/close state for `MustStayApart`.
2. Add action routing for:
   - `handleHardConstraintAdd('MustStayApart')`
   - `handleHardConstraintEdit` when constraint type is `MustStayApart`
3. Add indexed modal wiring for editing existing `MustStayApart` constraints.
4. Ensure add/update handlers can construct `MustStayApart` objects with:
   - `type: 'MustStayApart'`
   - `people`
   - optional `sessions`
5. If the generic/legacy `ConstraintFormModal` is still intended as a truthful fallback surface, add `MustStayApart` there too so the fallback surface is not silently incomplete.

### Acceptance criteria
- user can add, edit, and delete `MustStayApart` constraints from the Scenario Editor
- constraints persist through the same state/update path as other families
- no hidden fallback or type-specific side channel is introduced

## Workstream 4 — Add symmetric bulk conversion in hard family actions

### Intent
Keep conversion affordances symmetric and coherent with existing hard/soft pairs.

### Files likely to change
- `webapp/src/components/ScenarioEditor/sections/constraintFamilies/HardConstraintFamilySection.tsx`

### Required changes
1. Preserve existing `MustStayTogether` → `ShouldStayTogether` conversion.
2. Add `MustStayApart` → `ShouldNotBeTogether` conversion using the same bulk-selection workflow.
3. Reuse the existing weight-entry pattern for conversion to the soft constraint.
4. Ensure selection-mode copy reflects the active family accurately.

### Acceptance criteria
- `MustStayApart` cards support bulk selection in card mode
- Actions menu exposes conversion to `Prefer Apart`
- conversion rewrites selected constraints to `ShouldNotBeTogether` with preserved people/session scope and chosen weight

## Workstream 5 — Manual editor coherence for hard-apart semantics

### Intent
Ensure manual editing surfaces treat `MustStayApart` as a real hard constraint instead of only the setup/editor flow knowing about it.

### Files likely to change
- `webapp/src/components/ManualEditor/ManualEditorContent.tsx`
- `webapp/src/components/ManualEditor/moveUtils.ts`

### Required changes
1. Include `MustStayApart` in the manual editor’s hard-violation aggregate/count.
2. In strict drag/drop feasibility, reject moves that would place a person into a group containing another member of an active `MustStayApart` constraint for that session.
3. Match existing scope semantics:
   - if sessions are omitted, constraint applies to all sessions
   - only session-active constraints matter for the current drag/drop session

### Acceptance criteria
- manual editor hard-violation summary rises/falls correctly for hard-apart violations
- strict mode drag/drop prevents creating obvious `MustStayApart` conflicts
- implementation remains explicit and local; no silent relaxations

## Workstream 6 — Regression coverage

### Intent
Add tests wherever the current architecture expects them so the new family is protected across UI state, rendering, and manual-edit behavior.

### Likely test files
- `webapp/src/components/ScenarioEditor/sections/ConstraintFamilySections.test.tsx`
- `webapp/src/components/ScenarioEditor/scenarioEditorActions.test.ts`
- `webapp/src/components/ScenarioEditor/ScenarioEditor.test.tsx`
- new modal-focused test for shared hard people modal, if appropriate
- `webapp/src/components/ConstraintComplianceCards/useCompliance.parity.test.tsx` if needed
- manual editor tests around hard violations / `canDrop`, if present or added

### Required coverage
1. `MustStayApart` renders as a hard family section through the shared collection architecture.
2. Add/edit actions open the right shared modal path.
3. Grid/list/cards support the family correctly.
4. Hard→soft conversion works for `MustStayApart`.
5. Manual editor hard-violation counting includes `MustStayApart`.
6. Strict drag/drop rejects a move that would violate `MustStayApart`.

## Non-goals

This pass should **not** include:
- frontend-side infeasibility heuristics or “too many people for too few groups” warnings
- any semantic weakening of `MustStayApart`
- any silent downgrade from hard-apart to soft-apart
- unrelated redesign of constraint information architecture

## Recommended implementation order

1. **Shared modal extraction**
   - introduce the clean modal abstraction first
2. **Scenario Editor family plumbing**
   - nav/types/copy/section registry
3. **Action + modal state wiring**
   - add/edit flows end-to-end
4. **Hard family conversion affordance**
   - `MustStayApart` → `ShouldNotBeTogether`
5. **Manual editor coherence**
   - violation counting and strict drop guards
6. **Regression tests + cleanup**

This order keeps architecture clean and minimizes temporary duplication.

## Suggested file touch list

### New files
- `webapp/src/components/modals/HardPeopleConstraintModal.tsx` (recommended)
- modal/unit tests as needed

### Existing files
- `webapp/src/components/modals/MustStayTogetherModal.tsx`
- `webapp/src/components/ScenarioEditor/navigation/scenarioSetupNavTypes.ts`
- `webapp/src/components/ScenarioEditor/navigation/scenarioSetupNav.ts`
- `webapp/src/components/ScenarioEditor/sectionRegistry.tsx`
- `webapp/src/components/ScenarioEditor/sections/constraintFamilies/types.ts`
- `webapp/src/components/ScenarioEditor/sections/constraintFamilies/copy.tsx`
- `webapp/src/components/ScenarioEditor/sections/constraintFamilies/HardConstraintFamilySection.tsx`
- `webapp/src/components/ScenarioEditor/scenarioEditorActions.ts`
- `webapp/src/components/ScenarioEditor/hooks/useScenarioEditorConstraints.ts`
- `webapp/src/components/ScenarioEditor/ScenarioEditor.tsx`
- `webapp/src/components/ScenarioEditor/ScenarioEditorConstraintModals.tsx`
- `webapp/src/components/ScenarioEditor/types.ts`
- `webapp/src/components/ScenarioEditor/ConstraintFormModal.tsx` (if keeping fallback complete)
- `webapp/src/components/ManualEditor/ManualEditorContent.tsx`
- `webapp/src/components/ManualEditor/moveUtils.ts`
- relevant tests

## Acceptance checklist

- [ ] `MustStayApart` appears in the Scenario Editor sidebar as a hard requirement section
- [ ] users can add/edit/delete `MustStayApart` constraints through the main editor path
- [ ] hard apart/together editing is backed by a shared clean modal abstraction
- [ ] `MustStayApart` supports bulk conversion to `ShouldNotBeTogether`
- [ ] list/cards/grid editing behaves like the rest of the constraint-family architecture
- [ ] manual editor counts `MustStayApart` as a hard violation
- [ ] manual editor strict drag/drop blocks creating hard-apart conflicts
- [ ] regression tests cover the new family across editor and manual surfaces
- [ ] no frontend-side speculative infeasibility warnings were added
