# Solver3 search mechanical modularization refactor plan

## Status

Completed on 2026-04-17.

This plan covers a **mechanical, search-layer-only** modularization of `solver3` so the current oversized files become manageable without changing solver behavior, policy semantics, runtime-state layout, or move-kernel contracts.

The intent is to preserve the current architecture:

> dense runtime kernels + search-side policy/orchestration

while making the search layer easier to inspect, extend, and benchmark safely.

### Completion notes

The full mechanical split landed in six staged epics plus a final cleanup pass.

Landed structure:

- `backend/core/src/solver3/search/context/`
- `backend/core/src/solver3/search/candidate_sampling/`
- `backend/core/src/solver3/search/recombination/`
- `backend/core/src/solver3/search/path_relinking/`
- `backend/core/src/solver3/search/single_state/`

Final cleanup/verification follow-up:

- simplified the final `search/mod.rs` and narrowed staged re-export clutter in nested `mod.rs` files
- refreshed stale Rust doc examples that were blocking `cargo test --workspace` after `StopConditions` gained `stop_on_optimal_score`
- reran the final solver3 sanity bundle (`cargo test --workspace`, solver3 benchmark triad)

Final verification status:

- `cargo test --workspace` — passing
- `bash ./gate.sh` — still blocked by a pre-existing formatter-only diff in `backend/benchmarking/src/manifest.rs`; left out of this program's commits to avoid bundling unrelated formatting churn
- final benchmark sanity reruns completed with unchanged scores/checksums and no credible behavioral drift

Final benchmark sanity artifacts:

- pre-cleanup
  - `backend/benchmarking/artifacts/runs/social-golfer-plateau-time-solver3-20260417T084257Z-450f4fc4/run-report.json`
  - `backend/benchmarking/artifacts/runs/social-golfer-plateau-fixed-iteration-solver3-20260417T084322Z-2896c8cb/run-report.json`
  - `backend/benchmarking/artifacts/runs/hotpath-search-iteration-sailing-trip-demo-solver3-20260417T084512Z-908dcb88/run-report.json`
- post-cleanup
  - `backend/benchmarking/artifacts/runs/social-golfer-plateau-time-solver3-20260417T085401Z-3e3cb85d/run-report.json`
  - `backend/benchmarking/artifacts/runs/social-golfer-plateau-fixed-iteration-solver3-20260417T085426Z-937f1b22/run-report.json`
  - `backend/benchmarking/artifacts/runs/hotpath-search-iteration-sailing-trip-demo-solver3-20260417T085609Z-a67947ac/run-report.json`
- time-lane rerun to check noise
  - `backend/benchmarking/artifacts/runs/social-golfer-plateau-time-solver3-20260417T085649Z-9a633b99/run-report.json`

Program commits:

- `b3f57fd` — split context config/validation
- `2a1c7fb` — split context policy/progress
- `5c46ffa` — require honest 10k search-iteration benchmark counts
- `5eeb7f1` — add this modularization plan
- `2610a6d` — split candidate-sampling types/dispatch
- `4fdba05` — split candidate-sampling families
- `868eb3b` — split recombination helpers
- `7390c6e` — split recombination driver/telemetry
- `b5e13bf` — split path-relinking alignment
- `0c0fc04` — split path-relinking drivers
- `fc9068f` — split single-state helpers
- `b5755f2` — split single-state loops
- `331973e` — simplify final modularized search surfaces

---

## Goal

Refactor the current `backend/core/src/solver3/search/` implementation into a directory-based module tree with **stable outward behavior** and **smaller, concern-focused files**.

Primary goals:

- reduce the largest `solver3/search/*.rs` files to human-reviewable units
- preserve existing solver behavior exactly unless a later, explicitly separate change says otherwise
- keep hot move kernels and dense state structures untouched
- make future benchmark-backed search-policy work easier to localize
- improve testability and code review quality for `solver3` search logic

---

## Why this refactor is justified

The current implementation is functionally coherent, but several files have become too large to review safely:

- `backend/core/src/solver3/search/context.rs` — ~2739 LOC
- `backend/core/src/solver3/search/path_relinking.rs` — ~2842 LOC
- `backend/core/src/solver3/search/candidate_sampling.rs` — ~2405 LOC
- `backend/core/src/solver3/search/recombination.rs` — ~2009 LOC
- `backend/core/src/solver3/search/single_state.rs` — ~1246 LOC

Reading the current implementation shows that these files already contain multiple latent submodules. The problem is not that the architecture is wrong; the problem is that too many concerns are physically co-located in single files.

This plan therefore treats the work as a **mechanical decomposition**, not a redesign.

---

## Doctrine alignment

This plan aligns with `docs/reference/principles/AGENTIC_ENGINEERING_PRINCIPLES.md` by:

- preferring explicit boundaries over inherited monoliths
- preserving honest behavior rather than masking semantic changes inside a refactor
- keeping hot/runtime boundaries explicit
- separating orchestration, validation, telemetry, and policy memory into clearer modules
- avoiding silent fallback behavior or hidden semantic changes during cleanup

This refactor must remain a **truthful structural change**, not an opportunity to sneak in policy experimentation.

---

## Scope

### In scope

Only the `solver3` search layer:

- `backend/core/src/solver3/search/mod.rs`
- `backend/core/src/solver3/search/context.rs`
- `backend/core/src/solver3/search/candidate_sampling.rs`
- `backend/core/src/solver3/search/single_state.rs`
- `backend/core/src/solver3/search/recombination.rs`
- `backend/core/src/solver3/search/path_relinking.rs`
- any directly associated `search/tests.rs` updates required by module moves

### Explicitly out of scope

Do **not** change as part of this refactor:

- `backend/core/src/solver3/runtime_state.rs`
- `backend/core/src/solver3/compiled_problem.rs`
- `backend/core/src/solver3/moves/*.rs`
- `backend/core/src/solver3/scoring/**`
- search-policy tuning
- move-family chooser behavior
- acceptance logic semantics
- benchmarking lane definitions
- feature-gating policy semantics
- webapp/API/CLI rollout behavior

---

## Non-negotiable invariants

### I1. Mechanical means mechanical

Every commit in this program should be explainable as:

> move code into smaller internal modules while preserving behavior

Not allowed under this plan:

- heuristic changes
- policy changes
- benchmark-question changes
- correctness-lane semantic changes
- telemetry meaning changes
- search-driver behavior changes unless separately approved

### I2. Preserve hot-path architecture

Do not introduce:

- trait objects in per-iteration search paths
- boxed callbacks in runtime search loops
- new allocation-heavy abstraction layers in hot code
- generic strategy frameworks that blur concrete kernel ownership

### I3. Preserve existing public/internal seams where practical

The refactor should keep stable import/use surfaces for the rest of `solver3` where possible. Prefer:

- converting giant files into directories with `mod.rs`
- re-exporting the same primary types/functions from the new module root
- minimizing call-site churn outside the target file being decomposed

### I4. Benchmark after each epic

Because these files sit on solver search paths, each epic must end with tests and a benchmark sanity pass before the next epic begins.

---

## What the current implementation actually contains

This refactor plan is based on reading the current implementation, not just LOC counts.

### `search/context.rs`

This file currently combines three different roles:

1. **config normalization and validation**
   - `SearchRunContext`
   - search-driver/local-improver config structs
   - `SearchRunContext::from_solver(...)`
   - feature gating helpers

2. **policy-memory model**
   - `SearchPolicyMemory`
   - tabu/threshold/late-acceptance/ILS memory structs

3. **progress and telemetry accumulation**
   - `SearchProgressState`
   - `record_*` helpers
   - `to_progress_update(...)`
   - `to_benchmark_telemetry(...)`

This is a clean split candidate.

### `search/candidate_sampling.rs`

This file currently combines:

1. public sampler types
2. family-dispatch entrypoints
3. swap sampling logic
4. transfer sampling logic
5. clique-swap sampling logic
6. runtime eligibility helpers
7. timing/diagnostic helpers

It is the clearest candidate for a directory split.

### `search/single_state.rs`

This file currently combines:

1. top-level entrypoints (`run`, `polish_state`)
2. two full loop implementations (`default` and `general`)
3. result-building / move-apply helpers
4. diversification-burst machinery
5. correctness sampling

This file should be decomposed, but only after the lower-risk search support modules are split.

### `search/recombination.rs`

This file currently combines:

1. donor/session selection model
2. raw-child retention model
3. trigger state
4. local-optimum certification
5. donor-session transplant driver
6. telemetry accumulation and progress helpers

This is a self-contained package that can become a directory.

### `search/path_relinking.rs`

This file currently combines:

1. session-alignment math
2. session-aligned path relinking driver
3. multi-root balanced session inheritance driver
4. raw-child retention state
5. trigger state
6. local-optimum certification
7. telemetry/merge helpers

This should become a directory, with the alignment math and the multi-root driver separated from the main relinking driver.

---

## Target end-state module tree

```text
backend/core/src/solver3/search/
  mod.rs
  engine.rs
  acceptance.rs
  family_selection.rs
  archive.rs
  repeat_guidance.rs
  tabu.rs
  sgp_conflicts.rs
  memetic.rs

  context/
    mod.rs
    config.rs
    validation.rs
    policy_memory.rs
    progress.rs

  candidate_sampling/
    mod.rs
    types.rs
    dispatch.rs
    swap.rs
    transfer.rs
    clique_swap.rs
    eligibility.rs
    timing.rs            # optional if timing helpers stay local

  single_state/
    mod.rs
    driver.rs
    default_loop.rs
    general_loop.rs
    diversification.rs
    result.rs
    correctness.rs

  recombination/
    mod.rs
    types.rs
    donor_selection.rs
    trigger.rs
    retention.rs
    certification.rs
    telemetry.rs
    driver.rs

  path_relinking/
    mod.rs
    alignment.rs
    trigger.rs
    retention.rs
    certification.rs
    telemetry.rs
    driver.rs
    multi_root.rs
```

This end-state preserves the overall `search` architecture while making each concern explicit.

---

## Execution strategy

### High-level order

Execute the refactor in this order:

1. `context.rs` → `context/`
2. `candidate_sampling.rs` → `candidate_sampling/`
3. `recombination.rs` → `recombination/`
4. `path_relinking.rs` → `path_relinking/`
5. `single_state.rs` → `single_state/`
6. final verification, cleanup, and docs/todo updates

This order is deliberate:

- `context` and `candidate_sampling` are the highest-value, lowest-risk decompositions
- `recombination` and `path_relinking` are large but internally cohesive packages
- `single_state` should be last because it contains the main loop and duplicated control flow, making accidental behavior changes more likely

---

## Epic breakdown

## Epic 1 — Split `search/context.rs` into a focused context package

### Outcome

Replace `search/context.rs` with a `search/context/` directory that cleanly separates:

- config normalization
- validation/feature gating
- policy-memory model
- progress/telemetry accumulation

### Target internal layout

```text
search/context/
  mod.rs
  config.rs
  validation.rs
  policy_memory.rs
  progress.rs
```

### Planned moves

#### `config.rs`
Move:

- `SearchRunContext`
- `SteadyStateMemeticConfig`
- `AdaptiveRawChildRetentionConfig`
- `DonorSessionTransplantConfig`
- `SessionAlignedPathRelinkingConfig`
- `MultiRootBalancedSessionInheritanceConfig`
- `SearchRunContext::from_solver(...)`

#### `validation.rs`
Move:

- `validate_multi_root_balanced_session_inheritance(...)`
- `ensure_search_driver_feature_available(...)`
- `ensure_repeat_guidance_feature_available(...)`
- `ensure_conflict_restricted_sampler_feature_available(...)`

#### `policy_memory.rs`
Move:

- `SearchPolicyMemory`
- `TabuPolicyMemory`
- `ThresholdAcceptanceMemory`
- `LateAcceptanceMemory`
- `IteratedLocalSearchMemory`

#### `progress.rs`
Move:

- `SearchProgressState`
- all `record_*` helpers
- `to_progress_update(...)`
- `to_benchmark_telemetry(...)`
- `family_metrics_mut(...)`
- `average_delta(...)`
- `ratio(...)`

### Acceptance criteria

- no behavior change in `SearchRunContext::from_solver(...)`
- no telemetry field meaning changes
- existing imports compile via the new `context::mod.rs` surface
- tests covering run-context normalization and progress-state reporting still pass

### Verification

- targeted `cargo test` for `solver3::search::context` consumers
- `cargo test --workspace`
- `./gate.sh`

---

## Epic 2 — Split `search/candidate_sampling.rs` into per-concern modules

### Outcome

Replace `search/candidate_sampling.rs` with a directory that isolates:

- shared sampler types
- family dispatch
- swap sampler subsystem
- transfer sampler
- clique-swap sampler
- runtime eligibility helpers

### Target internal layout

```text
search/candidate_sampling/
  mod.rs
  types.rs
  dispatch.rs
  swap.rs
  transfer.rs
  clique_swap.rs
  eligibility.rs
  timing.rs   # optional
```

### Planned moves

#### `types.rs`
Move:

- `SearchMovePreview`
- `CandidateSampler`
- `CandidateSelectionTimingBreakdown`
- `FamilyPreviewTimingBreakdown`
- `RepeatGuidedSwapSamplingDelta`
- `TabuSwapSamplingDelta`
- `CandidateSelectionResult`
- `GuidedSwapSamplingPreviewResult`
- `SwapSamplingOptions`

#### `dispatch.rs`
Move:

- `select_previewed_move_default(...)`
- `diagnose_select_previewed_move_default_timing(...)`
- `select_previewed_move(...)`
- `sample_preview_for_family(...)`
- `sample_preview_for_family_default(...)`
- default family/timing dispatch helpers

#### `swap.rs`
Move all swap-specific logic:

- swap preview sampling entrypoints
- random swap sampling
- repeat-guided swap sampling
- conflict-restricted swap sampling
- tabu prefilter/aspiration fallback logic
- repeat-guidance session/anchor selection helpers

#### `transfer.rs`
Move:

- `sample_transfer_preview(...)`
- any transfer-specific timing diagnostic helper

#### `clique_swap.rs`
Move:

- `sample_clique_swap_preview(...)`
- any clique-specific timing diagnostic helper

#### `eligibility.rs`
Move runtime helper substrate:

- `participating_clique_members(...)`
- `runtime_session_can_clique_swap(...)`
- `runtime_session_can_swap(...)`
- `runtime_group_has_swappable_person(...)`
- `runtime_pick_swappable_person_from_group(...)`
- `runtime_active_clique_in_single_group(...)`
- `runtime_pick_clique_targets(...)`
- `runtime_target_group_has_eligible_clique_swap_people(...)`
- `runtime_session_can_transfer(...)`
- `runtime_transfer_source_group(...)`
- `runtime_transfer_target_has_capacity(...)`
- `is_runtime_transferable_person(...)`
- `is_runtime_swappable_person(...)`

### Acceptance criteria

- move-family sampling behavior remains unchanged
- repeat-guided, tabu, conflict-restricted, and default paths preserve current semantics
- no additional per-iteration allocation layers are introduced beyond what already exists
- existing sampler tests keep passing with minimal test rewiring

### Verification

- targeted `cargo test solver3::search::candidate_sampling`
- `cargo test --workspace`
- `./gate.sh`
- solver3 search benchmark sanity check after the epic

---

## Epic 3 — Split donor-session transplant into a `recombination/` package

### Outcome

Turn `search/recombination.rs` into a directory with explicit internal boundaries for:

- donor/session selection
- trigger state
- retention policy
- swap certification
- telemetry helpers
- main driver

### Target internal layout

```text
search/recombination/
  mod.rs
  types.rs
  donor_selection.rs
  trigger.rs
  retention.rs
  certification.rs
  telemetry.rs
  driver.rs
```

### Planned moves

#### `types.rs`
Move:

- `DonorSessionChoice`
- `DonorCandidatePool`
- `DonorSessionViabilityTier`
- `DonorSessionSelectionOutcome`
- `DonorSessionTriggerEligibility`

#### `donor_selection.rs`
Move:

- `select_donor_session(...)`
- `select_donor_session_from_summary(...)`
- `best_session_choice_for_donor(...)`
- `compare_donor_session_choice(...)`

#### `trigger.rs`
Move:

- `DonorSessionTriggerState`

#### `retention.rs`
Move:

- `AdaptiveRawChildRetentionDecision`
- `AdaptiveRawChildRetentionState`

#### `certification.rs`
Move:

- `SwapLocalOptimumCertificationResult`
- `certify_swap_local_optimum(...)`

#### `telemetry.rs`
Move:

- `record_archive_update(...)`
- `record_raw_child_retention(...)`
- `record_child_polish_budget(...)`
- `record_child_polish(...)`
- `absorb_local_search_chunk(...)`
- `absorb_family_metrics(...)`
- `absorb_tabu_metrics(...)`
- `maybe_emit_progress(...)`

#### `driver.rs`
Keep only the driver-specific flow:

- time helpers
- `time_limit_exceeded(...)`
- `child_polish_budget_for_stagnation(...)`
- `transplant_donor_session(...)`
- `run(...)`

### Acceptance criteria

- donor-session transplant behavior remains unchanged
- telemetry retains the exact current meaning and shape
- tests for donor selection, retention, and child-quality telemetry still pass

### Verification

- targeted recombination tests
- `cargo test --workspace`
- `./gate.sh`
- solver3 recombination/path sanity benchmark check

---

## Epic 4 — Split `path_relinking.rs` into alignment, driver, and multi-root modules

### Outcome

Turn `search/path_relinking.rs` into a directory that separates:

- session-alignment math
- session-aligned path relinking driver
- multi-root balanced inheritance driver
- shared retention/trigger/certification helpers
- telemetry/merge helpers

### Target internal layout

```text
search/path_relinking/
  mod.rs
  alignment.rs
  trigger.rs
  retention.rs
  certification.rs
  telemetry.rs
  driver.rs
  multi_root.rs
```

### Planned moves

#### `alignment.rs`
Move:

- `AlignedSessionPair`
- `SessionAlignment`
- `build_session_pairing_signature(...)`
- `session_pairing_distance(...)`
- `align_sessions_by_pairing_distance(...)`
- `validate_alignment_dimensions(...)`
- `build_distance_matrix(...)`
- `sorted_symmetric_difference_count(...)`
- `solve_minimum_cost_assignment(...)`

#### `trigger.rs`
Move:

- `PathRelinkingTriggerState`

#### `retention.rs`
Move:

- `AdaptiveRawChildRetentionDecision`
- `AdaptiveRawChildRetentionState`

#### `certification.rs`
Move:

- `SwapLocalOptimumCertificationResult`
- `certify_swap_local_optimum(...)`

#### `driver.rs`
Move the session-aligned path relinking driver and its private types:

- `PathGuideCandidate`
- `RandomMacroMutationCandidate`
- `PathStepCandidateInput`
- `PathStepEvaluation`
- `run(...)`
- `archive_config_for_path_relinking_mode(...)`
- `child_polish_budget_for_stagnation(...)`
- `select_path_guide(...)`
- `compare_path_guides(...)`
- `compare_path_step_candidate(...)`
- `transplant_aligned_session(...)`
- `build_random_donor_session_candidates(...)`
- `build_random_macro_mutation_candidates(...)`
- `remove_aligned_pair(...)`
- `remove_session_idx(...)`

#### `multi_root.rs`
Move the second driver and its planning types:

- `BalancedInheritanceParentRole`
- `BalancedInheritanceSessionChoice`
- `BalancedInheritancePlan`
- `CanonicalCrossRootParentPair`
- `run_multi_root_balanced_session_inheritance(...)`
- `canonicalize_cross_root_parent_pair(...)`
- `build_balanced_inheritance_plan(...)`
- `build_balanced_inheritance_child(...)`
- `merge_local_improver_run(...)`

#### `telemetry.rs`
Move shared helpers:

- `maybe_emit_progress(...)`
- `absorb_local_search_chunk(...)`
- `absorb_search_metrics_only(...)`
- `absorb_family_metrics(...)`
- `absorb_tabu_metrics(...)`
- repeat-guidance/tabu/move summary merge helpers

### Acceptance criteria

- exact session alignment behavior is preserved
- path relinking and multi-root inheritance semantics are unchanged
- current benchmark telemetry shapes are unchanged
- driver imports remain stable via `path_relinking::mod.rs`

### Verification

- targeted path-relinking and multi-root tests
- `cargo test --workspace`
- `./gate.sh`
- solver3 same-machine benchmark sanity check for search-driver lanes

---

## Epic 5 — Split `single_state.rs` into driver, loops, diversification, and correctness modules

### Outcome

Turn `search/single_state.rs` into a directory that isolates:

- top-level entrypoints
- default/general loop implementations
- diversification burst helpers
- result building / move apply
- correctness sampling

### Target internal layout

```text
search/single_state/
  mod.rs
  driver.rs
  default_loop.rs
  general_loop.rs
  diversification.rs
  result.rs
  correctness.rs
```

### Planned moves

#### `driver.rs`
Move:

- `run(...)`
- `polish_state(...)`
- `run_local_improver(...)`
- `LocalImproverBudget`
- `LocalImproverRunResult`
- `LocalImproverHooks`

#### `default_loop.rs`
Move:

- `run_local_improver_default(...)`

#### `general_loop.rs`
Move:

- `run_local_improver_general(...)`
- `is_tabu_swap_preview(...)`
- any general-loop-only helpers

#### `diversification.rs`
Move:

- `DiversificationBurstOutcome`
- `try_diversification_burst(...)`
- `should_attempt_diversification_burst(...)`
- `diversification_per_donor_polish_seconds(...)`
- `diversification_per_donor_iteration_budget(...)`
- `select_best_offspring_session(...)`
- `select_best_cross_donor_bundle(...)`
- `transplant_mixed_donor_sessions(...)`
- `diversify_seed(...)`
- `extend_no_improvement_streak(...)`

#### `result.rs`
Move:

- `build_solver_result(...)`
- `apply_previewed_move(...)`
- `should_emit_progress_callback(...)`

#### `correctness.rs`
Move:

- `maybe_run_sampled_correctness_check(...)`
- `should_sample_correctness_check(...)`

### Acceptance criteria

- single-state record-to-record behavior is unchanged
- SGP tabu local-improver behavior is unchanged
- diversification burst behavior is unchanged
- progress callback cadence and final-result semantics are unchanged

### Verification

- targeted single-state tests
- `cargo test --workspace`
- `./gate.sh`
- solver3 fixed-time / hotpath / same-machine guardrail reruns

---

## Epic 6 — Final verification, docs, and cleanup pass

### Outcome

After the mechanical splits land, perform a final pass to ensure the new module tree is coherent and reviewable.

### In scope

- clean any temporary re-export clutter introduced by the staged moves
- ensure `search/mod.rs` and nested `mod.rs` files read cleanly
- update any search-layer internal comments that reference moved files
- update this plan with completion notes if the implementation materially diverges
- confirm there is no accidental semantic drift

### Acceptance criteria

- `search/mod.rs` presents a comprehensible top-level layout
- there are no dead/internal imports left over from the staged extraction process
- benchmarks and tests are green at the end-state

### Verification

- `cargo test --workspace`
- `./gate.sh`
- final solver3 benchmark sanity check

---

## Benchmark and verification policy

Because this work touches solver search code, treat each epic as benchmark-sensitive.

### Minimum verification after each epic

1. targeted tests for the touched package
2. `cargo test --workspace`
3. `./gate.sh`

### Required benchmark discipline

After each epic, run a solver3 benchmark sanity pass appropriate to the touched area.

At minimum:

- search-driver sanity lane for `single_state` / `candidate_sampling`
- recombination/path lanes for `recombination` / `path_relinking`
- same-machine remote benchmark lane before handoff if the touched epic affected solver hot search paths materially

If a suspicious hotpath delta appears on code that was only mechanically moved, rerun before acting on it.

---

## Risks and mitigations

### Risk 1 — accidental behavior drift during extraction

Mitigation:

- small commits
- move code first, clean imports second
- preserve function signatures where possible
- prefer directory `mod.rs` re-exports over broad call-site rewrites

### Risk 2 — hidden codegen/perf regressions from large file moves

Mitigation:

- benchmark after each epic
- treat performance results as signals to rerun before interpretation
- avoid layering new abstractions into per-iteration paths

### Risk 3 — over-refactoring into a framework

Mitigation:

- no trait-heavy generalization
- no generic strategy interfaces
- keep concrete modules and explicit dataflow

### Risk 4 — mixing cleanup with policy experimentation

Mitigation:

- if a change affects heuristics, stop and split it into a separate follow-on task
- this program remains mechanical only

---

## Definition of done

This modularization program is done only when all of the following are true:

1. the oversized `solver3/search` files have been decomposed into concern-based modules/directories
2. the current solver3 search behavior remains unchanged except for separately approved work
3. the public/internal search-layer seams remain understandable and explicit
4. tests and benchmarks pass after each epic and at the final state
5. future search-policy work can be localized to smaller modules without reopening giant files

---

## Tracking

### Umbrella epic

- `TODO-c8dae284` — EPIC: Mechanically modularize solver3 search layer into directory-based modules

### Sub-epics

- `TODO-4b188a45` — split `search/context.rs` into context package modules _(done)_
- `TODO-c61bf77f` — split `search/candidate_sampling.rs` into dispatch/family/eligibility modules _(done)_
- `TODO-ac54dcf0` — split `search/recombination.rs` into donor-selection/retention/trigger/telemetry/driver modules _(done)_
- `TODO-ac67f564` — split `search/path_relinking.rs` into alignment/relinking/multi-root/telemetry modules _(done)_
- `TODO-7bc3d373` — split `search/single_state.rs` into driver/loop/diversification/result/correctness modules _(done)_
- `TODO-7d8abaa3` — final verification, cleanup, and documentation pass _(done with gate caveat noted above)_

### Initial subtasks

- `TODO-6c217619` — extract context config/validation modules _(done)_
- `TODO-ba613a63` — extract context policy-memory and progress/telemetry modules _(done)_
- `TODO-b8d44348` — extract candidate-sampling shared types and dispatch modules _(done)_
- `TODO-b30c87e3` — split candidate-sampling family modules and runtime eligibility helpers _(done)_
- `TODO-4aa3a34a` — extract recombination selection/retention/trigger/certification helpers _(done)_
- `TODO-3e4a9ed6` — extract recombination telemetry helpers and slim driver _(done)_
- `TODO-55605ee7` — extract path-relinking alignment substrate _(done)_
- `TODO-37aba2ce` — split path-relinking and multi-root drivers _(done)_
- `TODO-2f90aba7` — extract single-state diversification/result/correctness helpers _(done)_
- `TODO-320d83c3` — split single-state default/general loops _(done)_
- `TODO-b55c9c2d` — simplify final `search/mod.rs` and re-export surfaces _(done)_
- `TODO-3f10e8e2` — run final full verification and benchmark sanity bundle _(done with gate caveat noted above)_
