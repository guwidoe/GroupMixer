# Solver6 Implementation Plan

This document turns the `solver6` architecture into an executable implementation roadmap.

`solver6` is the **hybrid pure-SGP repeat-minimization solver family**:

- `solver5` remains the truthful source of exact pure-SGP construction atoms
- `solver6` consumes those atoms to build strong incumbents for larger horizons
- `solver6` then optimizes under an explicit repeated-pair objective for impossible or overfull cases

The current scaffold already does:

1. typed solver registration
2. pure-SGP validation
3. exact solver5 handoff for exact cells
4. explicit failure for the reserved hybrid pipeline

This plan covers the remaining implementation.

---

## 1. Product goal

For a fixed pure-SGP shape `(g, p)` and requested horizon `w`, solver6 should:

1. return the exact `solver5` result immediately when `solver5` already solves `g-p-w`
2. otherwise construct a **very strong seed** from one or more exact/prefix pure-SGP blocks
3. optimize that seed under an explicit repeated-pair objective
4. produce schedules that are near-optimal or optimal for many impossible cases, especially when:
   - the request is a multiple of a known exact frontier block
   - the request is close to such a multiple
   - repeated-pair damage can be spread uniformly across the pair universe

---

## 2. Primary optimization model

Solver6 must optimize **pair frequencies**, not solver4’s paper-local conflict count.

Let `m(a,b)` be the number of weeks in which pair `(a,b)` appears together.

### Primary planned objective families

#### A. Linear repeat excess

`sum(max(0, m(a,b) - 1))`

Use this as the baseline objective and the first implementation target.

#### B. Triangular repeat excess

`sum(t(r))`, where `r = max(0, m(a,b) - 1)` and `t(r) = r * (r + 1) / 2`

This penalizes concentrated repeat damage harder than the linear model while still keeping a simple integer objective.

#### C. Squared repeat excess

`sum(r * r)` over repeat excess `r`

This is the strongest anti-concentration model currently planned.

### Secondary telemetry to track from the start

- `max_pair_frequency`
- histogram of pair multiplicities (`seen_once`, `seen_twice`, `seen_three_plus`, ...)
- total distinct pairs covered
- lower-bound gap under linear repeat excess:
  - `pair_incidences_total - total_distinct_pairs_available`

### Implementation rule

All three penalty models must share one canonical pair-frequency state so move evaluation and seed scoring do not diverge.

---

## 3. Seed-construction strategy

The highest-ROI seed family is:

## Exact block composition with player relabeling

If an exact zero-repeat block exists for `(g,p,w0)`, then for larger `w` solver6 should use that block as a **construction atom**.

### Example

For `8-4-20`:

- `solver5` knows exact `8-4-10`
- one `8-4-10` block uses 480 distinct pairs and leaves 16 unused
- two relabeled copies can potentially distribute omitted pairs disjointly
- this can hit the linear lower bound exactly

This pattern should become the first-class solver6 seed family.

### Seed family order

1. **Exact solver5 handoff**
   - if `solver5` solves the requested horizon exactly, return immediately
2. **Exact block composition**
   - compose one or more exact solver5 blocks with relabelings
3. **Exact block composition + tail**
   - compose large exact blocks, then attach a smaller exact/prefix block or heuristic tail
4. **Future portfolio mode**
   - generate multiple seeds and keep the best after polishing

---

## 4. Proposed module layout

Recommended `solver6/` growth path:

- `problem.rs`
  - pure-SGP validation (already present)
- `score.rs`
  - pair indexing
  - pair-frequency state
  - full rescoring
  - delta updates for swaps
- `atoms.rs`
  - exact/prefix block extraction from solver5
  - typed block metadata used by solver6
- `seed/`
  - `mod.rs`
  - `block_composition.rs`
  - `relabeling.rs`
  - `portfolio.rs`
- `search/`
  - `mod.rs`
  - `state.rs`
  - `delta.rs`
  - `tabu.rs`
  - `breakout.rs`
- `result.rs`
  - canonical result projection and telemetry packaging
- `reporting.rs` (later)
  - seed diagnostics / overlap summaries / lower-bound comparisons
- `scaffolding.rs`
  - transitional reserve messages (already present; shrink as phases land)

Do **not** bury solver6 logic inside solver5 family modules. Solver5 remains the explicit construction portfolio; solver6 consumes it.

---

## 5. Milestones

## Milestone 0 — Scaffold (done)

Already implemented:

- registration in `models.rs`, `engines/mod.rs`, `lib.rs`
- exact solver5 handoff
- explicit reserved failure
- architecture doc and basic tests

---

## Milestone 1 — Pair scoring foundation

### Goal
Build the canonical pair-frequency representation and scoring engine.

### Deliverables

- pair universe indexing for `n = g * p` people
- canonical `PairFrequencyState`
- scoring functions for:
  - linear repeat excess
  - triangular repeat excess
  - squared repeat excess
- derived telemetry:
  - max pair frequency
  - pair-count histogram
  - distinct-pair coverage
- unit tests with small hand-checked schedules

### Design notes

- this state must support both full rescoring and incremental delta application
- the data layout must be hotpath-friendly because local search will hammer it
- start simple and correct, then optimize after benchmarks

### Exit criteria

- exact schedules score zero under every penalty model
- known duplicated-block examples score as expected
- scoring is independent of group/week ordering symmetries

---

## Milestone 2 — Solver5 atom extraction API

### Goal
Give solver6 an explicit, truthful way to request construction atoms from solver5.

### Deliverables

- new solver5-facing API for “best exact/prefix atom for `(g,p)` or `(g,p,w)`”
- typed atom metadata including:
  - schedule
  - exact vs prefix span
  - supported weeks
  - provenance / family id
  - evidence / residual info when relevant
- tests proving solver6 does not need to abuse the public solve API to get atoms

### Design notes

Solver6 should not guess at solver5 internals. Add an explicit handoff surface.

Recommended shape:

- atom query by `(g,p)` frontier and by `(g,p,w)` request
- exact request handoff remains unchanged
- atom extraction should reuse router truth rather than duplicate family logic

### Exit criteria

- solver6 can ask for exact `8-4-10` as an atom directly
- solver6 can distinguish “no atom available” from “exact full request solved” cleanly

---

## Milestone 3 — Exact block composition seed family

### Goal
Construct large-horizon incumbents by composing exact solver5 blocks.

### Deliverables

- seed builder that composes one or more exact atoms
- support for:
  - `k * w0`
  - `k * w0 + r` with optional tail atom/prefix
- overlap scoring over composed blocks
- initial seed diagnostics:
  - block list
  - relabeling summary
  - pair multiplicity histogram before local search

### Design notes

A composed seed is a schedule plus overlap accounting. Keep the builder deterministic when seed and policy are fixed.

Initial composition policy:

1. choose the largest exact atom available for `(g,p)`
2. fill as many full copies as possible
3. handle remainder with a second atom or leave to a later heuristic tail

### Exit criteria

- `8-4-20` can be seeded from two `8-4-10` atoms
- composition respects full-partition semantics and pure-SGP validity
- a same-label duplicated-block baseline is available for comparison

---

## Milestone 4 — Relabeling search over blocks

### Goal
Choose player permutations across blocks that minimize pair-overlap damage.

### Deliverables

- baseline relabeling modes:
  - identity
  - random
  - greedy incremental
- improved relabeling search:
  - hill climbing / local search on permutations
  - optional multi-start
- objective functions for relabeling:
  - minimize linear overlap damage
  - optionally minimize convex damage
  - optionally minimize max pair multiplicity first
- tests and benchmark fixtures centered on `8-4-20`

### Design notes

This is the core solver6 insight. Treat exact blocks as coverage atoms over the pair universe and optimize the overlap pattern.

A practical internal representation is:

- pair bitset or pair-count vector per block
- permutation-applied coverage accounting
- fast incremental overlap recomputation where possible

### Exit criteria

- identity and random baselines exist
- greedy relabeling beats identity on `8-4-20`
- solver6 can report whether the seed reached the linear lower bound before local search

---

## Milestone 5 — Repeat-aware local search

### Goal
Polish composed seeds with same-week swap search under the pair-frequency objective.

### Deliverables

- local search state built on `PairFrequencyState`
- same-week cross-group swap neighborhood
- move delta evaluation against pair-repeat score
- repeat-aware tabu memory
- breakout/diversification after stagnation
- best-so-far tracking and telemetry

### Reuse policy

Reuse ideas from solver4 and solver3 where sound, but do **not** drag solver6 back to paper-conflict semantics.

Safe ideas to transplant:

- week-local swapped-pair tabu
- short breakout after stagnation
- deterministic seeded RNG handling

Do not reuse blindly:

- solver4’s conflict-position primary objective
- paper-specific greedy-constructor assumptions

### Exit criteria

- local search never violates full-partition validity
- accepted moves update score deltas correctly
- search can improve at least one nontrivial impossible-case seed in tests

---

## Milestone 6 — Tail handling and heuristic extension

### Goal
Handle `k * w0 + r` cases where exact atoms do not tile the horizon cleanly.

### Deliverables

- policy for attaching remainder blocks
- optional heuristic tail week generation using pair-frequency score rather than paper conflict count
- mixed seed families:
  - exact blocks + exact prefix
  - exact blocks + heuristic tail

### Exit criteria

- solver6 can produce reasonable seeds for cases not divisible by the dominant exact atom length
- seed quality is benchmarked separately from local-search quality

---

## Milestone 7 — Benchmarks, docs, and reporting

### Goal
Turn solver6 into an honest measured solver family instead of a promising prototype.

The reporting direction for this milestone is now defined in:

- `backend/core/src/solver6/MATRIX_REPORTING.md`

### Deliverables

- benchmark suite for exact and impossible pure-SGP cases
- a per-`(g,p,w)` analytics artifact that records:
  - seed metrics
  - post-search metrics
  - linear lower bound / gap
  - squared lower bound / gap
  - selected seed family
  - execution status and runtime
- an HTML matrix report modeled after the solver5 report, but with solver6 semantics:
  - outer `(g,p)` matrix
  - per-cell headline frontier label
  - embedded `10x10` week mini-matrix for weeks `1..100`
  - click-through enlarged detail analytics per outer cell
  - separate linear and squared report layers
- docs updates describing:
  - exact handoff behavior
  - impossible-case objective semantics
  - seed families
  - relabeling strategy
  - benchmark/report semantics for contiguous frontier vs best observed hit

### Required benchmark set

At minimum include:

- exact cells already solved by solver5
- `8-4-20`
- non-multiple mixed-tail cases such as `8-3-21`
- several `(g,p,2*w0)` and `(g,p,3*w0)` cases when exact `w0` atoms exist
- a small case where duplicated identity blocks are obviously suboptimal
- at least one case like `6-6-3` frontier extension where unused-pair mass is large

### Required report semantics

The milestone is not done with a flat CSV-style benchmark dump.
It must produce a matrix report that answers:

- for each `(g,p)`, which weeks `1..100` hit the linear lower bound?
- which of those are exact zero-repeat weeks?
- where does squared-lower-bound attainment agree or differ?
- how much of the final quality came from the seed vs the local search?

The primary headline per outer cell should be:

- contiguous frontier `F`
- optional best observed hit `B` when `B > F`
- `≥100` only when all tested weeks through cap `100` hit

This keeps the report solver5-like at a glance while still exposing the real
three-dimensional week-sweep behavior inside each cell.

---

## 6. Testing strategy

Solver6 needs layered tests.

### Unit tests

- pair indexing
- full rescoring
- delta scoring for swaps
- relabeling objective correctness
- lower-bound calculations

### Seed tests

- exact handoff remains exact
- block composition builds valid schedules
- relabeling improves over identity on targeted fixtures

### Search tests

- local search preserves validity
- tabu and breakout behave deterministically under fixed seed
- score never lies after accepted move sequences

### Integration tests

- end-to-end solver6 exact request
- end-to-end impossible request returns nonzero but honest best score once implemented

### Benchmark regression tests

- keep at least one golden impossible-case seed quality check
- keep at least one golden search-improvement check

---

## 7. Risks and controls

## Risk: pair-delta bugs in local search

### Control
Build a mandatory recompute-vs-delta assertion mode in tests and optionally in debug builds.

## Risk: solver5 atom extraction duplicates router logic

### Control
Expose explicit solver5 atom APIs instead of reimplementing family selection in solver6.

## Risk: relabeling search is too slow

### Control
Implement staged baselines:

1. identity
2. random multi-start
3. greedy incremental
4. hill-climbing only if justified by benchmarks

## Risk: objective drift between seed scoring and search scoring

### Control
Use one canonical `PairFrequencyState` and one score function family throughout.

---

## 8. Immediate recommended order

Recommended implementation order:

1. Milestone 1 — pair scoring foundation
2. Milestone 2 — solver5 atom extraction API
3. Milestone 3 — exact block composition
4. Milestone 4 — relabeling search baselines
5. Milestone 5 — repeat-aware local search
6. Milestone 6 — tail handling
7. Milestone 7 — benchmarks and docs

This order gets the highest-value `8-4-20` and similar cases into the repo quickly while preserving truthful architecture.

---

## 9. Definition of done for solver6 v1

Solver6 v1 is done when all of the following are true:

1. exact pure-SGP requests still hand through solver5 honestly
2. impossible pure-SGP requests are scored by an explicit pair-repeat objective
3. solver6 can build composed seeds from exact solver5 atoms
4. relabeling search demonstrably beats identity duplication on representative impossible cases
5. local search can further improve at least some composed seeds
6. docs, tests, and benchmarks make those claims verifiable
