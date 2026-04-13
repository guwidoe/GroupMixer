# Solver3 Hotspot-Guided Search — Phase 0 Plan

## Status

Detailed Phase 0 plan focused on **observability, diagnosis, and benchmark-facing presentation** before changing solver behavior.

This plan is intentionally based on a review of the existing benchmark and telemetry stack. The main conclusion of that review is:

> GroupMixer already has a **substantial** benchmarking and telemetry foundation.
>
> Phase 0 should therefore emphasize **surfacing, interpreting, and lightly extending** existing telemetry rather than building a large new instrumentation subsystem.

## Review of the current benchmarking and telemetry infrastructure

This section captures the practical review that informs the Phase 0 scope.

## 1. What the repo already has

### A. Shared benchmark artifact pipeline is already strong

The benchmark runner and artifact schema already persist, per run and per case:

- suite metadata
- machine identity
- git identity
- case identity and budget identity
- effective seed
- effective move policy
- stop reason
- timing breakdown
- final objective metrics
- score decomposition
- move-family telemetry
- search telemetry
- external final-solution validation

Relevant files reviewed:

- `docs/BENCHMARKING_ARCHITECTURE.md`
- `docs/benchmarking/WORKFLOW.md`
- `backend/benchmarking/src/runner.rs`
- `backend/benchmarking/src/artifacts.rs`
- `backend/benchmarking/schemas/run-report.schema.json`
- `backend/benchmarking/schemas/case-run.schema.json`

This is already far beyond a minimal benchmark harness.

### B. Search telemetry already includes an improvement timeline

The existing end-of-run benchmark telemetry model already stores:

- accepted uphill / downhill / neutral move counts
- max no-improvement streak
- restart count
- perturbation count
- iterations per second
- `best_score_timeline`

Relevant files reviewed:

- `backend/core/src/models.rs`
- `backend/core/src/solver1/search/simulated_annealing.rs`
- `backend/core/src/solver2/search/engine.rs`
- `backend/core/src/solver3/search/context.rs`
- `backend/core/src/solver3/search/engine.rs`

So the specific thing you asked for — a curve showing how score improves during solve time — is **already present in the data model and in persisted benchmark artifacts**.

### C. The benchmark runner already persists the timeline into case artifacts

`backend/benchmarking/src/runner.rs` maps solver telemetry into `SearchTelemetryArtifact`, including:

- `iterations_per_second`
- accepted move direction counts
- `best_score_timeline`

So this is not merely runtime-only telemetry. It is already part of persisted benchmark output.

### D. The compare/report infrastructure already understands search telemetry

The compare layer already computes deltas for:

- iterations per second
- max no-improvement streak
- accepted move direction counts
- restart count
- perturbation count
- best-score timeline point count

Relevant files reviewed:

- `backend/benchmarking/src/compare.rs`
- `backend/benchmarking/src/summary.rs`

### E. Hotpath and full-solve layers are already separated correctly

The repo already distinguishes:

- full-solve benchmark artifacts
- hotpath benchmark artifacts
- external validation
- suite/baseline/recording workflows

That separation is important. It means Phase 0 does **not** need to invent a new benchmark architecture just to study search plateaus.

## 2. What is already good enough for Phase 0

### A. We do not need a brand new telemetry channel to detect early plateaus

The existing `best_score_timeline` is already the right raw signal for:

- early fast improvement
- last-improvement time
- plateau onset
- whether extra budget produced later improvements
- comparative curve shape across solver versions

### B. We do not need attempt-level logging in Phase 0

That would be expensive, noisy, and likely unnecessary as an initial step.

Phase 0 should avoid:

- per-attempt event logs
- storing every candidate preview
- storing per-iteration score traces
- broad new always-on telemetry that threatens throughput

### C. We already have enough benchmark identity and reproducibility metadata

Because run artifacts already capture:

- machine
- git revision
- case identity
- declared/effective budgets
- solver family
- seed

Phase 0 can focus on interpretation rather than benchmark reproducibility work.

## 3. Current gaps in the existing infrastructure

The main problem is **not missing raw telemetry**, but missing **presentation and derived interpretation**.

### Gap A — The curve exists in JSON, but is not surfaced as a first-class output

Today the benchmark artifact contains `best_score_timeline`, but the human-facing benchmark summary does not present the curve shape in a practical way.

Current comparison/reporting mostly reduces the timeline to:

- number of timeline points

That is much weaker than what we actually care about for this feature.

### Gap B — There are no benchmark-facing derived plateau metrics

The raw timeline exists, but there is no standard derived summary such as:

- time of last improvement
- iteration of last improvement
- fraction of budget consumed before last improvement
- number of improvements after 25% / 50% / 75% of budget
- score at time checkpoints
- time needed to reach selected score thresholds
- normalized improvement-area style summaries

These are exactly the kinds of metrics needed to reason about “fast early progress, then stall”.

### Gap C — Solver3 timeline timestamps appear coarsened / cached

From the reviewed Social Golfer run artifact:

- many early `best_score_timeline` points share identical `elapsed_seconds` values

That strongly suggests the current solver3 timeline timestamps are being recorded from a cached time sample rather than measuring elapsed time at each improvement event.

This is understandable from a performance perspective, but it weakens the fidelity of the improvement curve.

Relevant code path reviewed:

- `backend/core/src/solver3/search/engine.rs`
- `backend/core/src/solver3/search/context.rs`

In solver3 today, elapsed time is refreshed only periodically and then reused when recording best-score updates. That is likely acceptable for stop-condition checks, but it is not ideal for a benchmark-facing improvement curve.

### Gap D — The compare layer does not compare curve shape

Currently the comparison logic notices only the number of timeline points, not the structure of the timeline itself.

That means it cannot answer questions like:

- did the new version improve faster early but stall earlier?
- did it improve less early but keep making progress late?
- did last-improvement time move meaningfully later?

### Gap E — There is no dedicated benchmark output optimized for search-trajectory inspection

The run reports are correct and useful, but large JSON is not a convenient day-to-day way to inspect trajectory shape.

What is missing is a thin presentation layer such as:

- concise textual plateau summary
- exported downsampled curve JSON
- ASCII sparkline / simple terminal chart
- or sidecar CSV / JSON specifically for plotting

## 4. Phase 0 scope conclusion from the review

The right conclusion is:

> Phase 0 should be a **telemetry surfacing and diagnosis phase**, not a large new instrumentation phase.

The primary work should be:

1. expose the already-recorded best-score timeline as a first-class benchmark output
2. derive plateau-oriented metrics from that timeline
3. fix any fidelity problems that make the curve misleading
4. add only the minimum extra telemetry needed for later hotspot-guidance validation

That is enough to make the plateau behavior inspectable without risking a major performance regression in the benchmark system itself.

## Phase 0 goals

Phase 0 exists to answer the following questions honestly before search behavior changes:

1. **How quickly does solver3 make its early gains?**
2. **When does the last meaningful improvement happen?**
3. **How much of the time budget is spent after effective stagnation begins?**
4. **How does this differ across time-budget and fixed-iteration lanes?**
5. **How does solver3’s trajectory shape compare to solver1 / solver2 where relevant?**
6. **Can we diagnose plateau behavior using existing telemetry plus light derived summaries?**

## Phase 0 non-goals

Phase 0 should explicitly avoid:

- hotspot-guided candidate generation
- new move families
- per-attempt telemetry logs
- full progress-callback persistence into benchmark artifacts
- speculative offender caches
- heavy new generic telemetry frameworks

## Phase 0 deliverables

## Deliverable 0.1 — Telemetry audit and documentation update

### Goal

Document clearly what telemetry already exists, what is persisted, and how it should be interpreted for plateau diagnosis.

### Work

- document the existing search telemetry fields used in full-solve artifacts
- document where `best_score_timeline` comes from for solver1/solver2/solver3
- document the current limitations of the timeline fidelity for solver3
- document which questions can already be answered from existing artifacts

### Candidate doc targets

- extend `backend/core/src/solver3/HOTSPOT_GUIDED_SEARCH_PLAN.md`
- or add a benchmark-focused note under `docs/benchmarking/`

### Exit criteria

A new contributor can answer:

- where plateau telemetry already lives
- how to retrieve it
- what it currently does and does not mean

## Deliverable 0.2 — First-class improvement-curve output

### Goal

Turn the existing `best_score_timeline` into a benchmark-facing output, not just buried JSON.

### Recommendation

Treat this as the most important Phase 0 implementation item.

### Minimum acceptable output forms

At least one of the following should be added:

#### Option A — Human-readable textual curve summary

For each case, print a compact trajectory summary such as:

- initial score
- best score
- total improvements recorded
- first major-improvement window
- last improvement time / iteration
- plateau duration
- checkpoint scores at 10%, 25%, 50%, 75%, 100% budget

#### Option B — Sidecar exported curve artifact

Persist a simple plot-friendly artifact derived from `best_score_timeline`, e.g.:

- JSON
- CSV
- or both

This should be easy to feed into ad hoc plotting.

#### Option C — CLI inspection / rendering command

Add a benchmark inspection command that can render a case’s improvement curve as:

- ASCII step chart
- checkpoint table
- or both

### Strong recommendation

Implement **B + C** if affordable:

- keep the raw curve easy to consume programmatically
- also make it easy to inspect quickly from the terminal

### Exit criteria

A developer can inspect a run artifact and quickly see whether the solver:

- improved mostly at the start
- continued making late improvements
- or plateaued early

without manually digging through large JSON.

## Deliverable 0.3 — Derived plateau metrics

### Goal

Add a small, explicit set of derived metrics that make plateau behavior comparable across runs.

### Recommendation

Do **not** add dozens of metrics. Add a minimal, decision-useful set.

### Proposed derived metrics

#### Budget-relative last-improvement metrics

- `last_improvement_iteration`
- `last_improvement_elapsed_seconds`
- `last_improvement_fraction_of_runtime_budget` when time-limited
- `last_improvement_fraction_of_iteration_budget` when iteration-limited

#### Plateau-size metrics

- `iterations_after_last_improvement`
- `seconds_after_last_improvement`
- `fraction_of_run_after_last_improvement`

#### Improvement-count metrics

- `improvement_count`
- `improvements_after_25_percent_budget`
- `improvements_after_50_percent_budget`
- `improvements_after_75_percent_budget`

#### Checkpoint score metrics

Record best score at fixed normalized checkpoints:

- 10%
- 25%
- 50%
- 75%
- 90%
- 100%

This is especially useful for comparing shape even when raw run lengths differ.

#### Optional normalized quality-shape metric

If a single aggregate shape metric is wanted, consider a derived "improvement area" style metric over normalized budget progress.

This is optional and should be added only if the simpler metrics prove insufficient.

### Where to store them

Preferred order:

1. as derived fields inside benchmark-side artifacts
2. or in comparison/summary output if derived on read

Recommendation:

- start by deriving them in the benchmark/reporting layer, not in solver runtime state
- only push them into persisted schema if they prove broadly useful

### Exit criteria

Two runs can be compared not only by final score, but also by whether one:

- improves earlier
- improves later
- plateaus sooner
- or uses extra budget more effectively

## Deliverable 0.4 — Fix or tighten solver3 timeline fidelity

### Goal

Ensure that the improvement curve is honest enough to support plateau analysis.

### Current issue

Solver3 currently appears to reuse cached elapsed time for multiple improvements before refreshing time again. This likely explains repeated identical early timestamps in `best_score_timeline`.

### Requirement

The timeline does **not** need nanosecond-perfect timestamps.

It **does** need timestamps that are sufficiently honest to support:

- early-improvement shape inspection
- last-improvement timing
- plateau-length measurement

### Recommended implementation approach

When a new best score is recorded in solver3:

- measure current elapsed time at that moment
- record that exact or near-exact elapsed time in the timeline point

Keep time caching for other hotpath logic if useful, but do not let cached stop-condition time distort the recorded best-score curve.

### Performance note

This should still be cheap because best-score updates are relatively sparse compared with attempted moves.

### Validation

- unit/integration check that timeline elapsed seconds are monotonically nondecreasing
- verify early-run timeline no longer collapses many distinct improvements onto identical timestamps unless they genuinely happened too closely to distinguish

## Deliverable 0.5 — Comparison/reporting support for trajectory shape

### Goal

Make benchmark comparisons aware of plateau shape, not just final score and timeline point count.

### Minimum comparison additions

Add comparison output for at least:

- last improvement time delta
- plateau duration delta
- checkpoint score deltas at fixed normalized budget points

### What not to do yet

Do not compare full curves point-by-point. That is unnecessary and brittle.

Use stable, derived summaries instead.

### Exit criteria

Benchmark comparison can reveal cases like:

- same final score, but one version got there much earlier
- slightly worse early score, but much better late budget utilization
- better initial descent, but earlier stagnation

## Deliverable 0.6 — Dedicated Phase 0 benchmark workflow for plateau diagnosis

### Goal

Standardize how we study plateau behavior before implementing hotspot guidance.

### Recommended benchmark lanes

For the target workload family, run both:

#### A. Fixed-time lane

Use canonical time-limited cases to answer:

- does extra wall-clock time buy later improvements?
- when does stagnation begin in real runtime terms?

#### B. Fixed-iteration lane

Use diagnostic fixed-iteration cases to answer:

- is the issue really search-space navigation rather than raw throughput?
- does a candidate-selection change improve quality per iteration?

### Social Golfer focus

For this feature track, the Social Golfer canonical case should be the anchor diagnostic surface.

### Recommended outputs per run

For each relevant case, report:

- final score
- best score
- iteration count
- iterations/second
- last-improvement iteration/time
- plateau duration
- checkpoint score table
- move-family attempt/acceptance summary

### Exit criteria

There is a repeatable benchmark ritual for diagnosing plateau behavior before and after search changes.

## Deliverable 0.7 — Minimal extra telemetry only where existing signals are insufficient

### Goal

Add only the smallest extra telemetry required to prepare for later hotspot-guidance validation.

### Candidate additions worth considering

Only if needed after reviewing the existing outputs:

- accepted-move count since last best improvement
- count of best improvements
- optional coarse stagnation-episode count

### Explicitly defer to later phases

Do **not** add in Phase 0:

- offender-specific telemetry
- hotspot hit-rate telemetry
- per-anchor guidance telemetry
- conflict-structure summaries

Those belong to later implementation phases once guided search actually exists.

## Testing and validation plan

## 1. Schema / artifact tests

Add tests ensuring:

- new derived fields or sidecar exports are emitted consistently
- benchmark artifacts remain schema-valid
- comparison reports remain valid after any new derived summary fields

## 2. Solver telemetry tests

Add or extend tests ensuring:

- `best_score_timeline` is non-empty when benchmark telemetry exists
- iteration values are monotonic
- elapsed seconds are monotonic
- solver3 improvement timestamps are sufficiently faithful after the fidelity fix

## 3. Reporting tests

Add tests for:

- textual plateau summary rendering
- curve export generation
- comparison summary inclusion of last-improvement / plateau metrics

## 4. Manual validation on target workloads

At minimum, inspect:

- `stretch.social-golfer-32x8x10`
- one or two additional representative plateau-sensitive cases

And verify that the resulting output makes the plateau pattern obvious without raw JSON spelunking.

## Suggested implementation order

### Step 1

Document the current telemetry surfaces and decide the minimal derived metric set.

### Step 2

Implement benchmark-facing curve output from existing `best_score_timeline`.

### Step 3

Add plateau-derived metrics in the reporting layer.

### Step 4

Fix solver3 timeline timestamp fidelity if needed.

### Step 5

Teach compare/summary tooling to surface shape-oriented deltas.

### Step 6

Standardize the Phase 0 benchmark ritual on Social Golfer fixed-time and fixed-iteration lanes.

## Recommended acceptance criteria for Phase 0 completion

Phase 0 is complete when all of the following are true:

1. A developer can inspect a benchmark run and quickly understand the improvement trajectory.
2. Plateau onset and last-improvement timing are visible without manual JSON inspection.
3. Solver3 timeline timestamps are trustworthy enough for budget-usage analysis.
4. Benchmark comparisons can distinguish early-gain vs late-gain tradeoffs.
5. No heavy always-on telemetry was added to the hot path just to achieve this visibility.

## Expected impact on later phases

If Phase 0 is done well, later guided-search phases become much easier to judge.

Specifically, we will be able to answer:

- did hotspot guidance improve final quality?
- did it shift improvement later into the run?
- did it reduce wasted post-plateau time?
- did it help per-iteration quality, or only per-second quality?
- did it improve time-budget utilization rather than just early descent?

That is exactly the evidence we need before touching performance-critical move-generation logic.

## Summary

Phase 0 should not be a giant telemetry project.

The repo already has most of what we need.

The right work is to:

- surface the existing `best_score_timeline`
- derive plateau metrics from it
- fix solver3 timestamp fidelity where needed
- and make trajectory shape a first-class benchmark output

The single most valuable addition is the one you explicitly called out:

> a benchmark-facing output that shows how score improves over solve time

That signal already exists in the data. Phase 0 should make it truly usable.
