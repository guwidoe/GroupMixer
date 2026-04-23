# Solver3 Oracle-Guided Construction Benchmarks

The constraint-scenario + pure-oracle constructor is implemented as an explicit opt-in mode:
`Solver3ConstructionMode::ConstraintScenarioOracleGuided`. It is **not** a default rollout.

## Smoke comparison

Run:

```bash
cargo run -q -p gm-core --example solver3_oracle_guided_construction_benchmark
```

The example compares:

- `baseline_legacy`
- `freedom_aware_randomized`
- `constraint_scenario_oracle_guided`

It reports both construction-only quality (`max_iterations=0`) and short-search quality
(`max_iterations=300`) on a deterministic mixed workload with repeat pressure,
attribute balance, an immovable person, a must-stay pair, a should-not pair, and a
pair-meeting constraint.

Sample run from this implementation checkpoint:

```text
solver3 oracle-guided construction comparison (lower score is better)
lane,initial_score,final_score,initial_repeats,final_repeats,initial_ms,final_ms
baseline_legacy,330.000,211.000,30,18,0,5
freedom_aware_randomized,1260.000,213.000,122,19,1,7
constraint_scenario_oracle_guided,1169.000,220.000,112,18,2,7
```

Interpretation:

- The new constructor is functional and deterministic on the mixed benchmark lane.
- This smoke lane does **not** justify making it the default constructor.
- The current implementation should remain opt-in while broader targeted workloads are added.
- Future work should focus on improving CS block selection and merge acceptance before rollout.

## Test coverage added

Focused solver3 coverage now includes:

- repeat-relevance gating
- CS ensemble construction
- CS pair pressure, placement histogram, and rigidity extraction
- rigid/flexible scaffold masks
- oracleizable block selection and decline behavior
- fake pure-oracle seam
- solver6-backed pure-oracle seam
- oracle relabeling against CS pair/group signals
- oracle-guided merge/repair
- mixed constrained partial-attendance runtime construction
- repeat-irrelevant decline path

Verification command:

```bash
cargo test -q -p gm-core solver3 --lib
```
