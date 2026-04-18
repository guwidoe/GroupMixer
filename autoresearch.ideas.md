# Autoresearch ideas: unresolved-only backlog

Only keep notes here for still-unresolved issues or for dead ends that matter to those issues.

## Active backlog
- **Primary target:** find a provenance-clean exact `20-4-26` construction, ideally via a reusable `RGDD(20,4,2)` family / `4-RGDD` of type `2^40`.
- Prefer explicit source-backed constructions, recursive theorems, or honest catalog derivations over benchmark-shaped answer imports.
- If a promising route appears in the literature, prefer implementing the reusable family semantics rather than landing a one-off `20-4` patch.

## Still-plausible lanes
- Extract an explicit or semi-explicit `4-RGDD` / `RGDD(2^u)` construction that specializes cleanly to `u = 40`.
- Find a recursive construction for `4-RGDD` of type `2^u` that can be encoded with honest ingredient designs already present or reasonably addable.
- Investigate source-backed resolvable `p=4` structures adjacent to the `RGDD(20,4,2)` literature line if they genuinely imply a reusable constructor.
- Continue the semicyclic projected-group search on 40 size-2 groups modeled as `(Z13 × Z3) ∪ {∞}` with two 13-week starter orbits. This is currently the most concrete non-RBIBD structured derivation aid on the table.
- Also probe the stricter but potentially easier subcase where the two starter orbits are identical at the projected-group level, i.e. a single starter orbit covers each pair orbit exactly twice. This is now scripted in-repo and may be a cleaner way to reach a witness.
- Keep distinguishing two different RGDD asymptotic directions:
  - `fixed u, large g` Rees/ITD recursion exists in the literature, but it does **not** directly solve the needed `g=2, u=40` case
  - the unresolved need remains a small-group explicit derivation or a recursion specialized enough to instantiate type `2^40`
- As a secondary lane only, look for stronger reusable non-prime-power square-order MOLR / MOLS theory if it improves still-open rows without degenerating into patch banking.

## Dead ends / pruning for the active target
- Do **not** retry a naive `+1 week` continuation on the current `20-4-25` schedule: the residual uncovered-pair graph is sixteen disjoint `K5` components, so no 26th week can be added by a simple leftover-pair partition.
- Do **not** assume an easy two-copy lift from the shipped `RBIBD(40,4,1)` family: affine/row-twisted pairings failed across several thousand structured variants.
- Do **not** assume an easy four-copy parity lift from the same `RBIBD(40,4,1)` family: in a 60-trial sampled CP-SAT sweep, 59 sampled instances were infeasible and the remaining one timed out without a witness.
- Treat the obvious “few-copy lift of the current `q=13` p4 RBIBD seed” story as weak unless a new structural theorem changes the model.
- In the newer semicyclic `(Z13 × Z3) ∪ {∞}` projected-group model, the stronger symmetry-broken search has now ruled out at least these week-0 infinity starters:
  - `[(0,0),(1,0),(2,0),∞]`
  - `[(0,0),(1,0),(0,1),∞]`
- Prefer the still-live mixed-layer infinity-block patterns when probing that space. Inside the vertical-first branch `[(0,0),(0,1),(0,2),∞]`, current surviving second infinity-block probes include:
  - `[(0,0),(1,1),(2,2),∞]`
  - `[(0,0),(1,1),(1,2),∞]`
  - `[(0,0),(2,1),(2,2),∞]`
  - `[(0,0),(1,1),(3,2),∞]`
  - more generally, a `10s` normalized scan found **all 39** one-per-layer second-block orbit representatives still alive (`UNKNOWN`) against the fixed vertical first block, so that family looks broad rather than brittle
- Representative disjoint mixed-layer pairs also remained alive after `300s`, including the vertical+vertical and vertical+diagonal examples `[(1,0),(1,1),(1,2),∞]`, `[(1,0),(2,1),(3,2),∞]`, and `[(1,0),(1,1),(2,2),∞]` paired with the fixed vertical first block.
- By contrast, some mixed-but-more-local second infinity blocks under that same branch are already dead, including:
  - `[(0,0),(1,0),(1,2),∞]`
  - `[(0,0),(2,0),(2,1),∞]`

## Global constraints that still matter
- Keep the benchmark fixed and honest.
- Count only score-zero pure-SGP schedules.
- Do not re-open already-met target rows unless fixing a regression or landing a broader reusable family.
- Preserve explicit provenance and report-facing family distinctions.
