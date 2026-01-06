import type { UppyFile } from "@uppy/core";

export type UploadCategory =
  | "signatures"
  | "logos"
  | "documents"
  | "knowledgeBase"
  | "fundraiserProducts"
  | "assessments"
  | "profilePhotos";

export interface UploadResult {
  objectPath: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  filename: string;
}

export interface UploadOptions {
  category: UploadCategory;
  schoolId?: number;
  onProgress?: (progress: number) => void;
}

async function requestUploadUrl(
  file: File,
  category: UploadCategory,
  schoolId?: number
): Promise<{ uploadURL: string; objectPath: string }> {
  const response = await fetch("/api/unified-uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      name: file.name,
      size: file.size,
      contentType: file.type || "application/octet-stream",
      category,
      schoolId,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Upload failed" }));
    throw new Error(error.error || "Failed to get upload URL");
  }

  return response.json();
}

async function uploadToPresignedUrl(file: File, uploadURL: string): Promise<void> {
  const response = await fetch(uploadURL, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type || "application/octet-stream" },
  });

  if (!response.ok) {
    throw new Error("Failed to upload file to storage");
  }
}

async function confirmUpload(objectPath: string, category: UploadCategory): Promise<void> {
  const response = await fetch("/api/unified-uploads/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ objectPath, category }),
  });

  if (!response.ok) {
    console.warn("Failed to confirm upload ACL, file may still be accessible");
  }
}

export async function uploadFile(file: File, options: UploadOptions): Promise<UploadResult> {
  const { category, schoolId, onProgress } = options;

  onProgress?.(10);
  const { uploadURL, objectPath } = await requestUploadUrl(file, category, schoolId);

  onProgress?.(30);
  await uploadToPresignedUrl(file, uploadURL);

  onProgress?.(80);
  await confirmUpload(objectPath, category);

  onProgress?.(100);

  return {
    objectPath,
    url: objectPath,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    filename: file.name,
  };
}

export async function uploadBase64(
  base64Data: string,
  filename: string,
  mimeType: string,
  options: UploadOptions
): Promise<UploadResult> {
  const base64Content = base64Data.includes(",") ? base64Data.split(",")[1] : base64Data;
  const binaryString = atob(base64Content);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const file = new File([bytes], filename, { type: mimeType });
  return uploadFile(file, options);
}

export function getUploadParametersFactory(category: UploadCategory, schoolId?: number) {
  return async (
    file: UppyFile<Record<string, unknown>, Record<string, unknown>>
  ): Promise<{ method: "PUT"; url: string; headers?: Record<string, string> }> => {
    const response = await fetch("/api/unified-uploads/request-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: file.name,
        size: file.size,
        contentType: file.type || "application/octet-stream",
        category,
        schoolId,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to get upload URL");
    }

    const data = await response.json();
    return {
      method: "PUT",
      url: data.uploadURL,
      headers: { "Content-Type": file.type || "application/octet-stream" },
    };
  };
}

export async function deleteFile(objectPath: string): Promise<boolean> {
  const path = objectPath.startsWith("/") ? objectPath.slice(1) : objectPath;
  const response = await fetch(`/api/unified-uploads/${path}`, {
    method: "DELETE",
    credentials: "include",
  });
  return response.ok;
}
