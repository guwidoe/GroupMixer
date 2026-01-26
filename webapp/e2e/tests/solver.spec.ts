import { test, expect } from '@playwright/test';

test.describe('Solver', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app');
    await page.waitForSelector('nav, header', { timeout: 15000 });
    await page.waitForTimeout(500);
    // Close any open modals
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  });

  test('can navigate to solver tab', async ({ page }) => {
    // Click Solver tab in navigation
    const solverLink = page.getByRole('link', { name: /Solver/i }).or(
      page.locator('a').filter({ hasText: /Solver/i })
    );
    await solverLink.click();

    // Should see solver page content - start button or solver panel
    await expect(page.getByText(/Start|Solver|Settings/i).first()).toBeVisible();
  });

  test('solver page shows control buttons', async ({ page }) => {
    // Navigate to solver
    await page.getByRole('link', { name: /Solver/i }).click();
    await page.waitForTimeout(300);

    // Should see Start/Stop type buttons
    const startButton = page.getByRole('button', { name: /Start|Run|Solve/i }).first();
    await expect(startButton).toBeVisible();
  });

  test('solver shows settings or parameters', async ({ page }) => {
    // Navigate to solver
    await page.getByRole('link', { name: /Solver/i }).click();
    await page.waitForTimeout(300);

    // Should see settings section or parameters
    await expect(page.getByText(/Settings|Parameters|Configuration|Iteration|Auto/i).first()).toBeVisible();
  });

  test('results tab is accessible', async ({ page }) => {
    // Navigate to results
    const resultsLink = page.getByRole('link', { name: /Results/i });
    await resultsLink.click();
    await page.waitForTimeout(300);

    // Should see results page
    await expect(page.getByText(/Result|Schedule|History|No.*results/i).first()).toBeVisible();
  });

  test('result details tab is accessible', async ({ page }) => {
    // Navigate to result details
    const resultDetailsLink = page.getByRole('link', { name: /Result Details/i });
    await resultDetailsLink.click();
    await page.waitForTimeout(300);

    // Should see result details page content
    await expect(page.getByText(/Detail|Metric|Schedule|No.*result/i).first()).toBeVisible();
  });

  test('manual editor tab is accessible', async ({ page }) => {
    // Navigate to manual editor
    const manualEditorLink = page.getByRole('link', { name: /Manual Editor/i });
    await manualEditorLink.click();
    await page.waitForTimeout(300);

    // Should see manual editor content
    await expect(page.getByText(/Manual|Edit|Schedule|No.*result/i).first()).toBeVisible();
  });
});
