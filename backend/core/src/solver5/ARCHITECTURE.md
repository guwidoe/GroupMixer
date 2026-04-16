# Solver5 Architecture

`solver5` is the **construction-first pure-SGP solver family**.

Its purpose is not to be a broad GroupMixer solver. Its purpose is to be a
truthful, extensible portfolio of **explicit Social Golfer constructions** for
pure equal-partition, meet-at-most-once workloads.

This document is normative for solver5 extension work.

## Scope and honesty policy

Solver5 accepts only pure SGP-style cases:

- same participants every week
- full attendance
- equal fixed group sizes
- exact full partitions each week
- `maximize_unique_contacts` objective only
- exactly one `RepeatEncounter` constraint with
  `max_allowed_encounters = 1`

If a case is outside that scope, solver5 must fail explicitly.

If a case is inside pure-SGP scope but no current family can construct it,
solver5 must also fail explicitly.

Solver5 must **not**:

- silently fall back to a search solver
- hardcode benchmark-specific matrix answers
- emit schedules with non-zero canonical `final_score`
- weaken the benchmark definition to make coverage look better
- hide unsupported-family gaps behind vague errors

## Internal module boundaries

Solver5 is intentionally split into distinct subsystems.

### `problem.rs`
Pure-SGP validation and canonical solver5 input parsing.

Responsibilities:
- validate solver5 selection
- reject non-pure inputs truthfully
- derive the internal pure-SGP problem shape

### `types.rs`
Typed internal construction model.

Responsibilities:
- person/block/week/schedule types
- construction family identity
- composition operator identity
- construction result / span / provenance

This is the stable internal contract for future construction and heuristic work.
Avoid passing raw `Vec<Vec<Vec<usize>>>` across subsystem boundaries.

### `families/`
Direct design-theoretic constructors.

Responsibilities:
- implement one family per module
- return typed `ConstructionResult`
- own family-local math/encoding only

Current families:
- `round_robin`
- `transversal_design`
- `affine_plane`
- `kirkman`

Do not put router policy, benchmark special casing, or future repair heuristics
inside family modules.

### `composition/`
Structural composition operators that extend or combine base constructions.

Responsibilities:
- recursive lifting
- future combinators that preserve explicit construction provenance

Composition is distinct from direct family construction.
A composition operator may use smaller constructed schedules, but it should not
blur into a search fallback.

### `router.rs`
Portfolio routing and capability gating.

Responsibilities:
- define family precedence explicitly
- record what was attempted
- report truthful unsupported reasons
- distinguish inapplicable families from insufficient-week coverage

If multiple families can apply, the router is the only place that decides
precedence.

### `heuristics/`
Future post-construction improvement layers.

Responsibilities:
- optional repair/improvement/metaheuristic passes on top of explicit
  constructions
- keep heuristic policy separate from family construction and router policy

The initial pipeline is intentionally a no-op. This module exists so future
advanced heuristics have a clean home instead of contaminating constructors.

### `result.rs`
Canonical projection and scoring.

Responsibilities:
- convert typed schedules back to API schedules
- rescore through the canonical solver3 scoring path
- ensure solver5 only counts solved cells when canonical score is zero

## Extension rules

When adding a new family:

1. add a dedicated module under `families/`
2. keep its eligibility assumptions explicit
3. return typed provenance
4. add family-level tests
5. wire it into `router.rs` explicitly
6. benchmark honestly against the fixed construction-coverage matrix

When adding a new composition operator:

1. add it under `composition/`
2. keep the operator explicit in construction provenance
3. do not hide family failures behind opaque composition behavior
4. add operator-specific tests

When adding a heuristic improver:

1. add it under `heuristics/`
2. make its use explicit in solver5 orchestration/config
3. keep it separate from direct family implementation
4. do not let it silently change unsupported-case semantics

## Benchmark policy

Solver5 coverage is measured by the fixed pure-SGP matrix:

- `2 <= g <= 10`
- `2 <= p <= 10`

Primary metric:
- `total_constructed_weeks`

A cell only counts as solved when:
- solver5 returns a schedule, and
- canonical `final_score == 0`

Prefixes are legitimate when a family constructs `g-p-W` and the requested case
is `g-p-w` with `w <= W`.

## Near-term roadmap

Expected next work belongs here, not in ad hoc files:

- composite-row `p=3` coverage via NKTS-style families
- dedicated `p=4` routing/construction
- later broader explicit families only after those land

## Non-goal

Solver5 is **not** the place for hidden general-purpose search fallback.
If a capability is unsupported, solver5 should say so plainly.
