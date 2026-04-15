# Autoresearch: solver4 32x8x10 quality

## Objective
Improve `solver4`'s performance on the pure Social Golfer `32x8x10` workload under a roughly five-minute experiment budget.

The target scenario is the canonical pure zero-repeat Social Golfer case:
- 32 participants
- 8 groups of 4
- 10 sessions
- objective: maximize unique contacts
- hard semantic target: meet at most once per pair (`RepeatEncounter.max_allowed_encounters = 1`)

`solver4` is intentionally narrow. This loop should improve the dedicated pure-SGP algorithm itself, not broaden it into a general-purpose GroupMixer solver.

The benchmark lane for this loop is a `gamma=0` multiseed sweep on the canonical `32x8x10` case with 4 seeds at 60 seconds each (about 4 minutes of search plus compile / orchestration overhead, so about 5 minutes per experiment end-to-end).

## Metrics
- **Primary**: `mean_final_score` (lower is better) — average canonical final score across 4 fixed `32x8x10` seeds at 60s each.
- **Secondary**:
  - `best_final_score`
  - `worst_final_score`
  - `mean_unique_contacts`
  - `best_unique_contacts`
  - `worst_unique_contacts`
  - `solved_runs`
  - `mean_best_conflict_positions`
  - `best_best_conflict_positions`
  - `runtime_total_seconds`
  - per-seed final score / contacts / best-conflict-position metrics

## How to Run
`./autoresearch.sh`

The script:
1. builds `gm-cli` in release mode
2. runs the dedicated solver4 `32x8x10` multiseed suite
3. parses the run report
4. emits structured `METRIC name=value` lines
5. writes `autoresearch.last_run_metrics.json`

## Files in Scope
- `backend/core/src/solver4/**` — solver4 implementation, docs, and solver4-local tests
- `backend/core/src/models.rs` — only when required for solver4 params / telemetry / surface changes
- `tools/autoresearch/solver4-8x4x10/**` — experiment harness for this lane
- `autoresearch.md`
- `autoresearch.sh`
- `autoresearch.checks.sh`
- `autoresearch.config.json` (if needed)
- `autoresearch.ideas.md`

## Off Limits
- benchmark case definitions in `backend/benchmarking/cases/**`
- benchmark seeds, identities, or budgets for this lane
- other solver families (`solver1`, `solver2`, `solver3`) unless strictly required for compile fixes
- webapp files
- changing the benchmark question to an easier proxy
- weakening or removing correctness checks
- broad repo rewrites unrelated to solver4 heuristic quality

## Constraints
- Keep `solver4` a pure-SGP solver; do not add silent fallback or broaden its accepted scenario family.
- Public `SolverResult` scoring must remain canonical repo scoring.
- The benchmark question is fixed: canonical `32x8x10`, 4 seeds, `gamma=0`, 60s each.
- Primary metric wins decide keep/discard.
- Do not cheat by changing benchmark manifests, seeds, time budgets, scoring weights, or case semantics.
- Maintain correctness guardrails via `autoresearch.checks.sh`.
- Prefer structural search improvements over benchmark-specific hacks.
- If a promising direction is too large for the current iteration, record it in `autoresearch.ideas.md`.

## Current Baseline
The historical `32x8x10` / `32x8x9` benchmark cases were corrected from the misconfigured `RepeatEncounter.max_allowed_encounters = 0` encoding to the intended meet-at-most-once encoding `= 1`.

The next run after that correction becomes the new honest baseline for this autoresearch lane.

## What's Been Tried
- The stronger practical branch currently comes from restoring the pre-regression heuristic shape associated with commit `05ed8b7`, plus compatibility fixes for newer trace fields.
- A more paper-literal branch regressed practical `8x4x9` / `8x4x10` performance after introducing pairwise-even-`p` construction, thesis-style GRASP orchestration, and best-so-far breakout resets.
- The regressed branch changed the meaning of repo gamma lanes and performed worse under rebuilt release validation; it is not the current baseline.
- Longer runtime alone does not currently rescue `32x8x10`; the best known seed plateaued at the same result after 300 seconds.
- `32x8x9` is now strong, so the next value is likely in the `32x8x10` search basin itself: initialization diversity, neighborhood power, plateau escape behavior, or conflict-concentration handling.
- The main research question is not scoring/reporting anymore; it is solver4 heuristic quality on `32x8x10`.
- Avoid reintroducing the thesis-GRASP portfolio adaptation unless there is fresh evidence it helps under this fixed repo-facing lane.

## Immediate Research Directions
- stronger but still honest diversification in the greedy initializer
- better plateau escape / breakout behavior that specifically helps `32x8x10`
- conflict-aware move ordering or neighborhood expansion that preserves `32x8x9`
- targeted handling of concentrated high-conflict weeks near the current plateau
- multi-start or restart ideas only if they preserve the fixed benchmark semantics and genuinely improve the 4-seed mean
