# Solver3 broad multiseed autoresearch lane

This lane is a deliberately **broad** solver3 quality harness.

## Goal

Give solver3 experiments a much better sense of **overall performance** by:

- covering a wide mix of benchmark problems
- running **4 explicit seeds per problem**
- averaging quality per canonical problem across those seeds
- executing seed replicas in parallel via `GROUPMIXER_BENCHMARK_JOBS=4`
- keeping solver3 correctness guardrails active

## Primary fixed-time bundle

The lane runs these multiseed solver3 manifests:

- `backend/benchmarking/suites/objective-canonical-representative-solver3-broad-multiseed-v1.yaml`
- `backend/benchmarking/suites/objective-canonical-adversarial-solver3-broad-multiseed-v1.yaml`
- `backend/benchmarking/suites/objective-canonical-stretch-solver3-broad-multiseed-v1.yaml`
- `backend/benchmarking/suites/correctness-edge-intertwined-solver3-v1.yaml`

Canonical quality portfolio:

1. `representative.small-workshop-balanced`
2. `representative.small-workshop-constrained`
3. `adversarial.clique-swap-functionality-35p`
4. `adversarial.transfer-attribute-balance-111p`
5. `stretch.social-golfer-32x8x10`
6. `stretch.kirkman-schoolgirls-15x5x7`
7. `stretch.large-gender-immovable-110p`
8. `stretch.sailing-trip-demo-real`
9. `stretch.synthetic-partial-attendance-capacity-pressure-152p`
10. `stretch.synthetic-partial-attendance-keep-apart-capacity-pressure-152p`

Each canonical problem runs with **4 seeds**, so one experiment executes **40 quality runs** plus the solver3 correctness corpus.

## Metric

Primary metric:

- `solver3_broad_multiseed_weighted_normalized_score` (lower is better)

Metric math:

- for each canonical problem, first compute the **mean final score across 4 seeds**
- normalize that per-problem mean by the checked-in reference final score
- average the normalized values with equal weight
- scale by `100` for readability

This means one lucky or unlucky seed no longer dominates the lane.

## Secondary diagnostics

The lane also emits:

- per-case mean/min/max/stddev score diagnostics
- per-case mean/min/max/stddev runtime diagnostics
- correctness / external-validation mismatch counters
- `solver3_raw_score_us` from `tools/autoresearch/solver3-raw-runtime/autoresearch.sh`

## Parallelism

`tools/autoresearch/solver3-broad-quality/autoresearch.sh` defaults:

- `GROUPMIXER_BENCHMARK_JOBS=4`

So the 4 seed replicas run in parallel inside each suite unless the caller overrides the env var.

## How to run

```bash
cd tools/autoresearch/solver3-broad-quality
./autoresearch.sh
./autoresearch.checks.sh
```

## Scope rules

This lane is for **solver3-only** research.

Allowed:

- `backend/core/src/solver3/**`
- `tools/autoresearch/solver3-broad-quality/**`
- solver3 broad multiseed suite manifests
- root autoresearch wrappers/docs only when the user explicitly wants this lane promoted

Off-limits unless the user changes the benchmark question:

- `backend/core/src/solver1/**`
- benchmark case identity
- suite-case seeds/budgets in this lane
- metric reference math except for explicit lane-maintenance rebases
