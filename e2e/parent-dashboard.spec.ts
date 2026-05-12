import { test, expect } from "@playwright/test";

/**
 * Parent dashboard lives at /dashboard behind Supabase auth + parent role.
 * Extend this suite with storageState / test users when you have stable E2E credentials.
 */
test.describe("parent dashboard (unauthenticated)", () => {
  test("dashboard redirects or gates when not logged in", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    // Router sends unauthenticated users to /login
    await expect(page).toHaveURL(/\/login$/, { timeout: 30_000 });
  });
});
