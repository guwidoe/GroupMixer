# Solver3 Implementation Plan

## Status

Implemented through Epic S3-6 with a final **internal-only / no-rollout** decision.

Current readiness snapshot:

- `solver3` is now a runnable internal solver family through the shared engine registry
- dense compiled-problem, flat runtime state, permanent oracle, and runtime kernels for `swap`, `transfer`, and `clique_swap` are implemented
- shared hotpath, path, representative, property, and search-regression participation exists
- current evidence does **not** support product-facing rollout
- current evidence also does **not** support the claim that `solver3` is an overall performance winner over `solver1`

This directory remains the planning and review home for the implementation track whose purpose was to test whether GroupMixer could host a solver family that is both:

- materially more performance-oriented than the current `solver2` runtime line
- structurally cleaner and more explicit than the current `solver1` implementation

This plan intentionally treated `solver3` as a fresh design track rather than an incremental continuation of the current `solver2` runtime rescue work.

## Why `solver3` exists

The current repo has already proven several important things:

- `solver1` is the practical production-competitive baseline
- `solver2` successfully established a second-family seam, a correctness-first oracle/reference implementation, parity coverage, and shared benchmark/test infrastructure
- the bounded Phase B rescue effort for `solver2` did not produce enough same-machine evidence to justify continued optimization by default

That leaves a valuable open question:

> can GroupMixer support a solver family whose runtime architecture is designed from day 1 for dense-state hotpath performance while still keeping a cleaner abstraction boundary than `solver1`?

`solver3` exists to answer that question explicitly.

## Doctrine alignment

This plan is intentionally aligned with:

- `docs/reference/principles/AGENTIC_ENGINEERING_PRINCIPLES.md`
- `docs/proposals/2026-04-02-solver-v2-architecture.md`
- `docs/MULTI_SOLVER_TARGET_ARCHITECTURE.md`
- `docs/BENCHMARKING_ARCHITECTURE.md`
- `docs/TESTING_STRATEGY.md`
- `docs/SOLVER_ENGINE_RESHAPE_PLAN.md`
- the practical lessons captured by `solver2` Phase A and Phase B

Primary doctrine-level choices:

1. keep architecture honest
2. design explicit ownership and explicit seams
3. keep the verification platform shared
4. use benchmark-gated execution rather than optimism
5. preserve a permanent oracle path for semantic truth
6. stop early if the runtime architecture is not proving itself

## Intended outcome

`solver3` should aim to become:

- a third internal solver family under `backend/core/src/solver3/`
- a runtime-first compiled-kernel solver optimized for dense indexed data
- a solver with a permanent recompute oracle and runtime drift checks
- a family that participates in the existing engine registry, shared benchmark platform, and cross-solver verification surface

`solver3` is **not** intended to be:

- a rename of `solver2`
- a continuation of the current `solver2` runtime state layout
- a generic trait-heavy constraint framework
- a product-facing rollout candidate before hard benchmark evidence exists

## Scope

In scope:

- add a new `solver3` directory and implementation track under `backend/core/src/`
- design and implement a new compiled-problem format and runtime state layout
- keep a permanent oracle/recompute path inside `solver3`
- implement runtime-first move kernels for `swap`, `transfer`, and `clique_swap`
- build a thin search driver over explicit move kernels and bounded candidate sampling
- wire truthful `solver3` metadata into registry, contracts, tests, and benchmarks when the family becomes runnable
- compare `solver3` against `solver1` and `solver2` using the existing same-machine benchmark platform

Out of scope initially:

- broad product-facing rollout
- webapp/runtime UX support
- recommendation/tuning maturity beyond truthful metadata
- additional language/runtime integration
- speculative heuristic research unrelated to the core runtime kernel design

## Design goals

`solver3` should optimize for five things simultaneously:

### 1. Runtime efficiency

Hot paths should avoid:

- full-state cloning per preview
- full score snapshots per attempt
- nested `Vec<Vec<_>>` structures in hot runtime state where a flat representation is viable
- `HashMap` lookups in inner loops
- full neighborhood materialization unless benchmark evidence proves it is worthwhile

### 2. Explicit abstraction

The architecture should make it obvious:

- what is immutable vs mutable
- what belongs to compile time vs runtime
- which move families own which updates
- what the search driver is allowed to do
- where oracle truth comes from

### 3. Mechanical verifiability

The design should support:

- recompute-backed parity checks
- runtime-vs-oracle drift checks
- focused invariant tests
- truthful benchmark telemetry
- deterministic same-seed replay where claimed

### 4. Small trusted runtime contracts

Inner-loop contracts should stay narrow:

- sample move candidate
- preview delta / patch
- accept or reject
- apply accepted patch
- occasionally drift-check against the oracle

### 5. Graceful kill criteria

The plan should make it easy to stop if the architecture still fails to approach competitiveness.

## Core architectural recommendation

The recommended shape for `solver3` is:

> immutable compiled problem + flat dense runtime state + tiny patch-based move previews + permanent recompute oracle + thin search orchestration

In practice, that means `solver3` should be designed around **three distinct layers**.

## Layer 1 — Immutable compiled problem

The compiled problem is the read-only, indexed, cache-friendly representation of the scenario.

### Responsibilities

- assign integer indices for people, groups, sessions, cliques, and constraints
- normalize IDs/strings at the input boundary
- precompute all runtime-relevant adjacency/index structures
- validate all static configuration and structural constraints
- own the canonical static interpretation of the problem

### Required properties

- cheap shared ownership, likely `Arc<CompiledProblem>`
- no runtime mutation
- no string-keyed lookup in hot paths
- no hidden interpretation logic inside move kernels

### Recommended compiled data

#### Identity/index tables

- `person_idx -> person metadata`
- `group_idx -> group metadata`
- `session_idx -> session metadata`
- `person_id_to_idx`, `group_id_to_idx` only at compile-time / boundary surfaces

#### Participation and session availability

- dense per-person allowed-session mask or compact bitset
- explicit `person_participates(session, person)` table
- precompiled active-session counts if useful for heuristics

#### Capacity metadata

- per-session effective capacities for each group
- precomputed movable-capacity facts where relevant

#### Clique metadata

- clique index -> member list
- per-session active membership
- person -> clique mapping
- precomputed clique size and activation masks

#### Constraint adjacency

For each person, clique, and session, compile adjacency lists for:

- forbidden-pair constraints
- should-together constraints
- pair-meeting constraints
- attribute-balance constraints
- immovable constraints
- repeat-encounter settings

The goal is that move kernels can answer:

> given the touched people/groups/session, which score surfaces may change?

without broad rescans.

#### Pair indexing

This is a critical design decision.

`solver3` should avoid `Vec<Vec<u32>>` contact matrices in the hot runtime path. Prefer:

- a packed upper-triangular pair index
- direct `pair_index(person_a, person_b) -> usize`
- one contiguous `Vec<u16>` / `Vec<u32>` for pair counts

This same packed pair indexing should be reused for:

- contact counts
- repeat-encounter counts or penalties where feasible
- pair-meeting runtime counts when representable as dense pair tables

## Layer 2 — Runtime state

The runtime state should be minimal, dense, and explicitly optimized for preview/apply operations.

### Responsibilities

- own current assignment state
- own aggregate score totals needed for accept/reject
- own compact mutable structures needed by move kernels
- apply patches cheaply
- avoid carrying oracle-only data by default

### Explicit runtime/oracle separation

This should exist from the first implementation milestone.

#### Runtime state should contain only what the search loop needs

Examples:

- `person_location[session, person] -> group or none`
- `group_members[session, group] -> compact member list`
- `group_sizes[session, group]`
- `pair_contact_counts[pair_idx]`
- aggregate repetition counters / penalties
- aggregate per-constraint-family counters
- current score breakdown used for telemetry and acceptance

#### Oracle state should remain separate

The oracle path may own or reconstruct richer data like:

- full forensic score breakdowns
- debugging views
- validation-specific representations
- parity-friendly derived artifacts

The runtime state should be convertible to an oracle view on demand, but should not carry that weight in the hot path.

### Recommended runtime data layout

#### Person location

Use dense indexed arrays rather than sparse maps.

Example:

- `Vec<Option<GroupIdx>>` of length `num_sessions * num_people`

#### Group membership

Use compact per-group member vectors or fixed-capacity slabs.

Preferred properties:

- cheap membership iteration
- cheap swap/transfer/clique replacement operations
- low allocation churn
- deterministic ordering where required

Depending on measured performance, consider:

- fixed-capacity small arrays per session/group
- dense member arrays plus explicit size counters
- swap-remove where order does not matter
- sorted order only where determinism or benchmark reproducibility requires it

#### Contact / pair counts

Store in one contiguous vector indexed by packed pair index.

Potential representations:

- `Vec<u8>` if session count bounds make overflow impossible
- `Vec<u16>` if safer
- one separate vector for total encounters and derived repetition math, or a small struct per pair if benchmarked as beneficial

#### Aggregate score components

Keep runtime score accounting narrow and explicit.

Example surfaces:

- `total_score`
- `unique_contacts`
- `repetition_penalty`
- `constraint_penalty`
- `attribute_balance_penalty`
- per-family violation counters if needed for telemetry

Avoid carrying full snapshots as the default preview payload.

## Layer 3 — Oracle/recompute layer

The oracle layer is permanent and non-negotiable.

### Responsibilities

- recompute the complete observable score from the current state
- serve as the semantic source of truth for tests and drift checks
- support parity against `solver1` or other shared contract surfaces
- support forensic debugging when runtime and expected behavior diverge

### Required properties

- correctness-first rather than micro-optimized
- explicit and separately named from runtime kernels
- callable from tests, debug assertions, and sampled runtime validation

### Drift-check policy

Recommended default approach:

- sampled drift checks on accepted moves only
- deterministic sampling cadence for reproducibility
- ability to run every accepted move in special debug/test modes
- immediate failure with actionable diagnostic metadata if runtime and oracle diverge

## Directory and module shape

Recommended initial layout:

```text
backend/core/src/solver3/
  IMPLEMENTATION_PLAN.md
  mod.rs

  compiled_problem.rs
  runtime_state.rs
  oracle.rs
  telemetry.rs

  scoring/
    mod.rs
    delta.rs
    recompute.rs

  moves/
    mod.rs
    patch.rs
    feasibility.rs
    swap.rs
    transfer.rs
    clique_swap.rs

  search/
    mod.rs
    engine.rs
    sampler.rs
    acceptance.rs
    scheduling.rs

  validation/
    mod.rs
    invariants.rs
    drift.rs
    parity.rs

  tests.rs
```

Notes:

- `oracle.rs` may be a thin wrapper around `state -> recompute` plus conversion helpers, or may be folded into `scoring/recompute.rs` if that proves cleaner
- `telemetry.rs` should centralize solver3-specific runtime counters so search logic remains thin
- `moves/patch.rs` should define runtime patch structures reused by all move families
- `search/sampler.rs` should own bounded candidate generation rather than each move family allocating arbitrary vectors

## Runtime move model

The move architecture should be explicit and uniform across families.

### Candidate move types

Use small typed move values:

- `SwapMove`
- `TransferMove`
- `CliqueSwapMove`

Prefer compact field sets using indices only.

### Preview result contract

The default runtime preview result should be **small**.

Recommended shape:

```rust
struct MoveDelta<Patch> {
    candidate: CandidateMove,
    delta_score: f64,
    delta_unique_contacts: i32,
    delta_repetition_penalty: i32,
    delta_constraint_penalty: i32,
    delta_attribute_balance_penalty: i32,
    patch: Patch,
}
```

Alternative forms are acceptable, but the key constraints are:

- no full rich score snapshot by default
- patch contains only changed slots
- enough aggregate data exists for telemetry and acceptance
- patch is directly applicable without recompute

### Patch design

A patch should contain only what is needed to mutate state.

Examples:

- changed person locations
- changed group membership slots
- changed group sizes
- changed pair-contact counters
- changed pair-meeting counters
- changed aggregate penalty counters

Patches should be:

- directly applyable
- optionally reversible if rollback-based search modes are explored later
- cheap to construct
- compact enough for hot loops

## Move-family recommendations

## Swap

### Why start here

Swap remains the highest-leverage family because:

- it is heavily exercised in representative solve paths
- it exposes the core contact/repetition/accounting logic
- it is the best early signal for runtime viability

### Runtime kernel guidance

A swap preview should:

1. identify the two people and current groups in a session
2. identify only the touched pair-contact neighborhoods
3. compute the score delta using local data only
4. build a tiny patch
5. return aggregate delta + patch

The apply path should:

- update the group membership representation
- update person locations
- update pair-contact counts and aggregate counters
- apply aggregate score deltas directly

## Transfer

Transfer should be treated as a first-class kernel, not a special-case mutation bolted onto swap logic.

### Runtime kernel guidance

A transfer preview should:

- verify source/target feasibility using dense state + compiled metadata
- update only the moved person’s touched neighborhoods
- update source/target group-local attribute balance and pair constraints
- build a patch without full rescans

## Clique swap

This is likely the hardest family and should be designed explicitly.

### Runtime kernel guidance

A clique-swap preview should:

- treat the clique as a compact active member set
- treat displaced targets as a second compact set
- compute all affected pair deltas through the packed pair index
- update only the relevant group-local and pair-local counters
- avoid broad scans across unrelated people/groups/sessions

### Specific caution

Because clique swaps touch multiple people at once, the implementation should be careful about:

- patch compactness
- duplicate pair updates
- deterministic ordering
- avoiding repeated work across clique members

## Search architecture

The search driver should remain thin.

### Search loop responsibilities

The engine should only:

1. choose a move family
2. ask the sampler for a bounded candidate
3. call the family preview kernel
4. decide acceptance/rejection
5. apply patch if accepted
6. update telemetry
7. occasionally oracle-check

### What should not live in the engine

Do not centralize move-specific dataflow in the search driver.

The engine should not contain:

- direct per-constraint update logic
- ad hoc score recomputation logic
- move-family-specific mutation details
- hidden fallback semantics to another solver family

### Candidate sampling guidance

Candidate generation should be bounded and direct.

#### Swap sampling

Sample from:

- active session
- two non-empty groups
- one valid person from each group

#### Transfer sampling

Sample from:

- active session
- source groups with movable members
- one movable person
- feasible target group

#### Clique swap sampling

Sample from:

- active session
- active clique in a valid source group
- bounded valid target replacement set

The sampler should prefer reading dense runtime facts rather than building candidate vectors.

### Acceptance logic

Acceptance policy should stay separate from preview generation.

Recommended split:

- `search/acceptance.rs` owns SA-like or other acceptance scheduling
- move kernels expose only preview deltas
- engine combines the two without coupling policy to mutation code

## Telemetry and benchmark surfaces

`solver3` should fit the existing shared benchmark/reporting system rather than inventing a new stack.

### Required telemetry

At minimum, keep truthful counters for:

- attempts / accepted / rejected per move family
- preview seconds / apply seconds per move family
- full recomputation count / seconds when oracle checks run
- drift-check count and failures
- iteration count and stop reason

### Shared benchmark lanes

`solver3` should plug into the current shared benchmark system with solver-family-specific probes only where internals differ.

Required benchmark classes once the family is ready:

- hotpath swap preview/apply
- hotpath transfer preview/apply
- hotpath clique-swap preview/apply
- representative full-solve suite
- path suite
- at least one constraint-heavy / adversarial suite

## Verification strategy

`solver3` should reuse the same layered strategy already established in this repo.

### Layer 1 — narrow unit tests

For:

- pair index math
- patch construction/application
- feasibility edge cases
- aggregate counter updates
- deterministic ordering behavior

### Layer 2 — invariant tests

For:

- no duplicate assignments
- location and membership consistency
- capacity correctness
- clique integrity
- immovable correctness
- participation correctness

### Layer 3 — oracle equivalence tests

For each move family:

- runtime preview delta matches oracle recompute delta
- runtime apply patch matches runtime preview
- sequential accepted moves do not drift from oracle

### Layer 4 — cross-solver parity tests

Use the existing shared cross-solver infrastructure where meaningful.

Targets:

- narrow representative parity against `solver1`
- score-quality comparison categories where exact parity is not expected
- truthful invariant-only participation where search behavior diverges

### Layer 5 — benchmark gates

Every major implementation slice must be benchmarked before the next one is approved.

## Explicit non-recommendations

To protect solver3 from becoming another sprawling experiment, avoid these patterns unless benchmark evidence demands them:

- trait-object-heavy generic constraint engines
- reactive/dataflow update frameworks in hot runtime state
- rich preview objects carrying full oracle score snapshots
- default runtime dependence on `HashMap`/`BTreeMap` in inner loops
- hidden fallback to `solver1` or `solver2`
- broad preview-time rescans with vague invalidation semantics

## Implementation epics

The implementation should be executed through hard gates.

## Epic S3-1 — Scaffolding and compile-time kernel foundation

### Outcome

A new `solver3` family exists as a directory and typed registry target with truthful bootstrap behavior, explicit notes, and a compile-time design skeleton.

### Main deliverables

- create `backend/core/src/solver3/`
- add `mod.rs`
- add truthfully bootstrapped registry/config support in `models.rs` / `engines/mod.rs`
- expose solver3 in discovery surfaces only when the metadata is truthful
- add explicit unsupported errors for unimplemented solve/recommendation paths

### Acceptance

- `solver3` exists as a separately discoverable family
- unsupported capabilities fail explicitly
- no hidden fallback occurs

## Epic S3-2 — Dense compiled problem and flat runtime state

### Outcome

`solver3` can compile inputs into a dense runtime-friendly representation and build a flat runtime state plus a separate oracle path.

### Main deliverables

- `compiled_problem.rs`
- `runtime_state.rs`
- packed pair index representation
- oracle conversion/recompute entrypoint
- deterministic initialization
- invariant validation baseline

### Acceptance

- no runtime hotpath depends on string lookup
- pair indexing is flat and explicit
- runtime state and oracle state are separate and cross-checkable

## Epic S3-3 — Swap vertical slice with patch-based runtime preview/apply

### Outcome

`swap` is implemented end-to-end with a compact patch and oracle-backed drift checking.

### Main deliverables

- typed swap move
- preview/apply patch path
- oracle equivalence tests
- first honest solver3 hotpath lane
- initial solve-level benchmark evidence on swap-heavy workloads

### Acceptance

- runtime swap preview avoids full recomputation by default
- swap apply uses direct patch application
- benchmark evidence shows solver3 is plausibly competitive early

## Epic S3-4 — Search driver and bounded candidate sampling

### Outcome

`solver3` runs end-to-end through a thin search loop with bounded direct sampling and truthful telemetry.

### Main deliverables

- `search/engine.rs`
- `search/sampler.rs`
- `search/acceptance.rs`
- deterministic seed handling
- progress/observer support
- representative and path suite participation

### Acceptance

- solve path is runnable through `gm-core`
- candidate generation does not rely on full neighborhood materialization by default
- deterministic same-seed behavior is preserved where claimed

## Epic S3-5 — Transfer runtime kernel

### Outcome

`transfer` is implemented as a first-class patch-based runtime family backed by the same dense runtime state.

### Main deliverables

- typed transfer move
- preview/apply patch path
- oracle equivalence coverage
- transfer hotpath benchmark lane
- representative/path regressions remain non-regressed

### Acceptance

- no full recomputation in the default runtime transfer path
- transfer telemetry remains truthful
- transfer hotpath is benchmarked honestly

## Epic S3-6 — Clique-swap runtime kernel

### Outcome

`clique_swap` is implemented without breaking the runtime-state simplicity goal.

### Main deliverables

- typed clique-swap move
- compact multi-person patch logic
- oracle drift checks and regressions
- clique-swap hotpath benchmark lane
- constraint-heavy benchmark evidence

### Acceptance

- clique-swap works end-to-end with explicit patch ownership
- the runtime path stays understandable and benchmarkable
- solver3 remains plausibly competitive after this complexity lands

## Epic S3-7 — Benchmark review and rollout judgment

### Outcome

A human decision is made from same-machine evidence, not architectural optimism.

### Main deliverables

- same-machine solver1 vs solver3 comparison
- same-machine solver2 vs solver3 comparison where useful
- updated docs recording the decision
- explicit continue / internal-only / shelve judgment

### Acceptance

- the decision is recorded explicitly
- no broader rollout or continuation is claimed without evidence

## Final benchmark review

`solver3` succeeded as an architectural experiment and implementation track, but it did **not** achieve its original practical ambition of becoming both more elegant and clearly more performant than `solver1` on the current evidence set.

### Gate recap

- **Gate S3-A**: provisionally passed
  - early swap hotpath landed within the target rough range
- **Gate S3-B**: mixed / not cleanly passed
  - representative runtime looked promising on some lanes, but search quality regressed on a constrained representative case
- **Gate S3-C**: not passed cleanly
  - all move families are implemented, but clique-swap remains materially slower than solver1 on the sampled hotpath lane

### Final same-machine solver1 vs solver3 evidence

Representative full-solve:

- `representative.small-workshop-balanced`
  - solver1: `0.002501029s`
  - solver3: `0.007495345s`
  - ratio: `~3.00x`
  - final score: both `3.0`
- `representative.small-workshop-constrained`
  - solver1: `0.002970148s`
  - solver3: `0.003148478s`
  - ratio: `~1.06x`
  - final score: solver1 `4.0`, solver3 `10.0`

Path suite:

- `path.swap.forbidden-pair`
  - solver1: `0.001125679s`
  - solver3: `0.001995252s`
  - ratio: `~1.77x`
- `path.transfer.pair-meeting`
  - solver1: `0.001407142s`
  - solver3: `0.000986559s`
  - ratio: `~0.70x`
- `path.clique-swap.partial-participation`
  - solver1: `0.003072473s`
  - solver3: `0.010069873s`
  - ratio: `~3.28x`
- `path.search-driver.allowed-sessions`
  - solver1: `0.000878572s`
  - solver3: `0.001033993s`
  - ratio: `~1.18x`
- `path.construction.clique-immovable`
  - solver1: `0.001088853s`
  - solver3: `0.003204071s`
  - ratio: `~2.94x`

Hotpath preview lanes:

- swap preview:
  - solver1: `9.81378125 µs`
  - solver3: `22.789359375 µs`
  - ratio: `~2.32x`
- transfer preview:
  - solver1: `8.481734375 µs`
  - solver3: `18.56190625 µs`
  - ratio: `~2.19x`
- clique-swap preview:
  - solver1: `18.021729166666668 µs`
  - solver3: `140.35504166666667 µs`
  - ratio: `~7.79x`

### Final solver2 vs solver3 evidence

Representative full-solve:

- balanced:
  - solver2: `0.0062935352s`
  - solver3: `0.007495345s`
  - ratio vs solver2: `~1.19x` slower
  - final score: both `3.0`
- constrained:
  - solver2: `0.0097992420s`
  - solver3: `0.003148478s`
  - ratio vs solver2: `~0.32x`
  - but solver3 quality regressed to `10.0` while solver2 held `4.0`

Path suite:

- solver3 beat solver2 on:
  - `path.swap.forbidden-pair`
  - `path.transfer.pair-meeting`
  - `path.search-driver.allowed-sessions`
  - `path.construction.clique-immovable`
- solver3 remained worse on:
  - `path.clique-swap.partial-participation`

### Architectural lesson

`solver3` partially validates the runtime-first kernel hypothesis:

- dense compiled data + flat runtime state + compact patches can produce competitive or better runtime on some swap/transfer/search-driver lanes
- but that architecture alone does not guarantee overall solve quality or clique-heavy competitiveness
- the hardest move family (`clique_swap`) remains the clearest performance and complexity stress point

### Final decision

Decision: **keep `solver3` as an internal-only experimental family; do not advance it toward rollout and do not claim it beats `solver1` overall**.

Reasons:

- solve-level quality regressed on the constrained representative case
- clique-swap remains materially slower than solver1 on the sampled hotpath lane
- representative evidence does not justify saying solver3 is the new best runtime family
- the most durable value is the architecture, runtime-kernel experiments, and the benchmark/test evidence they produced

### Operational conclusion

From this point forward:

- keep `solver3` available for internal comparison and architectural learning
- do not broaden rollout scope
- do not describe solver3 as production-ready or solver1-replacing
- only reopen major optimization or quality work if a narrowly scoped, benchmark-backed hypothesis is approved

## Benchmark gates

These gates should be stricter than the original solver2 bring-up because solver2 already taught the repo what failure looks like.

## Gate S3-A — Early runtime viability gate

After the first real swap vertical slice:

- solver3 swap hotpath should land in the same rough order of magnitude as solver1 immediately
- if swap preview is still materially far from solver1 on the first serious runtime design, pause before broadening scope

Suggested target:

- within roughly `<= 2.5x` of solver1 on the first honest swap-preview lane

This is not a rollout target. It is an early viability screen.

## Gate S3-B — Search viability gate

After solver3 becomes runnable end-to-end on swap-heavy representative cases:

- representative runtime should show that the runtime architecture is plausibly closing the gap, not reproducing solver2’s large residual slowdown
- exact parity is not required, but the direction must be strong and stable across reruns

Suggested target:

- within roughly `<= 3x` of solver1 on the first representative swap-heavy suite

If this is badly missed, stop before implementing the more complex move families.

## Gate S3-C — Family complexity gate

After transfer and clique-swap land:

- all hotpath lanes must remain clearly competitive in shape
- representative and path suites must not collapse under the added family complexity
- solver3 must still look like a real candidate rather than an elegant but slow experiment

Suggested target:

- no move family should remain obviously catastrophic relative to solver1 without a very specific benchmark-backed explanation

## Gate S3-D — Rollout-candidate gate

Before any product-facing discussion:

- parity/invariant confidence is high
- benchmark evidence is broad enough to be credible
- capability metadata is truthful
- solve-level runtime is competitive enough to justify operating cost and complexity

## Suggested execution order

1. create the directory and bootstrap metadata only
2. implement the dense compiled problem and flat runtime state
3. implement swap preview/apply with packed pair updates
4. benchmark immediately
5. only if early swap results are promising, add runnable search
6. only if runnable search results remain promising, add transfer
7. only if transfer remains promising, add clique-swap
8. only then make an explicit continue vs shelve decision

## Initial tracking epics and todos

Created tracking items:

- Umbrella:
  - `TODO-e850527a` — EPIC: Execute solver3 implementation plan
- Epic S3-1:
  - `TODO-fe094175` — EPIC: Bootstrap solver3 family and truthful registry seams
  - `TODO-6c383885`
  - `TODO-0e0673e4`
  - `TODO-1feebc89`
  - `TODO-afd69832`
- Epic S3-2:
  - `TODO-afd32360` — EPIC: Build solver3 dense compiled problem and flat runtime state
  - `TODO-ad74becf`
  - `TODO-4ceeb446`
  - `TODO-f2e0b1e4`
  - `TODO-b66654c4`
- Epic S3-3:
  - `TODO-abdb1732` — EPIC: Implement solver3 swap vertical slice
  - `TODO-c9c792e4`
  - `TODO-40f99ce2`
  - `TODO-dfdeb3e0`
  - `TODO-c34a22f4`
- Epic S3-4:
  - `TODO-50881dd2` — EPIC: Make solver3 runnable with bounded-sampling search
  - `TODO-a21f9f00`
  - `TODO-dde6bdde`
  - `TODO-f6f1fc05`
  - `TODO-2dd852f0`
- Epic S3-5:
  - `TODO-b9bff136` — EPIC: Implement solver3 transfer runtime kernel
  - `TODO-b215f449`
  - `TODO-ac244697`
  - `TODO-abbe919f`
  - `TODO-5fe9f825`
- Epic S3-6:
  - `TODO-5bc94f4f` — EPIC: Implement solver3 clique-swap runtime kernel
  - `TODO-1c170a63`
  - `TODO-d22ded4f`
  - `TODO-4aa86d4c`
  - `TODO-93932810`
- Epic S3-7:
  - `TODO-b2cde1f8` — EPIC: Record solver3 benchmark review and rollout judgment
  - `TODO-9e33b7ae`
  - `TODO-2c72f696`
  - `TODO-b06abd38`
  - `TODO-b69f2f88`

## Immediate next step

No further default rollout or optimization step is approved.

If future work reopens solver3, it should begin from a narrowly scoped, benchmark-backed quality or performance hypothesis rather than from the assumption that solver3 is already the successor to solver1.

## 2026-04 search refactor guardrails

The next approved `solver3` track is **search refactoring for extensibility**, not a generic rewrite of the hot kernels.

### Current architecture boundaries to preserve

- `backend/core/src/solver3/runtime_state.rs`
  - owns the dense mutable runtime facts
  - remains the only state mutated by accepted move application
- `backend/core/src/solver3/moves/{swap,transfer,clique_swap}.rs`
  - remain the concrete preview/apply kernel surface
  - continue to own move-family-specific feasibility, delta accounting, and patch construction
- `backend/core/src/solver3/search/engine.rs`
  - should shrink into orchestration only
  - may delegate policy, scheduling, and sampling, but must not re-absorb kernel logic into a new abstraction layer

### Non-negotiable performance rules

- no trait objects, boxed callbacks, or virtual dispatch in the per-iteration search path
- no new per-iteration heap allocation introduced by the refactor seams unless benchmark evidence justifies it explicitly
- keep preview/apply kernels concrete, enum/struct-based, and inline-friendly
- policy abstraction is allowed only above the kernel layer
- future policy memory belongs in search-side context/state types, **not** in `RuntimeState`

### Target architectural split

The refactor should move toward:

- `search/acceptance.rs` — acceptance / temperature policy
- `search/family_selection.rs` — move-family ordering / weighted selection
- `search/candidate_sampling.rs` — bounded per-family candidate sampling helpers
- `search/context.rs` — search-side run context and mutable metrics / policy memory
- `search/engine.rs` — thin orchestrator over the concrete kernels

This split is specifically intended to make tabu / threshold / iterated-local-search style follow-on work possible **without** reopening the hot move kernels.

## Solver3 after the refactor: a concrete local-search substrate

The post-refactor architecture should be understood as:

> **concrete dense runtime kernels + pluggable search-side policy/orchestration**

That means `solver3` is no longer just "the current SA-like engine". It is a substrate for a family of **single-state local-search** drivers that all reuse the same concrete runtime state and preview/apply kernels.

### What belongs in the reusable substrate

- dense immutable `CompiledProblem`
- dense mutable `RuntimeState`
- concrete move-family kernels for `swap`, `transfer`, and `clique_swap`
- patch-based preview/apply contracts
- oracle/drift validation
- bounded candidate sampling helpers over dense runtime facts

### What should vary by future driver

- acceptance rule
- family-ordering / neighborhood scheduling policy
- search memory (for example tabu tenure or threshold history)
- restart / perturbation behavior
- stop / reheat / plateau-escape policy

### Why this is a better fit for tabu / threshold / ILS than for GA

`solver3` is fundamentally optimized around **one current state**, **one candidate move**, and **incremental local delta accounting**.

That maps naturally onto:

- tabu search
- threshold acceptance
- late acceptance
- iterated local search
- variable-neighborhood / neighborhood-scheduling families

It maps much less naturally onto population-oriented methods like GA, where the core architecture wants:

- many concurrent solution states
- crossover-specific representations
- population evaluation / replacement bookkeeping
- a different notion of search memory and diversification

GA is still possible in principle, but it is **not** the native extension path for the current runtime model.

### Anti-goal: premature generic metaheuristic frameworking

Do **not** respond to this extensibility by building:

- a trait-heavy metaheuristic framework
- boxed strategy objects in the inner loop
- callback-rich generic move-preview abstractions
- a one-size-fits-all policy interface that every future heuristic must implement

The intended extension story is deliberately narrower:

- keep hot kernels concrete
- keep search memory explicit and search-side
- add new drivers by composing concrete modules, not by abstracting away the kernels

### Practical extension rule

If a future engineer wants to add tabu / threshold / ILS behavior, the default path should be:

1. add or extend search-side context/memory types
2. add a new concrete acceptance / scheduling / restart module
3. add or adjust a search driver/orchestrator
4. reuse the existing move kernels unchanged
5. benchmark the result against the same Sailing Trip guardrail bundle

If a proposed extension requires reopening all three move kernels, it is probably violating the intended architecture.

## 2026-04 before-change benchmark baseline

Same-machine baseline captured on branch `autoresearch/solver3-raw-performance-2026-04-04` at commit `ee3f511` before the search refactor started.

### Real Sailing Trip solver3 probe lanes

- `search_iteration`: `668.481 µs/op`
  - `backend/benchmarking/artifacts/runs/hotpath-search-iteration-sailing-trip-demo-solver3-20260404T235337Z-0215dbb1/run-report.json`
- `swap_preview`: `12.103 µs/op`
  - `backend/benchmarking/artifacts/runs/hotpath-swap-preview-sailing-trip-demo-solver3-20260404T235337Z-096ca4ae/run-report.json`
- `swap_apply`: `6.446 µs/op`
  - `backend/benchmarking/artifacts/runs/hotpath-swap-apply-sailing-trip-demo-solver3-20260404T235337Z-c83b5c69/run-report.json`
- `transfer_preview`: `8.239 µs/op`
  - `backend/benchmarking/artifacts/runs/hotpath-transfer-preview-sailing-trip-demo-solver3-20260404T235337Z-3bc380c8/run-report.json`
- `transfer_apply`: `5.977 µs/op`
  - `backend/benchmarking/artifacts/runs/hotpath-transfer-apply-sailing-trip-demo-solver3-20260404T235338Z-270abd65/run-report.json`
- `clique_swap_preview`: `145.970 µs/op`
  - `backend/benchmarking/artifacts/runs/hotpath-clique-swap-preview-sailing-trip-demo-solver3-20260404T235338Z-2cd36d70/run-report.json`
- `clique_swap_apply`: `6.970 µs/op`
  - `backend/benchmarking/artifacts/runs/hotpath-clique-swap-apply-sailing-trip-demo-solver3-20260404T235338Z-9ddea04f/run-report.json`

### Real Sailing Trip canonical full-solve checkpoint

- suite: `stretch-sailing-trip-demo-time-solver3-canonical`
- final score: `4410`
- iterations: `287085`
- runtime: `15.000010s`
- stop reason: `time_limit_reached`
- run report:
  - `backend/benchmarking/artifacts/runs/stretch-sailing-trip-demo-time-solver3-canonical-20260404T235338Z-af15ec14/run-report.json`

Every search-refactor phase should be compared against these same-machine checkpoints before continuing.

## 2026-04 refactor phase benchmark log

The search refactor was executed as a staged sequence with benchmark checkpoints after each major extraction.

### Acceptance extraction (`1f8d2a8`)

- search iteration rerun:
  - `backend/benchmarking/artifacts/runs/hotpath-search-iteration-sailing-trip-demo-solver3-20260404T235736Z-5073f236/run-report.json`
- canonical full solve:
  - `backend/benchmarking/artifacts/runs/stretch-sailing-trip-demo-time-solver3-canonical-20260404T235701Z-e212d66b/run-report.json`

### Family selector extraction (`6a2d7a4`)

- search iteration reruns:
  - `backend/benchmarking/artifacts/runs/hotpath-search-iteration-sailing-trip-demo-solver3-20260404T235922Z-3c780469/run-report.json`
  - `backend/benchmarking/artifacts/runs/hotpath-search-iteration-sailing-trip-demo-solver3-20260404T235954Z-ffa84e24/run-report.json`
- canonical full solve rerun:
  - `backend/benchmarking/artifacts/runs/stretch-sailing-trip-demo-time-solver3-canonical-20260405T000014Z-01bb0f4a/run-report.json`

### Candidate sampler extraction (`98ed9ef`)

- search iteration:
  - `backend/benchmarking/artifacts/runs/hotpath-search-iteration-sailing-trip-demo-solver3-20260405T000723Z-de761c0b/run-report.json`
- canonical full solve:
  - `backend/benchmarking/artifacts/runs/stretch-sailing-trip-demo-time-solver3-canonical-20260405T000723Z-ab1089fb/run-report.json`

### Search context extraction (`8cd042c`)

- search iteration:
  - `backend/benchmarking/artifacts/runs/hotpath-search-iteration-sailing-trip-demo-solver3-20260405T001139Z-fb9c4b93/run-report.json`
- canonical full solve:
  - `backend/benchmarking/artifacts/runs/stretch-sailing-trip-demo-time-solver3-canonical-20260405T001140Z-76d0eaea/run-report.json`

### Thin-engine checkpoint (`be78db2`)

- search iteration:
  - `backend/benchmarking/artifacts/runs/hotpath-search-iteration-sailing-trip-demo-solver3-20260405T001435Z-c72b91c0/run-report.json`
- canonical full solve:
  - `backend/benchmarking/artifacts/runs/stretch-sailing-trip-demo-time-solver3-canonical-20260405T001436Z-e03242ad/run-report.json`

### End-to-end post-refactor bundle (`5a218e4` working tree / final verification pass)

- `search_iteration`: `751.672 µs/op`
  - `backend/benchmarking/artifacts/runs/hotpath-search-iteration-sailing-trip-demo-solver3-20260405T001756Z-2e0e6145/run-report.json`
- `swap_preview`: `11.799 µs/op`
  - `backend/benchmarking/artifacts/runs/hotpath-swap-preview-sailing-trip-demo-solver3-20260405T001756Z-a842e206/run-report.json`
- `swap_apply`: `6.035 µs/op`
  - `backend/benchmarking/artifacts/runs/hotpath-swap-apply-sailing-trip-demo-solver3-20260405T001756Z-5d17d465/run-report.json`
- `transfer_preview`: `15.939 µs/op`
  - `backend/benchmarking/artifacts/runs/hotpath-transfer-preview-sailing-trip-demo-solver3-20260405T001756Z-a060556a/run-report.json`
- `transfer_apply`: `12.980 µs/op`
  - `backend/benchmarking/artifacts/runs/hotpath-transfer-apply-sailing-trip-demo-solver3-20260405T001757Z-f7509593/run-report.json`
- `clique_swap_preview`: `188.769 µs/op`
  - `backend/benchmarking/artifacts/runs/hotpath-clique-swap-preview-sailing-trip-demo-solver3-20260405T001757Z-02800456/run-report.json`
- `clique_swap_apply`: `14.752 µs/op`
  - `backend/benchmarking/artifacts/runs/hotpath-clique-swap-apply-sailing-trip-demo-solver3-20260405T001758Z-92b09ad4/run-report.json`
- canonical full solve:
  - score `4399`
  - iterations `305892`
  - runtime `15.000081s`
  - `backend/benchmarking/artifacts/runs/stretch-sailing-trip-demo-time-solver3-canonical-20260405T001758Z-78409262/run-report.json`

### Regression note

The search-level checkpoints stayed in the same rough band as the pre-refactor baseline, and the 15-second canonical full-solve run did **not** collapse. However, the final hotpath bundle showed materially slower transfer/clique probe numbers even though the move-kernel files were untouched by this refactor.

That mismatch strongly suggests the current dev-profile/WSL hotpath lane is sensitive to whole-binary layout and ambient machine noise, not only to direct kernel edits. Treat those final hotpath deltas as a **guardrail warning**, not as proof that the search refactor semantically damaged the kernels.

Operational rule going forward:

- keep the same benchmark bundle active for every follow-on phase
- if a suspicious delta appears on a lane whose code did not change, rerun before acting
- use the dedicated same-machine remote benchmark lane before making irreversible architecture decisions from those microbench numbers
