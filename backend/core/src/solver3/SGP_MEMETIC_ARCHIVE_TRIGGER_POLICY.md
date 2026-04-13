# Solver3 memetic archive and rare-event trigger policy

Parent todos:
- `TODO-064162ce` — design solver3 elite/archive candidate selection policy for memetic search
- `TODO-04d6db0f` — design solver3 rare-event memetic trigger and parent-selection policy
- related: `TODO-7c8bdec7` — reevaluate solver3 memetic control structure around rare expensive events
- related: `TODO-7dc0b3db` — write solver3 structure-preserving recombination operator shortlist

## Purpose

Define the archive / elite policy and the rare-event trigger / donor-selection policy for the next `solver3` recombination phase.

This note assumes the current recommended first operator from `SGP_RECOMBINATION_OPERATOR_SHORTLIST.md`:

- **rare donor-session transplant from an elite archive**

It is explicitly designed to replace the current "constant child generation" memetic control structure with something cheaper and more deliberate.

## Core control-structure decision

The target runtime shape is:

1. run cheap local search most of the time
2. keep a very small archive of strong but structurally distinct incumbents
3. fire recombination only rarely
4. use the **current incumbent** as the base state
5. choose **one archived donor** for the event
6. apply one localized structure-preserving recombination step
7. run bounded cheap repair / polish
8. keep or discard honestly

This means:
- no always-on child production loop
- no population tournament as the primary control structure
- no need for two-parent crossover as the first recombination implementation

---

## Part 1 — archive / elite candidate selection policy

## 1.1 Recommendation: score + structural diversity, not score-only

Archive membership should **not** be score-only.

Why not:
- score-only archives quickly fill with near-duplicates from the same basin
- near-duplicates are poor donors because they do not expose new neighborhoods
- the whole point of the archive is to preserve a few *different* good structures

Recommended rule:
- archive on **score + structural diversity**
- keep the archive **small**
- suppress near-duplicates aggressively

## 1.2 Recommended archive size

Start with a very small archive:

- **4 to 6 elites**

Why this small:
- cheaper to maintain
- easier to reason about donor choice
- enough to cover a few basins without pretending we need a full GA population again

## 1.3 Cheap structural signature

The structural signature should be cheap, session-aware, and meaningful for the recommended first operator.

### Recommended v1 signature
For each incumbent, maintain:

1. **per-session fingerprint**
   - canonical hash of the session assignment structure
   - enough to say whether session `s` in state A is the same as session `s` in state B
2. **per-session repeat-conflict burden**
   - a cheap per-session scalar such as repeated-pair excess or repeated-contact contribution
3. total score

This is enough for the first recombination phase because donor-session transplant cares primarily about:
- which sessions differ,
- and which differing sessions look more promising in donor vs base.

### Why this signature is the right first tradeoff
It is:
- much cheaper than whole-state similarity machinery
- directly aligned with session transplant
- more meaningful than a single global score or checksum

## 1.4 Archive diversity metric

For v1, define structural difference between two incumbents as:

- **session disagreement count** = number of sessions whose fingerprints differ

This is cheap and directly useful.

Interpretation:
- disagreement count `0` = duplicate
- very small disagreement = near-duplicate
- larger disagreement = potentially useful alternate basin structure

## 1.5 Archive admission rule

When a new incumbent appears, evaluate it against the current archive with this policy:

### A. Exact duplicate
If all session fingerprints match an archived elite:
- keep only the better-scoring one

### B. Near-duplicate
If disagreement count is very small:
- treat the archived elite and the candidate as members of the same micro-cluster
- keep only the better-scoring representative

Recommended initial near-duplicate threshold:
- `<= 1` differing session for the first implementation

### C. Structurally novel candidate
If the candidate is not a near-duplicate of any archived elite:
- admit it if archive has room
- otherwise compare it against the worst archived elite, with a diversity-aware replacement rule

## 1.6 Archive replacement rule when full

When archive is full, use this rule:

1. reject candidates that are both:
   - worse than the worst archive member
   - and not structurally novel enough to justify a slot
2. if candidate is a near-duplicate of one elite and better than it:
   - replace that elite
3. if candidate is genuinely novel and score-competitive:
   - evict the **worst member from the densest/most redundant part of the archive**

A simple v1 approximation is enough:
- for each archived elite, compute its minimum session-disagreement distance to the others
- the archive member with the weakest score among the most redundant ones is the first eviction target

This avoids over-engineering while still preventing score-only archive collapse.

## 1.7 Recommended archive semantics

The archive should store:
- full `RuntimeState`
- score
- per-session fingerprints
- per-session conflict burden summary
- maybe a small lineage tag for telemetry only

The archive should **not** store:
- hidden fallback states
- massive genealogy machinery
- expensive global similarity matrices

---

## Part 2 — rare-event trigger policy

## 2.1 Recommendation: stagnation-triggered with cooldown, not constant cadence

The recommended first trigger is a **rare stagnation-triggered event**.

Why:
- if cheap tabu search is still improving, let it run
- recombination should be a basin-transition attempt, not background churn
- periodic recombination risks recreating the old throughput problem

### Recommended initial trigger shape
Fire a recombination event only when all of the following hold:

1. the run is in the advanced recombination mode explicitly enabled by config
2. no best-score improvement has happened for a substantial window
3. a cooldown since the previous recombination event has elapsed
4. archive contains at least one donor meaningfully different from the current incumbent

## 2.2 Recommended initial trigger thresholds

Keep this explicit and conservative.

Suggested v1 policy:
- `recombination_no_improvement_window`: large enough that cheap tabu clearly had time to work first
- `recombination_cooldown_window`: prevents repeated expensive firing
- optional recombination event cap: non-binding safety guard only; normal trigger semantics should come from stagnation + cooldown + donor availability + child quality, not from a tiny fixed event ceiling

The exact numeric values should be benchmark-tuned later, but the qualitative rule is:
- **rare enough that local search still dominates runtime by a wide margin**

## 2.3 Optional secondary trigger

A small optional secondary trigger is acceptable later:
- fire once after admitting a genuinely novel elite, if cooldown allows

But this should remain secondary.
The primary trigger should still be stagnation.

---

## Part 3 — parent / donor selection policy

## 3.1 Recommendation: current incumbent as base, one archive donor

For the first operator, do **not** use two-parent recombination.

Use:
- **base parent** = current incumbent
- **donor** = one archive elite

Why:
- cleaner control structure
- matches donor-session transplant directly
- easier to reason about causally and benchmark honestly

## 3.2 Donor selection rule

Donor selection should not be pure score and should not be pure diversity.

Recommended v1 donor choice:

1. filter archive to donors that are **good enough**
   - score-competitive with the top archive members
2. among those, prefer donors with **more session disagreement** against the current incumbent
3. break ties toward better donor score

In plain terms:
- choose a donor that is still strong,
- but not basically the same state.

### Practical v1 rule
A simple rule is:
- consider the top half of the archive by score
- among them, choose the donor with the highest session-disagreement count to the current incumbent
- break ties by better score

That is cheap, explicit, and already much better than tournamenting over near-duplicates.

## 3.3 When not to fire

Do **not** fire recombination if:
- archive is empty or too small
- every archived elite is a near-duplicate of the current incumbent
- the only available donor is much worse and not structurally interesting

In those cases, keep doing cheap local search.

---

## Part 4 — donor-session selection policy

## 4.1 Recommendation

Once the donor is chosen, select a session that:

1. differs between donor and current incumbent
2. looks stronger in the donor than in the base
3. is not trivially identical or obviously high-conflict in both

### Practical v1 session choice
For each differing session:
- compare donor vs base session conflict burden
- prefer sessions where donor burden is lower
- among those, bias toward the largest donor/base improvement gap

This keeps the first operator localized and interpretable.

## 4.2 Why this matters

The donor should not just be different globally.
We want the *specific transplanted session* to carry a credible structural advantage.

That is the core difference between a meaningful recombination event and random donor noise.

---

## Part 5 — what replaces the current memetic v1 selection policy

Current memetic v1 effectively does:
- always-on offspring loop
- tournament parent selection
- mutation first
- polish every child

Recommended new selection logic is instead:

- maintain current incumbent + elite archive
- cheap tabu local search remains the main driver
- only after stagnation + cooldown:
  - choose donor from archive using score-filtered disagreement
  - choose one differing donor session with promising local burden delta
  - transplant once
  - polish briefly

This is a different algorithmic shape, not just a new parameter setting.

---

## Part 6 — explicit recommendations

## Recommended archive policy
- archive size: **4–6**
- archive criterion: **score + structural diversity**
- structural signature: **per-session fingerprints + per-session conflict burden**
- duplicate suppression: exact duplicate or `<= 1` differing session collapses to one representative

## Recommended trigger policy
- primary trigger: **long no-improvement stagnation window**
- must also satisfy a **cooldown** and a **small event cap per run**
- no periodic constant firing in v1

## Recommended parent/donor policy
- base = **current incumbent**
- donor = **one archive elite**
- donor selected by **score-filtered maximum disagreement**
- no two-parent crossover first

## Recommended first implementation sequence
1. add archive data model + session fingerprints
2. add archive admission / replacement logic
3. add stagnation+cooldown recombination trigger
4. add donor selection + session selection policy
5. plug in the first operator: rare donor-session transplant
6. use bounded tabu polish after transplant

---

## Honest bottom line

The next memetic step should not be "pick better parents in the current loop."
It should be:

- **replace the loop shape**,
- keep a **small diverse elite archive**,
- and use a **rare stagnation-triggered donor-session transplant** where:
  - the base is the current incumbent,
  - the donor is a strong but meaningfully different archive member,
  - and the transplanted session is chosen because it looks locally stronger in the donor.

That is the cleanest next step for candidate selection and recombination that still respects the throughput lessons from everything we benchmarked.
