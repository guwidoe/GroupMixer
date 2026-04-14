# Solver3 freedom-aware construction refactor plan

## Goal

Refactor the current generalized freedom-aware constructor so that it becomes **one unified generalized heuristic** with this mandatory invariant:

> If the input is a pure Social Golfer / paper-shaped case with no GroupMixer-specific structural constraints,
> the constructor behaves exactly like the heuristic described in
> `papers/marker/social-golfer-effective-greedy-heuristic/social-golfer-effective-greedy-heuristic.md`.

This means the generalized constructor may extend the paper heuristic where required by GroupMixer semantics, but it must **collapse to the exact paper behavior** when those semantics are absent.

---

## Non-negotiable invariants

### I1. One unified heuristic
- Do **not** build a separate "paper mode" and unrelated "general mode".
- There is one constructor family for freedom-aware construction.
- GroupMixer semantics are treated as constrained extensions of the same algorithm.

### I2. Pure-case exactness
For pure paper-shaped inputs, the constructor must match the paper on all essential mechanics:
- week-by-week traversal
- group-by-group traversal in natural order
- pair-slot-by-pair-slot placement
- freedom definition based on unmet partner sets only
- maximal-freedom pair choice for the randomized greedy initializer
- paper tie/randomization policy
- paper-style cross-week discouragement of previously selected pairs
- no singleton-extension reinterpretation where the paper would place pairs

### I3. Extension logic must disappear cleanly
If the input has none of these:
- cliques / must-stay-together blocks
- immovable people
- partial seed occupancy
- odd-tail / non-pair-aligned residual state
- partial participation / session-specific structural asymmetry

then the generalized constructor must reduce to the paper algorithm without any alternate scoring path.

### I4. Honest failure / honest benchmarking
- No silent fallback to baseline constructor.
- No hidden auto-repair that changes the benchmark question.
- Benchmark the refactor against canonical Social Golfer and neighboring workloads.

---

## Current mismatch to fix

The current implementation in `backend/core/src/solver_support/construction.rs` deviates from the paper in several important ways:

1. uses a future-co-participation filtered notion of freedom instead of the paper's unmet-partner-set definition
2. seeds empty groups with a pair and then fills with singleton candidates
3. uses a top-k restricted candidate list instead of the paper's tie/randomization rule
4. does not implement the paper's pair discouragement across future weeks literally enough
5. introduces generalized partial-group scoring as the primary mechanism instead of pair-slot construction as the base law

These deviations are the first things to remove or subordinate.

---

## Paper mechanics to preserve exactly in the pure case

From the paper's greedy initializer for local search:

### P1. Freedom definition
For partial configuration `C` and player `x`:
- `P_C(x)` = set of players that `x` has **not already partnered with** in any group of `C`

For set `S`:
- `phi_C(S)` = cardinality of the intersection of `P_C(x)` for all `x in S`

Pure-case rule:
- do **not** additionally filter by future co-participation
- do **not** add GroupMixer-specific feasibility terms into `phi`

### P2. Construction order
- visit weeks one after another
- for each week, traverse groups in natural order
- for each pair of adjacent positions in the group, choose a pair of still-unassigned players

### P3. Selection rule for randomized greedy initializer
- choose the pair with **maximal** freedom
- if ties exist:
  - with probability `gamma`, choose randomly among the tied maximal-freedom pairs
  - with probability `1 - gamma`, choose the lexicographically smallest pair

### P4. Cross-week pair discouragement
After selecting pair `(a, b)` in a week:
- subtract a large penalty from that pair's freedom in further weeks,
- so it becomes unattractive to select again.

### P5. No undo/backtracking in the initializer
- the randomized greedy initializer never undoes a choice
- it may produce conflictful starts, but it is still one-pass greedy

---

## Generalization strategy

The generalized heuristic should be built as a layered extension of the paper algorithm.

### Layer A — canonical pair engine (base law)
Implement a reusable inner engine that:
- works week-by-week
- fills groups by pair slots
- enumerates candidate pairs from still-assignable people
- scores those pairs using the paper's freedom definition
- applies the paper's tie/randomization rule
- applies paper-style cross-week pair discouragement

This layer must be the exact behavior for pure SGP cases.

### Layer B — forced occupancy adapter
Before pair-slot filling, incorporate GroupMixer-specific forced state for the current week:
- pre-seeded placements from `construction_seed_schedule`
- immovable people
- clique/block placements when required
- session-specific participation restrictions
- session-specific capacities

This layer should produce the current week's partial occupancy and the set of still-unassigned people.

### Layer C — minimal residual completion rules
Only when Layer B creates a state the paper algorithm cannot directly express, add minimal extension rules for:
- odd remaining slot in a group
- non-pair-aligned residual occupancy (e.g. 1 or 3 occupied seats in a size-4 group)
- block-induced residual completion after clique placement

Important:
- these residual rules must not replace pair-slot filling as the main construction mechanism
- they exist only for states the paper does not natively cover

---

## Proposed refactor structure

## 1. Introduce an explicit paper-faithful scoring substrate

### File
- `backend/core/src/solver_support/construction.rs`

### Add helpers
- `build_unmet_partner_matrix_from_prefix(...)`
- `paper_potential_partner_set(...)`
- `paper_freedom_of_set(...)`
- `candidate_pair_freedom_with_penalties(...)`

### Requirements
- unmet-partner state depends only on already-partnered relations, not future overlap
- cross-week pair-penalty is represented explicitly, not via generic repeat tie-break logic

### Acceptance criteria
- pure-case pair scores match direct calculations from the paper definition
- no future-co-participation dependency remains in pure-case scoring

---

## 2. Replace singleton-fill construction with pair-slot construction as the default inner loop

### File
- `backend/core/src/solver_support/construction.rs`

### Change
Replace the current main freedom-aware loop with:
- for week in weeks
- for group in natural order
- while a pair slot is available in the group:
  - choose best pair among still-unassigned players using paper scoring
  - place the pair
- if one seat remains because of odd residual structure:
  - invoke minimal residual rule

### Requirements
- empty pure groups are no longer seeded by one pair and then singleton-expanded
- size-4 pure groups are filled as pair + pair
- size-6 pure groups are filled as pair + pair + pair, etc.

### Acceptance criteria
- pure 8x4xw inputs never use singleton-extension logic during normal fill
- group traversal order is stable and deterministic

---

## 3. Implement the paper tie/randomization rule exactly

### File
- `backend/core/src/solver_support/construction.rs`
- possibly `backend/core/src/models.rs` if `gamma` is exposed

### Change
Remove top-k RCL behavior from the pure scoring path.

Implement:
- compute the maximal freedom value among candidate pairs
- collect all tied maximal-freedom pairs
- if `gamma` branch fires: random among those ties
- else choose lexicographically smallest pair

### Open configuration question
Decide whether to expose `gamma` now.

Recommended initial choice:
- add explicit `gamma` parameter to the freedom-aware constructor config
- default it to `0.0` to reproduce the paper's deterministic benchmarked runs unless explicitly changed

### Acceptance criteria
- for `gamma = 0`, pair choice is deterministic and lexicographic under ties
- for `gamma = 1`, choice is random among equal-max ties only
- the constructor no longer uses generic top-k RCL ranking in the paper-compatible path

---

## 4. Implement literal pair discouragement across later weeks

### File
- `backend/core/src/solver_support/construction.rs`

### Change
Add explicit pair-penalty state for selected pairs so that, after a pair is placed in one week, later-week pair selection strongly discourages reusing that pair.

This should not be modeled as a weak tiebreak.
It should act directly on candidate pair scoring so the pure-case behavior mirrors the paper.

### Requirements
- the same selected pair should be strongly dominated in later weeks even if unmet-partner-set freedom alone would still rate it highly
- penalty should be easy to inspect and test

### Acceptance criteria
- a pure-case regression test can show that the same pair becomes unattractive after earlier-week selection

---

## 5. Re-express GroupMixer extensions as residual constraints, not alternate heuristics

### File
- `backend/core/src/solver_support/construction.rs`

### Change
Refactor extensions so they sit around the pair engine rather than replacing it.

#### 5a. Pre-placed clique/block handling
- keep clique placement support
- but treat it as creating partial occupancy before pair filling starts
- when a block leaves an even number of remaining slots, continue with the paper pair engine
- only if a non-pair-aligned tail remains should residual completion logic activate

#### 5b. Immovable people
- immovables are forced occupants
- after placement, continue pair filling on remaining open slots

#### 5c. Partial seed schedule
- seeded occupants are fixed
- if the residual group remains pair-aligned, use the paper pair engine
- otherwise use the smallest possible residual rule

#### 5d. Partial participation
- participation changes who is eligible for the current week
- but pure-case scoring still uses unmet-partner sets among eligible remaining players
- do not replace the scoring law because of participation; only shrink candidate availability

### Acceptance criteria
- extension logic is visibly layered around pair-slot filling
- pure cases do not enter extension-only branches

---

## 6. Add a paper-compatibility detector for tests and diagnostics

### File
- `backend/core/src/solver_support/construction.rs` or a nearby helper module

### Add helper
- `is_paper_compatible_social_golfer_case(...) -> bool`

This helper is primarily for:
- tests
- assertions
- diagnostics
- benchmark interpretation

It should detect whether the current input satisfies the conditions where the generalized constructor should reduce exactly to the paper algorithm.

Possible conditions:
- no cliques
- no immovables
- no partial seed occupancy
- even group sizes
- no session-specific size asymmetry
- full participation / or at least paper-compatible uniform participation, depending on how strict we want exactness claims to be

### Acceptance criteria
- tests can assert that a chosen fixture is paper-compatible
- debug assertions can ensure pure-case logic paths are exercised for those fixtures

---

## 7. Strengthen tests around pure-case exactness

### Files
- `backend/core/src/solver_support/construction.rs`
- `backend/core/src/solver3/tests.rs`
- `backend/core/tests/test_cases/`

### Add tests

#### 7a. Pure-case pair-slot behavior
For a paper-compatible size-4 case:
- assert that construction fills by pairs, not singleton extensions
- expose enough internal/test-only state or helper checks to prove this

#### 7b. Paper freedom semantics
- verify pair scoring depends only on unmet partners
- verify future-overlap filtering does not affect the pure path

#### 7c. Tie/randomization behavior
- `gamma = 0` => lexicographic tie choice
- `gamma = 1` => random among equal-max ties only

#### 7d. Pair-penalty behavior
- after selecting a pair in week `i`, later-week scoring should heavily discourage reusing that same pair

#### 7e. Extension neutrality
For a pure SGP fixture, verify that:
- no clique/block residual path is used
- no odd-tail/singleton residual path is used

#### 7f. Existing GroupMixer semantics still work
Retain or add coverage for:
- cliques
- immovables
- partial seeds
- session-limited participants
- session-specific capacities

### Acceptance criteria
- the pure-case tests demonstrate paper-faithful mechanics directly
- the extended-case tests demonstrate GroupMixer semantics still hold

---

## 8. Rebenchmark after the refactor

### Benchmark suites
Reuse existing suites plus the freedom-aware variants already added:
- `backend/benchmarking/suites/social-golfer-plateau-time-solver3.yaml`
- `backend/benchmarking/suites/social-golfer-plateau-time-solver3-freedom-construction.yaml`
- `backend/benchmarking/suites/social-golfer-plateau-fixed-iteration-solver3.yaml`
- `backend/benchmarking/suites/social-golfer-plateau-fixed-iteration-solver3-freedom-construction.yaml`
- `backend/benchmarking/suites/stretch-kirkman-schoolgirls-time-solver3.yaml`
- `backend/benchmarking/suites/stretch-kirkman-schoolgirls-time-solver3-freedom-construction.yaml`
- `backend/benchmarking/suites/stretch-partial-attendance-capacity-pressure-time-solver3.yaml`
- `backend/benchmarking/suites/stretch-partial-attendance-capacity-pressure-time-solver3-freedom-construction.yaml`

### Required interpretation
- compare initial scores as well as final scores
- separate constructor-basin effects from runtime effects
- explicitly check whether the refactor fixes the pure-case initial-score collapse

### Acceptance criteria
At minimum, before considering rollout changes:
- pure Social Golfer must stop regressing relative to baseline, or at least the mechanism must now be a fair test of the paper heuristic
- benchmark write-up must state clearly whether the pure-case exactness refactor improved the target lane

---

## 9. Documentation updates

### Files
- update `backend/core/src/solver3/SGP_FREEDOM_AWARE_CONSTRUCTION_DESIGN.md`
- update benchmark summary after rerun
- optionally extend `docs/benchmarking/SPEC.md` if the semantics need clarification

### Must document
- one generalized heuristic model
- exact pure-case collapse to the paper heuristic
- extension points for GroupMixer semantics
- what conditions allow an exact "paper-faithful" claim

---

## Suggested implementation order

1. paper-faithful scoring substrate
2. pair-slot inner loop replacement
3. exact tie/randomization rule
4. literal pair-penalty support
5. restructure clique/seed/immovable handling around the pair engine
6. pure-case exactness tests
7. rebenchmark
8. update docs/summary

---

## Definition of done

This refactor is done only when all of the following are true:

1. there is still one generalized freedom-aware constructor
2. pure paper-shaped cases use exact paper mechanics
3. GroupMixer-specific constraints are handled as minimal extensions around that same mechanism
4. tests prove both the pure-case exactness and the extended-case semantics
5. benchmarks are rerun and documented honestly
