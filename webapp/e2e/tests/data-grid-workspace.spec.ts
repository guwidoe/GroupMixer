import { test, expect } from '@playwright/test';
import { navigateScenarioSetupSection, openApp, waitForModal } from './helpers';

test.describe('Scenario data-grid workspace', () => {
  test('reuses typed grid edit and csv modes across People and Groups', async ({ page }) => {
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
    await expect(page.getByRole('button', { name: /edit table/i })).toBeVisible();

    await page.getByRole('button', { name: /^csv$/i }).click();
    const peopleCsv = page.getByRole('textbox', { name: /people grid csv/i });
    await expect(peopleCsv).toBeVisible();
    await expect(peopleCsv).toHaveValue(/Name,Sessions/);
    await expect(peopleCsv).toHaveValue(/1 \| 2 \| 3/);
    await expect(page.getByText(/arrays use/i)).toBeVisible();

    await page.getByRole('button', { name: /^edit table$/i }).click();
    await expect(page.getByRole('button', { name: /apply changes/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /discard changes/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /add row/i })).toBeVisible();
    await page.getByRole('button', { name: /discard changes/i }).click();
    await expect(page.getByRole('button', { name: /edit table/i })).toBeVisible();

    await navigateScenarioSetupSection(page, /groups/i);
    await expect(page.getByRole('heading', { name: /^groups$/i })).toBeVisible();
    await page.getByRole('button', { name: /^add group$/i }).click();
    await waitForModal(page);
    await page.getByPlaceholder(/team-alpha|group-1/i).fill('Team Alpha');
    await page.locator('.modal-content input[type="number"]').fill('2');
    await page.locator('.modal-content').getByRole('button', { name: /^add group$/i }).click();
    await expect(page.getByText('Team Alpha').first()).toBeVisible();

    await expect(page.getByRole('button', { name: /edit table/i })).toBeVisible();
    await page.getByRole('button', { name: /^csv$/i }).click();
    const groupsCsv = page.getByRole('textbox', { name: /groups grid csv/i });
    await expect(groupsCsv).toBeVisible();
    await expect(groupsCsv).toHaveValue(/Group,Default capacity,Session capacities/);
    await expect(groupsCsv).toHaveValue(/Team Alpha,2,2 \| 2 \| 2/);

    await page.getByRole('button', { name: /^edit table$/i }).click();
    await expect(page.getByRole('button', { name: /apply changes/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /discard changes/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /add row/i })).toBeVisible();
  });
});
