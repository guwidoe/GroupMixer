# Objective fixed-time primary lane rebuild (2026-04-06)

## What changed

The canonical objective lane was rebuilt so the **fixed-time** budget is now the real primary signal instead of being undermined by inherited fixture-era search policy.

The lane now also uses an explicit checked-in aggregation config instead of a hidden raw sum across heterogeneous cases:

- `tools/autoresearch/objective-quality/fixed-time-metric-config.json`

That config declares:

- every canonical case included in the primary metric
- each case's explicit weight
- each case's explicit reference final score
- the exact math used to aggregate the suite metric

Key changes in the suite manifests:

- explicit suite-case `seed` policy for every canonical objective case
- materially higher `max_iterations` caps so they act as safety backstops instead of tiny smoke-test ceilings
- targeted `search_policy` overrides for cases that previously inherited tiny `no_improvement_iterations` / reheat settings from fixture JSON
- no full `default_solver` / `solver` replacement in the objective manifests; the benchmark contract stays separate from tunable search policy

Updated manifests:

- `backend/benchmarking/suites/objective-canonical-adversarial-v1.yaml`
- `backend/benchmarking/suites/objective-canonical-stretch-v1.yaml`

## Current fixed-time contract

| Case | Seed | Max iterations | Time limit | Search-policy note |
| --- | --- | ---: | ---: | --- |
| `adversarial.clique-swap-functionality-35p` | `333` | `3,000,000` | `12s` | hard 35p clique-integrity workload; no tiny fixture stop limits |
| `adversarial.transfer-attribute-balance-111p` | `424242` | `3,000,000` | `15s` | large 111p attribute-balance workload; no tiny fixture stop limits |
| `stretch.social-golfer-32x8x10` | `320810` | `10,000,000` | `25s` | keeps the serious embedded SA policy; max cap lifted so the lane becomes fixed-time |
| `stretch.large-gender-immovable-110p` | `110115` | `2,000,000` | `12s` | keeps embedded policy; max cap lifted so the lane becomes fixed-time |
| `stretch.sailing-trip-demo-real` | `624485344291700314` | `1,000,000` | `15s` | explicit deterministic seed in the canonical raw-case contract |

## Measured local runtime

Measured after the rebuild with:

```bash
/usr/bin/time -p ./tools/autoresearch/objective-quality/autoresearch.sh
```

Observed local result:

- `objective_suite_weighted_normalized_score=0.960294885161354`
- `objective_suite_weighted_normalized_score_delta_from_reference=-0.03970511483864603`
- `objective_suite_total_final_score_raw=559074.0`
- `objective_suite_average_final_score_raw=111814.8`
- `objective_suite_case_count=5`
- `objective_suite_total_runtime_seconds=78.70026615500001`
- `objective_suite_average_runtime_seconds=15.740053231000001`
- `objective_suite_external_validation_failures=0`
- `objective_suite_total_score_mismatches=0`
- `objective_suite_score_breakdown_mismatches=0`
- `correctness_suite_case_count=4`
- `correctness_suite_total_runtime_seconds=0.061012738`
- `runtime_total_seconds=78.76805233900001`
- `runtime_canonical_share_percent=99.91394203362009`
- wall-clock `real 79.67s`

For comparison, the earlier tiny-case-heavy objective lane measurement was about **22.57s** wall-clock. The current lane is intentionally slower because it now focuses on fewer but harder cases with more meaningful search effort.

## Case-by-case effort profile

Observed from a fresh local run of the rebuilt manifests:

| Case | Stop reason | Runtime | Iterations | Interpretation |
| --- | --- | ---: | ---: | --- |
| `adversarial.clique-swap-functionality-35p` | `time_limit_reached` | `12.000s` | `2,408,170` | medium-large clique-pressure workload contributes meaningful objective signal |
| `adversarial.transfer-attribute-balance-111p` | `time_limit_reached` | `15.001s` | `1,366,566` | large 111p workload contributes real large-instance search evidence |
| `stretch.social-golfer-32x8x10` | `time_limit_reached` | `25.000s` | `9,953,873` | hard combinatorial stretch workload remains a core anchor |
| `stretch.large-gender-immovable-110p` | `time_limit_reached` | `12.001s` | `1,393,878` | serious large-instance fixed-time workload |
| `stretch.sailing-trip-demo-real` | `time_limit_reached` | `15.002s` | `223,288` | canonical real-demo target remains a core anchor |

## Resulting lane shape

The rebuilt fixed-time primary lane now has the desired properties:

- every canonical objective case still has a safety max-iteration cap
- every canonical objective case behaved as a **time-limited** benchmark in the measured local run
- the small low-headroom cases were removed from the primary aggregate
- helper/proxy contamination rules remain unchanged
- external validation still passed across the full suite

## Remaining interpretation note

This rebuild does **not** claim the current search policy is permanently optimal.

It only establishes that the checked-in **primary objective lane** is now a credible fixed-time research harness instead of a bundle partly distorted by inherited smoke-fixture settings.
