# ADR 0002: Objective research requires canonical benchmarks and dual validation

## Status

Accepted.

## Context

GroupMixer is preparing for an objective-quality research lane whose goal is to improve solver results on hard scenarios under meaningful fixed budgets.

The important consequences are:

- the benchmark suite is the research target, not a cheap proxy gate
- heterogeneous hard scenarios matter more than isolated time-per-iteration wins
- correctness must remain trustworthy even while the solver evolves rapidly
- benchmark and test cases must remain semantically truthful

A critical failure mode was already exposed:

- a canonical target scenario can fail in the current solver
- a derived or helper scenario can then be introduced so benchmark execution continues
- if that helper silently replaces the canonical target for the main benchmark question, the research result becomes invalid

That is not merely a disclosure problem. It invalidates the purpose of the benchmark/testing work itself.

At the same time, keeping all correctness logic only outside the solver would make move-level and drift-level development harder than necessary. GroupMixer already has the shape of a better pattern:

- an internal correctness-first oracle/debug path inside the solver family
- an external independent benchmark validator that remains authoritative for research trust

## Decision

### 1. Canonical benchmark and test scenarios are immutable research targets

If the repo declares a scenario as the canonical case for a benchmark or correctness question, that exact case is the thing being tested.

If the solver cannot run that case correctly, the correct result is:

- the test fails, or
- the benchmark lane is blocked, or
- the issue is recorded as an explicit gap

The correct result is **not** to simplify, derive, warm-start, proxy, or otherwise substitute a different case in order to make the lane pass.

### 2. No simplifying or substituting target cases to make tests pass

Without explicit user approval, contributors must not:

- replace a canonical benchmark case with an easier/derived/helper case
- simplify a correctness fixture so the current solver passes
- convert a failing target benchmark into a different benchmark question while presenting it as the same target
- use a helper start-state case as the main objective benchmark target

If the target case is failing, that failure must remain visible.

### 3. Helper cases may exist only as additional diagnostics

Derived, proxy, warm-start, benchmark-start, or other helper cases may exist only when they answer a clearly different engineering question, such as:

- deterministic cross-solver start-state comparison
- hotpath reproduction from a known state
- focused debugging of a construction-stage failure

Such cases must:

- be explicitly marked as non-canonical helpers
- record their provenance and relationship to the canonical source case
- never appear in the main canonical objective suite
- never be presented as the target benchmark answer

### 4. Benchmark truth is enforced by metadata and runner policy

The benchmark system must make the case identity explicit and machine-checkable.

Objective benchmark artifacts must record at least:

- canonical case id
- source path
- source hash/fingerprint
- case role (`canonical`, `helper`, `derived`, `proxy`, `warm_start`, or equivalent)
- declared purpose/family
- checked-in budget

Canonical objective suites must reject non-canonical cases by default.

### 5. Correctness uses dual validation

GroupMixer should use both:

#### Internal solver oracle/debug validation

Each solver family may ship an internal correctness-first oracle/debug path that can be compiled in for correctness testing and compiled out for performance work.

Its purpose is:

- preview/apply equivalence checking
- random move-sequence drift checking
- invariant validation
- local debugging of incremental logic

#### External benchmark validation

The benchmark runner must also perform an independent external final-solution validation for benchmark truth.

Its purpose is:

- anti-gaming protection for autoresearch
- independent final score validation
- independent breakdown validation
- authoritative benchmark trust

The external validator is the authoritative research check.

### 6. Budgets are per-case research parameters

A single time budget such as `15s` may be useful, but budgets are not fixed doctrine.

Each canonical objective case should declare the budget that makes that case informative. Some cases may need less time; others may need more.

### 7. The full canonical objective suite runs on every objective autoresearch experiment

For the objective research lane, the curated canonical objective suite is the thing being improved. It should therefore run in full on every experiment loop by default.

Cheap smoke subsets may still exist for developer convenience, but they are not the main objective autoresearch gate.

## Consequences

### Positive

- benchmark answers stay semantically meaningful
- objective research becomes resistant to accidental or deliberate target drift
- correctness tooling becomes stronger without requiring a second disconnected solver stack
- autoresearch gets trustworthy inputs and richer signals
- failing canonical cases stay visible until genuinely fixed

### Negative

- more benchmark runs will fail loudly instead of being papered over
- benchmark artifacts and manifests need stricter metadata
- benchmark execution becomes more expensive because validation is stronger and the full suite runs per experiment
- some currently convenient helper workflows will need renaming, segregation, or removal from canonical suites

## Rules implied by this ADR

1. Never simplify or substitute a canonical benchmark/test case to make a lane pass unless the user explicitly approves a changed benchmark question.
2. If the canonical target case does not run, fail honestly.
3. Keep helper cases separate from canonical objective suites.
4. Record benchmark case identity and provenance in artifacts.
5. Provide both an internal solver oracle/debug path and an external benchmark validator.
6. Treat the external validator as authoritative for benchmark truth.
7. Use checked-in per-case budgets rather than assuming one global time budget is always correct.
8. For objective autoresearch, run the full canonical objective suite on every experiment by default.

## Follow-on work

- harden benchmark manifests and runner policy around canonical vs helper case roles
- add external final-solution validation and score-breakdown validation to benchmark runs
- add a feature-gated internal solver3 oracle/debug validation path
- curate a heterogeneous canonical objective suite and a separate edge-case correctness corpus
- expand telemetry and artifacts so objective-quality experiments can be judged on more than one scalar
- only launch the objective autoresearch lane once those foundations are in place
