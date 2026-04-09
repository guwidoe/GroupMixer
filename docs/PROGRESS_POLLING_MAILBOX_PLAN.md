# Progress Polling Mailbox Plan

## Goal

Replace push-based live solver progress with a **best-effort, latest-only polling path** so UI telemetry does not block solver execution, does not queue stale updates, and stays visually closer to real wall clock time.

## Problem Statement

Current live progress still depends on a hot-path chain:

1. Rust solver emits a progress callback.
2. `backend/wasm` serializes a `ProgressUpdate` into JS.
3. The worker forwards the update to the main thread.
4. The main thread deserializes and pushes React state updates.

Even after solver3 callback debouncing, this design still has two structural issues:

- **hot-path callback cost** can still slow the solve
- **push delivery can queue** if the consumer becomes slower than the producer

The visible symptom is progress that can pause, lag, or feel slightly behind wall clock.

## Intended Outcome

Use a **shared latest-progress mailbox** for cheap scalar telemetry:

- the worker owns the hot-path callback
- the callback writes the newest scalar progress into shared memory
- the UI polls the mailbox at a fixed cadence
- if multiple writes happen between polls, the UI reads only the latest one
- no per-update `postMessage` traffic on the live path
- no stale update queue on the main thread

Heavy payloads such as schedules remain off the hot path.

## Non-Goals

- Do not change solver semantics or search policy.
- Do not make every possible telemetry field live.
- Do not move full result delivery to shared memory.
- Do not remove the existing structured solve/result path for completion and inspection.

## Constraints

- Must preserve current worker-based browser runtime model.
- Must work with the existing WASM solver integration.
- Must use mailbox polling as the single intended live-progress path.
- Must surface explicit initialization/runtime errors if `SharedArrayBuffer` or cross-origin isolation prerequisites are missing.
- Must keep solver cancellation and final result persistence working.
- Must keep solver1 and solver3 behavior consistent from the UI perspective.

## Current COI Status

### Dev

Already enabled in `webapp/vite.config.ts`:

- `Cross-Origin-Embedder-Policy: require-corp`
- `Cross-Origin-Opener-Policy: same-origin`

### Production

Not yet enabled. `webapp/vercel.json` currently has routing config but no COOP/COEP headers.

## High-Level Architecture

### Before

`Rust ProgressUpdate -> serde_wasm_bindgen -> JS callback -> worker postMessage -> main thread -> React`

### After

`Rust lightweight progress snapshot -> worker-owned mailbox write -> UI polling read -> React`

Completion remains structured:

`Rust final result -> worker -> main thread -> structured parse/persist`

## Design Decisions

### 1. Use a shared latest-only mailbox for live progress

Use `SharedArrayBuffer` shared between main thread and solver worker.

The mailbox holds only scalar fields needed for live status cards and progress bars.

### 2. Keep final rich result delivery separate

The final solve result still returns through the existing structured response path.

### 3. Split live telemetry from heavy telemetry

Do **not** send heavy objects in the live mailbox:

- no `best_schedule`
- no schedule diffs
- no large nested telemetry objects

Those remain rare, explicit, and separate.

### 4. UI polling is authoritative for repaint cadence

The UI decides how often to repaint, e.g. every `50-100ms` or once per animation frame.

### 5. Solver-side callback should become lightweight

The hot path should avoid serializing the full `ProgressUpdate` object for every live progress emission.

## Detailed Implementation Plan

## Phase 0 — Preconditions and rollout guardrails

### 0.1 Confirm production COI rollout path

Add COOP/COEP headers in production hosting.

Likely update:
- `webapp/vercel.json`

Need to serve:
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

### 0.2 Add runtime capability detection

Expose whether the runtime can use mailbox polling:

- `crossOriginIsolated`
- `SharedArrayBuffer` availability
- worker mailbox initialization success

If unavailable, fail explicitly and surface the missing prerequisite.

### 0.3 Explicit unsupported-environment policy

Policy:

1. mailbox polling is the only supported live-progress transport
2. if SAB/COI prerequisites are missing, initialization/solve start errors explicitly
3. no automatic reversion to structured push progress

---

## Phase 1 — Define the mailbox contract

Create a clear shared-memory layout used by both main thread and worker.

### 1.1 Introduce a mailbox schema

Suggested file:
- `webapp/src/services/runtime/progressMailbox.ts`

Define:
- version
- buffer byte sizes
- header offsets
- numeric field offsets
- status/stop-reason enums

### 1.2 Mailbox contents

Keep live fields intentionally small.

Recommended fields:
- `sequence`
- `status` (`idle`, `running`, `completed`, `cancelled`, `failed`)
- `stop_reason_code`
- `iteration`
- `max_iterations`
- `elapsed_seconds`
- `current_score`
- `best_score`
- `no_improvement_count`
- `temperature`
- `cooling_progress`
- `current_constraint_penalty`
- `best_constraint_penalty`
- `current_repetition_penalty`
- `best_repetition_penalty`
- `current_balance_penalty`
- `best_balance_penalty`
- `swaps_tried`
- `swaps_accepted`
- `transfers_tried`
- `transfers_accepted`
- `clique_swaps_tried`
- `clique_swaps_accepted`
- `overall_acceptance_rate`
- `recent_acceptance_rate`
- `avg_time_per_iteration_ms`
- `effective_seed`
- `error_code` or error flag if needed

### 1.3 Consistency model

Use a **sequence-lock** pattern:

Writer:
1. increment sequence to odd
2. write fields
3. increment sequence to even

Reader:
1. read sequence
2. copy fields
3. re-read sequence
4. accept snapshot only if sequence is unchanged and even

This prevents torn reads without requiring atomics for every field.

---

## Phase 2 — Add worker/main-thread mailbox plumbing

### 2.1 Create mailbox instances on the main thread

Suggested touchpoints:
- `webapp/src/services/solverWorker.ts`
- `webapp/src/services/runtime/localWasmRuntime.ts`

Responsibilities:
- allocate `SharedArrayBuffer`
- create typed-array/DataView wrappers
- send mailbox handle to worker before solve start
- track the active mailbox for the current solve

### 2.2 Extend worker protocol

Suggested file:
- `webapp/src/services/solverWorker/protocol.ts`

Add protocol support for:
- initialize mailbox
- start solve using mailbox mode
- completion/error notifications without streaming progress payloads

### 2.3 Update worker implementation

Suggested file:
- `webapp/src/workers/solverWorker.ts`

Responsibilities:
- receive mailbox buffer from main thread
- create writer view over the shared buffer
- reset mailbox state at solve start
- mark running/completed/error/cancelled status
- stop posting `PROGRESS` messages in mailbox mode
- still post final solve success/error messages

---

## Phase 3 — Make the WASM hot path lightweight

This is the most important correctness/performance phase.

### 3.1 Introduce a lightweight progress snapshot callback path

Current problem:
- `backend/wasm/src/contract_runtime.rs` converts the full Rust `ProgressUpdate` using `serde_wasm_bindgen::to_value(...)`

That is still too expensive for the hot path.

### 3.2 Add a browser-specific lightweight callback surface

Likely files:
- `backend/wasm/src/contract_runtime.rs`
- `backend/wasm/src/contract_surface.rs`
- `backend/wasm/src/lib.rs`

Add a new solve entrypoint for mailbox mode that:
- still uses solver progress callbacks internally
- but maps each progress event into a **small scalar snapshot**
- writes those scalar values via a very lightweight JS callback interface

Two viable options:

#### Option A — JS callback with scalar arguments
Hot path callback passes primitive numbers/ints only.

Pros:
- simpler than wiring shared memory directly into wasm
- large win over full struct serialization

Cons:
- still crosses Rust -> JS per emitted progress event

#### Option B — JS callback writes directly into mailbox from worker
Rust callback emits only scalar args; worker callback writes shared buffer.

This is the recommended implementation because it minimizes changes while removing the queueing path.

### 3.3 Keep the structured `ProgressUpdate` path only for explicit non-live/debug uses

Do not route live progress through the old path.

Keep:
- `solve_with_progress` only where an explicitly structured/debug path is still needed

Add:
- mailbox-oriented live progress solve path

### 3.4 Scope the live snapshot fields

Do not attempt perfect parity with every `ProgressUpdate` field.

The mailbox should include only fields used by:
- `SolverStatusCard`
- progress bars
- headline solver metrics
- lightweight detailed metrics

Fields not suitable for hot live polling can remain completion-only.

---

## Phase 4 — Move the UI to polling

### 4.1 Introduce a polling loop for active solves

Suggested files:
- `webapp/src/services/runtime/localWasmRuntime.ts`
- `webapp/src/components/SolverPanel/utils/runSolverHelpers.ts`
- `webapp/src/store/slices/solverSlice.ts`

Behavior:
- when a solve starts in mailbox mode, store polling handles
- poll mailbox every `50-100ms` or on `requestAnimationFrame`
- only publish state if the mailbox sequence changed
- stop polling on completion/cancellation/error

### 4.2 Map mailbox snapshots into `SolverState`

Create a mapper similar to `mapProgressToSolverState`, but from mailbox snapshot instead of structured `RuntimeProgressUpdate`.

### 4.3 Keep elapsed time visually honest

Two-layer display model:
- solver-reported `elapsed_seconds` from the mailbox
- optional frontend local wall-clock interpolation while status is running

Display should never jump backwards.

Recommended rule:
- `display_elapsed = max(last_polled_elapsed, local_wall_clock_since_last_running_snapshot_floor)`

This smooths the timer even if a poll is skipped.

### 4.4 Preserve existing final-result handling

On solve completion:
- stop polling
- consume the structured final result
- persist result normally
- keep last mailbox snapshot available for UI continuity if desired

---

## Phase 5 — Heavy telemetry strategy

### 5.1 Remove heavy data from the live path

Do not put these in the mailbox:
- `best_schedule`
- nested move-policy objects
- large diagnostics payloads
- anything that must be JSON-parsed each frame

### 5.2 Handle live visualization separately

If live visualization remains supported:
- keep it opt-in
- keep it much less frequent than scalar progress
- ideally keep it on a separate explicit channel

### 5.3 Distinguish telemetry classes

Define three classes:

1. **hot live scalar telemetry** -> mailbox polling
2. **rare structured telemetry** -> explicit debounced messages
3. **final result payload** -> existing structured result path

---

## Phase 6 — Tests and verification

## 6.1 Unit tests

### Frontend mailbox tests
Likely files:
- `webapp/src/services/runtime/progressMailbox.test.ts`
- `webapp/src/services/solverWorker.test.ts`
- `webapp/src/workers/solverWorker.test.ts`

Cover:
- mailbox read/write layout
- sequence-lock consistency
- stale snapshot rejection
- running/completed/error status transitions
- explicit unsupported-environment errors when SAB/COI prerequisites are missing

### WASM/runtime tests
Likely files:
- `webapp/src/services/wasm/contracts.test.ts`
- `webapp/src/services/runtime/localWasmRuntime.test.ts`

Cover:
- mailbox-mode solve initialization
- no `PROGRESS` message spam in mailbox mode
- final result still returned correctly

## 6.2 Backend/WASM tests

Likely files:
- `backend/wasm/src/...` tests if present
- regression coverage around new lightweight callback path

Cover:
- lightweight snapshot callback receives correct scalar values
- stop reasons still propagate
- cancellation still works

## 6.3 Browser integration tests

Likely files:
- `webapp/src/MainApp.integration.test.tsx`
- Playwright smoke coverage

Cover:
- solver3 Sailing Trip run in mailbox mode
- elapsed time progresses smoothly
- no console errors
- scratchpad result still saves
- results history still displays run data

## 6.4 COI verification

Need explicit checks in dev/staging/prod:
- `window.crossOriginIsolated === true`
- `typeof SharedArrayBuffer !== 'undefined'`
- analytics still loads
- service worker still registers in production
- demo-data fetches still work
- no unexpected blocked subresources

---

## Phase 7 — Production rollout

### 7.1 Add production headers

Update:
- `webapp/vercel.json`

Add COOP/COEP headers for app pages and static assets as needed.

### 7.2 Stage and verify compatibility

Verify on preview deployment:
- app boot
- worker boot
- wasm load
- analytics
- service worker
- demo scenarios
- solver1 and solver3 live progress

### 7.3 Roll out behind a runtime flag first

Suggested pattern:
- feature flag or runtime capability gate for mailbox mode
- enable on preview first
- then enable by default in production

---

## Candidate File Touch List

### Frontend
- `webapp/vite.config.ts`
- `webapp/vercel.json`
- `webapp/src/services/solverWorker/protocol.ts`
- `webapp/src/services/solverWorker.ts`
- `webapp/src/workers/solverWorker.ts`
- `webapp/src/services/runtime/localWasmRuntime.ts`
- `webapp/src/services/runtime/types.ts`
- `webapp/src/components/SolverPanel/utils/runSolverHelpers.ts`
- `webapp/src/store/slices/solverSlice.ts`
- `webapp/src/MainApp.integration.test.tsx`
- new: `webapp/src/services/runtime/progressMailbox.ts`
- new: `webapp/src/services/runtime/progressMailbox.test.ts`

### Backend / WASM
- `backend/wasm/src/contract_runtime.rs`
- `backend/wasm/src/contract_surface.rs`
- `backend/wasm/src/lib.rs`
- possibly new browser-lightweight snapshot definitions in `backend/wasm/src/...`

## Acceptance Criteria

The work is complete when:

1. live solver progress uses mailbox polling in supported environments
2. main thread no longer receives per-progress `postMessage` payloads in mailbox mode
3. solver3 elapsed time visually tracks real wall clock closely on Sailing Trip
4. progress does not queue stale updates under UI slowdown
5. final result save/persistence still works
6. solver1 and solver3 both work through the same mailbox-capable runtime path
7. production COI is enabled and verified compatible with current webapp features
8. unsupported non-COI environments fail explicitly instead of silently switching transport paths

## Risks

### Risk: COI production surprises
Mitigation:
- preview deployment verification before prod enablement
- explicit environment checks and clear operator-facing errors

### Risk: mailbox layout bugs
Mitigation:
- explicit schema constants
- sequence-lock tests
- narrow field set initially

### Risk: trying to move too much data into the mailbox
Mitigation:
- keep mailbox scalar-only
- keep heavy telemetry separate

### Risk: partial improvement if full struct serialization remains on the hot path
Mitigation:
- implement the lightweight scalar callback path, not just polling after a full structured callback

## Recommended Execution Order

1. production COI rollout plan and explicit prerequisite checks
2. mailbox schema and frontend plumbing
3. worker mailbox transport
4. lightweight WASM scalar callback path
5. UI polling integration
6. live visualization/heavy telemetry separation
7. tests
8. staging/prod verification
