/**
 * Session enrollment test boundaries (keep these separate):
 * - E2E (this file): parent /enroll wizard, GET /api/admin/sessions/open, POST /api/session-enrollments.
 *   Do NOT call live Stripe here — keys vary by machine and reuseExistingServer skips Playwright env.
 * - Integration: server/tests/integration/session-enrollment-checkout.test.ts (mocked Stripe, TEST_DATABASE_URL).
 * - Full checkout + Elements: e2e/parent-payment-flow.spec.ts (real sk_test_* in .env / secrets).
 */
import { test, expect } from "@playwright/test";
import {
  bearerAuthHeaders,
  dismissStaffGuideIfVisible,
  loginParent,
  preventStaffGuideModal,
  waitForSupabaseToken,
} from "./helpers/parentCheckoutHelpers";
import { postSetupSessionEnrollmentScenario } from "./helpers/testSeed";

test.describe.configure({ mode: "serial" });

test.describe("session enrollment flow (admin sessions → parent /enroll)", () => {
  test("open sessions appear in choose-sessions step after parent login", async ({ page, request }) => {
    const { response, json } = await postSetupSessionEnrollmentScenario(request, {
      openSessionCount: 2,
      includeClosedSession: true,
      linkSupabaseAuth: true,
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
    const openSessions = json.data!.openSessions;
    const closedSession = json.data!.closedSession;

    await preventStaffGuideModal(page);
    await loginParent(page, email, password);

    const openApi = page.waitForResponse(
      (r) => r.url().includes("/api/admin/sessions/open") && r.ok(),
      { timeout: 60_000 },
    );
    await page.goto("/enroll", { waitUntil: "domcontentloaded" });
    await dismissStaffGuideIfVisible(page);
    const openRes = await openApi;
    const openBody = (await openRes.json()) as { id: number; name: string }[];
    expect(openBody.length).toBeGreaterThanOrEqual(openSessions.length);

    const child = json.data!.child;
    const wizard = page.getByTestId("session-enrollment-wizard");
    await wizard.getByTestId(`enroll-child-${child.id}`).click();
    const nextBtn = wizard.getByRole("button", { name: /^next$/i });
    await expect(nextBtn).toBeEnabled();
    await nextBtn.click();
    await expect(wizard.getByTestId("session-enroll-step-2")).toBeVisible();

    for (const session of openSessions) {
      const option = wizard.getByTestId(`session-option-${session.id}`);
      await expect(option).toBeVisible({ timeout: 15_000 });
      await expect(option).toContainText(session.name);
    }

    if (closedSession) {
      await expect(wizard.getByTestId(`session-option-${closedSession.id}`)).toHaveCount(0);
    }

    await wizard.getByTestId(`session-option-${openSessions[0].id}`).click();
    await expect(nextBtn).toBeEnabled();
    await nextBtn.click();
    await expect(wizard.getByTestId("session-enroll-step-3")).toBeVisible();
    await wizard.getByRole("heading", { name: "Half Day" }).click();
    await expect(nextBtn).toBeEnabled();
    await nextBtn.click();
    await expect(wizard.getByTestId("session-enroll-step-4")).toBeVisible();
  });

  /**
   * Session checkout + Stripe PI are covered with mocked Stripe in
   * server/tests/integration/session-enrollment-checkout.test.ts (TEST_DATABASE_URL).
   * E2E here only asserts the parent-authenticated enroll API — no live Stripe call.
   */
  test("POST /api/session-enrollments creates pending session enrollment", async ({ page, request }) => {
    const { response, json } = await postSetupSessionEnrollmentScenario(request, {
      openSessionCount: 1,
      linkSupabaseAuth: true,
    });
    test.skip(!response.ok() || !json?.success, "seed failed");
    test.skip(json.data?.supabaseLinked !== true, "Supabase not linked");

    const { email, password } = json.data!.parent;
    const session = json.data!.openSessions[0];
    const child = json.data!.child;

    await preventStaffGuideModal(page);
    await loginParent(page, email, password);
    const auth = bearerAuthHeaders(await waitForSupabaseToken(page));

    const enrollRes = await page.request.post("/api/session-enrollments", {
      headers: {
        ...auth,
        "Content-Type": "application/json",
      },
      data: {
        childIds: [child.id],
        sessionIds: [session.id],
        variant: "full_day",
      },
    });
    const enrollText = await enrollRes.text();
    if (!enrollRes.ok()) {
      let details = enrollText;
      try {
        const errBody = JSON.parse(enrollText) as { details?: string; message?: string };
        if (errBody.details) {
          details = `${errBody.message}: ${errBody.details}`;
        }
      } catch {
        /* use raw body */
      }
      test.skip(
        enrollRes.status() === 500 &&
          /enrollment_price_history|session_id|enrollment_version|does not exist|relation/i.test(
            details,
          ),
        `F001 schema not applied on DATABASE_URL — run server/migrations/f001-phase1-schema.sql or npm run db:push. Server said: ${details}`,
      );
    }
    expect(enrollRes.ok(), `session-enrollments HTTP ${enrollRes.status()}: ${enrollText}`).toBeTruthy();
    const enrollBody = JSON.parse(enrollText) as {
      enrollments?: Array<Record<string, unknown>>;
    };
    const enrollment = enrollBody.enrollments?.[0];
    expect(enrollment?.id).toBeTruthy();
    expect(enrollment.sessionId).toBe(session.id);
    expect(enrollment.childId).toBe(child.id);
    expect(enrollment.status).toBe("pending_payment");
    expect(enrollment.classId).toBeFalsy();
    expect(enrollment.marketplaceClassId).toBeFalsy();
    expect(enrollment.totalCost).toBe(25000);
  });

  test("GET /api/admin/sessions/open returns only enrollment-open sessions", async ({ page, request }) => {
    const { response, json } = await postSetupSessionEnrollmentScenario(request, {
      openSessionCount: 1,
      includeClosedSession: true,
      linkSupabaseAuth: true,
    });
    test.skip(!response.ok() || !json?.success, "seed failed");
    test.skip(json.data?.supabaseLinked !== true, "Supabase not linked");

    await preventStaffGuideModal(page);
    await loginParent(page, json.data!.parent.email, json.data!.parent.password);
    const auth = bearerAuthHeaders(await waitForSupabaseToken(page));

    const apiRes = await page.request.get("/api/admin/sessions/open", { headers: auth });
    expect(apiRes.ok()).toBeTruthy();
    const sessions = (await apiRes.json()) as { id: number; enrollmentOpen?: boolean; name: string }[];
    expect(sessions.length).toBe(1);
    expect(sessions[0].name).toBe(json.data!.openSessions[0].name);
    if (json.data!.closedSession) {
      expect(sessions.some((s) => s.id === json.data!.closedSession!.id)).toBe(false);
    }
  });
});
