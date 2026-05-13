import { test, expect } from "@playwright/test";
import { loginParent, goCheckoutAndWaitForPaymentCard } from "./helpers/parentCheckoutHelpers";
import { postSetupCartScenario } from "./helpers/testSeed";

test.describe.configure({ mode: "serial" });

/** Seeded class is $100; unpaid membership fee is $50 → checkout should show $150. */
const MEMBERSHIP_CENTS = 5_000;
const CLASS_CENTS = 10_000;
const TOTAL_DOLLARS = (CLASS_CENTS + MEMBERSHIP_CENTS) / 100;

test.describe("checkout order summary + membership fee", () => {
  test("membership lines and pay amount stay correct after refreshDiscounts", async ({
    page,
    request,
  }) => {
    const { response, json } = await postSetupCartScenario(request, {
      paymentPlan: "full_payment",
      linkSupabaseAuth: true,
      unpaidMembershipFeeCents: MEMBERSHIP_CENTS,
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

    const { email, password } = json.data!.parent;
    await loginParent(page, email, password);
    await goCheckoutAndWaitForPaymentCard(page);

    await expect(page.getByTestId("checkout-membership-fee")).toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId("checkout-summary-membership")).toBeVisible();
    await expect(page.getByTestId("button-checkout-submit")).toContainText(`Pay $${TOTAL_DOLLARS}.00`, {
      timeout: 120_000,
    });

    const hooked = await page.evaluate(() => {
      const w = window as unknown as { __E2E_CART__?: { refreshDiscounts?: () => Promise<void> } };
      return typeof w.__E2E_CART__?.refreshDiscounts === "function";
    });
    test.skip(!hooked, "window.__E2E_CART__ missing (set VITE_E2E_EXPOSE_CART for Playwright webServer)");

    await page.evaluate(async () => {
      const w = window as unknown as { __E2E_CART__?: { refreshDiscounts?: () => Promise<void> } };
      await w.__E2E_CART__!.refreshDiscounts!();
    });

    await expect(page.getByTestId("checkout-membership-fee")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("checkout-summary-membership")).toBeVisible();
    await expect(page.getByTestId("button-checkout-submit")).toContainText(`Pay $${TOTAL_DOLLARS}.00`);
  });
});
