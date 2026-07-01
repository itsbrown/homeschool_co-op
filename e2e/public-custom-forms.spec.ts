import { test, expect } from "@playwright/test";
import {
  postSetupPublicFormScenario,
  type SetupPublicFormScenarioResponse,
} from "./helpers/testSeed";
import { runPublicFormPresignedUpload } from "./helpers/publicFormPresignedUpload";

/**
 * Public Form Builder forms: no login required via /forms/:slug and public API routes.
 * Requires Postgres (DATABASE_URL); Playwright config starts npm run dev when needed.
 */
test.describe.configure({ mode: "serial", timeout: 120_000 });

let seed: NonNullable<SetupPublicFormScenarioResponse["data"]>;

test.describe("public custom forms", () => {
  test.beforeAll(async ({ request }) => {
    const { response, json } = await postSetupPublicFormScenario(request);
    if (!response.ok()) {
      throw new Error(
        `setup-public-form-scenario failed (${response.status()}): ${json?.error ?? json?.details ?? "see server logs"}`,
      );
    }
    if (!json?.success || !json.data) {
      throw new Error("setup-public-form-scenario returned no data");
    }
    seed = json.data;
  });

  test("GET /api/custom-forms/forms/by-slug/:slug returns JSON without auth", async ({
    request,
  }) => {
    const res = await request.get(
      `/api/custom-forms/forms/by-slug/${seed.publicForm.slug}`,
    );
    expect(res.ok(), `expected 200, got ${res.status()}`).toBeTruthy();
    const ct = (res.headers()["content-type"] ?? "").toLowerCase();
    expect(ct).toMatch(/application\/json/);
    const body = await res.json();
    expect(body.title).toBe(seed.publicForm.title);
    expect(body.accessLevel).toBe("public");
    expect(Array.isArray(body.fields)).toBeTruthy();
    expect(body.fields.length).toBeGreaterThanOrEqual(4);
    const resumeField = body.fields.find((f: { fieldType: string }) => f.fieldType === "file_upload");
    expect(resumeField?.label).toMatch(/resume/i);
    expect(body.school?.name).toBe(seed.school.name);
  });

  test("members-only slug is hidden from public by-slug API", async ({ request }) => {
    const res = await request.get(
      `/api/custom-forms/forms/by-slug/${seed.membersForm.slug}`,
    );
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.message).toMatch(/not public|not found/i);
  });

  test("anonymous POST submit succeeds for public form", async ({ request }) => {
    const unique = Date.now();
    const res = await request.post(
      `/api/custom-forms/forms/${seed.publicForm.id}/submit`,
      {
        data: {
          responseData: {
            [`field_${seed.publicForm.fieldIds.fullName}`]: `E2E User ${unique}`,
            [`field_${seed.publicForm.fieldIds.email}`]: `e2e_${unique}@example.com`,
            [`field_${seed.publicForm.fieldIds.agree}`]: true,
          },
          submitterEmail: `e2e_${unique}@example.com`,
          submitterName: `E2E User ${unique}`,
        },
      },
    );
    expect(res.status(), await res.text()).toBe(201);
    const body = await res.json();
    expect(body.formId).toBe(seed.publicForm.id);
  });

  test("anonymous presigned form attachment succeeds for public form", async ({ request }) => {
    const body = await runPublicFormPresignedUpload(
      request,
      seed.publicForm.id,
      Buffer.from("%PDF-1.4 e2e resume stub"),
      "e2e-resume.pdf",
      "application/pdf",
    );
    expect(body.fileName).toBe("e2e-resume.pdf");
    expect(body.objectPath).toMatch(/^\/objects\/form-attachments\//);
  });

  test("presigned upload on members-only form returns 404", async ({ request }) => {
    const res = await request.post(
      `/api/custom-forms/forms/${seed.membersForm.id}/request-upload-url`,
      {
        data: {
          name: "blocked.pdf",
          size: 12,
          contentType: "application/pdf",
        },
      },
    );
    expect(res.status()).toBe(404);
  });

  test("anonymous submit to members-only form returns 404", async ({ request }) => {
    const res = await request.post(
      `/api/custom-forms/forms/${seed.membersForm.id}/submit`,
      {
        data: {
          responseData: { note: "should fail" },
        },
      },
    );
    expect(res.status()).toBe(404);
  });

  test("GET /forms/:slug page loads without redirect to login", async ({ page }) => {
    await page.goto(`/forms/${seed.publicForm.slug}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page).not.toHaveURL(/\/login/, { timeout: 5_000 });
    await expect(page.getByTestId("text-form-title")).toHaveText(seed.publicForm.title, {
      timeout: 20_000,
    });
    await expect(page.getByTestId("button-submit")).toBeVisible();
  });

  test("anonymous user uploads resume and submits in the browser", async ({ page }) => {
    const unique = Date.now();
    await page.goto(`/forms/${seed.publicForm.slug}`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByTestId("text-form-title")).toBeVisible({ timeout: 20_000 });

    await page
      .getByTestId(`input-field-${seed.publicForm.fieldIds.fullName}`)
      .fill(`Resume User ${unique}`);
    await page
      .getByTestId(`input-field-${seed.publicForm.fieldIds.email}`)
      .fill(`resume_${unique}@example.com`);
    await page.getByTestId(`checkbox-field-${seed.publicForm.fieldIds.agree}`).click();

    const uploadResponse = page.waitForResponse(
      (r) =>
        r.url().includes(
          `/api/custom-forms/forms/${seed.publicForm.id}/confirm-upload`,
        ) && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByTestId(`file-field-${seed.publicForm.fieldIds.resume}`).setInputFiles({
      name: "e2e-resume.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 browser resume"),
    });
    const uploadRes = await uploadResponse;
    expect(uploadRes.ok(), `upload failed: ${uploadRes.status()}`).toBeTruthy();
    const uploadJson = await uploadRes.json();
    expect(uploadJson.fileName).toBe("e2e-resume.pdf");
    expect(uploadJson.objectPath).toMatch(/^\/objects\//);
    await expect(
      page.getByTestId(`file-uploaded-${seed.publicForm.fieldIds.resume}`),
    ).toBeVisible({ timeout: 15_000 });

    const submitResponse = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/custom-forms/forms/${seed.publicForm.id}/submit`) &&
        r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByTestId("button-submit").click();
    const submitRes = await submitResponse;
    expect(submitRes.ok(), `submit failed: ${submitRes.status()}`).toBeTruthy();
    const submitBody = await submitRes.json();
    const resumeKey = `field_${seed.publicForm.fieldIds.resume}`;
    expect(submitBody.responseData?.[resumeKey]?.objectPath).toMatch(/^\/objects\//);

    await expect(page.getByTestId("form-submit-success")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("anonymous user completes public form in the browser", async ({ page }) => {
    const unique = Date.now();
    await page.goto(`/forms/${seed.publicForm.slug}`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByTestId("text-form-title")).toBeVisible({ timeout: 20_000 });

    await page
      .getByTestId(`input-field-${seed.publicForm.fieldIds.fullName}`)
      .fill(`Browser User ${unique}`);
    await page
      .getByTestId(`input-field-${seed.publicForm.fieldIds.email}`)
      .fill(`browser_${unique}@example.com`);
    await page.getByTestId(`checkbox-field-${seed.publicForm.fieldIds.agree}`).click();

    const submitResponse = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/custom-forms/forms/${seed.publicForm.id}/submit`) &&
        r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByTestId("button-submit").click();
    const res = await submitResponse;
    expect(res.ok(), `submit failed: ${res.status()}`).toBeTruthy();

    await expect(page.getByTestId("form-submit-success")).toBeVisible({
      timeout: 15_000,
    });
  });
});
