# Typed Grid Unification Plan

## Purpose

This document exists to make the target architecture **unmistakable**:

> We do **not** want page-specific bulk edit UIs.
> We do **not** want separate CSV systems per page.
> We do **not** want People-only editing behavior disguised as a shared solution.
>
> We want **one shared data grid component** with a small set of **typed column primitives**.
> If a page uses that grid, it should inherit viewing, editing, and CSV behavior **for free**.

If this has to be explained again, the implementation has already drifted from the plan.

---

## The Core Idea

Build `ScenarioDataGrid` as a **typed grid system**.

The grid must natively support these column primitives:

1. **string**
2. **number**
3. **array**
4. **enum string** — a string with a finite validated option list

These primitives must work consistently in **all grid modes**:

1. **browse mode**
2. **edit mode**
3. **csv mode**

That means every primitive needs a shared implementation for:

- display in browse mode
- inline editing in edit mode
- CSV serialization in csv mode
- CSV parsing back into typed draft values
- validation / coercion rules

Once this exists, any page that uses `ScenarioDataGrid` should automatically inherit:

- inline editing
- CSV editing
- round-trip conversion between grid and CSV
- type-aware validation

That is the unification goal.

---

## What Must Stop Happening

The following are explicitly **not** the intended architecture:

- page-specific bulk edit workspaces
- one-off CSV editors per section
- section-local CSV parsers/serializers for data the grid should understand itself
- People-only editing logic that does not generalize to other grid consumers
- hidden duplication where the grid owns the shell but pages still own the real editing system

If a feature only works on People and has to be reimplemented elsewhere, the grid is still too weak.

---

## Required Typed Primitive Behavior

### 1. String columns
Must support:
- browse: plain text display
- edit: text input
- csv: plain string serialization/parsing
- filtering/sorting/search/export

Examples:
- person name
- group id
- attribute key

### 2. Number columns
Must support:
- browse: numeric display
- edit: numeric input
- csv: numeric serialization/parsing
- validation for invalid numeric values
- filtering/sorting/search/export

Examples:
- weights
- capacities
- target counts

### 3. Array columns
Must support:
- browse: stable readable display
- edit: proper multi-value editor
- csv: stable encoding and decoding
- round-tripping without data loss
- filtering/sorting/search/export

Examples:
- `sessions`
- person id lists in constraints

Important:
- array columns must **not disappear or degrade incorrectly in CSV mode**
- the current `sessions` problem is evidence that array support is not yet first-class enough

### 4. Enum string columns
Must support:
- browse: display current value
- edit: select/dropdown UI
- csv: parse and validate against known allowed values
- invalid value handling
- filtering/sorting/search/export

Examples:
- penalty function
- attribute values when constrained to a known option set

---

## Required Grid Modes

### Browse mode
The normal read-oriented table view.

Must support:
- sorting
- filtering
- visibility
- resize
- pagination
- export/CSV access

### Edit mode
The typed inline editing view.

Must support:
- editing all supported primitive types
- add row
- optional add column where allowed by host page
- draft state
- apply/cancel semantics

### CSV mode
A typed CSV editing/view mode owned by the grid.

Must support:
- round-trip conversion from the current draft/table state
- parsing back into typed values
- preserving all supported primitive types
- validation feedback when parsing fails

CSV mode is **not** a second, page-specific tool.
It is a mode of the same shared grid.

---

## Division of Responsibility

### The grid should own
- typed column definitions
- primitive-specific rendering
- primitive-specific editors
- primitive-specific CSV serialization/parsing
- mode switching: browse / edit / csv
- draft table state
- generic add-row behavior
- generic validation plumbing

### Host pages should own
- the actual rows/entities
- section-specific column declarations
- optional add-column policy
- final apply/commit behavior into scenario state
- section-specific domain validation that is truly not generic

Host pages should **not** reimplement the grid editing system.

---

## Target Outcome by Section

After this work:

- **People** should use the shared typed grid, not custom bulk edit logic
- **Groups** should be able to inherit typed edit/CSV behavior through the same system
- **Attribute Definitions** should use the same typed grid model
- **Constraint sections** should use the same typed grid model where they are grid-backed

Some sections may choose not to expose edit mode immediately, but they should be opting out of a shared capability — not blocked by missing infrastructure.

---

## Implementation Strategy

1. Define a typed column API for `ScenarioDataGrid`
2. Implement primitive behavior once in the grid core
3. Implement grid-owned CSV round-tripping for all primitive types
4. Implement grid-owned draft/edit state
5. Migrate People onto the typed API
6. Migrate other grid consumers onto the same API
7. Remove old custom bulk edit flows once parity is achieved

---

## Acceptance Standard

This work is only complete when all of the following are true:

- the grid has first-class support for `string`, `number`, `array`, and `enum string`
- those primitives work in browse, edit, and csv modes
- People no longer needs bespoke bulk-edit behavior
- other grid-backed pages can adopt the same behavior without bespoke reimplementation
- CSV behavior is not duplicated across pages
- array fields like `sessions` round-trip correctly in csv mode

If we still need custom page-specific bulk edit systems, the unification is not finished.
