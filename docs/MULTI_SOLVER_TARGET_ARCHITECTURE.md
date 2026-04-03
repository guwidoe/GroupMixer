# Multi-Solver Target Architecture

## Purpose

Define the target architecture for supporting multiple solver families in GroupMixer without forcing every future engine through the legacy simulated annealing implementation.

This document is the architecture reference for the **core multi-solver seam**.

It intentionally separates:

- **solver family** selection
- **runtime** selection
- **public contract** ownership
- **engine internals**
- **future cross-language adapter** concerns

## Status

This is the target architecture for the readiness refactor.
The current repo is transitioning toward it incrementally.

## The two axes must stay separate

### Solver family
A solver family is the optimization engine being used.

Examples:
- `legacy_simulated_annealing`
- `next_solver`
- future foreign-language engines behind adapters

### Runtime
A runtime is how the app executes a selected solver.

Examples:
- local worker + WASM
- direct WASM evaluation path
- HTTP/backend runtime
- future remote/job runtime

## Rule

These are different axes and must not be collapsed into one selector.

The architecture should support:
- one runtime executing different solver families
- one solver family being available through different runtimes

---

## Architectural layers

```text
UI / app workflows
  -> runtime boundary
  -> public solver contract surface
  -> solver registry / engine boundary
  -> concrete solver engine implementation
  -> engine-specific internals
```

### 1. Webapp/runtime layer
Owns:
- execution orchestration
- runtime capabilities
- app-facing progress/result/error types
- local vs remote execution differences

Must not own:
- canonical solver-family semantics
- solver-internal config truth
- transport-specific details for future foreign-language adapters

### 2. Public contract layer
Owned by:
- `gm-contracts`
- mirrored by `gm-wasm` and `gm-api`

Owns:
- stable public solve/validate/default/recommend semantics
- public schema/help/error/discovery surfaces
- shared contract-safe request/response shapes

Must not own:
- legacy `State` internals
- webapp-only metadata decisions
- engine-specific hidden fallbacks

### 3. Core solver registry / engine boundary
Owned by:
- `gm-core`

Owns:
- typed solver-family identifiers
- available solver registry
- default config per solver family
- recommendation per solver family
- explicit solver capability metadata
- dispatch from selected solver family to concrete engine

Must not require:
- all engines to use legacy `State`

### 4. Concrete solver engine implementation
Examples:
- legacy simulated annealing engine
- next Rust engine
- future adapter-backed engine

Owns:
- engine-specific search state
- heuristics
- construction strategy
- engine-specific telemetry internals

---

## Core architecture rules

### Rule 1 — Explicit typed solver selection in core
Inside `gm-core`, solver-family selection must be typed.

A compatibility-facing string may continue to exist at the current public boundary during migration, but internal dispatch must resolve to a typed solver identifier.

### Rule 2 — The engine boundary is above legacy `State`
The legacy `State` remains valid as the implementation detail of the current engine.
It is not the mandatory abstraction for all future engines.

The engine boundary should instead operate on request/result concepts, so a future engine may:
- use a different internal model
- use different scoring/preprocessing structures
- be adapter-backed rather than fully in-process

### Rule 3 — Defaults and recommendations are solver-specific
There must not be one global implicit solver default model.

Instead:
- each solver family owns its default configuration
- each solver family either supports recommendation explicitly or fails explicitly
- no solver family may silently inherit recommendation logic from another one

### Rule 4 — Shared minimum contract, explicit extensions
Every solver family must support a shared minimum semantic contract:
- explicit solver selection
- solve
- validation / explicit unsupported failure
- default configuration
- result schedule/assignment output
- final score surface
- stop reason surface
- error semantics

Solver-specific configuration and telemetry may exist, but they must be additive and explicit.

### Rule 5 — No silent fallback between solver families
If a selected solver family is unknown, unsupported, or incompatible with the request, the system must fail explicitly.

It must not:
- quietly run a different solver
- quietly coerce settings to another solver family
- quietly drop solver-specific configuration

---

## Capability model

Capabilities are intentionally split by owner.

### Solver-owned capabilities
Examples:
- supports_recommended_settings
- supports_deterministic_seed
- supports_progress_callback
- supports_benchmark_observer
- supports_initial_schedule
- supports_solver_specific_settings_schema

These describe the solver family itself.

### Runtime-owned capabilities
Examples:
- supports_streaming_progress_delivery
- supports_active_solve_inspection
- supports_direct_evaluation
- supports_run_scoped_cancellation
- supports_local_snapshot_resume

These describe the execution environment / transport path.

### Important rule
A runtime must not claim a solver capability the selected solver does not actually support.
A solver must not imply a runtime capability the current runtime does not actually expose.

---

## Shared vs solver-specific semantics

### Shared semantics
These should remain stable across solver families where possible:
- problem definition
- schedule / assignments output
- top-level result scores and penalties
- stop reason surface
- validation issues / public errors
- deterministic-seed declaration when supported

### Solver-specific semantics
These may vary by engine:
- search diagnostics
- move-family telemetry
- temperature/cooling concepts
- engine-specific construction metrics
- engine-specific tuning parameters

### Rule
Shared app flows should depend only on shared semantics.
Solver-specific panels and metadata should be capability-gated.

---

## Registry and engine dispatch shape

`gm-core` should have an explicit registry/factory layer responsible for:

- listing available solver families
- exposing solver descriptors/capabilities
- constructing solver defaults
- routing solve requests to the selected engine
- routing recommendation requests to the selected engine
- validating solver/config compatibility

Conceptually:

```text
solve request
  -> resolve typed solver family
  -> registry validates selection/config
  -> registry constructs/chooses engine
  -> engine executes using its own internals
  -> shared result returned
```

---

## Migration sequencing

Recommended order:

1. add target architecture + typed solver identifiers
2. add engine boundary above legacy `State`
3. add registry/factory + move defaults/recommendation there
4. adapt contract surfaces
5. adapt webapp metadata/types/UI
6. adapt tests/benchmarks
7. only then build the next solver on top of the new seam

---

## PR review checklist for solver-boundary changes

When reviewing changes in this area, ask:

1. Did this keep runtime selection separate from solver-family selection?
2. Did this avoid adding new `SimulatedAnnealing` assumptions into shared layers?
3. Did this keep the engine seam above legacy `State`?
4. Did this preserve explicit failure instead of silent fallback?
5. Did this keep shared vs solver-specific semantics honest?
6. Did this avoid leaking future transport/protocol details into app-facing layers?
7. Did this keep defaults and recommendation logic owned by the selected solver family?

---

## Future cross-language note

Future non-Rust solvers are expected to plug in below the app/runtime boundary.
That protocol seam is a follow-on concern and should remain below:
- React/store types
- runtime-owned webapp types
- public app workflows

See:
- `docs/adr/0001-future-cross-language-solver-adapter-seam.md`
- `docs/MULTI_SOLVER_ROLLOUT_CRITERIA.md`
