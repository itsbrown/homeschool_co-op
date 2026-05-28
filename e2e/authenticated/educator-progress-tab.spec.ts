import { test, expect } from '@playwright/test';

test.describe('Educator progress tab', () => {
  test.skip(!process.env.E2E_EDUCATOR_EMAIL, 'Set E2E_EDUCATOR_EMAIL for authenticated educator runs');

  test('Progress tab shows log form test ids', async ({ page }) => {
    await page.goto('/educator/assessments');
    await page.getByTestId('tab-progress').click();
    await expect(page.getByTestId('select-progress-subject')).toBeVisible();
  });
});
