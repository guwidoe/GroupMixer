# Autoresearch: solver3 feature-complete metaheuristic quality

## Objective
Improve `solver3`'s newer advanced search functionality under long budgets, with the primary goal of achieving the **best final incumbent score** at the end of the run across a deliberately mixed feature-surface bundle.

This lane is not just about Social Golfer. It is explicitly about making the newer solver3 metaheuristic surfaces work **cleanly and honestly** across:

- representative workshop scenarios
- together/apart + pair-meeting constraints
- transfer-heavy balance problems
- clique / must-stay-together workloads
- immovable assignments
- partial attendance and session-specific capacities
- zero-repeat encounter benchmarks like Social Golfer and Kirkman

## Metrics
- **Primary**: `metaheuristic_suite_weighted_normalized_score` (lower is better, unitless scaled by 100)
- **Secondary**:
  - `metaheuristic_fixed_iteration_weighted_normalized_score`
  - `solver3_raw_score_us`
  - `runtime_total_seconds`
  - `objective_suite_total_runtime_seconds`
  - validation mismatch counters
  - per-case normalized scores for all 9 objective cases

## How to Run
`./autoresearch.sh`

Root wrappers delegate to `tools/autoresearch/solver3-metaheuristic-quality/`.

## Persistent Metrics Logging
`./autoresearch.sh` writes the latest full metric set to `autoresearch.last_run_metrics.json`.

After every completed `run_experiment` + `log_experiment` cycle, run:

`python3 tools/autoresearch/patch_autoresearch_jsonl.py autoresearch.jsonl autoresearch.last_run_metrics.json`

This patches the latest run entry in `autoresearch.jsonl` so the tool-managed history also retains the secondary diagnostics and per-case scores.

## Files in Scope
- `backend/core/src/solver3/**`
- `backend/core/src/models.rs`
- `backend/core/tests/search_driver_regression.rs`
- `backend/benchmarking/suites/*solver3-metaheuristic-v1.yaml`
- `tools/autoresearch/solver3-metaheuristic-quality/**`
- `autoresearch.md`
- `autoresearch.sh`
- `autoresearch.checks.sh`
- `autoresearch.config.json`
- `autoresearch.ideas-to-try.md`
- `autoresearch.ideas.md`

## Off Limits
- `backend/core/src/solver1/**`
- `backend/core/src/solver2/**`
- solver3 constructor changes
- hidden fallback / silent downgrade behavior for unsupported advanced modes
- benchmark case identity, seeds, budgets, and metric reference math during the loop
- weakening checks

## Constraints
- Primary signal is long-budget fixed-time objective quality on the explicit mixed solver3 bundle
- Target per-case budgets are `150s` fixed-time and `7,000,000` fixed-iteration
- Advanced search work must either support scenario semantics honestly or fail explicitly
- Keep broad correctness guardrails; do not trade semantics away for SGP-only gains
- Do not proxy or simplify the benchmark question
- Prefer architecture that helps advanced search support more feature combinations cleanly

## Canonical fixed-time objective portfolio
- `representative.small-workshop-balanced`
- `representative.small-workshop-constrained`
- `adversarial.clique-swap-functionality-35p`
- `adversarial.transfer-attribute-balance-111p`
- `stretch.social-golfer-32x8x10`
- `stretch.kirkman-schoolgirls-15x5x7`
- `stretch.large-gender-immovable-110p`
- `stretch.sailing-trip-demo-real`
- `stretch.synthetic-partial-attendance-capacity-pressure-152p`

## Diagnostic companions
- fixed-iteration bundle on the same 9 objective cases
- solver3 raw runtime / hotpath diagnostic lane
- solver3 correctness benchmark corpus with external validation

## Research policy
- Prefer substantial search ideas over micro-tuning.
- Favor cleaner feature-complete advanced search wiring over narrow SGP-only wins.
- Capability gating is allowed and often preferred to dishonest degradation.
- If a feature family is currently unsupported by one advanced mode, either extend support cleanly or keep the rejection explicit and truthful.
- The big question is not only whether a mechanism helps Social Golfer, but whether it can become a real solver3 capability rather than a brittle niche lane.

## What's Been Tried
- Solver3 now has explicit advanced driver separation, SGP-local tabu, memetic scaffolding, donor-session transplant recombination, truthful benchmark telemetry, and explicit capability gating for unsupported advanced combinations.
- Plain `sgp_week_pair_tabu` remains the strongest advanced result on the 25s Social Golfer anchor.
- Donor-session recombination is no longer obviously dead: forced-fire diagnostics can beat the tabu reference on matched 3M Social Golfer budgets, but the normal trigger/selection regime still lags on the real 25s anchor.
- The next loop should treat advanced-mode **feature coverage + honest long-budget quality** as the main target, rather than only continuing narrow Social Golfer tuning.
