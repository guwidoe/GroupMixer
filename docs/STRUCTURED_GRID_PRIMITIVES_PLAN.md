# Structured Grid Primitives Plan

## Purpose

This document captures the next step after the typed-grid unification work.

We already support these shared grid primitives:

- `string`
- `number`
- `array`
- `enum string`

That is enough for many sections, but not enough for every constraint-family editor.

The remaining blocker is **structured fields** such as `AttributeBalance.desired_values`.

This document exists to make the intended solution explicit so we do **not** drift into bad abstractions like a vague generic dictionary blob.

---

## Core Decision

We should add **structured grid support**, but we should do it in the **smallest honest abstraction** that matches the real use case.

### Explicitly rejected as the default solution

We do **not** want to jump straight to:

- arbitrary `dictionary<any, any>` cells
- opaque JSON blobs in a CSV cell
- ad hoc section-specific serialization hacks

That would be flexible in theory, but awkward in practice for:

- rendering
- editing
- validation
- sorting/filtering
- CSV round-tripping
- long-term maintainability

---

## Preferred Design Rule

### If the key set is known and finite
Use a **shared expanded-column model**.

That means a structured field like:

```ts
{
  female: 2,
  male: 1,
  nonbinary: 1,
}
```

should usually become grid columns like:

- `female`
- `male`
- `nonbinary`

rather than one opaque dictionary cell.

### If the key set is unknown or variable
Use a **shared key-value/map primitive**, not page-specific custom UI.

But this should only be added when there is a real use case that cannot be represented cleanly through expanded typed columns.

---

## Specific Recommendation for GroupMixer

For the current blocker (`AttributeBalance.desired_values`), the best next move is:

### Primary recommendation
Treat `desired_values` as a **known finite-key numeric map** and expand it into typed columns.

If the selected attribute is `role` and its allowed values are:

- `dev`
- `design`
- `pm`

then the list/edit/csv surface should look like columns such as:

- `Group`
- `Attribute`
- `dev`
- `design`
- `pm`
- `Sessions`
- `Weight`

This is better than a single cell like:

- `dev=2|design=1|pm=1`

because expanded columns are:

- easier to read
- easier to edit
- easier to validate
- easier to export/import through CSV
- more spreadsheet-like
- more aligned with the whole point of the unified data-grid system

---

## Shared Abstraction Target

To keep this reusable and not just an `AttributeBalance` hack, we should add a shared concept such as:

- **structured column groups**
- or **derived subcolumns from a structured field definition**

In practice, this means:

- the grid can take one logical structured field
- and expand it into multiple typed child columns
- each child column still behaves like a normal typed primitive
  - usually `number`
  - possibly `string` or `enum` in future use cases

So the real reusable primitive is not necessarily “dictionary in one cell.”
It is more likely:

- **typed structured field that expands into typed columns**

---

## Proposed Structured Primitive Levels

### Level 1: Expanded finite-key map support
Shared support for fields that are conceptually maps but have a known finite key set at render time.

Examples:
- `AttributeBalance.desired_values`
- any future keyed targets over known attribute values

Expected behavior:
- grid derives one column per known key
- each derived column is a normal typed primitive
- edit mode works inline
- CSV mode exports/imports the expanded columns directly

### Level 2: Shared key-value/map primitive
Only add this if we hit real variable-key use cases that cannot be expressed by Level 1.

Possible future variants:
- `string -> string`
- `string -> number`
- `enum -> number`

But this should come **after** Level 1, not before.

---

## Why This Matters

Constraint-family sections do not automatically inherit edit support unless their editable model is fully representable through the shared grid abstractions.

Right now, the missing piece is not the generic grid shell anymore.
The missing piece is a shared way to represent **structured fields** without falling back to page-local custom editors.

This plan solves that without regressing into bespoke UI.

---

## Implementation Strategy

1. Add a shared structured-field / derived-subcolumn design for finite-key maps
2. Implement expanded typed columns for `AttributeBalance.desired_values`
3. Enable shared edit/csv mode for the `AttributeBalance` list grid
4. Revisit the remaining constraint-family sections and enable shared editing where their list models are now complete
5. Only introduce a generic key-value/dictionary primitive later if a real variable-key use case justifies it

---

## Acceptance Standard

This follow-up is only complete when:

- `AttributeBalance` no longer needs custom non-grid bulk-edit handling for its structured values
- the shared grid can represent finite-key structured values through reusable typed subcolumns
- CSV round-tripping remains readable and spreadsheet-friendly
- we have not introduced opaque dictionary blobs as the default editing surface
- the solution is clearly reusable for future structured fields
