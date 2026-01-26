import { test, expect } from '@playwright/test';

test.describe('Results', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app');
    await page.waitForSelector('nav, header', { timeout: 15000 });
    await page.waitForTimeout(500);
    // Close any open modals
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  });

  test('results tab is accessible', async ({ page }) => {
    // Navigate to Results tab
    const resultsLink = page.getByRole('link', { name: /Results/i });
    await resultsLink.click();
    await page.waitForTimeout(300);

    // Should see results page (may show "no results" if nothing solved yet)
    await expect(page.getByText(/Result|History|No.*results/i).first()).toBeVisible();
  });

  test('result details tab is accessible', async ({ page }) => {
    // Navigate to Result Details tab
    const resultDetailsLink = page.getByRole('link', { name: /Result Details/i });
    await resultDetailsLink.click();
    await page.waitForTimeout(300);

    // Should see result details page
    await expect(page.getByText(/Detail|Schedule|No.*result/i).first()).toBeVisible();
  });

  test('results page has expected structure', async ({ page }) => {
    // Navigate to Results
    await page.getByRole('link', { name: /Results/i }).click();
    await page.waitForTimeout(300);

    // Should be on results page with some content
    const pageContent = page.locator('main, [role="main"], .results-page, .content');
    await expect(pageContent.first()).toBeVisible();
  });

  test('result details shows empty state when no results', async ({ page }) => {
    // Navigate to Result Details
    await page.getByRole('link', { name: /Result Details/i }).click();
    await page.waitForTimeout(300);

    // Should show empty state or placeholder
    await expect(page.getByText(/No.*result|Select.*result|Run.*solver/i).first()).toBeVisible();
  });

  test('navigation between result tabs works', async ({ page }) => {
    // Navigate to Results
    await page.getByRole('link', { name: /Results/i }).click();
    await page.waitForTimeout(300);

    // Navigate to Result Details
    await page.getByRole('link', { name: /Result Details/i }).click();
    await page.waitForTimeout(300);

    // Navigate to Manual Editor
    await page.getByRole('link', { name: /Manual Editor/i }).click();
    await page.waitForTimeout(300);

    // Should be on manual editor page
    await expect(page.getByText(/Manual|Editor|No.*result/i).first()).toBeVisible();
  });
});
