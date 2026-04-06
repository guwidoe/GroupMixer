# Objective research decision policy

## Purpose

This document defines how to interpret the separated objective-research lanes so keep/discard decisions are not made ad hoc.

The lanes are intentionally different:

- **fixed-time primary lane** = user-facing objective truth
- **fixed-iteration diagnostic lane** = quality-per-unit-of-search diagnostic
- **raw runtime / hotpath lanes** = throughput diagnostic
- **correctness guardrails** = hard safety blockers

## Primary keep/discard metric

The primary keep/discard signal is:

- **fixed-time objective quality on a stable machine**

Concretely, for the current checked-in primary lane that means the result from:

- `tools/autoresearch/objective-quality/autoresearch.sh`
- judged primarily by `objective_suite_weighted_normalized_score` (lower is better)
- with the explicit math declared in `tools/autoresearch/objective-quality/fixed-time-metric-config.json`

This is the main truth because real users experience the solver under wall-clock budgets.

## Hard blockers

Any of the following is an automatic reject until fixed:

- `tools/autoresearch/objective-quality/autoresearch.checks.sh` fails
- `cargo test` guardrails added to that checks lane fail
- benchmark external validation reports any failure
- benchmark total-score agreement fails
- benchmark score-breakdown agreement fails
- a canonical case fails to run honestly
- helper/proxy contamination breaks canonical-suite rules

A correctness failure means the experiment is not trustworthy, even if objective score appears better.

## Role of each lane

### 1. Fixed-time primary lane

Use this to answer:

> Did the candidate actually improve objective quality under the real checked-in wall-clock budgets?

This lane decides keep/discard unless a hard blocker fires.

### 2. Fixed-iteration diagnostic lane

Use this to answer:

> Did the candidate improve objective quality for a fixed amount of search work, independent of throughput?

This lane is diagnostic only.
It explains *why* fixed-time changed.
It does not overrule the fixed-time primary lane by itself.

### 3. Raw runtime / hotpath lanes

Use these to answer:

> Did throughput improve or regress, and where?

Examples:

- repo-root raw runtime lane (`./autoresearch.sh` at repo root)
- large search-iteration / hotpath benchmark suites

These lanes are required diagnostics when interpreting fixed-time changes, but they are not the primary objective-quality truth.

## Decision matrix

| Situation | Interpretation | Default action |
| --- | --- | --- |
| fixed-time **win**, correctness green, diagnostics broadly consistent | the candidate improved the real objective under the actual budget | **keep** |
| fixed-time **loss**, even if fixed-iteration or raw perf win | the candidate did not improve the real user-facing budgeted outcome | **discard** |
| correctness failure or external validation failure | evidence is invalid | **reject / fix first** |
| fixed-time win + fixed-iteration win | both policy quality and practical budget outcome improved | **keep** |
| fixed-time win + fixed-iteration flat/loss + raw perf win | likely a throughput-driven win; still valid if fixed-time win is real | **usually keep**, but record that the gain came from speed more than search quality |
| fixed-time win + fixed-iteration win + raw perf regression | likely a quality-per-search win overcame throughput loss | **usually keep** if the fixed-time win is stable and the throughput loss is not catastrophic |
| fixed-time flat/loss + fixed-iteration win | better quality per search step did not translate into better real budgeted outcome | **discard or iterate**, do not keep on diagnostic evidence alone |
| fixed-time win + raw perf regression + fixed-iteration flat/loss | practical win exists but may be fragile; likely the budget/case mix still favors it today | **rerun and inspect** before keep |
| raw perf win + fixed-time flat | speed improved without proven user-facing objective gain on canonical budgets | **do not keep for the objective lane alone**; may still matter for the raw-perf lane |
| fixed-time win + correctness failure | invalid result | **reject** |

## How to interpret mixed outcomes

### Fixed-time win + fixed-iteration loss

Interpretation:

- the change probably improved throughput or wall-clock efficiency more than search quality per iteration
- the practical result may still be valid and useful

Action:

- keep **only if** the fixed-time win is stable on rerun and correctness is clean
- record that the gain is throughput-driven, not a quality-per-search improvement

### Fixed-iteration win + fixed-time loss

Interpretation:

- the search policy may be better per iteration, but overall throughput got worse enough that the user-facing budget lost

Action:

- discard for the objective lane
- optionally keep exploring if you want to recover throughput in a follow-up change

### Objective win + raw perf regression

Interpretation:

- a search-quality gain may have outweighed a throughput loss
- or the regression may be in a hotpath that matters less for this lane's case mix

Action:

- rerun fixed-time and raw-perf diagnostics
- keep only if the fixed-time win survives reruns and the throughput regression is not severe enough to threaten nearby budgets

### Objective win + correctness failure

Interpretation:

- the result is not trustworthy

Action:

- reject immediately

## Rerun policy

Reruns are required when any of the following is true:

- the fixed-time score delta is small enough that normal same-machine noise could explain it
- the machine was visibly busy or thermally/load noisy during the run
- fixed-time and diagnostic lanes disagree in a way that could plausibly be measurement noise
- only one case moved meaningfully while the suite total barely changed
- a raw-perf regression or gain looks suspiciously large relative to the changed code

Practical rule:

- if the result is borderline, rerun the primary fixed-time lane first
- if the disagreement is about *why* the primary lane moved, rerun the fixed-iteration or raw-perf diagnostics next
- do not keep borderline improvements on a single noisy run

## Recording expectation

When summarizing an experiment, record all four perspectives explicitly:

1. fixed-time primary result
2. fixed-iteration diagnostic result
3. raw runtime / hotpath diagnostic result
4. correctness / validation outcome

That makes future interpretation durable and prevents selective reporting.

## Bottom line

The fixed-time primary lane decides.
The fixed-iteration and raw-perf lanes explain.
Correctness guardrails veto everything.
