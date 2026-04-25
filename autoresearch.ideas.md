# Solver3 relabeling projection autoresearch ideas backlog

## Symmetry-breaking directions

- Active direction promoted from ideas into implementation: build the trajectory-permutation labeler directly under `backend/core/src/solver_support/construction/constraint_scenario_oracle/constraint_aware_projection/`; see `TRAJECTORY_LABELER_PLAN.md` in that directory. The old atom/factor relabeler is now a seed/anchor source for this pipeline, not the intended final consumer.
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
- Promising larger rewrite: build a trajectory-permutation labeler over fixed oracle incidence (`real person -> oracle trajectory`) with session relabeling explicit and per-session group-label symmetry eliminated by a tiny assignment/matching problem. Score pair constraints via precomputed oracle meet bitsets and group/attribute/fixed-placement costs after best group matching; seed from the current factor relabeler, then use Rust-native swap/k-cycle/LNS over permutations. Treat OR-Tools/CP-SAT and affine-specific automorphisms as optional later diagnostics, not as the wasm/core MVP.

## Benchmark/system improvements that are allowed in this lane

- Direct relabeler/factor quality (`relabeling_anchor_loss`) is now saturated and should remain a zero-loss guard. The active primary can move to final diagnostic construction (`final_relabeling_relative_score`) because projection/merge consumption is now the bottleneck. Keep legacy `relabeling_factor_loss` as secondary only because it over-penalizes unidentifiable symmetric variables.
- Add telemetry from the diagnostic path for atom counts, factor families, accepted/covered/uncovered constraint keys, mapping completeness, timeout status, and score breakdown. This is benchmark-neutral if it does not alter public defaults.
- Add microdiagnostic cases/tests that prove a symmetry-breaking capability before expecting full benchmark score gains. If the benchmark target changes materially, re-run `init_experiment` with a new baseline.
- Keep the diagnostic suite strong; do not reduce case sizes or planted constraint counts just because the current implementation times out or fails.
- Legacy-vs-new full-flow benchmarking is now explicit: `solver3-relabeling-projection.yaml` enables constraint-aware projection, while `solver3-relabeling-projection-legacy.yaml` disables it but keeps the same relabeling-budget headroom for fair A/B comparison.

## Tried / pruned in this lane

- Global beam-width increases are stale: width 64 timed out and regressed primary loss. Keep width small and improve candidate diversity/representatives instead.
- Comparator-only changes are stale: ranking the beam by the diagnostic loss instead of the reward scalar did not change the primary result.
- Blanket lazy immovable binding is stale: deferring every immovable person regressed before the more nuanced rule. The kept rule is to defer isolated/weak repeated immovable people and only promote stronger repetition.
- Slot-diverse pruning alone was tried and did not improve primary; candidate generation diversity mattered more.
- Kept useful scaffolds: bounded factor beam, scoped pair penalties, lazy unanchored pair factors, session-diverse beam retention, slot-diverse immovable candidate emission, representative fast-pathing for unanchored weak pair factors, and repeated-clique candidate intersections.
- Legacy global mapping loss is stale as a primary target: after coverage reached 237/237 it mostly rewarded arbitrary mappings for pair-only or symmetric cases. Use identifiable-anchor mapping loss only as a guard now that it is zero.
- Relabeler-only anchor loss is also saturated; further primary improvements must come from consuming the coherent session/slot/person hints in projection/merge, not from weakening direct relabeler scoring.
- Raw session permutation from factor relabeler into legacy projection is stale: it regressed cliques, attribute, pair/soft-pair, and mixed_light. Session maps need the trajectory scorer/per-session group matching layer before they are safe to consume.
- Unguarded AttributeBalance-aware group assignment is stale: it improved attribute and some mixed scores, but regressed zero structural cases. Revisit only with lexicographic/acceptance gating that preserves structural/pair/clique risk.
- Kept scaffold-side construction improvements: place active MustStayApart-constrained people first during baseline construction, and refresh search elapsed time every iteration for short timed local-improver budgets. These reduced final construction failures without weakening validation.
- Legacy-vs-new full-flow A/B run on 2026-04-25 showed both lanes at 9/11 successes with mixed_structural and mixed_full still timing out. New constraint-aware projection improved partial_attendance, pair_meeting, and mixed_light on that run, but regressed cliques/hard_apart enough that the weighted aggregate was slightly worse than legacy. Treat this as “not yet a full-flow win”; focus on projection materialization/trajectory matching and the remaining mixed timeouts.
- Added supplemental pair-sensitive diagnostic lanes rather than replacing the 13x13x14 suite: `solver3-relabeling-projection-pair-sensitive.yaml` and `solver3-relabeling-projection-pair-sensitive-legacy.yaml` cover non-complete 13x13x10 and 6x6x3 planted oracles. Initial A/B on 2026-04-25: both lanes 8/8 successes; new projection was slightly worse on 13x13x10 hard_apart (+90), soft_pairs (+18), and pair_mixed (+70), tied pair_meeting and all 6x6x3 cases. This confirms the old 13x13x14 lane hid pair-family weaknesses; use the pair-sensitive suite as a guard/diagnostic for trajectory-level pair scoring.

## Things to avoid

- Do not anchor on names like `relabel_p001`, `relabel_g01`, `session_0`, `Alice`, or `g0` unless an external non-symmetric constraint truly fixes that label.
- Do not add case-ID-specific logic, hardcoded planted mappings, or benchmark-case edits to improve metrics.
- Do not make solver6 a general constrained solver; it remains the pure-SGP oracle.
- Do not hide failures behind fallback. The diagnostic lane may use finite costs internally, but final constructor validation remains strict after merge.
