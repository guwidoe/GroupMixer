# Correctness edge-case corpus (v1)

## Status

Initial intertwined-constraints correctness corpus is now checked in as a dedicated benchmark suite.

Suite manifest:

- `backend/benchmarking/suites/correctness-edge-intertwined-v1.yaml`

## Scope and intent

This corpus is intentionally **separate** from the canonical objective score-quality suite.

- Use it to stress correctness semantics and invariant behavior under intertwined constraints.
- Do **not** treat it as canonical objective keep/discard evidence.
- Canonical objective benchmarking remains the three-manifest bundle documented in `docs/benchmarking/OBJECTIVE_CASE_PORTFOLIO.md`.

This suite declares:

- `comparison_category: invariant_only`
- `case_selection_policy: allow_non_canonical`

That configuration is deliberate: this lane is a correctness corpus, not the canonical objective score-quality target.

## Case inventory

| Case id | Benchmark manifest | Reused source | Intertwined stress focus |
| --- | --- | --- | --- |
| `adversarial.correctness-hard-constraints-stress` | `backend/benchmarking/cases/adversarial/correctness_hard_constraints_stress.json` | `backend/core/tests/test_cases/hard_constraints_stress_test.json` | Must/should-not/immovable interactions under multi-session pressure |
| `adversarial.correctness-late-arrivals-early-departures` | `backend/benchmarking/cases/adversarial/correctness_late_arrivals_early_departures.json` | `backend/core/tests/test_cases/late_arrivals_early_departures_test.json` | Partial participation + session scoping + immovable anchors |
| `adversarial.correctness-session-aware-group-capacities` | `backend/benchmarking/cases/adversarial/correctness_session_aware_group_capacities.json` | `backend/core/tests/test_cases/session_aware_group_capacities.json` | Tight per-session capacities with availability asymmetry |
| `adversarial.correctness-session-specific-constraints` | `backend/benchmarking/cases/adversarial/correctness_session_specific_constraints.json` | `backend/core/tests/test_cases/session_specific_constraints_test.json` | Overlapping session windows for must/should-not constraints |

## Run command

```bash
gm-cli benchmark run --manifest backend/benchmarking/suites/correctness-edge-intertwined-v1.yaml
```

Use this lane alongside semantic tests when changes touch constraint semantics, participation accounting, or session-scoped assignment logic.
