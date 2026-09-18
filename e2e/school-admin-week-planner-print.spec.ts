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
    await expect(printRoot).toContainText(/Outdoor observation/i);
    await expect(printRoot).toContainText(/Observe local plants/i);
    await expect(printRoot).toContainText(/Record weather notes/i);
  });

  test("shows lesson description, objectives, and materials on the week card", async ({
    page,
    request,
  }) => {
    const { response, json } = await postSetupScheduleScenario(request, { linkSupabaseAuth: true });
    const seed = requireLinkedSeed(response, json);

    await preventStaffGuideModal(page);
    await loginSchoolAdmin(page, seed.admin.email, seed.admin.password);
    await dismissStaffGuideIfVisible(page);

    await page.goto("/schools/week-planner", { waitUntil: "domcontentloaded" });
    await page.getByTestId("week-planner-template-select").click();
    await page.getByRole("option", { name: new RegExp(seed.classes.seekers.title.split(" ")[0]) }).click();

    const publishedChip = page.getByTestId(`week-plan-chip-${seed.weekPlans.seekersPublishedId}`);
    await expect(publishedChip).toBeVisible({ timeout: 30_000 });
    await publishedChip.click();

    const blockId = seed.blocks.seekersCompletedId;
    await expect(page.getByTestId(`week-block-description-${blockId}`)).toContainText(
      /Outdoor observation/i,
    );
    await expect(page.getByTestId(`week-block-objectives-${blockId}`)).toContainText(
      /Observe local plants/i,
    );
    await expect(page.getByText(/Clipboards/i).first()).toBeVisible();

    await page.getByTestId(`week-block-details-${blockId}`).click();
    const detail = page.getByTestId("schedule-block-detail");
    await expect(detail).toBeVisible();
    await expect(detail.getByTestId("schedule-block-description")).toContainText(
      /Outdoor observation of local plants and weather/i,
    );
    await expect(detail.getByTestId("schedule-block-objectives")).toContainText(/Record weather notes/i);
    await expect(detail.getByTestId("schedule-block-materials")).toContainText(/Weather journals/i);
    await expect(detail).toContainText(/Walk the nature trail first/i);
  });
});
