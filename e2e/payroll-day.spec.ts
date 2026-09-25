import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { requireLinkedSeed } from "./helpers/requireLinkedSeed";
import { testApiToken } from "./helpers/testSeed";
import { loginSchoolAdmin } from "./helpers/schoolAdminAuth";
import {
  dismissStaffGuideIfVisible,
  preventStaffGuideModal,
} from "./helpers/parentCheckoutHelpers";

test.describe.configure({ mode: "serial", timeout: 300_000 });

type PayrollSeed = {
  school: { id: number };
  parent: { email: string; password: string; firstName: string };
  admin: { email: string; password: string };
  superAdmin: { email: string; password: string };
  staff: { email: string; password: string };
};

async function seedPayroll(request: APIRequestContext) {
  const response = await request.post("/api/test/setup-payroll-day-scenario", {
    headers: { "X-Test-Token": testApiToken(), "Content-Type": "application/json" },
    data: {
      linkSupabaseAuthParent: true,
      linkSupabaseAuthAdmin: true,
      linkSupabaseAuthSuperAdmin: true,
      linkSupabaseAuthStaff: true,
    },
  });
  const json = await response.json().catch(() => null);
  return requireLinkedSeed<PayrollSeed>(response, json, {
    linked:
      json?.data?.parentSupabaseLinked === true &&
      json?.data?.adminSupabaseLinked === true &&
      json?.data?.superAdminSupabaseLinked === true &&
      json?.data?.staffSupabaseLinked === true,
    need: "Supabase parent, admin, super admin, and staff",
  });
}

async function signOut(page: Page) {
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
}

async function signIn(page: Page, email: string, password: string) {
  await preventStaffGuideModal(page);
  await loginSchoolAdmin(page, email, password);
  await dismissStaffGuideIfVisible(page);
}

test.describe("daily hours school feature", () => {
  test("super admin turns it on, then a granted parent saves a day", async ({ page, request }) => {
    const seed = await seedPayroll(request);

    await signIn(page, seed.parent.email, seed.parent.password);
    await page.goto("/parent/home", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: "Today's hours" })).toHaveCount(0);
    const deniedChecklist = page.waitForResponse(
      (r) => r.url().includes("/api/payroll-day") && !r.url().includes("/access") && r.request().method() === "GET",
      { timeout: 30_000 },
    );
    await page.goto("/payroll-day", { waitUntil: "domcontentloaded" });
    expect((await deniedChecklist).status()).toBe(403);
    await expect(page.getByTestId("payroll-day-denied")).toBeVisible();

    await signOut(page);
    await signIn(page, seed.admin.email, seed.admin.password);
    await page.goto("/school-admin/payroll-rates", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("payroll-rates-denied")).toBeVisible({ timeout: 30_000 });

    await signOut(page);
    await signIn(page, seed.superAdmin.email, seed.superAdmin.password);
    await page.evaluate(() => localStorage.setItem("activeRole", "superAdmin"));
    await page.goto(`/superadmin/schools/${seed.school.id}/edit`, { waitUntil: "domcontentloaded" });
    const toggle = page.getByTestId("switch-feature-daily-hours");
    await expect(toggle).toBeVisible({ timeout: 30_000 });
    await expect(toggle).toHaveAttribute("data-state", "unchecked");
    const putFeatures = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/superadmin/schools/${seed.school.id}/features`) &&
        r.request().method() === "PUT",
      { timeout: 20_000 },
    );
    await toggle.click();
    const put = await putFeatures;
    expect(put.ok(), `PUT /features returned ${put.status()}`).toBeTruthy();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("switch-feature-daily-hours")).toHaveAttribute("data-state", "checked", {
      timeout: 30_000,
    });

    await signOut(page);
    await signIn(page, seed.admin.email, seed.admin.password);
    await page.goto("/school-admin/payroll-rates", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Hourly rates" })).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("add-job").click();
    await page.getByTestId("add-job-person").fill("Summer");
    await page.getByTestId("add-job-label").fill("Morning");
    await page.getByTestId("add-job-rate").fill("20");
    await page.getByTestId("add-job-hours").fill("6");
    await page.getByRole("button", { name: "Save job" }).click();
    await expect(page.getByText("Summer")).toBeVisible({ timeout: 20_000 });

    await page.getByTestId("filler-search").fill(seed.parent.firstName);
    const addParent = page.getByRole("button", { name: new RegExp(`Add ${seed.parent.firstName}`) });
    await expect(addParent).toBeVisible({ timeout: 20_000 });
    await addParent.click();
    await expect(page.getByText(seed.parent.email)).toBeVisible({ timeout: 20_000 });

    await signOut(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, seed.parent.email, seed.parent.password);
    const skipTour = page.getByRole("button", { name: "Skip Tour" });
    if (await skipTour.isVisible().catch(() => false)) await skipTour.click();
    await page.getByTestId("button-mobile-menu").click();
    await expect(page.getByRole("link", { name: "Today's hours" })).toBeVisible({ timeout: 30_000 });
    await page.goto("/payroll-day", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("payroll-day-title")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Hourly rate")).toHaveCount(0);
    await expect(page.locator("[data-testid^='here-']").first()).toHaveClass(/bg-primary/);
    await page.locator("[data-testid^='away-']").first().click();
    await page.getByRole("button", { name: "Different hours" }).click();
    await page.locator("[data-testid^='hours-']").fill("2");
    await page.getByTestId("payroll-day-note").fill("Left after lunch");
    await page.getByTestId("payroll-day-save").click();
    await expect(page.getByTestId("payroll-day-saved")).toBeVisible({ timeout: 30_000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-testid^='away-']").first()).toHaveClass(/bg-primary/);
    await page.getByRole("button", { name: "Different hours" }).click();
    await expect(page.locator("[data-testid^='hours-']")).toHaveValue("2");
    await expect(page.getByTestId("payroll-day-note")).toHaveValue("Left after lunch");

    await page.goto("/school-admin/payroll-rates", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("payroll-rates-denied")).toBeVisible({ timeout: 30_000 });

    await signOut(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page, seed.admin.email, seed.admin.password);
    await page.goto("/school-admin/payroll-rates", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("payroll-day-pay")).toBeVisible({ timeout: 30_000 });
    const payBefore = await page.getByTestId("payroll-day-pay").textContent();
    const rate = page.locator("[data-testid^='rate-input-']").first();
    await rate.fill("99");
    const patchRate = page.waitForResponse(
      (r) => r.url().includes("/api/payroll-day/jobs/") && r.request().method() === "PATCH",
      { timeout: 20_000 },
    );
    await page.locator("[data-testid^='rate-save-']").first().click();
    expect((await patchRate).ok()).toBeTruthy();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("payroll-day-pay")).toHaveText(payBefore ?? "", { timeout: 30_000 });

    await page.goto("/school-admin/staff-permissions", { waitUntil: "domcontentloaded" });
    const mentorRow = page
      .getByText(seed.staff.email, { exact: true })
      .locator("xpath=ancestor::div[contains(@class,'justify-between')][1]");
    await mentorRow.getByRole("button", { name: "Grant school-wide" }).click();
    const staffSwitch = page.locator("tr", { hasText: seed.staff.email }).locator("[data-testid$='-canManageHourlyRates']");
    await expect(staffSwitch).toBeVisible({ timeout: 30_000 });
    await staffSwitch.click();
    await expect(staffSwitch).toHaveAttribute("data-state", "checked", { timeout: 20_000 });

    await signOut(page);
    await signIn(page, seed.staff.email, seed.staff.password);
    await page.goto("/school-admin/payroll-rates", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Hourly rates" })).toBeVisible({ timeout: 30_000 });
    await page.goto("/payroll-day", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("payroll-day-denied")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: "Today's hours" })).toHaveCount(0);
  });
});
