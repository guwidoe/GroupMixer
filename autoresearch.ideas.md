# Solver6 autoresearch ideas backlog

- Higher-level relabeling summaries or cached atom-copy contributions that remove meaningful candidate-evaluation work; avoid low-level pair-index table caching, which regressed badly.
- Add relabeling-side pruning / symmetry reduction so clearly equivalent or obviously non-competitive copy-permutation swaps are not rescored repeatedly.
- Tail-focused improvement operator for weak sparse-tail cases (`4-3-5`, `4-3-6`, similar small remainder cells).
- More selective mixed-seed candidate pruning, especially around `dominant_prefix_tail`: wholesale removal when requested tails exist was a huge runtime win but lost one squared hit, so a benchmark-honest dominance test could be high leverage.
- Reporting-side instrumentation split between seed-build time and local-search time, so the benchmark exposes the exact runtime bottleneck directly.
- Stronger structural lower bounds beyond the current two-week linear strengthening, but only if they remain mathematically honest and cheap.
