import { test, expect } from "@playwright/test";
import { postSetupCartScenario } from "./helpers/testSeed";
import { loginSchoolAdmin } from "./helpers/schoolAdminAuth";

test.describe.configure({ mode: "serial", timeout: 60_000 });

const adminPassword = "TestPassword123!";

test.describe("school analytics cart abandonment", () => {
  test("school admin loads cart abandonment tab and API", async ({ page, request }) => {
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

    await loginSchoolAdmin(page, admin.email, adminPassword);
    await page.goto("/school-admin/analytics", { waitUntil: "domcontentloaded" });

    const cartApi = page.waitForResponse(
      (r) => r.url().includes("/api/school-analytics/cart-abandonment") && r.ok(),
      { timeout: 60_000 },
    );

    await page.getByTestId("tab-school-analytics-cart").click();
    await expect(page.getByTestId("tab-school-analytics-cart")).toHaveAttribute(
      "data-state",
      "active",
    );

    const apiRes = await cartApi;
    const body = await apiRes.json();
    expect(Array.isArray(body.funnel)).toBe(true);
    expect(body.summary).toBeDefined();
  });
});
