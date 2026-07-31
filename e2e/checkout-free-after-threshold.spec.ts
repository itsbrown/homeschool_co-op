import { test, expect } from "@playwright/test";
import { fillStripePaymentElement } from "./helpers/stripePlaywright";
import {
  bearerAuthHeaders,
  dismissParentOnboardingTourIfVisible,
  dismissStaffGuideIfVisible,
  loginParent,
  waitForSupabaseToken,
} from "./helpers/parentCheckoutHelpers";
import { postSetupFreeAfterCartScenario, testApiToken } from "./helpers/testSeed";
import { isRealStripeTestSecretConfigured } from "./helpers/stripeEnv";

/**
 * Free-after-threshold: 4 unique children, threshold 3 → cheapest class free.
 * Asserts checkout Pay amount, Stripe success, and free enrollment comps.
 *
 * Wait for Free After UI before requiring Pay $ — cart pricing / PI refresh can
 * remount PaymentElement after an early ready state.
 * Ledger clears via CartSuccess → fulfill-payment-intent (not webhook).
 */
test.describe.configure({ mode: "serial", timeout: 240_000 });

test.describe("checkout free after threshold", () => {
  test("cheapest enrollment is free; Pay amount and ledger match", async ({ page, request }) => {
    test.skip(
      !isRealStripeTestSecretConfigured(),
      "Set STRIPE_TEST_SECRET_KEY (real sk_test_*) — docs sample key is rejected by Stripe API",
    );

    const { response, json } = await postSetupFreeAfterCartScenario(request, {
      linkSupabaseAuth: true,
      childCount: 4,
      freeAfterThreshold: 3,
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

    const { email, password } = json.data!.parent;
    const expectedDollars = (json.data!.pricing.expectedPayableCents / 100).toFixed(2);
    const freeEnrollmentId = json.data!.enrollments[0].id; // cheapest ($80)

    await loginParent(page, email, password);

    const token = await waitForSupabaseToken(page);
    await expect
      .poll(
        async () => {
          const res = await page.request.get("/api/parent/enrollments", {
            headers: bearerAuthHeaders(token),
          });
          if (!res.ok()) return 0;
          const rows = (await res.json()) as Array<{ status?: string }>;
          if (!Array.isArray(rows)) return 0;
          return rows.filter((e) => String(e.status ?? "").toLowerCase() === "pending_payment")
            .length;
        },
        { timeout: 60_000, intervals: [500, 1000, 2000] },
      )
      .toBeGreaterThanOrEqual(4);

    await page.evaluate(() => {
      sessionStorage.setItem("postSessionEnrollmentCheckout", "1");
    });
    await page.goto("/cart/checkout", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page).toHaveURL(/\/cart\/checkout/, { timeout: 30_000 });
    await dismissStaffGuideIfVisible(page);
    await dismissParentOnboardingTourIfVisible(page);

    await expect(page.getByText("Payment Information", { exact: true })).toBeVisible({
      timeout: 120_000,
    });
    // Discount lines must settle before we trust the Pay button amount.
    await expect(page.getByTestId("checkout-summary-free-after")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId("checkout-summary-free-after")).toContainText("Free After 3");
    await expect(page.getByTestId("checkout-summary-free-after")).toContainText("-$80.00");

    await expect(page.getByTestId("button-checkout-submit")).toContainText(`Pay $${expectedDollars}`, {
      timeout: 120_000,
    });
    await expect(page.getByTestId("button-checkout-submit")).toBeEnabled({ timeout: 30_000 });

    await page.getByText("Payment Information", { exact: true }).scrollIntoViewIfNeeded();
    await fillStripePaymentElement(page);
    await page.getByTestId("button-checkout-submit").click();
    await page.waitForURL(/\/cart\/success/, { timeout: 120_000 });
    await expect(page.getByRole("heading", { name: "Enrollment Complete!" })).toBeVisible({
      timeout: 90_000,
    });

    await expect
      .poll(
        async () => {
          const probe = await request.get(`/api/test/enrollment/${freeEnrollmentId}`, {
            headers: { "X-Test-Token": testApiToken() },
          });
          if (!probe.ok()) return null;
          const body = (await probe.json()) as {
            enrollment?: {
              status?: string;
              totalCost?: number;
              totalPaid?: number;
              compAmountCents?: number | null;
            };
          };
          return body.enrollment ?? null;
        },
        { timeout: 45_000 },
      )
      .toMatchObject({
        status: "enrolled",
        compAmountCents: 8000,
      });

    const finalRes = await request.get(`/api/test/enrollment/${freeEnrollmentId}`, {
      headers: { "X-Test-Token": testApiToken() },
    });
    expect(finalRes.ok()).toBeTruthy();
    const finalBody = (await finalRes.json()) as {
      enrollment: {
        totalCost?: number;
        totalPaid?: number;
        compAmountCents?: number | null;
      };
    };
    const enrollment = finalBody.enrollment;
    const owed = Math.max(
      0,
      (enrollment.totalCost ?? 0) -
        (enrollment.totalPaid ?? 0) -
        (enrollment.compAmountCents ?? 0),
    );
    expect(owed).toBe(0);
  });
});
