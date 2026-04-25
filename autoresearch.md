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

The current scaffold builds typed atoms and a timeout-aware partial bijection. It now reaches zero direct identifiable-anchor loss, so the next development direction is to turn those anchors into a concrete trajectory-permutation projection plan that legacy merge can consume. This lane should rethink the relabeling engine aggressively while preserving solver architecture:

- `solver6` remains a pure-SGP oracle.
- `solver3` remains the general solver/search core.
- The new path remains internal/diagnostic-gated until it is robust.
- Normal product/default/broad behavior must not gain user-facing knobs or hidden fallbacks.

The near-term north star is **not** a new schedule solver. It is an internal labeler over a fixed oracle incidence design:

```text
real person -> oracle trajectory/person
real session -> oracle session
per real session: oracle group -> real group, solved by tiny assignment
```

The current atom/factor relabeler should be treated as a seed/anchor source for this trajectory labeler, not as the final architecture.

## Metrics

- **Primary**: `final_relabeling_relative_score` (unitless, lower is better) — final diagnostic construction result for the internal constraint-aware projection suite. This became the active primary only after direct factor/anchor reconciliation reached zero loss; it is now appropriate to measure whether the relabeling plan is consumed coherently by projection/merge.
- **Secondary relabeler monitors**:
  - `relabeling_anchor_loss` — direct identifiable-anchor factor loss. Keep this at `0`; regressions mean projection/merge work damaged the relabeler.
  - `relabeling_factor_loss` — previous direct loss that penalized all global unmapped people/sessions/slots; retained as a guard against accidentally losing broad mapping coverage, but no longer primary because it encouraged arbitrary mappings after factor coverage saturated.
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
  - per-case anchor losses: `relabeling_anchor_loss_immovable`, `relabeling_anchor_loss_partial_attendance`, `relabeling_anchor_loss_capacity_variation`, `relabeling_anchor_loss_cliques`, `relabeling_anchor_loss_hard_apart`, `relabeling_anchor_loss_attribute_balance`, `relabeling_anchor_loss_pair_meeting`, `relabeling_anchor_loss_soft_pairs`, `relabeling_anchor_loss_mixed_light`, `relabeling_anchor_loss_mixed_structural`, `relabeling_anchor_loss_mixed_full`.
  - per-case legacy factor losses: `relabeling_factor_loss_immovable`, `relabeling_factor_loss_partial_attendance`, `relabeling_factor_loss_capacity_variation`, `relabeling_factor_loss_cliques`, `relabeling_factor_loss_hard_apart`, `relabeling_factor_loss_attribute_balance`, `relabeling_factor_loss_pair_meeting`, `relabeling_factor_loss_soft_pairs`, `relabeling_factor_loss_mixed_light`, `relabeling_factor_loss_mixed_structural`, `relabeling_factor_loss_mixed_full`.
- **Final-output monitors** use the construction-style fixed-baseline aggregate with `final_` prefixes. `final_relabeling_relative_score` is the active primary in the projection/merge-consumption phase; related monitors such as `final_failure_count`, `final_timeout_failure_count`, and per-case `final_score_relabel_*` explain where the primary is coming from.

Metric details:

- The active primary now measures final diagnostic projection/merge output because direct relabeler anchors are saturated. Any trajectory-labeler work must still preserve the direct relabeler diagnostics as guards.
- The raw relabeled oracle is **not required to be a feasible schedule**. Scenario-hard mismatches contribute finite compatibility costs and uncovered-factor penalties; only internal mapping contradictions are hard rejects.
- `relabeling_anchor_loss` combines uncovered-factor coverage loss, finite compatibility/soft costs, timeout count, and **identifiable** mapping incompleteness only. Identifiable mapping targets currently include repeated clique members, strongly repeated immovable people, explicit immovable/attribute/capacity session and slot anchors, and other typed factors that genuinely break symmetry.
- The previous `relabeling_factor_loss` remains printed as a secondary monitor, but it is no longer a primary because once factor coverage reached 237/237 it mostly rewarded arbitrary mappings for pair-only or otherwise symmetric cases.
- `final_relabeling_relative_score` is now active because relabeler-only anchor loss is saturated at zero. Final constructor failures are no longer treated as relabeler failures; they are now projection/merge consumption failures to improve honestly.
- Key symmetry-breaking cases (`cliques`, `hard_apart`, `attribute_balance`, and all mixed cases) still receive higher diagnostic weight.

## Conceptual Keep Policy

This is a development lane, so do **not** blindly discard elegant symmetry-breaking foundations merely because legacy final benchmark score does not immediately improve. Instead:

1. If the idea changes projection/merge consumption and lowers `final_relabeling_relative_score` while keeping `relabeling_anchor_loss` at zero, keep it normally.
2. If the idea is a conceptually strong scaffold but the current metric cannot observe it yet, add a focused diagnostic/telemetry/test that makes the capability measurable, update this file and `autoresearch.sh` if needed, call `init_experiment` again if the optimization target materially changes, then evaluate it against that explicit metric.
3. Keep non-behavior-changing instrumentation or representation work when it is internal, tested, benchmark-neutral for public defaults, and clearly unlocks measuring or implementing a symmetry-breaking capability.
4. Do not use broad-suite score as the first-order target until the projection/merge path is robust on this diagnostic suite. Broad remains a later safety check, not the metric for early relabeling intelligence.

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
- `backend/core/src/solver_support/construction/constraint_scenario_oracle/constraint_aware_projection/oracle_index.rs` — oracle trajectory/incidence indexing helpers, including the planned meet-bitset view for pair scoring.
- `backend/core/src/solver_support/construction/constraint_scenario_oracle/constraint_aware_projection/relabeling.rs` — timeout-aware partial-bijection search, scoring, and future CSP/beam reconciliation.
- `backend/core/src/solver_support/construction/constraint_scenario_oracle/constraint_aware_projection/trajectory_labeler.rs` — planned Rust-native trajectory-permutation labeler: fixed oracle incidence, person/session permutation search, and per-session oracle-group assignment. Add once the index/scorer MVP starts.
- `backend/core/src/solver_support/construction/constraint_scenario_oracle/constraint_aware_projection/TRAJECTORY_LABELER_PLAN.md` — implementation plan for the active relabeling rewrite.
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

Interpretation: the first direct metric (`relabeling_factor_loss`) exposed coverage/compatibility problems and drove them to saturation, then became dominated by arbitrary global mapping completeness. The follow-up primary (`relabeling_anchor_loss`) kept gradient on identifiable anchors without rewarding mappings that constraints do not actually determine, and reached zero after attendance/capacity slack handling. The active phase is now projection/merge consumption: final construction failures are the target, but direct relabeler anchor loss must stay zero.

### Active next experiments

User direction after setup: do **not** start with micro-optimizations. The current atoms/relabeling logic is useful scaffolding, but the next implementation should move directly toward the trajectory-permutation labeler inside `constraint_aware_projection/`.

1. Add the oracle trajectory/incidence index in `oracle_index.rs`: `oracle_group[oracle_session][oracle_person]`, pair meet bitsets, scoped meeting counts, and shape/participation tests.
2. Add a Rust-native scorer for a labeling state: `real_person -> oracle_person`, explicit real-session -> oracle-session mapping, finite pair/fixed/attribute/capacity compatibility costs, and no full schedule mutation.
3. Add per-session group-label elimination: for each real session, solve a small assignment from oracle groups to real groups using immovable restrictions, AttributeBalance targets/weights, capacity/attendance compatibility, and slot anchors. This is the first concrete consumer of the relabeler and should produce `OracleTemplateProjectionResult.real_group_by_session_oracle_group`.
4. Seed the trajectory labeler from the current factor relabeler. The factor beam has zero anchor loss; use its session/slot/person hints to initialize or constrain trajectory search rather than hard-overlaying sparse maps onto legacy projection.
5. Materialize a full/partial `OracleTemplateProjectionResult` from the trajectory scorer and compare it against legacy projection on targeted microdiagnostics before trusting it in the full suite.
6. Add timeout-aware local search only after exact scoring exists: 2-swap, 3-cycle, and small conflict-guided permutation neighbourhoods under `deadline.rs`.
7. Keep component/factor improvements only when they feed this trajectory pipeline: e.g. better session/slot/person anchors, better fixed-placement implications, or better candidate neighbourhoods.
8. Add telemetry metrics for trajectory scorer cost, per-session group assignment feasibility/cost, seeded anchors used, local-search move counts, and projection materialization coverage once useful.

### Trajectory-permutation labeler plan

The symmetry-aware permutation/LNS proposal is compatible with this architecture if implemented directly inside `backend/core/src/solver_support/construction/constraint_scenario_oracle/constraint_aware_projection/` as an internal projection/relabeling engine, not as a replacement for solver3 search or solver6 oracle generation. The detailed implementation plan lives in `backend/core/src/solver_support/construction/constraint_scenario_oracle/constraint_aware_projection/TRAJECTORY_LABELER_PLAN.md`. Keep the good parts and avoid the risky parts:

1. **Represent the oracle as fixed trajectories.** Add an oracle-incidence view with `oracle_group[oracle_session][oracle_person]` and compact `meet_mask[oracle_person_a][oracle_person_b]` bitsets. The relabeling state should optimize `real_person -> oracle_person/trajectory` plus explicit real-session -> oracle-session mapping, rather than searching over full schedules.
2. **Eliminate per-session group-name symmetry with exact matching.** For a fixed person/session labeling, solve a tiny per-real-session assignment from oracle groups to real groups. The cost matrix should include immovable group restrictions, AttributeBalance using actual weights/targets, capacity/attendance compatibility, and any group-slot anchors. This should directly produce `OracleTemplateProjectionResult.real_group_by_session_oracle_group`.
3. **Use guarded presolve invariants.** Drop uniform global RepeatEncounter terms from the labeler only when they are formally constant for the chosen oracle/candidate shape. Simplify all-session pair constraints only when the oracle is actually a complete/perfect design over the active mapped people. Partial attendance, dummies, omitted people, nonuniform pair weights, and scoped constraints must disable the simplification.
4. **Compile fixed placements into stronger local implications.** Same-session fixed people in the same target group imply same oracle group for that session; fixed people in different target groups imply different oracle groups. Use these as pruning/scoring hints and matching restrictions, not as a substitute for final strict validation.
5. **Seed from the current factor relabeler.** The existing atom/factor beam now finds zero anchor loss; use its session, slot, and person hints to initialize or constrain the trajectory permutation search. Do not immediately discard it until the trajectory scorer can explain the same anchors and pass the relabeler diagnostics.
6. **Start with Rust-native anytime search.** Implement exact scoring plus 2-swap, 3-cycle, and small conflict-guided permutation neighborhoods first. Recompute the tiny per-session group assignments as needed. This fits native/WASM `gm-core` and the existing deadline model.
7. **Delay heavy dependencies and oracle-specific tricks.** CP-SAT LNS, global CP-SAT certifiers, and affine-plane automorphism moves may be useful later as optional native diagnostics, but they are not MVP requirements and should not become required for WASM/core correctness. Affine-specific transforms must only be used if the oracle backend exposes verified automorphisms generically enough to avoid benchmark-shape overfitting.
8. **Respect partial/non-ideal cases.** A strict full bijection is valid only when real active people and oracle trajectories match exactly. For partial attendance, dummies, omitted people, or capacity variation, the state must explicitly model unmapped/dummy trajectories or restrict the bijection to the active stable subset.
9. **Keep raw-oracle mismatches finite inside the labeler.** The trajectory labeler may rank labels with finite compatibility costs for scenario-hard mismatches; it must not replace merge/search feasibility or weaken final `RuntimeState` validation.

Suggested MVP order:

1. Add oracle trajectory/meet-bitset indexing and tests.
2. Add a pure scorer for a complete/partial `real_person -> oracle_person` labeling plus session map.
3. Add per-session oracle-group -> real-group assignment with immovable and AttributeBalance costs.
4. Materialize `OracleTemplateProjectionResult` from a scored labeling and compare against legacy projection on microdiagnostics.
5. Add swap/3-cycle local search seeded by current relabeling hints.
6. Only then consider larger LNS neighborhoods or optional native CP-SAT experiments.

### Strong negative guidance from prior construction work

- Do not do sparse hard overlays from the current greedy relabeler. Experiment #3 overlaid accepted partial relabeling maps onto legacy projection; it regressed the old final-output aggregate from `3000.840` to `3125.666`, blew up previously good zero/low-score cases, and kept the same three failures. A pending group-only overlay follow-up was abandoned before running after user feedback because it was still too small/micro relative to the needed rewrite.
- The old final-output aggregate is now explicitly secondary because it flattened failed cases to sentinel values and incorrectly encouraged treating final construction feasibility as the relabeler objective.
- Do not try to solve this with late runtime repair or blunt per-session relabeling in every construction phase; a previous blunt session-local group relabeling fixed one minor attribute diagnostic but regressed broad construction badly because it perturbed solver3's internal coordinate system too early.
- Do not use arbitrary scalar local objective hacks for attributes/contacts. Use constraint-induced structure and assignment/factor reconciliation.
- Do not treat group IDs as purely cosmetic once constraints exist. Relabel official group IDs deliberately at projection/merge boundaries.
