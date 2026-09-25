import { test, expect, type APIRequestContext } from "@playwright/test";
import { requireLinkedSeed } from "./helpers/requireLinkedSeed";
import { testApiToken } from "./helpers/testSeed";
import {
  dismissStaffGuideIfVisible,
  loginParent,
  preventStaffGuideModal,
} from "./helpers/parentCheckoutHelpers";

test.describe.configure({ mode: "serial", timeout: 120_000 });
test.use({ viewport: { width: 390, height: 844 } });

type PayrollSeed = {
  supabaseLinked?: boolean;
  parentSupabaseLinked?: boolean;
  adminSupabaseLinked?: boolean;
  parent: { email: string; password: string };
  admin: { email: string; password: string };
};

async function seedPayroll(request: APIRequestContext) {
  const response = await request.post("/api/test/setup-payroll-day-scenario", {
    headers: { "X-Test-Token": testApiToken(), "Content-Type": "application/json" },
    data: { linkSupabaseAuthParent: true, linkSupabaseAuthAdmin: true },
  });
  const json = await response.json().catch(() => null);
  const data = requireLinkedSeed<PayrollSeed>(response, json, {
    linked: json?.data?.parentSupabaseLinked === true && json?.data?.adminSupabaseLinked === true,
    need: "Supabase parent and admin",
  });
  return data;
}

test.describe("payroll day checklist", () => {
  test("Leigh Ann saves a pre-filled class day and a later rate change does not rewrite it", async ({ page, request }) => {
    const seed = await seedPayroll(request);
    await preventStaffGuideModal(page);
    await loginParent(page, seed.parent.email, seed.parent.password);
    await dismissStaffGuideIfVisible(page);

    await page.goto("/payroll-day", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("payroll-day-title")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Hourly rate")).toHaveCount(0);

    const firstHere = page.locator("[data-testid^='here-']").first();
    const firstAway = page.locator("[data-testid^='away-']").first();
    await expect(firstHere).toHaveClass(/bg-primary/);
    await firstAway.click();

    const secondHoursToggle = page.getByRole("button", { name: "Different hours" }).nth(1);
    await secondHoursToggle.click();
    await page.locator("[data-testid^='hours-']").fill("2");
    await page.getByTestId("payroll-day-note").fill("Left after lunch");
    await page.getByTestId("payroll-day-save").click();
    await expect(page.getByTestId("payroll-day-saved")).toBeVisible({ timeout: 30_000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("payroll-day-title")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("[data-testid^='away-']").first()).toHaveClass(/bg-primary/);
    await page.getByRole("button", { name: "Different hours" }).nth(1).click();
    await expect(page.locator("[data-testid^='hours-']")).toHaveValue("2");
    await expect(page.getByTestId("payroll-day-note")).toHaveValue("Left after lunch");

    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await loginParent(page, seed.admin.email, seed.admin.password);
    await page.goto("/payroll-day", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("payroll-day-denied")).toBeVisible({ timeout: 20_000 });

    await page.goto("/school-admin/payroll-rates", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Hourly rates" })).toBeVisible({ timeout: 30_000 });
    const payBefore = await page.getByTestId("payroll-day-pay").textContent();
    const rate = page.locator("[data-testid^='rate-input-']").first();
    await rate.fill("99");
    await rate.blur();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("payroll-day-pay")).toHaveText(payBefore ?? "", { timeout: 30_000 });
  });
});
