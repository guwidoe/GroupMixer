# Autoresearch ideas: solver5 construction heuristics

- The constructor-portfolio scaffold is now in place. Use it rather than reintroducing ad hoc family routing or inline exception logic.
- Keep `total_constructed_weeks` as the primary objective gate; use per-cell and per-`p` metrics to understand where coverage moved.
- The broad NKTS / composite-`p=3` push has now paid off: exact `NKTS(18)`, exact `KTS(15)`, and pseudo-doubling from `KTS(15)` are in. Treat that milestone as partially complete rather than an open generic idea.
- The only clear remaining triples benchmark gap is **`8-3-11`** (24 players). Explore this only through an honest source-backed 24-player construction or a structurally justified composition.
- Do **not** retry the naive cyclic `p=3` transversal-design fallback for non-prime-power group counts; it benchmarked flat and did not produce score-zero constructions on the even composite rows.
- Build out the **general solver5 router** so every relevant `p` in the benchmark matrix trends toward a recognizable family-selection policy.
- In practice, the next under-modeled routing/family-policy gap after the current triples pass is still **`p=4`**, via catalog-backed `v mod 12` branches and explicit exception handling, but that work should land as part of the general router rather than as a one-off special router.
- Keep broader **RBIBD / RGDD / URD / RITD / ownSG** work behind the NKTS and general-router-enrichment milestones.
- Extend recursive `+G(t)` lifting only as a reusable composition operator, not as cell-specific glue.
- Keep benchmark honesty: only count score-zero constructions, keep the fixed `2..10 x 2..10` matrix unchanged, and do not hardcode matrix answers into families or patch banks.
