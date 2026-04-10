# ScenarioDataGrid JSON Raw Codec Plan

## Context

The current `ScenarioDataGrid` architecture is strong for common table-like fields, but `AttributeBalance.desired_values` exposed an important mismatch between the row model and the grid representation.

Current problems:

1. The grid can show an attribute **id** instead of the human-visible attribute **name**.
2. `AttributeBalance.desired_values` is currently represented as expanded per-option columns.
3. That per-option column expansion implies a table-global schema that is not actually truthful for this data.
4. Our current raw/CSV handling for array-like fields relies on delimiter-based formats that are fragile when values contain arbitrary user-supplied text.

## Problem Statement

`AttributeBalance.desired_values` is conceptually:

```ts
Record<string, number>
```

But its valid keys are determined by the row's selected attribute. That means the key set is **row-local**, not truly a global table schema.

Expanding one row-local map into many table-global columns produces several UX and modeling problems:

- misleading representation of the data shape
- visually awkward sparse tables
- poor fit when different rows point at different attributes
- harder future extension to arbitrary structured values

At the same time, delimiter mini-formats such as `a|b|c` or `female=2; male=2` are unsafe when the values themselves are user-controlled strings.

## Goals

1. Display human-visible attribute names, not internal ids, in the grid UI.
2. Replace the expanded Attribute Balance option columns with a single row-local structured `Targets` cell.
3. Establish a general grid architecture where:
   - browse rendering is type-specific
   - edit rendering is type-specific
   - raw text / CSV round-tripping is handled by an explicit codec
4. Adopt **JSON as the default raw codec for non-trivial values**.
5. Eliminate delimiter-fragile raw representations for arrays and structured values.
6. Keep the grid extensible so future complex column types can be added without inventing bespoke text formats.

## Non-Goals

1. Do not make the browse UI display raw JSON by default.
2. Do not collapse the typed-grid architecture back into a single untyped blob column model.
3. Do not silently coerce malformed JSON or invalid structured values.
4. Do not split a single `AttributeBalance` constraint into multiple table rows.

## Design Principles

### 1. Separate UI representation from raw serialization

Each column should be thought of as three independent concerns:

1. **View renderer** — how the value is displayed in browse mode.
2. **Edit renderer** — how the value is edited in interactive grid mode.
3. **Raw codec** — how the value is serialized and parsed in CSV / raw-edit workflows.

### 2. JSON is the universal raw codec for complex values

For any field that contains user-controlled strings or nested structure, the raw representation should default to JSON.

Examples:

- `string[]` → `"[\"foo\",\"bar\"]"`
- `Record<string, number>` → `"{\"female\":2,\"male\":2}"`
- future structured objects → JSON object strings

### 3. Keep custom UI where it matters

JSON is the **raw codec**, not the default end-user browse UI.

Examples:

- arrays still browse as chips / concise labels
- attribute-balance targets still browse as `female: 2 · male: 2`
- edit mode still uses custom structured controls where appropriate

### 4. Use explicit validation

Invalid raw JSON or semantically invalid values must surface clear errors.

Examples:

- malformed JSON object
- array column receives non-array JSON
- attribute-balance targets include keys that are not valid options for the selected attribute
- numeric map values are not finite numbers

## Target Architecture

## Column model refinement

The current typed-grid system should be refined so columns can provide an explicit raw codec independent of browse/edit rendering.

Illustrative shape:

```ts
type ScenarioDataGridRawCodec<TValue, TRow> = {
  format: (value: TValue, row: TRow) => string;
  parse: (text: string, row: TRow) =>
    | { ok: true; value: TValue }
    | { ok: false; error: string };
};
```

Each column should effectively support:

- `getValue`
- `setValue`
- browse renderer
- edit renderer
- raw codec
- validation

Primitive columns can keep convenient defaults.
Structured/custom columns can override rendering and use JSON raw codecs.

## Attribute Balance target model

### New list/grid representation

Attribute Balance rows should become:

- `Group`
- `Attribute`
- `Targets`
- `Mode`
- `Sessions`
- `Weight`

### Attribute column behavior

- internal storage continues using stable `attribute_id`
- grid display shows `attribute.name`
- enum editing uses attribute names / labels
- CSV/raw export should prefer attribute names, not ids
- parsing can accept names and optionally ids as a compatibility input path, but the canonical export should be names

### Targets column behavior

`Targets` should be a single structured cell representing the row-local dictionary.

#### Browse mode

Compact summary, for example:

- `female: 2 · male: 2`
- or chips / badges per key/value pair

#### Edit mode

A structured editor bound to the selected attribute:

- available keys come from the selected attribute definition values
- one numeric input per valid option
- changing the attribute updates the editable key set
- unsupported keys are shown as validation issues instead of being silently lost

#### Raw / CSV mode

Canonical JSON object string:

```json
{"female":2,"male":2}
```

## Array raw representation

Array columns must stop relying on delimiter-joined raw text when the array members may contain arbitrary user strings.

Canonical raw representation:

```json
["session 1","asdf | asdf:"]
```

Browse and interactive edit UX can remain specialized; only the raw codec changes.

## Migration Strategy

### Phase 1 — raw codec abstraction

Refine `ScenarioDataGrid` column definitions so raw formatting/parsing is an explicit capability.

Deliverables:

- raw codec types/config in `shared/grid/types.ts`
- codec plumbing used by draft CSV/raw editing
- default primitive codecs retained where safe
- JSON codecs available as shared helpers for array / object-like values

### Phase 2 — generic JSON codec support

Implement reusable JSON raw codecs and validation helpers for:

- arrays
- string→number maps
- general structured fallback values

Deliverables:

- shared parse/stringify helpers
- strict validation errors surfaced in the grid
- no silent coercion or custom delimiter parsing

### Phase 3 — Attribute Balance migration

Replace expanded `desired_values` subcolumns with a single `Targets` structured column.

Deliverables:

- attribute name display in list/grid
- structured browse renderer for targets
- structured inline editor for targets
- JSON raw codec for targets
- updated apply logic and validation

### Phase 4 — array audit

Audit existing array columns and switch their raw CSV/edit representations to JSON arrays wherever values may contain arbitrary user text.

Likely targets include:

- sessions arrays
- any multi-value string list fields

### Phase 5 — regression + browser QA

Validate both the generic codec architecture and the concrete Attribute Balance UX.

## Validation Requirements

Minimum validation for this work:

- `webapp/src/components/ScenarioEditor/shared/grid/ScenarioDataGrid.test.tsx`
- `webapp/src/components/ScenarioEditor/sections/ConstraintFamilySections.test.tsx`
- `cd webapp && npx tsc --noEmit`
- `cd webapp && npx playwright test e2e/tests/data-grid-workspace.spec.ts --project=chromium`

Add explicit coverage for:

1. array raw editing with strings containing separators / punctuation
2. attribute-balance targets raw editing with keys containing punctuation
3. attribute-balance browse mode showing attribute names, not ids
4. invalid JSON parse errors
5. invalid target keys for the selected attribute
6. round-trip preservation for structured targets through edit → CSV/raw → apply

## Risks and Guardrails

### Risk: over-generalizing too early

Guardrail:
- keep the existing typed-grid ergonomics
- add raw codec abstraction beneath them
- only introduce custom structured-column machinery where needed

### Risk: JSON becomes the visible UX everywhere

Guardrail:
- JSON is for raw codec paths
- browse/edit UI remains type-specific and user-friendly

### Risk: breaking existing CSV workflows

Guardrail:
- update tests for array and structured round-tripping
- make export canonical and parse strict
- if compatibility parsing is needed temporarily, keep it explicit and time-boxed

## Acceptance Criteria

This plan is complete when:

1. Attribute Balance grid displays attribute names rather than ids.
2. Attribute Balance uses a single `Targets` structured column instead of expanded option columns.
3. The `Targets` field round-trips through grid browse/edit/raw workflows via JSON.
4. Array raw/CSV workflows no longer depend on unsafe delimiter parsing for arbitrary user strings.
5. `ScenarioDataGrid` has a reusable raw codec abstraction that future complex column types can share.
6. Unit tests, typecheck, and Playwright data-grid flows all pass.

## Relationship to Existing Plans

This is a refinement of the typed-grid and structured-grid work, not a rejection of it.

Previous structured finite-key subcolumns were appropriate when the keys behaved like a genuine shared table schema.

`AttributeBalance.desired_values` is different because its keys are selected by another field on the same row. That makes it a better fit for a row-local structured cell with a JSON raw codec.
