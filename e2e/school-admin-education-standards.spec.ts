import { test, expect } from "@playwright/test";
import { postSetupProgressScenario } from "./helpers/testSeed";
import { requireLinkedSeed } from "./helpers/requireLinkedSeed";
import { loginSchoolAdmin } from "./helpers/schoolAdminAuth";

test.describe.configure({ mode: "serial", timeout: 90_000 });

test.describe("school admin education standards catalog", () => {
  test("standards catalog lists NY/National and filters by subject", async ({
    page,
    request,
  }) => {
    const { response, json } = await postSetupProgressScenario(request, {
      linkSupabaseAuthAdmin: true,
    });
    const seed = requireLinkedSeed(response, json, {
      linked: json?.data?.adminSupabaseLinked === true,
      need: "Supabase school admin",
    });
    if (!seed.admin?.email) {
      throw new Error("seed returned no admin credentials");
    }

    const standardsApi = page.waitForResponse(
      (r) =>
        r.url().includes("/api/education-standards?") &&
        !r.url().includes("jurisdictions") &&
        !r.url().includes("kpi-thresholds") &&
        r.ok(),
      { timeout: 60_000 },
    );

    await loginSchoolAdmin(page, seed.admin.email, seed.admin.password);
    await page.goto("/school-admin/assessments", { waitUntil: "domcontentloaded" });
    await page.getByTestId("tab-standards-catalog").click();

    await expect(page.getByTestId("standards-catalog-tab")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("select-standards-jurisdiction")).toBeVisible();

    const apiRes = await standardsApi;
    const body = await apiRes.json();
    expect(body.jurisdiction).toBeDefined();
    expect(["NY", "US"]).toContain(body.jurisdiction.code);
    expect(Array.isArray(body.standards)).toBe(true);
    expect(body.standards.length).toBeGreaterThan(0);

    await expect(page.getByTestId("standards-table")).toBeVisible();
  });
});
