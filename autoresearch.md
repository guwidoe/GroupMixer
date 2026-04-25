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

- **Primary**: `relabeling_factor_loss` (unitless, lower is better) — direct relabeler/factor diagnostic loss computed before projection merge or final solver search. This intentionally gives gradient on `hard_apart`, `mixed_structural`, and `mixed_full` even when final construction currently fails or times out.
- **Secondary relabeler monitors**:
  - `relabeling_coverage_rate`
  - `relabeling_total_atoms`
  - `relabeling_atoms_considered`
  - `relabeling_atoms_accepted`
  - `relabeling_atom_acceptance_rate`
  - `relabeling_covered_units`
  - `relabeling_uncovered_units`
  - `relabeling_timed_out_count`
  - `relabeling_hard_cost_sum`
  - `relabeling_soft_cost_sum`
  - `relabeling_mapping_incomplete_sum`
  - per-case factor losses: `relabeling_factor_loss_immovable`, `relabeling_factor_loss_partial_attendance`, `relabeling_factor_loss_capacity_variation`, `relabeling_factor_loss_cliques`, `relabeling_factor_loss_hard_apart`, `relabeling_factor_loss_attribute_balance`, `relabeling_factor_loss_pair_meeting`, `relabeling_factor_loss_soft_pairs`, `relabeling_factor_loss_mixed_light`, `relabeling_factor_loss_mixed_structural`, `relabeling_factor_loss_mixed_full`.
- **Secondary final-output monitors** use the old construction-style fixed-baseline aggregate with `final_` prefixes, e.g. `final_relabeling_relative_score`, `final_failure_count`, `final_timeout_failure_count`, and per-case `final_score_relabel_*`. These are **not** the primary gradient while the relabeler is being rewritten.

Primary-metric details:

- The relabeler is scored directly on typed constraint/factor reconciliation over the fixed diagnostic cases, before merge/search.
- The raw relabeled oracle is **not required to be a feasible schedule**. Scenario-hard mismatches contribute finite compatibility costs and uncovered-factor penalties; only internal mapping contradictions are hard rejects.
- `relabeling_factor_loss` combines uncovered-factor coverage loss, mapping incompleteness, finite compatibility/soft costs, and timeout count.
- Final constructor failures remain visible as secondary `final_*` metrics, but they no longer flatten the primary gradient to `1000000000`/`1000` sentinels.
- Key symmetry-breaking cases (`cliques`, `hard_apart`, `attribute_balance`, and all mixed cases) still receive higher diagnostic weight.

## Conceptual Keep Policy

This is a development lane, so do **not** blindly discard elegant symmetry-breaking foundations merely because legacy final benchmark score does not immediately improve. Instead:

1. If the idea changes relabeler/factor behavior and lowers `relabeling_factor_loss`, keep it normally.
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
- under the later construction-style relative aggregate: baseline metric was around `3001` but provided no useful gradient on failing `1000000000` sentinel cases,
- failures:
  - hard-apart: constructor placement error,
  - mixed-structural: construction budget exceeded,
  - mixed-full: construction budget exceeded,
- report: `backend/benchmarking/artifacts/runs/solver3-relabeling-projection-20260425T132244Z-83cba6fd/run-report.json`.

Interpretation: the metric must drive smarter factor reconciliation directly, not final feasibility. The current greedy relabeler is not enough and mostly acts as scored scaffolding. Final construction failures are secondary until the relabeling result is coherent enough to merge.

### Preferred next experiments

User direction after setup: do **not** start with micro-optimizations. The current atoms/relabeling logic is only vague scaffolding; expect major rewrites to atom generation, factor representation, and reconciliation.

1. Replace raw enumerated atoms with symmetry-breaking factors/components. Build connected components over real people, real sessions, real group slots, oracle people, oracle sessions, and oracle group slots before enumerating candidate embeddings.
2. Generate lazy candidate embeddings per factor family instead of huge flat caps such as the current pair/immovable atom caps. Isolated low-information constraints should remain lazy until connected to stronger asymmetry.
3. Replace greedy single-state atom scan with a beam/backtracking or assignment/CSP reconciler that keeps multiple partial bijections, ordered by finalized `RelabelingScore` including uncovered penalties and mapping completeness.
4. Prioritize factor families by symmetry-breaking power: coupled immovable triples, clique components, capacity/attendance asymmetry, hard-apart graph structure, pair-meeting structure, then soft pair/attribute polishing.
5. Make best relabeling affect projection only once the mapping is coherent enough. Avoid hard-overlaying sparse relabeling maps onto legacy projection; the first attempt destroyed contact structure.
6. Add telemetry metrics for factor counts, component sizes, accepted/covered/uncovered factors, mapping completeness, and score breakdowns once useful.

### Strong negative guidance from prior construction work

- Do not do sparse hard overlays from the current greedy relabeler. Experiment #3 overlaid accepted partial relabeling maps onto legacy projection; it regressed the old final-output aggregate from `3000.840` to `3125.666`, blew up previously good zero/low-score cases, and kept the same three failures. A pending group-only overlay follow-up was abandoned before running after user feedback because it was still too small/micro relative to the needed rewrite.
- The old final-output aggregate is now explicitly secondary because it flattened failed cases to sentinel values and incorrectly encouraged treating final construction feasibility as the relabeler objective.
- Do not try to solve this with late runtime repair or blunt per-session relabeling in every construction phase; a previous blunt session-local group relabeling fixed one minor attribute diagnostic but regressed broad construction badly because it perturbed solver3's internal coordinate system too early.
- Do not use arbitrary scalar local objective hacks for attributes/contacts. Use constraint-induced structure and assignment/factor reconciliation.
- Do not treat group IDs as purely cosmetic once constraints exist. Relabel official group IDs deliberately at projection/merge boundaries.
