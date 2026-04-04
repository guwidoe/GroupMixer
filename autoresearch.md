# Autoresearch: solver3 raw performance

## Objective
Improve **raw runtime performance** of `solver3` in GroupMixer without changing benchmark inputs or weakening correctness validation.

This session is focused on:
- move-family **preview** cost
- move-family **apply** cost
- search-loop **time per iteration**

It is **not** focused on adding new solver capabilities, changing benchmark cases, or papering over quality regressions by weakening tests.

## Metrics
- **Primary**: `solver3_raw_score_us` (µs, lower is better)
  - aggregate of solver3 hotpath preview/apply timings for `swap`, `transfer`, and `clique_swap`
  - plus average solve-level runtime-per-iteration across the current `representative-solver3` and `path-solver3` suites
- **Secondary**:
  - `hotpath_total_us`
  - `swap_preview_us`, `swap_apply_us`
  - `transfer_preview_us`, `transfer_apply_us`
  - `clique_preview_us`, `clique_apply_us`
  - `rep_avg_iter_us`, `path_avg_iter_us`
  - `rep_balanced_iter_us`, `rep_constrained_iter_us`
  - `rep_balanced_score`, `rep_constrained_score`
  - per-case path iteration costs for the current path suite

## How to Run
`./autoresearch.sh`

The script runs the existing solver3 benchmark suites and emits structured `METRIC name=value` lines parsed by pi-autoresearch.

## Files in Scope
- `backend/core/src/solver3/search/engine.rs` — search-loop overhead, sampling, family selection, per-iteration overhead
- `backend/core/src/solver3/moves/patch.rs` — shared patch application primitives
- `backend/core/src/solver3/moves/swap.rs` — swap preview/apply microkernel
- `backend/core/src/solver3/moves/transfer.rs` — transfer preview/apply microkernel
- `backend/core/src/solver3/moves/clique_swap.rs` — clique-swap preview/apply microkernel
- `backend/core/src/solver3/compiled_problem.rs` — dense precompiled metadata that removes hotpath lookups
- `backend/core/src/solver3/runtime_state.rs` — runtime-state helpers and dense access paths
- `autoresearch.md` — update findings and dead ends during the loop
- `autoresearch.sh` — improve instrumentation only when it helps the loop make better decisions
- `autoresearch.checks.sh` — adjust correctness checks only if needed for trustworthy backpressure

## Off Limits
- `backend/core/src/solver1/**`
- `backend/core/src/solver2/**`
- `backend/benchmarking/cases/**`
- `backend/benchmarking/suites/**`
- `backend/benchmarking/src/**`
- contract / api / wasm / webapp surfaces
- changing benchmark inputs, iteration budgets, or suite composition to make numbers look better

## Constraints
- keep solver3 internal-only and truthful
- do **not** benchmark-cheat
- do **not** weaken invariant, drift, or regression coverage just to keep a faster result
- prefer raw runtime wins over new search behavior changes
- if a change mostly affects quality rather than raw runtime, discard it for this session
- maintain deterministic same-seed behavior where solver3 already claims it
- use the shared benchmark platform exactly as-is

## Current Baseline Understanding
Known from current local evidence before this session was prepared:
- solver3 improved materially versus its earlier state, but is still not faster than solver1 overall
- swap and transfer preview lanes are relatively close to solver1 compared to solver2, but still slower
- clique-swap preview remains the worst remaining hotpath
- balanced representative runtime is much better than before, but constrained-case quality is still worse than solver1/solver2

## What's Been Tried
- dense runtime architecture (`CompiledProblem` + flat `RuntimeState`) already exists
- move kernels for `swap`, `transfer`, and `clique_swap` already exist
- previous raw-runtime pass already removed a large amount of `HashSet` / `BTreeSet` / `BTreeMap` churn and improved multiple lanes materially
- current kept changes:
  - `backend/core/src/solver3/moves/transfer.rs` + `backend/core/src/solver3/moves/clique_swap.rs`: attribute-balance deltas now count each touched group once and apply moved-person count adjustments instead of cloning/recounting full before/after member vectors. This produced the first local keep and clearly improved transfer/clique hotpaths.
  - `backend/core/src/solver3/moves/clique_swap.rs`: clique preview now avoids one participating-members allocation during feasibility checks and computes the moved-people list once for reuse across forbidden/should-together/pair-meeting penalty passes. This was the second keep and improved aggregate solve/runtime again.
- discarded local experiments so far:
  - gating progress-only search bookkeeping in `search/engine.rs` looked semantically safe but measured as a broad regression; likely benchmark noise or hidden interaction, not a keepable win
  - skipping transfer/clique attribute-balance after-group cloning when a touched slot had no balance constraints also came back with a noisy broad regression; unchanged swap lanes moved too, so local variance is currently real
  - clique-search sampling rewrite that removed temporary active-member vectors and redundant target exclusion checks produced a **positive hotpath/path signal** (`hotpath_total_us` improved) but still lost on aggregate because representative iteration time spiked; worth retrying later with an immediate confirmation rerun if the environment is calmer
  - extending the count-delta pattern to swap attribute-balance preview (plus an all-sessions pair-meeting fast path) badly regressed swap-heavy path lanes; treat swap preview as a separate problem and do not bundle it casually with transfer/clique work
- current measured local noise floor is non-trivial: a no-code-change rerun landed about **6.5% slower** than the best baseline, and an immediate confirmation rerun after the kept change still swung back upward overall even while hotpaths stayed improved. Only trust wins that are clearly larger than that spread or that hold across back-to-back reruns.
- current likely remaining raw-performance opportunities are:
  - reducing search-loop sampling overhead further
  - removing remaining per-preview scans / temporary allocations
  - improving clique-specific preview bookkeeping and target selection
  - adding denser precompiled eligibility metadata where repeated checks still cost too much

## Immediate Working Heuristic
Prefer experiments in this order:
1. clique preview hotpath
2. transfer apply hotpath
3. search-loop overhead that affects many cases
4. swap cleanup only if it still yields obvious wins

## Notes for Resuming Agents
- the benchmark suite is already the right foundation; do not reinvent it
- read the current solver3 runtime files before making changes
- record dead ends aggressively so the loop does not rediscover them
- if a microbench win makes solve-level time/iteration worse, discard it unless the evidence is very strong
