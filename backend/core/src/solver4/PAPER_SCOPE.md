# Solver4 paper scope

## Decision

`solver4` currently represents the **Sections 6 and 7** branch of the Triska/Musliu paper:

- randomized greedy initial configurations
- conflict-position local search
- week-local swapped-player tabu memory
- random-swap breakout after stagnation

It **does not yet implement Section 5** complete backtracking / pattern search.

## Why this is explicit

The paper contains two distinct algorithmic tracks:

1. **Section 5**: complete backtracking guided by minimal freedom, with pattern-based set selection such as `3`, `2-2`, `4`, and `3-2-2-1`
2. **Sections 6 and 7**: randomized greedy initialization plus local search using conflict positions

The current Rust `solver4` codebase only implements the second track. Therefore:

- it is valid to describe solver4 as **paper-shaped Sections 6/7 local search**
- it is **not** valid to describe solver4 as a full implementation of the entire paper
- claims about the paper's Section 5 results (for example the complete-search `5-3-7` and `8-4-9` timings) require either:
  - a future Section 5 implementation in solver4, or
  - explicit wording that those numbers are paper reference anchors rather than current solver4 guarantees

## Future extension point

If we later choose to make solver4 paper-complete, the next addition should be an explicit Section 5 mode instead of silently broadening the existing Sections 6/7 search path.
