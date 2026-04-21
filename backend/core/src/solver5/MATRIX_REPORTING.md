# Solver5 Matrix Reporting

This document defines the matrix-based coverage reporting workflow for `solver5`.

It complements the main architecture docs by describing how constructive
coverage, implemented-family roadmap targets, literature-backed reference
values, method attribution, and visual gap reporting are represented.

## Global cell universe and matrix views

Solver5 reporting is built around **one global `(g,p)` cell universe** plus a
set of matrix views that window over different `(g,p)` ranges.

There is no semantic distinction between a "main" matrix and any other matrix
view. Every matrix in the report is a peer view over the same resolved cell
schema.

### `W_g,p`
The **current achieved matrix**.

For each `(g, p)`, `W_g,p` is the maximum number of weeks currently constructible
by solver5 under honest pure-SGP semantics.

For scored cells, this value comes from actual solver5 execution and canonical
score verification.

### `TW_g,p`
The **implemented-family roadmap target matrix**.

For each `(g, p)`, `TW_g,p` is the current roadmap target week count the project
wants solver5 to reach from the families and routing policy it has chosen to
prioritize.

This is intentionally **not** the same thing as the best literature-backed
constructive lower bound or the exact optimum. It is a versioned project target
that can be updated intentionally and reviewed in git.

### Auxiliary reference matrices

The canonical target definition also carries literature-backed companion data:

- `heuristic_target_rows` — best-known constructive reference values currently
  encoded for reporting/debugging
- `proven_optimal_rows` — exact optima where the project has encoded them
- `solver5_optimality_lower_bounds.v1.json` — literature-backed constructive
  lower bounds carried into the JSON/report details so the dashboard stays
  honest about known constructive coverage beyond the current roadmap target

These reference matrices exist to keep the dashboard honest about what the
literature already supports even when the implemented-family roadmap target is
still conservative.

### `M_g,p`
The **method matrix**.

For each `(g, p)`, `M_g,p` records the family or family+composition abbreviation
that achieved the current `W_g,p`.

Examples:
- `RR` — round robin / 1-factorization
- `KTS(6t+3)` — Kirkman / resolvable triple-system route on `6t+3` players
- `ownSG` — starter-block own-social-golfer construction
- `RITD` — resolvable incomplete transversal design
- `MOLR+G` — MOLR / MOLS lower-bound route with one added group-fill week
- `RTD` — resolvable transversal design / MOLS route
- `AP` — affine plane
- `RTD+G` — resolvable transversal design with recursive lift
- `VIS` — visualization-only special/trivial cell, excluded from scoring

## Canonical target definition

The canonical target definition currently lives at:

- `backend/core/src/solver5/targets/solver5_target_matrix.v1.json`

That file defines:
- matrix version/name
- visual matrix bounds
- scored matrix bounds
- target values per cell
- family/method abbreviation conventions

Do not fork the target definition across multiple scripts.
Benchmarking, reporting, and future dashboards should all read the same
canonical file.

## Scored cells vs visual-only cells

The matrix report can be richer than the optimization objective.

### Scored benchmark regions
The current objective-counting regions are:
- `2 <= g <= 10`, `2 <= p <= 10`
- `11 <= g <= 20`, `2 <= p <= 10`
- `11 <= g <= 20`, `11 <= p <= 20`

Only those cells contribute to:
- `total_constructed_weeks`
- `frontier_gap_sum`
- `solved_cells`
- `exact_frontier_cells`
- per-`p` totals

### Visual-only cells
The report may also include cells outside that scored region, such as:
- `g = 1`
- `p = 1`
- trivial or special cells represented as fixed/`∞`

Those cells are useful for a complete matrix view, but they must not change the
optimization question.

In reports, they are marked as visual-only and rendered distinctly.

## Method abbreviation conventions

Method abbreviations are defined in the target file.

Current conventions include:
- `RR`
- `KTS(6t+3)`
- `RITD`
- `MOLR+G`
- `RTD`
- `AP`
- `+G`
- `VIS`
- `?`

Composition operators append to the base family abbreviation.
For example:
- `RTD` + `+G` => `RTD+G`

When adding a new family or operator:
1. add the implementation
2. add/update the abbreviation convention in the target definition
3. make sure the report output stays concise and readable

## Universal cell grammar

Every rendered matrix cell now uses the **same glyph semantics**.

- center = current achieved weeks `W`
- top-left = exact optimum `O` when known
- top-right = primary comparison target `T`
- bottom-left = upper bound `U`
- bottom-right = current achieving method `M`; when the current construction is
  still more special-case than an **explicitly policy-approved** preferred
  family, show `M→D` where `D` is that preferred family target

This grammar does **not** change between matrix views.

What may vary by matrix view is only the **data source** behind `T`, `O`, or
the attached references:

- some views contain cells whose `T` comes from the roadmap target matrix
  `TW_g,p`
- some views contain cells whose `T` comes from curated literature-backed
  targets when available
- all matrices: `U` is the counting upper bound shown explicitly in the same
  bottom-left slot
- all matrices: `O` is shown only when an exact optimum is actually encoded

The report must not switch corner meanings by matrix type.

## Method-arrow trust policy

Method arrows are intentionally strict.

The report may show `M→D` only when all of the following are true:

- `M` is the currently achieving method
- `D` is an explicitly encoded preferred family target
- the upgrade from `M` to `D` is approved by a stable policy rule
- the cell carries an explicit reason code / reason text for that upgrade

The report must **not** create arrows just because a literature basis string
mentions another family name.

If the current method is acceptable, equivalent in presentation, or there is no
explicit upgrade policy yet, the chip must show only `M`.

Chip colors are also strict:

- green = the current method is accepted for that cell
- orange = an explicit policy-approved upgrade exists, so the cell shows `M→D`

Neutral/white method chips should be avoided for cells that already have a
current method, because that silently hides whether the method is accepted or
pending an approved upgrade.

## Fill and border semantics

The renderer uses one coherent visual policy everywhere.

### Fill

Fill grades progress against:

- `T` when `T` is present
- otherwise `U` when `U` is present
- otherwise a neutral / hatched visual-only style

The gradient is computed continuously from current progress toward that basis.

### Border

Border shows exact-optimality status only:

- green = exact optimum known and reached
- amber = exact optimum known and not yet reached
- dashed = exact optimum unknown

Visual-only cells remain hatched/dashed so they are not mistaken for scored
benchmark cells.

## Relationship to the primary autoresearch metric

The primary autoresearch objective remains:

- `total_constructed_weeks`

Why:
- it is objective
- it is stable
- it honestly proves whether a family/routing change improved the fixed scored
  matrix

The matrices are a **complement**, not a replacement:
- `total_constructed_weeks` is the keep/discard gate
- `W`, `T`, `U`, `O`, and `M` explain where progress happened, and `M→D`
  highlights where a current result is real but still needs method
  generalization
- the auxiliary literature-backed rows keep conservative roadmap targets from
  being mistaken for the current best-known constructive frontier

## Output artifacts

The solver5 coverage benchmark now emits:
- JSON artifact:
  - `autoresearch.last_run_metrics.json`
- HTML report:
  - `autoresearch.last_run_report.html`

The JSON artifact contains the structured matrix data.
The HTML report renders the same universal glyph grammar for every matrix view.

Current HTML cell semantics for **every** matrix:

- center = current implemented guarantee `W_g,p`
- top-left = exact optimum `O_g,p` when encoded
- top-right = primary target `T_g,p`
- bottom-left = counting upper bound `U_g,p`
- bottom-right = current method badge `M_g,p`; when a desired roadmap family
  differs under an explicit policy-approved method upgrade, the report shows
  `M_g,p → D_g,p`

Tiny superscript reference indices may be attached to `T` labels when a curated
literature source is available for that target.

The JSON artifact now carries fully resolved glyph fields so the Python HTML
renderer can stay thin and truthful instead of reinterpreting cell semantics.

The artifact is range-view based:

- top-level `matrices[]`
- each entry has only presentation metadata plus bounds
- each cell in each matrix is resolved from the same global cell universe

The reporting pipeline must not reintroduce legacy concepts like a dedicated
canonical matrix path or a special supplementary matrix path.

The HTML also includes:

- a method-reference table mapping each abbreviation to its expanded name and
  covered family/cell patterns
- a literature-reference table for superscripted target citations
- tooltip/detail text carrying target basis, upper-bound basis, and known
  constructive lower-bound context when available
- tooltip/detail text carrying explicit method-upgrade reasons when an arrow is
  shown

## Editing workflow

When changing targets or abbreviations:
1. update `solver5_target_matrix.v1.json`
2. update `solver5_optimality_lower_bounds.v1.json` when the literature-backed
   lower-bound/reference story changes
3. rerun the solver5 coverage benchmark
4. inspect the generated HTML report
5. verify that the universal glyph grammar still holds across all matrices and
   that scored-vs-visual-only boundaries still match the intended
   optimization question
6. document any important target-policy change in autoresearch notes/docs

## Non-goals

- using visual-only cells to inflate `total_constructed_weeks`
- hardcoding report colors per discrete bucket list
- divorcing the report from the canonical target file
- letting different matrices reuse the same visual corner for different meanings
- replacing the primary benchmark objective with a purely visual dashboard
