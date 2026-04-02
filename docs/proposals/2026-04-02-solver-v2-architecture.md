# Solver v2 Architecture Proposal

## Status

Proposed.

## Purpose

Define a parallel `solver-v2` architecture that preserves the current solver's semantic role while making the codebase:

- easier to extend with new move types,
- easier to optimize for move generation and move selection,
- easier to reason about and verify,
- and capable of matching or exceeding the current solver's performance.

This proposal is explicitly motivated by the current solver's success and its limits:

- the current architecture works,
- incremental hot-path wins have already been captured,
- but the implementation is increasingly manual and clunky,
- and further evolution will likely scale poorly if every new capability requires bespoke cache surgery scattered across multiple files.

## Problem statement

The current solver architecture has several strong properties:

- it is proven against the existing corpus,
- it has meaningful benchmark coverage,
- `swap`, `transfer`, and `clique_swap` apply paths are now incrementally maintained,
- cache-drift assertions exist and have already found real bugs.

However, the current shape also has visible architectural friction:

- move preview and move apply logic are not modeled around a single explicit concept,
- affected state is implicit rather than first-class,
- cache ownership is spread across solver internals,
- adding a new move family requires touching many low-level details,
- optimizing move generation and move selection is harder than it should be,
- preview logic for some moves still uses `clone + apply` rather than a dedicated direct kernel,
- and the implementation burden rises quickly as more move types and heuristics are introduced.

The result is a solver that is functionally solid, but architecturally harder to scale.

## Goals

### Primary goals

1. Preserve the current solver's semantic contract.
2. Make the internal architecture substantially more explicit and elegant.
3. Enable easier addition of:
   - new move types,
   - improved move generation,
   - improved move selection heuristics,
   - and future scoring/constraint families.
4. Preserve current performance at minimum.
5. Prefer a design that can be materially faster than the current implementation.
6. Keep the current solver available as an oracle/reference during migration.

### Secondary goals

- improve testability of solver internals,
- improve benchmarkability of isolated move families,
- reduce duplicated move-specific cache logic,
- make solver internals easier for future agents and humans to inspect and evolve.

## Non-goals

- replacing the current solver in one big-bang rewrite,
- changing the public input/output contract as part of the architecture work,
- requiring webapp/backend runtime migration before starting solver-v2,
- introducing dynamic plugin-heavy abstractions into hot loops,
- accepting architectural elegance that compromises hot-path performance,
- or weakening the current regression/benchmark discipline.

## Architectural principles for solver-v2

The design should follow these repo-level doctrine-compatible principles.

### 1. Parallel architecture, not in-place rewrite

The current solver remains the production/reference implementation until v2 proves parity and value.

That means:

- current solver remains the semantic oracle,
- current test corpus remains authoritative,
- current benchmark lanes remain baseline references,
- and v2 is developed in parallel rather than by destabilizing the working engine.

### 2. Explicit boundaries

Solver-v2 should separate:

- immutable compiled problem data,
- mutable solution state,
- move semantics,
- score/cache maintenance,
- and search policy.

The search engine should not own low-level scoring details.
Move kernels should not own global orchestration policy.

### 3. Explicit affected-region modeling

A move should have an explicit notion of what it touches.

Rather than scattering "update this cache, then that cache, then maybe this penalty" throughout bespoke code paths, a move should first define or derive its affected region and then use that for preview/apply work.

### 4. Data-oriented hot paths

Elegance must not mean dynamic dispatch in inner loops.

The architecture should prefer:

- compact compiled indexes,
- family-specific arrays,
- direct/static dispatch,
- locality-aware structures,
- and explicit affected-set computation.

Avoid runtime polymorphism in hot scoring/move loops where it would sacrifice predictability.

### 5. Preview/apply consistency by construction

Move preview and move apply should be derived from the same underlying move semantics and affected-region model.

If preview and apply drift apart conceptually, correctness and optimization become harder.

### 6. No fake abstraction

If some constraint families fundamentally behave differently, the architecture should model that explicitly instead of forcing everything into a misleading universal interface.

The right abstraction is one that keeps differences honest while still making the system composable.

## Proposed high-level architecture

Solver-v2 should be built around five explicit layers.

```text
CompiledProblem
    ↓
SolutionState
    ↓
MoveKernel / AffectedRegion
    ↓
ScoreKernel
    ↓
SearchEngine
```

## Layer 1: `CompiledProblem`

`CompiledProblem` is the immutable, preprocessed representation of the optimization problem.

It should own:

- indexed people, groups, sessions,
- compiled constraint family data,
- precomputed applicability by session/group/person/pair where useful,
- precomputed adjacency/index structures for fast affected-region lookup,
- weight/config data needed by scoring kernels,
- and move-generation-relevant structure that is static for the lifetime of a solve.

### Why it exists

Today, many decisions are rediscovered ad hoc from general solver state.
V2 should instead compile these relationships once and make them directly consumable by move and scoring kernels.

### Example contents

- `person_idx_to_id`, `group_idx_to_id`
- `person_participation`
- per-session clique membership metadata
- forbidden-pair adjacency lists by person
- should-together adjacency lists by person
- pair-meeting adjacency lists by person and session
- attribute-balance constraints indexed by `(session, group)`
- move-family-specific static lookup tables

## Layer 2: `SolutionState`

`SolutionState` is the mutable schedule and cache carrier.

It should own:

- schedule,
- locations,
- contact matrix or successor structure,
- score caches,
- per-constraint-family mutable counts,
- current cost,
- and any move-generation support state that changes during search.

### Important rule

`SolutionState` should not need to know broad semantic policy.
It is the mutable data plane, not the planner.

## Layer 3: `MoveKernel`

Each move family should be modeled as a first-class kernel.

Examples:

- `SwapKernel`
- `TransferKernel`
- `CliqueSwapKernel`
- future move families

Each kernel should expose a consistent conceptual flow:

1. enumerate/sample candidate moves,
2. validate feasibility,
3. derive affected region,
4. preview delta,
5. apply mutation.

### Key idea

Move kernels should operate on explicit typed move values.

Example conceptual types:

- `Move::Swap(SwapMove)`
- `Move::Transfer(TransferMove)`
- `Move::CliqueSwap(CliqueSwapMove)`

Each move type should be small, explicit, and serializable/debuggable if useful.

## Layer 4: `AffectedRegion`

`AffectedRegion` is the central architectural idea that makes the system more elegant without making it vague.

Instead of every move hardcoding a bespoke notion of impact, each move should derive a structured description of what changed.

### Example conceptual contents

Depending on move family, an affected region may include:

- touched session,
- touched groups,
- moved-out and moved-in people,
- touched person pairs,
- touched pair constraints,
- touched attribute-balance groups,
- touched clique or move-family-specific neighborhoods.

### Why this matters

This creates one explicit bridge between:

- move semantics,
- score preview,
- score application,
- and future debugging/benchmark tooling.

It also creates a natural place to add future move families without rewriting global solver assumptions.

## Layer 5: `ScoreKernel`

Scoring should be split into family-specific kernels operating over `CompiledProblem + SolutionState + AffectedRegion`.

Example families:

- contacts / unique contacts
- repetition penalty
- forbidden pairs
- should-together
- pair-meeting
- attribute balance
- clique integrity
- immovable assignments

### Important design choice

This should not become a slow generic trait-object registry.
Instead, use family-specific static kernels and direct composition.

For example:

- `ContactsScoreKernel`
- `PairConstraintKernel`
- `AttributeBalanceKernel`
- etc.

The architecture can still be elegant while using explicit static dispatch.

## Layer 6: `SearchEngine`

`SearchEngine` owns optimization policy, not score maintenance details.

It should own:

- move family scheduling,
- candidate generation strategy,
- acceptance logic,
- reheating policy,
- adaptive heuristics,
- and telemetry.

This separation is important because future performance/quality work is likely to happen here:

- better move generation,
- better move-family balancing,
- candidate ranking,
- pressure-driven repair,
- adaptive exploration.

The current architecture can do these things, but not as cleanly as it should.

## Proposed module layout

A plausible starting structure:

```text
backend/core/src/solver_v2/
  mod.rs
  compiled_problem.rs
  state.rs
  move_types.rs
  affected_region.rs
  scoring/
    mod.rs
    contacts.rs
    pair_constraints.rs
    pair_meeting.rs
    attribute_balance.rs
    clique.rs
    immovable.rs
  moves/
    mod.rs
    swap.rs
    transfer.rs
    clique_swap.rs
  search/
    mod.rs
    engine.rs
    candidate_generation.rs
    acceptance.rs
    reheating.rs
  validation/
    mod.rs
    parity.rs
    invariants.rs
```

This is not mandatory, but the separation should be similarly explicit.

## Core design decisions

## Decision 1: Keep the current solver as the reference implementation

V2 should be validated against the current solver and existing contract tests.

This gives us:

- oracle behavior,
- migration safety,
- performance comparison,
- and a practical fallback.

## Decision 2: Make preview a first-class kernel, not clone+apply by default

A major advantage of v2 should be direct preview support for all core move families.

The current solver still has places where preview is effectively clone+apply.
V2 should treat that as a temporary fallback, not the desired architecture.

## Decision 3: Compile adjacency aggressively

Constraint families that are pair- or group-driven should compile adjacency/index data so move kernels can jump directly to relevant work.

Examples:

- person → forbidden-pair constraint ids
- person → should-together constraint ids
- person → pair-meeting constraint ids active in session
- `(session, group)` → attribute-balance constraints

This is one of the main places where v2 can become faster than the current solver.

## Decision 4: Preserve family-specific mutable caches

The current solver's incremental wins came from explicit family caches.
V2 should preserve that strength, but organize it better.

In other words:

- keep family-specific caches,
- but give them explicit ownership and update paths.

## Decision 5: Build move generation on top of explicit move-family interfaces

Future move generation improvements should not require intimate knowledge of scoring internals.

Instead, each move family should expose enough structure for:

- candidate enumeration,
- filtering,
- pressure targeting,
- and move selection heuristics.

## Candidate solver-v2 API shape

At the top level, the internal engine could conceptually expose something like:

```rust
pub struct CompiledProblem { ... }
pub struct SolutionState { ... }
pub enum Move { ... }
pub struct MovePreview { ... }
pub struct AffectedRegion { ... }

impl CompiledProblem {
    pub fn compile(input: &ApiInput) -> Result<Self, SolverError>;
}

impl SolutionState {
    pub fn new(problem: &CompiledProblem) -> Result<Self, SolverError>;
    pub fn recompute_all(problem: &CompiledProblem, state: &mut Self);
}

pub trait MoveKernel {
    type Move;
    fn is_feasible(...);
    fn analyze(... ) -> AffectedRegion;
    fn preview(... ) -> MovePreview;
    fn apply(... );
}
```

This is conceptual guidance, not a final literal API prescription.
The main requirement is explicitness of responsibility.

## Why v2 could be faster

V2 is not just a readability project.
There are real ways it could outperform the current architecture.

### 1. Direct preview kernels

Eliminating clone+apply preview paths can materially reduce move evaluation cost.

### 2. Better locality and less scattered work

A more data-oriented compiled model can improve:

- cache locality,
- branch behavior,
- update efficiency,
- and repeated access patterns.

### 3. Better affected-region indexing

Instead of scanning broad constraint lists, v2 can jump directly to the affected family entries.

### 4. Better move generation

With explicit kernels and clean boundaries, targeted move generation becomes easier to add without corrupting core architecture.

### 5. Better move selection heuristics

A cleaner architecture makes it easier to add:

- adaptive move-family weighting,
- regret-based sampling,
- pressure-driven local repair,
- targeted candidate prioritization,
- and family-specific proposal heuristics.

## Main risks

## Risk 1: Over-abstracting the hot path

If v2 introduces too much runtime polymorphism or generic indirection in hot loops, it could become cleaner but slower.

Mitigation:

- prefer family-specific static kernels,
- keep dynamic dispatch outside hot loops,
- benchmark every major step.

## Risk 2: Semantic drift from the current solver

A new architecture can accidentally redefine behavior.

Mitigation:

- keep current solver as oracle,
- run parity comparisons,
- reuse existing contract/data-driven tests,
- use drift-style equivalence checks where helpful.

## Risk 3: Rebuild too much before proving value

A large rewrite can take too long before demonstrating a real benefit.

Mitigation:

- build incrementally,
- validate one move family at a time,
- benchmark each milestone.

## Risk 4: Elegant design but no real extensibility gain

A rewrite can merely move complexity around.

Mitigation:

Define concrete extensibility tests up front:

- can we add a new move family without touching unrelated scoring code?
- can we add a new candidate ranking heuristic without touching move application internals?
- can preview and apply share the same affected-region logic?

## Migration strategy

This should be done in stages.

## Stage 0 — Design and acceptance criteria

Before major implementation:

- agree on module boundaries,
- define parity/benchmark acceptance rules,
- choose initial move families,
- choose the first benchmark gates.

## Stage 1 — `CompiledProblem` + `SolutionState` skeleton

Build the immutable/mutable split first.

Acceptance:

- input compilation works,
- state initialization works,
- full recomputation path exists,
- parity against current score calculation on a narrow corpus.

## Stage 2 — Full recomputation parity in v2

Implement a correctness-first v2 scoring path before incremental optimization.

Acceptance:

- v2 recomputation matches current solver on key cases,
- existing data-driven fixtures can be reused for parity checks.

## Stage 3 — One move family end-to-end

Implement one move family fully in v2, likely `swap` first.

Acceptance:

- feasibility
n- preview
- apply
- parity tests
- benchmark signal

## Stage 4 — `transfer`

Add the second move family and validate the architecture still scales cleanly.

## Stage 5 — `clique_swap`

Add the most structurally complex current move family and prove the architecture handles it more elegantly than the current solver.

## Stage 6 — Search engine parity

Port or reimplement the current search driver over v2 kernels.

Acceptance:

- same stop conditions,
- same telemetry semantics where relevant,
- quality and runtime comparisons against current solver.

## Stage 7 — New heuristics and performance work

Only after parity exists should the v2 architecture be used to explore:

- new move families,
- better proposal strategies,
- smarter search heuristics,
- and stronger performance tuning.

## Acceptance criteria for solver-v2

V2 should not be considered ready just because it is cleaner.
It should meet all of these:

1. **Correctness**
   - matches current solver semantics on the established corpus,
   - preserves invariant safety,
   - uses strong parity tests.

2. **Performance**
   - no significant regression on core lanes,
   - preferably meaningful improvements on key hotpath/solve-level lanes.

3. **Extensibility**
   - adding a move family is structurally easier,
   - move generation heuristics can evolve without score-kernel surgery,
   - preview/apply consistency is simpler to maintain.

4. **Operability**
   - architecture is inspectable,
   - module responsibilities are explicit,
   - benchmark and validation workflows remain clear.

## Recommendation

Proceed with a **parallel solver-v2 effort**.

Do not treat it as a cosmetic refactor of the current solver.
Treat it as a deliberate architectural successor with these constraints:

- current solver remains the reference implementation,
- v2 must preserve semantics before chasing novelty,
- v2 must justify itself through both architecture and benchmarks,
- and v2 must remain data-oriented enough to meet the repo's zero-compromise performance goal.

## Suggested next step

Create a follow-up migration/implementation plan that breaks this proposal into concrete, benchmarkable stages and defines:

- initial file layout,
- parity test strategy,
- benchmark checkpoints,
- and the first move family to port.
