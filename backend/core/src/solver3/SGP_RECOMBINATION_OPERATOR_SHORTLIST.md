# Solver3 structure-preserving recombination operator shortlist

Parent todos:
- `TODO-f054c8ea` — write a solver3 structure-preserving recombination design note
- `TODO-7dc0b3db` — write solver3 structure-preserving recombination operator shortlist
- related: `TODO-7c8bdec7` — reevaluate solver3 memetic control structure around rare expensive events

## Purpose

Turn the current recombination brainstorming into a concrete shortlist of operators worth implementing first for `solver3`.

This note is intentionally framed by the current benchmark evidence:

- cheap local search should dominate runtime
- plain fixed-tenure SGP tabu currently looks like the best live inner-loop mechanism
- the current steady-state memetic loop is too expensive and too destructive
- future recombination should happen as a **rare expensive event**, not as constant child churn

## Control-structure decision

The target control structure is:

1. run cheap local search most of the time
2. maintain a small archive of strong incumbents / elites
3. occasionally trigger a recombination event
4. apply bounded repair / polish
5. return immediately to cheap local search

This is explicitly **not** a recommendation to continue the current "generate children all the time" memetic loop.

## What structure seems worth preserving

For SGP-like and repeat-heavy GroupMixer scenarios, the most credible preserved structure is:

1. **whole-session structure**
   - a session can already encode a good local arrangement worth keeping intact
2. **agreement core across elites**
   - if multiple good incumbents agree, that agreement is probably not accidental
3. **low-conflict session blocks**
   - some sessions appear "stable" and should not be scrambled casually
4. **structured differences between elites**
   - the interesting search mass is often in the disagreement region between two good incumbents

By contrast, the current memetic child generator mostly preserves too little.
It makes local mutations cheaply, but it does not deliberately preserve high-value structure discovered by different strong incumbents.

---

## Operator shortlist

## 1. Rare donor-session transplant

### Sketch
Pick one strong incumbent as the current base state and one archived elite as a donor.
Overwrite one session from the donor into the base, then run bounded repair / polish.

### Structure preserved
- preserves one whole donor session exactly
- preserves the rest of the current incumbent almost entirely
- keeps the disruption localized and interpretable

### Destructiveness
- **low to medium**
- only one session is replaced at a time
- far less destructive than building a whole child from multiple broad edits

### Repair / polish burden
- **moderate**
- the transplanted session can create repeat-contact fallout in other sessions
- but the disruption remains spatially small enough that bounded tabu repair is plausible

### Why it may beat the current memetic child generator
- it inserts a large, meaningful structural block instead of a few random swaps
- it gives access to a genuinely different neighborhood while preserving most of the incumbent
- it matches the desired "rare expensive event" control structure very well

### Main risks
- donor-session quality may not transfer well if the surrounding incumbent context is incompatible
- naive donor choice may just inject noise

### Implementation fit
- **very good first operator fit**
- architecturally close to existing search-side state cloning plus targeted modification
- can naturally exploit an elite archive without inventing a full crossover framework first

---

## 2. Path relinking between elites

### Sketch
Choose two strong but meaningfully different elites.
Start from one and progressively introduce selected structural decisions from the other, evaluating or lightly polishing along the path.

### Structure preserved
- preserves almost all structure initially
- changes are introduced gradually rather than all at once
- naturally exposes the disagreement corridor between two good incumbents

### Destructiveness
- **low per step, medium overall**
- much gentler than blunt recombination
- each step can remain close to feasible / repairable territory

### Repair / polish burden
- **low to moderate per step**
- depends heavily on how structural differences are represented
- can easily become expensive if too many intermediate states are evaluated

### Why it may beat the current memetic child generator
- current memetic v1 jumps to a child and then pays to polish it
- path relinking instead searches the structured corridor between good incumbents
- that is closer to a guided basin-transition than random mutation churn

### Main risks
- representation of a "difference" between incumbents is not trivial in GroupMixer
- easy to over-spend runtime walking too many intermediate states

### Implementation fit
- **strong second operator**
- conceptually attractive, but heavier than donor-session transplant
- probably needs archive / elite selection to be designed first

---

## 3. Agreement-core recombination

### Sketch
Find assignments or session blocks that multiple elites agree on.
Freeze that agreement core, then rebuild or perturb only the disagreement region before bounded polish.

### Structure preserved
- preserves the most trusted shared structure
- explicitly avoids disturbing decisions already validated by multiple elites

### Destructiveness
- **potentially low in the preserved core, high in the remainder**
- depends on how large the disagreement region is

### Repair / polish burden
- **high unless the disagreement region can be rebuilt very cleanly**
- agreement-core methods often imply a partial reconstruction problem

### Why it may beat the current memetic child generator
- it is much more selective about what it destroys
- it uses archive consensus rather than one-parent random mutation

### Main risks
- likely drifts toward partial reconstruction / repair logic
- without constructor work, the disagreement region may be awkward to refill well

### Implementation fit
- **promising, but not first**
- strong research idea, weaker immediate implementation fit under the current constraints

---

## 4. Whole-session inheritance from multiple parents

### Sketch
Build a child from several whole sessions chosen from two or more parents, then repair / polish.

### Structure preserved
- preserves complete session structure from each chosen parent
- may capture strong session-level building blocks

### Destructiveness
- **high**
- although each inherited unit is meaningful, the stitched child can be globally incoherent
- much more disruptive than single-session transplant

### Repair / polish burden
- **high**
- the composite child may need substantial repair before bounded local search can do useful work

### Why it may beat the current memetic child generator
- it preserves much more structure than random mutation
- but it is also much closer to classical recombination and therefore much riskier

### Main risks
- easy to recreate the same failure mode as memetic v1: too much work spent manufacturing expensive children that do not land in good basins
- may implicitly require stronger repair logic than we currently want to build

### Implementation fit
- **not recommended as the first operator**
- likely too destructive as the first serious recombination attempt

---

## Ranking

### Recommended ranking for first implementation attempts

1. **rare donor-session transplant**
2. **path relinking between elites**
3. **agreement-core recombination**
4. **whole-session inheritance from multiple parents**

## Why this ranking

### Why donor-session transplant ranks first
It best matches all current lessons at once:

- rare expensive event
- preserves meaningful structure
- localized disruption
- bounded repair cost
- clean archive-based control structure
- lowest architectural risk among the serious options

### Why path relinking ranks second
It may have higher upside than donor transplant, but it needs better archive and difference modeling first.
It feels like the strongest *next* operator once archive policy and trigger discipline are defined.

### Why agreement-core is third
Conceptually strong, but it leans toward partial reconstruction and therefore toward machinery we have explicitly avoided reopening.

### Why whole-session multi-parent inheritance is fourth
It preserves structure in a literal sense, but is too likely to produce globally incoherent children and repeat the current memetic failure mode.

---

## Recommended first operator

If only one recombination operator is implemented next, it should be:

## **Rare donor-session transplant from an elite archive**

### Initial recommended shape
- maintain a small archive of strong incumbents
- when a rare event fires, choose:
  - current incumbent as base
  - one archived elite as donor
  - one session to transplant
- transplant exactly one donor session
- run short bounded tabu polish
- keep the result only if it honestly improves the incumbent or meaningfully earns its keep under the chosen replacement rule

### Why this is the right first step
- easiest structure-preserving recombination to reason about
- easiest to benchmark honestly against current fixed-tenure tabu
- easiest to throttle so expensive work stays rare
- easiest bridge from today's architecture to more serious archive-based recombination later

---

## What this implies for the next design todos

This shortlist makes the next follow-up questions concrete:

1. **archive / elite policy**
   - which incumbents are worth storing as donors?
2. **trigger policy**
   - when should a donor-session transplant fire?
3. **parent / donor selection**
   - how should donor choice reflect score plus structural difference?
4. **bounded polish policy**
   - how much tabu repair is acceptable after a transplant?
5. **benchmark plan**
   - how do we measure whether rare recombination actually beats fixed-tenure tabu?

## Honest bottom line

The next recombination phase should not start with another broad child generator.
It should start with the smallest serious operator that:

- preserves real structure,
- changes neighborhoods meaningfully,
- and can be fired rarely.

That operator is **rare donor-session transplant**, with **path relinking** as the most promising follow-on if the archive/selection layer proves worthwhile.
