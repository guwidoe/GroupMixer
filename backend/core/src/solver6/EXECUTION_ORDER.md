# Solver6 Execution Order

This document defines the recommended execution order for implementing `solver6`.

It is intentionally more operational than `IMPLEMENTATION_PLAN.md`:

- `IMPLEMENTATION_PLAN.md` explains the architecture and milestone structure
- `EXECUTION_ORDER.md` defines **what to do first, what depends on what, and what should not be started prematurely**

---

## Guiding rule

Implement `solver6` from the **inside out**:

1. canonical scoring first
2. explicit construction-atom extraction second
3. seed construction third
4. relabeling optimization fourth
5. local search fifth
6. mixed-tail handling sixth
7. benchmark/reporting/docs last

This order is mandatory unless a concrete blocker forces a local reorder.

Why:

- relabeling is meaningless without canonical pair-repeat scoring
- seed construction should not duplicate solver5 routing logic
- local search should not be built before seed quality is inspectable
- benchmarking should not start before execution semantics are stable

---

## Phase 0 — Already done

These are complete and should not be reopened except for bugfixes:

- solver6 registration and typed config
- pure-SGP validation scaffold
- exact solver5 handoff
- reserved failure path for unimplemented hybrid phases
- initial architecture docs

Relevant existing files:

- `backend/core/src/solver6/mod.rs`
- `backend/core/src/solver6/problem.rs`
- `backend/core/src/solver6/scaffolding.rs`
- `backend/core/src/solver6/ARCHITECTURE.md`
- `backend/core/src/solver6/IMPLEMENTATION_PLAN.md`

---

## Phase 1 — Canonical scoring foundation

### Execute first

Primary todo:
- `TODO-87f93ae0` — Implement solver6 pair-frequency scoring foundation

### Why first

Everything else depends on one authoritative answer to:

- how pair frequencies are represented
- how repeat penalties are computed
- how lower bounds are derived
- how seed quality and search quality are measured

### Required outputs before moving on

- canonical pair indexing
- full rescoring for complete schedules
- support for all configured penalty models
- telemetry hooks:
  - max pair frequency
  - multiplicity histogram
  - distinct pairs covered
  - linear lower-bound gap
- unit tests with hand-checked schedules

### Do not start before this is done

Do **not** start:
- relabeling objective work
- local-search delta scoring
- seed-quality benchmark reporting

They all depend on this phase.

---

## Phase 2 — Explicit solver5 atom extraction

### Execute second

Primary todo:
- `TODO-bdab7d24` — Add explicit solver5 atom extraction API for solver6

### Why second

Solver6’s seed family is built out of exact or prefix `solver5` construction atoms.

That means solver6 needs a truthful API for:

- exact atoms
- prefix atoms
- associated metadata

This must be explicit and router-backed.

### Required outputs before moving on

- typed atom query API in solver5
- exact/prefix atom extraction
- provenance and supported-week metadata
- tests showing solver6 can request atoms without abusing solver5’s public solve path

### Do not start before this is done

Do **not** implement real exact-block composition against ad hoc internal knowledge of solver5.

If atom extraction is unclear, fix that layer first.

---

## Phase 3 — Exact-block seed baseline

### Execute third

Epic:
- `TODO-10af8d9c` — EPIC: Build solver6 exact-block composition seed family

### Sub-order inside this phase

1. `TODO-97801165` — Define solver6 seed module layout and typed seed diagnostics
2. `TODO-98354a3e` — Implement solver6 identity exact-block composition baseline
3. `TODO-ed2eadc6` — Add solver6 seed composition diagnostics and validation tests

### Why this phase comes before relabeling

Before optimizing relabelings, solver6 needs a valid baseline seed:

- exact atoms composed with identity relabeling
- valid full schedule output
- inspectable diagnostics

Without that baseline, relabeling improvement is hard to measure honestly.

### Required outputs before moving on

- `solver6/seed/` module exists
- valid identity-composed block seed for cases like `8-4-20`
- schedule validation tests pass
- seed diagnostics are inspectable independently of search

### Do not start before this is done

Do **not** implement greedy relabeling search before identity-composed seed generation is working.

---

## Phase 4 — Relabeling search

### Execute fourth

Epic:
- `TODO-e8908640` — EPIC: Implement solver6 block relabeling search

### Sub-order inside this phase

1. `TODO-82a681ff` — Add solver6 relabeling objective over composed blocks
2. `TODO-6ee74121` — Implement solver6 identity and random relabeling baselines
3. `TODO-a762362e` — Implement solver6 greedy relabeling search

### Why this phase comes before local search

Relabeling is the first major solver6-specific optimization layer.

It can often produce a huge quality jump **before** same-week swap search even begins.

This is especially important for cases like:

- `8-4-20`
- `2*w0` extensions of known exact atoms
- cases where the linear lower bound may already be reachable by good block overlap management

### Required outputs before moving on

- relabeling objective uses canonical score semantics
- identity baseline
- random baseline
- greedy relabeling optimizer
- evidence that relabeling beats identity on target cases

### Do not start before this is done

Do **not** spend time tuning local search on a weak identity-only seed if the relabeling layer is still missing.

The intended solver6 architecture gets most of its first leverage from seed quality.

---

## Phase 5 — Repeat-aware local search

### Execute fifth

Epic:
- `TODO-8e3de898` — EPIC: Implement solver6 repeat-aware local search core

### Sub-order inside this phase

1. `TODO-999ef125` — Build solver6 local-search state and recompute-vs-delta guardrails
2. `TODO-96c537fe` — Implement solver6 same-week swap neighborhood and move scoring
3. `TODO-a8d9ba4d` — Add solver6 tabu/aspiration repeat-aware memory
4. `TODO-429690c8` — Add solver6 breakout and search telemetry

### Why this phase comes after relabeling

Search polishing should improve a strong seed, not rescue a weak seed.

By this phase, solver6 should already have:

- canonical pair scoring
- truthful solver5 atoms
- valid exact-block composition
- nontrivial relabeling improvement

Now local search can be built around that foundation.

### Required outputs before moving on

- stable search state
- recompute-vs-delta correctness harness
- same-week swap move scoring
- repeat-aware tabu / aspiration
- breakout and telemetry
- at least one case where search improves a relabeled seed

### Do not start before this is done

Do **not** add mixed-tail complexity before core local search can already improve mainline composed seeds.

---

## Phase 6 — Tail handling and mixed seeds

### Execute sixth

Epic:
- `TODO-444eb4d6` — EPIC: Add solver6 tail-handling and mixed-seed support

### Sub-order inside this phase

1. `TODO-b9575865` — Implement solver6 exact/prefix tail attachment policy
2. `TODO-93db51f8` — Implement solver6 heuristic tail generator
3. `TODO-2f1371d2` — Compare solver6 mixed seeds against pure block duplication

### Why this phase is later

This phase handles non-clean-multiple horizons.

It is important, but it should not block the highest-ROI path:

- exact frontier block composition
- relabeling
- local search on those composed seeds

### Required outputs before moving on

- `k * w0 + r` support is explicit
- remainder attachment is inspectable
- heuristic tail generation is scored honestly
- mixed-seed comparisons exist

### Do not start before this is done

Do **not** finalize benchmark claims for solver6 impossible-case performance until mixed tails are either implemented or explicitly declared out of scope.

---

## Phase 7 — Benchmarks, reporting, docs

### Execute last

Epic:
- `TODO-b01a0ea2` — EPIC: Benchmark and document solver6 impossible-case performance

### Sub-order inside this phase

1. `TODO-ece7359d` — Add solver6 benchmark matrix for exact and impossible cases
2. `TODO-5d7f2f73` — Report solver6 seed quality vs post-search quality
3. `TODO-96a00da0` — Document solver6 objective, seed, and search semantics

### Why last

Docs and benchmark narratives should describe the implemented solver, not a moving target.

This phase should happen once:

- scoring is stable
- seed composition is real
- relabeling is real
- local search is real
- mixed tails are at least addressed

### Required outputs to call solver6 v1 reviewable

- benchmark matrix checked in
- lower-bound-gap reporting for linear repeat excess
- seed vs post-search reporting
- docs aligned with actual implemented behavior

---

## Condensed execution order

If a single linear checklist is needed, use this exact order:

1. `TODO-87f93ae0` — pair-frequency scoring foundation
2. `TODO-bdab7d24` — solver5 atom extraction API
3. `TODO-97801165` — seed module layout and typed diagnostics
4. `TODO-98354a3e` — identity exact-block composition baseline
5. `TODO-ed2eadc6` — seed composition diagnostics and validation tests
6. `TODO-82a681ff` — relabeling objective over composed blocks
7. `TODO-6ee74121` — identity and random relabeling baselines
8. `TODO-a762362e` — greedy relabeling search
9. `TODO-999ef125` — local-search state and recompute-vs-delta guardrails
10. `TODO-96c537fe` — same-week swap neighborhood and move scoring
11. `TODO-a8d9ba4d` — tabu/aspiration repeat-aware memory
12. `TODO-429690c8` — breakout and search telemetry
13. `TODO-b9575865` — exact/prefix tail attachment policy
14. `TODO-93db51f8` — heuristic tail generator
15. `TODO-2f1371d2` — compare mixed seeds against pure block duplication
16. `TODO-ece7359d` — benchmark matrix for exact and impossible cases
17. `TODO-5d7f2f73` — report seed quality vs post-search quality
18. `TODO-96a00da0` — document solver6 semantics

---

## Priority shorthand

### Highest priority now

- `TODO-87f93ae0`
- `TODO-bdab7d24`
- `TODO-10af8d9c`

### Highest-value first end-to-end path

The first full solver6 value path should be:

1. scoring
2. atom extraction
3. identity block composition
4. relabeling objective
5. greedy relabeling
6. local-search core

This gets the `8-4-20` family online with the highest ROI.

---

## What to avoid

Do not:

- build local search before canonical scoring is complete
- duplicate solver5 family-selection logic inside solver6
- benchmark impossible-case performance before seed and search semantics stabilize
- let docs get ahead of real implementation
- treat epics as directly executable tasks without drilling into sub-todos

---

## Definition of execution-order compliance

Work is following the solver6 execution order if:

1. currently active work belongs to the earliest incomplete phase above
2. no later-phase task is started without an explicit blocker on the current phase
3. epic work is decomposed through its sub-todos rather than implemented as one opaque task

If these conditions stop being true, pause and re-triage before continuing.
