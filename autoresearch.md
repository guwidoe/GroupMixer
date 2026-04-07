# Autoresearch: solver3 objective quality

## Objective
Improve `solver3` on the hard canonical objective bundle using **fixed-time objective quality** as the primary metric.

This lane is solver3-only. Fixed-iteration quality and raw-runtime probes are supporting diagnostics, not the keep/discard target.

## Metrics
- **Primary**: `objective_suite_weighted_normalized_score` (lower is better, scaled so baseline-like values are around `100` instead of `1.00`)
- **Secondary**:
  - `objective_fixed_iteration_weighted_normalized_score`
  - `solver3_raw_score_us`
  - `runtime_total_seconds`
  - `objective_suite_total_runtime_seconds`
  - validation mismatch counters

## How to Run
`./autoresearch.sh`

Root wrappers delegate to `tools/autoresearch/solver3-objective-quality/`.

## Persistent Metrics Logging
`autoresearch.jsonl` is tool-managed and currently persists only the primary metric reliably. To preserve secondary diagnostics and per-case scores across resets/reverts, append a structured entry to `autoresearch.metrics.jsonl` after every completed `run_experiment` + `log_experiment` cycle.

## Files in Scope
- `backend/core/src/solver3/**`
- `tools/autoresearch/solver3-objective-quality/**`
- `autoresearch.md`
- `autoresearch.sh`
- `autoresearch.checks.sh`
- `autoresearch.ideas.md`

## Off Limits
- `backend/core/src/solver1/**`
- `backend/core/src/solver2/**`
- shared construction / validation / benchmarking plumbing unless a blocking bug is discovered and the user confirms the fix direction
- benchmark case identity, seeds, budgets, and metric reference math during the loop
- weakening checks

## Constraints
- Primary signal is fixed-time objective quality on the explicit solver3 bundle
- Synthetic partial-attendance stress case is included in the solver3 primary bundle
- Use broad correctness checks even when expensive
- Do not proxy / simplify / tune away the benchmark question
- Search-policy tuning inside solver3 is allowed, but it is not the main goal

## What's Been Tried
- Cross-solver benchmark infrastructure, validation, and objective metric math are now in place.
- The remaining need is explicit solver3 orchestration over the shared harness.
- This setup makes the solver family explicit, keeps the benchmark contract fixed, and adds fixed-iteration + raw-runtime diagnostics for interpretation.
