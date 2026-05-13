import { test, expect, type Page } from "@playwright/test";
import { fillStripePaymentElement } from "./helpers/stripePlaywright";
import {
  postSetupCartScenario,
  postSeedUpcomingScheduledPayment,
} from "./helpers/testSeed";

test.describe.configure({ mode: "serial" });

async function loginParent(page: Page, email: string, password: string) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).not.toHaveURL(/\/login\/?$/, { timeout: 45_000 });
}

async function registerAnotherChild(page: Page) {
  await page.goto("/children/register", { waitUntil: "domcontentloaded" });
  await page.getByLabel("First Name*").fill("E2E");
  await page.getByLabel("Last Name*").fill(`Playwright${Date.now() % 100000}`);
  await page.getByLabel("Birthdate*").fill("2016-01-15");
  await page.getByRole("button", { name: "Select grade level" }).click();
  await page.getByRole("option", { name: "2nd Grade" }).click();
  await page.getByRole("button", { name: "Select gender" }).click();
  await page.getByRole("option", { name: "Male" }).click();
  await page.getByRole("button", { name: "Register Child" }).click();
  await expect(page).toHaveURL(/\/children/, { timeout: 30_000 });
}

async function goCheckoutAndWaitForPaymentCard(page: Page) {
  await page.goto("/cart/checkout", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByText("Payment Information")).toBeVisible({ timeout: 120_000 });
}

test.describe("parent payment journey (DB seed + Supabase login)", () => {
  test("register child, pay in full at checkout, reach success", async ({ page, request }) => {
    const { response, json } = await postSetupCartScenario(request, {
      paymentPlan: "full_payment",
      linkSupabaseAuth: true,
    });
    test.skip(
      !response.ok(),
      `seed failed (${response.status()}): ${json?.error ?? json?.details ?? "see server logs"}`,
    );
    test.skip(!json?.success || !json.data?.parent?.email, "seed returned no parent credentials");
    test.skip(
      json.data?.supabaseLinked !== true,
      "Supabase auth was not linked for the seeded parent (configure SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)",
    );

    const { email, password } = json.data.parent;
    await loginParent(page, email, password);
    await registerAnotherChild(page);

    await goCheckoutAndWaitForPaymentCard(page);
    await page.locator("#full").click({ timeout: 10_000 }).catch(() => {});
    await fillStripePaymentElement(page);
    await page.getByTestId("button-checkout-submit").click();
    await page.waitForURL(/\/cart\/success/, { timeout: 120_000 });
  });

  test("register child, choose biweekly at checkout, first payment reaches success", async ({
    page,
    request,
  }) => {
    const { response, json } = await postSetupCartScenario(request, {
      paymentPlan: "biweekly",
      linkSupabaseAuth: true,
    });
    test.skip(
      !response.ok(),
      `seed failed (${response.status()}): ${json?.error ?? json?.details ?? "see server logs"}`,
    );
    test.skip(!json?.success || !json.data?.parent?.email, "seed returned no parent credentials");
    test.skip(
      json.data?.supabaseLinked !== true,
      "Supabase auth was not linked for the seeded parent (configure SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)",
    );

    const { email, password } = json.data.parent;
    await loginParent(page, email, password);
    await registerAnotherChild(page);

    await goCheckoutAndWaitForPaymentCard(page);
    await page.locator("#biweekly").click({ timeout: 20_000 });
    await fillStripePaymentElement(page);
    await page.getByTestId("button-checkout-submit").click();
    await page.waitForURL(/\/cart\/success/, { timeout: 120_000 });
  });

  test("register child, pay a plan installment from Payments → Upcoming", async ({ page, request }) => {
    const { response, json } = await postSetupCartScenario(request, {
      paymentPlan: "biweekly",
      linkSupabaseAuth: true,
    });
    test.skip(
      !response.ok(),
      `seed failed (${response.status()}): ${json?.error ?? json?.details ?? "see server logs"}`,
    );
    test.skip(!json?.success || !json.data?.enrollment?.id, "seed returned no enrollment");
    test.skip(!json.data?.parent?.email, "seed returned no parent credentials");
    test.skip(
      json.data?.supabaseLinked !== true,
      "Supabase auth was not linked for the seeded parent (configure SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)",
    );

    const seeded = await postSeedUpcomingScheduledPayment(request, {
      enrollmentId: json.data.enrollment.id,
      amountCents: 2500,
      paymentPlan: "biweekly",
    });
    test.skip(!seeded.ok, `seed-upcoming-scheduled-payment failed (${seeded.status}): ${seeded.text}`);

    const { email, password } = json.data.parent;
    await loginParent(page, email, password);
    await registerAnotherChild(page);

    await page.goto("/payments?tab=upcoming", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /^pay now$/i }).first().click({ timeout: 30_000 });
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await fillStripePaymentElement(page, { within: dialog });
    await dialog.getByRole("button", { name: /pay \$/i }).click();
    await expect(dialog).toBeHidden({ timeout: 120_000 });
  });
});
