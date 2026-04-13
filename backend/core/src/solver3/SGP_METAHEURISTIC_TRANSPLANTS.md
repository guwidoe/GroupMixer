# SGP Metaheuristic Mechanisms Worth Transplanting into GroupMixer

## Purpose

This note extracts **specific mechanisms** from the SGP-oriented paper notes under `papers/marker/` that look meaningfully transplantable into `solver3`.

The goal is **not** to restate broad families like “use GA” or “use tabu.”
The goal is to identify:

- which concrete mechanisms seem relevant,
- why they fit the observed `solver3` failure mode,
- how they might map onto the current GroupMixer architecture,
- and which mechanisms are likely **not** worth transplanting directly.

Primary source notes reviewed:

- `papers/marker/scheduling-social-golfers-locally-tabu/scheduling-social-golfers-locally-tabu.md`
- `papers/marker/solving-social-golfer-with-grasp/solving-social-golfer-with-grasp.md`
- `papers/marker/social-golfer-memetic-cotta-2006/social-golfer-memetic-cotta-2006.md`

Related local repo context reviewed:

- `autoresearch.ideas.md`
- `autoresearch.ideas-to-try.md`

---

## Executive summary

The most promising transplantable ideas are not “more conflict guidance” in the narrow Phase 1 sense.
They are:

1. **freedom-aware constructive seeding** from the GRASP paper,
2. **conflict-position-restricted local neighborhoods plus per-week pair tabu** from the local tabu paper,
3. **symmetry-aware non-recombinative steady-state memetic search** from the memetic paper,
4. **Lamarckian local improvement inside a population loop**, not Baldwinian scoring-only learning,
5. **explicit mutation as a macro jump made of several within-week swaps**, not just one local move,
6. **adaptive penalties / breakout memory on repeated hard conflicts**, but only carefully and explicitly.

The core lesson from the papers is:

> SGP seems to benefit from a division of labor:
> - a **good structural constructor** to create useful early basin geometry,
> - a **targeted local search** that focuses on conflict positions,
> - and a **global driver** that is symmetry-aware and does not depend on naive recombination.

That fits the current GroupMixer evidence surprisingly well.

---

## Current solver3 symptom this note is trying to address

For the canonical Social Golfer workload, current `solver3` behavior now looks like this:

- it can descend quickly,
- it can improve further if we bias it more aggressively,
- but these improvements are still mostly **early**,
- and the solver still fails to convert long budgets into meaningful late-run progress.

Phase 1 repeat-guided swaps demonstrated that:

- stronger local exploitation exists,
- but local-minimum escape is still missing,
- and brute-force exact-preview guidance can destroy throughput.

So the key question is no longer:

> how do we repair repeat offenders more greedily?

It is now:

> what concrete mechanisms from the SGP literature seem capable of improving **global search behavior** without collapsing performance?

---

# 1. Mechanisms from **Scheduling Social Golfers Locally** worth transplanting

## 1.1 Conflict-position-restricted neighborhoods

### Paper mechanism

The local tabu paper defines a **conflict position** as a golfer placement participating in a repeated pairing violation.
The neighborhood then considers swaps only if they affect at least one conflict position.

This is stronger and more disciplined than our current Phase 1 implementation.
Phase 1 anchored on a bad pair and then sampled some local swaps around it, but the underlying search loop still remained largely “best local repair around obvious offenders.”

### Why this matters

This mechanism does **not** merely say “look at bad pairs.”
It changes the neighborhood from:

- all feasible same-week swaps

to:

- only swaps whose endpoints touch at least one active conflict position

That is a more structural pruning idea than our current top-bucket offender guidance.

### Why it may fit GroupMixer

For pure SGP-like workloads:

- all score damage is concentrated in repeated pairings,
- transfers are impossible,
- and same-week swaps are the operative move.

So conflict-position restriction could potentially:

- reduce wasted move consideration,
- preserve throughput better than exact best-of-k previewing,
- and still retain strong local search pressure.

### Transplant recommendation

**Worth transplanting, but only in an SGP-targeted or repeat-heavy mode.**

Implementation shape in `solver3` terms:

- maintain a fast per-session/per-person “in conflict” bit or count,
- define a swap proposal filter that only samples swaps where at least one endpoint is conflict-involved,
- do **not** necessarily exact-rank 8 candidates around one offender pair,
- instead use this as a cheaper neighborhood restriction.

### Important caution

This is still an **intensification** mechanism, not a true global escape mechanism.
So it should not be sold internally as the full answer.

---

## 1.2 Per-week tabu on swapped golfer pairs

### Paper mechanism

The local tabu paper uses:

- one tabu list **per week**,
- storing swapped golfer pairs `(a,b)` together with an expiration iteration,
- dynamic tabu tenure,
- aspiration for improving-best moves.

This is much more problem-shaped than generic reverse-move tabu.

### Why this matters

The paper’s tabu memory is not “don’t undo the last move” in the generic sense.
It is:

> in this week, don’t keep churning the same golfer pair swap corridor.

That is exactly the kind of memory that may matter in SGP:

- because the effective search is same-week rearrangement,
- and the solver may be cycling through equivalent local repairs.

### Why it may fit GroupMixer

The autoresearch archive already retired:

- exact-undo tabu,
- coarse structural churn tabu,

but those were **generic** or too blunt.

This paper suggests a much more plausible SGP-specific memory:

- week-local,
- player-pair-local,
- directly aligned with the swap kernel.

### Transplant recommendation

**Worth trying as a fresh idea family** if treated as a distinct SGP-specific mechanism rather than “tabu again.”

Minimal viable form:

- only for swap moves,
- only for the same session/week,
- only storing swapped person pairs,
- dynamic tenure drawn from a bounded interval,
- aspiration when the move improves best-so-far.

### Why this differs from already-retired tabu ideas

This is not:

- global reverse-move tabu,
- coarse group-pair churn memory,
- or generic move-memory.

It is a **narrow corridor suppression mechanism** for the actual SGP move kernel.

That makes it substantially more credible than the retired broad tabu variants.

---

## 1.3 Small random breakout after short no-improvement streaks

### Paper mechanism

The local tabu paper applies a simple breakout:

- if there is no improvement for a few iterations,
- perform two random swaps.

### Why this matters

This is a very small but very concrete perturbation operator.
It is not a full restart, and not a big destroy-repair step.

### Why it may fit GroupMixer

This is attractive exactly because it is so cheap.
It offers a clean baseline answer to:

> can an extremely cheap non-greedy perturbation help more than reheating?

It may also be a useful calibration point before attempting more complex perturbations.

### Transplant recommendation

**Worth trying only as a control perturbation**, not as the main long-term strategy.

It is probably too weak to be the final answer on the hardest basins, but it is a valuable baseline because it is:

- easy to reason about,
- cheap,
- and mathematically closer to “micro-escape” than to “restart.”

### Important caution

Do not over-interpret this from the paper as a magical mechanism.
In GroupMixer it should be treated as:

- a lower bound / control experiment,
- not the main global-search plan.

---

## 1.4 Conflict concentration as a design goal

### Paper mechanism

The GRASP/local tabu papers explicitly note that good initial structure tends to make conflicts **concentrate** into fewer weeks/regions instead of staying diffusely spread.
The authors interpret this as opening more useful local moves.

### Why this matters

This is less an operator than a diagnostic principle:

> good search states may be those where badness is localized, not uniformly diluted.

### Why it may fit GroupMixer

This suggests a useful telemetry idea and possibly a search objective tie-break:

- not only count total repeat violations,
- but also study whether violations are concentrated in a smaller number of sessions.

It might be easier to repair one ugly session than many mildly ugly sessions.

### Transplant recommendation

**Worth transplanting first as telemetry / analysis, then maybe as a secondary heuristic signal.**

Possible uses:

- benchmark diagnostics: concentration of repeat burden by session,
- restart/perturbation evaluation: did we localize damage usefully?
- memetic offspring scoring: prefer children that keep total score similar but localize damage better.

---

# 2. Mechanisms from **Solving the Social Golfer Problem with a GRASP** worth transplanting

## 2.1 Freedom-based constructive heuristic

### Paper mechanism

The GRASP paper introduces **freedom**:

- for a player, the set of still-possible future partners,
- for a set of players, the size of the intersection of their potential partner sets.

Construction then chooses pairs with **maximal freedom** when building groups.

This is not generic randomness.
It is a very specific future-option-preservation heuristic.

### Why this matters

This is the strongest directly transplantable idea in the constructor space.
It aligns exactly with the observed issue that early basin choice matters a lot.

### Why it may fit GroupMixer

GroupMixer currently has a solver3 baseline constructor, but the literature strongly suggests that for SGP:

- construction quality has disproportionate downstream impact,
- and “freedom” is a more future-aware signal than immediate repeat repair.

This could be a much more principled way to improve early search than our current Phase 1 repeat-guided local exploitation.

### Transplant recommendation

**Very worth transplanting.**
This is probably the single clearest paper-derived mechanism to try next on the SGP side.

Recommended GroupMixer adaptation:

- keep the current exact runtime/search layers,
- add an optional SGP-oriented constructor mode,
- build weekly groups greedily using a freedom-like future-partner availability score,
- randomize within a restricted candidate list rather than deterministically maximizing.

### Why this may be better than more local-search tinkering

Because the benchmark evidence suggests the basin is chosen very early anyway.
If the constructor can hand search a substantially better basin topology, that may be more valuable than trying to rescue a poor basin later.

---

## 2.2 Dual freedom heuristic for exact branching / selective completion

### Paper mechanism

The GRASP paper notes an interesting dual idea:

- greedy construction uses **maximal** freedom,
- exact/backtracking search benefits from choosing the next pair with **least** freedom.

That is basically a first-fail principle.

### Why this matters

This suggests a hybrid strategy:

- use freedom-maximizing choices while broadly constructing,
- use least-freedom focus when repairing a constrained residual subproblem.

### Why it may fit GroupMixer

This could map nicely to any future:

- partial repair,
- ruin/recreate,
- or exact small-subproblem completion.

It gives a concrete scoring principle for choosing *which* residual structure to attack first.

### Transplant recommendation

**Worth transplanting conceptually**, especially if GroupMixer later explores:

- partial exact repair of one session or small block,
- CP/ILP-assisted local completion,
- or bounded exact repair kernels.

Not necessarily the first next experiment, but a strong design principle.

---

## 2.3 GRASP as constructor + local search, not as pure restart farm

### Paper mechanism

The GRASP paper’s success is not “just do random restarts.”
It is:

- freedom-aware randomized construction,
- then local search from those seeds.

### Why this matters

This is very relevant to your critique that some ruin/recreate or restart-ish ideas may just be “running SA multiple times in disguise.”

The GRASP paper suggests the value is not in restart alone, but in **biased restarts with structure-preserving future-aware construction**.

### Transplant recommendation

**Worth transplanting as a mental model**:

- if GroupMixer does multi-start / perturb-reseed work,
- it should not be naive uniform restart,
- it should be restart from a structured constructor.

That is much more plausible than “just run the same random process more times.”

---

# 3. Mechanisms from **Scheduling Social Golfers with Memetic Evolutionary Programming** worth transplanting

## 3.1 No recombination unless symmetry is handled explicitly

### Paper mechanism

The memetic paper makes a very strong point:

- naive recombination is dangerous because of SGP symmetries,
- similar schedules can look syntactically very different,
- so crossover can behave like random macromutation.

Therefore their memetic algorithm is based on:

- selection,
- mutation,
- local search,
- but **no recombination**.

### Why this matters

This is one of the most important paper-level warnings for GroupMixer.

If we pursue “GA,” we should not silently assume that ordinary crossover is meaningful.
The paper strongly suggests:

> first solve representation/compatibility,
> otherwise crossover will mostly destroy structure.

### Transplant recommendation

**Very worth transplanting as a guardrail.**

If GroupMixer explores GA/memetic next, the safe first move is likely:

- an **EP-style or mutation-driven memetic algorithm**,
- not a classic crossover-heavy GA.

Only after we have a symmetry-aware representation or problem-aware recombination operator should crossover become central.

---

## 3.2 Steady-state population with one-child-at-a-time improvement

### Paper mechanism

The memetic algorithm is not a generational GA blast.
It is:

- steady-state,
- select one solution,
- mutate it,
- locally improve it,
- reinsert it.

### Why this matters

This is much closer to the architecture GroupMixer can realistically host than a giant full-population GA redesign.

It also matches the repo’s existing preference for:

- explicit iteration loops,
- exact move kernels,
- benchmarkable incremental mechanisms.

### Transplant recommendation

**Very worth transplanting.**

If we pursue a memetic direction, the cleanest first architecture is probably:

- small elite population,
- steady-state evolution,
- one candidate mutated and polished at a time,
- explicit benchmark-visible budget accounting.

This is much less disruptive than adding a full classical GA framework.

---

## 3.3 Mutation as a macro-jump made of several same-week swaps

### Paper mechanism

Their mutation is not just one tiny local move.
It is:

- select same-week cross-group swaps,
- perform several of them,
- so mutation becomes a larger jump than tabu local search uses.

They explicitly note that from the TS perspective, this mutation is a **long jump**.

### Why this matters

This is exactly the kind of missing ingredient current `solver3` appears to need:

- not better one-move greed,
- but a reasonably structured basin-jump that still respects the problem geometry.

### Why it may fit GroupMixer

We already have a same-week swap kernel.
So a macro mutation operator built from several valid swaps is actually quite natural in the current architecture.

### Transplant recommendation

**Very worth transplanting.**

Candidate implementation direction:

- define a mutation operator as `k` same-session or selected-session swaps,
- choose `k` from a small distribution,
- optionally bias the mutated sessions by conflict burden,
- then run local improvement afterward.

This is much more plausible than unstructured random restart.

---

## 3.4 Lamarckian learning, not Baldwinian

### Paper mechanism

The paper compares:

- Baldwinian learning: locally improve for scoring, but keep original genotype,
- Lamarckian learning: write the improved state back into the individual.

Their conclusion is clear:

- **Lamarckian** performs substantially better on SGP.

### Why this matters

This is a very concrete architectural recommendation for GroupMixer.

If we do a memetic population:
- we should likely store the **post-local-search individual**,
- not just use local search as a scoring oracle.

### Why it may fit GroupMixer

This also matches current solver architecture instincts:

- we already trust local exact search operators,
- so it is natural to make them part of the inherited state.

### Transplant recommendation

**Strongly worth transplanting.**

If a memetic population is built, default to:

- local search modifies the individual,
- the improved child is what survives.

Do not start with Baldwinian-only experiments unless there is a strong reason.

---

## 3.5 Embedded tabu local search inside the memetic loop

### Paper mechanism

The memetic algorithm uses tabu search as the local improver, specifically over:

- same-week, cross-group swaps,
- restricted to conflict-involved players.

### Why this matters

This gives a more precise architectural picture than “GA + local search.”
It is really:

- mutation for basin jump,
- tabu search for local exploitation.

### Transplant recommendation

**Worth transplanting conceptually.**

In GroupMixer terms this suggests:

- do not replace the existing local search loop,
- wrap it in a higher-level population / mutation driver,
- and optionally add SGP-specific swap memory there.

This is much cleaner than inventing a whole new metaheuristic from scratch.

---

## 3.6 Adaptive mutation / breakout weighting as explicit anti-local-minima machinery

### Paper mechanism

The memetic paper mentions two anti-stagnation mechanisms:

1. increasing mutation probability after local minima are reached,
2. earliest breakout mechanism:
   - keep weights for nogoods / hard conflicts,
   - increment them when revisited,
   - add weighted penalties to the fitness.

### Why this matters

This is one of the few concrete paper-level ideas that directly addresses:

- not local exploitation,
- but repeated revisiting of hard conflict structures.

### Why it may fit GroupMixer

The breakout idea is interesting because it is not just “reheat temperature.”
It changes what the search is trying to avoid by accumulating history over repeatedly violated structures.

For SGP, the natural breakout units would be something like:

- over-repeated golfer pairs,
- maybe high-conflict sessions,
- maybe recurring local motifs.

### Transplant recommendation

**Potentially worth transplanting, but carefully.**

This is not a trivial plug-in.
The risk is poisoning the objective with noisy adaptive penalties.

If explored, it should be done in a sharply scoped experimental mode.

Still, among “escape mechanisms,” this is more specific and plausible than generic reheating.

---

# 4. Mechanisms that look less worth transplanting directly

## 4.1 Naive crossover

The memetic paper is explicit that symmetry makes this dangerous.
Unless GroupMixer first develops:

- a symmetry-aware representation,
- or a compatibility-aware recombination operator,

naive crossover should be treated as **not worth transplanting directly**.

## 4.2 Variable-span / representation changes not natural to the problem

The non-SGP tabu material in the memetic file reinforces a general point:

- “natural representation” tends to matter,
- split or transformed representations can hurt local search badly.

For GroupMixer this argues against large representation gymnastics for SGP unless clearly justified.

## 4.3 Pure baldwinian memetic learning

The paper result is clear enough that this should not be a first-class priority.

---

# 5. What this suggests for GroupMixer, concretely

## Highest-value direct transplants

### A. Freedom-aware constructor for SGP / repeat-heavy cases

Why:
- best paper-level constructor idea,
- directly addresses early basin choice,
- likely cheaper than trying to solve everything in steady-state search.

### B. SGP-specific tabu memory over swapped golfer pairs within one week/session

Why:
- genuinely different from previously retired generic tabu,
- directly aligned with the move kernel the paper used successfully.

### C. Steady-state memetic outer loop with mutation + local search, but **without naive crossover**

Why:
- strongest credible global-search direction,
- symmetry-aware,
- compatible with current solver architecture.

### D. Macro mutation made of several same-week swaps

Why:
- concrete basin-jump mechanism,
- much more plausible than more greedy one-step move selection.

### E. Lamarckian inheritance of locally improved children

Why:
- the paper result is strong,
- and it fits the current architecture well.

---

# 6. Recommended order of experimentation

## Option 1 — constructor-first path

1. implement freedom-aware constructor mode
2. benchmark default search starting from those seeds
3. only then decide if a larger memetic outer loop is still needed

This is the lowest-risk paper-grounded next step.

## Option 2 — memetic-outer-loop path

1. small steady-state population
2. mutation as several same-week swaps
3. current local search as embedded improver
4. Lamarckian replacement
5. optionally add week-local pair tabu to the local improver

This is the strongest global-search path, but architecturally larger.

## Option 3 — targeted local-search refinement path

1. add conflict-position restriction
2. add per-session swapped-pair tabu
3. compare against current record-to-record baseline

This is smaller than a memetic loop, but probably still only a partial answer.

---

# 7. My synthesis after reading the papers closely

The most important paper-level lesson is this:

> the SGP literature does **not** mainly point toward better greedy conflict repair as the core missing ingredient.
>
> It points toward a combination of:
> - **better initial structure**,
> - **problem-shaped local search memory**,
> - and **global exploration via mutation-driven memetic search rather than naive crossover**.

That is a much more specific and actionable conclusion than saying “maybe GA.”

If GroupMixer wants the most paper-backed next step, my ranking is:

1. **freedom-aware constructor**
2. **steady-state mutation-driven memetic search with Lamarckian learning**
3. **SGP-specific week-local swapped-pair tabu**
4. **breakout weighting only as a later, careful experiment**

---

## Appendix: concise transplant checklist

### Worth transplanting directly
- freedom-based greedy randomized constructor
- conflict-position-restricted swap neighborhoods
- per-week swapped-golfer-pair tabu lists
- dynamic tabu tenure with aspiration
- macro mutation as several same-week swaps
- steady-state memetic loop
- Lamarckian local improvement

### Worth transplanting only cautiously
- breakout / adaptive conflict weights
- random breakout steps after short stagnation
- CP/backtracking dual least-freedom idea for partial repair subproblems

### Not worth transplanting naively
- ordinary crossover without symmetry handling
- broad generic tabu memory already shown weak in repo experiments
- more brute-force exact preview guidance as a substitute for real diversification
