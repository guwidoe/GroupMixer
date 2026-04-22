# Solver6 autoresearch ideas backlog

- Cache atom-copy pair contributions or other relabeling-side summaries so candidate swap evaluation can drop more `pair_index` / permutation-lookup overhead.
- Add relabeling-side pruning / symmetry reduction so clearly equivalent copy-permutation swaps are not rescored repeatedly.
- Tail-focused improvement operator for weak sparse-tail cases (`4-3-5`, `4-3-6`, similar small remainder cells).
- Mixed-seed tie-breaks that account for squared-repeat damage explicitly when linear scores tie, instead of relying only on max pair frequency as a proxy.
- Smarter mixed-seed candidate pruning so obviously dominated tail families do not need full telemetry recomputation.
- Reporting-side instrumentation split between seed-build time and local-search time, so the benchmark exposes the exact runtime bottleneck directly.
- Stronger structural lower bounds beyond the current two-week linear strengthening, but only if they remain mathematically honest and cheap.
