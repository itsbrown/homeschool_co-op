import { test, expect } from "@playwright/test";
import { loginEducatorFromSeed, educatorSupabaseLinked } from "./helpers/educatorAuth";
import { postSetupScheduleScenario } from "./helpers/testSeed";
import { waitForSupabaseToken, bearerAuthHeaders } from "./helpers/parentCheckoutHelpers";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("educator mentor loop", () => {
  test("classes, students, hours, notifications, settings", async ({ page, request }) => {
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
    const seekersId = seed.classes.seekers.id;
    const seekersChild = seed.children.seekers;

    await loginEducatorFromSeed(page, seed.educator.email, seed.educator.password);

    const classesApi = page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        r.url().includes("/api/educator/my-classes") &&
        r.ok(),
      { timeout: 30_000 },
    );
    await page.goto("/educator/my-classes", { waitUntil: "domcontentloaded" });
    await classesApi;
    await expect(page.getByTestId("first-class-card")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("text-my-classes-title")).toBeVisible();
    await page.getByTestId(`button-view-class-${seekersId}`).click();
    await expect(page).toHaveURL(new RegExp(`/educator/classes/${seekersId}`), { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: seed.classes.seekers.title })).toBeVisible({
      timeout: 15_000,
    });

    const studentsApi = page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        r.url().includes("/api/educator/my-students") &&
        r.ok(),
      { timeout: 30_000 },
    );
    await page.goto("/educator/students", { waitUntil: "domcontentloaded" });
    await studentsApi;
    await expect(page.getByTestId(`student-row-${seekersChild.id}`)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("text-enrollment-status").first()).toBeVisible();
    await page.getByTestId(`student-row-${seekersChild.id}`).getByRole("button", { name: "View" }).click();
    await expect(page.getByTestId("text-student-name")).toContainText(seekersChild.firstName, {
      timeout: 15_000,
    });

    const hoursApi = page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        r.url().includes("/api/educator/my-hours") &&
        r.ok(),
      { timeout: 30_000 },
    );
    await page.goto("/educator/my-hours", { waitUntil: "domcontentloaded" });
    await hoursApi;
    await expect(page.getByTestId("hours-summary")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId(`assigned-class-${seekersId}`)).toBeVisible({ timeout: 15_000 });
    if (seed.attendance?.sessionId) {
      await expect(page.getByTestId(`session-${seed.attendance.sessionId}`)).toBeVisible();
    }

    const notifyApi = page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        r.url().includes("/api/educator/notification-data") &&
        r.ok(),
      { timeout: 30_000 },
    );
    await page.goto("/educator/notifications", { waitUntil: "domcontentloaded" });
    await notifyApi;
    await expect(page.getByTestId("notifications-class-list")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId(`checkbox-notify-class-${seekersId}`).check();
    await page.getByTestId("input-notification-subject").fill("E2E mentor notice");
    await page.getByTestId("input-notification-message").fill("Please bring outdoor shoes tomorrow.");
    const sendApi = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        r.url().includes("/api/educator/notifications/send") &&
        r.ok(),
      { timeout: 30_000 },
    );
    await page.getByTestId("button-send-notification").click();
    await sendApi;
    await page.getByTestId("tab-notification-history").click();
    await expect(page.getByTestId("notifications-history")).toContainText("E2E mentor notice", {
      timeout: 15_000,
    });

    await page.goto("/educator/settings", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("input-last-name")).toBeVisible({ timeout: 15_000 });
    const newLast = `E2E${Date.now() % 100000}`;
    await page.getByTestId("input-last-name").fill(newLast);
    const profileApi = page.waitForResponse(
      (r) =>
        r.request().method() === "PATCH" &&
        r.url().includes("/api/users/profile") &&
        r.ok(),
      { timeout: 30_000 },
    );
    await page.getByTestId("button-save-profile").click();
    await profileApi;
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("input-last-name")).toHaveValue(newLast, { timeout: 15_000 });

    const token = await waitForSupabaseToken(page);
    const rosterRes = await page.request.get(
      `/api/educator/sessions/${seed.attendance?.sessionId}/roster`,
      { headers: bearerAuthHeaders(token) },
    );
    if (seed.attendance?.sessionId && rosterRes.ok()) {
      const roster = await rosterRes.json();
      const ids = (Array.isArray(roster) ? roster : []).map((row: { childId?: number }) => row.childId);
      expect(ids).toContain(seekersChild.id);
    }
  });
});
