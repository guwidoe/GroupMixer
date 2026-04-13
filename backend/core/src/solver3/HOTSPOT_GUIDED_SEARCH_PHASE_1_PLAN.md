# Solver3 Hotspot-Guided Search — Phase 1 Plan

## Status

Detailed Phase 1 plan for implementing **repeat-encounter-guided swap sampling** in `solver3`.

This plan is intentionally grounded in a review of the current `solver3` implementation so the feature can be woven into the existing search architecture with minimal hotpath disruption.

Phase 1 is deliberately **narrow**:

- it targets **repeat-encounter pressure only**
- it changes **swap proposal generation**, not exact scoring truth
- it keeps the current move kernel / preview / apply model intact
- it remains **experimental and benchmark-gated** until the same-machine evidence is convincing

This is the first behavior-changing phase after the Phase 0 observability work.

---

## Objective

Phase 1 should answer one question honestly:

> Can `solver3` make better use of fixed time / fixed iteration budgets on repeat-heavy plateau workloads by replacing part of its current uniform-random swap sampling with a cheap repeat-offender-guided proposal path?

For the Social Golfer benchmark, this specifically means:

- keep `swap` as the operative move family
- use repeat-encounter pressure to choose better swap anchors
- preview only a **small bounded** candidate set around those anchors
- retain a uniform/random fallback path so exploration does not collapse

---

## Review of the current implementation

This section records the concrete implementation seams that Phase 1 should build on.

## 1. Search loop structure already has a clean insertion point

`backend/core/src/solver3/search/engine.rs`

Today the search loop does the following each iteration:

1. compute cooling / threshold progress
2. optionally attempt a memetic burst under deep stagnation
3. ask `CandidateSampler` for one previewed move
4. apply the existing record-to-record acceptance rule
5. if accepted, apply the preview patch and update search telemetry
6. stop on time / optimality / no-improvement limits

Important observations:

- the engine already treats **candidate selection** as a separate concern from **acceptance**
- Phase 1 should preserve that boundary
- a hotspot-guided proposal path therefore belongs in or adjacent to `candidate_sampling.rs`, not inside scoring or acceptance logic

## 2. `CandidateSampler` is currently stateless and purely random within a move family

`backend/core/src/solver3/search/candidate_sampling.rs`

Current swap sampling behavior:

- choose a random allowed session
- choose two random distinct groups in that session
- choose one random member from each group
- preview the swap
- return the first feasible preview found

Important observations:

- `CandidateSampler` is currently a zero-sized stateless helper
- swap sampling uses `MAX_RANDOM_CANDIDATE_ATTEMPTS` and returns the **first feasible** preview, not the best among a local set
- there is currently no per-run sampler memory, no offender cache, and no guidance state

That means Phase 1 needs a new place for persistent heuristic state. It should **not** try to smuggle that state into `RuntimeState`.

## 3. `RuntimeState` already exposes the exact repeat signal we need

`backend/core/src/solver3/runtime_state.rs`

`RuntimeState` already contains:

- exact `pair_contacts[pair_idx]`
- incrementally maintained score aggregates
- flat dense person/group membership layout

Important observations:

- `pair_contacts` is already the exact data source for repeat pressure
- Phase 1 should reuse it instead of building a parallel exact contact matrix
- the runtime state remains authoritative; guidance must stay separate and heuristic

## 4. Swap previews already compute the exact local pair-contact deltas

`backend/core/src/solver3/moves/swap.rs`
`backend/core/src/solver3/moves/patch.rs`

Swap preview already builds a `RuntimePatch` containing:

- `pair_contact_updates`
- exact repetition penalty delta
- exact total score delta

Important observations:

- accepted swaps already tell us exactly which pair counts changed
- Phase 1 can update repeat-offender guidance caches **incrementally from accepted patches**
- guidance does **not** need to rescan all pairs after every accepted swap

This is one of the strongest existing seams in the current implementation.

## 5. Search state already separates exact progress from heuristic policy memory

`backend/core/src/solver3/search/context.rs`

Today `SearchProgressState` holds:

- current and best runtime states
- exact benchmark telemetry
- policy memory for other search policies

Important observations:

- `SearchPolicyMemory` exists, but it is tuned to acceptance / policy surfaces, not proposal guidance
- Phase 1 should not overload unrelated memory structures just because they exist
- a distinct guidance-state struct will be clearer and easier to benchmark

## 6. The engine can replace `current_state` wholesale during memetic bursts

`backend/core/src/solver3/search/engine.rs`

The memetic-burst path can replace `search.current_state` with an offspring state.

Important observations:

- any guidance cache tied to the current state must support **cheap rebuild**
- incremental updates alone are not sufficient; we need a rebuild path when the current state jumps non-locally
- this is another reason guidance state should remain outside `RuntimeState`

## 7. Solver3 configuration currently has no hotspot-guidance controls

`backend/core/src/models.rs`

`Solver3Params` currently contains only correctness-lane settings.

Important observations:

- Phase 1 needs an explicit experimental config surface
- defaults must preserve current behavior
- benchmark lanes must be able to turn the feature on/off and vary bounded parameters honestly

---

## Phase 1 scope

## In scope

- add an **optional repeat-guided swap proposal path**
- add a lightweight per-run repeat-offender guidance state
- update that guidance state incrementally on accepted moves
- rebuild it when the current state changes wholesale
- integrate the guided path into swap sampling with an explicit random fallback
- add minimal telemetry needed to compare guided vs random proposal behavior
- validate with the Phase 0 trajectory tooling and Social Golfer plateau suites

## Out of scope

- generic multi-constraint hotspot guidance
- person/session/group pressure beyond what is needed for repeat guidance
- heavy per-attempt logging
- exact global max-heap maintenance for all offenders
- explicit chained moves, ejection chains, or GA-style recombination changes
- changing scoring semantics, acceptance semantics, or move-kernel truth

---

## Phase 1 design decisions

## 1. Keep guidance state separate from `RuntimeState`

Phase 1 should introduce a **search-local guidance state**, not mutate the exact runtime-state contract.

Recommended shape:

- `search/repeat_guidance.rs` or similar new module
- instantiated once per search run
- owned by the engine / search loop
- updated after accepted moves
- rebuilt after memetic-state replacement

Reason:

- keeps the runtime state exact and minimal
- avoids polluting every state clone with heuristic caches
- makes rebuild / invalidate semantics explicit

## 2. Do not build a universal `C_ij`

Phase 1 should use a **repeat-only pressure view** based directly on pair-contact excess.

For repeat encounter, the exact offender signal is:

- `excess(pair) = max(pair_contacts[pair] - max_allowed_encounters, 0)`

That signal is:

- exact
- already available
- incrementally updatable from accepted patches
- directly relevant to Social Golfer

## 3. Maintain offender severity, not duplicated full pair counts

The guidance layer does **not** need to duplicate all exact pair-contact counts.

Instead, it should maintain only the pressure it actually needs, e.g.:

- `repeat_excess_by_pair[pair_idx]`
- offender buckets keyed by excess severity
- optional per-person offender incident counts

This is important because incremental guidance updates can be driven by:

- the old excess stored in the guidance state
- the new exact count coming from `pair_contact_updates`

That is enough to detect:

- offender activation (`0 -> >0`)
- offender deactivation (`>0 -> 0`)
- offender severity change (`1 -> 2`, etc.)

without duplicating the full exact `pair_contacts` array.

## 4. Use sparse active buckets, not an exact heap

Recommended core structure:

- `buckets[excess] -> Vec<pair_idx>`
- `pair_bucket_excess[pair_idx] -> usize`
- `pair_bucket_pos[pair_idx] -> Option<usize>`
- optional `person_incident_counts[person_idx] -> u16`

Reason:

- cheaper than maintaining a dynamic exact heap
- easy O(1)-style bucket removal with swap-remove + position tracking
- good enough for sampling high-pressure offenders
- easy to reason about and test

## 5. Localize meeting sessions on demand in Phase 1

To guide a swap, we need a session where the chosen offender pair currently meets.

Current runtime state does **not** store per-pair session bitsets.

Phase 1 recommendation:

- **do not** add a dense per-pair session cache yet
- find a meeting session by scanning `allowed_sessions` and checking whether the pair shares a group in that session

Reason:

- `allowed_sessions` is typically small on the target workloads
- this keeps Phase 1 memory-light and simpler
- session-localization cost is paid only on guided attempts, not every iteration globally

If profiling later shows this is a bottleneck, a session-bitset refinement can be considered in a later phase.

## 6. Use bounded exact preview ranking, not a heuristic surrogate scorer

For candidate selection around a repeat offender anchor, Phase 1 should:

- generate a **small bounded set** of candidate swaps
- use the existing exact preview function on those candidates
- choose the best exact preview, or sample among the top few

Phase 1 should **not** add a second approximate delta model.

Reason:

- exact preview logic already exists and is trusted
- this reduces semantic risk
- the feature is easier to benchmark honestly
- the candidate set can be kept small enough to remain affordable

## 7. Keep a hybrid random/guided proposal policy

Guidance should bias swap sampling, not replace exploration.

Recommended Phase 1 behavior:

- when sampling `MoveFamily::Swap`, decide between:
  - guided repeat-offender sampling
  - current random sampling
- if guided sampling cannot produce a candidate, fall back to the current random path

Reason:

- prevents exploration collapse
- makes A/B comparisons easier
- preserves robustness on cases with weak or noisy repeat signals

---

## Proposed architecture

## 1. New configuration surface

### Files

- `backend/core/src/models.rs`
- possibly `backend/contracts/src/types.rs` only if schema snapshots / generated docs need updates

### Recommendation

Extend `Solver3Params` with a nested experimental hotspot-guidance block.

Recommended shape:

```rust
pub struct Solver3Params {
    pub correctness_lane: Solver3CorrectnessLaneParams,
    pub hotspot_guidance: Solver3HotspotGuidanceParams,
}
```

Recommended Phase 1-only sub-structure:

```rust
pub struct Solver3HotspotGuidanceParams {
    pub repeat_guided_swaps: Solver3RepeatGuidedSwapParams,
}

pub struct Solver3RepeatGuidedSwapParams {
    pub enabled: bool,
    pub guided_proposal_probability: f64,
    pub candidate_preview_budget: u8,
    pub max_anchor_session_attempts: u8,
    pub sample_top_bucket_only: bool,
    pub choose_best_preview: bool,
}
```

The exact field names can be refined, but the design requirements are:

- defaults preserve current behavior (`enabled = false`)
- the guided/random mix is explicit
- the candidate-preview budget is explicit and bounded
- the config is benchmark-visible and schema-visible

### Keep Phase 1 config deliberately small

Avoid exposing too many knobs immediately.

Recommended initial public knobs:

- `enabled`
- `guided_proposal_probability`
- `candidate_preview_budget`

Everything else can stay internal until the first benchmark round proves the architecture useful.

## 2. Extend run-context normalization

### Files

- `backend/core/src/solver3/search/context.rs`

### Recommendation

Normalize Phase 1 guidance config into `SearchRunContext`.

Add something like:

- `repeat_guidance_enabled: bool`
- `repeat_guided_proposal_probability: f64`
- `repeat_guided_candidate_preview_budget: usize`

Validation should ensure:

- probability is within `[0.0, 1.0]`
- preview budget is small and nonzero when enabled
- the feature auto-disables if there is no compiled repeat-encounter constraint

This keeps the search loop free from repeated config branching.

## 3. Add a dedicated repeat-guidance state module

### Recommended new file

- `backend/core/src/solver3/search/repeat_guidance.rs`

### Recommended responsibilities

- build repeat-offender pressure state from `RuntimeState`
- update that state from accepted preview patches
- rebuild the state from scratch when necessary
- sample offender anchors cheaply
- expose helper methods for candidate generation

### Recommended top-level type

```rust
pub(crate) struct RepeatGuidanceState {
    repeat_max_allowed_encounters: u16,
    pair_excess_by_pair: Vec<u16>,
    pair_bucket_pos: Vec<Option<usize>>,
    buckets: Vec<Vec<usize>>,
    person_incident_counts: Vec<u16>,
    active_pair_count: usize,
}
```

Notes:

- `pair_excess_by_pair` is the key incremental state
- `pair_bucket_pos` supports O(1)-style removal from buckets
- `person_incident_counts` is optional but useful for endpoint choice / diagnostics
- `active_pair_count == 0` becomes a fast check for "guided repeat sampling is not currently useful"

## 4. Add a pair-index inverse helper, but keep it lightweight

### Files

- `backend/core/src/solver3/compiled_problem.rs`
- or keep it private in the guidance module if a clean helper is possible there

The guided sampler needs to decode `pair_idx -> (person_a, person_b)`.

Phase 1 recommendation:

- add a helper like `pair_members(pair_idx) -> (usize, usize)`
- implement it arithmetically or with a lightweight search
- **do not** add a dense `Vec<(usize, usize)>` table unless profiling proves it necessary

Reason:

- Phase 1 should stay memory-conscious
- guided sampling is only a fraction of all attempts

## 5. Keep search-preview ownership where it already lives

Phase 1 should continue to use the existing preview/apply types.

Small seam improvements may be needed, such as adding generic accessors on `SearchMovePreview`:

- `session_idx()`
- `patch()` or `pair_contact_updates()`

Reason:

- guidance updates need to read pair-contact updates after accepted moves
- the engine should not need per-family downcasts scattered everywhere

---

## Proposed algorithm

## 1. Initial build

At search start:

1. inspect the compiled repeat-encounter constraint
2. if none exists, keep repeat guidance disabled for the run
3. otherwise scan `state.pair_contacts`
4. compute `excess(pair)` for each pair
5. insert all active offenders into severity buckets
6. compute per-person incident counts for active offenders

This initial build is O(num_pairs), paid once per run.

That is acceptable for Phase 1.

## 2. Incremental accepted-move update

After an accepted move:

1. read `pair_contact_updates` from the accepted preview patch
2. for each updated pair:
   - load `old_excess` from `pair_excess_by_pair[pair_idx]`
   - compute `new_excess` from `new_count`
   - if bucket changed:
     - remove pair from old bucket if needed
     - insert into new bucket if needed
   - if offender activation/deactivation occurred:
     - update per-person incident counts
3. update `active_pair_count`

Important:

- this should happen for **all accepted move families**, not just swaps
- even if Phase 1 only uses guided swap proposals, accepted transfers/clique swaps still change pair contacts and must keep the guidance state truthful when those families are enabled

## 3. Rebuild triggers

Phase 1 should support an explicit rebuild path when incremental state should not be trusted or is too awkward to preserve.

Rebuild on:

- search initialization
- memetic-burst offspring adoption
- any future non-local incumbent replacement mechanism
- optionally test-only forced rebuild checks

Phase 1 should not rebuild on every accepted move.

## 4. Guided anchor selection

When sampling a swap and guided mode is chosen:

1. if no repeat constraint exists, fall back to random
2. if `active_pair_count == 0`, fall back to random
3. otherwise choose an offender pair anchor

Recommended Phase 1 anchor-selection policy:

- prefer the highest non-empty excess bucket
- optionally sample within the top bucket uniformly
- optionally allow weighted sampling across top few buckets later if the top-bucket-only policy proves too brittle

Keep Phase 1 simple:

- start with **highest non-empty bucket only**
- broaden only if benchmarks show that top-bucket focus overfits

## 5. Meeting-session localization

Given anchor pair `(a, b)`:

1. scan `allowed_sessions`
2. find sessions where both people participate and share the same group
3. choose one meeting session randomly
4. if none are found, treat the guidance entry as stale and fall back to random

Optional hygiene improvement:

- if an anchor pair cannot be localized despite positive excess, mark it for rebuild validation in debug/test paths

## 6. Endpoint choice

Given anchor pair `(a, b)` and a chosen session:

Recommended Phase 1 policy:

- choose one endpoint as the mover
- choose the endpoint with higher `person_incident_counts` more often, but not deterministically

Reason:

- still cheap
- gently biases the solver toward moving the more conflict-entangled person
- avoids hard deterministic behavior

If that adds too much complexity early, random endpoint choice is an acceptable first implementation.

## 7. Candidate neighborhood generation

Given:

- session `s`
- anchor endpoint `a`
- current group `g_src`

Generate candidates by:

1. enumerating or sampling target groups `g_dst != g_src`
2. considering people in those target groups as swap partners
3. shuffling / randomizing traversal order
4. previewing candidates until the explicit preview budget is exhausted

Important Phase 1 rule:

- **do not** exhaustively preview every possible swap in the session
- preview at most `candidate_preview_budget` feasible candidates

For Social Golfer-sized sessions, a practical budget is likely something like:

- 4
- 6
- 8

but this must remain benchmark-driven.

## 8. Candidate ranking / choice

Recommended Phase 1 policy:

- preview up to `K` feasible candidates
- choose the exact best preview by lowest `delta_score`

Alternative if diversity is needed later:

- choose uniformly or softly weighted among the top `M`

Phase 1 should start with the simpler policy:

- **best-of-K exact preview**

because it is easiest to explain and benchmark.

## 9. Fallback behavior

Fall back to the current random swap sampler when:

- repeat guidance is disabled
- no repeat constraint exists
- no active offenders exist
- selected anchor cannot be localized to a meeting session
- candidate generation yields no feasible preview within budget
- guided/random Bernoulli chooses the random path for this attempt

This preserves robustness and baseline comparability.

---

## Integration plan by file

## A. `backend/core/src/models.rs`

### Planned changes

- add new `solver3` hotspot-guidance config types
- default them to disabled
- validate bounded fields during run-context creation

### Why here

This is the canonical user-/benchmark-facing configuration surface.

## B. `backend/core/src/solver3/search/context.rs`

### Planned changes

- normalize and validate Phase 1 config into `SearchRunContext`
- expose resolved repeat-guidance settings to the engine and sampler

### Why here

This keeps configuration handling centralized and consistent with existing solver3 search plumbing.

## C. `backend/core/src/solver3/search/repeat_guidance.rs` (new)

### Planned changes

- `RepeatGuidanceState::build_from_state(...)`
- `RepeatGuidanceState::rebuild_from_state(...)`
- `RepeatGuidanceState::apply_pair_contact_updates(...)`
- offender bucket maintenance helpers
- anchor-selection helpers
- optional debug / consistency helpers used in tests

## D. `backend/core/src/solver3/search/candidate_sampling.rs`

### Planned changes

- keep current random sampler functions intact
- add a guided swap path next to the existing random swap path
- update the sampler entrypoint to accept repeat-guidance state and run-context guidance knobs
- preserve current transfer/clique sampling behavior unchanged in Phase 1

### Important guardrail

The current random path should remain available as an explicit fallback and as a control path for benchmarks.

## E. `backend/core/src/solver3/search/engine.rs`

### Planned changes

- instantiate repeat-guidance state at run start when enabled and repeat exists
- pass guidance state into swap sampling
- after accepted moves, update guidance state incrementally from the accepted preview patch
- rebuild guidance state after memetic offspring adoption
- optionally record lightweight guidance telemetry

### Important guardrail

Do not entangle acceptance logic with guidance logic. The engine should remain responsible only for:

- deciding when to call the sampler
- applying accepted previews
- telling the guidance state that the current state changed

## F. `backend/core/src/solver3/compiled_problem.rs`

### Planned changes

- optionally add a compact pair-index inverse helper if needed by the guidance implementation

## G. Tests

### Files likely touched

- `backend/core/src/solver3/search/tests.rs`
- `backend/core/src/solver3/search/candidate_sampling.rs` test module
- new tests in `repeat_guidance.rs`
- possibly data-driven fixtures if a focused benchmark regression fixture becomes worthwhile

---

## Implementation slices

Phase 1 is large enough that it should be implemented in small, benchmarkable slices.

## Slice 1 — Config and scaffolding

### Goal

Add the experimental config surface and the empty wiring needed to turn the feature on without changing behavior yet.

### Work

- extend `Solver3Params`
- extend `SearchRunContext`
- add a no-op `RepeatGuidanceState` scaffold
- thread it through engine/sampler behind disabled defaults

### Validation

- schema / serde tests if needed
- existing solver3 search tests still pass
- when disabled, behavior remains seed-stable and unchanged

## Slice 2 — Exact repeat-offender build / rebuild

### Goal

Build repeat-offender pressure state from exact current runtime state.

### Work

- implement `build_from_state`
- implement offender buckets
- implement `active_pair_count`
- implement optional per-person incident counts
- add pair-index inverse helper if needed

### Validation

- unit tests for bucket population on small handcrafted states
- tests for correct offender counts under different `max_allowed_encounters`
- tests for empty / no-repeat / zero-offender cases

## Slice 3 — Incremental accepted-move updates

### Goal

Keep the guidance state synchronized cheaply after accepted moves.

### Work

- add generic access to `pair_contact_updates` through accepted previews
- implement `apply_pair_contact_updates`
- update guidance state for all accepted move families
- rebuild on memetic offspring adoption

### Validation

- tests comparing incremental updates against full rebuild on the same state after accepted swaps
- repeat for transfer/clique swap when those families are enabled in tests
- optional property-style test: incremental guidance state equals rebuilt guidance state after a sequence of accepted moves

## Slice 4 — Guided swap proposal path

### Goal

Add the actual guided swap sampler while keeping the current random sampler intact.

### Work

- add hybrid guided/random decision for swap-family sampling
- implement anchor selection
- implement on-demand meeting-session localization
- implement bounded candidate generation and exact preview ranking
- fall back to current random sampling when guidance cannot produce a candidate

### Validation

- deterministic sampler tests under fixed seeds
- tests that guided proposals stay within allowed sessions
- tests that guided proposals center on a real repeat offender when one exists
- tests that no-repeat or no-offender states fall back cleanly

## Slice 5 — Minimal telemetry

### Goal

Expose enough benchmark-facing signal to tell whether the guided path is actually being exercised.

### Candidate telemetry additions

Keep these minimal and truthful, for example:

- guided swap proposal attempts
- guided swap proposal successes
- guided-to-random fallbacks
- average feasible previews per guided attempt
- maybe chosen-anchor excess histogram if cheap and useful

### Guardrail

Do not add per-attempt event logs.

### Validation

- schema updates only if telemetry is persisted into benchmark artifacts
- summary/compare updates only if the added signal is genuinely useful for benchmark interpretation

## Slice 6 — Benchmarking and tuning

### Goal

Use the Phase 0 tooling to decide whether Phase 1 is worth extending.

### Required benchmark surfaces

- `backend/benchmarking/suites/social-golfer-plateau-time-solver3.yaml`
- `backend/benchmarking/suites/social-golfer-plateau-fixed-iteration-solver3.yaml`
- relevant canonical stretch suites to guard against regressions on non-target workloads

### Compare with the new trajectory tooling

Use:

- trajectory summaries
- last-improvement timing
- post-plateau duration
- late-improvement counts
- same-machine score and throughput deltas

### What success should look like

At least one of the following:

- better best score at the same fixed time budget
- later last-improvement timing at the same fixed time budget
- better best score at the same fixed iteration budget
- plateau metrics showing more late-run progress without unacceptable throughput collapse

---

## Testing plan

## Unit tests

Add narrow tests for:

- repeat-excess computation from pair counts
- bucket insert / remove / move operations
- person-incident count updates on offender activation/deactivation
- rebuild behavior on clean and adversarial states
- pair-index inverse helper correctness if one is added

## Incremental-vs-rebuild consistency tests

This is especially important.

For accepted moves, test that:

1. build guidance from state A
2. preview/apply a move to reach state B
3. update guidance incrementally from the preview patch
4. rebuild guidance from state B
5. assert the two guidance states match

This should be tested for:

- swap
- transfer
- clique swap where relevant

## Search-level tests

Add tests for:

- guided sampler honors `allowed_sessions`
- guided sampler falls back when no repeat constraint exists
- guided sampler falls back when there are no active offenders
- guided sampler returns a swap touching an offender session on a handcrafted repeat-heavy case
- seed stability for same config remains intact

## Benchmark-facing validation

For every behavior-changing slice, compare:

- final score
- iterations per second
- last-improvement timing
- late-improvement counts
- move-family telemetry
- new guidance telemetry if added

---

## Performance guardrails

These are mandatory.

## 1. No broad rescans on the per-attempt path

Per-attempt guided sampling may:

- sample an anchor
- localize its session
- preview a bounded number of candidates

It may **not**:

- rescan all pairs
- rebuild offender structures
- search the full neighborhood exhaustively

## 2. Accepted-move updates must stay local

Incremental guidance maintenance should only touch the pairs listed in `pair_contact_updates`.

## 3. Candidate preview budget must stay explicit and small

Do not let Phase 1 drift into implicit neighborhood search.

## 4. Random fallback must remain first-class

The feature should bias proposals, not make the solver brittle.

## 5. Keep memory overhead honest

Avoid adding dense pair-index inverse tables or per-pair session caches in Phase 1 unless profiling proves they are necessary.

---

## Risks and mitigation

## Risk 1 — Throughput drops more than quality improves

Mitigation:

- keep `candidate_preview_budget` small
- benchmark fixed-iteration and fixed-time lanes separately
- do not judge quality only by time-budget runs

## Risk 2 — Top-bucket guidance overfocuses on one pair and loses exploration

Mitigation:

- keep random fallback explicit
- consider endpoint randomization and within-bucket random sampling
- only broaden anchor-selection policy if benchmarks demand it

## Risk 3 — Guidance state drifts from actual runtime state

Mitigation:

- incremental-vs-rebuild tests
- rebuild on memetic offspring adoption
- optional debug asserts in tests / correctness-style paths

## Risk 4 — Session localization becomes unexpectedly expensive

Mitigation:

- start with on-demand scanning because it is simplest and likely cheap enough
- profile before adding per-pair session caches

## Risk 5 — Social Golfer improves, mixed workloads regress

Mitigation:

- keep feature off by default initially
- benchmark canonical non-target workloads too
- do not generalize to Phase 2 until the tradeoff is understood

---

## Exit criteria for Phase 1

Phase 1 is a success only if benchmark evidence shows that the guided swap path is a net positive on the target plateau workloads.

Recommended exit criteria:

1. the implementation is correct and incrementally maintainable
2. same-machine benchmarks show either:
   - materially better solution quality at equal budgets, or
   - materially better plateau shape / later improvements at acceptable throughput cost
3. the performance cost is understood and bounded
4. the feature remains configuration-gated and truthful

If those conditions are not met, Phase 1 should stop at the most successful slice rather than forcing expansion into generic pressure views.

---

## Immediate next steps

1. review / tighten this Phase 1 plan
2. decide the minimal public config surface for the first experiment
3. implement Slice 1 and Slice 2 first
4. validate incremental-vs-rebuild correctness before adding the guided sampler itself
5. only then wire in bounded guided swap proposal generation

---

## Summary

Phase 1 should be implemented as a **repeat-guided swap proposal layer** that plugs into the current `solver3` search loop without disturbing exact scoring or move-kernel truth.

The most important architecture choices are:

- keep guidance state outside `RuntimeState`
- reuse exact `pair_contacts`
- update guidance incrementally from accepted preview patches
- rebuild on non-local state replacement
- use sparse offender buckets instead of an exact heap
- localize offender sessions on demand
- keep proposal ranking bounded and exact
- preserve a first-class random fallback path

This is the narrowest performance-aware implementation path that still gives the idea a fair and benchmarkable test.
