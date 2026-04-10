import { test, expect } from '@playwright/test';
import { closeTransientUi, navigateScenarioSetupSection, openApp } from './helpers';

test.describe('Constraints', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await closeTransientUi(page);
  });

  test('can navigate to fixed placements', async ({ page }) => {
    await navigateScenarioSetupSection(page, /^fixed placements$/i);
    await expect(page.getByRole('heading', { name: /^fixed placements$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /add fixed placements/i })).toBeVisible();
  });

  test('can navigate to keep together', async ({ page }) => {
    await navigateScenarioSetupSection(page, /^keep together$/i);
    await expect(page.getByRole('heading', { name: /^keep together$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /add keep together/i })).toBeVisible();
  });

  test('can navigate to repeat limit', async ({ page }) => {
    await navigateScenarioSetupSection(page, /repeat limit/i);
    await expect(page.getByRole('heading', { name: /repeat limit/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /add repeat limit/i })).toBeVisible();
  });

  test('can navigate to balance attributes', async ({ page }) => {
    await navigateScenarioSetupSection(page, /^balance attributes$/i);
    await expect(page.getByRole('heading', { name: /^balance attributes$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /add balance attributes/i })).toBeVisible();
  });

  test('can navigate to prefer apart', async ({ page }) => {
    await navigateScenarioSetupSection(page, /^prefer apart$/i);
    await expect(page.getByRole('heading', { name: /^prefer apart$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /add prefer apart/i })).toBeVisible();
  });

  test('can navigate to prefer together', async ({ page }) => {
    await navigateScenarioSetupSection(page, /^prefer together$/i);
    await expect(page.getByRole('heading', { name: /^prefer together$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /add prefer together/i })).toBeVisible();
  });

  test('can navigate to pair encounters', async ({ page }) => {
    await navigateScenarioSetupSection(page, /^pair encounters$/i);
    await expect(page.getByRole('heading', { name: /^pair encounters$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /add pair encounters/i })).toBeVisible();
  });
});
