import { test, expect } from "@playwright/test";
import { loginEducatorFromSeed, educatorSupabaseLinked } from "./helpers/educatorAuth";
import { postSetupScheduleScenario } from "./helpers/testSeed";
import { waitForSupabaseToken, bearerAuthHeaders } from "./helpers/parentCheckoutHelpers";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("educator today honesty", () => {
  test("dashboard today list matches weekday; staff guide has no fake Attendance tab", async ({
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
    test.skip(!educatorSupabaseLinked(json.data!), "Supabase auth was not linked");

    const seed = json.data!;
    await loginEducatorFromSeed(page, seed.educator.email, seed.educator.password);

    const dashboardApi = page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        r.url().includes("/api/educator/dashboard") &&
        r.ok(),
      { timeout: 30_000 },
    );
    await page.goto("/educator/dashboard", { waitUntil: "domcontentloaded" });
    const dashRes = await dashboardApi;
    const dashBody = await dashRes.json();
    const todayIds = (dashBody.todayClasses || []).map((c: { classId: number }) => c.classId);
    expect((dashBody.todayClasses || []).every((c: { meetsToday: boolean }) => c.meetsToday === true)).toBeTruthy();

    const weekday = new Date().getDay(); // 0=Sun
    const seekersMeets = weekday === 1 || weekday === 3;
    const yankeeMeets = weekday === 2 || weekday === 4;
    if (seekersMeets) {
      expect(todayIds).toContain(seed.classes.seekers.id);
    } else {
      expect(todayIds).not.toContain(seed.classes.seekers.id);
    }
    if (yankeeMeets) {
      expect(todayIds).toContain(seed.classes.yankee.id);
    } else {
      expect(todayIds).not.toContain(seed.classes.yankee.id);
    }

    await expect(page.getByTestId("text-today-class-count")).toHaveText(String(todayIds.length));

    if (seekersMeets) {
      const startBtn = page.getByTestId(`button-start-session-${seed.classes.seekers.id}`);
      await expect(startBtn).toBeVisible({ timeout: 10_000 });
      const createApi = page.waitForResponse(
        (r) =>
          r.request().method() === "POST" &&
          r.url().endsWith("/api/educator/sessions") &&
          r.ok(),
        { timeout: 30_000 },
      );
      const startApi = page.waitForResponse(
        (r) =>
          r.request().method() === "POST" &&
          r.url().includes("/start") &&
          r.ok(),
        { timeout: 30_000 },
      );
      await startBtn.click();
      await createApi;
      await startApi;
      await expect(page).toHaveURL(/\/educator\/session\/\d+/, { timeout: 15_000 });
    }

    await page.goto("/educator/staff-guide", { waitUntil: "domcontentloaded" });
    await expect(page.getByText('tap the "Attendance" tab')).toHaveCount(0);
    await expect(page.getByText("saved automatically")).toHaveCount(0);
    await expect(page.getByText("Add Volunteer")).toHaveCount(0);
    await expect(page.getByText("Mark who is in the room")).toBeVisible();

    const token = await waitForSupabaseToken(page);
    const check = await page.request.get("/api/educator/dashboard", {
      headers: bearerAuthHeaders(token),
    });
    expect(check.ok()).toBeTruthy();
  });
});
