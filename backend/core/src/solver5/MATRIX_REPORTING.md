# Solver5 Matrix Reporting

This document defines the matrix-based coverage reporting workflow for `solver5`.

It complements the main architecture docs by describing how constructive
coverage, implemented-family roadmap targets, literature-backed reference
values, method attribution, and visual gap reporting are represented.

## Core matrices

Solver5 matrix reporting is built around three primary named matrices, plus
auxiliary literature-backed reference matrices.

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
  lower bounds used for the optimality badge

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

### Scored benchmark region
The current objective-counting region is:
- `2 <= g <= 10`
- `2 <= p <= 10`

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

## Gap semantics

Gap is defined as:

- `gap_g,p = max(0, TW_g,p - W_g,p)`

Interpretation:
- `gap = 0` means the current implemented-family roadmap target is reached
- `gap = 1` means the cell is close and should appear yellow-ish
- larger gaps move toward orange/red

## Color gradient semantics

The matrix report uses computed gradient logic, not a tiny hardcoded bucket
lookup table.

Current rendering policy:
- `gap = 0` => green
- `gap = 1` => yellow
- larger gaps interpolate continuously toward red based on the observed maximum
  scored-cell gap in the rendered report

Visual-only cells are styled distinctly so they are not mistaken for scored
benchmark results.

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
- `W`, `TW`, and `M` explain where progress happened and what still needs work
- the auxiliary literature-backed rows keep conservative roadmap targets from
  being mistaken for the current best-known constructive frontier

## Output artifacts

The solver5 coverage benchmark now emits:
- JSON artifact:
  - `autoresearch.last_run_metrics.json`
- HTML report:
  - `autoresearch.last_run_report.html`

The JSON artifact contains the structured matrix data.
The HTML report renders a single combined dashboard glyph per cell.

Current HTML cell semantics:
- center = current implemented guarantee `W_g,p`
- top-right = roadmap target `TW_g,p` when still unmet
- bottom-left = literature-backed constructive lower bound when it adds
  information beyond the roadmap target
- top-left = known optimum when useful, or a checkmark when the cell is already
  solved at a known exact optimum
- bottom-right = current method badge; when the encoded reference method differs,
  the HTML shows separate current/reference badges with an arrow between them

Visual channels are intentionally separated:
- cell fill = progress against the roadmap target only
- border = optimality status only
- gray hatched styling = visual-only cells outside the scored objective

The HTML also includes a method-reference table mapping each abbreviation to its
expanded name and the family/cell patterns it covers.

## Editing workflow

When changing targets or abbreviations:
1. update `solver5_target_matrix.v1.json`
2. update `solver5_optimality_lower_bounds.v1.json` when the literature-backed
   lower-bound/reference story changes
3. rerun the solver5 coverage benchmark
4. inspect the generated HTML report
5. verify that scored-vs-visual-only boundaries still match the intended
   optimization question
6. document any important target-policy change in autoresearch notes/docs

## Non-goals

- using visual-only cells to inflate `total_constructed_weeks`
- hardcoding report colors per discrete bucket list
- divorcing the report from the canonical target file
- replacing the primary benchmark objective with a purely visual dashboard
