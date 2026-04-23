# ScenarioDataGrid performance benchmark

This repo includes an opt-in Playwright benchmark for measuring Scenario Editor grid rendering costs in a real browser.

## Workload

The current benchmark targets:

- **People** page grid
- **Exact Sailing Trip demo fixture** (`stretch.sailing-trip-demo-real`)
- **100 rows per page**
- primary workflow: **enter edit mode**

This mirrors the current manual perf-check workload used for larger-list edit-mode regressions.

## Why a harness route exists

The benchmark uses a dedicated dev-only harness route instead of driving the full Demo Data UI flow.

Harness route:

- `/app/perf/people-grid`

The harness exists to reduce benchmark noise from:

- opening the workspace menu
- demo-data dropdown interactions and animation
- navigation between sections
- unrelated setup UI work

It still renders the real People grid with the exact Sailing Trip scenario data.

## Metrics

The benchmark currently records these browser-wall-clock metrics:

1. **enter_edit_mode**
   - click `Edit table`
   - wait for edit controls to become visible
   - wait two `requestAnimationFrame`s for the UI to settle

2. **first_editor_focus**
   - click the first visible Name editor
   - wait for focus + two animation frames

3. **first_editor_commit**
   - change the first visible Name editor value
   - blur to commit
   - wait two animation frames

## How to run

From `webapp/`:

```bash
npm run test:e2e:perf
```

This runs the benchmark in Chromium only and forces Playwright to run it serially.

The benchmark is **opt-in** and skipped during normal Playwright runs unless `RUN_GRID_PERF=1` is set.

## Artifact output

Results are written to:

- `webapp/e2e/artifacts/grid-performance/people-grid-edit-render-sailing-trip-100rows.chromium.json`

The artifact includes:

- warm-up runs
- measured runs
- median
- p90
- min / max
- timestamp
- browser / viewport metadata

## Baseline policy

Current policy is deliberately conservative:

- **collect and inspect baselines first**
- **do not hard-gate CI on thresholds yet**
- compare medians and p90s across branches/commits before introducing strict limits

This avoids false alarms while we learn the benchmark's noise floor on real machines.
