import { test, expect } from '@playwright/test';
import { closeTransientUi, openApp, openScenarioManager, openWorkspaceActions } from './helpers';

test.describe('Import/Export and Demo Data', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await closeTransientUi(page);
  });

  test('demo data dropdown is accessible', async ({ page }) => {
    await openWorkspaceActions(page);

    const demoButton = page.getByRole('button', { name: /Demo Data/i });
    await expect(demoButton).toBeVisible();

    await demoButton.click();

    await expect(page.getByText(/Simple|Intermediate|Advanced|Small Team|Conference/i).first()).toBeVisible();

    await page.keyboard.press('Escape');
  });

  test('save button is accessible', async ({ page }) => {
    await openWorkspaceActions(page);

    const saveButton = page.getByRole('button', { name: /Save scenario|Save/i });
    await expect(saveButton).toBeVisible();
  });

  test('load button is accessible', async ({ page }) => {
    await openWorkspaceActions(page);

    const loadButton = page.getByRole('button', { name: /Load scenario|Load/i });
    await expect(loadButton).toBeVisible();
  });

  test('manage scenarios modal can open', async ({ page }) => {
    await openScenarioManager(page);

    // Should open modal with Scenario Manager title
    await expect(page.getByRole('heading', { name: /Scenario Manager/i })).toBeVisible();

    // Close modal
    await page.keyboard.press('Escape');
  });
});
