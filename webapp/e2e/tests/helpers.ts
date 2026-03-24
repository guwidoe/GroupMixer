import { expect, type Page } from '@playwright/test';

export async function openApp(page: Page) {
  await page.goto('/app');
  await page.waitForSelector('nav, header', { timeout: 15000 });
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.reload();
  await page.waitForSelector('nav, header', { timeout: 15000 });
  await expect(page.getByRole('link', { name: /problem setup/i })).toBeVisible();
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
  await expect(page.locator('.modal-content')).toBeVisible();
  await page.getByPlaceholder(/enter person's name/i).fill(name);
  await page.locator('.modal-content').getByRole('button', { name: /^add person$/i }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

export async function addGroup(page: Page, id: string, size: number) {
  await page.getByRole('button', { name: /^add group$/i }).click();
  await expect(page.locator('.modal-content')).toBeVisible();
  await page.getByPlaceholder(/team-alpha|group-1/i).fill(id);
  await page.locator('.modal-content input[type="number"]').fill(String(size));
  await page.locator('.modal-content').getByRole('button', { name: /^add group$/i }).click();
  await expect(page.getByRole('heading', { name: id })).toBeVisible();
}

export async function saveCurrentProblem(page: Page) {
  await page.getByRole('button', { name: /^save$/i }).click();
  await expect(page.getByText(/problem saved|saved\./i).first()).toBeVisible();
}

export async function runSolver(page: Page) {
  await page.getByRole('link', { name: /^solver$/i }).click();
  await expect(page).toHaveURL(/\/app\/solver/);

  const startButton = page.getByRole('button', {
    name: /start solver with automatic settings/i,
  });
  await expect(startButton).toBeVisible();
  await startButton.click();

  await expect(page.getByRole('button', { name: /cancel solver/i })).toBeVisible({ timeout: 5000 });
  await expect(startButton).toBeVisible({ timeout: 30000 });
}
