# Solver3 SGP tabu tenure multiseed sweep — 2026-04-13

Parent todo:
- `TODO-36458ed8` — implement and benchmark solver3 scaled/adaptive tabu tenure sweep

## Scope

Compared three week-pair tabu tenure variants across 4 repeat-encounter scenarios and 3 seeds per scenario:

- fixed `8..32`, `retry_cap=4`, `aspiration=true`
- session-participant-scaled `8..32` with `session_scale_reference_participants=32`
- reactive no-improvement-scaled `8..32` with `reactive_no_improvement_window=100000`, `reactive_max_multiplier=4`

Selected scenarios:
- `backend/benchmarking/cases/stretch/social_golfer_32x8x10.json`
- `backend/benchmarking/cases/stretch/kirkman_schoolgirls_15x5x7.json`
- `backend/benchmarking/cases/stretch/sailing_trip_demo_real.json`
- `backend/benchmarking/cases/stretch/synthetic_partial_attendance_capacity_pressure_152p.json`

Run artifacts:
- fixed `8..32`: `backend/benchmarking/artifacts/runs/solver3-sgp-tabu-tenure-fixed-multiseed-20260413T201454Z-5b5e9320/run-report.json`
- session-scaled `8..32`: `backend/benchmarking/artifacts/runs/solver3-sgp-tabu-tenure-session-scaled-multiseed-20260413T201810Z-a8da7c64/run-report.json`
- reactive `8..32`: `backend/benchmarking/artifacts/runs/solver3-sgp-tabu-tenure-reactive-multiseed-20260413T202125Z-e3848cab/run-report.json`
- hotpath guardrail after implementation: `backend/benchmarking/artifacts/runs/hotpath-search-iteration-sailing-trip-demo-solver3-20260413T202605Z-978e34e8/run-report.json`

## Per-scenario averages across 3 seeds

### Social Golfer 32x8x10

| tenure mode | avg score | avg runtime (s) | avg iterations | avg iter/s | avg realized tenure |
| --- | ---: | ---: | ---: | ---: | ---: |
| fixed `8..32` | 5381.00 | 25.000 | 1561323 | 62452.1 | 19.67 |
| session-scaled `8..32` | 5381.00 | 25.000 | 1554539 | 62181.1 | 19.66 |
| reactive `8..32` | 5381.00 | 25.000 | 1540103 | 61602.9 | 36.71 |

| tenure mode | seed scores | seed runtimes (s) | seed iterations |
| --- | --- | --- | --- |
| fixed `8..32` | 5367, 5409, 5367 | 25.000, 25.001, 25.000 | 1550848, 1552000, 1581120 |
| session-scaled `8..32` | 5367, 5409, 5367 | 25.000, 25.000, 25.000 | 1582720, 1534592, 1546304 |
| reactive `8..32` | 5367, 5409, 5367 | 25.001, 25.000, 25.001 | 1543488, 1568660, 1508160 |

### Kirkman 15x5x7

| tenure mode | avg score | avg runtime (s) | avg iterations | avg iter/s | avg realized tenure |
| --- | ---: | ---: | ---: | ---: | ---: |
| fixed `8..32` | 47.67 | 10.000 | 774080 | 77405.5 | 20.66 |
| session-scaled `8..32` | 47.67 | 10.001 | 758187 | 75814.0 | 20.66 |
| reactive `8..32` | 47.67 | 10.001 | 748544 | 74849.8 | 20.66 |

| tenure mode | seed scores | seed runtimes (s) | seed iterations |
| --- | --- | --- | --- |
| fixed `8..32` | 55, 55, 33 | 10.000, 10.000, 10.000 | 773888, 780160, 768192 |
| session-scaled `8..32` | 55, 55, 33 | 10.000, 10.001, 10.000 | 734144, 773696, 766720 |
| reactive `8..32` | 55, 55, 33 | 10.001, 10.000, 10.001 | 744064, 731392, 770176 |

### Sailing Trip demo real

| tenure mode | avg score | avg runtime (s) | avg iterations | avg iter/s | avg realized tenure |
| --- | ---: | ---: | ---: | ---: | ---: |
| fixed `8..32` | 3216.00 | 15.001 | 264661 | 17642.7 | 19.86 |
| session-scaled `8..32` | 3217.33 | 15.002 | 270845 | 18054.4 | 71.58 |
| reactive `8..32` | 3216.00 | 15.002 | 256384 | 17089.8 | 19.95 |

| tenure mode | seed scores | seed runtimes (s) | seed iterations |
| --- | --- | --- | --- |
| fixed `8..32` | 2577, 4574, 2497 | 15.003, 15.000, 15.001 | 252736, 298176, 243072 |
| session-scaled `8..32` | 2579, 4578, 2495 | 15.002, 15.000, 15.002 | 257526, 297344, 257664 |
| reactive `8..32` | 2577, 4574, 2497 | 15.000, 15.004, 15.002 | 250752, 285440, 232960 |

### Synthetic partial-attendance 152p

| tenure mode | avg score | avg runtime (s) | avg iterations | avg iter/s | avg realized tenure |
| --- | ---: | ---: | ---: | ---: | ---: |
| fixed `8..32` | 6569.00 | 15.001 | 528981 | 35263.8 | 20.04 |
| session-scaled `8..32` | 6610.33 | 15.000 | 526848 | 35122.0 | 60.46 |
| reactive `8..32` | 6574.00 | 15.001 | 515136 | 34340.3 | 20.05 |

| tenure mode | seed scores | seed runtimes (s) | seed iterations |
| --- | --- | --- | --- |
| fixed `8..32` | 6526, 6575, 6606 | 15.000, 15.000, 15.002 | 532608, 522688, 531648 |
| session-scaled `8..32` | 6591, 6634, 6606 | 15.000, 15.001, 15.000 | 519744, 535424, 525376 |
| reactive `8..32` | 6528, 6588, 6606 | 15.001, 15.001, 15.001 | 517312, 503808, 524288 |

## Conclusions

1. **Fixed `8..32` remains the best current regime of the tested three.**
   - It tied or beat the other variants on every tested scenario.
   - No scenario showed a score win for the scaled or reactive variants.

2. **Session-participant scaling made tenure much longer on large scenarios and generally hurt quality.**
   - On `sailing_trip_demo_real`, average realized tenure jumped from about `20` to about `71` and average score got slightly worse (`3216.00 -> 3217.33`).
   - On `synthetic_partial_attendance_capacity_pressure_152p`, average realized tenure jumped from about `20` to about `60` and average score got clearly worse (`6569.00 -> 6610.33`).

3. **Reactive no-improvement scaling did not earn its keep in this first form.**
   - It meaningfully lengthened tenure mainly on Social Golfer, where it still tied the fixed regime on score (`5381.00`).
   - Elsewhere it was mostly inert or slightly worse.

4. **The current evidence favors refining fixed bounded tenure, not switching to global scaled/adaptive tenure yet.**
   - The large-scenario results argue against simply making tenure much longer because sessions are larger.
   - If adaptive tenure stays interesting, the next form should probably react to a more direct cycling signal rather than only session size or raw no-improvement streak.
