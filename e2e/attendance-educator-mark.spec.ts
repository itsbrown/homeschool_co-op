import { test, expect } from "@playwright/test";
import { loginEducatorFromSeed, educatorSupabaseLinked } from "./helpers/educatorAuth";
import { postSetupScheduleScenario } from "./helpers/testSeed";
import { waitForSupabaseToken, bearerAuthHeaders } from "./helpers/parentCheckoutHelpers";
import { requireLinkedSeed } from "./helpers/requireLinkedSeed";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("attendance educator mark", () => {
  test("start session, roster marketplace enrollment, mark present, rematch, end", async ({
    page,
    request,
  }) => {
    const { response, json } = await postSetupScheduleScenario(request, {
      linkSupabaseAuth: true,
    });
    const seed = requireLinkedSeed(response, json, {
      linked: json?.data ? educatorSupabaseLinked(json.data) : false,
      need: "Educator Supabase",
    });
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
    await expect(page.getByTestId("text-attendance-autosave-hint")).toBeVisible();
    await expect(page.getByTestId(`badge-allergy-${seekersChild.id}`)).toBeVisible();
    await expect(page.getByTestId(`badge-medical-${seekersChild.id}`)).toBeVisible();
    await page.getByTestId(`button-student-safety-${seekersChild.id}`).click();
    await expect(page.getByTestId("student-safety-sheet")).toBeVisible();
    await expect(page.getByTestId("student-safety-sheet")).toContainText(/Peanuts/i);
    await expect(page.getByTestId("student-safety-sheet")).toContainText(/EpiPen/i);
    await expect(page.getByTestId("student-safety-emergency-name")).toHaveText(/Pat Contact/i);
    await expect(page.getByTestId("student-safety-emergency-phone")).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByTestId("student-safety-sheet")).toHaveCount(0);

    const bulkApi = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        r.url().includes("/api/educator/attendance/bulk") &&
        r.ok(),
      { timeout: 30_000 },
    );
    const rosterAfterSave = page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        r.url().includes(`/api/educator/sessions/`) &&
        r.url().includes("/roster") &&
        r.ok(),
      { timeout: 30_000 },
    );
    await page.getByTestId("button-mark-all-present").click();
    await bulkApi;
    await rosterAfterSave;
    await expect(page.getByTestId("badge-unmarked-count")).toHaveCount(0);

    // Rematch after the roster returns notes: null (Zod used to 400 that payload).
    const rematchApi = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        r.url().includes("/api/educator/attendance/bulk") &&
        r.ok(),
      { timeout: 30_000 },
    );
    await page.getByTestId(`button-status-${seekersChild.id}-late`).click();
    await rematchApi;

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
