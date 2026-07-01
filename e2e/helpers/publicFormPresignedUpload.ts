import type { APIRequestContext } from "@playwright/test";
import { expect } from "@playwright/test";

export type PresignedCategory =
  | "logos"
  | "documents"
  | "knowledgeBase"
  | "fundraiserProducts"
  | "storePrograms"
  | "storeProducts"
  | "formAttachments"
  | "signatures"
  | "supportScreenshots"
  | "productOrderImages";

export async function runPublicFormPresignedUpload(
  request: APIRequestContext,
  formId: number,
  buffer: Buffer,
  filename: string,
  contentType: string,
): Promise<{ objectPath: string; fileName: string }> {
  const urlRes = await request.post(`/api/custom-forms/forms/${formId}/request-upload-url`, {
    headers: { "Content-Type": "application/json" },
    data: { name: filename, size: buffer.length, contentType },
  });
  expect(urlRes.ok(), `form request-url failed: ${urlRes.status()} ${await urlRes.text()}`).toBeTruthy();
  const { uploadURL, objectPath } = (await urlRes.json()) as {
    uploadURL: string;
    objectPath: string;
  };

  const putRes = await request.fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    data: buffer,
  });
  expect(putRes.ok(), `form presigned PUT failed: ${putRes.status()}`).toBeTruthy();

  const confirmRes = await request.post(`/api/custom-forms/forms/${formId}/confirm-upload`, {
    headers: { "Content-Type": "application/json" },
    data: { objectPath, fileName: filename },
  });
  expect(confirmRes.ok(), `form confirm failed: ${confirmRes.status()}`).toBeTruthy();

  return (await confirmRes.json()) as { objectPath: string; fileName: string };
}
