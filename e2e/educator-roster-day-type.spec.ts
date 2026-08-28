import { test, expect } from "@playwright/test";
import { loginEducatorFromSeed } from "./helpers/educatorAuth";
import { postSetupSessionDayTypeAdminScenario } from "./helpers/testSeed";
import { requireLinkedSeed } from "./helpers/requireLinkedSeed";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("educator roster day type and birthday", () => {
  test("class roster and attendance show day type and birthday", async ({
    page,
    request,
  }) => {
    const { response, json } = await postSetupSessionDayTypeAdminScenario(request, {
      linkSupabaseAuthEducator: true,
    });
    const seed = requireLinkedSeed(response, json, {
      linked: json?.data?.educatorSupabaseLinked === true,
      need: "Educator Supabase",
    });

    const educator = seed.educator!;
    const classId = seed.class!.id;
    const halfChild = seed.children!.half;
    const fullChild = seed.children!.full;
    const expectedSummary = seed.expectedRosterDayTypeSummary!;

    await loginEducatorFromSeed(page, educator.email, educator.password);

    const classStudentsApi = page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        r.url().includes(`/api/educator/classes/${classId}/students`) &&
        r.ok(),
      { timeout: 30_000 },
    );
    await page.goto(`/educator/classes/${classId}`, { waitUntil: "domcontentloaded" });
    await classStudentsApi;
    await page.getByTestId("tab-class-students").click();
    await expect(page.getByTestId("text-roster-day-type-summary")).toContainText(
      expectedSummary,
      { timeout: 15_000 },
    );
    await expect(page.getByTestId(`badge-day-type-${halfChild.id}`)).toHaveText("Half Day");
    await expect(page.getByTestId(`badge-day-type-${fullChild.id}`)).toHaveText("Full Day");
    await expect(page.getByTestId(`text-birthday-${halfChild.id}`)).toContainText("Jun 1, 2015");
    await expect(page.getByTestId(`text-birthday-${fullChild.id}`)).toContainText("Jun 1, 2014");

    const myStudentsApi = page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        r.url().includes("/api/educator/my-students") &&
        r.ok(),
      { timeout: 30_000 },
    );
    await page.goto("/educator/students", { waitUntil: "domcontentloaded" });
    await myStudentsApi;
    await expect(page.getByTestId(`student-row-${halfChild.id}`)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId(`badge-day-type-${halfChild.id}`)).toHaveText("Half Day");
    await expect(page.getByTestId(`badge-day-type-${fullChild.id}`)).toHaveText("Full Day");
    await expect(page.getByTestId(`text-birthday-${halfChild.id}`)).toContainText("Jun 1, 2015");
    await expect(page.getByTestId(`text-birthday-${fullChild.id}`)).toContainText("Jun 1, 2014");

    await page.goto(`/educator/classes/${classId}/start-session`, {
      waitUntil: "domcontentloaded",
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
    await expect(page.getByTestId("text-roster-day-type-summary")).toContainText(expectedSummary, {
      timeout: 20_000,
    });
    await expect(page.getByTestId(`attendance-row-${halfChild.id}`)).toBeVisible();
    await expect(page.getByTestId(`badge-day-type-${halfChild.id}`)).toHaveText("Half Day");
    await expect(page.getByTestId(`badge-day-type-${fullChild.id}`)).toHaveText("Full Day");
    await expect(page.getByTestId(`text-birthday-${halfChild.id}`)).toContainText("Jun 1, 2015");
    await expect(page.getByTestId(`text-birthday-${fullChild.id}`)).toContainText("Jun 1, 2014");
  });
});
