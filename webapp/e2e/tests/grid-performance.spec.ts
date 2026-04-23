import fs from 'node:fs/promises';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

const RUN_GRID_PERF = process.env.RUN_GRID_PERF === '1';
const PERF_ROUTE = '/app/perf/people-grid';
const BENCHMARK_NAME = 'people-grid-edit-render-sailing-trip-100rows';
const WARMUP_RUNS = 1;
const MEASURED_RUNS = 5;

test.describe('ScenarioDataGrid performance benchmark', () => {
  test.skip(!RUN_GRID_PERF, 'Opt in with RUN_GRID_PERF=1 to run the grid performance benchmark.');
  test.describe.configure({ mode: 'serial' });

  test('measures the People grid edit-mode latency on the Sailing Trip fixture', async ({ page }, testInfo) => {
    test.setTimeout(180000);

    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });

    const warmupRuns: BenchmarkRun[] = [];
    const measuredRuns: BenchmarkRun[] = [];

    for (let runIndex = 0; runIndex < WARMUP_RUNS + MEASURED_RUNS; runIndex += 1) {
      const run = await executeBenchmarkRun(page, runIndex + 1);
      if (runIndex < WARMUP_RUNS) {
        warmupRuns.push(run);
      } else {
        measuredRuns.push(run);
      }
    }

    const artifact = {
      benchmark: BENCHMARK_NAME,
      route: PERF_ROUTE,
      browser: testInfo.project.name,
      viewport: testInfo.project.use?.viewport ?? null,
      timestamp: new Date().toISOString(),
      warmup_runs: warmupRuns,
      measured_runs: measuredRuns,
      summary_ms: {
        enter_edit_mode: summarizeMetric(measuredRuns.map((run) => run.enterEditModeMs)),
        first_editor_focus: summarizeMetric(measuredRuns.map((run) => run.firstEditorFocusMs)),
        first_editor_commit: summarizeMetric(measuredRuns.map((run) => run.firstEditorCommitMs)),
      },
    };

    const artifactDir = path.resolve(process.cwd(), 'e2e/artifacts/grid-performance');
    await fs.mkdir(artifactDir, { recursive: true });
    const artifactPath = path.join(artifactDir, `${BENCHMARK_NAME}.${testInfo.project.name}.json`);
    await fs.writeFile(artifactPath, JSON.stringify(artifact, null, 2));

    await testInfo.attach('grid-performance-results', {
      path: artifactPath,
      contentType: 'application/json',
    });

    console.log(`\n[grid-perf] wrote ${artifactPath}`);
    console.log(`[grid-perf] enter-edit median=${artifact.summary_ms.enter_edit_mode.median.toFixed(2)}ms p90=${artifact.summary_ms.enter_edit_mode.p90.toFixed(2)}ms`);
    console.log(`[grid-perf] focus median=${artifact.summary_ms.first_editor_focus.median.toFixed(2)}ms p90=${artifact.summary_ms.first_editor_focus.p90.toFixed(2)}ms`);
    console.log(`[grid-perf] commit median=${artifact.summary_ms.first_editor_commit.median.toFixed(2)}ms p90=${artifact.summary_ms.first_editor_commit.p90.toFixed(2)}ms`);

    expect(measuredRuns).toHaveLength(MEASURED_RUNS);
    expect(artifact.summary_ms.enter_edit_mode.median).toBeGreaterThan(0);
  });
});

interface BenchmarkRun {
  run: number;
  enterEditModeMs: number;
  firstEditorFocusMs: number;
  firstEditorCommitMs: number;
}

async function executeBenchmarkRun(page: Page, runNumber: number): Promise<BenchmarkRun> {
  await page.goto(PERF_ROUTE);
  await expect(page.getByTestId('people-grid-perf-ready')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('heading', { name: /^people$/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /edit table/i })).toBeVisible();

  const editButton = page.getByRole('button', { name: /edit table/i });
  const firstNameEditor = page.getByRole('textbox', { name: /edit name for row/i }).first();

  const enterEditModeMs = await withBrowserMeasure(page, 'enter-edit-mode', async () => {
    await editButton.click();
    await expect(page.getByRole('button', { name: /apply changes/i })).toBeVisible();
    await expect(firstNameEditor).toBeVisible();
  });

  const firstEditorFocusMs = await withBrowserMeasure(page, 'focus-first-editor', async () => {
    await firstNameEditor.click();
    await expect(firstNameEditor).toBeFocused();
  });

  const nextValue = `Perf benchmark ${runNumber}`;
  await firstNameEditor.fill(nextValue);

  const firstEditorCommitMs = await withBrowserMeasure(page, 'commit-first-editor', async () => {
    await firstNameEditor.blur();
    await expect(firstNameEditor).toHaveValue(nextValue);
  });

  return {
    run: runNumber,
    enterEditModeMs,
    firstEditorFocusMs,
    firstEditorCommitMs,
  };
}

async function withBrowserMeasure(page: Page, metricName: string, action: () => Promise<void>) {
  await page.evaluate((name) => {
    performance.clearMarks(`${name}:start`);
    performance.clearMarks(`${name}:end`);
    performance.clearMeasures(name);
    performance.mark(`${name}:start`);
  }, metricName);

  await action();

  return page.evaluate(async (name) => {
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    performance.mark(`${name}:end`);
    performance.measure(name, `${name}:start`, `${name}:end`);
    const entries = performance.getEntriesByName(name);
    return entries[entries.length - 1]?.duration ?? 0;
  }, metricName);
}

function summarizeMetric(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    min: sorted[0] ?? 0,
    median: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    max: sorted[sorted.length - 1] ?? 0,
  };
}

function percentile(sortedValues: number[], percentileValue: number) {
  if (sortedValues.length === 0) {
    return 0;
  }

  const rawIndex = (sortedValues.length - 1) * percentileValue;
  const lowerIndex = Math.floor(rawIndex);
  const upperIndex = Math.ceil(rawIndex);
  const lowerValue = sortedValues[lowerIndex] ?? sortedValues[sortedValues.length - 1] ?? 0;
  const upperValue = sortedValues[upperIndex] ?? lowerValue;

  if (lowerIndex === upperIndex) {
    return lowerValue;
  }

  const weight = rawIndex - lowerIndex;
  return lowerValue + ((upperValue - lowerValue) * weight);
}
