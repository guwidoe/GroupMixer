import { test, expect } from '@playwright/test';
import { clickAndWaitForUrl, closeTransientUi, openApp } from './helpers';

test.describe('Results', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await closeTransientUi(page);
  });

  test('results tab is accessible', async ({ page }) => {
    await clickAndWaitForUrl(page, page.getByRole('link', { name: /Results/i }), /\/app\/history/);

    await expect(page.locator('main')).toBeVisible();
  });

  test('result details tab is accessible', async ({ page }) => {
    await clickAndWaitForUrl(page, page.getByRole('link', { name: /details|result details/i }), /\/app\/results/);

    await expect(page.locator('main')).toBeVisible();
  });

  test('results page has expected structure', async ({ page }) => {
    await clickAndWaitForUrl(page, page.getByRole('link', { name: /Results/i }), /\/app\/history/);

    const pageContent = page.locator('main, [role="main"], .results-page, .content');
    await expect(pageContent.first()).toBeVisible();
  });

  test('result details shows empty state when no results', async ({ page }) => {
    await clickAndWaitForUrl(page, page.getByRole('link', { name: /details|result details/i }), /\/app\/results/);

    await expect(page.locator('main')).toContainText(/No.*result|Select.*result|Run.*solver/i);
  });

  test('navigation between result tabs works', async ({ page }) => {
    await clickAndWaitForUrl(page, page.getByRole('link', { name: /Results/i }), /\/app\/history/);
    await clickAndWaitForUrl(page, page.getByRole('link', { name: /details|result details/i }), /\/app\/results/);
    await clickAndWaitForUrl(page, page.getByRole('link', { name: /editor|manual editor/i }), /\/app\/editor/);

    await expect(page.locator('main')).toBeVisible();
  });
});
