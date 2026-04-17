# Autoresearch: solver5 construction-heuristics coverage

## Objective
Build `solver5` as a **construction-first pure Social Golfer constructor portfolio** that routes equal-size pure-SGP `g-p-w` instances through explicit design-theoretic construction families before search is considered.

The focus in this session is **construction coverage**, not local search quality:
- accept only pure zero-repeat SGP semantics
- implement explicit constructor families, catalog-backed facts, composition operators, and portfolio routing in `solver5`
- maximize how many fixed benchmark cells admit a valid zero-repeat construction, and for each `(g, p)` maximize the constructed week count `W_g,p`

The objective gate should remain **`total_constructed_weeks`**. It is not a perfect measure of the end-state library, but it is an honest and objective proof that a proposed family/routing change actually expands or strengthens constructive coverage on the fixed benchmark regions.

The benchmark now scores three fixed matrices / regions:
- canonical matrix: `2 <= g <= 10`, `2 <= p <= 10`
- additional matrix: `11 <= g <= 20`, `2 <= p <= 10`
- additional matrix: `11 <= g <= 20`, `11 <= p <= 20`
- pure SGP semantics only

The trivial `p = 1` visual column in the first additional matrix remains
visual-only and excluded from the objective.

For each cell, the benchmark searches downward from the counting upper bound
`floor((gp - 1) / (p - 1))` and records the largest `w` for which `solver5` returns a valid zero-repeat construction.

## Metrics
- **Primary**: `total_constructed_weeks` (higher is better) — sum of constructed `W_g,p` across the three fixed benchmark regions above.
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
- Keep matrix reporting aligned to the canonical target definition plus the curated supplementary literature target file, and preserve the distinction between scored cells and visual-only cells.

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
  - catalog-backed exact NKTS / KP cases for 18 and 30 players (`6-3-8` and `10-3-14`)
  - a catalog-backed exact NKTS(24) case for 24 players (`8-3-11`)
  - pseudo-doubled NKTS constructions seeded from exact half-size KTS schedules (`10-3-13` still constructs honestly from `KTS(15)` as a weaker reusable route)
  - a catalog-backed ownSG starter-block family from Miller–Valkov–Abel Appendix A / Construction 5, currently covering:
    - fixed-matrix rows `10-6-7`, `10-7-7`, `10-8-5`, `10-9-5`
    - supplementary rows `12-7-7`, `12-8-6`, `14-6-9`, `14-7-8`, `14-8-8`, `14-9-7`, `15-6-10`, `15-7-9`, `15-9-7`, `18-7-10`, `20-6-13`
  - a catalog-backed RITD family derived from the Miller–Valkov–Abel Figure 8 `ITD(10,2;6)` block set, currently covering:
    - `10-5-9` via the paper's `RITD(10,2;5)+G(1)` route
  - a catalog-backed MOLR / MOLS lower-bound group-fill family, currently covering:
    - `10-10-4` by extending a validated `10-10-3` base schedule with one compatible latent-group filler week under the paper's `MOLRs(10,10)+G(1)` lower-bound route
  - published-schedule bank coverage for source-backed triples / higher-`p` exceptions, including:
    - `8-3-10`
    - `6-4-7` (with one documented transcription correction on the archived source)
    - `8-4-10`
    - `9-4-11`
    - `10-4-9`
    - `6-5-6`, `6-6-3`
    - `10-5-7`, `10-6-6`, `10-7-5`, `10-8-4`, `10-9-3`, `10-10-3`
  - prime-power RTD / MOLS-style transversal-design constructors for `3 <= p <= g`, now including supported field orders `11`, `16`, `17`, and `19` in addition to the earlier small orders
  - prime-power affine-plane constructors for `p = g`, now including the supplementary benchmark diagonal cases at orders `11`, `16`, `17`, and `19`
  - recursive `+G(t)`-style lifting across RTD latent groups when `p | g` and the smaller `(g/p)-p-*` instance is already constructible
  - a universal single-round partition family for any divisible pure-SGP instance, used as an honest reusable `W=1` lower bound when no stronger family applies
- Active kept benchmark baseline under the *old* canonical-only benchmark was:
  - commit: `b250b32`
  - `total_constructed_weeks = 419`
  - `frontier_gap_sum = 167`
  - `solved_cells = 81`
  - `exact_frontier_cells = 26`
  - `unsolved_cells = 0`
  - `p2_constructed_weeks = 99`
  - `p3_constructed_weeks = 72`
  - `p4_constructed_weeks = 62`
  - `p5_constructed_weeks = 48`
  - `p6_constructed_weeks = 38`
  - `p7_constructed_weeks = 37`
  - `p8_constructed_weeks = 29`
  - `p9_constructed_weeks = 22`
  - `p10_constructed_weeks = 12`
- After expanding the benchmark to all three matrices, that `419` value is only a
  historical canonical-only reference.
- Active kept three-matrix benchmark baseline is now:
  - commit: `2c2badc`
  - `total_constructed_weeks = 1995`
  - `frontier_gap_sum = 1970`
  - `solved_cells = 271`
  - `exact_frontier_cells = 46`
  - `unsolved_cells = 0`
  - `p6_constructed_weeks = 148`
  - `p7_constructed_weeks = 148`
  - `p8_constructed_weeks = 122`
  - `p9_constructed_weeks = 115`
  - `W_12_7 = 7`
  - `W_12_8 = 6`
  - `W_14_6 = 9`
  - `W_14_7 = 8`
  - `W_14_8 = 8`
  - `W_14_9 = 7`
  - `W_15_6 = 10`
  - `W_15_7 = 9`
  - `W_15_9 = 7`
  - `W_18_7 = 10`
  - `W_20_6 = 13`
- The recent three-matrix keeps that established this baseline were:
  - `4077a77` — finite-field support for `11`, `16`, `17`, `19` → `1906`
  - `bfdbfc7` — `GF(25)` / exact `19-4-25` → `1912`
  - `17dc468` — larger Appendix-backed ownSG catalog expansion → `1990`
  - `2c2badc` — direct Appendix-backed `ownSG(96,8)` / `12-8-6` → `1995`

## What's Been Tried
- Initial setup established the solver5 scaffold, validator, engine registration, benchmark harness, and the round-robin baseline.
- Prime-order RTD / affine-plane constructors were added first, then generalized to supported prime-power orders `4`, `8`, and `9` via finite-field arithmetic. Under the three-matrix benchmark this was later extended to the additional benchmark-relevant orders `11`, `16`, `17`, `19`, and `25` (with `25` specifically unlocking the `19-4-25` p4 RBIBD line).
- Recursive lifting across RTD latent groups is now a live mechanism and should be judged structurally, not as a one-off `9-3-13` trick.
- Kirkman `6t+1` is now part of the constructive baseline for supported `p=3` cases.
- The constructor-portfolio architecture pass is complete: registry, metadata, catalog layer, registry-driven router, handoff seam, and portfolio docs are now in place.
- A naive cyclic `p=3` transversal-design fallback for non-prime-power group counts was tried and discarded: it left `total_constructed_weeks` flat at `284`, so the cheap cyclic schedule does **not** unlock the even composite triple rows (`6-3-*`, `10-3-*`). Do not retry that shortcut.
- Catalog-backed small triple families now move the benchmark honestly:
  - exact `NKTS(18)` raised `6-3` coverage to `8`
  - exact `NKTS(24)` now closes `8-3` at `11`
  - exact `KTS(15)` now solves `5-3-7`
  - a pseudo-doubling construction from `KTS(15)` solves `10-3-13`
  - an explicit thesis-reproduced `KP(30,14)` direct construction now closes `10-3` exactly at `14`
- Published explicit schedules are now a major honest coverage source:
  - Warwick Harvey archive cases now cover `8-3-10`, `10-4-9`, `6-5-6`, `6-6-3`, and the `10-p-*` rows for `p=5..10`
  - the archived `6-4-7` page entry had one obvious duplicated-player typo; a single-entry correction (`[1, 5, 16, 19] -> [1, 7, 16, 19]`) restores a valid pure-SGP schedule and is now documented inline in the catalog
  - Alejandro Aguado's explicit `8-4-10` construction replaced the weaker `8-4-9` source-backed patch
  - Ian Wakeling's explicit `9-4-11` schedule from the 2010 DeVenezia forum closes the remaining `9-4` scored target gap exactly
- The Warwick archive appears exhausted for benchmark-relevant improvements inside the fixed `2..10 x 2..10` matrix after landing the `6-4`, `6-5`, `6-6`, `8-3`, `8-4`, `10-4`, and `10-p` (`p>=5`) cases above.
- The triples frontier in the fixed matrix is now closed: `8-3-11` is covered by an exact catalog-backed `NKTS(24)` schedule synthesized in solver5 from a cyclic orbit cover plus week assignment. Do not re-spend cycles rediscovering generic 24-player triples unless a broader reusable family beyond the benchmark cell appears.
- The `p=4` scored frontier in the fixed matrix is now also closed: `9-4-11` is covered by an explicit source-backed 36-player 11-round schedule. Do not treat `9-4-11` as a live gap anymore.
- The ownSG starter-block family has now subsumed several weaker large-row published schedules inside the fixed matrix and has become a major supplementary-region lane:
  - fixed-matrix improvements: `10-6: 6 -> 7`, `10-7: 5 -> 7`, `10-8: 4 -> 5`, `10-9: 3 -> 5`
  - supplementary-region improvements: `12-7: 1 -> 7`, `12-8: 1 -> 6`, `14-6: 1 -> 9`, `14-7: 1 -> 8`, `14-8: 1 -> 8`, `14-9: 1 -> 7`, `15-6: 1 -> 10`, `15-7: 1 -> 9`, `15-9: 1 -> 7`, `18-7: 1 -> 10`, `20-6: 1 -> 13`
  - direct Appendix-backed ownSG catalog expansion is now a proven strong lane; the stale part was the older modulo/quotient projection heuristic, not the literature-backed starter-block family itself
- A catalog-backed RITD route from the paper's `ITD(10,2;6)` block set is now landed for the benchmark-relevant `10-5` case:
  - `10-5: 7 -> 9` via `RITD(10,2;5)+G(1)`
  - this should be treated as a reusable literature-structured family, not as another opaque published-schedule patch
- A catalog-backed MOLR / MOLS lower-bound route is now landed for the benchmark-relevant `10-10` case:
  - `10-10: 3 -> 4` via a compatible latent-group filler week on top of the validated published `10-10-3` base, matching the paper's `MOLRs(10,10)+G(1)` lower-bound line
  - the cyclic order-10 Latin-square route was explicitly ruled out earlier; the shipped constructor instead stores the recovered filler partition as a provenance-aware catalog case and constructs the 4-week schedule deterministically
- Remaining live directions should stay structural constructor families, not search-based cheating:
  - reusable RBIBD / RGDD family work that explains or subsumes current exact catalog cases beyond the fixed matrix
  - broader non-prime-power square-order MOLR / MOLS lower-bound work only when it remains provenance-aware and genuinely reusable beyond the fixed matrix
  - broader RBIBD / RGDD / URD / RITD / ownSG-style patches only after the highest-ROI family-policy gaps are exhausted

## Immediate Next Loop Behavior
- The old canonical-only `419` baseline is historical only; the live gate is the three-matrix baseline at `1995` on `2c2badc`.
- The fixed scored matrix frontier remains closed; do not re-spend loop time on already-landed canonical frontier cells.
- The universal single-round lower bound remains the honest floor for unsolved theory rows:
  - `unsolved_cells = 0`
  - many weak composite supplementary rows still sit at only `W=1`
- The strongest recent reusable gain lane has been **direct Appendix-backed ownSG catalog expansion** for supplementary composite rows. That lane is now partially harvested through `12-8`, so remaining work should target either:
  1. more reusable composition on top of shipped families (for example honest latent-group `+G` lifts where the literature explicitly permits them), or
  2. broader family work for the still-weak composite rows, especially `p=3` / `p=4` and other non-prime-power cases on `g in {12,14,15,18,20}`.
- The next concrete experiment should prefer a reusable structural step over another raw patch import. The most plausible immediate follow-up is to test whether the existing latent-group lift machinery should also use the already-shipped single-round partition fallback, which could honestly realize documented `+G(1)` improvements like `ownSG(98,7)+G(1)` and any analogous RTD/ownSG cases where `p | g` but the smaller `(g/p)-p-*` instance currently has only the universal one-week lower bound.
- A follow-up attempt to add `MOLRs(6,6)+G(1)` as a second `molr_group_fill` catalog case benchmarked flat at `419`: it cleanly reconstructs the already-shipped `6-6-3` schedule via a 2-week base plus one filler week, but it does **not** improve the objective beyond the existing published route. Treat that lane as provenance cleanup only, not as an active coverage-improvement direction.
- Keep preferring reusable family logic or justified composition over per-cell glue.
