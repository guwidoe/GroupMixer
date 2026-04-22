# Autoresearch: solver6 runtime-quality frontier at 50 people

## Objective
Improve `solver6` on its current pure-SGP repeat-minimization frontier benchmark with the scope expanded to **20 weeks** and **up to 50 people**.

This loop should prefer changes that:
1. keep correctness intact,
2. preserve or improve solver6 result quality on the benchmark,
3. reduce benchmark runtime,
4. stay honest about unsupported behavior and lower-bound/report semantics.

The active benchmark is the existing `solver6_optimality_frontier` example and HTML report pipeline, now run with:
- `--week-cap 20`
- `--max-people 50`
- `--time-limit 2`
- `--max-iterations 2000`
- `--no-improvement 300`

The primary metric is a **quality-first lexicographic cost** emitted as `objective_cost`:
- catastrophic penalties for `error` / `unsupported` / `timeout`
- then linear-layer misses
- then linear gap sum
- then squared-layer misses / gap
- then total runtime

Lower is better. This means runtime wins are good, but not if they degrade benchmark quality.

## Metrics
- **Primary**: `objective_cost` (unitless, lower is better)
- **Secondary**:
  - `total_runtime_ms`
  - `eligible_week_runs`
  - `success_week_runs`
  - `timeout_runs`
  - `unsupported_runs`
  - `error_runs`
  - `linear_exact_count`
  - `linear_hit_count`
  - `linear_miss_count`
  - `linear_gap_sum`
  - `squared_hit_count`
  - `squared_miss_count`
  - `squared_gap_sum`
  - `search_scans`
  - `scan_time_ms`
  - `candidates_evaluated`
  - `exact_block_only_count`
  - `exact_block_only_runtime_ms`
  - `requested_tail_atom_count`
  - `requested_tail_atom_runtime_ms`
  - `heuristic_tail_count`
  - `heuristic_tail_runtime_ms`
  - `dominant_prefix_tail_count`
  - `dominant_prefix_tail_runtime_ms`
  - `solver5_exact_handoff_count`
  - `solver5_exact_handoff_runtime_ms`

## How to Run
- Benchmark: `./autoresearch.sh`
- Correctness checks: `./autoresearch.checks.sh`

`./autoresearch.sh` writes:
- `autoresearch.solver6.last_run_metrics.json`
- `autoresearch.solver6.last_run_report.html`

## Files in Scope
- `backend/core/src/solver6/**` — solver6 scoring, seeding, search, reporting, tests
- `backend/core/examples/solver6_optimality_frontier.rs` — benchmark entrypoint
- `tools/autoresearch/solver6-optimality/**` — report generation helpers / docs
- `backend/core/src/models.rs` — only if solver6 parameters/defaults need adjustment
- `backend/core/src/engines/mod.rs` — only if solver6 routing/default plumbing must change
- `autoresearch.md`
- `autoresearch.sh`
- `autoresearch.checks.sh`
- `autoresearch.config.json`
- `autoresearch.ideas.md`

## Off Limits
- Solver5 construction work unrelated to solver6 runtime-quality improvement
- Benchmark-shaped hidden fallbacks or special cases that only exist to game the report
- Changing the benchmark scope away from `week_cap=20` / `max_people=50`
- Regressing explicitness/honesty rules around pure-SGP-only support

## Constraints
- Keep `solver6` pure-SGP only.
- No hidden fallbacks.
- Determinism should remain stable for fixed solver seed.
- Correctness checks must pass before keeping a result.
- Prefer reusable structural/performance improvements over ad hoc benchmark hacks.
- Be especially suspicious of changes that make the report greener only by weakening semantics.

## What's Been Tried
### Established context before this loop
- `solver6` already has:
  - solver5 exact handoff,
  - exact-block relabeling seeds,
  - mixed-tail seed selection,
  - deterministic same-week best-improving hill climbing,
  - frontier reporting with detailed seed/search telemetry.
- Local-search neighborhood scans were already optimized significantly.
- The dominant remaining runtime cost is **seed construction**, especially greedy exact-block relabeling.
- Prior benchmark attribution on the smaller `max_people=32` scope showed most runtime came from zero-scan cases, i.e. seed synthesis rather than hill climbing.
- Current likely high-value lanes:
  1. incremental relabeling evaluation instead of rebuilding/rescoring full seeds for every person swap,
  2. caching/compressing exact-block composition state,
  3. better tail-specific improvements for weak sparse-tail cells,
  4. measurement/report honesty improvements that do not misclassify impossible regimes.

### Guidance for the next agent
- Start by understanding `backend/core/src/solver6/seed/relabeling.rs` and the reporting artifact metrics.
- Treat the benchmark as **quality-first, runtime-second**.
- If a change only improves runtime while worsening `linear_hit_count`, `linear_gap_sum`, or timeout behavior, it is probably a discard.
- If a change improves runtime while preserving quality exactly, that is a strong keep.
- If a change improves quality materially with a modest runtime cost, it may still be a keep because the primary metric is lexicographic.

### Landed improvements in this solver6 autoresearch loop
- Baseline for this target (`week_cap=20`, `max_people=50`) started at:
  - `objective_cost = 192188052267`
  - `total_runtime_ms = 5881867`
  - `linear_hit_count = 1452 / 1600`
  - `linear_gap_sum = 4392`
- Kept improvements so far:
  1. incremental exact-block relabeling evaluation instead of full seed rebuild/rescore per swap candidate
  2. early exit once greedy relabeling reaches the known linear optimum
  3. mixed-tail seed selection now breaks linear-score ties with explicit `squared_repeat_excess`
  4. requested-tail and heuristic-tail candidates reuse a shared greedy exact-block prefix seed
  5. reporting reuses existing seed/local-search telemetry instead of recomputing schedule summaries from scratch
- Current best kept state (after the wins above):
  - `objective_cost = 192182086549`
  - `total_runtime_ms = 114749`
  - `linear_hit_count = 1452 / 1600`
  - `linear_gap_sum = 4392`
  - `squared_gap_sum = 1943718`

### Recent negative results to avoid repeating blindly
- closed-form heuristic-tail candidate delta math was too small/noisy to beat the current best reliably
- collect-then-sort relabeling adjustment aggregation was materially worse than the prior small-vector merge path
- squared-aware tie-breaking inside local-search move selection improved squared metrics but lost one linear hit, so it is not acceptable under the current objective
