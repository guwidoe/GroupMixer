# solver3 SGP-specialized mode capability-gating policy

This note turns `SGP_MODE_SEMANTICS_AUDIT.md` into concrete normalization-time behavior.

## Rule shape

`solver3` advanced SGP-shaped modes must land in one of three buckets:

- **supported** — mode is intentionally exposed as-is
- **narrowed / experimental** — mode is exposed, but only under explicit assumptions
- **unsupported** — normalization must fail explicitly; no silent fallback to baseline mode

Gating belongs in:
- config validation for basic parameter sanity
- `SearchRunContext::from_solver(...)` for scenario / move-policy compatibility
- docs / benchmark manifests for user-facing expectations

It does **not** belong in deep hot-path runtime branches.

---

## Implemented normalization-time policy

## 1. `local_improver.mode = sgp_week_pair_tabu`
Status: **narrowed / experimental**

Allowed when:
- a `repeat_encounter` constraint is present
- `move_policy` still allows `swap`

Explicit failure when:
- no `repeat_encounter` constraint exists
- `move_policy` forbids `swap`

Why:
- the memory is search-side and semantically honest,
- but the mechanism is still SGP-shaped and only meaningful when swap corridors and repeat structure are present.

## 2. `search_driver.mode = steady_state_memetic`
Status: **narrowed / experimental**

Allowed when:
- `move_policy` allows `swap`
- there are no active cliques / `must_stay_together` constraints in the compiled problem

Explicit failure when:
- `move_policy` forbids `swap`
- compiled problem contains cliques

Why:
- v1 mutation is several same-session swaps, so swap access is mandatory
- clique-heavy scenarios would make the current swap-only mutation dishonest or nearly vacuous

## 3. `search_driver.mode = steady_state_memetic` with `local_improver.mode = sgp_week_pair_tabu`
Status: **narrowed / experimental**

Allowed when both prior gates pass:
- memetic swap-only mutation gate passes
- tabu repeat-encounter gate passes

This combination is architecturally supported, but should remain explicitly experimental until benchmark evidence justifies wider rollout.

---

## Not yet implemented as hard gates

These remain policy guidance, but are not yet enforced by stronger structural detection:

- partial attendance: allowed, but still considered narrowed
- immovables: allowed, but still considered narrowed
- attribute-balance-heavy / pair-meeting-heavy / soft together-apart dominant scenarios: allowed for now, but still not marketed as general improvements
- transfer-dominant workloads: not hard-detected yet; manifests/docs should avoid presenting swap-specialized advanced modes as the default answer there

Reason:
- these are effectiveness and search-geometry concerns,
- but they are not yet crisply detectable from one cheap normalization predicate without overreaching.

---

## Product behavior requirements

1. **No silent downgrade**
   - if a user asks for `steady_state_memetic` or `sgp_week_pair_tabu` and the gate fails, return a validation error
   - do not silently switch to `single_state + record_to_record`

2. **Benchmark honesty**
   - manifests using advanced SGP modes should say they are experimental / SGP-shaped
   - benchmark comparisons should not describe them as general solver3 upgrades

3. **Future expansion**
   - if later memetic mutation grows transfer/clique-aware variants, extend the gate accordingly
   - if conflict-position restriction lands, it should get an even stricter repeat-conflict gate than week-pair tabu
