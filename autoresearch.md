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

### 2. Do not let SA-only tuning dominate the loop
Avoid long runs of experiments that only change SA meta-parameters.

Hard rule:
- do **not** run more than **2 consecutive experiments** that are purely parameter-only tuning of the existing search policy

After 2 such experiments, the next experiment should instead be one of:
- a new move type
- a new neighborhood
- a new perturbation / restart mechanism
- a new search-memory mechanism
- a solver3 refactor that directly enables such experiments

### 3. Keep a structured research backlog
`autoresearch.ideas.md` is a first-class part of the lane, not an optional scratchpad.

Use it to track:
- move-family ideas
- neighborhood ideas
- metaheuristic ideas
- solver3 architecture/enabling refactors
- benchmark/correctness observations worth following up on later

When an idea is promising but not pursued immediately, write it down there instead of losing it.

### 4. Incubate larger additions before judging them
If an experiment introduces a **substantial new mechanism**, do not immediately reject the underlying idea after one weak run.

Examples of substantial additions:
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

## What's Been Tried
- Cross-solver benchmark infrastructure, validation, and objective metric math are now in place.
- The remaining need is explicit solver3 orchestration over the shared harness.
- This setup makes the solver family explicit, keeps the benchmark contract fixed, and adds fixed-iteration + raw-runtime diagnostics for interpretation.
