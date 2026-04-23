import { expect, type Locator, type Page } from '@playwright/test';

export async function waitForAppShell(page: Page) {
  await expect(page).toHaveURL(/\/app(?:\/.*)?$/);
  await expect(page.locator('nav, header').first()).toBeVisible({ timeout: 15000 });

  const primaryNavigation = page.getByRole('navigation', { name: /primary app navigation/i });
  const mobileMenuButton = page.getByRole('button', { name: /open menu/i });
  const primaryNavigationVisible = await primaryNavigation.isVisible().catch(() => false);

  if (primaryNavigationVisible) {
    await expect(page.getByRole('link', { name: /setup|scenario setup/i })).toBeVisible();
    return;
  }

  await expect(mobileMenuButton).toBeVisible();
}

export async function openApp(page: Page) {
  await page.goto('/app');
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('groupmixer.advanced-mode.v1', 'true');
  });
  await page.reload();
  await waitForAppShell(page);
  await expect(page).toHaveURL(/\/app\/scenario\/people$/);
}

export async function openAppRoute(page: Page, path: string, url: RegExp, ready?: Locator) {
  await dismissNotifications(page);
  await closeScenarioSetupControls(page);
  await page.goto(path);
  await waitForAppShell(page);
  await expect(page).toHaveURL(url);
  if (ready) {
    await expect(ready).toBeVisible();
  }
}

export async function closeTransientUi(page: Page) {
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-content')).toHaveCount(0);
}

export async function setSliderValue(slider: Locator, value: number) {
  await expect(slider).toBeVisible();

  const currentValue = Number(await slider.inputValue());
  const direction = value >= currentValue ? 'ArrowRight' : 'ArrowLeft';

  for (let index = 0; index < Math.abs(value - currentValue); index += 1) {
    await slider.press(direction);
  }

  await expect(slider).toHaveValue(String(value));
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
  const navigationRoot = usedDrawer
    ? page.getByRole('dialog', { name: /scenario setup navigation drawer/i })
    : page.getByLabel(/scenario setup navigation/i);
  await navigationRoot.getByRole('button', { name }).click();

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

  if (!(await trigger.isVisible().catch(() => false))) {
    const mobileMenuButton = page.getByRole('button', { name: /open menu/i });
    if (await mobileMenuButton.isVisible().catch(() => false)) {
      await mobileMenuButton.click();
    }
  }

  await trigger.click();
  await expect(page).toHaveURL(url);
  if (ready) {
    await expect(ready).toBeVisible();
  }
}

export async function openScenarioManager(page: Page) {
  const workspaceActionsOpened = await openWorkspaceActions(page);
  if (workspaceActionsOpened) {
    const loadScenarioButton = page.getByRole('button', { name: /load scenario|load/i });
    await expect(loadScenarioButton).toBeVisible();
    await loadScenarioButton.click();
    return;
  }

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
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
}

export async function openWorkspaceActions(page: Page): Promise<boolean> {
  const workspaceMenuButton = page.getByRole('button', { name: /open workspace menu/i });
  if (await workspaceMenuButton.isVisible().catch(() => false)) {
    await workspaceMenuButton.click();
    return true;
  }

  const mobileMenuButton = page.getByRole('button', { name: /open menu/i });
  if (await mobileMenuButton.isVisible().catch(() => false)) {
    await mobileMenuButton.click();
    return true;
  }

  return false;
}

export async function addGroup(page: Page, id: string, size: number) {
  await page.getByRole('button', { name: /^add group$/i }).click();
  await waitForModal(page);
  await page.getByPlaceholder(/team-alpha|group-1/i).fill(id);
  await page.locator('.modal-content input[type="number"]').fill(String(size));
  await page.locator('.modal-content').getByRole('button', { name: /^add group$/i }).click();
  await expect(page.getByText(id, { exact: true }).first()).toBeVisible();
}

export async function saveCurrentScenario(page: Page) {
  if (await openWorkspaceActions(page)) {
    await page.getByRole('button', { name: /save scenario|save/i }).click();
  } else {
    await openScenarioSetupControls(page);
    await page.getByRole('button', { name: /^save$/i }).click();
  }
  await expect(page.getByText(/scenario saved|saved\./i).first()).toBeVisible();
  await closeScenarioSetupControls(page);
  await dismissNotifications(page);
  await closeTransientUi(page);
}

export async function openSolver(page: Page) {
  await clickAndWaitForUrl(
    page,
    page.getByRole('link', { name: /solver/i }),
    /\/app\/solver(?:\/run)?/,
    page.locator('button.btn-success').first(),
  );
}

export async function runSolver(page: Page) {
  await openSolver(page);

  const startButton = page.locator('button.btn-success').first();
  await startButton.click();

  await waitForSolverRunToStartOrComplete(page, 1);
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

export async function waitForSolverRunToStartOrComplete(page: Page, expectedCount: number) {
  const cancelButton = page.getByRole('button', { name: /cancel solver/i });

  await expect
    .poll(async () => {
      if (await cancelButton.isVisible().catch(() => false)) {
        return 'running';
      }

      return page.evaluate((count) => {
        const currentScenarioId = window.localStorage.getItem('people-distributor-current-scenario');
        const rawScenarios = window.localStorage.getItem('people-distributor-scenarios');
        const savedScenarios = rawScenarios ? JSON.parse(rawScenarios) as Record<string, { results?: unknown[] }> : {};
        const resultCount = currentScenarioId && savedScenarios[currentScenarioId]
          ? savedScenarios[currentScenarioId].results?.length ?? 0
          : 0;

        return resultCount >= count ? 'completed' : 'pending';
      }, expectedCount);
    }, { timeout: 30000 })
    .not.toBe('pending');
}
