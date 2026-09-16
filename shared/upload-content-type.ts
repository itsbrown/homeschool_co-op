/** School Documents (Document Management) — keep client, API, and category config in sync. */
export const DOCUMENT_MAX_SIZE_MB = 50;
export const DOCUMENT_MAX_SIZE_BYTES = DOCUMENT_MAX_SIZE_MB * 1024 * 1024;

/** Browser File.type is often empty; treat that and octet-stream as unknown. */
const UNKNOWN_TYPES = new Set(["", "application/octet-stream"]);

const EXT_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".csv": "text/csv",
};

export function extensionOf(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  return lastDot > 0 ? filename.slice(lastDot).toLowerCase() : "";
}

export function inferUploadContentType(
  filename: string,
  reportedType?: string | null,
): string {
  const reported = (reportedType ?? "").trim().toLowerCase();
  if (reported && !UNKNOWN_TYPES.has(reported)) {
    return reported;
  }
  return EXT_MIME[extensionOf(filename)] || reported || "application/octet-stream";
}
