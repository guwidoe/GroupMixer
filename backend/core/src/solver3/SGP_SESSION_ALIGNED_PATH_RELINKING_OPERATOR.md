# Solver3 session-aligned path relinking operator

## Purpose

Define a concrete, symmetry-aware recombination operator for `solver3` that is stronger than one-shot donor-session transplant but still respects the current benchmark lessons:

- cheap local search must dominate runtime
- expensive global-search events must stay rare
- recombination must preserve meaningful structure instead of scrambling incumbents
- unsupported scenario combinations must fail explicitly, not silently degrade

This note proposes a **session-aligned path relinking** operator specialized first for the same narrow family where the current donor path is live and promising:

- swap-capable search spaces
- zero-repeat / SGP-shaped workloads
- no active cliques / must-stay-together constraints
- no transfer-dependent repair requirement in the recombination step

The operator is designed as a direct successor to rare donor-session transplant, not as a return to the old always-on memetic loop.

---

## Why this operator

The current donor-session transplant operator has established three important facts:

1. **structure-preserving recombination is not nonsense**
   - forced-fire and long-budget runs can produce real kept children and better basins
2. **one-shot transplant is still too blunt**
   - it often lands in a decent repaired basin, but later events mostly revisit the same basin floor
3. **session-level structure is the right unit so far**
   - whole-session inheritance is much more meaningful than random local mutation churn

The missing step is:

> keep the structure-preserving session unit, but replace one-shot splice-and-judge with a short guided walk through the disagreement corridor between two elite solutions.

That is exactly what session-aligned path relinking does.

---

## Core idea

Given:

- base solution `A` = current incumbent / current working elite
- guide solution `B` = archived elite donor

Do **not** assume session index `i` in `A` corresponds to session index `i` in `B`.

Instead:

1. align sessions between `A` and `B` using a session-distance matching step
2. identify the matched sessions that actually differ structurally
3. starting from `A`, progressively import one aligned donor session at a time
4. after each import, do bounded local polish
5. keep the best intermediate state along the path
6. accept the path result only if it beats the incumbent honestly

So the operator is not:

- random crossover
- uniform session mixing
- full child construction from many parents

It is:

- **two-parent**
- **elite-guided**
- **session-structured**
- **truncated path relinking with bounded polish**

---

## Control-structure fit

The target outer-loop control structure remains:

1. run cheap local search most of the time
2. maintain a small archive of high-quality diverse elites
3. rarely trigger a recombination event
4. execute one bounded path-relinking event
5. return immediately to cheap local search

This operator is explicitly a **rare expensive event**.
It should not create a stream of children.

---

## Scope and capability policy

## V1 supported scenario surface

Initial support should be **narrow and explicit**.

Recommended v1 support:

- swap moves allowed
- session attendance stable enough that aligned whole-session overwrite is well-defined
- repeat-encounter objective active / meaningful
- no active cliques / must-stay-together constraints
- no reliance on transfer moves during recombination repair

This is the same broad capability family as the current donor-session path.

## V1 explicit rejections

The operator should reject up front when:

- swap moves are disabled
- active cliques / must-stay-together constraints are present
- path relinking would require unsupported session-shape transformations
- other scenario semantics make whole-session overwrite dishonest

No silent fallback to:

- `single_state`
- `steady_state_memetic`
- current donor-session transplant

---

## Representation choice

The key symmetry issue is that session order is not a trustworthy comparison basis.

Therefore the operator compares parents in **aligned session space**, not raw session-index space.

Recommended v1 representation:

- each session is represented by its induced within-session pairing structure
- each solution becomes a small set of session-partition fingerprints
- path moves are defined over matched session pairs

This preserves the strongest current lesson:

- for SGP-like workloads, the meaningful structure is the whole session partition

---

## Session alignment step

## Goal

Before relinking, find which donor session corresponds most closely to which base session.

## Distance metric

For base session `s_a` and donor session `s_b`, define a symmetric structural distance based on the pairings induced inside each session.

Recommended v1 distance:

- let `Pairs(session)` be the set of unordered participant pairs seated together in that session
- define:
  - `distance(s_a, s_b) = |Pairs(s_a) Δ Pairs(s_b)|`
  - where `Δ` is symmetric difference

Equivalent interpretation:

- count how many within-session pairings would need to change to make the sessions identical

Why this metric:

- cheap to compute
- invariant to group order inside a session
- directly aligned to repeat-contact structure
- honest for Social Golfer / Kirkman / zero-repeat cases

## Matching algorithm

Build the full `session_count × session_count` distance matrix and solve a minimum-cost one-to-one matching.

Recommended implementation choice:

- use a small exact bitmask DP assignment solver, not a heavyweight external dependency

Why:

- session counts are small in our target workloads
- avoids new crate/dependency complexity
- easy to test deterministically

If session count is `W`, complexity `O(W^2 2^W)` is acceptable for the rare-event path.

## Alignment output

The alignment stage should produce:

- `matched_session_pairs: Vec<(base_session_idx, donor_session_idx)>`
- per-match structural distance
- total alignment cost
- sorted list of differing matched sessions

---

## Path definition

## State

A path state is a full `RuntimeState` child derived from the base incumbent plus a set of already-imported aligned donor sessions.

## Move

A path step consists of:

1. choose one matched donor session not yet imported
2. overwrite the corresponding aligned base session in the current path state
3. rebuild pair contacts
4. resync score from the oracle
5. apply early discard screening
6. if retained, run bounded local polish
7. record the resulting post-polish path state

This is a **session import move**, not a swap move.
The swap-based tabu improver remains the local repair/polish mechanism layered on top.

## Path start

Start from the current incumbent `A`.

## Path guide

The guide is donor elite `B`, but only after session alignment.

## Path end

The path ends when one of the following occurs:

- configured max imported sessions reached
- no matched differing sessions remain
- event budget exhausted
- no candidate survives screening/polish
- optional improvement gate says further corridor walking is not justified

---

## Candidate-step selection policy

At each path step there may be several remaining aligned donor sessions that could be imported next.

We should not import them in arbitrary order.

## Candidate generation

For each remaining aligned differing session:

- build one candidate child by importing that session into the current path state
- immediately recompute truthful score
- discard catastrophically bad raw children
- bounded-polish the survivors

## Candidate choice

Recommended v1 step selection:

- choose the candidate with the best **post-polish** score
- break ties by lower raw-child score
- break further ties by larger session structural distance

This is greedy path relinking in session space.

Why this is the right v1 choice:

- simple
- deterministic
- benchmark-legible
- naturally answers whether the corridor contains real improved basins

## Optional later variants

Later if needed we can add:

- truncated mixed relinking
- randomized restricted-candidate-list step choice
- backward relinking from donor toward incumbent

These are not required for v1.

---

## Truncation policy

Full relinking through every differing session is unnecessary and likely too expensive.

Recommended v1 truncation:

- import at most `2..4` sessions per event, controlled by config
- stop early if no step improves the best path-state score seen so far after `k` consecutive path steps

Default stance:

- treat this as a **short corridor probe**, not full parent-to-parent interpolation

---

## Post-step polish policy

The current benchmark lessons should carry over unchanged:

- tiny toy polish budgets are misleading
- deeper stagnation can justify more serious repair
- expensive polish must still remain rare overall

Recommended v1 polish policy:

- reuse the existing bounded `single_state + sgp_week_pair_tabu` child-polish helper
- retain stagnation-scaled budgets already learned for donor recombination
- apply the polish **after each surviving path step**, because the operator is only meaningful in post-repair basin space

Reason:

- the raw imported session is not the true candidate of interest
- the real object we care about is the basin floor reachable after bounded local repair

---

## Early discard policy

Do not polish every raw path-step child.

Recommended v1 screening:

- reuse the current adaptive raw-child retention policy where possible
- if that cannot be reused directly, apply a fixed conservative catastrophic-discard guard initially
- record raw score before polish for every attempted step

A session-aligned path-relinking event will otherwise overspend badly on hopeless corridor states.

---

## Acceptance policy

Keep the current strict honesty rule.

After the relinking event completes:

- collect the best post-polish path state found during the event
- **keep** it only if it beats the current incumbent
- otherwise discard the entire event outcome

No fuzzy recombination acceptance in v1.

This operator should earn its keep on final incumbent quality.

---

## Archive and parent selection

## Base parent

Base parent is always:

- current incumbent / current active solution

## Guide parent

Guide parent is selected from the elite archive.

Recommended v1 guide selection:

- reuse the current donor archive policy:
  - score-competitive donor subset
  - reject near-duplicates of incumbent
  - prefer structurally different elites

Because session alignment reduces index-based symmetry noise, guide selection should prefer:

- larger aligned-session disagreement
- not merely raw session fingerprint mismatch

## Why small archive still makes sense

A tiny archive remains sufficient:

- the relinking event is expensive
- diversity is more important than population size
- the current archive machinery is already aligned with this style of operator

---

## Suggested config surface

Recommended new explicit mode:

- `search_driver.mode = session_aligned_path_relinking`

Recommended config block name:

- `Solver3SessionAlignedPathRelinkingParams`

Suggested fields:

- `archive_size`
- `recombination_no_improvement_window`
- `recombination_cooldown_window`
- `max_path_events_per_run` or unbound-with-budgeted-trigger policy
- `max_session_imports_per_event`
- `path_step_no_improvement_limit`
- `early_discard_policy` / reuse adaptive raw-child retention block
- `child_polish_iterations_per_stagnation_window`
- `child_polish_no_improvement_iterations_per_stagnation_window`
- `child_polish_max_stagnation_windows`
- `swap_local_optimum_certification_enabled`
- `min_aligned_session_distance_for_relinking`
- `candidate_pool_policy`

Important:

- do not hide this inside the current donor-session block
- give it its own explicit mode and normalization path

---

## Telemetry requirements

The operator will be impossible to judge honestly without path-specific telemetry.

## Event-level telemetry

For each relinking event, record:

- base incumbent score at event start
- donor score
- alignment total cost
- matched session pairs
- number of differing matched sessions
- number of path steps attempted
- number of raw children discarded immediately
- number of polished path states
- best post-polish path score
- whether event produced a new incumbent
- total polish iterations and seconds consumed by the event

## Step-level telemetry

For each attempted imported session step, record:

- aligned base session index
- aligned donor session index
- session structural distance
- raw child score
- post-polish score
- raw-to-polish delta
- incumbent-to-post-polish delta
- polish stop reason
- polish iterations completed
- whether this step set a new best path-state score

## Aggregate run-level telemetry

Add counters / summaries for:

- path events fired
- path events kept
- average alignment cost
- average differing matched sessions
- average steps attempted per event
- average best-path improvement vs event start
- count of events with zero surviving steps
- count of events with no better post-polish state than the base incumbent

This should let us answer:

- does alignment reduce symmetry noise?
- do early steps produce real basin jumps?
- does later path walking help or just waste budget?

---

## Benchmark plan

## Primary comparison set

The operator should be judged against:

1. current pure-zero-repeat donor-session champion
2. current fixed-tenure `sgp_week_pair_tabu` baseline

## Required benchmark surface

At minimum:

- `stretch.social_golfer_32x8x10`
- `stretch.kirkman_schoolgirls_15x5x7`

And explicit capability truthfulness checks on broader scenarios to confirm rejection behavior remains honest.

## Required lanes

### Stage A — diagnostic sanity

Single-seed release-mode runs with:

- forced-ish triggering
- small max-session-import count
- full telemetry enabled

Purpose:

- prove alignment is working
- confirm path events actually walk more than one session
- inspect whether best states occur early or late on the path

### Stage B — honest multiseed comparison

Compare:

- fixed-tenure tabu
- donor-session transplant
- session-aligned path relinking

Across multiple seeds on Social Golfer and Kirkman.

Required report fields:

- final score
- runtime
- iterations
- event counts
- average steps per event
- kept-event frequency
- best post-polish basin depth

### Stage C — autoresearch candidacy

Only after Stage B shows real promise should this operator enter the long-budget autoresearch lane.

---

## Expected advantages

If the operator works, it should outperform one-shot donor transplant in the following specific ways:

1. **better symmetry handling**
   - aligned sessions remove one source of fake disagreement
2. **less all-or-nothing child quality**
   - several short guided imports should beat one blunt splice more often
3. **better basin discovery telemetry**
   - we can observe whether the corridor contains improving intermediate states
4. **more interpretable failure modes**
   - if steps 1-2 help but later steps do not, that tells us something concrete

---

## Main risks

## 1. Alignment cost without enough benefit

If session alignment is expensive but mostly identity-like on our workloads, the complexity may not pay for itself.

Mitigation:

- keep matching implementation small and exact
- instrument alignment cost directly

## 2. Too many polished intermediate states

Greedy path relinking can become expensive if every remaining differing session is fully evaluated at each step.

Mitigation:

- small `max_session_imports_per_event`
- adaptive early discard
- optional candidate cap if needed later

## 3. Path steps still revisit the same basin floor

Even with alignment, imported sessions may still be too context-dependent.

Mitigation:

- measure per-step basin depth honestly
- stop if no step improves path-state best after configured limit

## 4. Semantics overreach

The operator may tempt us to claim broader support than is honest.

Mitigation:

- keep v1 capability gating narrow
- treat broader scenario support as future work only

---

## Recommended implementation sequence

## Phase A — alignment substrate

1. add session pair-set extraction helpers
2. add aligned session distance matrix computation
3. add exact minimum-cost session matching helper
4. add focused tests for:
   - group-order invariance inside a session
   - known small matching cases
   - zero-distance identical-session alignment

Likely home:

- `backend/core/src/solver3/search/recombination.rs`
- or a new small helper module under `search/`

## Phase B — path event scaffolding

1. add new explicit public config/model surface in `backend/core/src/models.rs`
2. normalize config in `search/context.rs`
3. add explicit capability gating
4. add path-event trigger state

## Phase C — operator core

1. select guide donor from archive
2. align sessions
3. build ordered set of differing matched sessions
4. implement greedy step evaluation loop
5. reuse bounded tabu polish helper
6. accept only if best path state beats incumbent

## Phase D — telemetry and benchmark plumbing

1. extend benchmark telemetry model
2. extend schema / artifact writers
3. add path-relinking benchmark manifests
4. update docs/benchmarking workflow notes

## Phase E — honest evaluation

1. diagnostic forced-trigger SG/Kirkman runs
2. normal-trigger multiseed comparison
3. only then consider autoresearch admission

---

## Relationship to other recombination ideas

## Versus one-shot donor-session transplant

Session-aligned path relinking is:

- more expensive
- more informative
- potentially less brittle

It should be viewed as:

- **the next serious operator after donor transplant**, not a replacement for archive/trigger work already done

## Versus agreement-core recombination

Agreement-core is still a credible later direction, but it requires more partial-rebuild machinery.

Path relinking is better aligned with current constraints because it:

- preserves whole-session structure
- uses existing overwrite + rescore seams
- reuses bounded local repair

## Versus multi-parent inheritance

This operator is safer and less destructive.
That is desirable given the current evidence that cheap local search should remain dominant.

---

## Recommendation

If `solver3` pursues a next recombination family beyond one-shot donor-session transplant, the recommended next concrete operator is:

## **session-aligned path relinking between incumbent and archived elite donor**

Specifically:

- align sessions first
- relink only in aligned session space
- import one aligned donor session at a time
- bounded-polish each surviving step
- keep only the best post-polish path state if it beats the incumbent

This is the most concrete path-relinking operator that:

- respects SGP/session symmetry better than raw donor splice
- stays compatible with the current `solver3` seams
- remains benchmark-honest
- and preserves the doctrine that expensive global search events must be rare and interpretable

---

## First benchmark result (2026-04-14)

Initial release-mode diagnostics and matched SG/Kirkman multiseed comparison were run after the first implementation landed.

### Diagnostic artifacts

- Social Golfer single-case time lane:
  - `backend/benchmarking/artifacts/runs/social-golfer-plateau-time-solver3-session-path-relinking-20260414T113015Z-15e5ada9/run-report.json`
- Kirkman single-case time lane:
  - `backend/benchmarking/artifacts/runs/stretch-kirkman-schoolgirls-time-solver3-session-path-relinking-20260414T113031Z-4eaf5c2a/run-report.json`

### Matched SG/Kirkman multiseed artifacts

- fixed-tenure tabu reference:
  - `backend/benchmarking/artifacts/runs/solver3-sgp-kirkman-tabu-fixed-multiseed-20260414T113037Z-a1eb001e/run-report.json`
- donor-session transplant reference:
  - `backend/benchmarking/artifacts/runs/solver3-sgp-kirkman-donor-session-multiseed-20260414T113120Z-9c2b06bf/run-report.json`
- session-aligned path relinking:
  - `backend/benchmarking/artifacts/runs/solver3-session-path-relinking-multiseed-20260414T113159Z-8f0f240f/run-report.json`

### Honest summary

- **Social Golfer improved clearly** under matched multiseed comparison:
  - fixed-tenure tabu avg: `5381.0`
  - donor-session avg: `5373.7`
  - session-aligned path relinking avg: `5297.0`
- **Kirkman improved vs tabu but regressed vs donor-session**:
  - fixed-tenure tabu avg: `47.7`
  - donor-session avg: `11.0`
  - session-aligned path relinking avg: `25.7`
- path relinking remained roughly runtime-neutral vs the current references on these SG/Kirkman budgets
- the new telemetry shows the operator is doing real work rather than never firing:
  - Social Golfer seeds fired `11 / 7 / 4` path events with `4 / 3 / 2` kept
  - Kirkman seeds fired `2 / 2 / 2` path events with `1 / 1 / 0` kept
  - guide-selection failure stayed at `0` on all matched multiseed seeds

### Current interpretation

The first implementation looks **promising but mixed**:

- it is a real upgrade over plain tabu on the Social Golfer anchor family
- it does not yet beat donor-session transplant on Kirkman
- the next refinement question is likely not “does path relinking fire?” but rather:
  - how to improve corridor-step discrimination for Kirkman-like cases
  - whether the step-order / retention policy is too SG-biased

---

## Random-control comparison result (2026-04-14)

After the first path result, the next question was stricter:

> is session-aligned recombination actually better than matched random large mutations / random donor splices, or are we just seeing expensive perturb-and-polish effects?

To answer that, two explicit controls were added under the same driver shell:

- `random_donor_session_control`
- `random_macro_mutation_control`

The comparison was then run on both:

- the original conservative SG/Kirkman multiseed lane
- a new high-event diagnostic lane with far more aggressive trigger windows

### Normal multiseed artifacts

- fixed-tenure tabu reference:
  - `backend/benchmarking/artifacts/runs/solver3-sgp-kirkman-tabu-fixed-multiseed-20260414T121148Z-5a8a8f0d/run-report.json`
- donor-session transplant reference:
  - `backend/benchmarking/artifacts/runs/solver3-sgp-kirkman-donor-session-multiseed-20260414T121221Z-15fd8caa/run-report.json`
- aligned path relinking:
  - `backend/benchmarking/artifacts/runs/solver3-session-path-relinking-multiseed-20260414T121255Z-895211b6/run-report.json`
- random donor-session control:
  - `backend/benchmarking/artifacts/runs/solver3-random-donor-session-control-multiseed-20260414T121330Z-d97e0833/run-report.json`
- random macro-mutation control:
  - `backend/benchmarking/artifacts/runs/solver3-random-macro-mutation-control-multiseed-20260414T121406Z-ba80dadc/run-report.json`

### High-event artifacts

- Social Golfer high-event A/B/C:
  - `backend/benchmarking/artifacts/runs/social-golfer-plateau-time-solver3-path-control-high-event-20260414T121439Z-f88a6ff3/run-report.json`
- Kirkman high-event A/B/C:
  - `backend/benchmarking/artifacts/runs/stretch-kirkman-schoolgirls-time-solver3-path-control-high-event-20260414T121608Z-c0f6ac18/run-report.json`

### Honest summary

#### Conservative matched multiseed lane

**Social Golfer average final score**

- tabu: `5381.0`
- donor-session transplant: `5373.7`
- aligned path relinking: `5297.0`
- random donor-session control: `5325.0`
- random macro-mutation control: `5325.0`

So on Social Golfer, the aligned operator beat **both** random controls.

**Kirkman average final score**

- tabu: `47.7`
- donor-session transplant: `11.0`
- aligned path relinking: `25.7`
- random donor-session control: `0.0`
- random macro-mutation control: `18.3`

So on Kirkman, the aligned operator did **not** beat the controls; the random donor-session control was actually best.

#### High-event diagnostic lane

**Social Golfer high-event average final score**

- aligned path relinking: `5304.0`
- random donor-session control: `5331.7`
- random macro-mutation control: `5332.0`

With more aggressive trigger settings, aligned path relinking still beat both random controls on Social Golfer.

**Kirkman high-event average final score**

- random donor-session control: `0.0`
- aligned path relinking: `36.7`
- random macro-mutation control: `40.3`

With more aggressive trigger settings, random donor-session control still beat aligned path relinking on Kirkman.

### Event-volume reality check

The new high-event lane did **not** produce universally huge aligned-event counts.

- Social Golfer aligned path events:
  - normal multiseed seeds: `11 / 7 / 4`
  - high-event seeds: `8 / 7 / 5`
- Kirkman aligned path events:
  - normal multiseed seeds: `2 / 2 / 2`
  - high-event seeds: `3 / 3 / 3`

So lowering the trigger / cooldown windows alone did **not** cause aligned path relinking to explode into dramatically higher event counts.

The most event-rich control was actually random macro mutation on Social Golfer:

- high-event Social Golfer macro-control path events: `15 / 15 / 21`

That strongly suggests event count is still being limited by:

- event runtime cost
- incumbent-improvement resets
- and the control structure around post-event polish / acceptance,

not just by the absolute trigger threshold.

### Current interpretation after controls

The answer is now more concrete.

#### What looks real

- On **Social Golfer**, aligned path relinking is better than both:
  - matched random donor-session imports
  - matched random macro-mutations
- That is real evidence that the gain is **not just** “any large perturbation plus strong local polish.”

#### What is not proven

- The aligned operator is **not** a universal symmetry-breaking winner across the zero-repeat family.
- On **Kirkman**, the simpler random donor-session control is stronger in both the conservative and the high-event comparisons.

#### Current best honest claim

The current evidence supports this narrower statement:

> session-aligned path relinking is a real improvement over random-mutation-style controls on Social Golfer-like workloads, but the present alignment / corridor-walking policy is not yet the best donor-based recombination strategy for all zero-repeat workloads, because Kirkman still prefers the simpler random donor-session control.

That means the next algorithmic question is now sharper:

- keep the claim that aligned path relinking has genuine value on Social Golfer
- but investigate why the current alignment / step-selection policy underperforms simpler donor controls on Kirkman

---

## Multi-root balanced inheritance follow-up (2026-04-14)

The next hypothesis was stricter still:

> maybe same-lineage archive donors are the real limiter, and we need unrelated roots plus a true 50/50 merge instead of repairing one privileged parent.

That led to a new operator family:

- `multi_root_balanced_session_inheritance`

Its first implementation incubates multiple roots, selects parents from different roots, aligns sessions structurally, preserves agreement-core sessions, and splits differing aligned sessions across the two parents.

### Conservative multiseed artifacts

- fixed-tenure tabu reference:
  - `backend/benchmarking/artifacts/runs/solver3-sgp-tabu-tenure-fixed-multiseed-20260414T131135Z-ddb00a03/run-report.json`
- donor-session transplant reference:
  - `backend/benchmarking/artifacts/runs/solver3-donor-session-transplant-multiseed-20260414T131320Z-7a269f34/run-report.json`
- aligned path relinking:
  - `backend/benchmarking/artifacts/runs/solver3-session-path-relinking-multiseed-20260414T131356Z-a1aeff3c/run-report.json`
- random donor-session control:
  - `backend/benchmarking/artifacts/runs/solver3-random-donor-session-control-multiseed-20260414T131436Z-b1fd3559/run-report.json`
- random macro-mutation control:
  - `backend/benchmarking/artifacts/runs/solver3-random-macro-mutation-control-multiseed-20260414T131515Z-7591bd8e/run-report.json`
- multi-root balanced inheritance:
  - `backend/benchmarking/artifacts/runs/solver3-multi-root-balanced-inheritance-multiseed-20260414T131553Z-b155666d/run-report.json`

### High-event multi-root artifacts

- Social Golfer high-event multi-root lane:
  - `backend/benchmarking/artifacts/runs/social-golfer-plateau-time-solver3-multi-root-balanced-inheritance-high-event-20260414T131629Z-52dee7e3/run-report.json`
- Kirkman high-event multi-root lane:
  - `backend/benchmarking/artifacts/runs/stretch-kirkman-schoolgirls-time-solver3-multi-root-balanced-inheritance-high-event-20260414T131701Z-83cb90cb/run-report.json`

### High-event control references

The latest matched control high-event references remained:

- Social Golfer aligned/random controls:
  - `backend/benchmarking/artifacts/runs/social-golfer-plateau-time-solver3-path-control-high-event-20260414T121439Z-f88a6ff3/run-report.json`
- Kirkman aligned/random controls:
  - `backend/benchmarking/artifacts/runs/stretch-kirkman-schoolgirls-time-solver3-path-control-high-event-20260414T121608Z-c0f6ac18/run-report.json`

These were not rerun in this follow-up because the new batch only added the multi-root operator and its telemetry/manifests; the previously benchmarked aligned/random control code paths were unchanged.

### Honest summary

#### Conservative matched multiseed lane

**Social Golfer average final score**

- fixed-tenure tabu: `5381.0`
- donor-session transplant: `5373.7`
- aligned path relinking: `5297.0`
- random donor-session control: `5325.0`
- random macro-mutation control: `5325.0`
- multi-root balanced inheritance: `5353.0`

So the first multi-root balanced operator was **worse than aligned path relinking and both random controls** on Social Golfer.

**Kirkman average final score**

- fixed-tenure tabu: `47.7`
- donor-session transplant: `11.0`
- aligned path relinking: `25.7`
- random donor-session control: `0.0`
- random macro-mutation control: `18.3`
- multi-root balanced inheritance: `29.3`

So on Kirkman it was also **worse than both random controls**, and worse than donor-session transplant.

#### High-event diagnostics

**Social Golfer high-event multi-root average final score**

- multi-root balanced inheritance: `5444.0`
- aligned path relinking control reference: `5304.0`
- random donor-session control reference: `5331.7`
- random macro-mutation control reference: `5332.0`

That is a clear regression.

**Kirkman high-event multi-root average final score**

- multi-root balanced inheritance: `44.0`
- aligned path relinking control reference: `36.7`
- random donor-session control reference: `0.0`
- random macro-mutation control reference: `40.3`

That is also a regression.

### What the new telemetry says

The telemetry confirms the operator is doing the thing it was supposed to do structurally:

- every conservative and high-event run incubated `4` roots
- parent pairs were genuinely cross-root, not same-root repairs
- Social Golfer conservative runs used exact `5 / 5` differing-session splits
- Kirkman runs used explicit `3 / 4` or `4 / 3` odd-count splits

So the implementation is not secretly collapsing back into one-parent repair.

But the quality signal is weak or negative:

- conservative Social Golfer seeds fired `2 / 2 / 2` events but kept only `0 / 1 / 0`
- conservative Kirkman seeds fired `2 / 2 / 2` events and kept `0 / 0 / 0`
- conservative `children_beating_both_parents` counts were:
  - Social Golfer: `0 / 1 / 0`
  - Kirkman: `0 / 0 / 0`
- high-event Social Golfer did show `1 / 1 / 1` events that beat both selected parents, but the overall final scores still regressed badly
- high-event Kirkman showed more events (`4 / 4 / 4`) and several children beating both parents (`1 / 2 / 3`), yet the run still plateaued at a bad final score `44`

That last point matters: **beating both selected parents is not enough** if the selected parents themselves are not from good enough basin families, or if the child still lands in a poor basin after repair.

### Current interpretation

This falsifies the strongest version of the multi-root hypothesis for now.

- same-lineage donor bias may be *part* of the story
- but simply adding unrelated roots plus a literal 50/50 aligned-session merge is **not** automatically better
- the current first multi-root operator is a real structural recombination mechanism, but it is **not competitive** with the best one-lineage aligned path-relinking result on Social Golfer, and it is not competitive with the simpler random-donor control on Kirkman

### Best honest claim after the follow-up

> the first multi-root 50/50 balanced inheritance operator successfully creates true cross-root mixed children, but on the current SG/Kirkman benchmarks it does not outperform the existing one-lineage path/donor control stack, so “unrelated roots + balanced merge” is not yet the missing ingredient by itself.
