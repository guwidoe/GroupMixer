# Schedule ingestion audit (2026-04-06)

This audit inventories current producers/consumers of `initial_schedule` and classifies each usage under the new target model:

- **incumbent warm start** — complete schedule, must already satisfy structural + hard-constraint validity
- **construction seed** — partial or advisory placement input completed by the shared constructor
- **legacy ambiguity to eliminate** — current use overloads `initial_schedule` with behavior that should move to `construction_seed_schedule` or should be rejected outright

## Core solver ingestion points

### `backend/core/src/models.rs`
- `ApiInput.initial_schedule`
- **Current classification:** legacy ambiguous field
- **Migration note:** this field currently mixes incumbent warm starts and constructor seeding. It should become incumbent-only, with a separate construction-seed field.

### `backend/core/src/solver_support/construction.rs`
- `apply_initial_schedule_warm_start`
- **Current classification:** legacy ambiguity to eliminate
- **Reason:** it treats `initial_schedule` as partial preassignment and then lets construction complete it.
- **Target:** rename/split to an explicit construction-seed ingestion path.

### `backend/core/src/solver1/construction.rs`
- calls shared warm-start/seed helper before baseline construction
- **Current classification:** mixed / legacy ambiguous
- **Target:**
  - incumbent warm start should bypass construction and be loaded directly after validation
  - construction seed should remain in the constructor path only

### `backend/core/src/solver2/compiled_problem.rs`
- compiles `initial_schedule` into `compiled_initial_schedule`
- **Current classification:** mixed / legacy ambiguous
- **Reason:** downstream `solver2::SolutionState::new` still fills missing assignments deterministically.
- **Target:** incumbent warm starts must be complete; partial starts must move to construction-seed ingestion.

### `backend/core/src/solver2/state.rs`
- `SolutionState::new` starts from `compiled_initial_schedule` and then fills remaining assignments deterministically
- **Current classification:** legacy ambiguity to eliminate

### `backend/core/src/solver3/compiled_problem.rs`
- compiles `initial_schedule` into `compiled_initial_schedule`
- **Current classification:** mixed / legacy ambiguous

### `backend/core/src/solver3/runtime_state.rs`
- starts from `compiled_initial_schedule` if present, then runs shared baseline construction and solver3 normalization
- **Current classification:** legacy ambiguity to eliminate
- **Target:**
  - incumbent warm start: validate + load directly
  - construction seed: explicit seed path + baseline construction + solver3 normalization if needed

## Product/API/CLI surfaces

### `backend/api/src/api/handlers.rs`
- `evaluate_input_handler` currently requires `initial_schedule`
- **Classification:** incumbent warm start
- **Migration note:** this endpoint semantically wants a complete schedule to evaluate, not a construction seed.

### `backend/cli/src/main.rs`
- `evaluate` currently requires `initial_schedule`
- **Classification:** incumbent warm start
- **Migration note:** same as API; should reject partial/invalid schedules.

### `webapp/src/services/rustBoundary.ts`
### `webapp/src/services/wasm/scenarioContract.ts`
### `webapp/src/services/wasm/module.ts`
- browser payload builders expose `initial_schedule` for “warm start” solves
- **Classification:** incumbent warm start
- **Migration note:** the browser/UI semantics are resume-from-result semantics, not constructor-seed semantics.

## Benchmarking surfaces

### `backend/benchmarking/cases/stretch/sailing_trip_demo_real_benchmark_start.json`
- checked-in deterministic benchmark-start schedule
- **Classification:** construction seed / helper benchmark-start case
- **Migration note:** should stop using the incumbent warm-start field when the explicit construction-seed field exists.

### `backend/benchmarking/cases/path/*.json`
- path fixtures such as:
  - `backend/benchmarking/cases/path/transfer_pair_meeting.json`
  - `backend/benchmarking/cases/path/search_driver_allowed_sessions.json`
  - `backend/benchmarking/cases/path/clique_swap_partial_participation.json`
- **Classification:** mostly incumbent warm starts when the schedule is complete and valid; otherwise legacy ambiguity
- **Migration note:** each path fixture should declare one meaning only. Deterministic benchmark-start / partial-placement fixtures should migrate to construction seeds.

### `backend/benchmarking/src/hotpath_inputs.rs`
- many helper builders synthesize deterministic `initial_schedule` values
- **Classification:** mixed
- **Migration note:**
  - full valid deterministic starts used as exact benchmark start states can remain incumbent warm starts
  - partial/advisory bootstrap inputs must move to construction seeds

### `backend/benchmarking/src/validation.rs`
- clones `result.schedule` into `initial_schedule` for external recomputation
- **Classification:** incumbent warm start
- **Migration note:** this is already the right semantic shape; it should use the shared warm-start validator/contract.

## Tests and examples

### Clear incumbent warm-start tests
Examples include:
- `backend/core/tests/search_driver_regression.rs`
- `backend/core/tests/core_regression_tests.rs`
- many `backend/core/src/solver2/tests.rs` and `backend/core/src/solver3/tests.rs` cases that provide complete schedules
- **Classification:** incumbent warm start
- **Migration note:** keep as warm-start coverage, but make them prove strict validation and exact schedule acceptance.

### Legacy ambiguous / invalid-start tests
Examples include:
- `backend/core/tests/move_clique_swap_regression.rs`
- any test that intentionally constructs split-clique or otherwise hard-invalid schedules via `initial_schedule`
- any test that supplies only a subset of sessions/groups and relies on constructor fill-in
- **Classification:** legacy ambiguity to eliminate
- **Migration note:**
  - invalid incumbent schedules should be rejected explicitly
  - tests that need constructor seeding should move to the construction-seed field
  - tests that need intentionally invalid schedules for move-kernel analysis should build state through a dedicated test helper or lower-level state constructor, not via incumbent warm-start semantics

### Shared fixture helpers
- `backend/core/tests/common/mod.rs::make_initial_schedule`
- `backend/core/benches/bench_inputs.rs::make_initial_schedule`
- **Classification:** neutral helper; meaning depends on caller
- **Migration note:** keep helper for schedule map construction, but rename/add companion helpers where the caller means “construction seed”.

## API/contract migration summary

### Should remain incumbent warm starts
- API `evaluate-input`
- CLI `evaluate`
- browser/webapp “warm start from previous result” flows
- benchmark external validation replay
- solver tests that provide complete valid schedules as exact incumbents

### Should become explicit construction seeds
- shared constructor preassignment path
- deterministic benchmark-start helper cases
- any partial schedule fixture that depends on constructor completion
- any bootstrapping helper that exists to shape a starting state rather than load a valid incumbent

### Must be rejected, not reinterpreted
- hard-invalid incumbent schedules
- split active cliques in incumbent warm starts
- immovable violations in incumbent warm starts
- partial incumbent schedules masquerading as warm starts

## Recommended migration order
1. codify contract and names
2. add shared schedule validator
3. make incumbent warm-start ingestion strict
4. add explicit construction-seed field/path
5. migrate benchmark helpers and partial fixtures
6. keep invalid-state test setup out of incumbent warm-start APIs
