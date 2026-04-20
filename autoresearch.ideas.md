# Autoresearch ideas: unresolved-only backlog

Only keep notes here for still-unresolved issues or for dead ends that matter to those issues.

## Active backlog
- **Primary target:** find a provenance-clean exact `20-4-26` construction, ideally via a reusable `RGDD(20,4,2)` family / `4-RGDD` of type `2^40`.
- Treat `RGDD(20,4,2)` as existence-supported by the literature line; the missing ingredient is a recoverable constructive witness or recursive instantiation we can encode honestly.
- Prefer explicit source-backed constructions, recursive theorems, or honest catalog derivations over benchmark-shaped answer imports.
- If a promising route appears in the literature, prefer implementing the reusable family semantics rather than landing a one-off `20-4` patch.

## Still-plausible lanes
- Extract an explicit or semi-explicit `4-RGDD` / `RGDD(2^u)` construction that specializes cleanly to `u = 40`.
- Use the newly recovered Cao–Ma 2011 proof chain as a guide: `SRGDD(2^40)` -> `SF(6^13)` -> `4-F(3^13)`. This does not solve the explicit payload yet, but it gives a concrete smaller ingredient target that matches the current `(Z13 × Z3)` semicyclic viewpoint.
- Find a recursive construction for `4-RGDD` of type `2^u` that can be encoded with honest ingredient designs already present or reasonably addable.
- Investigate source-backed resolvable `p=4` structures adjacent to the `RGDD(20,4,2)` literature line if they genuinely imply a reusable constructor.
- Continue the semicyclic projected-group search on 40 size-2 groups modeled as `(Z13 × Z3) ∪ {∞}` with two 13-week starter orbits. This is currently the most concrete non-RBIBD structured derivation aid on the table.
- Also probe the stricter but potentially easier subcase where the two starter orbits are identical at the projected-group level, i.e. a single starter orbit covers each pair orbit exactly twice. This is now scripted in-repo and may be a cleaner way to reach a witness.
- In parallel, probe a smaller cyclic `4`-frame ingredient directly on `Z13 × Z3`: `tools/autoresearch/solver5-construction/research/frame3_13_search.py` searches for a cyclic week-0 starter of type `3^13`, which would support the Cao–Ma `SF(6^13)` -> `SRGDD(2^40)` chain.
- Initial frame-level forced-block signal is already useful: simple local patterns like `[(1,0),(2,0),(3,1),(4,1)]` and `[(1,0),(2,0),(3,0),(4,1)]` die quickly, while more mixed-layer patterns remain alive under short probes.
- The new normalized first-block scan on `4-F(3^13)` sharpens that picture further:
  - first `40` normalized reps at `8s` split exactly `20 infeasible / 20 unknown`
  - every scanned all-layer-0 pattern `[(1,0),(2,0),(3,0),(d,*)]` with `d=4..12` died quickly
  - the nearby mixed-layer family `[(1,0),(2,0),(3,1),(d,*)]` is much more alive, with only isolated dead cases found so far
  - this suggests a promising rule of thumb for the smaller ingredient: avoid heavily same-layer local starters and favor mixed-layer starters when deepening.
- The smaller frame search is not collapsing immediately under depth either:
  - unforced cyclic `4-F(3^13)` search stayed `UNKNOWN` at `300s` and again at `900s`
  - forced `[(1,0),(2,1),(3,2),(4,0)]` stayed `UNKNOWN` at `300s`
  - forced `[(1,0),(2,0),(3,1),(4,2)]` stayed `UNKNOWN` at `300s`
  - forced `[(1,0),(2,1),(3,1),(4,2)]` stayed `UNKNOWN` at `600s`
  - so this ingredient lane now looks like a serious companion to the larger `20-4` projected-group search, not just a toy side check.
- That doubled-single-starter branch is now significantly narrowed: a `10s` normalized infinity-block scan killed `31` reps quickly and left only `8` non-vertical survivors, all of shape `[(0,0),(1,1),(c,2),∞]` for `c ∈ {1,2,3,4,5,6,12}` plus the side case `[(0,0),(0,1),(1,2),∞]`, with the vertical case `[(0,0),(0,1),(0,2),∞]` also still alive from separate direct runs. Interpret these as surviving normalized infinity-block patterns inside the doubled-single-starter ansatz, not as a completed witness.
- Finished second-block scans now separate the survivors further:
  - first block `[(0,0),(0,1),(1,2),∞]` is broad (`38/39` second-block reps still alive after `10s`; only the vertical block dies quickly)
  - the diagonal-style family has a nested dead-prefix pattern:
    - first `[(0,0),(1,1),(2,2),∞]` kills `{vertical, side, diag-1}`
    - first `[(0,0),(1,1),(3,2),∞]` kills `{vertical, side, diag-1, diag-2}`
    - first `[(0,0),(1,1),(4,2),∞]` kills `{vertical, side, diag-1, diag-2, diag-3}`
    - first `[(0,0),(1,1),(5,2),∞]` kills `{vertical, side, diag-1, diag-2, diag-3, diag-4}`
  - the pattern is now confirmed further out: first `[(0,0),(1,1),(12,2),∞]` already kills `{vertical, side, diag-1, diag-2, diag-3, diag-4, diag-5, diag-6}` and still leaves `31/39` second-block reps alive after `10s`
  - first `[(0,0),(1,1),(6,2),∞]` now also looks consistent with the same pattern, already killing the earlier diagonal-prefix family and leaving a large live tail
  - several `300s` pair probes across both diagonal-only and shifted-diagonal mixes still remain alive (`UNKNOWN`), so the narrowed branch still contains multiple plausible structural subfamilies.
- The immediate next computation on that narrowed branch is now clear: keep the vertical block fixed and deepen the `8` surviving second-block patterns rather than reopening the full 39/40-pattern search.
- Remember that in the doubled-single-starter week model the infinity group has degree `2`, so only **pairs** of infinity blocks matter. Do not waste more loop time probing triples of infinity blocks there.
- Keep distinguishing two different RGDD asymptotic directions:
  - `fixed u, large g` Rees/ITD recursion exists in the literature, but it does **not** directly solve the needed `g=2, u=40` case
  - the unresolved need remains a small-group explicit derivation or a recursion specialized enough to instantiate type `2^40`
- Prune the most naive ordinary `4`-frame reading of the frame literature: the local survey’s Theorem 4.1 requires type `h^u` with `h ≡ 0 (mod 3)`, so it does not directly apply to the desired type `2^40`.
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
