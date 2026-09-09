import { test, expect } from "@playwright/test";
import { postSetupProgressScenario } from "./helpers/testSeed";
import { requireLinkedSeed } from "./helpers/requireLinkedSeed";
import { loginSchoolAdmin } from "./helpers/schoolAdminAuth";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("school admin assessments page", () => {
  test("unified sidebar + All Assessments lists seeded rows with child names", async ({
    page,
    request,
  }) => {
    const { response, json } = await postSetupProgressScenario(request, {
      linkSupabaseAuthAdmin: true,
      withPlacementLevels: true,
    });
    const seed = requireLinkedSeed(response, json, {
      linked: json?.data?.adminSupabaseLinked === true,
      need: "Supabase school admin",
    });
    if (!seed.admin?.email || !seed.child?.firstName) {
      throw new Error("seed returned no admin or child");
    }

    await loginSchoolAdmin(page, seed.admin.email, seed.admin.password);
    await page.goto("/school-admin/assessments", { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("admin-sidebar-navigation")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("sidebar-navigation")).toHaveCount(0);
    await expect(page.getByTestId("page-title")).toBeVisible();

    const listApi = page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        r.url().includes("/api/assessments/students") &&
        r.ok(),
      { timeout: 30_000 },
    );
    await page.getByTestId("tab-all-assessments").click();
    await listApi;

    const childLabel = `${seed.child.firstName} ${seed.child.lastName}`.trim();
    await expect(
      page.getByTestId(/text-admin-assessment-child-/).filter({ hasText: childLabel }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
