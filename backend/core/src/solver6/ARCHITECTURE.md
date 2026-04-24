# Solver6 Architecture

`solver6` is the **hybrid pure-SGP repeat-minimization solver family**.

Its role is distinct from both `solver4` and `solver5`:

- `solver4` is the paper-shaped pure-SGP heuristic/search family
- `solver5` is the explicit pure-SGP construction portfolio
- `solver6` is the **seeded optimizer** that uses explicit `solver5` constructions as
  building blocks for larger pure-SGP horizons, especially impossible overfull cases
  where some repeated pairings are unavoidable

This document is normative for solver6 extension work.

## Scope and honesty policy

Solver6 accepts only pure SGP-style cases:

- same participants every week
- full attendance
- equal fixed group sizes
- exact full partitions each week
- exactly one `RepeatEncounter` constraint with `max_allowed_encounters = 1`
- `maximize_unique_contacts` objective only

Solver6 must fail explicitly when:

- an input is outside that pure-SGP scope
- the requested execution phase has not been implemented yet
- a seed family or search policy is selected that exists only as scaffold


## Architectural intent

Solver6 is designed around four stages.

### 1. Pure-SGP normalization

Like `solver4` and `solver5`, solver6 starts by validating the canonical pure-SGP
shape and rejecting anything outside it.

### 2. Exact-construction handoff

If `solver5` can already construct the requested case exactly, solver6 should
return that construction immediately.

This keeps exact pure-SGP coverage truthful and fast.

### 3. Seed synthesis

When the requested horizon exceeds the known zero-repeat frontier, solver6 should
construct a strong incumbent from one or more exact or prefix constructions.

The primary planned seed family is:

- **exact-block composition with player relabeling**, where multiple copies of a
  zero-repeat block are composed and relabeled to minimize pair-overlap damage

Future seed families may include:

- exact-prefix plus heuristic tail completion
- mixed block-size portfolios
- multi-seed constructor portfolios

Solver6 may also use an explicit on-disk **progressive incumbent cache** for expensive pure-SGP shapes.

- This is documented in `backend/core/src/solver6/SEED_CATALOG.md`.
- Despite the historical filename, that document now defines the solver6 incumbent cache, not a seed-only catalog.
- Cache use must remain explicit, versioned, and inspectable.
- Cache identity is only `cache_policy_version + num_groups + group_size + num_weeks`.
- Cached final/incumbent schedules are reused directly; incomplete incumbents resume local search on later calls.
- A seed timeout on a cache miss fails explicitly; a local-search timeout returns and saves the incumbent.
- Solver6 cache behavior is native solver6 infrastructure and is not a webapp-direct integration path.

### 4. Repeat-minimizing local search

After seed synthesis, solver6 should improve the incumbent under an explicit
pair-frequency objective.

Planned objective families:

- linear repeat excess
- convex repeat excess (for concentrating repeated pairings harder)
- later lexicographic objectives such as minimizing max pair multiplicity first

Planned move/search machinery:

- same-week swap neighborhoods
- repeat-aware tabu memory
- breakout / diversification
- pair-frequency telemetry

## Current implemented benchmark review surface

Solver6 milestone-7 review work is now anchored to the matrix-reporting workflow
defined in:

- `backend/core/src/solver6/MATRIX_REPORTING.md`

That workflow is normative for performance claims about impossible pure-SGP
cases.

Current review expectations:

- benchmark week sweeps explicitly up to a fixed cap (currently `100` by default)
- treat **linear lower-bound attainment** as the primary optimality layer
- treat **squared instance lower-bound attainment** as a separate objective layer,
  running squared-mode solver6 when the linear schedule is not already squared-tight
- expose **linear = squared schedule agreement** as its own layer, with conditional
  squared concentration gaps available as diagnostics
- keep the week axis visible through an embedded per-cell `10x10` week matrix
- make seed-vs-search contribution inspectable through click-through cell detail

Solver6 benchmark claims should therefore be phrased in terms of:

- contiguous frontier
- best observed hit when it differs
- exact weeks vs lower-bound-tight impossible weeks
- explicit seed-family and local-search contribution


## Extension rules

When implementing the next phases:

1. keep exact handoff explicit
2. keep seed synthesis separate from local search
3. keep the repeat objective explicit and configurable
4. add executable tests for exact handoff, seed quality, and local improvement
5. prefer honest unsupported errors over implicit fallback
