import { test, expect } from "@playwright/test";

test.describe("app smoke", () => {
  test("GET / returns HTML shell with root mount", async ({ request }) => {
    const res = await request.get("/");
    expect(res.ok(), `expected 200, got ${res.status()}`).toBeTruthy();
    const html = await res.text();
    expect(html).toContain('id="root"');
  });

  test("login page shows academy branding", async ({ page }) => {
    await page.goto("/login", { waitUntil: "load" });
    await expect(page.getByText("American Seekers Academy")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/Sign in to your account/i)).toBeVisible();
  });
});
