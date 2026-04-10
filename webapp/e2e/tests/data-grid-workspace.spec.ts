import { test, expect } from '@playwright/test';
import { navigateScenarioSetupSection, openApp, waitForModal } from './helpers';

test.describe('Scenario data-grid workspace', () => {
  test('reuses typed grid edit and csv modes across People and Groups', async ({ page }) => {
    test.setTimeout(60000);

    await openApp(page);

    for (const name of ['Alice', 'Bob']) {
      await page.getByRole('button', { name: /^add person$/i }).click();
      await waitForModal(page);
      await page.getByPlaceholder(/enter person's name/i).fill(name);
      await page.locator('.modal-content').getByRole('button', { name: /^add person$/i }).click();
      await expect(page.getByText(name).first()).toBeVisible();
    }

    await page.getByRole('button', { name: /^list$/i }).click();
    await expect(page.getByRole('button', { name: /edit table/i })).toBeVisible();

    await page.getByRole('button', { name: /^csv$/i }).click();
    const peopleCsv = page.getByRole('textbox', { name: /people grid csv/i });
    await expect(peopleCsv).toBeVisible();
    await expect(peopleCsv).toHaveValue(/Name,Sessions/);
    await expect(peopleCsv).toHaveValue(/"\[1,2,3\]"/);
    await expect(page.getByText(/arrays use json/i)).toBeVisible();

    await page.getByRole('button', { name: /^edit table$/i }).click();
    await expect(page.getByRole('button', { name: /apply changes/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /discard changes/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /add row/i })).toBeVisible();
    await page.getByRole('button', { name: /discard changes/i }).click();
    await expect(page.getByRole('button', { name: /edit table/i })).toBeVisible();

    await navigateScenarioSetupSection(page, /groups/i);
    await expect(page.getByRole('heading', { name: /^groups$/i })).toBeVisible();
    await page.getByRole('button', { name: /^add group$/i }).click();
    await waitForModal(page);
    await page.getByPlaceholder(/team-alpha|group-1/i).fill('Team Alpha');
    await page.locator('.modal-content input[type="number"]').fill('2');
    await page.locator('.modal-content').getByRole('button', { name: /^add group$/i }).click();
    await expect(page.getByText('Team Alpha').first()).toBeVisible();

    await expect(page.getByRole('button', { name: /edit table/i })).toBeVisible();
    await page.getByRole('button', { name: /^csv$/i }).click();
    const groupsCsv = page.getByRole('textbox', { name: /groups grid csv/i });
    await expect(groupsCsv).toBeVisible();
    await expect(groupsCsv).toHaveValue(/Group,Default capacity,Session capacities/);
    await expect(groupsCsv).toHaveValue(/Team Alpha,2,"\[2,2,2\]"/);

    await page.getByRole('button', { name: /^edit table$/i }).click();
    await expect(page.getByRole('button', { name: /apply changes/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /discard changes/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /add row/i })).toBeVisible();
  });

  test('uses json-backed targets for attribute-balance in the shared grid workspace', async ({ page }) => {
    test.setTimeout(60000);

    await openApp(page);

    await navigateScenarioSetupSection(page, /attribute definitions|attributes/i);
    await page.getByRole('button', { name: /add attribute/i }).click();
    await waitForModal(page);
    await page.getByPlaceholder(/department, experience/i).fill('gender');
    await page.getByPlaceholder(/value 1/i).fill('female');
    await page.getByRole('button', { name: /add value/i }).click();
    await page.getByPlaceholder(/value 2/i).fill('asdf | asdf:');
    await page.locator('.modal-content button').filter({ hasText: /^add attribute$/i }).click();

    await navigateScenarioSetupSection(page, /groups/i);
    await page.getByRole('button', { name: /^add group$/i }).click();
    await waitForModal(page);
    await page.getByPlaceholder(/team-alpha|group-1/i).fill('G1');
    await page.locator('.modal-content button').filter({ hasText: /^add group$/i }).click();

    await navigateScenarioSetupSection(page, /attribute balance/i);
    await page.getByRole('button', { name: /add attribute balance/i }).click();
    await waitForModal(page);

    const selects = page.locator('.modal-content select');
    await selects.nth(0).selectOption('G1');
    await selects.nth(1).selectOption({ label: 'gender' });

    const numberInputs = page.locator('.modal-content input[type="number"]');
    await numberInputs.nth(0).fill('2');
    await numberInputs.nth(1).fill('1');
    await page.locator('.modal-content button').filter({ hasText: /^save$/i }).click();

    await expect(page.getByRole('button', { name: /edit table/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /targets/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /attribute/i })).toBeVisible();
    await expect(page.getByRole('row', { name: /G1 gender .*asdf \| asdf:: 2 .*female: 1/i })).toBeVisible();

    await page.getByRole('button', { name: /^csv$/i }).click();
    const attributeBalanceCsv = page.getByRole('textbox', { name: /attribute balance csv/i });
    await expect(attributeBalanceCsv).toBeVisible();
    await expect(attributeBalanceCsv).toHaveValue(/Group,Attribute,Targets,Mode,Weight,Sessions/);
    await expect(attributeBalanceCsv).toHaveValue(/G1,gender,"\{""asdf \\| asdf:"":2,""female"":1\}",exact,10,"\{""mode"":""all""\}"/);

    await attributeBalanceCsv.fill('Group,Attribute,Targets,Mode,Weight,Sessions\nG1,gender,"{""asdf | asdf:"":2,""female"":3}",exact,10,"{""mode"":""selected"",""sessions"":[0,1,2]}"');
    await page.getByRole('button', { name: /apply changes/i }).click();

    await expect(page.getByRole('row', { name: /G1 gender .*asdf \| asdf:: 2 .*female: 3/i })).toBeVisible();
    await expect(page.getByText(/Selected: 1, 2, 3/i)).toBeVisible();

    await page.getByRole('button', { name: /^csv$/i }).click();
    await expect(page.getByRole('textbox', { name: /attribute balance csv/i })).toHaveValue(/G1,gender,"\{""asdf \\| asdf:"":2,""female"":3\}",exact,10,"\{""mode"":""selected"",""sessions"":\[0,1,2\]\}"/);
  });
});
