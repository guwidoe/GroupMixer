# Autoresearch: solver3 objective quality

## Objective
Improve `solver3` on the canonical hard objective bundle using **fixed-time objective quality** as the primary metric, while keeping correctness guardrails honest and tracking fixed-iteration + raw-runtime diagnostics.

This lane is explicitly **solver3-only**. It exists to improve solver3 internals and search behavior without changing the benchmark question.

## Metrics
- **Primary**: `objective_suite_weighted_normalized_score` (unitless, lower is better) — `100 ×` the arithmetic mean of the six per-case normalized final scores on the solver3 fixed-time canonical bundle
- **Secondary**:
  - `objective_fixed_iteration_weighted_normalized_score`
  - `solver3_raw_score_us`
  - `runtime_total_seconds`
  - `objective_suite_total_runtime_seconds`
  - `objective_suite_external_validation_failures`
  - `objective_suite_total_score_mismatches`
  - `objective_suite_score_breakdown_mismatches`

## How to Run
`./autoresearch.sh`

The root wrapper delegates to `tools/autoresearch/solver3-objective-quality/autoresearch.sh`.

## Files in Scope
- `backend/core/src/solver3/**` — solver3 runtime, search, scoring, move logic, and policy internals
- `tools/autoresearch/solver3-objective-quality/**` — orchestration and explicit metric configuration for this lane
- `autoresearch.md` / `autoresearch.sh` / `autoresearch.checks.sh` — root wrappers and experiment context
- `autoresearch.ideas.md` — deferred ideas backlog

## Off Limits
- `backend/core/src/solver1/**`
- `backend/core/src/solver2/**`
- shared construction / validation / benchmarking plumbing unless a blocking bug is discovered and the user explicitly confirms the fix path
- benchmark case manifests, canonical suite budgets/seeds, and metric formulas/reference baselines during the optimization loop
- weakening or skipping checks

## Constraints
- Solver3 only: the loop is not allowed to improve solver1/solver2
- Primary signal is fixed-time objective quality, not raw runtime
- Fixed-iteration quality and raw-runtime metrics are diagnostic only
- Keep heavy validation: correctness matters more than iteration speed
- Fail honestly on canonical cases; do not proxy, simplify, or substitute workloads
- No benchmark cheating via budget, seed, case-identity, or metric-config changes

## Canonical fixed-time objective bundle
- `adversarial.clique-swap-functionality-35p`
- `adversarial.transfer-attribute-balance-111p`
- `stretch.social-golfer-32x8x10`
- `stretch.large-gender-immovable-110p`
- `stretch.sailing-trip-demo-real`
- `stretch.synthetic-partial-attendance-capacity-pressure-152p`

## Diagnostic companions
- fixed-iteration bundle on the same six cases
- solver3 raw runtime / hotpath diagnostic lane
- solver3 correctness benchmark corpus with external validation

## What's Been Tried
- The repo now has cross-solver benchmark truthfulness, dual validation, explicit objective-metric math, and strict schedule-ingestion semantics.
- The old objective lane was too solver1-default-ish for direct solver3 autoresearch orchestration; this lane fixes that by retargeting the same shared benchmark harness explicitly to solver3.
- The synthetic partial-attendance capacity-pressure benchmark was intentionally promoted into the solver3 objective autoresearch portfolio because it exercises a real feature gap: heavy partial attendance plus strongly session-specific capacities.
- Search-policy tuning inside solver3 is allowed, but benchmark contract changes are not.
- Shared plumbing bugs should stop the loop and be escalated to the user instead of being fixed opportunistically inside this lane.
