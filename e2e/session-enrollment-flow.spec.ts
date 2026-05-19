import { test, expect } from "@playwright/test";
import { loginParent } from "./helpers/parentCheckoutHelpers";
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

    await loginParent(page, email, password);

    const openApi = page.waitForResponse(
      (r) => r.url().includes("/api/admin/sessions/open") && r.ok(),
      { timeout: 60_000 },
    );
    await page.goto("/enroll", { waitUntil: "domcontentloaded" });
    const openRes = await openApi;
    const openBody = (await openRes.json()) as { id: number; name: string }[];
    expect(openBody.length).toBeGreaterThanOrEqual(openSessions.length);

    const child = json.data!.child;
    await page.getByText(new RegExp(child.firstName, "i")).click();
    await page.getByRole("button", { name: /^next$/i }).click();
    await expect(page.getByText("Choose Sessions")).toBeVisible();

    for (const session of openSessions) {
      await expect(page.getByText(session.name)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId(`session-option-${session.id}`)).toBeVisible();
    }

    if (closedSession) {
      await expect(page.getByText(closedSession.name)).not.toBeVisible();
    }

    await page.getByTestId(`session-option-${openSessions[0].id}`).click();
    await page.getByRole("button", { name: /^next$/i }).click();
    await expect(page.getByText("Schedule Type")).toBeVisible();
    await page.getByRole("heading", { name: "Half Day" }).click();
    await page.getByRole("button", { name: /^next$/i }).click();
    await expect(page.getByText(/review/i)).toBeVisible();
  });

  test("session enrollment reaches create-payment-intent after enroll wizard", async ({ page, request }) => {
    const { response, json } = await postSetupSessionEnrollmentScenario(request, {
      openSessionCount: 1,
      linkSupabaseAuth: true,
    });
    test.skip(!response.ok() || !json?.success, "seed failed");
    test.skip(json.data?.supabaseLinked !== true, "Supabase not linked");

    const { email, password } = json.data!.parent;
    const session = json.data!.openSessions[0];
    const child = json.data!.child;

    await loginParent(page, email, password);

    const enrollRes = await page.request.post("/api/session-enrollments", {
      data: {
        childIds: [child.id],
        sessionIds: [session.id],
        variant: "full_day",
      },
    });
    expect(enrollRes.ok()).toBeTruthy();
    const enrollBody = await enrollRes.json();
    const enrollmentId = enrollBody.enrollments?.[0]?.id;
    expect(enrollmentId).toBeTruthy();

    const piRes = await page.request.post("/api/stripe/create-payment-intent", {
      data: {
        items: [
          {
            id: `enrollment-${enrollmentId}`,
            enrollmentId,
            sessionId: session.id,
            childId: child.id,
            childName: `${child.firstName} ${child.lastName}`,
            className: session.name,
            classType: "marketplace",
            price: 25000,
            totalCost: 25000,
            remainingBalance: 25000,
          },
        ],
        subtotal: 25000,
        total: 25000,
        discounts: {
          siblingDiscount: 0,
          freeAfterThree: 0,
          appliedDiscounts: [],
          totalDiscountAmount: 0,
        },
        paymentPlan: "full",
        paymentFrequency: "one_time",
      },
    });

    expect(piRes.ok(), `create-payment-intent failed: ${await piRes.text()}`).toBeTruthy();
    const piBody = await piRes.json();
    expect(piBody.clientSecret || piBody.creditOnlyCheckout).toBeTruthy();
    expect(piBody.enrollmentIds).toContain(enrollmentId);
  });

  test("GET /api/admin/sessions/open returns only enrollment-open sessions", async ({ page, request }) => {
    const { response, json } = await postSetupSessionEnrollmentScenario(request, {
      openSessionCount: 1,
      includeClosedSession: true,
      linkSupabaseAuth: true,
    });
    test.skip(!response.ok() || !json?.success, "seed failed");
    test.skip(json.data?.supabaseLinked !== true, "Supabase not linked");

    await loginParent(page, json.data!.parent.email, json.data!.parent.password);

    const apiRes = await page.request.get("/api/admin/sessions/open");
    expect(apiRes.ok()).toBeTruthy();
    const sessions = (await apiRes.json()) as { id: number; enrollmentOpen?: boolean; name: string }[];
    expect(sessions.length).toBe(1);
    expect(sessions[0].name).toBe(json.data!.openSessions[0].name);
    if (json.data!.closedSession) {
      expect(sessions.some((s) => s.id === json.data!.closedSession!.id)).toBe(false);
    }
  });
});
