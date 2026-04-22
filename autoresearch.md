# Autoresearch: solver6 runtime-quality frontier at 100 people

## Objective
Improve `solver6` on its current pure-SGP repeat-minimization frontier benchmark with the scope expanded to **20 weeks** and **up to 100 people**.

This loop should prefer changes that:
1. keep correctness intact,
2. preserve or improve solver6 result quality on the benchmark,
3. reduce total solver runtime across the benchmark artifact,
4. stay honest about unsupported behavior and lower-bound/report semantics.

The active benchmark is the existing `solver6_optimality_frontier` example and HTML report pipeline, now run with:
- `--week-cap 20`
- `--max-people 100`
- `--jobs 4`
- `--time-limit 2`
- `--max-iterations 2000`
- `--no-improvement 300`

`--jobs 4` is a **benchmark-harness wall-clock optimization only**. The primary metric is still computed from the summed per-cell solver runtimes inside the artifact, not from outer elapsed time.

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
  - `not_run_runs`
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
  - `parallel_jobs`
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
- Changing the benchmark scope away from `week_cap=20` / `max_people=100` without explicitly re-initializing the target again
- Regressing explicitness/honesty rules around pure-SGP-only support

## Constraints
- Keep `solver6` pure-SGP only.
- No hidden fallbacks.
- Determinism should remain stable for fixed solver seed.
- Correctness checks must pass before keeping a result.
- Prefer reusable structural/performance improvements over ad hoc benchmark hacks.
- Be especially suspicious of changes that make the report greener only by weakening semantics.
- Treat benchmark parallelization as a harness concern, not solver-quality logic.

## What's Been Tried
### Established context before this 100-person loop
- `solver6` already has:
  - solver5 exact handoff,
  - exact-block relabeling seeds,
  - mixed-tail seed selection,
  - deterministic same-week best-improving hill climbing,
  - frontier reporting with detailed seed/search telemetry,
  - configurable benchmark parallelism via `--jobs`.
- The most successful recent optimization lane was cutting repeated work inside exact-block relabeling candidate evaluation.
- On the 50-person target, the current best quality-preserving line reached:
  - `objective_cost = 188450183987`
  - `total_runtime_ms = 71387`
  - `linear_hit_count = 1455 / 1600`
  - `linear_gap_sum = 4318`
  - `squared_gap_sum = 2025126`
- A prior one-off 100-person probe on the same solver line showed the larger workload is now runnable but still expensive:
  - `objective_cost = 9550238650903`
  - `total_runtime_ms = 1425503`
  - `eligible_week_runs = 2680`
  - `success_week_runs = 2243`
  - `timeout_runs = 87`
  - `linear_hit_count = 2243`
  - `linear_gap_sum = 49988`
  - `squared_gap_sum = 2609254`
  - `exact_block_only_runtime_ms = 554248`
  - `heuristic_tail_runtime_ms = 861835`
  - `scan_time_ms = 289295`
  - `candidates_evaluated = 91102548`
- That probe strongly suggests the 100-person bottlenecks are still dominated by exact-block relabeling and heuristic-tail work, with search scan cost also large enough to monitor closely.

### Guidance for the next agent
- Start by understanding:
  - `backend/core/src/solver6/seed/relabeling.rs`
  - `backend/core/src/solver6/seed/mixed.rs`
  - `backend/core/src/solver6/reporting.rs`
- Treat the benchmark as **quality-first, runtime-second**.
- If a change only improves runtime while worsening `linear_hit_count`, `linear_gap_sum`, timeout behavior, or unsupported/error counts, it is probably a discard.
- If a change improves runtime while preserving quality exactly, that is a strong keep.
- If a change improves quality materially with a modest runtime cost, it may still be a keep because the primary metric is lexicographic.
- Keep higher-level honest reductions in repeated relabeling work ahead of low-level memory-heavy caching; the latter has mostly regressed.

### Landed improvements worth preserving
- Incremental exact-block relabeling evaluation instead of full seed rebuild/rescore per swap candidate.
- Early exit once greedy relabeling reaches the known linear optimum.
- Mixed-tail seed selection now breaks linear-score ties with explicit `squared_repeat_excess`.
- Requested-tail and heuristic-tail candidates reuse a shared greedy exact-block prefix seed.
- Reporting reuses existing seed/local-search telemetry instead of recomputing schedule summaries from scratch.
- Dominant-prefix-tail relabeling is warm-started from the optimized prefix plan.
- Incremental exact-block relabeling now builds copy permutations copy-by-copy, which materially improved linear quality and must not be casually reverted.
- Dense reusable relabeling scratch space plus generation-stamped reuse were major runtime wins.
- Precomputed flat source-mate swap summaries are the current best exact-block relabeling hot-loop line.
- Benchmark harness parallelism (`--jobs`) is now available and should remain deterministic in artifact ordering.

### Current 100-person baseline and best keep in this loop
- Reinitialized 100-person baseline (`week_cap=20`, `max_people=100`, `jobs=4`) landed at:
  - `objective_cost = 10245058156845`
  - `total_runtime_ms = 1648445`
  - `timeout_runs = 94`
  - `linear_hit_count = 2243`
  - `linear_gap_sum = 50170`
- Current best keep on this 100-person lane:
  - `objective_cost = 9252939167415`
  - `total_runtime_ms = 1635015`
  - `timeout_runs = 84`
  - `linear_hit_count = 2243`
  - `linear_gap_sum = 49958`
- That keep fast-pathed same-week local-search swap evaluation with known-valid pair indexing and trusted score-delta lookups. The main win came from reducing timeout pressure under the 2s per-cell cap.

### Recent negative results to avoid repeating blindly
- Incremental per-apply relabeling score-delta bookkeeping inside dense scratch regressed sharply.
- Trusted fast write-side pair-state mutation clones were not worth it.
- Winner-reevaluation materialization deferral during relabeling scans regressed.
- Two-path dominant-prefix-tail preparation regressed.
- Full `PairUniverse` pair-index table caching regressed badly.
- Simple source-equivalence symmetry pruning did not pay off.
- Dropping `dominant_prefix_tail` whenever requested-tail exists lost benchmark quality.
- Final exact-block seed-packaging micro-optimizations have not been promising.
- Heuristic-tail candidate-scoring fast paths were not robust winners on the 100-person lane.
- Further search-loop validation elision beyond the landed same-week fast path did not beat the current best keep.
