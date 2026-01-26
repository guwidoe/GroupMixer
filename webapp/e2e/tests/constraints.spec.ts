import { test, expect } from '@playwright/test';

test.describe('Constraints', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/app');
    // Wait for app to load
    await page.waitForSelector('nav, header', { timeout: 15000 });
    await page.waitForTimeout(500);

    // Close any open modals by pressing Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  });

  test('can navigate to hard constraints section', async ({ page }) => {
    const hardConstraintsBtn = page.getByRole('button', { name: /Hard Constraints/i });
    await hardConstraintsBtn.click();

    // Should show hard constraints panel - look for any constraint-related content
    await expect(page.getByText(/Immovable|Must Stay Together/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('can navigate to soft constraints section', async ({ page }) => {
    const softConstraintsBtn = page.getByRole('button', { name: /Soft Constraints/i });
    await softConstraintsBtn.click();

    // Should show soft constraints panel
    await expect(page.getByText(/Repeat Encounter|Attribute Balance/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('can open Immovable People modal', async ({ page }) => {
    await page.getByRole('button', { name: /Hard Constraints/i }).click();
    await page.waitForTimeout(300);

    // Look for Immovable People section/button
    const immovableSection = page.getByText(/Immovable/i).first();
    await expect(immovableSection).toBeVisible();
  });

  test('can open Must Stay Together modal', async ({ page }) => {
    await page.getByRole('button', { name: /Hard Constraints/i }).click();
    await page.waitForTimeout(300);

    // Look for Must Stay Together section
    const mustStaySection = page.getByText(/Must Stay Together/i).first();
    await expect(mustStaySection).toBeVisible();
  });

  test('can open Repeat Encounter section', async ({ page }) => {
    await page.getByRole('button', { name: /Soft Constraints/i }).click();
    await page.waitForTimeout(300);

    // Look for Repeat Encounter section
    const repeatSection = page.getByText(/Repeat.*Encounter|Max.*Encounters/i).first();
    await expect(repeatSection).toBeVisible();
  });

  test('can open Attribute Balance section', async ({ page }) => {
    await page.getByRole('button', { name: /Soft Constraints/i }).click();
    await page.waitForTimeout(300);

    // Look for Attribute Balance section
    const attrBalanceSection = page.getByText(/Attribute Balance/i).first();
    await expect(attrBalanceSection).toBeVisible();
  });

  test('can open Should Not Be Together section', async ({ page }) => {
    await page.getByRole('button', { name: /Soft Constraints/i }).click();
    await page.waitForTimeout(300);

    // Look for Should Not Be Together section
    const sntSection = page.getByText(/Should Not Be Together/i).first();
    await expect(sntSection).toBeVisible();
  });

  test('can open Should Stay Together section', async ({ page }) => {
    await page.getByRole('button', { name: /Soft Constraints/i }).click();
    await page.waitForTimeout(300);

    // Look for Should Stay Together section
    const sstSection = page.getByText(/Should Stay Together/i).first();
    await expect(sstSection).toBeVisible();
  });

  test('can open Pair Meeting Count section', async ({ page }) => {
    await page.getByRole('button', { name: /Soft Constraints/i }).click();
    await page.waitForTimeout(300);

    // Look for Pair Meeting Count section
    const pairMeetingSection = page.getByText(/Pair Meeting Count/i).first();
    await expect(pairMeetingSection).toBeVisible();
  });

  test('constraint tabs are accessible', async ({ page }) => {
    // Check that the constraint tabs are visible and clickable
    const hardTab = page.getByRole('button', { name: /Hard Constraints/i });
    const softTab = page.getByRole('button', { name: /Soft Constraints/i });

    await expect(hardTab).toBeVisible();
    await expect(softTab).toBeVisible();

    // Click between tabs
    await hardTab.click();
    await page.waitForTimeout(200);
    await softTab.click();
    await page.waitForTimeout(200);
    await hardTab.click();
  });
});
