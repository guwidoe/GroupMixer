# Solver3 metaheuristic-quality autoresearch lane

This lane is for the newer solver3 metaheuristic surfaces: advanced local improvers, donor/memetic wiring, capability gating, and any future feature-complete global-search additions.

Because this lane exercises research-only solver3 modes, it must run with the solver3 research Cargo feature set enabled.

## Goal

Improve **final incumbent quality** for solver3 under much longer search budgets while keeping the feature surface honest.

The lane intentionally mixes:

- representative day-to-day workloads
- transfer-heavy adversarial workloads
- clique / must-stay-together workloads
- long-horizon Social Golfer / Kirkman zero-repeat workloads
- large immovable / attribute-balance workloads
- heavy partial-attendance / capacity-pressure workloads

## Primary fixed-time bundle

- `backend/benchmarking/suites/objective-canonical-representative-solver3-metaheuristic-v1.yaml`
- `backend/benchmarking/suites/objective-canonical-adversarial-solver3-metaheuristic-v1.yaml`
- `backend/benchmarking/suites/objective-canonical-stretch-solver3-metaheuristic-v1.yaml`
- `backend/benchmarking/suites/correctness-edge-intertwined-solver3-v1.yaml`

Time budget target:
- `150s` per canonical objective case

Canonical objective portfolio:
1. `representative.small-workshop-balanced`
2. `representative.small-workshop-constrained`
3. `adversarial.clique-swap-functionality-35p`
4. `adversarial.transfer-attribute-balance-111p`
5. `stretch.social-golfer-32x8x10`
6. `stretch.kirkman-schoolgirls-15x5x7`
7. `stretch.large-gender-immovable-110p`
8. `stretch.sailing-trip-demo-real`
9. `stretch.synthetic-partial-attendance-capacity-pressure-152p`

## Fixed-iteration diagnostic companion

- `backend/benchmarking/suites/objective-diagnostic-fixed-iteration-representative-solver3-metaheuristic-v1.yaml`
- `backend/benchmarking/suites/objective-diagnostic-fixed-iteration-adversarial-solver3-metaheuristic-v1.yaml`
- `backend/benchmarking/suites/objective-diagnostic-fixed-iteration-stretch-solver3-metaheuristic-v1.yaml`

Iteration budget target:
- `7,000,000` iterations per canonical objective case

## Runtime diagnostic companion

- `tools/autoresearch/solver3-raw-runtime/autoresearch.sh`

## Build mode

Research/autoresearch commands in this lane must opt into the research feature set explicitly.

Default command shape:

```bash
cargo run --release -p gm-cli --features solver3-research-all -- benchmark run --manifest <manifest>
```

`tools/autoresearch/solver3-metaheuristic-quality/autoresearch.sh` now does this automatically.

## Persistence note

`./autoresearch.sh` writes the latest full metric set to `autoresearch.last_run_metrics.json`.

After each completed `run_experiment` + `log_experiment` cycle, patch the latest `autoresearch.jsonl` entry with:

`python3 tools/autoresearch/patch_autoresearch_jsonl.py autoresearch.jsonl autoresearch.last_run_metrics.json`

## Scope rules

The loop may modify:

- `backend/core/src/solver3/**`
- `backend/core/src/models.rs` when new solver3 search config / telemetry needs clean surfaced schema
- `backend/core/tests/search_driver_regression.rs`
- `backend/benchmarking/suites/*solver3-metaheuristic-v1.yaml`
- `tools/autoresearch/solver3-metaheuristic-quality/**`
- root `autoresearch.md`, `autoresearch.sh`, `autoresearch.checks.sh`, `autoresearch.config.json`
- root `autoresearch.ideas-to-try.md`, `autoresearch.ideas.md`

Off-limits unless the user explicitly changes the benchmark question:

- `backend/core/src/solver1/**`
- `backend/core/src/solver2/**`
- solver3 constructor work
- silent fallback / hidden downgrade behavior for unsupported advanced modes
- benchmark case identity, seeds, per-case budgets, or metric formulas during the loop

## Research bias

Bias toward experiments that improve the new advanced search surfaces **without losing semantic honesty**:

- broader feature support for advanced search drivers
- clean capability gating instead of silent fallback
- rare but stronger recombination / diversification
- new compatible local improvers for non-SGP workloads
- architecture that lets advanced modes work across cliques, transfers, immovables, partial attendance, and session-specific constraints

Do not spend this lane on tiny schedule/temperature micro-tuning unless it is directly in service of a newly added mechanism.
