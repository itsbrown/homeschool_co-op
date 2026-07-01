export type PublicFormAttachmentResult = {
  fileName: string;
  objectPath: string;
  mimeType: string;
  sizeBytes: number;
};

export async function uploadPublicFormAttachment(
  formId: number,
  file: File,
): Promise<PublicFormAttachmentResult> {
  const contentType = file.type || "application/octet-stream";

  const urlRes = await fetch(`/api/custom-forms/forms/${formId}/request-upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: file.name,
      size: file.size,
      contentType,
    }),
  });

  if (!urlRes.ok) {
    const error = await urlRes.json().catch(() => ({ message: "Upload failed" }));
    throw new Error(error.message || error.error || "Failed to get upload URL");
  }

  const { uploadURL, objectPath } = (await urlRes.json()) as {
    uploadURL: string;
    objectPath: string;
  };

  const putRes = await fetch(uploadURL, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": contentType },
  });

  if (!putRes.ok) {
    throw new Error("Failed to upload file to storage");
  }

  const confirmRes = await fetch(`/api/custom-forms/forms/${formId}/confirm-upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ objectPath, fileName: file.name }),
  });

  if (!confirmRes.ok) {
    const error = await confirmRes.json().catch(() => ({ message: "Confirm failed" }));
    throw new Error(error.message || error.error || "Failed to confirm upload");
  }

  const data = (await confirmRes.json()) as PublicFormAttachmentResult;
  return {
    fileName: data.fileName || file.name,
    objectPath: data.objectPath || objectPath,
    mimeType: data.mimeType || contentType,
    sizeBytes: data.sizeBytes ?? file.size,
  };
}
