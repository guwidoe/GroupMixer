# Solver3 freedom-aware construction design

## Status

Implemented as an **explicit opt-in experimental constructor mode** for `solver3`.

Current rollout policy:
- preserve the shared baseline constructor as the default
- keep freedom-aware construction available only via explicit `solver3` config
- treat the mode as promising for pure SGP-shaped workloads, but still experimental overall
- do **not** broaden rollout without benchmark evidence across both pure and mixed workloads

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
- `construction.freedom_aware.gamma`

Default behavior remains:
- `baseline_legacy`

Invalid config policy:
- `gamma` must be within `[0.0, 1.0]`
- invalid values fail explicitly during `RuntimeState::from_input`

Interpretation of `gamma`:
- `gamma = 0.0` => deterministic lexicographic tie resolution
- `gamma = 1.0` => randomize among equal maximal-freedom candidates only

## Unified generalized heuristic model

There is **one generalized freedom-aware constructor**, not a separate paper-only algorithm plus a second unrelated GroupMixer algorithm.

Required invariant:

> if the input is a pure paper-compatible Social Golfer case, the generalized constructor collapses to the paper heuristic exactly on its essential mechanics.

GroupMixer-specific semantics are implemented as **minimal extensions around that same pair-based engine**.

## Paper-faithful pure-case behavior

When the input is paper-compatible, the constructor follows the paper's randomized greedy initializer structure:

1. visit sessions one after another
2. within each session, traverse groups in natural order
3. fill adjacent pair slots one pair at a time
4. choose the pair with **maximal freedom**
5. break ties using the paper policy:
   - with probability `gamma`, random among equal maximal-freedom pairs
   - otherwise lexicographically smallest pair
6. after selecting a pair, apply a large explicit pair penalty to discourage reusing that same pair in later sessions

Important pure-case consequence:
- the constructor does **not** reinterpret the paper as "seed a pair, then singleton-fill the rest of the group"
- for size-4 pure groups, it behaves as `pair + pair`
- for larger pure even groups, it behaves as repeated pair-slot placement

## Freedom definition used by the constructor

For partial configuration `C`, the generalized constructor uses the paper's idea of freedom:

- a player contributes to the potential-partner set of `x` only if:
  - `x` has not already partnered that player in an earlier constructed session, and
  - the two can still co-participate in some future session under the compiled participation structure

For a set `S`, the freedom score is the cardinality of the intersection of those potential-partner sets.

This means:
- on pure Social Golfer inputs with full participation, the behavior collapses to the paper's unmet-partner reasoning
- on GroupMixer inputs with participation restrictions, the same law shrinks naturally to the still-feasible future partner set

## GroupMixer extensions around the pair engine

### Partial seeds

Partial `construction_seed_schedule` entries are preserved and completed.
They are not silently overwritten.

### Immovable people

Immovables are treated as forced occupancy before pair-slot filling starts.

### Cliques

Active cliques are treated as forced blocks.
The constructor chooses their target group using the same freedom objective over:
- the current group occupants
- plus the full clique block

### Residual tails

When GroupMixer constraints create states the paper does not natively express, the constructor uses minimal residual completion rules:
- odd leftover seat in a group
- non-zero anchor occupancy from seeds / immovables / cliques
- non-pair-aligned residual group states

In those cases the constructor still uses the same freedom concept, but scores additions against the current partial group.

## Paper-compatibility detector

The shared construction module exposes a paper-compatibility detector for tests and diagnostics.

A case counts as paper-compatible only when the constructor sees:
- no cliques
- no immovables
- no seeded occupancy
- full participation
- uniform even group capacities

That detector exists to verify the collapse-to-paper invariant; it is not a second constructor mode.

## Failure policy

This constructor does **not** silently repair impossible residual states and does **not** silently fall back to the baseline constructor.

If it cannot complete a valid schedule under the explicit seed/capacity/constraint structure, it fails explicitly.
That matches the repo doctrine:
- no silent fallbacks
- no fake correctness
- explicit configuration or explicit failure

## Current benchmark-based rollout decision

See:
- `backend/core/src/solver3/SGP_FREEDOM_AWARE_CONSTRUCTION_BENCHMARK_2026-04-14.md`

Current result after the paper-faithfulness refactor:
- canonical Social Golfer improved modestly on both main lanes
- the neighboring Kirkman lane also improved
- the mixed partial-attendance/capacity workload still regressed
- initial scores remain dramatically worse than baseline even where final scores improved

Therefore:
- the refactor now provides a much fairer test of the paper heuristic on pure SGP-shaped inputs
- keep the mode available for research and explicit opt-in use
- do **not** make it the global default yet
- require further evidence before claiming it as the best generalized constructor for mixed GroupMixer workloads
