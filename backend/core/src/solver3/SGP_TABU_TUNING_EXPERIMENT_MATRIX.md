# Solver3 SGP tabu tuning experiment matrix

Parent todos:
- `TODO-09b4fd52` — solver3 tabu tuning and rare structure-preserving recombination research
- `TODO-1ccc41f4` — design the solver3 tabu-tuning experiment matrix
- `TODO-6ae279bd` — benchmark and compare solver3 tabu parameter regimes on Social Golfer

## Goal

Define a small, honest tuning matrix for `solver3.local_improver.mode = sgp_week_pair_tabu` on the Social Golfer anchor workload.

This phase is intentionally about the cheap inner loop only. We are not trying to retune memetic search here.

## Why this matrix exists

Current evidence says:

- plain `sgp_week_pair_tabu` is the only advanced search mode that has shown a fresh win on the Social Golfer anchor (`5409 -> 5367`)
- conflict-restricted tabu sampling starved exploration in its first benchmark (`5471`)
- steady-state memetic search is too expensive relative to its current quality

So the next research question is:

> what tabu regime reduces churn without starving the useful late-search corridor?

## Experimental doctrine

- cheap local search should dominate runtime
- tabu tuning must be benchmarked on the canonical Social Golfer anchor
- final score is primary
- late-improvement timing matters, but never by itself
- throughput regressions are acceptable only if quality wins are real
- do not overfit to one telemetry counter

## Anchor lanes

All comparisons should use the existing canonical Social Golfer benchmark pair:

- time-limited anchor:
  - `backend/benchmarking/suites/social-golfer-plateau-time-solver3.yaml`
- fixed-iteration anchor:
  - `backend/benchmarking/suites/social-golfer-plateau-fixed-iteration-solver3.yaml`

Tabu variants should use dedicated SGP-tabu manifests built from those same anchors.

## Sweep structure

Use a two-stage funnel so the benchmark budget stays honest and focused.

### Stage A — time-limited screening

Run these regimes on the 25-second plateau lane:

1. `baseline`
   - no tabu
2. `tabu-short-fixed`
   - `tenure_min=8`, `tenure_max=8`, `retry_cap=16`, `aspiration=true`
3. `tabu-short-bounded`
   - `tenure_min=4`, `tenure_max=12`, `retry_cap=16`, `aspiration=true`
4. `tabu-medium-reference`
   - `tenure_min=8`, `tenure_max=32`, `retry_cap=16`, `aspiration=true`
5. `tabu-long-bounded`
   - `tenure_min=16`, `tenure_max=64`, `retry_cap=16`, `aspiration=true`
6. `tabu-medium-low-retry`
   - `tenure_min=8`, `tenure_max=32`, `retry_cap=4`, `aspiration=true`
7. `tabu-medium-high-retry`
   - `tenure_min=8`, `tenure_max=32`, `retry_cap=32`, `aspiration=true`
8. `tabu-medium-no-aspiration`
   - `tenure_min=8`, `tenure_max=32`, `retry_cap=16`, `aspiration=false`

Stage A purpose:
- establish whether short / medium / long tenure is the dominant lever
- check whether retry-cap saturation matters materially
- check whether aspiration is helping or mostly irrelevant

### Stage B — fixed-iteration confirmation

Take the best three tabu regimes from Stage A by final score and run them on the fixed-iteration lane.

Always include baseline in Stage B for orientation.

Stage B purpose:
- separate true quality-per-iteration improvement from time-budget artifacts
- confirm that any Stage A winner is not just a wall-clock accident

## Interpretation rubric

### Primary decision rule

A regime is only a serious winner if it improves final incumbent quality against baseline and against the current tabu reference.

Current orientation points from fresh benchmark history:

- baseline: `5409`
- current tabu reference (`8..32`, retry `16`, aspiration on): `5367`

### Secondary decision rules

Use these only after final score:

1. last-improvement timing
   - later meaningful improvements are good
   - but later improvement with worse final score is not a win
2. iterations per second
   - large throughput loss needs a clear quality justification
3. tabu telemetry
   - `raw_tabu_hits`
   - `prefilter_skips`
   - `retry_exhaustions`
   - `hard_blocks`
   - `aspiration_preview_surfaces`
   - `aspiration_overrides`
   - `recorded_swaps`
   - realized tenure summary

### Failure signatures to watch for

#### Tenure too short

Likely signs:
- near-baseline behavior
- low meaningful late improvement
- weak tabu-hit / skip effect

#### Tenure too long

Likely signs:
- worse final score
- earlier or harder stagnation
- higher block / exhaustion pressure without corresponding quality gains

#### Retry cap too low

Likely signs:
- rising `retry_exhaustions` / `hard_blocks`
- lower-quality incumbents despite similar throughput

#### Retry cap too high

Likely signs:
- extra sampler effort with no real score gain
- telemetry shows more skipping work but no better final incumbent

#### Aspiration not helping

Likely signs:
- `aspiration_preview_surfaces` and `aspiration_overrides` stay near zero
- or aspiration-on loses to aspiration-off on final score with no clear late-search upside

## What this matrix does not cover yet

Not in this first tuning sweep:

- alternate tabu recording rules
  - e.g. record only non-improving accepted swaps
  - e.g. record conditionally during stagnation
- conflict-restricted tabu
- memetic redesign
- recombination operators

Those are follow-up questions after the basic tabu regime is stabilized.

## Expected outputs

For the first benchmark todo, produce:

- dedicated benchmark manifests for the Stage A and Stage B tabu regimes
- artifact paths for each executed run
- a concise written summary of which regime is the best current cheap inner-loop candidate
- an explicit statement if no regime beats the current tabu reference
