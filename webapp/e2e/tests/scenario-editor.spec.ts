import { test, expect } from '@playwright/test';
import { navigateScenarioSetupSection, openApp, openScenarioSetupControls, openWorkspaceActions, waitForModal } from './helpers';

test('opening advanced editor from the landing page does not trigger a maximum update-depth crash', async ({ page }) => {
  test.setTimeout(60000);

  const pageErrors: string[] = [];
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  await page.goto('/');
  await page.waitForTimeout(750);
  await page.getByRole('link', { name: /advanced editor|advanced workspace/i }).click();

  await expect(page).toHaveURL(/\/app(?:\/scenario\/people)?(?:\?lp=home)?/);
  await expect(page.getByRole('heading', { name: /^people$/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /add person/i })).toBeVisible();
  await page.waitForTimeout(3000);
  await expect(page.getByRole('button', { name: /add person/i })).toBeVisible();

  expect(pageErrors).not.toContainEqual(expect.stringMatching(/maximum update depth exceeded/i));
});

test('demo data loads from workspace actions', async ({ page }) => {
  await page.goto('/app');
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.reload();

  await expect(page).toHaveURL(/\/app\/scenario\/people$/);
  await openWorkspaceActions(page);
  await page.getByRole('button', { name: /^demo data$/i }).click();
  await page.getByRole('menuitem').filter({ hasText: /company team demo/i }).first().click();

  await expect(page.getByText(/demo case loaded/i)).toBeVisible();
  await expect(page.getByRole('cell', { name: /alice johnson/i }).first()).toBeVisible();
});

test.describe('Scenario Editor', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('displays scenario editor with tabs', async ({ page }) => {
    await openScenarioSetupControls(page);
    const setupNavigation = page.getByLabel(/scenario setup navigation/i);

    await expect(setupNavigation.getByRole('button', { name: /^People$/i })).toBeVisible();
    await expect(setupNavigation.getByRole('button', { name: /^Groups$/i })).toBeVisible();
    await expect(setupNavigation.getByRole('button', { name: /^Sessions$/i })).toBeVisible();
    await expect(setupNavigation.getByRole('button', { name: /^Attributes$/i })).toBeVisible();
    await expect(setupNavigation.getByRole('button', { name: /^Objectives$/i })).toBeVisible();
    await expect(setupNavigation.getByRole('button', { name: /^Fixed Placements$/i })).toBeVisible();
    await expect(setupNavigation.getByRole('button', { name: /^Repeat Limit$/i })).toBeVisible();
  });

  test('can add an attribute definition', async ({ page }) => {
    await navigateScenarioSetupSection(page, /^attributes$/i);
    await page.locator('button').filter({ hasText: /Add Attribute/i }).click();
    await waitForModal(page);

    // Fill in attribute name using placeholder
    await page.getByPlaceholder(/department, experience/i).fill('test-attr');

    // Add a value - find the "Value 1" placeholder input
    await page.getByPlaceholder(/Value 1/i).fill('value-a');

    // Click Add Attribute button inside modal
    await page.locator('.modal-content button').filter({ hasText: /^Add Attribute$/i }).click();

    // Verify attribute appears in the expanded list (use heading to avoid notification)
    await page.getByRole('button', { name: /^cards$/i }).click();
    await expect(page.getByText('test-attr', { exact: true }).first()).toBeVisible();
  });

  test('can add a person', async ({ page }) => {
    await page.locator('button').filter({ hasText: /^Add Person$/ }).click();
    await waitForModal(page);

    // Fill in person name using placeholder text
    await page.getByPlaceholder(/Enter person's name/i).fill('alice');

    // Click Add Person button inside modal (submit)
    await page.locator('.modal-content button').filter({ hasText: /^Add Person$/i }).click();

    // Verify person appears in the list (use heading to avoid notification text)
    await page.getByRole('button', { name: /^cards$/i }).click();
    await expect(page.getByText('alice', { exact: true }).first()).toBeVisible();
  });

  test('can delete a person', async ({ page }) => {
    await page.locator('button').filter({ hasText: /^Add Person$/ }).click();
    await waitForModal(page);
    await page.getByPlaceholder(/Enter person's name/i).fill('bob');
    await page.locator('.modal-content button').filter({ hasText: /^Add Person$/i }).click();
    await page.getByRole('button', { name: /^cards$/i }).click();
    await expect(page.getByText('bob', { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: /delete bob/i }).first().click();

    const confirmButton = page.getByRole('button', { name: /confirm|yes|delete/i });
    if (await confirmButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await confirmButton.click();
    }

    await expect(page.getByText('bob', { exact: true }).first()).toBeHidden({ timeout: 5000 });
  });

  test('can navigate to groups section', async ({ page }) => {
    await navigateScenarioSetupSection(page, /Groups/i);

    // Verify we're on groups section - should see Add Group button
    await expect(page.getByRole('button', { name: /Add Group/i })).toBeVisible();
  });

  test('can add a group', async ({ page }) => {
    await navigateScenarioSetupSection(page, /Groups/i);
    await expect(page.getByRole('button', { name: /Add Group/i })).toBeVisible();

    await page.locator('button').filter({ hasText: /^Add Group$/ }).click();
    await waitForModal(page);

    // Fill in group ID using placeholder
    await page.getByPlaceholder(/team-alpha/i).fill('Team Alpha');

    // Capacity field has default value 4, just leave it

    // Click Add Group button inside modal
    await page.locator('.modal-content button').filter({ hasText: /^Add Group$/i }).click();

    // Verify group appears (use heading to avoid notification text)
    await page.getByRole('button', { name: /^cards$/i }).click();
    await expect(page.getByText('Team Alpha', { exact: true }).first()).toBeVisible();
  });

  test('can navigate to sessions section and set session count', async ({ page }) => {
    await navigateScenarioSetupSection(page, /Sessions/i);

    // Find session count input
    const sessionInput = page.locator('input[type="number"]').first();
    await expect(sessionInput).toBeVisible();

    // Change session count
    await sessionInput.fill('5');
    await sessionInput.blur();

    // Verify count updated (check the tab badge or the input value)
    await expect(sessionInput).toHaveValue('5');
  });

  test('can navigate to objectives section', async ({ page }) => {
    await navigateScenarioSetupSection(page, /Objectives/i);

    // Should see objective weight configuration
    await expect(page.getByText(/Maximize Unique Contacts|Weight/i)).toBeVisible();
  });

});
