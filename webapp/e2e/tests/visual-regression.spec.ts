import { test, expect, Page } from '@playwright/test';

/**
 * Visual Regression Test Suite for GroupMixer
 * 
 * This test file captures screenshots of all major pages and UI states
 * to detect unintended visual changes during development.
 * 
 * To update baselines after intentional changes:
 *   pnpm playwright test --update-snapshots
 * 
 * Or for specific tests:
 *   pnpm playwright test visual-regression.spec.ts --update-snapshots
 */

// Helper to wait for page to be fully loaded and animations to settle
async function waitForPageReady(page: Page) {
  // Wait for network to be idle
  await page.waitForLoadState('networkidle');
  // Wait for any pending animations
  await page.waitForTimeout(500);
}

// Helper to load demo data for populated states
async function loadDemoData(page: Page, type: 'simple' | 'intermediate' | 'advanced' = 'simple') {
  // First navigate to problem editor if not there
  const currentUrl = page.url();
  if (!currentUrl.includes('/app/problem')) {
    await page.goto('/app/problem/people');
    await waitForPageReady(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
  
  // Find and click the Demo Data button
  const demoButton = page.getByRole('button', { name: /Demo Data/i });
  await expect(demoButton).toBeVisible({ timeout: 10000 });
  await demoButton.click();
  
  // Wait for dropdown to appear and demo cases to load
  await page.waitForTimeout(500);
  
  // Wait for loading spinner to disappear (demo cases load async)
  await page.waitForFunction(() => {
    const loadingText = document.body.innerText;
    return !loadingText.includes('Loading demo cases');
  }, { timeout: 10000 }).catch(() => {});
  
  // Select demo type - click the actual demo case button
  // These are the actual demo case names from test_cases/*.json
  const demoNames: Record<string, RegExp> = {
    simple: /Company Team Demo|Study Group Example/i,
    intermediate: /Project Team Formation|Late Arrivals|Training Session/i,
    advanced: /Department Mixer|Corporate Training|Sailing Trip/i,
  };
  
  // Look for the demo case button within the dropdown portal
  const demoCaseButton = page.locator('button').filter({ hasText: demoNames[type] }).first();
  await demoCaseButton.click({ timeout: 10000 });
  
  // Wait for data to load and any modals to close
  await page.waitForTimeout(500);
  
  // If a warning modal appears, click to overwrite
  const overwriteButton = page.getByRole('button', { name: /Overwrite|Yes|Confirm/i });
  if (await overwriteButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await overwriteButton.click();
    await page.waitForTimeout(500);
  }
  
  // Close any open dropdowns
  await page.keyboard.press('Escape');
  await waitForPageReady(page);
}

test.describe('Visual Regression - Landing Page', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // Skip on mobile - landing page has complex animations that can't stabilize reliably
    test.skip(testInfo.project.name === 'mobile-chrome', 'Landing page animations unstable on mobile viewport');
    
    await page.goto('/landingpage');
    await waitForPageReady(page);
  });

  // Skip hero test - landing page has complex animations that cause unstable screenshots
  test.skip('landing page - hero section', async ({ page }) => {
    await expect(page).toHaveScreenshot('landing-hero.png', {
      fullPage: false,
    });
  });

  test('landing page - full page', async ({ page }) => {
    await expect(page).toHaveScreenshot('landing-full.png', {
      fullPage: true,
    });
  });
});

test.describe('Visual Regression - Problem Editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/problem/people');
    await waitForPageReady(page);
    // Close any open modals
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  });

  test.describe('People Section', () => {
    test('empty state', async ({ page }) => {
      await expect(page).toHaveScreenshot('people-empty.png');
    });

    test('with demo data', async ({ page }) => {
      await loadDemoData(page, 'simple');
      await expect(page).toHaveScreenshot('people-populated.png');
    });

    test('add person modal', async ({ page }) => {
      await page.locator('button').filter({ hasText: /^Add Person$/ }).click();
      await page.waitForSelector('.modal-content', { timeout: 5000 });
      await page.waitForTimeout(300);
      await expect(page).toHaveScreenshot('people-add-modal.png');
    });

    test('attribute definitions expanded', async ({ page }) => {
      await loadDemoData(page, 'simple');
      const attributeHeader = page.locator('text=Attribute Definitions');
      if (await attributeHeader.isVisible()) {
        await attributeHeader.click();
        await page.waitForTimeout(300);
      }
      await expect(page).toHaveScreenshot('people-attributes-expanded.png');
    });

    test('add attribute modal', async ({ page }) => {
      const attributeHeader = page.locator('text=Attribute Definitions');
      if (await attributeHeader.isVisible()) {
        await attributeHeader.click();
        await page.waitForTimeout(300);
      }
      await page.locator('button').filter({ hasText: /Add Attribute/i }).click();
      await page.waitForSelector('.modal-content', { timeout: 5000 });
      await page.waitForTimeout(300);
      await expect(page).toHaveScreenshot('attribute-add-modal.png');
    });
  });

  test.describe('Groups Section', () => {
    test('empty state', async ({ page }) => {
      await page.getByRole('button', { name: /Groups/i }).click();
      await waitForPageReady(page);
      await expect(page).toHaveScreenshot('groups-empty.png');
    });

    test('with demo data', async ({ page }) => {
      await loadDemoData(page, 'simple');
      await page.getByRole('button', { name: /Groups/i }).click();
      await waitForPageReady(page);
      await expect(page).toHaveScreenshot('groups-populated.png');
    });

    test('add group modal', async ({ page }) => {
      await page.getByRole('button', { name: /Groups/i }).click();
      await page.waitForTimeout(500);
      await page.locator('button').filter({ hasText: /^Add Group$/ }).click();
      await page.waitForSelector('.modal-content', { timeout: 5000 });
      await page.waitForTimeout(300);
      await expect(page).toHaveScreenshot('groups-add-modal.png');
    });
  });

  test.describe('Sessions Section', () => {
    test('default state', async ({ page }) => {
      await page.getByRole('button', { name: /Sessions/i }).click();
      await waitForPageReady(page);
      await expect(page).toHaveScreenshot('sessions-default.png');
    });

    test('with demo data', async ({ page }) => {
      await loadDemoData(page, 'simple');
      await page.getByRole('button', { name: /Sessions/i }).click();
      await waitForPageReady(page);
      await expect(page).toHaveScreenshot('sessions-populated.png');
    });
  });

  test.describe('Objectives Section', () => {
    test('default state', async ({ page }) => {
      await page.getByRole('button', { name: /Objectives/i }).click();
      await waitForPageReady(page);
      await expect(page).toHaveScreenshot('objectives-default.png');
    });

    test('with demo data', async ({ page }) => {
      await loadDemoData(page, 'simple');
      await page.getByRole('button', { name: /Objectives/i }).click();
      await waitForPageReady(page);
      await expect(page).toHaveScreenshot('objectives-populated.png');
    });
  });

  test.describe('Constraints Section', () => {
    test('hard constraints panel', async ({ page }) => {
      await page.getByRole('button', { name: /Hard Constraints/i }).click();
      await waitForPageReady(page);
      await expect(page).toHaveScreenshot('constraints-hard.png');
    });

    test('soft constraints panel', async ({ page }) => {
      await page.getByRole('button', { name: /Soft Constraints/i }).click();
      await waitForPageReady(page);
      await expect(page).toHaveScreenshot('constraints-soft.png');
    });

    test('hard constraints with demo data', async ({ page }) => {
      await loadDemoData(page, 'intermediate');
      await page.getByRole('button', { name: /Hard Constraints/i }).click();
      await waitForPageReady(page);
      await expect(page).toHaveScreenshot('constraints-hard-populated.png');
    });

    test('soft constraints with demo data', async ({ page }) => {
      await loadDemoData(page, 'intermediate');
      await page.getByRole('button', { name: /Soft Constraints/i }).click();
      await waitForPageReady(page);
      await expect(page).toHaveScreenshot('constraints-soft-populated.png');
    });
  });
});

test.describe('Visual Regression - Solver Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/solver');
    await waitForPageReady(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  });

  test('empty state - no problem', async ({ page }) => {
    await expect(page).toHaveScreenshot('solver-empty.png');
  });

  test('with problem loaded', async ({ page }) => {
    // Go to problem editor first to load demo data
    await page.goto('/app/problem/people');
    await waitForPageReady(page);
    await loadDemoData(page, 'simple');
    
    // Navigate back to solver
    await page.goto('/app/solver');
    await waitForPageReady(page);
    await expect(page).toHaveScreenshot('solver-ready.png');
  });

  test('solver settings visible', async ({ page }) => {
    // Load demo data first
    await page.goto('/app/problem/people');
    await waitForPageReady(page);
    await loadDemoData(page, 'simple');
    
    await page.goto('/app/solver');
    await waitForPageReady(page);
    
    // The solver panel should already show settings when loaded with a problem
    // Take a screenshot of the current state
    await expect(page).toHaveScreenshot('solver-settings.png');
  });
});

test.describe('Visual Regression - Results', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/results');
    await waitForPageReady(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  });

  test('empty state - no results', async ({ page }) => {
    await expect(page).toHaveScreenshot('results-empty.png');
  });
});

test.describe('Visual Regression - Results History', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/history');
    await waitForPageReady(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  });

  test('empty state - no history', async ({ page }) => {
    await expect(page).toHaveScreenshot('history-empty.png');
  });
});

test.describe('Visual Regression - Manual Editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/editor');
    await waitForPageReady(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  });

  test('empty state', async ({ page }) => {
    await expect(page).toHaveScreenshot('editor-empty.png');
  });
});

test.describe('Visual Regression - Header & Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/problem/people');
    await waitForPageReady(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  });

  test('header with controls', async ({ page }) => {
    // Screenshot just the header area
    const header = page.locator('header, nav').first();
    await expect(header).toHaveScreenshot('header-navigation.png');
  });

  test('demo data dropdown open', async ({ page }) => {
    const demoButton = page.getByRole('button', { name: /Demo Data/i });
    await demoButton.click();
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('header-demo-dropdown.png');
  });

  test('problem manager modal', async ({ page }, testInfo) => {
    // Skip on mobile - button may be hidden in mobile menu
    test.skip(testInfo.project.name === 'mobile-chrome', 'Manage Problems button not directly accessible on mobile');
    
    const manageButton = page.getByRole('button', { name: /Manage Problems/i });
    await manageButton.click();
    await page.waitForSelector('.modal-content', { timeout: 5000 });
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('problem-manager-modal.png');
  });
});

// Test different viewports (run in mobile-chrome project)
test.describe('Visual Regression - Mobile Responsive', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Mobile tests for chromium only');
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/problem/people');
    await waitForPageReady(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  });

  test('people section - mobile', async ({ page }) => {
    await expect(page).toHaveScreenshot('mobile-people.png');
  });

  test('with data - mobile', async ({ page }) => {
    await loadDemoData(page, 'simple');
    await expect(page).toHaveScreenshot('mobile-people-populated.png');
  });
});

// Dark mode tests (run in chromium-dark project)
test.describe('Visual Regression - Dark Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/problem/people');
    await waitForPageReady(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  });

  test('people section - dark', async ({ page }) => {
    await expect(page).toHaveScreenshot('dark-people.png');
  });

  test('with data - dark', async ({ page }) => {
    await loadDemoData(page, 'simple');
    await expect(page).toHaveScreenshot('dark-people-populated.png');
  });

  test('solver panel - dark', async ({ page }) => {
    await page.goto('/app/solver');
    await waitForPageReady(page);
    await expect(page).toHaveScreenshot('dark-solver.png');
  });

  test('constraints - dark', async ({ page }) => {
    await loadDemoData(page, 'simple');
    await page.getByRole('button', { name: /Hard Constraints/i }).click();
    await waitForPageReady(page);
    await expect(page).toHaveScreenshot('dark-constraints.png');
  });
});
