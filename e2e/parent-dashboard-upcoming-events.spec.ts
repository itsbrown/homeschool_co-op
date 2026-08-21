import { test, expect } from "@playwright/test";
import { addDays, format } from "date-fns";
import { loginSchoolAdmin } from "./helpers/schoolAdminAuth";
import {
  dismissStaffGuideIfVisible,
  loginParent,
  preventStaffGuideModal,
  waitForSupabaseToken,
} from "./helpers/parentCheckoutHelpers";
import { requireLinkedSeed } from "./helpers/requireLinkedSeed";
import { postSetupScheduleScenario } from "./helpers/testSeed";

test.describe.configure({ mode: "serial", timeout: 180_000 });

function atLocal(day: Date, hours: number, minutes: number): string {
  const value = new Date(day);
  value.setHours(hours, minutes, 0, 0);
  return value.toISOString();
}

test.describe("parent dashboard upcoming events", () => {
  test("7-day mix includes school events; outside window stays on calendar only", async ({
    page,
    request,
    browser,
  }) => {
    const { response, json } = await postSetupScheduleScenario(request, { linkSupabaseAuth: true });
    const seed = requireLinkedSeed(response, json);
    expect(seed.holiday?.title).toBeTruthy();

    const suffix = Date.now();
    const insideTitle = `Open House Mix ${suffix}`;
    const outsideTitle = `Far Picnic ${suffix}`;
    const insideDay = addDays(new Date(), 2);
    const outsideDay = addDays(new Date(), 14);
    const insideYmd = format(insideDay, "yyyy-MM-dd");
    const venue = "Brighton gym";
    const description = "Meet the mentors and tour classrooms.";

    const adminPage = await browser.newPage();
    await preventStaffGuideModal(adminPage);
    await loginSchoolAdmin(adminPage, seed.admin.email, seed.admin.password);
    const adminToken = await waitForSupabaseToken(adminPage);

    const insideRes = await request.post("/api/calendar-events", {
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      data: {
        title: insideTitle,
        description,
        location: venue,
        eventType: "special",
        isAllDay: false,
        startDate: atLocal(insideDay, 10, 0),
        endDate: atLocal(insideDay, 11, 30),
      },
    });
    expect(insideRes.ok(), await insideRes.text()).toBeTruthy();

    const outsideRes = await request.post("/api/calendar-events", {
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      data: {
        title: outsideTitle,
        description: "Too far for the dashboard card",
        eventType: "special",
        isAllDay: true,
        startDate: atLocal(outsideDay, 12, 0),
        endDate: atLocal(outsideDay, 12, 0),
      },
    });
    expect(outsideRes.ok(), await outsideRes.text()).toBeTruthy();
    await adminPage.close();

    await preventStaffGuideModal(page);
    await loginParent(page, seed.parent.email, seed.parent.password);
    await dismissStaffGuideIfVisible(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const card = page.getByTestId("parent-upcoming-events-card");
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText(seed.holiday!.title, { timeout: 30_000 });
    await expect(card).toContainText(insideTitle, { timeout: 30_000 });
    await expect(card).not.toContainText(outsideTitle);

    const kpiText = (await page.getByTestId("parent-upcoming-events-kpi").textContent()) || "0";
    expect(Number.parseInt(kpiText, 10)).toBeGreaterThanOrEqual(1);

    await card.getByRole("link", { name: /View full calendar/i }).click();
    await expect(page).toHaveURL(/\/schedule/, { timeout: 20_000 });
    await expect(page.getByTestId("family-calendar-month-grid")).toBeVisible({ timeout: 30_000 });

    let opened = false;
    for (let i = 0; i < 3; i++) {
      const cell = page.getByTestId(`calendar-day-${insideYmd}`);
      if ((await cell.count()) > 0) {
        await cell.click();
        opened = true;
        break;
      }
      await page.getByTestId("button-next-month").click();
    }
    expect(opened).toBeTruthy();

    await expect(page.getByTestId("family-day-sheet")).toBeVisible();
    const sheet = page.getByTestId("day-sheet-school-event").filter({ hasText: insideTitle });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText(description);
    await expect(sheet).toContainText(venue);
    await expect(sheet).toContainText(/10:00|10:00 AM/i);
    await expect(sheet).toContainText("Special Event");
    await page.keyboard.press("Escape");

    await page.getByTestId("button-view-month").click();
    const outsideYmd = format(outsideDay, "yyyy-MM-dd");
    let sawOutside = false;
    for (let i = 0; i < 3; i++) {
      if ((await page.getByText(outsideTitle).count()) > 0) {
        sawOutside = true;
        break;
      }
      const cell = page.getByTestId(`calendar-day-${outsideYmd}`);
      if ((await cell.count()) > 0) {
        await expect(cell).toContainText(outsideTitle);
        sawOutside = true;
        break;
      }
      await page.getByTestId("button-next-month").click();
    }
    expect(sawOutside).toBeTruthy();

    await page.getByTestId("button-view-list").click();
    await expect(page.getByTestId("family-calendar-list")).toBeVisible();
    await expect(page.getByText(outsideTitle).first()).toBeVisible({ timeout: 20_000 });
  });
});
