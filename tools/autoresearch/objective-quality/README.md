# Objective-quality autoresearch lane

This lane is intentionally separate from the root-level raw-runtime lane (`/autoresearch.sh`).

## Files

- `tools/autoresearch/objective-quality/autoresearch.config.json`
- `tools/autoresearch/objective-quality/autoresearch.sh`
- `tools/autoresearch/objective-quality/autoresearch.checks.sh`

## Default experiment flow

Each experiment run executes the **full canonical objective suite** and the dedicated correctness corpus:

1. `backend/benchmarking/suites/objective-canonical-representative-v1.yaml`
2. `backend/benchmarking/suites/objective-canonical-adversarial-v1.yaml`
3. `backend/benchmarking/suites/objective-canonical-stretch-v1.yaml`
4. `backend/benchmarking/suites/correctness-edge-intertwined-v1.yaml`

The script emits:

- **Primary metric**: `objective_suite_total_final_score` (lower is better)
- **Secondary metrics**: runtime + validation diagnostics (`runtime_total_seconds`, per-suite validation mismatch counters, etc.)

Runtime is explicitly a monitoring signal in this lane, not the keep/discard target.

## Measured local runtime after the fixed-time lane rebuild

Current local warm-cache measurement:

- `tools/autoresearch/objective-quality/autoresearch.sh`: **70.02s** wall clock
- `objective_suite_total_runtime_seconds=68.83894603`
- `runtime_canonical_share_percent=99.9114473519419`

Previous lighter objective-lane measurement before the rebuild:

- `tools/autoresearch/objective-quality/autoresearch.sh`: **22.57s** wall clock

Interpretation:

- the lane is intentionally much slower now
- the new runtime reflects substantially more real search work on the canonical fixed-time cases
- that slowdown is deliberate and desirable for a research-grade primary objective harness

## Benchmark contract vs tunable search policy

For this lane, the **benchmark contract** is the stable part of the question:

- workload / case identity
- solver family
- seed policy
- `max_iterations`
- `time_limit_seconds`

The **tunable search policy** is the part research is allowed to change without redefining the benchmark question, including:

- `no_improvement_iterations`
- temperature schedule
- reheat policy
- move-family policy

The benchmark runner now supports this split explicitly through suite-level `default_search_policy` and case-level `search_policy`, instead of forcing objective suites to replace the entire solver configuration just to tune metaheuristics.

## Required checks lane (runs after successful experiment commands)

`autoresearch.checks.sh` now runs the following guardrails after each successful experiment:

### Broad shared correctness surfaces (`gm-core`)

- `cargo test -p gm-core --test data_driven_tests`
- `cargo test -p gm-core --test property_tests`

### Focused regression surfaces (`gm-core`)

- `cargo test -p gm-core --test construction_regression`
- `cargo test -p gm-core --test search_driver_regression`
- `cargo test -p gm-core --test move_swap_regression`
- `cargo test -p gm-core --test move_transfer_regression`
- `cargo test -p gm-core --test move_clique_swap_regression`

### Solver3 correctness-lane guardrail (`gm-core`)

- solver3 sampled oracle lane test under `solver3-oracle-checks`

### Benchmark metadata / validation guardrails (`gm-benchmarking`)

- canonical objective manifest identity+budget guardrail test
- correctness corpus separation guardrail test
- external benchmark validation contract test

This is intentionally much broader than the original narrow smoke-style checks: the objective lane now leans on shared `gm-core` semantic surfaces as its primary regression guardrail.

## Measured local runtime impact (warm-cache wall clock)

Previous checks lane measurement before guardrail expansion:

- `tools/autoresearch/objective-quality/autoresearch.checks.sh`: **5.34s**

Current checks lane measurement after guardrail expansion:

- `tools/autoresearch/objective-quality/autoresearch.checks.sh`: **8.59s**

Interpretation:

- the lane is intentionally slower
- the extra runtime buys materially broader semantic protection
- this is a desirable trade for objective-quality research, where silent feature regressions are more dangerous than a somewhat slower experiment loop

## Fixed-iteration diagnostic companion lane

The companion fixed-iteration diagnostic script is:

- `tools/autoresearch/objective-quality/fixed-iteration-diagnostic.sh`

It runs these manifests:

- `backend/benchmarking/suites/objective-diagnostic-fixed-iteration-representative-v1.yaml`
- `backend/benchmarking/suites/objective-diagnostic-fixed-iteration-adversarial-v1.yaml`
- `backend/benchmarking/suites/objective-diagnostic-fixed-iteration-stretch-v1.yaml`

Sample local measurement:

- `objective_fixed_iteration_total_final_score=552987.0`
- `objective_fixed_iteration_total_runtime_seconds=59.332849581`
- wall-clock `61.46s`

Interpretation rule:

- use this lane to explain *why* fixed-time changed
- do **not** use it as primary keep/discard evidence on its own

## How to run

From this folder:

```bash
cd tools/autoresearch/objective-quality
# primary fixed-time lane
./autoresearch.sh

# fixed-iteration diagnostic companion lane
./fixed-iteration-diagnostic.sh
```

## Go-live status (honest current state)

- The lane wiring (config + command + checks) is now checked in.
- This is **ready for supervised use**.
- It is **not yet declared fully go-live/autonomous** until a longer burn-in cycle is recorded and reviewed as objective-lane evidence.
