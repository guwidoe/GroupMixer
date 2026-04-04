# Real Sailing Trip Benchmark Plan

## Objective

Add a **truthful benchmark package** for the **exact Sailing Trip demo scenario** so GroupMixer can measure:

1. **full-solve quality/runtime** on the real workload under an explicit **time budget**
2. **full-solve quality/runtime** on the real workload under an explicit **iteration budget**
3. **large-instance search-loop cost** via a deterministic `search_iteration` probe on the real workload
4. **large-instance move-family timings** (`swap`, `transfer`, `clique_swap`; preview + apply) on the real workload

This plan treats the current `backend/benchmarking/cases/stretch/sailing_trip_feature_dense.json` case as a **derived stretch workload**, not as the exact demo case.

---

## Non-goals

- silently replacing the current derived sailing stretch case
- hiding solver meta-settings behind implicit defaults
- tuning policies ad hoc during routine benchmark runs
- mixing lightweight representative lanes with large real-demo lanes in one ambiguous suite

---

## Design principles

- the **real demo case** must be stored explicitly and named honestly
- benchmark meaning must stay explicit: **case + solver family + policy + budget**
- **time-budget** and **iteration-budget** runs are different benchmark products and should remain separate
- **canonical policy** and **tuned policy** are different benchmark products and should remain separate
- deterministic hotpath/search probes must use prebuilt stable states and fixed seeds
- no benchmark should “cheat” by weakening the scenario, budgets, or policy semantics after the fact

---

## Deliverables

## 1. Exact demo benchmark case

Add a new case manifest for the exact Sailing Trip demo scenario:

- `backend/benchmarking/cases/stretch/sailing_trip_demo_real.json`

Requirements:

- the `input` must match the real demo scenario exactly
- `class: stretch`
- tags should make the semantics obvious, e.g.
  - `stretch`
  - `demo`
  - `real-world`
  - `sailing`
  - `exact-demo`
- description must say this is the exact product demo workload, not a derived proxy

Implementation note:

- keep this exact case as the source-of-truth artifact
- if a solver family cannot cold-start the exact case truthfully, add a second clearly named companion case that preserves the exact problem but adds a shared deterministic benchmark start schedule

## 2. Policy model for solve-quality runs

Introduce explicit benchmark policy fixtures / docs for the real demo case.

At minimum, define for each participating solver family:

- **canonical policy**
- **tuned policy**

Initial scope can start with:

- solver1 canonical
- solver3 canonical
- solver1 tuned
- solver3 tuned

Policy contents must be explicit and versioned:

- solver params (e.g. temperatures, cooling schedule, reheating, family-specific params)
- move policy / weights / allowed families
- stop condition shape except for the budget field overridden by the suite
- seed policy

Recommended storage:

- embed the policy in the case override / suite override path initially
- also document the named policy matrix in this plan or a follow-up benchmarking doc

If policy reuse grows, promote them into dedicated checked-in policy fixtures later.

## 3. Full-solve real-demo suites

Add separate suites for:

### Time-budget suites

- `backend/benchmarking/suites/stretch-sailing-trip-demo-time-solver1-canonical.yaml`
- `backend/benchmarking/suites/stretch-sailing-trip-demo-time-solver3-canonical.yaml`
- `backend/benchmarking/suites/stretch-sailing-trip-demo-time-solver1-tuned.yaml`
- `backend/benchmarking/suites/stretch-sailing-trip-demo-time-solver3-tuned.yaml`

### Iteration-budget suites

- `backend/benchmarking/suites/stretch-sailing-trip-demo-iterations-solver1-canonical.yaml`
- `backend/benchmarking/suites/stretch-sailing-trip-demo-iterations-solver3-canonical.yaml`
- `backend/benchmarking/suites/stretch-sailing-trip-demo-iterations-solver1-tuned.yaml`
- `backend/benchmarking/suites/stretch-sailing-trip-demo-iterations-solver3-tuned.yaml`

Recommended initial budgets:

- time budget: `default_time_limit_seconds: 15`
- iteration budget: `default_max_iterations: 1000000`

Notes:

- keep these as **separate suites**, not one suite with mixed semantics
- prefer one shared real-demo benchmark-start case across all full-solve suites when that improves cross-solver comparability or avoids solver-family-specific cold-start artifacts
- only the explicit solver family / policy / budget should differ

## 4. Real-demo large-instance search-iteration probe

Add one deterministic `search_iteration` preset for the exact demo case:

- preset id in `backend/benchmarking/src/hotpath_inputs.rs`:
  - `search_sailing_trip_demo_real_solver3`
  - optionally solver1 parity preset if needed later

Add a case manifest:

- `backend/benchmarking/cases/hotpath/search_sailing_trip_demo_real_solver3.json`

Add a dedicated suite:

- `backend/benchmarking/suites/hotpath-search-iteration-sailing-trip-demo-solver3.yaml`

Requirements:

- deterministic prebuilt state from the exact demo input
- explicit seed
- explicit move policy
- no runtime-generated ambiguity in the input state
- benchmark should answer “how expensive is one real search iteration on the actual large demo workload?”

## 5. Real-demo large-instance move-family probes

Add deterministic hotpath presets derived from the exact demo case for solver3:

- `swap` preview/apply
- `transfer` preview/apply
- `clique_swap` preview/apply

Implementation location:

- `backend/benchmarking/src/hotpath_inputs.rs`

Case manifests:

- `backend/benchmarking/cases/hotpath/sailing_trip_demo_real_swap_solver3.json`
- `backend/benchmarking/cases/hotpath/sailing_trip_demo_real_transfer_solver3.json`
- `backend/benchmarking/cases/hotpath/sailing_trip_demo_real_clique_swap_solver3.json`

Suites:

- `backend/benchmarking/suites/hotpath-swap-preview-sailing-trip-demo-solver3.yaml`
- `backend/benchmarking/suites/hotpath-swap-apply-sailing-trip-demo-solver3.yaml`
- `backend/benchmarking/suites/hotpath-transfer-preview-sailing-trip-demo-solver3.yaml`
- `backend/benchmarking/suites/hotpath-transfer-apply-sailing-trip-demo-solver3.yaml`
- `backend/benchmarking/suites/hotpath-clique-swap-preview-sailing-trip-demo-solver3.yaml`
- `backend/benchmarking/suites/hotpath-clique-swap-apply-sailing-trip-demo-solver3.yaml`

Why dedicated suites instead of appending to the current lightweight hotpath suites:

- keeps small diagnostic lanes distinct from large realistic lanes
- preserves comparability meaning
- avoids confusing day-to-day hotpath history with large-instance stress lanes

---

## Implementation phases

## Phase 1 — exact case ingestion

### Work

- identify the exact Sailing Trip demo source in product/demo data
- create `backend/benchmarking/cases/stretch/sailing_trip_demo_real.json`
- verify it parses and runs through `gm-cli benchmark run`
- document clearly that the old `sailing_trip_feature_dense` case remains a derived stretch case

### Acceptance

- exact demo case is checked in
- no benchmark file claims “real demo” unless it really is
- current derived case remains available for historical continuity

## Phase 2 — canonical solve suites

### Work

Add canonical-policy suites for solver1 and solver3:

- 15s time budget
- 1,000,000 iteration budget

### Acceptance

- all four canonical suites run successfully
- run artifacts record effective seed, budget, move policy, stop reason, runtime, score
- suite names make budget semantics obvious

## Phase 3 — tuned solve suites

### Work

Add tuned-policy suites for solver1 and solver3.

### Rules

- tuned policies must be declared explicitly and reviewed
- policy changes require a version bump or explicit doc update
- do not silently mutate the policy inside implementation code

### Acceptance

- all four tuned suites run successfully
- solver family + policy identity is clear from suite naming and docs
- future comparisons can distinguish canonical vs tuned honestly

## Phase 4 — real-demo search iteration probe

### Work

- add deterministic `search_iteration` preset(s) in `hotpath_inputs.rs`
- add case manifest(s)
- add dedicated suite(s)

### Acceptance

- search-iteration run is deterministic and reproducible
- state construction is stable and uses the exact real demo input
- output gives actionable large-instance per-iteration timing

## Phase 5 — real-demo move-family probe package

### Work

- add deterministic solver3 preset(s) for swap / transfer / clique swap on the real demo state
- add six dedicated suites for preview/apply lanes

### Acceptance

- each lane runs deterministically
- chosen move is valid, stable, and representative enough for repeated measurement
- preview/apply timings are available for the real large workload

## Phase 6 — documentation and workflow integration

### Work

Update benchmark docs to explain:

- derived vs exact-demo sailing cases
- canonical vs tuned policies
- time-budget vs iteration-budget suite semantics
- which suites are routine vs expensive

Recommended doc touchpoints:

- `docs/benchmarking/README.md`
- `docs/benchmarking/WORKFLOW.md`
- optionally `docs/benchmarking/SPEC.md` if policy identity guidance needs to be formalized

### Acceptance

- a fresh agent can discover and run the new benchmark package without guessing
- the workflow explains which benchmark answers which question

---

## Proposed suite matrix

## Full solve

| Suite type | Solver | Policy | Budget |
|---|---|---|---|
| real demo full solve | solver1 | canonical | 15s |
| real demo full solve | solver3 | canonical | 15s |
| real demo full solve | solver1 | tuned | 15s |
| real demo full solve | solver3 | tuned | 15s |
| real demo full solve | solver1 | canonical | 1,000,000 iterations |
| real demo full solve | solver3 | canonical | 1,000,000 iterations |
| real demo full solve | solver1 | tuned | 1,000,000 iterations |
| real demo full solve | solver3 | tuned | 1,000,000 iterations |

## Large realistic probes

| Probe type | Solver | Notes |
|---|---|---|
| search_iteration | solver3 | deterministic prebuilt real-demo state |
| swap preview/apply | solver3 | real-demo lane |
| transfer preview/apply | solver3 | real-demo lane |
| clique_swap preview/apply | solver3 | real-demo lane |

Solver1 large realistic hotpath/search probes can be added if cross-family parity at that level becomes necessary, but solver3 should land first if the immediate goal is solver3 performance visibility on the real workload.

---

## Benchmark policy guidance

## Canonical policy

Purpose:

- stable architecture/regression comparison
- modest, documented, conservative settings

Rules:

- one checked-in canonical policy per solver family for this workload class
- only revise deliberately
- policy identity must be explicit in benchmark naming or docs

## Tuned policy

Purpose:

- “best approved known settings” comparison for real capability

Rules:

- still checked in, explicit, and versioned
- not re-tuned casually between routine benchmark runs
- if materially changed, record as a new policy version

---

## Risks and mitigations

## Risk: benchmark ambiguity

If budget or policy semantics are mixed, comparisons become dishonest.

### Mitigation

- separate suites by budget and policy
- explicit naming
- explicit artifact recording

## Risk: fake realism

If the “real demo” case is normalized or simplified, the benchmark package answers the wrong question.

### Mitigation

- check in the exact demo case under an explicit `demo-real` name
- keep the derived stretch case separately named

## Risk: unstable hotpath probes

Large-instance moves may be hard to keep deterministic.

### Mitigation

- construct fixed state snapshots in `hotpath_inputs.rs`
- use explicit seeds
- choose known-valid moves deliberately
- keep probe ids stable

## Risk: benchmark-cheating via tuning churn

### Mitigation

- version benchmark policies
- document canonical vs tuned distinctly
- forbid silent implementation-side setting changes for benchmark suites

---

## Acceptance criteria for the whole package

The real Sailing Trip benchmark package is complete when:

1. the exact demo case is checked in as a distinct stretch benchmark case
2. canonical and tuned full-solve suites exist for solver1 and solver3 under both 15s and 1,000,000-iteration budgets
3. a deterministic real-demo `search_iteration` suite exists
4. deterministic real-demo solver3 hotpath suites exist for swap, transfer, and clique-swap preview/apply
5. docs explain the difference between derived sailing benchmarks and the exact demo benchmark package
6. all new benchmark artifacts preserve truthful budget, policy, and solver identity

---

## Recommended implementation order

1. exact real demo case
2. solver3 canonical 15s + 1,000,000 iteration suites
3. solver1 canonical 15s + 1,000,000 iteration suites
4. tuned suites
5. real-demo search_iteration preset + suite
6. real-demo solver3 move-family hotpath presets + suites
7. workflow/docs cleanup
