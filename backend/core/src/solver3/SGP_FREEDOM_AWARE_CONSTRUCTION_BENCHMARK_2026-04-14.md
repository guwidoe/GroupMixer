# Solver3 freedom-aware construction benchmark summary — 2026-04-14

## Question

Does the new `solver3` freedom-aware randomized greedy constructor improve the current baseline constructor on the canonical Social Golfer lanes and on nearby workloads?

All comparisons below use **release-profile** benchmark runs on the same machine.
Lower score is better.

## Compared suites

### Social Golfer
- baseline time lane:
  - `social-golfer-plateau-time-solver3-20260414T171558Z-16a85cd0`
- freedom-aware time lane:
  - `social-golfer-plateau-time-solver3-freedom-construction-20260414T171609Z-7107af72`
- baseline fixed-iteration lane:
  - `social-golfer-plateau-fixed-iteration-solver3-20260414T171621Z-ec3abfab`
- freedom-aware fixed-iteration lane:
  - `social-golfer-plateau-fixed-iteration-solver3-freedom-construction-20260414T171632Z-3436b588`

### Neighboring zero-repeat workload
- baseline Kirkman lane:
  - `stretch-kirkman-schoolgirls-time-solver3-20260414T171645Z-50ac51e5`
- freedom-aware Kirkman lane:
  - `stretch-kirkman-schoolgirls-time-solver3-freedom-construction-20260414T171648Z-6adec853`

### Mixed workload
- baseline partial-attendance/capacity lane:
  - `stretch-partial-attendance-capacity-pressure-time-solver3-20260414T171651Z-f942ace4`
- freedom-aware partial-attendance/capacity lane:
  - `stretch-partial-attendance-capacity-pressure-time-solver3-freedom-construction-20260414T171700Z-a0ca1210`

## Results

| Workload | Baseline final | Freedom-aware final | Delta | Baseline init | Freedom-aware init | Runtime note |
|---|---:|---:|---:|---:|---:|---|
| Social Golfer time lane | 5451 | 5472 | +21 worse | 9422 | 16320 | 11.02s vs 11.34s |
| Social Golfer fixed-iteration lane | 5451 | 5472 | +21 worse | 9422 | 16320 | 10.65s vs 12.81s for 9M iters |
| Kirkman fixed-time lane | 66 | 77 | +11 worse | 678 | 1339 | 2.20s vs 2.38s |
| Partial-attendance mixed lane | 6516 | 6619 | +103 worse | 18057 | 19686 | 7.67s vs 11.57s before stagnation stop |

## Interpretation

The first freedom-aware constructor cut is **not competitive** with the current baseline constructor.

Observed pattern:

1. **Initial basin quality is worse on every tested lane.**
   - The freedom-aware constructor produced materially worse initial scores on Social Golfer, Kirkman, and the mixed workload.
   - Search did not recover that gap.

2. **Social Golfer regressed in both canonical lanes.**
   - The score moved from `5451` to `5472` in both the fixed-time and fixed-iteration comparisons.
   - So the constructor did not help the target anchor workload.

3. **The neighboring zero-repeat workload also regressed.**
   - Kirkman moved from `66` to `77`.
   - That weakens the idea that the current heuristic is simply “too mixed-workload oriented” and only needs a more SGP-shaped lane.

4. **The mixed workload regressed as well.**
   - Partial-attendance/capacity pressure moved from `6516` to `6619`.
   - Runtime-to-stagnation also increased materially.

## Current conclusion

Do **not** roll this constructor out beyond explicit experimentation.

Current best reading:
- the literature idea is still plausible,
- but this first adaptation is too naive for GroupMixer’s current state/search coupling,
- especially around how freedom is scored for partial groups and how current-session structure interacts with later repair/search.

## Recommended next steps if revisited

1. Keep the constructor mode **opt-in only**.
2. Do **not** change the default constructor.
3. If revisiting, investigate:
   - more exact treatment of residual feasibility while filling sessions,
   - better block/pair scoring than the current simple intersection count,
   - a hybrid constructor/repair approach instead of pure greedy fill,
   - whether least-freedom residual repair is needed near the end of a session fill.
4. Prefer search-side work unless new constructor ideas can beat the current baseline honestly on Social Golfer first.
