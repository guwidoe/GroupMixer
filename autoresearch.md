# Autoresearch: solver5 construction-heuristics coverage

## Objective
Build `solver5` as a **construction-first pure Social Golfer constructor portfolio** that routes equal-size pure-SGP `g-p-w` instances through explicit design-theoretic construction families before search is considered.

The focus in this session is **construction coverage**, not local search quality:
- accept only pure zero-repeat SGP semantics
- implement explicit constructor families, catalog-backed facts, composition operators, and portfolio routing in `solver5`
- maximize how many fixed benchmark cells admit a valid zero-repeat construction, and for each `(g, p)` maximize the constructed week count `W_g,p`

The objective gate should remain **`total_constructed_weeks`**. It is not a perfect measure of the end-state library, but it is an honest and objective proof that a proposed family/routing change actually expands or strengthens constructive coverage on the fixed matrix.

The initial benchmark matrix is fixed to all cells with:
- `2 <= g <= 10`
- `2 <= p <= 10`
- pure SGP semantics only

For each cell, the benchmark searches downward from the counting upper bound
`floor((gp - 1) / (p - 1))` and records the largest `w` for which `solver5` returns a valid zero-repeat construction.

## Metrics
- **Primary**: `total_constructed_weeks` (higher is better) — sum of constructed `W_g,p` across the fixed `2..10 x 2..10` matrix.
- **Secondary**:
  - `frontier_gap_sum` (lower is better)
  - `solved_cells`
  - `exact_frontier_cells`
  - `unsolved_cells`
  - per-`p` constructed-week totals
  - per-cell `W_g_p` metrics such as `W_8_4`, `W_10_4`, `W_10_10`

Interpretation policy:
- treat `total_constructed_weeks` as the hard objective gate for keeps/discards
- use per-cell and per-`p` metrics to verify **where** coverage moved and to catch regressions hidden by the aggregate total
- prefer changes that improve the objective by adding honest family coverage, not by distorting the benchmark question
- use the matrix outputs (`W`, `TW`, `M`) as the human-facing progress dashboard, not as a replacement for the primary gate

## How to Run
`./autoresearch.sh`

The script:
1. runs focused `solver5` tests as a fast precheck
2. runs `backend/core/examples/solver5_construction_coverage.rs`
3. emits structured `METRIC name=value` lines
4. writes `autoresearch.last_run_metrics.json`
5. renders `autoresearch.last_run_report.html`

## Files in Scope
- `backend/core/src/solver5/**` — solver5 construction families, routing, validation, tests
- `backend/core/examples/solver5_construction_coverage.rs` — fixed construction-coverage benchmark harness
- `backend/core/src/models.rs` — solver5 params / registration
- `backend/core/src/engines/mod.rs` — solver5 engine registration
- `backend/core/src/lib.rs` — solver5 module export
- `backend/core/tests/recommended_settings.rs` — enum exhaustiveness fallout only
- `backend/wasm/src/contract_projection.rs` — solver catalog projection fallout only
- `tools/autoresearch/solver5-construction/**`
- `autoresearch.md`
- `autoresearch.sh`
- `autoresearch.checks.sh`
- `autoresearch.ideas.md`
- `construction_heuristics_research.md`

## Off Limits
- changing the benchmark matrix definition in a way that makes the question easier
- counting non-zero-repeat schedules as success
- broad solver3/solver4 heuristic work unrelated to solver5 construction coverage
- webapp/product rewrites unrelated to registering solver5
- benchmark gaming via special-case result files instead of explicit constructor logic

## Constraints
- `solver5` should stay **pure-SGP only** for this session.
- A cell counts as solved only if the returned schedule is valid and canonical final score is zero.
- Prefer explicit constructor families and clean orchestration over opaque search fallback.
- Keep the benchmark fixed and honest.
- When a family only supports a frontier or lower-bound construction, prefixes are allowed: if a family constructs `g-p-W`, taking the first `w <= W` weeks is valid.
- Record promising but deferred families in `autoresearch.ideas.md`.
- Use the constructor-portfolio platform that now exists; do not reintroduce ad hoc family selection, inline exception logic, or opaque fallback behavior.
- Keep matrix reporting aligned to the canonical target definition and preserve the distinction between scored cells and visual-only cells.

## Initial Portfolio Plan
High-ROI constructor order from the research note:
1. round robin / 1-factorization (`p=2`)
2. triples via KTS / NKTS (`p=3`)
3. dedicated `p=4` router (RBIBD / RGDD / URD-derived branches)
4. RTD / MOLS engine
5. recursive clique/group fill (`+G(t)` style lifting)
6. broader RBIBD / RGDD / RITD / URD / ownSG patches

## Current Architecture State
- `solver5` is now a constructor portfolio platform, not just a constructor pack.
- The architecture now includes:
  - family registry / portfolio interfaces
  - typed candidate quality / evidence / applicability / residual metadata
  - catalog-backed theorem / exception / patch-bank seams
  - registry-driven router candidate selection
  - explicit composition layer for structural lifts
  - explicit future handoff seam for search, still disabled by policy
- Normative architecture docs:
  - `backend/core/src/solver5/ARCHITECTURE.md`
  - `backend/core/src/solver5/PORTFOLIO_ARCHITECTURE.md`
  - `backend/core/src/solver5/MATRIX_REPORTING.md`

## Current Historical Reference Baseline
- The last validated solver5 coverage baseline before the `autoresearch.jsonl` reset was:
  - commit: `0357a1f`
  - `total_constructed_weeks = 284`
  - `frontier_gap_sum = 302`
  - `solved_cells = 33`
  - `exact_frontier_cells = 17`
- That value should be treated as a **historical reference**, not as the active ledger baseline, until the current `master` head is re-run and logged into the reset experiment file.

## Current Constructive Coverage
- Shipped constructive families currently include:
  - round robin / 1-factorization for `p=2`
  - Kirkman `6t+1` coverage for supported `p=3` cases
  - prime-power RTD / MOLS-style transversal-design constructors for `3 <= p <= g`
  - prime-power affine-plane constructors for `p = g`
  - recursive `+G(t)`-style lifting across RTD latent groups when `p | g` and the smaller `(g/p)-p-*` instance is already constructible

## What's Been Tried
- Initial setup established the solver5 scaffold, validator, engine registration, benchmark harness, and the round-robin baseline.
- Prime-order RTD / affine-plane constructors were added first, then generalized to supported prime-power orders `4`, `8`, and `9` via finite-field arithmetic.
- Recursive lifting across RTD latent groups is now a live mechanism and should be judged structurally, not as a one-off `9-3-13` trick.
- Kirkman `6t+1` is now part of the constructive baseline for supported `p=3` cases.
- The constructor-portfolio architecture pass is complete: registry, metadata, catalog layer, registry-driven router, handoff seam, and portfolio docs are now in place.
- Remaining live directions should stay structural constructor families, not search-based cheating:
  - KTS / NKTS for stronger `p=3` coverage on composite and non-prime-power rows
  - dedicated `p=4` routing
  - broader RBIBD / RGDD / URD / RITD / ownSG-style patches only after the highest-ROI families are exhausted

## Immediate Next Loop Behavior
- Because `autoresearch.jsonl` was reset, the next session should:
  1. initialize a fresh experiment header
  2. rerun the current `master` baseline honestly
  3. compare future changes against that new logged baseline
- The next feature buildout order remains:
  1. NKTS / composite `p=3`
  2. dedicated `p=4` router
  3. broader catalog-backed patch and design families later
