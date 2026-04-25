# Autoresearch: solver3 constraint-aware oracle relabeling

## Objective

Make `Solver3ConstructionMode::ConstraintScenarioOracleGuided` much smarter at interpreting a pure-SGP oracle schedule under hidden relabelings. The target is the internal constraint-aware projection path used by the diagnostic `solver3-relabeling-projection` benchmark suite:

```bash
cargo run -q -p gm-cli -- benchmark run \
  --manifest backend/benchmarking/suites/solver3-relabeling-projection.yaml \
  --cargo-profile dev
```

The relabeling problem is a symmetry-breaking problem, not a local repair problem. The solver6 oracle gives a zero-repeat unlabeled structure. Projection must infer how oracle people, oracle sessions, and oracle group slots map to real labels from constraint-induced structure:

- cliques / must-together sets,
- hard-apart graph factors,
- pair-meeting counts,
- attribute-balance group-slot requirements,
- immovable person/session/group triples,
- partial attendance and availability,
- non-uniform session/group capacities.

The current scaffold builds typed atoms and a timeout-aware partial bijection, but it is still a naive greedy scan and the selected relabeling does not yet influence legacy projection/merge. This lane should rethink that algorithm aggressively while preserving solver architecture:

- `solver6` remains a pure-SGP oracle.
- `solver3` remains the general solver/search core.
- The new path remains internal/diagnostic-gated until it is robust.
- Normal product/default/broad behavior must not gain user-facing knobs or hidden fallbacks.

## Metrics

- **Primary**: `relabeling_relative_score` (unitless, lower is better) — construction-lane-style fixed-baseline aggregate. Successful nonzero-baseline cases contribute weighted `final_score / fixed_baseline_score`; zero-baseline cases are guards that add a small normalized `log1p(score)` penalty if they regress above zero; failed cases add a catastrophic fixed penalty. Cases without a successful strict-budget baseline yet contribute through the failure penalty until an experiment makes them successful, at which point this lane can be re-baselined.
- **Secondary monitors**:
  - `relative_score_mean`
  - `zero_regression_penalty`
  - `failure_count`
  - `timeout_failure_count`
  - `construction_error_count`
  - `zero_regression_count`
  - `success_count`
  - `zero_score_count`
  - `mixed_success_count`
  - `unbaselined_success_count`
  - `diagnostic_final_score_sum`
  - `runtime_seconds`
  - `construction_seconds_total`
  - per-case scores: `score_relabel_immovable`, `score_relabel_partial_attendance`, `score_relabel_capacity_variation`, `score_relabel_cliques`, `score_relabel_hard_apart`, `score_relabel_attribute_balance`, `score_relabel_pair_meeting`, `score_relabel_soft_pairs`, `score_relabel_mixed_light`, `score_relabel_mixed_structural`, `score_relabel_mixed_full`.

Primary-metric details mirror the recent construction-heuristic lane:

- fixed successful baselines are recorded in `tools/autoresearch/solver3-relabeling-projection/autoresearch.sh`,
- nonzero fixed baselines contribute weighted relative ratios,
- zero fixed baselines are guard cases and add only a normalized `log1p(score)` penalty when they regress,
- cases with no successful fixed baseline yet (`hard_apart`, `mixed_structural`, `mixed_full` at setup time) are tracked as sentinels and improve the primary metric by removing the catastrophic failure penalty when they become successful,
- key symmetry-breaking sentinels (`cliques`, `hard_apart`, `attribute_balance`, and all mixed cases) use weight `2`; other cases use weight `1`,
- runtime is secondary only; correctness/structure beats speed until the algorithm works.

## Conceptual Keep Policy

This is a development lane, so do **not** blindly discard elegant symmetry-breaking foundations merely because legacy final benchmark score does not immediately improve. Instead:

1. If the idea changes projection behavior and lowers `relabeling_relative_score`, keep it normally.
2. If the idea is a conceptually strong scaffold but the current metric cannot observe it yet, add a focused diagnostic/telemetry/test that makes the capability measurable, update this file and `autoresearch.sh` if needed, call `init_experiment` again if the optimization target materially changes, then evaluate it against that explicit metric.
3. Keep non-behavior-changing instrumentation or representation work when it is internal, tested, benchmark-neutral for public defaults, and clearly unlocks measuring or implementing a symmetry-breaking capability.
4. Do not use broad-suite score as the first-order target until the relabeling result actually influences projection/merge. Broad remains a later safety check, not the metric for early relabeling intelligence.

A kept conceptual scaffold should leave durable evidence: tests, telemetry, a microdiagnostic, or an explicit benchmark metric. Do not keep vague complexity with no measurable symmetry-breaking value.

## How to Run

`./autoresearch.sh`

Root wrappers delegate to:

- `tools/autoresearch/solver3-relabeling-projection/autoresearch.sh`
- `tools/autoresearch/solver3-relabeling-projection/autoresearch.checks.sh`

The script writes benchmark artifacts outside the repo by default under `/tmp/groupmixer-autoresearch-relabeling-projection` unless `GROUPMIXER_AUTORESEARCH_ARTIFACTS_DIR` is set.

## Files in Scope

Primary relabeling implementation:

- `backend/core/src/solver_support/construction/constraint_scenario_oracle/constraint_aware_projection/atoms.rs` — typed symmetry-breaking atom definitions.
- `backend/core/src/solver_support/construction/constraint_scenario_oracle/constraint_aware_projection/builders.rs` — atom generation from constraints and oracle structure.
- `backend/core/src/solver_support/construction/constraint_scenario_oracle/constraint_aware_projection/oracle_index.rs` — oracle schedule indexing helpers.
- `backend/core/src/solver_support/construction/constraint_scenario_oracle/constraint_aware_projection/relabeling.rs` — timeout-aware partial-bijection search, scoring, and future CSP/beam reconciliation.
- `backend/core/src/solver_support/construction/constraint_scenario_oracle/constraint_aware_projection/deadline.rs` — native/WASM-safe relabeling budget handling.
- `backend/core/src/solver_support/construction/constraint_scenario_oracle/constraint_aware_projection/mod.rs` — diagnostic entry point and eventual bridge into projection/merge.

Projection/merge integration, only when the relabeling plan is ready to affect output:

- `backend/core/src/solver_support/construction/constraint_scenario_oracle/projection.rs` — legacy projection; use as a reference and eventual integration point.
- `backend/core/src/solver_support/construction/constraint_scenario_oracle/merge.rs` — consumer of projected oracle template; should apply a selected projection plan, not own full symmetry search.
- `backend/core/src/solver_support/construction/constraint_scenario_oracle/types.rs` — shared projection/template/result types if explicit relabeling maps need to be carried.
- `backend/core/src/solver3/runtime_state.rs` — orchestration only; avoid hidden repair/rebuild. Internal diagnostic params may be passed through here.
- `backend/core/src/models.rs` — internal-only params/telemetry only; no user-facing relabeling knobs.

Constraint presolve support:

- `backend/core/src/solver_support/constraint_presolve/*.rs` — reusable constraint-unit extraction, clique/immovable/hard-apart presolve.

Benchmark/autoresearch support:

- `backend/benchmarking/suites/solver3-relabeling-projection.yaml` — diagnostic suite manifest. Do not weaken cases to pass.
- `backend/benchmarking/cases/stretch/relabeling_projection/*.json` — committed diagnostic cases; do not edit to improve metric.
- `tools/benchmarking/generate_relabeling_projection_cases.py` — generator for planted cases; can be extended for development-only metadata/harnesses, but canonical cases must remain honest.
- `backend/benchmarking/src/manifest.rs` and `backend/benchmarking/src/runner.rs` — only for diagnostic policy/telemetry plumbing, not cheating.
- `tools/autoresearch/solver3-relabeling-projection/*`, `autoresearch.md`, `autoresearch.sh`, `autoresearch.checks.sh`, `autoresearch.ideas.md` — this autoresearch lane.

## Off Limits

- Do not edit benchmark case JSON or suite membership to make the metric easier.
- Do not reduce diagnostic case sizes, planted constraint counts, or the fixed 13x13x14 shape because the current implementation times out.
- Do not add case-ID-specific branches, hardcoded planted mappings, hardcoded scores, fixture names, participant counts, or sentinel-specific logic.
- Do not expose user-facing oracle/projection/relabeling knobs.
- Do not add hidden solver-family fallback or silent runtime repair.
- Do not weaken strict `RuntimeState` validation after merge.
- Do not convert product hard constraints into soft final constraints. The relabeler may use finite compatibility costs internally, but the final constructed schedule must satisfy hard constraints or fail honestly.
- Do not change solver6 away from pure-SGP repeat minimization.
- Do not use named labels as anchors unless a real non-symmetric constraint fixes them.

## Constraints

- Timeout-aware search is required: the relabeler must return best-so-far within the configured 5 second diagnostic budget.
- Native and WASM timing must remain safe; use existing `deadline.rs` patterns rather than raw `std::time::Instant` in wasm paths.
- Internal mapping contradictions are hard rejects/infinite:
  - one oracle person mapped to two real people,
  - one real person mapped from two oracle people,
  - one oracle session mapped to two real sessions,
  - one real session/group slot mapped from two oracle slots.
- Scenario-hard mismatches inside the raw relabeled oracle are finite/tradeable compatibility costs for ranking; final feasibility remains the responsibility of merge plus strict validation.
- AttributeBalance is soft and must use actual `penalty_weight` / expected violation impact, not fixed magic weights.
- Prefer typed factors/components over over-generic blobs.
- Prefer exact/assignment subproblems where the symmetry suggests them.
- Checks must pass for kept behavior-changing work:
  - `cargo check -q -p gm-core`
  - `cargo check -q -p gm-benchmarking`
  - `cargo test -q -p gm-core constraint_aware_projection::relabeling --lib`
  - `cargo test -q -p gm-benchmarking`

## What's Been Tried

### Existing scaffold before this lane

- Built `constraint_aware_projection` as a parallel internal module.
- Added typed atoms for cliques, hard-apart, attribute balance, immovable triples, pair meeting, soft pairs, and capacity.
- Added `constraint_presolve` for clique components, effective immovables, and hard-apart unit constraints.
- Added a timeout-aware relabeler with partial bijective maps and WASM-safe deadlines.
- Added `solver3-relabeling-projection.yaml` with 11 fixed 13x13x14 planted diagnostic cases and 5 second relabeling timeout.
- The current diagnostic path still delegates to legacy projection after running relabeling, so relabeling intelligence is not yet reflected in projection output.

### Latest baseline before this autoresearch setup

Commit `f3850270 feat(solver3): score constraint-aware relabeling` added structured relabeling scoring:

- finite hard compatibility costs,
- soft penalty costs using actual weights,
- mapping incompleteness costs,
- structural/contact/mapping rewards,
- coverage and breakdown telemetry in internal score structures,
- tests for timeout/uncovered scoring, compatible immovable acceptance, incompatible mapping rejection, and soft-pair weight use.

A diagnostic suite run on that commit produced:

- under the original temporary log/failure aggregate: `11 cases: 8 ok / 3 failed`,
- under the construction-style relative aggregate initialized afterward: baseline metric is expected around `3001` plus benchmark noise because three cases have no successful baseline yet,
- failures:
  - hard-apart: constructor placement error,
  - mixed-structural: construction budget exceeded,
  - mixed-full: construction budget exceeded,
- report: `backend/benchmarking/artifacts/runs/solver3-relabeling-projection-20260425T132244Z-83cba6fd/run-report.json`.

Interpretation: the metric now needs to drive smarter factor reconciliation and actual projection/merge influence. The current greedy relabeler is not enough and mostly acts as scored scaffolding.

### Preferred next experiments

User direction after setup: do **not** start with micro-optimizations. The current atoms/relabeling logic is only vague scaffolding; expect major rewrites to atom generation, factor representation, and reconciliation.

1. Replace raw enumerated atoms with symmetry-breaking factors/components. Build connected components over real people, real sessions, real group slots, oracle people, oracle sessions, and oracle group slots before enumerating candidate embeddings.
2. Generate lazy candidate embeddings per factor family instead of huge flat caps such as the current pair/immovable atom caps. Isolated low-information constraints should remain lazy until connected to stronger asymmetry.
3. Replace greedy single-state atom scan with a beam/backtracking or assignment/CSP reconciler that keeps multiple partial bijections, ordered by finalized `RelabelingScore` including uncovered penalties and mapping completeness.
4. Prioritize factor families by symmetry-breaking power: coupled immovable triples, clique components, capacity/attendance asymmetry, hard-apart graph structure, pair-meeting structure, then soft pair/attribute polishing.
5. Make best relabeling affect projection only once the mapping is coherent enough. Avoid hard-overlaying sparse relabeling maps onto legacy projection; the first attempt destroyed contact structure.
6. Add telemetry metrics for factor counts, component sizes, accepted/covered/uncovered factors, mapping completeness, and score breakdowns once useful.

### Strong negative guidance from prior construction work

- Do not do sparse hard overlays from the current greedy relabeler. Experiment #3 overlaid accepted partial relabeling maps onto legacy projection; it regressed `relabeling_relative_score` from `3000.840` to `3125.666`, blew up previously good zero/low-score cases, and kept the same three failures. A pending group-only overlay follow-up was abandoned before running after user feedback because it was still too small/micro relative to the needed rewrite.
- Do not try to solve this with late runtime repair or blunt per-session relabeling in every construction phase; a previous blunt session-local group relabeling fixed one minor attribute diagnostic but regressed broad construction badly because it perturbed solver3's internal coordinate system too early.
- Do not use arbitrary scalar local objective hacks for attributes/contacts. Use constraint-induced structure and assignment/factor reconciliation.
- Do not treat group IDs as purely cosmetic once constraints exist. Relabel official group IDs deliberately at projection/merge boundaries.
