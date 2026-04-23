# Autoresearch: solver3 broad multiseed quality

## Objective
Improve `solver3` using a broad fixed-time multiseed portfolio that gives a more stable sense of overall quality across many different workload families.

## Metrics
- **Primary**: `solver3_broad_multiseed_weighted_normalized_score` (lower is better)
- **Secondary**:
  - `objective_suite_total_final_score_raw`
  - `objective_suite_average_final_score_raw`
  - `objective_suite_total_runtime_seconds`
  - `objective_suite_total_replicate_count`
  - `objective_suite_external_validation_failures`
  - `objective_suite_total_score_mismatches`
  - `objective_suite_score_breakdown_mismatches`
  - per-case mean/min/max/stddev score metrics
  - per-case mean/min/max/stddev runtime metrics
  - `solver3_raw_score_us`

## How to Run
`./autoresearch.sh`

## Benchmark contract
This lane uses 10 canonical solver3 problems, each with 4 explicit seeds.

Canonical problems:
- representative balanced workshop
- representative constrained workshop
- clique-swap adversarial case
- transfer-heavy adversarial case
- social golfer stretch case
- kirkman stretch case
- large gender/immovable stretch case
- raw Sailing Trip demo case
- synthetic partial-attendance stretch case
- synthetic partial-attendance keep-apart stretch case

## Constraints
- solver3 only
- keep correctness checks broad and honest
- do not alter benchmark case identity, per-case seed lists, or budgets during optimization
- the primary signal is broad multiseed fixed-time quality, not a single lucky seed or microbenchmark alone
