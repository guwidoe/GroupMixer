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

## How to run

From this folder:

```bash
cd tools/autoresearch/objective-quality
# configure objective metric in init_experiment as lower-is-better
# command: ./autoresearch.sh
```

## Go-live status (honest current state)

- The lane wiring (config + command + checks) is now checked in.
- This is **ready for supervised use**.
- It is **not yet declared fully go-live/autonomous** until a longer burn-in cycle is recorded and reviewed as objective-lane evidence.
