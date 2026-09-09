import { test, expect } from "@playwright/test";
import { postSetupProgressScenario } from "./helpers/testSeed";
import { requireLinkedSeed } from "./helpers/requireLinkedSeed";
import { loginSchoolAdmin } from "./helpers/schoolAdminAuth";

test.describe.configure({ mode: "serial", timeout: 180_000 });

test.describe("school admin progress insights placement coverage", () => {
  test("admin sees Math Level KPI and missing-levels worklist", async ({ page, request }) => {
    const { response, json } = await postSetupProgressScenario(request, {
      linkSupabaseAuthAdmin: true,
    });
    const seed = requireLinkedSeed(response, json, {
      linked: json?.data?.adminSupabaseLinked === true,
      need: "Supabase school admin",
    });
    if (!seed.admin?.email || !seed.child?.id) {
      throw new Error("seed returned no admin or child");
    }

    await loginSchoolAdmin(page, seed.admin.email, seed.admin.password);
    await page.goto("/school-admin/assessments", { waitUntil: "domcontentloaded" });
    await page.getByTestId("tab-progress-insights").click();

    await expect(page.getByTestId("progress-insights-tab")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("kpi-math-level-coverage")).toBeVisible();
    await expect(page.getByTestId("kpi-math-level-coverage")).toContainText("0");
    await expect(page.getByTestId("math-level-distribution-empty")).toBeVisible();

    await page.getByTestId("kpi-math-level-coverage").click();
    await expect(page.getByTestId("missing-levels-worklist")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId(`missing-level-row-${seed.child.id}`)).toBeVisible();
    await expect(page.getByTestId(`missing-level-row-${seed.child.id}`)).toContainText(/math/i);

    await page.goto(`/schools/students/${seed.child.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("math-level-profile-section")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("button-toggle-math-level-entry").click();
    await page.getByTestId("input-math-level").fill("3A");
    const saveMath = page.waitForResponse(
      (r) =>
        r.url().includes("/api/math-level/entry") &&
        r.request().method() === "POST" &&
        r.ok(),
      { timeout: 60_000 },
    );
    await page.getByTestId("button-save-math-level").click();
    await saveMath;

    await page.goto("/school-admin/assessments", { waitUntil: "domcontentloaded" });
    await page.getByTestId("tab-progress-insights").click();
    await expect(page.getByTestId("kpi-math-level-coverage")).toContainText("1", {
      timeout: 30_000,
    });
    await expect(page.getByTestId("math-level-distribution-chart")).toBeVisible();
    await expect(page.getByTestId("math-level-distribution-chart")).toContainText("3A");
  });
});
