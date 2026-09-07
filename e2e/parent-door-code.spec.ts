import { test, expect } from "@playwright/test";
import { postSetupFamilyAccessCodeScenario } from "./helpers/testSeed";
import { requireLinkedSeed } from "./helpers/requireLinkedSeed";
import {
  bearerAuthHeaders,
  dismissStaffGuideIfVisible,
  loginParent,
  preventStaffGuideModal,
  waitForSupabaseToken,
} from "./helpers/parentCheckoutHelpers";
import { loginSchoolAdmin } from "./helpers/schoolAdminAuth";

test.describe.configure({ mode: "serial", timeout: 180_000 });

test.describe("parent door code lookup", () => {
  test("dashboard banner is above the fold and Settings shows the same code", async ({
    page,
    request,
  }) => {
    const { response, json } = await postSetupFamilyAccessCodeScenario(request, {
      linkSupabaseAuthParent: true,
      linkSupabaseAuthAdmin: true,
      assignCode: true,
    });
    const seed = requireLinkedSeed(response, json, {
      linked: json?.data?.parentSupabaseLinked === true,
      need: "Supabase parent",
    });

    await preventStaffGuideModal(page);
    await loginParent(page, seed.parent.email, seed.parent.password);
    await dismissStaffGuideIfVisible(page);

    await page.goto("/", { waitUntil: "domcontentloaded" });
    const banner = page.getByTestId("dashboard-door-code");
    await expect(banner).toBeVisible({ timeout: 30_000 });
    await expect(banner).toBeInViewport();
    await expect(page.getByTestId("dashboard-door-code-value")).toHaveText(seed.assignedCode);
    await expect(page.getByTestId("dashboard-door-code-copy")).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(banner).toBeVisible();
    await expect(banner).toBeInViewport();
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("settings-door-code")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("settings-door-code-value")).toHaveText(seed.assignedCode);

    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await loginSchoolAdmin(page, seed.admin.email, seed.admin.password);
    await page.evaluate(() => localStorage.setItem("activeRole", "schoolAdmin"));
    const token = await waitForSupabaseToken(page);
    const transfer = await request.patch(`/api/locations/parent/${seed.parent.id}/location`, {
      headers: {
        ...bearerAuthHeaders(token),
        "Content-Type": "application/json",
        "X-Active-Role": "schoolAdmin",
      },
      data: { locationId: seed.otherCampus.id },
    });
    expect(transfer.ok(), `campus transfer failed: ${await transfer.text()}`).toBeTruthy();

    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await loginParent(page, seed.parent.email, seed.parent.password);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("dashboard-door-code")).toHaveCount(0, { timeout: 20_000 });
  });
});
