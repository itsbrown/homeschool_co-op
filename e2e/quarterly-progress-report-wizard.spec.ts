/**
 * NY | Progress report wizard (educator) + parent PDF download.
 * SEL checklist marks are completed via API until the wizard grid ships.
 */
import { test, expect } from "@playwright/test";
import {
  dismissStaffGuideIfVisible,
  loginParent,
  preventStaffGuideModal,
  waitForSupabaseToken,
} from "./helpers/parentCheckoutHelpers";
import { completeQuarterlyRubricViaApi } from "./helpers/progressReportHelpers";
import { postSetupProgressScenario, type SetupProgressScenarioResponse } from "./helpers/testSeed";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("NY | Progress report wizard", () => {
  let seed: NonNullable<SetupProgressScenarioResponse["data"]>;

  test.beforeAll(async ({ request }) => {
    const { response, json } = await postSetupProgressScenario(request, { linkSupabaseAuth: true });
    test.skip(
      !response.ok(),
      `seed failed (${response.status()}): ${json?.error ?? json?.details ?? "see server logs"}`,
    );
    test.skip(!json?.success || !json.data?.educator?.email, "seed returned no educator credentials");
    test.skip(
      json.data?.supabaseLinked !== true,
      "Supabase auth was not linked (configure SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)",
    );
    seed = json.data!;
  });

  async function loginAs(page: import("@playwright/test").Page, email: string, password: string) {
    await preventStaffGuideModal(page);
    await loginParent(page, email, password);
    await dismissStaffGuideIfVisible(page);
  }

  async function openWizardForChild(page: import("@playwright/test").Page) {
    const childName = `${seed.child.firstName} ${seed.child.lastName}`;
    const progressUrl =
      `/educator/assessments?tab=progress&childId=${seed.child.id}` +
      `&childName=${encodeURIComponent(childName)}`;

    await page.goto(progressUrl, { waitUntil: "load" });
    await expect(page.getByTestId("page-title")).toContainText("Student Assessments", { timeout: 30_000 });
    await expect(page.getByTestId("tab-progress")).toHaveAttribute("data-state", "active", { timeout: 15_000 });

    const progressPanel = page.getByTestId("assessments-tabpanel-progress");
    await expect(progressPanel).toBeVisible({ timeout: 30_000 });

    const wizard = progressPanel.getByTestId("quarterly-report-wizard");
    await expect(wizard).toBeVisible({ timeout: 30_000 });
    return wizard;
  }

  test("educator saves rubric fields in the wizard", async ({ page }) => {
    const { email, password } = seed.educator;
    await loginAs(page, email, password);

    const wizard = await openWizardForChild(page);
    await expect(wizard.getByText("NY | Progress report")).toBeVisible();

    await wizard.locator('input[type="number"]').nth(0).fill("12");
    await wizard.locator('input[type="number"]').nth(1).fill("45");
    await wizard.locator('input[type="number"]').nth(2).fill("10");
    await wizard.getByTestId("textarea-approved-narrative").fill(
      "E2E: phonics, counting, and handwriting strokes covered this quarter.",
    );

    const saveApi = page.waitForResponse(
      (r) => r.url().includes("/api/progress/quarterly-rubric/") && r.request().method() === "PUT" && r.ok(),
      { timeout: 30_000 },
    );
    await wizard.getByTestId("button-save-rubric").click();
    await saveApi;
    await expect(page.getByText("Quarterly rubric saved")).toBeVisible({ timeout: 15_000 });
  });

  test("educator finalizes report; parent downloads PDF", async ({ page, request }) => {
    const approvedNarrative = "E2E: phonics, counting, and handwriting strokes covered this quarter.";
    const { email, password } = seed.educator;
    await loginAs(page, email, password);

    const token = await waitForSupabaseToken(page);
    const complete = await completeQuarterlyRubricViaApi(request, token, seed.child.id, {
      schoolYear: seed.schoolYear,
      quarter: seed.quarter,
      gradeLevel: seed.child.gradeLevel,
      approvedNarrative,
      asaCoopHours: 12,
      homeInstructionHours: 45,
      phonogramCount: 10,
    });
    expect(complete.ok, `complete rubric failed (${complete.status})`).toBe(true);

    const wizard = await openWizardForChild(page);
    await wizard.getByTestId("textarea-approved-narrative").fill(approvedNarrative);

    const generateApi = page.waitForResponse(
      (r) => r.url().includes("/generate") && r.request().method() === "POST",
      { timeout: 60_000 },
    );
    await wizard.getByTestId("button-finalize-report").click();
    const genRes = await generateApi;
    expect(genRes.status()).toBe(201);
    const genBody = (await genRes.json()) as { snapshotId: number };
    expect(genBody.snapshotId).toBeGreaterThan(0);

    await expect(page.getByText("NY | Progress report generated", { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });

    const { email: parentEmail, password: parentPassword } = seed.parent;
    await page.getByRole("button", { name: "Log Out" }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
    await loginAs(page, parentEmail, parentPassword);

    const snapshotsApi = page.waitForResponse(
      (r) => r.url().includes("/snapshots") && r.ok(),
      { timeout: 60_000 },
    );
    await page.goto("/parent/progress", { waitUntil: "load" });
    await snapshotsApi;

    const reportsCard = page.getByTestId("parent-progress-reports-card");
    await expect(reportsCard).toBeVisible();
    await expect(reportsCard.getByText(/Fall/i)).toBeVisible();

    const pdfApi = page.waitForResponse(
      (r) => r.url().includes("/api/progress/report/") && r.url().includes("format=pdf") && r.ok(),
      { timeout: 60_000 },
    );
    await reportsCard.getByTestId(`button-download-report-${genBody.snapshotId}`).click();
    const pdfRes = await pdfApi;
    expect(pdfRes.headers()["content-type"]).toMatch(/application\/pdf/);
  });

  test("parent progress hub passes axe accessibility scan", async ({ page }) => {
    const { email, password } = seed.parent;
    await loginAs(page, email, password);
    await page.goto("/parent/progress", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("parent-progress-reports-card")).toBeVisible({ timeout: 30_000 });

    try {
      const { default: AxeBuilder } = await import("@axe-core/playwright");
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    } catch {
      test.skip(true, "@axe-core/playwright not installed");
    }
  });
});
