import { test, expect } from '@playwright/test';

test.describe('Parent progress hub', () => {
  test.skip(!process.env.E2E_PARENT_EMAIL, 'Set E2E_PARENT_EMAIL for authenticated parent runs');

  test('loads progress hub route', async ({ page }) => {
    await page.goto('/parent/progress');
    await expect(page.getByRole('heading', { name: /My Child's Progress/i })).toBeVisible();
  });
});
