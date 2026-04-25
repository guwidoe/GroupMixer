# Autoresearch: solver3 construction heuristic broad-suite quality

## Objective
Improve the new `Solver3ConstructionMode::ConstraintScenarioOracleGuided` constructor for the full `solver3-constructor-broad` suite. The constructor is evaluated only by the **final score after construction plus normal solver3 search** using the benchmark runner's `solver3_construct_then_search` policy. Construction-only score is intentionally not an optimization target.

The current baseline behavior is:

1. build a baseline/constraint-scenario scaffold,
2. optionally generate and project a pure-contact oracle template,
3. merge into a feasible incumbent while owning hard-constraint validity,
4. run normal solver3 search from that incumbent for the remaining complexity-based wall time.

Runtime construction handoff is intentionally strict: constructors must return a hard-constraint-valid schedule or explicit validation error. `RuntimeState` validates shape/capacity/participation/cliques/immovable placements/`MustStayApart` and fails fast; it must not silently repair or rebuild invalid constructor output.

The broad suite is the canonical development workload for this autoresearch session:

```bash
GROUPMIXER_BENCHMARK_JOBS=4 cargo run -q -p gm-cli -- benchmark run \
  --manifest backend/benchmarking/suites/solver3-constructor-broad.yaml \
  --cargo-profile dev
```

Latest pre-autoresearch broad run after the scaffold fallback and 30% construction budget:

- Report: `backend/benchmarking/artifacts/runs/solver3-constructor-broad-20260424T205017Z-462bba2c/run-report.json`
- Result: `35 cases: 35 ok / 0 failed`

## Metrics
- **Primary**: `broad_relative_score` (unitless, lower is better) — weighted mean of each nonzero-baseline case's `final_score / baseline_final_score`, plus a small logarithmic guard penalty for zero-baseline regressions and a catastrophic failure penalty. This makes a large case improvement such as Sailing `4000 -> 2000` count as a real 50% improvement instead of being mostly hidden by logarithms. Fixed per-case baselines are baked into `autoresearch.sh` from the current best constructor line (`b5fa1752`, run `solver3-constructor-broad-20260424T211040Z-6000a6ee`).
- **Secondary normalized/safety/operability monitors**:
  - `relative_score_mean` — weighted relative mean before penalties.
  - `zero_regression_penalty` — normalized guard penalty from zero-baseline cases that regressed above zero.
  - `failure_count`
  - `zero_regression_count` — cases whose fixed baseline is zero but current final score is nonzero.
  - `runtime_seconds`
  - `construction_seconds_total`
- **Key final-score sentinels** tracked every run:
  - `score_sailing_real` — real Sailing workload / search-basin sentinel.
  - `score_sailing_flotilla_stress` — landing-page Sailing flotilla stress sentinel (132 sailors, 11 boats, 6 rotations, role balance, hard-apart pairs, fixed skipper anchors).
  - `score_synthetic_152p` — hardest partial-attendance/capacity-pressure stretch case.
  - `score_large_gender_immovable_110p` — large heterogeneous immovable-anchor case.
  - `score_transfer_attribute_111p` — large attribute-balance workload.
  - `score_google_cp` — mixed-constraint Google-CP-equivalent fixture.
  - `score_ui_demo` and `score_ui_demo_no_attr` — representative product-sized cases with/without attribute pressure.
  - `score_clique_swap_35p` — nontrivial clique/path constraint behavior.
  - `score_sgp_169x13x14` — large pure SGP oracle/exact-structure sentinel; should remain zero.
  - `score_sgp_32x8x20_constrained`, `score_sgp_49x7x8_constrained`, `score_sgp_169x13x14_constrained` — constrained SGP geometry/scaling sentinels.
  - `score_no_template_clique_immovable`, `score_no_template_constraint_heavy_partial`, `score_no_template_late_arrivals` — oracle-inapplicable feasible-case sentinels.

Raw aggregate/mean/max final score is intentionally not tracked because raw score scales are not comparable between benchmark cases. The full run report still contains every per-case score for deeper analysis.

Primary-metric details:
- Cases with nonzero fixed baselines contribute `score / baseline_score`.
- Key sentinel cases have weight `2`; other nonzero-baseline cases have weight `1`.
- Cases with zero fixed baseline are guards: staying at zero contributes nothing, but any nonzero score adds a small normalized `log1p(score)` penalty.
- Cases without a successful fixed baseline yet are tracked as key sentinels and contribute through the catastrophic failure penalty until a successful strict-budget baseline can be established.
- Failed cases add a catastrophic fixed penalty.

## How to Run
`./autoresearch.sh`

Root wrappers delegate to:
- `tools/autoresearch/solver3-construction/autoresearch.sh`
- `tools/autoresearch/solver3-construction/autoresearch.checks.sh`

The script runs the broad benchmark suite, parses the generated run report, and emits structured `METRIC name=value` lines. It writes benchmark artifacts outside the repo by default under `/tmp/groupmixer-autoresearch-solver3-construction` unless `GROUPMIXER_AUTORESEARCH_ARTIFACTS_DIR` is set.

## Files in Scope
Primary heuristic/code paths:

Primary research target:
- `backend/core/src/solver_support/construction/constraint_scenario_oracle/*.rs` — projection, merge, template generation, oracle backend, signal extraction, shared telemetry/types.
Only in exceptional cases and with very compelling reason:
- `backend/core/src/solver3/runtime_state.rs` — construction orchestration, warmup scaffold, and strict validation handoff only; no hidden runtime repair/rebuild layer.
- `backend/core/src/solver_support/construction/baseline/mod.rs` — baseline constructor behavior and fill order, if needed to implement oracle-guided baseline fill.
- `backend/core/src/solver_support/construction/freedom_aware/mod.rs` — reference only unless a small reusable idea is clearly beneficial.
- `backend/core/src/models.rs` — only for internal telemetry/config structure needed by the constructor; no user-facing knobs without explicit approval.


Benchmark/autoresearch support:

- `backend/benchmarking/src/runner.rs` — only for benchmark policy bugs/instrumentation, not to game the target.
- `backend/benchmarking/src/artifacts.rs` — only if additional telemetry is genuinely needed.
- `autoresearch.md`, `autoresearch.sh`, `autoresearch.checks.sh`, `autoresearch.ideas.md` — session documentation, benchmark script, checks, and backlog.

## Off Limits
- Do not edit benchmark case JSON files or suite membership to improve the metric.
- Do not simplify, proxy, warm-start, or substitute canonical benchmark cases.
- Do not add case-ID-specific logic or shape-specific hacks.
- Do not add user-facing projection/oracle policy knobs.
- Do not add hidden fallbacks that mask merge/repair bugs; if a path claims oracle applicability and then fails, keep the failure visible unless the scenario is structurally oracle-inapplicable and a named deterministic scaffold/baseline outcome is recorded.
- Do not change standalone solver6 away from pure-SGP semantics.
- Do not touch webapp, API, CLI UX, or unrelated docs.
- Do not optimize construction-only score at the expense of final construction+search score.

## Constraints
- Feasible scheduling scenarios must construct a valid incumbent; no failure solely because no oracle template exists.
- Preserve fixed/frozen/immovable semantics. Frozen placements may guide projection, but merge/repair must not move them.
- Hard constraints are hard: constructors must satisfy them or fail honestly; do not convert them into weighted soft penalties, and do not rely on hidden runtime repair.
- No benchmark cheating or overfitting.
- Maintain deterministic behavior for a fixed seed.
- Use targeted `rustfmt`, not broad `cargo fmt -p gm-core`.
- Checks in `autoresearch.checks.sh` must pass for a kept experiment.
- Existing unrelated Rust warnings are tolerated.

## What's Been Tried
- Built solver6 pure-SGP oracle and integrated it as a pure-contact prior for solver3 construction.
- Replaced the old repeat-blind CS ensemble source with baseline construction plus a short internal solver3 full-objective warmup scaffold.
- Split oracle construction into explicit phases under `solver_support/construction/constraint_scenario_oracle/`.
- Implemented capacity-ladder template generation, assignment-based projection, ranked capacity-aware merge, and later removed hidden runtime hard repair in favor of constructor-owned feasibility plus runtime validation.
- Fixed rigidity bug: CS rigidity is now a soft prior; hard scaffold mask is limited to immovable placements and active must-stay cliques.
- Fixed hard constraint semantics after construction.
- Made no-template cases feasible: when repeat pressure exists but no meaningful pure-contact template can be generated, the constructor returns the scaffold with outcome `ConstraintScenarioOnly` instead of erroring.
- Increased broad-suite construction budget fraction to 30%; this made the broad suite pass `35/35` after earlier 20% runs still had SGP construction-budget failures.
- Kept a 3x penalty on oracle template scaffold disruption: under the old log metric, broad log score improved from `103.92` to `101.93`, likely by preserving more search-friendly basins.
- Counted frozen placements as scaffold disruption when ranking oracle templates: old log metric improved further to `101.57`; this is the current fixed-baseline reference line for the new relative metric.
- Tried 5x scaffold-disruption penalty: discarded; too conservative and worse than 3x.
- Tried 2x and 2.5x scaffold-disruption penalties: discarded; sometimes improved Sailing/raw total but worsened old broad log aggregate through small/constrained-case regressions.
- Tried merge-side outside-region and keep-bonus tweaks: improved some large raw scores but failed the old log aggregate.
- Switched primary metric from `broad_log_score` to `broad_relative_score` because log scaling made large real-world improvements on nonzero-optimum cases too small.

Current suspected improvement direction:

**Important: larger heuristic changes are explicitly allowed and preferred.** Do not restrict the loop to microscopic scalar tuning. Scalar changes are acceptable only when they test a structural hypothesis. The highest-value experiments should change the generic constructor strategy while preserving the strict/no-cheating constraints below.

Preferred structural directions:

- Move from "template overwrite + repair" toward **oracle-guided baseline fill**:
  - place immovables first,
  - place active cliques,
  - use projected oracle groups as soft contact/cohort preferences,
  - fill remaining movable capacity using real objective marginal plus oracle agreement,
  - keep the output search-friendly rather than merely oracle-aligned.
- Learn from `BaselineLegacy` on Sailing-style cases: its strength is basin quality, not construction-only score.
- Add telemetry only when it improves diagnosis of final construction+search outcomes.
- Prefer multi-template/risk-aware selection, projection/merge redesign, and fill-order changes over more one-constant experiments.

## Current restore note — 2026-04-25

Root autoresearch files have been restored to this construction-heuristic lane from `autoresearch/solver3-construction-20260424`, and the recovered script/checks now live permanently under `tools/autoresearch/solver3-construction/`. The solver3 broad multiseed root state from `origin/master` was archived under `tools/autoresearch/archive/solver3-broad-quality-root-20260425/`.

Recent diagnostic construction-lane runs after master integration:

- Current HEAD `9c5361b9 fix(solver3): make oracle construction honor hard-apart` before adding the landing flotilla stress sentinel:
  - `35 cases: 35 ok / 0 failed`
  - `broad_relative_score = 1.179793654`
  - `relative_score_mean = 1.108467780`
  - `zero_regression_penalty = 0.071325874`
  - `failure_count = 0`
  - `zero_regression_count = 1`
  - run report: `/tmp/groupmixer-autoresearch-solver3-construction/runs/solver3-constructor-broad-20260425T005419Z-022b6d4b/run-report.json`
- Immediate pre-hard-apart parent `d9650927 chore(merge): integrate latest master updates`:
  - `broad_relative_score = 1.197170647`
  - `failure_count = 0`
  - `zero_regression_count = 1`
- Pre-master finalized construction branch `f4549664 feat(solver3): improve oracle-guided construction`:
  - `broad_relative_score = 1.059812452`
  - `failure_count = 0`
  - `zero_regression_count = 0`

Interpretation: the current hard-apart constructor-ownership commit did not cause the construction-lane regression; it slightly improved the post-merge parent. The remaining gap appears to come primarily from the master/search/runtime integration state. Current regressions to investigate generically, without case-ID hacks or benchmark changes: Google-CP equivalent, transfer attribute balance, large gender immovable, constrained 169x13x14 SGP, Sailing, and the zero-baseline `stretch.benchmark-very-large-constrained` guard.

## Landing flotilla stress sentinel — 2026-04-25

The broad suite now also includes `stretch.sailing-flotilla-stress-test`, copied from the landing-page `Sailing flotilla stress test` example without simplifying its 132 sailors, 11 boats, 6 sessions, role-balance targets, 48 hard-apart pairs, 11 fixed skipper anchors, or repeat-limit behavior. The case intentionally has no session-aware people, no session-aware group sizes, no session-specific constraints, and no soft constraints beyond attribute balance plus repeat-limit scoring.

Initial single-case construction-suite smoke on current code:

- Suite: `/tmp/sailing-flotilla-construction-suite.yaml`
- Report: `/tmp/groupmixer-sailing-flotilla-smoke/runs/sailing-flotilla-construction-smoke-20260425T040352Z-a2f172fb/run-report.json`
- Result: `0 ok / 1 failed`
- Failure: `construction phase exceeded budget: 14.201s elapsed > 9.000s budget`

Because this case has no successful strict-budget construction+search baseline yet, `autoresearch.sh` tracks `score_sailing_flotilla_stress` as an unweighted key sentinel and applies the normal catastrophic failure penalty while it fails. Once the constructor produces a successful strict-budget run, establish a fixed baseline score before using its final-score ratio in the primary metric.
