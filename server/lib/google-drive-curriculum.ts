import { createSign } from "crypto";
import { existsSync, readFileSync } from "node:fs";
import { parseLessonDocFields, type ParsedLessonDoc } from "@shared/lesson-push";

export class DriveNotConfiguredError extends Error {
  readonly code = "DRIVE_NOT_CONFIGURED";
  constructor(message = "GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON or GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE is not set") {
    super(message);
    this.name = "DriveNotConfiguredError";
  }
}

export class DriveListError extends Error {
  readonly code = "DRIVE_LIST_FAILED";
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "DriveListError";
    this.status = status;
  }
}

export function driveReaderEmail(): string | null {
  const raw = readDriveServiceAccountJson();
  if (!raw) return null;
  try {
    return parseServiceAccountJson(raw).client_email;
  } catch {
    return null;
  }
}

export function explainDriveListFailure(status: number, bodyText: string): string {
  const lower = bodyText.toLowerCase();
  if (lower.includes("has not been used") || lower.includes("service_disabled") || lower.includes("accessnotconfigured")) {
    return "Turn on the Google Drive API in Cloud Console (APIs & Services → Library → Google Drive API → Enable), wait a minute, then Connect again.";
  }
  const email = driveReaderEmail();
  if (status === 404 || lower.includes("not found") || lower.includes("insufficient permissions")) {
    return email
      ? `Share this Drive folder with ${email} as Viewer, then Connect again.`
      : "Share this Drive folder with the service-account email as Viewer, then Connect again.";
  }
  if (status === 403) {
    return email
      ? `Drive refused the list. Share the folder with ${email} as Viewer, or enable the Drive API, then Connect again.`
      : "Drive refused the list. Enable the Drive API and share the folder with the service-account email, then Connect again.";
  }
  return `Drive list failed (${status}).`;
}

export type DriveFileMeta = {
  id: string;
  name: string;
  mimeType: string | null;
  webViewLink: string | null;
  contentHash: string | null;
};

type DriveListImpl = (folderId: string) => Promise<DriveFileMeta[]>;

let listImplOverride: DriveListImpl | null = null;

function serviceAccountFilePath(): string | null {
  const fromDrive = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE?.trim();
  if (fromDrive) return fromDrive;
  const fromGoogle = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  return fromGoogle || null;
}

export function readDriveServiceAccountJson(): string | null {
  const inline = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON?.trim();
  if (inline) return inline;
  const filePath = serviceAccountFilePath();
  if (!filePath || !existsSync(filePath)) return null;
  const raw = readFileSync(filePath, "utf8").trim();
  return raw || null;
}

export function isDriveConfigured(): boolean {
  return Boolean(readDriveServiceAccountJson());
}

/** Test hook — pass null to restore the real client. */
export function setDriveListImpl(impl: DriveListImpl | null): void {
  listImplOverride = impl;
}

export function parseServiceAccountJson(raw: string): { client_email: string; private_key: string } {
  const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string };
  if (!parsed.client_email || !parsed.private_key) {
    throw new DriveNotConfiguredError("Service account JSON is missing client_email or private_key");
  }
  return { client_email: parsed.client_email, private_key: parsed.private_key };
}

function signServiceAccountJwt(email: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: email,
      scope: "https://www.googleapis.com/auth/drive.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  ).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${signer.sign(privateKey, "base64url")}`;
}

async function accessTokenFromServiceAccount(): Promise<string> {
  const raw = readDriveServiceAccountJson();
  if (!raw) throw new DriveNotConfiguredError();
  const creds = parseServiceAccountJson(raw);
  const assertion = signServiceAccountJwt(creds.client_email, creds.private_key);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Drive token exchange failed (${res.status})`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Drive token exchange returned no access_token");
  return json.access_token;
}

function driveContentHash(file: {
  md5Checksum?: string;
  modifiedTime?: string;
  version?: string;
  mimeType?: string;
}): string | null {
  if (file.md5Checksum) return file.md5Checksum;
  if (file.modifiedTime || file.version) {
    return [file.mimeType || "", file.modifiedTime || "", file.version || ""].join(":");
  }
  return null;
}

async function listDriveFolderFilesLive(folderId: string): Promise<DriveFileMeta[]> {
  const token = await accessTokenFromServiceAccount();
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const fields = encodeURIComponent(
    "files(id,name,mimeType,webViewLink,md5Checksum,modifiedTime,version,shortcutDetails)",
  );
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const bodyText = await res.text();
    throw new DriveListError(res.status, explainDriveListFailure(res.status, bodyText));
  }
  const json = (await res.json()) as {
    files?: Array<{
      id: string;
      name: string;
      mimeType?: string;
      webViewLink?: string;
      md5Checksum?: string;
      modifiedTime?: string;
      version?: string;
    }>;
  };
  const skip = new Set([
    "application/vnd.google-apps.folder",
    "application/vnd.google-apps.shortcut",
  ]);
  return (json.files || [])
    .filter((f) => f.id && f.name && !skip.has(f.mimeType || ""))
    .map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType ?? null,
      webViewLink: f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`,
      contentHash: driveContentHash(f),
    }));
}

export async function listDriveFolderFiles(folderId: string): Promise<DriveFileMeta[]> {
  if (listImplOverride) return listImplOverride(folderId);
  if (!isDriveConfigured()) throw new DriveNotConfiguredError();
  return listDriveFolderFilesLive(folderId);
}

export async function downloadDriveFileBytes(fileId: string): Promise<Buffer> {
  if (!fileId) throw new Error("Drive file id is required");
  if (!isDriveConfigured()) throw new DriveNotConfiguredError();
  const token = await accessTokenFromServiceAccount();
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const bodyText = await res.text();
    throw new DriveListError(res.status, explainDriveListFailure(res.status, bodyText));
  }
  return Buffer.from(await res.arrayBuffer());
}

const GOOGLE_DOC = "application/vnd.google-apps.document";

export async function exportDriveFilePlainText(
  fileId: string,
  mimeType?: string | null,
): Promise<string | null> {
  if (!fileId || (mimeType && mimeType !== GOOGLE_DOC && !mimeType.startsWith("text/"))) {
    return null;
  }
  if (!isDriveConfigured()) return null;
  const token = await accessTokenFromServiceAccount();
  const url =
    !mimeType || mimeType === GOOGLE_DOC
      ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent("text/plain")}`
      : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const text = (await res.text()).trim();
  return text || null;
}

export async function lessonFieldsFromDriveFile(
  fileId: string,
  mimeType?: string | null,
): Promise<ParsedLessonDoc | null> {
  const text = await exportDriveFilePlainText(fileId, mimeType);
  if (!text) return null;
  return parseLessonDocFields(text);
}
