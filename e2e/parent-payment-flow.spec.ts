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
  testApiToken,
} from "./helpers/testSeed";
import { isRealStripeTestSecretConfigured } from "./helpers/stripeEnv";

test.describe.configure({ mode: "serial", timeout: 180_000 });

test.describe("parent payment journey (DB seed + Supabase login)", () => {
  test.beforeEach(() => {
    test.skip(
      !isRealStripeTestSecretConfigured(),
      "Set STRIPE_TEST_SECRET_KEY (real sk_test_*) — docs sample key is rejected by Stripe API",
    );
  });

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

    // Ledger must clear via interactive fulfill (CartSuccess → fulfill-payment-intent),
    // not webhook — Replit dev often has no stripe listen.
    const enrollmentId = json.data!.enrollment!.id;
    const totalCost = json.data!.enrollment!.totalCost ?? json.data!.class?.price ?? 0;
    await expect
      .poll(
        async () => {
          const probe = await request.get(`/api/test/program-enrollment/${enrollmentId}`, {
            headers: { "X-Test-Token": testApiToken() },
          });
          if (!probe.ok()) return null;
          return probe.json() as Promise<{
            remainingBalance?: number;
            totalPaid?: number;
            status?: string;
          } | null>;
        },
        { timeout: 30_000 },
      )
      .toMatchObject({
        remainingBalance: 0,
        status: "enrolled",
      });
    const finalRow = await request.get(`/api/test/program-enrollment/${enrollmentId}`, {
      headers: { "X-Test-Token": testApiToken() },
    });
    const finalEnrollment = (await finalRow.json()) as { totalPaid?: number };
    expect(finalEnrollment.totalPaid ?? 0).toBeGreaterThanOrEqual(totalCost);
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
