# Solver4 paper scope

## Decision

`solver4` now represents the **complete Triska/Musliu paper algorithm family** for pure zero-repeat Social Golfer workloads.

Implemented branches:

1. **Section 5** — complete backtracking guided by minimal freedom, with explicit pattern-driven set selection
2. **Sections 6 and 7** — randomized greedy initial configurations plus conflict-position local search with week-local tabu and 2-swap breakout after 4 non-improving iterations

## Boundary

`solver4` is still intentionally narrow.

It accepts only pure paper-compatible Social Golfer style scenarios:

- same participants in every session
- full attendance
- uniform fixed group sizes
- exact full partitioning every session
- zero-repeat semantics via `RepeatEncounter.max_allowed_encounters = 1` (meet at most once)
- no extra GroupMixer constraint families or attribute structure

This keeps the accepted input family aligned with the algorithm the paper actually defines.

## Mode split

`solver4` exposes both paper branches explicitly via `Solver4Mode`:

- `greedy_local_search`
- `complete_backtracking`

Section 5 also accepts an optional explicit `backtracking_pattern` such as:

- `3`
- `2-2`
- `4`
- `3-2-2-1`

If no pattern is supplied in complete-backtracking mode, solver4 uses the paper's simple pair-first decomposition (`2-2-...` plus a trailing `1` when the group size is odd).

## Non-goals

`solver4` is **not** a general repeat-heavy GroupMixer solver.

It should reject:

- partial attendance
- immovables
- together/apart constraints
- clique constraints
- attribute-balance constraints
- variable capacities
- non-zero-repeat `RepeatEncounter` parameterizations
- any hidden fallback to broader non-paper logic
