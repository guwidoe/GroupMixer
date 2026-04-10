import { test, expect } from '@playwright/test';
import { navigateScenarioSetupSection, openApp, openScenarioSetupControls, waitForModal } from './helpers';

test('opening advanced editor from the landing page does not trigger a maximum update-depth crash', async ({ page }) => {
  test.setTimeout(60000);

  const pageErrors: string[] = [];
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  await page.goto('/');
  await page.getByRole('link', { name: /advanced editor|advanced workspace/i }).click();

  await expect(page).toHaveURL(/\/app(?:\/scenario\/people)?(?:\?lp=home)?/);
  await expect(page.getByRole('heading', { name: /^people$/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /add person/i })).toBeVisible();
  await page.waitForTimeout(3000);
  await expect(page.getByRole('button', { name: /add person/i })).toBeVisible();

  expect(pageErrors).not.toContainEqual(expect.stringMatching(/maximum update depth exceeded/i));
});

test.describe('Scenario Editor', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('displays scenario editor with tabs', async ({ page }) => {
    await openScenarioSetupControls(page);

    // Check all section tabs are visible
    await expect(page.getByRole('button', { name: /People/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Groups/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Sessions/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Objectives/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Hard Constraints/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Soft Constraints/i })).toBeVisible();
  });

  test('can add an attribute definition', async ({ page }) => {
    await navigateScenarioSetupSection(page, /attribute definitions|attributes/i);
    await page.locator('button').filter({ hasText: /Add Attribute/i }).click();
    await waitForModal(page);

    // Fill in attribute name using placeholder
    await page.getByPlaceholder(/department, experience/i).fill('test-attr');

    // Add a value - find the "Value 1" placeholder input
    await page.getByPlaceholder(/Value 1/i).fill('value-a');

    // Click Add Attribute button inside modal
    await page.locator('.modal-content button').filter({ hasText: /^Add Attribute$/i }).click();

    // Verify attribute appears in the expanded list (use heading to avoid notification)
    await expect(page.getByRole('heading', { name: 'test-attr' })).toBeVisible();
  });

  test('can add a person', async ({ page }) => {
    await page.locator('button').filter({ hasText: /^Add Person$/ }).click();
    await waitForModal(page);

    // Fill in person name using placeholder text
    await page.getByPlaceholder(/Enter person's name/i).fill('alice');

    // Click Add Person button inside modal (submit)
    await page.locator('.modal-content button').filter({ hasText: /^Add Person$/i }).click();

    // Verify person appears in the list (use heading to avoid notification text)
    await expect(page.getByRole('heading', { name: 'alice' })).toBeVisible();
  });

  test('can delete a person', async ({ page }) => {
    await page.locator('button').filter({ hasText: /^Add Person$/ }).click();
    await waitForModal(page);
    await page.getByPlaceholder(/Enter person's name/i).fill('bob');
    await page.locator('.modal-content button').filter({ hasText: /^Add Person$/i }).click();
    await expect(page.getByRole('heading', { name: 'bob' })).toBeVisible();

    const personCard = page.locator('h4:has-text("bob")').locator('..').locator('..');
    await personCard.locator('button').last().click();

    const confirmButton = page.getByRole('button', { name: /confirm|yes|delete/i });
    if (await confirmButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await confirmButton.click();
    }

    await expect(page.getByRole('heading', { name: 'bob' })).toBeHidden({ timeout: 5000 });
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
    await expect(page.getByRole('heading', { name: 'Team Alpha' })).toBeVisible();
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

  test('can bulk add people from CSV text mode without switching to grid (fixes #7)', async ({ page }) => {
    await page.locator('button').filter({ hasText: /Bulk Add/i }).first().click();
    await page.locator('button').filter({ hasText: /Open Bulk Form/i }).click();
    await waitForModal(page);

    // Ensure we're in "CSV Text" mode (default)
    const csvTextButton = page.locator('button').filter({ hasText: /CSV Text/i });
    if (await csvTextButton.isVisible()) {
      await csvTextButton.click();
    }

    // Paste CSV with name header directly in the textarea
    const csvData = 'name,department\nAlice,Engineering\nBob,Marketing\nCharlie,Sales';
    await page.locator('textarea').fill(csvData);

    // Click "Add People" button directly WITHOUT switching to grid view first
    // This is the key test - it should work without needing to "Preview Grid"
    await page.locator('.modal-content button').filter({ hasText: /^Add People$/i }).click();

    // Verify people were added successfully
    await expect(page.getByRole('heading', { name: 'Alice' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: 'Bob' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Charlie' })).toBeVisible();
  });

  test('bulk add preserves data when switching between text and grid views', async ({ page }) => {
    await page.locator('button').filter({ hasText: /Bulk Add/i }).first().click();
    await page.locator('button').filter({ hasText: /Open Bulk Form/i }).click();
    await waitForModal(page);

    // Enter CSV in text mode
    const csvData = 'name,role\nDave,Developer\nEve,Designer';
    await page.locator('textarea').fill(csvData);

    // Switch to grid view
    await page.locator('button').filter({ hasText: /Data Grid/i }).click();

    // Verify data appears in grid
    await expect(page.locator('th:has-text("name")')).toBeVisible();
    await expect(page.locator('td input').first()).toHaveValue('Dave');

    // Switch back to text mode
    await page.locator('button').filter({ hasText: /CSV Text/i }).click();

    // Verify CSV is preserved
    const textarea = page.locator('textarea');
    await expect(textarea).toContainText('Dave');
    await expect(textarea).toContainText('Eve');
  });

  test('bulk add groups from CSV text mode without switching to grid (fixes #7)', async ({ page }) => {
    await navigateScenarioSetupSection(page, /Groups/i);
    await expect(page.getByRole('button', { name: /Add Group/i })).toBeVisible();

    await page.locator('button').filter({ hasText: /Bulk Add/i }).first().click();
    await page.locator('button').filter({ hasText: /Open Bulk Form/i }).click();
    await waitForModal(page);

    // Enter CSV with groups (requires 'id' column for groups)
    const csvData = 'id,size\nTeam-A,4\nTeam-B,6\nTeam-C,5';
    await page.locator('textarea').fill(csvData);

    // Click "Add Groups" directly without switching to grid
    await page.locator('.modal-content button').filter({ hasText: /Add Groups/i }).click();

    // Verify groups were added
    await expect(page.getByRole('heading', { name: 'Team-A' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: 'Team-B' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Team-C' })).toBeVisible();
  });
});
