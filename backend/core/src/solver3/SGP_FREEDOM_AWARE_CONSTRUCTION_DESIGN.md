# Solver3 freedom-aware construction design

## Status

Implemented as an **explicit opt-in experimental constructor mode** for `solver3`.

Current rollout policy:
- preserve the shared baseline constructor as the default
- enable freedom-aware construction only via explicit `solver3` config
- do **not** broaden rollout without benchmark evidence
- current benchmark evidence says the first cut is **not** good enough for default use

## Why the baseline constructor stays preserved

`backend/core/src/solver_support/construction.rs::apply_baseline_construction_heuristic()`
remains the shared legacy constructor.

Reasons:
- `solver1` depends on its current semantics
- `solver3::RuntimeState::from_compiled*` still needs a stable baseline path
- benchmark honesty requires comparing the new constructor against the old one, not silently replacing it
- the repo doctrine forbids hidden behavioral changes in correctness-critical paths

So the freedom-aware work is added as a **second constructor mode**, not as an in-place rewrite.

## Config surface

The mode is selected through `solver3` params in `backend/core/src/models.rs`:

- `construction.mode = baseline_legacy`
- `construction.mode = freedom_aware_randomized`
- `construction.freedom_aware.restricted_candidate_list_size`

Default behavior remains:
- `baseline_legacy`

Invalid config policy:
- `restricted_candidate_list_size` must be `>= 1`
- invalid values fail explicitly during `RuntimeState::from_input`

## GroupMixer adaptation of “freedom”

For current session `s`, a person `q` is considered a **future potential partner** of `p` when:

1. `q != p`
2. `p` and `q` have **not** already met in any earlier constructed session
3. there exists at least one future session `t > s` where both `p` and `q` participate

For a set of people `S`, the constructor uses:

- `freedom(S) = number of people outside S that remain future potential partners of every member of S`

So this first implementation uses the size of the intersection of future-partner sets as its main score.

## Construction procedure

The freedom-aware path still builds **session by session**.

For each session:

1. start from any partial `construction_seed_schedule`
2. honor immovable people first
3. treat active cliques as indivisible blocks
4. fill remaining space with freedom-aware randomized greedy selection

### Empty groups

For empty groups, the constructor seeds with the best-scoring pair among remaining unassigned participants.

Primary score:
- `freedom({a, b})`

Tie-breakers:
- lower immediate repeat damage
- higher sum of singleton future freedom
- seeded random selection from a restricted candidate list

### Partial groups

For non-empty groups, the constructor scores each admissible candidate `c` by:

- `freedom(current_group ∪ {c})`

Tie-breakers:
- lower immediate repeat damage against the current group
- higher singleton future freedom
- seeded random selection from a restricted candidate list

## Restricted candidate list policy

The current implementation uses a simple **top-k restricted candidate list**.

- all candidates are sorted by the score tuple
- the top `k = restricted_candidate_list_size` become the RCL
- one candidate is drawn from that list using the seeded RNG

This keeps the constructor:
- deterministic for a fixed seed
- mildly randomized
- easy to benchmark honestly

## Clique / seed / participation handling

### Partial seeds

Partial `construction_seed_schedule` entries are preserved and completed.
They are not silently overwritten.

### Cliques

Active cliques are treated as **blocks**, not as loose individuals.
The constructor chooses their target group using the same freedom score over:

- existing seeded occupants in that group
- plus the full clique block

### Participation

Future freedom only counts people that still co-participate in a future session.
A person absent from all future sessions does not contribute to freedom.

### Session-specific capacities

All placement decisions respect the effective per-session group capacities already compiled by the solver.

## Failure policy

This constructor does **not** silently repair impossible residual states.

If it cannot complete a valid schedule under the explicit seed/capacity/constraint structure, it fails explicitly.
That matches the repo doctrine:
- no silent fallbacks
- no fake correctness
- explicit configuration or explicit failure

## Current benchmark-based rollout decision

See:
- `backend/core/src/solver3/SGP_FREEDOM_AWARE_CONSTRUCTION_BENCHMARK_2026-04-14.md`

Current result:
- the first freedom-aware adaptation regressed Social Golfer
- it also regressed Kirkman and a mixed partial-attendance workload

Therefore:
- keep the mode available for research
- do **not** make it default
- do **not** claim it as a general constructor upgrade yet

## Likely next refinement directions

If constructor work is revisited later, the most plausible next upgrades are:

1. stronger residual-feasibility awareness near the end of a session fill
2. richer block scoring than the current simple intersection count
3. hybrid greedy-construction plus bounded repair instead of pure one-pass greedy fill
4. least-freedom residual repair for hard tail cases
5. tighter coupling between constructor structure and the downstream search kernel
