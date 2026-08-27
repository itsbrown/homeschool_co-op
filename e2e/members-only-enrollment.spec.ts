/**
 * Members-only enrollment (users.member_id) on sessions and classes.
 * Seed/login is a product gate — requireLinkedSeed, not test.skip.
 */
import { test, expect } from "@playwright/test";
import {
  bearerAuthHeaders,
  dismissStaffGuideIfVisible,
  loginParent,
  preventStaffGuideModal,
  waitForSupabaseToken,
} from "./helpers/parentCheckoutHelpers";
import { requireLinkedSeed } from "./helpers/requireLinkedSeed";
import { postSetupSessionEnrollmentScenario } from "./helpers/testSeed";

test.describe.configure({ mode: "serial" });

test.describe("members-only enrollment (member ID)", () => {
  test("hides gated sessions and rejects enroll without a member ID", async ({ page, request }) => {
    const { response, json } = await postSetupSessionEnrollmentScenario(request, {
      openSessionCount: 1,
      requireMemberId: true,
      withMemberId: false,
      linkSupabaseAuth: true,
    });
    const seed = requireLinkedSeed(response, json);
    const sessionId = seed.openSessions[0].id;
    const classId = seed.class!.id;
    const childId = seed.child.id;

    await preventStaffGuideModal(page);
    await loginParent(page, seed.parent.email, seed.parent.password);
    const token = await waitForSupabaseToken(page);

    const openApi = page.waitForResponse(
      (r) => r.url().includes("/api/admin/sessions/open") && r.ok(),
      { timeout: 60_000 },
    );
    await page.goto("/enroll", { waitUntil: "domcontentloaded" });
    await dismissStaffGuideIfVisible(page);
    const openRes = await openApi;
    const openBody = (await openRes.json()) as {
      sessions: { id: number }[];
      membersOnlyNotices?: { sessionId: number; message: string }[];
    };
    expect(openBody.sessions.map((s) => s.id)).not.toContain(sessionId);
    expect(openBody.membersOnlyNotices?.some((n) => n.sessionId === sessionId)).toBe(true);

    const wizard = page.getByTestId("session-enrollment-wizard");
    await wizard.getByTestId(`enroll-child-${childId}`).click();
    await wizard.getByRole("button", { name: /^next$/i }).click();
    await expect(wizard.getByTestId("session-enroll-step-2")).toBeVisible();
    await expect(wizard.getByTestId(`session-option-${sessionId}`)).toHaveCount(0);
    await expect(wizard.getByTestId(`session-members-only-notice-${sessionId}`)).toBeVisible();

    const enrollRes = await page.request.post("/api/session-enrollments", {
      headers: { ...bearerAuthHeaders(token), "Content-Type": "application/json" },
      data: { childIds: [childId], sessionIds: [sessionId], variant: "full_day" },
    });
    expect(enrollRes.status()).toBe(403);
    const enrollBody = await enrollRes.json();
    expect(enrollBody.code).toBe("MEMBER_ID_REQUIRED");

    const classEnroll = await page.request.post(`/api/classes/${classId}/enroll`, {
      headers: { ...bearerAuthHeaders(token), "Content-Type": "application/json" },
      data: { childId },
    });
    expect(classEnroll.status()).toBe(403);
  });

  test("allows gated session enroll when the parent has a member ID", async ({ page, request }) => {
    const { response, json } = await postSetupSessionEnrollmentScenario(request, {
      openSessionCount: 1,
      requireMemberId: true,
      withMemberId: true,
      linkSupabaseAuth: true,
    });
    const seed = requireLinkedSeed(response, json);
    expect(seed.parentHasMemberId).toBe(true);
    const sessionId = seed.openSessions[0].id;
    const childId = seed.child.id;

    await preventStaffGuideModal(page);
    await loginParent(page, seed.parent.email, seed.parent.password);
    const token = await waitForSupabaseToken(page);

    const openApi = page.waitForResponse(
      (r) => r.url().includes("/api/admin/sessions/open") && r.ok(),
      { timeout: 60_000 },
    );
    await page.goto("/enroll", { waitUntil: "domcontentloaded" });
    await dismissStaffGuideIfVisible(page);
    const openRes = await openApi;
    const openBody = (await openRes.json()) as { sessions: { id: number }[] };
    expect(openBody.sessions.map((s) => s.id)).toContain(sessionId);

    const wizard = page.getByTestId("session-enrollment-wizard");
    await wizard.getByTestId(`enroll-child-${childId}`).click();
    await wizard.getByRole("button", { name: /^next$/i }).click();
    await expect(wizard.getByTestId(`session-option-${sessionId}`)).toBeVisible({ timeout: 15_000 });

    const enrollRes = await page.request.post("/api/session-enrollments", {
      headers: { ...bearerAuthHeaders(token), "Content-Type": "application/json" },
      data: { childIds: [childId], sessionIds: [sessionId], variant: "full_day" },
    });
    expect(enrollRes.ok()).toBeTruthy();
    const enrollBody = await enrollRes.json();
    expect(enrollBody.enrollments?.length).toBeGreaterThan(0);
  });
});
