import { test, expect } from "@playwright/test";
import {
  dismissStaffGuideIfVisible,
  loginParent,
  preventStaffGuideModal,
} from "./helpers/parentCheckoutHelpers";
import { postSetupProgressScenario } from "./helpers/testSeed";

test.describe.configure({ mode: "serial", timeout: 90_000 });

test.describe("parent progress charts", () => {
  test("parent hub shows reading and math charts tab", async ({ page, request }) => {
    const { response, json } = await postSetupProgressScenario(request, {
      linkSupabaseAuth: true,
    });
    test.skip(
      !response.ok(),
      `seed failed (${response.status()}): ${json?.error ?? json?.details ?? "see server logs"}`,
    );
    test.skip(!json?.success || !json.data?.parent?.email, "seed returned no parent credentials");
    test.skip(
      json.data?.supabaseLinked !== true,
      "Supabase auth was not linked (configure SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)",
    );

    const { parent } = json!.data!;

    const childAnalyticsApi = page.waitForResponse(
      (r) => r.url().includes("/api/progress/analytics/child/") && r.ok(),
      { timeout: 60_000 },
    );

    await preventStaffGuideModal(page);
    await loginParent(page, parent.email, parent.password);
    await page.goto("/parent/progress", { waitUntil: "domcontentloaded" });
    await dismissStaffGuideIfVisible(page);

    await expect(page.getByRole("tab", { name: "Charts" })).toBeVisible({ timeout: 30_000 });

    const apiRes = await childAnalyticsApi;
    const body = await apiRes.json();
    expect(body.reading).toBeDefined();
    expect(body.math).toBeDefined();
  });
});
