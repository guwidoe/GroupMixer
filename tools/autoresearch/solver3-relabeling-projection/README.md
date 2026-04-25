# Solver3 relabeling projection autoresearch

This lane optimizes the diagnostic `solver3-relabeling-projection` suite. It is deliberately separate from the canonical `solver3-constructor-broad` lane: the target is smarter constraint-aware oracle projection/relabeling under hidden symmetries, not broad product score tuning.

Run from repo root via:

```bash
./autoresearch.sh
```

The root wrapper delegates to `tools/autoresearch/solver3-relabeling-projection/autoresearch.sh` and emits `METRIC relabeling_research_loss=...` plus diagnostic breakdown metrics.
