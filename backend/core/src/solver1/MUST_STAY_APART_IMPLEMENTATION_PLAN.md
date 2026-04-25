# Solver1 MustStayApart implementation plan

## Goal

Add `Constraint::MustStayApart` to `solver1` as a **real hard constraint** while preserving `solver1`'s current performance profile as much as possible.

The implementation must be:

- **truthful**: no fake hard-constraint behavior via giant soft penalties
- **hotpath-aware**: no unnecessary O(all_constraints) scans in move preview/apply paths
- **explicit**: clear split between soft-apart (`ShouldNotBeTogether`) and hard-apart (`MustStayApart`)
- **oracle-friendly**: expensive semantic invariant validation belongs in an opt-in compile-time oracle/debug lane, not the default build

---

## Non-negotiable requirements

### R1. MustStayApart is hard, not soft
`MustStayApart` must be enforced by:

- preprocess-time contradiction checks
- constructor-time placement checks
- move-feasibility checks

It must **not** be implemented as a weighted penalty surface.

### R2. No wasted default-clock validation
Default `solver1` runtime behavior must **not** add full semantic invariant scans for hard constraints on every move or every iteration.

If we add semantic validation for hard constraints, it must live behind a **compile-time oracle/debug feature**, analogous in spirit to solver3's oracle/check lanes.

### R3. Per-move keep-apart validation may be necessary
Whether `MustStayApart` needs explicit per-move feasibility checks depends on the final state representation and what can be precomputed safely.

The real requirement is:

- no invalid state may be reachable from a valid starting state
- preserve performance as much as possible
- avoid global constraint scans in hot paths

Decision rule:

1. precompute as much as possible
2. if precomputation alone is insufficient to guarantee preservation across all move families, add local per-move feasibility checks
3. if per-move checks are needed, keep them **local and bounded**, similar to solver3:
   - check only the moved people / moved block
   - check only the touched destination/source groups
   - use precomputed adjacency, not global constraint scans

### R4. Preserve the SA driver contract
`solver1/search/simulated_annealing.rs` should continue to assume:

- move kernels define feasibility
- infeasible move previews return quickly
- the SA loop itself stays generic and cheap

Do not move hard-apart semantics into the search driver.

---

## Current solver1 state

## What already exists

### Public contract
`Constraint::MustStayApart` already exists in `backend/core/src/models.rs`.

### Shared schedule validation
`backend/core/src/solver_support/validation.rs` already:

- expands multi-person `MustStayApart` constraints pairwise
- respects session scoping
- respects partial attendance
- rejects warm starts that place hard-apart pairs together

### Shared construction helpers
`backend/core/src/solver_support/construction.rs` already has:

- `hard_apart_partners_by_person_session`
- `group_has_hard_apart_conflict(...)`
- `block_has_hard_apart_conflict(...)`

The baseline and freedom-aware constructors already know how to use these helpers.

### Solver3 reference implementation
Solver3 already has the correct broad shape:

- compiled hard-apart pairs
- adjacency indexed by person
- constructor integration
- move-feasibility integration for swap / transfer / clique-swap
- raw-only diagnostic tracking
- focused tests

This is the canonical reference for semantics and hotpath posture.

## What is still missing in solver1

### No dedicated hard-apart state
Solver1 currently has only soft-apart state (`soft_apart_*`) after the prep rename.

### Constructor wiring gap
In `backend/core/src/solver1/construction.rs`, `State::new()` currently passes an **empty** hard-apart adjacency table into the shared constructor context.

So shared construction supports hard-apart, but solver1 does not actually feed it the data.

### Move-feasibility gap
Current solver1 move kernels do not reject moves that create `MustStayApart` violations.

### Diagnostic gap
`backend/core/src/solver1/validation.rs` currently checks:

- score drift
- duplicate assignments

It does not provide hard-constraint semantic validation. That is fine for production default, but we need an oracle/debug-only semantic lane for diagnosis.

---

## Performance design

## Core implementation strategy

Use a **dense per-person per-session adjacency representation** for hard-apart, then do **small local group checks** in move feasibility.

### Recommended state additions
Add the following fields to `backend/core/src/solver1/mod.rs`:

- `hard_apart_pairs: Vec<(usize, usize)>`
- `hard_apart_pair_sessions: Vec<Option<Vec<usize>>>`
- `hard_apart_pair_violations: Vec<i32>`
- `hard_apart_partners_by_person_session: Vec<Vec<usize>>`

Where:

- flat slot = `session_idx * people_count + person_idx`
- each partner list is sorted + deduped once during preprocess

## Why two representations are needed

### Hotpath representation
Use `hard_apart_partners_by_person_session` for:

- swap feasibility
- transfer feasibility
- clique-swap feasibility
- construction placement checks

### Diagnostic / recompute representation
Use `hard_apart_pairs` + `hard_apart_pair_sessions` + `hard_apart_pair_violations` for:

- recompute logic
- reporting
- oracle/debug-only semantic validation
- tests

This split keeps runtime feasibility cheap without giving up observability.

## Hotpath conflict-check shape
Preferred helper style:

- `hard_apart_partners(day, person_idx) -> &[usize]`
- `group_has_hard_apart_conflict(day, person_idx, members) -> bool`
- `block_has_hard_apart_conflict(day, moved_block, group_members) -> bool`

Implementation expectation:

- iterate the touched group members
- probe the moved person's sorted partner list
- do not iterate all hard-apart constraints

If partner lists remain sorted, either of these is acceptable:

- `binary_search` on the partner slice for each touched member
- small two-pointer scans if later benchmark evidence justifies it

Default implementation target: **simple + bounded + benchmark-friendly**.

---

## Detailed plan

## Phase 1 — Add canonical hard-apart preprocessing to solver1

### Files
- `backend/core/src/solver1/mod.rs`
- `backend/core/src/solver1/construction.rs`

### Tasks
1. Add dedicated hard-apart fields to `State`
2. In `_preprocess_and_validate_constraints()`:
   - parse `Constraint::MustStayApart`
   - expand multi-person constraints pairwise
   - normalize session lists to sorted/deduped `Vec<usize>`
   - reject unknown people
   - reject conflicts with `MustStayTogether` in overlapping active sessions
3. Build `hard_apart_partners_by_person_session`
4. Initialize `hard_apart_pair_violations`

### Semantics to match
Match the shared-validator / solver3 behavior:

- pairwise expansion of `people: [a, b, c]` into `(a,b)`, `(a,c)`, `(b,c)`
- session scoping respected exactly
- partial attendance respected at evaluation time
- contradiction with cliques rejected explicitly

### Performance notes
- all session normalization and dedupe work happens once at preprocess time
- no global overlap reasoning in move preview paths

---

## Phase 2 — Wire hard-apart into constructor and seed flows

### Files
- `backend/core/src/solver1/construction.rs`
- `backend/core/src/solver_support/construction.rs`

### Tasks
1. In `State::new()`, stop passing an empty hard-apart table into `BaselineConstructionContext`
2. Pass the real `hard_apart_partners_by_person_session`
3. In shared construction helpers, update immovable placement to also reject hard-apart conflicts
4. Audit both constructor paths:
   - `apply_baseline_construction_heuristic(...)`
   - `apply_freedom_aware_construction_heuristic(...)`

### Important hidden gap to close
Shared construction currently checks hard-apart for:

- clique placement
- ordinary person placement

but **not** for immovable placement.

That gap must be fixed or constructor correctness remains incomplete.

### Seed policy
For solver1, prefer **explicit failure** over hidden normalization for invalid seeded hard constraints unless a narrow, honest normalization strategy proves necessary.

Recommended default policy:

- `initial_schedule`: already validated as a complete incumbent; keep strict validation
- `construction_seed_schedule`: allow partial seeds, but fail clearly if the fixed seeded structure makes hard constraints impossible to satisfy during completion

Do not silently weaken `MustStayApart`.

---

## Phase 3 — Add move-level preservation checks if the chosen representation requires them

### Files
- `backend/core/src/solver1/moves/swap.rs`
- `backend/core/src/solver1/moves/transfer.rs`
- `backend/core/src/solver1/moves/clique_swap.rs`

## 3A. Swap

### Goal
If the chosen representation cannot guarantee swap safety structurally, reject swaps that would place either moved person into a group containing an active hard-apart partner.

### Shape
Before expensive delta work:

- check `p1 -> g2` excluding `p2`
- check `p2 -> g1` excluding `p1`

If conflict:

- return `f64::INFINITY`

### Why here
This keeps infeasible moves out of the expensive scoring path and preserves the current SA contract.

## 3B. Transfer

### Goal
If the chosen representation cannot guarantee transfer safety structurally, reject transfers whose target group contains an active hard-apart partner.

### Shape
Extend `is_transfer_feasible()` so it also checks:

- hard-apart adjacency of the moving person against target-group members

Then let `calculate_transfer_cost_delta()` rely on feasibility.

### Why here
Transfer already has a dedicated feasibility function; this is the cheapest place to integrate the new hard constraint.

## 3C. Clique swap

### Goal
If the chosen representation cannot guarantee clique-swap safety structurally, reject clique swaps when:

- moved clique members conflict with target-side remaining people
- swapped-out target people conflict with source-side remaining people

### Shape
Use only:

- `active_members`
- `source_remaining`
- `target_remaining`

Do **not** scan all hard-apart constraints.

### Why this matters
Clique swap is the easiest place to accidentally add a hidden O(all_constraints) regression. Keep the check restricted to the two touched groups and the moved block.

---

## Phase 4 — Add raw-only recompute and oracle-lane validation

### Files
- `backend/core/src/solver1/scoring/mod.rs`
- `backend/core/src/solver1/mod.rs`
- `backend/core/src/solver1/display.rs`
- `backend/core/src/solver1/validation.rs`

## 4A. Raw-only violation accounting
Track `hard_apart_pair_violations` in recompute logic.

Policy should mirror solver3:

- contributes to raw/integer constraint counts
- does **not** add weighted cost
- valid states should keep this at zero because move feasibility preserves the invariant

## 4B. Default build behavior
Do **not** add unconditional full semantic hard-constraint scans to default production paths.

That means:

- no always-on per-move hard-apart recompute checks
- no always-on semantic invariant scans in the SA loop
- no extra wasted clock cycles in the normal release path

## 4C. Oracle/debug compile-time lane
Add a compile-time feature / oracle lane for semantic validation, analogous in spirit to solver3's oracle-gated verification posture.

In that lane, add a dedicated semantic check such as:

- validate no hard-apart pair is colocated in an active session
- validate no clique is split
- validate immovable assignments are honored

This lane should be used for:

- debugging
- regression triage
- cache drift / semantic drift detection when desired

But it must remain **opt-in**, not default.

## 4D. Reporting
Update `display.rs` so score breakdown / debug output can report hard-apart raw violations clearly when present.

This is diagnostic value, not a scoring surface.

---

## Phase 5 — Strengthen tests

### Files
- `backend/core/src/solver1/tests.rs`
- `backend/core/tests/move_swap_regression.rs`
- `backend/core/tests/move_transfer_regression.rs`
- `backend/core/tests/move_clique_swap_regression.rs`
- `backend/core/tests/schedule_validation_regression.rs`
- optional data-driven fixture(s)

### Required coverage

## Preprocess / state tests
- pairwise expansion from 3+ people
- session-specific hard-apart
- conflict with `MustStayTogether`
- soft-apart / hard-apart naming separation stays clear

## Construction tests
- fresh construction respects hard-apart
- immovable + hard-apart interactions are handled explicitly
- partial attendance respected
- seeded/partial-seeded behavior matches chosen explicit policy

## Move tests
- swap preview rejects hard-apart conflicts
- transfer feasibility rejects hard-apart conflicts
- clique-swap feasibility rejects hard-apart conflicts

## Recompute / oracle tests
- raw hard-apart violations are tracked correctly
- compile-time oracle lane catches semantic violations clearly
- cached and recomputed state agree where expected

## Cross-surface tests
- schedule validation parity with shared validator
- at least one data-driven / fixture-style end-to-end case that exercises active MustStayApart semantics in solver1

---

## Benchmark and verification plan

Benchmarks should be run **when functional implementation starts**, not for this plan-only step.

## Before/after benchmark bundle
Because this feature touches solver1 hotpaths, benchmark before and after implementation.

### Required lanes
- same-machine representative solver1 suite
- move/hotpath lane if available
- cases with cliques + immovables + soft-apart interactions
- at least one case with active `MustStayApart` stress

### Key metrics to watch
- swap preview cost
- transfer feasibility cost
- clique-swap feasibility cost
- constructor overhead
- whole-solver runtime / quality on representative cases

## Success criteria
- no O(all_constraints) regression introduced into steady-state move preview
- swap preview remains bounded to the touched groups + moved endpoints
- transfer and clique-swap remain local-feasibility checks
- constructor overhead may rise somewhat, but not pathologically

---

## Recommended execution order

1. Add hard-apart state + preprocess
2. Wire constructor + fix immovable placement gap
3. Add swap feasibility checks
4. Add transfer feasibility checks
5. Add clique-swap feasibility checks
6. Add raw recompute + reporting
7. Add compile-time oracle semantic validation lane
8. Add and stabilize tests
9. Run before/after benchmarks

This order minimizes time spent in broken intermediate states and keeps hotpath risk localized.

---

## Things to avoid

### A. Do not implement MustStayApart as a giant penalty
That is fake correctness and worsens runtime behavior.

### B. Do not add global scans in move preview paths
No scans over all hard-apart constraints inside swap/transfer/clique-swap preview.

### C. Do not add always-on semantic invariant scans in production
Hard-constraint semantic validation belongs in an oracle/debug compile-time lane, not default runtime.

### D. Do not overload soft-apart state
Keep `soft_apart_*` and `hard_apart_*` separate to avoid ambiguity and bugs.

---

## Related todos

- `TODO-081522ff` — EPIC: Add MustStayApart hard constraint to solver1 with hotpath-safe enforcement
- `TODO-1603085d` — Add dense hard-apart state and preprocessing to solver1
- `TODO-8bbbf03a` — Wire MustStayApart through solver1 construction, seed handling, and immovable placement
- `TODO-31a7a9dc` — Enforce MustStayApart in solver1 swap/transfer/clique-swap feasibility without hotpath scans
- `TODO-39e9f354` — Add raw hard-apart diagnostics, invariants, and solver1 regression coverage
- `TODO-78514764` — Benchmark solver1 MustStayApart implementation against representative and hotpath lanes

---

## Final implementation stance

The correct solver1 design is:

- **precompute as much as possible**
- **only add local per-move preservation checks if the chosen representation requires them**
- **keep default runtime lean**
- **push expensive semantic validation into an opt-in oracle/debug compile-time lane**

That gives us truthful `MustStayApart` semantics without wasting clock cycles in normal solver1 execution.
