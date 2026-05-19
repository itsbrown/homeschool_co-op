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
