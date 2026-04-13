# Solver3 donor-session transplant implementation plan

Parent todos:
- `TODO-57f69abe` — plan solver3 bounded post-recombination repair/polish policy
- `TODO-884c6674` — define honest benchmark plan for solver3 recombination research
- related: `TODO-97faefc4` — solver3 memetic candidate selection and recombination redesign
- related: `TODO-064162ce` — design solver3 elite/archive candidate selection policy for memetic search
- related: `TODO-04d6db0f` — design solver3 rare-event memetic trigger and parent-selection policy
- related: `TODO-7dc0b3db` — write solver3 structure-preserving recombination operator shortlist

## Purpose

Start the implementation plan for the first serious structure-preserving recombination path in `solver3`.

Recommended first operator:
- **rare donor-session transplant from an elite archive**

This plan converts the completed design work into a concrete implementation sequence while preserving the main lesson from the benchmarks:

- cheap tabu local search must dominate runtime
- recombination is a rare, explicit, expensive event
- the benchmark story must remain honest per scenario

---

## 1. Bounded post-recombination repair / polish policy

## 1.1 Default local improver after recombination

Recommended default:
- **`single_state + sgp_week_pair_tabu`**
- using the current best fixed-tenure reference as the first repair path

Why:
- this is the strongest currently benchmark-supported cheap inner loop
- the recombination operator is explicitly session-local / repeat-heavy in shape
- using record-to-record first would throw away the only current evidence-backed repair mechanism

## 1.2 Polish budget philosophy

The post-transplant polish should be:
- **short**
- **bounded**
- **much smaller than the surrounding cheap-search budget**

The right objective is not “fully optimize the child.”
It is:
- repair obvious fallout,
- give the transplanted session a fair local chance,
- then return to cheap local search quickly.

## 1.3 Recommended v1 polish budget shape

Use explicit hard bounds in three dimensions:

1. **max accepted/improver iterations budget**
2. **no-improvement cutoff**
3. **optional wall-clock cap**

Recommended v1 stance:
- no operator-specific polish complexity yet
- one default bounded tabu polish helper
- expose the budget in config as an explicit recombination-policy block

## 1.4 Early discard rule

Do **not** fully polish every transplanted child.

Recommended v1 early-discard logic:

1. perform the donor-session transplant
2. recompute the immediate child score
3. if the immediate child is catastrophically worse than the base incumbent by a configured margin:
   - discard immediately
4. otherwise run bounded tabu polish

This prevents obviously bad donor injections from consuming too much budget.

## 1.5 Keep/discard rule after polish

Post-polish outcome should be explicit:

- **keep** if polished child beats current incumbent
- otherwise **discard** and continue cheap local search from the base incumbent

No fuzzy acceptance for recombination in v1.
The event should earn its keep honestly.

---

## 2. Honest benchmark plan for recombination research

## 2.1 Comparison baseline

All recombination work must compare against the current reference:

- **fixed-tenure `sgp_week_pair_tabu`**
- current best cheap inner-loop reference: fixed `8..32`, `retry_cap=4`, `aspiration=true`

Do not compare only against old memetic v1.
The real question is whether donor-session recombination beats the current cheap-search baseline.

## 2.2 Required per-scenario reporting

Every benchmark summary must report per scenario:

- final score
- runtime seconds
- iteration count / iter/s
- number of recombination events fired
- number of archive admissions / replacements
- number of donor-session transplants attempted
- number of immediate discards before polish
- number of polished transplants kept vs discarded
- post-recombination polish iterations / seconds

This is required because aggregate averages can hide whether recombination helps only one workload and harms the others.

## 2.3 Required benchmark scenario surface

Use at least these four scenarios first:

- `backend/benchmarking/cases/stretch/social_golfer_32x8x10.json`
- `backend/benchmarking/cases/stretch/kirkman_schoolgirls_15x5x7.json`
- `backend/benchmarking/cases/stretch/sailing_trip_demo_real.json`
- `backend/benchmarking/cases/stretch/synthetic_partial_attendance_capacity_pressure_152p.json`

Reason:
- Social Golfer and Kirkman are the most SGP-shaped anchors
- Sailing and synthetic partial-attendance ensure we do not fool ourselves about broader GroupMixer relevance

## 2.4 Required benchmark lanes

### Stage A — design validation lane
Single-seed sanity lane for:
- fixed-tenure tabu reference
- donor-session transplant mode with very conservative trigger settings

Purpose:
- prove the implementation behaves sensibly
- validate telemetry
- catch obviously broken trigger/polish settings

### Stage B — honest multi-seed lane
For the same four scenarios:
- run 3 seeds minimum for the tabu reference
- run 3 seeds minimum for donor-session transplant mode

Purpose:
- per-scenario score/runtime/iteration comparison
- event frequency sanity check
- detect whether recombination just adds cost without value

### Stage C — hotpath guardrail
Keep the existing default solver3 hotpath lane separate.
Do not let the advanced recombination mode quietly mutate the default path.

## 2.5 Interpretation rule

A recombination mode is only a win if:
- final incumbents improve on at least the most relevant target scenarios,
- and the extra expensive-event cost is justified.

Do **not** overclaim because:
- improvements happened later,
- archive activity looks interesting,
- or the mode appears to “use the budget more.”

Final incumbent quality remains primary.

---

## 3. Recommended implementation sequence

## Phase A — archive substrate

### A1. Add elite archive data model
Search-side only.

Store:
- full `RuntimeState`
- score
- per-session fingerprints
- per-session conflict burden summary

### A2. Add archive admission / replacement logic
Implement:
- duplicate detection
- near-duplicate suppression
- small fixed archive size
- diversity-aware eviction when full

Deliverable:
- an explicit `EliteArchive` helper module under `backend/core/src/solver3/search/`

## Phase B — trigger and donor selection

### B1. Add explicit recombination-policy config
Add a new explicit advanced config block for the donor-session transplant mode.

Must include:
- enable flag or mode selection
- archive size
- stagnation trigger window
- cooldown window
- max recombination events per run
- early-discard margin
- polish budget values

No hidden fallback to the old memetic loop.

### B2. Add rare-event trigger state
Search-side state should track:
- no-improvement since last best
- iterations since last recombination event
- recombination events fired

### B3. Add donor selection logic
Use:
- current incumbent as base
- score-filtered archive donor with maximum session disagreement

### B4. Add donor-session choice logic
Among differing sessions:
- prefer donor sessions with lower local conflict burden than the base session
- break ties by largest local burden advantage

## Phase C — first recombination operator

### C1. Implement one-session donor transplant
Mechanically:
- clone current incumbent
- overwrite one selected session from donor into the child
- rebuild any required session-derived search-side state honestly

### C2. Add immediate child screening
If immediate post-transplant score is catastrophically worse:
- discard without polish

### C3. Add bounded tabu polish
Polish only the surviving child with a short bounded helper.

### C4. Add keep/discard replacement rule
- keep if polished child beats current incumbent
- otherwise discard and continue from current incumbent

## Phase D — telemetry and benchmarking

### D1. Add recombination telemetry
Must include at minimum:
- archive admissions
- archive evictions
- recombination triggers fired
- donors considered / chosen
- session transplants attempted
- immediate discards
- polished children kept / discarded
- child polish iterations / seconds

### D2. Add benchmark manifests
Need dedicated donor-session transplant manifests, separate from current tabu-only lanes.

### D3. Run Stage A / Stage B / Stage C benchmark plan
Summarize per scenario, not just in aggregate.

---

## 4. Concrete first implementation slices

Recommended coding order:

1. **archive substrate**
2. **recombination config + trigger state**
3. **donor selection + session selection**
4. **one-session transplant operator**
5. **immediate discard + bounded polish**
6. **telemetry + benchmark lanes**
7. **multi-seed benchmark summary**

This order keeps the architecture clean and makes it easy to stop early if the operator is obviously not promising.

---

## 5. Explicit non-goals for v1

Do **not** do these in the first donor-session-transplant batch:

- two-parent crossover
- full path relinking
- agreement-core reconstruction logic
- archive genealogy framework
- sophisticated diversity metrics beyond session disagreement
- complex acceptance logic for recombined children

These can come later if the first operator actually shows life.

---

## Honest bottom line

The implementation plan should begin with the smallest serious recombination mechanism that is still structurally meaningful:

- small elite archive
- rare stagnation-triggered donor selection
- one-session transplant
- short bounded tabu polish
- honest per-scenario benchmarking against fixed-tenure tabu

That is the cleanest next implementation path for `solver3` recombination research.
