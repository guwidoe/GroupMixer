# Solver4 Sections 6/7 trace findings for `8-4-9` (`32x8x9`) with `gamma=0`

Date: 2026-04-15

## Reproduction lane

- Suite: `backend/benchmarking/suites/solver4-8x4x9-gamma0-trace.yaml`
- Run report: `backend/benchmarking/artifacts/runs/solver4-8x4x9-gamma0-trace-20260415T124100Z-f34bb9fb/run-report.json`
- Solver mode: `greedy_local_search`
- Seeds: `320910`, `320911`, `320912`, `320913`

## Headline finding

The four failing `8-4-9` heuristic runs do **not** diverge during initialization.
They all build the **same initial schedule**, descend through the **same deterministic improving path**, and reach the **same incumbent** by iteration `102`.

The first cross-seed divergence starts **after** that point, when the algorithm enters the long breakout-driven plateau. Breakouts change the current conflict distribution materially, but none of the ~2000 breakouts per seed improve the incumbent beyond the same `57` conflict-position basin.

## Per-seed summary

| seed | initial `f(C)` | initial conflicts by week | first plateau / incumbent | best incumbent reached | runtime | iterations | breakouts | final public result |
|------|----------------|---------------------------|---------------------------|------------------------|---------|------------|-----------|---------------------|
| 320910 | 288 | `[32,32,32,32,32,32,32,32,32]` | iter `102` | `57` conflict positions, week vector `[4,0,9,3,5,9,11,8,8]` | `20.001s` | `10189` | `2017` | `413/432` contacts, final score `4779` |
| 320911 | 288 | `[32,32,32,32,32,32,32,32,32]` | iter `102` | `57` conflict positions, week vector `[4,0,9,3,5,9,11,8,8]` | `20.001s` | `10106` | `2000` | `413/432` contacts, final score `4779` |
| 320912 | 288 | `[32,32,32,32,32,32,32,32,32]` | iter `102` | `57` conflict positions, week vector `[4,0,9,3,5,9,11,8,8]` | `20.000s` | `10135` | `2006` | `413/432` contacts, final score `4779` |
| 320913 | 288 | `[32,32,32,32,32,32,32,32,32]` | iter `102` | `57` conflict positions, week vector `[4,0,9,3,5,9,11,8,8]` | `20.002s` | `10139` | `2007` | `413/432` contacts, final score `4779` |

## What the traces show

### 1. Initialization is fully deterministic at `gamma=0`

Across all four seeds:

- the captured `initial_schedule` is identical
- initial `f(C)` is identical: `288`
- initial per-week conflict-position vector is identical: `[32,32,32,32,32,32,32,32,32]`

So the seeds are **not** producing different starting points.

### 2. The early improving path is also fully deterministic

Across all four seeds, the trace points are identical from iteration `0` through iteration `102`.

The key milestone is the same in all runs:

- iteration `102`
- current `f(C) = best f(C) = 57`
- conflict vector by week: `[4,0,9,3,5,9,11,8,8]`

That means the heuristic does not merely share an initializer; it also shares the same deterministic pre-breakout descent into the plateau basin.

### 3. The plateau begins before any seed-specific divergence matters

No better incumbent is recorded after iteration `102` in any seed.

Because the local-search trace records every improvement and every `1000` iterations, the absence of any improvement trace point after `102` means the search is already stuck in the same incumbent basin before the random breakout phase produces seed-specific trajectories.

So the first important failure signal is:

- **not** seed-specific initialization drift
- **not** seed-specific breakout luck
- but the common deterministic pipeline that always lands in the same `57`-conflict incumbent

### 4. Breakouts perturb the current state a lot, but never improve the incumbent

By iteration checkpoints after the plateau, the **current** conflict positions vary substantially by seed, e.g. at iteration `1000`:

- seed `320910`: `88`
- seed `320911`: `114`
- seed `320912`: `103`
- seed `320913`: `123`

Average current `f(C)` over checkpoints `1000..10000`:

- seed `320910`: `101.8`
- seed `320911`: `104.8`
- seed `320912`: `105.0`
- seed `320913`: `112.6`

So breakout swaps **do** change conflict concentration materially. But none of those excursions ever beat the same incumbent `f(C)=57`.

### 5. Tabu/aspiration signals from the plateau

Across all four runs:

- ~`69k` raw tabu hits occur
- ~`12.1k` swaps are recorded in tabu history
- realized tenure is exactly `10` every time
- `aspiration_overrides = 0`

This means the post-plateau search is actively exploring, but it never encounters a tabu-blocked move that would improve the global best. The heuristic is wandering, not breaking into a strictly better basin.

## Additional observation: lexicographic early-week bias

In the representative seed-1 trace, weeks start improving in this order:

- week 0 first changes at iteration `1`
- week 1 at `13`
- week 2 at `14`
- week 3 at `29`
- week 4 at `30`
- week 5 at `44`
- week 7 at `47`
- week 8 at `48`
- week 6 at `55`

This is consistent with a strongly deterministic, lexicographically ordered early descent rather than a diversified conflict-dispersal phase.

## Conclusion

The traces indicate:

1. the four seeds share the **same initializer**
2. they also share the **same deterministic local-search descent** up to iteration `102`
3. the first cross-seed divergence appears only in the **breakout wandering phase**
4. the real bottleneck is therefore the common pre-breakout Sections 6/7 trajectory, which always lands in the same `57`-conflict basin and never escapes it

### Practical implication

The most promising next investigation is **not** "why did one seed get unlucky?".
It is:

- why the deterministic initializer + earliest swap sequence always converges to the same `57`-conflict incumbent on `8-4-9`
- and whether that common basin is caused primarily by:
  - the Section 6 construction shape, or
  - an overly narrow / biased Section 7 improvement path before breakouts start
