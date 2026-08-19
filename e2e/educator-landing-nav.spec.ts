import { test, expect } from "@playwright/test";
import { loginEducatorFromSeed, educatorSupabaseLinked } from "./helpers/educatorAuth";
import { postSetupScheduleScenario } from "./helpers/testSeed";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("educator landing and nav", () => {
  test("live dashboard, sidebar, and redirects", async ({ page, request }) => {
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
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await dashboardApi;
    await expect(page).toHaveURL(/\/educator\/dashboard/, { timeout: 15_000 });
    await expect(page.getByTestId("text-educator-dashboard-title")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Role Not Recognized")).toHaveCount(0);

    await expect(page.getByTestId("nav-educator-dashboard")).toBeVisible();
    await expect(page.getByTestId("nav-educator-my-classes")).toBeVisible();
    await expect(page.getByTestId("nav-educator-students")).toBeVisible();
    await expect(page.getByTestId("nav-educator-assessments")).toBeVisible();
    await expect(page.getByTestId("nav-educator-weekly-calendar")).toBeVisible();
    await expect(page.getByTestId("nav-educator-my-hours")).toBeVisible();
    await expect(page.getByTestId("nav-educator-notifications")).toBeVisible();

    await page.goto("/educator/classes", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/educator\/my-classes/, { timeout: 15_000 });
    await expect(page.getByTestId("text-my-classes-title")).toBeVisible({ timeout: 15_000 });

    await page.goto("/educator/attendance", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/educator\/my-classes/, { timeout: 15_000 });

    await page.goto("/educator/templates", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/schools\/schedule-builder/, { timeout: 15_000 });
    await expect(page.getByText("404")).toHaveCount(0);

    await page.goto("/educator/weekly-calendar", { waitUntil: "domcontentloaded" });
    await page.getByTestId("button-view-classes").click();
    await expect(page).toHaveURL(/\/educator\/my-classes/, { timeout: 15_000 });
    await expect(page.getByTestId("text-my-classes-title")).toBeVisible();
  });
});
