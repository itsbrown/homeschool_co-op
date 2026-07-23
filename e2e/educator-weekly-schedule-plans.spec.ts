import { test, expect } from "@playwright/test";
import {
  dismissStaffGuideIfVisible,
  loginParent,
  preventStaffGuideModal,
} from "./helpers/parentCheckoutHelpers";
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
    test.skip(
      !response.ok(),
      `seed failed (${response.status()}): ${json?.error ?? json?.details ?? "see server logs"}`,
    );
    test.skip(!json?.success || !json.data?.educator?.email, "seed returned no educator credentials");
    test.skip(
      json.data?.educatorSupabaseLinked !== true && json.data?.supabaseLinked !== true,
      "Supabase auth was not linked (configure SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)",
    );

    const seed = json!.data!;
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

    // Wednesday slot (same class, no Monday skeleton block) should show empty badge
    await expect(page.getByTestId("schedule-plan-empty").first()).toBeVisible();

    await planBlock.first().click();
    await expect(page.getByTestId("schedule-block-detail")).toBeVisible();
    await expect(page.getByTestId("schedule-block-detail")).toContainText(planTitle);
    await expect(page.getByTestId("schedule-block-detail")).toContainText(/Observe local plants|Learning Objectives/i);

    await expect(page.getByTestId("educator-schedule-print")).toBeVisible();
    // Print sheet is screen-hidden; still present for window.print()
    await expect(page.getByTestId("schedule-print-root")).toBeAttached();
  });
});
