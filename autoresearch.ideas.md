# Autoresearch ideas: solver4 32x8x10

- Refine the solver3 repeat-guidance idea only as a **late-stage** local-search signal: early activation already regressed, so any new repeated-pair / person-incident guidance should stay gated behind real stagnation and only affect tied moves.
- Explore gentle constructor-side diversity ideas that are more distinct than the already-tried neutral variants (reverse week order and whole-group-vs-pairwise best-of-two); broader symmetry-based seeding may still be worth testing if it stays generic.
