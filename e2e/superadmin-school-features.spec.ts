import { test, expect } from "@playwright/test";
import { postSetupFamilyAccessCodeScenario } from "./helpers/testSeed";
import { requireLinkedSeed } from "./helpers/requireLinkedSeed";
import { loginSchoolAdmin } from "./helpers/schoolAdminAuth";
import { preventStaffGuideModal, dismissStaffGuideIfVisible } from "./helpers/parentCheckoutHelpers";

test.describe.configure({ mode: "serial", timeout: 180_000 });

test.describe("super-admin school features", () => {
  test("School Edit door-codes toggle persists via PUT /features", async ({
    page,
    request,
    browser,
  }) => {
    const { response, json } = await postSetupFamilyAccessCodeScenario(request, {
      linkSupabaseAuthSuperAdmin: true,
      linkSupabaseAuthAdmin: true,
      assignCode: false,
      doorCodesFeature: false,
    });
    const seed = requireLinkedSeed(response, json, {
      linked: json?.data?.superAdminSupabaseLinked === true,
      need: "Supabase super admin",
    });

    await preventStaffGuideModal(page);
    await loginSchoolAdmin(page, seed.superAdmin.email, seed.superAdmin.password);
    await dismissStaffGuideIfVisible(page);
    await page.evaluate(() => localStorage.setItem("activeRole", "superAdmin"));

    await page.goto(`/superadmin/schools/${seed.school.id}/edit`, {
      waitUntil: "domcontentloaded",
    });
    const toggle = page.getByTestId("switch-feature-door-codes");
    await expect(toggle).toBeVisible({ timeout: 30_000 });
    await expect(toggle).toHaveAttribute("data-state", "unchecked");

    const putFeatures = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/superadmin/schools/${seed.school.id}/features`) &&
        r.request().method() === "PUT",
      { timeout: 20_000 },
    );
    await toggle.click();
    const put = await putFeatures;
    expect(put.ok(), `PUT /features returned ${put.status()}`).toBeTruthy();
    await expect(page.getByText("Features updated", { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("switch-feature-door-codes")).toHaveAttribute(
      "data-state",
      "checked",
      { timeout: 30_000 },
    );

    // Stay on a clean session — /login immediately leaves if Super Admin is still signed in.
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await preventStaffGuideModal(adminPage);
    await loginSchoolAdmin(adminPage, seed.admin.email, seed.admin.password);
    await dismissStaffGuideIfVisible(adminPage);
    await adminPage.goto("/schools/locations", { waitUntil: "domcontentloaded" });
    await expect(adminPage.getByTestId("tab-door-codes")).toBeVisible({ timeout: 30_000 });
    await adminContext.close();
  });
});
