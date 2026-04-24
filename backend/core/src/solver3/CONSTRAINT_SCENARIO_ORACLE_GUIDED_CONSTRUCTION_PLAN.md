# Solver3 constraint-scenario + oracle-guided construction plan

## Status

Design note only. Not implemented.

This document defines a candidate **automatic repeat-aware construction heuristic** for `solver3`.
Its purpose is to give `solver3` a much stronger incumbent on repeat-sensitive workloads without teaching it constraint-specific bootstrap rules.

The heuristic is designed under the conceptual assumption that we have a **perfect pure `g-q-w` oracle** for Social-Golfer-shaped subproblems.
In production, `solver6` is the intended first backend for that oracle role, but the heuristic should be defined independently of any current solver6 limitations.

---

## Goal

Build the best possible `solver3` incumbent for the **full GroupMixer solution space** by combining:

1. the structure induced by the real constraints and non-repeat objectives, and
2. the contact-dispersion structure suggested by a pure SGP oracle.

The key requirement is:

> the heuristic must generalize through a small set of reusable structural signals, not through hand-written logic for each constraint type.

---

## High-level idea

When repeat minimization matters, the constructor should work in two conceptual layers:

1. **Constraint Scenario (`CS`) layer**
   - solve the real problem while ignoring the repeat objective
   - learn what the constraints and stronger non-repeat preferences naturally want

2. **Oracle layer**
   - use a pure `g-q-w` oracle to propose high-quality contact geometry
   - inject that geometry only where the `CS` structure appears flexible enough to accept it

The resulting incumbent should:

- preserve the rigid structure that the real problem strongly prefers
- improve contact spread in the flexible region
- stay fully inside `solver3`'s real feasible/repairable space

This is **not** a separate orchestrator and **not** a user-configurable projection system.
It is one automatic constructor family inside `solver3`.

---

## When to use this heuristic

This heuristic should run only when repeat minimization is materially relevant.

Examples where it should **not** run:

- there is no repeat-encounter limit or repeat-oriented objective term
- repeat pressure exists syntactically but has zero or negligible effective weight
- the scenario is so small or so irregular that oracle guidance cannot plausibly help

When repeat pressure is irrelevant, `solver3` should use a different constructor entirely.

---

## Non-negotiable design rules

### 1. No constraint-type special cases in the heuristic core
The heuristic must not say:

- "if attribute balance, do X"
- "if should-stay-together, do Y"
- "if partial attendance, do Z"

Instead, it should infer structure from the full-objective warmup scaffold and derived signals.

### 2. Automatic internal behavior
The user should not choose:

- which constraints are ignored during bootstrap
- which people are projected into the oracle
- whether the oracle result becomes an incumbent or an advisory seed

Those choices belong to the constructor's internal heuristic.

### 3. Oracle output is a prior, not sacred truth
The oracle provides valuable contact structure.
It does **not** define the final schedule directly.

### 4. The heuristic must degrade gracefully
If the oracle path is not useful for a case, the constructor should still return the best feasible `CS`-derived incumbent it has already built.
That return path is part of the algorithm, not a hidden fallback to an unrelated constructor.

### 5. Real feasibility remains owned by `solver3`
All hard constraints and the final objective remain defined by the real GroupMixer problem.
The oracle only influences construction bias.

---

## Conceptual decomposition

## 1. Constraint Scenario (`CS`)

`CS` now denotes the constructor scaffold structure learned from a short full-objective solver3 warmup over the **real problem structure**.

`CS` keeps the complete real problem:

- all real hard constraints
- all real participation/capacity structure
- all real soft constraints/objectives
- repeat/contact pressure

The purpose of `CS` is not to be the final schedule. Its purpose is to provide a strong real
solver3 incumbent whose structure can be selectively rewritten by the oracle path.

### Strong vs weak non-repeat structure

The constructor should not rely on a manual constraint taxonomy.
Instead, it should infer structural strength empirically.

A pattern counts as **strong structure** when it is both:

- present in the full-objective warmup scaffold, and/or
- backed by explicit hard structure such as immovable placements or active must-stay cliques

This keeps the heuristic constraint-agnostic without inventing per-constraint bridge logic.

---

## 2. Full-objective warmup scaffold

The constructor should first obtain a real solver3 structure, not a fake repeat-blind basin.
It does this by:

1. building the baseline schedule,
2. running normal solver3 full-objective search on the full problem for a short warmup budget,
3. using the resulting solver3 schedule as `S_cs`.

Warmup budget policy:

`warmup_budget = min(total_constructor_budget / 2, 1 second)`

The current implementation uses one warmup run and the resulting schedule directly. Solver3's
search engine already returns/loads its best state, so the oracle constructor does not maintain a
separate best-schedule tracker.

---

## 3. Signals learned from the warmup scaffold

The constructor should learn a small set of structural signals from `S_cs`.
These are the heart of the design.

### 3.1 Session pair pressure
For each session `s` and pair `(i, j)`:

`C^s_ij = 1.0 if i and j are grouped together in session s in S_cs, else 0.0`

Interpretation:

- high `C^s_ij` => the warmup scaffold currently uses the pair in session `s`
- low `C^s_ij` => the warmup scaffold currently separates them in session `s`
- with one scaffold this is a contact prior, not a consensus estimate

This is more useful than one global `P_ij` because many constraints are session-local.

### 3.2 Placement histogram
For each person `i`, session `s`, group `g`:

`H^s_i,g = 1.0 if i is assigned to g in session s in S_cs, else 0.0`

Interpretation:

- one-hot placement => scaffold placement prior
- this is not by itself a hard structural anchor

### 3.3 Person/session rigidity
For the single-scaffold implementation, rigidity stays neutral/flexible unless backed by real
structural constraints such as immovable placements or active must-stay cliques. A one-hot warmup
placement does **not** make a person/session rigid by itself.

### 3.4 Optional pair impossibility / hostility score
If useful, derive an auxiliary score capturing how often `(i, j)` is impossible or very costly under `CS`-guided repair.
This can help the oracle projector avoid spending important oracle edges on structurally bad pairs.

---

## 4. Base scaffold from warmup

Take `S_cs` from the full-objective warmup as the initial scaffold.

Do **not** freeze it wholesale.
Instead, classify its placements into:

- **rigid placements**: high confidence + expensive to disrupt
- **flexible placements**: acceptable candidates for oracle-guided restructuring

The scaffold is therefore:

- a full feasible schedule from `CS`
- plus a mask describing which regions are safe to rewrite

This is how the heuristic stays general:
- rigid structure comes from the real constraints
- flexible structure becomes the target for repeat-aware improvement

---

## 5. Capacity-template candidate

The constructor must find a pure-SGP-shaped subproblem inside the flexible region.

A v1 heuristic should search for one rectangular block:

- people subset `U`
- session subset `T`

such that:

- each person in `U` participates in every session in `T`
- the residual free capacity over `T` can host `U` as a pure `g-q-w` block
- the chosen placements are mostly flexible under the scaffold mask
- the block is large enough to matter for repeat quality

### Selection objective
Choose `(U, T)` to maximize a value like:

`oracle_value(U, T) = contact_opportunities * average_flexibility * repeat_importance - scaffold_disruption_risk`

Interpretation:

- large blocks are good
- flexible blocks are good
- repeat-rich blocks are good
- blocks that tear through rigid `CS` structure are bad

This is the place where the constructor decides whether oracle injection is worth doing.

If no worthwhile oracle template exists, fail explicitly in the strict development path.

---

## 6. Pure oracle solve

Solve the selected pure template `(sessions, groups, group_size)` using a `PureStructureOracle`.

Conceptually, the oracle returns a high-quality pure schedule for that `g-q-w` block.
In implementation, the first backend should be `solver6`, but the constructor logic should treat the oracle as an abstract provider.

The oracle result is valuable because it gives:

- low-repeat contact geometry
- good week-level cohort structure
- a high-quality way to spend contact opportunities

It is **not** copied directly into the real schedule.

---

## 7. Projecting the oracle against the `CS` signals

The oracle schedule exists over abstract roles.
We need to map real people in `U` onto those roles.

### 7.1 Oracle-role to optional real-person projection
Find a permutation `π` that maximizes alignment between oracle edges and `CS` pair pressure:

`sum over sessions s in T of sum over oracle pair edges (u, v) in session s of C^s_{π(u), π(v)}`

This means:

- spend oracle contact edges on real pairs that `CS` already likes or tolerates
- avoid spending oracle edges on pairs that `CS` strongly resists

### 7.2 Session-local group label alignment
The oracle's group labels are abstract.
For each session `s`, choose a mapping `σ_s` from oracle groups to real groups that best matches the scaffold placement histograms:

`sum over assigned people u of H^s_{π(u), σ_s(group_of_u_in_oracle)}`

This means:

- keep oracle cohorts aligned with the real scaffold geometry where possible

### 7.3 Rigidity-aware penalty
Projection should pay an explicit penalty when a very rigid `(i, s)` would have to move far from its scaffold role.
Rigid people should absorb less of the oracle structure than flexible people.

---

## 8. Merge phase: construct the real schedule around both priors

This is the most important implementation choice.

The merge phase should **not** simply overwrite the scaffold with the projected oracle and then repair the damage.
Instead, it should run a guided reconstruction or restricted local search whose objective combines:

- the real full problem score
- oracle agreement
- scaffold agreement

Conceptually:

`F_merge = F_full + μ_oracle * oracle_agreement + μ_scaffold * scaffold_agreement`

Where:

- `F_full` is the real solver3 objective
- `oracle_agreement` rewards realizing oracle edges/cohorts in the projected template region
- `scaffold_agreement` discourages needless destruction of good `CS` structure

### Merge mechanics
A practical v1 should:

1. start from `S_cs`
2. unfreeze the projected template region
3. run a short restricted reconstruction / repair loop on that region only
4. decay `μ_oracle` and `μ_scaffold` over time
5. stop when the real full objective no longer improves materially

This produces a true GroupMixer incumbent, not an oracle clone.

---

## 9. Final polish and handoff to normal solver3 search

Once the merge phase has ended:

- drop the oracle/scaffold priors
- evaluate under the real full objective only
- run a short polish if useful
- hand off to normal solver3 search with the merged schedule as the incumbent

The full search phase remains unchanged in semantics.
The new heuristic is only about producing a much stronger starting point.

---

## Why this design generalizes well

Because it reduces the whole construction problem to a small set of reusable abstractions:

- full-objective warmup scaffold => what solver3 can already make work on the real problem
- structural freeze mask => what is actually unsafe to rewrite
- session pair pressure => which pairings the scaffold currently uses
- oracle schedule => how to spend contact opportunities well

That means new constraint types affect the constructor automatically by changing the warmup scaffold and derived statistics.
The heuristic does not need bespoke bridge logic for each new constraint type.

---

## Why this is better than the current constructor family

Compared with the current baseline and freedom-aware constructors, this design:

- reasons about the **real constraint basin** before trying to optimize repeat structure
- uses oracle structure only where the problem appears flexible enough to accept it
- treats pure-SGP structure as a reusable prior rather than an all-or-nothing compatibility gate
- gives `solver3` a path to benefit from solver6-derived structure on mixed, constrained, real-world cases

---

## Failure and degrade policy

This heuristic should return the best result it has reached along its own pipeline.

That means the declared output order is:

1. merged scaffold + oracle incumbent, if successful and beneficial
2. otherwise the best feasible scaffold from `CS`
3. if `CS` itself cannot construct a feasible schedule, fail explicitly

Important:
- this is not a hidden fallback to a different constructor family
- the `CS` scaffold is the heuristic's own first-stage product

---

## Implementation plan

## Phase 0 — explicit plan surface and metrics

### Goal
Create the scaffolding needed to implement and evaluate the heuristic honestly.

### Tasks
- add a new experimental solver3 construction mode for this heuristic
- keep the rollout explicit and opt-in at first
- define benchmark questions before implementation
- add telemetry placeholders for each major phase

### Required telemetry
- `cs_run_count`
- `cs_best_score`
- `cs_diversity`
- `rigid_placement_count`
- `flexible_placement_count`
- `oracle_template_mapped_people`
- `oracle_template_sessions`
- `oracle_template_groups`
- `oracle_projection_score`
- `merge_improvement_over_cs`
- `constructor_wall_ms`

### Acceptance criteria
- config can select the heuristic explicitly
- benchmark/reporting surfaces can expose the new constructor path

---

## Phase 1 — full-objective warmup scaffold

### Goal
Build a strong real solver3 scaffold before oracle injection.

### Tasks
- build the baseline schedule
- run normal solver3 search on the full problem/objective
- budget the warmup as `min(total_constructor_budget / 2, 1s)`
- use the returned solver3 schedule directly as `S_cs`
- keep this implementation entirely inside solver3; no user projection knobs

### Implementation notes
- current implementation performs one warmup run
- no separate best-state tracking is needed; solver3 search returns/loads the best state
- if the configured total budget is zero, use the baseline scaffold without warmup

### Acceptance criteria
- `S_cs` is a feasible full-objective solver3 schedule
- warmup cost is bounded and predictable

---

## Phase 2 — structural signal extraction

### Goal
Turn the warmup scaffold into reusable construction statistics.

### Tasks
- compute session pair pressure `C^s_ij`
- compute placement histogram `H^s_i,g`
- derive rigidity scores `R^s_i`
- optionally compute pair hostility / disruption estimates

### Implementation notes
- store signals in dense indexed arrays where possible
- single-scaffold pair pressure and placement histograms are one-hot priors
- rigidity stays neutral/flexible unless backed by real structural constraints
- prefer session-local signals over only global summaries

### Acceptance criteria
- signals are inspectable in tests/telemetry
- rigid vs flexible placements look sensible on hand-built cases

---

## Phase 3 — scaffold extraction

### Goal
Produce the first real incumbent and determine which parts are safe to rewrite.

### Tasks
- take `S_cs` as the scaffold
- classify placements into rigid and flexible regions
- avoid freezing structure that is merely a one-run scaffold placement

### Implementation notes
- current hard-freeze sources are structural only: immovable placements and active must-stay cliques
- scaffold placement remains a soft prior for projection/merge

### Acceptance criteria
- scaffold remains feasible
- flexible mask is large enough on repeat-sensitive workloads to allow meaningful oracle injection
- rigid mask protects obviously forced structure

---

## Phase 4 — capacity-template generation

### Goal
Find one good pure-SGP-shaped capacity template.

### Tasks
- generate high-value pure templates `(sessions, groups, group_size)`
- verify the capacity and attendance signals needed for a pure `g-q-w` call
- score candidate templates by contact opportunity, attendance coverage, dummy burden, group pruning, and disruption risk

### Implementation notes
- v1 evaluates the top generated template only
- later work can extend this to top-K template evaluation or iterative peeling

### Acceptance criteria
- the generator finds useful templates on representative pure and mixed repeat-sensitive cases
- strict mode errors explicitly when no good template exists

---

## Phase 5 — abstract oracle interface + solver6 backend

### Goal
Define a clean pure-structure oracle seam and use solver6 as the first backend.

### Tasks
- define an internal oracle trait / API for pure `g-q-w` schedules
- build a solver6 adapter behind that interface
- ensure the heuristic is not tightly coupled to solver6 internals

### Implementation notes
- the constructor should be defined against a conceptual perfect oracle
- the first implementation should use solver6 exactly as a backend provider
- keep the interface schedule-oriented and deterministic-by-seed where claimed

### Acceptance criteria
- tests can stub the oracle
- solver6 can service the new construction mode through the oracle seam

---

## Phase 6 — projection and alignment

### Goal
Map real people and real groups onto oracle roles.

### Tasks
- implement oracle-role to optional-real-person projection against `C^s_ij`
- implement session-local group alignment against `H^s_i,g`
- add rigidity-aware mismatch penalties

### Implementation notes
- start with deterministic greedy or local-search projection
- only move to more elaborate assignment logic if benchmark evidence demands it

### Acceptance criteria
- projector improves alignment score over naive identity mapping on representative cases
- highly rigid placements are preserved more often than flexible ones

---

## Phase 7 — merge constructor / restricted repair loop

### Goal
Construct the real incumbent from scaffold + oracle prior.

### Tasks
- start from `S_cs`
- unfreeze the selected flexible region
- run restricted reconstruction / move-based repair under `F_merge`
- decay prior weights toward the real objective
- output the best merged feasible schedule

### Implementation notes
- v1 should focus on a small, explicit neighborhood set
- a bounded session-local repair loop is preferable to a huge construction rewrite initially
- the merge phase should stay inspectable and benchmarkable on its own

### Acceptance criteria
- merged schedule is feasible
- merged schedule materially improves repeat score over the raw scaffold often enough to justify the phase
- non-repeat damage remains bounded and honest

---

## Phase 8 — final handoff, tests, and benchmark review

### Goal
Make the heuristic measurable and safe to iterate on.

### Tasks
- hand merged incumbent to normal solver3 search
- add unit tests for each structural signal and alignment phase
- add integration tests on pure, mixed, and adversarial cases
- benchmark against:
  - baseline legacy constructor
  - freedom-aware constructor
  - raw `CS` scaffold without oracle merge
  - full heuristic

### Primary benchmark questions
1. does the heuristic improve starting repeat quality?
2. does it improve final quality after solver3 search?
3. does it help mixed constrained workloads, not just pure SGP?
4. when it loses, does the `CS` scaffold still provide a good degrade path?

### Acceptance criteria
- benchmark evidence shows meaningful wins on repeat-sensitive mixed workloads before any default rollout
- losses are diagnosable via telemetry rather than opaque

---

## Module layout

Construction heuristics now live under `solver_support/construction/`, with one directory per heuristic family:

- `backend/core/src/solver_support/construction/baseline/`
- `backend/core/src/solver_support/construction/freedom_aware/`
- `backend/core/src/solver_support/construction/constraint_scenario_oracle/`

The constraint-scenario oracle module should split internally into focused phase files:

- `scaffold_warmup.rs`
- `cs_signals.rs`
- `template_candidates.rs`
- `oracle_backend.rs`
- `projection.rs`
- `merge.rs`
- `diagnostics.rs`

Wiring remains primarily in:

- `backend/core/src/models.rs`
- `backend/core/src/solver3/runtime_state.rs`
- reporting / benchmark surfaces as needed

The heuristic is still solver3-oriented, but it lives next to the other construction heuristics so the construction surface has one coherent home.

---

## Suggested first milestones

If this work is pursued, the most sensible milestone order is:

1. full-objective warmup scaffold
2. single-scaffold signal extraction
3. scaffold mask
4. template candidate portfolio
5. oracle seam + solver6 backend
6. projection
7. bounded merge/repair phase
8. benchmark review

This order keeps the work inspectable and allows early stopping if the learned `CS` structure is not informative enough.

---

## Open questions

These are the main unresolved design points.

### 1. Is one warmup scaffold enough?
Current policy is one full-objective warmup. If this is too noisy later, add more warmup seeds only with evidence.

### 2. How should rigidity combine scaffold priors and disruption cost?
A one-hot scaffold placement is not rigidity by itself.

### 3. How should candidate pure blocks be enumerated efficiently?
The naive search space may be large.

### 4. Should oracle injection be one-shot or iterative?
V1 should be one-shot; later evidence can justify repetition.

### 5. How much of the merge phase should be construction vs local search?
A bounded restricted local search is the most plausible first implementation.

---

## Recommended initial claim

The heuristic should be described internally as:

> a repeat-aware universal constructor for solver3 that first gets a short full-objective solver3 warmup scaffold, then injects oracle-quality pure-SGP contact structure into the flexible part of that real basin before normal search begins.

That is the intended design target.
