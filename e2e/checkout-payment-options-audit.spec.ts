import { test, expect } from "@playwright/test";
import { fillStripePaymentElement } from "./helpers/stripePlaywright";
import {
  goCheckoutAndWaitForPaymentCard,
  loginParent,
} from "./helpers/parentCheckoutHelpers";
import {
  postSetupCartScenario,
  postSeedUpcomingScheduledPayment,
  testApiToken,
} from "./helpers/testSeed";
import { isRealStripeTestSecretConfigured } from "./helpers/stripeEnv";

/**
 * Full audit of member-cart payment options (see
 * docs/APP_KNOWLEDGE/runbooks/checkout-payment-e2e-audit.md).
 *
 * Covers plans, credits gates, membership+class pay, and installment Pay Now.
 * Cart is seeded via setup-cart-scenario — no extra child registration needed.
 */
test.describe.configure({ mode: "serial", timeout: 240_000 });

const CLASS_CENTS = 10_000;
const CLASS_DOLLARS = CLASS_CENTS / 100;

test.describe("checkout payment options audit", () => {
  test.beforeEach(() => {
    test.skip(
      !isRealStripeTestSecretConfigured(),
      "Set STRIPE_TEST_SECRET_KEY (real sk_test_*) — docs sample key is rejected by Stripe API",
    );
  });

  async function seedParentCart(
    request: Parameters<typeof postSetupCartScenario>[0],
    body: Record<string, unknown>,
  ) {
    const { response, json } = await postSetupCartScenario(request, {
      linkSupabaseAuth: true,
      ...body,
    });
    test.skip(
      !response.ok(),
      `seed failed (${response.status()}): ${json?.error ?? json?.details ?? "see server logs"}`,
    );
    test.skip(!json?.success || !json.data?.parent?.email, "seed returned no parent credentials");
    test.skip(
      json.data?.supabaseLinked !== true,
      "Supabase auth was not linked (configure SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)",
    );
    return json.data!;
  }

  test("A1 — pay in full (card) clears enrollment balance", async ({ page, request }) => {
    const data = await seedParentCart(request, { paymentPlan: "full_payment" });
    const { email, password } = data.parent;
    await loginParent(page, email, password);

    await goCheckoutAndWaitForPaymentCard(page);
    await page.locator("#full").click({ timeout: 10_000 }).catch(() => {});
    await fillStripePaymentElement(page);
    await page.getByTestId("button-checkout-submit").click();
    await page.waitForURL(/\/cart\/success/, { timeout: 120_000 });

    const enrollmentId = data.enrollment.id;
    await expect
      .poll(
        async () => {
          const probe = await request.get(`/api/test/program-enrollment/${enrollmentId}`, {
            headers: { "X-Test-Token": testApiToken() },
          });
          if (!probe.ok()) return null;
          return probe.json();
        },
        { timeout: 30_000 },
      )
      .toMatchObject({ remainingBalance: 0, status: "enrolled" });
  });

  test("A2 — biweekly: first installment reaches success", async ({ page, request }) => {
    const data = await seedParentCart(request, { paymentPlan: "biweekly" });
    await loginParent(page, data.parent.email, data.parent.password);

    await goCheckoutAndWaitForPaymentCard(page);
    await page.locator("#biweekly").click({ timeout: 20_000 });
    await fillStripePaymentElement(page);
    await page.getByTestId("button-checkout-submit").click();
    await page.waitForURL(/\/cart\/success/, { timeout: 120_000 });
  });

  test("A3 — upcoming Pay Now completes installment dialog", async ({ page, request }) => {
    const data = await seedParentCart(request, { paymentPlan: "biweekly" });
    const seeded = await postSeedUpcomingScheduledPayment(request, {
      enrollmentId: data.enrollment.id,
      amountCents: 2500,
      paymentPlan: "biweekly",
    });
    test.skip(!seeded.ok, `seed-upcoming-scheduled-payment failed (${seeded.status}): ${seeded.text}`);

    await loginParent(page, data.parent.email, data.parent.password);

    await page.goto("/payments?tab=upcoming", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /^pay now$/i }).first().click({ timeout: 30_000 });
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await fillStripePaymentElement(page, { within: dialog });
    await dialog.getByRole("button", { name: /pay \$/i }).click();
    await expect(dialog).toBeHidden({ timeout: 120_000 });
  });

  test("A4 — partial credits reduce Pay amount; card checkout succeeds", async ({ page, request }) => {
    const CREDIT_CENTS = 3000;
    const data = await seedParentCart(request, {
      paymentPlan: "full_payment",
      withCredits: CREDIT_CENTS,
    });
    test.skip(!data.credit?.amountCents, "seed did not return credit row");

    await loginParent(page, data.parent.email, data.parent.password);
    await goCheckoutAndWaitForPaymentCard(page);

    await page.locator("#full").click({ timeout: 10_000 }).catch(() => {});
    await expect(page.getByTestId("button-checkout-submit")).toContainText(`Pay $${CLASS_DOLLARS}.00`, {
      timeout: 30_000,
    });

    await page.getByTestId("checkbox-apply-credits").check();
    await expect(page.getByTestId("button-checkout-submit")).toContainText(
      `Pay $${(CLASS_DOLLARS - CREDIT_CENTS / 100).toFixed(2)}`,
      { timeout: 90_000 },
    );

    await fillStripePaymentElement(page);
    await page.getByTestId("button-checkout-submit").click();
    await page.waitForURL(/\/cart\/success/, { timeout: 120_000 });
  });

  test("A5 — credits unchecked: no auto-spend even when balance covers cart", async ({
    page,
    request,
  }) => {
    const data = await seedParentCart(request, {
      paymentPlan: "full_payment",
      withCredits: CLASS_CENTS,
    });
    test.skip(!data.credit?.amountCents, "seed did not return credit row");

    await loginParent(page, data.parent.email, data.parent.password);
    await goCheckoutAndWaitForPaymentCard(page);

    await expect(page.getByTestId("card-credits")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("checkbox-apply-credits")).not.toBeChecked();
    await expect(page.getByTestId("button-confirm-credits-only")).toHaveCount(0);

    await page.locator("#full").click({ timeout: 10_000 }).catch(() => {});
    await expect(page.getByTestId("button-checkout-submit")).toContainText(`Pay $${CLASS_DOLLARS}.00`, {
      timeout: 60_000,
    });

    // Stay on checkout — must not redirect to creditOnly success without Apply + confirm
    await page.waitForTimeout(3000);
    expect(page.url()).not.toMatch(/creditOnly=true/);
    expect(page.url()).toMatch(/\/cart\/checkout/);
  });

  test("A6 — credits-only: Apply shows confirm; confirm spends and succeeds", async ({
    page,
    request,
  }) => {
    const data = await seedParentCart(request, {
      paymentPlan: "full_payment",
      withCredits: CLASS_CENTS,
    });
    test.skip(!data.credit?.amountCents, "seed did not return credit row");

    await loginParent(page, data.parent.email, data.parent.password);
    await goCheckoutAndWaitForPaymentCard(page);

    await page.getByTestId("checkbox-apply-credits").check();

    const confirm = page.getByTestId("button-confirm-credits-only");
    await expect(confirm).toBeVisible({ timeout: 90_000 });

    // Must not auto-complete before confirm
    await page.waitForTimeout(2000);
    expect(page.url()).not.toMatch(/\/cart\/success/);

    await confirm.click();
    await page.waitForURL(/\/cart\/success\?.*creditOnly=true/, { timeout: 120_000 });

    await expect
      .poll(
        async () => {
          const probe = await request.get(`/api/test/program-enrollment/${data.enrollment.id}`, {
            headers: { "X-Test-Token": testApiToken() },
          });
          if (!probe.ok()) return null;
          return probe.json();
        },
        { timeout: 30_000 },
      )
      .toMatchObject({ remainingBalance: 0, status: "enrolled" });
  });

  test("A7 — class + unpaid membership: pay in full for combined total", async ({ page, request }) => {
    const MEMBERSHIP_CENTS = 5_000;
    const totalDollars = (CLASS_CENTS + MEMBERSHIP_CENTS) / 100;
    const data = await seedParentCart(request, {
      paymentPlan: "full_payment",
      unpaidMembershipFeeCents: MEMBERSHIP_CENTS,
    });

    await loginParent(page, data.parent.email, data.parent.password);
    await goCheckoutAndWaitForPaymentCard(page);

    await expect(page.getByTestId("checkout-membership-fee")).toBeVisible({ timeout: 120_000 });
    await page.locator("#full").click({ timeout: 10_000 }).catch(() => {});
    await expect(page.getByTestId("button-checkout-submit")).toContainText(`Pay $${totalDollars}.00`, {
      timeout: 120_000,
    });

    await fillStripePaymentElement(page);
    await page.getByTestId("button-checkout-submit").click();
    await page.waitForURL(/\/cart\/success/, { timeout: 120_000 });
  });
});
