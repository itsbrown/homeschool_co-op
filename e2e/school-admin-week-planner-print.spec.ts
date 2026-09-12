import { test, expect } from "@playwright/test";
import {
  dismissStaffGuideIfVisible,
  preventStaffGuideModal,
} from "./helpers/parentCheckoutHelpers";
import { requireLinkedSeed } from "./helpers/requireLinkedSeed";
import { loginSchoolAdmin } from "./helpers/schoolAdminAuth";
import { postSetupScheduleScenario } from "./helpers/testSeed";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("school admin week planner print", () => {
  test("prints the selected week with the staff ASA sheet", async ({ page, request }) => {
    const { response, json } = await postSetupScheduleScenario(request, { linkSupabaseAuth: true });
    const seed = requireLinkedSeed(response, json);

    await preventStaffGuideModal(page);
    await loginSchoolAdmin(page, seed.admin.email, seed.admin.password);
    await dismissStaffGuideIfVisible(page);

    const skeletonsApi = page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        r.url().includes("/api/schedule-builder/skeletons") &&
        !r.url().includes("/blocks") &&
        r.ok(),
      { timeout: 60_000 },
    );
    await page.goto("/schools/week-planner", { waitUntil: "domcontentloaded" });
    const skeletonsRes = await skeletonsApi;
    expect(skeletonsRes.headers()["content-type"] || "").toMatch(/json/i);

    await page.getByTestId("week-planner-template-select").click();
    await page.getByRole("option", { name: new RegExp(seed.classes.seekers.title.split(" ")[0]) }).click();

    const publishedChip = page.getByTestId(`week-plan-chip-${seed.weekPlans.seekersPublishedId}`);
    await expect(publishedChip).toBeVisible({ timeout: 30_000 });
    await publishedChip.click();

    await expect(page.getByTestId("week-planner-print")).toBeVisible({ timeout: 30_000 });

    const printRoot = page.getByTestId("schedule-print-root");
    await expect(printRoot).toBeAttached();
    await expect(printRoot.locator(".asa-print-title")).toContainText(/Seekers Template/i);
    await expect(printRoot.locator(".asa-print-week-label")).toContainText(/WEEK OF/i);
    await expect(printRoot.locator(".asa-print-table")).toBeAttached();
    await expect(printRoot).toContainText(seed.blocks.seekersTitle);
    await expect(printRoot).toContainText(/MONDAY/i);
  });
});
