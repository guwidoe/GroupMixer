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
- The finite-field resolvable `(v,4,1)`-BIBD route for `v = 3q + 1` is now landed; do not re-spend cycles on `7-4-9` / `10-4-13` unless a regression appears.
- The main remaining `p=4` exact gap is now **`9-4-11`**. The most honest live lane is a genuine `RGDD(36,4,3)`-style construction or an explicit source-backed 36-player schedule.
- The main remaining triples exact gap is now **`8-3-11`**. The best honest lane appears to be `NKTS(24)` rather than more generic cyclic shortcuts.
- Keep broader **RBIBD / RGDD / URD / RITD / ownSG** work behind the current `9-4-11` / `8-3-11` frontier push.
- Extend recursive `+G(t)` lifting only as a reusable composition operator, not as cell-specific glue.
- Keep benchmark honesty: only count score-zero constructions, keep the fixed `2..10 x 2..10` matrix unchanged, and do not hardcode matrix answers into families or patch banks.
