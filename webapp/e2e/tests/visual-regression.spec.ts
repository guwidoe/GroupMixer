import { test, expect, Page } from '@playwright/test';

/**
 * Curated visual regression suite for layout-sensitive GroupMixer surfaces.
 *
 * This suite is intentionally narrower than the functional Playwright workflow
 * coverage. It focuses on appearance/layout drift for a stable set of high-value
 * screens, modals, responsive states, and theme variants.
 */

async function waitForPageReady(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
}

async function openScenarioSetupDrawerIfNeeded(page: Page): Promise<boolean> {
  const drawer = page.getByRole('dialog', { name: /scenario setup navigation drawer/i });
  if (await drawer.isVisible().catch(() => false)) {
    return true;
  }

  const openDrawerButton = page.getByRole('button', { name: /open scenario setup navigation/i });
  if (!(await openDrawerButton.isVisible().catch(() => false))) {
    return false;
  }

  await openDrawerButton.click();
  await expect(drawer).toBeVisible({ timeout: 5000 });
  return true;
}

async function navigateScenarioSetupSection(page: Page, name: RegExp) {
  const usedDrawer = await openScenarioSetupDrawerIfNeeded(page);
  await page.getByRole('button', { name }).click();

  if (usedDrawer) {
    await expect(
      page.getByRole('dialog', { name: /scenario setup navigation drawer/i }),
    ).toBeHidden({ timeout: 5000 });
  }

  await waitForPageReady(page);
}

async function loadDemoData(page: Page, type: 'simple' | 'intermediate' = 'simple') {
  const currentUrl = page.url();
  if (!currentUrl.includes('/app/scenario')) {
    await page.goto('/app/scenario/people');
    await waitForPageReady(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }

  await openScenarioSetupDrawerIfNeeded(page);

  const demoButton = page.getByRole('button', { name: /demo data/i });
  await expect(demoButton).toBeVisible({ timeout: 10000 });
  await demoButton.click();
  await page.waitForTimeout(500);

  await page
    .waitForFunction(() => !document.body.innerText.includes('Loading demo cases'), {
      timeout: 10000,
    })
    .catch(() => {});

  const demoNames: Record<'simple' | 'intermediate', RegExp> = {
    simple: /Company Team Demo|Study Group Example/i,
    intermediate: /Project Team Formation|Late Arrivals|Training Session/i,
  };

  await page.locator('button').filter({ hasText: demoNames[type] }).first().click({ timeout: 10000 });
  await page.waitForTimeout(500);

  const overwriteButton = page.getByRole('button', { name: /Overwrite|Yes|Confirm/i });
  if (await overwriteButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await overwriteButton.click();
    await page.waitForTimeout(500);
  }

  await page.keyboard.press('Escape');
  await waitForPageReady(page);
}

test.describe('Visual Regression - Landing Page', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-chrome', 'landing visuals are curated around desktop layout');
    await page.goto('/');
    await waitForPageReady(page);
  });

  test('landing page - full page', async ({ page }) => {
    await expect(page).toHaveScreenshot('landing-full.png', { fullPage: true });
  });
});

test.describe('Visual Regression - Scenario Editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/scenario/people');
    await waitForPageReady(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  });

  test('people section - empty state', async ({ page }) => {
    await expect(page).toHaveScreenshot('people-empty.png');
  });

  test('people section - populated', async ({ page }) => {
    await loadDemoData(page, 'simple');
    await expect(page).toHaveScreenshot('people-populated.png');
  });

  test('people section - add person modal', async ({ page }) => {
    await page.locator('button').filter({ hasText: /^Add Person$/ }).click();
    await page.waitForSelector('.modal-content', { timeout: 5000 });
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('people-add-modal.png');
  });

  test('people section - add attribute modal', async ({ page }) => {
    await navigateScenarioSetupSection(page, /attribute definitions|attributes/i);
    await page.locator('button').filter({ hasText: /Add Attribute/i }).click();
    await page.waitForSelector('.modal-content', { timeout: 5000 });
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('attribute-add-modal.png');
  });

  test('groups section - populated', async ({ page }) => {
    await loadDemoData(page, 'simple');
    await navigateScenarioSetupSection(page, /groups/i);
    await expect(page).toHaveScreenshot('groups-populated.png');
  });

  test('groups section - add group modal', async ({ page }) => {
    await navigateScenarioSetupSection(page, /groups/i);
    await page.locator('button').filter({ hasText: /^Add Group$/ }).click();
    await page.waitForSelector('.modal-content', { timeout: 5000 });
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('groups-add-modal.png');
  });

  test('constraints - hard populated state', async ({ page }) => {
    await loadDemoData(page, 'intermediate');
    await navigateScenarioSetupSection(page, /hard constraints/i);
    await expect(page).toHaveScreenshot('constraints-hard-populated.png');
  });

  test('constraints - soft populated state', async ({ page }) => {
    await loadDemoData(page, 'intermediate');
    await navigateScenarioSetupSection(page, /soft constraints/i);
    await expect(page).toHaveScreenshot('constraints-soft-populated.png');
  });
});

test.describe('Visual Regression - Solver Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/scenario/people');
    await waitForPageReady(page);
    await loadDemoData(page, 'simple');
    await page.goto('/app/solver');
    await waitForPageReady(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  });

  test('solver panel - ready state', async ({ page }) => {
    await expect(page).toHaveScreenshot('solver-ready.png');
  });

  test('solver panel - settings visible', async ({ page }) => {
    await expect(page).toHaveScreenshot('solver-settings.png');
  });
});

test.describe('Visual Regression - Empty result/history/editor states', () => {
  test('results empty', async ({ page }) => {
    await page.goto('/app/results');
    await waitForPageReady(page);
    await expect(page).toHaveScreenshot('results-empty.png');
  });

  test('history empty', async ({ page }) => {
    await page.goto('/app/history');
    await waitForPageReady(page);
    await expect(page).toHaveScreenshot('history-empty.png');
  });

  test('manual editor empty', async ({ page }) => {
    await page.goto('/app/editor');
    await waitForPageReady(page);
    await expect(page).toHaveScreenshot('editor-empty.png');
  });
});

test.describe('Visual Regression - Shared chrome and dialogs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/scenario/people');
    await waitForPageReady(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  });

  test('header navigation', async ({ page }) => {
    const header = page.locator('header, nav').first();
    await expect(header).toHaveScreenshot('header-navigation.png');
  });

  test('demo data dropdown', async ({ page }) => {
    await openScenarioSetupDrawerIfNeeded(page);
    await page.getByRole('button', { name: /Demo Data/i }).click();
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('header-demo-dropdown.png');
  });

  test('scenario manager modal', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-chrome', 'scenario manager entry point is desktop-focused here');
    await page.getByRole('button', { name: /Manage Scenarios/i }).click();
    await page.waitForSelector('.modal-content', { timeout: 5000 });
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('scenario-manager-modal.png');
  });
});

test.describe('Visual Regression - Mobile responsive', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'mobile snapshots are only meaningful on chromium');

  test('people populated - mobile', async ({ page }) => {
    await page.goto('/app/scenario/people');
    await waitForPageReady(page);
    await loadDemoData(page, 'simple');
    await expect(page).toHaveScreenshot('mobile-people-populated.png');
  });
});

test.describe('Visual Regression - Dark mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/scenario/people');
    await waitForPageReady(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  });

  test('people populated - dark', async ({ page }) => {
    await loadDemoData(page, 'simple');
    await expect(page).toHaveScreenshot('dark-people-populated.png');
  });

  test('solver ready - dark', async ({ page }) => {
    await loadDemoData(page, 'simple');
    await page.goto('/app/solver');
    await waitForPageReady(page);
    await expect(page).toHaveScreenshot('dark-solver.png');
  });
});
