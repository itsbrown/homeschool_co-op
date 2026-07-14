/**
 * Comprehensive parent journey (UI):
 *   school-code registration → multiple children → session enrollments →
 *   biweekly checkout with auto-pay → first payment → auto-pay installment 2.
 */
import { test, expect } from "@playwright/test";
import { postSetupRegistrationScenario } from "./helpers/testSeed";
import { isRealSupabaseConfigured } from "./helpers/supabaseEnv";
import { isRealStripeTestSecretConfigured } from "./helpers/stripeEnv";
import {
  loginParent,
  waitForSupabaseToken,
  bearerAuthHeaders,
} from "./helpers/parentCheckoutHelpers";
import {
  registerParentWithChildren,
  enrollSessionsInWizard,
  checkoutBiweeklyWithAutopay,
  resolvePaymentIntentIdForParent,
  persistCheckoutScheduleFromPaymentIntent,
  syncParentStripeForE2e,
  fetchParentChildren,
  pollPendingInstallmentTwo,
  runAutoPayForScheduledPayment,
  getScheduledPaymentStatus,
} from "./helpers/parentJourneyHelpers";

test.describe.configure({ mode: "serial", timeout: 360_000 });

const parentPassword = "SecurePass123!";

test.describe("parent full journey (registration → sessions → autopay)", () => {
  test.beforeEach(() => {
    test.skip(
      !isRealSupabaseConfigured(),
      "Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to a real test project (see .env.e2e.example)",
    );
    test.skip(
      !isRealStripeTestSecretConfigured(),
      "Set STRIPE_TEST_SECRET_KEY (real sk_test_*) — docs sample key is rejected by Stripe API",
    );
  });

  test("registers 2 children, enrolls 2 sessions, pays biweekly, autopay charges installment 2", async ({
    page,
    request,
  }) => {
    const unique = Date.now();
    const parentEmail = `e2e_journey_${unique}@test.com`;

    const { response, json } = await postSetupRegistrationScenario(request, {
      openSessionCount: 2,
    });
    test.skip(
      !response.ok(),
      `seed failed (${response.status()}): ${json?.error ?? json?.details ?? "see server logs"}`,
    );
    test.skip(!json?.success || !json.data?.registrationCode, "seed returned no registration code");
    test.skip(
      (json.data?.openSessions?.length ?? 0) < 2,
      "seed did not create open sessions (openSessionCount)",
    );

    const { registrationCode, school, locationsOnSchool, openSessions } = json.data!;
    const campusName = locationsOnSchool[0]?.name ?? "Brighton";
    const sessionIds = openSessions!.slice(0, 2).map((s) => s.id);

    await registerParentWithChildren(page, {
      registrationCode,
      schoolName: school.name,
      campusName,
      parentEmail,
      password: parentPassword,
      children: [
        { firstName: "Alex", lastName: "One", birthdate: "2015-03-01", grade: "3rd Grade" },
        { firstName: "Blake", lastName: "Two", birthdate: "2017-08-12", grade: "1st Grade" },
      ],
    });

    if (page.url().includes("/login")) {
      await loginParent(page, parentEmail, parentPassword);
    }
    await waitForSupabaseToken(page, 90_000);

    const children = await fetchParentChildren(page);
    expect(children.length).toBeGreaterThanOrEqual(2);
    const childIds = children.slice(0, 2).map((c) => c.id);

    await enrollSessionsInWizard(page, { childIds, sessionIds });
    await checkoutBiweeklyWithAutopay(page);

    const paymentIntentId = await resolvePaymentIntentIdForParent(page, request, parentEmail);
    await persistCheckoutScheduleFromPaymentIntent(request, paymentIntentId);
    await syncParentStripeForE2e(request, parentEmail);

    const token = await waitForSupabaseToken(page);
    await expect
      .poll(
        async () => {
          const autoPayRes = await page.request.get("/api/user/auto-pay-status", {
            headers: bearerAuthHeaders(token),
          });
          if (!autoPayRes.ok()) return false;
          const body = (await autoPayRes.json()) as { autoPayEnabled?: boolean };
          return body.autoPayEnabled === true;
        },
        { timeout: 30_000 },
      )
      .toBe(true);

    const secondPayment = await pollPendingInstallmentTwo(request, parentEmail);
    expect(
      secondPayment,
      "No pending installment #2 in DB — biweekly schedule may have collapsed to pay-in-full (check session dates + TEST_CHECKOUT_ANCHOR_ISO)",
    ).toBeTruthy();

    await runAutoPayForScheduledPayment(request, secondPayment!.id);

    const after = await getScheduledPaymentStatus(request, secondPayment!.id);
    expect(after.status).toBe("completed");
  });
});
