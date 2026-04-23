import { test, expect } from '@playwright/test';
import { clickAndWaitForUrl, closeTransientUi, openApp, openAppRoute } from './helpers';

test.describe('Solver', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await closeTransientUi(page);
  });

  test('can navigate to solver tab', async ({ page }) => {
    const solverLink = page.getByRole('link', { name: /Solver/i }).last();
    await clickAndWaitForUrl(page, solverLink, /\/app\/solver/);

    await expect(page.locator('main')).toBeVisible();
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

  test('saved results tab is accessible', async ({ page }) => {
    await openAppRoute(page, '/app/history', /\/app\/history/);

    await expect(page.locator('main')).toBeVisible();
  });

  test('current result tab is accessible', async ({ page }) => {
    await openAppRoute(page, '/app/results', /\/app\/results/);

    await expect(page.locator('main')).toBeVisible();
  });

  test('manual editor tab is accessible', async ({ page }) => {
    await clickAndWaitForUrl(page, page.getByRole('link', { name: /editor|manual editor/i }), /\/app\/editor/);

    await expect(page.locator('main')).toBeVisible();
  });
});
