# Solver3 SGP tabu tuning sweep — 2026-04-13

Parent todo:
- `TODO-6ae279bd` — benchmark and compare solver3 tabu parameter regimes on Social Golfer

Reference plan:
- `backend/core/src/solver3/SGP_TABU_TUNING_EXPERIMENT_MATRIX.md`

## Scope

This sweep tested the first small tuning matrix for `solver3.local_improver.mode = sgp_week_pair_tabu` on the canonical Social Golfer anchor.

The goal was not broad rollout. The goal was to see which knobs are actually alive:
- tenure shape / magnitude
- retry-cap sensitivity
- aspiration on/off

## Stage A — time-limited screening

### Executed artifacts

- baseline
  - `backend/benchmarking/artifacts/runs/social-golfer-plateau-time-solver3-20260413T191633Z-f8541f84/run-report.json`
- tabu short fixed
  - `backend/benchmarking/artifacts/runs/social-golfer-plateau-time-solver3-sgp-tabu-short-fixed-20260413T191658Z-bd1e6455/run-report.json`
- tabu short bounded
  - `backend/benchmarking/artifacts/runs/social-golfer-plateau-time-solver3-sgp-tabu-short-bounded-20260413T191723Z-ca56993a/run-report.json`
- tabu medium reference (`8..32`, retry `16`, aspiration on)
  - `backend/benchmarking/artifacts/runs/social-golfer-plateau-time-solver3-sgp-tabu-20260413T191749Z-c5c47bf8/run-report.json`
- tabu long bounded
  - `backend/benchmarking/artifacts/runs/social-golfer-plateau-time-solver3-sgp-tabu-long-bounded-20260413T191814Z-7cfc6055/run-report.json`
- tabu medium low retry
  - `backend/benchmarking/artifacts/runs/social-golfer-plateau-time-solver3-sgp-tabu-medium-low-retry-20260413T191840Z-7c60e5e1/run-report.json`
- tabu medium high retry
  - `backend/benchmarking/artifacts/runs/social-golfer-plateau-time-solver3-sgp-tabu-medium-high-retry-20260413T191905Z-9f00efde/run-report.json`
- tabu medium no aspiration
  - `backend/benchmarking/artifacts/runs/social-golfer-plateau-time-solver3-sgp-tabu-medium-no-aspiration-20260413T191930Z-ea196225/run-report.json`

### Stage A summary

| regime | final score | iter/s | last best iter | last best sec |
| --- | ---: | ---: | ---: | ---: |
| baseline | 5409 | 59162.5 | 80558 | 1.389 |
| tabu short fixed | 5409 | 50572.6 | 254754 | 4.585 |
| tabu short bounded | 5388 | 51413.8 | 148673 | 2.533 |
| tabu medium reference | 5367 | 52463.6 | 727756 | 14.448 |
| tabu long bounded | 5451 | 58364.5 | 173075 | 2.992 |
| tabu medium low retry | 5367 | 59657.5 | 727756 | 12.101 |
| tabu medium high retry | 5367 | 60254.7 | 727756 | 12.081 |
| tabu medium no aspiration | 5367 | 61367.7 | 727756 | 11.599 |

### Stage A telemetry takeaways

The surprising result is how *inactive* the non-tenure knobs were on this anchor/seed.

For every medium-tenure winner (`8..32`):
- `raw_tabu_hits = 6`
- `prefilter_skips = 6`
- `retry_exhaustions = 0`
- `hard_blocks = 0`
- `aspiration_preview_surfaces = 0`
- `aspiration_overrides = 0`
- `recorded_swaps = 882`
- realized average tenure `19.57`

Interpretation:
- the current Social Golfer winner signal came from the **tenure regime itself**, not from aspiration rescue or retry-cap behavior
- in this run, retry-cap and aspiration toggles were effectively dormant because the search almost never exhausted tabu retries and never surfaced an aspirated preview
- long tenure (`16..64`) was clearly too restrictive and regressed badly (`5451`)
- short tenure helped somewhat when bounded (`5388`) but did not match the medium regime (`5367`)

## Stage B — fixed-iteration confirmation

Because Stage A produced a four-way tie at `5367` among the medium-tenure variants, Stage B used throughput as a practical tiebreaker and confirmed these three:

- medium low retry
- medium high retry
- medium no aspiration

### Executed artifacts

- baseline
  - `backend/benchmarking/artifacts/runs/social-golfer-plateau-fixed-iteration-solver3-20260413T192101Z-5819d40d/run-report.json`
- tabu medium low retry
  - `backend/benchmarking/artifacts/runs/social-golfer-plateau-fixed-iteration-solver3-sgp-tabu-medium-low-retry-20260413T192302Z-cca33651/run-report.json`
- tabu medium high retry
  - `backend/benchmarking/artifacts/runs/social-golfer-plateau-fixed-iteration-solver3-sgp-tabu-medium-high-retry-20260413T192502Z-4e5f4741/run-report.json`
- tabu medium no aspiration
  - `backend/benchmarking/artifacts/runs/social-golfer-plateau-fixed-iteration-solver3-sgp-tabu-medium-no-aspiration-20260413T192702Z-da7e5ebf/run-report.json`

### Stage B summary

| regime | final score | iter/s | last best iter | last best sec |
| --- | ---: | ---: | ---: | ---: |
| baseline | 5409 | 56029.6 | 80558 | 1.464 |
| tabu medium low retry | 5367 | 60668.8 | 727756 | 12.204 |
| tabu medium high retry | 5367 | 56812.9 | 727756 | 11.442 |
| tabu medium no aspiration | 5367 | 55692.2 | 727756 | 13.792 |

## Conclusions

### 1. Medium tenure is the live knob

The clearest result from the sweep is:

- short fixed tenure was too weak
- short bounded tenure was better but still not best
- long bounded tenure was too restrictive
- the medium bounded regime (`8..32`) remained best

### 2. Retry-cap and aspiration did not matter yet on this anchor

For the current winning medium regime on this seed/workload:
- retry exhaustion never happened
- aspiration never surfaced

So there is no evidence from this sweep that retry-cap or aspiration tuning is currently driving the Social Golfer win.

### 3. Best current cheap inner-loop candidate

The best *score class* remains the medium bounded tabu regime:
- `tenure_min=8`
- `tenure_max=32`

Within that tie class, the provisional winner from this sweep is:
- `retry_cap=4`
- `aspiration_enabled=true`

Why only provisional:
- it tied the best final score (`5367`)
- it matched the same late-improvement corridor
- it had the best fixed-iteration throughput among the confirmed medium variants
- but the tie class was extremely tight and the knobs being compared were mostly inactive on this workload/seed

### 4. Most plausible next tabu-tuning question

The next meaningful tuning axis is probably **tenure design**, not retry or aspiration.

More specifically:
- refine the medium-tenure window around the current winner
- test nearby bounded intervals rather than broad new control logic
- only revisit retry / aspiration after we see workloads or seeds where tabu pressure actually saturates

## Honest bottom line

This sweep produced one strong and one weak conclusion:

- strong: `8..32`-style medium tabu tenure is the only regime class that clearly beat baseline in this sweep
- weak: retry-cap and aspiration differences did not yet show meaningful causal signal on the Social Golfer anchor
