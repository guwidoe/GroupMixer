# Benchmark Truthfulness Audit

## Status

Current-state audit for the benchmark inventory before canonical/helper enforcement lands in the runner.

## Purpose

Classify the existing benchmark inventory by benchmark truth role so canonical target cases do not get confused with helper, derived, or probe artifacts.

This audit is intentionally strict:

- if a case is the exact benchmark/testing target, it is **canonical**
- if a case changes the benchmark question to help execution or comparability, it is **not canonical**
- helper/probe cases may still be valuable, but they must not answer the canonical target question by accident

## Case-role classification

### Canonical full-solve cases

These currently represent their own benchmark question honestly as checked-in cases:

- `backend/benchmarking/cases/representative/small_workshop_balanced.json`
- `backend/benchmarking/cases/representative/small_workshop_constrained.json`
- `backend/benchmarking/cases/adversarial/constraint_heavy_partial_attendance.json`
- `backend/benchmarking/cases/stretch/medium_multi_session.json`
- `backend/benchmarking/cases/stretch/sailing_trip_demo_real.json`

### Derived / non-canonical full-solve cases

These are legitimate artifacts, but they are not the exact target problem they might remind a reader of:

- `backend/benchmarking/cases/stretch/sailing_trip_feature_dense.json`
  - role: **derived**
  - meaning: sailing-trip-derived stretch workload
  - not the exact real Sailing Trip demo case

### Helper full-solve cases

These preserve the real problem but change the start-state semantics to answer a different question:

- `backend/benchmarking/cases/stretch/sailing_trip_demo_real_benchmark_start.json`
  - role: **helper / benchmark_start**
  - meaning: exact real problem plus a shared deterministic initial schedule for cross-solver comparability
  - valid as a diagnostic/comparative helper
  - **not** valid as the canonical objective target

### Hotpath probe cases

These are deterministic probe fixtures, not canonical full-solve targets:

- all files under `backend/benchmarking/cases/hotpath/`
  - role: **probe/helper**
  - meaning: deterministic micro/meso benchmark inputs for hotpath or search-iteration measurement

### Path benchmark cases

These are semantic path fixtures, not objective-quality target cases:

- all files under `backend/benchmarking/cases/path/`
  - role: **semantic regression fixtures**
  - meaning: narrow behavior checks, not canonical objective targets

## Suite classification

### Canonical-safe full-solve suites today

These suites currently point at cases that represent their stated benchmark question honestly:

- `backend/benchmarking/suites/representative.yaml`
- `backend/benchmarking/suites/adversarial.yaml`

### Legacy mixed / non-canonical full-solve suites

These suites are still useful, but should not be treated as a canonical objective portfolio without explicit qualification:

- `backend/benchmarking/suites/stretch.yaml`
  - includes `sailing_trip_feature_dense.json`
  - therefore includes a **derived** sailing workload, not the exact real demo target

### Helper-contaminated real-demo full-solve suites

These suites currently use the helper benchmark-start case for the main run:

- `backend/benchmarking/suites/stretch-sailing-trip-demo-time-solver1-canonical.yaml`
- `backend/benchmarking/suites/stretch-sailing-trip-demo-time-solver3-canonical.yaml`
- `backend/benchmarking/suites/stretch-sailing-trip-demo-time-solver1-tuned.yaml`
- `backend/benchmarking/suites/stretch-sailing-trip-demo-time-solver3-tuned.yaml`
- `backend/benchmarking/suites/stretch-sailing-trip-demo-iterations-solver1-canonical.yaml`
- `backend/benchmarking/suites/stretch-sailing-trip-demo-iterations-solver3-canonical.yaml`
- `backend/benchmarking/suites/stretch-sailing-trip-demo-iterations-solver1-tuned.yaml`
- `backend/benchmarking/suites/stretch-sailing-trip-demo-iterations-solver3-tuned.yaml`

Current classification:

- role: **diagnostic comparative suites**
- status: **blocked from canonical objective-suite use** until `TODO-698000aa` is complete
- reason: they answer a shared-start-state comparison question, not the exact raw-case objective target question

### Hotpath suites

All hotpath suites are legitimate probe suites, but they are not canonical objective suites.

That includes the Sailing Trip hotpath/search suites:

- `backend/benchmarking/suites/hotpath-search-iteration-sailing-trip-demo-solver3.yaml`
- `backend/benchmarking/suites/hotpath-swap-preview-sailing-trip-demo-solver3.yaml`
- `backend/benchmarking/suites/hotpath-swap-apply-sailing-trip-demo-solver3.yaml`
- `backend/benchmarking/suites/hotpath-transfer-preview-sailing-trip-demo-solver3.yaml`
- `backend/benchmarking/suites/hotpath-transfer-apply-sailing-trip-demo-solver3.yaml`
- `backend/benchmarking/suites/hotpath-clique-swap-preview-sailing-trip-demo-solver3.yaml`
- `backend/benchmarking/suites/hotpath-clique-swap-apply-sailing-trip-demo-solver3.yaml`

## Operational conclusion

Before runner enforcement lands, contributors should follow this manual rule set:

1. `sailing_trip_demo_real.json` is the canonical real-demo target case.
2. `sailing_trip_demo_real_benchmark_start.json` is helper-only.
3. the current Sailing Trip full-solve suites are comparative/helper suites, not canonical objective suites.
4. `sailing_trip_feature_dense.json` remains a derived stretch workload, not the real demo target.
5. hotpath/path fixtures are never to be presented as objective target answers.

## Immediate blocked claims

Until the truthfulness-enforcement work is complete, the repo should **not** claim that the checked-in Sailing Trip full-solve suites are the canonical objective benchmark for solver-quality research.

Those suites remain useful for:

- same-start-state comparison
- search-policy comparison
- controlled comparative diagnostics

But they are blocked from the future canonical objective autoresearch lane until the exact raw-case path is genuinely runnable as itself.
