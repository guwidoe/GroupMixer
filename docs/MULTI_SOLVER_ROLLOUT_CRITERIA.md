# Multi-solver rollout criteria

This document defines the minimum verification bar before a non-legacy solver family becomes user-selectable in product-facing flows.

Until these criteria are met, the legacy solver remains the default/reference implementation.

## Comparison categories

Use explicit comparison categories instead of pretending every solver must match on every dimension.

### `exact_parity`
Use when the compared surface must be identical.

Examples:
- deterministic helper transforms
- canonical serialization/projection layers
- intentionally locked fixture outputs

Expected evidence:
- exact shared result match
- no hidden fallback
- same declared solver family

### `bounded_parity`
Use when small numeric drift is acceptable but the semantic contract must stay tightly aligned.

Examples:
- alternate implementations of the same scoring logic
- staged rewrites that should remain within a declared score delta

Expected evidence:
- shared invariants hold
- hard-constraint behavior matches
- drift bound is declared per fixture/suite

### `invariant_only`
Use when implementations may differ materially but must still satisfy the same safety contract.

Examples:
- early-stage alternative engines
- path-focused regression scenarios

Expected evidence:
- valid schedules
- no duplicate assignments
- required hard constraints respected when the solver claims support
- explicit failure for unsupported modes

### `score_quality`
Use when the main question is solution quality rather than exact behavior.

Examples:
- representative solve-level suites
- rollout candidate comparisons against legacy quality baselines

Expected evidence:
- shared invariants hold
- score deltas are visible and reviewable
- regressions are explicitly accepted or rejected

### `performance_only`
Use when the lane is intentionally about runtime/kernel throughput and not semantic equivalence.

Examples:
- hotpath preview/apply micro-forensics
- implementation-specific kernels

Expected evidence:
- solver family identity is recorded
- benchmark mode is explicit
- same-machine interpretation policy is followed

## Required verification before enabling a new solver in UI flows

A new solver family must not be exposed in normal product flows until all of the following are true.

### 1. Contract and discovery readiness
- solver family appears in the public solver catalog
- descriptor/capability metadata is truthful
- unsupported features fail explicitly
- saved/imported configs either migrate cleanly or fail with guidance

### 2. Fixture and invariant readiness
- solver-aware fixtures exist for the new family
- at least one cross-solver fixture exists for each supported comparison category used by the rollout
- property/invariant coverage runs through the solver-family registry, not only legacy internals

### 3. Benchmark readiness
- solve-level benchmark artifacts record solver family and comparison category
- representative suites exist for the new solver family
- same-machine benchmark evidence is available for the intended runtime path
- hotpath lanes are only required where the engine actually exposes comparable internals

### 4. UX/runtime readiness
- webapp renders solver-specific settings from metadata
- unsupported capabilities are surfaced explicitly in UI flows
- browser runtime behavior is acceptable for the intended scenarios
- no silent fallback occurs when the selected solver cannot run

### 5. Rollout review bar
- parity category for each rollout suite is declared up front
- benchmark visibility exists for quality and runtime tradeoffs
- persistence/import behavior is verified
- contributor docs are updated for the new solver family
- an explicit human decision records why the solver is ready for exposure

## Suggested rollout stages

### Stage 0 — hidden / implementation only
- solver can exist in core/benchmark/test surfaces
- not user-selectable in normal UI flows
- failures are acceptable if explicit and documented

### Stage 1 — internal comparison mode
- solver is selectable only in developer/test surfaces
- parity/benchmark dashboards and fixtures are active
- unsupported modes are still allowed if explicit

### Stage 2 — limited product exposure
- solver is user-selectable behind an explicit flag
- representative quality/runtime evidence is current
- persistence/import paths are proven

### Stage 3 — general availability candidate
- rollout criteria above remain green
- benchmark evidence is refreshed on the current code line
- there is a clear default/non-default policy
- user-facing docs describe capability differences honestly
