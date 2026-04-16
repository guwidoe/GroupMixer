# Autoresearch ideas: solver5 construction heuristics

- Implement KTS / NKTS as the next major family after round robin. This should dominate the `p=3` column and is one of the biggest coverage-per-effort wins.
- Add a dedicated `p=4` router instead of hiding `p=4` inside a generic fallback. Treat `v mod 12` branches explicitly and keep exception handling honest.
- Add an RTD / MOLS engine for prime and then prime-power group counts. This should unlock broad lower-bound coverage across many `p >= 5` cells.
- Once at least one nontrivial family exists beyond round robin, add recursive `+G(t)` lifting so clique/group decompositions can append smaller constructed instances automatically.
- Keep benchmark honesty: only count score-zero constructions, and prefer explicit family routing over hardcoded matrix answers.
