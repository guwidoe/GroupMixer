# Autoresearch: solver3 broad multiseed quality

## Objective
Improve `solver3` against the new **broad multiseed fixed-time objective lane**.

The benchmark question is:
- run 10 canonical solver3 cases
- run each case with 4 explicit seeds
- average the final score across the 4 seeds for each canonical case
- normalize each case against the checked-in baseline reference
- average those normalized case scores with equal weight
- scale by `100`

Lower is better.

This session is about **overall objective quality robustness**, not single-case hero numbers. The main goal is to improve search quality across the broad portfolio without cheating on the benchmark definition.

## Metrics
- **Primary**: `solver3_broad_multiseed_weighted_normalized_score` (lower is better)
- **Secondary**:
  - `objective_suite_total_final_score_raw`
  - `objective_suite_average_final_score_raw`
  - `objective_suite_total_runtime_seconds`
  - `objective_suite_total_replicate_count`
  - `objective_suite_external_validation_failures`
  - `objective_suite_total_score_mismatches`
  - `objective_suite_score_breakdown_mismatches`
  - per-case mean/min/max/stddev score metrics
  - per-case mean/min/max/stddev runtime metrics
  - `solver3_raw_score_us`
  - `hotpath_total_us`
  - `swap_preview_us`
  - `swap_apply_us`
  - `transfer_preview_us`
  - `transfer_apply_us`
  - `clique_preview_us`
  - `clique_apply_us`
  - `rep_avg_iter_us`
  - `path_avg_iter_us`

Interpretation policy:
- primary metric decides keep/discard
- raw hotpath metrics matter as diagnostics and tie-break context, but not as excuses to keep broad-quality regressions
- broad multiseed quality beats single-seed wins
- correctness must stay clean

## How to Run
`./autoresearch.sh`

Root wrappers delegate to:
- `tools/autoresearch/solver3-broad-quality/autoresearch.sh`
- `tools/autoresearch/solver3-broad-quality/autoresearch.checks.sh`

## Benchmark Contract
Canonical portfolio, each with 4 explicit seeds:
1. representative.small-workshop-balanced
2. representative.small-workshop-constrained
3. adversarial.clique-swap-functionality-35p
4. adversarial.transfer-attribute-balance-111p
5. stretch.social-golfer-32x8x10
6. stretch.kirkman-schoolgirls-15x5x7
7. stretch.large-gender-immovable-110p
8. stretch.sailing-trip-demo-real
9. stretch.synthetic-partial-attendance-capacity-pressure-152p
10. stretch.synthetic-partial-attendance-keep-apart-capacity-pressure-152p

Lane definition and references live in:
- `tools/autoresearch/solver3-broad-quality/fixed-time-metric-config.json`
- `backend/benchmarking/suites/objective-canonical-representative-solver3-broad-multiseed-v1.yaml`
- `backend/benchmarking/suites/objective-canonical-adversarial-solver3-broad-multiseed-v1.yaml`
- `backend/benchmarking/suites/objective-canonical-stretch-solver3-broad-multiseed-v1.yaml`

## Files in Scope
- `backend/core/src/solver3/search/**` — move-family choice, sampling, search-driver behavior
- `backend/core/src/solver3/moves/**` — preview/apply hotpaths and feasibility handling
- `backend/core/src/solver3/scoring/**` — scoring/oracle fallout if needed
- `backend/core/src/solver3/runtime_state.rs` — state helpers if search needs them
- `backend/core/src/solver3/compiled_problem.rs` — compiled lookup support if justified
- `backend/core/src/solver3/tests.rs` — focused solver3 regression coverage
- `backend/core/tests/search_driver_regression.rs`
- `backend/core/tests/data_driven_tests.rs`
- `backend/core/tests/property_tests.rs`
- `backend/benchmarking/src/manifest.rs` — only if benchmark manifest/test fallout requires it
- `backend/benchmarking/suites/*.yaml` — only if keeping the benchmark contract intact while fixing metadata/coverage issues
- `tools/autoresearch/objective-quality/aggregate_objective_metrics.py` — metric aggregation logic only when needed for honest signal
- `tools/autoresearch/solver3-broad-quality/**`
- `autoresearch.md`
- `autoresearch.sh`
- `autoresearch.checks.sh`
- `autoresearch.config.json`
- `autoresearch.ideas.md`

## Off Limits
- changing benchmark case identity, seed lists, weights, or budgets to make the metric easier
- simplifying canonical problems or replacing them with helper cases
- solver1/solver5 feature work unrelated to solver3 broad-lane quality
- unrelated benchmark/reporting cleanup not needed for this lane
- hidden fallbacks or benchmark gaming

## Constraints
- solver3 only
- correctness checks must stay green
- preserve the broad-lane contract exactly
- do not overfit to one case, especially Sailing Trip
- prefer robust policy changes over one-off per-case hacks
- when an idea looks promising, invest **3-4 refinement attempts** before discarding it unless it is clearly broken, crashes, or violates checks
- when a path is promising but too large for now, record it in `autoresearch.ideas.md`
- keep notes current so a fresh agent can resume from this file alone

## Current State Before Loop Start
- The broad multiseed solver3 lane is checked in and runnable.
- The metric aggregator now supports duplicate `case_id`s so multiseed averaging is first-class.
- Root autoresearch wrappers now target the solver3 broad lane.
- Existing solver3 context from recent work:
  - `MustStayApart` shipped for solver3
  - swap-side structural preselection shipped
  - adaptive move-family chooser exists and improved over the broken first-valid-family policy, but remains open for tuning
  - trusted-vs-checked preview split exists, but broad raw-speed evidence for wider trusted rollout is mixed
- Known likely leverage areas:
  - move-family choice robustness
  - search policy balance across time-limited multiseed runs
  - cheap structural gating that improves quality-per-second without biasing family usage badly
  - targeted preview hotpath cleanup only when it helps the broad lane

## What's Been Tried
- The broad-lane benchmark and aggregation infrastructure were created and validated.
- The checked-in reference baseline in `fixed-time-metric-config.json` uses these per-case 4-seed means:
  - representative.small-workshop-balanced = `3.0`
  - representative.small-workshop-constrained = `4.0`
  - adversarial.clique-swap-functionality-35p = `4756.0`
  - adversarial.transfer-attribute-balance-111p = `199.75`
  - stretch.social-golfer-32x8x10 = `338.25`
  - stretch.kirkman-schoolgirls-15x5x7 = `55.0`
  - stretch.large-gender-immovable-110p = `2176.25`
  - stretch.sailing-trip-demo-real = `2451.0`
  - stretch.synthetic-partial-attendance-capacity-pressure-152p = `6552.25`
  - stretch.synthetic-partial-attendance-keep-apart-capacity-pressure-152p = `6632.0`
- A first rerun on current `master` scored about `102.09`, meaning current head was slightly worse than the reference baseline on this broad lane.
- Session baseline on branch `autoresearch/solver3-broad-quality-2026-04-16` / setup commit `98504a9` scored `102.53818534304553`.
  - biggest regression signal: `stretch.sailing-trip-demo-real` mean `3425.75 / 2451.0` (`1.3977x` normalized)
  - mild regressions: transfer-attribute-balance (`1.0063x`), partial-attendance (`1.0017x`)
  - notable wins: kirkman (`0.9000x`), social-golfer (`0.9593x`), large-gender-immovable (`0.9924x`), keep-apart partial-attendance (`0.9964x`)
  - raw runtime diagnostic baseline: `solver3_raw_score_us=3.7197`, `hotpath_total_us=2.1176`
- Recent solver3 search history already suggests that raw micro-speed wins can still hurt portfolio quality if move-family balance shifts badly.
- The loop should therefore prefer:
  1. policy improvements that survive multiseed averaging
  2. hotpath wins that do not distort family mix in harmful ways
  3. multi-step refinement of promising ideas before giving up
- Experiment 1: softened adaptive chooser utility ranking with `normalized.sqrt()` before weighting.
  - outcome: **discarded**
  - primary metric regressed from `102.5382` to `103.7673`
  - runtime also got worse (`objective_suite_total_runtime_seconds` `47.98 -> 54.27`)
  - main damage stayed concentrated in Sailing (`1.3977x -> 1.4080x`) while several broad-lane runtimes inflated
  - takeaway: broad utility compression increased exploration/diversity in a way that hurt both quality and throughput; the next refinement should be more selective than globally softening utility differences
- Experiment 2: added mild negative reward for rejected/no-candidate family attempts so chooser utility is not driven only by successful accepts.
  - outcome: **keep**
  - primary metric improved from `102.5382` to `101.0107`
  - biggest win: Sailing collapsed from `3425.75` mean (`1.3977x`) to `2409.75` mean (`0.9832x`)
  - other wins: transfer-attribute-balance improved to `0.9825x`
  - regressions to watch: kirkman worsened to `1.1000x`, large-gender-immovable worsened to `1.0316x`, partial-attendance worsened to `1.0116x`
  - hotpath/raw-runtime diagnostics got slower, but the primary broad fixed-time quality metric improved decisively
  - next refinement should preserve the failure-penalty idea while clawing back the regressions outside Sailing and some of the hotpath slowdown
- Experiment 3: kept the rejected-candidate penalty but removed the no-candidate penalty, leaving missing-candidate handling to the existing candidate-rate/share signal.
  - outcome: **keep**
  - primary metric improved further from `101.0107` to `98.1441`
  - Sailing improved again to `2357.25` mean (`0.9618x`)
  - kirkman flipped from a regression to a strong win (`1.1000x -> 0.8500x`)
  - transfer-attribute-balance stayed good (`0.9787x`), social-golfer stayed good (`0.9919x`)
  - remaining watch item: large-gender-immovable is still weak at `1.0379x`; partial-attendance is basically flat (`1.0001x`)
  - runtime/hotpath diagnostics also improved materially versus Experiment 2, though they are still secondary to the primary broad-lane objective
  - takeaway: penalizing failed previews is useful, but penalizing no-candidate attempts separately was too aggressive because candidate-rate-based share correction was already enough
- Experiment 4: reduced the rejected-candidate penalty from `0.10` to `0.08`.
  - outcome: **discarded**
  - primary metric snapped back to `102.1250`, giving up most of the gains from Experiment 3
  - kirkman regressed badly (`0.8500x -> 1.2000x`) and social-golfer also flipped from a win to a regression (`0.9919x -> 1.0163x`)
  - Sailing stayed good (`0.9784x`) and partial-attendance stayed slightly better, but not enough to offset the broader losses
  - takeaway: the rejected-preview penalty needs to stay near the stronger `0.10` level; weakening it too much loses the useful discipline the chooser needs
- Experiment 5: blended recent improving-accept rate into the chooser's target-share calculation, so fair-share pressure depends on both candidate availability and recent improving productivity.
  - outcome: **discarded**
  - primary metric regressed from `98.1441` to `101.5189`
  - large-gender-immovable improved slightly (`1.0379x -> 1.0303x`) and kirkman stayed decent (`0.8500x -> 0.9500x`), but Sailing degraded badly (`0.9618x -> 1.1576x`)
  - transfer-heavy adversarial also lost its gain (`0.9787x -> 1.0025x`), so the added productive-share logic overcorrected against the families that were helping Sailing
  - takeaway: improving-accept rate may still be useful as instrumentation, but blending it directly into target-share pressure was too destabilizing for the broad lane
- Experiment 6: switched sampled swap previewing back from trusted to checked throughout `candidate_sampling.rs`.
  - outcome: **discarded**
  - primary metric landed at `98.4304`, slightly worse than the current best `98.1441`
  - broad quality stayed decent and large-gender-immovable improved a bit (`1.0379x -> 1.0291x`), but Sailing softened (`0.9618x -> 0.9982x`) and the overall gain was not enough
  - takeaway: sampled checked swap preview is not obviously catastrophic on the broad lane, but it is not a clear win either; keep it as a secondary fallback idea rather than the main current direction
- Experiment 7: reduced adaptive chooser exploration epsilon from `0.05` to `0.03` while keeping the rejected-preview penalty policy from the current best.
  - outcome: **discarded**
  - primary metric regressed to `102.2684`
  - transfer-heavy adversarial and social-golfer improved, and runtime got faster, but Sailing blew up again (`0.9618x -> 1.2072x`) and dominated the loss
  - takeaway: the current best chooser still needs more exploration than `0.03`; cutting exploration too aggressively recreates the same kind of path-dependence failure that hurts Sailing
- Experiment 8: added a small improving-accept-rate bonus directly into chooser weight computation as a tie-break, while leaving target-share logic untouched.
  - outcome: **discarded**
  - primary metric regressed to `102.0270`
  - social-golfer and transfer-heavy adversarial improved strongly, but Sailing regressed again (`0.9618x -> 1.1909x`) and large-gender-immovable also stayed weak (`1.0404x`)
  - takeaway: even a mild productivity bonus inside the main chooser weights is too strong; if improving-accept rate is used at all, it likely needs to be gated to near-tie situations or kept as offline telemetry only
- Experiment 9: gated the productivity bonus to near-tie utility situations only.
  - outcome: **discarded**
  - primary metric was still worse than the current best (`98.3132` vs `98.1441`)
  - Sailing stayed strong (`0.9801x`) and large-gender-immovable improved slightly (`1.0337x`), but the overall score was not better and runtime got even slower
  - takeaway: a near-tie productivity tie-break is less damaging than an always-on productivity bonus, but it still does not beat the simpler current-best chooser
- Experiment 10: added a **near-tie share-deficit bonus** so families that are under their target share get a small extra nudge only when utility is already close.
  - outcome: **keep**
  - primary metric improved from `98.1441` to `98.0095`
  - biggest broad wins: social-golfer improved further to `0.9431x`; Sailing stayed strong at `0.9815x`; kirkman stayed strong at `0.8500x`
  - transfer-heavy adversarial remained good at `0.9850x`
  - remaining weak spots: large-gender-immovable still around `1.0412x`; partial-attendance slightly regressed to `1.0021x`
  - runtime got slower than the previous best (`50.61s -> 54.96s`), but the primary broad quality metric improved honestly
  - takeaway: tiny fairness nudges based on **share deficit in near ties** are meaningfully safer than productivity-based bonuses and may be a viable refinement direction
