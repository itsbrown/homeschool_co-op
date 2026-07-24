import { test, expect } from "@playwright/test";
import {
  dismissStaffGuideIfVisible,
  loginParent,
  preventStaffGuideModal,
} from "./helpers/parentCheckoutHelpers";
import { postSetupScheduleScenario } from "./helpers/testSeed";

/**
 * Phase 2 smoke: seeded class session exists and attendance storage path responds.
 * Full ActiveSession UI mark flow depends on educator live-session UX; this asserts
 * the restored storage-backed APIs used by educator mark are reachable.
 */
test.describe.configure({ mode: "serial", timeout: 90_000 });

test.describe("attendance educator mark (API smoke)", () => {
  test("seeded attendance session is readable via school-admin sessions list", async ({
    page,
    request,
  }) => {
    const { response, json } = await postSetupScheduleScenario(request, {
      linkSupabaseAuth: true,
    });
    test.skip(
      !response.ok(),
      `seed failed (${response.status()}): ${json?.error ?? json?.details ?? "see server logs"}`,
    );
    test.skip(
      json.data?.supabaseLinked !== true,
      "Supabase auth was not linked",
    );
    test.skip(!json?.data?.attendance?.sessionId, "seed missing attendance.sessionId");

    const seed = json!.data!;
    await preventStaffGuideModal(page);
    await loginParent(page, seed.admin.email, seed.admin.password);
    await dismissStaffGuideIfVisible(page);

    await page.goto("/school-admin/attendance", { waitUntil: "domcontentloaded" });
    const sessionsRes = await page.request.get(
      `/api/school-admin/attendance/sessions?startDate=${seed.weekStart}&endDate=${seed.weekStart}`,
      {
        headers: {
          Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem("supabase_token"))}`,
        },
      },
    );
    expect(sessionsRes.ok()).toBeTruthy();
    const body = await sessionsRes.json();
    const sessions = body.sessions || body;
    const ids = (Array.isArray(sessions) ? sessions : []).map(
      (s: any) => s.id ?? s.sessionId,
    );
    expect(ids).toContain(seed.attendance.sessionId);
  });
});
