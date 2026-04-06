# Objective fixed-iteration diagnostic lane (2026-04-06)

## Purpose

This lane is the **diagnostic companion** to the fixed-time primary objective lane.

Its aggregation math is also explicit and checked in:

- `tools/autoresearch/objective-quality/fixed-iteration-metric-config.json`

It exists to answer a different question:

> If wall-clock speed is normalized away, did the solver/search policy actually produce better objective quality for a fixed amount of search work?

This lane is intentionally **not** the primary keep/discard authority.

## Checked-in manifests

- `backend/benchmarking/suites/objective-diagnostic-fixed-iteration-adversarial-v1.yaml`
- `backend/benchmarking/suites/objective-diagnostic-fixed-iteration-stretch-v1.yaml`

These reuse the same canonical workloads, explicit seeds, and search-policy shape as the fixed-time lane where appropriate, but switch the question to fixed-iteration quality with generous safety time limits.

## Run command

```bash
./tools/autoresearch/objective-quality/fixed-iteration-diagnostic.sh
```

## Sample measured output

Measured local result:

- `objective_fixed_iteration_weighted_normalized_score=1.0`
- `objective_fixed_iteration_weighted_normalized_score_delta_from_reference=0.0`
- `objective_fixed_iteration_total_final_score_raw=557968.0`
- `objective_fixed_iteration_average_final_score_raw=111593.6`
- `objective_fixed_iteration_case_count=5`
- `objective_fixed_iteration_total_runtime_seconds=75.711729346`
- `objective_fixed_iteration_average_runtime_seconds=15.1423458692`
- `objective_fixed_iteration_external_validation_failures=0`
- `objective_fixed_iteration_total_score_mismatches=0`
- `objective_fixed_iteration_score_breakdown_mismatches=0`
- wall-clock `real 76.37s`

## Case-by-case diagnostic profile

Observed from a fresh local run of the fixed-iteration manifests:

| Case | Stop reason | Runtime | Iterations | Interpretation |
| --- | --- | ---: | ---: | --- |
| `adversarial.clique-swap-functionality-35p` | `max_iterations_reached` | `13.002s` | `2,200,000` | fixed-effort clique-pressure comparison |
| `adversarial.transfer-attribute-balance-111p` | `max_iterations_reached` | `16.203s` | `1,500,000` | fixed-effort large-instance attribute-balance comparison |
| `stretch.social-golfer-32x8x10` | `max_iterations_reached` | `26.876s` | `9,000,000` | true fixed-effort combinatorial comparison |
| `stretch.large-gender-immovable-110p` | `max_iterations_reached` | `13.048s` | `1,700,000` | true fixed-effort large-instance comparison |
| `stretch.sailing-trip-demo-real` | `max_iterations_reached` | `20.000s` | `270,000` | true fixed-effort real-demo comparison |

## How to interpret it

Use this lane when fixed-time and raw-performance evidence disagree.

### Good use cases

- fixed-time score improved, but raw-performance regressed
- raw-performance improved, but fixed-time score did not
- a search-policy change claims better diversification or objective quality independent of throughput

### Not a good use case

Do **not** treat fixed-iteration wins as sufficient keep/discard evidence on their own.

Why:

- users experience the solver under wall-clock budgets, not abstract iteration budgets
- a fixed-iteration win can still lose in practice if throughput regresses enough
- a fixed-iteration loss can still be acceptable if a throughput improvement makes the fixed-time primary lane win clearly

## Relationship to the other lanes

- **Fixed-time primary lane:** the main objective-quality truth for research decisions
- **Fixed-iteration diagnostic lane:** explains whether changes improved quality per unit of search effort
- **Raw performance / hotpath lane:** explains whether changes improved or harmed throughput

All three together give a much clearer picture than any one of them alone.
