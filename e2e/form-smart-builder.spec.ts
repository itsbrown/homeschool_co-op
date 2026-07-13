import { test, expect } from "@playwright/test";
import { postSetupPublicFormScenario } from "./helpers/testSeed";
import { loginSchoolAdmin } from "./helpers/schoolAdminAuth";

/**
 * AI Form Smart Builder: chat → draft → apply (FORM_BUILDER_AI_MOCK=1 on server).
 */
test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("form smart builder", () => {
  test("chat returns draft, apply writes fields, does not auto-publish", async ({
    page,
    request,
  }) => {
    const { response, json } = await postSetupPublicFormScenario(request, {
      linkSupabaseAuthAdmin: true,
    });
    test.skip(
      !response.ok(),
      `seed failed (${response.status()}): ${json?.error ?? json?.details ?? "see server logs"}`,
    );
    test.skip(!json?.success || !json.data?.admin?.email, "seed returned no admin");
    test.skip(
      json.data?.adminSupabaseLinked !== true,
      "Supabase auth was not linked for admin",
    );

    const seed = json!.data!;
    const formId = seed.emptyForm.id;

    await loginSchoolAdmin(page, seed.admin.email, seed.admin.password);
    await page.evaluate(() => localStorage.setItem("activeRole", "schoolAdmin"));

    await page.goto(`/school-admin/forms/${formId}/edit`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("form-smart-builder")).toBeVisible({ timeout: 30_000 });

    await page
      .getByTestId("input-smart-builder-message")
      .fill("Fall interest form with parent name, email, phone, preferred days, comments");

    const chatResponse = page.waitForResponse(
      (r) =>
        r.url().includes("/api/form-builder-ai/chat") &&
        r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByTestId("button-smart-builder-send").click();
    const chatRes = await chatResponse;

    if (chatRes.status() === 503) {
      await expect(page.getByTestId("smart-builder-fallback")).toBeVisible();
      test.skip(true, "AI unavailable and mock not enabled — fallback shown");
      return;
    }

    expect(chatRes.ok(), await chatRes.text()).toBeTruthy();
    const chatBody = await chatRes.json();
    expect(chatBody.draft?.fields?.length).toBeGreaterThan(0);

    await expect(page.getByTestId("smart-builder-draft")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("smart-builder-draft-fields")).toContainText("Email");

    const applyResponse = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/custom-forms/forms/${formId}/apply-draft`) &&
        r.request().method() === "POST" &&
        r.ok(),
      { timeout: 30_000 },
    );
    await page.getByTestId("button-apply-draft").click();
    const applyRes = await applyResponse;
    const applyBody = await applyRes.json();
    expect(applyBody.fields?.length).toBeGreaterThan(0);
    // Must not auto-publish
    expect(applyBody.form?.isActive).toBe(false);
    expect(applyBody.form?.accessLevel).not.toBe("public");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText("Email", { exact: false }).first()).toBeVisible({
      timeout: 20_000,
    });

    // Public slug still 404 until admin publishes
    const publicRes = await request.get(
      `/api/custom-forms/forms/by-slug/${seed.emptyForm.slug}`,
    );
    expect(publicRes.status()).toBe(404);
  });

  test("AI rate limit returns 429 on burst", async ({ page, request }) => {
    const { response, json } = await postSetupPublicFormScenario(request, {
      linkSupabaseAuthAdmin: true,
    });
    test.skip(!response.ok() || !json?.data?.adminSupabaseLinked, "seed/auth failed");

    const seed = json!.data!;
    await loginSchoolAdmin(page, seed.admin.email, seed.admin.password);
    await page.evaluate(() => localStorage.setItem("activeRole", "schoolAdmin"));
    await page.goto(`/school-admin/forms/${seed.emptyForm.id}/edit`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("form-smart-builder")).toBeVisible({ timeout: 30_000 });

    // apiRequest uses Authorization: Bearer from localStorage — bare fetch must do the same
    // or jwtCheck returns 401 and the rate limiter never counts the request.
    const firstStatus = await page.evaluate(async (formId) => {
      const token = localStorage.getItem("supabase_token");
      const activeRole = localStorage.getItem("activeRole");
      const res = await fetch("/api/form-builder-ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(activeRole ? { "X-Active-Role": activeRole } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          message: `Auth probe ${formId}-${Date.now()}`,
          formId,
        }),
      });
      return res.status;
    }, seed.emptyForm.id);

    if (firstStatus === 503) {
      test.skip(true, "AI unavailable — cannot assert rate limit");
      return;
    }
    expect(
      [200, 429].includes(firstStatus),
      `expected authenticated chat (200/429), got ${firstStatus}`,
    ).toBeTruthy();

    let saw429 = firstStatus === 429;
    for (let i = 0; i < 15 && !saw429; i++) {
      const status = await page.evaluate(async (formId) => {
        const token = localStorage.getItem("supabase_token");
        const activeRole = localStorage.getItem("activeRole");
        const res = await fetch("/api/form-builder-ai/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(activeRole ? { "X-Active-Role": activeRole } : {}),
          },
          credentials: "include",
          body: JSON.stringify({
            message: `Burst message ${formId}-${Date.now()}`,
            formId,
          }),
        });
        return res.status;
      }, seed.emptyForm.id);
      if (status === 429) {
        saw429 = true;
        break;
      }
      if (status === 503) {
        test.skip(true, "AI unavailable — cannot assert rate limit");
        return;
      }
      expect(
        status,
        `burst request ${i} should be 200 or 429, got ${status}`,
      ).toBe(200);
    }
    expect(saw429).toBeTruthy();
  });
});
