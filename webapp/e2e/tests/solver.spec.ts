import { test, expect } from '@playwright/test';
import { clickAndWaitForUrl, closeTransientUi, openApp } from './helpers';

test.describe('Solver', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await closeTransientUi(page);
  });

  test('can navigate to solver tab', async ({ page }) => {
    const solverLink = page.getByRole('link', { name: /Solver/i }).or(
      page.locator('a').filter({ hasText: /Solver/i })
    );
    await clickAndWaitForUrl(page, solverLink, /\/app\/solver/);

    await expect(page.getByText(/Start|Solver|Settings/i).first()).toBeVisible();
  });

  test('solver page shows control buttons', async ({ page }) => {
    await clickAndWaitForUrl(page, page.getByRole('link', { name: /Solver/i }), /\/app\/solver/);

    const startButton = page.getByRole('button', { name: /Start|Run|Solve/i }).first();
    await expect(startButton).toBeVisible();
  });

  test('solver shows settings or parameters', async ({ page }) => {
    await clickAndWaitForUrl(page, page.getByRole('link', { name: /Solver/i }), /\/app\/solver/);

    await expect(page.getByText(/Settings|Parameters|Configuration|Iteration|Auto/i).first()).toBeVisible();
  });

  test('results tab is accessible', async ({ page }) => {
    await clickAndWaitForUrl(page, page.getByRole('link', { name: /Results/i }), /\/app\/history/);

    await expect(page.getByText(/Result|Schedule|History|No.*results/i).first()).toBeVisible();
  });

  test('result details tab is accessible', async ({ page }) => {
    await clickAndWaitForUrl(page, page.getByRole('link', { name: /Result Details/i }), /\/app\/results/);

    await expect(page.getByText(/Detail|Metric|Schedule|No.*result/i).first()).toBeVisible();
  });

  test('manual editor tab is accessible', async ({ page }) => {
    await clickAndWaitForUrl(page, page.getByRole('link', { name: /Manual Editor/i }), /\/app\/editor/);

    await expect(page.getByText(/Manual|Edit|Schedule|No.*result/i).first()).toBeVisible();
  });
});
