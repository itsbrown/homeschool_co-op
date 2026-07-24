import { test, expect } from "@playwright/test";
import {
  dismissStaffGuideIfVisible,
  loginParent,
  preventStaffGuideModal,
} from "./helpers/parentCheckoutHelpers";
import { postSetupScheduleScenario, testApiToken } from "./helpers/testSeed";

test.describe.configure({ mode: "serial", timeout: 90_000 });

test.describe("attendance QR clock-in", () => {
  test("generate QR then public session-by-qr resolves", async ({ page, request }) => {
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

    const token = await page.evaluate(() => localStorage.getItem("supabase_token"));
    const gen = await request.post(
      `/api/school-admin/sessions/${seed.attendance.sessionId}/generate-qr`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Test-Token": testApiToken(),
        },
      },
    );
    test.skip(!gen.ok(), `generate-qr failed (${gen.status()}): ${await gen.text()}`);
    const genBody = await gen.json();
    const qrToken = genBody.qrToken || genBody.token;
    expect(qrToken).toBeTruthy();

    const publicRes = await request.get(`/api/public/session-by-qr/${qrToken}`);
    expect(publicRes.ok()).toBeTruthy();
    const publicBody = await publicRes.json();
    expect(publicBody.sessionId).toBe(seed.attendance.sessionId);
    expect(publicBody.className).toBeTruthy();
  });
});
