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

- `backend/benchmarking/suites/objective-canonical-representative-v1.yaml`
- `backend/benchmarking/suites/objective-canonical-adversarial-v1.yaml`
- `backend/benchmarking/suites/objective-canonical-stretch-v1.yaml`

## Current fixed-time contract

| Case | Seed | Max iterations | Time limit | Search-policy note |
| --- | --- | ---: | ---: | --- |
| `representative.small-workshop-balanced` | `101` | `1,000,000` | `3s` | clears inherited no-improvement stop so time becomes the real limiter |
| `representative.small-workshop-constrained` | `102` | `1,500,000` | `4s` | clears inherited no-improvement stop and disables tiny fixture-era reheats |
| `adversarial.constraint-heavy-partial-attendance` | `301` | `1,500,000` | `4s` | clears inherited no-improvement stop and disables tiny fixture-era reheats |
| `stretch.medium-multi-session` | `201` | `2,000,000` | `6s` | clears inherited no-improvement stop and disables tiny fixture-era reheats |
| `stretch.social-golfer-32x8x10` | `320810` | `10,000,000` | `25s` | keeps the serious embedded SA policy; max cap lifted so the lane becomes fixed-time |
| `stretch.large-gender-immovable-110p` | `110115` | `2,000,000` | `12s` | keeps embedded policy; max cap lifted so the lane becomes fixed-time |
| `stretch.sailing-trip-demo-real` | `624485344291700314` | `1,000,000` | `15s` | explicit deterministic seed added to the canonical raw-case contract |

## Measured local runtime

Measured after the rebuild with:

```bash
/usr/bin/time -p ./tools/autoresearch/objective-quality/autoresearch.sh
```

Observed local result:

- `objective_suite_weighted_normalized_score=1.0`
- `objective_suite_weighted_normalized_score_delta_from_reference=0.0`
- `objective_suite_total_final_score_raw=552975.0`
- `objective_suite_average_final_score_raw=78996.42857142857`
- `objective_suite_case_count=7`
- `objective_suite_total_runtime_seconds=68.920084947`
- `objective_suite_average_runtime_seconds=9.845726421`
- `objective_suite_external_validation_failures=0`
- `objective_suite_total_score_mismatches=0`
- `objective_suite_score_breakdown_mismatches=0`
- `correctness_suite_case_count=4`
- `correctness_suite_total_runtime_seconds=0.061012738`
- `runtime_total_seconds=68.899958768`
- `runtime_canonical_share_percent=99.9114473519419`
- wall-clock `real 70.02s`

For comparison, the earlier lighter objective lane measurement was about **22.57s** wall-clock. The lane is now intentionally much slower because it is doing materially more real search work.

## Case-by-case effort profile

Observed from a fresh local run of the rebuilt manifests:

| Case | Stop reason | Runtime | Iterations | Interpretation |
| --- | --- | ---: | ---: | --- |
| `representative.small-workshop-balanced` | `time_limit_reached` | `3.000s` | `832,023` | no longer a tiny fixed-iteration smoke run |
| `representative.small-workshop-constrained` | `time_limit_reached` | `4.000s` | `1,218,809` | inherited `no_improvement_iterations: 20` no longer dominates |
| `adversarial.constraint-heavy-partial-attendance` | `time_limit_reached` | `4.000s` | `1,141,120` | now behaves like a real fixed-time adversarial search case |
| `stretch.medium-multi-session` | `time_limit_reached` | `6.000s` | `1,258,986` | no longer terminates after a few dozen iterations |
| `stretch.social-golfer-32x8x10` | `time_limit_reached` | `25.000s` | `8,907,523` | still a hard stretch case, now genuinely fixed-time rather than cap-dominated |
| `stretch.large-gender-immovable-110p` | `time_limit_reached` | `12.001s` | `1,692,326` | now behaves like a serious large-instance fixed-time workload |
| `stretch.sailing-trip-demo-real` | `time_limit_reached` | `15.002s` | `269,978` | canonical real-demo target remains a credible fixed-time primary case |

## Resulting lane shape

The rebuilt fixed-time primary lane now has the desired properties:

- every canonical objective case still has a safety max-iteration cap
- every canonical objective case now behaved as a **time-limited** benchmark in the measured local run
- helper/proxy contamination rules remain unchanged
- external validation still passed across the full suite

## Remaining interpretation note

This rebuild does **not** claim the current search policy is permanently optimal.

It only establishes that the checked-in **primary objective lane** is now a credible fixed-time research harness instead of a bundle partly distorted by inherited smoke-fixture settings.
