import { test, expect } from "@playwright/test";
import { loginEducatorFromSeed, educatorSupabaseLinked } from "./helpers/educatorAuth";
import { postSetupScheduleScenario } from "./helpers/testSeed";
import { waitForSupabaseToken, bearerAuthHeaders } from "./helpers/parentCheckoutHelpers";
import { requireLinkedSeed } from "./helpers/requireLinkedSeed";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("attendance roster placement levels", () => {
  test("day-of roster shows reading and math level chips", async ({ page, request }) => {
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
    const token = await waitForSupabaseToken(page);
    const auth = {
      ...bearerAuthHeaders(token),
      "Content-Type": "application/json",
      "X-Active-Role": "educator",
    };

    const lexileRes = await page.request.post("/api/lexile/entry", {
      headers: auth,
      data: {
        childId: seekersChild.id,
        readingGradeLevel: "2.5",
        lexileRange: "420L-650L",
        notes: "Attendance roster E2E",
      },
    });
    expect(lexileRes.ok()).toBeTruthy();

    const mathRes = await page.request.post("/api/math-level/entry", {
      headers: auth,
      data: {
        childId: seekersChild.id,
        mathLevel: "3A",
        notes: "Attendance roster E2E",
      },
    });
    expect(mathRes.ok()).toBeTruthy();

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

    const row = page.getByTestId(`attendance-row-${seekersChild.id}`);
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row.getByTestId("student-level-chips")).toBeVisible();
    await expect(row.getByTestId("student-level-chips")).toContainText(/420L-650L|2\.5/);
    await expect(row.getByTestId("student-level-chips")).toContainText("3A");
  });
});
