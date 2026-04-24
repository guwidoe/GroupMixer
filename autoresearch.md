# Autoresearch: solver3 construction heuristic broad-suite quality

## Objective
Improve the new `Solver3ConstructionMode::ConstraintScenarioOracleGuided` constructor for the full `solver3-constructor-broad` suite. The constructor is evaluated only by the **final score after construction plus normal solver3 search** using the benchmark runner's `solver3_construct_then_search` policy. Construction-only score is intentionally not an optimization target.

The current baseline behavior is:

1. build a baseline/constraint-scenario scaffold,
2. optionally generate and project a pure-contact oracle template,
3. merge/repair into a feasible incumbent,
4. run normal solver3 search from that incumbent for the remaining complexity-based wall time.

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
- **Primary**: `broad_log_score` (unitless, lower is better) — sum over all benchmark cases of `ln(1 + final_score)` after construction+search, plus `1000` per failed case. This balances very small and very large cases without letting one giant raw score dominate the whole objective. Failures are catastrophic.
- **Secondary**:
  - `failure_count`
  - `total_final_score`
  - `mean_final_score`
  - `max_final_score`
  - `runtime_seconds`
  - `construction_seconds_total`
  - every individual final score as `final_score_<sanitized_case_id>`.

Individual scores are monitors, not the primary objective. Prefer changes that improve `broad_log_score` without introducing catastrophic regressions in important canonical cases.

## How to Run
`./autoresearch.sh`

The script runs the broad benchmark suite, parses the generated run report, and emits structured `METRIC name=value` lines. It writes benchmark artifacts outside the repo by default under `/tmp/groupmixer-autoresearch-solver3-construction` unless `GROUPMIXER_AUTORESEARCH_ARTIFACTS_DIR` is set.

## Files in Scope
Primary heuristic/code paths:

Primary research target:
- `backend/core/src/solver_support/construction/constraint_scenario_oracle/*.rs` — projection, merge, template generation, oracle backend, signal extraction, shared telemetry/types.
Only in exceptional cases and with very compelling reason:
- `backend/core/src/solver3/runtime_state.rs` — construction orchestration, warmup scaffold, hard repair handoff.
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
- Hard constraints are hard: repair or fail honestly; do not convert them into weighted soft penalties.
- No benchmark cheating or overfitting.
- Maintain deterministic behavior for a fixed seed.
- Use targeted `rustfmt`, not broad `cargo fmt -p gm-core`.
- Checks in `autoresearch.checks.sh` must pass for a kept experiment.
- Existing unrelated Rust warnings are tolerated.

## What's Been Tried
- Built solver6 pure-SGP oracle and integrated it as a pure-contact prior for solver3 construction.
- Replaced the old repeat-blind CS ensemble source with baseline construction plus a short internal solver3 full-objective warmup scaffold.
- Split oracle construction into explicit phases under `solver_support/construction/constraint_scenario_oracle/`.
- Implemented capacity-ladder template generation, assignment-based projection, ranked capacity-aware merge, and local hard repair.
- Fixed rigidity bug: CS rigidity is now a soft prior; hard scaffold mask is limited to immovable placements and active must-stay cliques.
- Fixed hard constraint semantics after construction.
- Made no-template cases feasible: when repeat pressure exists but no meaningful pure-contact template can be generated, the constructor returns the scaffold with outcome `ConstraintScenarioOnly` instead of erroring.
- Increased broad-suite construction budget fraction to 30%; this made the broad suite pass `35/35` after earlier 20% runs still had SGP construction-budget failures.
- Kept a 3x penalty on oracle template scaffold disruption: broad log score improved from `103.92` to `101.93`, likely by preserving more search-friendly basins.
- Tried 5x scaffold-disruption penalty: discarded; too conservative and worse than 3x.
- Tried 2x scaffold-disruption penalty: discarded; improved Sailing/raw total but worsened broad log aggregate through small/constrained-case regressions.

Current suspected improvement direction:

- Move from "template overwrite + repair" toward **oracle-guided baseline fill**:
  - place immovables first,
  - place active cliques,
  - use projected oracle groups as soft contact/cohort preferences,
  - fill remaining movable capacity using real objective marginal plus oracle agreement,
  - keep the output search-friendly rather than merely oracle-aligned.
- Learn from `BaselineLegacy` on Sailing-style cases: its strength is basin quality, not construction-only score.
- Add telemetry only when it improves diagnosis of final construction+search outcomes.
