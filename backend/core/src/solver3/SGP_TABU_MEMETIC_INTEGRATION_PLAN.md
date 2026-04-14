# Solver3 SGP Tabu + Memetic Integration Plan

## Why this plan exists

This plan is for the next serious `solver3` search-quality direction on Social-Golfer-like workloads **without touching the constructor**.

It is grounded in a review of the current implementation:

- `backend/core/src/solver3/search/engine.rs`
- `backend/core/src/solver3/search/context.rs`
- `backend/core/src/solver3/search/candidate_sampling.rs`
- `backend/core/src/solver3/search/family_selection.rs`
- `backend/core/src/solver3/search/repeat_guidance.rs`
- `backend/core/src/solver3/moves/swap.rs`
- `backend/core/src/solver3/runtime_state.rs`
- `backend/core/src/solver3/compiled_problem.rs`
- `backend/core/src/models.rs`

This plan intentionally **does not** revisit constructor work.

Important scope correction:
this should be treated as a **multi-epic program**, not a single implementation epic.

Why:
- the SGP papers give us strong ideas for pure Social-Golfer-like structure,
- but GroupMixer has richer scenario semantics,
- so proper implementation requires both:
  - SGP-specialized search work,
  - and explicit compatibility / capability-gating work for broader solver3 scenarios.

Program-level epics:

1. search-driver architecture split
2. SGP-local tabu improver
3. steady-state memetic outer loop
4. scenario-semantics compatibility and capability gating
5. telemetry / benchmarking / rollout discipline

---

## Review of the current solver3 architecture

## What is already good

### 1. The move kernels are already separated from search policy

`solver3` already has the right core split for this work:

- `RuntimeState` / `CompiledProblem` are dense, concrete, and hot-path-oriented.
- `moves/*` owns preview/apply truth.
- `search/context.rs` already owns search-side run context and policy memory.
- `search/candidate_sampling.rs` already owns proposal generation.
- `search/engine.rs` orchestrates search and acceptance.

That means we can add:

- SGP-specific tabu memory,
- SGP-specific neighborhood restriction,
- and a steady-state memetic outer loop

**without reopening the move kernels as the primary integration surface**.

### 2. `CompiledProblem::pair_idx` is exactly the right primitive for SGP tabu memory

The packed pair index means a week/session-local tabu list over swapped golfer pairs can be represented as:

- dense,
- O(1) lookup,
- O(1) update,
- no hashing in the hot path,
- no string keys,
- no heap churn per move.

This is the cleanest existing seam for the paper-backed tabu idea.

### 3. `RuntimeState` clones are acceptable for a **small** population

Because `RuntimeState` shares `Arc<CompiledProblem>`, a small steady-state population is architecturally feasible.

This is important because the memetic direction should be:

- **small population**,
- **steady state**,
- **mutation + local improvement**,
- **no naive crossover**.

That fits the current architecture much better than a large GA framework.

---

## What is currently awkward / needs cleanup first

### 1. `SearchEngine` is hard-wired to one baseline loop plus an ad hoc memetic burst

Current `search/engine.rs` is doing two different jobs:

- the normal single-state local-search loop,
- and a one-off `try_memetic_offspring_burst()` escape path.

That burst is not the shape we want going forward:

- it is restart/donor/transplant oriented,
- it is crossover-ish at the session level,
- and it is fused into the baseline engine.

For the next work, this should be treated as **legacy experimental scaffolding**, not the target architecture.

### 2. `SearchPolicyMemory` has the right idea but not the right concrete structures yet

`SearchPolicyMemory` already hints at future search-side memory:

- `tabu`
- `threshold`
- `late_acceptance`
- `ils`

That is the right ownership boundary.
But `TabuPolicyMemory` is just a placeholder and does not yet model:

- week-local pair expirations,
- aspiration,
- or the distinction between local improver memory vs outer-loop population state.

### 3. `CandidateSampler` currently knows almost nothing about search memory

Today it can do:

- random swap sampling,
- repeat-guided swap sampling,
- transfer / clique swap sampling.

But it cannot yet cleanly incorporate:

- tabu pre-filtering,
- conflict-position restriction,
- or mutation-oriented multi-swap sampling.

That is the main place where SGP-local-search improvements should be woven in.

### 4. There is no explicit driver split yet

Right now the engine effectively assumes:

- one current state,
- one proposal,
- one acceptance rule,
- maybe one embedded memetic stunt.

For the next phase we need explicit driver-level distinction between:

- **single-state local search**
- **steady-state memetic search**

without paying for driver polymorphism in the inner loop.

---

## Non-negotiable architecture rules for this work

1. **Do not touch the constructor.**
2. **Do not put tabu or population memory into `RuntimeState`.** Search memory stays search-side.
3. **Do not add trait-object metaheuristic frameworks.**
4. **Do not make memetic logic a branch inside the per-iteration hot path of the baseline loop.**
5. **Do not use naive crossover.**
6. **Do not add hidden fallbacks.** New behavior must be explicit in config and explicit in telemetry.
7. **Keep disabled/default behavior performance-stable.** If the feature is off, it should not drag the baseline path.
8. **Benchmark with the existing Social Golfer fixed-time + fixed-iteration lanes plus hotpath guardrails.**

---

## Recommended integration shape

## A. Split search into explicit driver layers

Recommended structure:

- `search/engine.rs`
  - thin dispatch only
- `search/single_state.rs`
  - current baseline local-search loop, cleaned up
- `search/tabu.rs`
  - SGP-local-improver memory + aspiration logic + tabu helpers
- `search/memetic.rs`
  - steady-state outer loop over `RuntimeState` individuals
- `search/candidate_sampling.rs`
  - proposal helpers reused by both baseline and tabu local improvers

This keeps the baseline loop concrete while making the outer loop explicit.

## B. Use explicit config for two orthogonal choices

Recommended model split:

1. **local improver mode**
   - `record_to_record`
   - `sgp_week_pair_tabu`

2. **outer search mode**
   - `single_state`
   - `steady_state_memetic`

This is cleaner than one giant enum because the memetic driver should be able to reuse either:

- the baseline local improver,
- or the SGP tabu local improver.

## C. Keep the SGP-specific memory dense

The week-local swapped-pair tabu list should be represented as a dense flat array:

- shape: `[allowed_session_ordinal * num_pairs + swapped_pair_idx] -> expire_iteration`
- element type: `u32` or `u64` depending on the stop-condition range

This should live in search-side state, not in the compiled or runtime state.

Why dense is preferred here:

- lookup is constant-time,
- update is constant-time,
- it leverages `CompiledProblem::pair_idx`,
- it avoids `HashMap` overhead,
- and it is cheap enough for the intended SGP workloads.

## D. Treat mutation as a macro operator composed from existing swap kernels

The memetic mutation operator should be:

- a short sequence of valid same-session swaps,
- applied to a cloned individual,
- then followed by local improvement.

This reuses existing kernels and keeps correctness localized.

---

# Phase plan

## Phase 1 — Refactor the driver boundary so new search modes fit cleanly

### Goal
Turn the current engine into a clean dispatcher and remove the architectural coupling between:

- baseline single-state search,
- and the legacy memetic burst.

### Deliverables

- extract the current baseline loop into `search/single_state.rs`
- turn `search/engine.rs` into a thin dispatcher over explicit driver modes
- move the current `try_memetic_offspring_burst()` behind a clearly non-default experimental path or retire it from the main path
- keep the default driver behavior unchanged unless explicitly configured otherwise

### Why first
Without this split, every new idea gets jammed into one loop and the architecture will rot quickly.

---

## Phase 2 — Add SGP week-local swapped-pair tabu to the local improver

### Goal
Add the strongest low-level SGP-specific idea in a way that is fast and explicit.

### Design

#### Search-side memory
Add a concrete SGP tabu memory type, for example:

- `session_pair_expiry: Vec<u32>`
- `tenure_min`
- `tenure_max`
- `aspiration_enabled`
- `tabu_hits`
- `tabu_blocks`
- `aspiration_overrides`

#### Keying
Key tabu entries by:

- `session_idx`
- `compiled.pair_idx(swapped_left_person, swapped_right_person)`

This corresponds directly to the paper’s “per-week swapped golfer pair” idea.

#### Update rule
When a swap is accepted:

- compute the swapped golfer pair key,
- sample or derive a tenure in `[min, max]`,
- set `expire_iteration = current_iteration + tenure`.

#### Query rule
When considering a swap proposal:

- if `expire_iteration > current_iteration`, treat it as tabu,
- but allow aspiration if the candidate improves the global best (or other explicitly chosen aspiration policy).

### Performance rule
Tabu **must** be checked before expensive preview ranking whenever possible.
That means the sampler should be able to skip obviously-taboo raw swap proposals prior to preview.

### Stretch goal
If needed, add a small capped retry count for tabu-skips so the sampler does not collapse when a corridor is saturated.

---

## Phase 3 — Add conflict-position-restricted swap sampling for the SGP local improver

### Goal
Strengthen the local improver by restricting the neighborhood to conflict-involved positions, not merely by ranking bad pairs.

### Design intent
This should complement the week-local tabu memory:

- conflict restriction says **where to search**
- pair tabu says **where not to churn**

### Important implementation note
Because current `PairContactUpdate` is global-per-pair and not session-tagged, session-local conflict-position maintenance needs explicit design.

Recommended options, in order:

1. add a search-side SGP conflict-state that is rebuilt from the current state at local-search start and refreshed incrementally for touched sessions/groups only
2. if that is too invasive, add preview metadata sufficient to refresh touched-session conflict positions without a global rescan
3. do **not** add per-iteration full-state rescans as the steady-state implementation

### Why not first
Pair tabu alone is simpler and cleaner. Conflict-position restriction should build on that, not precede it.

---

## Phase 4 — Add a small steady-state memetic outer loop

### Goal
Add the most promising global-search mechanism without forcing crossover or constructor changes.

### Recommended structure

#### Population
- size: small and fixed
- likely 4–8 individuals initially
- store full `RuntimeState` plus lightweight metadata

#### Parent selection
Keep it simple and explicit:

- tournament among a few individuals,
- or rank-biased sampling.

Do not over-engineer selection first.

#### Mutation
Mutation should be:

- `k` same-session swaps,
- where `k` is small and sampled from a bounded distribution,
- optionally bias sessions by conflict burden,
- explicitly **not** crossover.

#### Local improvement
After mutation:

- run the existing local improver under a bounded budget,
- defaulting to Lamarckian replacement semantics.

#### Replacement
Keep replacement explicit and cheap:

- replace worst if child is strictly better,
- or replace the most similar dominated individual if diversity collapses.

Do not add sophisticated diversity math until the baseline loop exists and is benchmarked.

### Why this shape fits solver3
- reuses `RuntimeState`
- reuses swap kernels
- reuses local improver
- keeps population small
- keeps correctness centralized

---

## Phase 5 — Lamarckian semantics, telemetry, and benchmark truthfulness

### Goal
Make the memetic path explicit and measurable rather than heuristic folklore.

### Required telemetry

#### For SGP tabu local search
- tabu hits
- tabu prefilter skips
- tabu hard blocks
- aspiration overrides
- average / min / max realized tenure
- candidate retries due to tabu

#### For memetic outer loop
- population size
- offspring attempted / accepted / discarded
- mutation length histogram
- child polish time / iteration budget
- parent selection counts
- replacement counts
- best child source lineage depth or generation

### Required benchmark lanes
- social golfer fixed-time baseline vs tabu-local-improver
- social golfer fixed-iteration baseline vs tabu-local-improver
- social golfer fixed-time memetic-with-baseline-improver
- social golfer fixed-time memetic-with-tabu-improver
- hotpath guardrail for default solver3 path

### Required semantic rule
Default solver3 must remain benchmark-visible and behaviorally explicit.
If the new work changes default behavior, that must be deliberate, documented, and benchmarked honestly.

---

# Detailed implementation todos

## Epic A — driver split and explicit configuration

### A1. Add explicit solver3 search-mode config
Touch points:
- `backend/core/src/models.rs`
- `backend/core/src/solver3/search/context.rs`
- `backend/core/src/solver3/search/mod.rs`

Add explicit config for:
- outer search mode (`single_state`, `steady_state_memetic`)
- local improver mode (`record_to_record`, `sgp_week_pair_tabu`)

Validation rules must fail explicitly for unsupported combinations.

### A2. Extract the baseline loop into `search/single_state.rs`
Touch points:
- `backend/core/src/solver3/search/engine.rs`
- new `backend/core/src/solver3/search/single_state.rs`

Keep the current baseline code path concrete and benchmark-stable.

### A3. Retire or quarantine the current ad hoc memetic burst
Touch points:
- `backend/core/src/solver3/search/engine.rs`
- maybe new `backend/core/src/solver3/search/legacy_memetic.rs` if temporary quarantine is needed

The session-transplant donor burst should not remain fused into the default single-state path.

---

## Epic B — week-local swapped-pair tabu local improver

### B1. Add dense SGP tabu memory type
Touch points:
- `backend/core/src/solver3/search/context.rs`
- new `backend/core/src/solver3/search/tabu.rs`

Implement dense session×pair expiry storage and typed helper methods:
- `is_tabu(session_idx, left_person_idx, right_person_idx, iteration)`
- `record_accepted_swap(session_idx, left_person_idx, right_person_idx, iteration, rng)`
- `expiry_slot(session_idx, pair_idx)`

### B2. Extend swap sampling options with tabu prefilter support
Touch points:
- `backend/core/src/solver3/search/candidate_sampling.rs`
- `backend/core/src/solver3/search/tabu.rs`

Sampler must be able to skip obviously tabu raw proposals before preview.
This is performance critical.

### B3. Add aspiration handling in the local improver
Touch points:
- `backend/core/src/solver3/search/single_state.rs`
- `backend/core/src/solver3/search/tabu.rs`

Aspiration policy should be explicit and simple:
- allow tabu move if it improves best-so-far

Do not invent fuzzy aspiration rules first.

### B4. Add benchmark-visible tabu telemetry
Touch points:
- `backend/core/src/models.rs`
- `backend/benchmarking/src/*`
- benchmark schema + artifact plumbing

### B5. Add correctness + determinism tests for tabu semantics
Touch points:
- `backend/core/src/solver3/search/tests.rs`
- new `backend/core/src/solver3/search/tabu.rs` tests

Need tests for:
- expiry
- tenure range
- aspiration override
- deterministic behavior for fixed seed
- default-off path preserving baseline behavior

---

## Epic C — conflict-position-restricted neighborhood

### C1. Add search-side SGP conflict-neighborhood state
Touch points:
- new `backend/core/src/solver3/search/sgp_conflicts.rs`
- `backend/core/src/solver3/search/candidate_sampling.rs`

State should support:
- conflict-involved person/session flags or counts
- selecting anchor positions from active conflicts
- refreshing touched sessions cheaply

### C2. Add a conflict-restricted swap sampler
Touch points:
- `backend/core/src/solver3/search/candidate_sampling.rs`

This should be a separate explicit path, not blended implicitly into the baseline random sampler.

### C3. Benchmark whether conflict restriction actually helps tabu search
Do not assume synergy. Measure it.

---

## Epic D — steady-state memetic outer loop

### D1. Add explicit memetic driver module
Touch points:
- new `backend/core/src/solver3/search/memetic.rs`
- `backend/core/src/solver3/search/engine.rs`
- `backend/core/src/solver3/search/mod.rs`

This module should own:
- population initialization
- parent selection
- mutation
- child polishing
- replacement
- memetic telemetry

### D2. Define the minimal individual / population data model
Touch points:
- `backend/core/src/solver3/search/memetic.rs`

Keep it small:
- `RuntimeState`
- score
- seed / lineage metadata
- maybe a cheap diversity signature if later needed

### D3. Implement macro mutation as several same-session swaps
Touch points:
- `backend/core/src/solver3/search/memetic.rs`
- maybe shared helpers in `candidate_sampling.rs`

Mutation must reuse existing swap preview/apply kernels.
Do not add a second move system.

### D4. Reuse the local improver as child polish
Touch points:
- `backend/core/src/solver3/search/single_state.rs`
- `backend/core/src/solver3/search/memetic.rs`

The memetic driver must be able to call:
- baseline record-to-record local improver
- or SGP tabu local improver

with bounded child budgets.

### D5. Implement Lamarckian replacement semantics
Touch points:
- `backend/core/src/solver3/search/memetic.rs`

The polished child is the inheritable individual.
No Baldwinian scoring-only staging in the first implementation.

### D6. Add explicit replacement policy and cheap diversity guard
Touch points:
- `backend/core/src/solver3/search/memetic.rs`

Start simple:
- replace worst dominated individual
- optionally guard against exact duplicates or near-duplicates

Do not over-engineer diversity metrics before the baseline works.

---

## Epic E — benchmarking and rollout discipline

### E1. Add dedicated benchmark manifests for tabu and memetic paths
Touch points:
- `backend/benchmarking/suites/*.yaml`
- `docs/benchmarking/WORKFLOW.md`

### E2. Add guardrail suites proving the default path stays honest
Need before/after hotpath and canonical suite comparisons.

### E3. Decide explicitly whether any new path should become default
This must be a deliberate branch-point after data, not during integration.

---

# Recommended execution order

1. **A1–A3** driver/config split
2. **B1–B5** week-local swapped-pair tabu local improver
3. **C1–C3** conflict-position restriction if tabu-only results justify it
4. **D1–D6** steady-state memetic outer loop reusing the local improver
5. **E1–E3** benchmark discipline and default-path decision

---

# Bottom line

The cleanest path is:

- keep `solver3`’s dense move/runtime substrate intact,
- make search modes explicit,
- add a **fast dense SGP-local tabu improver** first,
- then add a **small steady-state mutation-driven memetic outer loop** that reuses that improver,
- and keep all of it benchmark-visible and opt-in until proven.

That gives us the paper-backed ideas the user actually wants, while staying aligned with the current architecture and performance doctrine.
