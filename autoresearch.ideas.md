# Solver3 construction autoresearch ideas backlog

## Current post-merge active diagnostics

- Diagnose the construction-lane regression introduced by the master/search/runtime integration rather than by `9c5361b9`: current HEAD scored `1.179793654`, parent `d9650927` scored `1.197170647`, while pre-master construction branch `f4549664` scored `1.059812452`.
- Investigate the zero-baseline guard regression on `stretch.benchmark-very-large-constrained` generically; both current HEAD and parent produced a nonzero score there.
- Focus first on generic constructor/search-basin interactions visible in Google-CP equivalent, transfer attribute balance, large gender immovable, constrained 169x13x14 SGP, and Sailing. Do not add case-ID-specific logic or benchmark-case edits.
- Treat the hard-apart constructor-ownership change as provisionally safe for this lane: it improved the post-merge parent and kept `35/35` cases passing.

## Preferred structural experiments

- Implement an oracle-guided baseline fill rather than overwrite+repair only with real objective-aware placement; oracle seed + legacy random baseline fill was not enough.
- Keep deterministic batch assignment for displaced merge repair; greedy repair was improved by global assignment, but adding scaffold cohort pressure was strongly negative.
- Re-evaluate small, principled scaffold-disruption weights only if paired with a structural candidate-risk/fill-order change; simple scalar retuning has had diminishing returns.
- Evaluate multiple top template candidates only with strong hard-feasibility/risk/contact tradeoffs; naive top-3 projection-score and lowest-disruption-frontier selectors were both negative.
- Add benchmark telemetry for oracle outcome/template dimensions per case to understand whether regressions come from candidate choice, projection, merge displacement, or hard-constraint validation.
- Do not add the simple extra projection assignment/alignment convergence pass; it worsened both before and after batch repair despite some sentinel gains.
- Avoid scaffold-cohort pressure in repair; positive and negative cohort terms after batch assignment were both basin-hostile.
- Do not continue scalar tuning of batch repair's preferred-group prior; 1.0 and 3.0 both worsened versus kept 2.0.
- Do not combine hard selected-region target priority with batch repair; it was much worse than with greedy repair.
- Do not revisit available-capacity-only template sizing or available-capacity-first slot selection; sizing failed and slot ordering regressed transfer/49x7 despite feasible output.
- Do not continue attendance scalar tuning in projection/template selection; high-attendance hard filter, high-attendance threshold 2/3, and absent-penalty 0.5 all worsened.
- Keep target acceptance pair pressure at full weight; removing or halving it improved Sailing but worsened broad balance.
- Keep projected oracle target groups coherent; global cross-target acceptance assignment destroyed pure/constrained SGP structure.
- Avoid oracle-cohort pressure in target acceptance; max(scaffold target pressure, oracle co-target pressure) worsened broad quality and constrained SGP 169x13x14.
- Keep projection contact-signature anchoring at 0.20; 0.15, 0.25, and 0.30 all regressed broad balance, so stop scalar tuning this term.
- Keep scaffold-disruption template penalty at 3.0; lower 2.5 remained worse even with batch repair.
- Keep the 1s full-objective warmup scaffold; skipping warmup caused a zero-baseline regression and replacing the pre-warmup baseline source with freedom-aware construction caused multiple failures.
- Explore adaptive warmup only with a fundamentally different signal (not just budget size); blind 2s, budget-guarded 2s, and baseline/warmup consensus rigidity were negative.
- Benchmark/search noise is material: a no-code repeat of the kept batch-repair line scored much worse. Rerun near-threshold candidates before keeping if confidence is unclear.

## De-emphasized / recently negative

- Whole-problem pure-SGP fast path before scaffold/template logic: explicitly rejected.
- User-facing projection/oracle knobs: not allowed; behavior must be automatic.
- Score-gated oracle acceptance or hidden fallback after merge/repair claims applicability: not allowed during this strict constructor phase.
- More aggressive scaffold-disruption penalty at 5x under the old log metric: worsened versus the 3x keep.
- More permissive disruption penalty at 2x/2.5x under the old log metric: improved Sailing/raw total in some runs but worsened old aggregate and constrained SGP balance.
- Naive surgical merge that avoids selected-region clearing: worsened relative score and introduced a zero-regression.
- Oracle seed + legacy baseline refill: faster and feasible but weaker than direct merge; full fill needs objective-aware placement, not random baseline fill.
- Scaffold backfill for dummy/unmapped oracle holes: worsened primary metric and constrained SGP 49x7.
- Lowest-risk candidate promotion within top-three frontier: much worse; disruption risk alone cannot replace contact-opportunity scoring.
- Independent local stay-vs-oracle target filtering: damaged coherent SGP structure and created major SGP regressions.
- Blindly increasing the warmup scaffold budget to 2s: one failure and much higher construction time despite a better non-penalized relative mean.
- Budget-guarded 2s warmup (only for construction budgets >= 4s): no failure but worse primary metric and Sailing.
- Hard-filtering projection to high-attendance people: worsened constrained SGP sentinels; attendance should be a score signal, not a hard eligibility rule.
- Skipping oracle when scaffold has zero raw repeat penalty: too broad; oracle geometry can still help the search basin.
- Requiring dummy-free template candidates when available: caused transfer-attribute failure; negative dummy assignment score also worsened constrained SGP, so dummy burden needs candidate/fill strategy rather than hard filtering or projection pressure.
- Bounded small-oracle multistart selected by pure unique-contact count: regressed broad metric versus the kept 0.20 contact-anchor line; pure-contact oracle quality alone is not a safe downstream construction-basin signal.
- Projection person-priority scalar tuning is exhausted for now: 0.02 and 0.0 both regressed versus the kept 0.01 line.
- Displaced repair pair-pressure anchoring regressed sailing-real and large-gender badly; repair should not preserve scaffold contacts via that simple signal.
- Displaced repair attribute-balance delta scoring also regressed; attribute handling needs projection-level structural mapping rather than late fill scoring.
- Simple bounded projection-level attribute swap polishing also regressed; if revisited, it needs a richer combined contact/attribute objective rather than post-assignment penalty swaps.
- Stronger dummy-oracle candidate penalty regressed like dummy-free filtering/projection pressure; stop scalar dummy tuning.
- Runtime-scaled early stop for the 1s warmup scaffold saved construction time but worsened broad quality; adaptive 1.25s warmup for no-repeat attribute-balance scenarios caused failures. Keep the strict 1s warmup unless a stronger quality signal exists within budget.
- Projection placement anchor 0.35 over-anchored and regressed; keep 0.25 and stop simple projection anchoring scalar tuning.
- Bounded post-merge zero-change candidate retries regressed; keep only the cheap pre-merge no-op skip unless telemetry proves zero-change merges are common.
- Shorter pure-structure oracle budgets regressed overall: 250/50 improved Google-CP but hurt primary, and 400/80 was worse; keep 500/100 and stop simple oracle-budget scalar tuning.
- Template group-size ladder width tuning is exhausted: narrowing to max/max-1 and extending to max-3 both regressed; keep max/max-1/max-2.
- General displacing merge in hard-apart sessions with repair regressed; keep conservative non-displacing hard-apart merge.
- Evenly-spaced non-contiguous oracle templates helped transfer-attribute strongly in the ungated run but regressed broad/zero-regression; a coarse partial-participation gate was even worse, so only revisit with precise telemetry/selection.
- Reducing oracle target acceptance keep bonus from 3.0 to 2.0 regressed badly; keep this scaffold-preservation signal.
- Full selected-region slot assignment over projected candidates and scaffold occupants catastrophically collapsed SGP coherence; any oracle-guided fill must preserve whole oracle groups/cohorts, not independent slots.
- Limiting outside-region oracle imports to genuine open selected capacity regressed; outside-region imports are useful despite disruption risk.
- Static projection-time attribute-balance signature scoring regressed and increased construction time; attribute-aware changes need a cheaper and more faithful group-fill model.
- Extending no-op template skip to non-hard-apart regions with no mutable/open capacity regressed and failed checks; only revisit with telemetry showing this pattern matters.
- Single-pass `score_constructed_schedule` fast path did not improve construction time or metric; do performance work via dedicated profiling, not broad-score noise.
- Hard-apart projection pruning by unmapping lower-priority conflicted oracle people improved sailing-real but still regressed broad/constrained balance versus the kept best; projection-only hard-apart swap repair also regressed and increased runtime, so avoid relabeling-only hard-apart fixes.
- Dynamic attribute-balance marginal scoring during oracle target acceptance improved flotilla but regressed the broad metric; local attribute terms are not enough without a fuller fill redesign.
- Coarse majority-quorum gating of partial projected oracle cohorts regressed badly; skipping partial groups is too blunt even though cohort preservation remains desirable.
- Hard slot ordering by mutable internal contact pressure eliminated the zero-regression guard but hurt weighted successful cases; soft candidate-score and plain-flexible-only variants also regressed, so avoid this signal except as telemetry.
