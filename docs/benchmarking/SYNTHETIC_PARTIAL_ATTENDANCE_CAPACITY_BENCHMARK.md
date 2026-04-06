# Synthetic partial-attendance + session-capacity benchmark

## Purpose

This benchmark exists to cover a gap in the current portfolio:

- **large** multi-session workload
- heavy **partial participation**, including non-contiguous attendance masks like `0,2,4` and `1,2,5`
- strongly **session-specific group capacities**, including groups that are closed in some sessions
- enough session-scoped constraint pressure to make the feature combination meaningful, not toy-sized

It is intentionally **synthetic**, not a real customer workload.

## Files

Case manifest:

- `backend/benchmarking/cases/stretch/synthetic_partial_attendance_capacity_pressure_152p.json`

Deterministic builder:

- `tools/benchmarking/generate_partial_attendance_capacity_case.py`

Dedicated suites:

- `backend/benchmarking/suites/stretch-partial-attendance-capacity-pressure-time.yaml`
- `backend/benchmarking/suites/stretch-partial-attendance-capacity-pressure-fixed-iteration.yaml`
- `backend/benchmarking/suites/stretch-partial-attendance-capacity-pressure-time-solver3.yaml`

## Construction method

This case is built with a **planted-feasible** deterministic builder rather than by hand.

The builder does the following:

1. defines a large attendance population with curated non-contiguous masks
2. defines a strong per-session capacity matrix with closures and size changes
3. reserves a planted-feasible skeleton:
   - full-attendance anchors
   - session-scoped immovables
   - partial-attendance cliques
   - partial-attendance buddy pairs
4. fills the remaining schedule greedily while preferring new contacts
5. derives the benchmark case from that planted-feasible schedule

The planted schedule is only used during generation to guarantee honest feasibility. It is **not** checked into the canonical benchmark manifest as a benchmark-start helper.

## Current shape

Current generated workload:

- `152` people
- `6` sessions
- `12` stable group ids
- attendance per session:
  - session 0: `96`
  - session 1: `94`
  - session 2: `96`
  - session 3: `80`
  - session 4: `94`
  - session 5: `106`
- capacity per session:
  - session 0: `96`
  - session 1: `94`
  - session 2: `96`
  - session 3: `80`
  - session 4: `94`
  - session 5: `106`

Current constraint mix:

- `1` × `RepeatEncounter`
- `20` × `ImmovablePerson`
- `8` × `MustStayTogether`
- `44` × `ShouldStayTogether`
- `72` × `ShouldNotBeTogether`
- `96` × `PairMeetingCount`
- `36` × session-scoped `AttributeBalance`

Current design notes:

- `ShouldNotBeTogether` windows are intentionally distributed across many different shared-session patterns instead of clustering on one overlap signature.
- `ShouldStayTogether` is no longer limited to the planted buddy skeleton; the builder now derives additional planted-feasible pair constraints from pairs that stay together across all of their shared sessions.
- `PairMeetingCount` constraints are derived from the planted feasible schedule and use exact target meeting counts over distributed session windows, so they add real cross-session coupling without introducing impossible targets.
- `AttributeBalance` constraints are now defined with **exact full planted distributions** for `Gender`, `Track`, and `Region`, so their targets cover the whole group composition rather than leaving large unconstrained slack.
- `AttributeBalance` pressure is spread across **all 6 sessions** (`6` balance constraints per session), not concentrated in a single session.

## Why this is separate from the primary objective aggregate

This benchmark is valuable as a **targeted stress benchmark** for the feature combination above.

After scaling the synthetic package closer to the real Sailing Trip regime, this case now carries **277 total constraints** (still below Sailing Trip's `361`, but much closer than the earlier ~100-constraint version).

That heavier package is intended to create the kind of entangled local minima seen in the real demo workload rather than a quickly solved toy basin. It remains a **dedicated canonical stress benchmark** rather than a primary aggregate member until it proves useful as a stable keep/discard signal across research runs.

## Current measured local runs

Fixed-time suite:

```bash
gm-cli benchmark run --manifest backend/benchmarking/suites/stretch-partial-attendance-capacity-pressure-time.yaml
```

Observed local result:

- stop reason: `time_limit_reached`
- runtime: `15.003052788s`
- iterations: `1,294,434`
- initial score: `18057.0`
- final score: `6529.0`

Fixed-iteration companion:

```bash
gm-cli benchmark run --manifest backend/benchmarking/suites/stretch-partial-attendance-capacity-pressure-fixed-iteration.yaml
```

Observed local result:

- stop reason: `max_iterations_reached`
- runtime: `3.463344568s`
- iterations: `260,000`
- initial score: `18057.0`
- final score: `6786.0`

Solver3 fixed-time run:

```bash
gm-cli benchmark run --manifest backend/benchmarking/suites/stretch-partial-attendance-capacity-pressure-time-solver3.yaml
```

Observed local result:

- solver family: `solver3`
- stop reason: `no_improvement_limit_reached`
- runtime: `11.870528157s`
- iterations: `566,998`
- initial score: `10706.0`
- final score: `4478.0`

## Validation performed

The generated planted schedule was validated under the shared warm-start contract before using the case.

Additional validation run for the benchmark package:

- `cargo test -p gm-benchmarking`
- dedicated fixed-time benchmark run
- dedicated fixed-iteration benchmark run
- dedicated solver3 fixed-time benchmark run

## Regeneration

To regenerate the case deterministically:

```bash
python3 tools/benchmarking/generate_partial_attendance_capacity_case.py
```

Optional helper outputs used only for local validation during generation:

```bash
python3 tools/benchmarking/generate_partial_attendance_capacity_case.py \
  --summary-output /tmp/partial-capacity-summary.json \
  --planted-output /tmp/partial-capacity-planted.json
```
