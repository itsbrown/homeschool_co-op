import { test, expect } from "@playwright/test";
import { fillStripePaymentElement } from "./helpers/stripePlaywright";
import {
  goCheckoutAndWaitForPaymentCard,
  loginParent,
  registerAnotherChild,
} from "./helpers/parentCheckoutHelpers";
import { postSetupCartScenario } from "./helpers/testSeed";

/**
 * End-to-end: seeded parent has an approved volunteer/marketing credit balance;
 * checkout applies credits to reduce the Stripe charge and completes payment.
 *
 * Requires the same environment as `parent-payment-flow.spec.ts`:
 * - `DATABASE_URL` (Postgres) so `/api/test/setup-cart-scenario` can insert rows
 * - `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` when using `linkSupabaseAuth: true`
 */
test.describe.configure({ mode: "serial" });

test.describe("checkout volunteer credits", () => {
  /** Seeded class price is $100.00 (10000¢); credit grant is $30.00 → card pays $70.00. */
  const CLASS_DOLLARS = 100;
  const CREDIT_CENTS = 3000;
  const EXPECTED_PAY_DOLLARS = CLASS_DOLLARS - CREDIT_CENTS / 100;

  test("apply credits reduces Pay button amount and checkout succeeds", async ({ page, request }) => {
    const { response, json } = await postSetupCartScenario(request, {
      paymentPlan: "full_payment",
      linkSupabaseAuth: true,
      withCredits: CREDIT_CENTS,
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
    test.skip(
      !json.data?.credit?.amountCents,
      "seed did not return a credit row (withCredits may not have persisted)",
    );

    const { email, password } = json.data.parent;
    await loginParent(page, email, password);
    await registerAnotherChild(page);

    await goCheckoutAndWaitForPaymentCard(page);

    const creditsCard = page.getByTestId("card-credits");
    await expect(creditsCard).toBeVisible({ timeout: 60_000 });
    await expect(creditsCard).toContainText("$30.00");

    await page.locator("#full").click({ timeout: 10_000 }).catch(() => {});

    await expect(page.getByTestId("button-checkout-submit")).toContainText(`Pay $${CLASS_DOLLARS}.00`, {
      timeout: 30_000,
    });

    await page.getByTestId("checkbox-apply-credits").check();

    await expect(page.getByTestId("text-credits-saving")).toContainText("$30.00", { timeout: 30_000 });

    await expect(page.getByTestId("button-checkout-submit")).toContainText(
      `Pay $${EXPECTED_PAY_DOLLARS.toFixed(2)}`,
      { timeout: 90_000 },
    );

    await fillStripePaymentElement(page);
    await page.getByTestId("button-checkout-submit").click();
    await page.waitForURL(/\/cart\/success/, { timeout: 120_000 });
  });
});
