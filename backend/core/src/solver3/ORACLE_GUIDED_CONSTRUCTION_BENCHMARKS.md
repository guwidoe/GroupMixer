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

Sample run from the pre-warmup-scaffold checkpoint; rerun before using these as current numbers:

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
- Future work should focus on template projection/merge quality before rollout.

## Construction-method fixture comparison

Run:

```bash
cargo run -q -p gm-core --example solver3_construction_methods_benchmark
```

The example compares the three `Solver3ConstructionMode` variants construction-only
(`max_iterations=0`, deterministic seed `42`) on targeted fixtures. It intentionally
keeps the small `80p/10g/8s` synthetic partial-attendance probe as an intermediate
shape and also includes the canonical 152-person partial-attendance capacity-pressure
fixture:

- `backend/benchmarking/cases/stretch/synthetic_partial_attendance_capacity_pressure_152p.json`

Sample run from the capacity-ladder template checkpoint:

```text
case,lane,score,repeats,weighted_repeat,constraint_penalty,unique,elapsed_ms
sailing_trip_real_raw,baseline_legacy,26278.000,535,535.000,455,2286,6
sailing_trip_real_raw,freedom_aware_gamma0,40836.000,4003,4003.000,484,1299,8898
sailing_trip_real_raw,constraint_scenario_oracle,19913.000,280,280.000,346,2469,6041
synthetic_partial_attendance_80p_10g_8s,baseline_legacy,68892.000,682,68200.000,0,1548,2
synthetic_partial_attendance_80p_10g_8s,freedom_aware_gamma0,250401.000,2493,249300.000,0,1139,2342
synthetic_partial_attendance_80p_10g_8s,constraint_scenario_oracle,11419.000,111,11100.000,0,1921,5294
synthetic_partial_attendance_capacity_pressure_152p,baseline_legacy,17343.000,387,4644.000,198,1931,4
synthetic_partial_attendance_capacity_pressure_152p,freedom_aware_gamma0,29849.000,1559,18708.000,178,1419,3676
synthetic_partial_attendance_capacity_pressure_152p,constraint_scenario_oracle,13320.000,321,3852.000,163,1987,1827
pure_sgp_8_4_10,baseline_legacy,289167.000,289,289000.000,0,313,1
pure_sgp_8_4_10,freedom_aware_gamma0,1520304.000,1520,1520000.000,0,176,95
pure_sgp_8_4_10,constraint_scenario_oracle,0.000,0,0.000,0,480,1141
pure_sgp_8_4_5,baseline_legacy,44042.000,44,44000.000,0,198,0
pure_sgp_8_4_5,freedom_aware_gamma0,416160.000,416,416000.000,0,80,45
pure_sgp_8_4_5,constraint_scenario_oracle,0.000,0,0.000,0,240,103
```

Interpretation:

- The 152-person fixture now strongly favors the oracle-guided path in construction-only
  score, repeats, constraint penalty, and unique contacts.
- Sailing now beats `baseline_legacy` on construction-only total score while also
  improving repeats, constraint penalty, and unique contacts.
- The small synthetic partial-attendance probe remains useful as an intermediate shape,
  but it is not a substitute for the 152-person fixture.
- Pure-SGP diagnostics still validate that the oracle-guided constructor can expose the
  solver6 structure correctly when projection is easy.

## Test coverage added

Focused solver3 coverage now includes:

- repeat-relevance gating
- CS ensemble construction
- CS pair pressure, placement histogram, and rigidity extraction
- rigid/flexible scaffold masks
- capacity-template generation and explicit no-template errors
- fake pure-oracle seam
- solver6-backed pure-oracle seam
- oracle template projection against CS pair/group signals
- oracle-guided merge/repair
- mixed constrained partial-attendance runtime construction
- repeat-irrelevant decline path

Verification command:

```bash
cargo test -q -p gm-core solver3 --lib
```
