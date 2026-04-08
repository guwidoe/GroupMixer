# Solver3 objective-quality autoresearch lane

This package is a light orchestration layer over the shared benchmarking and correctness infrastructure.

## Goal

Iterate on `solver3` internals only, with:

- **Primary metric:** fixed-time objective quality on a 6-case canonical hard bundle, scaled by `100` for readability
- **Secondary diagnostics:** fixed-iteration objective quality, solver3 raw-runtime / hotpath metrics, runtime and validation breakdowns
- **Checks:** broad shared correctness guardrails plus solver3-specific benchmark metadata / validation checks

## Primary fixed-time bundle

- `backend/benchmarking/suites/objective-canonical-adversarial-solver3-v1.yaml`
- `backend/benchmarking/suites/objective-canonical-stretch-solver3-v1.yaml`
- `backend/benchmarking/suites/correctness-edge-intertwined-solver3-v1.yaml`

The stretch solver3 bundle intentionally includes the synthetic partial-attendance stress case, so the solver3 autoresearch portfolio is:

1. `adversarial.clique-swap-functionality-35p`
2. `adversarial.transfer-attribute-balance-111p`
3. `stretch.social-golfer-32x8x10`
4. `stretch.large-gender-immovable-110p`
5. `stretch.sailing-trip-demo-real`
6. `stretch.synthetic-partial-attendance-capacity-pressure-152p`

## Fixed-iteration diagnostic companion

- `backend/benchmarking/suites/objective-diagnostic-fixed-iteration-adversarial-solver3-v1.yaml`
- `backend/benchmarking/suites/objective-diagnostic-fixed-iteration-stretch-solver3-v1.yaml`

## Runtime diagnostic companion

- `tools/autoresearch/solver3-raw-runtime/autoresearch.sh`

## Persistence note

`./autoresearch.sh` writes the latest full metric set to `autoresearch.last_run_metrics.json`. After each completed `run_experiment` + `log_experiment` cycle, patch the latest `autoresearch.jsonl` run entry with:

`python3 tools/autoresearch/patch_autoresearch_jsonl.py autoresearch.jsonl autoresearch.last_run_metrics.json`

This keeps the tool-managed history authoritative while preserving secondary diagnostics and per-case score history in the same file.

## Scope rules

The experiment loop may modify:

- `backend/core/src/solver3/**`
- this package's orchestration/metric files when signal quality needs improvement
- root `autoresearch.md`, `autoresearch.sh`, `autoresearch.checks.sh`, `autoresearch.ideas-to-try.md`, `autoresearch.ideas.md`

Off-limits during the solver3 objective loop:

- `backend/core/src/solver1/**`
- `backend/core/src/solver2/**`
- shared construction / validation / benchmarking plumbing, unless a blocking bug is found and the user confirms the fix direction
- benchmark case identity, seeds, budgets, or metric reference math

## Idea queue workflow

Before planning a fresh solver3 experiment, read `autoresearch.ideas-to-try.md`.

- `autoresearch.ideas-to-try.md` holds the strongest **untried** literature-backed ideas.
- `autoresearch.ideas.md` holds ideas that have already been **tried**, along with learnings and conclusions.
- Once an idea from `autoresearch.ideas-to-try.md` is materially tried in a real solver experiment, move it to `autoresearch.ideas.md` and record the outcome there.
