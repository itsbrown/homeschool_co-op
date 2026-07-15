import { test, expect } from "@playwright/test";
import {
  dismissStaffGuideIfVisible,
  loginParent,
  preventStaffGuideModal,
} from "./helpers/parentCheckoutHelpers";
import { postSetupScheduleScenario } from "./helpers/testSeed";

test.describe.configure({ mode: "serial", timeout: 90_000 });

test.describe("school admin academics KPI", () => {
  test("Attendance Lesson plans tab shows completion % + attendance", async ({ page, request }) => {
    const { response, json } = await postSetupScheduleScenario(request, { linkSupabaseAuth: true });
    test.skip(
      !response.ok(),
      `seed failed (${response.status()}): ${json?.error ?? json?.details ?? "see server logs"}`,
    );
    test.skip(!json?.success || !json.data?.admin?.email, "seed returned no admin credentials");
    test.skip(
      json.data?.supabaseLinked !== true,
      "Supabase auth was not linked (configure SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)",
    );

    const seed = json!.data!;
    await preventStaffGuideModal(page);
    await loginParent(page, seed.admin.email, seed.admin.password);
    await dismissStaffGuideIfVisible(page);

    await page.goto("/school-admin/attendance", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("attendance-tab-lessons")).toBeVisible({ timeout: 30_000 });

    const kpiApi = page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        r.url().includes("/api/school-admin/academics/kpi") &&
        r.ok(),
      { timeout: 60_000 },
    );
    await page.getByTestId("attendance-tab-lessons").click();
    await expect(page.getByTestId("attendance-lessons-panel")).toBeVisible({ timeout: 30_000 });

    const kpiRes = await kpiApi;
    expect(kpiRes.headers()["content-type"] || "").toMatch(/json/i);
    const body = await kpiRes.json();
    expect(body.lesson.completionPercent).toBe(50);

    await expect(page.getByTestId("kpi-lesson-completion")).toContainText("50%");
    await expect(page.getByTestId("kpi-attendance-rate")).toBeVisible();
  });
});
