# Solver6 autoresearch ideas backlog

- Incremental exact-block relabeling evaluator: avoid rebuilding and rescoring the full composed seed for every person swap candidate.
- Cache atom-copy pair contributions so relabeling search can update only the affected repeated-pair deltas.
- Add relabeling-side pruning / symmetry reduction so equivalent swaps are not rescored repeatedly.
- Tail-focused improvement operator for weak sparse-tail cases (`4-3-5`, `4-3-6`, similar small remainder cells).
- Smarter mixed-seed candidate pruning so obviously dominated tail families do not need full telemetry recomputation.
- Reporting-side instrumentation split between seed-build time and local-search time, so the benchmark exposes the exact runtime bottleneck directly.
- Stronger structural lower bounds beyond the current two-week linear strengthening, but only if they remain mathematically honest and cheap.
