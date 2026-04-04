# Solver2 Implementation Plan

## Status

Implemented through Epic 5 for internal comparison mode.

Current readiness snapshot:

- `solver2` is runnable through the shared engine registry
- shared data-driven, property, hotpath, and full-solve benchmark participation exists
- current evidence supports **Stage 1 — internal comparison mode only**
- the bounded Phase B runtime rescue effort has been reviewed and is now **shelved for further optimization by default**
- `solver2` is **not ready for broader product-facing rollout**

## Purpose

Define the implementation plan for turning the bootstrapped `solver2` skeleton into a real internal solver family in `gm-core`.

This plan is intentionally aligned with:

- `docs/reference/principles/AGENTIC_ENGINEERING_PRINCIPLES.md`
- `docs/proposals/2026-04-02-solver-v2-architecture.md`
- `docs/MULTI_SOLVER_TARGET_ARCHITECTURE.md`
- `docs/BENCHMARKING_ARCHITECTURE.md`
- `docs/TESTING_STRATEGY.md`
- `docs/SOLVER_ENGINE_RESHAPE_PLAN.md`

## Scope

In scope:

- implement `solver2` as a true parallel solver family under `backend/core/src/solver2/`
- preserve `solver1` as the semantic oracle and fallback production engine during development
- reuse the shared data-driven/property/benchmark platform
- add truthful `solver2` parity, invariant, and benchmark participation over time

Out of scope for this plan:

- broad product-facing runtime or webapp rollout of `solver2`
- silently routing `solver2` requests into `solver1`
- forcing `solver2` to mirror `solver1` internals
- building a separate benchmark stack for `solver2`
- introducing foreign-language execution or protocol work now

## Working rules

1. **Correctness before incrementality**
   - Start with a recompute-first implementation.
   - Do not introduce incremental cache maintenance until the recompute oracle is solid.

2. **One real move family at a time**
   - Implement `swap` end-to-end before moving on to `transfer` and `clique_swap`.

3. **Keep a permanent recompute oracle**
   - Even after incremental previews/applies exist, keep a full recomputation path for parity and drift detection.

4. **Reuse the shared verification platform**
   - Use the existing data-driven, property, and benchmark/reporting stack.
   - Add solver2-specific hotpath probes only where the internal architecture truly differs.

5. **Keep `solver2` internal until evidence exists**
   - No product-facing rollout before invariant confidence, parity evidence, and benchmark results are good enough.

## Planned execution order

1. correctness foundation
2. `swap` move kernel
3. `transfer` and `clique_swap`
4. minimal search baseline
5. parity, benchmarks, and optimization hardening

## Epic 1 — Correctness foundation

### Outcome

`solver2` can compile a problem, build initial state, validate invariants, and recompute scores correctly without depending on search or incremental cache tricks.

### Main files

- `backend/core/src/solver2/compiled_problem.rs`
- `backend/core/src/solver2/state.rs`
- `backend/core/src/solver2/scoring/mod.rs`
- `backend/core/src/solver2/scoring/recompute.rs`
- `backend/core/src/solver2/validation/invariants.rs`
- `backend/core/src/solver2/validation/parity.rs`

### Subtasks

#### 1.1 Compile `ApiInput` into `solver2::CompiledProblem`

Build the immutable compiled representation for:

- indexed people, groups, sessions
- participation and allowed-session structure
- compiled clique metadata
- compiled constraint-family indexes
- static move-generation/scoring adjacency where useful

#### 1.2 Build `solver2::SolutionState`

Implement deterministic initial state construction and mutable schedule ownership for:

- assignments / placement
- group occupancy / session participation views
- mutable scoring support state
- current score bookkeeping

#### 1.3 Implement invariant validation

Add explicit validation for:

- no duplicate assignments
- session/group capacity validity
- participation validity
- clique integrity / immovable assumptions where applicable
- any solver2-internal consistency checks needed before search

#### 1.4 Implement full recomputation scoring

Add correctness-first recomputation for the observable score surface, including the constraint families currently needed to match `solver1` semantics.

#### 1.5 Add narrow parity coverage

Use a representative corpus to verify:

- compiled problem correctness
- deterministic initial state behavior
- recompute parity against `solver1` on selected cases
- invariant validation on both valid and invalid states

### Acceptance criteria

- `CompiledProblem::compile(...)` succeeds on representative fixtures
- `SolutionState::new(...)` works deterministically
- full recomputation path exists and is used as the oracle
- invariant checks are explicit and actionable
- narrow parity coverage against `solver1` is in place

## Epic 2 — Implement `swap` end-to-end

### Outcome

`solver2` supports its first real move family end-to-end with explicit move typing, affected-region modeling, preview/apply behavior, and correctness checks against recomputation.

### Main files

- `backend/core/src/solver2/move_types.rs`
- `backend/core/src/solver2/affected_region.rs`
- `backend/core/src/solver2/moves/swap.rs`

### Subtasks

#### 2.1 Define typed swap move and affected-region modeling

Model:

- the explicit swap move value
- touched session/groups/people
- any touched pair neighborhoods or constraint indexes needed by scoring

#### 2.2 Implement swap feasibility and preview

Add:

- legality checks
- preview delta using the explicit affected region
- recompute cross-check helpers for debugging and tests

#### 2.3 Implement swap apply

Apply the mutation to `SolutionState` and update any solver2-owned caches or counts needed for correctness.

#### 2.4 Add swap correctness tests

Cover:

- preview vs apply parity
- sequential drift checks
- invariant preservation
- recompute equivalence after accepted swap application

#### 2.5 Add solver2 hotpath probe through the shared platform

Run `swap` preview/apply via the shared benchmark framework with explicit `solver_family: solver2` metadata.

### Acceptance criteria

- swap feasibility, preview, and apply all work in `solver2`
- preview/apply stay aligned with recomputation
- sequential swap operations do not drift state
- solver2 participates in at least one truthful shared hotpath lane

## Epic 3 — Implement `transfer` and `clique_swap`

### Outcome

`solver2` supports the current move families needed to match the present search surface of `solver1`.

### Main files

- `backend/core/src/solver2/moves/transfer.rs`
- `backend/core/src/solver2/moves/clique_swap.rs`
- `backend/core/src/solver2/affected_region.rs`
- `backend/core/src/solver2/scoring/**`

### Subtasks

#### 3.1 Implement `transfer`

Add:

- typed transfer move
- feasibility rules
- affected-region derivation
- preview/apply parity against recomputation
- sequential drift coverage

#### 3.2 Implement `clique_swap`

Add:

- typed clique-aware move representation
- touched-member / touched-group region modeling
- preview/apply parity against recomputation
- sequential drift coverage for clique-heavy paths

#### 3.3 Tighten scoring kernels for move-family reuse

As the second and third move families land, factor only the scoring logic that truly needs to be shared across move kernels.

#### 3.4 Add solver2 hotpath probes for the new families

Extend the shared benchmark platform with truthful solver2-specific probes where needed for:

- `transfer`
- `clique_swap`
- any full-recompute hotpath lane that helps validate the architecture

### Acceptance criteria

- `transfer` and `clique_swap` both work end-to-end in `solver2`
- move-family implementation does not require fake reuse of `solver1` internals
- scoring ownership remains explicit and understandable
- shared hotpath reporting can benchmark all current solver2 move families honestly

## Epic 4 — Make `solver2` runnable end-to-end

### Outcome

`solver2` can execute a full solve through the engine registry using a minimal but truthful search engine.

### Main files

- `backend/core/src/solver2/search/mod.rs`
- `backend/core/src/solver2/search/engine.rs`
- `backend/core/src/engines/mod.rs`

### Subtasks

#### 4.1 Implement a minimal search baseline

Start with a simple, truthful search loop that:

- samples or enumerates supported move families
- applies acceptance logic
- respects stop conditions
- preserves deterministic seed behavior if claimed

#### 4.2 Wire real `solver2` solve support into the engine registry

Replace the current explicit unsupported solve path with a real execution path once the search baseline is ready.

#### 4.3 Implement truthful recommendation/default behavior

If solver2 can recommend settings at this point, implement it explicitly.
If not, keep explicit unsupported recommendation behavior until ready.

#### 4.4 Expand cross-solver property coverage

Move from bootstrapped unsupported expectations toward runnable property/invariant coverage for `solver2`.

### Acceptance criteria

- `solver2` can solve end-to-end through `gm-core`
- engine-registry behavior remains truthful about capabilities
- stop reasons and result surfaces are shared and explicit
- property/invariant coverage includes runnable solver2 paths

## Epic 5 — Parity, benchmark, and optimization hardening

### Outcome

`solver2` participates honestly in the shared verification and benchmarking system and is ready for later rollout decisions based on evidence rather than architecture optimism.

### Main files / surfaces

- `backend/core/tests/data_driven_tests.rs`
- `backend/core/tests/property_tests.rs`
- `backend/benchmarking/src/**`
- `backend/benchmarking/cases/**`
- `backend/benchmarking/suites/**`
- `docs/MULTI_SOLVER_ROLLOUT_CRITERIA.md`

### Subtasks

#### 5.1 Expand solver2 data-driven participation

Add or enable fixture participation categories such as:

- invariant-only
- bounded parity
- score-quality comparison
- benchmark-only cases where appropriate

#### 5.2 Add solve-level benchmark participation

Run solver2 through the shared solve-level benchmark platform and record truthful solver-family metadata, comparison categories, and baseline lanes.

#### 5.3 Optimize the biggest solver2 bottlenecks

Only after correctness and runnability are established, optimize:

- sparse adjacency/index usage
- direct preview kernels
- locality-sensitive state layout
- candidate generation
- move-family scheduling and ranking

#### 5.4 Decide rollout readiness from evidence

Use the existing rollout criteria to decide whether solver2 is ready for broader exposure.

### Acceptance criteria

- solver2 participates in shared data-driven and benchmark workflows honestly
- no significant correctness regression remains on the chosen corpus
- benchmark evidence is recorded through the shared platform
- rollout decisions are based on parity/invariant/benchmark evidence, not on architecture completion alone

### Current evidence after Epic 5

- cross-solver data-driven participation now includes explicit:
  - `invariant_only`
  - `bounded_parity`
  - `score_quality`
- solve-level benchmark suites now include dedicated solver2 lanes under:
  - `backend/benchmarking/suites/path-solver2.yaml`
  - `backend/benchmarking/suites/representative-solver2.yaml`
- representative same-machine benchmark evidence currently shows solver2 matching solver1's final scores on the shipped representative suite, while still running materially slower on the current line
- the search driver now avoids a second full recomputation when applying an already-previewed accepted move, while keeping the recompute oracle and debug cross-checks intact

### Current rollout conclusion

`solver2` should remain in Stage 1 internal comparison mode only.

The bounded Phase B runtime rescue effort did not produce strong enough same-machine benchmark evidence to justify continued optimization by default or any broader rollout push.

Reasons:

- representative runtime still remains materially behind `solver1`
- latest same-machine Phase B evidence did not establish durable solve-level competitiveness
- recommendation/tuning support is still intentionally limited
- broader persistence / import / webapp capability handling is still pending outside this plan
- the highest retained value today is the oracle/reference implementation plus the shared multi-solver verification and benchmark platform

## Cross-epic acceptance gates

### Gate A — foundation gate

Before real search work:

- compiled problem exists
- state initialization exists
- recompute scoring exists
- invariants and narrow parity checks exist

### Gate B — first move-family gate

Before multiple move families or broad search work:

- `swap` preview/apply are correct
- recompute oracle cross-checks exist
- solver2 participates in at least one shared hotpath benchmark lane

### Gate C — runnable solver gate

Before any product-facing discussion:

- `swap`, `transfer`, and `clique_swap` are implemented
- a minimal truthful search engine exists
- `solver2` can run end-to-end through `gm-core`

### Gate D — rollout-candidate gate

Before runtime/webapp rollout work:

- data-driven participation is meaningful
- property/invariant confidence is high
- solve-level benchmarks are acceptable
- capability metadata remains truthful

## Suggested immediate next step

Stay in Stage 1 internal comparison mode.

Specifically:

1. keep recommendation metadata truthful until real tuning support exists
2. defer product-facing runtime / webapp rollout until quality and runtime evidence are both acceptable
3. preserve the oracle/reference implementation and shared benchmark platform
4. only reopen runtime optimization work if a new benchmark corpus or a narrowly scoped, high-confidence performance hypothesis justifies it
