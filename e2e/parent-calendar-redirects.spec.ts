import { test, expect } from "@playwright/test";
import {
  dismissStaffGuideIfVisible,
  loginParent,
  preventStaffGuideModal,
} from "./helpers/parentCheckoutHelpers";
import { requireLinkedSeed } from "./helpers/requireLinkedSeed";
import { postSetupScheduleScenario } from "./helpers/testSeed";

test.describe.configure({ mode: "serial", timeout: 90_000 });

test.describe("parent calendar redirects", () => {
  test("/calendar goes to /schedule; dashboard teaser is not a second grid", async ({
    page,
    request,
  }) => {
    const { response, json } = await postSetupScheduleScenario(request, { linkSupabaseAuth: true });
    const seed = requireLinkedSeed(response, json);
    await preventStaffGuideModal(page);
    await loginParent(page, seed.parent.email, seed.parent.password);
    await dismissStaffGuideIfVisible(page);

    await page.goto("/calendar", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/schedule/, { timeout: 20_000 });
    await expect(page.getByTestId("family-calendar-heading")).toBeVisible({ timeout: 20_000 });

    const familyLinks = page.getByRole("link", { name: /^Family Schedule$/ });
    await expect(familyLinks).toHaveCount(1);

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    const scheduleTab = page.getByRole("tab", { name: /Schedule/i });
    if (await scheduleTab.count()) {
      await scheduleTab.click();
      await expect(page.getByTestId("dashboard-schedule-teaser")).toBeVisible();
      await expect(page.getByTestId("family-calendar-month-grid")).toHaveCount(0);
      await expect(page.getByTestId("link-open-family-calendar")).toBeVisible();
    }
  });
});
