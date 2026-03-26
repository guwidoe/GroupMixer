import { test, expect } from '@playwright/test';
import { closeTransientUi, openApp, openProblemManager } from './helpers';

test.describe('Import/Export and Demo Data', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await closeTransientUi(page);
  });

  test('demo data dropdown is accessible', async ({ page }) => {
    // Find the Demo Data button in the header
    const demoButton = page.getByRole('button', { name: /Demo Data/i });
    await expect(demoButton).toBeVisible();

    await demoButton.click();

    await expect(page.getByText(/Simple|Intermediate|Advanced|Small Team|Conference/i).first()).toBeVisible();

    await page.keyboard.press('Escape');
  });

  test('save button is accessible', async ({ page }) => {
    // Find the Save button in the header
    const saveButton = page.getByRole('button', { name: /Save/i });
    await expect(saveButton).toBeVisible();
  });

  test('load button is accessible', async ({ page }) => {
    // Find the Load button in the header
    const loadButton = page.getByRole('button', { name: /Load/i });
    await expect(loadButton).toBeVisible();
  });

  test('manage problems modal can open', async ({ page }) => {
    await openProblemManager(page);

    // Should open modal with Problem Manager title
    await expect(page.getByRole('heading', { name: /Problem Manager/i })).toBeVisible();

    // Close modal
    await page.keyboard.press('Escape');
  });
});
