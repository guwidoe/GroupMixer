# Solver4 Sections 6/7 evidence ledger

This note separates what is now supported by external evidence from what remains historically underspecified.

## Resolved by external evidence

### 1. Even-`p` Section 6 construction is pairwise

Supported by:
- `https://www.metalevel.at/sgp/golf_heuristic.pl`
- `https://www.metalevel.at/mst.pdf`
- `https://patatconference.org/patat2008/proceedings/Triska-HC3a.pdf`

Interpretation used in solver4:
- the heuristic branch traverses adjacent pair slots inside each group
- `p = 4` does **not** use the earlier whole-group shortcut

### 2. The GRASP outer loop is a five-start scheme

Supported by the thesis / PATAT text:
- initial configurations with `gamma = 0`, `0.1`, `0.2`, and two random values in `[0.3, 1]`
- one local-search try per initial configuration
- if unsolved, restart from the **initial configuration** whose run reached the fewest conflicts
- break ties toward smaller `gamma`

Interpretation used in solver4:
- the default `gamma = 0.0` run uses the documented portfolio directly
- a non-default API `gamma` overrides the first GRASP candidate for repo diagnostics, while the rest of the documented fixed values remain in place

### 3. "No improvement" is treated as no new best-so-far configuration

Supported indirectly by the thesis statement that the local search is based on Dotú/Hentenryck's Algorithm 6.2 and then simplified.

Interpretation used in solver4:
- the breakout counter resets only when a run finds a new incumbent best, or when the breakout itself is applied

## Still ambiguous in the historical sources

The public sources found so far do **not** expose the original C++ local-search implementation, so the following details remain underspecified.

### A. Exact lexicographic tie rule in local search

Paper wording:
- choose the swap leading to a configuration `C'` with minimal `f(C')`, breaking ties lexicographically

Chosen solver4 interpretation:
- compare the resulting configurations directly in flattened `(week, group, slot)` order
- only the positions changed by the competing swaps need to be compared

Why this choice:
- the paper phrases the tie-break over resulting configurations, not over swap coordinates
- this is more faithful than using incidental loop order

Locked by tests:
- `swap_candidate_outranks_by_resulting_configuration_lexicographic_order`
- `select_best_swap_uses_explicit_lexicographic_tie_breaking`

### B. Whether breakout swaps enter tabu memory

Paper wording:
- two random swaps are made after stagnation
- no explicit statement about tabu insertion

Chosen solver4 interpretation:
- both breakout swaps are recorded in the week-local tabu lists at the breakout iteration

Why this choice:
- the breakout performs real swaps in the current configuration
- recording them avoids immediate reversal and keeps tabu semantics consistent across realized moves

Locked by tests:
- `breakout_records_both_random_swaps_in_same_iteration_window`

### C. Exact magnitude of the Section 6 "large penalty"

Paper wording:
- subtract a "large number" from the selected pair's freedom in further weeks

Chosen solver4 interpretation:
- `PAPER_PAIR_REPEAT_PENALTY = 1_000_000`

Why this choice:
- it dominates raw-freedom differences on the accepted pure-SGP workloads
- it preserves the intended behavior that re-selecting an already chosen pair is strongly discouraged unless forced

Locked by tests:
- `greedy_constructor_applies_future_week_pair_penalty`
- `repeated_pair_penalty_outweighs_raw_freedom`

## Non-claim

Until the original C++ local-search source appears, solver4 should distinguish:
- behaviors backed by external evidence
- behaviors chosen as the most defensible interpretation of underspecified paper text

This ledger exists so solver4 can be strict about that distinction.