# Solver6 Matrix Reporting

This document defines the benchmark and HTML reporting plan for `solver6`.

It intentionally mirrors the matrix-report style already used for `solver5`, but
with different cell semantics.

`solver5` asks:

- for each `(g, p)`, what is the largest week count solved exactly with zero repeats?

`solver6` should ask:

- for each `(g, p)`, across a fixed scanned week cap, which week counts attain the
  **theoretical lower bound** for repeated-pair damage?

The primary layer is the **linear repeat-excess lower bound**.
A secondary parallel layer may report the **squared repeat-excess lower bound**.

---

## 1. Core reporting question

For a fixed pure-SGP cell `(g, p)` and week count `w`, solver6 should benchmark:

1. whether the final schedule is exact (`repeat score = 0`)
2. whether the final schedule attains the canonical linear lower bound
3. whether the final schedule attains the canonical squared lower bound
4. how much of the result quality came from the seed vs post-search polishing

The report must stay explicit that this is an **empirical benchmark of solver6 at
fixed budget/configuration**, not a proof-of-existence oracle.

---

## 2. Week-scan model

For each `(g, p)` cell in the chosen visual bounds, benchmark weeks:

- `w = 1..cap`
- initial default cap: `100`

The cap is a reporting parameter, not a theorem.
If solver6 attains the target metric for every tested week through the cap, the
report should show `≥100` rather than claiming a mathematical infinity.

### Honesty rule

- `≥100` means: all tested weeks through cap `100` attained the selected lower bound
- it does **not** mean: the frontier is proven infinite

---

## 3. Per-week status model

For each `(g, p, w)` case, compute and store objective-aware runs:

1. a **linear run** with `pair_repeat_penalty_model = linear_repeat_excess`
2. a **squared run** with `pair_repeat_penalty_model = squared_repeat_excess`, skipped only when the linear-run schedule is already squared-instance tight

### Input / execution metadata

- solver configuration
- benchmark budget / iteration policy
- runtime for each executed objective run
- selected seed family for each executed objective run
- key search telemetry
- canonical schedule hashes for comparing objective agreement

### Seed metrics

Before local search:

- linear repeat score
- linear lower bound
- linear gap
- squared repeat score
- squared instance lower bound
- squared instance gap
- squared concentration lower bound
- squared concentration gap
- max pair frequency
- multiplicity histogram summary

### Final metrics

After local search:

- linear repeat score
- linear lower bound
- linear gap
- squared repeat score
- squared instance lower bound
- squared instance gap
- squared concentration lower bound
- squared concentration gap
- max pair frequency
- multiplicity histogram summary

### Derived statuses

For the **linear layer**:

- `exact` — final repeat score is zero
- `lb_tight` — final linear gap is zero but final score is nonzero
- `miss` — final linear gap is positive
- `unsupported` / `error` / `timeout` — explicit execution status, not silently merged into `miss`

For the **squared layer**:

- `exact` — final squared score is zero
- `lb_tight` — final squared instance gap is zero but final score is nonzero
- `miss` — final squared instance gap is positive
- `unsupported` / `error` / `timeout`

---

## 4. Lower-bound definitions

### Linear lower bound

Use the existing canonical solver6 linear lower bound.

A week count `w` is a linear-layer success iff:

- `linear_repeat_excess_lower_bound_gap == 0`

### Squared lower bound

For total pair universe size `U` and repeat excess `E`, the perfect balanced
lower bound for squared repeat excess is:

- `q = E / U`
- `r = E % U`
- `squared_lower_bound = (U - r) * q^2 + r * (q + 1)^2`

Solver6 reports two squared bounds:

- **instance squared lower bound**: uses the instance-level linear lower bound as
  `E`. This gap is comparable across schedules for the same `(g, p, w)` case and
  is the squared matrix layer status metric.
- **concentration squared lower bound**: uses the schedule's observed linear
  repeat excess as `E`. This gap answers whether the achieved repeats are as
  evenly dispersed as possible, conditional on the current linear score.

A week count `w` is a squared-layer success iff:

- `squared_instance_lower_bound_gap == 0`

The legacy `squared_repeat_lower_bound[_gap]` artifact fields are aliases for the
concentration bound/gap. The squared layer is secondary. The linear layer remains
the primary solver6 headline report.

---

## 5. Outer matrix semantics

The outer matrix remains two-dimensional:

- rows = `g`
- cols = `p`

Each outer cell summarizes the week sweep for one `(g, p)` pair.

### Headline label

Each cell should show:

- contiguous frontier `F`
- optional best observed hit `B` when `B > F`

Recommended labels:

- `23` — contiguous frontier and best observed hit are both `23`
- `23/41` — contiguous frontier is `23`, but later hits were observed through `41`
- `≥100` — every tested week through cap `100` hit

### Why both numbers matter

The report must not assume monotonicity in lower-bound attainment.
A solver may miss one week and later hit a larger week count, either because the
problem permits it or because the solver budget behaves unevenly.

So each layer should track both:

- `contiguous_frontier`: largest `w` such that all weeks `1..w` hit
- `best_observed_hit`: largest `w` that hit anywhere in `1..cap`

---

## 6. Tiny internal 10x10 matrix

Each outer cell should embed a tiny `10 x 10` internal week matrix for weeks
`1..100`.

### Layout

- row-major mapping is recommended:
  - row 1: weeks `1..10`
  - row 2: weeks `11..20`
  - ...
  - row 10: weeks `91..100`

### Primary linear-layer colors

- dark green = exact (`score = 0`)
- green = lower-bound-tight but nonzero repeats
- red = miss
- gray = not run / unsupported / timeout / explicit failure

### Squared-layer colors

Same geometry, different success predicate:

- dark green = exact
- green = squared-lower-bound tight
- red = miss
- gray = not run / unsupported / timeout / explicit failure

The tiny matrix is the main visual answer to the otherwise three-dimensional
nature of the benchmark.

---

## 7. Click-through detail view

Clicking an outer cell should open a larger detail view (modal, drawer, or
separate detail panel).

### Required detail content

#### A. Enlarged week matrix

A larger `10 x 10` matrix for weeks `1..100` with week numbers visible.

#### B. Cell summary

For the selected `(g, p)` pair:

- contiguous frontier
- best observed hit
- count of exact weeks
- count of lower-bound-tight weeks
- first miss
- longest post-frontier recovery streak

#### C. Per-week analytics table

At minimum:

- week
- execution status
- selected seed family
- seed linear score / lower bound / gap
- final linear score / lower bound / gap
- seed squared score / lower bound / gap
- final squared score / lower bound / gap
- runtime
- search iterations / telemetry summary

#### D. Seed-vs-search explanation

The detail view should make it obvious whether:

- the seed already hit the bound
- local search closed the remaining gap
- local search failed to improve the seed

---

## 8. Layered report structure

The HTML report should expose parallel views rather than overloading a single
number.

### Tab 1 — Linear lower-bound attainment

Primary default view.

Cell success means:

- final linear gap = `0`

### Tab 2 — Squared instance lower-bound attainment

Secondary view. This uses the selected squared result: the linear schedule when it is already squared-instance tight, otherwise the better squared result from the squared-mode run when available.

Cell success means:

- selected squared result has final squared instance gap = `0`

### Tab 3 — Linear = squared schedule agreement

Agreement view.

Cell success means:

- the canonical linear-run schedule is also the selected squared schedule
- the linear objective is tight
- the squared objective is tight

Per-week details should show whether the squared run was skipped, improved the squared metric, incurred linear cost, failed, or produced the same canonical schedule.

### Tab 4 — Raw metrics / diagnostics (optional but recommended)

Examples:

- average final linear gap
- average selected squared instance gap
- average selected squared concentration gap
- squared-run improvement over linear-run schedule
- linear objective cost paid by squared-mode optimization
- runtime summary split by linear run and squared run
- seed-vs-search improvement summary
- selected seed-family mix

---

## 9. Artifact plan

The benchmark should emit a structured JSON artifact plus an HTML report.

Recommended outputs:

- JSON artifact:
  - `autoresearch.last_run_metrics.json`
- HTML report:
  - `autoresearch.last_run_report.html`

### JSON requirements

The JSON should be rich enough that the HTML renderer stays thin.
The renderer should not have to recompute:

- linear or squared lower bounds
- frontier summaries
- seed-vs-search deltas
- week-status classification

Those should be resolved in the benchmark artifact generation step.

---

## 10. Operational workflow

The current end-to-end benchmark/report pipeline lives at:

- benchmark artifact generator:
  - `backend/core/examples/solver6_optimality_frontier.rs`
- HTML renderer:
  - `tools/autoresearch/solver6-optimality/generate_matrix_report.py`
- wrapper script:
  - `tools/autoresearch/solver6-optimality/autoresearch.sh`

Typical usage:

```bash
./tools/autoresearch/solver6-optimality/autoresearch.sh \
  --week-cap 100 \
  --max-people 36 \
  --time-limit 1
```

This writes solver6-specific artifacts so the solver5 and solver6 reports can coexist:

- `autoresearch.solver6.last_run_metrics.json`
- `autoresearch.solver6.last_run_report.html`

The wrapper intentionally keeps the report generation reproducible from a single
command rather than requiring manual JSON/HTML steps.

## 11. Initial implementation order for milestone 7

### Step 1 — Weekly analytics artifact

Implement the benchmark sweep and structured per-week result model.

Required outputs:

- per `(g, p, w)` linear-run seed/final metrics
- per `(g, p, w)` squared-run seed/final metrics when a separate squared run is needed
- selected squared result metrics
- linear lower-bound gaps, selected squared instance gaps, squared concentration gaps, and objective-agreement status
- per-cell contiguous frontier and best observed hit for linear, squared, and same-schedule agreement views

### Step 2 — Outer matrix report

Render the outer `(g, p)` matrix with:

- headline frontier label
- tiny `10 x 10` internal week matrix
- separate linear, squared, and objective-agreement views

### Step 3 — Click-through detail analytics

Add the large per-cell detail view with:

- enlarged week matrix
- per-week metrics table
- seed-vs-search comparison

### Step 4 — Docs and benchmark policy alignment

Document:

- the meaning of `≥100`
- the difference between contiguous frontier and best observed hit
- the layer semantics for linear vs squared lower bounds
- the benchmark budget/configuration used for the report

---

## 12. Non-goals

Do not:

- label cells as mathematically infinite just because the cap was saturated
- collapse unsupported/timeouts silently into ordinary misses
- hide seed-vs-search differences behind a single final score
- mix linear and squared semantics into one ambiguous headline value
- require the reader to inspect raw JSON to understand a cell’s week-level pattern
