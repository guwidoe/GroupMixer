# Autoresearch ideas

Structured backlog for the solver3 objective-quality lane.

Use this file to keep promising ideas from getting lost, especially when an experiment reveals a good direction that is not pursued immediately.

## Rules
- Prefer ideas that align with the lane goal: **new move types, richer neighborhoods, new search memory, new perturbation/restart strategies, new metaheuristics, and enabling solver3 refactors**.
- Small SA parameter tweaks belong here only if they are clearly in service of a larger mechanism.
- When an idea is discovered during the loop, add a short bullet with enough context that a future agent can act on it.
- If an idea is part of a larger mechanism that needs incubation, note what remains to make it viable.

## Move types / compound operators
- _Add ideas here._

## Neighborhood families
- Naive best-of-k sampled neighborhood within existing families: tried two variants (swap/transfer `k=3` and swap-only `k=2`). The broader version was too expensive; the cheaper version still catastrophically harmed `stretch_sailing_trip_demo_real`. Retire this exact family for now. If neighborhood enrichment is revisited later, make it structurally different: target specific conflict patterns, add diversity/randomization guards, or evaluate compound moves rather than greedily taking the locally best sampled preview.

## Metaheuristics / search memory / perturbation
- Conditional incumbent restart / restart-cycle search: three variants were tried. Midpoint restart helped sailing once, but the family consistently regressed the aggregate or hotpaths. Retire for now; revisit only if a future neighborhood specifically benefits from a perturb-and-reoptimize driver.
- Exact-undo tabu on swap/transfer: tried a lightweight recent-reversal ban (`tenure=8`). It improved some cases but regressed the aggregate and added overhead. Retire this simple form for now; if search memory is revisited later, make it more state-aware (e.g. target repeated group-pair churn or repeated person-pair-contact regressions rather than blanket reverse-move bans).
- Late Acceptance Hill Climbing (LAHC): true non-SA acceptance driver using a rolling history of past scores instead of temperature. Good candidate for solver3 because it changes basin-traversal behavior with modest plumbing and low per-iteration overhead.

## Solver3 architecture / refactors enabling research
- _Add ideas here._

## Benchmark / correctness observations worth following up on
- _Add ideas here._
