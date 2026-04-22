# Solver6 autoresearch ideas backlog

- Recover runtime inside the new incremental exact-block relabeling path while preserving its improved linear quality profile (`1455` linear hits / `4318` gap), especially by cutting repeated candidate-evaluation work rather than reverting to the older weaker path.
- Higher-level relabeling summaries or cached atom-copy contributions that remove meaningful candidate-evaluation work; avoid pair-index table caching and other memory-heavy low-level schemes, which regressed badly.
- Add relabeling-side pruning / symmetry reduction so clearly equivalent or obviously non-competitive copy-permutation swaps are not rescored repeatedly.
- More selective mixed-seed candidate pruning: dominant-prefix-tail warm-starting landed, but wholesale removal when requested tails exist lost one squared hit, so only benchmark-honest dominance tests remain interesting there.
- Tail-focused improvement operator for weak sparse-tail cases (`4-3-5`, `4-3-6`, similar small remainder cells).
- Reporting-side instrumentation split between seed-build time and local-search time, so the benchmark exposes the exact runtime bottleneck directly.
- Stronger structural lower bounds beyond the current two-week linear strengthening, but only if they remain mathematically honest and cheap.

## De-emphasized / recently negative

- Final exact-block seed-packaging micro-optimizations that update pair telemetry inline during schedule materialization: the direct pair-state maintenance experiment regressed runtime.
- Repeating previously failed lanes: shared prefix `PairFrequencyState` wrappers across mixed-tail candidates, heuristic-tail closed-form increment math substitution, reusing final exact-block packaged pair-state, early-return prune after first optimum-reaching swap, full `PairUniverse` pair-index table caching, simple source-equivalence symmetry pruning, or dropping `dominant_prefix_tail` whenever requested-tail exists.
