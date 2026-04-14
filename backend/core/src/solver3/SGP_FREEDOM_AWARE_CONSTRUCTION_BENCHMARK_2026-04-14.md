# Solver3 freedom-aware construction benchmark summary — 2026-04-14

## Question

After refactoring the freedom-aware constructor so the generalized heuristic collapses to the paper behavior on pure Social Golfer inputs, does it now improve the current baseline constructor on the canonical SGP lanes and on neighboring workloads?

All comparisons below use **release-profile** benchmark runs on the same machine.
Lower score is better.

## Compared suites

### Social Golfer
- baseline time lane:
  - `social-golfer-plateau-time-solver3-20260414T181732Z-df5f4db8`
- freedom-aware time lane:
  - `social-golfer-plateau-time-solver3-freedom-construction-20260414T181745Z-0a30f997`
- baseline fixed-iteration lane:
  - `social-golfer-plateau-fixed-iteration-solver3-20260414T181758Z-ad3816c5`
- freedom-aware fixed-iteration lane:
  - `social-golfer-plateau-fixed-iteration-solver3-freedom-construction-20260414T181808Z-1d4d4df1`

### Neighboring zero-repeat workload
- baseline Kirkman lane:
  - `stretch-kirkman-schoolgirls-time-solver3-20260414T181819Z-183bd70a`
- freedom-aware Kirkman lane:
  - `stretch-kirkman-schoolgirls-time-solver3-freedom-construction-20260414T181821Z-767837a8`

### Mixed workload
- baseline partial-attendance/capacity lane:
  - `stretch-partial-attendance-capacity-pressure-time-solver3-20260414T181823Z-0683f40c`
- freedom-aware partial-attendance/capacity lane:
  - `stretch-partial-attendance-capacity-pressure-time-solver3-freedom-construction-20260414T181826Z-fec44ef4`

## Results

| Workload | Baseline final | Freedom-aware final | Delta | Baseline init | Freedom-aware init | Runtime note |
|---|---:|---:|---:|---:|---:|---|
| Social Golfer time lane | 5451 | 5430 | -21 better | 9422 | 23344 | 12.38s vs 12.05s |
| Social Golfer fixed-iteration lane | 5451 | 5430 | -21 better | 9422 | 23344 | 10.01s vs 10.87s for 10M iters |
| Kirkman fixed-time lane | 66 | 55 | -11 better | 678 | 2300 | 1.45s vs 1.88s |
| Partial-attendance mixed lane | 6636 | 6695 | +59 worse | 18057 | 29849 | 2.40s vs 2.69s before stagnation stop |

## Interpretation

The paper-faithfulness refactor materially changed the reading of the experiment.

### What improved

1. **The pure SGP target lane now wins.**
   - Social Golfer improved from `5451` to `5430` in both the fixed-time and fixed-iteration comparisons.
   - This is a real reversal of the earlier result, where the first generalized adaptation had regressed the target lane.

2. **The neighboring Kirkman lane also improved.**
   - Kirkman moved from `66` to `55`.
   - That strengthens the claim that the paper-faithful pair-slot behavior is capturing something useful on pure zero-repeat workloads.

3. **The new result is a fairer test of the paper heuristic.**
   - The constructor now uses paper-style pair-slot traversal, paper tie handling, and explicit pair discouragement.
   - So these gains are much more defensible than the earlier result from the more distorted first adaptation.

### What still looks bad

1. **Initial basin quality is still dramatically worse.**
   - Freedom-aware initial scores remain far above baseline on every lane.
   - The constructor itself still builds much rougher starts than the baseline constructor.

2. **Mixed GroupMixer workload behavior is still worse.**
   - The partial-attendance/capacity lane regressed from `6636` to `6695`.
   - So the generalized constructor is still not a safe global default across the broader workload mix.

3. **The current win seems search-coupled, not constructor-clean.**
   - Since initial scores are much worse but final pure-case scores are better, the likely explanation is that solver3 search can exploit the paper-like basin better on pure SGP-shaped workloads even though the seed itself is rougher.
   - That is interesting, but it is not the same thing as saying the constructor is broadly stronger on its own.

## Current conclusion

- The refactor now gives a **credible paper-faithful test** on pure Social Golfer-shaped workloads.
- On that target subdomain, the constructor is now **promising** and currently beats the preserved baseline on the tested SGP and Kirkman lanes.
- But mixed GroupMixer workloads still regress, and the initial-score collapse remains severe.

So the honest rollout decision is:
- keep the mode **opt-in and experimental overall**
- do **not** make it the global default yet
- treat it as the stronger research path for pure SGP-style workloads
- revisit broader rollout only after mixed-case behavior improves

## Recommended next steps if revisited

1. Diagnose why pure-case final scores improve despite much worse initial scores.
2. Investigate whether the generalized residual rules are what hurts mixed workloads.
3. Compare pure-case runs at `max_iterations = 0` versus searched runs to isolate constructor-only quality from search-basin effects.
4. Keep benchmark comparisons honest across both canonical SGP and mixed neighboring workloads before any rollout change.
