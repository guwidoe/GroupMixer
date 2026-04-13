# Solver3 Hotspot-Guided Search Plan

## Status

Proposed research/implementation plan for improving `solver3` search quality on hard plateau-heavy workloads such as the canonical Social Golfer benchmark.

This plan is intentionally scoped as a **phased solver-quality track**, not a one-shot rewrite. The primary goal is to improve search-space navigation **without destroying current hotpath performance**.

## Problem statement

Current `solver3` behavior on hard canonical workloads shows a repeated pattern:

- a decent incumbent is found quickly
- improvement then stalls for long stretches despite substantial remaining budget
- longer time budgets are often not used effectively

For Social Golfer specifically, this is **not** a move-family availability problem:

- `transfer` moves are infeasible because groups are already at capacity
- `clique_swap` moves are irrelevant when no cliques exist
- `swap` moves are theoretically sufficient to connect the feasible state space

So the issue is better stated as:

> `solver3` can likely reach good states with its current neighborhood, but it does not navigate that neighborhood intelligently enough once the easy improvements are exhausted.

The practical hypothesis is:

> search quality is being limited more by **unguided candidate selection, plateau wandering, and weak diversification** than by raw compute budget.

## Core design principle

The central idea is to add **hotspot-guided move generation** in a way that is:

- compatible with the current typed move-preview/apply architecture
- generic across constraint families where that is honest and affordable
- explicitly bounded so candidate selection cost does not demolish throughput
- incrementally maintainable on accepted moves
- allowed to be heuristic / approximate for guidance purposes

Important distinction:

- **score state must remain exact**
- **guidance state may be approximate, stale, bucketed, sampled, or periodically refreshed**

That distinction is what makes this feature performance-feasible.

## Non-goals

This plan does **not** attempt to:

- replace the current exact scoring model with heuristic scoring
- introduce a product-specific Social Golfer mode
- force all constraints into one universal pairwise blame matrix
- implement large composite move families first
- sacrifice hotpath throughput in exchange for theoretically nicer move selection

## Key conclusions from brainstorming

### 1. A universal `C_ij` cost-contribution matrix is likely the wrong abstraction

It sounds attractive to keep a generic matrix `C_ij` meaning "how much pair `(i,j)` contributes to total score", but this is likely not a good fit for the current constraint model.

Why:

- some constraints are naturally pairwise
- some are naturally person/session-local
- some are naturally group/session-local
- some higher-order constraints do not admit a clean, unambiguous pairwise blame decomposition
- forcing all pressure into pair-space risks expensive or semantically muddy updates

### 2. Multiple pressure views are the better generic abstraction

Instead of one universal matrix, the guidance layer should likely expose several pressure views:

- **pair pressure**
  - repeat encounter excess
  - forbidden-pair violations
  - should-together separation
  - pair-meeting pressure
- **person/session pressure**
  - immovable mismatch
  - person involved in many active conflicts
- **group/session pressure**
  - attribute imbalance
  - clique fragmentation
  - concentrated conflict burden
- **session pressure**
  - aggregate score burden by session

These views can coexist without pretending that all constraints are of the same shape.

### 3. Guidance must be cheap, bounded, and mostly incremental

The implementation must avoid naive designs like:

- rescanning all pairs every iteration
- rebuilding global rankings on every attempted move
- previewing large neighborhoods exhaustively
- storing exact dynamic priority structures that cost more than they save

Instead, the guidance layer should prefer:

- accepted-move-only incremental updates where possible
- bounded preview batches
- sparse active sets / buckets instead of exact global ordering where sufficient
- periodic refresh for stale heuristic state
- optional fallback to uniform/random sampling for exploration

### 4. Swap guidance is the first serious opportunity

On Social Golfer-like workloads, the first valuable implementation target is **guided swap generation**, not new move families.

This keeps the solver honest:

- same feasibility model
- same preview/apply kernels
- same exact scoring
- only a better proposal distribution

### 5. Composite or chain moves are lower-priority follow-up work

Ideas like multi-swap chains, ejection chains, or explicit GA-style operators may be valuable later, but they are:

- more complex to implement
- harder to validate generically
- harder to make fast

The better first move is to improve the quality of **which single swaps are proposed** and **how stagnation is handled**.

## High-level architecture

The recommended architecture is:

> exact runtime state + exact preview/apply scoring + lightweight pressure caches + bounded hotspot-guided candidate generation + stagnation-aware diversification

### Exact runtime state remains unchanged in principle

The existing exact runtime state remains the source of truth for:

- feasibility
- pair contacts
- exact score aggregates
- preview/apply deltas

### Add a separate guidance layer

The new guidance layer should be explicitly heuristic and non-authoritative.

It should answer questions like:

- which sessions look especially bad?
- which pairs are currently active offenders?
- which people are repeatedly involved in bad structures?
- which group/session slots are under pressure?

This layer should not decide correctness. It should only bias move generation.

## Performance constraints

These constraints are mandatory and should shape every phase:

1. **Do not materially regress swap hotpath throughput** without benchmark evidence that quality gains compensate.
2. **Do not add broad rescans to the per-iteration attempt path.**
3. **Do not require exact global top-k offender maintenance on every move.**
4. **Prefer accepted-move updates over attempted-move updates.**
5. **Cap guided candidate preview counts with explicit constants.**
6. **Preserve a fallback exploration path** so guidance does not overfit to one pressure signal.

## Proposed data model

This section is intentionally a design target, not a final API commitment.

### A. Pair-pressure structures

Used only for constraint families that are naturally pairwise.

Candidate structures:

- reuse existing exact `pair_contacts[pair_idx]`
- maintain sparse active sets or severity buckets for:
  - repeat-excess pairs
  - forbidden-pair violations
  - should-together violations
  - pair-meeting offenders
- optionally maintain per-person incident counts derived from these active pair sets

Preferred over an exact max-heap:

- sparse active set
- bucketed severity lists
- or periodically refreshed ranking buffers

Reason:

- cheaper updates
- simpler invalidation model
- no decrease-key complexity
- likely sufficient for guidance

### B. Session-pressure structures

Candidate structures:

- `session_pressure[session_idx]`
- approximate counts or weighted burden summaries
- optionally bucket sessions into pressure bands

### C. Group/session-pressure structures

Candidate structures:

- `group_session_pressure[group_session_slot]`
- attribute-imbalance burden
- clique fragmentation burden
- local conflict density heuristics

### D. Person-pressure structures

Candidate structures:

- `person_pressure[session, person]` or `person_pressure[person]`
- incident offender count
- count of active bad pair memberships
- local conflict burden summary

## Candidate-generation model

The sampler should evolve from:

- uniform random feasible move proposal

into a hybrid model:

- some fraction of proposals remain uniform/random
- some fraction are hotspot-guided

For hotspot-guided swap generation, the target sequence is:

1. choose a pressure view
2. choose an anchor from that view
3. generate a **small bounded candidate set** around that anchor
4. preview only that bounded set
5. pick the best candidate, or sample among top-ranked candidates

This is meant to improve the proposal distribution, not to exhaustively search neighborhoods.

### Example anchor patterns

#### Repeat encounter

- anchor = high-excess pair `(i, j)`
- choose a session where they currently meet
- generate swaps involving `i` or `j` with people from other groups in that session
- optionally bias toward target partners with low prior contact overlap

#### Forbidden pair

- anchor = violating pair in offending session
- generate swaps that separate one endpoint from the other while minimally disrupting other objectives

#### Should stay together

- anchor = separated pair in offending session
- generate swaps that move one endpoint closer to the other or move a third person out of the needed destination group

#### Attribute balance

- anchor = overloaded / underloaded group-session-value bucket
- generate swaps that reduce imbalance while preserving feasibility

#### Immovable

- anchor = misplaced person-session assignment
- generate swaps centered on repairing that person first

## Planned phases

## Phase 0 — Observability and acceptance criteria

### Goal

Measure the current failure mode precisely before changing behavior.

### Deliverables

- add solver-quality diagnostics for hard workloads
- expose telemetry needed to validate whether guided search is helping
- document baseline behavior for canonical workloads, especially Social Golfer

### Candidate telemetry additions

- best-score timeline enriched with stagnation episode counts
- accepted-move involvement in hotspot structures
- fraction of attempted moves touching active offender structures
- per-session burden summaries at selected checkpoints
- offender summaries for end-of-run diagnostics

### Validation

- no search behavior changes yet
- benchmark current canonical cases and record same-machine baselines

### Exit criteria

We can answer at least:

- where the score burden is concentrated
- whether the current sampler spends most effort away from hotspots
- whether late-run stagnation corresponds to repeated sampling around irrelevant structures

## Phase 1 — Repeat-encounter-guided swap sampling

### Goal

Implement the cheapest high-value version first: pair-pressure guidance for repeat encounter.

### Rationale

- directly relevant to Social Golfer
- uses data already close to what `solver3` maintains
- local incremental update story is clean
- best chance of proving whether hotspot guidance is worth further investment

### Deliverables

- exact repeat-excess detection derived from `pair_contacts`
- sparse active offender representation for repeat-excess pairs
- optional per-person offender incidence counts
- guided swap proposal path anchored on repeat offenders
- bounded candidate preview count constants
- hybrid guided/random proposal policy
- togglable configuration surface for experiments

### Implementation notes

- updates should happen on accepted moves only
- exact global ordering is not required
- prefer active buckets or sampled top offenders over complex exact heaps
- candidate batch sizes must stay small and explicit

### Validation

#### Tests

- narrow unit tests for repeat-offender cache updates after accepted swaps
- invariant tests that guidance state never affects exact scoring truth
- deterministic tests for guided-sampler behavior under fixed seeds

#### Benchmarks

- same-machine before/after on:
  - `backend/benchmarking/cases/stretch/social_golfer_32x8x10.json`
  - canonical stretch suite where relevant
- compare both:
  - score quality
  - iterations/second
  - preview/apply timing distribution

### Exit criteria

Proceed only if one of the following is true:

- score quality materially improves without unacceptable throughput loss
- or quality stays similar but diagnostics prove the architecture is viable and cheap enough for extension

## Phase 2 — Generic pairwise pressure layer

### Goal

Extend hotspot guidance to other naturally pairwise constraints.

### Constraint families in scope

- forbidden pair
- should stay together
- pair meeting count
- repeat encounter

### Deliverables

- pairwise pressure abstraction over multiple pairwise constraint families
- merged or layered active offender sets
- anchor selection policy across pairwise pressure sources
- bounded candidate generation rules that remain generic

### Open design choice

Whether to represent pairwise pressure as:

- separate per-family active structures plus a chooser
- or a merged approximate pair pressure score

Current recommendation:

- keep separate per-family structures first
- merge only at the anchor-selection layer

Reason:

- simpler semantics
- easier debugging
- less risk of a brittle universal signal too early

### Validation

- add focused fixtures for each supported pairwise constraint family
- benchmark representative and adversarial cases that actually exercise those constraints

### Exit criteria

- generic pairwise guidance is demonstrably correct
- hotpath cost remains bounded
- no deceptive performance regressions are hidden by easier cases

## Phase 3 — Session and person pressure

### Goal

Add coarse-grained pressure routing that helps the solver spend more time in problematic regions without needing exact pairwise top-k selection for everything.

### Deliverables

- session-pressure summaries
- person-pressure summaries from active pair incidents and other local burdens
- anchor routing policy that can choose among:
  - bad session
  - bad pair
  - bad person

### Rationale

This phase provides a more generic guidance path even when a constraint is not cleanly pairwise.

### Validation

- confirm sampler spends more effort in bad sessions / around bad people
- confirm throughput remains acceptable
- confirm fallback exploration remains present

## Phase 4 — Group/session-local pressure

### Goal

Support guidance for non-pairwise local burdens such as attribute balance and clique fragmentation.

### Deliverables

- group/session pressure summaries
- anchor-specific candidate-generation policies for:
  - attribute imbalance repair
  - clique repair opportunities
- integration with the hybrid sampler

### Warning

This phase is where naive genericity can become expensive. Keep implementation deliberately local, bounded, and benchmark-gated.

### Validation

- dedicated fixtures for attribute balance and clique cases
- do not rely on Social Golfer to validate this phase

## Phase 5 — Stagnation-aware intensification and diversification

### Goal

Use hotspot guidance more aggressively only when the search demonstrates plateau behavior.

### Candidate mechanisms

- increase guided-sampling probability during stagnation episodes
- switch anchor preference toward highest-pressure structures during stagnation
- periodic lightweight refresh of stale guidance state
- bounded partial perturbation or session-focused ruin/recreate triggered only after large no-improvement streaks

### Explicit warning

Do not begin with heavy GA-style or ejection-chain machinery here. Start with controlled, measurable intensification and diversification around the current swap architecture.

### Validation

- compare fixed-budget runs with and without stagnation triggers
- verify longer time budgets actually translate into later improvements more often

## Phase 6 — Optional advanced follow-ups

Only attempt after earlier phases prove value.

Candidate follow-ups:

- session-level ruin/recreate centered on high-pressure sessions
- incumbent recombination / memetic crossover guided by pressure summaries
- short horizon chained-move heuristics using anchor persistence
- richer composite moves where benchmarks justify the complexity

## Testing strategy

Follow the repo’s layered strategy.

### Unit tests

Add narrow tests for:

- pressure-cache maintenance
- active offender set updates
- bucket membership transitions
- stale refresh logic
- deterministic anchor selection under fixed seeds

### Property / invariant tests

Assert that:

- guidance structures never alter exact score truth
- preview/apply correctness remains unchanged
- accepted-move updates keep guidance state internally consistent
- refresh paths converge to the exact intended offender sets where exactness is promised

### Data-driven / integration tests

Add focused fixtures that exercise:

- repeat encounter pressure
- forbidden pair pressure
- should-together pressure
- attribute imbalance pressure
- stagnation-trigger conditions

### Benchmark validation

Because this touches solver hot paths, every implementation phase must include same-machine benchmark evidence after the change, and before/after baselines when interpretation matters.

Required benchmark surfaces:

- canonical Social Golfer case
- relevant canonical stretch / representative cases
- hotpath lanes if any changes materially affect preview/apply behavior

## Configuration and rollout strategy

This feature should roll out behind explicit configuration first.

Recommended shape:

- default remains current sampling until evidence supports a new default
- experimental guided modes enabled explicitly
- hybrid/random fallback fractions explicit in configuration
- bounded candidate batch sizes explicit in configuration

This keeps the implementation honest and benchmarkable.

## Risks and failure modes

### 1. Throughput collapse

A guided sampler that previews too many candidates can improve proposal quality while still losing overall search quality because throughput collapses.

### 2. Overfitting to one constraint family

A repeat-heavy guidance policy may help Social Golfer while hurting mixed-constraint workloads.

### 3. Stale pressure bias

Approximate guidance state may become stale and repeatedly drag the sampler toward no-longer-important regions.

### 4. False genericity

Trying to unify all pressure into one abstraction too early may produce a harder-to-maintain, slower, less truthful system.

### 5. Exploration collapse

Too much hotspot focus may trap the search in a narrow repair pattern; the hybrid random path must remain explicit.

## Kill criteria

Stop or narrow the plan if we observe any of the following:

- canonical score quality does not improve after Phase 1 despite careful tuning
- throughput loss is large enough that net fixed-budget quality worsens
- generic extensions become materially more complex than their benchmark value justifies
- non-pairwise guidance cannot be implemented without broad rescans in the hot path

If that happens, keep the successful lower phases and do not force the full generic vision.

## Immediate next step

Start with **Phase 0 + Phase 1**, not the whole plan:

1. add diagnostics to quantify hotspot concentration and stagnation behavior
2. implement repeat-encounter-guided swap sampling as an explicit experimental mode
3. benchmark it honestly on Social Golfer and neighboring canonical workloads
4. only generalize if the cheap first version clearly pays off

## Summary

This plan intentionally treats hotspot-guided search as a **performance-sensitive solver-quality feature**, not a generic abstraction exercise.

The recommended sequence is:

- first prove value on repeat-heavy workloads with a cheap pair-pressure implementation
- then generalize carefully to pairwise constraints
- then extend to coarser person/session/group pressure views
- only later attempt stronger diversification or composite heuristics

If implemented correctly, this track has strong potential to improve solver3’s ability to turn longer budgets into real late-run progress on hard workloads while preserving the repo’s explicit, benchmark-gated engineering discipline.
