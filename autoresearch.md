# Autoresearch: solver5 unresolved construction coverage

## Active Objective
Continue `solver5` as a construction-first pure Social Golfer portfolio, but keep loop time focused only on **still-unresolved benchmark gaps**.

Current hard gate:
- **Primary metric:** `total_constructed_weeks` (higher is better)

Current benchmark regions:
- canonical matrix: `2 <= g <= 10`, `2 <= p <= 10`
- additional matrix: `11 <= g <= 20`, `2 <= p <= 10`
- additional matrix: `11 <= g <= 20`, `11 <= p <= 20`
- `p = 1` supplementary column remains visual-only

Run command:
- `./autoresearch.sh`

The script:
1. runs focused `solver5` tests
2. runs `backend/core/examples/solver5_construction_coverage.rs`
3. writes `autoresearch.last_run_metrics.json`
4. regenerates `autoresearch.last_run_report.html`

## Active Baseline
Current kept benchmark baseline:
- commit: `6f9a561`
- `total_constructed_weeks = 2505`
- `frontier_gap_sum = 1460`
- `solved_cells = 271`
- `exact_frontier_cells = 54`
- `unsolved_cells = 0`

Important still-open row near the current frontier:
- `W_20_4 = 25`
- literature target / basis row indicates `RGDD(20,4,2)` with `26` weeks is plausible

## What Is Still Unresolved
The main live target is now:
1. **`20-4`** — seek a provenance-clean exact `26`-week construction, ideally via a reusable `RGDD(20,4,2)` family or an explicit source-backed derivation that can be represented honestly in solver5.

Secondary unresolved directions only if they become genuinely promising:
- broader reusable `p=4` RGDD / RBIBD theory beyond the current `20-4-25` lower bound
- source-backed resolvable designs or recursive constructions that improve benchmark cells not already closed exactly
- stronger reusable non-prime-power square-order MOLR / MOLS theory only if it improves still-open rows without turning into a patch bank

## Constraints
- `solver5` must remain **pure-SGP only**.
- Count only score-zero schedules.
- Keep the benchmark fixed and honest.
- Prefer explicit constructor families, catalog-backed derivations, and honest composition over opaque search fallback.
- Do not re-open already-met target rows unless fixing a regression or landing a broader reusable family.
- Preserve explicit provenance in reporting and family metadata.

## Settled Context To Preserve
These are no longer active targets, but they are important assumptions for future work:
- the fixed scored matrix frontier is closed
- triples work is no longer the main backlog; exact `NKTS(60)` / `20-3-29` is landed
- order-20 high-`p` QDM / explicit-MOLS floor work is landed and not an active target
- `20-5-21` via the QDM-backed RTD route is landed and should not regress
- router precedence should still prefer stronger exact/source-backed routes over weaker lower bounds

## Active Research Notes
### `20-4` / `RGDD(20,4,2)`
- The strongest current shipped route for `20-4` is the theorem-backed direct-product MOLS construction at `25` weeks.
- The clearest benchmark-relevant remaining delta is therefore `25 -> 26` on `20-4`.
- Literature notes in the local survey point to `RGDD(20,4,2)` as the natural exact/maximal structure for this row.
- Stronger literature status note:
  - this is no longer just a vague target-row hint; the later `Resolvable group divisible designs with block size four and general index` existence line appears to make type `2^40` with index `2` an existence-supported case
  - so the remaining gap is increasingly about finding or reconstructing an **implementable constructive payload**, not about whether the case is believed to exist at all

### Negative results already established for `20-4`
- The current `20-4-25` product-bank schedule does **not** admit a trivial extra week:
  - its uncovered-pair graph is a 4-regular union of sixteen disjoint `K5` components
  - therefore there is no possible 26th week obtained by simply partitioning leftover pairs into twenty 4-cliques
- A two-copy RBIBD lift looks weak:
  - pairing the shipped `RBIBD(40,4,1)` schedule with a second affine/row-twisted copy did not yield a solvable parity lift to 80 players across several thousand structured variants
- A four-copy RBIBD lift also looks weak:
  - modeling `RGDD(20,4,2)` as a 26-week parity lift of four `RBIBD(40,4,1)` copies gave 59 infeasible instances out of a 60-trial sampled CP-SAT sweep, with the remaining trial timing out and no witness found
- Conclusion:
  - do **not** keep retrying “add one more week to the current 25-week base”
  - do **not** assume an easy parity-lift from a small number of copies of the current `q=13` p4 RBIBD family
  - the remaining promising lane is a genuinely different `RGDD(2^40)` source, recursion, or explicit constructive derivation

### New structured search direction
- A more general semicyclic search model now looks worth continuing as a derivation aid:
  - represent the 40 size-2 RGDD groups as `(Z13 × Z3) ∪ {∞}`
  - search for two 13-week starter orbits whose developments would realize the 26 projected weeks for `20-4`
  - at the projected-group level this becomes a constrained exact-cover / multicover problem on 40 groups and 60 pair orbits
- Early signal from that model:
  - the projected-group formulation is **not** immediately infeasible under mixed infinity-block patterns
  - some starter-block patterns are now ruled out quickly under the stronger in-repo symmetry-broken search:
    - `[(0,0),(1,0),(2,0),∞]` is infeasible
    - `[(0,0),(1,0),(0,1),∞]` is also infeasible
  - but other mixed-layer starters remain alive after 60s-scale CP-SAT probes, e.g.:
    - `[(0,0),(0,1),(0,2),∞]`
    - `[(0,0),(1,1),(2,2),∞]`
- More recent narrowing inside the `[(0,0),(0,1),(0,2),∞]` branch:
  - forcing a second week-0 infinity block of shape `[(0,0),(1,0),(1,2),∞]` is infeasible
  - forcing a second week-0 infinity block of shape `[(0,0),(2,0),(2,1),∞]` is infeasible
  - several cleaner mixed-layer second infinity blocks are still alive after 45–60s probes, including:
    - `[(0,0),(1,1),(2,2),∞]`
    - `[(0,0),(1,1),(1,2),∞]`
    - `[(0,0),(2,1),(2,2),∞]`
    - `[(0,0),(1,1),(3,2),∞]`
- A broader normalized scan of the **one-point-from-each-layer** second infinity-block family has now been run against the fixed vertical first block `[(0,0),(0,1),(0,2),∞]`:
  - all `39` normalized orbit representatives survived a `10s` probe with status `UNKNOWN`
  - so, within that structured family, there is currently **no quick infeasibility signal**; deeper runs are needed rather than more shallow pruning
- Deeper `300s` probes on representative disjoint mixed-layer pairs also remained alive (`UNKNOWN`), including:
  - `[(0,0),(0,1),(0,2),∞]` with `[(1,0),(1,1),(1,2),∞]`
  - `[(0,0),(0,1),(0,2),∞]` with `[(1,0),(2,1),(3,2),∞]`
  - `[(0,0),(0,1),(0,2),∞]` with `[(1,0),(1,1),(2,2),∞]`
- This is still only a research lead, not yet a landed family or witness.
- New tighter computational subcase now under active probing:
  - search for a **single** 13-week starter orbit whose projected pair-orbit counts are all exactly `2`
  - if such a starter exists, duplicating that orbit would satisfy the projected total `4`-coverage target and could yield an easier label-liftable witness than the unconstrained two-starter search
  - this subcase is now materially narrower than the unconstrained two-starter search:
    - a `10s` normalized infinity-block scan (with the week normalized by requiring some infinity block through ordinary group `0`) ruled out **31** orbit representatives immediately and left only **8** non-vertical reps alive (`UNKNOWN`)
    - the surviving normalized non-vertical infinity-block reps are exactly:
      - `[(0,0),(0,1),(1,2),∞]`
      - `[(0,0),(1,1),(1,2),∞]`
      - `[(0,0),(1,1),(2,2),∞]`
      - `[(0,0),(1,1),(3,2),∞]`
      - `[(0,0),(1,1),(4,2),∞]`
      - `[(0,0),(1,1),(5,2),∞]`
      - `[(0,0),(1,1),(6,2),∞]`
      - `[(0,0),(1,1),(12,2),∞]`
    - the vertical case `[(0,0),(0,1),(0,2),∞]` is also separately known to stay alive from longer direct probes and should remain in scope
    - representative `60s` follow-up probes on all eight surviving non-vertical reps still came back `UNKNOWN`
    - fixing the vertical block `[(0,0),(0,1),(0,2),∞]` together with any one of those eight surviving non-vertical second infinity-block patterns also stayed alive at `20s`
    - deeper `10s` second-infinity-block scans now show that not all surviving first blocks are equally permissive:
      - with first block `[(0,0),(0,1),(1,2),∞]`, only the vertical block is pruned quickly so far; the scan finished with `38/39` second-block reps still `UNKNOWN`
      - with first block `[(0,0),(1,1),(2,2),∞]`, exactly three quick dead second blocks are now known: the vertical block, `[(0,0),(0,1),(1,2),∞]`, and `[(0,0),(1,1),(1,2),∞]`; the other `36/39` second-block reps remained `UNKNOWN`
  - this suggests the doubled-single-starter branch has internal structure: the side-case `[(0,0),(0,1),(1,2),∞]` looks broad, while some diagonal-style first blocks already force a small forbidden set of nearby second blocks
  - deeper `300s` pair probes are still leaving multiple structurally different pair patterns alive, for example:
    - side + shifted-diagonal: `[(0,0),(0,1),(1,2),∞]` with `[(1,0),(1,1),(1,2),∞]`
    - far-diagonal + shifted-diagonal: `[(0,0),(1,1),(12,2),∞]` with `[(1,0),(1,1),(1,2),∞]`
    - diagonal + later diagonal: `[(0,0),(1,1),(3,2),∞]` with `[(0,0),(1,1),(4,2),∞]`
    - diagonal + later diagonal: `[(0,0),(1,1),(3,2),∞]` with `[(0,0),(1,1),(5,2),∞]`
  - more specifically, the diagonal-style family now shows a clear **nested forbidden-prefix** pattern under `10s` second-block scans:
    - first `[(0,0),(1,1),(2,2),∞]` quickly forbids `{ vertical, side, diag-1 }`
    - first `[(0,0),(1,1),(3,2),∞]` quickly forbids `{ vertical, side, diag-1, diag-2 }`
    - first `[(0,0),(1,1),(4,2),∞]` quickly forbids `{ vertical, side, diag-1, diag-2, diag-3 }`
    - first `[(0,0),(1,1),(5,2),∞]` quickly forbids `{ vertical, side, diag-1, diag-2, diag-3, diag-4 }`
    - this nested pattern is now confirmed further out in the same family:
      - first `[(0,0),(1,1),(12,2),∞]` quickly forbids `{ vertical, side, diag-1, diag-2, diag-3, diag-4, diag-5, diag-6 }` under a finished `10s` scan, while `31/39` second-block reps still remain alive
      - the ongoing scan for first `[(0,0),(1,1),(6,2),∞]` is so far consistent with the same pattern, already killing the earlier diagonal cases quickly
  - in this doubled-single-starter model, each projected group appears exactly twice per week, so the infinity group must lie in **exactly two** starter blocks; that means the meaningful search object is a *pair* of infinity blocks, not a larger infinity-block set
  - so this stricter branch is promising because it is now **small enough to enumerate and deepen**, even though no witness has appeared yet
- Additional literature scan note:
  - modern Rees-product / ITD asymptotic RGDD papers were checked, but the clean extracted theorems there are mainly for **fixed numbers of groups with large group size**
  - that asymptotic direction does not directly give an implementable exact route for the needed small-group case `RGDD(80,4,2)` / type `2^40`
  - local frame-survey notes also rule out a direct ordinary `4`-frame route for this target: Theorem 4.1 there requires `4`-frames of type `h^u` to have `h ≡ 0 (mod 3)`, so the desired group size `h=2` is outside the basic `4`-frame existence line
- New source-backed constructive lead from Cao–Ma 2011 (`doi:10.1360/012010-463`):
  - Theorem 31 gives a `(4,2)`-SRGDD of type `2^u` for `u ≡ 4 (mod 6)`, which includes `u = 40`
  - in the paper's proof sketch, the `u = 40` case specializes to the chain `u = 3v + 1` with `v = 13`, so the target is reduced to a `(4,2)`-SF of type `6^13`
  - Theorems 29/30 in the same paper then point further back to a `4`-frame of type `3^13`
  - so the current semicyclic `(Z13 × Z3)` research is now aligned with an explicit literature proof chain rather than being only an ad-hoc search direction
  - however, this still does **not** hand us an explicit starter list for `u = 40`; we still need to reconstruct or synthesize the concrete `3^13` / `6^13` ingredient honestly
- New in-repo derivation aid:
  - `tools/autoresearch/solver5-construction/research/frame3_13_search.py` now probes a cyclic week-0 starter for a `4`-frame of type `3^13`
  - the stricter cyclic `4`-frame ingredient also remains computationally alive after deeper runs:
    - an unforced `300s` run still returned `UNKNOWN`
    - a later unforced `900s` run also still returned `UNKNOWN`
    - forcing `[(1,0),(2,1),(3,2),(4,0)]` also remained `UNKNOWN` at `300s`
    - forcing `[(1,0),(2,0),(3,1),(4,2)]` also remained `UNKNOWN` at `300s`
    - forcing `[(1,0),(2,1),(3,1),(4,2)]` also remained `UNKNOWN` at `600s`
  - early forced-block probes already show nontrivial local structure in that smaller frame model:
    - `[(1,0),(2,0),(3,1),(4,1)]` is infeasible within seconds
    - `[(1,0),(2,0),(3,0),(4,1)]` is also infeasible within seconds
    - more mixed-layer patterns such as `[(1,0),(2,0),(3,1),(4,2)]`, `[(1,0),(2,1),(3,1),(4,2)]`, and `[(1,0),(2,1),(3,2),(4,0)]` remain alive at short time limits
  - a new normalized first-block scan on the `4-F(3^13)` ingredient gives a stronger local pattern:
    - among the first `40` normalized representatives at `8s`, exactly `20` are already `INFEASIBLE`
    - in particular, every scanned block of the form `[(1,0),(2,0),(3,0),(d,*)]` with `d ∈ {4,...,12}` died quickly
    - by contrast, many neighboring mixed-layer blocks of the form `[(1,0),(2,0),(3,1),(d,*)]` remained `UNKNOWN`, with only a few quick dead exceptions so far (`[(1,0),(2,0),(3,1),(4,1)]` and `[(1,0),(2,0),(3,1),(8,0)]` in the first scanned tranche)

## Next Loop Guidance
Preferred order:
1. source-mine or derive a genuine `RGDD(20,4,2)` / `4-RGDD of type 2^40` construction
2. if a clean theorem-backed recursion appears, implement it as a reusable family rather than a one-off row patch
3. only use search as a derivation aid for a clearly structured construction, not as the construction itself

Validation order for any real candidate:
1. targeted family/router/solver tests
2. full `cargo test -q -p gm-core solver5::tests -- --nocapture`
3. `run_experiment(command="./autoresearch.sh", timeout_seconds=1200, checks_timeout_seconds=300)`
4. `log_experiment(...)` with the accepted secondary-metric subset only

## Files In Scope
- `backend/core/src/solver5/**`
- `backend/core/examples/solver5_construction_coverage.rs`
- `tools/autoresearch/solver5-construction/**`
- `autoresearch.md`
- `autoresearch.ideas.md`
- `construction_heuristics_research.md`
