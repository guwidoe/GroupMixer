import { test, expect } from '@playwright/test';

test.describe('Import/Export and Demo Data', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app');
    await page.waitForSelector('nav, header', { timeout: 15000 });
    await page.waitForTimeout(500);
    // Close any open modals
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  });

  test('demo data dropdown is accessible', async ({ page }) => {
    // Find the Demo Data button in the header
    const demoButton = page.getByRole('button', { name: /Demo Data/i });
    await expect(demoButton).toBeVisible();

    // Click to open dropdown
    await demoButton.click();
    await page.waitForTimeout(300);

    // Should see demo options
    await expect(page.getByText(/Simple|Intermediate|Advanced|Small Team|Conference/i).first()).toBeVisible();

    // Close by pressing Escape
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

  test('manage problems modal can open', async ({ page }, testInfo) => {
    // Skip on mobile - button may be hidden in mobile menu
    test.skip(testInfo.project.name === 'mobile-chrome', 'Manage Problems button not directly accessible on mobile');
    
    // Click Manage Problems button
    const manageButton = page.getByRole('button', { name: /Manage Problems/i });
    await manageButton.click();

    // Should open modal with Problem Manager title
    await expect(page.getByRole('heading', { name: /Problem Manager/i })).toBeVisible();

    // Close modal
    await page.keyboard.press('Escape');
  });
});
