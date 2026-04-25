# solver3 construction autoresearch

Permanent copy of the solver3 construction-heuristic broad-suite autoresearch lane restored from `autoresearch/solver3-construction-20260424`.

Root `./autoresearch.sh` and `./autoresearch.checks.sh` currently delegate here. The lane runs `backend/benchmarking/suites/solver3-constructor-broad.yaml` and emits `METRIC broad_relative_score=...` plus construction sentinel metrics.

Artifacts are written outside the repository by default under `/tmp/groupmixer-autoresearch-solver3-construction` unless `GROUPMIXER_AUTORESEARCH_ARTIFACTS_DIR` is set.
