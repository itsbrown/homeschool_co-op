import { test, expect } from '@playwright/test';

test.describe('Educator progress tab', () => {
  test.skip(true, 'Superseded by e2e/educator-assessments-record.spec.ts (seed login, no E2E_EDUCATOR_EMAIL)');

  test('Progress tab shows log form test ids', async ({ page }) => {
    await page.goto('/educator/assessments');
    await page.getByTestId('tab-progress').click();
    await expect(page.getByTestId('select-progress-subject')).toBeVisible();
  });
});
