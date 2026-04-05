# Objective case portfolio (v1)

## Status

Initial canonical objective suite shape and budget policy are now checked in.

This is the **first concrete shape**, not a claim that every future objective lane dependency is already solved.

## Canonical objective suite shape

The current runner enforces one `class` per suite manifest. Because objective research must stay heterogeneous, canonical objective suite v1 is defined as a **bundle of class-specific canonical manifests**:

- `backend/benchmarking/suites/objective-canonical-representative-v1.yaml`
- `backend/benchmarking/suites/objective-canonical-adversarial-v1.yaml`
- `backend/benchmarking/suites/objective-canonical-stretch-v1.yaml`

Together, those three manifests are the canonical objective suite shape for v1.

## Required metadata for canonical objective entries

For every case entry in the v1 objective manifests, the following metadata is required and must be checked in:

- `case_role: canonical`
- `purpose` (machine-readable benchmark intent)
- `provenance` (where the case came from / why it is trustworthy)
- `declared_budget` (must include at least one hard budget limit)
- effective run budget override fields (`max_iterations` and/or `time_limit_seconds`) so execution budget is explicit in the manifest itself

Policy intent: objective benchmarking should never rely on implicit defaults for case identity or budget semantics.

## Per-case budget policy (v1)

Budgets are **per-case research parameters**, not one global constant. The v1 manifests encode explicit per-case limits:

- representative.small-workshop-balanced
  - `max_iterations: 5000`
  - `time_limit_seconds: 2`
- representative.small-workshop-constrained
  - `max_iterations: 8000`
  - `time_limit_seconds: 3`
- adversarial.constraint-heavy-partial-attendance
  - `max_iterations: 12000`
  - `time_limit_seconds: 4`
- stretch.medium-multi-session
  - `max_iterations: 20000`
  - `time_limit_seconds: 6`
- stretch.sailing-trip-demo-real
  - `max_iterations: 1000000`
  - `time_limit_seconds: 15`

These values are the v1 baseline policy. Future changes must be explicit manifest edits with rationale.

## Full-suite-every-experiment rule

For objective autoresearch, **every experiment must run the full v1 bundle**:

1. `objective-canonical-representative-v1`
2. `objective-canonical-adversarial-v1`
3. `objective-canonical-stretch-v1`

No single-manifest subset may be used as keep/discard evidence for objective-lane claims. Subsets are diagnostics only.

## Sailing Trip solver3 truth boundary

The stretch v1 manifest includes the exact raw canonical case:

- `backend/benchmarking/cases/stretch/sailing_trip_demo_real.json`

This does **not** claim that the exact raw-case solver3 path is already solved. The v1 shape keeps the raw case explicit while preserving the existing truthfulness boundary:

- helper benchmark-start cases remain helper-only
- objective-lane claims must not substitute helper/proxy cases for the raw canonical case
- solver3 raw-case go-live remains blocked until that path is genuinely runnable as itself
