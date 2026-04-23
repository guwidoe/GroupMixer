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

Instead, it should infer structure from a repeat-blind `CS` ensemble.

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

Define a repeat-blind construction scenario over the **real problem structure**.

`CS` keeps:

- all real hard constraints
- all real participation/capacity structure
- all real non-repeat soft constraints/objectives

`CS` removes or neutralizes:

- the repeat-encounter objective/penalty terms

The purpose of `CS` is not to find the final schedule.
Its purpose is to reveal what the non-repeat part of the problem wants.

### Strong vs weak non-repeat structure

The constructor should not rely on a manual constraint taxonomy.
Instead, it should infer structural strength empirically.

A pattern counts as **strong structure** when it is both:

- repeatedly recovered across the `CS` ensemble, or
- expensive to disrupt under `CS`

This naturally captures the user's intuition that some soft terms are stronger than repeat pressure, without adding per-constraint settings.

---

## 2. `CS` ensemble rather than one `CS` solution

A single repeat-blind incumbent is too noisy.
The constructor should run several short diversified `CS` runs and learn from the ensemble.

Let:

- `S_1..S_K` be feasible `CS` schedules
- `S_cs_best` be the best `CS` schedule under the repeat-blind score
- `E` be a curated subset used for statistics

The ensemble is the main generalization trick.
It lets the constructor infer the structural basin of the real constraints without understanding them individually.

---

## 3. Signals learned from the `CS` ensemble

The constructor should learn a small set of structural signals.
These are the heart of the design.

### 3.1 Session pair pressure
For each session `s` and pair `(i, j)`:

`C^s_ij = weighted_frequency(i and j are grouped together in session s across E)`

Interpretation:

- high `C^s_ij` => `CS` likes or tolerates the pair in session `s`
- low `C^s_ij` => `CS` tends to separate them in session `s`
- mid `C^s_ij` => pairing is flexible / weakly determined

This is more useful than one global `P_ij` because many constraints are session-local.

### 3.2 Placement histogram
For each person `i`, session `s`, group `g`:

`H^s_i,g = weighted_frequency(i is assigned to g in session s across E)`

Interpretation:

- concentrated histogram => placement is structurally anchored
- diffuse histogram => placement is flexible

### 3.3 Person/session rigidity
For each `(i, s)`, derive rigidity from the entropy of `H^s_i,*` plus a local disruption test against `CS`.

High rigidity means:

- `CS` consistently wants `i` in a narrow placement pattern in session `s`
- moving `i` is likely to damage strong non-repeat structure

Low rigidity means:

- `i` can absorb oracle structure cheaply in session `s`

### 3.4 Optional pair impossibility / hostility score
If useful, derive an auxiliary score capturing how often `(i, j)` is impossible or very costly under `CS`-guided repair.
This can help the oracle relabeler avoid spending important oracle edges on structurally bad pairs.

---

## 4. Base scaffold from the best `CS` solution

Take `S_cs_best` as the initial scaffold.

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

## 5. Oracleizable flexible core

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

If no worthwhile oracleizable block exists, return the scaffold as the incumbent.

---

## 6. Pure oracle solve

Solve the selected pure block `(U, T)` using a `PureStructureOracle`.

Conceptually, the oracle returns a high-quality pure schedule for that `g-q-w` block.
In implementation, the first backend should be `solver6`, but the constructor logic should treat the oracle as an abstract provider.

The oracle result is valuable because it gives:

- low-repeat contact geometry
- good week-level cohort structure
- a high-quality way to spend contact opportunities

It is **not** copied directly into the real schedule.

---

## 7. Relabeling the oracle against the `CS` signals

The oracle schedule exists over abstract roles.
We need to map real people in `U` onto those roles.

### 7.1 Person-to-role relabeling
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
Relabeling should pay an explicit penalty when a very rigid `(i, s)` would have to move far from its scaffold role.
Rigid people should absorb less of the oracle structure than flexible people.

---

## 8. Merge phase: construct the real schedule around both priors

This is the most important implementation choice.

The merge phase should **not** simply overwrite the scaffold with the relabeled oracle and then repair the damage.
Instead, it should run a guided reconstruction or restricted local search whose objective combines:

- the real full problem score
- oracle agreement
- scaffold agreement

Conceptually:

`F_merge = F_full + μ_oracle * oracle_agreement + μ_scaffold * scaffold_agreement`

Where:

- `F_full` is the real solver3 objective
- `oracle_agreement` rewards realizing oracle edges/cohorts in the flexible core
- `scaffold_agreement` discourages needless destruction of good `CS` structure

### Merge mechanics
A practical v1 should:

1. start from `S_cs_best`
2. unfreeze the oracleizable flexible region
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

- `CS` ensemble => what the non-repeat part of the problem wants
- rigidity => what is expensive to rewrite
- session pair pressure => which pairings are structurally cheap or natural
- oracle schedule => how to spend contact opportunities well

That means new constraint types affect the constructor automatically by changing the `CS` ensemble and the derived statistics.
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
- `oracle_block_people`
- `oracle_block_sessions`
- `oracle_block_groups`
- `oracle_relabel_score`
- `merge_improvement_over_cs`
- `constructor_wall_ms`

### Acceptance criteria
- config can select the heuristic explicitly
- benchmark/reporting surfaces can expose the new constructor path

---

## Phase 1 — repeat-blind `CS` runner

### Goal
Build the repeat-blind scenario and generate a short diversified ensemble.

### Tasks
- add a way to compile or score the same input with repeat terms removed/neutralized
- run several short solver3 construction/search passes under `CS`
- retain best + diverse incumbents
- keep this implementation entirely inside solver3; no user projection knobs

### Implementation notes
- start with small `K` and short budgets
- the goal is structure extraction, not perfect `CS` optimization
- diversification can come from seed variation and small constructor/search perturbations

### Acceptance criteria
- `CS` produces several feasible schedules on representative mixed workloads
- those schedules are stable enough to expose useful structural patterns

---

## Phase 2 — structural signal extraction

### Goal
Turn the `CS` ensemble into reusable construction statistics.

### Tasks
- compute session pair pressure `C^s_ij`
- compute placement histogram `H^s_i,g`
- derive rigidity scores `R^s_i`
- optionally compute pair hostility / disruption estimates

### Implementation notes
- store signals in dense indexed arrays where possible
- use weighted ensemble aggregation, not a plain unweighted average if score gaps are large
- prefer session-local signals over only global summaries

### Acceptance criteria
- signals are inspectable in tests/telemetry
- rigid vs flexible placements look sensible on hand-built cases

---

## Phase 3 — scaffold extraction

### Goal
Produce the first real incumbent and determine which parts are safe to rewrite.

### Tasks
- take `S_cs_best` as the scaffold
- classify placements into rigid and flexible regions
- add a disruption estimator to avoid freezing structure that is merely accidental

### Implementation notes
- combine ensemble consistency with local `CS` score-drop probes
- v1 can use a simple threshold on a combined rigidity score

### Acceptance criteria
- scaffold remains feasible
- flexible mask is large enough on repeat-sensitive workloads to allow meaningful oracle injection
- rigid mask protects obviously forced structure

---

## Phase 4 — oracleizable block selection

### Goal
Find one good pure-SGP-shaped flexible core.

### Tasks
- search the flexible region for a high-value pure block `(U, T)`
- verify the residual capacity and attendance conditions needed for a pure `g-q-w` call
- score candidate blocks by contact opportunity, flexibility, and disruption risk

### Implementation notes
- v1 should support only one rectangular block
- later work can extend this to multiple blocks or iterative peeling

### Acceptance criteria
- the selector finds useful blocks on representative pure and mixed repeat-sensitive cases
- the selector declines gracefully when no good block exists

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

## Phase 6 — relabeling and alignment

### Goal
Map real people and real groups onto oracle roles.

### Tasks
- implement person-to-role relabeling against `C^s_ij`
- implement session-local group alignment against `H^s_i,g`
- add rigidity-aware mismatch penalties

### Implementation notes
- start with deterministic greedy or local-search relabeling
- only move to more elaborate assignment logic if benchmark evidence demands it

### Acceptance criteria
- relabeler improves alignment score over naive identity mapping on representative cases
- highly rigid placements are preserved more often than flexible ones

---

## Phase 7 — merge constructor / restricted repair loop

### Goal
Construct the real incumbent from scaffold + oracle prior.

### Tasks
- start from `S_cs_best`
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

## Suggested module layout

A likely first layout is:

- `backend/core/src/solver3/construction/constraint_scenario_oracle.rs`
- `backend/core/src/solver3/construction/cs_ensemble.rs`
- `backend/core/src/solver3/construction/cs_signals.rs`
- `backend/core/src/solver3/construction/oracle_block.rs`
- `backend/core/src/solver3/construction/oracle_relabel.rs`
- `backend/core/src/solver3/construction/oracle_merge.rs`

And minimal wiring changes in:

- `backend/core/src/models.rs`
- `backend/core/src/solver3/runtime_state.rs`
- reporting / benchmark surfaces as needed

The heuristic should remain a solver3-owned construction path rather than another shared baseline constructor in `solver_support/`.

---

## Suggested first milestones

If this work is pursued, the most sensible milestone order is:

1. `CS` ensemble runner
2. signal extraction
3. scaffold mask
4. single-block selector
5. oracle seam + solver6 backend
6. relabeling
7. one bounded merge phase
8. benchmark review

This order keeps the work inspectable and allows early stopping if the learned `CS` structure is not informative enough.

---

## Open questions

These are the main unresolved design points.

### 1. How many `CS` runs are enough?
Tradeoff between signal quality and constructor cost.

### 2. How should rigidity combine consistency and disruption cost?
A pure entropy score is probably too weak by itself.

### 3. How should candidate pure blocks be enumerated efficiently?
The naive search space may be large.

### 4. Should oracle injection be one-shot or iterative?
V1 should be one-shot; later evidence can justify repetition.

### 5. How much of the merge phase should be construction vs local search?
A bounded restricted local search is the most plausible first implementation.

---

## Recommended initial claim

The heuristic should be described internally as:

> a repeat-aware universal constructor for solver3 that first learns the constraint-induced basin from repeat-blind runs, then injects oracle-quality pure-SGP contact structure into the flexible part of that basin before normal search begins.

That is the intended design target.
