# solver5 construction research helpers

This directory holds **in-repo research tooling** used to derive or validate honest constructive families before they are promoted into `backend/core/src/solver5/**`.

Current focus:
- `RGDD(20,4,2)` / exact `20-4-26`

Files:
- `rgdd20_group_search.py` — projected-group semicyclic CP-SAT search on 40 size-2 groups modeled as `(Z13 × Z3) ∪ {∞}`; optionally accepts a forced week-0 starter block like `0,13,26,39`
- `rgdd20_group_search_param.py` — older parameterized variant for probing forced starter blocks
- `rgdd20_group_search_two_forced.py` — probes the branch where both week-0 infinity blocks are forced
- `rgdd20_scan_second_infinity_orbits.py` — scans normalized one-per-layer second infinity-block orbit representatives against the fixed vertical first block
- `rgdd20_group_search_single_week_twice.py` — stricter ansatz: search for one starter orbit whose pair-orbit counts are all exactly `2`, so duplicating it would meet the projected total `4`
- `rgdd20_scan_single_week_twice_infinity_orbits.py` — scans normalized infinity-block orbit representatives for the doubled-single-starter ansatz
- `rgdd20_scan_single_week_twice_second_infinity.py` — for a fixed first infinity block in the doubled-single-starter ansatz, scans normalized second infinity-block reps
- `summarize_second_infinity_scans.py` — quick local summary helper for the accumulated second-block scan logs
- `rgdd20_label_solver.py` — given a projected-group candidate, attempts the binary label lift back to 80 players
- `frame3_13_search.py` — probes a cyclic week-0 starter for a `4`-frame of type `3^13`; useful because the Cao–Ma 2011 `(4,2)`-SRGDD existence proof for type `2^40` reduces through `SF(6^13)` to this smaller ingredient
- `frame3_13_scan_first_blocks.py` — scans normalized forced first-block representatives for the cyclic `4`-frame type `3^13` model

These are derivation aids only. They are **not** product behavior and must not be treated as benchmark-facing shortcuts.
