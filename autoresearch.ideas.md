# Autoresearch ideas: solver3 broad multiseed quality

- Revisit adaptive move-family choice using broader multiseed evidence instead of single-seed Sailing Trip behavior alone.
- If family selection remains unstable, try chooser signals built from short-window accepted-improvement rate, not just raw candidate/preview utility.
- Re-measure whether sampled `swap` should keep `preview_swap_runtime_trusted(...)` or return to checked preview for better quality/throughput tradeoffs.
- Investigate whether time-limited broad-lane quality improves with slightly different exploration pressure or diversification cadence instead of more aggressive local descent.
- Consider lightweight per-family floor allocation / exploration guarantees if the chooser still starves structurally important families.
- If one or two cases dominate broad regressions, inspect their family-usage telemetry and acceptance mix before changing policy.
- If hotpath metrics improve but broad quality drops, prefer instrumentation and diagnosis over immediately shipping the faster path.
