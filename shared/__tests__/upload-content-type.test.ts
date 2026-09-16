import { describe, expect, it } from "@jest/globals";
import { DOCUMENT_MAX_SIZE_MB, inferUploadContentType } from "../upload-content-type";

describe("inferUploadContentType", () => {
  it("keeps a real browser MIME type", () => {
    expect(inferUploadContentType("policy.pdf", "application/pdf")).toBe("application/pdf");
  });

  it("infers PDF when the browser sends an empty type", () => {
    expect(inferUploadContentType("ASA Handbook.pdf", "")).toBe("application/pdf");
  });

  it("infers from extension when the browser sends octet-stream", () => {
    expect(inferUploadContentType("notes.docx", "application/octet-stream")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });

  it("keeps school documents at 50MB", () => {
    expect(DOCUMENT_MAX_SIZE_MB).toBe(50);
  });

  it("leaves unknown extensions as octet-stream", () => {
    expect(inferUploadContentType("notes.pages", "")).toBe("application/octet-stream");
  });
});
