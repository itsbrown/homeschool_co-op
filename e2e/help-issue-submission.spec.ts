import { test, expect } from "@playwright/test";
import {
  dismissStaffGuideIfVisible,
  dismissParentOnboardingTourIfVisible,
  loginParent,
  preventStaffGuideModal,
  bearerAuthHeaders,
  waitForSupabaseToken,
} from "./helpers/parentCheckoutHelpers";
import { loginSchoolAdmin } from "./helpers/schoolAdminAuth";
import {
  getTechnicalSupportIssue,
  postEnsureTechnicalSupportSchema,
  postSetupCartScenario,
} from "./helpers/testSeed";

test.describe.configure({ mode: "serial" });

async function seedParentWithSchool(request: Parameters<typeof postSetupCartScenario>[0]) {
  return postSetupCartScenario(request, {
    paymentPlan: "full_payment",
    linkSupabaseAuth: true,
    linkSupabaseAuthAdmin: true,
  });
}

async function loginSeededParent(page: import("@playwright/test").Page, email: string, password: string) {
  await preventStaffGuideModal(page);
  await loginParent(page, email, password);
  await dismissStaffGuideIfVisible(page);
}

test.describe("help issue submission", () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeAll(async ({ request }) => {
    const { response, json } = await postEnsureTechnicalSupportSchema(request);
    test.skip(
      !response.ok(),
      `technical_support_issues schema ensure failed (${response.status()}): ${json?.error ?? "unknown"}`,
    );
  });

  test("POST /api/technical-support/report requires authentication", async ({ request }) => {
    const res = await request.post("/api/technical-support/report", {
      headers: { "Content-Type": "application/json" },
      data: { description: "E2E unauthenticated probe" },
    });
    expect(res.status()).toBe(401);
  });

  test("Need Help menu opens Report an Issue form", async ({ page, request }) => {
    const { response, json } = await seedParentWithSchool(request);
    test.skip(!response.ok(), `seed failed (${response.status()})`);
    test.skip(json?.data?.supabaseLinked !== true, "Supabase not linked for parent");

    await loginSeededParent(page, json!.data!.parent.email, json!.data!.parent.password);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await dismissParentOnboardingTourIfVisible(page);

    await page.getByTestId("help-button").click();
    await page.getByTestId("btn-ai-support").click();

    await expect(page.getByTestId("support-assistant-dialog")).toBeVisible();
    await expect(page.getByTestId("support-issue-description")).toBeVisible();
    await expect(page.getByText("Platform / technical issue")).toBeVisible();
    await expect(page.getByText("School question / policy")).toBeVisible();
  });

  test("UI submit triggers report API and shows AI tips", async ({ page, request }) => {
    const { response, json } = await seedParentWithSchool(request);
    test.skip(!response.ok() || json?.data?.supabaseLinked !== true, "seed or Supabase unavailable");

    await loginSeededParent(page, json!.data!.parent.email, json!.data!.parent.password);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await dismissParentOnboardingTourIfVisible(page);

    let capturedDescription = "";
    await page.route("**/api/technical-support/report", async (route) => {
      const body = route.request().postDataJSON() as { description?: string };
      capturedDescription = body.description ?? "";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          issueId: "TS-e2e-ui-mock",
          issueCategory: "platform",
          userResponse: "Thanks — here are steps you can try while we investigate.",
          recommendedActions: ["Refresh the page", "Try another browser"],
          severity: "medium",
        }),
      });
    });

    await page.getByTestId("help-button").click();
    await page.getByTestId("btn-ai-support").click();
    const description = `E2E UI mock ${Date.now()}`;
    await page.getByTestId("support-issue-description").fill(description);

    const submitResponse = page.waitForResponse(
      (r) => r.url().includes("/api/technical-support/report") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Submit & get help" }).click({ force: true });
    await submitResponse;

    expect(capturedDescription).toBe(description);
    await expect(page.getByText("Report received")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Try these steps while we review")).toBeVisible();
  });

  test("API: platform issue persists with AI response fields", async ({ page, request }) => {
    const { response, json } = await seedParentWithSchool(request);
    test.skip(!response.ok() || json?.data?.supabaseLinked !== true, "seed or Supabase unavailable");

    await loginSeededParent(page, json!.data!.parent.email, json!.data!.parent.password);
    const token = await waitForSupabaseToken(page);

    const description = `E2E platform API ${Date.now()}`;
    const reportRes = await request.post("/api/technical-support/report", {
      headers: { ...bearerAuthHeaders(token), "Content-Type": "application/json" },
      data: {
        description,
        issueCategory: "platform",
        currentUrl: "http://127.0.0.1:5000/dashboard",
        browserInfo: { browser: "Playwright", version: "1", platform: "test" },
      },
    });
    expect(reportRes.ok(), await reportRes.text()).toBeTruthy();
    const body = (await reportRes.json()) as {
      success: boolean;
      issueId: string;
      userResponse: string;
      recommendedActions: string[];
    };
    expect(body.success).toBe(true);
    expect(body.issueId).toMatch(/^TECH-/);
    expect(body.userResponse.length).toBeGreaterThan(5);
    expect(body.recommendedActions.length).toBeGreaterThan(0);

    const persisted = await getTechnicalSupportIssue(request, body.issueId);
    expect(persisted.json?.issue?.description).toBe(description);
    expect(persisted.json?.issue?.issueCategory).toBe("platform");
    expect(persisted.json?.issue?.status).toBe("open");
  });

  test("API: school policy issue stores schoolId", async ({ page, request }) => {
    const { response, json } = await seedParentWithSchool(request);
    test.skip(!response.ok() || json?.data?.supabaseLinked !== true, "seed or Supabase unavailable");

    const schoolId = json!.data!.school!.id;
    await loginSeededParent(page, json!.data!.parent.email, json!.data!.parent.password);
    const token = await waitForSupabaseToken(page);

    const description = `E2E school policy API ${Date.now()}`;
    const reportRes = await request.post("/api/technical-support/report", {
      headers: { ...bearerAuthHeaders(token), "Content-Type": "application/json" },
      data: {
        description,
        issueCategory: "school_policy",
        currentUrl: "http://127.0.0.1:5000/dashboard",
        browserInfo: { browser: "Playwright", version: "1", platform: "test" },
      },
    });
    expect(reportRes.ok()).toBeTruthy();
    const body = (await reportRes.json()) as { issueId: string; issueCategory: string };
    expect(body.issueCategory).toBe("school_policy");

    const persisted = await getTechnicalSupportIssue(request, body.issueId);
    expect(persisted.json?.issue?.issueCategory).toBe("school_policy");
    expect(persisted.json?.issue?.schoolId).toBe(schoolId);
  });

  test("optional screenshot path persists on issue record", async ({ page, request }) => {
    const { response, json } = await seedParentWithSchool(request);
    test.skip(!response.ok() || json?.data?.supabaseLinked !== true, "seed or Supabase unavailable");

    await loginSeededParent(page, json!.data!.parent.email, json!.data!.parent.password);
    const token = await waitForSupabaseToken(page);
    const description = `E2E screenshot path ${Date.now()}`;
    const objectPath = `/objects/support-screenshots/e2e-${Date.now()}.png`;

    const reportRes = await request.post("/api/technical-support/report", {
      headers: { ...bearerAuthHeaders(token), "Content-Type": "application/json" },
      data: {
        description,
        issueCategory: "platform",
        screenshotObjectPath: objectPath,
        currentUrl: "http://127.0.0.1:5000/dashboard",
        browserInfo: { browser: "Playwright", version: "1", platform: "test" },
      },
    });
    expect(reportRes.ok(), await reportRes.text()).toBeTruthy();
    const body = (await reportRes.json()) as { issueId: string };
    const persisted = await getTechnicalSupportIssue(request, body.issueId);
    expect(persisted.json?.issue?.screenshotObjectPath).toBe(objectPath);
  });

  test("Payment Help links to Report an Issue", async ({ page, request }) => {
    const { response, json } = await seedParentWithSchool(request);
    test.skip(!response.ok() || json?.data?.supabaseLinked !== true, "seed or Supabase unavailable");

    await loginSeededParent(page, json!.data!.parent.email, json!.data!.parent.password);
    await page.goto("/parent/cart", { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("payment-help-button")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("payment-help-button").click();
    await page.getByTestId("payment-help-report-issue").click();
    await expect(page.getByTestId("support-assistant-dialog")).toBeVisible({ timeout: 15_000 });
  });

  test("school admin sees school policy issues for their school", async ({ page, request }) => {
    const { response, json } = await seedParentWithSchool(request);
    test.skip(!response.ok(), "seed failed");
    test.skip(json?.data?.supabaseLinked !== true, "parent Supabase not linked");
    test.skip(json?.data?.adminSupabaseLinked !== true, "admin Supabase not linked");
    test.skip(!json?.data?.admin?.email, "no admin in seed");

    await loginSeededParent(page, json!.data!.parent.email, json!.data!.parent.password);
    const parentToken = await waitForSupabaseToken(page);

    const schoolDescription = `E2E admin visibility ${Date.now()}`;
    const reportRes = await request.post("/api/technical-support/report", {
      headers: { ...bearerAuthHeaders(parentToken), "Content-Type": "application/json" },
      data: {
        description: schoolDescription,
        issueCategory: "school_policy",
        currentUrl: "http://127.0.0.1:5000/dashboard",
        browserInfo: { browser: "Playwright", version: "1", platform: "test" },
      },
    });
    expect(reportRes.ok(), await reportRes.text()).toBeTruthy();
    const reportBody = (await reportRes.json()) as { issueId: string };

    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());

    await loginSchoolAdmin(page, json!.data!.admin!.email, json!.data!.admin!.password);
    const adminToken = await waitForSupabaseToken(page);

    const listRes = await request.get("/api/admin/technical-issues", {
      headers: bearerAuthHeaders(adminToken),
    });
    expect(listRes.ok(), await listRes.text()).toBeTruthy();
    const listBody = (await listRes.json()) as {
      success: boolean;
      issues: { id: string; description: string; issueCategory?: string }[];
    };
    const found = listBody.issues.find((i) => i.id === reportBody.issueId);
    expect(found, "school admin should see school_policy issue").toBeTruthy();
    expect(found!.issueCategory).toBe("school_policy");
    expect(found!.description).toBe(schoolDescription);
  });
});
