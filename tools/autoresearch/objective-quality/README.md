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

`autoresearch.checks.sh` runs:

- solver3 sampled oracle lane test (`gm-core`, `solver3-oracle-checks` feature)
- canonical objective/correctness manifest guardrail tests (`gm-benchmarking`)
- external benchmark validation contract test (`gm-benchmarking`)

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
