import { test, expect } from "@playwright/test";
import {
  dismissStaffGuideIfVisible,
  loginParent,
  preventStaffGuideModal,
} from "./helpers/parentCheckoutHelpers";
import { requireLinkedSeed } from "./helpers/requireLinkedSeed";
import { postSetupScheduleScenario } from "./helpers/testSeed";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("parent family calendar hub", () => {
  test("month, week, list, subscribe, and no parent create", async ({ page, request }) => {
    const { response, json } = await postSetupScheduleScenario(request, { linkSupabaseAuth: true });
    const seed = requireLinkedSeed(response, json);
    await preventStaffGuideModal(page);
    await loginParent(page, seed.parent.email, seed.parent.password);
    await dismissStaffGuideIfVisible(page);

    await page.getByRole("link", { name: /Family Schedule/i }).first().click();
    await expect(page).toHaveURL(/\/schedule/);
    await expect(page.getByTestId("family-calendar-heading")).toHaveText(/Calendar/);
    await expect(page.getByTestId("family-calendar-month-grid")).toBeVisible({ timeout: 30_000 });

    await expect(page.getByTestId("class-chip").filter({ hasText: seed.classes.seekers.title }).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("class-chip").filter({ hasText: seed.classes.yankee.title }).first()).toBeVisible();
    if (seed.holiday?.title) {
      await expect(page.getByTestId("school-event-chip").filter({ hasText: seed.holiday.title }).first()).toBeVisible();
    }

    await expect(page.getByText(/program/i).filter({ hasText: /field-trip/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Add Event|New Event/i })).toHaveCount(0);

    await page.getByTestId("select-child-filter").click();
    await page.getByRole("option", { name: new RegExp(seed.children.seekers.firstName) }).click();
    await expect(page.getByTestId("class-chip").filter({ hasText: seed.classes.seekers.title }).first()).toBeVisible();
    await expect(page.getByTestId("class-chip").filter({ hasText: seed.classes.yankee.title })).toHaveCount(0);

    await page.getByTestId("select-child-filter").click();
    await page.getByRole("option", { name: /All Children/i }).click();

    const monthLabel = page.getByTestId("text-current-month");
    const before = await monthLabel.textContent();
    await page.getByTestId("button-next-month").click();
    await expect(monthLabel).not.toHaveText(before || "");
    await page.getByTestId("button-today").click();
    await expect(monthLabel).toHaveText(before || /./);

    await page.getByTestId("class-chip").filter({ hasText: seed.classes.seekers.title }).first().click({ force: true });
    await expect(page.getByTestId("family-day-sheet")).toBeVisible();
    await expect(page.getByTestId("day-sheet-class")).toContainText(/9:00|09:00|AM/i);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("family-day-sheet")).toBeHidden({ timeout: 10_000 });

    expect(seed.holiday?.title).toBeTruthy();
    const holidayChip = page.getByTestId("school-event-chip").filter({ hasText: seed.holiday!.title }).first();
    await page.locator('[data-testid^="calendar-day-"]').filter({ has: holidayChip }).click();
    await expect(page.getByTestId("family-day-sheet")).toBeVisible();
    const schoolSheet = page.getByTestId("day-sheet-school-event");
    await expect(schoolSheet).toContainText(seed.holiday!.title, { timeout: 15_000 });
    await expect(schoolSheet).toContainText("All-campus holiday");
    await expect(schoolSheet).toContainText(/All day/i);
    await expect(schoolSheet.getByText("Holiday", { exact: true })).toBeVisible();
    await expect(page.getByTestId("family-day-sheet").getByRole("button", { name: /Edit|Delete/i })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("family-day-sheet")).toBeHidden({ timeout: 10_000 });

    await page.getByTestId("button-view-week").click();
    await expect(page.getByTestId("schedule-print-root")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("weekly-schedule-print")).toBeVisible();
    await expect(page.locator("[data-testid^='child-week-section-']")).toHaveCount(2);

    await page.getByTestId("button-view-list").click();
    await expect(page.getByTestId("family-calendar-list")).toBeVisible();
    await expect(page.getByTestId("list-row-class").first()).toBeVisible();
    if (seed.holiday?.title) {
      await expect(page.getByText(seed.holiday.title).first()).toBeVisible();
    }

    const token = await page.evaluate(() => localStorage.getItem("supabase_token"));
    const mint = await request.post("/api/calendar/feed-token", {
      headers: { Authorization: `Bearer ${token}` },
      data: {},
    });
    expect(mint.ok()).toBeTruthy();
    const minted = await mint.json();
    const feed = await request.get(`/api/calendar/feed/${minted.token}.ics`);
    expect(feed.headers()["content-type"] || "").toMatch(/text\/calendar/i);
    const ics = await feed.text();
    expect(ics).toContain(seed.classes.seekers.title);
    if (seed.holiday?.title) expect(ics).toContain(seed.holiday.title);

    const bad = await request.get("/api/calendar/feed/not-a-real-token.ics");
    expect(bad.status()).toBe(404);

    const forbidden = await request.post("/api/calendar-events", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: {
        title: "Parent should not create",
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
        eventType: "holiday",
      },
    });
    expect(forbidden.status()).toBe(403);
  });

  test("unauthenticated schedule redirects to login", async ({ page }) => {
    await page.goto("/schedule", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
  });
});
