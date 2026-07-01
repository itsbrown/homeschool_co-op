import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { fileUploadService, uploadCategories, type UploadCategory } from "../services/fileUploadService";
import { saveE2eObject } from "../lib/e2e-public-object-storage";

const ASSET_UPLOAD_CATEGORIES: UploadCategory[] = [
  "logos",
  "documents",
  "knowledgeBase",
  "fundraiserProducts",
  "storePrograms",
  "storeProducts",
  "signatures",
  "supportScreenshots",
  "formAttachments",
  "scheduleResources",
  "productOrderImages",
];

describe("unified upload categories", () => {
  const originalPlaywright = process.env.PLAYWRIGHT_WEB_SERVER;
  const originalStub = process.env.E2E_STUB_FORM_UPLOADS;

  beforeEach(() => {
    process.env.PLAYWRIGHT_WEB_SERVER = "true";
    process.env.E2E_STUB_FORM_UPLOADS = "true";
  });

  afterEach(() => {
    process.env.PLAYWRIGHT_WEB_SERVER = originalPlaywright;
    process.env.E2E_STUB_FORM_UPLOADS = originalStub;
  });

  it.each(ASSET_UPLOAD_CATEGORIES)("getUploadUrl returns stub path for %s", async (category) => {
    const config = uploadCategories[category];
    const contentType = config.allowedTypes[0];
    const result = await fileUploadService.getUploadUrl({
      category,
      filename: "sample.bin",
      contentType,
      sizeBytes: 1024,
      schoolId: 1,
      userId: 1,
    });

    expect(result.validation.valid).toBe(true);
    expect(result.objectPath).toMatch(
      config.public ? /^\/public\// : /^\/objects\//,
    );
    expect(result.objectPath).toContain(`/${config.folder}/`);
    expect(result.uploadURL).toContain("/api/test/e2e-object-upload");
  });

  it("rejects oversize uploads per category", async () => {
    const config = uploadCategories.documents;
    const result = await fileUploadService.getUploadUrl({
      category: "documents",
      filename: "big.pdf",
      contentType: "application/pdf",
      sizeBytes: config.maxSizeBytes + 1,
      schoolId: 1,
    });
    expect(result.validation.valid).toBe(false);
  });

  it("private categories use /objects/ prefix in stub mode", async () => {
    const result = await fileUploadService.getUploadUrl({
      category: "documents",
      filename: "policy.pdf",
      contentType: "application/pdf",
      sizeBytes: 2048,
      schoolId: 2,
    });
    expect(result.objectPath.startsWith("/objects/documents/")).toBe(true);
  });

  it("readObjectBuffer reads back E2E stub uploads", async () => {
    const payload = Buffer.from("stub object payload");
    const objectPath = "/objects/documents/test-readback.pdf";
    saveE2eObject(objectPath, payload, "application/pdf");
    const readBack = await fileUploadService.readObjectBuffer(objectPath);
    expect(readBack.equals(payload)).toBe(true);
  });
});
