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
3. general router enrichment so each `p` has a recognizable family-selection policy
4. RTD / MOLS engine
5. recursive clique/group fill (`+G(t)` style lifting)
6. broader RBIBD / RGDD / RITD / URD / ownSG patches

Interpretation note:
- this is a **family roadmap**, not a cell-by-cell roadmap
- solver5 should receive a pure-SGP `(g, p, w)` instance and automatically choose among applicable families
- for every `p`, the router should converge toward a recognizable theory-backed family-selection policy
- near-term work still happens where the ROI is best, but that does **not** mean building one-off per-cell logic

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
  - catalog-backed exact KTS cases for 9 and 15 players (`5-3-7` is now exact via `kts`)
  - catalog-backed exact NKTS cases for 18 players (`6-3-8`)
  - pseudo-doubled NKTS constructions seeded from exact half-size KTS schedules (`10-3-13` now constructs honestly from `KTS(15)`)
  - published-schedule bank coverage for source-backed triples / higher-`p` exceptions, including:
    - `8-3-10`
    - `6-4-7` (with one documented transcription correction on the archived source)
    - `8-4-10`
    - `10-4-9`
    - `6-5-6`, `6-6-3`
    - `10-5-7`, `10-6-6`, `10-7-5`, `10-8-4`, `10-9-3`, `10-10-3`
  - prime-power RTD / MOLS-style transversal-design constructors for `3 <= p <= g`
  - prime-power affine-plane constructors for `p = g`
  - recursive `+G(t)`-style lifting across RTD latent groups when `p | g` and the smaller `(g/p)-p-*` instance is already constructible
- Active kept benchmark baseline is now:
  - commit: `03ec2fb`
  - `total_constructed_weeks = 370`
  - `frontier_gap_sum = 216`
  - `solved_cells = 45`
  - `exact_frontier_cells = 23`
  - `p3_constructed_weeks = 69`
  - `p4_constructed_weeks = 58`

## What's Been Tried
- Initial setup established the solver5 scaffold, validator, engine registration, benchmark harness, and the round-robin baseline.
- Prime-order RTD / affine-plane constructors were added first, then generalized to supported prime-power orders `4`, `8`, and `9` via finite-field arithmetic.
- Recursive lifting across RTD latent groups is now a live mechanism and should be judged structurally, not as a one-off `9-3-13` trick.
- Kirkman `6t+1` is now part of the constructive baseline for supported `p=3` cases.
- The constructor-portfolio architecture pass is complete: registry, metadata, catalog layer, registry-driven router, handoff seam, and portfolio docs are now in place.
- A naive cyclic `p=3` transversal-design fallback for non-prime-power group counts was tried and discarded: it left `total_constructed_weeks` flat at `284`, so the cheap cyclic schedule does **not** unlock the even composite triple rows (`6-3-*`, `10-3-*`). Do not retry that shortcut.
- Catalog-backed small triple families now move the benchmark honestly:
  - exact `NKTS(18)` raised `6-3` coverage to `8`
  - exact `KTS(15)` now solves `5-3-7`
  - a pseudo-doubling construction from `KTS(15)` now solves `10-3-13`
- Published explicit schedules are now a major honest coverage source:
  - Warwick Harvey archive cases now cover `8-3-10`, `10-4-9`, `6-5-6`, `6-6-3`, and the `10-p-*` rows for `p=5..10`
  - the archived `6-4-7` page entry had one obvious duplicated-player typo; a single-entry correction (`[1, 5, 16, 19] -> [1, 7, 16, 19]`) restores a valid pure-SGP schedule and is now documented inline in the catalog
  - Alejandro Aguado's explicit `8-4-10` construction replaced the weaker `8-4-9` source-backed patch
- The Warwick archive appears exhausted for benchmark-relevant improvements inside the fixed `2..10 x 2..10` matrix after landing the `6-4`, `6-5`, `6-6`, `8-3`, `8-4`, `10-4`, and `10-p` (`p>=5`) cases above.
- The main remaining triples frontier is now `8-3-11` (24 players). Any next `p=3` work should target an honest 24-player construction or a structurally justified composition, not another generic cyclic shortcut.
- Remaining live directions should stay structural constructor families, not search-based cheating:
  - honest 24-player triple coverage for `8-3-11`
  - stronger `p=4` coverage, especially `9-4-11` and `10-4-10..13`, through explicit published schedules or actual RBIBD / RGDD family work rather than benchmark-shaped glue
  - the most promising current theorem-family route is a finite-field resolvable `(v,4,1)`-BIBD construction for `v = 3q + 1`; inside the fixed matrix this should honestly target `7-4-9` and `10-4-13`
  - broader RBIBD / RGDD / URD / RITD / ownSG-style patches only after the highest-ROI family-policy gaps are exhausted

## Immediate Next Loop Behavior
- Active kept benchmark baseline is now commit `03ec2fb` at `total_constructed_weeks = 370`.
- The finite-field `v = 3q + 1` resolvable-BIBD family has now landed and paid off exactly as hoped:
  - `W_7_4: 7 -> 9`
  - `W_10_4: 9 -> 13`
  - `p4_constructed_weeks: 52 -> 58`
  - `exact_frontier_cells: 21 -> 23`
- The next feature buildout order is now:
  1. target the remaining exact `p=4` gap at `9-4-11`, likely through an honest `RGDD(36,4,3)`-style family or an explicit source-backed schedule
  2. target the remaining exact triples gap at `8-3-11`, likely through an honest `NKTS(24)` construction or explicit source-backed schedule
  3. broader catalog-backed patch and design families later
- Keep preferring reusable family logic or justified composition over per-cell glue.
