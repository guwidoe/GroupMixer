# Solver3 construction autoresearch ideas backlog

## Preferred structural experiments

- Implement an oracle-guided baseline fill rather than overwrite+repair: preserve immovables/cliques, then fill flexible slots using real objective marginal plus projected oracle-contact agreement.
- Add merge acceptance scoring based on estimated search-basin disruption, not final-score gating: prefer oracle placements that keep scaffold-stable/cohesive groups while preserving coherent whole-template structure.
- Re-evaluate small, principled scaffold-disruption weights only if paired with a structural candidate-risk/fill-order change; simple scalar retuning has had diminishing returns.
- Evaluate multiple top template candidates only with strong hard-feasibility/risk prechecks; a naive top-3 projection-score selector caused failures.
- Add benchmark telemetry for oracle outcome/template dimensions per case to understand whether regressions come from candidate choice, projection, merge displacement, or hard repair.
- Explore adaptive warmup only with a fundamentally different signal (not just budget size); both blind 2s and budget-guarded 2s were negative.

## De-emphasized / recently negative

- Whole-problem pure-SGP fast path before scaffold/template logic: explicitly rejected.
- User-facing projection/oracle knobs: not allowed; behavior must be automatic.
- Score-gated oracle acceptance or hidden fallback after merge/repair claims applicability: not allowed during this strict constructor phase.
- More aggressive scaffold-disruption penalty at 5x under the old log metric: worsened versus the 3x keep.
- More permissive disruption penalty at 2x/2.5x under the old log metric: improved Sailing/raw total in some runs but worsened old aggregate and constrained SGP balance.
- Naive surgical merge that avoids selected-region clearing: worsened relative score and introduced a zero-regression.
- Independent local stay-vs-oracle target filtering: damaged coherent SGP structure and created major SGP regressions.
- Blindly increasing the warmup scaffold budget to 2s: one failure and much higher construction time despite a better non-penalized relative mean.
- Budget-guarded 2s warmup (only for construction budgets >= 4s): no failure but worse primary metric and Sailing.
- Hard-filtering projection to high-attendance people: worsened constrained SGP sentinels; attendance should be a score signal, not a hard eligibility rule.
- Skipping oracle when scaffold has zero raw repeat penalty: too broad; oracle geometry can still help the search basin.
- Requiring dummy-free template candidates when available: caused transfer-attribute failure; dummy burden needs risk scoring, not a hard filter.
