# Autoresearch ideas to try

Live queue of the **strongest literature-backed solver3 ideas that have not yet been materially tried** in the canonical objective-quality autoresearch loop.

This file is the **untried queue**.

- Read this file before planning a fresh solver3 experiment.
- Prefer the highest-priority idea here unless you are doing a justified follow-up inside an approved incubation window for an already-started mechanism.
- Once an idea here is **materially tried** (first real solver experiment, not just note-taking), move it out of this file and into `autoresearch.ideas.md`.
- In `autoresearch.ideas.md`, record the experiment shape, outcome, learnings, conclusions, and whether the family should be incubated further or retired.

## Queue hygiene rules
- Keep only **not-yet-tried** ideas here.
- Do **not** re-add naive variants that are already retired in `autoresearch.ideas.md`.
- Prefer ideas that are meaningfully different from already-retired families.
- Link every idea to the local paper source text so future runs can quickly recover the rationale.

## Already tried enough that they do **not** belong here
- naive equal-slice multi-start
- naive whole-session ALNS rebuild with greedy repair
- constructor-seeded donor session crossover
- pure LAHC
- simple UCB move-family selection
- exact-undo tabu
- restart-family perturbations
- naive best-of-k preview greedification
- threshold / temperature micro-tuning beyond the kept record-to-record baseline

---

## Highest-priority ideas

## 1. Freedom-aware GRASP constructor feeding the kept record-to-record local search
**Why this is promising**
- The literature suggests start quality can completely change what the inner search can reach.
- Our naive multi-start experiment probably failed less because “multi-start is bad” and more because the constructor was not strong enough to justify splitting the budget.

**What would be genuinely new vs. what we already tried**
- a construction heuristic that explicitly scores **future slack / freedom**
- candidate selection driven by future pairing flexibility, balance slack, clique feasibility, and repeat-risk
- randomized restricted candidate lists rather than plain constructor-seed diversity

**First concrete experiment shape**
- build schedules session-by-session with a freedom-aware greedy score
- use a small randomized restricted candidate list at each placement step
- try 3–5 construction-randomization settings
- feed only the best few starts into the existing record-to-record local search, instead of equal-slicing the whole budget blindly

**What success would look like**
- produces materially stronger starting states than the current constructor for hard cases
- improves the basin quality that downstream local search can exploit without the budget fragmentation of naive equal-slice multi-start

**Local source text**
- [papers/marker/solving-social-golfer-with-grasp/solving-social-golfer-with-grasp.md](papers/marker/solving-social-golfer-with-grasp/solving-social-golfer-with-grasp.md)
- [papers/marker/social-golfer-effective-greedy-heuristic/social-golfer-effective-greedy-heuristic.md](papers/marker/social-golfer-effective-greedy-heuristic/social-golfer-effective-greedy-heuristic.md)

---

## 2. Targeted ALNS / LNS with restricted exact repair kernel
**Why this is promising**
- We already learned that naive whole-session greedy rebuild is too weak.
- The literature keeps reinforcing that ALNS only becomes compelling when the **repair** is strong enough.
- GroupMixer seems particularly suited to freeing a structurally bad subregion and then solving only that subproblem much more carefully.

**What would be genuinely new vs. what we already tried**
- destroy only a focused substructure, not an entire session
- select destroy targets from actual conflict hotspots:
  - repeated-pair hotspots
  - balance-pressure groups
  - clique-friction regions
  - people/subsets with concentrated violations
- repair with a **restricted exact or near-exact kernel** over only the freed variables

**First concrete experiment shape**
- on stagnation, free one small hotspot neighborhood
- rebuild it with a restricted assignment / matching / exact-search kernel scoped only to the freed region
- fail soft if the restricted repair cannot improve or cannot produce a valid state
- optionally follow with a short record-to-record polish burst

**What success would look like**
- better targeted quality gains than whole-session rebuilds
- especially attractive if it improves `large_gender` or transfer-balance structure without destabilizing sailing

**Local source text**
- [papers/marker/itc2021-sports-timetabling-alns/itc2021-sports-timetabling-alns.md](papers/marker/itc2021-sports-timetabling-alns/itc2021-sports-timetabling-alns.md)
- [papers/marker/avionic-scheduling-matheuristic-2020/avionic-scheduling-matheuristic-2020.md](papers/marker/avionic-scheduling-matheuristic-2020/avionic-scheduling-matheuristic-2020.md)
- [papers/html/bus-timetabling-alns-matheuristic-ejor-2026.html](papers/html/bus-timetabling-alns-matheuristic-ejor-2026.html)
- [papers/html/music-rehearsal-alns-2021.html](papers/html/music-rehearsal-alns-2021.html)
- [papers/html/home-care-scheduling-lns-2020.html](papers/html/home-care-scheduling-lns-2020.html)
- [papers/marker/social-golfer-improved-sat-formulation/social-golfer-improved-sat-formulation.md](papers/marker/social-golfer-improved-sat-formulation/social-golfer-improved-sat-formulation.md)

---

## 3. Stage-aware hyper-heuristic over macro operators, not low-level move families
**Why this is promising**
- We already know simple UCB over low-level move families is not enough.
- The literature-backed idea is higher-level: learn which **macro search behavior** to run next, given the current search state.
- This only makes sense at the level of real operators such as crossover, destroy+repair, balance repair, repeat repair, or polish bursts.

**What would be genuinely new vs. what we already tried**
- controller operates over **macro operators**, not swap/transfer/clique family probabilities
- stage-aware or context-aware selection using progress, stagnation, and conflict signatures
- reward tied to best-score improvement and perhaps time-normalized gain, not simple acceptance count

**First concrete experiment shape**
- build a small operator portfolio first:
  - record-to-record polish burst
  - targeted destroy+repair burst
  - memetic offspring generation burst
  - balance-focused repair burst
- choose among them with a simple contextual bandit or online-learning controller
- use richer reward than the retired family-selector experiments

**What success would look like**
- fewer catastrophic case-specific collapses than static policy choices
- better adaptation across cases with different structure

**Local source text**
- [papers/marker/grouping-hyper-heuristic-framework-groupinggc/grouping-hyper-heuristic-framework-groupinggc.md](papers/marker/grouping-hyper-heuristic-framework-groupinggc/grouping-hyper-heuristic-framework-groupinggc.md)
- [papers/marker/grouping-hyper-heuristic-ukci2013/grouping-hyper-heuristic-ukci2013.md](papers/marker/grouping-hyper-heuristic-ukci2013/grouping-hyper-heuristic-ukci2013.md)
- [papers/marker/dynamic-operator-management-rl-portfolio-2024/dynamic-operator-management-rl-portfolio-2024.md](papers/marker/dynamic-operator-management-rl-portfolio-2024/dynamic-operator-management-rl-portfolio-2024.md)
- [papers/marker/hybrid-offline-online-adaptive-operator-selection-2024/hybrid-offline-online-adaptive-operator-selection-2024.md](papers/marker/hybrid-offline-online-adaptive-operator-selection-2024/hybrid-offline-online-adaptive-operator-selection-2024.md)
- [papers/marker/online-learning-selection-hyper-heuristic-patat2020/online-learning-selection-hyper-heuristic-patat2020.md](papers/marker/online-learning-selection-hyper-heuristic-patat2020/online-learning-selection-hyper-heuristic-patat2020.md)
- [papers/html/course-timetabling-online-learning-hyper-heuristic-2014.html](papers/html/course-timetabling-online-learning-hyper-heuristic-2014.html)

---

## 4. Hypergraph / structural-compatibility scoring as an enabling layer for memetic and ALNS search
**Why this is promising**
- One recurring failure mode in our crossover and rebuild attempts is that we use overly local or naive notions of compatibility.
- The hypergraph-style paper suggests a more structured way to reason about higher-order team/group compatibility.
- This looks especially useful as an enabling layer rather than a standalone solver.

**What would be genuinely new vs. what we already tried**
- donor compatibility based on structural similarity / conflict signatures rather than raw seed diversity
- destroy targeting based on higher-order hotspot structure rather than just session pressure
- population diversity measured over richer structure than exact schedule equality

**First concrete experiment shape**
- build a compact structural signature for a schedule or session block
- use it to:
  - reject bad donor/recipient crossover pairings
  - prioritize destroy regions in ALNS
  - maintain diversity in a future population-based driver

**What success would look like**
- fewer invalid or low-value macro moves
- better reuse of expensive macro operators because they are applied in more compatible situations

**Local source text**
- [papers/marker/hypergraph-team-formation-communications-physics-2025/hypergraph-team-formation-communications-physics-2025.md](papers/marker/hypergraph-team-formation-communications-physics-2025/hypergraph-team-formation-communications-physics-2025.md)
- [papers/html/grouping-problems-metaheuristics-review-2020.html](papers/html/grouping-problems-metaheuristics-review-2020.html)
- [papers/marker/grouping-hyper-heuristic-framework-groupinggc/grouping-hyper-heuristic-framework-groupinggc.md](papers/marker/grouping-hyper-heuristic-framework-groupinggc/grouping-hyper-heuristic-framework-groupinggc.md)

---

## Recommended next implementation order
1. **Freedom-aware GRASP constructor**
2. **Targeted ALNS / LNS with stronger repair coverage**
3. **Stage-aware hyper-heuristic over macro operators**
4. **Hypergraph / structural-compatibility enabling layer**
