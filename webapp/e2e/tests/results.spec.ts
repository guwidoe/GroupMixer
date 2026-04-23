import { test, expect } from '@playwright/test';
import { clickAndWaitForUrl, closeTransientUi, openApp, openAppRoute } from './helpers';

test.describe('Results', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await closeTransientUi(page);
  });

  test('saved results tab is accessible', async ({ page }) => {
    await openAppRoute(page, '/app/history', /\/app\/history/);

    await expect(page.locator('main')).toBeVisible();
  });

  test('current result tab is accessible', async ({ page }) => {
    await openAppRoute(page, '/app/results', /\/app\/results/);

    await expect(page.locator('main')).toBeVisible();
  });

  test('saved results page has expected structure', async ({ page }) => {
    await openAppRoute(page, '/app/history', /\/app\/history/);

    const pageContent = page.locator('main, [role="main"], .results-page, .content');
    await expect(pageContent.first()).toBeVisible();
    await expect(page.locator('main')).toContainText(/saved results|no scenario selected/i);
  });

  test('current result shows empty state when no results', async ({ page }) => {
    await openAppRoute(page, '/app/results', /\/app\/results/);

    await expect(page.locator('main')).toContainText(/No.*result|Select.*result|Run.*solver/i);
  });

  test('navigation between saved results and current result works', async ({ page }) => {
    await openAppRoute(page, '/app/history', /\/app\/history/);
    await openAppRoute(page, '/app/results', /\/app\/results/);
    await clickAndWaitForUrl(page, page.getByRole('link', { name: /editor|manual editor/i }), /\/app\/editor/);

    await expect(page.locator('main')).toBeVisible();
  });
});
