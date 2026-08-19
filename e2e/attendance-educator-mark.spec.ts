import { test, expect } from "@playwright/test";
import { loginEducatorFromSeed, educatorSupabaseLinked } from "./helpers/educatorAuth";
import { postSetupScheduleScenario } from "./helpers/testSeed";
import { waitForSupabaseToken, bearerAuthHeaders } from "./helpers/parentCheckoutHelpers";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("attendance educator mark", () => {
  test("start session, roster marketplace enrollment, mark present, end", async ({
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
    const seekersId = seed.classes.seekers.id;
    const seekersChild = seed.children.seekers;

    await loginEducatorFromSeed(page, seed.educator.email, seed.educator.password);

    await page.goto("/educator/my-classes", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId(`button-start-session-${seekersId}`)).toBeVisible({
      timeout: 15_000,
    });
    await page.getByTestId(`button-start-session-${seekersId}`).click();
    await expect(page).toHaveURL(new RegExp(`/educator/classes/${seekersId}/start-session`), {
      timeout: 15_000,
    });

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
        r.url().includes("/api/educator/sessions/") &&
        r.url().includes("/start") &&
        r.ok(),
      { timeout: 30_000 },
    );
    await page.getByTestId("button-start-session").click();
    await createApi;
    await startApi;
    await expect(page).toHaveURL(/\/educator\/session\/\d+/, { timeout: 15_000 });
    await expect(page.getByTestId(`attendance-row-${seekersChild.id}`)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId(`attendance-row-${seekersChild.id}`)).toContainText(
      seekersChild.firstName,
    );

    const bulkApi = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        r.url().includes("/api/educator/attendance/bulk") &&
        r.ok(),
      { timeout: 30_000 },
    );
    await page.getByTestId("button-mark-all-present").click();
    await bulkApi;
    await expect(page.getByTestId("badge-unmarked-count")).toHaveCount(0);

    const endApi = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        r.url().includes("/end") &&
        r.ok(),
      { timeout: 30_000 },
    );
    await page.getByTestId("button-end-session").click();
    await page.getByTestId("button-confirm-end").click();
    await endApi;
    await expect(page).toHaveURL(/\/educator\/session\/\d+/, { timeout: 15_000 });
    await expect(page.getByTestId("session-end-summary")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("session-end-summary")).toContainText("present");
    await expect(page.getByTestId("button-view-session")).toHaveCount(0);

    const token = await waitForSupabaseToken(page);
    const sessionMatch = page.url().match(/\/educator\/session\/(\d+)/);
    // After end we left the session URL; use the just-ended session from history if needed.
    const liveRoster = await page.request.get(
      `/api/educator/classes/${seekersId}/students`,
      { headers: bearerAuthHeaders(token) },
    );
    expect(liveRoster.ok()).toBeTruthy();
    const studentsBody = await liveRoster.json();
    const studentIds = (studentsBody.students || []).map((s: { id: number }) => s.id);
    expect(studentIds).toContain(seekersChild.id);
    void sessionMatch;
  });
});
