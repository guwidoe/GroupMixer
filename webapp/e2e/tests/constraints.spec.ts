import { test, expect } from '@playwright/test';
import { closeTransientUi, navigateScenarioSetupSection, openApp, openScenarioSetupControls } from './helpers';

test.describe('Constraints', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await closeTransientUi(page);
  });

  test('can navigate to hard constraints section', async ({ page }) => {
    await navigateScenarioSetupSection(page, /Hard Constraints/i);

    // Should show hard constraints panel - look for any constraint-related content
    await expect(page.getByText(/Immovable|Must Stay Together/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('can navigate to soft constraints section', async ({ page }) => {
    await navigateScenarioSetupSection(page, /Soft Constraints/i);

    // Should show soft constraints panel
    await expect(page.getByText(/Repeat Encounter|Attribute Balance/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('can open Immovable People modal', async ({ page }) => {
    await navigateScenarioSetupSection(page, /Hard Constraints/i);

    const immovableSection = page.getByText(/Immovable/i).first();
    await expect(immovableSection).toBeVisible();
  });

  test('can open Must Stay Together modal', async ({ page }) => {
    await navigateScenarioSetupSection(page, /Hard Constraints/i);

    const mustStaySection = page.getByText(/Must Stay Together/i).first();
    await expect(mustStaySection).toBeVisible();
  });

  test('can open Repeat Encounter section', async ({ page }) => {
    await navigateScenarioSetupSection(page, /Soft Constraints/i);

    const repeatSection = page.getByText(/Repeat.*Encounter|Max.*Encounters/i).first();
    await expect(repeatSection).toBeVisible();
  });

  test('can open Attribute Balance section', async ({ page }) => {
    await navigateScenarioSetupSection(page, /Soft Constraints/i);

    const attrBalanceSection = page.getByText(/Attribute Balance/i).first();
    await expect(attrBalanceSection).toBeVisible();
  });

  test('can open Should Not Be Together section', async ({ page }) => {
    await navigateScenarioSetupSection(page, /Soft Constraints/i);

    const sntSection = page.getByText(/Should Not Be Together/i).first();
    await expect(sntSection).toBeVisible();
  });

  test('can open Should Stay Together section', async ({ page }) => {
    await navigateScenarioSetupSection(page, /Soft Constraints/i);

    const sstSection = page.getByText(/Should Stay Together/i).first();
    await expect(sstSection).toBeVisible();
  });

  test('can open Pair Meeting Count section', async ({ page }) => {
    await navigateScenarioSetupSection(page, /Soft Constraints/i);

    const pairMeetingSection = page.getByText(/Pair Meeting Count/i).first();
    await expect(pairMeetingSection).toBeVisible();
  });

  test('constraint tabs are accessible', async ({ page }) => {
    await openScenarioSetupControls(page);

    // Check that the constraint tabs are visible and clickable
    const hardTab = page.getByRole('button', { name: /Hard Constraints/i });
    const softTab = page.getByRole('button', { name: /Soft Constraints/i });

    await expect(hardTab).toBeVisible();
    await expect(softTab).toBeVisible();

    await hardTab.click();
    await expect(page.getByText(/Immovable|Must Stay Together/i).first()).toBeVisible();
    await navigateScenarioSetupSection(page, /Soft Constraints/i);
    await expect(page.getByText(/Repeat Encounter|Attribute Balance/i).first()).toBeVisible();
    await navigateScenarioSetupSection(page, /Hard Constraints/i);
    await expect(page.getByText(/Immovable|Must Stay Together/i).first()).toBeVisible();
  });
});
