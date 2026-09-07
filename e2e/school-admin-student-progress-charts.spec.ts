import { test, expect } from "@playwright/test";
import { postSetupProgressScenario } from "./helpers/testSeed";
import { requireLinkedSeed } from "./helpers/requireLinkedSeed";
import { loginSchoolAdmin } from "./helpers/schoolAdminAuth";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("school admin student progress charts", () => {
  test("select one then two students for Lexile charts", async ({ page, request }) => {
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
    if (!seed.children || seed.children.length < 2) {
      throw new Error("seed needs two children with Lexile history");
    }

    const admin = seed.admin;
    const [childA, childB] = seed.children;

    await loginSchoolAdmin(page, admin.email, admin.password);
    await page.goto("/school-admin/assessments", { waitUntil: "domcontentloaded" });
    await page.getByTestId("tab-progress-insights").click();
    await expect(page.getByTestId("student-progress-picker-card")).toBeVisible({
      timeout: 30_000,
    });

    const picker = page.getByTestId("student-progress-picker-card");
    await picker.getByTestId("select-progress-student").click();
    await page.getByPlaceholder(/type name to search/i).fill(childA.firstName);
    const childAnalytics1 = page.waitForResponse(
      (r) => r.url().includes("/api/progress/analytics/children") && r.ok(),
      { timeout: 60_000 },
    );
    await page.getByTestId(`progress-student-option-${childA.id}`).click();
    await childAnalytics1;
    await expect(page.getByTestId("child-reading-progress-chart")).toBeVisible({
      timeout: 20_000,
    });

    await picker.getByTestId("select-progress-student").click();
    await page.getByPlaceholder(/type name to search/i).fill(childB.firstName);
    const childAnalytics2 = page.waitForResponse(
      (r) => r.url().includes("/api/progress/analytics/children") && r.ok(),
      { timeout: 60_000 },
    );
    await page.getByTestId(`progress-student-option-${childB.id}`).click();
    await childAnalytics2;
    await expect(page.getByTestId("multi-student-lexile-chart")).toBeVisible({
      timeout: 20_000,
    });
  });
});
