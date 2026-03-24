# Solver Benchmarking Architecture

## Status

Proposed architecture. Intended to guide the regression-safety and performance-forensics work that must land **before** the larger solver refactor.

## Why this document exists

The solver needs a benchmarking system that is strong enough to support architectural refactoring without losing either:

- semantic correctness
- hot-path performance
- visibility into *why* a regression happened

The intended system is inspired by the benchmark architecture in:

- `/home/ralph/wwd-repos/production-planning/backend/internal/benchmark`
- `/home/ralph/wwd-repos/production-planning/backend/workers/metaheuristic-rs/benchmarking`

But it must be adapted to **GroupMixer's** actual solver surfaces, doctrine, and test strategy.

This document is the architectural reference for that adaptation.

---

## Architectural intent

The benchmark system is **not** a thin wrapper around `cargo bench`.

It is a deliberately layered safety and forensics system whose jobs are:

1. prove solver refactors did not change semantics unexpectedly
2. prove performance did not regress on representative workloads
3. explain regressions by move family and code path
4. force clearer solver boundaries so the later refactor improves the repo instead of hiding more logic inside a monolith

That means the benchmark system is both:

- a **testing architecture**
- a **refactoring forcing function**

---

## Current state in this repo

Today the repo has useful pieces, but not yet a full benchmarking architecture.

### Existing strengths

- `solver-core/tests/data_driven_tests.rs`
  - strong end-to-end fixture harness
  - already the main solver integration contract
- `solver-core/tests/property_tests.rs`
  - invariant coverage
- `solver-core/src/solver/tests.rs`
  - local state/scoring tests
- `solver-core/benches/solver_perf.rs`
  - Criterion smoke performance coverage

### Current gaps

- solver randomness is not externally controllable
  - `solver-core/src/algorithms/simulated_annealing.rs` uses `rand::rng()`
  - `solver-core/src/solver/construction.rs` uses `rand::rng()` for random initialization
- move-family selection is implicit inside the simulated annealing loop
- there is no explicit benchmark telemetry model for performance forensics
- there is no stable benchmark artifact/report/baseline schema
- there is no same-machine comparison workflow
- current perf assertions inside data-driven tests are useful as smoke checks but too weak and too brittle to serve as the long-term performance architecture

So the repo currently has:

- correctness surfaces
- microbenchmark beginnings
- no first-class performance-forensics system

---

## Design principles

This design follows the repo doctrine in `docs/reference/principles/AGENTIC_ENGINEERING_PRINCIPLES.md` and the testing policy in `docs/TESTING_STRATEGY.md`.

### 1. Benchmarking is a first-class engineering surface

The benchmark system must be designed as architecture, not as a pile of scripts.

### 2. Separate semantic correctness from runtime comparison

A test that proves correctness is not automatically a useful performance artifact.
A runtime measurement is not automatically a trustworthy semantic regression test.

Both matter. They should be linked, but not collapsed into one layer.

### 3. Determinism first

If we cannot reproduce a run honestly, we cannot compare it honestly.

### 4. Root-cause telemetry, not just scorecards

The system must explain:

- which move family regressed
- whether initialization changed
- whether preview or apply got slower
- whether acceptance behavior changed
- whether path fanout widened

### 5. Representative cases drive architecture

Representative workloads should drive hot-path decisions.
Stretch and adversarial cases remain important, but they should not drown out the common path.

### 6. Keep the solver core explicit

The benchmark system should push the solver toward explicit seams:

- seed control
- move policy
- stop reason
- telemetry sink
- observer/reporting boundary

That is useful benchmarking architecture and good repo architecture.

---

## The 4-layer benchmark architecture

The right shape for this repo is **four distinct layers**.

```mermaid
flowchart TD
    A[Layer 1\nSemantic regression] --> B[Layer 2\nPath regression + solver forensics]
    B --> C[Layer 3\nSolve-level suite benchmarking]
    C --> D[Layer 4\nMicrobench hot-path measurement]

    A1[solver-core/tests] --> A
    B1[path fixtures + move-family tests] --> B
    C1[benchmark manifests + artifacts + baselines] --> C
    D1[Criterion benches] --> D
```

## Layer 1 — Semantic regression surface

### Purpose

Prove refactor safety.

### Primary location

- `solver-core/tests/`
- `solver-core/src/solver/tests.rs`
- property tests and focused integration tests

### What it should prove

- score bookkeeping remains correct
- constraints still mean the same thing
- invalid inputs still fail explicitly
- schedules remain structurally valid
- delta/apply logic stays semantically correct

### What it should *not* try to do

- be the main performance comparison layer
- act as the long-term runtime baseline system

### Role in the architecture

This is the semantic floor. No performance work matters if this layer is weak.

---

## Layer 2 — Path regression and solver forensics surface

### Purpose

Prove that every move family and important solver code path is both:

- exercised intentionally
- semantically correct
- measurable in isolation

### Primary location

New tests and fixtures in:

- `solver-core/tests/move_*.rs`
- `solver-core/tests/search_driver_regression.rs`
- `solver-core/tests/construction_regression.rs`
- `benchmarking/cases/path/`
- `benchmarking/path-matrix.yaml`

### What it should prove

- swap delta/apply correctness
- transfer delta/apply correctness
- clique-swap delta/apply correctness
- construction correctness and determinism
- stop-condition behavior
- reheating behavior
- session restriction behavior
- explicit activation of move-family-specific paths

### Why this layer matters

Without this layer, the larger benchmark suite can only say:

- runtime changed
- score changed

It cannot say:

- swap preview slowed
- transfer apply drifted
- clique swaps widened the touched state
- reheating changed search behavior

This layer is the bridge between semantic tests and benchmark forensics.

---

## Layer 3 — Solve-level benchmark suite

### Purpose

Compare real solver runs across representative, stretch, and adversarial workloads.

### Primary location

A new dedicated surface:

```text
benchmarking/
solver-benchmarking/
```

### What it should do

- load benchmark manifests
- execute suites deterministically
- emit machine-readable artifacts
- save named baselines
- compare current vs baseline
- generate concise human summaries

### Why this should be separate from `solver-core/benches/`

Criterion is excellent for repeated microbench timing.
It is not the right primary home for:

- case manifests
- multi-case reports
- baselines
- comparison reports
- class rollups
- same-machine benchmarking workflows

So the solve-level benchmark system should be its own architectural surface.

---

## Layer 4 — Microbench surface

### Purpose

Measure hot-path kernels repeatedly with Criterion.

### Primary location

- `solver-core/benches/`

### What it should cover

- construction/init
- swap preview
- swap apply
- transfer preview
- transfer apply
- clique swap preview
- clique swap apply
- full score recalculation
- maybe cost-component helpers if a local hotspot warrants it

### Role in the architecture

Criterion remains important, but as the **microbench layer**, not as the entire benchmark architecture.

---

## Repository layout target

## New documentation and spec surface

```text
benchmarking/
  README.md
  SPEC.md
  SCHEMAS.md
  TOOLING.md
  path-matrix.yaml
  suites/
    path.yaml
    representative.yaml
    stretch.yaml
    adversarial.yaml
  cases/
    path/
    representative/
    stretch/
    adversarial/
  schemas/
    case-run.schema.json
    run-report.schema.json
    baseline-snapshot.schema.json
    comparison-report.schema.json
```

## New implementation surface

```text
solver-benchmarking/
  Cargo.toml
  src/
    lib.rs
    manifest.rs
    runner.rs
    report.rs
    compare.rs
    artifacts.rs
    summary.rs
    machine.rs
```

## Existing surfaces that remain important

```text
solver-core/tests/
solver-core/benches/
solver-cli/
```

---

## Required solver seams before the benchmark system is credible

The benchmark architecture depends on four explicit solver capabilities.

## 1. Seed control

### Why

The benchmark system cannot be trusted if the solver run is not reproducible.

### Required change

Add explicit seed support in the solver configuration.

### Architectural effect

The seed must drive:

- random initialization in `solver-core/src/solver/construction.rs`
- move selection in `solver-core/src/algorithms/simulated_annealing.rs`
- acceptance RNG in the same search loop

### Desired shape

A single source of truth in the solver config, for example:

- `seed: Option<u64>`

This should be honored everywhere randomness exists.

---

## 2. Move policy control

### Why

The user wants detailed regression tests for every move type and solver code path.
That cannot be honest if move-family selection remains purely implicit and probabilistic.

### Required change

Add explicit move-family policy controls.

### The benchmark system needs to be able to say

- run normal mixed policy
- run swap-only
- run transfer-only
- run clique-swap-only
- bias move-family weights for a diagnostic case

### Desired shape

Something like:

- allowed move families
- optional weights per family
- optional force-single-family mode for path tests

### Architectural effect

This turns move-family selection from hidden search behavior into an explicit control surface.
That is good architecture independently of benchmarking.

---

## 3. Explicit stop reason

### Why

Comparison artifacts need to report *why* the solver stopped.

### Required change

Add a stable stop-reason enum.

### Examples

- `max_iterations`
- `time_limit`
- `no_improvement`
- `progress_callback_stop`

### Architectural effect

Removes guesswork from benchmark reports and from future operator-facing surfaces.

---

## 4. Benchmark telemetry / observer surface

### Why

Current `ProgressUpdate` is useful, but it is primarily UI/progress oriented.
The benchmark system needs a forensics-oriented telemetry model.

### Required change

Add a dedicated telemetry/observer boundary that can collect benchmark data without conflating it with human logs.

### The benchmark system needs to observe

- initialization timing
- search timing
- finalization timing
- iterations completed
- move-family attempts/accepts/rejects
- preview/apply timings by move family
- score improvement metrics
- reheats performed
- optional recalculation counts

### Architectural effect

Introduces a thin truthful instrumentation layer instead of embedding benchmark semantics inside stdout logs or ad hoc callbacks.

---

## Semantic regression structure

The benchmark architecture depends on better solver regression structure.

## Existing end-to-end fixtures stay

The current fixture harness in:

- `solver-core/tests/data_driven_tests.rs`
- `solver-core/tests/test_cases/*.json`

should remain the main integration contract for solver behavior.

That is already aligned with repo guidance.

## New focused regression files should be added

Suggested additions:

```text
solver-core/tests/move_swap_regression.rs
solver-core/tests/move_transfer_regression.rs
solver-core/tests/move_clique_swap_regression.rs
solver-core/tests/search_driver_regression.rs
solver-core/tests/construction_regression.rs
```

These tests should be deterministic and narrow enough to prove exact behavior around a targeted path.

---

## Move-family regression design

Each move family should get both:

1. **delta correctness tests**
2. **apply correctness tests**

### Standard assertion pattern

For a deterministic state:

1. compute `calculate_*_cost_delta`
2. clone the state
3. apply the move on the clone
4. fully recalculate scores/caches
5. compare:
   - expected delta vs actual score change
   - cached counters vs recalculated counters
   - structural invariants

### Shared assertions

Every move-family suite should repeatedly check:

- no duplicate assignments
- capacity respected
- participation respected
- constraint caches consistent
- cost after apply is consistent with full recalculation

---

## Path matrix

The benchmark system should maintain a path matrix as an explicit artifact.

Suggested location:

- `benchmarking/path-matrix.yaml`

### Purpose

Track which cases intentionally cover which paths.

### Example categories

#### Swap

- same-group no-op
- non-participant rejection
- forbidden-pair delta path
- should-together delta path
- attribute-balance delta path
- pair-meeting delta path
- apply path cache consistency

#### Transfer

- target-full rejection
- source-singleton rejection
- clique-member rejection
- immovable rejection
- attribute-balance delta path
- pair-meeting delta path
- apply path cache consistency

#### Clique swap

- inactive-session rejection
- partial-participation handling
- immovable clique-member rejection
- immovable target-member rejection
- accepted clique-swap full recalculation consistency

#### Search driver

- allowed-sessions enforcement
- cycle reheating
- no-improvement reheating
- time-limit stop
- no-improvement stop
- callback early stop
- mixed vs forced move policy

#### Construction

- seeded random init determinism
- warm-start preservation
- immovable placement
- clique placement
- partial attendance placement

This matrix gives the repo an explicit statement of benchmark/test coverage over architectural paths.

---

## Benchmark suite taxonomy

The suite system should classify every case into one primary class.

## 1. Path

Small deterministic cases that intentionally activate specific move families or solver branches.

Use for:

- path coverage
- move-family regression safety
- targeted diagnostics

## 2. Representative

Realistic common workloads.

Use for:

- day-to-day performance regression checks
- hot-path architecture decisions
- baseline comparison for normal solver behavior

## 3. Stretch

Larger or more expensive workloads.

Use for:

- scalability diagnosis
- controlled stress analysis
- performance planning

## 4. Adversarial

Constraint-heavy, awkward, or boundary-shaped workloads.

Use for:

- rejection honesty
- robustness analysis
- unsupported-shape or edge-behavior visibility

### Rule

Reports and comparisons must preserve suite class.
Representative cases should not be drowned out inside one giant mixed average.

---

## Benchmark artifacts

The benchmark architecture needs four machine-readable artifact kinds.

## 1. Case run artifact

One case executed once under one specific solver configuration.

### Minimum fields

- schema version
- case id
- case class
- fixture path
- commit identity
- machine identity
- effective seed
- effective budget
- effective move policy
- stop reason
- status
- runtime
- initial score
- final score
- best score
- iteration count
- per-move-family counters
- timing breakdown

## 2. Run report

A collection of case run artifacts from one suite execution.

### Minimum fields

- schema version
- suite metadata
- run metadata
- case list
- totals
- class rollups

## 3. Baseline snapshot

A named frozen run report intended for future comparisons.

### Purpose

Support the refactor workflow:

1. record baseline
2. refactor
3. rerun suite
4. compare
5. understand deltas honestly

## 4. Comparison report

A structured diff between a current run and a baseline snapshot.

### Minimum capabilities

- comparability status
- per-case runtime deltas
- per-case quality deltas
- per-move-family deltas
- class rollup deltas
- regression suspect summary

---

## Timing and telemetry model

The benchmark system should capture timing in a way that aligns with the solver architecture.

## Solve-level timing buckets

Recommended buckets:

- initialization / construction
- search loop total
- finalization / result extraction
- total runtime

## Search-level timing buckets

Recommended buckets:

- move selection
- preview / delta evaluation
- acceptance decision
- apply / commit
- explicit full recalculation count and time where applicable

## Per-move-family telemetry

For each move family:

- attempts
- accepts
- rejects
- accept rate
- preview count
- preview time total
- preview time average
- apply count
- apply time total
- average delta of accepted moves
- total improvement contributed
- optional rejection categories where meaningful

This is the minimum level needed for real forensics.

---

## Human-readable benchmark output

Structured JSON artifacts are the source of truth.

Human-readable summaries should be generated from them.

### Summary sections should include

- run overview
- representative / stretch / adversarial rollups
- biggest regressions
- biggest improvements
- move-family suspect list
- comparison conclusion

The human summary should explain the machine data, not replace it.

---

## Same-machine comparison policy

Runtime comparisons are only honest when machine identity is tracked.

Benchmark artifacts should record at least:

- machine hostname or explicit benchmark-machine id
- CPU model
- core count
- OS / kernel
- rustc version
- cargo profile
- dirty-tree status if available

### Policy

- local developer runs may compare against same-machine local baselines
- CI should treat semantic regression as mandatory
- serious performance regression comparison should run on a controlled same-machine lane

Cross-machine runtime comparisons should never be presented as equally trustworthy.

---

## Criterion's role in the final architecture

Criterion remains useful, but its role becomes explicit and narrower.

## Criterion should own

- repeated microbench timing for hot kernels
- statistically stable local throughput comparisons
- low-level hotspot observation

## Criterion should not own

- the benchmark manifest language
- suite taxonomy
- baseline snapshots for solve-level cases
- comparison reports across case classes
- architectural regression forensics by itself

So the architecture is not "replace Criterion".
It is "put Criterion in the right layer".

---

## `solver-cli` role

The repo should eventually expose benchmark operations through a thin CLI surface.

Suggested future commands:

- `solver-cli benchmark run ...`
- `solver-cli benchmark compare ...`
- `solver-cli benchmark baseline save ...`
- `solver-cli benchmark baseline list ...`

This gives the benchmark system a real non-UI control surface and aligns with the repo doctrine.

---

## Phased implementation plan

The work should land in the following order.

```mermaid
flowchart LR
    P0[Phase 0\nArchitecture docs] --> P1[Phase 1\nDeterministic solver seams]
    P1 --> P2[Phase 2\nPath regression tests]
    P2 --> P3[Phase 3\nBenchmark runner + artifacts]
    P3 --> P4[Phase 4\nExpanded Criterion microbenches]
    P4 --> P5[Phase 5\nCLI + workflow integration]
```

## Phase 0 — Architecture docs

Deliverables:

- this document
- benchmark spec docs
- schema docs
- tooling/workflow docs

Goal:

- make the intended architecture explicit before implementation begins

## Phase 1 — Deterministic solver seams

Deliverables:

- seed support
- move policy control
- explicit stop reason
- benchmark telemetry / observer surface

Goal:

- make the solver benchmarkable and refactorable

## Phase 2 — Path regression tests

Deliverables:

- move-family regression test files
- search-driver regression tests
- construction regression tests
- path fixtures
- path matrix

Goal:

- prove move/code-path correctness before performance comparison expands

## Phase 3 — Benchmark runner and artifacts

Deliverables:

- `solver-benchmarking/` crate
- manifest parser
- run-report generation
- baseline save/load
- comparison reporting
- human summary generation

Goal:

- create the real benchmark system

## Phase 4 — Expanded Criterion microbench layer

Deliverables:

- construction benchmarks
- move preview/apply benchmarks
- recalc benchmarks

Goal:

- fill the hot-path measurement layer beneath the solve-level suite layer

## Phase 5 — CLI and workflow integration

Deliverables:

- `solver-cli benchmark ...` commands
- workflow docs
- CI/same-machine policy
- cleanup of legacy perf assertions as needed

Goal:

- make the benchmark system operable, repeatable, and durable

## Phase dependency graph

The phases are mostly sequential, but some overlap is acceptable once the deterministic solver seams are in place.

```mermaid
flowchart TD
    P1[Phase 1\nDeterministic solver seams] --> P2[Phase 2\nPath regression tests]
    P1 --> P3[Phase 3\nBenchmark runner + artifacts]
    P1 --> P4[Phase 4\nCriterion microbench expansion]
    P2 --> P3
    P2 --> P4
    P3 --> P5[Phase 5\nCLI + workflow integration]
    P4 --> P5

    note1[Do not build baseline/compare workflows\nbefore seeds, move policy, stop reason,\nand benchmark telemetry land]
    note2[Do not migrate long-term perf gating\nout of generic tests until Phase 3 exists]

    note1 -.-> P3
    note2 -.-> P5
```

Interpretation:

- **Phase 1** is the hard prerequisite layer
- **Phase 2** should follow immediately because it creates the semantic safety net
- **Phase 3** can begin once Phase 1 is solid, but benefits strongly from most of Phase 2 being done
- **Phase 4** can overlap late Phase 2 / early Phase 3 once deterministic setup exists
- **Phase 5** should come last because it depends on the benchmark system being real, not hypothetical

---

## How this architecture should influence the later solver refactor

The benchmark system is intentionally chosen to pressure the solver architecture in healthy directions.

## It should push the solver toward explicit boundaries such as

- `MoveFamily`
- `MovePolicy`
- `StopReason`
- `SearchTelemetry`
- `BenchmarkObserver` or equivalent
- centralized seed handling

## Likely long-term internal shape

A later refactor will probably want something like:

```text
solver-core/src/search/
  driver.rs
  move_policy.rs
  telemetry.rs
  stop.rs
  observer.rs
```

That later structure is not mandatory right now.
But the seams required by benchmarking should be added now so the refactor has a stable target.

---

## Definition of success

The benchmark system is successful when the team can say something like:

> The refactor preserved solver semantics on the path regression suite, preserved representative solve quality, but slowed swap preview on representative cases by 11% because the new scoring path widened recalculation work. Transfer apply remained stable. Clique-swap paths improved on constrained workloads.

That is the standard.

Not:

> cargo bench changed a bit and most tests are still green.

---

## Immediate execution recommendation

Implementation should start with:

1. deterministic seed support
2. explicit move policy control
3. explicit stop reason
4. dedicated benchmark telemetry hooks
5. focused move-family and path regression tests

Only after that foundation is in place should the repo invest heavily in the full runner/baseline/reporting layer.

That sequence gives the repo:

- semantic safety first
- trustworthy measurements second
- architecture improvement as a side effect of benchmark readiness

---

## Relationship to the todo plan

The pi todos created for this initiative should map directly to the phases and architectural seams in this document.

Every epic and subtask should refer back to this file as the architectural source of truth:

- `docs/BENCHMARKING_ARCHITECTURE.md`

That ensures the benchmark work stays coherent and does not degrade into disconnected scripts or one-off perf checks.
