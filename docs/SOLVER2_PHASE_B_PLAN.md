# Solver2 Phase B Plan

## Status

Proposed.

## Decision

Phase B will **not** create another solver family and will **not** discard the current `solver2` implementation.

Instead:

- `solver2` remains the solver family
- the current implementation becomes the **oracle / reference path** inside `solver2`
- Phase B adds a **runtime path** alongside the oracle inside `backend/core/src/solver2/`
- the runtime path is allowed to use incremental state, delta scoring, and specialized candidate generation
- the oracle path remains available for debug cross-checks, parity tests, and drift detection

This keeps one solver family, one benchmark surface, and one semantic source of truth while allowing the runtime implementation to diverge internally for performance.

## Why this plan exists

Phase A proved that:

- the repo can host a second solver family cleanly
- `solver2` can express the intended compiled-problem / explicit-state architecture
- shared property, parity, and benchmark infrastructure works
- the current implementation is a valid correctness oracle

Phase A also showed that the current runtime is not competitive.

Current benchmark evidence indicates that the present `solver2` implementation is materially slower than `solver1`, primarily because it still pays for correctness-first scaffolding in hot paths:

- full-state cloning during previews
- full score recomputation during previews
- full-neighborhood materialization during move sampling
- heavyweight preview payloads carrying full score snapshots

Phase B exists to test the real architectural hypothesis honestly:

> can the `solver2` architecture become competitive once the oracle-only costs are removed and replaced with incremental runtime machinery?

## Goals

1. preserve the current `solver2` implementation as an oracle
2. add a genuinely performance-oriented runtime path inside `solver2`
3. benchmark each vertical slice against the existing same-machine shared lanes
4. stop quickly if the architecture still cannot approach competitiveness after the highest-value changes

## Non-goals

Out of scope for Phase B:

- product-facing rollout
- webapp/runtime UX exposure
- recommendation/tuning work beyond truthful metadata
- another top-level solver family
- large speculative rewrites without benchmark gates

## Working rules

1. **One family, two internal paths**
   - keep `solver2` as the family
   - keep oracle and runtime implementations under `solver2/`

2. **Oracle stays permanent**
   - do not delete the full recompute oracle
   - use it for debug assertions, parity, and drift checks

3. **One vertical slice at a time**
   - prove `swap` first
   - only extend to `transfer` and `clique_swap` after the `swap` slice shows real speedup

4. **Benchmark before broadening scope**
   - every runtime-path milestone must be measured using the shared benchmark lanes already in the repo

5. **Explicit kill criteria**
   - if the best available structural wins still leave `solver2` far from `solver1`, shelve runtime rescue work instead of stretching the effort indefinitely

## Target architecture for Phase B

## 1. Internal layering

Recommended internal shape under `backend/core/src/solver2/`:

- `compiled_problem.rs`
  - remains the immutable compiled problem boundary
  - move toward shared immutable ownership (`Arc<CompiledProblem>`) in runtime state
- `state.rs`
  - retain or rename current state as the oracle-friendly state if needed
- `runtime_state.rs`
  - new runtime-focused mutable state
  - optimized for incremental move preview/apply
- `scoring/recompute.rs`
  - permanent oracle path
- `scoring/delta.rs`
  - new runtime delta scoring kernels
- `moves/**`
  - keep typed move values and feasibility surfaces
  - add runtime fast preview/apply helpers that reuse delta state
- `search/engine.rs`
  - dispatch against the runtime path by default
  - optionally run oracle cross-checks in debug or sampled validation mode

## 2. State ownership

Phase B should eliminate preview-time cloning of the full immutable problem.

Target:

- immutable compiled problem owned once and shared cheaply
- runtime state owns only mutable search data
- previews apply small local mutations and either rollback or use patch objects

## 3. Score ownership

Split score handling into two levels:

- **runtime score summary**
  - only the data needed for acceptance, progress, and fast decisions
- **oracle score snapshot**
  - full recompute surface used for drift checks, tests, and forensic parity

The runtime path should not build or carry full contact matrices on every attempted move.

## 4. Candidate generation

Replace full neighborhood materialization with bounded candidate sampling:

- swap: sample sessions / groups / people directly
- transfer: sample person + feasible target group candidates directly
- clique swap: sample active clique + bounded eligible target sets directly

The runtime path should avoid building large temporary candidate vectors just to select one move.

## Execution plan

## Epic B1 — Split oracle and runtime responsibilities

### Outcome

`solver2` has an explicit oracle path and an explicit runtime path, with shared semantic types but different performance responsibilities.

### Deliverables

- introduce runtime-oriented state ownership under `solver2/`
- ensure compiled problem ownership is shared cheaply
- keep the oracle recompute path intact and callable
- add runtime-vs-oracle cross-check hooks usable in tests and debug builds

### Acceptance

- runtime previews no longer clone the entire compiled problem
- runtime state can be validated against the oracle on demand

## Epic B2 — Swap vertical slice with real incremental preview/apply

### Outcome

`swap` becomes the first truthful high-performance vertical slice.

### Deliverables

- incremental swap preview
- incremental swap apply
- rollback or patch-based preview mechanism
- runtime/oracle drift checks after sampled accepted moves
- swap-specific hotpath and solve-level remeasurement

### Acceptance

- runtime swap preview does not use full score recomputation in the default path
- debug/sample validation can still compare runtime results with oracle recomputation
- swap hotpath improves materially on the shared same-machine benchmark lane

## Epic B3 — Search-loop overhead reduction

### Outcome

The solver2 search driver stops paying avoidable iteration overhead.

### Deliverables

- bounded candidate sampling instead of full neighborhood materialization
- avoid heavyweight preview payloads on every attempt
- keep telemetry surfaces truthful while using lightweight runtime internals
- benchmark the representative solve lane again after search-loop changes

### Acceptance

- per-iteration overhead drops materially on representative solve benchmarks
- search remains deterministic for the same seed where claimed

## Epic B4 — Extend runtime delta path to `transfer` and `clique_swap`

### Outcome

All currently supported move families have runtime fast paths backed by the oracle.

### Deliverables

- incremental transfer preview/apply
- incremental clique-swap preview/apply
- family-specific drift checks
- renewed hotpath benchmark evidence for all three families

### Acceptance

- runtime path covers swap / transfer / clique_swap
- hotpath lanes show material speedup vs the Phase A baseline

## Epic B5 — Go / no-go benchmark review

### Outcome

A human decision is made from current evidence, not optimism.

### Deliverables

- same-machine comparison of Phase B vs Phase A baseline and `solver1`
- updated rollout / shelving conclusion
- explicit decision to either continue hardening or shelve the runtime effort

### Acceptance

- decision is recorded explicitly
- if gates are missed, the plan says to shelve rather than continue indefinitely

## Benchmark gates

These gates are intentionally strict enough to prevent endless optimistic iteration.

## Gate 1 — Swap rescue gate

After Epic B2:

- solver2 swap preview hotpath must improve by at least **5x** against the current Phase A baseline
- and it should target getting to within **<= 4x** of solver1 on the shared swap-preview lane

If this gate is badly missed, shelve runtime rescue work.

## Gate 2 — Search competitiveness gate

After Epic B3:

- representative full-solve runtime should improve by at least **3x** against the current Phase A baseline
- and should target reaching **<= 4x** solver1 on the representative suite without quality regression on the shipped cases

If this gate is badly missed, shelve runtime rescue work.

## Gate 3 — Family completion gate

After Epic B4:

- all three move-family preview lanes must show clear wins over the Phase A baseline
- representative solve quality must remain non-regressed on the current shared suite
- the remaining runtime gap to solver1 must be small enough to justify further work

If not, keep the oracle but shelve the runtime-track experiment.

## First implementation slice

The first slice should be deliberately narrow:

1. introduce shared immutable compiled problem ownership
2. add runtime swap preview/apply without full recomputation in the default path
3. keep oracle recomputation as sampled debug validation
4. rerun:
   - `backend/benchmarking/suites/hotpath-swap-preview-solver2.yaml`
   - `backend/benchmarking/suites/representative-solver2.yaml`
   - matching solver1 suites for same-machine comparison

Do **not** start transfer/clique or broader rollout work before this slice is measured.

## Immediate next step

Start Epic B1 and B2 as one bounded rescue spike.

If the swap vertical slice cannot produce a dramatic speedup, stop there.
