# Solver3 relabeling projection autoresearch ideas backlog

## Symmetry-breaking directions

- User explicitly expects major rewrites, not micro-optimizations: treat the existing atoms/relabeling logic as vague scaffolding that should be replaced by a factor/component reconciliation model.
- Replace greedy atom acceptance with a bounded beam/backtracking solver over typed factors. State should be partial bijections for oracle people, oracle sessions, and oracle `(session, group)` slots; internal mapping contradictions remain hard rejects.
- Score factors as a weighted CSP/Max-SAT objective: accepted compatible factors earn structure/contact rewards; uncovered factors add finite hard/soft costs; raw scenario-hard violations are tradeable repair costs, not proof of final infeasibility. The relabeler is not required to output a feasible schedule.
- Build informative connected components first: combine immovable triples, cliques, hard-apart edges, pair-meeting factors, attribute group-slot factors, non-uniform attendance, and capacity asymmetry into factor components before exploring weak symmetric factors.
- Treat isolated low-information immovables as lazy relational hints, not global anchors. Lone `ImmovablePerson` atoms currently overgenerate; only promote them when coupled to session/group/constraint structure.
- Represent session relabeling explicitly. For SGP-like shapes, oracle session labels are symmetric unless attendance/capacity/session-scoped constraints remove that symmetry.
- Represent group relabeling as per-real-session slot assignment, not stable global group IDs. Group IDs are official labels consumed by constraints; constructed buckets are symmetric until constraints bind them.
- Use exact assignment subproblems where natural: per-session group-slot assignment for attribute/capacity/immovable factors; bipartite matching for people once factor components propose candidate images.
- Add planted-mapping shadow diagnostics if needed: the generator has deterministic seed `90210`; a development-only harness can regenerate the hidden mapping and score mapping recovery without making canonical benchmark cases easier.
- Once a coherent relabeling is found, wire it into projection by normalizing/permuting the oracle schedule/candidate sessions before legacy merge, or by extending `OracleTemplateProjectionResult` with explicit relabeling maps.

## Benchmark/system improvements that are allowed in this lane

- Current primary should stay on direct relabeler/factor quality (`relabeling_factor_loss`) rather than final constructor success; final `1000000000` sentinel scores are only secondary monitors until projection/merge integration is coherent.
- Add telemetry from the diagnostic path for atom counts, factor families, accepted/covered/uncovered constraint keys, mapping completeness, timeout status, and score breakdown. This is benchmark-neutral if it does not alter public defaults.
- Add microdiagnostic cases/tests that prove a symmetry-breaking capability before expecting full benchmark score gains. If the benchmark target changes materially, re-run `init_experiment` with a new baseline.
- Keep the diagnostic suite strong; do not reduce case sizes or planted constraint counts just because the current implementation times out or fails.

## Tried / pruned in this lane

- Global beam-width increases are stale: width 64 timed out and regressed primary loss. Keep width small and improve candidate diversity/representatives instead.
- Comparator-only changes are stale: ranking the beam by the diagnostic loss instead of the reward scalar did not change the primary result.
- Blanket lazy immovable binding is stale: deferring every immovable person regressed before the more nuanced rule. The kept rule is to defer isolated/weak repeated immovable people and only promote stronger repetition.
- Slot-diverse pruning alone was tried and did not improve primary; candidate generation diversity mattered more.
- Kept useful scaffolds: bounded factor beam, scoped pair penalties, lazy unanchored pair factors, session-diverse beam retention, slot-diverse immovable candidate emission, and representative fast-pathing for unanchored weak pair factors.

## Things to avoid

- Do not anchor on names like `relabel_p001`, `relabel_g01`, `session_0`, `Alice`, or `g0` unless an external non-symmetric constraint truly fixes that label.
- Do not add case-ID-specific logic, hardcoded planted mappings, or benchmark-case edits to improve metrics.
- Do not make solver6 a general constrained solver; it remains the pure-SGP oracle.
- Do not hide failures behind fallback. The diagnostic lane may use finite costs internally, but final constructor validation remains strict after merge.
