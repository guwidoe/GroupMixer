import { test, expect } from '@playwright/test';

test.describe('Problem Editor', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app - first go to /app which redirects to /app/problem/people
    await page.goto('/app');
    // Wait for the app to fully load - look for the navigation or header
    await page.waitForSelector('nav, header', { timeout: 15000 });
    // Give extra time for React hydration
    await page.waitForTimeout(1000);
  });

  test('displays problem editor with tabs', async ({ page }) => {
    // Check all section tabs are visible
    await expect(page.getByRole('button', { name: /People/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Groups/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Sessions/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Objectives/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Hard Constraints/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Soft Constraints/i })).toBeVisible();
  });

  test('can add an attribute definition', async ({ page }) => {
    // First expand the attribute definitions section if collapsed
    const attributeHeader = page.locator('text=Attribute Definitions');
    await attributeHeader.click();
    await page.waitForTimeout(300);

    // Click "Add Attribute" button
    await page.locator('button').filter({ hasText: /Add Attribute/i }).click();

    // Wait for modal
    await page.waitForSelector('.modal-content', { timeout: 5000 });

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
    // Click "Add Person" button in the toolbar
    await page.locator('button').filter({ hasText: /^Add Person$/ }).click();

    // Wait for modal to appear
    await page.waitForSelector('.modal-content', { timeout: 5000 });

    // Fill in person name using placeholder text
    await page.getByPlaceholder(/Enter person's name/i).fill('alice');

    // Click Add Person button inside modal (submit)
    await page.locator('.modal-content button').filter({ hasText: /^Add Person$/i }).click();

    // Verify person appears in the list (use heading to avoid notification text)
    await expect(page.getByRole('heading', { name: 'alice' })).toBeVisible();
  });

  test('can delete a person', async ({ page }) => {
    // First add a person
    await page.locator('button').filter({ hasText: /^Add Person$/ }).click();
    await page.waitForSelector('.modal-content', { timeout: 5000 });
    await page.getByPlaceholder(/Enter person's name/i).fill('bob');
    await page.locator('.modal-content button').filter({ hasText: /^Add Person$/i }).click();
    await expect(page.getByRole('heading', { name: 'bob' })).toBeVisible();

    // Wait for notification to disappear (optional)
    await page.waitForTimeout(1000);

    // Find the person card with "bob" - it's a div with the person name
    // The card has edit and delete buttons as the last two buttons
    const personCard = page.locator('h4:has-text("bob")').locator('..').locator('..');
    // Click the last button (trash/delete icon)
    await personCard.locator('button').last().click();

    // Confirm deletion if there's a confirmation dialog
    const confirmButton = page.getByRole('button', { name: /confirm|yes|delete/i });
    if (await confirmButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await confirmButton.click();
    }

    // Verify person is removed (the heading should no longer be visible)
    await expect(page.getByRole('heading', { name: 'bob' })).toBeHidden({ timeout: 5000 });
  });

  test('can navigate to groups section', async ({ page }) => {
    // Click Groups tab
    await page.getByRole('button', { name: /Groups/i }).click();

    // Verify we're on groups section - should see Add Group button
    await expect(page.getByRole('button', { name: /Add Group/i })).toBeVisible();
  });

  test('can add a group', async ({ page }) => {
    // Navigate to groups
    await page.getByRole('button', { name: /Groups/i }).click();

    // Wait for groups section to load
    await page.waitForTimeout(500);

    // Click Add Group button in toolbar
    await page.locator('button').filter({ hasText: /^Add Group$/ }).click();

    // Wait for modal
    await page.waitForSelector('.modal-content', { timeout: 5000 });

    // Fill in group ID using placeholder
    await page.getByPlaceholder(/team-alpha/i).fill('Team Alpha');

    // Capacity field has default value 4, just leave it

    // Click Add Group button inside modal
    await page.locator('.modal-content button').filter({ hasText: /^Add Group$/i }).click();

    // Verify group appears (use heading to avoid notification text)
    await expect(page.getByRole('heading', { name: 'Team Alpha' })).toBeVisible();
  });

  test('can navigate to sessions section and set session count', async ({ page }) => {
    // Click Sessions tab
    await page.getByRole('button', { name: /Sessions/i }).click();

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
    // Click Objectives tab
    await page.getByRole('button', { name: /Objectives/i }).click();

    // Should see objective weight configuration
    await expect(page.getByText(/Maximize Unique Contacts|Weight/i)).toBeVisible();
  });

  test('can bulk add people from CSV text mode without switching to grid (fixes #7)', async ({ page }) => {
    // Click the dropdown arrow next to "Add Person" to access bulk options
    const addPersonDropdown = page.locator('button').filter({ hasText: /▾|▼/ }).first();
    if (await addPersonDropdown.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addPersonDropdown.click();
    } else {
      // Alternative: look for "Bulk Add" button directly
      await page.locator('button').filter({ hasText: /Bulk Add/i }).click();
    }

    // Wait for bulk add modal
    await page.waitForSelector('.modal-content', { timeout: 5000 });

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
    // Open bulk add modal
    const addPersonDropdown = page.locator('button').filter({ hasText: /▾|▼/ }).first();
    if (await addPersonDropdown.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addPersonDropdown.click();
    } else {
      await page.locator('button').filter({ hasText: /Bulk Add/i }).click();
    }

    await page.waitForSelector('.modal-content', { timeout: 5000 });

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
    // Navigate to groups
    await page.getByRole('button', { name: /Groups/i }).click();
    await page.waitForTimeout(500);

    // Click bulk add for groups
    const bulkAddButton = page.locator('button').filter({ hasText: /Bulk Add/i });
    if (await bulkAddButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await bulkAddButton.click();
    } else {
      // Try dropdown
      const dropdownButton = page.locator('button').filter({ hasText: /▾|▼/ }).first();
      await dropdownButton.click();
      await page.locator('button, li, a').filter({ hasText: /Bulk Add/i }).click();
    }

    // Wait for modal
    await page.waitForSelector('.modal-content', { timeout: 5000 });

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
