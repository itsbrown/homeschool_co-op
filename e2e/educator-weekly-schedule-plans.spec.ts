import { test, expect } from "@playwright/test";
import {
  dismissStaffGuideIfVisible,
  loginParent,
  preventStaffGuideModal,
} from "./helpers/parentCheckoutHelpers";
import { requireLinkedSeed } from "./helpers/requireLinkedSeed";
import { postSetupScheduleScenario } from "./helpers/testSeed";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("educator weekly schedule + published plans", () => {
  test("shows Seekers class card with published plan overlay and print root", async ({
    page,
    request,
  }) => {
    const { response, json } = await postSetupScheduleScenario(request, {
      linkSupabaseAuth: true,
    });
    const seed = requireLinkedSeed(response, json, {
      linked:
        json?.data?.educatorSupabaseLinked === true || json?.data?.supabaseLinked === true,
      need: "Educator Supabase",
    });
    if (!seed.educator?.email) {
      throw new Error("seed returned no educator credentials");
    }

    const weekStart = seed.weekStart as string;
    const planTitle = seed.blocks?.seekersTitle || "Seekers: Intro to Nature";

    await preventStaffGuideModal(page);
    await loginParent(page, seed.educator.email, seed.educator.password);
    await dismissStaffGuideIfVisible(page);

    const weekApi = page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        r.url().includes("/api/educator/schedules/week") &&
        r.ok(),
      { timeout: 60_000 },
    );

    await page.goto(`/educator/weekly-calendar?weekStart=${weekStart}`, {
      waitUntil: "domcontentloaded",
    });
    const weekRes = await weekApi;
    expect(weekRes.status()).toBe(200);
    const body = await weekRes.json();
    expect(Array.isArray(body.schedules)).toBe(true);

    await expect(page.getByText(/couldn't load your schedule/i)).toHaveCount(0);

    const classCard = page.getByTestId("schedule-class-card").filter({
      hasText: new RegExp(seed.classes.seekers.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    });
    await expect(classCard.first()).toBeVisible({ timeout: 30_000 });

    const planBlock = page.getByTestId("schedule-plan-block").filter({ hasText: planTitle });
    await expect(planBlock.first()).toBeVisible();

    // Empty days are collapsed by default (Mon/Wed/Fri teaching pattern → fewer than 7 columns).
    const weekGrid = page.getByTestId("calendar-week-grid");
    await expect(weekGrid).toBeVisible();
    const visibleDays = Number(await weekGrid.getAttribute("data-visible-days"));
    expect(visibleDays).toBeGreaterThan(0);
    expect(visibleDays).toBeLessThan(7);
    await expect(page.getByTestId("calendar-off-days-bar")).toBeVisible();
    await expect(page.getByTestId("button-toggle-empty-days")).toBeVisible();

    // Toggle reveals empty day columns again.
    await page.getByTestId("button-toggle-empty-days").click();
    await expect(weekGrid).toHaveAttribute("data-visible-days", "7");
    await expect(page.getByTestId("calendar-day-empty").first()).toBeVisible();

    await page.getByTestId("button-toggle-empty-days").click();
    await expect(weekGrid).toHaveAttribute("data-visible-days", String(visibleDays));

    // Wednesday slot (same class, no Monday skeleton block) should show empty badge
    await expect(page.getByTestId("schedule-plan-empty").first()).toBeVisible();

    await planBlock.first().click();
    await expect(page.getByTestId("schedule-block-detail")).toBeVisible();
    await expect(page.getByTestId("schedule-block-detail")).toContainText(planTitle);
    await expect(page.getByTestId("schedule-block-detail")).toContainText(
      /Observe local plants|Learning Objectives/i,
    );

    await expect(page.getByTestId("educator-schedule-print")).toBeVisible();
    await expect(page.getByTestId("schedule-print-root")).toBeAttached();
  });
});
