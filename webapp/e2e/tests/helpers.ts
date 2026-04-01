import { expect, type Locator, type Page } from '@playwright/test';

export async function waitForAppShell(page: Page) {
  await expect(page).toHaveURL(/\/app(?:\/.*)?$/);
  await expect(page.locator('nav, header').first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('navigation', { name: /primary app navigation/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /setup|scenario setup/i })).toBeVisible();
}

export async function openApp(page: Page) {
  await page.goto('/app');
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.reload();
  await waitForAppShell(page);
  await expect(page).toHaveURL(/\/app\/scenario\/people$/);
}

export async function closeTransientUi(page: Page) {
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-content')).toHaveCount(0);
}

export async function dismissNotifications(page: Page) {
  const notificationCloseButtons = page.locator('.fixed.top-4.right-4.z-50 button');
  const count = await notificationCloseButtons.count();
  for (let index = 0; index < count; index += 1) {
    const button = notificationCloseButtons.nth(index);
    if (await button.isVisible().catch(() => false)) {
      await button.click().catch(() => {});
    }
  }
}

export async function openScenarioSetupControls(page: Page): Promise<boolean> {
  const drawer = page.getByRole('dialog', { name: /scenario setup navigation drawer/i });
  if (await drawer.isVisible().catch(() => false)) {
    return true;
  }

  const openButton = page.getByRole('button', { name: /open scenario setup navigation/i });
  if (!(await openButton.isVisible().catch(() => false))) {
    return false;
  }

  await openButton.click();
  await expect(drawer).toBeVisible({ timeout: 5000 });
  return true;
}

export async function closeScenarioSetupControls(page: Page) {
  const drawer = page.getByRole('dialog', { name: /scenario setup navigation drawer/i });
  if (!(await drawer.isVisible().catch(() => false))) {
    return;
  }

  const closeButton = drawer.getByRole('button', { name: /close scenario setup navigation/i }).last();
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click();
  } else {
    await page.keyboard.press('Escape');
  }

  await expect(drawer).toBeHidden({ timeout: 5000 });
}

export async function navigateScenarioSetupSection(page: Page, name: RegExp) {
  const usedDrawer = await openScenarioSetupControls(page);
  await page.getByRole('button', { name }).click();

  if (usedDrawer) {
    await expect(
      page.getByRole('dialog', { name: /scenario setup navigation drawer/i }),
    ).toBeHidden({ timeout: 5000 });
  }
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
  await dismissNotifications(page);
  await closeScenarioSetupControls(page);
  await trigger.click();
  await expect(page).toHaveURL(url);
  if (ready) {
    await expect(ready).toBeVisible();
  }
}

export async function openScenarioManager(page: Page) {
  const directManageButton = page.getByRole('button', {
    name: /manage scenarios|\(manage\)/i,
  });

  if (await directManageButton.isVisible().catch(() => false)) {
    await directManageButton.click();
    return;
  }

  const mobileMenuButton = page.getByRole('button', { name: /open menu/i });
  await expect(mobileMenuButton).toBeVisible();
  await mobileMenuButton.click();

  const mobileManageButton = page.getByRole('button', {
    name: /manage scenarios|\(manage\)/i,
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

export async function saveCurrentScenario(page: Page) {
  await openScenarioSetupControls(page);
  await page.getByRole('button', { name: /^save$/i }).click();
  await expect(page.getByText(/scenario saved|saved\./i).first()).toBeVisible();
  await closeScenarioSetupControls(page);
  await dismissNotifications(page);
  await closeTransientUi(page);
}

export async function openSolver(page: Page) {
  await clickAndWaitForUrl(
    page,
    page.getByRole('link', { name: /solver/i }),
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
        const currentScenarioId = window.localStorage.getItem('people-distributor-current-scenario');
        const rawScenarios = window.localStorage.getItem('people-distributor-scenarios');
        const savedScenarios = rawScenarios ? JSON.parse(rawScenarios) as Record<string, { results?: unknown[] }> : {};
        return currentScenarioId && savedScenarios[currentScenarioId]
          ? savedScenarios[currentScenarioId].results?.length ?? 0
          : 0;
      }),
    )
    .toBe(expectedCount);
}
