# Autoresearch ideas: solver5 construction heuristics

- Implement KTS / NKTS as the next major family. This should dominate the `p=3` column beyond the current prime-power RTD/affine + recursive baseline, especially for composite rows like `g=6` and `g=10`.
- Add a dedicated `p=4` router instead of hiding `p=4` inside generic lower-bound families. Treat `v mod 12` branches explicitly and keep exception handling honest.
- Consider broader RBIBD / RGDD / URD / RITD / ownSG-style patches only after KTS/NKTS and the dedicated `p=4` router are in place.
- Recursive `+G(t)` lifting is now implemented; if revisited, extend it only in ways that remain structurally family-driven rather than cell-specific.
- Keep benchmark honesty: only count score-zero constructions, and prefer explicit family routing over hardcoded matrix answers.
