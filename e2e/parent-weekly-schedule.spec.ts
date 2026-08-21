import { test, expect } from "@playwright/test";
import {
  dismissStaffGuideIfVisible,
  loginParent,
  preventStaffGuideModal,
} from "./helpers/parentCheckoutHelpers";
import { requireLinkedSeed } from "./helpers/requireLinkedSeed";
import { postSetupScheduleScenario } from "./helpers/testSeed";

test.describe.configure({ mode: "serial", timeout: 90_000 });

test.describe("parent weekly schedule", () => {
  test("shows only enrolled class sections for this week; print root scoped", async ({
    page,
    request,
  }) => {
    const { response, json } = await postSetupScheduleScenario(request, { linkSupabaseAuth: true });
    const seed = requireLinkedSeed(response, json);
    await preventStaffGuideModal(page);
    await loginParent(page, seed.parent.email, seed.parent.password);
    await dismissStaffGuideIfVisible(page);

    const myWeekApi = page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        r.url().includes("/api/schedule-builder/parent/my-week-plans") &&
        r.ok(),
      { timeout: 60_000 },
    );
    await page.goto("/parent/weekly-schedule", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/schedule\?view=week/, { timeout: 20_000 });
    const apiRes = await myWeekApi;
    expect(apiRes.headers()["content-type"] || "").toMatch(/json/i);

    await expect(page.getByTestId("family-calendar-heading")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("schedule-print-root")).toBeVisible();
    await expect(page.getByTestId("weekly-schedule-print")).toBeVisible();

    const body = await apiRes.json();
    expect(body.children.length).toBe(2);
    for (const entry of body.children) {
      await expect(
        page.getByTestId(`child-week-section-${entry.childId}-${entry.classId}`),
      ).toBeVisible();
      await expect(
        page.getByTestId(`child-week-heading-${entry.childId}-${entry.classId}`),
      ).toContainText(entry.classTitle);
    }
  });
});
