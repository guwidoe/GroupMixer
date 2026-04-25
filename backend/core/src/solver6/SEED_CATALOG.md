# Solver6 Progressive Incumbent Cache

This document defines the explicit on-disk cache for `solver6`.

Despite the historical filename, this is no longer a seed catalog. The cache stores
**solver6 incumbents**: schedules after seed construction and any completed portion of
local search.

## Purpose

Solver6 is a pure-SGP engine. For a fixed pure-SGP shape, repeated runs should be able
to reuse the best schedule already found and spend new work improving it instead of
rebuilding the same seed every time.

The cache exists to make that behavior explicit, inspectable, and low-dimensional.
It is not a webapp/API feature and it is not a second result database alongside a seed
cache. There is one solver6 cache.

## Cache identity

A cache entry is keyed only by:

- `cache_policy_version`
- `num_groups`
- `group_size`
- `num_weeks`

Do **not** include these in the key:

- effective seed
- seed strategy
- search strategy
- pair-repeat penalty model
- objective/constraint spelling
- per-call seed timeout
- per-call local-search timeout

Those values may be useful provenance or execution parameters, but they are not the
identity of a pure-SGP solver6 incumbent. For solver6, one `(groups, group_size,
weeks)` shape maps to one progressively improving incumbent under a cache policy
version.

## What is stored

The cache stores:

- schema and policy version metadata
- the pure-SGP shape key
- the internal schedule as `Vec<Vec<Vec<usize>>>`
- pair-frequency metrics recomputed from the schedule
- an incumbent status
- provenance/debug metadata such as generator version, optional git commit, update
  counts, and runtime observations

The cache stores schedules, not full public `SolverResult` values. Public scoring or
contract projection, where needed, belongs at the boundary that consumes the native
solver6 schedule.

## Incumbent status

A cached incumbent has one of these statuses:

- `search_timed_out` — local search stopped because the per-call local-search budget
  expired. The schedule is valid and should be resumed on a later call.
- `locally_optimal` — the configured deterministic local search found no improving
  move from this incumbent.
- `known_optimal` — solver6 reached a proven/known optimum, such as exact solver5
  handoff or a lower-bound-tight repeat objective.

Completeness ordering is:

```text
search_timed_out < locally_optimal < known_optimal
```

For equal quality, a more complete status may replace a less complete status. A worse
incumbent must not replace a better cached incumbent.

## Runtime semantics

When solver6 runs with the cache enabled:

1. Validate and normalize the pure-SGP shape.
2. Build the cache key from `policy/g/p/w`.
3. If a cache entry with `locally_optimal` or `known_optimal` exists, return it
   immediately.
4. If a cache entry with `search_timed_out` exists, resume local search from the
   cached schedule.
5. If there is no entry, build a fresh seed.
6. If seed construction exceeds `seed_time_limit_seconds`, fail explicitly and do not
   write a cache entry.
7. Run local search under `local_search_time_limit_seconds`.
8. Save the best incumbent:
   - timeout => `search_timed_out`
   - local optimum => `locally_optimal`
   - proven optimum => `known_optimal`
9. Return the same incumbent that was saved or accepted from cache.

A local-search timeout is therefore a successful incumbent-producing result. A seed
timeout is not: without a seed or cached incumbent, there is no honest schedule to
return.

## Validation and invalidation

Cache loading must be explicit and defensive:

- `schema_version` must match `SOLVER6_CACHE_SCHEMA_VERSION`
- `cache_policy_version` must match `SOLVER6_CACHE_POLICY_VERSION`
- schedule shape must match `(g,p,w)` exactly
- participants must form full weekly partitions
- stored metrics must match metrics recomputed from the stored schedule

Stale or corrupt entries are rejected explicitly. They are not silently repaired or
used as seeds.

Bump `SOLVER6_CACHE_SCHEMA_VERSION` when the JSON shape changes. Bump
`SOLVER6_CACHE_POLICY_VERSION` when the semantics of the incumbent, objective,
validation, local-search neighborhood, or status interpretation changes enough that
old incumbents should no longer be trusted as the canonical cache line for a shape.

## Reporting expectations

Solver6 reporting should make cache behavior visible. Useful statuses include:

- cache disabled
- cache miss
- complete cache hit
- incomplete cache hit resumed
- cache updated
- cache update skipped because the existing incumbent was better

This keeps cache effects inspectable and prevents hidden benchmark shortcuts.
