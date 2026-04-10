import { test, expect } from '@playwright/test';
import {
  addGroup,
  addPerson,
  clickAndWaitForUrl,
  dismissNotifications,
  expectSavedResultCount,
  navigateScenarioSetupSection,
  openSolver,
  openApp,
  openScenarioManager,
  openWorkspaceActions,
  runSolver,
  saveCurrentScenario,
  waitForSolverRunToStartOrComplete,
  waitForAppShell,
} from './helpers';

test.describe('Workflow coverage', () => {
  test('saves a scenario, reloads the app, and loads it back from scenario manager', async ({ page }) => {
    await openApp(page);

    await addPerson(page, 'Alice');
    await addPerson(page, 'Bob');

    await navigateScenarioSetupSection(page, /groups/i);
    await addGroup(page, 'Team Alpha', 2);

    await saveCurrentScenario(page);

    await page.evaluate(() => {
      window.localStorage.removeItem('people-distributor-current-scenario');
    });
    await page.reload();
    await page.waitForSelector('nav, header', { timeout: 15000 });

    await openScenarioManager(page);
    await expect(page.getByRole('heading', { name: /scenario manager/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Untitled Scenario' })).toBeVisible();
    await expect(page.getByText('2 people', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('1 groups', { exact: true }).first()).toBeVisible();

    await page.getByRole('heading', { name: 'Untitled Scenario' }).click();
    await expect(page.getByText(/scenario loaded/i).first()).toBeVisible();
    await page.getByRole('button', { name: /close scenario manager/i }).click();

    await navigateScenarioSetupSection(page, /people/i);
    await expect(page.getByText('Alice', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Bob', { exact: true }).first()).toBeVisible();
  });

  test('creates a scenario from scratch, solves it, exports a result, and navigates through result views', async ({ page }) => {
    test.setTimeout(60000);

    await openApp(page);

    for (const person of ['Alice', 'Bob', 'Cara', 'Dan']) {
      await addPerson(page, person);
    }

    await navigateScenarioSetupSection(page, /groups/i);
    await addGroup(page, 'Team Alpha', 2);
    await addGroup(page, 'Team Beta', 2);

    await navigateScenarioSetupSection(page, /sessions/i);
    const sessionInput = page.locator('input[type="number"]').first();
    await sessionInput.fill('2');
    await sessionInput.blur();
    await expect(sessionInput).toHaveValue('2');

    await saveCurrentScenario(page);
    await runSolver(page);
    await expectSavedResultCount(page, 1);

    await dismissNotifications(page);
    await clickAndWaitForUrl(
      page,
      page.getByRole('link', { name: /results/i }),
      /\/app\/history/,
      page.getByText(/result 1/i).first(),
    );

    await clickAndWaitForUrl(
      page,
      page.getByRole('link', { name: /details|result details/i }),
      /\/app\/results/,
      page.getByRole('heading', { name: /optimization results/i }),
    );
    await expect(page.getByText(/group assignments/i)).toBeVisible();
    await expect(page.getByText(/4 people assigned/i).first()).toBeVisible();
    await expect(page.getByText('Alice').first()).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /^export$/i }).click();
    await page.getByRole('button', { name: /export as json/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/result.*\.json/i);

    await dismissNotifications(page);
    await clickAndWaitForUrl(
      page,
      page.getByRole('link', { name: /results/i }),
      /\/app\/history/,
      page.getByText(/result 1/i).first(),
    );
    await page.getByRole('button', { name: /view in result details/i }).click();
    await expect(page.getByRole('heading', { name: /optimization results/i })).toBeVisible();
  });

  test('auto-sets custom solver settings, shows a running solver state, reloads, and warm-starts from a saved result', async ({ page }) => {
    test.setTimeout(60000);

    await openApp(page);

    for (const person of ['Alice', 'Bob', 'Cara', 'Dan', 'Eli', 'Fran']) {
      await addPerson(page, person);
    }

    await navigateScenarioSetupSection(page, /groups/i);
    await addGroup(page, 'Team Alpha', 3);
    await addGroup(page, 'Team Beta', 3);

    await navigateScenarioSetupSection(page, /sessions/i);
    const sessionInput = page.locator('input[type="number"]').first();
    await sessionInput.fill('3');
    await sessionInput.blur();
    await expect(sessionInput).toHaveValue('3');

    await saveCurrentScenario(page);
    await openSolver(page);

    await page.getByRole('button', { name: /solve with custom settings/i }).click();
    const desiredRuntime = page.locator('#desiredRuntime');
    await desiredRuntime.fill('2');
    await desiredRuntime.blur();
    await page.getByRole('button', { name: /auto-set/i }).click();
    await expect(
      page.getByText(/algorithm settings have been automatically configured\./i).first(),
    ).toBeVisible();

    const customStart = page.getByRole('button', { name: /start solver with (custom|current) settings/i }).last();
    await customStart.click();

    await waitForSolverRunToStartOrComplete(page, 1);
    await expect(customStart).toBeVisible({ timeout: 30000 });
    await expectSavedResultCount(page, 1);

    await page.reload();
    await waitForAppShell(page);
    await openSolver(page);

    await page.getByRole('button', { name: /solve with custom settings/i }).click();
    await page.getByRole('button', { name: /start from random \(default\)/i }).click();
    await page.getByRole('button', { name: /result 1/i }).first().click();
    await expect(page.getByRole('button', { name: /result 1 • score/i })).toBeVisible();

    await customStart.click();
    await waitForSolverRunToStartOrComplete(page, 2);
    await expect(customStart).toBeVisible({ timeout: 30000 });
    await expectSavedResultCount(page, 2);

    await dismissNotifications(page);
    await clickAndWaitForUrl(
      page,
      page.getByRole('link', { name: /results/i }),
      /\/app\/history/,
      page.getByText(/result 1/i).first(),
    );
    await expect(page.getByText(/result 2/i).first()).toBeVisible();
  });

  test('shows a browser-visible solver error when worker startup fails', async ({ page }) => {
    await page.addInitScript(() => {
      window.Worker = class {
        constructor() {
          throw new Error('Injected worker failure');
        }

        postMessage() {}
        terminate() {}
      } as unknown as typeof Worker;
    });

    await openApp(page);

    for (const person of ['Alice', 'Bob', 'Cara', 'Dan']) {
      await addPerson(page, person);
    }

    await navigateScenarioSetupSection(page, /groups/i);
    await addGroup(page, 'Team Alpha', 2);
    await addGroup(page, 'Team Beta', 2);
    await saveCurrentScenario(page);

    await clickAndWaitForUrl(
      page,
      page.getByRole('link', { name: /solver/i }),
      /\/app\/solver/,
    );

    await expect(page.getByText(/available solvers unavailable|solver error|injected worker failure/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('runs solver3 on a demo scenario through mailbox progress and saves the result', async ({ page }) => {
    test.setTimeout(90000);

    const consoleMessages: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        const text = `${message.type()}: ${message.text()}`;
        if (text.includes('ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedToSameOriginByCoep')) {
          return;
        }
        consoleMessages.push(text);
      }
    });

    await openApp(page);

    await openWorkspaceActions(page);
    await page.getByRole('button', { name: /demo data/i }).click();
    await page.getByRole('menuitem', { name: /company team demo/i }).click();
    await expect(page.getByText(/demo case loaded/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/alice johnson/i).first()).toBeVisible({ timeout: 15000 });

    await openSolver(page);
    await page.getByRole('button', { name: /solve with custom settings/i }).click();
    await page.getByRole('button', { name: /solver 3 experimental/i }).click();
    await expect(page.getByText(/automatic settings unavailable/i).first()).toBeVisible();

    const customStart = page.getByRole('button', { name: /start solver with current settings/i }).last();
    await customStart.click();

    await expect
      .poll(async () => {
        const currentScenarioId = await page.evaluate(() => window.localStorage.getItem('people-distributor-current-scenario'));
        const rawScenarios = await page.evaluate(() => window.localStorage.getItem('people-distributor-scenarios'));
        const savedScenarios = rawScenarios ? JSON.parse(rawScenarios) as Record<string, { results?: unknown[] }> : {};
        return currentScenarioId && savedScenarios[currentScenarioId]
          ? savedScenarios[currentScenarioId].results?.length ?? 0
          : 0;
      }, { timeout: 90000 })
      .toBe(1);

    await expect(customStart).toBeVisible({ timeout: 60000 });

    expect(consoleMessages).toEqual([]);
  });
});
