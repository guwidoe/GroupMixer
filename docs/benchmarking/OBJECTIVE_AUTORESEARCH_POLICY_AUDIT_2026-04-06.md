# Objective autoresearch policy audit (2026-04-06)

## Purpose

Audit the **current** objective autoresearch lane before overhaul.

This document is intentionally about the lane **as checked in before the new policy split**. It records where the current objective manifests still inherit fixture-era solver policy and where that inheritance makes the fixed-time objective lane weaker than it looks.

Audited manifests:

- `backend/benchmarking/suites/objective-canonical-representative-v1.yaml`
- `backend/benchmarking/suites/objective-canonical-adversarial-v1.yaml`
- `backend/benchmarking/suites/objective-canonical-stretch-v1.yaml`
- `backend/benchmarking/suites/correctness-edge-intertwined-v1.yaml`

## Executive summary

The current lane already gets some important things right:

- canonical case identity is explicit
- per-case `time_limit_seconds` and `max_iterations` are checked in
- the exact real Sailing Trip workload is included directly
- the correctness corpus is explicitly separated from the score-quality suite

But the **effective search policy is not consistently research-grade**.

The main problem is structural:

- suite entries override `max_iterations` and `time_limit_seconds`
- but they **inherit** case-level solver meta-policy such as:
  - `no_improvement_iterations`
  - `reheat_after_no_improvement`
  - `reheat_cycles`
  - seed omission vs explicit seed

That means the benchmark contract and the search-policy knobs are still entangled.

### High-level verdict

- **Acceptable today:** `stretch.sailing-trip-demo-real`
- **Useful but weak for fixed-time research:**
  - `representative.small-workshop-balanced`
  - `stretch.social-golfer-32x8x10`
  - `stretch.large-gender-immovable-110p`
- **Unacceptable as serious fixed-time objective evidence in current form:**
  - `representative.small-workshop-constrained`
  - `adversarial.constraint-heavy-partial-attendance`
  - `stretch.medium-multi-session`
- **Correctness corpus:** appropriate as a semantic guardrail bundle, but not as evidence about fixed-time objective quality

## Why this is happening

Current objective manifests set explicit suite-case budget overrides, e.g.:

- `max_iterations`
- `time_limit_seconds`

But they do **not** override inherited search-policy knobs from reused case manifests. As a result, some cases carry tiny fixture-era settings like:

- `no_improvement_iterations: 15`
- `no_improvement_iterations: 20`
- `no_improvement_iterations: 30`
- short reheat thresholds tied to those tiny limits

In practice, several “objective” cases stop after a few dozen iterations and well under a millisecond, even though the checked-in suite budget claims seconds of allowed search time.

## Audit method

For each case, this audit records:

- provenance / workload purpose
- declared suite budget
- current effective solver family and seed policy
- current effective `no_improvement_iterations`
- current effective reheat policy
- observed stop reason from a local audit run of the current manifests
- classification for research-grade **fixed-time** objective benchmarking

Observed stop reasons below come from a local run of the current manifests on 2026-04-06.

## Current canonical objective cases

| Case | Provenance / purpose | Suite budget | Effective seed policy | Solver family assumption | Effective `no_improvement_iterations` | Effective reheat policy | Observed stop behavior | Audit verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `representative.small-workshop-balanced` | checked-in representative workshop case; `objective_target.representative.balanced` | `5000 iters`, `2s` | explicit fixed seed (`101`) | solver1 (inherited from case input) | `None` | disabled (`reheat_after_no_improvement: 0`, `reheat_cycles: 0`) | `max_iterations_reached` at `5000` iterations in `~0.018s` | **Weak** — honest and deterministic, but the benchmark is effectively fixed-iteration smoke, not fixed-time research |
| `representative.small-workshop-constrained` | checked-in representative mixed-constraint case; `objective_target.representative.constraint_mix` | `8000 iters`, `3s` | explicit fixed seed (`102`) | solver1 | `20` | `reheat_after_no_improvement: 5`, `reheat_cycles: 1` | `no_improvement_limit_reached` after `32` iterations in `<0.001s` | **Unacceptable** — fixture-era no-improvement policy dominates the benchmark question |
| `adversarial.constraint-heavy-partial-attendance` | checked-in adversarial partial-attendance case; `objective_target.adversarial.partial_attendance_constraints` | `12000 iters`, `4s` | explicit fixed seed (`301`) | solver1 | `15` | `reheat_after_no_improvement: 5`, `reheat_cycles: 1` | `no_improvement_limit_reached` after `30` iterations in `~0.001s` | **Unacceptable** — effectively a smoke fixture, not meaningful fixed-time evidence |
| `stretch.medium-multi-session` | checked-in medium stretch case; `objective_target.stretch.medium_multi_session` | `20000 iters`, `6s` | explicit fixed seed (`201`) | solver1 | `30` | `reheat_after_no_improvement: 10`, `reheat_cycles: 1` | `no_improvement_limit_reached` after `75` iterations in `~0.001s` | **Unacceptable** — benchmark contract says 6s, effective policy behaves like a tiny fixture |
| `stretch.social-golfer-32x8x10` | canonical social-golfer workload reused from `backend/core/tests/test_cases/social_golfer_problem.json`; `objective_target.stretch.social_golfer_zero_repeat_encounters` | `400000 iters`, `25s` | explicit fixed seed (`320810`) | solver1 | `1000000` | unspecified / default (`None`) | `max_iterations_reached` at `400000` iterations in `~1.107s` | **Weak** — serious search effort exists, but current contract is still effectively fixed-iteration rather than fixed-time |
| `stretch.large-gender-immovable-110p` | canonical heterogeneous large case reused from `backend/core/tests/test_cases/benchmark_large_gender_immovable.json`; `objective_target.stretch.large_heterogeneous_attribute_balance_and_immovable` | `100000 iters`, `12s` | explicit fixed seed (`110115`) | solver1 | `None` | unspecified / default (`None`) | `max_iterations_reached` at `100000` iterations in `~0.969s` | **Weak** — more meaningful than the tiny fixtures, but still not behaving like a fixed-time lane |
| `stretch.sailing-trip-demo-real` | exact anonymized demo workload; `objective_target.stretch.real_sailing_trip_raw_case` | `1000000 iters`, `15s` | runtime-generated seed in current case (`effective_seed` observed, case omits explicit seed) | solver1 | `500000` | disabled (`reheat_after_no_improvement: 0`, `reheat_cycles: 0`) | `time_limit_reached` in `~15.003s` after `254007` iterations | **Acceptable** for fixed-time research shape, but seed policy should become explicit as part of the contract |

## Current correctness corpus cases

These are not the primary objective-quality evidence. They are included here because the current objective autoresearch script runs them on every experiment.

| Case | Purpose | Suite budget | Effective seed policy | Effective `no_improvement_iterations` | Observed stop behavior | Audit verdict |
| --- | --- | --- | --- | --- | --- | --- |
| `adversarial.correctness-hard-constraints-stress` | intertwined hard-constraint correctness stress | `6000 iters`, `2s` | runtime-generated | `None` | `max_iterations_reached` at `6000` iterations in `~0.020s` | Correct for a semantic guardrail lane; not intended as fixed-time objective evidence |
| `adversarial.correctness-late-arrivals-early-departures` | partial-participation correctness stress | `8000 iters`, `3s` | runtime-generated | `None` | `max_iterations_reached` at `8000` iterations in `~0.018s` | Correct for a semantic guardrail lane; not intended as fixed-time objective evidence |
| `adversarial.correctness-session-aware-group-capacities` | session/group-capacity correctness stress | `3000 iters`, `2s` | runtime-generated | `None` | `max_iterations_reached` at `3000` iterations in `~0.008s` | Correct for a semantic guardrail lane; not intended as fixed-time objective evidence |
| `adversarial.correctness-session-specific-constraints` | session-window correctness stress | `3000 iters`, `2s` | runtime-generated | `None` | `max_iterations_reached` at `3000` iterations in `~0.010s` | Correct for a semantic guardrail lane; not intended as fixed-time objective evidence |

## Concrete problems exposed by this audit

### 1. Several “fixed-time” objective cases are not really fixed-time

Three canonical objective cases stop almost immediately because inherited fixture-era no-improvement policy dominates:

- `representative.small-workshop-constrained`
- `adversarial.constraint-heavy-partial-attendance`
- `stretch.medium-multi-session`

This makes the current lane look broad while actually collecting almost no search evidence on those workloads.

### 2. Some stronger cases are still effectively fixed-iteration

These cases do real work, but the checked-in max-iteration caps dominate the outcome instead of the time budget:

- `representative.small-workshop-balanced`
- `stretch.social-golfer-32x8x10`
- `stretch.large-gender-immovable-110p`

That is useful diagnostic information, but it is not the same thing as a research-grade fixed-time primary lane.

### 3. Seed policy is inconsistent across the lane

Some cases use explicit fixed seeds, while others rely on runtime-generated seeds.

That inconsistency should be moved out of case accident/history and into an explicit benchmark-contract policy.

### 4. The benchmark contract and the tunable search policy are still mixed together

Today, the lane uses:

- suite overrides for `time_limit_seconds` and `max_iterations`
- inherited case policy for `no_improvement_iterations`, reheat behavior, and some seed choices

That is exactly the boundary confusion the overhaul needs to eliminate.

## Required follow-on changes

This audit implies the following implementation work:

1. **Strengthen the checks lane** so objective experiments are guarded by broad `gm-core` correctness surfaces.
2. **Separate benchmark contract from metaheuristic policy** so canonical workload identity / budget stay stable while search-policy knobs remain tunable.
3. **Rebuild the fixed-time canonical lane** so effective search effort is serious across the whole bundle.
4. **Add a fixed-iteration diagnostic companion lane** so policy gains can be interpreted separately from throughput effects.
5. **Write an explicit decision policy** that says how fixed-time, fixed-iteration, raw perf, and correctness evidence combine.

## Bottom line

The current objective autoresearch lane is a useful supervised starting point, but this audit confirms it is **not yet a trustworthy research-grade fixed-time objective harness**.

The main issue is not that the cases are wrong.
The main issue is that the lane still inherits too much old fixture-era search policy from reused case manifests.
