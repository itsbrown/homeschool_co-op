import { test, expect } from "@playwright/test";
import { postSetupProgressScenario } from "./helpers/testSeed";
import { requireLinkedSeed } from "./helpers/requireLinkedSeed";
import { loginSchoolAdmin } from "./helpers/schoolAdminAuth";

test.describe.configure({ mode: "serial", timeout: 90_000 });

test.describe("school admin progress insights KPI", () => {
  test("progress insights shows jurisdiction and cohort Lexile", async ({ page, request }) => {
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

    const schoolAnalyticsApi = page.waitForResponse(
      (r) => r.url().includes("/api/progress/analytics/school") && r.ok(),
      { timeout: 60_000 },
    );

    await loginSchoolAdmin(page, seed.admin.email, seed.admin.password);
    await page.goto("/school-admin/assessments", { waitUntil: "domcontentloaded" });
    await page.getByTestId("tab-progress-insights").click();

    await expect(page.getByTestId("progress-insights-tab")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("badge-jurisdiction")).toBeVisible();
    await expect(page.getByTestId("select-jurisdiction")).toBeVisible();

    const apiRes = await schoolAnalyticsApi;
    const body = await apiRes.json();
    expect(body.jurisdiction).toBeDefined();
    expect(body.jurisdiction.code).toBe("NY");
    expect(Array.isArray(body.cohortTrend)).toBe(true);
    const withMedian = (body.cohortTrend as Array<{ medianLexile: number | null }>).filter(
      (p) => p.medianLexile != null,
    );
    expect(withMedian.length).toBeGreaterThan(0);

    await expect(page.getByTestId("cohort-lexile-chart")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("proficiency-bands-chart")).toBeVisible();
  });
});
