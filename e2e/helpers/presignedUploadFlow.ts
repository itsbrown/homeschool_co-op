import fs from "node:fs/promises";
import path from "node:path";
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

export async function runPresignedUpload(
  request: APIRequestContext,
  authHeaders: Record<string, string>,
  category: PresignedCategory,
  fixturePath: string,
  schoolId?: number,
): Promise<string> {
  const buffer = await fs.readFile(fixturePath);
  const name = path.basename(fixturePath);
  const contentType = name.endsWith(".png") ? "image/png" : "application/octet-stream";

  const urlRes = await request.post("/api/unified-uploads/request-url", {
    headers: { ...authHeaders, "Content-Type": "application/json" },
    data: {
      name,
      size: buffer.length,
      contentType,
      category,
      ...(schoolId != null ? { schoolId } : {}),
    },
  });
  expect(urlRes.ok(), `request-url failed: ${urlRes.status()} ${await urlRes.text()}`).toBeTruthy();
  const { uploadURL, objectPath } = (await urlRes.json()) as {
    uploadURL: string;
    objectPath: string;
  };

  const putRes = await request.fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    data: buffer,
  });
  expect(putRes.ok(), `presigned PUT failed: ${putRes.status()}`).toBeTruthy();

  const confirmRes = await request.post("/api/unified-uploads/confirm", {
    headers: { ...authHeaders, "Content-Type": "application/json" },
    data: { objectPath, category },
  });
  expect(confirmRes.ok(), `confirm failed: ${confirmRes.status()}`).toBeTruthy();

  return objectPath;
}
