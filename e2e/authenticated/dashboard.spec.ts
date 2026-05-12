import { test, expect } from "@playwright/test";

/**
 * These specs run in the `chromium-authenticated` project (see playwright.config.ts)
 * with a session produced by `e2e/auth.setup.ts`.
 */
test.describe("parent session", () => {
  test("dashboard does not send logged-in parent to login", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
  });
});
