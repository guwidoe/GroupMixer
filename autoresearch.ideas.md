# Autoresearch ideas: solver4 32x8x10

- Refine the solver3 repeat-guidance idea away from breakout targeting (already tried and regressed): maintain explicit high-burden repeated-pair / person-incident buckets and use them to rank or focus tied local-search moves, without changing the fixed benchmark lane semantics.
- Explore other gentle constructor-side diversity ideas; the simple reverse-week-order dual seed was effectively a no-op, but broader symmetry-based seeding may still be worth testing if it stays generic.
