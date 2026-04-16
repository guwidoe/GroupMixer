# Autoresearch ideas: solver5 construction heuristics

- The constructor-portfolio scaffold is now in place. Use it rather than reintroducing ad hoc family routing or inline exception logic.
- Keep `total_constructed_weeks` as the primary objective gate; use per-cell and per-`p` metrics to understand where coverage moved.
- The broad NKTS / composite-`p=3` push has now paid off: exact `NKTS(18)`, exact `KTS(15)`, and pseudo-doubling from `KTS(15)` are in. Treat that milestone as partially complete rather than an open generic idea.
- The only clear remaining triples benchmark gap is **`8-3-11`** (24 players). Explore this only through an honest source-backed 24-player construction or a structurally justified composition.
- The Warwick Harvey archive has now been mined for all benchmark-relevant improvements currently visible in the fixed matrix. Do not keep rescanning it as if it still contains untouched easy wins.
- The published-schedule bank is now a real portfolio component, not just a one-off patch lane. Preserve explicit provenance per schedule and keep any transcription repairs extremely narrow, documented, and validity-checked.
- Do **not** retry the naive cyclic `p=3` transversal-design fallback for non-prime-power group counts; it benchmarked flat and did not produce score-zero constructions on the even composite rows.
- Build out the **general solver5 router** so every relevant `p` in the benchmark matrix trends toward a recognizable family-selection policy.
- In practice, the next highest-ROI constructive gap is now **`p=4`**. Prioritize reusable theorem-family work over more patch-bank hunting.
- The current best live theorem-family lane is the finite-field resolvable `(v,4,1)`-BIBD route for `v = 3q + 1` with `q` a supported prime power. In the benchmark this directly targets `7-4-9` and `10-4-13` honestly through one reusable construction story.
- After the `v = 3q + 1` RBIBD lane, the main remaining `p=4` gap is **`9-4-11`**. That likely needs a different RGDD / RBIBD / URD-style family or a source-backed explicit schedule; do not pretend the current finite-field lane covers it.
- Keep broader **RBIBD / RGDD / URD / RITD / ownSG** work behind the current finite-field `p=4` family push.
- Extend recursive `+G(t)` lifting only as a reusable composition operator, not as cell-specific glue.
- Keep benchmark honesty: only count score-zero constructions, keep the fixed `2..10 x 2..10` matrix unchanged, and do not hardcode matrix answers into families or patch banks.
