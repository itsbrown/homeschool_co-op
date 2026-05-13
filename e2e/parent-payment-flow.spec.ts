import { test, expect } from "@playwright/test";
import { fillStripePaymentElement } from "./helpers/stripePlaywright";
import {
  goCheckoutAndWaitForPaymentCard,
  loginParent,
  registerAnotherChild,
} from "./helpers/parentCheckoutHelpers";
import {
  postSetupCartScenario,
  postSeedUpcomingScheduledPayment,
} from "./helpers/testSeed";

test.describe.configure({ mode: "serial" });

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
