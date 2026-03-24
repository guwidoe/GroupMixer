import { test, expect } from '@playwright/test';
import { clickAndWaitForUrl, closeTransientUi, openApp } from './helpers';

test.describe('Results', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await closeTransientUi(page);
  });

  test('results tab is accessible', async ({ page }) => {
    await clickAndWaitForUrl(page, page.getByRole('link', { name: /Results/i }), /\/app\/history/);

    await expect(page.getByText(/Result|History|No.*results/i).first()).toBeVisible();
  });

  test('result details tab is accessible', async ({ page }) => {
    await clickAndWaitForUrl(page, page.getByRole('link', { name: /Result Details/i }), /\/app\/results/);

    await expect(page.getByText(/Detail|Schedule|No.*result/i).first()).toBeVisible();
  });

  test('results page has expected structure', async ({ page }) => {
    await clickAndWaitForUrl(page, page.getByRole('link', { name: /Results/i }), /\/app\/history/);

    const pageContent = page.locator('main, [role="main"], .results-page, .content');
    await expect(pageContent.first()).toBeVisible();
  });

  test('result details shows empty state when no results', async ({ page }) => {
    await clickAndWaitForUrl(page, page.getByRole('link', { name: /Result Details/i }), /\/app\/results/);

    await expect(page.getByText(/No.*result|Select.*result|Run.*solver/i).first()).toBeVisible();
  });

  test('navigation between result tabs works', async ({ page }) => {
    await clickAndWaitForUrl(page, page.getByRole('link', { name: /Results/i }), /\/app\/history/);
    await clickAndWaitForUrl(page, page.getByRole('link', { name: /Result Details/i }), /\/app\/results/);
    await clickAndWaitForUrl(page, page.getByRole('link', { name: /Manual Editor/i }), /\/app\/editor/);

    await expect(page.getByText(/Manual|Editor|No.*result/i).first()).toBeVisible();
  });
});
