import { test, expect } from "@playwright/test";
import { format, addDays } from "date-fns";
import { loginSchoolAdmin } from "./helpers/schoolAdminAuth";
import {
  dismissStaffGuideIfVisible,
  loginParent,
  preventStaffGuideModal,
} from "./helpers/parentCheckoutHelpers";
import { requireLinkedSeed } from "./helpers/requireLinkedSeed";
import { postSetupScheduleScenario } from "./helpers/testSeed";

test.describe.configure({ mode: "serial", timeout: 240_000 });

async function loginAndOpenFamilyCalendar(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
) {
  await preventStaffGuideModal(page);
  await loginParent(page, email, password);
  await dismissStaffGuideIfVisible(page);
  const eventsWait = page.waitForResponse(
    (r) =>
      r.request().method() === "GET" &&
      r.url().includes("/api/calendar-events/parent/events") &&
      r.ok(),
    { timeout: 60_000 },
  );
  await page.goto("/schedule?view=list", { waitUntil: "domcontentloaded" });
  await eventsWait;
  await expect(page.getByTestId("family-calendar-list")).toBeVisible({ timeout: 20_000 });
}

test.describe("school admin calendar publisher", () => {
  test("create, campus isolation, edit, delete, authz", async ({ page, request }) => {
    const { response, json } = await postSetupScheduleScenario(request, { linkSupabaseAuth: true });
    const seed = requireLinkedSeed(response, json);

    await preventStaffGuideModal(page);
    await loginSchoolAdmin(page, seed.admin.email, seed.admin.password);

    const rangeWait = page.waitForResponse(
      (r) => r.request().method() === "GET" && r.url().includes("/api/calendar-events/range") && r.ok(),
      { timeout: 60_000 },
    );
    await page.goto("/schools/calendar", { waitUntil: "domcontentloaded" });
    expect((await rangeWait).ok()).toBeTruthy();
    await expect(page.getByTestId("calendar-grid")).toBeVisible({ timeout: 20_000 });

    const overlayDate = format(addDays(new Date(), 3), "yyyy-MM-dd");
    const campusDate = format(addDays(new Date(), 5), "yyyy-MM-dd");
    await page.getByTestId("button-create-event").click();
    await page.getByTestId("template-holiday").click();
    await page.getByTestId("input-event-title").fill("Admin Holiday Overlay");
    await page.getByTestId("input-start-date").fill(`${overlayDate}T00:00`);
    await page.getByTestId("input-end-date").fill(`${overlayDate}T23:59`);
    await page.getByTestId("select-event-campus").click();
    await page.getByRole("option", { name: /All campuses/i }).click();
    await page.getByTestId("button-save-event").click();
    await expect(page.getByText("Admin Holiday Overlay").first()).toBeVisible({ timeout: 20_000 });

    await page.getByTestId("button-create-event").click();
    await page.getByTestId("input-event-title").fill("Campus A Closure");
    await page.getByTestId("select-event-type").click();
    await page.getByRole("option", { name: /Holiday/i }).click();
    await page.getByTestId("input-start-date").fill(`${campusDate}T09:00`);
    await page.getByTestId("input-end-date").fill(`${campusDate}T12:00`);
    await page.getByTestId("select-event-campus").click();
    await page.getByRole("option", { name: new RegExp(seed.locations!.brighton.name) }).click();
    await page.getByTestId("button-save-event").click();
    await expect(page.getByText("Campus A Closure").first()).toBeVisible({ timeout: 20_000 });

    await page.getByText("Admin Holiday Overlay").first().click();
    await expect(page.getByTestId("button-add-to-calendar")).toBeVisible();
    await page.getByTestId("button-edit-event").click();
    await page.getByTestId("input-event-title").fill("Admin Holiday Overlay Edited");
    await page.getByTestId("button-save-event").click();
    await expect(page.getByText("Admin Holiday Overlay Edited").first()).toBeVisible({ timeout: 20_000 });

    const adminToken = await page.evaluate(() => localStorage.getItem("supabase_token"));

    const parentPage = await page.context().browser()?.newPage();
    if (!parentPage) throw new Error("browser.newPage() failed");
    await loginAndOpenFamilyCalendar(parentPage, seed.parent.email, seed.parent.password);
    await expect(parentPage.getByText("Admin Holiday Overlay Edited").first()).toBeVisible({ timeout: 20_000 });
    await expect(parentPage.getByText("Campus A Closure").first()).toBeVisible({ timeout: 20_000 });
    const parentToken = await parentPage.evaluate(() => localStorage.getItem("supabase_token"));
    await parentPage.close();

    const parentBPage = await page.context().browser()?.newPage();
    if (!parentBPage) throw new Error("browser.newPage() failed");
    await loginAndOpenFamilyCalendar(parentBPage, seed.parentB!.email, seed.parentB!.password);
    await expect(parentBPage.getByText("Admin Holiday Overlay Edited").first()).toBeVisible({ timeout: 20_000 });
    await expect(parentBPage.getByText("Campus A Closure")).toHaveCount(0);
    await parentBPage.close();

    const parentPost = await request.post("/api/calendar-events", {
      headers: { Authorization: `Bearer ${parentToken}`, "Content-Type": "application/json" },
      data: {
        title: "Nope",
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
        eventType: "holiday",
      },
    });
    expect(parentPost.status()).toBe(403);

    const educatorPage = await page.context().browser()?.newPage();
    if (educatorPage) {
      await preventStaffGuideModal(educatorPage);
      await loginSchoolAdmin(educatorPage, seed.educator.email, seed.educator.password);
      const educatorToken = await educatorPage.evaluate(() => localStorage.getItem("supabase_token"));
      const educatorPost = await request.post("/api/calendar-events", {
        headers: { Authorization: `Bearer ${educatorToken}`, "Content-Type": "application/json" },
        data: {
          title: "Educator nope",
          startDate: new Date().toISOString(),
          endDate: new Date().toISOString(),
          eventType: "holiday",
        },
      });
      expect(educatorPost.status()).toBe(403);
      await educatorPage.close();
    }

    await page.goto("/schools/calendar", { waitUntil: "domcontentloaded" });
    await page.getByText("Admin Holiday Overlay Edited").first().click();
    await page.getByTestId("button-delete-event").click();
    await expect(page.getByText("Admin Holiday Overlay Edited")).toHaveCount(0);

    const unauth = await request.get(
      `/api/calendar-events/range?start=${new Date().toISOString()}&end=${new Date().toISOString()}`,
    );
    expect(unauth.status()).toBe(401);

    await page.getByTestId("button-create-event").click();
    await page.getByTestId("button-save-event").click();
    await expect(page.getByText(/title/i).first()).toBeVisible();
    void adminToken;
  });
});
