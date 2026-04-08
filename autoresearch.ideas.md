# Autoresearch ideas

Archive of solver3 objective-quality ideas that have already been **materially tried**, plus the learnings and conclusions from those attempts.

The live queue of strongest **untried** ideas now lives in `autoresearch.ideas-to-try.md`.

## Rules
- This file is for ideas that have already been **tried**, not for the untried queue.
- Prefer ideas that align with the lane goal: **new move types, richer neighborhoods, new search memory, new perturbation/restart strategies, new metaheuristics, and enabling solver3 refactors**.
- Small SA parameter tweaks belong here only if they were actually tried or are clearly in service of a larger mechanism that was tried.
- Once an idea from `autoresearch.ideas-to-try.md` is materially tried, move it here immediately and record the learning/conclusion.
- If an idea is part of a larger mechanism that needs incubation, keep updating its entry here through the incubation window.
- Promising but still-untried ideas belong in `autoresearch.ideas-to-try.md`, not here.

## Move types / compound operators
- _Add ideas here._

## Neighborhood families
- Naive best-of-k sampled neighborhood within existing families: tried two variants (swap/transfer `k=3` and swap-only `k=2`). The broader version was too expensive; the cheaper version still catastrophically harmed `stretch_sailing_trip_demo_real`. Retire this exact family for now. If neighborhood enrichment is revisited later, make it structurally different: target specific conflict patterns, add diversity/randomization guards, or evaluate compound moves rather than greedily taking the locally best sampled preview.

## Metaheuristics / search memory / perturbation
- Conditional incumbent restart / restart-cycle search: three variants were tried. Midpoint restart helped sailing once, but the family consistently regressed the aggregate or hotpaths. Retire for now; revisit only if a future neighborhood specifically benefits from a perturb-and-reoptimize driver.
- Exact-undo tabu on swap/transfer: tried a lightweight recent-reversal ban (`tenure=8`). It improved some cases but regressed the aggregate and added overhead. Retire this simple form for now; if search memory is revisited later, make it more state-aware (e.g. target repeated group-pair churn or repeated person-pair-contact regressions rather than blanket reverse-move bans).
- Late Acceptance Hill Climbing (LAHC): tried as a pure non-SA driver with a 256-score history window. It badly destabilized transfer-attribute-balance and large_gender. Retire this pure form for now; if revisited later, it needs a much stronger guard against constraint-heavy regressions.
- Online UCB move-family selection: tried two variants (plain improvement-rate UCB and cost-aware UCB). The plain variant was only mildly worse, but the cost-aware follow-up catastrophically harmed sailing. Retire this simple family-selection bandit for now unless a future version can use a richer reward signal tied to best-score improvements or structural conflict reduction.
- Guarded record-to-record acceptance is now the most promising non-SA family. The winning variant accepts improving moves plus bounded uphill moves within a shrinking band above best-so-far, using a linear `2 -> 0` threshold over `max(iteration_fraction, time_fraction)`. A quadratic close was worse, so if incubating further, tune around the linear schedule rather than closing the gate faster.
- GRASP-style multi-start outer driver: tried a naive equal-slice version that spent each fixed-time case across several diverse constructor seeds and polished each with the incumbent inner search, keeping the best schedule globally. This did produce real basin-diversity effects (social_golfer, sailing, and synthetic all improved), but it materially hurt large_gender and transfer balance and nearly doubled raw hotpath cost. Retire this naive equal-slice form for now. If this family is revisited later, it needs a much stronger constructor or a smarter elite/portfolio policy so extra starts earn their budget instead of fragmenting it.
- ALNS-style session ruin-and-recreate: tried a whole-session rebuild operator with a fail-soft fallback. On prolonged stagnation it picked a high-pressure session and rebuilt it with a repeat-aware greedy repair while preserving immovables and clique integrity. This was a real large-neighborhood step and did not crash once made fail-soft, but the naive repair was not strong enough: it landed around `100.11`, still worse than the current `99.016` best, and tended to worsen large_gender plus synthetic. Retire this simple whole-session form for now; if ALNS is revisited later, use more selective destroy targeting and a much stronger repair heuristic.
- Memetic / crossover macro move: incubated as constructor-seeded donor session crossover. The fail-soft one-session splice reached `99.37`, and the two-session splice reached `99.62`. That makes this family materially stronger than naive multi-start and the simple ALNS session-rebuild family, but still worse than the current `99.016` best. Retire this naive donor source for now. If revisited later, use stronger elite donors (e.g. locally polished or population-maintained donors) and compatibility-aware crossover rather than raw constructor-seeded session transplanting.

## Solver3 architecture / refactors enabling research
- _Add ideas here._

## Benchmark / correctness observations worth following up on
- _Add ideas here._
