# Solver3 relabeling projection autoresearch

This lane optimizes the diagnostic `solver3-relabeling-projection` suite. It is deliberately separate from the canonical `solver3-constructor-broad` lane: the target is smarter constraint-aware oracle projection/relabeling under hidden symmetries, not broad product score tuning.

Run from repo root via:

```bash
./autoresearch.sh
```

The root wrapper delegates to `tools/autoresearch/solver3-relabeling-projection/autoresearch.sh` and emits `METRIC relabeling_research_loss=...` plus diagnostic breakdown metrics.

Supplemental pair-sensitive A/B diagnostics live outside the primary autoresearch metric:

```bash
cargo run -q -p gm-cli -- benchmark run \
  --manifest backend/benchmarking/suites/solver3-relabeling-projection-pair-sensitive.yaml \
  --cargo-profile dev

cargo run -q -p gm-cli -- benchmark run \
  --manifest backend/benchmarking/suites/solver3-relabeling-projection-pair-sensitive-legacy.yaml \
  --cargo-profile dev
```

Those suites use non-complete 13x13x10 and 6x6x3 planted oracles so hard-apart, pair-meeting, and soft-pair constraints are not constant over a perfect full horizon.
