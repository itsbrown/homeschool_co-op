import { test, expect } from "@playwright/test";
import { postSetupCartScenario } from "./helpers/testSeed";
import { loginSchoolAdmin } from "./helpers/schoolAdminAuth";

test.describe.configure({ mode: "serial", timeout: 60_000 });

const adminPassword = "TestPassword123!";

test.describe("school analytics engagement", () => {
  test("school admin loads engagement tab and API", async ({ page, request }) => {
    const { response, json } = await postSetupCartScenario(request, {
      linkSupabaseAuthAdmin: true,
    });
    test.skip(
      !response.ok(),
      `seed failed (${response.status()}): ${json?.error ?? json?.details ?? "see server logs"}`,
    );
    test.skip(!json?.success || !json.data?.admin?.email, "seed returned no admin credentials");
    test.skip(
      json.data?.adminSupabaseLinked !== true && json.data?.supabaseLinked !== true,
      "Supabase auth was not linked for admin",
    );

    const admin = json!.data!.admin!;

    const engagementApi = page.waitForResponse(
      (r) => r.url().includes("/api/school-analytics/engagement") && r.ok(),
      { timeout: 60_000 },
    );

    await loginSchoolAdmin(page, admin.email, adminPassword);
    await page.goto("/school-admin/analytics", { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("school-analytics-tabs")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("tab-school-analytics-engagement")).toHaveAttribute(
      "data-state",
      "active",
    );

    const apiRes = await engagementApi;
    const body = await apiRes.json();
    expect(body.summary).toBeDefined();
  });
});
