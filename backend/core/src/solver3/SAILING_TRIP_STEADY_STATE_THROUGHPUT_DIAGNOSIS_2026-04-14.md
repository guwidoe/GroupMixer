# Sailing Trip steady-state throughput diagnosis (2026-04-14)

Scope: explain the remaining real-run throughput regression on `stretch.sailing-trip-demo-real` relative to historical `72b063a`, focusing on steady-state search rather than the tiny 1-iteration hotpath lane.

## Real-run artifact comparison

Comparable exact-raw / canonical stretch artifacts:

- historical `72b063a`
  - `backend/benchmarking/artifacts/runs/objective-canonical-stretch-solver3-v1-20260413T131040Z-a1aee20d/run-report.json`
- bounded-burst keep `6cc2166`
  - `backend/benchmarking/artifacts/runs/objective-canonical-stretch-solver3-v1-20260414T152029Z-f6d21aca/run-report.json`
- reverted plain-path experiment `c68a7a1`
  - `backend/benchmarking/artifacts/runs/objective-canonical-stretch-solver3-v1-20260414T161259Z-8344acf3/run-report.json`
- current HEAD baseline before this epic work `e6684c0`
  - `backend/benchmarking/artifacts/runs/objective-canonical-stretch-solver3-v1-20260414T170209Z-3e8fa3c3/run-report.json`

## What the real run already showed

For `stretch.sailing-trip-demo-real`:

- `72b063a`
  - runtime `5.279s`
  - preview `5.114s`
  - apply `0.001s`
  - other search overhead `0.164s`
- `6cc2166`
  - runtime `8.015s`
  - preview `7.121s`
  - apply `0.003s`
  - other search overhead `0.890s`
- `e6684c0`
  - runtime `9.231s`
  - preview `8.272s`
  - apply `0.004s`
  - other search overhead `0.956s`
- reverted plain-path `c68a7a1`
  - runtime `6.391s`
  - preview `6.166s`
  - apply `0.002s`
  - other search overhead `0.223s`

Conclusion from artifacts alone: the remaining regression is still overwhelmingly inside the work currently charged to `preview_seconds`, not in move apply.

## New diagnostic added in this slice

Command:

```bash
cargo test -p gm-core diagnose_sailing_trip_preview_wrapper_breakdown --release -- --ignored --nocapture
```

This diagnostic measures current default no-tabu candidate selection on the raw Sailing case and splits sampled move cost into:

- proposal / sampling / wrapper overhead before preview
- lightweight preview kernel time itself

Observed current results on `e6684c0`:

- overall accepted samples
  - total `9.056 µs/sample`
  - proposal/wrapper `3.386 µs/sample`
  - preview kernel `5.670 µs/sample`
  - wrapper share `37.4%`
- per selected family
  - `Swap`
    - total `4.659 µs`
    - wrapper `0.334 µs`
    - preview kernel `4.325 µs`
    - wrapper share `7.2%`
  - `Transfer`
    - total `2.452 µs`
    - wrapper `0.477 µs`
    - preview kernel `1.975 µs`
    - wrapper share `19.5%`
  - `CliqueSwap`
    - total `20.057 µs`
    - wrapper `9.341 µs`
    - preview kernel `10.716 µs`
    - wrapper share `46.6%`

## Interpretation

The current default production path is paying meaningful proposal/control overhead, especially for `clique_swap`, but the real Sailing regression is still a mix of two things:

1. heavier preview kernels than historical `72b063a`
2. extra wrapper/control cost around candidate proposal, especially outside plain swap

The reverted plain-path experiment remains the strongest proof that sampler/control generality is still a major contributor: it materially reduced both preview time and total runtime on the real Sailing case.

## Landed throughput recovery slice

The next slice of this epic split the default `single_state + record_to_record` sampler path away from tabu / advanced swap-control plumbing and removed heap allocation from move-family ordering.

Artifacts:

- pre-slice HEAD baseline
  - `backend/benchmarking/artifacts/runs/objective-canonical-stretch-solver3-v1-20260414T170209Z-3e8fa3c3/run-report.json`
- post-slice benchmark
  - `backend/benchmarking/artifacts/runs/objective-canonical-stretch-solver3-v1-20260414T171849Z-a509cd1a/run-report.json`

Observed stretch bundle outcome:

- scores held exactly:
  - `stretch.social-golfer-32x8x10 = 5451`
  - `stretch.large-gender-immovable-110p = 2146`
  - `stretch.sailing-trip-demo-real = 2359`
  - `stretch.synthetic-partial-attendance-capacity-pressure-152p = 6501`
- runtime moved materially in the right direction:
  - `stretch.social-golfer-32x8x10`: `14.619s -> 10.737s`
  - `stretch.large-gender-immovable-110p`: `5.920s -> 5.467s`
  - `stretch.sailing-trip-demo-real`: `9.231s -> 7.649s`
- Sailing preview-path breakdown improved:
  - total preview `8.272s -> 6.952s`
  - other search overhead `0.956s -> 0.694s`
  - swap preview `5.050 -> 4.108 µs/attempt`
  - transfer preview `2.003 -> 1.645 µs/attempt`
  - clique_swap preview `19.658 -> 16.697 µs/attempt`

The release diagnostic also improved on the raw Sailing case:

- default-preview diagnostic:
  - total `9.056 -> 6.547 µs/sample`
  - proposal/wrapper `3.386 -> 2.523 µs/sample`
  - preview kernel `5.670 -> 4.024 µs/sample`

## Implication for the rest of this epic

A genuinely lean compiled default sampler path does help the real steady-state Sailing lane without giving back the checked stretch scores.

The remaining gap versus historical `72b063a` is now much smaller but still real, so future work should continue focusing on:

- more default-path specialization where the shipped solver still pays for generality it does not need
- preserving advanced paths behind explicit compile-time / mode-specific entrypoints
- avoiding any optimization that only wins Sailing while regressing the broader production-default keep-lanes
