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
  - early 45s probes are still `UNKNOWN`, so this is not solved yet, but it looks like a reasonable easier branch to keep testing
- Additional literature scan note:
  - modern Rees-product / ITD asymptotic RGDD papers were checked, but the clean extracted theorems there are mainly for **fixed numbers of groups with large group size**
  - that asymptotic direction does not directly give an implementable exact route for the needed small-group case `RGDD(80,4,2)` / type `2^40`

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
