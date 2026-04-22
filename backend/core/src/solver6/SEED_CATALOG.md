# Solver6 Seed Catalog

This document defines the **explicit offline seed catalog** for `solver6`.

It exists to make `solver6` usable as a stronger universal seeder without adding hidden runtime cheats or silent fallback behavior.

## Purpose

`solver6` often spends most of its runtime in **seed synthesis**, not local search.

The seed catalog addresses that by allowing expensive seed builds to be:

- generated offline,
- versioned explicitly,
- validated on load,
- and reused only through an explicit configuration surface.

It is **not**:

- a hidden benchmark-specific shortcut,
- an opaque final-answer database,
- or a silent fallback path.

## What is stored

The catalog stores **seed artifacts**, not final solved schedules after local search.

Current storage choice:

- store the **full seed schedule**,
- store seed diagnostics and pair telemetry,
- store provenance and compatibility metadata,
- store mixed-seed candidate summaries,
- and record estimated recipe-size data for divisible exact-block cases.

Why full schedules first:

- they cover both divisible exact-block cases and non-divisible mixed-tail cases,
- they are simple to validate honestly,
- and they avoid pretending every stored seed can be reconstructed from a smaller recipe today.

For exact-block-only cases, the generator also records an **estimated exact-block recipe JSON size** so we can compare storage tradeoffs over time.

## Compatibility contract

A catalog entry is keyed by:

- `num_groups`
- `group_size`
- `num_weeks`
- `seed_strategy`
- `pair_repeat_penalty_model`

Compatibility is strict.

A runtime lookup must also match:

- `schema_version`
- `seed_policy_version`

If any of those differ, the entry is rejected explicitly.

## Runtime semantics

Catalog use is configured via `Solver6Params.seed_catalog`.

That config includes:

- `manifest_path`
- `miss_policy`

Supported miss policies:

- `error` — fail explicitly if no compatible catalog entry exists
- `fall_back_to_live_seed` — fall back explicitly to live `solver6` seed synthesis

This preserves the repo doctrine:

- no hidden fallbacks
- explicit configuration or explicit failure
- honest unsupported behavior

## Execution order

When `solver6` runs:

1. pure-SGP validation still happens first
2. exact solver5 handoff still happens first for exact cells
3. if configured, the seed catalog is consulted for the hybrid seed path
4. on a hit, the catalog seed is used and surfaced in reporting as `catalog:<family>`
5. on a miss:
   - `error` => fail explicitly
   - `fall_back_to_live_seed` => continue with live seed synthesis explicitly
6. local search proceeds from the chosen seed as usual

## Generator workflow

Use the example generator:

```bash
cargo run -q -p gm-core --example solver6_seed_catalog -- \
  --output-dir /tmp/solver6-seed-catalog \
  --max-groups 20 \
  --max-group-size 20 \
  --max-weeks 20 \
  --threshold-seconds 0.1 \
  --seed 42 \
  --pair-repeat-penalty-model linear_repeat_excess \
  --git-commit $(git rev-parse --short HEAD)
```

Outputs:

- `manifest.json`
- `entries/*.json`
- `threshold-report.json`

The generator:

- skips cases already handled by exact solver5 handoff,
- skips shapes where solver6 still has no supported seed-construction route,
- and only catalogs the hybrid seed-construction lane that actually synthesizes a solver6 seed.

## Threshold policy

The initial policy is now explicitly **0.1 seconds**.

Rationale:

- the user explicitly chose `0.1s` as the first operating point,
- seed latency is the main bottleneck for universal seeding,
- and the generator now writes a threshold report for `0.1s`, `0.5s`, and `1.0s` so this choice can be revisited with real data.

`threshold-report.json` records:

- how many seeded cases exceed each threshold,
- total artifact bytes for those cases,
- and estimated exact-block recipe bytes where that estimate is available.

## Invalidation policy

Two layers matter:

### 1. Schema version

Bump `SOLVER6_SEED_CATALOG_SCHEMA_VERSION` when the on-disk JSON shape changes.

### 2. Seed policy version

Bump `SOLVER6_SEED_POLICY_VERSION` when the meaning of the generated seed changes materially, for example:

- different mixed-seed selection semantics
- different relabeling semantics
- different seed telemetry semantics
- or a new compatibility contract

When `seed_policy_version` changes, old catalog artifacts must be treated as stale.

## Sample manifest snippet

```json
{
  "schema_version": 1,
  "generated_by": "0.1.0",
  "seed_policy_version": "solver6_seed_policy_v1",
  "configured_threshold_micros": 100000,
  "entries": [
    {
      "key": {
        "num_groups": 15,
        "group_size": 15,
        "num_weeks": 20,
        "seed_strategy": "solver5_exact_block_composition",
        "pair_repeat_penalty_model": "linear_repeat_excess"
      },
      "selected_family": "heuristic_tail",
      "relative_entry_path": "entries/g15_p15_w20_linear_repeat_excess_heuristic_tail.json",
      "measured_seed_runtime_micros": 512341,
      "artifact_bytes": 84219,
      "estimated_exact_block_recipe_json_bytes": null
    }
  ]
}
```

## Reporting expectations

When a catalog entry is used, solver6 reporting should make that clear.

Current benchmark inspection surface exposes:

- `seed_family = "catalog:<family>"`
- `seed_source_detail = "manifest=..., entry=..."`

That keeps catalog usage inspectable instead of silent.
