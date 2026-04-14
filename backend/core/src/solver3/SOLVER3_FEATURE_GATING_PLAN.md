# Solver3 feature gating plan

Date: 2026-04-14

## Goal

Keep the normal product/webapp solver3 build lean and explicit, while retaining the heavier solver3 research modes in-tree behind opt-in Cargo features.

This is a build-surface cleanup plan, not a new algorithm plan.

## Current benchmark champion to preserve

The best combined long-budget solver3 result currently recorded in autoresearch remains:

- commit: `09f897c`
- primary metric: `metaheuristic_suite_weighted_normalized_score = 88.58182385048653`

That kept result came from the **research** zero-repeat route, not from the plain production default:

- pure zero-repeat capability routing
- `search_driver = donor_session_transplant`
- `local_improver = sgp_week_pair_tabu`
- aggressive donor trigger/cooldown `10000 / 10000`
- broader feature-rich cases stayed on truthful baseline modes

So the current best aggregate benchmark result depends on experimental recombination machinery.

## Production vs research boundary

### Production/default build surface

The default production build should keep only the solver3 capabilities we are willing to treat as normal product surface:

- `search_driver = single_state`
- `local_improver = record_to_record`
- `local_improver = sgp_week_pair_tabu`
- correctness lane (`solver3-oracle-checks` remains separate as today)
- baseline telemetry / benchmark artifact support

These are the modes the webapp / wasm build should assume by default.

### Research-only build surface

The following solver3 capabilities should become explicit opt-in research features:

- repeat-guided hotspot proposal generation
- steady-state memetic driver
- donor-session transplant driver
- session-aligned path relinking driver
- multi-root balanced session inheritance driver

Related archive/recombination implementation code should also be gated with the same research features.

## Proposed Cargo features

Use a small explicit set plus one convenience umbrella:

- `solver3-experimental-repeat-guidance`
- `solver3-experimental-memetic`
- `solver3-experimental-recombination`
- `solver3-research-all`

Where:

- `solver3-experimental-repeat-guidance` gates repeat-guided hotspot proposal logic
- `solver3-experimental-memetic` gates steady-state memetic search-driver code
- `solver3-experimental-recombination` gates:
  - donor-session transplant
  - session-aligned path relinking
  - multi-root balanced session inheritance
  - supporting archive / cross-root recombination substrate
- `solver3-research-all` enables all three research features

## Public config policy

Public config types may remain serializable so manifests and saved configs stay readable, but production/default builds must fail clearly if they request a feature-gated mode.

That means:

- no silent fallback to `single_state`
- no hidden downgrade from recombination to random search
- validation error messages must say the configured mode requires a disabled compile-time feature

This keeps build behavior honest while avoiding schema churn across all consumers.

## Build defaults by crate

### `gm-core`

- default: production-only solver3 surface
- opt-in research features forwarded here first

### `gm-contracts`

- default: production-only
- re-export matching research features to `gm-core`

### `gm-benchmarking`

- default: production-only
- re-export matching research features to `gm-core`

### `gm-cli`

- default: production-only
- research benchmark lanes must be invoked with explicit feature flags

### `gm-wasm`

- default: production-only
- webapp / wasm daily-driver builds should not compile in research-only modes unless explicitly requested

## Benchmark/tooling policy

### Production benchmark lane

Production/default benchmark claims must use a build without research features.

That lane answers:

- what the default webapp-facing solver3 build can actually do
- whether the product daily driver regressed

### Research benchmark lane

Research-only manifests and autoresearch loops must be run with explicit feature flags enabled.

Canonical command shape:

```bash
cargo run -p gm-cli --release --features solver3-research-all -- benchmark run --manifest <manifest>
```

or crate-local equivalents where needed.

## Webapp daily-driver decision

For now, the webapp daily driver should remain pinned to the **production/default solver3 surface**, not to the full research champion route.

Reason:

- the aggregate benchmark champion currently depends on research-only recombination code
- that research route is still semantically narrow and not product-settled
- compile-time gating is specifically intended to keep those modes from being treated as normal product surface by default

So after this cleanup:

- the benchmark champion `09f897c` remains the preserved research reference
- the default shipped webapp build remains production-only unless a later benchmark-backed product decision explicitly opts into research features

## Migration impact

### `gm-core`

Needs:

- Cargo features
- `#[cfg]` gating or stubs around research search modules
- explicit validation failures for disabled research modes
- repeat-guidance stub/disable behavior when the feature is off

### `gm-contracts`

Needs:

- feature forwarding only
- no silent reinterpretation of disabled modes

### `gm-cli`

Needs:

- feature forwarding
- research benchmark/docs commands updated to pass explicit features

### `gm-benchmarking`

Needs:

- feature forwarding
- docs/tests/manifests workflow split into production vs research invocation expectations

### `gm-wasm` / webapp

Needs:

- wasm crate feature forwarding
- production/default webapp build stays on production-only feature set
- any future research-enabled webapp build must opt in explicitly

### Benchmark manifests

The manifests themselves can remain readable as-is.

Expected behavior:

- production/default build + research manifest => explicit validation/build-time failure during run
- research-enabled build + research manifest => supported

## Non-goals

This plan does **not** claim:

- that the research benchmark champion should become the default shipped solver immediately
- that research telemetry/schema should be deleted
- that SGP-like recombination work is finished or endorsed as production-ready

## Success criteria

1. Default Cargo builds compile without the research search-driver implementations.
2. Research builds can opt back in explicitly.
3. Requests for disabled research modes fail clearly.
4. Production/default benchmark claims are separated from research-enabled benchmark claims.
5. The webapp daily driver remains explicitly pinned to the production solver3 surface unless changed later by a benchmark-backed product decision.
