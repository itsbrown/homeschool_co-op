import fs from "fs";
import path from "path";

const E2E_PUBLIC_ROOT = path.join(process.cwd(), "uploads", "e2e-public");
const E2E_PRIVATE_ROOT = path.join(process.cwd(), "uploads", "e2e-private");

export function isE2eObjectStorageStubEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    (process.env.PLAYWRIGHT_WEB_SERVER === "true" ||
      process.env.E2E_STUB_FORM_UPLOADS === "true")
  );
}

export function e2eObjectLocalPath(objectPath: string): string | null {
  if (objectPath.startsWith("/public/")) {
    return path.join(E2E_PUBLIC_ROOT, objectPath.slice("/public/".length));
  }
  if (objectPath.startsWith("/objects/")) {
    return path.join(E2E_PRIVATE_ROOT, objectPath.slice("/objects/".length));
  }
  return null;
}

/** @deprecated use e2eObjectLocalPath */
export function e2ePublicObjectLocalPath(objectPath: string): string | null {
  return e2eObjectLocalPath(objectPath);
}

export function saveE2eObject(
  objectPath: string,
  body: Buffer,
  contentType?: string,
): void {
  const localPath = e2eObjectLocalPath(objectPath);
  if (!localPath) {
    throw new Error("E2E stub only supports /public/ and /objects/ paths");
  }
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  fs.writeFileSync(localPath, body);
  if (contentType) {
    fs.writeFileSync(`${localPath}.meta.json`, JSON.stringify({ contentType }));
  }
}

/** @deprecated use saveE2eObject */
export function saveE2ePublicObject(
  objectPath: string,
  body: Buffer,
  contentType?: string,
): void {
  saveE2eObject(objectPath, body, contentType);
}

export function readE2eObjectMeta(localPath: string): { contentType?: string } {
  try {
    const metaPath = `${localPath}.meta.json`;
    if (fs.existsSync(metaPath)) {
      return JSON.parse(fs.readFileSync(metaPath, "utf8")) as { contentType?: string };
    }
  } catch {
    // ignore
  }
  return {};
}

/** @deprecated use readE2eObjectMeta */
export function readE2ePublicObjectMeta(localPath: string): { contentType?: string } {
  return readE2eObjectMeta(localPath);
}
