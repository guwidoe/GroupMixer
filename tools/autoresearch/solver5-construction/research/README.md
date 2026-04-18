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
- `rgdd20_label_solver.py` — given a projected-group candidate, attempts the binary label lift back to 80 players

These are derivation aids only. They are **not** product behavior and must not be treated as benchmark-facing shortcuts.
