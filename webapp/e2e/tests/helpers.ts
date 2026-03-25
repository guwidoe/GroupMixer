import { expect, type Locator, type Page } from '@playwright/test';

export async function waitForAppShell(page: Page) {
  await expect(page.locator('nav, header').first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('link', { name: /problem setup/i })).toBeVisible();
}

export async function openApp(page: Page) {
  await page.goto('/app');
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.reload();
  await waitForAppShell(page);
}

export async function closeTransientUi(page: Page) {
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-content')).toHaveCount(0);
}

export async function waitForModal(page: Page) {
  await expect(page.locator('.modal-content')).toBeVisible();
}

export async function clickAndWaitForUrl(
  page: Page,
  trigger: Locator,
  url: RegExp,
  ready?: Locator,
) {
  await trigger.click();
  await expect(page).toHaveURL(url);
  if (ready) {
    await expect(ready).toBeVisible();
  }
}

export async function openProblemManager(page: Page) {
  const directManageButton = page.getByRole('button', {
    name: /manage problems|\(manage\)/i,
  });

  if (await directManageButton.isVisible().catch(() => false)) {
    await directManageButton.click();
    return;
  }

  const mobileMenuButton = page.getByRole('button', { name: /open menu/i });
  await expect(mobileMenuButton).toBeVisible();
  await mobileMenuButton.click();

  const mobileManageButton = page.getByRole('button', {
    name: /manage problems|\(manage\)/i,
  });
  await expect(mobileManageButton).toBeVisible();
  await mobileManageButton.click();
}

export async function addPerson(page: Page, name: string) {
  await page.getByRole('button', { name: /^add person$/i }).click();
  await waitForModal(page);
  await page.getByPlaceholder(/enter person's name/i).fill(name);
  await page.locator('.modal-content').getByRole('button', { name: /^add person$/i }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

export async function addGroup(page: Page, id: string, size: number) {
  await page.getByRole('button', { name: /^add group$/i }).click();
  await waitForModal(page);
  await page.getByPlaceholder(/team-alpha|group-1/i).fill(id);
  await page.locator('.modal-content input[type="number"]').fill(String(size));
  await page.locator('.modal-content').getByRole('button', { name: /^add group$/i }).click();
  await expect(page.getByRole('heading', { name: id })).toBeVisible();
}

export async function saveCurrentProblem(page: Page) {
  await page.getByRole('button', { name: /^save$/i }).click();
  await expect(page.getByText(/problem saved|saved\./i).first()).toBeVisible();
}

export async function openSolver(page: Page) {
  await clickAndWaitForUrl(
    page,
    page.getByRole('link', { name: /^solver$/i }),
    /\/app\/solver/,
    page.getByRole('button', { name: /start solver with automatic settings/i }),
  );
}

export async function runSolver(page: Page) {
  await openSolver(page);

  const startButton = page.getByRole('button', {
    name: /start solver with automatic settings/i,
  });
  await startButton.click();

  await expect(page.getByRole('button', { name: /cancel solver/i })).toBeVisible({ timeout: 5000 });
  await expect(startButton).toBeVisible({ timeout: 30000 });
}

export async function expectSavedResultCount(page: Page, expectedCount: number) {
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const currentProblemId = window.localStorage.getItem('people-distributor-current-problem');
        const rawProblems = window.localStorage.getItem('people-distributor-problems');
        const savedProblems = rawProblems ? JSON.parse(rawProblems) as Record<string, { results?: unknown[] }> : {};
        return currentProblemId && savedProblems[currentProblemId]
          ? savedProblems[currentProblemId].results?.length ?? 0
          : 0;
      }),
    )
    .toBe(expectedCount);
}
