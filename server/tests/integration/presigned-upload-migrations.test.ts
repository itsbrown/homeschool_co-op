/**
 * Integration: presigned upload register endpoints (logo, documents, public forms).
 * Requires dev server on TEST_BASE_URL with PLAYWRIGHT_WEB_SERVER=true (E2E object stub).
 */

import { describe, it, expect, beforeAll } from "@jest/globals";
import { seedCartScenario } from "./payment-flow/helpers/seedCartScenario";
import {
  runPresignedUploadHttp,
  runPublicFormPresignedUploadHttp,
} from "../helpers/presignedUploadFlow";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:5000";
const TEST_HEADERS = { "X-Test-Token": "test-secret-token" };

async function loginSupabase(email: string, password: string): Promise<string | null> {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const anonKey =
    process.env.SUPABASE_ANON_KEY?.trim() || process.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !anonKey) return null;

  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { access_token?: string };
  return body.access_token ?? null;
}

async function setupPublicFormScenario(): Promise<{ publicFormId: number; membersFormId: number }> {
  const res = await fetch(`${BASE_URL}/api/test/setup-public-form-scenario`, {
    method: "POST",
    headers: { ...TEST_HEADERS, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`setup-public-form-scenario failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as {
    success: boolean;
    data?: { publicForm: { id: number }; membersForm: { id: number } };
  };
  if (!json.success || !json.data) {
    throw new Error("setup-public-form-scenario returned no data");
  }
  return {
    publicFormId: json.data.publicForm.id,
    membersFormId: json.data.membersForm.id,
  };
}

describe("presigned upload migrations", () => {
  let adminToken: string | null = null;
  let schoolId: number;
  let publicFormId: number;
  let membersFormId: number;

  beforeAll(async () => {
    process.env.PLAYWRIGHT_WEB_SERVER = "true";
    const scenario = await seedCartScenario();
    schoolId = scenario.school.id;
    adminToken = await loginSupabase(scenario.admin.email, scenario.admin.password);

    const forms = await setupPublicFormScenario();
    publicFormId = forms.publicFormId;
    membersFormId = forms.membersFormId;
  });

  it("POST /api/schools/upload-logo requires auth", async () => {
    const res = await fetch(`${BASE_URL}/api/schools/upload-logo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schoolId: 1, logoUrl: "/public/logos/test.png" }),
    });
    expect(res.status).toBe(401);
  });

  it("registers school logo after presigned upload", async () => {
    if (!adminToken) {
      console.warn("Skipping logo register test — no Supabase login");
      return;
    }

    const authHeaders = { Authorization: `Bearer ${adminToken}` };
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const objectPath = await runPresignedUploadHttp(
      authHeaders,
      "logos",
      png,
      "logo-test.png",
      "image/png",
      schoolId,
    );
    expect(objectPath.startsWith("/public/logos/")).toBe(true);

    const res = await fetch(`${BASE_URL}/api/schools/upload-logo`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ schoolId, logoUrl: objectPath }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; logoUrl: string };
    expect(body.success).toBe(true);
    expect(body.logoUrl).toBe(objectPath);
  });

  it("rejects logo register with non-public path", async () => {
    if (!adminToken) return;

    const res = await fetch(`${BASE_URL}/api/schools/upload-logo`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        schoolId,
        logoUrl: "/objects/logos/bad.png",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("registers school document after presigned upload", async () => {
    if (!adminToken) return;

    const authHeaders = { Authorization: `Bearer ${adminToken}` };
    const pdf = Buffer.from("%PDF-1.4 presigned document test");
    const objectPath = await runPresignedUploadHttp(
      authHeaders,
      "documents",
      pdf,
      `doc-${Date.now()}.pdf`,
      "application/pdf",
      schoolId,
    );
    expect(objectPath.startsWith("/objects/documents/")).toBe(true);

    const uniqueName = `presigned-doc-${Date.now()}.pdf`;
    const res = await fetch(`${BASE_URL}/api/schools/documents/upload`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        objectPath,
        fileName: uniqueName,
        mimeType: "application/pdf",
        sizeBytes: pdf.length,
        title: "Presigned integration doc",
        category: "other",
        isPublished: false,
        visibleToAll: false,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; document?: { filePath: string } };
    expect(body.success).toBe(true);
    expect(body.document?.filePath).toBe(objectPath);
  });

  it("public form presigned attachment flow succeeds without auth", async () => {
    const pdf = Buffer.from("%PDF-1.4 e2e resume stub");
    const result = await runPublicFormPresignedUploadHttp(
      publicFormId,
      pdf,
      "e2e-resume.pdf",
      "application/pdf",
    );
    expect(result.fileName).toBe("e2e-resume.pdf");
    expect(result.objectPath).toMatch(/^\/objects\/form-attachments\//);
  });

  it("public form presigned upload returns 404 for members-only form", async () => {
    const res = await fetch(
      `${BASE_URL}/api/custom-forms/forms/${membersFormId}/request-upload-url`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "blocked.pdf",
          size: 12,
          contentType: "application/pdf",
        }),
      },
    );
    expect(res.status).toBe(404);
  });

  it("legacy multipart /api/file-upload/knowledge-base returns 410", async () => {
    const res = await fetch(`${BASE_URL}/api/file-upload/knowledge-base`, {
      method: "POST",
    });
    expect(res.status).toBe(410);
  });
});
