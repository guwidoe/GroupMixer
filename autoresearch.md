# Autoresearch: solver3 objective quality

## Objective
Improve `solver3` on the hard canonical objective bundle using **fixed-time objective quality** as the primary metric.

This lane is solver3-only. Fixed-iteration quality and raw-runtime probes are supporting diagnostics, not the keep/discard target.

The main purpose of this lane is **search innovation**, not endless polishing of one existing simulated-annealing setup. The preferred sources of improvement are:

- new move types
- richer neighborhoods
- perturbation / restart mechanisms
- search memory
- alternative metaheuristics
- solver3 refactors that make those experiments easier and safer

The user has explicitly clarified that this lane should aim for **order-of-magnitude search improvements**, not just small local refinements. Future agents should therefore default toward **big architectural search ideas** before considering micro-tuning.

Examples of the preferred scale of ideas in this lane:
- population-based / memetic / genetic algorithms
- ruin-and-recreate / ALNS / large-neighborhood search
- GRASP / multi-start constructive search with diverse starts
- iterated local search with substantial perturb-and-repair cycles
- hyper-heuristics / operator portfolios over macro-level search behaviors
- fundamentally different metaheuristic drivers, not just another SA variant

## Metrics
- **Primary**: `objective_suite_weighted_normalized_score` (lower is better, scaled so baseline-like values are around `100` instead of `1.00`)
- **Secondary**:
  - `objective_fixed_iteration_weighted_normalized_score`
  - `solver3_raw_score_us`
  - `runtime_total_seconds`
  - `objective_suite_total_runtime_seconds`
  - validation mismatch counters

## How to Run
`./autoresearch.sh`

Root wrappers delegate to `tools/autoresearch/solver3-objective-quality/`.

## Persistent Metrics Logging
`./autoresearch.sh` now writes the most recent full metric set to `autoresearch.last_run_metrics.json`. After every completed `run_experiment` + `log_experiment` cycle, run:

`python3 tools/autoresearch/patch_autoresearch_jsonl.py autoresearch.jsonl autoresearch.last_run_metrics.json`

This patches the latest run entry in `autoresearch.jsonl` so the tool-managed history also retains the secondary diagnostics and per-case scores.

## Files in Scope
- `backend/core/src/solver3/**`
- `tools/autoresearch/solver3-objective-quality/**`
- `autoresearch.md`
- `autoresearch.sh`
- `autoresearch.checks.sh`
- `autoresearch.ideas-to-try.md`
- `autoresearch.ideas.md`

## Off Limits
- `backend/core/src/solver1/**`
- `backend/core/src/solver2/**`
- shared construction / validation / benchmarking plumbing unless a blocking bug is discovered and the user confirms the fix direction
- benchmark case identity, seeds, budgets, and metric reference math during the loop
- weakening checks

## Constraints
- Primary signal is fixed-time objective quality on the explicit solver3 bundle
- Synthetic partial-attendance stress case is included in the solver3 primary bundle
- Use broad correctness checks even when expensive
- Do not proxy / simplify / tune away the benchmark question
- Search-policy tuning inside solver3 is allowed, but it is not the main goal

## Experiment Policy

### 1. Prioritize search innovation over parameter polish
Parameter-only tuning is a **secondary activity** in this lane.

Preferred experiment classes:
- population-based metaheuristics (GA / memetic search)
- ruin-and-recreate / ALNS / large-neighborhood search
- GRASP / multi-start constructive search
- iterated local search with substantial perturbation-repair structure
- hyper-heuristics / macro-level operator selection
- new move types
- new neighborhood families
- new search-memory mechanisms
- new perturbation / restart behavior
- alternative metaheuristic drivers
- solver3 architecture changes that enable such work

Allowed but lower-priority experiment classes:
- SA initial/final temperature tuning
- cooling schedule tuning
- reheat threshold tuning
- no-improvement limit tuning
- other small policy-only retuning without introducing a new mechanism

Strongly de-prioritized / usually not worth a turn by themselves:
- tiny acceptance-rule tweaks that do not create a genuinely new driver
- small threshold/cooling/temperature shape changes
- minor move-family weighting changes
- narrow cost-model nudges
- other changes that are better described as local polish than search redesign

### 2. Do not let SA-only tuning dominate the loop
Avoid long runs of experiments that only change SA meta-parameters.

Hard rule:
- do **not** run more than **2 consecutive experiments** that are purely parameter-only tuning of the existing search policy

After 2 such experiments, the next experiment should instead be one of:
- a population-based or multi-start search idea
- a ruin-and-recreate / ALNS idea
- a large perturb-and-repair idea
- a new move type
- a new neighborhood
- a new perturbation / restart mechanism
- a new search-memory mechanism
- a solver3 refactor that directly enables such experiments

Additional policy:
- Once the lane has evidence that several micro-tuning families are not producing step-changes, agents should **stop spending turns on more micro-tuning** and move to larger metaheuristic changes.
- Agents should not hide behind “small safe experiments” when the user has asked for bigger ideas. Bias toward bold but benchmark-honest solver changes.

### 3. Keep a structured research backlog
The lane now uses a **two-file idea flow**:

- `autoresearch.ideas-to-try.md` = the live queue of the strongest **untried** ideas, especially literature-backed ideas synthesized from the local `papers/` library
- `autoresearch.ideas.md` = ideas that have already been **materially tried**, plus learnings, conclusions, retirement notes, and revisit conditions

Workflow rule:
- Before planning a fresh experiment, read `autoresearch.ideas-to-try.md` and prefer one of its highest-priority ideas unless you are doing a justified follow-up inside an approved incubation window.
- Once an idea from `autoresearch.ideas-to-try.md` is materially tried in a real solver experiment, move it out of that file and into `autoresearch.ideas.md`.
- The `autoresearch.ideas.md` entry should record what was tried, what happened, what was learned, and whether the family should be incubated further or retired.

Use the two files as follows:
- keep **untried** ideas in `autoresearch.ideas-to-try.md`
- keep **tried** ideas and conclusions in `autoresearch.ideas.md`
- keep source-text backlinks in the untried queue so future agents can quickly reopen the relevant papers/pages

Do not leave tried ideas sitting in the untried queue.

### 4. Incubate larger additions before judging them
If an experiment introduces a **substantial new mechanism**, do not immediately reject the underlying idea after one weak run.

Examples of substantial additions:
- a population-based / memetic / GA driver
- an ALNS / ruin-and-recreate framework
- a GRASP / multi-start constructive framework
- an iterated-local-search perturb-and-repair framework
- a new move type
- a new neighborhood family
- a new perturbation / restart mechanism
- a new search-memory mechanism
- a new metaheuristic driver

Such additions get a short **incubation window** of roughly **2–4 targeted follow-up experiments**. During that window, the agent may:
- fix bugs
- tune the new mechanism
- improve integration into solver3
- adjust usage frequency / sampling / acceptance interactions

Judge the **mechanism family**, not only the first rough implementation.

However, stop incubating the idea early if:
- correctness/checks fail repeatedly
- the change is catastrophically bad with no plausible fix direction
- follow-up runs show no directional improvement at all
- the mechanism clearly conflicts with the benchmark question or benchmark honesty rules

This incubation exception is for **substantial solver innovations only**. It does **not** justify long unbounded runs of pure parameter-only tuning.

### 5. Explicit anti-slop rule for this lane
If an experiment can honestly be described as “tweak a schedule/threshold/temperature/weight a bit and rerun”, it is probably **too small** unless it is:
- a follow-up inside an already-approved incubation window for a larger mechanism, or
- needed to stabilize or debug a newly introduced big mechanism.

The default question for each planned experiment should be:

> Does this meaningfully change solver3's search architecture or search scale?

If the answer is no, prefer a bigger idea.

## What's Been Tried
- Cross-solver benchmark infrastructure, validation, and objective metric math are now in place.
- The remaining need is explicit solver3 orchestration over the shared harness.
- This setup makes the solver family explicit, keeps the benchmark contract fixed, and adds fixed-iteration + raw-runtime diagnostics for interpretation.
