import { test, expect } from '@playwright/test';
import { navigateScenarioSetupSection, openApp, waitForModal } from './helpers';

test.describe('Scenario data-grid workspace', () => {
  test('uses shared grid modes for People bulk edit while keeping preview CSV in browse-only sections', async ({ page }) => {
    test.setTimeout(60000);

    await openApp(page);

    for (const name of ['Alice', 'Bob']) {
      await page.getByRole('button', { name: /^add person$/i }).click();
      await waitForModal(page);
      await page.getByPlaceholder(/enter person's name/i).fill(name);
      await page.locator('.modal-content').getByRole('button', { name: /^add person$/i }).click();
      await expect(page.getByText(name).first()).toBeVisible();
    }

    await page.getByRole('button', { name: /^list$/i }).click();
    await page.getByRole('button', { name: /edit table/i }).click();

    await expect(page.getByRole('button', { name: /apply changes/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /back to directory/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /edit name for bulk row 1/i })).toBeVisible();

    await page.getByRole('button', { name: /^csv$/i }).click();
    const peopleCsv = page.getByRole('textbox', { name: /people bulk edit csv/i });
    await expect(peopleCsv).toBeVisible();
    await expect(peopleCsv).toHaveValue(/id,name/);
    await expect(page.getByText(/blank cells keep current values/i)).toBeVisible();

    await page.getByRole('button', { name: /^csv$/i }).click();
    await expect(page.getByRole('button', { name: /edit table/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /apply changes/i })).toHaveCount(0);

    await navigateScenarioSetupSection(page, /groups/i);
    await page.getByRole('button', { name: /^add group$/i }).click();
    await waitForModal(page);
    await page.getByPlaceholder(/team-alpha|group-1/i).fill('Team Alpha');
    await page.locator('.modal-content input[type="number"]').fill('2');
    await page.locator('.modal-content').getByRole('button', { name: /^add group$/i }).click();
    await expect(page.getByText('Team Alpha').first()).toBeVisible();

    await page.getByRole('button', { name: /^csv$/i }).click();
    await expect(page.getByRole('heading', { name: /csv preview/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /csv preview content/i })).toHaveValue(/Team Alpha/);
    await expect(page.getByRole('textbox', { name: /people bulk edit csv/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /edit table/i })).toHaveCount(0);
  });
});
