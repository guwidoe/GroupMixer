# Second Solver Readiness Plan

## Purpose

Prepare GroupMixer to support a **true alternative solver engine** in parallel with the legacy simulated annealing solver, while preserving:

- the existing Rust + WASM delivery path
- the current browser-first default runtime
- the existing public contract direction through `gm-contracts`
- future optional support for solver implementations in other languages

This plan is **architecture preparation**, not the implementation plan for the second solver itself.

## Important scope correction

The previous breakdown into 7 epics was **too fine-grained for planning**.
Those were better understood as architecture workstreams, not all as top-level epics.

For actual execution, this should be treated as **3 epics**:

1. **Core multi-solver architecture**
2. **Contracts + webapp adaptation**
3. **Verification + rollout hardening**

Cross-language support remains in scope, but only as an architectural seam and ADR during readiness work — **not** as a large standalone implementation track now.

## Desired end state

After this plan is complete, the repo should support all of the following without invasive rewrites:

1. keep the legacy solver running unchanged behind stable seams
2. add a second Rust engine that does **not** need to reuse legacy internal `State` semantics unless that is actually useful
3. expose multiple solver families through the same contract-native surfaces (`gm-contracts`, `gm-wasm`, `gm-api`, webapp runtime)
4. let the webapp render solver-neutral flows while supporting solver-specific configuration and telemetry where appropriate
5. run semantic, parity, regression, and benchmark comparisons across solver implementations
6. later add a cross-language solver adapter without forcing protobuf or transport details into React/store boundaries

## Non-goals

- implementing the second solver engine itself
- moving the default runtime from browser/WASM to backend
- pretending every solver must expose identical internals or telemetry
- forcing the new solver to use the legacy `State` structure
- introducing a premature distributed job system before the local multi-solver seams are ready

## Architectural doctrine for this plan

This plan follows the repo doctrine in `docs/reference/principles/AGENTIC_ENGINEERING_PRINCIPLES.md`.

Key implications here:

- no silent fallback from one solver to another
- explicit solver selection or explicit failure
- explicit separation between runtime selection and solver selection
- explicit boundaries between public contract, app contract, engine internals, and transport/protocol details
- stable, testable, inspectable seams for both current and future solver implementations

## Guiding architectural decisions

### 1. Separate runtime from solver family
These are different axes and must stay different.

- **runtime** = local wasm / local worker / HTTP / future remote runtime
- **solver family** = legacy simulated annealing / second solver / future other engines

The app must be able to choose a runtime and a solver independently, subject to capability checks.

### 2. Add a solver-engine boundary above legacy internals
The current `gm-core` `algorithms::Solver` trait is useful for the legacy engine, but it is too low-level to be the mandatory seam for all future engines.

We need a higher-level engine boundary whose inputs/outputs are solver-contract concepts rather than legacy state internals.

### 3. Keep one public solve contract
`gm-contracts` remains the repo-level source of truth for public solver-facing shapes.

We can add solver descriptors, capabilities, and solver-specific config variants, but we should not create competing semantic registries in the webapp or wrappers.

### 4. Keep shared result semantics, allow optional solver-specific telemetry
The app should rely on a shared minimum result/progress contract.
Solver-specific telemetry should be additive and explicitly typed/capability-gated.

### 5. Prepare now for cross-language engines, but do not force that protocol into the UI boundary
The cross-language seam should live below the app/runtime contract.
The webapp should continue to depend on runtime-owned types, not protobuf or language-specific envelopes.

---

# Epic 1 — Core multi-solver architecture

## Outcome
`gm-core` is ready to host more than one solver family through explicit, typed seams, and the repo has a clear target architecture for multi-solver support.

## Why this epic exists
Today the biggest blocker is not the runtime seam. It is that the solver-family seam is still too SA-shaped and too tied to legacy internal structure.

## Includes
This epic absorbs the earlier workstreams around:
- architecture/invariants
- `gm-core` engine boundary and solver registry
- future cross-language seam definition at ADR level
- migration sequencing needed to guide refactors safely

## Todos

### 1.1 Create the multi-solver target architecture doc
Create:
- `docs/MULTI_SOLVER_TARGET_ARCHITECTURE.md`

Document:
- runtime axis vs solver-family axis
- public contract ownership
- engine registry ownership
- adapter locations
- capability model
- parity/comparison workflow
- future cross-language preparation seam

### 1.2 Define canonical terms and stable solver IDs
Standardize terms such as:
- solver family
- solver engine
- runtime
- solve request
- warm start
- parity run
- shared telemetry
- solver-specific telemetry

Define stable IDs such as:
- `legacy_simulated_annealing`
- `next_solver`

### 1.3 Introduce typed solver selection in `gm-core`
Refactor internal solver selection away from raw strings.

Target changes:
- add `SolverKind` / `SolverId` model in `backend/core/src/models.rs`
- stop treating raw strings as the primary source of truth internally
- keep compatibility shims only at public parse boundaries if needed

### 1.4 Introduce a higher-level engine boundary above legacy `State`
Add a new internal engine seam, conceptually:
- `SolverEngine`
- consumes normalized solve input / request context
- returns shared result + optional engine-specific telemetry
- may validate config/capabilities explicitly

Important:
- legacy SA adapts to this boundary using `State`
- future engines are not forced to reuse `State`

### 1.5 Keep legacy `State` as a legacy-engine implementation detail
Refactor toward:
- legacy SA engine owns `State`
- shared orchestration does not require all engines to construct `State`
- no new engine is forced to mirror legacy scheduling/scoring internals prematurely

### 1.6 Create a solver registry/factory in core
Add a registry/factory responsible for:
- listing available solver families
- resolving a selected solver
- constructing default configuration
- validating configuration compatibility
- exposing solver-owned capability metadata

Suggested location:
- `backend/core/src/engines/` or `backend/core/src/solver_registry.rs`

### 1.7 Move defaults, recommendation, and validation behind the selected solver family
Refactor:
- `default_solver_configuration()`
- `calculate_recommended_settings()`
- solve construction in `run_solver_with_callbacks()`
- validation logic where needed

Rules:
- defaults are solver-specific
- recommendations are solver-specific or explicitly unsupported
- validation distinguishes invalid vs infeasible vs unsupported solver/problem combination
- never silently use SA behavior for another solver family

### 1.8 Define the capability model and extension model
Document and encode which capabilities are:
- runtime-owned
- solver-owned
- operation-specific

Examples:
- supports_warm_start
- supports_streaming_progress
- supports_recommended_settings
- supports_deterministic_seed
- supports_direct_evaluation
- supports_solver_specific_settings_schema

Also define:
- minimum shared result/progress/error contract
- solver-specific settings extension model
- solver-specific telemetry extension model

### 1.9 Add a lightweight ADR for future cross-language solver adapters
Document:
- cross-language solver protocol is a future lower-level seam
- protobuf is a valid candidate there
- it is intentionally not the app/store boundary
- in-process vs adapter-backed engines are distinct categories

### 1.10 Add migration sequencing and architecture review checklist
Document:
- recommended PR sequence for the refactor
- checklist for PRs touching solver seams

## Acceptance criteria

- a dedicated multi-solver target architecture doc exists
- solver selection is explicit and typed in core
- `gm-core` has a solver-engine boundary above legacy SA internals
- defaults/recommendation/validation are solver-aware
- future cross-language support is documented as a lower adapter seam, not a UI concern

---

# Epic 2 — Contracts and webapp adaptation

## Outcome
The public contract layers and the webapp can represent, configure, and execute multiple solver families without shared code assuming `SimulatedAnnealing`.

## Why this epic exists
Even with a good core seam, the repo is still not ready if:
- `gm-contracts`, `gm-wasm`, and `gm-api` only describe one solver family
- the webapp types and UI remain SA-shaped

## Includes
This epic absorbs the earlier workstreams around:
- `gm-contracts` / `gm-wasm` / `gm-api` multi-solver semantics
- webapp solver metadata and capability-driven UI
- persistence/config migration for existing SA scenarios

## Todos

### 2.1 Extend `gm-contracts` for multi-solver semantics
Add public contract support for:
- solver descriptors/summaries
- solver capabilities
- multi-variant solver configuration
- selected solver family where needed
- examples/help/schema support for multiple solver families

Optional discovery operations may include:
- list available solvers
- get solver descriptor/help
- get default configuration for a specific solver

### 2.2 Route `gm-wasm` and `gm-api` by selected solver family
Update:
- `backend/wasm/src/contract_runtime.rs`
- `backend/wasm/src/lib.rs`
- `backend/api/src/api/contract_surface.rs`
- related route/help/schema surfaces as needed

Goals:
- parse selected solver family explicitly
- route to the selected engine via the core registry/factory
- expose truthful discovery/default/recommendation semantics
- preserve one public solve contract

### 2.3 Define compatibility behavior for legacy saved requests/configs
Decide and document:
- whether solver family becomes mandatory in saved requests
- how legacy SA-only requests/configs are migrated
- how unknown solver families fail

### 2.4 Introduce solver metadata/services in the webapp
Add app-facing services/types for:
- available solver families
- selected solver family
- solver capabilities
- solver-specific settings metadata
- default settings retrieval by solver

Suggested location:
- `webapp/src/services/solverCatalog/` or similar

### 2.5 Refactor webapp types for multiple solver families
Update:
- `webapp/src/types/index.ts`

So the app can represent:
- shared settings
- solver-specific param variants
- optional solver-specific telemetry extensions

### 2.6 Remove SA assumptions from shared payload normalization and adapters
Refactor:
- `webapp/src/services/wasm/scenarioContract.ts`
- `webapp/src/services/runtimeAdapters/recommendedSettings.ts`
- adjacent helper code as needed

So shared logic stops assuming only SA-shaped params exist.

### 2.7 Make settings/result UI metadata- and capability-driven
Refactor relevant `SolverPanel` / result / history / comparison components so they:
- render solver selector
- render shared settings generically
- render solver-specific configuration from metadata
- render solver-specific result/telemetry panels only when supported
- do not assume temperature/reheat semantics exist for every solver

### 2.8 Add persistence and migration handling in the webapp
Update storage/import/demo/fixture paths so legacy SA scenarios remain readable or fail explicitly with migration guidance.

### 2.9 Add webapp tests for solver switching and unsupported capability states
Cover:
- selecting different solver families
- rendering correct settings forms
- recommendation supported vs unsupported
- warm start supported vs unsupported
- shared vs solver-specific result displays

## Acceptance criteria

- public contracts can represent more than one solver family
- WASM and API route through the same truthful multi-solver semantics
- common webapp flows no longer assume `SimulatedAnnealing`
- solver-specific UI is metadata/capability-driven
- legacy stored scenarios have explicit migration behavior

---

# Epic 3 — Verification and rollout hardening

## Outcome
The repo can compare legacy and new solvers safely and has an explicit rollout path before the second solver becomes a product-facing option.

## Why this epic exists
Parallel solver development is only safe if the repo can compare:
- semantics
- feasibility behavior
- score quality
- runtime/performance
- unsupported-mode behavior

## Includes
This epic absorbs the earlier workstreams around:
- cross-solver parity and benchmark harnesses
- CI/gate updates
- contributor docs and rollout criteria

## Todos

### 3.1 Make fixtures and property tests solver-aware
Refactor:
- `backend/core/tests/data_driven_tests.rs`
- fixture schema under `backend/core/tests/test_cases/`
- shared property tests where appropriate

So tests can target:
- one solver family
- or cross-solver comparison cases

### 3.2 Define explicit comparison categories
Document and encode which comparisons are:
- exact parity
- bounded parity
- invariant-only parity
- score-quality comparison
- performance-only comparison

This prevents dishonest expectations that all solvers must behave identically in every metric.

### 3.3 Add cross-solver parity fixtures
Create representative scenarios that run through:
- legacy solver
- next solver

and assert shared expectations such as:
- structural schedule validity
- hard-constraint satisfaction
- no unsupported silent behavior
- deterministic seed behavior when claimed

### 3.4 Extend benchmark artifacts/manifests with solver family identity
Update `backend/benchmarking/` so benchmark runs clearly record:
- solver family
- solver config variant
- seed policy
- capabilities

### 3.5 Add cross-solver solve-level benchmark suites
Benchmark representative scenarios for:
- baseline legacy solver
- second solver
- comparable config families

Keep legacy hotpath forensics where valid, but do not force the new engine into legacy move-family telemetry if its internals differ.

### 3.6 Update docs, CI/gates, and contributor guidance
Update docs/scripts so contributors know what to run when changing:
- shared solver contract code
- a single solver family
- contract/runtime layers
- benchmarking/comparison behavior

### 3.7 Define rollout criteria before enabling the new solver in product flows
Before making the new solver user-selectable, require explicit criteria such as:
- minimum parity coverage
- benchmark visibility
- explicit unsupported feature behavior
- stable persistence/import behavior
- acceptable browser runtime UX

## Acceptance criteria

- fixtures and benchmarks can distinguish solver families
- parity expectations are explicit and honest
- old vs new solver behavior can be compared safely during rollout
- contributor docs and rollout criteria are explicit

---

# Recommended execution order

1. **Epic 1 — Core multi-solver architecture**
2. **Epic 2 — Contracts and webapp adaptation**
3. **Epic 3 — Verification and rollout hardening**
4. only then begin full second-solver implementation work

---

# Definition of done for “repo ready for second solver implementation”

The repo is ready to start the second solver only when all of the following are true:

1. solver family selection is explicit and typed in core
2. `gm-core` has a solver-engine boundary above legacy SA internals
3. defaults and recommendations are solver-specific, not globally SA-shaped
4. `gm-contracts`, `gm-wasm`, and `gm-api` can describe and execute multiple solver families
5. the webapp can render solver-specific settings via metadata rather than SA hardcoding
6. shared flows use shared result/error semantics with capability-gated extensions
7. test fixtures and benchmark artifacts can distinguish solver families
8. old vs new solver comparison is supported by the test/benchmark stack
9. future cross-language support has a documented lower-level seam
10. no important architecture decision depends on undocumented SA assumptions anymore

## Suggested next action

Start with **Epic 1**. That is the minimum architecture work needed before the second solver can be implemented cleanly.