# Solver4 paper conformance gate

`solver4` is intended to be judged against the Triska/Musliu paper's anchor instances, not only by code-shape similarity.

## Anchor mapping used in this repo

- **5-3-7** → `backend/benchmarking/cases/stretch/kirkman_schoolgirls_15x5x7.json`
- **8-4-9** → `backend/benchmarking/cases/stretch/social_golfer_32x8x9.json`
  - helper case
  - `canonical_case_id: stretch.social-golfer-32x8x10`
- **8-4-10** → `backend/benchmarking/cases/stretch/social_golfer_32x8x10.json`

## Conformance suite

- `backend/benchmarking/suites/solver4-paper-anchor-conformance.yaml`

This suite contains:
- a **gamma = 0** multiseed sweep for all three anchors
- a small **gamma sweep** (`0.05`, `0.1`, `0.2`) on a reference seed for all three anchors

## Acceptance gate before claiming behavioral paper fidelity

1. **External validation must pass** on every case in the suite.
2. Under the paper-style budgets in the suite:
   - the **5-3-7** anchor should solve
   - the **8-4-9** anchor should solve
3. `8-4-10` remains a meaningful stretch diagnostic, but failure there does not by itself prove the Sections 6/7 implementation is wrong.
4. If any solver4 search change claims improved faithfulness, rerun this suite first.

## Why this gate exists

The paper's strongest practical claim is not only that the heuristic is "paper-shaped", but that the randomized greedy initializer plus the Section 7 local search solve the small anchor instances reliably and quickly. This suite is the repo's explicit checkpoint for that claim.
