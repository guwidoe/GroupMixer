# Objective Research Benchmarking and Validation Implementation Plan

## Status

Draft implementation plan accepted as the next repo-preparation track.

## Purpose

Prepare GroupMixer for an objective-quality research lane that tries to improve solver outcomes on hard scenarios under meaningful checked-in budgets.

This plan is intentionally centered on:

- benchmark truthfulness
- correctness trust
- heterogeneous hard scenarios
- rich benchmark telemetry
- full-suite execution for each objective autoresearch experiment

It is **not** primarily a runtime-microbenchmark plan.

## Governing ADR

- `docs/adr/0002-objective-research-requires-canonical-benchmarks-and-dual-validation.md`

## Non-negotiable rules

1. The canonical benchmark/testing scenario is the thing being measured.
2. If a canonical case does not run, the lane must fail honestly.
3. No one may simplify, derive, proxy, or substitute a target benchmark/testing case to make tests pass unless the user explicitly approves a changed benchmark question.
4. Helper cases may exist only as additional diagnostics and must never silently replace canonical target cases.
5. Objective autoresearch runs the full curated canonical objective suite by default.
6. External benchmark validation is authoritative.
7. Internal solver oracle/debug validation should exist because it makes development and drift detection much stronger.

## Desired end state

When this plan is complete, the repo should support all of the following:

- a curated **canonical objective suite** of heterogeneous hard scenarios
- a curated **correctness/edge-case corpus** with complex intertwined constraints
- benchmark manifests that explicitly distinguish `canonical` cases from helper/derived/proxy cases
- benchmark artifacts that record exact case provenance and fingerprints
- benchmark runs that independently validate the final solution and score breakdown
- solver3 internal oracle/debug validation that can be compiled in for correctness testing and compiled out for performance benchmarking
- rich run telemetry so future autoresearch can judge experiments on objective quality, score composition, and search behavior
- an objective autoresearch lane that runs the entire canonical objective suite every experiment

## Workstream overview

1. **Benchmark truthfulness hardening**
2. **External benchmark validator**
3. **Internal solver3 oracle/debug feature**
4. **Canonical objective suite + correctness corpus**
5. **Rich score/search telemetry**
6. **Objective autoresearch lane**

---

## Workstream 1 — Benchmark truthfulness hardening

### Goal

Make it mechanically difficult to ever again substitute a helper/proxy/derived case for a canonical objective target.

### Changes

#### 1.1 Extend benchmark case metadata

Add explicit case-role and provenance fields to manifests and artifacts.

Suggested manifest additions:

- `case_role`: `canonical | helper | derived | proxy | warm_start | benchmark_start`
- `canonical_case_id`: required for non-canonical cases that derive from a canonical case
- `provenance`: freeform structured notes about source/generation method
- `budget`: explicit checked-in solve budget per case or suite case entry
- `purpose`: short machine-readable purpose such as `objective_target`, `debug_start_state`, `hotpath_probe_source`, `construction_failure_repro`

Target files:

- `backend/benchmarking/src/manifest.rs`
- `backend/benchmarking/src/artifacts.rs`
- `docs/benchmarking/SPEC.md`

#### 1.2 Enforce canonical-only policy for objective suites

Add suite-level policy that declares whether non-canonical cases are allowed.

Suggested rule:

- objective suites default to `canonical-only`
- helper cases are rejected unless the suite explicitly opts into a helper/diagnostic mode

Target files:

- `backend/benchmarking/src/runner.rs`
- `backend/benchmarking/src/manifest.rs`
- suite manifest validation tests

#### 1.3 Record exact case identity in run artifacts

Every run report should include:

- normalized source path
- case fingerprint/hash
- canonical case id
- role
- declared budget
- provenance summary

This lets comparisons and future review catch any target drift.

Target files:

- `backend/benchmarking/src/artifacts.rs`
- `backend/benchmarking/src/runner.rs`
- JSON schemas under `backend/benchmarking/schemas/`

### Acceptance

- canonical objective suites reject helper/proxy/warm-start cases by default
- run reports expose case role and fingerprint
- comparisons fail honestly if runs are not benchmark-equivalent
- the repo has tests proving this policy

---

## Workstream 2 — External benchmark validator

### Goal

Make benchmark runs independently verify final-solution correctness and score composition outside the optimized solver path.

### Changes

#### 2.1 Add independent final-solution validation step

After every full-solve benchmark case:

- recompute total score independently
- recompute score breakdown independently
- verify assignment feasibility/invariants independently
- fail the case if the solver-reported result disagrees

This validator must not trust the exact incremental runtime aggregates being benchmarked.

Potential implementation directions:

- shared scoring/validation module at the contracts/domain level
- a benchmark-side validator built from `ApiInput` + final assignment
- cross-check against solver-family-independent semantics rather than solver3 incremental internals

Target areas:

- `backend/benchmarking/src/runner.rs`
- potentially new validator module under `backend/benchmarking/src/`
- possibly shared semantics extracted from `gm-core` if needed, but not by reusing the optimized path under test as the only authority

#### 2.2 Emit validation report into artifacts

Store a validation block per case containing at least:

- `validation_passed`
- total score agreement
- breakdown agreement
- invariant/feasibility status
- mismatch diagnostics if present

#### 2.3 Add failure-mode tests

Tests should prove that benchmark execution fails if:

- final total score is wrong
- breakdown is wrong
- assignment violates invariants
- benchmark metadata and canonical policy disagree

### Acceptance

- every full-solve benchmark run performs external final-solution validation
- any mismatch fails the benchmark honestly
- run artifacts persist the validation outcome and diagnostics

---

## Workstream 3 — Internal solver3 oracle/debug feature

### Goal

Strengthen correctness development inside solver3 without building a second disconnected solver stack.

### Existing foundation

Solver3 already has useful starting pieces:

- `backend/core/src/solver3/oracle.rs`
- `backend/core/src/solver3/scoring/recompute.rs`
- `backend/core/src/solver3/validation/invariants.rs`

The work here is to harden and operationalize them as an intentional correctness feature.

### Changes

#### 3.1 Introduce an explicit correctness feature flag

Implemented feature flag: `solver3-oracle-checks` (in `backend/core/Cargo.toml`).

Intended usage:

- compile with the feature and set `solver_params.solver3.correctness_lane.enabled=true` for correctness/debug lanes that should sample runtime-vs-oracle/invariant checks during `solver3` search
- keep `correctness_lane.enabled=false` (default) and leave the feature off for performance benchmark lanes to avoid oracle/invariant recompute overhead in hotpath measurements

Example:

- correctness/debug run: `cargo test -p gm-core --features solver3-oracle-checks --test search_driver_regression solver3_same_seed_runs_remain_deterministic_after_search_changes`
- performance benchmark run: `gm-cli benchmark run --manifest backend/benchmarking/suites/hotpath-search-iteration-sailing-trip-demo-solver3.yaml` (no extra features)

#### 3.2 Add sampled and targeted oracle checks

Use the feature to support:

- initialization oracle agreement
- preview/apply equivalence checks in focused move tests
- sampled drift checks during search in dedicated correctness runs
- long random move-sequence checks on complex scenarios

#### 3.3 Add large-instance oracle regression tests

Use difficult scenarios to verify that the fast path stays aligned with the oracle under many accepted/rejected moves.

Target files likely include:

- `backend/core/src/solver3/oracle.rs`
- `backend/core/src/solver3/scoring/recompute.rs`
- `backend/core/src/solver3/validation/invariants.rs`
- solver3 move regression tests under `backend/core/tests/`
- new large-instance correctness tests under `backend/core/tests/`

### Important boundary

The internal oracle feature is a development/correctness tool.
It is **not** the sole research-trust authority. The external benchmark validator remains authoritative.

### Acceptance

- solver3 can be compiled with oracle/debug checks enabled for correctness lanes
- large-instance drift/oracle tests exist and pass
- the feature is disabled in performance benchmark lanes

---

## Workstream 4 — Canonical objective suite and correctness corpus

### Goal

Curate the actual scenario set the repo wants to improve, plus a separate set of correctness-stressing scenarios.

### 4.1 Canonical objective suite

Create one curated suite used by the objective research lane.

Properties:

- heterogeneous
- hard
- no intentionally very slow filler cases
- case budgets are chosen because they are informative, not because all cases must share one number
- the full suite runs every objective experiment

Expected contents:

- real Sailing Trip canonical target case
- Social Golfer style case(s)
- pair-heavy hard case(s)
- attribute-balance-heavy hard case(s)
- tightly constrained / near-infeasible hard case(s)
- medium-large realistic case(s) where diversification matters

For each canonical case, store:

- provenance/source
- intended benchmark purpose
- canonical budget
- baseline objective result
- optional checked-in best-known result

#### Important sequencing note

Fixing solver3 support for the exact raw Sailing Trip case is a separate implementation task and should become a **go-live blocker** for the objective autoresearch lane, but it does not need to be the first coding task in this preparation plan.

### 4.2 Correctness/edge-case corpus

Create a separate curated correctness corpus focused on intertwined edge cases.

It should include cases that stress:

- many interacting constraint families at once
- clique integrity under partial participation
- pair/repeat accounting edge cases
- attribute balance edge cases
- tight capacities
- immovable/should/forbidden interactions
- plateau-ish and near-infeasible constructions

### 4.3 Document provenance and purpose

Add documentation for every curated case so future work does not degenerate into an ad hoc pile of JSON files.

Potential documentation location:

- `docs/benchmarking/OBJECTIVE_CASE_PORTFOLIO.md`

### Acceptance

- one curated canonical objective suite exists
- one curated correctness/edge-case corpus exists
- every case has documented provenance and purpose

---

## Workstream 5 — Rich score and search telemetry

### Goal

Produce enough benchmark detail that future autoresearch can reason about what changed, not just whether total score moved.

### Changes

#### 5.1 Score decomposition

Every full-solve run should report at least:

- total score
- unique-contact term
- repetition term
- attribute-balance term
- weighted constraint total
- breakdown of major constraint families where meaningful

The repo should prefer a stable, explicit breakdown schema over ad hoc text logs.

#### 5.2 Search telemetry

Every run should also report useful search behavior signals such as:

- move-family attempts
- move-family accepts
- move-family improving accepts
- uphill/downhill acceptance counts
- no-improvement streak lengths
- restart / perturbation counts
- best-so-far improvement timeline
- iteration count / throughput as secondary metrics

#### 5.3 Config and reproducibility metadata

Persist:

- solver family
- exact solver config / policy
- seed
- budget
- case fingerprint
- build mode / enabled correctness features where relevant

Target areas:

- `backend/benchmarking/src/runner.rs`
- benchmark schemas
- solver search result structs / telemetry surfaces
- benchmark report rendering

### Acceptance

- benchmark reports expose both score decomposition and search telemetry
- future comparison tooling can compare more than one scalar

---

## Workstream 6 — Objective autoresearch lane

### Goal

Create the actual autoresearch lane for objective-quality experiments.

### Design rules

- this is a new lane, separate from raw-runtime optimization
- the full canonical objective suite runs every experiment
- runtime metrics remain visible, but they are not the primary target
- keep/discard policy will be finalized only after telemetry and validation are in place

### Proposed setup

#### 6.1 New objective autoresearch config

Add a separate config and checks path for objective-quality work.

Suggested inputs:

- target canonical objective suite
- correctness corpus lane(s)
- external benchmark validation
- optional solver3 internal oracle feature in correctness checks

#### 6.2 Full-suite checks per experiment

The objective autoresearch checks should run:

- canonical objective suite
- correctness/edge-case suite
- any required solver3 oracle/debug correctness tests
- benchmark artifact validation

No smoke-only substitute should be treated as the real objective experiment gate.

#### 6.3 Rich experiment memory

Make sure the experiment lane logs enough structured detail to support later reasoning:

- benchmark deltas by case
- breakdown deltas
- telemetry deltas
- correctness failures
- notable regressions in runtime as secondary signals

### Go-live blockers

The objective autoresearch lane must not be declared ready until all of the following are true:

1. canonical-vs-helper benchmark truthfulness is enforced by the runner
2. external benchmark validation is live
3. curated objective and correctness portfolios exist
4. score/search telemetry is rich enough to interpret changes
5. the canonical target cases for the lane are genuinely runnable as themselves

---

## Recommended execution order

### Phase 1 — Prevent recurrence and harden trust boundaries

1. benchmark truthfulness metadata + runner rejection rules
2. artifact fingerprint/provenance recording
3. external benchmark validation skeleton

### Phase 2 — Strengthen correctness infrastructure

4. explicit solver3 oracle/debug feature
5. large-instance drift/oracle tests
6. correctness artifact/reporting integration

### Phase 3 — Build the research corpus

7. curate canonical objective suite
8. curate correctness/edge-case corpus
9. document provenance, purpose, and budgets

### Phase 4 — Expand metrics

10. score decomposition in artifacts
11. search telemetry in artifacts and reports
12. richer comparison tooling

### Phase 5 — Launch the objective autoresearch lane

13. add objective autoresearch config/checks
14. require full-suite execution per experiment
15. only then start search/metaheuristic experimentation

---

## Concrete file targets to expect

Benchmarking system:

- `backend/benchmarking/src/manifest.rs`
- `backend/benchmarking/src/runner.rs`
- `backend/benchmarking/src/artifacts.rs`
- `backend/benchmarking/schemas/*.json`
- `docs/benchmarking/SPEC.md`
- `docs/benchmarking/WORKFLOW.md`

Solver3 correctness infrastructure:

- `backend/core/src/solver3/oracle.rs`
- `backend/core/src/solver3/scoring/recompute.rs`
- `backend/core/src/solver3/validation/invariants.rs`
- `backend/core/src/solver3/search/*`
- `backend/core/tests/*`

New documentation likely needed:

- `docs/benchmarking/OBJECTIVE_CASE_PORTFOLIO.md`
- `docs/benchmarking/OBJECTIVE_RESEARCH_IMPLEMENTATION_PLAN.md`

---

## Explicit anti-goals

This plan does **not** recommend:

- simplifying canonical target cases to keep the benchmark lane green
- treating helper start-state cases as the main objective target
- reducing the objective experiment lane to a tiny smoke subset by default
- relying only on in-solver checks for benchmark truth
- overbuilding a generic metaheuristic framework before the benchmark/validation system is ready

## Review checkpoint

At the end of Phase 1, the repo should already be protected against a repeat of the benchmark-substitution failure mode.

At the end of Phase 2, correctness trust should be materially stronger.

At the end of Phase 5, the repo should finally be ready for objective-focused autoresearch on new move types, neighborhoods, and metaheuristics.
