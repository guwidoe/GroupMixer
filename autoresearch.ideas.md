# Autoresearch ideas: solver4 32x8x10

- Keep the current breakout shape simple: untabued, conflict-anchored, and concentrated on the hard week. Avoid revisiting already-regressive variants such as reactive second-swap recomputation, forced cross-week spreading, or random donor-slot breakout endpoints.
- If further local-search guidance is explored, keep it **very late-stage** only. Early/medium-stagnation guidance regressed; the current promising regime is selective activation at 3+ non-improving iterations.
- If constructor work is revisited, prefer a more principled bias than the already-tried neutral/regressive variants (reverse week order, whole-group-vs-pairwise best-of-two, and arbitrary symmetry relabeling).
