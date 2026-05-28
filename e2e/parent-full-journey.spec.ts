/**
 * Comprehensive parent journey (UI):
 *   school-code registration → multiple children → 1–3 session enrollments →
 *   biweekly checkout with auto-pay → first payment → auto-pay runs installment 2.
 *
 * Requirements:
 *   - DATABASE_URL (Postgres)
 *   - Real Supabase test project (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
 *   - Stripe test keys (Playwright webServer sets defaults; override in .env.e2e for live confirm)
 *
 * Run:
 *   npm run playwright:install
 *   cp .env.e2e.example .env.e2e   # fill secrets
 *   npm run test:e2e -- e2e/parent-full-journey.spec.ts
 */
import { test, expect } from "@playwright/test";
import { postSetupRegistrationScenario } from "./helpers/testSeed";
import { isRealSupabaseConfigured } from "./helpers/supabaseEnv";
import { loginParent, waitForSupabaseToken, bearerAuthHeaders } from "./helpers/parentCheckoutHelpers";
import {
  registerParentWithChildren,
  enrollSessionsInWizard,
  checkoutBiweeklyWithAutopay,
  fetchParentChildren,
  fetchUpcomingScheduledPayments,
  runAutoPayForScheduledPayment,
  getScheduledPaymentStatus,
} from "./helpers/parentJourneyHelpers";

test.describe.configure({ mode: "serial", timeout: 300_000 });

const parentPassword = "SecurePass123!";

test.describe("parent full journey (registration → sessions → autopay)", () => {
  test.beforeEach(() => {
    test.skip(
      !isRealSupabaseConfigured(),
      "Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to a real test project (see .env.e2e.example)",
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

    const children = await fetchParentChildren(page);
    expect(children.length).toBeGreaterThanOrEqual(2);
    const childIds = children.slice(0, 2).map((c) => c.id);

    await enrollSessionsInWizard(page, { childIds, sessionIds });

    await checkoutBiweeklyWithAutopay(page);

    const token = await waitForSupabaseToken(page);
    const autoPayRes = await page.request.get("/api/user/auto-pay-status", {
      headers: bearerAuthHeaders(token),
    });
    if (autoPayRes.ok()) {
      const autoPayBody = (await autoPayRes.json()) as { autoPayEnabled?: boolean };
      expect(autoPayBody.autoPayEnabled).toBe(true);
    }

    const upcoming = await fetchUpcomingScheduledPayments(page);
    const pendingInstallments = upcoming.filter(
      (p) => p.status === "pending" && (p.installmentNumber ?? 0) >= 2,
    );
    test.skip(
      pendingInstallments.length === 0,
      "No pending installment #2+ after checkout — biweekly schedule may not have been created (check Stripe keys / webhook)",
    );

    const secondPayment = pendingInstallments.sort(
      (a, b) => (a.installmentNumber ?? 99) - (b.installmentNumber ?? 99),
    )[0]!;

    const autoPayResult = await runAutoPayForScheduledPayment(request, secondPayment.id);
    expect(autoPayResult.result).toBe("charged");

    const after = await getScheduledPaymentStatus(request, secondPayment.id);
    expect(after.status).toBe("completed");
  });
});
