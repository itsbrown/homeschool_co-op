const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:5000";

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

export async function runPresignedUploadHttp(
  authHeaders: Record<string, string>,
  category: PresignedCategory,
  buffer: Buffer,
  filename: string,
  contentType: string,
  schoolId?: number,
): Promise<string> {
  const urlRes = await fetch(`${BASE_URL}/api/unified-uploads/request-url`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: filename,
      size: buffer.length,
      contentType,
      category,
      ...(schoolId != null ? { schoolId } : {}),
    }),
  });
  if (!urlRes.ok) {
    throw new Error(`request-url failed (${urlRes.status}): ${await urlRes.text()}`);
  }
  const { uploadURL, objectPath } = (await urlRes.json()) as {
    uploadURL: string;
    objectPath: string;
  };

  const putUrl = uploadURL.startsWith("http") ? uploadURL : `${BASE_URL}${uploadURL}`;
  const putRes = await fetch(putUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: buffer,
  });
  if (!putRes.ok) {
    throw new Error(`presigned PUT failed (${putRes.status})`);
  }

  const confirmRes = await fetch(`${BASE_URL}/api/unified-uploads/confirm`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ objectPath, category }),
  });
  if (!confirmRes.ok) {
    throw new Error(`confirm failed (${confirmRes.status}): ${await confirmRes.text()}`);
  }

  return objectPath;
}

export async function runPublicFormPresignedUploadHttp(
  formId: number,
  buffer: Buffer,
  filename: string,
  contentType: string,
): Promise<{ objectPath: string; fileName: string }> {
  const urlRes = await fetch(`${BASE_URL}/api/custom-forms/forms/${formId}/request-upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: filename, size: buffer.length, contentType }),
  });
  if (!urlRes.ok) {
    throw new Error(`form request-url failed (${urlRes.status}): ${await urlRes.text()}`);
  }
  const { uploadURL, objectPath } = (await urlRes.json()) as {
    uploadURL: string;
    objectPath: string;
  };

  const putUrl = uploadURL.startsWith("http") ? uploadURL : `${BASE_URL}${uploadURL}`;
  const putRes = await fetch(putUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: buffer,
  });
  if (!putRes.ok) {
    throw new Error(`form presigned PUT failed (${putRes.status})`);
  }

  const confirmRes = await fetch(`${BASE_URL}/api/custom-forms/forms/${formId}/confirm-upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ objectPath, fileName: filename }),
  });
  if (!confirmRes.ok) {
    throw new Error(`form confirm failed (${confirmRes.status}): ${await confirmRes.text()}`);
  }

  const body = (await confirmRes.json()) as { objectPath: string; fileName: string };
  return { objectPath: body.objectPath, fileName: body.fileName };
}
