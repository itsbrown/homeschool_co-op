import { test, expect } from "@playwright/test";

/**
 * Public store guest checkout — requires PUBLIC_STORE_ENABLED=true,
 * school with public_store_enabled + store_slug, and a published session listing.
 */
test.describe("public store guest checkout", () => {
  test.skip("browse store catalog and start checkout", async ({ page }) => {
    await page.goto("/store/test-school");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
