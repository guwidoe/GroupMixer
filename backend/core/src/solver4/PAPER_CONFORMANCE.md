# Solver4 paper conformance gate

`solver4` is judged against the Triska/Musliu paper by **behavior** on anchor instances, not only by code shape.

## Anchor mapping used in this repo

- **5-3-7** → `backend/benchmarking/cases/stretch/kirkman_schoolgirls_15x5x7.json`
- **8-4-9** → `backend/benchmarking/cases/stretch/social_golfer_32x8x9.json`
  - helper case
  - `canonical_case_id: stretch.social-golfer-32x8x10`
- **8-4-10** → `backend/benchmarking/cases/stretch/social_golfer_32x8x10.json`

## Required suites

### Section 5 complete-search anchors

- `backend/benchmarking/suites/solver4-section5-paper-anchors.yaml`

This suite checks the complete-backtracking branch on the paper's cited pattern results:

- `5-3-7` with pattern `3`
- `8-4-9` with pattern `2-2`
- `8-4-9` with pattern `4`

### Sections 6/7 local-search anchors

- `backend/benchmarking/suites/solver4-paper-anchor-conformance.yaml`

This suite checks the randomized greedy + local-search branch with:

- a `gamma = 0` multiseed sweep
- a small gamma sweep (`0.05`, `0.1`, `0.2`)
- solver4 paper-trace diagnostics enabled for trajectory inspection

## Acceptance gate before claiming paper completeness

1. **External validation must pass** on every case in both suites.
2. **Section 5 branch** must solve its anchor obligations:
   - `5-3-7` with pattern `3`
   - `8-4-9` with pattern `2-2` and/or `4`
3. **Sections 6/7 branch** must solve:
   - `5-3-7`
   - `8-4-9`
4. `8-4-10` remains a meaningful stretch diagnostic for the Sections 6/7 path.
5. If any solver4 change claims improved paper fidelity, rerun the relevant suite(s) first.

## Why this gate exists

The paper makes two distinct algorithmic claims:

- the **Section 5** freedom-guided complete search matches strong exact-search anchor results
- the **Sections 6/7** greedy initializer + tabu local search changes the search trajectory enough to solve anchors that plain local search misses

`solver4` should not be described as paper-complete unless both claims are supported by benchmark evidence.
