# Shared Session Scope Draft Plan

## Context

Several constraint families currently use session scoping with an important semantic distinction:

- `sessions: undefined` means **implicit all sessions**
  - applies to all current sessions
  - automatically includes newly added future sessions
- `sessions: number[]` means **explicit selected sessions**
  - even if that array currently contains every existing session
  - does **not** automatically include future sessions

Historically, some modal/card editing flows preserved this distinction, while the newer shared grid flattened session scoping into an array-like editing model and lost it.

That created editor drift:

- card/modal editing and grid editing do not behave the same
- a semantically rich field is being treated as a plain array in some places
- users can unintentionally lose the difference between implicit-all and explicit-all-current

## Goal

Unify all frontend editing flows around one shared session-scope draft model, while preserving the existing canonical persisted/backend model.

## Canonical Model

For the applicable constraint families, keep the saved/backend contract exactly as it is today:

- `sessions: undefined` → implicit all sessions
- `sessions: number[]` → explicit selected sessions

This remains the source of truth for persistence, transport, and solver semantics.

## Shared Draft Model

Introduce a single frontend draft representation:

```ts
type SessionScopeDraft =
  | { mode: 'all' }
  | { mode: 'selected'; sessions: number[] };
```

This is the model that all editors should use.

## Core Principle

There should be:

1. one canonical saved/backend model
2. one shared editor draft model for session scoping
3. multiple renderers/editors that all map through that same draft model

That means:

- the modals should stop inventing their own special interpretation
- the grid should stop treating session scope as a plain array where semantics are lost
- the conversion rules should live in one shared serializer/deserializer layer

## Scope

This plan applies to constraint/session fields where `undefined` currently means implicit all.

Primary targets:

- `AttributeBalance.sessions?: number[]`
- `MustStayTogether.sessions?: number[]`
- `ShouldStayTogether.sessions?: number[]`
- `ShouldNotBeTogether.sessions?: number[]`

Additional review targets:

- any other frontend-only editor state that currently collapses the all-vs-selected distinction

Non-goal for this pass:

- do **not** force unrelated constraints with inherently explicit session arrays (e.g. types where sessions are required and never optional) into the same canonical model unless that is explicitly intended later

## Desired UX

## Modal / Card Editors

Modal-based editing should explicitly represent the two modes:

- `All sessions`
- `Only selected sessions`

When in selected mode, the session checkbox list is active.

Important behavior:

- choosing `All sessions` maps to `{ mode: 'all' }`
- choosing `Only selected sessions` maps to `{ mode: 'selected', sessions: [...] }`
- selecting every currently existing session manually still remains `mode: 'selected'`
- this must no longer collapse back to `all`

## Grid Editors

The grid should stop using plain array semantics for these fields.

Instead, session scope should be treated as a custom structured field.

Recommended grid behavior:

### Browse mode

Show the distinction clearly:

- `All sessions`
- `Selected: 1, 2`
- `Selected: 1, 2, 3` (even if that currently equals all existing sessions)

This preserves the difference between:

- implicit all
- explicit all-current

### Edit mode

Use a structured editor with:

- mode toggle/radio:
  - `All sessions`
  - `Only selected sessions`
- session checkbox/multiselect UI when in selected mode

### Raw / CSV mode

Use JSON for the draft representation:

```json
{"mode":"all"}
```

or

```json
{"mode":"selected","sessions":[1,2,3]}
```

This is necessary because a plain array alone cannot preserve the distinction.

## Shared Serialization Layer

Introduce shared helpers for conversion both directions.

### Canonical → Draft

Examples:

- `undefined` → `{ mode: 'all' }`
- `[0, 2]` → `{ mode: 'selected', sessions: [0, 2] }`

### Draft → Canonical

Examples:

- `{ mode: 'all' }` → `undefined`
- `{ mode: 'selected', sessions: [0, 1, 2] }` → `[0, 1, 2]`

Important rule:

- **never collapse** `selected + all current sessions` back to `undefined`

That is the key semantic preservation rule for this feature.

## Data-Grid Architecture Impact

This reinforces the recent grid direction:

- semantic fields should not be forced into primitive columns when they are actually tagged unions / structured values
- the grid should support custom fields with:
  - custom browse renderer
  - custom edit renderer
  - explicit raw JSON codec

Session scope is now one of those structured fields.

## Implementation Phases

### Phase 1 — Shared session-scope model and converters

Create a shared module for:

- `SessionScopeDraft`
- canonical → draft conversion
- draft → canonical conversion
- display formatting helpers
- validation / normalization helpers

Suggested location:

- `webapp/src/components/ScenarioEditor/shared/sessionScope.ts`
  or
- `webapp/src/services/sessionScope.ts`

Acceptance:

- there is one obvious place that owns the semantics
- no editor should manually reinterpret empty/full arrays on its own afterward

### Phase 2 — Modal/card editor migration

Update the relevant modal/card constraint editors to use the shared draft model.

Likely targets:

- `ConstraintFormModal.tsx`
- `AttributeBalanceModal.tsx`
- any other modal with “leave empty for all sessions” logic

Acceptance:

- modal UI explicitly distinguishes `all` vs `selected`
- full explicit selection remains explicit after save/edit/reopen
- old implicit-all behavior remains intact

### Phase 3 — Shared grid custom session-scope column

Create a reusable custom grid column/editor for session scope.

Likely pieces:

- browse renderer for session scope labels
- inline structured editor component
- JSON raw codec for `SessionScopeDraft`
- shared helper that maps row data to/from canonical `sessions?: number[]`

Acceptance:

- grid preserves the same semantics as the modal editors
- raw/CSV mode preserves the distinction through JSON
- no more lossy array-based collapsing for these fields

### Phase 4 — Migrate applicable constraint families in the grid

Update all relevant grid consumers to use the shared session-scope field instead of plain array columns.

Primary targets:

- `AttributeBalance`
- `MustStayTogether`
- `ShouldStayTogether`
- `ShouldNotBeTogether`

Review whether any other setup list-grid is currently using optional-session semantics and should also migrate.

Acceptance:

- all applicable grids show the same semantics
- card/modal and list/grid editing round-trip identically

### Phase 5 — Regression + browser QA

Add explicit tests covering:

1. implicit all survives editing and includes future sessions conceptually
2. explicit selected survives editing unchanged
3. explicit all-current does **not** collapse to implicit all
4. modal and grid serialize identically
5. raw JSON mode preserves `{ mode: 'all' }` vs `{ mode: 'selected', sessions: [...] }`
6. reopening existing constraints reconstructs the correct draft mode

## Validation Requirements

Minimum validation for this work:

- relevant modal/component tests
- `webapp/src/components/ScenarioEditor/shared/grid/ScenarioDataGrid.test.tsx`
- `webapp/src/components/ScenarioEditor/sections/ConstraintFamilySections.test.tsx`
- any targeted scenario-editor modal tests
- `cd webapp && npx tsc --noEmit`
- `cd webapp && npx playwright test e2e/tests/data-grid-workspace.spec.ts --project=chromium`

## Risks

### Risk: accidental behavior regression in existing constraints

Guardrail:
- centralize the conversion logic first
- migrate consumers one by one
- add explicit regression tests before broad rollout

### Risk: trying to unify incompatible constraint families

Guardrail:
- only use this shared draft model where canonical `sessions` is optional and `undefined` already means implicit all

### Risk: grid and modal diverge again later

Guardrail:
- ban page-local session-scope reinterpretation once shared helpers land
- require both UI surfaces to call the same helpers

## Acceptance Criteria

This work is complete when:

1. one shared `SessionScopeDraft` model exists
2. one shared serializer/deserializer layer exists
3. applicable modals use it
4. applicable grid columns use it
5. explicit-all-current is preserved as explicit selection
6. implicit-all remains future-proof
7. modal/card and grid behavior match
