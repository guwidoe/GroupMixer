import { test, expect } from '@playwright/test';
import { addGroup, addPerson, openApp, runSolver, saveCurrentProblem } from './helpers';

test.describe('Workflow coverage', () => {
  test('saves a problem, reloads the app, and loads it back from problem manager', async ({ page }) => {
    await openApp(page);

    await addPerson(page, 'Alice');
    await addPerson(page, 'Bob');

    await page.getByRole('button', { name: /groups/i }).click();
    await addGroup(page, 'Team Alpha', 2);

    await saveCurrentProblem(page);

    await page.evaluate(() => {
      window.localStorage.removeItem('people-distributor-current-problem');
    });
    await page.reload();
    await page.waitForSelector('nav, header', { timeout: 15000 });

    await page.getByRole('button', { name: /\(manage\)/i }).click();
    await expect(page.getByRole('heading', { name: /problem manager/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Untitled Problem' })).toBeVisible();
    await expect(page.getByText('2 people', { exact: true })).toBeVisible();
    await expect(page.getByText('1 groups', { exact: true })).toBeVisible();

    await page.getByRole('heading', { name: 'Untitled Problem' }).click();
    await expect(page.getByText(/problem loaded/i).first()).toBeVisible();
    await page.getByRole('button', { name: /close problem manager/i }).click();

    await page.getByRole('button', { name: /people/i }).click();
    await expect(page.getByRole('heading', { name: 'Alice' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bob' })).toBeVisible();
  });

  test('creates a problem from scratch, solves it, exports a result, and navigates through result views', async ({ page }) => {
    await openApp(page);

    for (const person of ['Alice', 'Bob', 'Cara', 'Dan']) {
      await addPerson(page, person);
    }

    await page.getByRole('button', { name: /groups/i }).click();
    await addGroup(page, 'Team Alpha', 2);
    await addGroup(page, 'Team Beta', 2);

    await page.getByRole('button', { name: /sessions/i }).click();
    const sessionInput = page.locator('input[type="number"]').first();
    await sessionInput.fill('2');
    await sessionInput.blur();
    await expect(sessionInput).toHaveValue('2');

    await saveCurrentProblem(page);
    await runSolver(page);
    await expect(page.getByText(/result saved/i).first()).toBeVisible({ timeout: 10000 });

    await page.getByRole('link', { name: /result details/i }).click();
    await expect(page).toHaveURL(/\/app\/results/);
    await expect(page.getByRole('heading', { name: /optimization results/i })).toBeVisible();
    await expect(page.getByText(/group assignments/i)).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /^export$/i }).click();
    await page.getByRole('button', { name: /export as json/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/result.*\.json/i);

    await page.getByRole('link', { name: /^results$/i }).click();
    await expect(page.getByText(/result 1/i).first()).toBeVisible();
    await page.getByRole('button', { name: /view in result details/i }).click();
    await expect(page.getByRole('heading', { name: /optimization results/i })).toBeVisible();
  });
});
